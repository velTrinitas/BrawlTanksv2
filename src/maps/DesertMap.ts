import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * Statyczna tekstura pustyni — bake'owana raz z Canvas 2D.
 * Zawiera: base sand + 7000 mikrotekstur (2 warstwy: chłodne beżowe + cieplejsze brązy).
 * 
 * v0.18.1-fix2: wydmy USUNIĘTE (user feedback — wyglądały jak "dziwne eliptyczne bryły").
 * Pustynia teraz jest jednolitym piaskiem z naturalną fakturą mikrotekstur.
 * Wizualne urozmaicenie zapewniają: piramidy, sphinx, skały, rzeka, lotusy, papirus, ptaki.
 * 
 * WYDAJNOŚĆ: 1 PIXI.Texture → 1 PIXI.Sprite → 1 draw call dla całego tła.
 */
export function buildDesertTexture(): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    
    // 1. Base sand
    c.fillStyle = '#e8d4a2';
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    
    // 2. Mikrotekstury warstwa 1 — chłodne beżowe (3500 spots z v4.48)
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
    
    // 3. Mikrotekstury warstwa 2 — cieplejsze brązy (3500 spots z v4.48)
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
// FAZA 4a — SKAŁY (Large + Small)
// =================================================================

export const DESERT_LARGE_ROCKS_LAYOUT = [
    { x: WORLD_W * 0.05, y: WORLD_H * 0.40, size: 90, seed: 11 },
    { x: WORLD_W * 0.20, y: WORLD_H * 0.30, size: 75, seed: 17 },
    { x: WORLD_W * 0.38, y: WORLD_H * 0.18, size: 95, seed: 23 },
    { x: WORLD_W * 0.32, y: WORLD_H * 0.55, size: 80, seed: 31 },
    { x: WORLD_W * 0.78, y: WORLD_H * 0.62, size: 100, seed: 37 },
    { x: WORLD_W * 0.62, y: WORLD_H * 0.95, size: 75, seed: 43 },
    { x: WORLD_W * 0.05, y: WORLD_H * 0.62, size: 85, seed: 47 },
];

export const DESERT_SMALL_ROCKS_COUNT = 35;
export const DESERT_SMALL_ROCK_MIN_SIZE = 15;
export const DESERT_SMALL_ROCK_MAX_SIZE = 35;

// =================================================================
// v0.18.2 + v0.18.2-fix2 — KATARAKTY NILU + GĘSTE TRAP POCKET FILL
// =================================================================

/**
 * v0.18.2-fix2: KATARAKTY z GĘSTYM TRAP POCKET FILL (16 rocks total).
 * 
 * Architektura per trap pocket (8 rocks):
 *   - 5 perimeter rocks (cataract aesthetic + bypass blocker)
 *   - 3 interior fillers (rozproszone WEWNĄTRZ trap pocketu, NIE blokują bridges)
 * 
 * Wszystkie filler positions zweryfikowane:
 *   ✓ Nie blokują bridge access (>200px od najbliższego bridge endpoint)
 *   ✓ Nie kolidują z river hitbox (>140px od river center line)
 *   ✓ Nie kolidują z sandstorm collision (>40px od world boundary)
 *   ✓ Min 110px between rocks (collision-safe spacing)
 * 
 * v0.18.2-fix2 zmiany vs v0.18.2-fix1:
 *   - Usunięto (0.27, 0.92) i (0.23, 0.86) — blokowały bridge 8 SE corner
 *   - Dodano (0.10, 0.86), (0.02, 0.88), (0.07, 0.90) w SW trap pocket
 *   - Przeniesiono NE fillers do safer pozycji + dodano (0.71, 0.05)
 */
export const DESERT_RIVER_CATARACT_ROCKS = [
    // === NE KATARAKTA (start rzeki) — 8 rocks ===
    // Perimeter (5)
    { x: WORLD_W * 0.93, y: WORLD_H * 0.05, size: 80, seed: 51 },   // E od river start (blokuje E bypass)
    { x: WORLD_W * 0.88, y: WORLD_H * 0.02, size: 75, seed: 53 },   // NE od river start
    { x: WORLD_W * 0.82, y: WORLD_H * 0.02, size: 70, seed: 57 },   // NW od river start
    { x: WORLD_W * 0.96, y: WORLD_H * 0.12, size: 65, seed: 61 },   // NE corner fill
    { x: WORLD_W * 0.87, y: WORLD_H * 0.09, size: 90, seed: 63 },   // PROMINENTNA, "skała w wodzie"
    // Interior fillers (3) — rozproszone w trap pocket, daleko od bridge 1 (~0.763, 0.165)
    { x: WORLD_W * 0.74, y: WORLD_H * 0.08, size: 60, seed: 91 },   // środkowo-zachodnia
    { x: WORLD_W * 0.83, y: WORLD_H * 0.07, size: 55, seed: 93 },   // środkowo-wschodnia (przesunięta z 0.78, 0.04)
    { x: WORLD_W * 0.71, y: WORLD_H * 0.05, size: 45, seed: 95 },   // NW edge filler (NOWA, +density)
    
    // === SW KATARAKTA (koniec rzeki) — 8 rocks ===
    // Perimeter (5)
    { x: WORLD_W * 0.07, y: WORLD_H * 0.95, size: 80, seed: 71 },   // W od river end (blokuje W bypass)
    { x: WORLD_W * 0.15, y: WORLD_H * 0.98, size: 75, seed: 73 },   // SE od river end
    { x: WORLD_W * 0.04, y: WORLD_H * 0.98, size: 70, seed: 77 },   // SW corner fill
    { x: WORLD_W * 0.20, y: WORLD_H * 0.96, size: 65, seed: 81 },   // E edge blocker
    { x: WORLD_W * 0.13, y: WORLD_H * 0.91, size: 90, seed: 83 },   // PROMINENTNA, "skała w wodzie"
    // Interior fillers (3) — DALEKO od bridge 8 (~0.234, 0.896), w prawdziwym SW trap pocket
    { x: WORLD_W * 0.10, y: WORLD_H * 0.86, size: 55, seed: 101 },  // upper trap pocket (NEW, było 0.27,0.92)
    { x: WORLD_W * 0.02, y: WORLD_H * 0.88, size: 50, seed: 103 },  // far W edge (NEW, było 0.23,0.86)
    { x: WORLD_W * 0.07, y: WORLD_H * 0.90, size: 45, seed: 105 },  // mid-pocket filler (NOWA, +density)
];

// =================================================================
// FAZA 4b — QUICKSAND ZONES (uproszczone do 1 dużej strefy per trap pocket)
// =================================================================

/**
 * v0.18.2-fix2: TRAP POCKET QUICKSAND — uproszczone z 4 stref (2 duże + 2 małe)
 * do 2 dużych stref (po 1 per pocket). Cleaner visual + dokładne pozycjonowanie.
 * 
 * Zmiany vs v0.18.2-fix1:
 *   - NE big: (0.76, 0.07) → (0.78, 0.04) — WYŻEJ (user request "powinien być wyżej")
 *   - SW big: (0.25, 0.90) → (0.18, 0.84) — NAD rzeką, NIE w rzece (user request)
 *   - Usunięto 2 małe quicksand (były nieczytelne i powodowały konfuzję)
 *   - Powiększone rX 130→150, rY 40→50 dla lepszej widoczności
 * 
 * Total: 5 stref (3 standardowe + 2 trap pocket).
 */
export const DESERT_QUICKSAND_LAYOUT = [
    // === STANDARDOWE STREFY (strategiczne, risk/reward) ===
    { x: WORLD_W * 0.20, y: WORLD_H * 0.45, rX: 75, rY: 50, seed: 13 },
    { x: WORLD_W * 0.42, y: WORLD_H * 0.62, rX: 85, rY: 60, seed: 19 },
    { x: WORLD_W * 0.88, y: WORLD_H * 0.18, rX: 70, rY: 48, seed: 29 },
    
    // === TRAP POCKET DETERRENT (1 duża per pocket, powiększona dla widoczności) ===
    // NE trap pocket — WYŻEJ (przesunięta z 0.07 → 0.04)
    { x: WORLD_W * 0.78, y: WORLD_H * 0.04, rX: 150, rY: 50, seed: 41 },
    // SW trap pocket — NAD rzeką (przesunięta z (0.25,0.90) → (0.18,0.84))
    // River najbliższy punkt: (0.18, 0.92), więc quicksand bottom edge y=0.853, river top y=0.903 → gap 200px ✅
    { x: WORLD_W * 0.08, y: WORLD_H * 0.84, rX: 150, rY: 50, seed: 45 },
];

// =================================================================
// PADS (MediPad + PowerPad)
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