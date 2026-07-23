import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * FortifiedRuinsMap — mapa scenariusza CTF (FAZA CTF F1).
 *
 * Port z legacy/ctf.html generateMap() (linie 4201-4343). Layout jest w pelni
 * DETERMINISTYCZNY (decyzja D9): stale rozmiary skal/krzakow zamiast legacy
 * Math.random() — kazda pozycja i rozmiar przeszly weryfikacje AABB (Node,
 * scratchpad ctf_f1_aabb.js, 15 checkow PASS):
 *  - zero nachodzenia skala-skala / skala-mur / skala-jezioro / skala-fosa,
 *  - pierscien orbit strazników R=180±20 wolny od przeszkod (D4),
 *  - strefa hangaru i spawn gracza (200,1500) czyste,
 *  - korytarz dostawy x<535 tylko z legacy skala idx4.
 *
 * Odstepstwa pozycyjne od legacy (wymuszone przez stale rozmiary — udokumentowane):
 *  - rock0  (600,200)  -> (640,140)  : czysty pierscien orbity ALFA
 *  - bush1  (720,900)  -> (700,960)  : nachodzil na jezioro A
 *  - bush5  (1100,300) -> (1150,380) : nachodzil na rock9
 *  - bush12 (2200,1600)-> (2200,1630): nachodzil na fose
 * Pominiete z legacy (koszt mobile): swietliki (60 szt.), wodospad.
 *
 * Dekor statyczny (drzewa/pochodnie/beczki/posagi/runy/sciezka/schodki/czaszki/
 * ogniska/mur obwodowy/woda fosy) WYPIEKANY do tekstury gruntu — zero obiektow
 * runtime, koszt per-frame ~0. Static-baked => NIE odswieza sie przez Vite HMR.
 */

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
// LAYOUT — kontrakt danych dla main.ts + F2 (CtfSystem)
// =================================================================

export interface FortifiedFlagEntry {
    id: 'alfa' | 'bravo' | 'charlie';
    x: number;
    y: number;
    color: number;
}

/** Flagi 1:1 z legacy (4227-4229). Kolory: ALFA blue / BRAVO red / CHARLIE yellow. */
export const FORTIFIED_FLAG_POSITIONS: FortifiedFlagEntry[] = [
    { id: 'alfa',    x: 520,  y: 350,  color: 0x3498db },
    { id: 'bravo',   x: 2750, y: 400,  color: 0xe74c3c },
    { id: 'charlie', x: 1500, y: 2780, color: 0xf1c40f },
];

/** Hangar / strefa domowa 1:1 z legacy (30,1250,500,500). */
export const FORTIFIED_HANGAR_RECT = { x: 30, y: 1250, w: 500, h: 500 };

/**
 * F1.1 (decyzja Mariusza): budynek hangaru — wojskowy, moro — SOLID (kolizja),
 * w polnocno-zachodniej czesci strefy. AABB-verified: spawn gracza (200,1500)
 * czysty (dist>=60), korytarz budynek<->pad masztow >=120 px.
 */
export const FORTIFIED_HANGAR_BUILDING = { x: 45, y: 1270, w: 200, h: 160 };

/**
 * F1.1: maszty na ZDOBYTE flagi (legacy pattern: pad z masztami obok hangaru).
 * Passable decor. Kolejnosc = kolejnosc flag (alfa/bravo/charlie) — w F2 capture
 * wciaga proporzec zdobytej flagi na jej maszt (flex!).
 */
export const FORTIFIED_FLAG_MASTS = [
    { x: 100, y: 1650, color: 0x3498db },  // alfa
    { x: 160, y: 1650, color: 0xe74c3c },  // bravo
    { x: 220, y: 1650, color: 0xf1c40f },  // charlie
];

/** F1.1: betonowy pad pod masztami (wizual). */
export const FORTIFIED_MAST_PAD = { x: 60, y: 1600, w: 200, h: 100 };

/** Fosa (slow zone 0.5x, passable). D5: start od x=535 — strefa domowa w 100% czysta. */
export const FORTIFIED_FOSA_RECT = { x: 535, y: 1445, w: 2425, h: 110 };

/** Most nad fosa (dekor baked; przejazd i tak jest wszedzie — fosa jest passable). */
export const FORTIFIED_BRIDGE_RECT = { x: 1440, y: 1445, w: 120, h: 110 };

/** Spawn gracza — w hangarze (legacy 4700). */
export const FORTIFIED_PLAYER_SPAWN = { x: 200, y: 1500 };

export interface RuinRectEntry {
    x: number;
    y: number;
    w: number;
    h: number;
    tone: number;
    seed: number;
    kind: 'wall' | 'rock';
}

/** Kolory kamienia (legacy TONES + STONE) w wersji hex number dla PIXI. */
const STONE_TONE = 0xc4a77d;
// F4.1 (decyzja Mariusza): tony skal przesuniete w chlodniejszy/ciemniejszy kamien,
// by NIE zlewaly sie z cieplym piaskiem gruntu (#a89066). Dwa poprzednie tony
// (0xc4a77d, 0x9b8c6e) byly niemal identyczne z podlozem -> "kamien-widmo" (czytelnosc).
const ROCK_TONES = [0x8c8578, 0x8b6914, 0x5a6e3a, 0x6b4c2a, 0x6f6a5c];

/**
 * Mury fortec (U-shape wokol kazdej flagi, otwarte od poludnia) — geometria 1:1
 * z legacy 4233-4238: top / left / right / dwa dolne pieńki z przerwa 80 px.
 */
export const FORTIFIED_FORTRESS_WALLS: RuinRectEntry[] = FORTIFIED_FLAG_POSITIONS.flatMap(
    (f, fi) => [
        { x: f.x - 120, y: f.y - 100, w: 240, h: 18 },
        { x: f.x - 120, y: f.y - 100, w: 18,  h: 182 },
        { x: f.x + 102, y: f.y - 100, w: 18,  h: 182 },
        { x: f.x - 120, y: f.y + 64,  w: 60,  h: 18 },
        { x: f.x + 60,  y: f.y + 64,  w: 60,  h: 18 },
    ].map((r, ri) => ({ ...r, tone: STONE_TONE, seed: fi * 10 + ri, kind: 'wall' as const })),
);

/**
 * Skaly oslonowe — pozycje legacy (podzbior), rozmiary STALE (D9).
 * F3 (decyzja Mariusza po playtescie): redukcja kolizyjnych kamieni o ~50%
 * (29 -> 14) dla lepszej mobilnosci. Usunieto m.in. skale w fosie i skale
 * w korytarzu dostawy (x<535) — korytarz w 100% czysty. Zachowany rownomierny
 * rozklad oslony po kwadrantach; zero kamieni w pasie fosy (y 1445-1555).
 * F4.1 (decyzja Mariusza): usuniete 2 najmniejsze "kamyki" 60x42 (600,1100) +
 * (1750,400) — bezuzyteczna oslona, zlewaly sie z tlem, drazniacy micro-blocker
 * (14 -> 12). Usuwanie kolizji nie tworzy nowych — AABB nadal PASS.
 */
export const FORTIFIED_ROCKS_LAYOUT: RuinRectEntry[] = ([
    [640, 140, 70, 44],
    [950, 900, 100, 66],
    [1300, 800, 120, 80],
    [1800, 800, 100, 66],
    [2000, 600, 120, 80],
    [2200, 900, 100, 66],
    [2400, 1100, 120, 80],
    [900, 1300, 90, 60],
    [1600, 1200, 100, 66],
    [1050, 1700, 100, 66],
    [2000, 1800, 120, 80],
    [1400, 2400, 120, 80],
] as Array<[number, number, number, number]>).map(([x, y, w, h], i) => ({
    x, y, w, h,
    tone: ROCK_TONES[i % ROCK_TONES.length],
    seed: 100 + i,
    kind: 'rock' as const,
}));

export interface RuinsBushEntry {
    x: number;      // center
    y: number;      // center
    r: number;      // stealth + visual radius
    seed: number;
}

/**
 * F4.1 (decyzja Mariusza): 15 -> 3 strefy stealth, za to WYRAZNE. Wizual = wysoka
 * zielona trawa (jezyk "kryjowki" a'la Brawl Stars / KTB), nie plaskie krzaki-widma.
 * Pozycje AABB-verified (scratchpad ctf_f4_aabb.js) na trasach odwrotu z flagami:
 * ALFA (700,1000) / BRAVO (2000,1000) / CHARLIE (1300,2350) -> hangar. Wieksze
 * promienie (90-95) = czytelne kryjowki, w ktorych chowa sie caly czolg.
 */
export const FORTIFIED_BUSHES_LAYOUT: RuinsBushEntry[] = ([
    [700, 1000, 95],
    [2000, 1000, 95],
    [1300, 2350, 90],
] as Array<[number, number, number]>).map(([x, y, r], i) => ({ x, y, r, seed: 200 + i }));

export interface RuinsLakeEntry {
    x: number;
    y: number;
    w: number;
    h: number;
    seed: number;
}

/** 5 jeziorek 1:1 z legacy (4332-4338) — blokuja czolgi (buildings), pociski przelatuja. */
export const FORTIFIED_LAKES_LAYOUT: RuinsLakeEntry[] = [
    { x: 700,  y: 750,  w: 220, h: 110, seed: 301 },
    { x: 1300, y: 1200, w: 190, h: 155, seed: 302 },
    { x: 2150, y: 600,  w: 170, h: 130, seed: 303 },
    { x: 950,  y: 2150, w: 245, h: 120, seed: 304 },
    { x: 2350, y: 1650, w: 185, h: 145, seed: 305 },
];

// =================================================================
// Baked decor layouts (tylko dla tekstury — zero obiektow runtime)
// =================================================================

/** Drzewa (legacy 4281-4284). Dwa przesuniete poza strefe hangaru: (500,1600)->(560,1620). */
const TREES: Array<[number, number, number]> = [
    [500, 150, 0], [480, 500, 1], [500, 800, 2], [490, 1200, 0], [560, 1620, 1],
    [510, 2000, 2], [490, 2400, 0], [700, 1400, 1], [800, 250, 2], [1050, 1400, 0],
    [1100, 2000, 1], [1200, 1800, 2], [1050, 2500, 0], [1700, 2000, 1], [1900, 1500, 2],
    [2050, 2100, 0], [2300, 2200, 1], [2600, 1200, 2], [2650, 1800, 0], [2700, 900, 1],
];

/** Pochodnie (legacy 4294-4296). */
const TORCHES: Array<[number, number]> = [
    [380, 200], [380, 600], [380, 1000], [380, 1400], [380, 1800], [380, 2400],
    [740, 280], [740, 470], [2590, 480], [2590, 670], [1490, 2550], [1490, 2740],
];

/** Beczki/skrzynie (legacy 4299-4301). */
const BARRELS: Array<[number, number]> = [
    [650, 400], [680, 1100], [900, 700], [1350, 1300], [1600, 700], [1900, 400],
    [2150, 1000], [2350, 1700], [1100, 1900], [2500, 900], [800, 2000], [1700, 2400],
];

/** Posagi wojownikow (legacy 4304). */
const STATUES: Array<[number, number]> = [
    [600, 1360], [1200, 1580], [2000, 400], [2400, 1600], [1500, 500], [1500, 2200],
];

/** Czaszki na palach (legacy 4315). */
const SKULL_STAKES: Array<[number, number]> = [
    [660, 260], [660, 500], [2480, 480], [2480, 680], [1380, 2530], [1380, 2760],
];

/** Kamienne schodki (legacy 4324). */
const STONE_STEPS: Array<[number, number]> = [
    [450, 350], [450, 900], [450, 1450], [1550, 500], [2400, 700],
];

// =================================================================
// buildFortifiedRuinsTexture — bake'owana raz, cached w PIXI.Texture
// =================================================================

export function buildFortifiedRuinsTexture(): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    const rng = makeRng(0x0c7f2026);

    // ── 1. Grunt: piaskowo-kamienna ziemia ruin ────────────────
    c.fillStyle = '#a89066';
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // Variacja gruntu (jak desert): jasne/ciemne elipsy piasku i pylu
    const groundCols = ['#b89e74', '#9c845c', '#c2a87e', '#8f7850', '#b0966a'];
    for (let i = 0; i < 3200; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const rx = 2.5 + rng() * 9;
        const ry = 1.5 + rng() * 4.5;
        const ang = rng() * Math.PI;
        c.save();
        c.globalAlpha = 0.10 + rng() * 0.18;
        c.fillStyle = groundCols[Math.floor(rng() * groundCols.length)];
        c.beginPath();
        c.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // Placki mchu (klimat ruin) — ciemnozielone nieregularne plamy
    for (let i = 0; i < 260; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const r = 6 + rng() * 22;
        c.save();
        c.globalAlpha = 0.08 + rng() * 0.12;
        c.fillStyle = rng() < 0.5 ? '#5a6e3a' : '#4a7c3f';
        c.beginPath();
        c.ellipse(x, y, r, r * (0.5 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // Pekniecia gruntu — krotkie ciemne polilinie
    c.strokeStyle = '#6b5a3c';
    for (let i = 0; i < 160; i++) {
        const sx = rng() * WORLD_W;
        const sy = rng() * WORLD_H;
        let px = sx, py = sy;
        let ang = rng() * Math.PI * 2;
        c.save();
        c.globalAlpha = 0.18 + rng() * 0.15;
        c.lineWidth = 1 + rng() * 1.5;
        c.beginPath();
        c.moveTo(px, py);
        const segs = 3 + Math.floor(rng() * 4);
        for (let s = 0; s < segs; s++) {
            ang += (rng() - 0.5) * 1.2;
            px += Math.cos(ang) * (10 + rng() * 20);
            py += Math.sin(ang) * (10 + rng() * 20);
            c.lineTo(px, py);
        }
        c.stroke();
        c.restore();
    }

    // Rozrzucone plyty kamienne (stare posadzki ruin)
    for (let i = 0; i < 90; i++) {
        const x = rng() * WORLD_W;
        const y = rng() * WORLD_H;
        const w = 26 + rng() * 44;
        const h = 20 + rng() * 34;
        c.save();
        c.translate(x, y);
        c.rotate((rng() - 0.5) * 0.5);
        c.globalAlpha = 0.14 + rng() * 0.14;
        c.fillStyle = rng() < 0.5 ? '#b8a684' : '#93825f';
        c.fillRect(-w / 2, -h / 2, w, h);
        c.globalAlpha *= 0.7;
        c.strokeStyle = '#6b5a3c';
        c.lineWidth = 1.5;
        c.strokeRect(-w / 2, -h / 2, w, h);
        c.restore();
    }

    // ── 2. Fosa (baked woda; slow-logika w RuinsFosa) ──────────
    drawFosaBase(c, rng);

    // ── 3. Sciezka kamienna przez srodek (legacy 4311) — brod pod woda ──
    for (let sx = 500; sx < WORLD_W - 200; sx += 120) {
        drawStonePathSlab(c, rng, sx, WORLD_H / 2);
    }

    // ── 4. Most nad fosa ───────────────────────────────────────
    drawBridge(c);

    // ── 5. Dekor: schodki, posagi, beczki, czaszki, pochodnie, ogniska, drzewa ──
    for (const [x, y] of STONE_STEPS) drawSteps(c, rng, x, y);
    for (const [x, y] of STATUES) drawStatue(c, rng, x, y);
    for (const [x, y] of BARRELS) drawBarrel(c, rng, x, y);
    for (const [x, y] of SKULL_STAKES) drawSkullStake(c, rng, x, y);
    for (const f of FORTIFIED_FLAG_POSITIONS) drawRuneCircle(c, f.x, f.y, f.color);
    for (const f of FORTIFIED_FLAG_POSITIONS) {
        drawCampfire(c, rng, f.x - 140, f.y - 50);
        drawCampfire(c, rng, f.x + 125, f.y + 50);
    }
    for (const [x, y] of TORCHES) drawTorch(c, rng, x, y);
    for (const [x, y, variant] of TREES) drawTree(c, rng, x, y, variant);

    // ── 6. Mur obwodowy (wizual 22 px; kolizja w RuinsBorder) ──
    drawPerimeterWall(c, rng);

    // ── 7. Vignette (spojnie z Arctic — glebia na krawedziach) ──
    const vig = c.createRadialGradient(
        WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.35,
        WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.90,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(60,44,24,0.34)');
    c.fillStyle = vig;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    return PIXI.Texture.from(cv);
}

// =================================================================
// Decor draw helpers (Canvas 2D, cartoon high-detail)
// =================================================================

function drawFosaBase(c: CanvasRenderingContext2D, rng: () => number): void {
    const F = FORTIFIED_FOSA_RECT;

    // Wilgotny brzeg (ciemna ziemia — czytelna granica strefy)
    c.fillStyle = '#5a4a30';
    c.fillRect(F.x - 8, F.y - 8, F.w + 16, F.h + 16);
    c.fillStyle = '#463a24';
    c.fillRect(F.x - 3, F.y - 3, F.w + 6, F.h + 6);

    // Woda rzeki: gradient poprzeczny (plycej przy brzegach, glebiej w nurcie)
    const wat = c.createLinearGradient(0, F.y, 0, F.y + F.h);
    wat.addColorStop(0, '#3f7d80');
    wat.addColorStop(0.5, '#2b5f6a');
    wat.addColorStop(1, '#3f7d80');
    c.fillStyle = wat;
    c.fillRect(F.x, F.y, F.w, F.h);

    // Ciemniejszy nurt srodkiem (glebia — kierunek rzeki)
    c.save();
    c.globalAlpha = 0.35;
    c.fillStyle = '#1f4a55';
    c.fillRect(F.x, F.y + F.h * 0.32, F.w, F.h * 0.36);
    c.restore();

    // Baked smugi nurtu (dlugie jasne poziome kreski = plynaca woda)
    c.strokeStyle = '#7fb4b0';
    for (let i = 0; i < 130; i++) {
        const x = F.x + rng() * F.w;
        const y = F.y + 6 + rng() * (F.h - 12);
        const len = 20 + rng() * 64;
        c.save();
        c.globalAlpha = 0.07 + rng() * 0.12;
        c.lineWidth = 1 + rng() * 1.5;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(Math.min(x + len, F.x + F.w - 2), y + (rng() - 0.5) * 2);
        c.stroke();
        c.restore();
    }

    // Piana przy brzegach (drobne jasne kropki — realizm styku wody z ladem)
    c.fillStyle = '#cfe8e2';
    for (let i = 0; i < 90; i++) {
        const x = F.x + rng() * F.w;
        const top = rng() < 0.5;
        const y = top ? F.y + 2 + rng() * 8 : F.y + F.h - 2 - rng() * 8;
        c.save();
        c.globalAlpha = 0.12 + rng() * 0.18;
        c.beginPath();
        c.arc(x, y, 0.8 + rng() * 1.4, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // Trzcina/trawa na brzegach
    c.strokeStyle = '#4a7c3f';
    c.lineWidth = 2;
    for (let i = 0; i < 110; i++) {
        const x = F.x + rng() * F.w;
        const top = rng() < 0.5;
        const y = top ? F.y - 2 : F.y + F.h + 2;
        c.save();
        c.globalAlpha = 0.5 + rng() * 0.4;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + (rng() - 0.5) * 6, y + (top ? -1 : 1) * (7 + rng() * 9));
        c.stroke();
        c.restore();
    }
}

function drawStonePathSlab(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number): void {
    // Bród: WYRAZNE, wilgotne kamienie-stopnie wystajace z wody (F4.1b: zamiast
    // przygaszonych "kwadratowych pol" ktore nie czytaly sie jako nic konkretnego).
    for (let i = 0; i < 2; i++) {
        const px = x + (rng() - 0.5) * 38;
        const py = y + (rng() - 0.5) * 48;
        const w = 26 + rng() * 16;
        const h = 20 + rng() * 12;
        c.save();
        c.translate(px, py);
        c.rotate((rng() - 0.5) * 0.4);
        // Cien / waterline w wodzie
        c.globalAlpha = 0.30;
        c.fillStyle = '#173038';
        c.beginPath();
        c.ellipse(2, h * 0.32, w * 0.55, h * 0.42, 0, 0, Math.PI * 2);
        c.fill();
        // Mokra podstawa kamienia (ciemniejsza)
        c.globalAlpha = 1;
        c.fillStyle = '#7c7460';
        c.beginPath();
        c.ellipse(0, 0, w * 0.5, h * 0.45, 0, 0, Math.PI * 2);
        c.fill();
        // Sucha gorna powierzchnia (jasniejsza)
        c.fillStyle = '#a89a7c';
        c.beginPath();
        c.ellipse(0, -h * 0.12, w * 0.42, h * 0.32, 0, 0, Math.PI * 2);
        c.fill();
        // Highlight
        c.globalAlpha = 0.5;
        c.fillStyle = '#c8bd9c';
        c.beginPath();
        c.ellipse(-w * 0.12, -h * 0.2, w * 0.16, h * 0.12, 0, 0, Math.PI * 2);
        c.fill();
        // Mokra obwodka (blysk linii wody)
        c.globalAlpha = 0.4;
        c.strokeStyle = '#bfe0da';
        c.lineWidth = 1.5;
        c.beginPath();
        c.ellipse(0, h * 0.1, w * 0.48, h * 0.4, 0, 0, Math.PI * 2);
        c.stroke();
        c.restore();
    }
}

function drawBridge(c: CanvasRenderingContext2D): void {
    const B = FORTIFIED_BRIDGE_RECT;

    // Cien mostu na wodzie
    c.save();
    c.globalAlpha = 0.25;
    c.fillStyle = '#1c2c22';
    c.fillRect(B.x - 6, B.y + 4, B.w + 12, B.h);
    c.restore();

    // Pomost kamienny
    c.fillStyle = '#b8a684';
    c.fillRect(B.x, B.y - 4, B.w, B.h + 8);

    // Plyty poprzeczne
    c.strokeStyle = '#8a7454';
    c.lineWidth = 3;
    for (let y = B.y + 8; y < B.y + B.h; y += 16) {
        c.beginPath();
        c.moveTo(B.x + 3, y);
        c.lineTo(B.x + B.w - 3, y);
        c.stroke();
    }

    // Krawedzie/balustrady
    c.fillStyle = '#93825f';
    c.fillRect(B.x - 6, B.y - 8, 6, B.h + 16);
    c.fillRect(B.x + B.w, B.y - 8, 6, B.h + 16);
    c.fillStyle = '#6b5a3c';
    for (let y = B.y - 6; y < B.y + B.h + 8; y += 22) {
        c.fillRect(B.x - 8, y, 10, 8);
        c.fillRect(B.x + B.w - 2, y, 10, 8);
    }
}

/**
 * Zwarta, listowata sylwetka korony (scallop) — jeden zamkniety ksztalt z lukami
 * na zewnatrz miedzy wierzcholkami, splaszczony 2.5D. Czyta sie jak korona drzewa,
 * nie jak luzny zbior kolek. Deterministyczny (rng ze wspolnego strumienia bake).
 */
function leafyBlob(
    c: CanvasRenderingContext2D, rng: () => number,
    cx: number, cy: number, R: number, lobes: number, color: string,
): void {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < lobes; i++) {
        const a = (i / lobes) * Math.PI * 2;
        const rr = R * (0.80 + rng() * 0.30);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.80]);
    }
    c.fillStyle = color;
    c.beginPath();
    for (let i = 0; i < lobes; i++) {
        const [px, py] = pts[i];
        const [nx, ny] = pts[(i + 1) % lobes];
        const mx = (px + nx) / 2;
        const my = (py + ny) / 2;
        const ctrlX = mx + (mx - cx) * 0.35;   // punkt kontrolny wypchniety na zewnatrz = bukiet lisci
        const ctrlY = my + (my - cy) * 0.35;
        if (i === 0) c.moveTo(px, py);
        c.quadraticCurveTo(ctrlX, ctrlY, nx, ny);
    }
    c.closePath();
    c.fill();
}

function drawTree(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number, variant: number): void {
    // Paleta wg wariantu: [dark, mid, light, trunk, trunkDark]
    const P = [
        ['#2f5a2c', '#4a7c3f', '#6fa757', '#6b4c2a', '#48331d'],
        ['#2a4f26', '#3f6e38', '#63984f', '#5f4526', '#3f2e18'],
        ['#3a5220', '#557a30', '#79a444', '#6b4c2a', '#48331b'],
    ][variant % 3];

    // ── Cien na ziemi (miekki, w prawo-dol jak reszta propsow) ──
    c.save();
    c.globalAlpha = 0.22;
    c.fillStyle = '#2c2012';
    c.beginPath();
    c.ellipse(x + 10, y + 10, 30, 11, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // ── Pien: zwezajacy sie, z przynasadowa flara + cieniowana prawa strona + kora ──
    const trunkTop = y - 20;
    c.fillStyle = P[3];
    c.beginPath();
    c.moveTo(x - 7, y + 8);
    c.quadraticCurveTo(x - 4, y - 6, x - 3.5, trunkTop);
    c.lineTo(x + 3.5, trunkTop);
    c.quadraticCurveTo(x + 4, y - 6, x + 7, y + 8);
    c.closePath();
    c.fill();
    c.fillStyle = P[4];
    c.beginPath();
    c.moveTo(x + 1, trunkTop);
    c.quadraticCurveTo(x + 4, y - 6, x + 7, y + 8);
    c.lineTo(x + 2, y + 8);
    c.quadraticCurveTo(x + 1, y - 6, x + 1, trunkTop);
    c.closePath();
    c.fill();
    c.save();
    c.globalAlpha = 0.6;
    c.strokeStyle = P[4];
    c.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
        c.beginPath();
        c.moveTo(x - 2 + i * 3, trunkTop + 3);
        c.lineTo(x - 2 + i * 3, y + 5);
        c.stroke();
    }
    c.restore();

    // ── Korona: 3 zwarte, listowate sylwetki (ciemna baza -> jasny szczyt gorne-lewe) ──
    const cyTop = y - 34;
    leafyBlob(c, rng, x, cyTop + 6, 27, 11, P[0]);       // baza (ciemna, szeroka)
    leafyBlob(c, rng, x - 3, cyTop - 2, 21, 10, P[1]);   // srodek
    leafyBlob(c, rng, x - 7, cyTop - 8, 14, 9, P[2]);    // szczyt (jasny)

    // Ciemne "dziury" listowia (glebia) + drobne rozjasnienia (swiatlo w listowiu)
    c.save();
    c.globalAlpha = 0.35;
    c.fillStyle = P[0];
    for (let i = 0; i < 3; i++) {
        const a = rng() * Math.PI * 2;
        const d = rng() * 12;
        c.beginPath();
        c.arc(x + Math.cos(a) * d + 4, cyTop + Math.sin(a) * d + 4, 3 + rng() * 2, 0, Math.PI * 2);
        c.fill();
    }
    c.globalAlpha = 0.5;
    c.fillStyle = P[2];
    for (let i = 0; i < 5; i++) {
        const a = rng() * Math.PI * 2;
        const d = 4 + rng() * 12;
        c.beginPath();
        c.arc(x - 6 + Math.cos(a) * d, cyTop - 6 + Math.sin(a) * d, 1.5 + rng() * 1.5, 0, Math.PI * 2);
        c.fill();
    }
    c.restore();
}

function drawTorch(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number): void {
    // Pal
    c.fillStyle = '#5a3c22';
    c.fillRect(x - 3, y - 26, 6, 34);
    // Misa
    c.fillStyle = '#6b5a3c';
    c.beginPath();
    c.ellipse(x, y - 28, 8, 5, 0, 0, Math.PI * 2);
    c.fill();
    // Plomien (jasny, czytelny "punkt swiatla" na mapie)
    const grd = c.createRadialGradient(x, y - 36, 1, x, y - 36, 16);
    grd.addColorStop(0, 'rgba(255,220,120,0.95)');
    grd.addColorStop(0.4, 'rgba(255,150,50,0.65)');
    grd.addColorStop(1, 'rgba(255,120,30,0)');
    c.fillStyle = grd;
    c.beginPath();
    c.arc(x, y - 36, 16, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffdf8a';
    c.beginPath();
    c.ellipse(x, y - 36, 4, 7 + rng() * 2, 0, 0, Math.PI * 2);
    c.fill();
}

function drawBarrel(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number): void {
    c.save();
    c.translate(x, y);
    c.rotate((rng() - 0.5) * 0.5);
    // Cien
    c.globalAlpha = 0.2;
    c.fillStyle = '#3c2c14';
    c.beginPath();
    c.ellipse(3, 5, 15, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    // Korpus
    c.fillStyle = '#8a6838';
    c.beginPath();
    c.ellipse(0, 0, 13, 16, 0, 0, Math.PI * 2);
    c.fill();
    // Obrecze
    c.strokeStyle = '#4a3a20';
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(0, -6, 12, 5, 0, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.ellipse(0, 6, 12, 5, 0, 0, Math.PI * 2);
    c.stroke();
    // Highlight
    c.globalAlpha = 0.4;
    c.fillStyle = '#c9a86a';
    c.beginPath();
    c.ellipse(-5, -4, 4, 8, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
}

function drawStatue(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number): void {
    // Cien
    c.save();
    c.globalAlpha = 0.25;
    c.fillStyle = '#3c2c14';
    c.beginPath();
    c.ellipse(x + 6, y + 26, 24, 9, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // Piedestal
    c.fillStyle = '#93825f';
    c.fillRect(x - 18, y + 12, 36, 14);
    c.fillStyle = '#b0a080';
    c.fillRect(x - 14, y + 6, 28, 8);
    // Korpus wojownika (sylwetka)
    c.fillStyle = '#a89680';
    c.fillRect(x - 9, y - 28, 18, 34);
    // Ramiona + tarcza
    c.fillRect(x - 16, y - 24, 8, 18);
    c.beginPath();
    c.arc(x + 14, y - 12, 9, 0, Math.PI * 2);
    c.fill();
    // Helm
    c.beginPath();
    c.arc(x, y - 34, 8, Math.PI, 0);
    c.fill();
    c.fillRect(x - 8, y - 34, 16, 5);
    // Pioropusz
    c.fillStyle = '#8b3a2e';
    c.fillRect(x - 2, y - 44, 4, 10);
    // Mech na posagu
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = '#5a6e3a';
    c.beginPath();
    c.arc(x - 6 + rng() * 10, y - 10 + rng() * 14, 4 + rng() * 3, 0, Math.PI * 2);
    c.fill();
    c.restore();
}

function drawRuneCircle(c: CanvasRenderingContext2D, x: number, y: number, color: number): void {
    const col = '#' + color.toString(16).padStart(6, '0');
    // Podwojny krag
    c.save();
    c.globalAlpha = 0.5;
    c.strokeStyle = col;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(x, y, 52, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, 40, 0, Math.PI * 2);
    c.stroke();
    // Glify na okregu
    c.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const gx = x + Math.cos(a) * 46;
        const gy = y + Math.sin(a) * 46;
        c.beginPath();
        c.moveTo(gx - 4, gy - 4);
        c.lineTo(gx + 4, gy + 4);
        c.moveTo(gx + 4 * ((i % 2) ? -1 : 1), gy - 4);
        c.lineTo(gx - 4 * ((i % 2) ? -1 : 1), gy + 4);
        c.stroke();
    }
    // Wypelnienie centralne (bardzo subtelne — czytelny "punkt flagi")
    c.globalAlpha = 0.12;
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, y, 40, 0, Math.PI * 2);
    c.fill();
    c.restore();
}

function drawCampfire(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number): void {
    // Krag kamieni
    c.fillStyle = '#8a7a5c';
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng() * 0.3;
        c.beginPath();
        c.arc(x + Math.cos(a) * 13, y + Math.sin(a) * 10, 3.5 + rng() * 1.5, 0, Math.PI * 2);
        c.fill();
    }
    // Polana
    c.strokeStyle = '#5a3c22';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(x - 8, y + 4);
    c.lineTo(x + 8, y - 4);
    c.moveTo(x - 8, y - 4);
    c.lineTo(x + 8, y + 4);
    c.stroke();
    // Zar/ogien
    const grd = c.createRadialGradient(x, y - 4, 1, x, y - 4, 14);
    grd.addColorStop(0, 'rgba(255,210,110,0.9)');
    grd.addColorStop(0.5, 'rgba(255,130,40,0.5)');
    grd.addColorStop(1, 'rgba(255,110,30,0)');
    c.fillStyle = grd;
    c.beginPath();
    c.arc(x, y - 4, 14, 0, Math.PI * 2);
    c.fill();
}

function drawSkullStake(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number): void {
    // Pal
    c.fillStyle = '#5a3c22';
    c.fillRect(x - 2.5, y - 22, 5, 30);
    // Czaszka
    c.fillStyle = '#e8e0cc';
    c.beginPath();
    c.arc(x, y - 26, 7.5, 0, Math.PI * 2);
    c.fill();
    c.fillRect(x - 5, y - 24, 10, 7);
    // Oczodoly
    c.fillStyle = '#2c2416';
    c.beginPath();
    c.arc(x - 3, y - 27, 2, 0, Math.PI * 2);
    c.arc(x + 3, y - 27, 2, 0, Math.PI * 2);
    c.fill();
    // Peknieta szczeka (drobny detal)
    c.strokeStyle = '#b0a488';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x - 4, y - 19);
    c.lineTo(x + 4, y - 19 + rng() * 2);
    c.stroke();
}

function drawSteps(c: CanvasRenderingContext2D, rng: () => number, x: number, y: number): void {
    c.save();
    c.translate(x, y);
    for (let i = 0; i < 4; i++) {
        c.globalAlpha = 0.85;
        c.fillStyle = i % 2 ? '#b0a080' : '#a29272';
        c.fillRect(-26 + i * 4, -8 + i * 6, 52 - i * 8, 8);
        c.globalAlpha = 0.5;
        c.strokeStyle = '#6b5a3c';
        c.lineWidth = 1.5;
        c.strokeRect(-26 + i * 4, -8 + i * 6, 52 - i * 8, 8);
    }
    c.restore();
    void rng;
}

function drawPerimeterWall(c: CanvasRenderingContext2D, rng: () => number): void {
    const T = 22;
    c.fillStyle = '#6b5138';
    c.fillRect(0, 0, WORLD_W, T);
    c.fillRect(0, WORLD_H - T, WORLD_W, T);
    c.fillRect(0, 0, T, WORLD_H);
    c.fillRect(WORLD_W - T, 0, T, WORLD_H);

    // Segmenty blokow (jasniejsze fugi) + krenelaz do wewnatrz
    c.fillStyle = '#8a6a48';
    for (let x = 0; x < WORLD_W; x += 64) {
        c.fillRect(x, 2, 56, 8);
        c.fillRect(x + 20, WORLD_H - 10, 56, 8);
        if (rng() < 0.75) c.fillRect(x + 8, T, 22, 10);              // krenelaz top
        if (rng() < 0.75) c.fillRect(x + 30, WORLD_H - T - 10, 22, 10); // krenelaz bottom
    }
    for (let y = 0; y < WORLD_H; y += 64) {
        c.fillRect(2, y, 8, 56);
        c.fillRect(WORLD_W - 10, y + 20, 8, 56);
        if (rng() < 0.75) c.fillRect(T, y + 8, 10, 22);              // krenelaz left
        if (rng() < 0.75) c.fillRect(WORLD_W - T - 10, y + 30, 10, 22); // krenelaz right
    }
}
