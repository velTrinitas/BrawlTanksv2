/**
 * mars_m1_layout.mjs — MARS layout generator + AABB math-verify.
 *
 * Run: node tools/mars_m1_layout.mjs
 *
 * Purpose (lesson I1 + I7 from docs/map-kit/LESSONS_LEARNED.md):
 * - Layout = FROZEN DATA verified offline BEFORE any placement code is written.
 * - This script IS the tracked generator: MarsMap.ts layouts must be copy-pasted
 *   from this script's output and reference this file in a comment.
 *
 * REV 2 (playtest feedback, Mariusz):
 *  - "wszystko skoncentrowane w srodku, a na obrzezach pusto" -> everything was
 *    clustered mid-map. Added V7 SECTOR COVERAGE: the world is split 3x3 and
 *    every sector must carry content, so emptiness is caught by the script
 *    instead of by eye.
 *  - "szczelina ... nic nie daje grze" -> CREVASSES REMOVED entirely.
 *  - "brakuje lazika ... i pola baterii slonecznych" -> added a solar farm
 *    (solid panel rows) and a rover patrol route.
 *  - "nie generuja sie medipady" -> there was ONE pad on a 3000x3000 map, so it
 *    was never found. Now 2 medi + 2 power, one per quadrant.
 *
 * Coordinate convention: ALL rects below are x/y = TOP-LEFT (ICollidable rule).
 * World 3000x3000, playable [40, 2960] (COLLISION_INNER_EDGE 40, grammar §7).
 *
 * Verifies:
 *  V1 everything inside playable bounds
 *  V2 solid-vs-solid corridors >= CORRIDOR px, except whitelisted touching pairs
 *  V3 zones/pads never intersect solids; pads keep PAD_CLEAR from solids
 *  V4 player spawn zone (centre, r=SPAWN_CLEAR_R) fully clear
 *  V5 generated small rocks + cargo: seeded (mulberry32), collision-free
 *  V6 rover patrol route: every waypoint clear of solids, legs do not cross them
 *  V7 sector coverage: all 9 sectors carry content (anti-"empty edges")
 */

// ── RNG: mulberry32 (U1 canon — same algorithm the map bake must use) ──
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const WORLD = 3000;
const PLAY_MIN = 40, PLAY_MAX = 2960;
const CORRIDOR = 110;        // min free corridor between separate solids (B7)
const DIAG_MIN = 80;
const PAD_CLEAR = 120;
const SPAWN_X = 1500, SPAWN_Y = 1500, SPAWN_CLEAR_R = 220;
const SEED_ROCKS = 0x4d5231;
const SEED_CRATES = 0x4d5232;

// ── FROZEN LAYOUT — Mars base (LANDMARK), moved NE off centre ──
const BASE = [
    { id: 'domeA',  x: 1880, y: 380, w: 340, h: 280 },
    { id: 'tunnel', x: 2220, y: 500, w: 150, h: 70  },
    { id: 'domeB',  x: 2370, y: 440, w: 260, h: 220 },
];
const TOUCH_WHITELIST = [['domeA', 'tunnel'], ['tunnel', 'domeB']];

// ── SOLAR FARM — powers the base. Placed SW, the opposite corner from the base,
// so the two big man-made features pull the player across the map.
// REV 3 (playtest): the rows are CARPORTS — you drive UNDER them, so they carry
// NO collision. They stay in the layout for spacing + sector coverage, and the
// lane gaps are kept so the farm still reads as a structure you weave through.
const SOLAR_ROW_W = 430, SOLAR_ROW_H = 62;
const SOLAR_ORIGIN = { x: 330, y: 1960 };
const SOLAR_ROW_GAP = 178;              // lane between rows (> CORRIDOR + row height)
const SOLAR_ROWS = 4;
const SOLAR = [];
for (let i = 0; i < SOLAR_ROWS; i++) {
    SOLAR.push({
        id: `solar${i}`,
        x: SOLAR_ORIGIN.x + (i % 2) * 40,           // slight stagger, not a grid
        y: SOLAR_ORIGIN.y + i * SOLAR_ROW_GAP,
        w: SOLAR_ROW_W, h: SOLAR_ROW_H,
    });
}

// ── FUEL STATION (M5c) — where the UFO lands to refuel after a catch.
// The landing apron is PASSABLE (the saucer sets down on it, the player may
// drive across); only the fuel tank is a solid. Placed in the north-middle
// sector, which the coverage check flagged as the thinnest.
const FUEL_PAD = { id: 'fuelPad', x: 200, y: 480, w: 140, h: 120 };   // passable
const FUEL_TANK = { id: 'fuelTank', x: 372, y: 500, w: 60, h: 82 };  // solid

// Large rocks 120x120 — pushed toward edges/corners, a few mid-field as cover.
const LARGE_ROCKS = [
    { id: 'LR1', x: 240,  y: 240  },
    { id: 'LR2', x: 2640, y: 200  },
    { id: 'LR3', x: 180,  y: 1180 },
    { id: 'LR4', x: 2720, y: 1320 },
    { id: 'LR5', x: 1420, y: 180  },
    { id: 'LR6', x: 2560, y: 2660 },
    { id: 'LR7', x: 1180, y: 2740 },
    { id: 'LR8', x: 1980, y: 1620 },
    { id: 'LR9', x: 860,  y: 900  },
    { id: 'LR10', x: 2300, y: 2180 },
].map(r => ({ ...r, w: 120, h: 120 }));

// ── Passable zones ──
// Loose regolith (slow) — spread to the rim, one mid-field pocket.
const SLOW_FIELDS = [
    { id: 'R1', x: 620,  y: 380,  w: 240, h: 180 },
    { id: 'R2', x: 2500, y: 1680, w: 240, h: 190 },
    { id: 'R3', x: 330,  y: 2620, w: 260, h: 180 },
    { id: 'R4', x: 1640, y: 940,  w: 210, h: 165 },
    { id: 'R5', x: 1700, y: 2480, w: 250, h: 175 },
];
// Hydroponics (stealth). One belongs to the base, one sits by the solar farm —
// the greenhouse needs power, so the pairing tells the story AND spreads cover.
const STEALTH_ZONES = [
    { id: 'hydroBase',  x: 1930, y: 760,  w: 300, h: 190 },
    { id: 'hydroSolar', x: 980,  y: 2380, w: 280, h: 180 },
];
// Pads: 3 medi + 2 power — the count every other open map uses. Mars shipped
// with ONE of each, which on 3000x3000 meant the player never met one
// ("nie generuja sie medipady"). Spread around the ~700-1250 px ring, never in
// the centre (that is the fighting floor) and never against the rim.
const PADS = [
    { id: 'medi1',  x: 560,  y: 780,  w: 100, h: 100 },
    { id: 'medi2',  x: 2260, y: 2420, w: 100, h: 100 },
    { id: 'medi3',  x: 1420, y: 2380, w: 100, h: 100 },
    { id: 'power1', x: 2560, y: 900,  w: 100, h: 100 },
    { id: 'power2', x: 760,  y: 1560, w: 100, h: 100 },
];

// ── Rover patrol route (NEW) — a loop that visits rocks to "survey" them.
// Passable actor: it must not START inside a solid, and its legs should not run
// through one (it has no collision, but driving through a rock looks broken).
const ROVER_ROUTE = [
    { x: 520,  y: 620 },
    { x: 1180, y: 520 },
    { x: 1760, y: 1080 },
    { x: 2420, y: 1500 },
    { x: 2200, y: 2260 },
    { x: 1380, y: 2420 },
    { x: 700,  y: 1760 },
];

// ── AABB helpers ──
const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function corridor(a, b) {
    const hGap = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
    const vGap = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
    if (hGap < 0 && vGap < 0) return -1;
    if (hGap >= 0 && vGap >= 0) return Infinity;
    return Math.max(hGap, vGap);
}
function cornerDist(a, b) {
    const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
    const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
    return Math.hypot(dx, dy);
}
const inPlayable = (r) =>
    r.x >= PLAY_MIN && r.y >= PLAY_MIN && r.x + r.w <= PLAY_MAX && r.y + r.h <= PLAY_MAX;
function inSpawnZone(r) {
    const cx = Math.max(r.x, Math.min(SPAWN_X, r.x + r.w));
    const cy = Math.max(r.y, Math.min(SPAWN_Y, r.y + r.h));
    return Math.hypot(cx - SPAWN_X, cy - SPAWN_Y) < SPAWN_CLEAR_R;
}
const isWhitelisted = (a, b) =>
    TOUCH_WHITELIST.some(([p, q]) => (p === a.id && q === b.id) || (p === b.id && q === a.id));
/** segment (p0->p1) vs AABB, slab method */
function segHitsRect(p0, p1, r) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    let t0 = 0, t1 = 1;
    for (const [p, q0, q1, d] of [[p0.x, r.x, r.x + r.w, dx], [p0.y, r.y, r.y + r.h, dy]]) {
        if (Math.abs(d) < 1e-9) { if (p < q0 || p > q1) return false; continue; }
        let ta = (q0 - p) / d, tb = (q1 - p) / d;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) return false;
    }
    return true;
}

// ── Generation with rejection sampling ──
function generate(count, w, h, seed, obstacles, minGapToObstacles, allowTouchIds) {
    const rng = mulberry32(seed);
    const placed = [];
    let attempts = 0;
    while (placed.length < count && attempts < 40000) {
        attempts++;
        const r = {
            id: `gen${placed.length}`,
            x: Math.round(PLAY_MIN + 60 + rng() * (PLAY_MAX - PLAY_MIN - 120 - w)),
            y: Math.round(PLAY_MIN + 60 + rng() * (PLAY_MAX - PLAY_MIN - 120 - h)),
            w, h,
        };
        if (inSpawnZone(r)) continue;
        let ok = true;
        for (const o of obstacles) {
            const pad = minGapToObstacles;
            const inflated = { x: o.x - pad, y: o.y - pad, w: o.w + 2 * pad, h: o.h + 2 * pad };
            if (overlaps(r, inflated)) { ok = false; break; }
        }
        if (ok) {
            for (const p of placed) {
                if (allowTouchIds) { if (overlaps(r, p)) { ok = false; break; } }
                else {
                    const infl = { x: p.x - CORRIDOR, y: p.y - CORRIDOR, w: p.w + 2 * CORRIDOR, h: p.h + 2 * CORRIDOR };
                    if (overlaps(r, infl)) { ok = false; break; }
                }
            }
        }
        if (ok) placed.push(r);
    }
    return { placed, attempts };
}

// ── Run verification ──
const errors = [];
// SOLAR is passable (carports) — it is NOT a solid, but it still occupies space,
// so it takes part in placement/coverage checks, just not the corridor rule.
const fixedSolids = [...BASE, ...LARGE_ROCKS, FUEL_TANK];
const fixedAll = [...fixedSolids, ...SOLAR, FUEL_PAD, ...SLOW_FIELDS, ...STEALTH_ZONES, ...PADS];

// V1 bounds
for (const r of fixedAll) if (!inPlayable(r)) errors.push(`V1 ${r.id}: poza playable`);

// V2 solid corridors
for (let i = 0; i < fixedSolids.length; i++) for (let j = i + 1; j < fixedSolids.length; j++) {
    const a = fixedSolids[i], b = fixedSolids[j];
    if (isWhitelisted(a, b)) {
        if (corridor(a, b) > 0) errors.push(`V2 ${a.id}-${b.id}: whitelist TOUCH, ale nie dotykaja`);
        continue;
    }
    const c = corridor(a, b);
    if (c === -1) errors.push(`V2 ${a.id}-${b.id}: OVERLAP solidow`);
    else if (c === Infinity) { if (cornerDist(a, b) < DIAG_MIN) errors.push(`V2 ${a.id}-${b.id}: diagonal < ${DIAG_MIN}`); }
    else if (c < CORRIDOR) errors.push(`V2 ${a.id}-${b.id}: korytarz ${c.toFixed(0)} < ${CORRIDOR}`);
}

// V3 zones/pads vs solids
for (const z of [...SLOW_FIELDS, ...STEALTH_ZONES]) for (const s of fixedSolids)
    if (overlaps(z, s)) errors.push(`V3 ${z.id} przecina ${s.id}`);
for (const p of PADS) for (const s of fixedSolids) {
    const infl = { x: s.x - PAD_CLEAR, y: s.y - PAD_CLEAR, w: s.w + 2 * PAD_CLEAR, h: s.h + 2 * PAD_CLEAR };
    if (overlaps(p, infl)) errors.push(`V3 pad ${p.id} < ${PAD_CLEAR} od ${s.id}`);
}
const zonesAndPads = [...SLOW_FIELDS, ...STEALTH_ZONES, ...PADS];
for (let i = 0; i < zonesAndPads.length; i++) for (let j = i + 1; j < zonesAndPads.length; j++)
    if (overlaps(zonesAndPads[i], zonesAndPads[j]))
        errors.push(`V3 ${zonesAndPads[i].id} przecina ${zonesAndPads[j].id}`);

// V4 spawn zone
for (const r of fixedAll) if (inSpawnZone(r)) errors.push(`V4 ${r.id} w strefie spawnu gracza`);

// V5 generated
const rocks = generate(26, 64, 64, SEED_ROCKS, [...fixedAll], 90, false);
const crateObstacles = [...fixedAll, ...rocks.placed];
const crates = generate(64, 48, 48, SEED_CRATES, crateObstacles, 90, true);
if (rocks.placed.length < 26) errors.push(`V5 male skaly: ${rocks.placed.length}/26`);
if (crates.placed.length < 64) errors.push(`V5 skrzynie: ${crates.placed.length}/64`);

// V6 rover route
for (let i = 0; i < ROVER_ROUTE.length; i++) {
    const wp = ROVER_ROUTE[i];
    const box = { x: wp.x - 26, y: wp.y - 26, w: 52, h: 52 };
    if (!inPlayable(box)) errors.push(`V6 waypoint ${i}: poza playable`);
    for (const s of fixedSolids) if (overlaps(box, s)) errors.push(`V6 waypoint ${i} w solidzie ${s.id}`);
    const next = ROVER_ROUTE[(i + 1) % ROVER_ROUTE.length];
    for (const s of fixedSolids) {
        if (segHitsRect(wp, next, s)) errors.push(`V6 odcinek ${i}->${(i + 1) % ROVER_ROUTE.length} przecina ${s.id}`);
    }
}

// V7 sector coverage — the anti-"empty edges" gate
const SECTORS = 3;
const sectorCount = Array.from({ length: SECTORS * SECTORS }, () => 0);
const sectorOf = (x, y) => {
    const sx = Math.min(SECTORS - 1, Math.floor((x / WORLD) * SECTORS));
    const sy = Math.min(SECTORS - 1, Math.floor((y / WORLD) * SECTORS));
    return sy * SECTORS + sx;
};
const contentForCoverage = [...fixedAll, ...rocks.placed];
for (const r of contentForCoverage) sectorCount[sectorOf(r.x + r.w / 2, r.y + r.h / 2)]++;
const emptySectors = [];
sectorCount.forEach((n, i) => { if (n < 2) emptySectors.push(`${i} (${n})`); });
if (emptySectors.length) errors.push(`V7 sektory ubogie (<2 obiekty): ${emptySectors.join(', ')}`);

// ── Report ──
console.log('=== MARS LAYOUT VERIFY (rev 2) ===');
console.log(errors.length === 0 ? 'PASS — 0 bledow' : `FAIL — ${errors.length} bledow:`);
for (const e of errors) console.log('  ' + e);

const area = (rs) => rs.reduce((s, r) => s + r.w * r.h, 0);
const blocked = area(fixedSolids) + area(rocks.placed) + area(crates.placed);
console.log(`\nBlocked area: ${(100 * blocked / (WORLD * WORLD)).toFixed(2)}% swiata`);
console.log('Sector coverage (3x3, licznik obiektow):');
for (let sy = 0; sy < SECTORS; sy++) {
    console.log('  ' + sectorCount.slice(sy * SECTORS, sy * SECTORS + SECTORS)
        .map(n => String(n).padStart(3)).join(' '));
}
console.log(`\nGen attempts: rocks ${rocks.attempts}, crates ${crates.attempts}`);
console.log('\n// ── FROZEN: MARS_SMALL_ROCKS (x/y = TOP-LEFT, 64x64) ──');
console.log(JSON.stringify(rocks.placed.map(r => [r.x, r.y])));
console.log('\n// ── FROZEN: MARS_CRATES (x/y = TOP-LEFT, 48x48 reserved / 36x36 drawn) ──');
console.log(JSON.stringify(crates.placed.map(r => [r.x, r.y])));
console.log('\n// ── FROZEN: MARS_SOLAR_ROWS (x/y = TOP-LEFT) ──');
console.log(JSON.stringify(SOLAR.map(s => [s.x, s.y, s.w, s.h])));
console.log('\n// ── FROZEN: MARS_FUEL_STATION ──');
console.log('pad: ' + JSON.stringify(FUEL_PAD) + '\ntank: ' + JSON.stringify(FUEL_TANK));
console.log('\n// ── FROZEN: pady (x/y = TOP-LEFT, footprint 100x100) ──');
const dist = (p) => Math.round(Math.hypot(p.x + 50 - SPAWN_X, p.y + 50 - SPAWN_Y));
console.log('MEDI: ' + JSON.stringify(PADS.filter(p => p.id.startsWith('medi')).map(p => ({ x: p.x, y: p.y }))));
console.log('POWER: ' + JSON.stringify(PADS.filter(p => p.id.startsWith('power')).map(p => ({ x: p.x, y: p.y }))));
console.log('dystanse od srodka: ' + PADS.map(p => `${p.id}=${dist(p)}`).join(', '));
process.exit(errors.length === 0 ? 0 : 1);
