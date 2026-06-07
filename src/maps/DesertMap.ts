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

/**
 * Layout piramid na pustyni — 3 piramidy w 3 rogach mapy (różne rozmiary).
 * Format: { x, y, size, seed } — seed dla wariacji flicker phase.
 */
export interface PyramidLayoutEntry {
    x: number;
    y: number;
    size: number;
    seed: number;
}

export const DESERT_PYRAMID_LAYOUT: PyramidLayoutEntry[] = [
    { x: WORLD_W * 0.18, y: WORLD_H * 0.72, size: 280, seed: 1 },  // największa, południowy zachód
    { x: WORLD_W * 0.55, y: WORLD_H * 0.82, size: 240, seed: 2 },  // średnia, środek-południe
    { x: WORLD_W * 0.85, y: WORLD_H * 0.42, size: 210, seed: 3 },  // mała, wschód
];

// =================================================================
// FAZA 2b — SPHINX
// =================================================================

/**
 * Pozycja Sphinxa — centrum mapy (między piramidami).
 * sizeX = długość ciała, sizeY = wysokość (head + body).
 */
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

/**
 * Polyline path rzeki Nil — diagonalna trasa NE→SW z 2 meandrami.
 * 16 punktów dla smooth meandering bez wymuszania bezier curves.
 * Sprawdzone matematycznie — omija piramidy, sphinx, i large rocks (>200px clearance).
 */
export interface RiverPathPoint {
    x: number;
    y: number;
}

export const DESERT_RIVER_PATH: RiverPathPoint[] = [
    { x: WORLD_W * 0.85, y: WORLD_H * 0.05 },  // start NE corner
    { x: WORLD_W * 0.79, y: WORLD_H * 0.13 },
    { x: WORLD_W * 0.72, y: WORLD_H * 0.22 },
    { x: WORLD_W * 0.66, y: WORLD_H * 0.28 },
    { x: WORLD_W * 0.65, y: WORLD_H * 0.33 },  // meander 1 (przebieg E)
    { x: WORLD_W * 0.66, y: WORLD_H * 0.40 },
    { x: WORLD_W * 0.69, y: WORLD_H * 0.46 },
    { x: WORLD_W * 0.70, y: WORLD_H * 0.52 },  // meander 1 apex
    { x: WORLD_W * 0.66, y: WORLD_H * 0.59 },
    { x: WORLD_W * 0.58, y: WORLD_H * 0.66 },
    { x: WORLD_W * 0.50, y: WORLD_H * 0.72 },  // meander 2 apex
    { x: WORLD_W * 0.45, y: WORLD_H * 0.77 },
    { x: WORLD_W * 0.37, y: WORLD_H * 0.83 },
    { x: WORLD_W * 0.27, y: WORLD_H * 0.88 },
    { x: WORLD_W * 0.18, y: WORLD_H * 0.92 },
    { x: WORLD_W * 0.10, y: WORLD_H * 0.95 },  // end SW corner
];

/** Szerokość rzeki (visible water body, hitbox = width + 60 internally). */
export const DESERT_RIVER_WIDTH = 80;

/** Liczba mostów rozsianych wzdłuż rzeki (evenly spaced przez RiverNile.computeBridgeLayout). */
export const DESERT_BRIDGE_COUNT = 8;

/** Bridge długość (across river) — dłuższy wymiar, prostopadły do flow. */
export const DESERT_BRIDGE_DECK_LENGTH = 180;

/** Bridge szerokość (along flow) — 1.25× tank width, walking strip. */
export const DESERT_BRIDGE_DECK_WIDTH = 125;

// =================================================================
// FAZA 4a — SKAŁY (Large + Small)
// =================================================================

/**
 * Layout dużych skał (collidable cover) — 7 manual fixed positions.
 * Strategicznie rozmieszczone jako cover dla gracza.
 * Sprawdzone matematycznie — nie kolidują z piramidami (>300px), sphinx, river path.
 */
export const DESERT_LARGE_ROCKS_LAYOUT = [
    { x: WORLD_W * 0.05, y: WORLD_H * 0.40, size: 90, seed: 11 },   // W brzeg, między pyramid #1 i N
    { x: WORLD_W * 0.20, y: WORLD_H * 0.30, size: 75, seed: 17 },   // N od pyramid #1
    { x: WORLD_W * 0.38, y: WORLD_H * 0.18, size: 95, seed: 23 },   // N central
    { x: WORLD_W * 0.32, y: WORLD_H * 0.55, size: 80, seed: 31 },   // między pyramid #1 i sphinx
    { x: WORLD_W * 0.78, y: WORLD_H * 0.62, size: 100, seed: 37 },  // S od pyramid #3
    { x: WORLD_W * 0.62, y: WORLD_H * 0.95, size: 75, seed: 43 },   // SE corner
    { x: WORLD_W * 0.05, y: WORLD_H * 0.62, size: 85, seed: 47 },   // W brzeg, dalej niż pyramid #1
];

/** Liczba małych skał (procedural, no collision, dekoracja). */
export const DESERT_SMALL_ROCKS_COUNT = 35;

/** Małe skały — min size. */
export const DESERT_SMALL_ROCK_MIN_SIZE = 15;

/** Małe skały — max size. */
export const DESERT_SMALL_ROCK_MAX_SIZE = 35;

// =================================================================
// v0.18.2 — KATARAKTY NILU (rozwiązanie problemu widocznych końcówek rzeki)
// =================================================================

/**
 * 2 klastry skał przy krańcach rzeki tworzące wizualną narrację "rzeka wpływa/wypływa przez skały".
 * Rozwiązuje problem widocznych "zaokrąglonych końcówek" rzeki:
 *   - Wizualnie: woda przechodzi przez skały → naturalne kataraktowanie (jak Aswan w Egipcie)
 *   - Gameplay: rocks collision blokuje gracza przed objechaniem rzeki bokiem
 * 
 * NE klaster: 5 skał wokół startu rzeki (0.85, 0.05), wypełnia gap do NE corner mapy.
 * SW klaster: 5 skał wokół końca rzeki (0.10, 0.95), wypełnia gap do SW corner mapy.
 * 
 * Wszystkie 'large' tier → pełna collision (ruch + pociski).
 * Format zgodny z DESERT_LARGE_ROCKS_LAYOUT (same fields: x, y, size, seed).
 */
export const DESERT_RIVER_CATARACT_ROCKS = [
    // NE katarakta (start rzeki — wjazd Nilu na mapę)
    { x: WORLD_W * 0.93, y: WORLD_H * 0.05, size: 80, seed: 51 },   // E od river start (blokuje E bypass)
    { x: WORLD_W * 0.88, y: WORLD_H * 0.02, size: 75, seed: 53 },   // NE od river start
    { x: WORLD_W * 0.82, y: WORLD_H * 0.02, size: 70, seed: 57 },   // NW od river start (blokuje N bypass)
    { x: WORLD_W * 0.96, y: WORLD_H * 0.12, size: 65, seed: 61 },   // NE corner fill
    { x: WORLD_W * 0.87, y: WORLD_H * 0.09, size: 90, seed: 63 },   // PROMINENTNA, "skała w wodzie" SE of start
    
    // SW katarakta (koniec rzeki — wyjazd Nilu z mapy)
    { x: WORLD_W * 0.07, y: WORLD_H * 0.95, size: 80, seed: 71 },   // W od river end (blokuje W bypass)
    { x: WORLD_W * 0.15, y: WORLD_H * 0.98, size: 75, seed: 73 },   // SE od river end
    { x: WORLD_W * 0.04, y: WORLD_H * 0.98, size: 70, seed: 77 },   // SW corner fill
    { x: WORLD_W * 0.20, y: WORLD_H * 0.96, size: 65, seed: 81 },   // E edge blocker
    { x: WORLD_W * 0.13, y: WORLD_H * 0.91, size: 90, seed: 83 },   // PROMINENTNA, "skała w wodzie" NE of end
];

// =================================================================
// FAZA 4b — QUICKSAND ZONES
// =================================================================

/**
 * Layout stref ruchomych piasków — 3 owalne strefy z slowdown 50%.
 * Format: { x, y, rX (radius X), rY (radius Y), seed }.
 * NO collision — gracz/wrog wjeżdża i zwalnia (Player/Enemy.speedModifier).
 * 
 * v0.18.1-fix1: pozycje zweryfikowane vs WSZYSTKIE inne obiekty (rzeka, piramidy, sphinx, large rocks).
 * Math check (min distance from each obstacle):
 *   - Strefa 1 (0.20, 0.45): >250px od pyramid #1, >300px od sphinx, >400px od rzeki ✅
 *   - Strefa 2 (0.42, 0.62): >280px od sphinx, >250px od pyramid #2, >350px od rzeki ✅
 *   - Strefa 3 (0.88, 0.18): >300px od pyramid #3, >450px od rzeki (NE corner sucha) ✅
 */
export const DESERT_QUICKSAND_LAYOUT = [
    { x: WORLD_W * 0.20, y: WORLD_H * 0.45, rX: 75, rY: 50, seed: 13 },   // W od sphinx, między pyramid #1 i large rock W
    { x: WORLD_W * 0.42, y: WORLD_H * 0.62, rX: 85, rY: 60, seed: 19 },   // S od sphinx (bezpieczna strefa centralna)
    { x: WORLD_W * 0.88, y: WORLD_H * 0.18, rX: 70, rY: 48, seed: 29 },   // NE corner (sucha pustynia, daleko od river start)
];

// =================================================================
// PADS (MediPad + PowerPad) — desert variants visual w src/maps/desert/
// =================================================================

/**
 * Pozycje MediPadów (DesertHeartPad) na pustyni — odpowiedniki repair hangars z v4.48.
 * 3 strefy w różnych ćwiartkach mapy (przesunięte żeby nie kolidować z piramidami/quicksand).
 */
export const DESERT_MEDI_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    { x: WORLD_W * 0.18, y: WORLD_H * 0.50 },
    { x: WORLD_W * 0.82, y: WORLD_H * 0.28 },
    { x: WORLD_W * 0.52, y: WORLD_H * 0.30 },
];

/**
 * Pozycje PowerPadów (DesertStormPad) na pustyni — odpowiednik power well z v4.48.
 * 2 strefy (dla równowagi vs CityMap).
 */
export const DESERT_POWER_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    { x: WORLD_W * 0.72, y: WORLD_H * 0.62 },   // power well z v4.48
    { x: WORLD_W * 0.25, y: WORLD_H * 0.18 },   // bonus dla balansu
];