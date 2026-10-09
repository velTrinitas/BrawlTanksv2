/**
 * junkyard_j0_layout.mjs — ZLOMOWISKO (junkyard) layout generator + AABB math-verify.
 *
 * Run: node tools/junkyard_j0_layout.mjs
 *
 * Same discipline as tools/mars_m1_layout.mjs (lessons I1 + I7): the layout is FROZEN DATA
 * verified offline BEFORE any placement code. JunkyardMap.ts exports must be pasted from this
 * script's output and reference this file. Do NOT hand-edit coordinates in the map file.
 *
 * Coordinate convention: ALL rects below are x/y = TOP-LEFT (ICollidable rule).
 * World 3000x3000, playable [40, 2960].
 *
 * Verifies:
 *  V1 everything inside playable bounds
 *  V2 solid-vs-solid corridors >= CORRIDOR px (except whitelisted touching pairs)
 *  V3 passable zones / pads never intersect solids; pads keep PAD_CLEAR from solids
 *  V4 player start zone (S, r=SPAWN_CLEAR_R) fully clear; tutorial fan (3 enemies ~250-300 px
 *     toward map centre) also clear
 *  V5 crane drop ring: no drop circle may touch the press bed, stacks, belt, stealth or a corridor
 *     narrower than 2 tanks (checked as: every drop point keeps DROP_CLEAR from every solid/zone)
 *  V6 lawette loop: waypoints and legs clear of solids
 *  V7 sector coverage: all 9 sectors carry content
 *  V8 generated scrap piles (small decor solids) and hubcap decals: seeded, collision-free
 */

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
const CORRIDOR = 110;          // min free corridor between separate solids (B7); plan asked >= 90
const DIAG_MIN = 80;
const PAD_CLEAR = 120;
const PLAYER_START = { x: 1500, y: 2600 };
const SPAWN_CLEAR_R = 240;
const TUTORIAL_R = 320;        // tutorialSpawnAt places enemies 250-300 px toward the map centre
const DROP_CLEAR = 60;
const SEED_PILES = 0x4a594b31;   // "JYK1"
const SEED_HUBCAPS = 0x4a594b32;

// ── MACHINES (stand-ins in J1, final collision footprints) ──
// Press bed is PASSABLE (hazard zone, J3); the four pistons around it are solids.
const PRESS_BED = { id: 'pressBed', x: 1356, y: 1404, w: 288, h: 192 }; // REV 5: -20%
const PRESS_PISTONS = [
    { id: 'pistonNW', x: 1316, y: 1364, w: 40, h: 40 },
    { id: 'pistonNE', x: 1676, y: 1364, w: 40, h: 40 },
    { id: 'pistonSW', x: 1316, y: 1596, w: 40, h: 40 },
    { id: 'pistonSE', x: 1676, y: 1596, w: 40, h: 40 },
];
const CRANE_TOWER = { id: 'craneTower', x: 1440, y: 440, w: 120, h: 120 };
const CRANE_ARM = 520;
// Conveyor belt is PASSABLE (moves whatever stands on it, J5); crusher is a solid.
const BELT = { id: 'belt', x: 1718, y: 1440, w: 882, h: 120 }; // REV 5: joined to the press
const CRUSHER = { id: 'crusher', x: 2600, y: 1400, w: 160, h: 200 };
// Car wash: two solid walls (N/S), passable tunnel between (stealth, J2).
const WASH_TUNNEL = { id: 'washTunnel', x: 540, y: 1425, w: 300, h: 150 }; // REV 2 (playtest): myjnia za duza -> 300x150
const WASH_WALLS = [ // REV 8: wiata na 4 slupach + agregat (FoamStation)
    { id: 'washPostNW', x: 512, y: 1397, w: 28, h: 28 }, { id: 'washPostNE', x: 840, y: 1397, w: 28, h: 28 },
    { id: 'washPostSW', x: 512, y: 1575, w: 28, h: 28 }, { id: 'washPostSE', x: 840, y: 1575, w: 28, h: 28 },
    { id: 'washUnit', x: 656, y: 1391, w: 68, h: 30 },
];

// ── WRECK STACKS (ring around the press — cover for dodging the telegraph) ──
const STACKS = [
    { id: 'stackNW', x: 1000, y: 1000, w: 200, h: 140, tiers: 3 },
    { id: 'stackNE', x: 1800, y: 1000, w: 200, h: 140, tiers: 4 },
    { id: 'stackSW', x: 1000, y: 1860, w: 200, h: 140, tiers: 2 },
    { id: 'stackSE', x: 1800, y: 1860, w: 200, h: 140, tiers: 3 },
    // outer stacks so the rim is not empty (V7)
    { id: 'stackW',  x: 200,  y: 1980, w: 200, h: 140, tiers: 3 },
    { id: 'stackE',  x: 2560, y: 1760, w: 200, h: 140, tiers: 2 },
    { id: 'stackN',  x: 2600, y: 620,  w: 200, h: 140, tiers: 3 },
    { id: 'stackS',  x: 1000, y: 2560, w: 200, h: 140, tiers: 4 },
];

// ── TIRE MAZES (rings of tires with 2 openings; walls are solids, inside = stealth in J2) ──
// Each maze = outer square ring of tire walls (thickness 50) with a gap on two sides.
function tireMaze(id, x0, y0, size, gapA, gapB) {
    const T = 50, G = 100; // REV 4 (playtest): maze 320, gap 100
    const walls = [];
    const x1 = x0 + size, y1 = y0 + size;
    const mid = size / 2;
    // N wall (gap in middle if gapA==='N'), etc.
    const seg = (sid, x, y, w, h) => walls.push({ id: `${id}_${sid}`, x, y, w, h });
    const side = (name, gap) => {
        if (name === 'N') { if (gap) { seg('N1', x0, y0, mid - G / 2, T); seg('N2', x0 + mid + G / 2, y0, mid - G / 2, T); } else seg('N', x0, y0, size, T); }
        if (name === 'S') { if (gap) { seg('S1', x0, y1 - T, mid - G / 2, T); seg('S2', x0 + mid + G / 2, y1 - T, mid - G / 2, T); } else seg('S', x0, y1 - T, size, T); }
        if (name === 'W') { if (gap) { seg('W1', x0, y0 + T, T, mid - T - G / 2); seg('W2', x0, y0 + mid + G / 2, T, mid - T - G / 2); } else seg('W', x0, y0 + T, T, size - 2 * T); }
        if (name === 'E') { if (gap) { seg('E1', x1 - T, y0 + T, T, mid - T - G / 2); seg('E2', x1 - T, y0 + mid + G / 2, T, mid - T - G / 2); } else seg('E', x1 - T, y0 + T, T, size - 2 * T); }
    };
    for (const s of ['N', 'S', 'W', 'E']) side(s, s === gapA || s === gapB);
    return { id, x: x0, y: y0, w: size, h: size, inner: { id: id + '_inner', x: x0 + T, y: y0 + T, w: size - 2 * T, h: size - 2 * T }, walls };
}
const MAZE_NW = tireMaze('mazeNW', 380, 380, 320, 'E', 'S');
const MAZE_SE = tireMaze('mazeSE', 2300, 2300, 320, 'W', 'N');
const MAZE_WALL_TOUCH = []; // segments of one maze may touch each other at corners
for (const m of [MAZE_NW, MAZE_SE]) for (const a of m.walls) for (const b of m.walls) if (a !== b) MAZE_WALL_TOUCH.push([a.id, b.id]);

// ── CONTAINERS (NE) — open door on the S side (stealth inside, J2). Solid box in J1. ──
const CONTAINERS = [
    { id: 'contRed',  x: 2200, y: 400, w: 180, h: 100 },
    { id: 'contBlue', x: 2500, y: 400, w: 180, h: 100 },
];

// ── SCRAP OFFICE (SW) — megaphone roof (Wyprzedaz czesci, J6) ──
const OFFICE = { id: 'office', x: 640, y: 2380, w: 220, h: 140 };

// ── PADS (100x100) ──
const PADS = [
    { id: 'medi1',  x: 420,  y: 1120, w: 100, h: 100 },
    { id: 'medi2',  x: 2540, y: 1120, w: 100, h: 100 },
    { id: 'medi3',  x: 1500, y: 2200, w: 100, h: 100 },
    { id: 'power1', x: 420,  y: 2300, w: 100, h: 100 },
    { id: 'power2', x: 1900, y: 2300, w: 100, h: 100 },
    { id: 'cranePad', x: 1220, y: 560, w: 100, h: 100 }, // J4: Pulpit dzwigu
    { id: 'tireS', x: 1380, y: 1760, w: 100, h: 100 }, { id: 'tireN', x: 1520, y: 1140, w: 100, h: 100 }, // J6b: opony-trampoliny
    { id: 'landN', x: 1520, y: 1080, w: 100, h: 100 }, { id: 'landS', x: 1380, y: 1820, w: 100, h: 100 }, // J6b: ladowiska
];

// ── LAWETTE (tow truck) loop — J6, verified now so the layout never has to move ──
const LAWETTE_ROUTE = [
    { x: 1500, y: 2900 }, { x: 2900, y: 2900 }, { x: 2900, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 2900 },
];
// It rides the outer lane: playable edge is 40, border visual 55 => keep >= 100 from the edge.
for (const p of LAWETTE_ROUTE) { p.x = Math.max(140, Math.min(2860, p.x)); p.y = Math.max(140, Math.min(2860, p.y)); }

// ── CRANE DROP POINTS (J4) — ring r 300..520 around the tower centre, 8 candidates ──
const towerC = { x: CRANE_TOWER.x + 60, y: CRANE_TOWER.y + 60 };
const DROP_POINTS = [];
for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = 420;
    DROP_POINTS.push({ id: `drop${i}`, x: Math.round(towerC.x + Math.cos(a) * r), y: Math.round(towerC.y + Math.sin(a) * r), r: 100 });
}

// ── AABB helpers ──
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
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
const inPlayable = (r) => r.x >= PLAY_MIN && r.y >= PLAY_MIN && r.x + r.w <= PLAY_MAX && r.y + r.h <= PLAY_MAX;
function circleHitsRect(cx, cy, cr, r) {
    const px = Math.max(r.x, Math.min(cx, r.x + r.w));
    const py = Math.max(r.y, Math.min(cy, r.y + r.h));
    return Math.hypot(px - cx, py - cy) < cr;
}
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

// ── Whitelist of touching solids (parts of one object) ──
const TOUCH_WHITELIST = [
    ...MAZE_WALL_TOUCH,
    ['belt', 'crusher'],
];
const isWhitelisted = (a, b) => TOUCH_WHITELIST.some(([p, q]) => (p === a.id && q === b.id) || (p === b.id && q === a.id));

// ── Collections ──
const fixedSolids = [
    ...PRESS_PISTONS, CRANE_TOWER, CRUSHER, ...WASH_WALLS,
    ...STACKS, ...MAZE_NW.walls, ...MAZE_SE.walls, ...CONTAINERS, OFFICE,
];
const passableZones = [PRESS_BED, BELT, WASH_TUNNEL, MAZE_NW.inner, MAZE_SE.inner];
const fixedAll = [...fixedSolids, ...passableZones, ...PADS];

const errors = [];

// V1
for (const r of fixedAll) if (!inPlayable(r)) errors.push(`V1 ${r.id}: poza playable`);

// V2 corridors between solids
for (let i = 0; i < fixedSolids.length; i++) for (let j = i + 1; j < fixedSolids.length; j++) {
    const a = fixedSolids[i], b = fixedSolids[j];
    if (isWhitelisted(a, b)) continue;
    const c = corridor(a, b);
    if (c === -1) errors.push(`V2 ${a.id}-${b.id}: OVERLAP`);
    else if (c === Infinity) { if (cornerDist(a, b) < DIAG_MIN) errors.push(`V2 ${a.id}-${b.id}: diagonal ${cornerDist(a, b).toFixed(0)} < ${DIAG_MIN}`); }
    else if (c < CORRIDOR) errors.push(`V2 ${a.id}-${b.id}: korytarz ${c.toFixed(0)} < ${CORRIDOR}`);
}
// Press bed vs pistons: pistons must sit OUTSIDE the bed but may touch it.
for (const p of PRESS_PISTONS) if (overlaps(p, PRESS_BED)) errors.push(`V2 ${p.id} wchodzi w loze prasy`);

// V3 passable zones / pads vs solids
for (const z of passableZones) for (const s of fixedSolids) {
    const ownWalls = z === WASH_TUNNEL ? WASH_WALLS.map(w => w.id) : z === MAZE_NW.inner ? MAZE_NW.walls.map(w => w.id) : z === MAZE_SE.inner ? MAZE_SE.walls.map(w => w.id) : z === PRESS_BED ? PRESS_PISTONS.map(p => p.id) : z === BELT ? ['crusher'] : [];
    if (ownWalls.includes(s.id)) { if (overlaps(z, s)) errors.push(`V3 ${z.id || 'zone'} nachodzi na wlasna sciane ${s.id}`); continue; }
    if (overlaps(z, s)) errors.push(`V3 strefa ${z.id || '?'} przecina ${s.id}`);
}
for (const p of PADS) for (const s of fixedSolids) {
    const infl = { x: s.x - PAD_CLEAR, y: s.y - PAD_CLEAR, w: s.w + 2 * PAD_CLEAR, h: s.h + 2 * PAD_CLEAR };
    if (overlaps(p, infl)) errors.push(`V3 pad ${p.id} < ${PAD_CLEAR} od ${s.id}`);
}
for (const p of PADS) for (const z of passableZones) if (overlaps(p, z)) errors.push(`V3 pad ${p.id} w strefie ${z.id}`);

// V4 player start + tutorial fan
function inCircle(r, cx, cy, rad) {
    const px = Math.max(r.x, Math.min(cx, r.x + r.w)), py = Math.max(r.y, Math.min(cy, r.y + r.h));
    return Math.hypot(px - cx, py - cy) < rad;
}
for (const r of fixedAll) {
    if (inCircle(r, PLAYER_START.x, PLAYER_START.y, SPAWN_CLEAR_R)) errors.push(`V4 ${r.id} w strefie startu gracza`);
}
// tutorial: fan of 3 enemies 250-300 px toward the centre (angle to (1500,1500) = up)
for (const off of [-0.55, 0, 0.55]) {
    const a = Math.atan2(1500 - PLAYER_START.y, 1500 - PLAYER_START.x) + off;
    const ex = PLAYER_START.x + Math.cos(a) * 300, ey = PLAYER_START.y + Math.sin(a) * 300;
    for (const s of fixedSolids) if (inCircle(s, ex, ey, 60)) errors.push(`V4 tutorial wrog (${ex.toFixed(0)},${ey.toFixed(0)}) w ${s.id}`);
}

// V5 crane drops
const dropForbidden = [...fixedSolids, PRESS_BED, BELT, WASH_TUNNEL, MAZE_NW.inner, MAZE_SE.inner, ...PADS];
const validDrops = [];
for (const d of DROP_POINTS) {
    let ok = d.x - d.r >= PLAY_MIN && d.y - d.r >= PLAY_MIN && d.x + d.r <= PLAY_MAX && d.y + d.r <= PLAY_MAX;
    for (const f of dropForbidden) if (circleHitsRect(d.x, d.y, d.r + DROP_CLEAR, f)) { ok = false; break; }
    if (ok) validDrops.push(d);
}
if (validDrops.length < 4) errors.push(`V5 za malo waznych punktow zrzutu: ${validDrops.length}/8 (min 4)`);

// V6 lawette loop
for (let i = 0; i < LAWETTE_ROUTE.length; i++) {
    const wp = LAWETTE_ROUTE[i], next = LAWETTE_ROUTE[(i + 1) % LAWETTE_ROUTE.length];
    const box = { x: wp.x - 40, y: wp.y - 40, w: 80, h: 80 };
    if (!inPlayable(box)) errors.push(`V6 laweta waypoint ${i} poza playable`);
    for (const s of fixedSolids) {
        const infl = { x: s.x - 40, y: s.y - 40, w: s.w + 80, h: s.h + 80 };
        if (segHitsRect(wp, next, infl)) errors.push(`V6 laweta odcinek ${i} przecina ${s.id}`);
    }
}

// V8 generated decor: scrap piles (solid 70x70) + hubcap decals (passable, baked into ground)
function generate(count, w, h, seed, obstacles, gap, extraReject) {
    const rng = mulberry32(seed);
    const placed = []; let attempts = 0;
    while (placed.length < count && attempts < 60000) {
        attempts++;
        const r = { id: `gen${placed.length}`, x: Math.round(PLAY_MIN + 80 + rng() * (PLAY_MAX - PLAY_MIN - 160 - w)), y: Math.round(PLAY_MIN + 80 + rng() * (PLAY_MAX - PLAY_MIN - 160 - h)), w, h };
        if (inCircle(r, PLAYER_START.x, PLAYER_START.y, TUTORIAL_R)) continue;
        if (extraReject && extraReject(r)) continue;
        let ok = true;
        for (const o of obstacles) { const infl = { x: o.x - gap, y: o.y - gap, w: o.w + 2 * gap, h: o.h + 2 * gap }; if (overlaps(r, infl)) { ok = false; break; } }
        if (ok) for (const p of placed) { const infl = { x: p.x - CORRIDOR, y: p.y - CORRIDOR, w: p.w + 2 * CORRIDOR, h: p.h + 2 * CORRIDOR }; if (overlaps(r, infl)) { ok = false; break; } }
        if (ok) placed.push(r);
    }
    return { placed, attempts };
}
const dropZones = validDrops.map(d => ({ x: d.x - d.r, y: d.y - d.r, w: d.r * 2, h: d.r * 2 }));
const piles = generate(0, 70, 70, SEED_PILES, [...fixedAll, ...dropZones], CORRIDOR, (r) => {
    // never on the lawette lane
    for (let i = 0; i < LAWETTE_ROUTE.length; i++) { const infl = { x: r.x - 50, y: r.y - 50, w: r.w + 100, h: r.h + 100 }; if (segHitsRect(LAWETTE_ROUTE[i], LAWETTE_ROUTE[(i + 1) % LAWETTE_ROUTE.length], infl)) return true; }
    return false;
});
// REV 2 (playtest): kupki zlomu USUNIETE — czytaly sie jak kratki i blokowaly ruch.
const hubcaps = generate(40, 24, 24, SEED_HUBCAPS, [...fixedSolids, ...piles.placed], 20, null);

// V7 sector coverage
const SECTORS = 3;
const sectorCount = Array.from({ length: 9 }, () => 0);
const sectorOf = (x, y) => Math.min(2, Math.floor(y / WORLD * 3)) * 3 + Math.min(2, Math.floor(x / WORLD * 3));
for (const r of [...fixedAll, ...piles.placed]) sectorCount[sectorOf(r.x + r.w / 2, r.y + r.h / 2)]++;
sectorCount.forEach((n, i) => { if (n < 2) errors.push(`V7 sektor ${i} ubogi (${n})`); });

// ── Report ──
console.log('=== JUNKYARD LAYOUT VERIFY (J0) ===');
console.log(errors.length === 0 ? 'PASS — 0 bledow' : `FAIL — ${errors.length} bledow:`);
for (const e of errors) console.log('  ' + e);
const area = (rs) => rs.reduce((s, r) => s + r.w * r.h, 0);
console.log(`Blocked area: ${(100 * area([...fixedSolids, ...piles.placed]) / (WORLD * WORLD)).toFixed(2)}% swiata`);
console.log('Sector coverage:');
for (let sy = 0; sy < 3; sy++) console.log('  ' + sectorCount.slice(sy * 3, sy * 3 + 3).map(n => String(n).padStart(3)).join(' '));
console.log(`Valid crane drops: ${validDrops.length}/8`);

const strip = (r) => ({ x: r.x, y: r.y, w: r.w, h: r.h });
const out = {
    pressBed: strip(PRESS_BED), pressPistons: PRESS_PISTONS.map(strip),
    craneTower: strip(CRANE_TOWER), craneArm: CRANE_ARM, craneDrops: validDrops.map(d => ({ x: d.x, y: d.y })),
    belt: strip(BELT), crusher: strip(CRUSHER),
    washTunnel: strip(WASH_TUNNEL), washWalls: WASH_WALLS.map(strip),
    stacks: STACKS.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h, tiers: s.tiers })),
    mazes: [MAZE_NW, MAZE_SE].map(m => ({ x: m.x, y: m.y, size: m.w, inner: m.inner, walls: m.walls.map(strip) })),
    containers: CONTAINERS.map(strip), office: strip(OFFICE),
    mediPads: PADS.filter(p => p.id.startsWith('medi')).map(p => ({ x: p.x, y: p.y })),
    powerPads: PADS.filter(p => p.id.startsWith('power')).map(p => ({ x: p.x, y: p.y })),
    cranePad: { x: PADS.find(p => p.id === 'cranePad').x, y: PADS.find(p => p.id === 'cranePad').y },
    playerStart: PLAYER_START, lawetteRoute: LAWETTE_ROUTE,
    piles: piles.placed.map(r => [r.x, r.y]), hubcaps: hubcaps.placed.map(r => [r.x, r.y]),
};
console.log('\n// ── FROZEN JUNKYARD_LAYOUT (x/y = TOP-LEFT) ──');
console.log(JSON.stringify(out));
process.exit(errors.length === 0 ? 0 : 1);
