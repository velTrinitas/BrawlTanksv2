import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * CastleMap.ts — map definitions for CASTLE GROUNDS (scenariusz OBRON ZAMEK).
 *
 * F1 (2026-09-10) — anchor mapy wg przepisu map-kit (jak MarsMap.ts):
 * - Paleta "ZIELONA DOLINA, DZIEN" (decyzja Mariusza): laka/las 60%, granit 30%,
 *   heraldyczny szkarlat + zloto 10%. Musi sie odrozniac od Ruin Fortecy
 *   (piaskowiec / zimny kamien / zmierzch) i od Tropikow (cieplejsza zielen,
 *   czerwone stodoly) — regula T7 (docs/map-kit/ART_TOKENS.md).
 * - Layouty FROZEN z tools/castle_c1_layout.mjs (V1-V9 PASS, 0 bledow).
 *   NIE edytowac wspolrzednych recznie — zmienic skrypt, przeliczyc, wkleic.
 *   Konwencja: x/y = TOP-LEFT wszedzie w tym pliku (regula ICollidable).
 * - buildCastleTexture: F1 = laka + droga pierscieniowa + misa fosy + mosty +
 *   bruk podworza (czytelny placeholder trasy wrogow). Pelny bake (las, obozy,
 *   pola, kaplica, luki furtek, ~60 stempli) wchodzi w F2.
 *
 * Swiatlo T1: slonce NW, cienie SE (jak kazda mapa).
 */

// PALETTE — single source of truth lives in castle/castlePalette.ts (bez cyklu importow)
// =================================================================

export { CASTLE_PALETTE, CASTLE_HEX, CASTLE_LIGHT } from './castle/castlePalette';
import { CASTLE_PALETTE } from './castle/castlePalette';
import {
    drawTree, drawPine, drawCampfire, drawTent, drawWarBanner, drawStatue,
    drawWheatField, drawHayCart, drawSheep, drawFence,
} from './castle/castlePainters';

// =================================================================
// FROZEN LAYOUT — output of tools/castle_c1_layout.mjs (F1, PASS 0 bledow)
// =================================================================

export interface CastleRect { id: string; x: number; y: number; w: number; h: number }
export interface CastleWallRect extends CastleRect { side: 'N' | 'S' | 'W' | 'E' }
export interface CastlePoint { x: number; y: number }

export const CASTLE_CENTER: CastlePoint = { x: 1500, y: 1500 };

/** 4 wieze narozne — NIEZNISZCZALNE (kotwica sylwetki). AABB 84x84, wizual r=46. */
export const CASTLE_TOWERS: readonly CastleRect[] = [
    { id: 'towerNW', x: 1098, y: 1098, w: 84, h: 84 },
    { id: 'towerNE', x: 1818, y: 1098, w: 84, h: 84 },
    { id: 'towerSW', x: 1098, y: 1818, w: 84, h: 84 },
    { id: 'towerSE', x: 1818, y: 1818, w: 84, h: 84 },
];
/** 8 segmentow muru (2 na bok, po 150 px szczelinie w srodku boku). HP per segment. */
export const CASTLE_WALLS: readonly CastleWallRect[] = [
    { id: 'wallN_W', x: 1182, y: 1140, w: 243, h: 28, side: 'N' },
    { id: 'wallN_E', x: 1575, y: 1140, w: 243, h: 28, side: 'N' },
    { id: 'wallS_W', x: 1182, y: 1832, w: 243, h: 28, side: 'S' },
    { id: 'wallS_E', x: 1575, y: 1832, w: 243, h: 28, side: 'S' },
    { id: 'wallW_N', x: 1140, y: 1182, w: 28, h: 243, side: 'W' },
    { id: 'wallW_S', x: 1140, y: 1575, w: 28, h: 243, side: 'W' },
    { id: 'wallE_N', x: 1832, y: 1182, w: 28, h: 243, side: 'E' },
    { id: 'wallE_S', x: 1832, y: 1575, w: 28, h: 243, side: 'E' },
];
/** 4 BRAMY (decyzja Mariusza): kazda zniszczalna, rozsuwana dla gracza, naprawialna. */
export const CASTLE_GATES: readonly CastleWallRect[] = [
    { id: 'gateS', x: 1425, y: 1832, w: 150, h: 28, side: 'S' },
    { id: 'gateN', x: 1425, y: 1140, w: 150, h: 28, side: 'N' },
    { id: 'gateW', x: 1140, y: 1425, w: 28, h: 150, side: 'W' },
    { id: 'gateE', x: 1832, y: 1425, w: 28, h: 150, side: 'E' },
];
/** Wiezyczki bramne (para na brame) — niezniszczalne, wizual w teksturze bramy. */
export const CASTLE_GATE_TURRETS: readonly CastleRect[] = [
    { id: 'turretS1', x: 1381, y: 1824, w: 44, h: 44 }, { id: 'turretS2', x: 1575, y: 1824, w: 44, h: 44 },
    { id: 'turretN1', x: 1381, y: 1132, w: 44, h: 44 }, { id: 'turretN2', x: 1575, y: 1132, w: 44, h: 44 },
    { id: 'turretW1', x: 1132, y: 1381, w: 44, h: 44 }, { id: 'turretW2', x: 1132, y: 1575, w: 44, h: 44 },
    { id: 'turretE1', x: 1824, y: 1381, w: 44, h: 44 }, { id: 'turretE2', x: 1824, y: 1575, w: 44, h: 44 },
];
/** Stanowiska maszyn oblezniczych: 820 px od srodka na osi lane'u (poza fosa i pierscieniem). */
export const CASTLE_SIEGE_POS: Readonly<Record<CastleLaneId, CastlePoint>> = {
    N: { x: 1500, y: 680 }, S: { x: 1500, y: 2320 }, W: { x: 680, y: 1500 }, E: { x: 2320, y: 1500 },
};
/** Donzon — HP 0 = przegrana. */
export const CASTLE_KEEP: CastleRect = { id: 'keep', x: 1400, y: 1400, w: 200, h: 200 };
/** Respawn gracza (podworze SW) + sanktuarium (pociski wroga gina, kontakt OFF). */
export const CASTLE_RESPAWN = Object.freeze({ x: 1290, y: 1700, r: 70 }); // podworze SW — z dala od punktow ataku donzonu i padow
export const CASTLE_SANCTUARY: CastleRect = { id: 'sanctuary', x: 1210, y: 1620, w: 160, h: 160 };
export const CASTLE_COURTYARD: CastleRect = { id: 'courtyard', x: 1168, y: 1168, w: 664, h: 664 };
/** Start gracza w F1 = punkt respawnu (w F3 respawn uzywa tej samej stalej). */
export const CASTLE_PLAYER_SPAWN: CastlePoint = { x: CASTLE_RESPAWN.x, y: CASTLE_RESPAWN.y };

/** Fosa — 8 pasow (slow 0.5x, passable), wyciecia 150 px na mosty. */
export const CASTLE_MOAT: readonly CastleRect[] = [
    { id: 'moatN_W', x: 990, y: 990, w: 416, h: 90 },
    { id: 'moatN_E', x: 1594, y: 990, w: 416, h: 90 },
    { id: 'moatS_W', x: 990, y: 1920, w: 416, h: 90 },
    { id: 'moatS_E', x: 1594, y: 1920, w: 416, h: 90 },
    { id: 'moatW_N', x: 990, y: 1080, w: 90, h: 326 },
    { id: 'moatW_S', x: 990, y: 1594, w: 90, h: 326 },
    { id: 'moatE_N', x: 1920, y: 1080, w: 90, h: 326 },
    { id: 'moatE_S', x: 1920, y: 1594, w: 90, h: 326 },
];
export const CASTLE_BRIDGES: readonly CastleRect[] = [
    { id: 'bridgeN', x: 1406, y: 990, w: 188, h: 90 },
    { id: 'bridgeS', x: 1406, y: 1920, w: 188, h: 90 },
    { id: 'bridgeW', x: 990, y: 1406, w: 90, h: 188 },
    { id: 'bridgeE', x: 1920, y: 1406, w: 90, h: 188 },
];

/** Droga pierscieniowa r=600 — 8 waypointow trasy wrogow (kolejnosc = obieg CW). */
export const CASTLE_RING: readonly (CastlePoint & { id: string })[] = [
    { id: 'ringN', x: 1500, y: 900 },
    { id: 'ringNE', x: 2100, y: 900 },
    { id: 'ringE', x: 2100, y: 1500 },
    { id: 'ringSE', x: 2100, y: 2100 },
    { id: 'ringS', x: 1500, y: 2100 },
    { id: 'ringSW', x: 900, y: 2100 },
    { id: 'ringW', x: 900, y: 1500 },
    { id: 'ringNW', x: 900, y: 900 },
];
export type CastleLaneId = 'N' | 'E' | 'S' | 'W';
export const CASTLE_LANES: readonly (CastlePoint & { id: CastleLaneId; ring: string })[] = [
    { id: 'N', x: 1500, y: 110, ring: 'ringN' },
    { id: 'E', x: 2890, y: 1500, ring: 'ringE' },
    { id: 'S', x: 1500, y: 2890, ring: 'ringS' },
    { id: 'W', x: 110, y: 1500, ring: 'ringW' },
];
export const CASTLE_BRIDGE_CENTERS: Readonly<Record<CastleLaneId, CastlePoint>> = {
    N: { x: 1500, y: 1035 },
    S: { x: 1500, y: 1965 },
    W: { x: 1035, y: 1500 },
    E: { x: 1965, y: 1500 },
};
/** Punkty ataku: 24 px + polowa czolgu przed AABB celu. */
export const CASTLE_ATTACK = Object.freeze({
    gateS: { x: 1500, y: 1909 },
    gateN: { x: 1500, y: 1091 },
    gateW: { x: 1091, y: 1500 },
    gateE: { x: 1909, y: 1500 },
    keepS: { x: 1500, y: 1649 },
    keepN: { x: 1500, y: 1351 },
    keepW: { x: 1351, y: 1500 },
    keepE: { x: 1649, y: 1500 },
});
/** Obozy najezdzcow (dekor w bake, passable) — telegraf lane'ow. */
export const CASTLE_CAMPS: readonly CastleRect[] = [
    { id: 'campN', x: 1400, y: 50, w: 200, h: 120 },
    { id: 'campE', x: 2760, y: 1440, w: 200, h: 120 },
    { id: 'campS', x: 1400, y: 2790, w: 200, h: 120 },
    { id: 'campW', x: 40, y: 1440, w: 200, h: 120 },
];

/** Solidy zewnetrzne. */
export const CASTLE_FORESTS: readonly CastleRect[] = [
    { id: 'forestNW', x: 300, y: 300, w: 260, h: 180 },
    { id: 'forestNE', x: 2440, y: 300, w: 260, h: 180 },
    { id: 'forestSW', x: 300, y: 2520, w: 260, h: 180 },
    { id: 'forestSE', x: 2440, y: 2520, w: 260, h: 180 },
    { id: 'forestW2', x: 480, y: 1960, w: 220, h: 160 },
    { id: 'forestE2', x: 2240, y: 1040, w: 220, h: 160 },
    { id: 'forestS2', x: 1000, y: 2300, w: 220, h: 160 },
    { id: 'forestN2', x: 1780, y: 240, w: 220, h: 160 },
];
/** Glazy granitowe — AABB 120x120 TOP-LEFT; Rock chce SRODEK + size 60 (jak Mars). */
export const CASTLE_ROCKS: readonly CastleRect[] = [
    { id: 'rock1', x: 640, y: 640, w: 120, h: 120 },
    { id: 'rock2', x: 2240, y: 640, w: 120, h: 120 },
    { id: 'rock3', x: 640, y: 2240, w: 120, h: 120 },
    { id: 'rock4', x: 2240, y: 2240, w: 120, h: 120 },
    { id: 'rock5', x: 1120, y: 400, w: 120, h: 120 },
    { id: 'rock6', x: 1760, y: 2480, w: 120, h: 120 },
    { id: 'rock7', x: 400, y: 1160, w: 120, h: 120 },
    { id: 'rock8', x: 2480, y: 1720, w: 120, h: 120 },
    { id: 'rock9', x: 1160, y: 2600, w: 120, h: 120 },
    { id: 'rock10', x: 2120, y: 300, w: 120, h: 120 },
    { id: 'rock11', x: 300, y: 1760, w: 120, h: 120 },
    { id: 'rock12', x: 2600, y: 1160, w: 120, h: 120 },
];
export const CASTLE_CHAPEL: CastleRect = { id: 'chapel', x: 2500, y: 600, w: 200, h: 140 };
/** Wioska (F6, uwaga #9): 3 chatki (solid, bake) + studnia (dekor w gruncie). */
export const CASTLE_COTTAGES: readonly CastleRect[] = [
    { id: 'cottage1', x: 720, y: 100, w: 110, h: 90 },
    { id: 'cottage2', x: 860, y: 150, w: 110, h: 90 },
    { id: 'cottage3', x: 760, y: 230, w: 110, h: 90 },
];
export const CASTLE_WELL: CastleRect = { id: 'well', x: 900, y: 270, w: 40, h: 40 };
/** Snopy siana (F6): niszczalne solidy 48x48, gem po rozwaleniu, respawn. */
export const CASTLE_HAY: readonly CastleRect[] = [
    { id: 'hay1', x: 820, y: 2520, w: 48, h: 48 }, { id: 'hay2', x: 880, y: 2550, w: 48, h: 48 },
    { id: 'hay3', x: 2720, y: 1760, w: 48, h: 48 }, { id: 'hay4', x: 2780, y: 1800, w: 48, h: 48 },
    { id: 'hay5', x: 1180, y: 660, w: 48, h: 48 }, { id: 'hay6', x: 1240, y: 700, w: 48, h: 48 },
    { id: 'hay7', x: 2080, y: 2560, w: 48, h: 48 }, { id: 'hay8', x: 2140, y: 2600, w: 48, h: 48 },
];

/** Pady (footprint 100x100, TOP-LEFT): 1 medi + 1 power na podworzu, 1 + 1 za pierscieniem. */
export const CASTLE_MEDI_PAD_POSITIONS: readonly CastlePoint[] = [
    { x: 1230, y: 1230 }, // podworze NW
    { x: 1620, y: 700 },  // za pierscieniem N
];
export const CASTLE_POWER_PAD_POSITIONS: readonly CastlePoint[] = [
    { x: 1670, y: 1670 }, // podworze SE
    { x: 1280, y: 2200 }, // za pierscieniem S
];
/** Pola zboza — stealth (passable). */
export const CASTLE_STEALTH: readonly CastleRect[] = [
    { id: 'fieldW', x: 300, y: 2200, w: 300, h: 220 },
    { id: 'fieldE', x: 2400, y: 820, w: 300, h: 200 },
];

/** Granitowa paleta dla silnika Rock (wzorzec MARS_ROCK_PALETTE). */
export const CASTLE_ROCK_PALETTE = Object.freeze({
    rockBase:   0x8f959a,
    rockLight:  0xb4b9bd,
    rockShadow: 0x5f656a,
    rockDeep:   0x3d4247,
    crackDark:  0x2b2f34,
    mossGreen:  0x5f8a3e, // real moss on the NW face — this world is alive
    sandyEdge:  0x6aa84a, // grass at the foot of the boulder (meadowDark)
});

// =================================================================
// RNG — mulberry32 (U1 canon, identical to the layout script)
// =================================================================

function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return function (): number {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// =================================================================
// buildCastleTexture — baked once (3000x3000). F1: placeholder gruntu.
// =================================================================

/**
 * F1 ground: meadow base + tonal patches + grass tufts, ring road (droga wrogow —
 * MUSI byc widoczna od pierwszego dnia: gracz czyta trase), moat basin + bridges,
 * courtyard cobbles. Static-baked — no Vite HMR refresh, re-enter the map.
 * F2 adds: forest floors, camps, wheat fields, chapel, furtka arches, decor stamps.
 */
export function buildCastleTexture(): PIXI.Texture {
    const t0 = performance.now();
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    const rng = makeRng(0x0c5a4d4b); // "CAS" + 'K'

    // ── 1. Meadow base ──
    c.fillStyle = CASTLE_PALETTE.meadow;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // ── 2. Tonal patches (sun/cloud mottling) ──
    for (let i = 0; i < 140; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const r = 120 + rng() * 360;
        c.save();
        c.globalAlpha = 0.05 + rng() * 0.06;
        c.fillStyle = rng() < 0.5 ? CASTLE_PALETTE.meadowDark : CASTLE_PALETTE.meadowLight;
        c.beginPath();
        c.ellipse(x, y, r, r * (0.5 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // ── 3. Grass tufts (short strokes, T1 lean SE) ──
    c.strokeStyle = CASTLE_PALETTE.meadowDark;
    c.lineWidth = 2;
    c.globalAlpha = 0.35;
    for (let i = 0; i < 2600; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const h = 5 + rng() * 7;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 2, y - h);
        c.stroke();
    }
    c.globalAlpha = 1;

    // ── 4. Ring road — dirt loop through the 8 waypoints (enemy route, readable) ──
    const ROAD_W = 64;
    c.save();
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = CASTLE_PALETTE.roadEdge;
    c.lineWidth = ROAD_W + 10;
    c.globalAlpha = 0.55;
    strokeRing(c);
    c.globalAlpha = 1;
    c.strokeStyle = CASTLE_PALETTE.road;
    c.lineWidth = ROAD_W;
    strokeRing(c);
    // lanes: from each lane point to its ring waypoint + from ring to bridge
    c.lineWidth = ROAD_W;
    for (const lane of CASTLE_LANES) {
        const rp = CASTLE_RING.find(r => r.id === lane.ring)!;
        const bc = CASTLE_BRIDGE_CENTERS[lane.id];
        c.strokeStyle = CASTLE_PALETTE.roadEdge;
        c.globalAlpha = 0.55;
        c.lineWidth = ROAD_W + 10;
        c.beginPath(); c.moveTo(lane.x, lane.y); c.lineTo(rp.x, rp.y); c.lineTo(bc.x, bc.y); c.stroke();
        c.globalAlpha = 1;
        c.strokeStyle = CASTLE_PALETTE.road;
        c.lineWidth = ROAD_W;
        c.beginPath(); c.moveTo(lane.x, lane.y); c.lineTo(rp.x, rp.y); c.lineTo(bc.x, bc.y); c.stroke();
    }
    // wheel ruts
    c.strokeStyle = CASTLE_PALETTE.roadEdge;
    c.lineWidth = 3;
    c.globalAlpha = 0.5;
    c.setLineDash([18, 14]);
    strokeRing(c, -14);
    strokeRing(c, 14);
    c.setLineDash([]);
    c.restore();

    // ── 5. Moat basin (water) + bank ──
    for (const m of CASTLE_MOAT) {
        c.fillStyle = CASTLE_PALETTE.moatDeep;
        c.fillRect(m.x - 6, m.y - 6, m.w + 12, m.h + 12);
    }
    for (const m of CASTLE_MOAT) {
        const g = c.createLinearGradient(m.x, m.y, m.x + m.w, m.y + m.h);
        g.addColorStop(0, CASTLE_PALETTE.moat);
        g.addColorStop(1, CASTLE_PALETTE.moatDeep);
        c.fillStyle = g;
        c.fillRect(m.x, m.y, m.w, m.h);
        // foam flecks
        c.fillStyle = CASTLE_PALETTE.moatFoam;
        c.globalAlpha = 0.35;
        for (let i = 0; i < 18; i++) {
            const fx = m.x + rng() * m.w;
            const fy = m.y + rng() * m.h;
            c.beginPath(); c.ellipse(fx, fy, 6 + rng() * 10, 2, 0, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;
    }

    // ── 6. Bridges (planks across the cuts) ──
    for (const b of CASTLE_BRIDGES) {
        c.fillStyle = CASTLE_PALETTE.plankDark;
        c.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
        c.fillStyle = CASTLE_PALETTE.plank;
        c.fillRect(b.x, b.y, b.w, b.h);
        const horizontal = b.w > b.h; // N/S bridges span horizontally
        c.strokeStyle = CASTLE_PALETTE.plankDark;
        c.lineWidth = 2;
        const step = 12;
        if (horizontal) {
            for (let x = b.x + step; x < b.x + b.w; x += step) { c.beginPath(); c.moveTo(x, b.y); c.lineTo(x, b.y + b.h); c.stroke(); }
        } else {
            for (let y = b.y + step; y < b.y + b.h; y += step) { c.beginPath(); c.moveTo(b.x, y); c.lineTo(b.x + b.w, y); c.stroke(); }
        }
    }

    // ── 7. Courtyard cobbles ──
    const cy = CASTLE_COURTYARD;
    c.fillStyle = CASTLE_PALETTE.cobble;
    c.fillRect(cy.x, cy.y, cy.w, cy.h);
    c.strokeStyle = CASTLE_PALETTE.cobbleJoint;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.6;
    const CB = 26;
    for (let row = 0; row * CB < cy.h; row++) {
        const off = (row % 2) * (CB / 2);
        for (let col = -1; col * CB < cy.w + CB; col++) {
            const x = cy.x + col * CB + off;
            const y = cy.y + row * CB;
            const w = Math.min(CB, cy.x + cy.w - x);
            const h = Math.min(CB, cy.y + cy.h - y);
            if (w <= 0 || h <= 0 || x < cy.x - CB) continue;
            c.strokeRect(Math.max(x, cy.x) + 1, y + 1, Math.max(0, Math.min(w, x + CB - cy.x) - 2), h - 2);
        }
    }
    c.globalAlpha = 1;

    // ── 8. F2: sciolka pod blokami lasu (korony = CastleSolidProp, sprite) ──
    for (const f of CASTLE_FORESTS) {
        c.fillStyle = CASTLE_PALETTE.forestDeep;
        c.globalAlpha = 0.28;
        c.beginPath(); c.ellipse(f.x + f.w / 2 + 8, f.y + f.h / 2 + 10, f.w * 0.7, f.h * 0.72, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
    }

    // ── 9. F2: pola zboza (stealth) ──
    for (const s of CASTLE_STEALTH) drawWheatField(c, rng, s.x, s.y, s.w, s.h);

    // ── 10. F2: obozy najezdzcow na lane'ach (telegraf: stad przyjda fale) ──
    for (const camp of CASTLE_CAMPS) {
        // wydeptana ziemia
        c.fillStyle = CASTLE_PALETTE.roadEdge; c.globalAlpha = 0.45;
        c.beginPath(); c.ellipse(camp.x + camp.w / 2, camp.y + camp.h / 2, camp.w * 0.6, camp.h * 0.6, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        const cx = camp.x + camp.w / 2, cy = camp.y + camp.h / 2;
        drawTent(c, rng, cx - 52, cy - 8, false);
        drawTent(c, rng, cx + 52, cy - 8, true);
        drawCampfire(c, rng, cx, cy + 22);
        drawWarBanner(c, cx - 4, cy - 30);
        // pale ostrzegawcze z czerwonymi szmatami
        for (const [px, py] of [[cx - 80, cy + 30], [cx + 80, cy + 30]]) {
            c.strokeStyle = CASTLE_PALETTE.trunkDark; c.lineWidth = 3;
            c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 26); c.stroke();
            c.fillStyle = CASTLE_PALETTE.enemyRed; c.fillRect(px, py - 26, 10, 7);
        }
    }

    // ── 11. F2: furtki (N/E/W) — prog z plyt + zlota heraldyka "przejazd tylko gracz" ──
    for (const f of CASTLE_GATES) {
        const horizontal = f.w > f.h;
        c.fillStyle = CASTLE_PALETTE.cobbleJoint;
        c.fillRect(f.x - 2, f.y - 2, f.w + 4, f.h + 4);
        c.fillStyle = CASTLE_PALETTE.cobble;
        c.fillRect(f.x, f.y, f.w, f.h);
        // pasy szkarlat/zloto w poprzek przejazdu (chevron — czytelny znak "brama dla ciebie")
        const n = horizontal ? Math.floor(f.w / 18) : Math.floor(f.h / 18);
        for (let i = 0; i < n; i++) {
            c.fillStyle = i % 2 === 0 ? CASTLE_PALETTE.gold : CASTLE_PALETTE.crimson;
            c.globalAlpha = 0.75;
            if (horizontal) c.fillRect(f.x + i * 18 + 2, f.y + 8, 14, f.h - 16);
            else c.fillRect(f.x + 8, f.y + i * 18 + 2, f.w - 16, 14);
        }
        c.globalAlpha = 1;
        // slupki bramne (kamienne kule) po obu stronach otworu
        const posts = horizontal
            ? [[f.x - 6, f.y + f.h / 2], [f.x + f.w + 6, f.y + f.h / 2]]
            : [[f.x + f.w / 2, f.y - 6], [f.x + f.w / 2, f.y + f.h + 6]];
        for (const [px, py] of posts) {
            c.fillStyle = CASTLE_PALETTE.graniteDark; c.beginPath(); c.arc(px + 2, py + 2, 7, 0, Math.PI * 2); c.fill();
            c.fillStyle = CASTLE_PALETTE.graniteTop; c.beginPath(); c.arc(px, py, 7, 0, Math.PI * 2); c.fill();
            c.fillStyle = CASTLE_PALETTE.gold; c.beginPath(); c.arc(px, py, 2.5, 0, Math.PI * 2); c.fill();
        }
    }

    // ── 12. F2: posagi przy mostach (para strzegaca kazdego mostu, od strony pierscienia) ──
    for (const b of CASTLE_BRIDGES) {
        const horizontal = b.w > b.h;
        if (horizontal) {
            const y = b.y < CASTLE_CENTER.y ? b.y - 22 : b.y + b.h + 22;
            drawStatue(c, rng, b.x - 18, y); drawStatue(c, rng, b.x + b.w + 18, y);
        } else {
            const x = b.x < CASTLE_CENTER.x ? b.x - 22 : b.x + b.w + 22;
            drawStatue(c, rng, x, b.y - 18); drawStatue(c, rng, x, b.y + b.h + 18);
        }
    }

    // ── 13. F2: luzne drzewa + wozy + zagroda (dekor passable; z dala od solidow i drog) ──
    const solids: CastleRect[] = [...CASTLE_FORESTS, ...CASTLE_ROCKS, CASTLE_CHAPEL, ...CASTLE_STEALTH, ...CASTLE_CAMPS, ...CASTLE_COTTAGES, ...CASTLE_HAY, CASTLE_WELL];
    const nearSolid = (x: number, y: number, m: number): boolean =>
        solids.some(s => x > s.x - m && x < s.x + s.w + m && y > s.y - m && y < s.y + s.h + m);
    const nearCastle = (x: number, y: number): boolean => Math.abs(x - CASTLE_CENTER.x) < 620 && Math.abs(y - CASTLE_CENTER.y) < 620;
    const nearLane = (x: number, y: number): boolean => (Math.abs(x - 1500) < 70) || (Math.abs(y - 1500) < 70);
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 70; tries++) {
        const x = 90 + rng() * (WORLD_W - 180), y = 90 + rng() * (WORLD_H - 180);
        if (nearCastle(x, y) || nearLane(x, y) || nearSolid(x, y, 60)) continue;
        if (rng() < 0.3) drawPine(c, rng, x, y, 0.9 + rng() * 0.4); else drawTree(c, rng, x, y, 0.85 + rng() * 0.45);
        placed++;
    }
    drawHayCart(c, 2140, 1880, 0.3);
    drawHayCart(c, 820, 1180, -0.5);
    // zagroda z owcami (W, miedzy skala 7 a lane W — nad pierscieniem)
    drawFence(c, 430, 1320, 190, 120);
    for (const [sx, sy] of [[470, 1360], [520, 1400], [580, 1350], [500, 1420], [560, 1410]]) drawSheep(c, sx, sy);

    // ── 13b. F6 (#9): WIOSKA — klepisko, studnia, plotki, kwietne laki, sciezka do drogi ──
    {
        const vx = 700, vy = 80, vw = 300, vh = 260;
        c.fillStyle = CASTLE_PALETTE.roadEdge; c.globalAlpha = 0.45;
        c.beginPath(); c.ellipse(vx + vw / 2, vy + vh / 2 + 10, vw * 0.62, vh * 0.58, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        // sciezka z wioski do pierscienia (ringNW 900,900)
        c.strokeStyle = CASTLE_PALETTE.roadEdge; c.lineWidth = 26; c.globalAlpha = 0.55; c.lineCap = 'round';
        c.beginPath(); c.moveTo(860, 330); c.quadraticCurveTo(880, 600, 900, 880); c.stroke();
        c.globalAlpha = 1; c.strokeStyle = CASTLE_PALETTE.road; c.lineWidth = 18;
        c.beginPath(); c.moveTo(860, 330); c.quadraticCurveTo(880, 600, 900, 880); c.stroke();
        // studnia: kamienny krag + daszek na slupkach (fake 3D: cien SE)
        const wxx = CASTLE_WELL.x + CASTLE_WELL.w / 2, wyy = CASTLE_WELL.y + CASTLE_WELL.h / 2;
        c.fillStyle = 'rgba(10,20,12,0.3)'; c.beginPath(); c.ellipse(wxx + 5, wyy + 6, 22, 12, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = CASTLE_PALETTE.graniteDark; c.beginPath(); c.ellipse(wxx, wyy + 4, 18, 11, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = CASTLE_PALETTE.graniteTop; c.beginPath(); c.ellipse(wxx, wyy, 18, 11, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = CASTLE_PALETTE.moatDeep; c.beginPath(); c.ellipse(wxx, wyy, 11, 6, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = CASTLE_PALETTE.oakDark; c.lineWidth = 3;
        c.beginPath(); c.moveTo(wxx - 14, wyy - 2); c.lineTo(wxx - 14, wyy - 30); c.moveTo(wxx + 14, wyy - 2); c.lineTo(wxx + 14, wyy - 30); c.stroke();
        c.fillStyle = CASTLE_PALETTE.crimson; c.beginPath(); c.moveTo(wxx - 22, wyy - 28); c.lineTo(wxx, wyy - 42); c.lineTo(wxx + 22, wyy - 28); c.closePath(); c.fill();
        c.strokeStyle = CASTLE_PALETTE.gold; c.lineWidth = 1.5; c.stroke();
        // plotki wokol wioski (fragmenty) + kwietne laki
        drawFence(c, 690, 330, 120, 40);
        drawFence(c, 980, 120, 40, 120);
        for (const [fx, fy] of [[640, 420], [1040, 300], [560, 1900], [2450, 1900], [1700, 2650], [2300, 300]]) {
            for (let i = 0; i < 26; i++) {
                const px = fx + (rng() - 0.5) * 120, py = fy + (rng() - 0.5) * 80;
                c.fillStyle = ['#f5d24b', '#ff8fb1', '#ffffff', '#c58cff'][i % 4];
                c.beginPath(); c.arc(px, py, 2.2, 0, Math.PI * 2); c.fill();
            }
        }
        // sciernisko pod snopami
        for (const hb of CASTLE_HAY) {
            c.fillStyle = CASTLE_PALETTE.wheatDark; c.globalAlpha = 0.35;
            c.beginPath(); c.ellipse(hb.x + hb.w / 2, hb.y + hb.h / 2 + 6, 42, 24, 0, 0, Math.PI * 2); c.fill();
            c.globalAlpha = 1;
        }
    }

    // ── 14. F2: zywoplot granicy (wizual bordera w bake — kolizja w CastleBorder) ──
    c.fillStyle = CASTLE_PALETTE.forestDeep;
    c.fillRect(0, 0, WORLD_W, 24); c.fillRect(0, WORLD_H - 24, WORLD_W, 24);
    c.fillRect(0, 0, 24, WORLD_H); c.fillRect(WORLD_W - 24, 0, 24, WORLD_H);
    c.fillStyle = CASTLE_PALETTE.forestMid;
    for (let i = 0; i < WORLD_W; i += 22) {
        c.beginPath(); c.arc(i + 11, 12, 10, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(i + 11, WORLD_H - 12, 10, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(12, i + 11, 10, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(WORLD_W - 12, i + 11, 10, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = CASTLE_PALETTE.forestLight; c.globalAlpha = 0.5;
    for (let i = 0; i < WORLD_W; i += 22) {
        c.beginPath(); c.arc(i + 8, 8, 5, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(8, i + 8, 5, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;

    // ── 15. Edge vignette (playable edge hint, T1 neutral) ──
    const vg = c.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.42, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,40,20,0.28)');
    c.fillStyle = vg;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    const tex = PIXI.Texture.from(cv);
    console.log(`[CastleMap] ground bake ${(performance.now() - t0).toFixed(1)} ms`);
    return tex;
}

function strokeRing(c: CanvasRenderingContext2D, inset = 0): void {
    const cx = CASTLE_CENTER.x, cy = CASTLE_CENTER.y;
    c.beginPath();
    CASTLE_RING.forEach((p, i) => {
        // inset moves the point toward/away from the centre (for ruts)
        const dx = Math.sign(p.x - cx), dy = Math.sign(p.y - cy);
        const x = p.x - dx * inset, y = p.y - dy * inset;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.closePath();
    c.stroke();
}
