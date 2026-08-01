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
    auroraCyan:   '#42e3d3', // AAA v3: odbicia zorzy na tafli (AD)
    auroraPurple: '#b366ff', // AAA v3: odbicia zorzy na tafli (AD)
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

    // ── 1b. AAA v3 (AD): Zamrozone Relikty gleboko pod lodem (subsurface lore) ──
    // Ledwie widoczne cienie — "cos tam zamarzlo". Dreszczyk eksploracji, koszt 0.
    drawFrozenRelics(c, rng);

    // ── 2. Sun lighting gradient (zmiana 2: mocniejszy, podkresla 2.5D niecke) ──
    const sun = c.createLinearGradient(0, 0, WORLD_W, WORLD_H);
    sun.addColorStop(0.00, 'rgba(255,249,230,0.30)'); // NW: szampanskie sunlight
    sun.addColorStop(0.50, 'rgba(255,249,230,0.02)'); // mid: subtle blend
    sun.addColorStop(1.00, 'rgba(74,111,165,0.35)');  // SE: lazurowy cien
    c.fillStyle = sun;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // ── 2b. AAA v3 (AD): Odbicia Zorzy Polarnej — miekkie wstegi na tafli ──
    // 'lighter' TYLKO w bake'u (zero runtime blend). Wow-factor 1. wejscia.
    drawAuroraReflections(c, rng);

    // ── 3. AAA v3 (AD): Klastry baniek gazu — wezowe lancuchy (szlaki wedrowki
    // gazu pod lodem) zamiast losowego scatteru 400. Natura, ten sam koszt.
    drawGasBubbleClusters(c, rng);

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
// AAA v3 (AD) — Relikty / Zorza / Klastry baniek (wszystko w bake'u, koszt/frame = 0)
// =================================================================

/** Zamrozone gleboko pod lodem cienie (lore). Alpha ekstremalnie niska — sugestia, nie obiekt. */
function drawFrozenRelics(c: CanvasRenderingContext2D, rng: () => number): void {
    c.save();
    c.globalAlpha = 0.045; // ledwie widoczne — NIE moze czytac sie jako obiekt/strefa (Czytelnosc)
    c.fillStyle = DEPTH_DARK;
    for (let i = 0; i < 5; i++) {
        const cx = 300 + rng() * (WORLD_W - 600);
        const cy = 300 + rng() * (WORLD_H - 600);
        const angle = rng() * Math.PI * 2;
        const size = 150 + rng() * 250;
        c.translate(cx, cy);
        c.rotate(angle);
        c.beginPath();
        c.moveTo(0, -size);
        c.bezierCurveTo(size * 0.5, -size * 0.8, size * 0.2, size * 0.8, 0, size);
        c.bezierCurveTo(-size * 0.6, size * 0.6, -size * 0.3, -size * 0.5, 0, -size);
        c.fill();
        c.rotate(-angle);
        c.translate(-cx, -cy);
    }
    c.restore();
}

/** Odbicia zorzy: 3 szerokie bezier-wstegi, composite 'lighter' (tylko w bake'u). */
function drawAuroraReflections(c: CanvasRenderingContext2D, rng: () => number): void {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
        const startY = rng() * WORLD_H;
        const cp1x = WORLD_W * 0.33, cp1y = startY + (rng() - 0.5) * 600;
        const cp2x = WORLD_W * 0.66, cp2y = startY + (rng() - 0.5) * 600;
        const endY = rng() * WORLD_H;
        c.beginPath();
        c.moveTo(0, startY);
        c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, WORLD_W, endY);
        c.lineWidth = 150 + rng() * 200;
        c.globalAlpha = 0.03 + rng() * 0.02; // super delikatne — tafla ODBIJA, nie swieci
        c.strokeStyle = rng() > 0.5 ? ARCTIC_PALETTE.auroraCyan : ARCTIC_PALETTE.auroraPurple;
        c.stroke();
    }
    c.restore();
}

/** Banki gazu w wezowych lancuchach (klastry) — szlaki wedrowki gazu pod lodem. */
function drawGasBubbleClusters(c: CanvasRenderingContext2D, rng: () => number): void {
    for (let i = 0; i < 35; i++) {
        let x = rng() * WORLD_W;
        let y = rng() * WORLD_H;
        const bubblesInCluster = 5 + Math.floor(rng() * 15);
        const direction = rng() * Math.PI * 2;
        for (let b = 0; b < bubblesInCluster; b++) {
            const r = 2 + rng() * 8;
            c.save();
            c.globalAlpha = 0.03 + rng() * 0.06;
            c.fillStyle = ICE_MIDTINT;
            c.beginPath();
            c.ellipse(x, y, r, r * (0.7 + rng() * 0.3), rng() * Math.PI, 0, Math.PI * 2);
            c.fill();
            c.restore();
            x += Math.cos(direction + (rng() - 0.5)) * (r * 2.5);
            y += Math.sin(direction + (rng() - 0.5)) * (r * 2.5);
        }
    }
}

// =================================================================
// Pekniejcia 2.5D AAA (zmiana 2) — wiecej, cieniej, intensywniejsze lipy
// =================================================================

function drawCracksAAA(c: CanvasRenderingContext2D, rng: () => number): void {
    // ARC-R1 (decyzja Mariusza): pekniecia ZLAGODZONE — 15->7, tansze odnogi,
    // nizsze alphy i ciensze linie w drawCrackPolylineAAA. Tafla ma byc tlem, nie siatka rys.
    const CRACK_COUNT = 7;
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

        // okazjonalna odnoga (ARC-R1: rzadziej — zlagodzone)
        if (rng() < 0.35 && pts.length > 3) {
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

    // ARC-R1: zlagodzone (bylo: 0.85/4px + lipy 0.70/1.8px — tafla wygladala jak potluczona)
    // 1. crevasse opening (ciemne dno, wezsze)
    c.globalAlpha = 0.55;
    c.strokeStyle = DEPTH_DARK;
    c.lineWidth = 2.5 * scale;
    strokePath(c, pts, 0, 0);

    // 2. oswietlony lip (NW)
    c.globalAlpha = 0.45;
    c.strokeStyle = CRACK_SUN_EDGE;
    c.lineWidth = 1.4 * scale;
    strokePath(c, pts, -1.5, -1.5);

    // 3. zacieniony lip (SE, granat)
    c.globalAlpha = 0.45;
    c.strokeStyle = CRACK_SHADOW_EDGE;
    c.lineWidth = 1.4 * scale;
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

/**
 * ARC-R1 "LODOWA ARENA" (koncepcja Mariusza 2026-08-01) — niszczalne kostki lodu.
 * x/y = TOP-LEFT kostki 56x56 (jak crates w Tropics). Layout WYGENEROWANY +
 * MATH-VERIFIED (scratchpad arctic_r1_layout.js, ALL PASSED):
 *   playable [40,2960] (nowa waska granica ArcticBorder) · korytarze miedzy
 *   klastrami >=210px · przeswit padow >=160 / przerebli+stacji+igloo >=170 ·
 *   spawn-center czysty >=420px. 41 kostek w 12 klastrach (sciany 2-4 szt.).
 */
export const ARCTIC_ICE_CUBES_LAYOUT: Array<{ x: number; y: number; seed: number }> = [
    { x: 927, y: 2535, seed: 201 },
    { x: 988, y: 2537, seed: 202 },
    { x: 923, y: 2605, seed: 203 },
    { x: 991, y: 2606, seed: 204 },
    { x: 1391, y: 2642, seed: 205 },
    { x: 1453, y: 2639, seed: 206 },
    { x: 1457, y: 2702, seed: 207 },
    { x: 252, y: 1123, seed: 208 },
    { x: 315, y: 1117, seed: 209 },
    { x: 250, y: 1189, seed: 210 },
    { x: 318, y: 1183, seed: 211 },
    { x: 917, y: 1530, seed: 212 },
    { x: 984, y: 1530, seed: 213 },
    { x: 983, y: 1591, seed: 214 },
    { x: 1628, y: 1737, seed: 215 },
    { x: 1689, y: 1735, seed: 216 },
    { x: 1758, y: 1738, seed: 217 },
    { x: 1692, y: 1808, seed: 218 },
    { x: 2559, y: 111, seed: 219 },
    { x: 2625, y: 112, seed: 220 },
    { x: 2561, y: 179, seed: 221 },
    { x: 2673, y: 1001, seed: 222 },
    { x: 2737, y: 1000, seed: 223 },
    { x: 2667, y: 1069, seed: 224 },
    { x: 2734, y: 1066, seed: 225 },
    { x: 317, y: 1901, seed: 226 },
    { x: 386, y: 1907, seed: 227 },
    { x: 381, y: 1967, seed: 228 },
    { x: 1782, y: 2571, seed: 229 },
    { x: 1851, y: 2565, seed: 230 },
    { x: 1916, y: 2568, seed: 231 },
    { x: 1847, y: 2631, seed: 232 },
    { x: 1251, y: 1947, seed: 233 },
    { x: 1247, y: 2011, seed: 234 },
    { x: 126, y: 1536, seed: 235 },
    { x: 188, y: 1532, seed: 236 },
    { x: 123, y: 1599, seed: 237 },
    { x: 189, y: 1598, seed: 238 },
    { x: 2503, y: 2064, seed: 239 },
    { x: 2574, y: 2064, seed: 240 },
    { x: 2635, y: 2062, seed: 241 },
    { x: 1568, y: 858, seed: 242 },
    { x: 1636, y: 854, seed: 243 },
    { x: 1701, y: 854, seed: 244 },
    { x: 1634, y: 924, seed: 245 },
    { x: 907, y: 1879, seed: 246 },
    { x: 974, y: 1878, seed: 247 },
    { x: 909, y: 1949, seed: 248 },
    { x: 970, y: 1945, seed: 249 },
    { x: 2132, y: 1289, seed: 250 },
    { x: 2196, y: 1286, seed: 251 },
    { x: 2264, y: 1288, seed: 252 },
    { x: 984, y: 1109, seed: 253 },
    { x: 1050, y: 1104, seed: 254 },
    { x: 1112, y: 1109, seed: 255 },
    { x: 1044, y: 1168, seed: 256 },
    { x: 338, y: 2222, seed: 257 },
    { x: 334, y: 2293, seed: 258 },
    { x: 335, y: 2358, seed: 259 },
    { x: 287, y: 180, seed: 260 },
    { x: 288, y: 252, seed: 261 },
    { x: 1890, y: 544, seed: 262 },
    { x: 1959, y: 542, seed: 263 },
    { x: 1893, y: 612, seed: 264 },
    { x: 1960, y: 613, seed: 265 },
    { x: 2689, y: 1375, seed: 266 },
    { x: 2757, y: 1383, seed: 267 },
    { x: 2756, y: 1442, seed: 268 },
    { x: 574, y: 1070, seed: 269 },
    { x: 641, y: 1064, seed: 270 },
    { x: 703, y: 1069, seed: 271 },
    { x: 636, y: 1133, seed: 272 },
    { x: 829, y: 247, seed: 273 },
    { x: 897, y: 246, seed: 274 },
    { x: 825, y: 314, seed: 275 },
    { x: 894, y: 313, seed: 276 },
    { x: 2652, y: 651, seed: 277 },
    { x: 2719, y: 652, seed: 278 },
    { x: 2783, y: 657, seed: 279 },
    { x: 1261, y: 725, seed: 280 },
    { x: 1325, y: 725, seed: 281 },
    { x: 1263, y: 788, seed: 282 },
    { x: 349, y: 2696, seed: 283 },
    { x: 351, y: 2764, seed: 284 },
    { x: 346, y: 2827, seed: 285 },
    { x: 178, y: 583, seed: 286 },
    { x: 243, y: 585, seed: 287 },
    { x: 310, y: 589, seed: 288 },
    { x: 1080, y: 2281, seed: 289 },
    { x: 1142, y: 2285, seed: 290 },
    { x: 1207, y: 2285, seed: 291 },
    { x: 2148, y: 1604, seed: 292 },
    { x: 2214, y: 1602, seed: 293 },
    { x: 2069, y: 133, seed: 294 },
    { x: 2062, y: 201, seed: 295 },
    { x: 2172, y: 2677, seed: 296 },
    { x: 2174, y: 2743, seed: 297 },
    { x: 1768, y: 1188, seed: 298 },
    { x: 1836, y: 1190, seed: 299 },
    { x: 517, y: 104, seed: 300 },
    { x: 585, y: 105, seed: 301 },
    { x: 520, y: 168, seed: 302 },
    { x: 586, y: 173, seed: 303 },
    { x: 114, y: 2630, seed: 304 },
    { x: 110, y: 2696, seed: 305 },
    { x: 107, y: 2187, seed: 306 },
    { x: 107, y: 2254, seed: 307 },
    { x: 442, y: 838, seed: 308 },
    { x: 502, y: 837, seed: 309 },
    { x: 1795, y: 2193, seed: 310 },
    { x: 1859, y: 2185, seed: 311 },
    { x: 1790, y: 2251, seed: 312 },
    { x: 647, y: 2569, seed: 313 },
    { x: 646, y: 2640, seed: 314 },
    { x: 648, y: 2708, seed: 315 },
    { x: 1764, y: 1481, seed: 316 },
    { x: 1835, y: 1480, seed: 317 },
    { x: 1377, y: 1156, seed: 318 },
    { x: 1444, y: 1154, seed: 319 },
    { x: 2330, y: 184, seed: 320 },
    { x: 2330, y: 251, seed: 321 },
];

/**
 * ARC-R2 — przereble (dziury w lodzie: woda+ryba+foki; czolgi STOP, pociski leca). x/y = CENTER.
 * Feedback Mariusza: rozmiar zmniejszony o polowe (75x55 -> 38x28) — clearance tylko rosnie,
 * layout pozostaje math-verified.
 */
export const ARCTIC_ICE_HOLES_LAYOUT: Array<{ x: number; y: number; rx: number; ry: number; seed: number }> = [
    { x: 620,  y: 560,  rx: 38, ry: 28, seed: 301 },
    { x: 2330, y: 540,  rx: 38, ry: 28, seed: 302 },
    { x: 660,  y: 2300, rx: 38, ry: 28, seed: 303 },
    { x: 2480, y: 1830, rx: 38, ry: 28, seed: 304 },
];

/**
 * ARC-R2 — pingwiny (wzorzec DESERT_CARAVAN_*): ring wokol centrum mapy.
 * Wszystkie punkty w promieniu ~215-230 od (1500,1500) = strefa CENTER_CLEAR layoutu
 * kostek (>=260) => sciezka GWARANTOWANE wolna od przeszkod, zero dodatkowej weryfikacji.
 */
export const ARCTIC_PENGUIN_PATH = [
    { x: 1280, y: 1500 },
    { x: 1350, y: 1360 },
    { x: 1500, y: 1290 },
    { x: 1660, y: 1350 },
    { x: 1725, y: 1500 },
    { x: 1655, y: 1650 },
    { x: 1500, y: 1715 },
    { x: 1350, y: 1650 },
];
export const ARCTIC_PENGUIN_COUNT = 6;
export const ARCTIC_PENGUIN_SPEED = 0.35;          // wolniejsze niz wielblady (czlapanie)
export const ARCTIC_PENGUIN_SPACING = 44;          // gesiego
export const ARCTIC_PENGUIN_DROP_INTERVAL_MS = 15000;

/** ARC-R3 — rezerwa: Polska Stacja Antarktyczna im. Arctowskiego (polnoc-centrum). x/y = CENTER. */
export const ARCTIC_STATION_POS = Object.freeze({ x: 1500, y: 380, w: 480, h: 130 });
/** ARC-R1 — male igloo 2.5D (SE). x/y = CENTER. */
export const ARCTIC_IGLOO_POS = Object.freeze({ x: 2450, y: 2520, size: 115 });

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