import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * DungeonMap.ts — map definitions for LOCHY / DUNGEON (scenariusz SAVE THE QUEEN).
 *
 * Q1 (2026-09-11) anchor mapy wg przepisu map-kit (jak CastleMap.ts); Q2 = layout v2
 * (decyzja Mariusza po playtescie Q1): WIEZIENIE NA WSCHODZIE, zachod = komnata z
 * kolumnami, cela w grubym murze, CIENKA ramka z cegielek (60 px) zamiast grubej skaly.
 * - Paleta "LOCHY" (design doc §9.13): zimny granat-fiolet (podloga/mury), cieple
 *   pomarancz-czerwien TYLKO dla lawy i pochodni, bordo cegly, stalowa ruda, perla +
 *   magenta + fiolet Krolowej. ZERO zlota (Enigma), zero cyjanu (freeze/stealth).
 * - Swiat 3000x3000 (WORLD_W/H — stala silnika). Pole gry = 60..2940.
 * - Layouty FROZEN z tools/queen_q1_layout.mjs (v2, PASS 0 bledow, check V10:
 *   kazdy korytarz 2 cegly wysokosci do celi przechodzi przez Zwornik).
 *   NIE edytowac wspolrzednych recznie — zmienic skrypt, przeliczyc, wkleic.
 *   Konwencja: x/y = TOP-LEFT wszedzie w tym pliku (regula ICollidable).
 * - buildDungeonTexture: plyty bazaltowe + fugi + ramka z cegielek + skala za cela +
 *   baseny lawy (statyczne; scroll/DoT = Q4 DungeonLava) + mosty + kregi gejzerow +
 *   posadzka celi + pochodnie statyczne (animacja = Q5 DungeonTorch). Cegly frontu,
 *   ruda i Krolowa to ENCJE (PrisonBrick / IronOre / Queen), nie bake.
 *
 * Swiatlo T1: NW highlight / SE cien + lokalne cieple podswietlenie od lawy (wpieczone).
 * Q2 polish (2. playtest Mariusza): lawa NIEREGULARNA (dungeonLavaShape, loby na zewnatrz strefy
 * + rozlewiska) z zywa warstwa DungeonLava; gejzery = KRATY WENTOW nad lawa (czytelne "gorace
 * dziury", nie "kola ze szprychami"); detale klimatu: pajeczyny, gruz, kosci, kraty odplywow,
 * kaluze odbijajace pochodnie, kajdany, pekniecia z zarem przy lawie.
 */

export { DUNGEON_PALETTE, DUNGEON_HEX, DUNGEON_LIGHT } from './dungeon/dungeonPalette';
import { DUNGEON_PALETTE as P } from './dungeon/dungeonPalette';
import { lavaPoolOutline, traceSmooth, LAVA_MAX_BULGE } from './dungeon/dungeonLavaShape';

/** Seed obrysu lawy per basen — TEN SAM w bake i w DungeonLava (warstwa animowana). */
export function dungeonLavaSeed(i: number): number { return 0x1a7a + i * 977; }

// =================================================================
// FROZEN LAYOUT — output of tools/queen_q1_layout.mjs (v4, PASS 0 bledow, 168 slotow muru)
// =================================================================

export interface DungeonRect { id: string; x: number; y: number; w: number; h: number }
export interface DungeonPoint { x: number; y: number }

export const DUNGEON_BRICK = 56;

/** Pole gry (wnetrze cienkiej ramki). */
export const DUNGEON_PLAYABLE: DungeonRect = { id: 'playable', x: 60, y: 60, w: 2880, h: 2880 };

/** Wnetrze celi Krolowej 3x4 cegly (168x224). Krolowa stoi w srodku. */
export const DUNGEON_CELL: DungeonRect = { id: 'cell', x: 2544, y: 1388, w: 168, h: 224 };
/** Lita skala za cela (E, do ramki). Kolizja = AABB (DungeonBorder), art w bake. */
export const DUNGEON_ROCK_E: DungeonRect = { id: 'rockE', x: 2712, y: 1108, w: 228, h: 784 };
/** Front wiezienia (W) v4: 10 kol x 14 rz cegiel 56 px (v3 + 2 rzedy N i 2 rzedy S — decyzja
 *  Mariusza po 2. playtescie); kol 9 = przy celi. Brama = rzedy keyRows (PODWOJNY Zwornik,
 *  powiazany), rzedy barRows w kol 9 = prety klatki (bez cegly). */
export const DUNGEON_FRONT = Object.freeze({ x0: 1984, y0: 1108, cols: 10, rows: 14, keyCol: 9, keyRows: [6, 7] as readonly number[], barRows: [5, 8] as readonly number[] });
/** Skrzydla N/S nad/pod cela — masa muru (3x5 cegiel kazde, od gory frontu do skaly). */
export const DUNGEON_WINGS: readonly DungeonRect[] = [
    { id: 'wingN', x: 2544, y: 1108, w: 168, h: 280 },
    { id: 'wingS', x: 2544, y: 1612, w: 168, h: 280 },
];
/** Zelazna klatka celi (cienkie prety): kolizja w DungeonBorder, art w bake. Jedyne wejscie = brama W. */
export const DUNGEON_CAGE: readonly DungeonRect[] = [
    { id: 'cageN', x: 2532, y: 1376, w: 180, h: 12 }, { id: 'cageS', x: 2532, y: 1612, w: 180, h: 12 },
    { id: 'cageW1', x: 2532, y: 1376, w: 12, h: 68 }, { id: 'cageW2', x: 2532, y: 1556, w: 12, h: 68 },
];
/** Pula slotow dynamitu = kazda cegla frontu poza kol. bramy (Q4 losuje 3 przez worldRng). */
export const DUNGEON_DYNAMITE_POOL: readonly string[] = [];

/** Baseny lawy (strefy, bez kolizji; DoT+slow = Q4). */
export const DUNGEON_LAVA: readonly DungeonRect[] = [
    { id: 'lavaN', x: 1900, y: 600, w: 600, h: 360 },
    { id: 'lavaS', x: 1900, y: 2040, w: 600, h: 360 },
    { id: 'lavaNW', x: 400, y: 500, w: 240, h: 200 },
    { id: 'lavaSW', x: 400, y: 2300, w: 240, h: 200 },
];
/** Mosty kamienne przez lawe N/S (pasy podlogi = NIE lawa). */
export const DUNGEON_BRIDGES: readonly DungeonRect[] = [
    { id: 'bridgeN', x: 2100, y: 600, w: 188, h: 360 },
    { id: 'bridgeS', x: 2100, y: 2040, w: 188, h: 360 },
];
/** Kregi gejzerow (r=90) — widoczne od startu (Czytelnosc), erupcje tylko w PANICE (Q4). */
export const DUNGEON_GEYSERS: readonly (DungeonPoint & { id: string })[] = [
    { id: 'gN_in', x: 2194, y: 985 }, { id: 'gS_in', x: 2194, y: 2015 },
    { id: 'gN_out', x: 2194, y: 540 }, { id: 'gS_out', x: 2194, y: 2460 },
];
export const DUNGEON_GEYSER_R = 90;

/** Komnata: kolumnada 8 filarow solid 70x70 (cover, flanka). */
export const DUNGEON_PILLARS: readonly DungeonRect[] = [
    { id: 'pillar0', x: 800, y: 1150, w: 70, h: 70 }, { id: 'pillar1', x: 1050, y: 1150, w: 70, h: 70 },
    { id: 'pillar2', x: 1300, y: 1150, w: 70, h: 70 }, { id: 'pillar3', x: 1550, y: 1150, w: 70, h: 70 },
    { id: 'pillar4', x: 800, y: 1780, w: 70, h: 70 }, { id: 'pillar5', x: 1050, y: 1780, w: 70, h: 70 },
    { id: 'pillar6', x: 1300, y: 1780, w: 70, h: 70 }, { id: 'pillar7', x: 1550, y: 1780, w: 70, h: 70 },
];

/** Q4.5 Zlowroga Wieza — solid 90x90 w centrum kolumnady (V2/V3 PASS w generatorze). */
export const DUNGEON_TOWER: DungeonRect = { id: 'tower', x: 1165, y: 1455, w: 90, h: 90 };
/** Q4.5 szpaler startowy (raiderzy + boss na koncu listy) czeka w kolumnadzie od 1. klatki (V11 PASS). */
export const DUNGEON_START_RANK: readonly DungeonPoint[] = [
    { x: 950, y: 1350 }, { x: 1200, y: 1320 }, { x: 1450, y: 1350 }, { x: 950, y: 1650 }, { x: 1450, y: 1650 }, { x: 1200, y: 1690 },
];

/** Q4.6 Zloty Klucz — kandydaci "samotnych" miejsc (worldRng wybiera 1; V11 PASS). */
export const DUNGEON_KEY_SPOTS: readonly DungeonPoint[] = [
    { x: 180, y: 220 }, { x: 2820, y: 220 }, { x: 180, y: 2780 }, { x: 2820, y: 2780 },
    { x: 1500, y: 330 }, { x: 1500, y: 2670 }, { x: 640, y: 1500 }, { x: 1720, y: 760 }, { x: 1720, y: 2240 },
];
/** Q4.6 STALOWE DRZWI celi — w licu klatki, dokladnie na rzedach bramy (V10 PASS). Otwiera Zloty Klucz. */
export const DUNGEON_KEY_DOOR: DungeonRect = { id: 'keyDoor', x: 2532, y: 1444, w: 12, h: 112 };

/** Pady (SRODEK w layoucie; klasy padow chca TOP-LEFT 100x100 -> -50). */
export const DUNGEON_MEDI_PAD_POSITIONS: readonly DungeonPoint[] = [
    { x: 900 - 50, y: 700 - 50 },
    { x: 900 - 50, y: 2300 - 50 },
];
export const DUNGEON_POWER_PAD_POSITIONS: readonly DungeonPoint[] = [
    { x: 1500 - 50, y: 1500 - 50 },
];

export const DUNGEON_PLAYER_SPAWN: DungeonPoint = { x: 300, y: 1500 };

export type DungeonLaneId = 'N' | 'S' | 'NE' | 'SE';
/** 4 lane'y spawnu wrogow (kraty w ramce) — telegraf pochodnia (Q3/Q5). */
export const DUNGEON_LANES: readonly (DungeonPoint & { id: DungeonLaneId })[] = [
    { id: 'N', x: 1500, y: 140 },
    { id: 'S', x: 1500, y: 2860 },
    { id: 'NE', x: 2760, y: 140 },
    { id: 'SE', x: 2760, y: 2860 },
];

/** Q6: punkty spawnu raiderow — 4 kraty + wnetrze czesci centralnej/wschodniej (decyzja Mariusza; zachod = gracz). V11 PASS. */
export const DUNGEON_SPAWN_SPOTS: readonly (DungeonPoint & { id: string })[] = [
    { id: 'N', x: 1500, y: 140 }, { id: 'S', x: 1500, y: 2860 }, { id: 'NE', x: 2760, y: 140 }, { id: 'SE', x: 2760, y: 2860 },
    { id: 'c1', x: 1000, y: 900 }, { id: 'c2', x: 1400, y: 700 }, { id: 'c3', x: 1800, y: 400 },
    { id: 'c4', x: 1000, y: 2100 }, { id: 'c5', x: 1400, y: 2300 }, { id: 'c6', x: 1800, y: 2600 },
    { id: 'e1', x: 2300, y: 400 }, { id: 'e2', x: 2300, y: 2600 }, { id: 'e3', x: 1700, y: 1300 }, { id: 'e4', x: 1700, y: 1700 },
    { id: 'e5', x: 2650, y: 900 }, { id: 'e6', x: 2650, y: 2100 },
];

/** Srodek Krolowej (w celi). */
export const DUNGEON_QUEEN: DungeonPoint = { x: 2628, y: 1500 };
/** Serce od Krolowej spawnuje przed frontem celi (poza murem). */
export const DUNGEON_QUEEN_HEART_SPAWN: DungeonPoint = { x: 1790, y: 1500 }; // Q5: przed kolumnami dobudowy (annex col -1/-2 = 1872..1984)

/** Pochodnie (statyczne w bake; DungeonTorch Q5 podmienia na 3-klatkowe). <=16. */
export const DUNGEON_TORCHES: readonly DungeonPoint[] = [
    // kraty lane'ow (para na kazda)
    { x: 1440, y: 92 }, { x: 1560, y: 92 }, { x: 1440, y: 2908 }, { x: 1560, y: 2908 },
    { x: 2700, y: 92 }, { x: 2820, y: 92 }, { x: 2700, y: 2908 }, { x: 2820, y: 2908 },
    // wrota W (spawn)
    { x: 92, y: 1400 }, { x: 92, y: 1600 },
    // sciana E przy wiezieniu
    { x: 2908, y: 1200 }, { x: 2908, y: 1800 },
    // komnata (kolumnada) — sciany N/S
    { x: 1200, y: 92 }, { x: 1800, y: 92 }, { x: 1200, y: 2908 }, { x: 1800, y: 2908 },
];

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

/** Czy punkt lezy w lawie (basen minus mosty). Uzywane przez bake i (Q4) DungeonLava. */
export function isDungeonLavaPoint(x: number, y: number): boolean {
    for (const b of DUNGEON_BRIDGES) if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return false;
    for (const l of DUNGEON_LAVA) if (x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h) return true;
    return false;
}

/** Czy punkt lezy w wiezieniu (ruda N/S + front + cela + skala) — predykat spawnu pickupow. */
export function isDungeonPrisonPoint(x: number, y: number): boolean {
    return x >= DUNGEON_FRONT.x0 - 40 && y >= DUNGEON_FRONT.y0 - 40 && y < DUNGEON_FRONT.y0 + DUNGEON_FRONT.rows * DUNGEON_BRICK + 40;
}

// =================================================================
// buildDungeonTexture — baked once (3000x3000).
// =================================================================

export function buildDungeonTexture(): PIXI.Texture {
    const t0 = performance.now();
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    const rng = makeRng(0x0d0e0a52); // "DUNGEON" v2
    const PL = DUNGEON_PLAYABLE;
    const px0 = PL.x, py0 = PL.y, px1 = PL.x + PL.w, py1 = PL.y + PL.h;

    // ── 1. Podloga: bazalt + plyty z fugami (warianty, seed) ──
    c.fillStyle = P.floor;
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    // (POLISH-1: szlifowane kafle fake-3D COFNIETE — Mariusz: "podloga zbyt dominujaca"; wersja z v0.164)
    const SLAB = 120;
    for (let gy = py0; gy < py1; gy += SLAB) {
        for (let gx = px0; gx < px1; gx += SLAB) {
            const v = rng();
            c.fillStyle = v < 0.25 ? P.floorLight : v < 0.5 ? P.floorDark : P.floor;
            c.globalAlpha = 0.55 + rng() * 0.45;
            c.fillRect(gx + 2, gy + 2, SLAB - 4, SLAB - 4);
            c.globalAlpha = 1;
            c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(gx + 2, gy + SLAB - 2); c.lineTo(gx + 2, gy + 2); c.lineTo(gx + SLAB - 2, gy + 2); c.stroke();
            c.strokeStyle = 'rgba(0,0,0,0.35)';
            c.beginPath(); c.moveTo(gx + SLAB - 2, gy + 2); c.lineTo(gx + SLAB - 2, gy + SLAB - 2); c.lineTo(gx + 2, gy + SLAB - 2); c.stroke();
        }
    }
    c.strokeStyle = P.grout; c.lineWidth = 4;
    for (let gx = px0; gx <= px1; gx += SLAB) { c.beginPath(); c.moveTo(gx, py0); c.lineTo(gx, py1); c.stroke(); }
    for (let gy = py0; gy <= py1; gy += SLAB) { c.beginPath(); c.moveTo(px0, gy); c.lineTo(px1, gy); c.stroke(); }
    // cieple swiatlo lawy w fugach (tylko przy basenach)
    c.strokeStyle = P.groutWarm; c.lineWidth = 2; c.globalAlpha = 0.15;
    for (const l of DUNGEON_LAVA) {
        for (let gx = Math.floor((l.x - 240) / SLAB) * SLAB; gx <= l.x + l.w + 240; gx += SLAB) { c.beginPath(); c.moveTo(gx, l.y - 240); c.lineTo(gx, l.y + l.h + 240); c.stroke(); }
        for (let gy = Math.floor((l.y - 240) / SLAB) * SLAB; gy <= l.y + l.h + 240; gy += SLAB) { c.beginPath(); c.moveTo(l.x - 240, gy); c.lineTo(l.x + l.w + 240, gy); c.stroke(); }
    }
    c.globalAlpha = 1;

    // ── 2. Detal: mokre plamy, pekniecia z fioletowym mchem, monety-kamyki ──
    for (let i = 0; i < 90; i++) {
        const x = px0 + rng() * PL.w, y = py0 + rng() * PL.h;
        if (isDungeonLavaPoint(x, y) || isDungeonPrisonPoint(x, y)) continue;
        const r = 30 + rng() * 60;
        c.fillStyle = 'rgba(0,0,0,0.28)';
        c.beginPath(); c.ellipse(x, y, r, r * 0.5, rng() * Math.PI, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(255,200,150,0.18)'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.15, r * 0.35, r * 0.12, -0.4, Math.PI, Math.PI * 1.9); c.stroke();
    }
    for (let i = 0; i < 120; i++) {
        const x = px0 + rng() * PL.w, y = py0 + rng() * PL.h;
        if (isDungeonLavaPoint(x, y) || isDungeonPrisonPoint(x, y)) continue;
        c.strokeStyle = P.grout; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y);
        let cx = x, cy = y;
        for (let s = 0; s < 4; s++) { cx += (rng() - 0.5) * 50; cy += (rng() - 0.5) * 50; c.lineTo(cx, cy); }
        c.stroke();
        c.fillStyle = rng() < 0.5 ? P.moss : P.mossLight; c.globalAlpha = 0.55;
        c.beginPath(); c.ellipse(x + (rng() - 0.5) * 20, y + (rng() - 0.5) * 20, 6 + rng() * 8, 3 + rng() * 3, rng(), 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
    }
    for (let i = 0; i < 160; i++) {
        const x = px0 + rng() * PL.w, y = py0 + rng() * PL.h;
        if (isDungeonLavaPoint(x, y) || isDungeonPrisonPoint(x, y)) continue;
        c.fillStyle = P.coin; c.beginPath(); c.ellipse(x, y, 3.5, 2, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.ellipse(x - 0.8, y - 0.6, 1.6, 0.8, 0, 0, Math.PI * 2); c.fill();
    }
    // komnata: jasniejszy "dywan" posadzki miedzy rzedami kolumn (czytelna sala)
    {
        c.fillStyle = P.floorLight; c.globalAlpha = 0.18;
        c.fillRect(740, 1240, 900, 520);
        c.globalAlpha = 1;
        c.strokeStyle = P.moss; c.lineWidth = 3; c.globalAlpha = 0.35;
        c.strokeRect(746, 1246, 888, 508);
        c.globalAlpha = 1;
    }

    // ── 2b. KLIMAT LOCHOW (Q2 polish): pajeczyny, gruz, kosci, odplywy, kaluze, kajdany ──
    const noGo = (x: number, y: number, m = 0): boolean => isDungeonLavaPoint(x, y) || isDungeonPrisonPoint(x, y)
        || DUNGEON_PILLARS.some(pl => x > pl.x - 60 - m && x < pl.x + pl.w + 60 + m && y > pl.y - 90 - m && y < pl.y + pl.h + 60 + m)
        || [...DUNGEON_MEDI_PAD_POSITIONS, ...DUNGEON_POWER_PAD_POSITIONS].some(pd => x > pd.x - 40 - m && x < pd.x + 140 + m && y > pd.y - 40 - m && y < pd.y + 140 + m)
        || DUNGEON_GEYSERS.some(gz => Math.hypot(x - gz.x, y - gz.y) < DUNGEON_GEYSER_R + 50 + m)
        || (Math.abs(x - DUNGEON_PLAYER_SPAWN.x) < 160 && Math.abs(y - DUNGEON_PLAYER_SPAWN.y) < 160);
    // pajeczyny w 4 katach pola gry + przy kratach lane'ow (na scianie, nad podloga)
    const cobweb = (x: number, y: number, dirX: number, dirY: number, r: number): void => {
        c.strokeStyle = 'rgba(225,215,245,0.34)'; c.lineWidth = 1.5;
        const a0 = Math.atan2(dirY, dirX) - Math.PI / 4;
        for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke(); }
        for (let k = 1; k <= 4; k++) {
            const rr = (k / 4) * r; c.beginPath();
            for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); const sag = i === 0 || i === 6 ? 0 : rr * 0.08; const px = x + Math.cos(a) * (rr - sag), py = y + Math.sin(a) * (rr - sag); if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }
            c.stroke();
        }
    };
    cobweb(px0, py0, 1, 1, 150); cobweb(px1, py0, -1, 1, 130); cobweb(px0, py1, 1, -1, 120); cobweb(px1, py1, -1, -1, 160);
    cobweb(1160, py0, 0.4, 1, 70); cobweb(1840, py1, -0.4, -1, 80);
    // kraty odplywow (4): kwadrat 44x44, prety, fioletowy sluz sciekajacy
    for (const d of [{ x: 640, y: 1000 }, { x: 640, y: 2000 }, { x: 1720, y: 420 }, { x: 1720, y: 2580 }]) {
        c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(d.x + 22, d.y + 26, 34, 22, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.stoneDark; c.fillRect(d.x - 4, d.y - 4, 52, 52);
        c.fillStyle = '#0b0710'; c.fillRect(d.x, d.y, 44, 44);
        c.fillStyle = P.iron; for (let k = 0; k < 5; k++) c.fillRect(d.x + 3 + k * 9, d.y, 4, 44);
        c.fillStyle = P.ironLight; for (let k = 0; k < 5; k++) c.fillRect(d.x + 3 + k * 9, d.y, 1.5, 44);
        c.fillStyle = P.mossLight; c.globalAlpha = 0.6; c.beginPath(); c.ellipse(d.x + 22, d.y + 48, 16, 5, 0, 0, Math.PI * 2); c.fill();
        c.fillRect(d.x + 12, d.y + 40, 4, 12); c.fillRect(d.x + 30, d.y + 42, 3, 8); c.globalAlpha = 1;
    }
    // kaluze pod pochodniami przy scianach (odbijaja pomaranczowe swiatlo)
    for (const tp of DUNGEON_TORCHES) {
        const dx = tp.x < 200 ? 70 : tp.x > 2800 ? -70 : 0, dy = tp.y < 200 ? 70 : tp.y > 2800 ? -70 : 0;
        const x = tp.x + dx, y = tp.y + dy;
        if (noGo(x, y)) continue;
        c.fillStyle = 'rgba(10,6,18,0.55)'; c.beginPath(); c.ellipse(x, y, 34, 14, 0.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,140,50,0.28)'; c.beginPath(); c.ellipse(x - dx * 0.2, y - dy * 0.2, 16, 6, 0.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,200,120,0.35)'; c.beginPath(); c.ellipse(x - dx * 0.25 - 6, y - dy * 0.25 - 2, 5, 2, 0.2, 0, Math.PI * 2); c.fill();
    }
    // gruz przy scianach (kupki kamieni) — 16 kupek
    for (let i = 0; i < 16; i++) {
        const side = i % 4; const t = 0.08 + rng() * 0.84;
        const x = side === 0 || side === 1 ? px0 + PL.w * t : side === 2 ? px0 + 40 + rng() * 40 : px1 - 40 - rng() * 40;
        const y = side === 0 ? py0 + 40 + rng() * 40 : side === 1 ? py1 - 40 - rng() * 40 : py0 + PL.h * t;
        if (noGo(x, y, 40) || Math.abs(x - 1500) < 140 || (x > 2600 && (y < 300 || y > 2700))) continue;
        for (let k = 0; k < 7; k++) {
            const sx = x + (rng() - 0.5) * 46, sy = y + (rng() - 0.5) * 26, sr = 4 + rng() * 7;
            c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(sx + 2, sy + 3, sr, sr * 0.6, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = rng() < 0.5 ? P.rockLight : P.stone; c.beginPath(); c.ellipse(sx, sy, sr, sr * 0.7, rng(), 0, Math.PI * 2); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.ellipse(sx - sr * 0.3, sy - sr * 0.3, sr * 0.4, sr * 0.25, 0, 0, Math.PI * 2); c.fill();
        }
    }
    // kosci (kreskowkowe, matowe — NIE blyszcza, zeby nie czytaly sie jako pickup) — 6 miejsc
    let bones = 0;
    for (let tries = 0; tries < 40 && bones < 6; tries++) {
        const x = px0 + 120 + rng() * (PL.w - 240), y = py0 + 120 + rng() * (PL.h - 240);
        if (noGo(x, y, 30) || (x > 1700 && x < 2600 && y > 1000 && y < 2000)) continue;
        bones++;
        const a = rng() * Math.PI;
        const bone = (bx: number, by: number, ang: number, len: number): void => {
            c.save(); c.translate(bx, by); c.rotate(ang);
            c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(2, 3, len / 2 + 4, 5, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#cfc6d6'; c.fillRect(-len / 2, -2.5, len, 5);
            for (const e of [-len / 2, len / 2]) { c.beginPath(); c.arc(e, -3, 4, 0, Math.PI * 2); c.arc(e, 3, 4, 0, Math.PI * 2); c.fill(); }
            c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(-len / 2 + 6, 0.5, len - 12, 2);
            c.restore();
        };
        bone(x, y, a, 34 + rng() * 14); if (rng() < 0.7) bone(x + 6, y + 4, a + 1.1 + rng() * 0.5, 28 + rng() * 12);
        if (rng() < 0.5) { c.fillStyle = '#cfc6d6'; c.beginPath(); c.arc(x + 22, y - 14, 8, 0, Math.PI * 2); c.fill(); c.fillStyle = '#2a2036'; c.beginPath(); c.arc(x + 19, y - 15, 2.2, 0, Math.PI * 2); c.arc(x + 25, y - 15, 2.2, 0, Math.PI * 2); c.fill(); }
    }
    // kajdany na posadzce (pierscien + lancuch) przy scianach W i E komnaty — 5
    for (const m of [{ x: 200, y: 900 }, { x: 200, y: 2100 }, { x: 1700, y: 1290 }, { x: 1700, y: 1710 }, { x: 700, y: 1500 }]) {
        if (noGo(m.x, m.y)) continue;
        c.strokeStyle = P.iron; c.lineWidth = 5; c.beginPath(); c.arc(m.x, m.y, 9, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = P.ironLight; c.lineWidth = 2; c.beginPath(); c.arc(m.x, m.y, 9, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
        c.strokeStyle = P.iron; c.lineWidth = 3;
        let lx = m.x + 9, ly = m.y;
        for (let k = 0; k < 6; k++) { const nx = lx + 9 + (rng() - 0.5) * 3, ny = ly + (rng() - 0.5) * 8; c.beginPath(); c.ellipse((lx + nx) / 2, (ly + ny) / 2, 6, 3.5, Math.atan2(ny - ly, nx - lx), 0, Math.PI * 2); c.stroke(); lx = nx; ly = ny; }
        c.strokeStyle = P.ironLight; c.lineWidth = 4; c.beginPath(); c.arc(lx + 6, ly, 5, 0, Math.PI * 2); c.stroke();
    }

    // ── 3. Lawa (statyczna: NIEREGULARNY obrys z lobami + skorupa + zyly + rozlewiska; ruch = DungeonLava) ──
    DUNGEON_LAVA.forEach((l, li) => {
        const ol = lavaPoolOutline(l, dungeonLavaSeed(li));
        // pekniecia z zarem wokolo basenu (podloga "przegrzana")
        c.strokeStyle = P.lavaDark; c.lineWidth = 3; c.globalAlpha = 0.7;
        for (let i = 0; i < 18; i++) {
            const a = rng() * Math.PI * 2; const rx = l.w / 2 + 40 + rng() * 70, ry = l.h / 2 + 40 + rng() * 60;
            let vx = l.x + l.w / 2 + Math.cos(a) * rx, vy = l.y + l.h / 2 + Math.sin(a) * ry;
            c.beginPath(); c.moveTo(vx, vy);
            for (let s2 = 0; s2 < 3; s2++) { vx += (rng() - 0.5) * 40; vy += (rng() - 0.5) * 40; c.lineTo(vx, vy); }
            c.stroke();
        }
        c.globalAlpha = 1;
        // skorupa (ciemny brzeg) = obrys powiekszony
        c.save(); c.translate(l.x + l.w / 2, l.y + l.h / 2); c.scale((l.w + 2 * LAVA_MAX_BULGE + 30) / (l.w + 2 * LAVA_MAX_BULGE), (l.h + 2 * LAVA_MAX_BULGE + 30) / (l.h + 2 * LAVA_MAX_BULGE)); c.translate(-(l.x + l.w / 2), -(l.y + l.h / 2));
        c.fillStyle = P.lavaCrust; c.beginPath(); traceSmooth(c, ol.pts); c.closePath(); c.fill();
        c.restore();
        // rozlewiska (male, kosmetyczne — poza strefa)
        for (const sp of ol.spills) {
            c.fillStyle = P.lavaCrustDark; c.globalAlpha = 0.5; c.beginPath(); c.ellipse(sp.x + 3, sp.y + 4, sp.rx + 7, sp.ry + 6, sp.rot, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; // cien (v0.180)
            c.fillStyle = P.lavaCrust; c.beginPath(); c.ellipse(sp.x, sp.y, sp.rx + 7, sp.ry + 6, sp.rot, 0, Math.PI * 2); c.fill();
            c.strokeStyle = P.lavaCrustLight; c.lineWidth = 1.5; c.globalAlpha = 0.8; c.beginPath(); c.ellipse(sp.x, sp.y, sp.rx + 7, sp.ry + 6, sp.rot, Math.PI * 0.95, Math.PI * 1.85); c.stroke(); c.globalAlpha = 1; // grzbiet NW
            c.fillStyle = P.lavaDark; c.beginPath(); c.ellipse(sp.x, sp.y, sp.rx, sp.ry, sp.rot, 0, Math.PI * 2); c.fill();
            c.fillStyle = P.lava; c.beginPath(); c.ellipse(sp.x, sp.y, sp.rx * 0.6, sp.ry * 0.55, sp.rot, 0, Math.PI * 2); c.fill();
            c.fillStyle = P.lavaBright; c.globalAlpha = 0.7; c.beginPath(); c.ellipse(sp.x - sp.rx * 0.2, sp.y - sp.ry * 0.2, sp.rx * 0.22, sp.ry * 0.25, sp.rot, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
        }
        // lawa wlasciwa (clip do obrysu) — v0.180.0 "REALNE PLACKI" (decyzja Mariusza: powrot do looku v0.166
        // + wiecej fake-3D i roznorodnosci kolorow). Warstwy: magma z plamami koloru -> rzeki zaru (halo/zolty/bialy)
        // -> aureole zaru -> PLACKI skorupy (cien rzucony, gradient NW->SE, grzbiet rim, szczelina zaru po obwodzie,
        // pekniecia, pory) -> winieta wewnetrzna. Zero kosztu per klatke (bake).
        c.save(); c.beginPath(); traceSmooth(c, ol.pts); c.closePath(); c.clip();
        // 1) magma bazowa: gradient NW->SE + 6-9 miekkich plam koloru
        const mg = c.createLinearGradient(l.x, l.y, l.x + l.w, l.y + l.h);
        mg.addColorStop(0, P.lavaDark); mg.addColorStop(0.5, P.lava); mg.addColorStop(1, P.lavaCoreMid);
        c.fillStyle = mg; c.fillRect(l.x - 40, l.y - 40, l.w + 80, l.h + 80);
        const blotches = ['#c8341a', '#ff7a1a', '#ffcc00', '#ff5a1a', '#b32a12'];
        for (let i = 0; i < 6 + Math.floor(rng() * 4); i++) {
            const bx = l.x + rng() * l.w, by = l.y + rng() * l.h, br = 30 + rng() * Math.min(l.w, l.h) * 0.35;
            const bg = c.createRadialGradient(bx, by, 2, bx, by, br);
            const col = blotches[Math.floor(rng() * blotches.length)];
            bg.addColorStop(0, col); bg.addColorStop(1, col + '00');
            c.globalAlpha = 0.35 + rng() * 0.25; c.fillStyle = bg; c.fillRect(bx - br, by - br, br * 2, br * 2); c.globalAlpha = 1;
        }
        // 2) rzeki zaru: halo pomarancz -> zolty -> bialy rdzen
        const rivers: number[][] = [];
        for (let i = 0; i < 5 + Math.floor(rng() * 3); i++) {
            const pts: number[] = []; let vx = l.x + rng() * l.w, vy = l.y + rng() * l.h; pts.push(vx, vy);
            for (let s2 = 0; s2 < 4; s2++) { vx += (rng() - 0.5) * l.w * 0.45; vy += (rng() - 0.5) * l.h * 0.45; pts.push(Math.max(l.x, Math.min(l.x + l.w, vx)), Math.max(l.y, Math.min(l.y + l.h, vy))); }
            rivers.push(pts);
        }
        const strokeRiver = (pts: number[], lw: number, color: string, alpha: number): void => {
            c.strokeStyle = color; c.lineWidth = lw; c.globalAlpha = alpha; c.lineCap = 'round'; c.lineJoin = 'round';
            c.beginPath(); c.moveTo(pts[0], pts[1]);
            for (let k = 2; k + 3 < pts.length; k += 2) { const mx = (pts[k] + pts[k + 2]) / 2, my = (pts[k + 1] + pts[k + 3]) / 2; c.quadraticCurveTo(pts[k], pts[k + 1], mx, my); }
            c.lineTo(pts[pts.length - 2], pts[pts.length - 1]); c.stroke(); c.globalAlpha = 1;
        };
        for (const r of rivers) { strokeRiver(r, 10, P.lavaCoreMid, 0.5); strokeRiver(r, 5, P.lavaCoreHot, 0.95); strokeRiver(r, 2, P.lavaWhite, 1); }
        // 3) placki skorupy fake-3D (8-14, proporcjonalnie do pola), nie na mostach, >=12 px od obrysu
        const plate = (px: number, py: number, rx: number, ry: number, rot: number): void => {
            const n = 8 + Math.floor(rng() * 3); const poly: number[] = [];
            for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + rot; const jit = 0.72 + rng() * 0.45; poly.push(px + Math.cos(a) * rx * jit, py + Math.sin(a) * ry * jit); }
            const path = (dx: number, dy: number): void => { c.beginPath(); for (let k = 0; k < poly.length; k += 2) { if (k === 0) c.moveTo(poly[k] + dx, poly[k + 1] + dy); else c.lineTo(poly[k] + dx, poly[k + 1] + dy); } c.closePath(); };
            // aureola zaru pod plackiem
            const ag = c.createRadialGradient(px, py, Math.min(rx, ry) * 0.6, px, py, Math.max(rx, ry) * 1.35);
            ag.addColorStop(0, 'rgba(255,204,0,0.45)'); ag.addColorStop(1, 'rgba(255,204,0,0)');
            c.fillStyle = ag; c.fillRect(px - rx * 1.5, py - ry * 1.5, rx * 3, ry * 3);
            // szczelina zaru po obwodzie (za korpusem)
            path(0, 0); c.strokeStyle = P.lavaCoreHot; c.lineWidth = 5; c.globalAlpha = 0.9; c.lineJoin = 'round'; c.stroke();
            c.strokeStyle = P.lavaWhite; c.lineWidth = 2; c.stroke(); c.globalAlpha = 1;
            // cien rzucony
            path(4, 6); c.fillStyle = P.lavaCrustDark; c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
            // korpus: gradient NW->SE
            const pg = c.createLinearGradient(px - rx, py - ry, px + rx, py + ry);
            pg.addColorStop(0, P.lavaCrustLight); pg.addColorStop(0.5, P.lavaCrust); pg.addColorStop(1, P.lavaCrustDark);
            path(0, 0); c.fillStyle = pg; c.fill();
            // krawedz ciemna (caly obrys) + grzbiet rim NW (tylko wierzcholki z gornej-lewej polowy)
            c.strokeStyle = P.lavaCrustDark; c.lineWidth = 2; c.stroke();
            c.strokeStyle = P.lavaCrustLight; c.lineWidth = 2; c.globalAlpha = 0.85; c.beginPath();
            let penDown = false;
            for (let k = 0; k < poly.length; k += 2) {
                const a = Math.atan2(poly[k + 1] - py, poly[k] - px); // -PI..PI, gora = ujemne
                const nw = a > -Math.PI * 0.95 && a < -Math.PI * 0.05;
                if (nw) { if (penDown) c.lineTo(poly[k], poly[k + 1]); else { c.moveTo(poly[k], poly[k + 1]); penDown = true; } } else penDown = false;
            }
            c.stroke(); c.globalAlpha = 1;
            // pekniecia w placku (1-2) z jasnym rdzeniem + pory
            for (let q = 0; q < 1 + Math.floor(rng() * 2); q++) {
                let cx2 = px + (rng() - 0.5) * rx * 0.8, cy2 = py + (rng() - 0.5) * ry * 0.8;
                const seg: number[] = [cx2, cy2]; for (let s2 = 0; s2 < 3; s2++) { cx2 += (rng() - 0.5) * rx * 0.7; cy2 += (rng() - 0.5) * ry * 0.7; seg.push(cx2, cy2); }
                c.strokeStyle = P.lavaCoreMid; c.lineWidth = 1.8; c.beginPath(); c.moveTo(seg[0], seg[1]); for (let k = 2; k < seg.length; k += 2) c.lineTo(seg[k], seg[k + 1]); c.stroke();
                c.strokeStyle = P.lavaWhite; c.lineWidth = 0.8; c.stroke();
            }
            c.fillStyle = 'rgba(0,0,0,0.35)';
            for (let q = 0; q < 4 + Math.floor(rng() * 3); q++) { c.beginPath(); c.arc(px + (rng() - 0.5) * rx * 1.2, py + (rng() - 0.5) * ry * 1.2, 0.8 + rng() * 1.4, 0, Math.PI * 2); c.fill(); }
        };
        const plateCount = Math.max(8, Math.min(14, Math.round((l.w * l.h) / 16000)));
        for (let i = 0, tries = 0; i < plateCount && tries < 60; tries++) {
            const rx = 13 + rng() * 22, ry = rx * (0.6 + rng() * 0.5);
            const px = l.x + 12 + rx + rng() * (l.w - 24 - rx * 2), py = l.y + 12 + ry + rng() * (l.h - 24 - ry * 2);
            if (!isDungeonLavaPoint(px, py) || !isDungeonLavaPoint(px - rx, py) || !isDungeonLavaPoint(px + rx, py)) continue; // nie na moscie
            plate(px, py, rx, ry, rng() * Math.PI); i++;
        }
        // 5) winieta wewnetrzna (glebia basenu)
        c.lineWidth = 14; c.strokeStyle = P.lavaDark; c.globalAlpha = 0.45; c.beginPath(); traceSmooth(c, ol.pts); c.closePath(); c.stroke(); c.globalAlpha = 1;
        c.restore();
        // swiecace pekniecia skorupy na brzegu
        c.strokeStyle = P.lavaBright; c.lineWidth = 2; c.globalAlpha = 0.7;
        for (let i = 0; i < 40; i++) {
            const side = Math.floor(rng() * 4);
            const sx = side === 0 || side === 1 ? l.x + rng() * l.w : side === 2 ? l.x - 26 + rng() * 20 : l.x + l.w + 6 + rng() * 20;
            const sy = side === 0 ? l.y - 26 + rng() * 20 : side === 1 ? l.y + l.h + 6 + rng() * 20 : l.y + rng() * l.h;
            c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + (rng() - 0.5) * 24, sy + (rng() - 0.5) * 24); c.stroke();
        }
        c.globalAlpha = 1;
        const rg = c.createRadialGradient(l.x + l.w / 2, l.y + l.h / 2, Math.min(l.w, l.h) * 0.5, l.x + l.w / 2, l.y + l.h / 2, Math.max(l.w, l.h) * 0.85);
        rg.addColorStop(0, 'rgba(255,122,26,0.22)'); rg.addColorStop(1, 'rgba(255,122,26,0)');
        c.fillStyle = rg; c.fillRect(l.x - l.w * 0.5, l.y - l.h * 0.5, l.w * 2, l.h * 2);
    });
    for (const b of DUNGEON_BRIDGES) {
        c.fillStyle = P.stoneDark; c.fillRect(b.x - 8, b.y - 30, b.w + 16, b.h + 60);
        c.fillStyle = P.stone; c.fillRect(b.x, b.y - 30, b.w, b.h + 60);
        c.strokeStyle = P.stoneJoint; c.lineWidth = 2; c.globalAlpha = 0.7;
        for (let y = b.y - 30; y < b.y + b.h + 30; y += 28) { c.beginPath(); c.moveTo(b.x, y); c.lineTo(b.x + b.w, y); c.stroke(); }
        for (let y = b.y - 30, k = 0; y < b.y + b.h + 30; y += 28, k++) for (let x = b.x + (k % 2 ? 24 : 0); x < b.x + b.w; x += 48) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 28); c.stroke(); }
        c.globalAlpha = 1;
        c.fillStyle = P.stoneLight; c.fillRect(b.x, b.y - 30, 8, b.h + 60); c.fillRect(b.x + b.w - 8, b.y - 30, 8, b.h + 60);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(b.x + b.w, b.y, 14, b.h);
    }

    // ── 4. Wenty gejzerow: krata zelazna nad dziura z lawa (Czytelnosc: "gorace, niebezpieczne") ──
    for (const gz of DUNGEON_GEYSERS) {
        const R = DUNGEON_GEYSER_R;
        // przypalona posadzka + pekniecia z zarem promieniscie NA ZEWNATRZ (nie szprychy w srodku)
        const sc = c.createRadialGradient(gz.x, gz.y, R * 0.5, gz.x, gz.y, R + 40);
        sc.addColorStop(0, 'rgba(0,0,0,0.5)'); sc.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = sc; c.fillRect(gz.x - R - 40, gz.y - R - 40, (R + 40) * 2, (R + 40) * 2);
        c.lineWidth = 3;
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2 + rng() * 0.5;
            let vx = gz.x + Math.cos(a) * (R - 8), vy = gz.y + Math.sin(a) * (R - 8);
            c.strokeStyle = P.lavaDark; c.globalAlpha = 0.9; c.beginPath(); c.moveTo(vx, vy);
            const len = 20 + rng() * 40;
            for (let s2 = 0; s2 < 3; s2++) { vx += Math.cos(a + (rng() - 0.5) * 0.8) * len / 3; vy += Math.sin(a + (rng() - 0.5) * 0.8) * len / 3; c.lineTo(vx, vy); }
            c.stroke();
        }
        c.globalAlpha = 1;
        // kamienny pierscien (ciosany) wokolo dziury
        c.fillStyle = P.stoneDark; c.beginPath(); c.arc(gz.x, gz.y, R, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.stone; c.beginPath(); c.arc(gz.x, gz.y, R - 6, 0, Math.PI * 2); c.fill();
        c.strokeStyle = P.stoneJoint; c.lineWidth = 3;
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(gz.x + Math.cos(a) * (R - 26), gz.y + Math.sin(a) * (R - 26)); c.lineTo(gz.x + Math.cos(a) * R, gz.y + Math.sin(a) * R); c.stroke(); }
        c.fillStyle = 'rgba(255,255,255,0.08)'; c.beginPath(); c.arc(gz.x, gz.y, R - 6, Math.PI * 1.05, Math.PI * 1.75); c.arc(gz.x, gz.y, R - 14, Math.PI * 1.75, Math.PI * 1.05, true); c.fill();
        // dziura z lawa (glebia: ciemny brzeg -> zar w srodku)
        const hole = R - 28;
        const hg = c.createRadialGradient(gz.x, gz.y, 4, gz.x, gz.y, hole);
        hg.addColorStop(0, P.lavaBright); hg.addColorStop(0.35, P.lava); hg.addColorStop(0.8, P.lavaDark); hg.addColorStop(1, '#2a0d06');
        c.fillStyle = hg; c.beginPath(); c.arc(gz.x, gz.y, hole, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.lavaCrust; c.globalAlpha = 0.6;
        for (let i = 0; i < 5; i++) { const a = rng() * Math.PI * 2, d = rng() * hole * 0.6; c.beginPath(); c.ellipse(gz.x + Math.cos(a) * d, gz.y + Math.sin(a) * d, 6 + rng() * 8, 4 + rng() * 4, a, 0, Math.PI * 2); c.fill(); }
        c.globalAlpha = 1;
        // KRATA zelazna: rownolegle prety + 2 poprzeczki + obrecz (metal nad zarem — czytelne)
        c.save(); c.beginPath(); c.arc(gz.x, gz.y, hole + 2, 0, Math.PI * 2); c.clip();
        for (let bx = -hole + 10; bx < hole; bx += 18) {
            c.fillStyle = '#1f2226'; c.fillRect(gz.x + bx - 3.5, gz.y - hole, 7, hole * 2);
            c.fillStyle = P.iron; c.fillRect(gz.x + bx - 3, gz.y - hole, 6, hole * 2);
            c.fillStyle = P.ironLight; c.fillRect(gz.x + bx - 3, gz.y - hole, 2, hole * 2);
        }
        for (const by of [-hole * 0.38, hole * 0.38]) {
            c.fillStyle = '#1f2226'; c.fillRect(gz.x - hole, gz.y + by - 4, hole * 2, 8);
            c.fillStyle = P.iron; c.fillRect(gz.x - hole, gz.y + by - 3, hole * 2, 6);
            c.fillStyle = P.ironLight; c.fillRect(gz.x - hole, gz.y + by - 3, hole * 2, 2);
        }
        c.restore();
        c.strokeStyle = P.iron; c.lineWidth = 6; c.beginPath(); c.arc(gz.x, gz.y, hole + 1, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = P.ironLight; c.lineWidth = 2; c.beginPath(); c.arc(gz.x, gz.y, hole - 1, Math.PI * 1.1, Math.PI * 1.7); c.stroke();
        // nity na obreczy
        c.fillStyle = P.ironLight;
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.39; c.beginPath(); c.arc(gz.x + Math.cos(a) * (hole + 1), gz.y + Math.sin(a) * (hole + 1), 2.5, 0, Math.PI * 2); c.fill(); }
        // zar przebijajacy przez krate na posadzke wokolo (mala poswiata)
        const gg = c.createRadialGradient(gz.x, gz.y, hole, gz.x, gz.y, R + 30);
        gg.addColorStop(0, 'rgba(255,122,26,0.28)'); gg.addColorStop(1, 'rgba(255,122,26,0)');
        c.fillStyle = gg; c.fillRect(gz.x - R - 30, gz.y - R - 30, (R + 30) * 2, (R + 30) * 2);
    }

    // ── 5. Skala za cela (grubo ciosane bloki) + ramka z CIENKICH cegielek 60 px ──
    const rockBlocks = (x: number, y: number, w: number, h: number, BW = 96, BH = 48): void => {
        c.fillStyle = P.rockDark; c.fillRect(x, y, w, h);
        for (let by = y, row = 0; by < y + h; by += BH, row++) {
            for (let bx = x - (row % 2 ? BW / 2 : 0); bx < x + w; bx += BW) {
                const x0 = Math.max(x, bx), x1 = Math.min(x + w, bx + BW - 3);
                if (x1 - x0 < 6) continue;
                const y1 = Math.min(y + h, by + BH - 3);
                c.fillStyle = rng() < 0.3 ? P.rockLight : P.rock;
                c.fillRect(x0, by, x1 - x0, y1 - by);
                c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(x0, by, x1 - x0, Math.min(5, BH / 8));
                c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x0, y1 - Math.min(6, BH / 8), x1 - x0, Math.min(6, BH / 8));
                if (BH >= 40 && rng() < 0.12) { c.fillStyle = P.moss; c.globalAlpha = 0.5; c.beginPath(); c.ellipse(x0 + rng() * (x1 - x0), by + rng() * (y1 - by), 8, 4, rng(), 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
            }
        }
    };
    // ramka: male cegielki 30x15
    rockBlocks(0, 0, WORLD_W, py0, 30, 15);
    rockBlocks(0, py1, WORLD_W, WORLD_H - py1, 30, 15);
    rockBlocks(0, py0, px0, PL.h, 30, 15);
    rockBlocks(px1, py0, WORLD_W - px1, PL.h, 30, 15);
    // skala E za cela (duze bloki)
    const rE = DUNGEON_ROCK_E;
    rockBlocks(rE.x, rE.y, rE.w, rE.h);
    // AO u podstawy (na podlodze) + jasna krawedz gorna ramki
    const ao = (x: number, y: number, w: number, h: number, side: 'S' | 'N' | 'W' | 'E', d = 40): void => {
        const g = side === 'S' ? c.createLinearGradient(0, y + h, 0, y + h + d) : side === 'N' ? c.createLinearGradient(0, y, 0, y - d)
            : side === 'E' ? c.createLinearGradient(x + w, 0, x + w + d, 0) : c.createLinearGradient(x, 0, x - d, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        if (side === 'S') c.fillRect(x, y + h, w, d); else if (side === 'N') c.fillRect(x, y - d, w, d); else if (side === 'E') c.fillRect(x + w, y, d, h); else c.fillRect(x - d, y, d, h);
    };
    ao(0, 0, WORLD_W, py0, 'S', 28); ao(0, py1, WORLD_W, WORLD_H - py1, 'N', 28); ao(0, py0, px0, PL.h, 'E', 28); ao(px1, py0, WORLD_W - px1, PL.h, 'W', 28);
    ao(rE.x, rE.y, rE.w, rE.h, 'W'); ao(rE.x, rE.y, rE.w, rE.h, 'N'); ao(rE.x, rE.y, rE.w, rE.h, 'S');
    c.fillStyle = P.rockEdge;
    for (let x = px0; x < px1; x += 30) { c.fillRect(x, py0 - 6, 18, 6); c.fillRect(x, py1, 18, 6); }
    for (let y = py0; y < py1; y += 30) { c.fillRect(px0 - 6, y, 6, 18); c.fillRect(px1, y, 6, 18); }

    // ── 6. Kraty lane'ow w ramce (czytelne "stad przyjda") ──
    for (const ln of DUNGEON_LANES) {
        const top = ln.y < WORLD_H / 2;
        const ay = top ? py0 : py1;
        c.fillStyle = P.floorDark;
        c.fillRect(ln.x - 70, top ? 0 : ay, 140, py0);
        c.strokeStyle = P.rockEdge; c.lineWidth = 8;
        c.beginPath(); if (top) { c.moveTo(ln.x - 70, py0); c.arc(ln.x, py0, 70, Math.PI, 0); } else { c.moveTo(ln.x - 70, py1); c.arc(ln.x, py1, 70, Math.PI, 0, true); } c.stroke();
        c.strokeStyle = P.iron; c.lineWidth = 5;
        for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(ln.x + i * 26, top ? 0 : py1); c.lineTo(ln.x + i * 26, top ? py0 : WORLD_H); c.stroke(); }
    }

    // ── 7. Cela Krolowej: posadzka fioletowa + wrota W (spawn; lite, zamkniete) ──
    {
        const ce = DUNGEON_CELL;
        c.fillStyle = '#2f1d47'; c.fillRect(ce.x, ce.y, ce.w, ce.h);
        c.strokeStyle = P.moss; c.lineWidth = 2; c.globalAlpha = 0.6;
        for (let x = ce.x; x <= ce.x + ce.w; x += 28) { c.beginPath(); c.moveTo(x, ce.y); c.lineTo(x, ce.y + ce.h); c.stroke(); }
        for (let y = ce.y; y <= ce.y + ce.h; y += 28) { c.beginPath(); c.moveTo(ce.x, y); c.lineTo(ce.x + ce.w, y); c.stroke(); }
        c.globalAlpha = 1;
        const cg = c.createRadialGradient(ce.x + ce.w / 2, ce.y + ce.h / 2, 10, ce.x + ce.w / 2, ce.y + ce.h / 2, 150);
        cg.addColorStop(0, 'rgba(194,36,122,0.35)'); cg.addColorStop(1, 'rgba(142,68,173,0)');
        c.fillStyle = cg; c.fillRect(ce.x - 80, ce.y - 80, ce.w + 160, ce.h + 160);
        // podloga pod frontem: ciemniejsza "posadzka wiezienna" (cegly to encje nad nia)
        c.fillStyle = P.floorDark; c.fillRect(DUNGEON_FRONT.x0, DUNGEON_FRONT.y0, DUNGEON_FRONT.cols * DUNGEON_BRICK, DUNGEON_FRONT.rows * DUNGEON_BRICK);
        for (const wg of DUNGEON_WINGS) c.fillRect(wg.x, wg.y, wg.w, wg.h);
        // zelazna klatka celi (kolizja w DungeonBorder): prety + nity — czytelnie "metal, nie cegla"
        for (const cg of DUNGEON_CAGE) {
            c.fillStyle = "#1f2226"; c.fillRect(cg.x - 2, cg.y - 2, cg.w + 4, cg.h + 4);
            c.fillStyle = P.ironLight; c.fillRect(cg.x, cg.y, cg.w, cg.h);
            c.fillStyle = P.iron;
            if (cg.w > cg.h) for (let x = cg.x + 8; x < cg.x + cg.w; x += 20) c.fillRect(x, cg.y + 2, 4, cg.h - 4);
            else for (let y = cg.y + 8; y < cg.y + cg.h; y += 20) c.fillRect(cg.x + 2, y, cg.w - 4, 4);
        }
        // pionowe prety krat w scianie N/S klatki (nad cela — sylwetka "wiezienia")
        c.strokeStyle = P.ironLight; c.lineWidth = 4;
        for (let x = ce.x + 14; x < ce.x + ce.w; x += 28) { c.beginPath(); c.moveTo(x, ce.y - 2); c.lineTo(x, ce.y - 22); c.moveTo(x, ce.y + ce.h + 2); c.lineTo(x, ce.y + ce.h + 22); c.stroke(); }
        // wrota W (zamkniete) przy spawnie
        const wx = px0, wy = 1500;
        c.fillStyle = P.stoneDark; c.fillRect(wx - 12, wy - 90, 24, 180);
        c.fillStyle = '#3d2a1a'; c.fillRect(wx - 8, wy - 70, 16, 140);
        c.fillStyle = P.iron; for (let i = -2; i <= 2; i++) c.fillRect(wx - 8, wy + i * 28 - 3, 16, 6);
    }

    // ── 8. Pochodnie statyczne (kinkiet + plomien + mala poswiata wpieczona) ──
    for (const tp of DUNGEON_TORCHES) {
        const rg = c.createRadialGradient(tp.x, tp.y, 4, tp.x, tp.y, 64);
        rg.addColorStop(0, 'rgba(255,179,71,0.35)'); rg.addColorStop(1, 'rgba(255,122,26,0)');
        c.fillStyle = rg; c.fillRect(tp.x - 64, tp.y - 64, 128, 128);
        c.fillStyle = P.iron; c.fillRect(tp.x - 4, tp.y - 2, 8, 18);
        c.fillStyle = P.lavaDark; c.beginPath(); c.ellipse(tp.x, tp.y - 6, 7, 11, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.lava; c.beginPath(); c.ellipse(tp.x, tp.y - 8, 5, 8, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.lavaBright; c.beginPath(); c.ellipse(tp.x, tp.y - 10, 2.5, 4.5, 0, 0, Math.PI * 2); c.fill();
    }

    // ── 9. Lancuchy na scianie N/S co ~300 px ──
    c.strokeStyle = P.ironLight; c.lineWidth = 3;
    for (let x = px0 + 150; x < px1; x += 300) {
        if (Math.abs(x - 1500) < 120 || x > 2600) continue; // nie na kratach lane'ow
        c.beginPath(); c.moveTo(x, py0 - 40); c.quadraticCurveTo(x + 14, py0 - 10, x + 6, py0 + 6); c.stroke();
        c.fillStyle = P.iron; c.beginPath(); c.arc(x + 6, py0 + 8, 5, 0, Math.PI * 2); c.fill();
    }

    // ── 10. Winieta krawedzi (wpieczona; zero overlayow w runtime) ──
    const vg = c.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 1100, WORLD_W / 2, WORLD_H / 2, 1800);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,4,14,0.45)');
    c.fillStyle = vg; c.fillRect(0, 0, WORLD_W, WORLD_H);

    const tex = PIXI.Texture.from(cv);
    console.log(`[DungeonMap] ground bake ${(performance.now() - t0).toFixed(1)} ms`);
    return tex;
}
