import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * ArcticMap.ts — definicje mapy Arktyka (lodowcowa niecka "Krystaliczny Poranek").
 *
 * FAZA A v2 (Ice Sheet Intensification — "zmiana 2"):
 * - Gas bubbles subsurface (400 elips, AAA micro-detail lodu).
 * - Pekniejcia 9 -> 15, cieniejsze (drawCracksAAA / drawCrackPolylineAAA) -> "stary, zuzyty lod".
 * - Wiecej blobow tonalnych (70 -> 120) ale nizsza alfa -> miekka glebia bez "smug".
 * - Mocniejszy sun-gradient + szerszy/glebszy vignette (kolor z palety: DEPTH_DARK, NIE abyss-granat).
 * - NOWY export ARCTIC_PALETTE -> single source of truth kolorow; GlacialBorder ja importuje
 *   (spojnosc krawedzi = ten sam lod co tafla).
 *
 * FAZA A v1: bazowa 3-warstwowa podloga + "Kociol Lodowcowy".
 *
 * Layout exports (ARCTIC_*_LAYOUT) puste — wypelniane w FAZA B-E.
 *
 * Design intent ("Krystaliczny Poranek"):
 *  - NIGDY #FFFFFF jako albedo — lod jest niebiesko-zloty. Slonce upper-LEFT (NW), cienie SE.
 *  - Pekniejcie = podwojny lip (jasny od slonca + granat od cienia) -> 2.5D.
 *  - Czytelnosc gate: pekniejcia to PASSABLE dekoracja (cienkie linie), odrozne od barykad (FAZA B).
 */

// =================================================================
// PALETA "KRYSTALICZNY PORANEK" — Zasada Zero Czystej Bieli
// Single source of truth (export) — GlacialBorder importuje dla spojnosci.
// =================================================================

export const ARCTIC_PALETTE = Object.freeze({
    albedo:       '#e8f4f8', // tafla wlasciwa (jasny chlodny cyjan)
    midtint:      '#bcdfec', // wariacja tonalna lodu
    depth:        '#15323d', // dno / metna glebia (widoczna w pekniejciach + vignette)
    shadow:       '#4a6fa5', // cien na lodzie (lazur/perla) — uzywany tez na krawedziach
    gold:         '#fff9e6', // refleks (szampanskie zloto)
    crackSun:     '#bfe6f5', // lip pekniejcia od strony slonca
    crackShadow:  '#1b3a6b', // lip pekniejcia od strony cienia (granat)
    frost:        '#dfeef4', // szron / zdeptany snieg (matowy)
});

const ICE_ALBEDO        = ARCTIC_PALETTE.albedo;
const ICE_MIDTINT       = ARCTIC_PALETTE.midtint;
const DEPTH_DARK        = ARCTIC_PALETTE.depth;
const SPECULAR_GOLD     = ARCTIC_PALETTE.gold;
const CRACK_SUN_EDGE    = ARCTIC_PALETTE.crackSun;
const CRACK_SHADOW_EDGE = ARCTIC_PALETTE.crackShadow;
const FROST_DECAL       = ARCTIC_PALETTE.frost;

/** Globalny kierunek swiatla — slonce upper-left, cienie offset SE. */
export const ARCTIC_LIGHT = Object.freeze({
    shX: 4,
    shY: 4,
    highlightAlpha: 0.20,
    shadowAlpha: 0.30,
});

// =================================================================
// Deterministyczny RNG (mulberry32) — stabilny bake przy re-entry mapy
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
// buildArcticTexture — bake'owana raz, cached w PIXI.Texture
// =================================================================

/**
 * Statyczna tekstura arktyki (3000x3000). 3 warstwy: dno -> tafla z pekniejciami
 * 2.5D + gas bubbles -> szron-decal.
 *
 * Performance: ~26-32ms bake na starcie (RAZ). Per-frame koszt = 0 (PIXI cache).
 * Static-baked — NIE odswieza sie przez Vite HMR, wymaga re-entry mapy.
 */
export function buildArcticTexture(): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    const rng = makeRng(0x00a2c71c);

    // ── 1. Base ice albedo (tafla wlasciwa) ───────────────────────
    c.fillStyle = ICE_ALBEDO;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // ── 2. Sun lighting gradient (zmiana 2: mocniejszy, podkresla 2.5D niecke) ──
    const sun = c.createLinearGradient(0, 0, WORLD_W, WORLD_H);
    sun.addColorStop(0.00, 'rgba(255,249,230,0.30)'); // NW: szampanskie sunlight
    sun.addColorStop(0.50, 'rgba(255,249,230,0.02)'); // mid: subtle blend
    sun.addColorStop(1.00, 'rgba(74,111,165,0.35)');  // SE: lazurowy cien
    c.fillStyle = sun;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // ── 3. NOWE (zmiana 2): Lodowe banki gazu (AAA subsurface detail) ──
    // 400 malych przezroczystych elips -> warstwy lodu w glab. Klasyk lodu AAA.
    for (let i = 0; i < 400; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const r = 3 + rng() * 10;
        c.save();
        c.globalAlpha = 0.03 + rng() * 0.05;
        c.fillStyle = ICE_MIDTINT;
        c.beginPath();
        c.ellipse(x, y, r, r * (0.6 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // ── 4. Szerokie plamy tonalne (zmiana 2: 120 plam, nizsza alfa) ──
    for (let i = 0; i < 120; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const r = 120 + rng() * 320;
        c.save();
        c.globalAlpha = 0.03 + rng() * 0.04;
        c.fillStyle = rng() < 0.5 ? ICE_MIDTINT : '#ffffff';
        c.beginPath();
        c.ellipse(x, y, r, r * (0.5 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // ── 5. Frost micro-grain (2800 ziaren szronu) — bez zmian, jest super ──
    for (let i = 0; i < 2800; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const rx = 1.2 + rng() * 4.5;
        const ry = 0.8 + rng() * 2.2;
        c.save();
        c.globalAlpha = 0.06 + rng() * 0.16;
        c.fillStyle = rng() < 0.5 ? FROST_DECAL : ICE_MIDTINT;
        c.beginPath();
        c.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // ── 6. Gigantyczne pekniejcia lodu (zmiana 2: 15 szt., cieniejsze) ──
    drawCracksAAA(c, rng);

    // ── 7. Plamy zdeptanego sniegu (matowy szron-decal) — bez zmian ──
    for (let i = 0; i < 120; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const r = 16 + rng() * 46;
        c.save();
        c.globalAlpha = 0.05 + rng() * 0.10;
        c.fillStyle = FROST_DECAL;
        c.beginPath();
        const pts = 7;
        for (let p = 0; p <= pts; p++) {
            const a = (p / pts) * Math.PI * 2;
            const rr = r * (0.7 + rng() * 0.5);
            const px = x + Math.cos(a) * rr;
            const py = y + Math.sin(a) * rr * 0.7;
            if (p === 0) c.moveTo(px, py);
            else c.lineTo(px, py);
        }
        c.closePath();
        c.fill();
        c.restore();
    }

    // ── 8. Specular gold glints (sun-side sparkle) — bez zmian, slonce grzeje ──
    for (let i = 0; i < 170; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const r = 1.5 + rng() * 3.5;
        c.save();
        const alpha = 0.30 + rng() * 0.45;
        c.globalAlpha = alpha;
        c.fillStyle = SPECULAR_GOLD;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = alpha * 0.6;
        c.beginPath();
        c.arc(x - r, y - r, r * 0.5, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // ── 9. Premium vignette (zmiana 2: szerszy + glebszy, kolor DEPTH_DARK z palety) ──
    // Uwaga: NIE uzywamy abyss-granatu — DEPTH_DARK (#15323d) jest juz w tafli (srodki
    // pekniejc), wiec krawedz pozostaje spojna kolorystycznie z reszta mapy.
    const vig = c.createRadialGradient(
        WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.35,
        WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.90,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(21,50,61,0.38)'); // #15323d @ 0.38
    c.fillStyle = vig;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    return PIXI.Texture.from(cv);
}

// =================================================================
// Pekniejcia 2.5D AAA (zmiana 2) — wiecej, cieniej, intensywniejsze lipy
// =================================================================

function drawCracksAAA(c: CanvasRenderingContext2D, rng: () => number): void {
    const CRACK_COUNT = 15;
    for (let i = 0; i < CRACK_COUNT; i++) {
        const startX = rng() * WORLD_W;
        const startY = rng() * WORLD_H;
        const segs = 5 + Math.floor(rng() * 6);
        const baseAng = rng() * Math.PI * 2;
        const pts: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
        let ang = baseAng;
        let px = startX;
        let py = startY;
        for (let s = 0; s < segs; s++) {
            ang += (rng() - 0.5) * 0.9;
            const len = 90 + rng() * 230;
            px += Math.cos(ang) * len;
            py += Math.sin(ang) * len;
            pts.push({ x: px, y: py });
        }
        drawCrackPolylineAAA(c, pts, 1);

        // okazjonalna odnoga
        if (rng() < 0.6 && pts.length > 3) {
            const bi = 1 + Math.floor(rng() * (pts.length - 2));
            const bpts: Array<{ x: number; y: number }> = [pts[bi]];
            let bang = baseAng + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.8);
            let bx = pts[bi].x;
            let by = pts[bi].y;
            const bsegs = 2 + Math.floor(rng() * 3);
            for (let s = 0; s < bsegs; s++) {
                bang += (rng() - 0.5) * 0.8;
                const len = 70 + rng() * 150;
                bx += Math.cos(bang) * len;
                by += Math.sin(bang) * len;
                bpts.push({ x: bx, y: by });
            }
            drawCrackPolylineAAA(c, bpts, 0.7);
        }
    }
}

/** AAA crack: cieniejsze crevasse, intensywniejsze lipy (premium feel). */
function drawCrackPolylineAAA(
    c: CanvasRenderingContext2D,
    pts: Array<{ x: number; y: number }>,
    scale: number,
): void {
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';

    // 1. crevasse opening (ciemne dno, wezsze)
    c.globalAlpha = 0.85;
    c.strokeStyle = DEPTH_DARK;
    c.lineWidth = 4 * scale;
    strokePath(c, pts, 0, 0);

    // 2. oswietlony lip (NW)
    c.globalAlpha = 0.70;
    c.strokeStyle = CRACK_SUN_EDGE;
    c.lineWidth = 1.8 * scale;
    strokePath(c, pts, -1.5, -1.5);

    // 3. zacieniony lip (SE, granat)
    c.globalAlpha = 0.70;
    c.strokeStyle = CRACK_SHADOW_EDGE;
    c.lineWidth = 1.8 * scale;
    strokePath(c, pts, 1.5, 1.5);

    c.restore();
}

function strokePath(
    c: CanvasRenderingContext2D,
    pts: Array<{ x: number; y: number }>,
    ox: number,
    oy: number,
): void {
    c.beginPath();
    c.moveTo(pts[0].x + ox, pts[0].y + oy);
    for (let i = 1; i < pts.length; i++) {
        c.lineTo(pts[i].x + ox, pts[i].y + oy);
    }
    c.stroke();
}

// =================================================================
// LAYOUT EXPORTS — placeholders dla FAZA B-E
// =================================================================

/** FAZA B — barykady "Ciosane Baszty" (2.5D heksagonalne bloki). Pusty w FAZA A. */
export const ARCTIC_BARRICADES_LAYOUT: Array<{ x: number; y: number; w: number; h: number; seed: number }> = [];

/** FAZA C — gory lodowe (monolity rozdzielajace alejki, parallax). Pusty w FAZA A. */
export const ARCTIC_ICEBERG_LAYOUT: Array<{ x: number; y: number; size: number; seed: number }> = [];

// =================================================================
// PADS — FAZA A reuse generic HoverRepairPad + PowerHoverPad (jak Tropics T1).
// Math-verified (WORLD 3000, border T=130 -> playable [130,2870]):
//   wszystkie wewnatrz playable, najblizszy dystans do krawedzi = 520px.
// =================================================================

export const ARCTIC_MEDI_PAD_POSITIONS: Array<{ x: number; y: number }> = [
    { x: 650,  y: 1550 },
    { x: 2350, y: 900 },
    { x: 1500, y: 2350 },
];

export const ARCTIC_POWER_PAD_POSITIONS: Array<{ x: number; y: number }> = [
    { x: 950,  y: 800 },
    { x: 2150, y: 2100 },
];