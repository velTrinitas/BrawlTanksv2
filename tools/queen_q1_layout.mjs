/**
 * queen_q1_layout.mjs — DUNGEON ("LOCHY") layout generator + AABB math-verify. Run: node tools/queen_q1_layout.mjs
 *
 * Scenario SAVE THE QUEEN. Lesson I1/I7 (map-kit): layout = FROZEN DATA verified offline BEFORE
 * placement code; DungeonMap.ts copies the output and references this file.
 *
 * v4 (Q2, 2. playtest Mariusza 2026-09-11): "dobudowac mur od N i S" -> front 10 kol x 14 rz
 * (2 rzedy nad i 2 pod v3), skrzydla N/S 3x5, skala E 1108..1892; wewnetrzne gejzery przesuniete
 * na y 985/2015 (V3 gap>=20 do muru), trasy N/S omijaja mur przez (1860,1040)/(1860,1960).
 * v3 (Q2, playtest Mariusza 2026-09-11): "muru 10x wiecej, zero stali". Cela 3x4 w ZELAZNEJ KLATCE
 * (cienkie prety = kolizja w DungeonBorder, art w bake); jedyne wejscie = brama W (rzedy 4-5)
 * zamknieta PODWOJNYM Zwornikiem (powiazane: pekniecie jednego = oba); przed cela front
 * 10 kol x 10 rz cegiel + skrzydla N/S 3x2 nad/pod cela (masa muru); tyl E = skala.
 * Wiezienie na WSCHODZIE, zachod = komnata z 8 kolumnami, cienka ramka 60 px (v2).
 *
 * All rects x/y = TOP-LEFT (ICollidable rule). Checks:
 *  V1 bounds  V2 solid-solid corridor >= CORRIDOR  V3 zones/pads vs solids + pad clearance
 *  V4 spawn pocket  V6 enemy routes never cross solids / lava off-bridge  V7 3x3 sector coverage
 *  V8 corridor height  V10 cela osiagalna TYLKO przez brame ze Zwornikami (klatka N/S/W + skala E)
 */
const PX0 = 60, PX1 = 2940, PY0 = 60, PY1 = 2940;
const CORRIDOR = 110, PAD_CLEAR = 120, TANK_R = 25, GAP_CLEAR = 60, ROUTE_CLEAR = 60, B = 56;

// ── PRISON (E) ──
const CELL = { id: 'cell', x: 2544, y: 1388, w: 168, h: 224 };
const ROCK_E = { id: 'rockE', x: 2712, y: 1108, w: PX1 - 2712, h: 784 };
const FRONT = { x0: 1984, y0: 1108, cols: 10, rows: 14, keyCol: 9, keyRows: [6, 7], barRows: [5, 8] }; // v4: kol 9 = przy celi, brama rz 6-7
const WINGS = [{ id: 'wingN', x: 2544, y: 1108, w: 168, h: 280 }, { id: 'wingS', x: 2544, y: 1612, w: 168, h: 280 }];
const CAGE = [
    { id: 'cageN', x: 2532, y: 1376, w: 180, h: 12 }, { id: 'cageS', x: 2532, y: 1612, w: 180, h: 12 },
    { id: 'cageW1', x: 2532, y: 1376, w: 12, h: 68 }, { id: 'cageW2', x: 2532, y: 1556, w: 12, h: 68 },
];
const bricks = [];
for (let r = 0; r < FRONT.rows; r++) for (let c = 0; c < FRONT.cols; c++) {
    if (c === FRONT.keyCol && FRONT.barRows.includes(r)) continue; // pret klatki
    const kind = c === FRONT.keyCol && FRONT.keyRows.includes(r) ? 'keystone' : 'brick';
    bricks.push({ id: `b${r}${c}`, x: FRONT.x0 + c * B, y: FRONT.y0 + r * B, w: B, h: B, row: r, col: c, kind });
}
let wingCount = 0; for (const w of WINGS) wingCount += (w.w / B) * (w.h / B);
const DYN_POOL = bricks.filter(b => b.kind === 'brick' && b.col < FRONT.keyCol).map(b => b.id);
const ANNEX_COLS = 2; // Q5: kolumny dobudowy Budowniczych przed frontem
const PRISON = { id: 'prison', x: FRONT.x0 - ANNEX_COLS * B, y: FRONT.y0, w: PX1 - FRONT.x0 + ANNEX_COLS * B, h: FRONT.rows * B };

// ── LAVA + BRIDGES + GEYSERS ──
const LAVA = [
    { id: 'lavaN', x: 1900, y: 600, w: 600, h: 360 }, { id: 'lavaS', x: 1900, y: 2040, w: 600, h: 360 },
    { id: 'lavaNW', x: 400, y: 500, w: 240, h: 200 }, { id: 'lavaSW', x: 400, y: 2300, w: 240, h: 200 },
];
const BRIDGES = [{ id: 'bridgeN', x: 2100, y: 600, w: 188, h: 360 }, { id: 'bridgeS', x: 2100, y: 2040, w: 188, h: 360 }];
const GEYSERS = [{ id: 'gN_in', x: 2194, y: 985 }, { id: 'gS_in', x: 2194, y: 2015 }, { id: 'gN_out', x: 2194, y: 540 }, { id: 'gS_out', x: 2194, y: 2460 }];

// ── KOMNATA: kolumnada 8 filarow 70x70 ──
const PILLARS = [[800, 1150], [1050, 1150], [1300, 1150], [1550, 1150], [800, 1780], [1050, 1780], [1300, 1780], [1550, 1780]]
    .map((p, i) => ({ id: `pillar${i}`, x: p[0], y: p[1], w: 70, h: 70 }));

// ── ZLOWROGA WIEZA (Q4.5, decyzja Mariusza): solid w centrum kolumnady, strzela zielonym ogniem ──
const TOWER = { id: 'tower', x: 1165, y: 1455, w: 90, h: 90 };
// szpaler startowy + boss czekaja w kolumnadzie; Budowniczowie startuja przy murze
const RANK = [[950, 1350], [1200, 1320], [1450, 1350], [950, 1650], [1450, 1650], [1200, 1690]];
// (BUILDERS0 usuniete w POLISH-1 — Budowniczowie wycieci, mur odrasta sam)
// Q4.6: ZLOTY KLUCZ — kandydaci "samotnych" miejsc (worldRng wybiera 1); STALOWE DRZWI celi za Zwornikami
const KEY_SPOTS = [[180, 220], [2820, 220], [180, 2780], [2820, 2780], [1500, 330], [1500, 2670], [640, 1500], [1720, 760], [1720, 2240]];
const KEY_DOOR = { id: 'keyDoor', x: 2532, y: 1444, w: 12, h: 112 };
// Q6: punkty spawnu raiderow — kraty (4) + wnetrze czesci CENTRALNEJ i WSCHODNIEJ (Mariusz); zachod = strefa gracza
const SPAWN_SPOTS = [[1500, 140], [1500, 2860], [2760, 140], [2760, 2860], [1000, 900], [1400, 700], [1800, 400], [1000, 2100], [1400, 2300], [1800, 2600], [2300, 400], [2300, 2600], [1700, 1300], [1700, 1700], [2650, 900], [2650, 2100]];

// ── PADS (srodek) / SPAWN / LANES / QUEEN ──
const MEDI = [{ id: 'mediN', x: 900, y: 700 }, { id: 'mediS', x: 900, y: 2300 }];
const POWER = { id: 'power', x: 1500, y: 1500 };
const SPAWN = { x: 300, y: 1500 };
const LANES = [{ id: 'N', x: 1500, y: 140 }, { id: 'S', x: 1500, y: 2860 }, { id: 'NE', x: 2760, y: 140 }, { id: 'SE', x: 2760, y: 2860 }];
const QUEEN = { x: 2628, y: 1500 };
const HEART = { x: 1790, y: 1500 };
const ROUTES = [
    ['N', [1500, 140], [2194, 540], [2194, 985], [1740, 1040], [1740, 1500]], ['S', [1500, 2860], [2194, 2460], [2194, 2015], [1740, 1960], [1740, 1500]],
    ['NE', [2760, 140], [2194, 540], [2194, 985], [1740, 1040], [1740, 1500]], ['SE', [2760, 2860], [2194, 2460], [2194, 2015], [1740, 1960], [1740, 1500]],
];

// ── helpers ──
const err = [];
const inter = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const gap = (a, b) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const padRect = (p, s = 80) => ({ id: p.id, x: p.x - s / 2, y: p.y - s / 2, w: s, h: s });
const seg = (x1, y1, x2, y2, r) => { for (let t = 0; t <= 1; t += 0.01) { const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true; } return false; };
const SOLIDS = [PRISON, ...PILLARS, TOWER];
const ALL = [PRISON, ...PILLARS, TOWER, ...LAVA, ...BRIDGES, padRect(POWER), ...MEDI.map(p => padRect(p))];

for (const r of ALL) if (r.x < PX0 || r.y < PY0 || r.x + r.w > PX1 || r.y + r.h > PY1) err.push(`V1 ${r.id} out of playable`);
for (const p of [...LANES, SPAWN, HEART]) if (p.x < PX0 + 60 || p.x > PX1 - 60 || p.y < PY0 + 60 || p.y > PY1 - 60) err.push(`V1 point ${p.id ?? 'spawn'} too close to border`);
for (let i = 0; i < SOLIDS.length; i++) for (let j = i + 1; j < SOLIDS.length; j++) { const g = gap(SOLIDS[i], SOLIDS[j]); if (g < CORRIDOR) err.push(`V2 ${SOLIDS[i].id}<->${SOLIDS[j].id} gap ${g} < ${CORRIDOR}`); }
for (const z of LAVA) for (const s of SOLIDS) if (inter(z, s)) err.push(`V3 ${z.id} overlaps ${s.id}`);
for (const g of GEYSERS) for (const s of SOLIDS) if (gap({ x: g.x - 90, y: g.y - 90, w: 180, h: 180 }, s) < 20) err.push(`V3 geyser ${g.id} touches ${s.id}`);
for (const [x, y] of SPAWN_SPOTS) for (const g of GEYSERS) if (Math.hypot(x - g.x, y - g.y) < 150) err.push(`V11 spawn spot ${x},${y} on geyser ${g.id}`);
for (const br of BRIDGES) { const host = LAVA.find(l => inter(l, br)); if (!host) err.push(`V3 ${br.id} not in lava`); else if (br.y > host.y || br.y + br.h < host.y + host.h) err.push(`V3 ${br.id} does not span ${host.id}`); }
for (const p of [POWER, ...MEDI]) { const pr = padRect(p); for (const s of SOLIDS) if (gap(pr, s) < PAD_CLEAR) err.push(`V3 pad ${p.id} within ${PAD_CLEAR} of ${s.id}`); for (const z of LAVA) if (inter(grow(pr, 60), z)) err.push(`V3 pad ${p.id} touches ${z.id}`); }
for (const l of LAVA) if (inter(padRect({ id: 's', ...SPAWN }, 120), l)) err.push('V3 spawn touches lava');
if (gap(padRect({ id: 'h', ...HEART }, 44), PRISON) < 10) err.push('V3 heart spawn inside prison');
for (const s of SOLIDS) if (gap(padRect({ id: 's', ...SPAWN }, 60), s) < 200) err.push(`V4 spawn pocket near ${s.id}`);
// V11: pozycje startowe szpaleru/Budowniczych nie w solidach (+ margines czolgu) i nie w lawie
for (const [x, y] of [...RANK, ...KEY_SPOTS, ...SPAWN_SPOTS]) { const r = { id: 'p', x: x - 30, y: y - 30, w: 60, h: 60 }; for (const sd of SOLIDS) if (inter(r, grow(sd, 20))) err.push(`V11 start pos ${x},${y} in ${sd.id}`); for (const l of LAVA) if (inter(r, l)) err.push(`V11 start pos ${x},${y} in lava`); }
for (const [id, ...pts] of ROUTES) for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    for (const s of SOLIDS) if (seg(x1, y1, x2, y2, grow(s, ROUTE_CLEAR))) err.push(`V6 route ${id} leg ${i} crosses ${s.id}`);
    for (const l of LAVA) if (seg(x1, y1, x2, y2, l) && !BRIDGES.some(b => seg(x1, y1, x2, y2, b) && !seg(x1, y1, x2, y2, { x: l.x, y: l.y, w: b.x - l.x, h: l.h }) && !seg(x1, y1, x2, y2, { x: b.x + b.w, y: l.y, w: l.x + l.w - b.x - b.w, h: l.h }))) err.push(`V6 route ${id} leg ${i} wades ${l.id} off-bridge`);
}
const sect = Array(9).fill(0);
const mark = (x, y) => { sect[Math.min(2, Math.floor((y - PY0) / ((PY1 - PY0) / 3))) * 3 + Math.min(2, Math.floor((x - PX0) / ((PX1 - PX0) / 3)))]++; };
for (const r of ALL) mark(r.x + r.w / 2, r.y + r.h / 2); for (const p of [...LANES, ...GEYSERS, SPAWN]) mark(p.x, p.y);
sect.forEach((n, i) => { if (!n) err.push(`V7 sector ${i} empty`); });
if (2 * B < 2 * TANK_R + GAP_CLEAR) err.push(`V8 2 bricks ${2 * B} < ${2 * TANK_R + GAP_CLEAR}`);
// V10: do celi prowadzi TYLKO brama (keyRows) — reszta obwodu celi = klatka (kolizja) lub skala
const gateRows = FRONT.keyRows;
if (gateRows.length !== 2 || gateRows[1] - gateRows[0] !== 1) err.push('V10 gate must be 2 adjacent rows');
for (const r of gateRows) if (!bricks.some(b => b.row === r && b.col === FRONT.keyCol && b.kind === 'keystone')) err.push(`V10 gate row ${r} has no keystone`);
const gateX = FRONT.x0 + FRONT.keyCol * B + B; // lico celi
for (const r of FRONT.barRows) if (!CAGE.some(cg => cg.x <= gateX && cg.x + cg.w >= gateX && cg.y <= FRONT.y0 + r * B && cg.y + cg.h >= FRONT.y0 + r * B + B)) err.push(`V10 bar row ${r} not covered by cage`);
if (!CAGE.some(cg => cg.y + cg.h <= CELL.y && cg.x <= CELL.x && cg.x + cg.w >= CELL.x + CELL.w)) err.push('V10 cage N missing');
if (!CAGE.some(cg => cg.y >= CELL.y + CELL.h && cg.x <= CELL.x && cg.x + cg.w >= CELL.x + CELL.w)) err.push('V10 cage S missing');
for (const w of WINGS) if (w.x > CELL.x || w.x + w.w < ROCK_E.x) err.push(`V10 ${w.id} does not span cell->rock`);
if (ROCK_E.y > WINGS[0].y || ROCK_E.y + ROCK_E.h < WINGS[1].y + WINGS[1].h) err.push('V10 rock E shorter than wings');
if (KEY_DOOR.y !== FRONT.y0 + FRONT.keyRows[0] * B || KEY_DOOR.h !== FRONT.keyRows.length * B) err.push('V10 key door does not cover gate rows');
if (ROCK_E.x > CELL.x + CELL.w || ROCK_E.y > CELL.y || ROCK_E.y + ROCK_E.h < CELL.y + CELL.h) err.push('V10 rock E does not seal cell');
const gateH = gateRows.length * B; if (gateH < 2 * TANK_R + GAP_CLEAR) err.push(`V10 gate height ${gateH} < ${2 * TANK_R + GAP_CLEAR}`);

const minBricks = FRONT.cols * 2 - 2, hits = Math.ceil(minBricks * 300 / 100);
console.log('=== DUNGEON LAYOUT VERIFY (v4 — klatka + mur 10x14 + skrzydla 3x5) ===');
console.log(err.length ? `FAIL — ${err.length} bledow:\n  ` + err.join('\n  ') : 'PASS — 0 bledow');
console.log(`slots: front ${bricks.length} (keystones 2) + wings ${wingCount} = ${bricks.length + wingCount}; dynamite pool ${DYN_POOL.length}`);
console.log(`min path ${minBricks} bricks + 2 keystones = ${hits} hits Twardy (100 dmg / 400 ms, brickHp 300) ≈ ${(hits * 0.4).toFixed(0)} s clean fire`);
console.log('sectors 3x3:', sect.slice(0, 3), sect.slice(3, 6), sect.slice(6));
console.log('\n// FROZEN (x/y = TOP-LEFT) — paste into src/maps/DungeonMap.ts');
const out = { TOWER, RANK, KEY_SPOTS, KEY_DOOR, SPAWN_SPOTS, PLAYABLE: { x: PX0, y: PY0, w: PX1 - PX0, h: PY1 - PY0 }, CELL, ROCK_E, FRONT, WINGS, CAGE, DYN_POOL, LAVA, BRIDGES, GEYSERS, PILLARS, MEDI, POWER, SPAWN, LANES, QUEEN, HEART };
for (const [k, v] of Object.entries(out)) console.log(`${k} = ${JSON.stringify(v)}`);
process.exit(err.length ? 1 : 0);
