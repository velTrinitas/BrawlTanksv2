import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * Statyczna tekstura pustyni — bake'owana raz z Canvas 2D.
 */
export function buildDesertTexture(): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    
    c.fillStyle = '#e8d4a2';
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    
    const sandCols1 = ['#f5dfa8', '#eecf90', '#f8e8c0', '#e8c888', '#faf0d0', '#d4b070'];
    for (let i = 0; i < 3500; i++) {
        const x = Math.random() * WORLD_W;
        const y = Math.random() * WORLD_H;
        const rx = 2.5 + Math.random() * 8;
        const ry = 1.5 + Math.random() * 4;
        const ang = Math.random() * Math.PI;
        const alpha = 0.10 + Math.random() * 0.20;
        const isDark = Math.random() < 0.3;
        
        c.save();
        c.globalAlpha = alpha;
        c.fillStyle = isDark ? '#8a6840' : sandCols1[Math.floor(Math.random() * sandCols1.length)];
        c.beginPath();
        c.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }
    
    const sandCols2 = ['#c8a870', '#e0c898', '#b88858', '#d4b078', '#a87848'];
    for (let i = 0; i < 3500; i++) {
        const x = Math.random() * WORLD_W;
        const y = Math.random() * WORLD_H;
        const rx = 1.8 + Math.random() * 6;
        const ry = 1 + Math.random() * 3;
        const ang = Math.random() * Math.PI;
        const alpha = 0.08 + Math.random() * 0.18;
        
        c.save();
        c.globalAlpha = alpha;
        c.fillStyle = sandCols2[Math.floor(Math.random() * sandCols2.length)];
        c.beginPath();
        c.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }
    
    return PIXI.Texture.from(cv);
}

// =================================================================
// FAZA 2a — PIRAMIDY
// =================================================================

export interface PyramidLayoutEntry {
    x: number;
    y: number;
    size: number;
    seed: number;
}

export const DESERT_PYRAMID_LAYOUT: PyramidLayoutEntry[] = [
    { x: WORLD_W * 0.18, y: WORLD_H * 0.72, size: 280, seed: 1 },
    { x: WORLD_W * 0.55, y: WORLD_H * 0.82, size: 240, seed: 2 },
    { x: WORLD_W * 0.85, y: WORLD_H * 0.42, size: 210, seed: 3 },
];

// =================================================================
// FAZA 2b — SPHINX
// =================================================================

export const DESERT_SPHINX_POSITION = {
    x: WORLD_W * 0.50,
    y: WORLD_H * 0.42,
    sizeX: 180,
    sizeY: 400,
    seed: 7,
};

// =================================================================
// FAZA 3a — RZEKA NIL + MOSTY
// =================================================================

export interface RiverPathPoint {
    x: number;
    y: number;
}

export const DESERT_RIVER_PATH: RiverPathPoint[] = [
    { x: WORLD_W * 0.85, y: WORLD_H * 0.05 },
    { x: WORLD_W * 0.79, y: WORLD_H * 0.13 },
    { x: WORLD_W * 0.72, y: WORLD_H * 0.22 },
    { x: WORLD_W * 0.66, y: WORLD_H * 0.28 },
    { x: WORLD_W * 0.65, y: WORLD_H * 0.33 },
    { x: WORLD_W * 0.66, y: WORLD_H * 0.40 },
    { x: WORLD_W * 0.69, y: WORLD_H * 0.46 },
    { x: WORLD_W * 0.70, y: WORLD_H * 0.52 },
    { x: WORLD_W * 0.66, y: WORLD_H * 0.59 },
    { x: WORLD_W * 0.58, y: WORLD_H * 0.66 },
    { x: WORLD_W * 0.50, y: WORLD_H * 0.72 },
    { x: WORLD_W * 0.45, y: WORLD_H * 0.77 },
    { x: WORLD_W * 0.37, y: WORLD_H * 0.83 },
    { x: WORLD_W * 0.27, y: WORLD_H * 0.88 },
    { x: WORLD_W * 0.18, y: WORLD_H * 0.92 },
    { x: WORLD_W * 0.10, y: WORLD_H * 0.95 },
];

export const DESERT_RIVER_WIDTH = 80;
export const DESERT_BRIDGE_COUNT = 8;
export const DESERT_BRIDGE_DECK_LENGTH = 180;
export const DESERT_BRIDGE_DECK_WIDTH = 125;

// =================================================================
// FAZA 4a — SKAŁY
// v0.18.6 FIX 4: rock SW przesunięty (0.05, 0.62) → (0.12, 0.62) — przejazd między skałą a sandstorm wall
// =================================================================

export const DESERT_LARGE_ROCKS_LAYOUT = [
    { x: WORLD_W * 0.05, y: WORLD_H * 0.40, size: 90, seed: 11 },
    { x: WORLD_W * 0.20, y: WORLD_H * 0.30, size: 75, seed: 17 },
    { x: WORLD_W * 0.38, y: WORLD_H * 0.18, size: 95, seed: 23 },
    { x: WORLD_W * 0.32, y: WORLD_H * 0.55, size: 80, seed: 31 },
    { x: WORLD_W * 0.78, y: WORLD_H * 0.62, size: 100, seed: 37 },
    { x: WORLD_W * 0.62, y: WORLD_H * 0.95, size: 75, seed: 43 },

];

export const DESERT_SMALL_ROCKS_COUNT = 35;
export const DESERT_SMALL_ROCK_MIN_SIZE = 15;
export const DESERT_SMALL_ROCK_MAX_SIZE = 35;

// =================================================================
// v0.18.2-fix2 — KATARAKTY NILU
// =================================================================

export const DESERT_RIVER_CATARACT_ROCKS = [
    { x: WORLD_W * 0.93, y: WORLD_H * 0.05, size: 80, seed: 51 },
    { x: WORLD_W * 0.88, y: WORLD_H * 0.02, size: 75, seed: 53 },
    { x: WORLD_W * 0.82, y: WORLD_H * 0.02, size: 70, seed: 57 },
    { x: WORLD_W * 0.96, y: WORLD_H * 0.12, size: 65, seed: 61 },
    { x: WORLD_W * 0.87, y: WORLD_H * 0.09, size: 90, seed: 63 },
    { x: WORLD_W * 0.74, y: WORLD_H * 0.08, size: 60, seed: 91 },
    { x: WORLD_W * 0.83, y: WORLD_H * 0.07, size: 55, seed: 93 },
    { x: WORLD_W * 0.71, y: WORLD_H * 0.05, size: 45, seed: 95 },
    
    { x: WORLD_W * 0.07, y: WORLD_H * 0.95, size: 80, seed: 71 },
    { x: WORLD_W * 0.15, y: WORLD_H * 0.98, size: 75, seed: 73 },
    { x: WORLD_W * 0.04, y: WORLD_H * 0.98, size: 70, seed: 77 },
    { x: WORLD_W * 0.20, y: WORLD_H * 0.96, size: 65, seed: 81 },
    { x: WORLD_W * 0.13, y: WORLD_H * 0.91, size: 90, seed: 83 },
    { x: WORLD_W * 0.10, y: WORLD_H * 0.86, size: 55, seed: 101 },
    { x: WORLD_W * 0.02, y: WORLD_H * 0.88, size: 50, seed: 103 },
    { x: WORLD_W * 0.07, y: WORLD_H * 0.90, size: 45, seed: 105 },
];

// =================================================================
// FAZA 4b — QUICKSAND ZONES
// =================================================================

export const DESERT_QUICKSAND_LAYOUT = [
    { x: WORLD_W * 0.20, y: WORLD_H * 0.45, rX: 75, rY: 50, seed: 13 },
    { x: WORLD_W * 0.42, y: WORLD_H * 0.62, rX: 85, rY: 60, seed: 19 },
    { x: WORLD_W * 0.88, y: WORLD_H * 0.18, rX: 70, rY: 48, seed: 29 },
    { x: WORLD_W * 0.78, y: WORLD_H * 0.04, rX: 150, rY: 50, seed: 41 },
    { x: WORLD_W * 0.08, y: WORLD_H * 0.84, rX: 150, rY: 50, seed: 45 },
];

// =================================================================
// v0.18.3 FAZA 4c — OASIS STEALTH ZONES (4 oazy)
// v0.18.6 FIX 1: dodana NE oasis. FIX 5 (S pyramid) ODWOŁANY — total = 4 oazy.
// =================================================================

/**
 * 4 oazy na pustyni. Każda redukuje enemy detection przez 10s
 * po wejściu (full stealth) — potem enemies wracają do normal AI.
 * 
 * Math verification:
 * O1 NW (0.12, 0.20) — original
 * O2 SE (0.88, 0.75) — original
 * O3 center-W (0.35, 0.40) — original
 * O4 NE NEW (0.74, 0.32) rX 90 rY 70:
 *   - Medi pad (0.82, 0.28): dist 137 ≥ 115 ✓
 *   - River (0.66, 0.28): dist 137 ≥ 130 ✓
 *   - Pyramid NE radius 105: dist 213 ≥ 195 ✓
 *   - Quicksand (0.88, 0.18): dist 280 ✓
 */
export const DESERT_OASIS_LAYOUT = [
    { x: WORLD_W * 0.12, y: WORLD_H * 0.20, rX: 95, rY: 75, seed: 113 },
    { x: WORLD_W * 0.88, y: WORLD_H * 0.75, rX: 95, rY: 75, seed: 127 },
    { x: WORLD_W * 0.35, y: WORLD_H * 0.40, rX: 95, rY: 75, seed: 131 },
    { x: WORLD_W * 0.74, y: WORLD_H * 0.32, rX: 90, rY: 70, seed: 139 },  // v0.18.6 FIX 1 — NE
];

// =================================================================
// v0.18.4 FAZA 4d — CARAVAN
// =================================================================

export const DESERT_CARAVAN_PATH = [
    { x: 250, y: 150 },
    { x: 500, y: 130 },
    { x: 700, y: 130 },
    { x: 950, y: 200 },
];

export const DESERT_CARAVAN_CAMEL_COUNT = 5;
export const DESERT_CARAVAN_SPEED = 0.45;
export const DESERT_CARAVAN_SPACING = 50;
export const DESERT_CARAVAN_DROP_INTERVAL_MS = 15000;

// =================================================================
// PADS
// =================================================================

export const DESERT_MEDI_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    { x: WORLD_W * 0.18, y: WORLD_H * 0.50 },
    { x: WORLD_W * 0.82, y: WORLD_H * 0.28 },
    { x: WORLD_W * 0.52, y: WORLD_H * 0.30 },
];

export const DESERT_POWER_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    { x: WORLD_W * 0.72, y: WORLD_H * 0.62 },
    { x: WORLD_W * 0.25, y: WORLD_H * 0.18 },
];