import * as PIXI from 'pixi.js';

/**
 * RuinsBush — KWADRATOWA strefa STEALTH mapy Fortified Ruins (mobile-crisp F4.1d).
 *
 * Passable strefa stealth (isPointInside = KWADRAT) + wpiecie w petle stealth w main.ts.
 * Wizual = pole WYSOKIEJ ZIELONEJ TRAWY (jak KTB), czolg JEDZIE MIEDZY trawa.
 *
 * F4.1d (mobile): wczesniej trawa to setki zywych wektorow PIXI (Graphics) — na
 * mobile (antialiasing renderera OFF) migotaly i "pikselowaly" przy scrollu.
 * Fix: trawa jest teraz WYPIEKANA w Canvas 2D (AA) do tekstur i rysowana jako
 * SPRITE'Y. Zeby zachowac efekt "czolg miedzy trawa", trawa dzieli sie na K
 * poziomych PASOW — kazdy pas to osobny sprite z wlasnym zIndex = jego world-Y,
 * wiec sortuje sie z czolgiem (pasy przed czolgiem zaslaniaja, pasy za nim sa z
 * tylu). Efekt: crisp + brak migotania + tańszy fill-rate niz setki wektorow.
 * Tekstury sa CACHOWANE per-seed (layout deterministyczny) => zero rebake i zero
 * leaku przy restarcie meczu.
 *
 * Animacja: sam skew.x kazdego pasa (lekki wiatr, pasy falują warstwami). Podloze
 * (murawa) = osobny sprite POD czolgami. Usuniete: glif oka + niebieskawy okrag.
 */

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

const GRASS_DARK = '#2f5a1c';
const GRASS_MID = '#4a8028';
const GRASS_LIGHT = '#70b048';
const HEAD = 64;   // zapas pionowy canvasa na wysokosc zdzbel
const PADX = 20;   // zapas poziomy na szerokosc/pochylenie zdzbel

interface BandTex {
    tex: PIXI.Texture;
    bandTop: number;   // world-local Y gornej krawedzi pasa (wzgledem srodka strefy)
    anchorX: number;
    anchorY: number;
    zBase: number;     // world-local Y srodka pasa (do zIndex)
}
interface ZoneTex {
    floor: PIXI.Texture;
    floorAnchor: number;
    bands: BandTex[];
}

// Cache tekstur per-seed (layout deterministyczny => buduj raz, reuse miedzy meczami)
const ZONE_CACHE = new Map<number, ZoneTex>();

interface BandSprite { spr: PIXI.Sprite; phase: number; amp: number; }

export class RuinsBush {
    public readonly x: number;   // center
    public readonly y: number;   // center
    public readonly r: number;   // POLOWA boku kwadratu (stealth half-extent)

    private floorSprite: PIXI.Sprite;
    private bands: BandSprite[];

    constructor(
        x: number,
        y: number,
        r: number,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        this.x = x;
        this.y = y;
        this.r = r;

        const zt = getZoneTextures(seed, r);

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.floorSprite = new PIXI.Sprite(zt.floor);
        this.floorSprite.anchor.set(zt.floorAnchor, zt.floorAnchor);
        this.floorSprite.x = x;
        this.floorSprite.y = y;
        this.floorSprite.zIndex = y - r - 4; // murawa POD czolgami
        worldContainer.addChild(this.floorSprite);

        this.bands = [];
        for (const b of zt.bands) {
            const spr = new PIXI.Sprite(b.tex);
            spr.anchor.set(b.anchorX, b.anchorY);
            spr.x = x;
            spr.y = y + b.bandTop;
            spr.zIndex = y + b.zBase; // Y-sort z czolgiem => czolg MIEDZY pasami trawy
            worldContainer.addChild(spr);
            this.bands.push({
                spr,
                phase: (x * 0.013 + b.bandTop * 0.02),
                amp: 0.028 + (Math.abs(Math.sin(seed + b.bandTop))) * 0.02,
            });
        }
    }

    /** Punkt (world coords) w KWADRATOWEJ strefie stealth? */
    public isPointInside(px: number, py: number): boolean {
        return Math.abs(px - this.x) <= this.r && Math.abs(py - this.y) <= this.r;
    }

    /** Tania animacja: lekki wiatr — skew.x kazdego pasa (bez redraw). */
    public update(): void {
        const t = Date.now();
        for (const b of this.bands) {
            b.spr.skew.x = Math.sin(t / 900 + b.phase) * b.amp;
        }
    }
}

// =================================================================
// Canvas 2D bake (AA) — murawa + pasy trawy, cache per-seed
// =================================================================

function getZoneTextures(seed: number, r: number): ZoneTex {
    const cached = ZONE_CACHE.get(seed);
    if (cached) return cached;
    const zt = buildZoneTextures(seed, r);
    ZONE_CACHE.set(seed, zt);
    return zt;
}

function roundRectPath(
    c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number,
): void {
    const rr = Math.min(rad, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
}

function drawBladeCanvas(
    c: CanvasRenderingContext2D, bx: number, byBase: number, h: number, tilt: number, col: string,
): void {
    const tipX = bx + tilt;
    const tipY = byBase - h;
    const midX = bx + tilt * 0.5;
    const midY = byBase - h * 0.5;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(bx - 1.9, byBase);
    c.lineTo(bx + 1.9, byBase);
    c.quadraticCurveTo(midX + 1.0, midY, tipX, tipY);
    c.quadraticCurveTo(midX - 1.0, midY, bx - 1.9, byBase);
    c.closePath();
    c.fill();
    if (col !== GRASS_DARK) {
        c.fillStyle = 'rgba(168,216,112,0.55)';
        c.beginPath();
        c.moveTo(tipX, tipY);
        c.lineTo(midX + 0.8, midY);
        c.lineTo(midX - 0.8, midY);
        c.closePath();
        c.fill();
    }
}

function buildZoneTextures(seed: number, r: number): ZoneTex {
    const rng = makeRng(seed);

    // ── Murawa (podloze strefy) ──
    const fpad = 6;
    const FW = Math.ceil(2 * r + 2 * fpad);
    const fc = document.createElement('canvas');
    fc.width = FW; fc.height = FW;
    const fx = fc.getContext('2d')!;
    fx.translate(fpad + r, fpad + r);
    fx.globalAlpha = 0.5; fx.fillStyle = '#142808';
    roundRectPath(fx, -r - 4, -r - 2, (r + 4) * 2, (r + 2) * 2, r * 0.35); fx.fill();
    fx.globalAlpha = 0.95; fx.fillStyle = '#1c3810';
    roundRectPath(fx, -r, -r, r * 2, r * 2, r * 0.3); fx.fill();
    fx.globalAlpha = 0.5; fx.fillStyle = '#264a16';
    const patches = Math.floor(r * 0.4);
    for (let i = 0; i < patches; i++) {
        const px = (rng() - 0.5) * r * 1.8;
        const py = (rng() - 0.5) * r * 1.8;
        fx.beginPath();
        fx.ellipse(px, py, 6 + rng() * 12, 4 + rng() * 8, 0, 0, Math.PI * 2);
        fx.fill();
    }
    fx.globalAlpha = 1;
    const floor = PIXI.Texture.from(fc);
    const floorAnchor = (fpad + r) / FW;

    // ── Zdzbla trawy (+200% gestosci; dzielnik 283) ──
    const count = Math.floor(((r * 2) * (r * 2)) / 283);
    const K = Math.max(4, Math.round((2 * r) / 32));
    const bh = (2 * r) / K;
    const blades: Array<{ lx: number; ly: number; h: number; tilt: number; col: string }> = [];
    for (let i = 0; i < count; i++) {
        const lx = (rng() * 2 - 1) * (r - 8);
        const ly = (rng() * 2 - 1) * (r - 8);
        const h = 28 + rng() * 32;
        const tilt = (rng() - 0.5) * 11;
        const pick = rng();
        const col = pick < 0.30 ? GRASS_DARK : pick < 0.68 ? GRASS_MID : GRASS_LIGHT;
        blades.push({ lx, ly, h, tilt, col });
    }

    // ── Pasy: kazdy to osobny canvas -> tekstura (Y-sort z czolgiem) ──
    const CW = Math.ceil(2 * r + 2 * PADX);
    const CH = Math.ceil(HEAD + bh + 4);
    const bands: BandTex[] = [];
    for (let k = 0; k < K; k++) {
        const bandTop = -r + k * bh;
        const bc = document.createElement('canvas');
        bc.width = CW; bc.height = CH;
        const bx = bc.getContext('2d')!;
        // rysuj zdzbla tego pasa od najdalszych (mniejsze ly) do najblizszych
        const inBand = blades
            .filter(bl => bl.ly >= bandTop && bl.ly < bandTop + bh)
            .sort((p, q) => p.ly - q.ly);
        for (const bl of inBand) {
            const cxp = PADX + r + bl.lx;
            const cyp = HEAD + (bl.ly - bandTop);
            drawBladeCanvas(bx, cxp, cyp, bl.h, bl.tilt, bl.col);
        }
        bands.push({
            tex: PIXI.Texture.from(bc),
            bandTop,
            anchorX: (PADX + r) / CW,
            anchorY: HEAD / CH,
            zBase: bandTop + bh * 0.5,
        });
    }

    return { floor, floorAnchor, bands };
}
