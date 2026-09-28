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


/**
 * DESERT ART v2 (E1) — grunt fake-3D. Ten sam rozmiar co legacy (3000x3000, VRAM bez zmian),
 * pieczony RAZ i trzymany w groundTextureCache pod kluczem 'desert_v2'.
 * Slonce z lewej-gory (wspolne dla wszystkich propsow v2): stok NW wydmy jasny, SE w cieniu.
 * Losowosc wylacznie wizualna, ale ze stalym ziarnem (ten sam wyglad w kazdym meczu).
 */
export function buildDesertTextureV2(): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    let st = 0x5eed1234;
    const rnd = (): number => {
        st = (st + 0x6d2b79f5) | 0;
        let t = Math.imul(st ^ (st >>> 15), 1 | st);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // 1) Baza: szeroki gradient (cieplejszy srodek, chlodniejsze rogi)
    const base = c.createRadialGradient(WORLD_W * 0.45, WORLD_H * 0.45, 200, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.8);
    base.addColorStop(0, '#f0dcaa');
    base.addColorStop(0.6, '#e6cf98');
    base.addColorStop(1, '#d9bd84');
    c.fillStyle = base;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

    // 2) Wydmy: dlugie grzbiety z jasnym stokiem NW i cieniem SE
    for (let i = 0; i < 46; i++) {
        const cx = rnd() * WORLD_W;
        const cy = rnd() * WORLD_H;
        const len = 380 + rnd() * 520;
        const amp = 30 + rnd() * 60;
        const ang = -0.35 + rnd() * 0.7;          // wiatr ~ ze wschodu, grzbiety lekko skosne
        const depth = 60 + rnd() * 70;
        c.save();
        c.translate(cx, cy);
        c.rotate(ang);
        const ridge = (x: number): number => Math.sin((x / len) * Math.PI * 2 + i) * amp * 0.35 - Math.cos((x / len) * Math.PI) * amp;
        // cien (SE stok)
        const gS = c.createLinearGradient(0, 0, 0, depth);
        gS.addColorStop(0, 'rgba(150,105,55,0.30)');
        gS.addColorStop(1, 'rgba(150,105,55,0)');
        c.fillStyle = gS;
        c.beginPath();
        for (let x = -len / 2; x <= len / 2; x += 20) c.lineTo(x, ridge(x));
        for (let x = len / 2; x >= -len / 2; x -= 20) c.lineTo(x, ridge(x) + depth * (1 - Math.abs(x / (len / 2)) ** 2));
        c.closePath();
        c.fill();
        // swiatlo (NW stok)
        const gL = c.createLinearGradient(0, -depth * 0.8, 0, 0);
        gL.addColorStop(0, 'rgba(255,244,210,0)');
        gL.addColorStop(1, 'rgba(255,244,210,0.38)');
        c.fillStyle = gL;
        c.beginPath();
        for (let x = -len / 2; x <= len / 2; x += 20) c.lineTo(x, ridge(x));
        for (let x = len / 2; x >= -len / 2; x -= 20) c.lineTo(x, ridge(x) - depth * 0.8 * (1 - Math.abs(x / (len / 2)) ** 2));
        c.closePath();
        c.fill();
        // ostra krawedz grzbietu
        c.strokeStyle = 'rgba(255,248,225,0.45)';
        c.lineWidth = 2;
        c.beginPath();
        for (let x = -len / 2 + 30; x <= len / 2 - 30; x += 20) c.lineTo(x, ridge(x));
        c.stroke();
        c.restore();
    }

    // 3) Zmarszczki wiatru (ripple marks): krotkie fale, para jasna+ciemna
    c.lineWidth = 1.4;
    for (let i = 0; i < 900; i++) {
        const x = rnd() * WORLD_W;
        const y = rnd() * WORLD_H;
        const w = 40 + rnd() * 70;
        const a = 0.10 + rnd() * 0.12;
        c.strokeStyle = 'rgba(170,125,70,' + a + ')';
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + w / 2, y - 5, x + w, y + 1);
        c.stroke();
        c.strokeStyle = 'rgba(255,245,215,' + (a * 1.2) + ')';
        c.beginPath();
        c.moveTo(x, y - 2.5);
        c.quadraticCurveTo(x + w / 2, y - 7.5, x + w, y - 1.5);
        c.stroke();
    }

    // 4) Ziarno piasku (tanszy odpowiednik legacy: fillRect zamiast ellipse+save/restore)
    const grain = ['#f8e8c0', '#eecf90', '#c8a870', '#a87848', '#fff4d8'];
    for (let i = 0; i < 9000; i++) {
        c.globalAlpha = 0.10 + rnd() * 0.22;
        c.fillStyle = grain[(rnd() * grain.length) | 0];
        const sz = 1 + rnd() * 2.5;
        c.fillRect(rnd() * WORLD_W, rnd() * WORLD_H, sz, sz);
    }
    // 5) Kamyczki z cieniem (fake-3D): cien SE + jasny czubek NW
    for (let i = 0; i < 260; i++) {
        const x = rnd() * WORLD_W;
        const y = rnd() * WORLD_H;
        const r = 1.8 + rnd() * 3.2;
        c.globalAlpha = 0.35;
        c.fillStyle = '#7a5530';
        c.beginPath(); c.ellipse(x + r * 0.6, y + r * 0.6, r, r * 0.7, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.9;
        c.fillStyle = '#b8966a';
        c.beginPath(); c.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#e8d2a8';
        c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.3, r * 0.45, r * 0.3, 0, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;

    // 6) Winieta brzegow — mapa "zamyka sie" w cieplym cieniu (czytelnosc granicy)
    const vig = c.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.42, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.72);
    vig.addColorStop(0, 'rgba(120,80,40,0)');
    vig.addColorStop(1, 'rgba(120,80,40,0.22)');
    c.fillStyle = vig;
    c.fillRect(0, 0, WORLD_W, WORLD_H);

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

/**
 * DESERT ART v2 (E1) — kolizje i katarakty bez deadzonow.
 * Pomiar flood-fill (siatka 10 px, promien czolgu 20/30/45): legacy ma kieszen NE
 * x 2190-2380 y 90-230 dostepna tylko "na styk" (klinowanie). V2 usuwa 6 malych skal
 * zamykajacych kieszenie i dokleja 1 wypelniacz (0.893, 0.053) — przy R=45 mapa = 1 obszar.
 * Pozostale komorki R=20 za skalami przy dolnej krawedzi sa NIEOSIAGALNE (zamkniete).
 */
export const DESERT_V2_PYRAMID_HITBOX_PAD = 30;
export const DESERT_V2_SPHINX_HITBOX_PAD = 30;
export const DESERT_RIVER_CATARACT_ROCKS_V2 = [
    { x: WORLD_W * 0.93, y: WORLD_H * 0.05, size: 80, seed: 51 },
    { x: WORLD_W * 0.88, y: WORLD_H * 0.02, size: 75, seed: 53 },
    { x: WORLD_W * 0.82, y: WORLD_H * 0.02, size: 70, seed: 57 },
    { x: WORLD_W * 0.96, y: WORLD_H * 0.12, size: 65, seed: 61 },
    { x: WORLD_W * 0.87, y: WORLD_H * 0.09, size: 90, seed: 63 },
    { x: WORLD_W * 0.893, y: WORLD_H * 0.053, size: 45, seed: 65 },   // wypelniacz szczeliny NE

    { x: WORLD_W * 0.07, y: WORLD_H * 0.95, size: 80, seed: 71 },
    { x: WORLD_W * 0.15, y: WORLD_H * 0.98, size: 75, seed: 73 },
    { x: WORLD_W * 0.04, y: WORLD_H * 0.98, size: 70, seed: 77 },
    { x: WORLD_W * 0.20, y: WORLD_H * 0.96, size: 65, seed: 81 },
    { x: WORLD_W * 0.13, y: WORLD_H * 0.91, size: 90, seed: 83 },
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

/** DESERT ART v2: piaski przy koncach Nilu zwezone (150 -> 110), reszta bez zmian. */
export const DESERT_QUICKSAND_LAYOUT_V2 = DESERT_QUICKSAND_LAYOUT.map(q =>
    q.rX === 150 ? { ...q, rX: 110 } : q,
);

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

// =================================================================
// DESERT ART v2 / E3 — PIASKOWIEC + PETLA KARAWANY
// =================================================================

/**
 * Zestrzeliwalny piaskowiec: 7 oslon po 2 bloki (scianka 120x60, bez szczeliny).
 * Srodki wybrane skryptem (farthest-point na wolnych polach wnetrza mapy 380-2620):
 * kazdy srodek ma >= 185 px od KAZDEGO collidera v2, strefy piasku/oazy i padu,
 * czyli >= 120 px wolnego przejazdu wokol scianki, i >= 100 px od petli karawany.
 * Orientacja naprzemienna.
 */
export const DESERT_SANDSTONE_SPOTS_V2 = [
    { x: 2220, y: 2540, vertical: false },
    { x: 540, y: 380, vertical: true },
    { x: 540, y: 2500, vertical: false },
    { x: 1800, y: 650, vertical: true },    // (2140,400) kolidowalo z petla karawany
    { x: 1200, y: 1440, vertical: false },
    { x: 2620, y: 1580, vertical: true },
    { x: 380, y: 1700, vertical: false },
];

/**
 * Karawana v2: jedna ZAMKNIETA petla przez NW, most NE (2288,496), wschodni brzeg,
 * most S (1431,2229) i zachodnia czesc mapy — zamiast ping-ponga w rogu.
 * Zweryfikowana skryptem: >= 18 px od kazdego collidera (wielblady nie maja kolizji,
 * ale drop musi byc osiagalny), ~7.2k px = ~4.4 min okrazenia.
 */
export const DESERT_CARAVAN_LOOP_V2 = [
    { x: 250, y: 160 },
    { x: 600, y: 140 },
    { x: 950, y: 200 },
    { x: 1500, y: 330 },
    { x: 2000, y: 380 },
    { x: 2200, y: 440 },
    { x: 2288, y: 496 },
    { x: 2380, y: 560 },
    { x: 2330, y: 730 },
    { x: 2300, y: 1050 },
    { x: 2270, y: 1500 },
    { x: 2225, y: 1720 },
    { x: 2225, y: 2020 },
    { x: 2150, y: 2200 },
    { x: 1640, y: 2200 },
    { x: 1530, y: 2285 },
    { x: 1431, y: 2229 },
    { x: 1330, y: 2140 },
    { x: 1080, y: 1930 },
    { x: 780, y: 1780 },
    { x: 700, y: 1400 },
    { x: 720, y: 1000 },
    { x: 700, y: 900 },
    { x: 500, y: 500 },
];

// =================================================================
// DESERT ART v2 / E6 — ZABYTKI (pomysly historyczne, math-verified skryptem)
// =================================================================

/**
 * Pomiar (scratchpad sesji, desert_e3.cjs + footprinty):
 *  - pylon (2 wieze 90x60, przejazd 120 px) na (980,2100): >= 135 px od przeszkod, 75 px od petli
 *    karawany, 1270 px od STARTU GRACZA (800,800 — sprawdzac przy kazdej nowej przeszkodzie!),
 *  - obeliski 28x28: >= 147 px od wszystkiego,
 *  - Kolosy 70x80 nad Nilem: 89 / 124 px od pasa rzeki (czolg przejezdza za nimi — brak kieszeni),
 *    >= 213 px od mostow, 26 px od ruchomych piaskow (bez nakladania).
 */
/**
 * E7 — obozowisko archeologow przy piramidzie za rzeka (2550,1260). Pomiar skryptem:
 * namiot 90x70: 95 px od krawedzi mapy (przy starej 40), 375 px od stref;
 * jeep 70x40: 105 px od piramidy; namiot-jeep 105 px przejazdu; wykop przejezdny,
 * poza korytarzem wyjscia archeologow (2490-2610 x 1030-1130). Start gracza daleko.
 */
export const DESERT_CAMP_V2 = {
    tent: { x: 2820, y: 1175 },
    jeep: { x: 2810, y: 1335 },
    dig: { x: 2715, y: 1060 },
};

export const DESERT_MONUMENTS_V2 = {
    // v2 fix: bylo (940,820) — lewa wieza stala na domyslnym starcie gracza (800,800, Player.ts).
    pylon: { x: 980, y: 2100, gap: 120 },
    obelisks: [
        { x: 910, y: 2210 },    // para przed brama pylonu (jak w Luksorze)
        { x: 1050, y: 2210 },
        { x: 1480, y: 520 },    // samotny obelisk — cien jak zegar sloneczny
    ],
    colossi: [
        { x: 1536, y: 1833 },
        { x: 1400, y: 1935 },
    ],
    /** Szaduf na wschodnim brzegu stawu oazy centralnej (0.35, 0.40). */
    shaduf: { x: 1098, y: 1192 },
    feluccaCount: 3,
};
