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

/** FAZA T2 — Stealth zones (lany zboza). 5 stref na mapie, math-verified distances. */
export const TROPICS_WHEAT_LAYOUT: Array<{ x: number, y: number, rX: number, rY: number, seed: number }> = [
    { x: WORLD_W * 0.15, y: WORLD_H * 0.15, rX: 130, rY: 85, seed: 21 },  // NW corner — flanking spawn
    { x: WORLD_W * 0.85, y: WORLD_H * 0.85, rX: 130, rY: 85, seed: 23 },  // SE corner — symmetric
    { x: WORLD_W * 0.55, y: WORLD_H * 0.20, rX: 150, rY: 95, seed: 29 },  // N-center — strategic mid (bigger)
    { x: WORLD_W * 0.15, y: WORLD_H * 0.70, rX: 130, rY: 85, seed: 31 },  // SW flank
    { x: WORLD_W * 0.85, y: WORLD_H * 0.55, rX: 130, rY: 85, seed: 37 },  // E flank
];

/** FAZA T3 — Drogi szutrowe (path waypoints). Pusty w T1. */
export const TROPICS_DIRT_ROAD_PATHS: Array<Array<{ x: number, y: number }>> = [];

/** FAZA T4 — Budynki gospodarskie (stodola/kurnik/obora). Pusty w T1. */
export const TROPICS_FARM_BUILDINGS_LAYOUT: Array<{ x: number, y: number, w: number, h: number, type: 'barn' | 'henhouse' | 'cowshed', seed: number }> = [];

/** FAZA T5 — Domki jednorodzinne. Pusty w T1. */
export const TROPICS_HOUSES_LAYOUT: Array<{ x: number, y: number, w: number, h: number, seed: number }> = [];

/** FAZA T6 — Wiatrak (zwykle 1 dominujacy). Pusty w T1. */
export const TROPICS_WINDMILL_POSITION: { x: number, y: number, seed: number } | null = null;

/** FAZA T7 — Skrzynie zniszczalne. Pusty w T1. */
export const TROPICS_CRATES_LAYOUT: Array<{ x: number, y: number, size: 'small' | 'medium', seed: number }> = [];

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
    { x: WORLD_W * 0.20, y: WORLD_H * 0.50 },
    { x: WORLD_W * 0.80, y: WORLD_H * 0.30 },
    { x: WORLD_W * 0.50, y: WORLD_H * 0.80 },
];

export const TROPICS_POWER_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    { x: WORLD_W * 0.30, y: WORLD_H * 0.30 },
    { x: WORLD_W * 0.70, y: WORLD_H * 0.70 },
];