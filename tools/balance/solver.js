import { writeFileSync } from 'node:fs'; // repo package.json has "type": "module" - no require()

/**
 * solver.js - roster balance solver (BALANCE_V2).
 *
 * WHAT IT DOES: fits every brawler's stats onto a single power index so the roster ends up
 * within a few percent of each other, WITHOUT power creep - the target is the MEAN INDEX OF
 * TODAY'S ROSTER (not an arbitrary 100). Each brawler keeps its own archetype shape; the solver
 * only turns ONE global knob per brawler (bisection) until its index hits the target.
 *
 * WHY A MODEL AND NOT HAND-TUNING: the roster has five coupled axes (dmg / tempo / armor / speed /
 * range) plus hidden ones (bullet radius = hit area, spread angle = how much of a volley lands).
 * Hand-tuned archetypes came out 18.9% apart; this model gets ~3.4%.
 *
 * PROVENANCE: rewritten from `_src/solver2.js` (clean base) + the two levers that were added in
 * solver3/solver4 by the analysis session:
 *   1. LOCK - per-brawler frozen stats (Ogniarz/Twardy reload: the machine-gun feel must not change),
 *   2. per-brawler SPREAD ANGLE (`off`) in the hit model - without it Ogniarz cannot be balanced
 *      while its tempo is locked. That was the fifth lever.
 * The raw scratch versions are NOT kept in the repo - see README for what was rejected and why
 * (v1 had no calibration and produced power creep; the hand-tuned budget came out 18.9% apart).
 *
 * USAGE:  node tools/balance/solver.js [--json out.json]
 * Console output is Polish on purpose - it is read by Mariusz, not by the build.
 */

// ── math: normal CDF via Abramowitz-Stegun erf ───────────────────────────────
function erf(x) {
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
const Phi = x => 0.5 * (1 + erf(x / Math.SQRT2));

// ── model constants ──────────────────────────────────────────────────────────
const AX = ['dmg', 'tempo', 'armor', 'speed', 'range'];
/** Axis bounds: [shape 0 -> value, shape 100 -> value]. `tempo` is inverted (lower reload = faster). */
const BND = { dmg: [40, 300], tempo: [1000, 200], armor: [200, 700], speed: [4.0, 7.5], range: [350, 1400] };
const lerp = (a, sh) => BND[a][0] + (BND[a][1] - BND[a][0]) * (sh / 100);

/** Enemy hit radius in game is `30 + bullet.radius` (main.ts:4885) - radius is a HIDDEN accuracy stat. */
const ER = 30;
/** Enemy speed used for the lead-error term. */
const ES = 2.25;
/** Default volley spread when a shape does not define its own. */
const SPREAD_OFF = 0.2;
/** Tech pierce: same shot hits up to 3 enemies -> effective dps multiplier. */
const PIERCE = 1.55;
/** Shadow dash: survivability multiplier (no i-frames - dash is repositioning, not immunity). */
const DASH = 1.28;
/** Distances the effective dps is averaged over, with weights (how the game is actually played). */
const RANGES = [[150, 0.30], [300, 0.45], [500, 0.25]];
/** Mobile speed multiplier per Player.ts:114-120 - balance must hold on TOUCH, not just desktop. */
const mob = s => s <= 3 ? 1.05 : s <= 4 ? 0.95 : s <= 5 ? 0.80 : s <= 7 ? 0.72 : 0.68;
/** Reference values that normalise each axis before weighting. */
const REF = { eff: 260, ehp: 520, sup: 9000 }, REF_R = 900;
const W = { eff: 0.42, ehp: 0.30, sup: 0.12, range: 0.16 };

/**
 * Probability that one bullet of a volley lands, given distance, bullet speed, bullet radius and
 * the lateral offset of this bullet inside the volley. Two error sources: player aim (grows with
 * distance) and lead error (grows with flight time).
 */
const hitp = (d, bs, br, lat = 0) => {
    const R = ER + br, aim = 25 + 0.06 * d, lead = 0.5 * ES * (d / bs);
    const sg = Math.hypot(aim, lead);
    return Phi((R - lat) / sg) - Phi((-R - lat) / sg);
};

/** Simulated effective dps / ehp / super output for one config. */
function sim(c) {
    let eff = 0; const pr = {};
    for (const [d, w] of RANGES) {
        let ds = 0;
        // Out of range = ZERO damage, not reduced damage. Range is a hard wall in the game.
        if (d <= c.maxDist) {
            for (let i = 0; i < c.n; i++) {
                // Lateral drift of the i-th bullet in a spread volley: only the centre bullet is on target.
                const lat = c.n >= 3 ? Math.abs(i - (c.n - 1) / 2) * Math.sin(c.off || SPREAD_OFF) * d : 0;
                ds += c.dmg * hitp(d, c.bs, c.br, lat);
            }
        }
        let dps = ds * 1000 / c.reload;
        if (c.pierce) dps *= PIERCE;
        pr[d] = dps; eff += w * dps;
    }
    const ms = c.speed * mob(c.speed);
    let ehp = c.hp * (0.55 + 0.45 * (ms / 4.0));
    if (c.dash) ehp *= DASH;
    // Super window is 5 s of NORMAL reload - this is exactly the bug the fair-super fix addresses.
    const sup = (5000 / c.reload) * (c.dmg * 3);
    return { eff, ehp, sup, ms, pr };
}

/** Composite power index. `sim` is computed ONCE (the original called it three times). */
function index(c) {
    const m = sim(c);
    return 100 * (
        W.eff * Math.min(1.6, m.eff / REF.eff) +
        W.ehp * Math.min(1.6, m.ehp / REF.ehp) +
        W.sup * Math.min(1.6, m.sup / REF.sup) +
        W.range * Math.min(1.6, c.maxDist / REF_R)
    );
}

// ── today's roster (src/config/brawlers.ts) - used ONLY to calibrate the target ───────────────
const NOW = {
    Twardy:   { hp: 400, dmg: 100, reload: 400,  speed: 5.0, maxDist: 1000, n: 1, br: 6,  bs: 17 },
    Pancerny: { hp: 700, dmg: 75,  reload: 700,  speed: 4.0, maxDist: 1000, n: 2, br: 11, bs: 13 },
    Zwiad:    { hp: 200, dmg: 80,  reload: 250,  speed: 7.5, maxDist: 1000, n: 1, br: 4,  bs: 27 },
    Snajper:  { hp: 300, dmg: 300, reload: 1000, speed: 4.5, maxDist: 1000, n: 1, br: 4,  bs: 29 },
    Tech:     { hp: 400, dmg: 120, reload: 500,  speed: 5.0, maxDist: 1000, n: 1, br: 9,  bs: 17 },
    Ogniarz:  { hp: 500, dmg: 50,  reload: 210,  speed: 4.8, maxDist: 1000, n: 3, br: 10, bs: 14 },
    Shadow:   { hp: 300, dmg: 150, reload: 600,  speed: 6.5, maxDist: 1000, n: 1, br: 8,  bs: 19 },
    King:     { hp: 500, dmg: 200, reload: 500,  speed: 5.5, maxDist: 1000, n: 1, br: 10, bs: 14 },
};

/**
 * Archetype shapes: 0-100 per axis = "how much of this axis is this brawler about".
 * `n` bullets per volley, `br` bullet radius, `bs` bullet speed, `off` spread angle (rad).
 */
const SHAPE = {
    Twardy:   { dmg: 50,  tempo: 55,  armor: 50,  speed: 45,  range: 50, n: 1, br: 7,  bs: 17, style: '1 pocisk, baseline' },
    Pancerny: { dmg: 40,  tempo: 22,  armor: 100, speed: 10,  range: 45, n: 2, br: 11, bs: 13, style: '2 lufy rownolegle' },
    Zwiad:    { dmg: 22,  tempo: 92,  armor: 12,  speed: 100, range: 32, n: 1, br: 7,  bs: 27, style: 'seria, szybki pocisk' },
    Snajper:  { dmg: 100, tempo: 8,   armor: 30,  speed: 30,  range: 100, n: 1, br: 6, bs: 29, style: '1 strzal, najdalej' },
    Tech:     { dmg: 38,  tempo: 48,  armor: 52,  speed: 42,  range: 72, n: 1, br: 9,  bs: 17, style: 'PIERCE', pierce: 1 },
    Ogniarz:  { dmg: 20,  tempo: 100, armor: 88,  speed: 30,  range: 4,  n: 5, br: 10, bs: 14, off: 0.34, style: '5 spread, krotki' },
    Shadow:   { dmg: 55,  tempo: 52,  armor: 22,  speed: 82,  range: 45, n: 1, br: 8,  bs: 19, style: 'DASH', dash: 1 },
    King:     { dmg: 82,  tempo: 38,  armor: 70,  speed: 52,  range: 38, n: 1, br: 10, bs: 14, style: '1 ciezki pocisk' },
};

/**
 * Frozen stats. Mariusz's decision: the machine-gun feel of Ogniarz and the baseline cadence of
 * Twardy do not change - the solver must find balance using the OTHER axes.
 */
const LOCK = { Ogniarz: { reload: 220 }, Twardy: { reload: 400 } };

/** Build a concrete stat block from a shape scaled by knob `k`, then apply locks. */
const build = (n, k) => {
    const s = SHAPE[n], sh = {};
    for (const a of AX) sh[a] = Math.max(0, Math.min(100, s[a] * k));
    return {
        hp: Math.round(lerp('armor', sh.armor) / 50) * 50,
        dmg: Math.round(lerp('dmg', sh.dmg) / 5) * 5,
        reload: Math.round(lerp('tempo', sh.tempo) / 10) * 10,
        speed: Math.round(lerp('speed', sh.speed) * 10) / 10,
        maxDist: Math.round(lerp('range', sh.range) / 50) * 50,
        n: s.n, br: s.br, bs: s.bs, off: s.off, style: s.style,
        pierce: s.pierce, dash: s.dash,
        ...(LOCK[n] || {}),
    };
};

// ── run ──────────────────────────────────────────────────────────────────────
const nowIdx = Object.entries(NOW).map(([n, c]) => [n, index(c)]);
const TARGET = nowIdx.reduce((s, x) => s + x[1], 0) / nowIdx.length;
console.log('OBECNY ROSTER (ten sam model, dla kalibracji):');
nowIdx.slice().sort((a, b) => b[1] - a[1]).forEach(x => console.log('  ' + x[0].padEnd(9) + x[1].toFixed(1)));
console.log('  TARGET (srednia) = ' + TARGET.toFixed(1) + '  -> zero power creep\n');

const OUT = {};
for (const n in SHAPE) {
    let lo = 0.2, hi = 3.0;
    for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; (index(build(n, m)) < TARGET ? lo = m : hi = m); }
    OUT[n] = build(n, (lo + hi) / 2);
}

const p = (x, w) => String(x).padStart(w);
console.log('NOWY ROSTER        HP  DMG RELOAD SPD ZASIEG | INDEX DPSeff  EHP   styl');
const idx = [];
for (const n in OUT) {
    const c = OUT[n], m = sim(c), I = index(c); idx.push(I);
    console.log(n.padEnd(10) + p(c.hp, 8) + p(c.dmg, 5) + p(c.reload, 6) + p(c.speed.toFixed(1), 5) + p(c.maxDist, 6)
        + ' |' + p(I.toFixed(1), 6) + p(m.eff.toFixed(0), 7) + p(m.ehp.toFixed(0), 6) + '   ' + c.style);
}
const spread = (Math.max(...idx) / Math.min(...idx) - 1) * 100;
console.log('\nrozrzut INDEX: ' + spread.toFixed(2) + '%  (cel <5%)');

// ── diversification: profiles must not collapse into one archetype ────────────
// Cosine on CENTRED profiles (axis mean removed). On raw positive vectors everything looks 0.95+,
// which hides the fact that e.g. Tech used to be a near-duplicate of Twardy (0.98).
const ns = Object.keys(OUT);
const raw = n => { const c = OUT[n]; return [c.dmg / 300, 200 / c.reload, c.hp / 700, c.speed / 7.5, c.maxDist / 1400]; };
const mean = AX.map((_, i) => ns.reduce((s, n) => s + raw(n)[i], 0) / ns.length);
const ctr = n => raw(n).map((v, i) => v - mean[i]);
const cos = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b));
const pairs = [];
for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) pairs.push([ns[i], ns[j], cos(ctr(ns[i]), ctr(ns[j]))]);
pairs.sort((a, b) => b[2] - a[2]);
console.log('\npodobienstwo PROFILU (centrowane, +1 = ten sam styl, -1 = przeciwny):');
pairs.slice(0, 4).forEach(x => console.log('  ' + x[0].padEnd(9) + ' vs ' + x[1].padEnd(10) + p(x[2].toFixed(3), 7)));
console.log('  najzdrowsze bieguny:');
pairs.slice(-3).forEach(x => console.log('  ' + x[0].padEnd(9) + ' vs ' + x[1].padEnd(10) + p(x[2].toFixed(3), 7)));

console.log('\nZMIANA vs dzis:');
for (const n in OUT) {
    const a = NOW[n], c = OUT[n];
    const d = k => { const dv = c[k] - a[k]; return (dv > 0 ? '+' : '') + dv; };
    console.log('  ' + n.padEnd(9) + ' hp ' + p(a.hp, 3) + '->' + p(c.hp, 3) + ' (' + p(d('hp'), 4) + ')  dmg ' + p(a.dmg, 3) + '->' + p(c.dmg, 3)
        + '  reload ' + p(a.reload, 4) + '->' + p(c.reload, 4) + '  spd ' + a.speed + '->' + c.speed + '  zasieg 1000->' + c.maxDist);
}

// ── optional JSON dump: lets two runs be diffed instead of eyeballed ─────────
const jsonAt = process.argv.indexOf('--json');
if (jsonAt !== -1 && process.argv[jsonAt + 1]) {
    const out = { target: TARGET, spreadPct: spread, roster: {} };
    for (const n in OUT) out.roster[n] = { ...OUT[n], index: index(OUT[n]) };
    writeFileSync(process.argv[jsonAt + 1], JSON.stringify(out, null, 2));
    console.log('\nzapisano: ' + process.argv[jsonAt + 1]);
}
