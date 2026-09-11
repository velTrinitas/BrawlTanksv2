/**
 * castle_c1_layout.mjs — CASTLE GROUNDS layout generator + AABB math-verify.
 *
 * Run: node tools/castle_c1_layout.mjs
 *
 * Scenario OBRON ZAMEK (Defend the Castle), phase F1. Lesson I1/I7 (map-kit):
 * layout = FROZEN DATA verified offline BEFORE any placement code. CastleMap.ts
 * layouts must be copy-pasted from this script's output and reference this file.
 *
 * Coordinate convention: ALL rects are x/y = TOP-LEFT (ICollidable rule).
 * World 3000x3000, playable [40, 2960]. Castle centre C = (1500,1500).
 *
 * Verifies:
 *  V1 everything inside playable bounds
 *  V2 solid-vs-solid corridors >= CORRIDOR px, except whitelisted touching pairs
 *     (tower<->wall, turret<->gate/wall — they form ONE structure)
 *  V3 zones/pads never intersect solids; pads keep PAD_CLEAR from solids
 *  V4 respawn pocket (keep apron) clear of every solid except the keep itself
 *  V5 (skipped in F1) — no seeded scatter yet; every solid is hand-placed and
 *     covered by V2. Re-enable when small decor props get collision.
 *  V6 enemy route legs (lane -> ring -> bridge -> attack point) never cross a
 *     solid, and cross the moat ONLY through a bridge cut
 *  V7 sector coverage: all 9 sectors of the 3x3 grid carry content
 *  V8 gate/furtka gaps >= 2 * TANK_R + GAP_CLEAR (a tank fits through)
 *  V9 spawn camps >= CAMP_MIN_DIST from castle centre and inside playable
 */

const WORLD = 3000;
const PLAY_MIN = 40, PLAY_MAX = 2960;
const CORRIDOR = 110;        // min free corridor between separate solids (B7)
const ROUTE_CLEAR = 120;     // lane + ring legs keep this from every solid
const APPROACH_CLEAR = 30;   // bridge->gate legs run down the middle of a 150 px gap
const PAD_CLEAR = 120;
const PAD_CLEAR_CASTLE = 50;  // courtyard pads sit inside a 664 px yard — walls are the yard
const TANK_R = 25;           // player/enemy half-size for gap checks
const GAP_CLEAR = 60;
const CAMP_MIN_DIST = 480;

const CX = 1500, CY = 1500;

// ── CASTLE — wall half-size 360, thickness 28, gaps 150 at mid-sides ──
const HALF = 360, T = 28, GAP = 150;
const BRIDGE_W = 188;                     // mosty +25% (uwaga Mariusza) — szersze niz szczelina muru
const B0 = 1500 - BRIDGE_W / 2, B1 = 1500 + BRIDGE_W / 2; // 1406..1594
const TOWER = 84;                         // corner tower AABB (r=46 visual)
const OUT = CX - HALF;                    // 1140 outer edge (west/north)
const IN = CX + HALF;                     // 1860 outer edge (east/south)
const G0 = CX - GAP / 2, G1 = CX + GAP / 2; // 1425..1575 gap span

const TOWERS = [
    { id: 'towerNW', x: OUT - TOWER / 2, y: OUT - TOWER / 2, w: TOWER, h: TOWER },
    { id: 'towerNE', x: IN - TOWER / 2,  y: OUT - TOWER / 2, w: TOWER, h: TOWER },
    { id: 'towerSW', x: OUT - TOWER / 2, y: IN - TOWER / 2,  w: TOWER, h: TOWER },
    { id: 'towerSE', x: IN - TOWER / 2,  y: IN - TOWER / 2,  w: TOWER, h: TOWER },
];
const WALL_START = OUT + TOWER / 2;       // 1182 — segment begins after the tower
const WALL_END = IN - TOWER / 2;          // 1818
const WALLS = [
    // North (y = OUT .. OUT+T)
    { id: 'wallN_W', x: WALL_START, y: OUT, w: G0 - WALL_START, h: T, side: 'N' },
    { id: 'wallN_E', x: G1, y: OUT, w: WALL_END - G1, h: T, side: 'N' },
    // South (y = IN-T .. IN)
    { id: 'wallS_W', x: WALL_START, y: IN - T, w: G0 - WALL_START, h: T, side: 'S' },
    { id: 'wallS_E', x: G1, y: IN - T, w: WALL_END - G1, h: T, side: 'S' },
    // West (x = OUT .. OUT+T)
    { id: 'wallW_N', x: OUT, y: WALL_START, w: T, h: G0 - WALL_START, side: 'W' },
    { id: 'wallW_S', x: OUT, y: G1, w: T, h: WALL_END - G1, side: 'W' },
    // East (x = IN-T .. IN)
    { id: 'wallE_N', x: IN - T, y: WALL_START, w: T, h: G0 - WALL_START, side: 'E' },
    { id: 'wallE_S', x: IN - T, y: G1, w: T, h: WALL_END - G1, side: 'E' },
];
// 4 BRAMY (uwaga Mariusza): kazda zniszczalna, rozsuwana dla gracza, naprawialna.
const GATES = [
    { id: 'gateS', x: G0, y: IN - T, w: GAP, h: T, side: 'S' },
    { id: 'gateN', x: G0, y: OUT, w: GAP, h: T, side: 'N' },
    { id: 'gateW', x: OUT, y: G0, w: T, h: GAP, side: 'W' },
    { id: 'gateE', x: IN - T, y: G0, w: T, h: GAP, side: 'E' },
];
const GATE = GATES[0];
// wiezyczki bramne: para na kazda brame (wzdluz szczeliny), niezniszczalne
const GATE_TURRETS = [
    { id: 'turretS1', x: G0 - 44, y: IN - T - 8, w: 44, h: 44 }, { id: 'turretS2', x: G1, y: IN - T - 8, w: 44, h: 44 },
    { id: 'turretN1', x: G0 - 44, y: OUT - 8, w: 44, h: 44 },   { id: 'turretN2', x: G1, y: OUT - 8, w: 44, h: 44 },
    { id: 'turretW1', x: OUT - 8, y: G0 - 44, w: 44, h: 44 },   { id: 'turretW2', x: OUT - 8, y: G1, w: 44, h: 44 },
    { id: 'turretE1', x: IN - T - 8, y: G0 - 44, w: 44, h: 44 }, { id: 'turretE2', x: IN - T - 8, y: G1, w: 44, h: 44 },
];
const FURTKI = []; // (zastapione 4 bramami)
const KEEP = { id: 'keep', x: 1400, y: 1400, w: 200, h: 200 };
const RESPAWN = { x: 1290, y: 1700, r: 70 };   // podworze SW (z dala od punktow ataku donzonu i padow)
const SANCTUARY = { x: 1210, y: 1620, w: 160, h: 160 };
const COURTYARD = { x: OUT + T, y: OUT + T, w: 2 * HALF - 2 * T, h: 2 * HALF - 2 * T }; // 664x664

// ── MOAT — 90 px strips, 60 px outside the wall (outer edge at half-size 510),
// bridge cuts of GAP at the mid-sides. Passable slow zone (never a solid).
const MOAT_IN = 420, MOAT_OUT = 510, MOAT_W = MOAT_OUT - MOAT_IN;
const MO = CX - MOAT_OUT, MI = CX - MOAT_IN;          // 990 / 1080
const ME = CX + MOAT_IN,  MF = CX + MOAT_OUT;         // 1920 / 2010
const MOAT = [
    { id: 'moatN_W', x: MO, y: MO, w: B0 - MO, h: MOAT_W },
    { id: 'moatN_E', x: B1, y: MO, w: MF - B1, h: MOAT_W },
    { id: 'moatS_W', x: MO, y: ME, w: B0 - MO, h: MOAT_W },
    { id: 'moatS_E', x: B1, y: ME, w: MF - B1, h: MOAT_W },
    { id: 'moatW_N', x: MO, y: MI, w: MOAT_W, h: B0 - MI },
    { id: 'moatW_S', x: MO, y: B1, w: MOAT_W, h: ME - B1 },
    { id: 'moatE_N', x: ME, y: MI, w: MOAT_W, h: B0 - MI },
    { id: 'moatE_S', x: ME, y: B1, w: MOAT_W, h: ME - B1 },
];
const BRIDGES = [
    { id: 'bridgeN', x: B0, y: MO, w: BRIDGE_W, h: MOAT_W },
    { id: 'bridgeS', x: B0, y: ME, w: BRIDGE_W, h: MOAT_W },
    { id: 'bridgeW', x: MO, y: B0, w: MOAT_W, h: BRIDGE_W },
    { id: 'bridgeE', x: ME, y: B0, w: MOAT_W, h: BRIDGE_W },
];

// ── ENEMY ROUTES — ring road r=600 (8 waypoints), lanes, bridges, attack points ──
const RING_R = 600;
const RING = [
    { id: 'ringN',  x: CX, y: CY - RING_R },
    { id: 'ringNE', x: CX + RING_R, y: CY - RING_R },
    { id: 'ringE',  x: CX + RING_R, y: CY },
    { id: 'ringSE', x: CX + RING_R, y: CY + RING_R },
    { id: 'ringS',  x: CX, y: CY + RING_R },
    { id: 'ringSW', x: CX - RING_R, y: CY + RING_R },
    { id: 'ringW',  x: CX - RING_R, y: CY },
    { id: 'ringNW', x: CX - RING_R, y: CY - RING_R },
];
const LANES = [
    { id: 'N', x: 1500, y: 110,  ring: 'ringN' },
    { id: 'E', x: 2890, y: 1500, ring: 'ringE' },
    { id: 'S', x: 1500, y: 2890, ring: 'ringS' },
    { id: 'W', x: 110,  y: 1500, ring: 'ringW' },
];
const BRIDGE_CENTERS = {
    N: { x: CX, y: MO + MOAT_W / 2 },
    S: { x: CX, y: ME + MOAT_W / 2 },
    W: { x: MO + MOAT_W / 2, y: CY },
    E: { x: ME + MOAT_W / 2, y: CY },
};
const ATTACK_OFF = 24;
const ATTACK = {
    gateS: { x: CX, y: IN + ATTACK_OFF + TANK_R },
    gateN: { x: CX, y: OUT - ATTACK_OFF - TANK_R },
    gateW: { x: OUT - ATTACK_OFF - TANK_R, y: CY },
    gateE: { x: IN + ATTACK_OFF + TANK_R, y: CY },
    keepS:   { x: CX, y: KEEP.y + KEEP.h + ATTACK_OFF + TANK_R },
    keepN:   { x: CX, y: KEEP.y - ATTACK_OFF - TANK_R },
    keepW:   { x: KEEP.x - ATTACK_OFF - TANK_R, y: CY },
    keepE:   { x: KEEP.x + KEEP.w + ATTACK_OFF + TANK_R, y: CY },
};
// Spawn camps (decor baked into ground; passable) centred on lane points, clamped.
const SIEGE_DIST = 820;
const SIEGE_POS = {
    N: { x: CX, y: CY - SIEGE_DIST }, S: { x: CX, y: CY + SIEGE_DIST },
    W: { x: CX - SIEGE_DIST, y: CY }, E: { x: CX + SIEGE_DIST, y: CY },
};
const CAMPS = [
    { id: 'campN', x: 1400, y: 50,   w: 200, h: 120 },
    { id: 'campE', x: 2760, y: 1440, w: 200, h: 120 },
    { id: 'campS', x: 1400, y: 2790, w: 200, h: 120 },
    { id: 'campW', x: 40,   y: 1440, w: 200, h: 120 },
];

// ── OUTER SOLIDS — forest blocks, granite boulders, chapel ruin ──
const FORESTS = [
    { id: 'forestNW', x: 300,  y: 300,  w: 260, h: 180 },
    { id: 'forestNE', x: 2440, y: 300,  w: 260, h: 180 },
    { id: 'forestSW', x: 300,  y: 2520, w: 260, h: 180 },
    { id: 'forestSE', x: 2440, y: 2520, w: 260, h: 180 },
    { id: 'forestW2', x: 480,  y: 1960, w: 220, h: 160 },
    { id: 'forestE2', x: 2240, y: 1040, w: 220, h: 160 },
    { id: 'forestS2', x: 1000, y: 2300, w: 220, h: 160 },
    { id: 'forestN2', x: 1780, y: 240,  w: 220, h: 160 },
];
const ROCKS = [
    { id: 'rock1',  x: 640,  y: 640  },
    { id: 'rock2',  x: 2240, y: 640  },
    { id: 'rock3',  x: 640,  y: 2240 },
    { id: 'rock4',  x: 2240, y: 2240 },
    { id: 'rock5',  x: 1120, y: 400  },
    { id: 'rock6',  x: 1760, y: 2480 },
    { id: 'rock7',  x: 400,  y: 1160 },
    { id: 'rock8',  x: 2480, y: 1720 },
    { id: 'rock9',  x: 1160, y: 2600 },
    { id: 'rock10', x: 2120, y: 300  },
    { id: 'rock11', x: 300,  y: 1760 },
    { id: 'rock12', x: 2600, y: 1160 },
].map(r => ({ ...r, w: 120, h: 120 }));
const CHAPEL = { id: 'chapel', x: 2500, y: 600, w: 200, h: 140 };
// Wioska (uwaga Mariusza #9): 3 chatki + studnia (dekor w bake). Chatki sasiaduja ze soba (jedna
// osada) — para whitelisted, ale caly klaster trzyma korytarz od reszty solidow.
const COTTAGES = [
    { id: 'cottage1', x: 720,  y: 100, w: 110, h: 90 },
    { id: 'cottage2', x: 860,  y: 150, w: 110, h: 90 },
    { id: 'cottage3', x: 760,  y: 230, w: 110, h: 90 },
];
const WELL = { id: 'well', x: 900, y: 270, w: 40, h: 40 };   // dekor, passable
// Snopy siana (niszczalne, gemy): male solidy 48x48 w klastrach przy polach/lace.
const HAY = [
    { id: 'hay1', x: 820,  y: 2520 }, { id: 'hay2', x: 880,  y: 2550 },
    { id: 'hay3', x: 2720, y: 1760 }, { id: 'hay4', x: 2780, y: 1800 },
    { id: 'hay5', x: 1180, y: 660 },  { id: 'hay6', x: 1240, y: 700 },
    { id: 'hay7', x: 2080, y: 2560 }, { id: 'hay8', x: 2140, y: 2600 },
].map(h => ({ ...h, w: 48, h: 48 }));

// ── PASSABLE — pads (100x100) and stealth fields ──
const PADS = [
    { id: 'mediCourt',  x: 1230, y: 1230, w: 100, h: 100 },
    { id: 'powerCourt', x: 1670, y: 1670, w: 100, h: 100 },
    { id: 'mediN',      x: 1620, y: 700,  w: 100, h: 100 },
    { id: 'powerS',     x: 1280, y: 2200, w: 100, h: 100 },
];
const STEALTH = [
    { id: 'fieldW', x: 300,  y: 2200, w: 300, h: 220 },
    { id: 'fieldE', x: 2400, y: 820,  w: 300, h: 200 },
];

// ── Collections ──
const CASTLE_SOLIDS = [...TOWERS, ...WALLS, ...GATES, ...GATE_TURRETS, KEEP];
const OUTER_SOLIDS = [...FORESTS, ...ROCKS, CHAPEL, ...COTTAGES, ...HAY];
const SOLIDS = [...CASTLE_SOLIDS, ...OUTER_SOLIDS];
const ENEMY_SOLIDS = [...SOLIDS, ...FURTKI];   // what an enemy cannot pass
const TOUCH_WHITELIST = [
    ["towerNW", "wallN_W"], ["towerNW", "wallW_N"],
    ["towerNE", "wallN_E"], ["towerNE", "wallE_N"],
    ["towerSW", "wallS_W"], ["towerSW", "wallW_S"],
    ["towerSE", "wallS_E"], ["towerSE", "wallE_S"],
    ["gateS", "wallS_W"], ["gateS", "wallS_E"], ["turretS1", "gateS"], ["turretS1", "wallS_W"], ["turretS2", "gateS"], ["turretS2", "wallS_E"],
    ["gateN", "wallN_W"], ["gateN", "wallN_E"], ["turretN1", "gateN"], ["turretN1", "wallN_W"], ["turretN2", "gateN"], ["turretN2", "wallN_E"],
    ["gateW", "wallW_N"], ["gateW", "wallW_S"], ["turretW1", "gateW"], ["turretW1", "wallW_N"], ["turretW2", "gateW"], ["turretW2", "wallW_S"],
    ["gateE", "wallE_N"], ["gateE", "wallE_S"], ["turretE1", "gateE"], ["turretE1", "wallE_N"], ["turretE2", "gateE"], ["turretE2", "wallE_S"],
    ["cottage1", "cottage2"], ["cottage1", "cottage3"], ["cottage2", "cottage3"],
    ["hay1", "hay2"], ["hay3", "hay4"], ["hay5", "hay6"], ["hay7", "hay8"],
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
const inPlayable = (r) =>
    r.x >= PLAY_MIN && r.y >= PLAY_MIN && r.x + r.w <= PLAY_MAX && r.y + r.h <= PLAY_MAX;
const isWhitelisted = (a, b) =>
    TOUCH_WHITELIST.some(([p, q]) => (p === a.id && q === b.id) || (p === b.id && q === a.id));
const inflate = (r, m) => ({ ...r, x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
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
function circleHitsRect(c, r) {
    const px = Math.max(r.x, Math.min(c.x, r.x + r.w));
    const py = Math.max(r.y, Math.min(c.y, r.y + r.h));
    return Math.hypot(px - c.x, py - c.y) < c.r;
}

// ── VERIFY ──
const errors = [];
const all = [...SOLIDS, ...FURTKI, ...MOAT, ...BRIDGES, ...PADS, ...STEALTH, ...CAMPS, SANCTUARY];

// V1 bounds
for (const r of all) if (!inPlayable(r)) errors.push(`V1 ${r.id ?? 'sanctuary'} poza playable`);

// V2 corridors between separate solids
for (let i = 0; i < SOLIDS.length; i++) for (let j = i + 1; j < SOLIDS.length; j++) {
    const a = SOLIDS[i], b = SOLIDS[j];
    if (isWhitelisted(a, b)) continue;
    const c = corridor(a, b);
    if (c < CORRIDOR) errors.push(`V2 ${a.id}<->${b.id} korytarz ${c === -1 ? 'OVERLAP' : Math.round(c)} < ${CORRIDOR}`);
}
// Whitelisted pairs must actually touch or overlap (a structure with a hole is a bug)
for (const [p, q] of TOUCH_WHITELIST) {
    const a = SOLIDS.find(s => s.id === p), b = SOLIDS.find(s => s.id === q);
    if (!a || !b) continue;
    const c = corridor(a, b);
    const cluster = p.startsWith("cottage") || p.startsWith("hay");
    if (c > (cluster ? 60 : 0) && c !== Infinity) errors.push(`V2b ${p}<->${q} luka ${Math.round(c)} px w strukturze`);
}

// V3 passables vs solids
for (const z of [...MOAT, ...BRIDGES, ...STEALTH, ...CAMPS, SANCTUARY, WELL])
    for (const s of SOLIDS) if (overlaps(z, s)) errors.push(`V3 ${z.id ?? 'sanctuary'} nachodzi na ${s.id}`);
for (const p of PADS) for (const s of SOLIDS) {
    const c = corridor(p, s);
    const need = CASTLE_SOLIDS.includes(s) ? PAD_CLEAR_CASTLE : PAD_CLEAR;
    if (c < need) errors.push(`V3 pad ${p.id} za blisko ${s.id} (${c === -1 ? 'OVERLAP' : Math.round(c)})`);
}
for (const p of PADS) for (const m of MOAT) if (overlaps(p, m)) errors.push(`V3 pad ${p.id} w fosie ${m.id}`);

// V4 respawn pocket clear (keep excluded — the apron touches the keep by design)
for (const s of SOLIDS) if (s.id !== 'keep' && circleHitsRect(RESPAWN, s)) errors.push(`V4 respawn koliduje z ${s.id}`);
if (circleHitsRect(RESPAWN, KEEP)) errors.push('V4 respawn wewnatrz donzonu');
for (const [k, p] of Object.entries(ATTACK)) if (Math.hypot(p.x - RESPAWN.x, p.y - RESPAWN.y) < 140) errors.push(`V4 respawn za blisko punktu ataku `);
for (const p of PADS) if (overlaps(p, SANCTUARY)) errors.push(`V4 pad  w sanktuarium`);
if (!overlaps(SANCTUARY, { x: RESPAWN.x - 1, y: RESPAWN.y - 1, w: 2, h: 2 })) errors.push('V4 respawn poza sanktuarium');

// V6 enemy routes
function ringIndex(id) { return RING.findIndex(r => r.id === id); }
const ROUTE_LEGS = [];
for (const lane of LANES) {
    const rp = RING[ringIndex(lane.ring)];
    ROUTE_LEGS.push({ id: `lane${lane.id}->${lane.ring}`, a: lane, b: rp });
}
for (let i = 0; i < RING.length; i++) {
    const a = RING[i], b = RING[(i + 1) % RING.length];
    ROUTE_LEGS.push({ id: `${a.id}->${b.id}`, a, b });
}
const APPROACH = [
    { side: 'S', ring: 'ringS', attack: ATTACK.gateS },
    { side: 'N', ring: 'ringN', attack: ATTACK.gateN },
    { side: 'W', ring: 'ringW', attack: ATTACK.gateW },
    { side: 'E', ring: 'ringE', attack: ATTACK.gateE },
];
for (const ap of APPROACH) {
    const rp = RING[ringIndex(ap.ring)], bc = BRIDGE_CENTERS[ap.side];
    ROUTE_LEGS.push({ id: `${ap.ring}->bridge${ap.side}`, a: rp, b: bc, bridge: ap.side });
    ROUTE_LEGS.push({ id: `bridge${ap.side}->attack${ap.side}`, a: bc, b: ap.attack, bridge: ap.side });
}
for (const leg of ROUTE_LEGS) {
    for (const s of ENEMY_SOLIDS) {
        // attack points sit deliberately 24+25 px in front of gate/furtka: allow those two
        const isTarget = (leg.id.startsWith('bridge') && s.id.startsWith('gate'));
        const clear = isTarget ? 0 : (leg.bridge ? APPROACH_CLEAR : ROUTE_CLEAR);
        if (segHitsRect(leg.a, leg.b, inflate(s, clear))) errors.push(`V6 noga ${leg.id} przecina ${s.id} (+${clear})`);
    }
    for (const m of MOAT) if (segHitsRect(leg.a, leg.b, m)) errors.push(`V6 noga ${leg.id} przecina fose ${m.id} poza mostem`);
}
for (const [k, p] of Object.entries(ATTACK)) {
    for (const s of SOLIDS) if (circleHitsRect({ ...p, r: TANK_R }, s)) errors.push(`V6 punkt ataku ${k} wewnatrz ${s.id}`);
}

// V7 sector coverage (3x3)
const SECTORS = 3, sectorCount = new Array(9).fill(0);
for (const r of [...SOLIDS, ...PADS, ...STEALTH, ...CAMPS]) {
    const sx = Math.min(SECTORS - 1, Math.floor((r.x + r.w / 2) / (WORLD / SECTORS)));
    const sy = Math.min(SECTORS - 1, Math.floor((r.y + r.h / 2) / (WORLD / SECTORS)));
    sectorCount[sy * SECTORS + sx]++;
}
sectorCount.forEach((n, i) => { if (n === 0) errors.push(`V7 sektor ${i} pusty`); });

// V8 gaps
const minGap = 2 * TANK_R + GAP_CLEAR;
for (const g of GATES) {
    const span = Math.max(g.w, g.h);
    if (span < minGap) errors.push(`V8 ${g.id} szczelina ${span} < ${minGap}`);
}

// V9 camps
for (const c of CAMPS) {
    const d = Math.hypot(c.x + c.w / 2 - CX, c.y + c.h / 2 - CY);
    if (d < CAMP_MIN_DIST) errors.push(`V9 ${c.id} za blisko zamku (${Math.round(d)})`);
}

// ── REPORT ──
console.log('=== CASTLE GROUNDS LAYOUT VERIFY (F1) ===');
console.log(errors.length === 0 ? 'PASS — 0 bledow' : `FAIL — ${errors.length} bledow:`);
for (const e of errors) console.log('  ' + e);
let blocked = 0; for (const s of SOLIDS) blocked += s.w * s.h;
console.log(`\nBlocked area: ${(100 * blocked / (WORLD * WORLD)).toFixed(2)}% swiata`);
console.log('Sector coverage (3x3):');
for (let sy = 0; sy < SECTORS; sy++) console.log('  ' + sectorCount.slice(sy * SECTORS, sy * SECTORS + SECTORS).map(n => String(n).padStart(3)).join(' '));

const strip = (arr) => arr.map(({ id, x, y, w, h, side }) => side ? { id, x, y, w, h, side } : { id, x, y, w, h });
console.log('\n// ── FROZEN (x/y = TOP-LEFT) — paste into src/maps/CastleMap.ts ──');
console.log('CASTLE_TOWERS = ' + JSON.stringify(strip(TOWERS)));
console.log('CASTLE_WALLS = ' + JSON.stringify(strip(WALLS)));
console.log('CASTLE_GATES = ' + JSON.stringify(GATES));
console.log('CASTLE_SIEGE_POS = ' + JSON.stringify(SIEGE_POS));
console.log('CASTLE_GATE_TURRETS = ' + JSON.stringify(strip(GATE_TURRETS)));
console.log('CASTLE_FURTKI = ' + JSON.stringify(strip(FURTKI)));
console.log('CASTLE_KEEP = ' + JSON.stringify(strip([KEEP])[0]));
console.log('CASTLE_RESPAWN = ' + JSON.stringify(RESPAWN));
console.log('CASTLE_SANCTUARY = ' + JSON.stringify(SANCTUARY));
console.log('CASTLE_COURTYARD = ' + JSON.stringify(COURTYARD));
console.log('CASTLE_MOAT = ' + JSON.stringify(strip(MOAT)));
console.log('CASTLE_BRIDGES = ' + JSON.stringify(strip(BRIDGES)));
console.log('CASTLE_RING = ' + JSON.stringify(RING));
console.log('CASTLE_LANES = ' + JSON.stringify(LANES));
console.log('CASTLE_BRIDGE_CENTERS = ' + JSON.stringify(BRIDGE_CENTERS));
console.log('CASTLE_ATTACK = ' + JSON.stringify(ATTACK));
console.log('CASTLE_CAMPS = ' + JSON.stringify(strip(CAMPS)));
console.log('CASTLE_FORESTS = ' + JSON.stringify(strip(FORESTS)));
console.log('CASTLE_ROCKS = ' + JSON.stringify(strip(ROCKS)));
console.log('CASTLE_CHAPEL = ' + JSON.stringify(strip([CHAPEL])[0]));
console.log('CASTLE_COTTAGES = ' + JSON.stringify(strip(COTTAGES)));
console.log('CASTLE_WELL = ' + JSON.stringify(strip([WELL])[0]));
console.log('CASTLE_HAY = ' + JSON.stringify(strip(HAY)));
console.log('CASTLE_PADS = ' + JSON.stringify(strip(PADS)));
console.log('CASTLE_STEALTH = ' + JSON.stringify(strip(STEALTH)));
process.exit(errors.length === 0 ? 0 : 1);
