import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * TropicsMap.ts — definicje mapy Tropiki (karaibskie gospodarstwo).
 *
 * v0.25.0 (FAZA T1 Foundation): tylko buildTropicsTexture() — soczysta laka
 * z 7000 mikroteksturami w 8 odcieniach zieleni, sun lighting NW->SE,
 * meadow wave streaks, wildflowers, premium vignette.
 *
 * Layout exports (TROPICS_*_LAYOUT) sa puste — wypelniane w FAZA T2-T10.
 *
 * Design intent (Mariusz brief):
 * - Karaibska kraina osadnikow, gospodarstwa rolnicze (BEZ morza)
 * - Pogoda jasna, slonce z lewego gornego rogu (globalne oswietlenie)
 * - Stealth: zboze (FAZA T2), drzewa (FAZA T8)
 * - Collision: budynki gospodarskie (FAZA T4-T5), wiatrak (T6), stajnia (T9)
 * - Destructible: skrzynie (FAZA T7)
 * - Decoration: kamyczki przy drogach (T3), siano (T10), kwiatki (juz w tekturze)
 */

// =================================================================
// PALETA TROPIKOW — Premium Brawl Stars-style green meadow
// =================================================================

/** Globalny kierunek swiatla. Slonce upper-left → cienie offset SE. */
export const TROPICS_LIGHT = Object.freeze({
    shX: 4,           // shadow offset X (px, na prawo)
    shY: 4,           // shadow offset Y (px, w dol)
    highlightAlpha: 0.18,
    shadowAlpha: 0.28,
});

/** 8 odcieni soczystej zieleni dla mikrotekstury */
const MEADOW_GREENS = [
    '#88d65a',  // light sunlit blade
    '#a3e074',  // bright tip
    '#c2ee94',  // pale grass blade
    '#5fa83e',  // mid green
    '#6dba4a',  // base (color variation)
    '#4a8c32',  // shadow side
    '#3a7028',  // deep shadow
    '#2e5a20',  // darkest accent
];

/** Brazowa gleba widoczna miedzy trawa (warstwa 2) */
const SOIL_TONES = ['#3a5028', '#4a6038', '#2e4218', '#5a7048'];

/** Akcenty kwiatowe — sparse wildflowers */
const FLOWER_COLORS = ['#ffffff', '#f9e5a8', '#e8c0e0', '#f0a8a8', '#c8d0ff'];

// =================================================================
// buildTropicsTexture — bake'owana raz, cached w PIXI.Texture
// =================================================================

/**
 * Statyczna tekstura tropikow — bake'owana raz z Canvas 2D.
 * Sloneczna laka z mikrotekstura, gradient swiatla, smugi wiatru, kwiatki.
 *
 * Performance: ~22-28ms na bake (Canvas 2D 3000x3000), wykonywane RAZ
 * przy starcie gry. Per-frame koszt = 0 (PIXI cache).
 */
export function buildTropicsTexture(): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;

    // ── 1. Base soczysta laka ──────────────────────────────────────
    c.fillStyle = '#6dba4a';
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // ── 2. Sun lighting gradient (NW jasniej, SE ciemniej) ────────
    // Slonce w lewym gornym rogu — symulacja diagonal lighting
    const sunGrad = c.createLinearGradient(0, 0, WORLD_W, WORLD_H);
    sunGrad.addColorStop(0.00, 'rgba(255,245,180,0.22)');  // NW: cieple zlote sunlight
    sunGrad.addColorStop(0.45, 'rgba(255,245,180,0.05)');  // mid: subtle blend
    sunGrad.addColorStop(1.00, 'rgba(20,40,15,0.18)');     // SE: chlodniejszy cien
    c.fillStyle = sunGrad;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // ── 3. Bardzo delikatna siatka orientacyjna ───────────────────
    c.strokeStyle = 'rgba(0,30,0,0.020)';
    c.lineWidth = 1;
    for (let x = 0; x < WORLD_W; x += 100) {
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, WORLD_H); c.stroke();
    }
    for (let y = 0; y < WORLD_H; y += 100) {
        c.beginPath(); c.moveTo(0, y); c.lineTo(WORLD_W, y); c.stroke();
    }

    // ── 4. Meadow wave streaks — wiatr na trawie (80 smug) ────────
    for (let i = 0; i < 80; i++) {
        const sx = Math.random() * WORLD_W;
        const sy = Math.random() * WORLD_H;
        const len = 80 + Math.random() * 220;
        const ang = Math.random() * Math.PI * 2;
        const ex = sx + Math.cos(ang) * len;
        const ey = sy + Math.sin(ang) * len;
        const cx = (sx + ex) / 2 + (Math.random() - 0.5) * 40;
        const cy = (sy + ey) / 2 + (Math.random() - 0.5) * 40;

        c.save();
        c.globalAlpha = 0.10 + Math.random() * 0.18;
        c.strokeStyle = Math.random() < 0.6 ? '#c2ee94' : '#fff5b8';
        c.lineWidth = 1 + Math.random() * 2.5;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(sx, sy);
        c.quadraticCurveTo(cx, cy, ex, ey);
        c.stroke();
        c.restore();
    }

    // ── 5. Mikrotekstura warstwa 1 — 3500 plamek zieleni (8 odcieni) ──
    for (let i = 0; i < 3500; i++) {
        const x = Math.random() * WORLD_W;
        const y = Math.random() * WORLD_H;
        const rx = 2.5 + Math.random() * 7;
        const ry = 1.5 + Math.random() * 3.5;
        const ang = Math.random() * Math.PI;
        const alpha = 0.18 + Math.random() * 0.30;
        const col = MEADOW_GREENS[Math.floor(Math.random() * MEADOW_GREENS.length)];

        c.save();
        c.globalAlpha = alpha;
        c.fillStyle = col;
        c.beginPath();
        c.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // ── 6. Mikrotekstura warstwa 2 — 3500 plamek gleby (ciemniejsze) ──
    for (let i = 0; i < 3500; i++) {
        const x = Math.random() * WORLD_W;
        const y = Math.random() * WORLD_H;
        const rx = 1.5 + Math.random() * 4;
        const ry = 1 + Math.random() * 2;
        const ang = Math.random() * Math.PI;
        const alpha = 0.10 + Math.random() * 0.16;
        const col = SOIL_TONES[Math.floor(Math.random() * SOIL_TONES.length)];

        c.save();
        c.globalAlpha = alpha;
        c.fillStyle = col;
        c.beginPath();
        c.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // ── 7. Wildflower accents — 200 kwiatkow (5-platkowe) ─────────
    for (let i = 0; i < 200; i++) {
        const fx = Math.random() * WORLD_W;
        const fy = Math.random() * WORLD_H;
        const alpha = 0.55 + Math.random() * 0.35;
        const col = FLOWER_COLORS[Math.floor(Math.random() * FLOWER_COLORS.length)];

        c.save();
        c.globalAlpha = alpha;
        // 5 platkow
        c.fillStyle = col;
        for (let p = 0; p < 5; p++) {
            const pAng = (p / 5) * Math.PI * 2;
            c.beginPath();
            c.ellipse(fx + Math.cos(pAng) * 2.5, fy + Math.sin(pAng) * 2.5, 2.2, 2.2, 0, 0, Math.PI * 2);
            c.fill();
        }
        // Zolty srodek
        c.fillStyle = '#f7dc6f';
        c.beginPath();
        c.arc(fx, fy, 1.4, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // ── 8. Premium vignette — edge framing ────────────────────────
    const vig = c.createRadialGradient(
        WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.4,
        WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.85,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(15,40,10,0.22)');
    c.fillStyle = vig;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    return PIXI.Texture.from(cv);
}

// =================================================================
// LAYOUT EXPORTS — placeholders dla FAZA T2-T10
// =================================================================

/**
 * FAZA T2 — Stealth zones: kwadratowe pola KUKURYDZY (corn fields).
 * v0.27.4: zmiana z owalnych pol zboza na prostokątne pola kukurydzy.
 * Format: x/y = TOP-LEFT corner (nie center jak elipsa!), w/h = rozmiar.
 *
 * Gracz w polu → 10s stealth (analog Oasis). Plus kukurydza ZASLANIA czolg
 * (Y-sort zIndex) — efekt "chowania za", jak Brawl Stars bushes.
 */
/**
 * v0.36.0 FAZA T7.1 — 3 typy pól rolniczych + zachowane corn (5 pól total).
 * Każde pole ma `type` — main.ts spawn loop tworzy odpowiednią entity per type.
 */
export type FarmFieldType = 'corn' | 'sugarcane' | 'lettuce' | 'pasture';

export const TROPICS_FARM_FIELDS_LAYOUT: Array<{ type: FarmFieldType; x: number; y: number; w: number; h: number; seed: number }> = [
    // 🌽 2× corn (keep z T2 oryginalnego setupa)
    { type: 'corn',      x: WORLD_W * 0.08,    y: WORLD_H * 0.10,    w: 200, h: 180, seed: 21 },  // NW corner
    { type: 'corn',      x: WORLD_W * 0.08,    y: WORLD_H * 0.65,    w: 200, h: 180, seed: 31 },  // SW flank
    // 🎋 1× sugarcane (stealth tropical, obok stodoły N-central)
    { type: 'sugarcane', x: WORLD_W * 0.5367,  y: WORLD_H * 0.12,    w: 220, h: 200, seed: 29 },
    // 🥬 1× lettuce (rozjeżdżalne warzywa SE corner)
    { type: 'lettuce',   x: WORLD_W * 0.78,    y: WORLD_H * 0.78,    w: 200, h: 180, seed: 23 },
    // 🐄 1× pasture + traktor (długie poziome pole E flank, v0.36.1: +40% długości)
    { type: 'pasture',   x: WORLD_W * 0.70,    y: WORLD_H * 0.5533,  w: 700, h: 200, seed: 37 },
];

/** v0.36.0 BACKWARDS COMPAT: zachowany dla kodu, który może referencować corn-only entries. */
export const TROPICS_CORN_LAYOUT: Array<{ x: number, y: number, w: number, h: number, seed: number }> =
    TROPICS_FARM_FIELDS_LAYOUT
        .filter(f => f.type === 'corn')
        .map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h, seed: f.seed }));

/**
 * FAZA T3 — Drogi szutrowe ORTHOGONAL GRID (path waypoints).
 * v0.29.0: drogi wylacznie poziome lub pionowe (Manhattan-style),
 * brak krzywizn ani Catmull-Rom interpolation.
 *
 * Layout strategiczny (9 dróg, pola kukurydzy OBOK dróg):
 *   1. Główna N-S — pionowa linia x=1500, wychodzi POZA mape (y: -200 → 3200)
 *   2. Główna E-W — pozioma linia y=1500, wychodzi POZA mape (x: -200 → 3200)
 *   3. L-shape do power pad NW (900, 900) — z głównej E-W
 *   4. Do corn NW (340, 390) — pozioma z głównej N-S
 *   5. Do corn E (2440, 1500) — pozioma z głównej E-W
 *   6. Do corn SW (440, 2040) — pozioma z głównej N-S
 *   7. Do corn SE (2340, 2430) — pozioma z głównej N-S
 *   8. Do power pad SE (2100, 2100) — pozioma z głównej N-S (na y=2100)
 *   9. Do corn N-center (1610, 460) — pozioma z głównej N-S
 *
 * KAZDA para sasiednich waypoints MUSI dzielic same x LUB same y.
 * Diagonalne segmenty wywoluja console.warn w DirtRoad.ts.
 */
export const TROPICS_DIRT_ROAD_PATHS: Array<Array<{ x: number, y: number }>> = [
    // 1. Główna N-S (pionowa, wychodzi poza mape)
    [
        { x: 1500, y: -200 },
        { x: 1500, y: 3200 },
    ],
    // 2. Główna E-W (pozioma, wychodzi poza mape)
    [
        { x: -200, y: 1500 },
        { x: 3200, y: 1500 },
    ],
    // 3. Do power pad NW (900, 750) — pionowy stub z głównej E-W, kończy się przed pad
    [
        { x: 900, y: 1500 },
        { x: 900, y: 850 },
    ],
    // 4. Do corn NW (~340, 390) — pozioma z głównej N-S
    [
        { x: 1500, y: 390 },
        { x: 440,  y: 390 },
    ],
    // 5. Do corn E (NOWA pozycja: y=1660+) — pionowy stub z głównej E-W
    [
        { x: 2440, y: 1500 },
        { x: 2440, y: 1660 },
    ],
    // 6. Do corn SW (~440, 2040) — pozioma z głównej N-S
    [
        { x: 1500, y: 2040 },
        { x: 440,  y: 2040 },
    ],
    // 7. Do corn SE (~2340, 2430) — pozioma z głównej N-S
    [
        { x: 1500, y: 2430 },
        { x: 2340, y: 2430 },
    ],
    // 8. Do power pad SE (2250, 2100) — pozioma z głównej N-S, kończy się przed pad
    [
        { x: 1500, y: 2100 },
        { x: 2200, y: 2100 },
    ],
    // 9. Do corn N-center (NOWA pozycja: x=1610+) — pozioma z głównej N-S
    [
        { x: 1500, y: 460 },
        { x: 1610, y: 460 },
    ],
    // 10. Do stodoły NE (T4a) — pionowy stub z głównej E-W do bottom-center stodoły
    [
        { x: 2030, y: 1500 },
        { x: 2030, y: 920 },
    ],
    // 11. Do obory T4c — pionowy stub z road #7 (y=2430) do front S obory (y=2400)
    [
        { x: 1730, y: 2430 },
        { x: 1730, y: 2400 },
    ],
    // 12. Do NW cottage T5 — pionowy 190px stub z road #4 (y=390) do top NW cottage (y=580)
    [
        { x: 1260, y: 390 },
        { x: 1260, y: 580 },
    ],
    // 13. Do NE cottage T5 — pionowy 60px stub z main E-W (y=1500) do bot NE cottage (y=1440)
    [
        { x: 2480, y: 1500 },
        { x: 2480, y: 1440 },
    ],
    // 14. Do SE cottage T5 — pionowy 110px stub z road #8 (y=2100) do bot SE cottage (y=1990)
    [
        { x: 1930, y: 2100 },
        { x: 1930, y: 1990 },
    ],
];

/**
 * FAZA T4 — Budynki gospodarskie (Caribbean farmstead).
 * v0.30.0 T4a: tylko stodoła. T4b dodaje kurnik, T4c dodaje oborę.
 *
 * Layout strategiczny:
 *   - Stodoła w NE quadrant (gameplay cover blisko medi pad NE)
 *   - Kurnik tuż obok stodoły (farm cluster, T4b)
 *   - Obora w SW quadrant (gameplay cover daleko od stodoły, T4c)
 *
 * Math-verified: 0 kolizji z drogami, corn fields, pad-ami (Python 2D check).
 */
export const TROPICS_FARM_BUILDINGS_LAYOUT: Array<{ x: number, y: number, w: number, h: number, type: 'barn' | 'henhouse' | 'cowshed', seed: number }> = [
    { x: 1900, y: 700,  w: 260, h: 220, type: 'barn',     seed: 41 },  // T4a: Stodoła NE
    { x: 500,  y: 1355, w: 130, h: 110, type: 'henhouse', seed: 53 },  // T4b #1: NW od drogi E-W (v0.39.1: y=1370→1355 dla patrol tractor clearance)
    { x: 700,  y: 1900, w: 130, h: 110, type: 'henhouse', seed: 67 },  // T4b #2: SW kwadrant, blisko road #6 + corn SW
    { x: 2700, y: 1355, w: 130, h: 110, type: 'henhouse', seed: 89 },  // T4b #3: NE od drogi (v0.39.1: y=1370→1355 dla patrol tractor clearance)
    { x: 1610, y: 2200, w: 240, h: 200, type: 'cowshed',  seed: 109 }, // T4c: Obora — front S 30px od road #7 (1500-2340 y=2430), 110px od N-S main road
];

/** FAZA T5 — Domki jednorodzinne. Pusty w T1. */
export const TROPICS_HOUSES_LAYOUT: Array<{ x: number, y: number, w: number, h: number, palette: 'teal' | 'yellow' | 'pink', seed: number }> = [
    { x: 1180, y: 580,  w: 160, h: 140, palette: 'teal',   seed: 131 }, // T5 NW: turkusowa, front N → road #4 (190px), road #12 stub do top
    { x: 2400, y: 1300, w: 160, h: 140, palette: 'yellow', seed: 157 }, // T5 NE: zolta, front S → main E-W (60px), road #13 stub do bot
    { x: 1850, y: 1850, w: 160, h: 140, palette: 'pink',   seed: 173 }, // T5 SE: rozowa, front S → road #8 (110px), road #14 stub do bot
];

/** FAZA T6 — Wiatrak (1 dominujący landmark W od stodoły). v0.35.1 */
export const TROPICS_WINDMILL_POSITION: { x: number, y: number, seed: number } | null = {
    x: 1650, y: 660, seed: 701,
};

/** FAZA T7 — Skrzynie zniszczalne. Pusty w T1. */
/**
 * FAZA T7 — Crates (drewniane skrzynie destruktywne).
 * v0.34.1: 90 sztuk w 20 grupach (po 4-5 sztuk) — math-verified 0 kolizji.
 * Brak singles — wszystkie zgrupowane (Mariusz feedback: "wyłącznie zgrupowane w 4-5 sztuk").
 * Formacje: 2x2 (4 crates), 5_plus (2x2 + center top), L-shape (5 crates).
 * HP=3 (ENEMY_NORMAL), respawn 60s, player collision PAD=8 (większa granica wjazdu).
 */
export const TROPICS_CRATES_LAYOUT: Array<{ x: number, y: number, seed: number }> = [
    // Group #1 (2x2, 4 crates) NW corner
    { x: 90,   y: 180,  seed: 301 }, { x: 132,  y: 180,  seed: 302 },
    { x: 90,   y: 222,  seed: 303 }, { x: 132,  y: 222,  seed: 304 },
    // Group #2 (5_plus, 5 crates) W flank
    { x: 130,  y: 720,  seed: 305 }, { x: 172,  y: 720,  seed: 306 },
    { x: 130,  y: 762,  seed: 307 }, { x: 172,  y: 762,  seed: 308 }, { x: 151,  y: 678,  seed: 309 },
    // Group #3 (2x2, 4 crates) N central
    { x: 700,  y: 150,  seed: 310 }, { x: 742,  y: 150,  seed: 311 },
    { x: 700,  y: 192,  seed: 312 }, { x: 742,  y: 192,  seed: 313 },
    // Group #4 (L-shape, 5 crates) center NW
    { x: 850,  y: 1180, seed: 314 }, { x: 892,  y: 1180, seed: 315 }, { x: 934,  y: 1180, seed: 316 },
    { x: 850,  y: 1222, seed: 317 }, { x: 850,  y: 1264, seed: 318 },
    // Group #5 (2x2, 4 crates) W center
    { x: 300,  y: 1100, seed: 319 }, { x: 342,  y: 1100, seed: 320 },
    { x: 300,  y: 1142, seed: 321 }, { x: 342,  y: 1142, seed: 322 },
    // Group #6 (5_plus, 5 crates) N (NE)
    { x: 1700, y: 150,  seed: 323 }, { x: 1742, y: 150,  seed: 324 },
    { x: 1700, y: 192,  seed: 325 }, { x: 1742, y: 192,  seed: 326 }, { x: 1721, y: 108,  seed: 327 },
    // Group #7 (2x2, 4 crates) NE corner
    { x: 2230, y: 200,  seed: 328 }, { x: 2272, y: 200,  seed: 329 },
    { x: 2230, y: 242,  seed: 330 }, { x: 2272, y: 242,  seed: 331 },
    // Group #8 (2x2, 4 crates) E flank top
    { x: 2880, y: 300,  seed: 332 }, { x: 2922, y: 300,  seed: 333 },
    { x: 2880, y: 342,  seed: 334 }, { x: 2922, y: 342,  seed: 335 },
    // Group #9 (L-shape, 5 crates) center NE
    { x: 2200, y: 1000, seed: 336 }, { x: 2242, y: 1000, seed: 337 }, { x: 2284, y: 1000, seed: 338 },
    { x: 2200, y: 1042, seed: 339 }, { x: 2200, y: 1084, seed: 340 },
    // Group #10 (5_plus, 5 crates) E flank center
    { x: 2880, y: 1100, seed: 341 }, { x: 2922, y: 1100, seed: 342 },
    { x: 2880, y: 1142, seed: 343 }, { x: 2922, y: 1142, seed: 344 }, { x: 2901, y: 1058, seed: 345 },
    // Group #11 (2x2, 4 crates) W flank SW
    { x: 140,  y: 1700, seed: 346 }, { x: 182,  y: 1700, seed: 347 },
    { x: 140,  y: 1742, seed: 348 }, { x: 182,  y: 1742, seed: 349 },
    // Group #12 (5_plus, 5 crates) N center SW
    { x: 1100, y: 1620, seed: 350 }, { x: 1142, y: 1620, seed: 351 },
    { x: 1100, y: 1662, seed: 352 }, { x: 1142, y: 1662, seed: 353 }, { x: 1121, y: 1578, seed: 354 },
    // Group #13 (2x2, 4 crates) SW corner
    { x: 200,  y: 2400, seed: 355 }, { x: 242,  y: 2400, seed: 356 },
    { x: 200,  y: 2442, seed: 357 }, { x: 242,  y: 2442, seed: 358 },
    // Group #14 (L-shape, 5 crates) S center SW
    { x: 1100, y: 2700, seed: 359 }, { x: 1142, y: 2700, seed: 360 }, { x: 1184, y: 2700, seed: 361 },
    { x: 1100, y: 2742, seed: 362 }, { x: 1100, y: 2784, seed: 363 },
    // Group #15 (2x2, 4 crates) SE-ish SW
    { x: 1320, y: 2200, seed: 364 }, { x: 1362, y: 2200, seed: 365 },
    { x: 1320, y: 2242, seed: 366 }, { x: 1362, y: 2242, seed: 367 },
    // Group #16 (2x2, 4 crates) NW SE
    { x: 1700, y: 1700, seed: 368 }, { x: 1742, y: 1700, seed: 369 },
    { x: 1700, y: 1742, seed: 370 }, { x: 1742, y: 1742, seed: 371 },
    // Group #17 (5_plus, 5 crates) MOVED +76px south z drogi E-W (v0.39.1)
    // Math: top crate y=1534 → 7px gap od tractor sweep bottom (1527)
    // Bottom crates y=1618 → bottom y=1660 = exact touch z pasture top (no overlap)
    { x: 2200, y: 1576, seed: 372 }, { x: 2242, y: 1576, seed: 373 },
    { x: 2200, y: 1618, seed: 374 }, { x: 2242, y: 1618, seed: 375 }, { x: 2221, y: 1534, seed: 376 },
    // Group #18 (2x2, 4 crates) E flank SE
    { x: 2880, y: 1750, seed: 377 }, { x: 2922, y: 1750, seed: 378 },
    { x: 2880, y: 1792, seed: 379 }, { x: 2922, y: 1792, seed: 380 },
    // Group #19 (5_plus, 5 crates) SE corner
    { x: 2880, y: 2400, seed: 381 }, { x: 2922, y: 2400, seed: 382 },
    { x: 2880, y: 2442, seed: 383 }, { x: 2922, y: 2442, seed: 384 }, { x: 2901, y: 2358, seed: 385 },
    // Group #20 (L-shape, 5 crates) S center SE
    { x: 1750, y: 2800, seed: 386 }, { x: 1792, y: 2800, seed: 387 }, { x: 1834, y: 2800, seed: 388 },
    { x: 1750, y: 2842, seed: 389 }, { x: 1750, y: 2884, seed: 390 },
];

/** FAZA T8 — Drzewa (skupiska). Pusty w T1. */
export const TROPICS_TREE_CLUSTERS_LAYOUT: Array<{ x: number, y: number, count: number, types: Array<'birch' | 'lime' | 'pine'>, seed: number }> = [];

/** FAZA T9 — Stajnia + zagroda + konie. Pusty w T1. */
export const TROPICS_STABLE_LAYOUT: { x: number, y: number, paddockW: number, paddockH: number, horseCount: number, seed: number } | null = null;

/** FAZA T10 — Stawy rybne + walecki siana. Puste w T1. */
export const TROPICS_FISH_PONDS_LAYOUT: Array<{ x: number, y: number, w: number, h: number, seed: number }> = [];
export const TROPICS_HAY_BALES_LAYOUT: Array<{ x: number, y: number, seed: number }> = [];

// =================================================================
// PADS — dla T1 reusujemy generic HoverRepairPad + PowerHoverPad (city-style)
// FAZA T10 dostarczy custom tropics pads (TropicsHayPad? TropicsWellPad?)
// =================================================================

export const TROPICS_MEDI_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    // v0.38.4: przesunięte żeby NIE leżały na drogach
    { x: WORLD_W * 0.20, y: WORLD_H * 0.54 },    // (600, 1620) — 70px poniżej E-W road
    { x: WORLD_W * 0.80, y: WORLD_H * 0.30 },    // (2400, 900) — zostaje, było OK
    { x: WORLD_W * 0.57, y: WORLD_H * 0.84 },    // (1710, 2520) — off N-S + off road #7
];

export const TROPICS_POWER_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    // v0.38.4: przesunięte żeby NIE leżały na drogach
    { x: WORLD_W * 0.30, y: WORLD_H * 0.23 },    // (900, 700) — 50px clearance nad końcem drogi #3 (y=850)
    { x: WORLD_W * 0.75, y: WORLD_H * 0.70 },    // (2250, 2100) — 50px wschód od końca drogi #8 (x=2200)
];

/**
 * v0.39.1 FAZA T7.2 — PATROL TRACTOR Manhattan waypoints.
 *
 * Cross-pattern route przez center junction (1500, 1500). Każdy "leg" składa się z
 * 2 ortogonalnych segmentów wzdłuż głównych dróg (N-S x=1500 + E-W y=1500).
 * NIGDY diagonal cuts — tylko Manhattan paths po drogach.
 *
 * Total route: 8 waypoints (4 destinations + 4 transit passes through center).
 * Math-verified clear of all buildings + crates (po przesunięciu Hen #1/#3 +Group #17).
 *
 * Loop time: ~7950px @ 0.65 px/frame = ~204s driving + 18s pauzy = ~3.7 min/loop.
 */
export const TROPICS_PATROL_WAYPOINTS: Array<{ x: number, y: number, pause?: number }> = [
    { x: 1500, y: 460,  pause: 4 },     // N destination — corn N-center area
    { x: 1500, y: 1500 },               // center transit (no pause)
    { x: 2440, y: 1500, pause: 5 },     // E destination — corn E / pasture area
    { x: 1500, y: 1500 },               // center transit
    { x: 1500, y: 2430, pause: 4 },     // S destination — corn SE / lettuce area
    { x: 1500, y: 1500 },               // center transit
    { x: 440,  y: 1500, pause: 5 },     // W destination — corn SW area
    { x: 1500, y: 1500 },               // center transit (loop back to N)
];