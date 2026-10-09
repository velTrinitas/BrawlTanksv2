import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * JunkyardMap.ts — map definitions for ZLOMOWISKO (junkyard), KTB map.
 *
 * FAZA ZLOMOWISKO J0+J1 (plan 2026-10-08, docs/map-kit/JUNKYARD_CONTRACT.md):
 * - Three value layers (anti-noise rule): GROUND low saturation ochre/grey-brown -> DECOR faded
 *   pastels (wrecks, tires, containers) -> INTERACTION high contrast (yellow-black stripes, red
 *   beacons, foam cyan). Never: player tank colours, boss violet, gold (Enigma identity).
 * - buildJunkyardTexture: baked ONCE (3000x3000), seeded mulberry32 (kit rule U1) — packed earth,
 *   gravel grain, oil stains, tire tracks, concrete apron around the press, yard asphalt lanes and
 *   loose hubcap decals live IN THE BAKE (zero runtime cost, same pattern as Mars/Agro v2).
 * - Layout exports FROZEN from tools/junkyard_j0_layout.mjs (AABB math-verify PASS, 0 errors).
 *   Do NOT hand-edit coordinates — change the script, re-run, re-paste.
 *   Convention: x/y = TOP-LEFT everywhere in this file (ICollidable rule).
 *
 * Light: sun NW (same as every map): highlights on N/W edges, cast shadows SE.
 */

// =================================================================
// PALETTE — single source of truth (border/props import this)
// =================================================================

export const JUNKYARD_PALETTE = Object.freeze({
    earth:       '#9a7f5c', // packed earth base (warm ochre, low saturation)
    earthDark:   '#7d6548', // tonal variation / tire grooves
    earthLight:  '#b3966e', // sunlit patches
    gravel:      '#8c8275', // grey grit
    asphalt:     '#5e5a54', // yard lanes
    asphaltLine: '#b9b1a2', // faded lane paint
    concrete:    '#a7a39a', // press apron slab
    concreteDk:  '#7f7b73', // slab cracks / joints
    oil:         '#2d2a2e', // oil stains (violet-black, NOT pure black)
    rust:        '#9a4f2a', // rust accents (decor)
    rustDark:    '#5e2f1a',
    chrome:      '#e8ecef', // chrome = silver-white (never gold)
    hazardY:     '#f2c230', // INTERACTION only: hazard stripes
    hazardK:     '#1d1b1a',
    beaconRed:   '#e63b2e', // INTERACTION only: machine beacons
    foam:        '#5fd3d9', // INTERACTION only: car wash foam
    shadow:      '#3b3129', // cast shadow tint (warm dark)
});

/** Numeric mirror for PIXI props (same colours, one source of truth). */
export const JUNKYARD_HEX = Object.freeze({
    earth:       0x9a7f5c,
    earthDark:   0x7d6548,
    earthLight:  0xb3966e,
    gravel:      0x8c8275,
    asphalt:     0x5e5a54,
    concrete:    0xa7a39a,
    concreteDk:  0x7f7b73,
    oil:         0x2d2a2e,
    rust:        0x9a4f2a,
    rustDark:    0x5e2f1a,
    steel:       0x8a9099, // machine bodies (grey-blue steel)
    steelDark:   0x555b63,
    steelLight:  0xc3c9cf,
    chrome:      0xe8ecef,
    hazardY:     0xf2c230,
    hazardK:     0x1d1b1a,
    beaconRed:   0xe63b2e,
    foam:        0x5fd3d9,
    tire:        0x2b2b2b,
    tireLight:   0x4a4a4a,
    tireText:    0xd8d8d8,
    shadow:      0x3b3129,
    // DECOR layer: 12 car colours for wrecks (tint of ONE grey atlas). REV 4 (playtest: "kolory za jednorodne").
    // Slightly dusty, none is a tank colour at full saturation. Order = JUNKYARD_WRECK_TINTS.
    wreck0:      0xd9433a, // red
    wreck1:      0x3f6fd0, // blue
    wreck2:      0xe8c63a, // yellow
    wreck3:      0xececea, // white
    wreck4:      0x4b5057, // graphite black
    wreck5:      0x3f9a4f, // green
    wreck6:      0xe8792e, // orange
    wreck7:      0xb9c1c8, // silver
    wreck8:      0x2fa8a0, // teal
    wreck9:      0x8e2a3c, // burgundy
    wreck10:     0x8a5a3a, // brown
    wreck11:     0x7a4fb0, // purple
});

export const JUNKYARD_WRECK_TINTS: ReadonlyArray<number> = [
    JUNKYARD_HEX.wreck0, JUNKYARD_HEX.wreck1, JUNKYARD_HEX.wreck2, JUNKYARD_HEX.wreck3,
    JUNKYARD_HEX.wreck4, JUNKYARD_HEX.wreck5, JUNKYARD_HEX.wreck6, JUNKYARD_HEX.wreck7,
    JUNKYARD_HEX.wreck8, JUNKYARD_HEX.wreck9, JUNKYARD_HEX.wreck10, JUNKYARD_HEX.wreck11,
];

/** Global light direction — sun upper-left, shadows offset SE (same as all maps). */
export const JUNKYARD_LIGHT = Object.freeze({
    shX: 6,
    shY: 6,
    highlightAlpha: 0.22,
    shadowAlpha: 0.25,
});

/**
 * REV 3: each 200x140 stack SLOT from the verified layout holds a CLUSTER of three small 80x56 piles (tank-sized,
 * "one measure for everything"). Offsets inside the slot; the cluster stays inside the slot, so J0 verification holds.
 */
export const JUNKYARD_STACK_CLUSTER: ReadonlyArray<{ dx: number; dy: number; tiers: number }> = [
    { dx: 0, dy: 0, tiers: 3 }, { dx: 114, dy: 6, tiers: 2 }, { dx: 54, dy: 80, tiers: 3 },
];

// =================================================================
// Deterministic RNG (mulberry32) — stable bake across map re-entry (U1)
// =================================================================
function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return function (): number {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// =================================================================
// FROZEN LAYOUT — pasted from tools/junkyard_j0_layout.mjs (PASS, 0 errors)
// =================================================================

export interface JyRect { x: number; y: number; w: number; h: number; }

export const JUNKYARD_LAYOUT = Object.freeze({
    /** Press bed = PASSABLE hazard zone (J3). Pistons around it are solids. */
    pressBed: { x: 1356, y: 1404, w: 288, h: 192 } as JyRect, // REV 5 (playtest): -20%, centred on (1500,1500)
    pressPistons: [
        { x: 1316, y: 1364, w: 40, h: 40 }, { x: 1676, y: 1364, w: 40, h: 40 },
        { x: 1316, y: 1596, w: 40, h: 40 }, { x: 1676, y: 1596, w: 40, h: 40 },
    ] as ReadonlyArray<JyRect>,
    craneTower: { x: 1440, y: 440, w: 120, h: 120 } as JyRect,
    craneArm: 520,
    /** Verified drop points (J4): each keeps 60 px from every solid / zone / pad. */
    craneDrops: [{ x: 1920, y: 500 }, { x: 1797, y: 797 }, { x: 1500, y: 920 }, { x: 1203, y: 203 }, { x: 1797, y: 203 }],
    /** Conveyor belt = PASSABLE (moves whatever stands on it, J5). Crusher is a solid. */
    belt: { x: 1718, y: 1440, w: 882, h: 120 } as JyRect, // REV 5 (playtest): joined to the press (E pistons end at 1716)
    crusher: { x: 2600, y: 1400, w: 160, h: 200 } as JyRect,
    /** Car wash: tunnel is PASSABLE (stealth, J2); the two walls are solids. */
    washTunnel: { x: 540, y: 1425, w: 300, h: 150 } as JyRect, // REV 2 (playtest): mniejsza
    washWalls: [{ x: 512, y: 1397, w: 28, h: 28 }, { x: 840, y: 1397, w: 28, h: 28 }, { x: 512, y: 1575, w: 28, h: 28 }, { x: 840, y: 1575, w: 28, h: 28 }, { x: 656, y: 1391, w: 68, h: 30 }] as ReadonlyArray<JyRect>, // REV 8: 4 slupy wiaty + agregat (FoamStation liczy to samo z washTunnel)
    /** Wreck stacks (solids). Inner ring of four = cover around the press. */
    stacks: [
        { x: 1000, y: 1000, w: 200, h: 140, tiers: 3 }, { x: 1800, y: 1000, w: 200, h: 140, tiers: 4 },
        { x: 1000, y: 1860, w: 200, h: 140, tiers: 2 }, { x: 1800, y: 1860, w: 200, h: 140, tiers: 3 },
        { x: 200, y: 1980, w: 200, h: 140, tiers: 3 }, { x: 2560, y: 1760, w: 200, h: 140, tiers: 2 },
        { x: 2600, y: 620, w: 200, h: 140, tiers: 3 }, { x: 1000, y: 2560, w: 200, h: 140, tiers: 4 },
    ] as ReadonlyArray<JyRect & { tiers: number }>,
    /** Tire mazes: walls are solids, `inner` = stealth zone (J2). */
    mazes: [
        // REV 4 (playtest 2026-10-08): strefa opon za duza -> 320 px (wnetrze 220x220 = ~4 czolgi), przerwy 100 px
        {
            x: 380, y: 380, size: 320, inner: { x: 430, y: 430, w: 220, h: 220 },
            walls: [
                { x: 380, y: 380, w: 320, h: 50 }, { x: 380, y: 650, w: 110, h: 50 }, { x: 590, y: 650, w: 110, h: 50 },
                { x: 380, y: 430, w: 50, h: 220 }, { x: 650, y: 430, w: 50, h: 60 }, { x: 650, y: 590, w: 50, h: 60 },
            ],
        },
        {
            x: 2300, y: 2300, size: 320, inner: { x: 2350, y: 2350, w: 220, h: 220 },
            walls: [
                { x: 2300, y: 2300, w: 110, h: 50 }, { x: 2510, y: 2300, w: 110, h: 50 }, { x: 2300, y: 2570, w: 320, h: 50 },
                { x: 2300, y: 2350, w: 50, h: 60 }, { x: 2300, y: 2510, w: 50, h: 60 }, { x: 2570, y: 2350, w: 50, h: 220 },
            ],
        },
    ] as ReadonlyArray<{ x: number; y: number; size: number; inner: JyRect; walls: ReadonlyArray<JyRect> }>,
    /** Open containers (solids in J1; stealth inside from J2). Door on the S side. */
    containers: [{ x: 2200, y: 400, w: 180, h: 100 }, { x: 2500, y: 400, w: 180, h: 100 }] as ReadonlyArray<JyRect>,
    /** Scrap office (solid) — megaphone roof for "Wyprzedaz czesci" (J6). */
    office: { x: 640, y: 2380, w: 220, h: 140 } as JyRect,
    mediPads: [{ x: 420, y: 1120 }, { x: 2540, y: 1120 }, { x: 1500, y: 2200 }],
    powerPads: [{ x: 420, y: 2300 }, { x: 1900, y: 2300 }],
    /** Crane console pad (J4). */
    cranePad: { x: 1220, y: 560 },
    /** Player starts in the south; the whole 240 px circle is clear (V4). */
    playerStart: { x: 1500, y: 2600 },
    /** Tow-truck loop on the outer lane (J6), verified clear (V6). */
    lawetteRoute: [{ x: 1500, y: 2860 }, { x: 2860, y: 2860 }, { x: 2860, y: 140 }, { x: 140, y: 140 }, { x: 140, y: 2860 }],
    /** REV 2 (playtest 2026-10-08): kupki zlomu USUNIETE — czytaly sie jak kratki i blokowaly ruch. */
    piles: [] as ReadonlyArray<[number, number]>,
    /** Hubcap decals (24x24, passable, baked into the ground), seed 0x4a594b32. */
    hubcaps: [[1476, 1586], [1002, 219], [1970, 2169], [332, 859], [2390, 223], [696, 126], [2520, 1327], [2113, 1668], [1993, 2796], [155, 737], [2471, 2666], [916, 1736], [2343, 1131], [1872, 2627], [507, 1239], [1851, 1627], [589, 998], [2069, 1234], [2317, 1403], [1113, 1279], [753, 608], [1953, 926], [2713, 2113], [227, 1333], [1692, 1970], [176, 2444], [1107, 2188], [2762, 2425], [1416, 2131], [513, 2344], [804, 1231], [1212, 749], [1013, 704], [2847, 1764], [2758, 1087], [390, 1627], [1169, 266], [2831, 884], [2714, 556], [408, 1001]] as ReadonlyArray<[number, number]>,
});

// =================================================================
// buildJunkyardTexture — baked once, cached in PIXI.Texture (groundTextureCache)
// =================================================================

export function buildJunkyardTexture(): PIXI.Texture {
    const t0 = performance.now();
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    const rng = makeRng(0x4a594152); // "JYAR"
    const P = JUNKYARD_PALETTE;
    const L = JUNKYARD_LAYOUT;

    // ── 1. Packed earth base ──
    c.fillStyle = P.earth;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // ── 2. Wide tonal patches (dust blown into corners, damp spots) ──
    for (let i = 0; i < 120; i++) {
        c.save();
        c.globalAlpha = 0.05 + rng() * 0.06;
        c.fillStyle = rng() < 0.5 ? P.earthDark : P.earthLight;
        c.beginPath();
        c.ellipse(rng() * WORLD_W, rng() * WORLD_H, 120 + rng() * 320, 80 + rng() * 220, rng() * Math.PI, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // ── 3. Noon sun: faint NW warmth -> SE cooler shadow (very subtle; noon, not dawn) ──
    const sun = c.createLinearGradient(0, 0, WORLD_W, WORLD_H);
    sun.addColorStop(0.0, 'rgba(255,236,200,0.16)');
    sun.addColorStop(0.5, 'rgba(255,236,200,0.02)');
    sun.addColorStop(1.0, 'rgba(59,49,41,0.14)');
    c.fillStyle = sun;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // ── 4. Gravel grain (two offset tiles — cheap uniform grit, no visible repetition) ──
    drawGrain(c, rng);

    // ── 5. Yard lanes (asphalt) — a cross through the yard + ring, lanes avoid the press apron ──
    drawLanes(c, rng);

    // ── 6. Concrete apron around the press (lighter slab with joints) — reads as "machine floor" ──
    drawApron(c, rng, L.pressBed);

    // ── 7. Oil stains (where machines and wrecks stood) ──
    drawOilStains(c, rng);

    // ── 8. Tire tracks (lore: forklifts and the tow truck) ──
    drawTireTracks(c, rng);

    // ── 9. Hubcap decals (chrome = silver-white; small, low alpha so they never read as pickups) ──
    for (const [hx, hy] of L.hubcaps) drawHubcap(c, hx + 12, hy + 12, rng);

    // ── 10. Edge vignette ──
    const V = 380;
    const vign = (x0: number, y0: number, x1: number, y1: number) => {
        const g = c.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(59,49,41,0.22)');
        g.addColorStop(1, 'rgba(59,49,41,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, WORLD_W, WORLD_H);
    };
    vign(0, 0, V, 0); vign(WORLD_W, 0, WORLD_W - V, 0);
    vign(0, 0, 0, V); vign(0, WORLD_H, 0, WORLD_H - V);

    console.log(`[JunkyardMap] ground bake: ${(performance.now() - t0).toFixed(1)} ms`);
    return PIXI.Texture.from(cv);
}

function makeGrainTile(size: number, specks: number, tones: string[], aMin: number, aMax: number, sMin: number, sMax: number, rng: () => number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const g = cv.getContext('2d')!;
    for (let i = 0; i < specks; i++) {
        const x = rng() * size, y = rng() * size;
        const w = sMin + rng() * (sMax - sMin), h = w * (0.6 + rng() * 0.7);
        g.globalAlpha = aMin + rng() * (aMax - aMin);
        g.fillStyle = tones[(rng() * tones.length) | 0];
        const oxs = x + w > size ? [0, -size] : [0];
        const oys = y + h > size ? [0, -size] : [0];
        for (const ox of oxs) for (const oy of oys) g.fillRect(x + ox, y + oy, w, h);
    }
    return cv;
}

function drawGrain(c: CanvasRenderingContext2D, rng: () => number): void {
    const P = JUNKYARD_PALETTE;
    const fine = makeGrainTile(512, 4800, [P.earthLight, P.gravel, P.earthDark], 0.05, 0.13, 0.8, 1.8, rng);
    const coarse = makeGrainTile(384, 1300, [P.gravel, P.earthDark, P.shadow], 0.07, 0.18, 1.6, 3.2, rng);
    c.save();
    c.fillStyle = c.createPattern(fine, 'repeat')!;
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    c.translate(131, 97);
    c.fillStyle = c.createPattern(coarse, 'repeat')!;
    c.fillRect(-131, -97, WORLD_W, WORLD_H);
    c.restore();
    // sparse larger grit with SE contact shadow
    c.save();
    for (let i = 0; i < 3600; i++) {
        const x = rng() * WORLD_W, y = rng() * WORLD_H, s = 2 + rng() * 3;
        c.globalAlpha = 0.12; c.fillStyle = P.shadow; c.fillRect(x + 1, y + 1, s, s * 0.8);
        c.globalAlpha = 0.16 + rng() * 0.14; c.fillStyle = rng() < 0.5 ? P.gravel : P.earthDark; c.fillRect(x, y, s, s * 0.8);
    }
    c.restore();
}

/** Asphalt lanes: ring road at ~r 1200 + N-S and E-W spokes. Low contrast — structure, not signal. */
function drawLanes(c: CanvasRenderingContext2D, rng: () => number): void {
    const P = JUNKYARD_PALETTE;
    const LANE_W = 150;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = P.asphalt; c.globalAlpha = 0.55; c.lineWidth = LANE_W;
    // ring (rounded square so corners stay inside the playable area)
    c.beginPath();
    c.moveTo(140, 300); c.lineTo(140, 2700); c.quadraticCurveTo(140, 2860, 300, 2860);
    c.lineTo(2700, 2860); c.quadraticCurveTo(2860, 2860, 2860, 2700);
    c.lineTo(2860, 300); c.quadraticCurveTo(2860, 140, 2700, 140);
    c.lineTo(300, 140); c.quadraticCurveTo(140, 140, 140, 300);
    c.stroke();
    // spokes: south gate -> press apron, press -> belt (E), press -> car wash (W), press -> crane (N)
    c.beginPath();
    c.moveTo(1500, 2860); c.lineTo(1500, 1760);
    c.moveTo(1760, 1500); c.lineTo(2860, 1500);
    c.moveTo(1240, 1500); c.lineTo(140, 1500);
    c.moveTo(1500, 1240); c.lineTo(1500, 640);
    c.stroke();
    // faded centre line dashes
    c.globalAlpha = 0.28; c.strokeStyle = P.asphaltLine; c.lineWidth = 6; c.setLineDash([40, 50]);
    c.beginPath();
    c.moveTo(1500, 2840); c.lineTo(1500, 1780);
    c.moveTo(1780, 1500); c.lineTo(2840, 1500);
    c.moveTo(1220, 1500); c.lineTo(160, 1500);
    c.moveTo(1500, 1220); c.lineTo(1500, 660);
    c.stroke();
    c.setLineDash([]);
    // wear: patches of lighter/darker asphalt
    for (let i = 0; i < 90; i++) {
        c.globalAlpha = 0.06 + rng() * 0.06;
        c.fillStyle = rng() < 0.5 ? P.gravel : P.oil;
        const onRing = rng() < 0.6;
        let x: number, y: number;
        if (onRing) { const side = (rng() * 4) | 0; const t = 200 + rng() * 2600; x = side === 0 ? 140 : side === 1 ? 2860 : t; y = side === 2 ? 140 : side === 3 ? 2860 : t; }
        else { x = 1500 + (rng() - 0.5) * 60; y = 700 + rng() * 2100; }
        c.beginPath(); c.ellipse(x, y, 30 + rng() * 60, 14 + rng() * 30, rng() * Math.PI, 0, Math.PI * 2); c.fill();
    }
    c.restore();
}

/** Concrete slab under and around the press, with joints and cracks. */
function drawApron(c: CanvasRenderingContext2D, rng: () => number, bed: JyRect): void {
    const P = JUNKYARD_PALETTE;
    const M = 110;
    const x = bed.x - M, y = bed.y - M, w = bed.w + 2 * M, h = bed.h + 2 * M;
    c.save();
    c.fillStyle = P.concrete; c.globalAlpha = 0.9;
    c.fillRect(x, y, w, h);
    // slab joints (grid 120)
    c.globalAlpha = 0.5; c.strokeStyle = P.concreteDk; c.lineWidth = 3;
    c.beginPath();
    for (let gx = x; gx <= x + w; gx += 140) { c.moveTo(gx, y); c.lineTo(gx, y + h); }
    for (let gy = y; gy <= y + h; gy += 120) { c.moveTo(x, gy); c.lineTo(x + w, gy); }
    c.stroke();
    // cracks
    c.globalAlpha = 0.45; c.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
        let cx = x + rng() * w, cy = y + rng() * h;
        c.beginPath(); c.moveTo(cx, cy);
        for (let k = 0; k < 5; k++) { cx += (rng() - 0.5) * 60; cy += (rng() - 0.5) * 60; c.lineTo(cx, cy); }
        c.stroke();
    }
    // wear stains
    for (let i = 0; i < 30; i++) {
        c.globalAlpha = 0.05 + rng() * 0.07; c.fillStyle = rng() < 0.5 ? P.oil : P.rust;
        c.beginPath(); c.ellipse(x + rng() * w, y + rng() * h, 20 + rng() * 50, 10 + rng() * 25, rng() * Math.PI, 0, Math.PI * 2); c.fill();
    }
    // edge highlight NW / shadow SE (slab has a lip)
    c.globalAlpha = 0.35; c.strokeStyle = '#d6d2c9'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y); c.lineTo(x + w, y); c.stroke();
    c.strokeStyle = P.shadow;
    c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.stroke();
    c.restore();
}

function drawOilStains(c: CanvasRenderingContext2D, rng: () => number): void {
    const P = JUNKYARD_PALETTE;
    c.save();
    for (let i = 0; i < 36; i++) {
        const x = 120 + rng() * (WORLD_W - 240), y = 120 + rng() * (WORLD_H - 240);
        const r = 14 + rng() * 34;
        // blobby stain: a few overlapping ellipses
        for (let k = 0; k < 4; k++) {
            c.globalAlpha = 0.05 + rng() * 0.06; c.fillStyle = P.oil;
            c.beginPath(); c.ellipse(x + (rng() - 0.5) * r, y + (rng() - 0.5) * r * 0.7, r * (0.5 + rng() * 0.6), r * (0.3 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2); c.fill();
        }
        // rainbow sheen hint (very faint, 1 ellipse)
        c.globalAlpha = 0.06; c.fillStyle = '#7a8fb3';
        c.beginPath(); c.ellipse(x, y, r * 0.5, r * 0.25, rng() * Math.PI, 0, Math.PI * 2); c.fill();
    }
    c.restore();
}

function drawTireTracks(c: CanvasRenderingContext2D, rng: () => number): void {
    const P = JUNKYARD_PALETTE;
    c.save();
    c.strokeStyle = P.earthDark; c.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
        let x = 150 + rng() * (WORLD_W - 300), y = 150 + rng() * (WORLD_H - 300);
        let a = rng() * Math.PI * 2;
        const len = 8 + ((rng() * 14) | 0);
        const gap = 26;
        for (let s = 0; s < 2; s++) {
            const ox = Math.cos(a + Math.PI / 2) * (s ? gap / 2 : -gap / 2), oy = Math.sin(a + Math.PI / 2) * (s ? gap / 2 : -gap / 2);
            let px = x + ox, py = y + oy, pa = a;
            c.globalAlpha = 0.16; c.lineWidth = 8;
            c.beginPath(); c.moveTo(px, py);
            for (let k = 0; k < len; k++) { pa += (rng() - 0.5) * 0.3; px += Math.cos(pa) * 40; py += Math.sin(pa) * 40; c.lineTo(px, py); }
            c.stroke();
            // tread marks: short dashes across the groove
            c.globalAlpha = 0.12; c.lineWidth = 2;
            c.setLineDash([3, 7]); c.beginPath(); c.moveTo(x + ox, y + oy); c.lineTo(px, py); c.stroke(); c.setLineDash([]);
        }
        x = 0; y = 0; a = 0;
    }
    c.restore();
}

function drawHubcap(c: CanvasRenderingContext2D, x: number, y: number, rng: () => number): void {
    const P = JUNKYARD_PALETTE;
    const r = 9 + rng() * 4;
    c.save();
    c.globalAlpha = 0.22; c.fillStyle = P.shadow;
    c.beginPath(); c.ellipse(x + 2, y + 2, r, r * 0.8, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.55; c.fillStyle = '#b9bec4';
    c.beginPath(); c.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.5; c.strokeStyle = P.chrome; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(x, y, r * 0.6, r * 0.48, 0, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 0.35; c.fillStyle = P.gravel;
    c.beginPath(); c.ellipse(x, y, r * 0.22, r * 0.18, 0, 0, Math.PI * 2); c.fill();
    c.restore();
}
