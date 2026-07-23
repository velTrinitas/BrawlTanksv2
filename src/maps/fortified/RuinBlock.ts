import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * RuinBlock — kamienny blok kolizyjny mapy Fortified Ruins (FAZA CTF F1, rock crisp F4.1e).
 *
 * Dwa warianty:
 *  - 'wall': segment muru fortecy (U-shape wokol flag) — plaski kamien z fugami.
 *            Krawedzie osiowe (prostokat) => ostry nawet bez AA => zostaje Graphics.
 *  - 'rock': skala oslonowa / zwalona kolumna — bryła 2.5D z ukosnymi krawedziami.
 *            Na mobile (AA renderera OFF) ukosne krawedzie wektora "pikselowaly",
 *            wiec skala jest WYPIEKANA w Canvas 2D (AA) -> Texture -> Sprite.
 *            Tekstura cachowana per-seed (layout deterministyczny) => zero rebake/leaku.
 *
 * ICollidable: x/y = TOP-LEFT hitboxa (konwencja repo), hitbox == wizual (Czytelnosc).
 * Static (rysowane/pieczone raz), update() = no-op.
 * Wchodzi do buildings + solidBuildings (blokuje czolgi i pociski).
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

function shade(color: number, factor: number): number {
    const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
    const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
    const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
    return (r << 16) | (g << 8) | b;
}
function css(color: number): string { return '#' + color.toString(16).padStart(6, '0'); }
function shadeCss(color: number, factor: number): string { return css(shade(color, factor)); }

interface RockTex { tex: PIXI.Texture; m: number; }
const ROCK_CACHE = new Map<number, RockTex>();

export class RuinBlock implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private container: PIXI.Container;
    private gfx: PIXI.Graphics | null = null;

    constructor(
        x: number,
        y: number,
        w: number,
        h: number,
        tone: number,
        seed: number,
        kind: 'wall' | 'rock',
        worldContainer: PIXI.Container,
    ) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        // Y-sort: dolna krawedz bryly decyduje o kolejnosci z czolgami
        this.container.zIndex = y + h;
        worldContainer.addChild(this.container);

        if (kind === 'wall') {
            this.gfx = new PIXI.Graphics();
            this.container.addChild(this.gfx);
            this.drawWall(tone, makeRng(seed));
        } else {
            // Skala: baked Canvas 2D (AA) -> Sprite (cache per-seed)
            const rt = getRockTexture(seed, w, h, tone);
            const spr = new PIXI.Sprite(rt.tex);
            spr.x = -rt.m;   // canvas(m,m) == local(0,0)
            spr.y = -rt.m;
            this.container.addChild(spr);
        }
    }

    /** Segment muru: plaski top z fugami blokow + krawedz 3D od dolu (Graphics — osiowy). */
    private drawWall(tone: number, rng: () => number): void {
        const g = this.gfx!;
        const w = this.w;
        const h = this.h;
        const LIP = 6; // krawedz 3D

        // Cien pod murem
        g.beginFill(0x3c2c18, 0.30);
        g.drawRect(3, 4, w, h + 3);
        g.endFill();

        // Sciana boczna (ciemniejsza, "wysokosc" muru)
        g.beginFill(shade(tone, 0.62));
        g.drawRect(0, LIP, w, h);
        g.endFill();

        // Top muru
        g.beginFill(tone);
        g.drawRect(0, 0, w, h);
        g.endFill();

        // Fugi blokow na topie
        g.lineStyle(1.5, shade(tone, 0.55), 0.7);
        const horizontal = w >= h;
        if (horizontal) {
            for (let bx = 24; bx < w; bx += 24 + rng() * 10) {
                g.moveTo(bx, 1);
                g.lineTo(bx, h - 1);
            }
        } else {
            for (let by = 20; by < h; by += 20 + rng() * 10) {
                g.moveTo(1, by);
                g.lineTo(w - 1, by);
            }
        }
        g.lineStyle(0);

        // Highlight gornej krawedzi
        g.beginFill(shade(tone, 1.25), 0.6);
        g.drawRect(0, 0, w, 3);
        g.endFill();

        // Wyszczerbienia (ruina!) — 2-3 ubytki
        const chips = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < chips; i++) {
            const cx = 4 + rng() * (w - 12);
            const cy = 2 + rng() * (h - 8);
            g.beginFill(shade(tone, 0.5), 0.8);
            g.drawCircle(cx, cy, 2.5 + rng() * 3);
            g.endFill();
        }
    }

    public update(): void {
        // static block — no per-frame work
    }
}

// =================================================================
// Canvas 2D bake (AA) — skala 2.5D, cache per-seed
// =================================================================

function getRockTexture(seed: number, w: number, h: number, tone: number): RockTex {
    const cached = ROCK_CACHE.get(seed);
    if (cached) return cached;
    const rt = buildRockCanvas(seed, w, h, tone);
    ROCK_CACHE.set(seed, rt);
    return rt;
}

function polygon(c: CanvasRenderingContext2D, pts: number[]): void {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
}

function buildRockCanvas(seed: number, w: number, h: number, tone: number): RockTex {
    const rng = makeRng(seed);
    const m = Math.ceil(Math.max(w, h) * 0.28) + 6;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w + m * 2);
    cv.height = Math.ceil(h + m * 2);
    const c = cv.getContext('2d')!;
    c.translate(m, m);   // canvas (m,m) == local (0,0)

    const cx = w / 2;
    const cy = h / 2;

    // Cien kontaktowy (szeroki, miekki, wysrodkowany => skala SIEDZI na ziemi)
    c.globalAlpha = 0.15; c.fillStyle = '#2c2012';
    c.beginPath(); c.ellipse(cx + 2, h * 0.99, w * 0.60, h * 0.20, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.26;
    c.beginPath(); c.ellipse(cx + 1, h * 0.93, w * 0.48, h * 0.15, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;

    // Bryla — nieregularny wielokat wpisany w AABB (hitbox = pelny AABB)
    const N = 9;
    const pts: number[] = [];
    for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const rx = (w / 2) * (0.90 + rng() * 0.10);
        const ry = (h / 2) * (0.88 + rng() * 0.12);
        pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    }
    c.fillStyle = shadeCss(tone, 0.72);
    polygon(c, pts); c.fill();

    // Top-face (przesuniety w gore i mniejszy — bryła 2.5D)
    const topPts: number[] = [];
    for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const rx = (w / 2) * (0.72 + rng() * 0.08);
        const ry = (h / 2) * (0.66 + rng() * 0.08);
        topPts.push(cx + Math.cos(a) * rx, cy - h * 0.12 + Math.sin(a) * ry);
    }
    c.fillStyle = css(tone);
    polygon(c, topPts); c.fill();

    // Highlight polnocno-zachodni
    c.globalAlpha = 0.5; c.fillStyle = shadeCss(tone, 1.3);
    c.beginPath(); c.ellipse(cx - w * 0.18, cy - h * 0.28, w * 0.18, h * 0.12, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;

    // Zacienienie u podstawy (kontakt z gruntem = brak lewitacji)
    c.globalAlpha = 0.32; c.fillStyle = shadeCss(tone, 0.5);
    c.beginPath(); c.ellipse(cx, h * 0.85, w * 0.4, h * 0.12, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;

    // Szczeliny
    c.strokeStyle = shadeCss(tone, 0.45); c.globalAlpha = 0.8; c.lineWidth = 1.5;
    const cracks = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < cracks; i++) {
        let px = cx + (rng() - 0.5) * w * 0.5;
        let py = cy - h * 0.2 + (rng() - 0.5) * h * 0.3;
        c.beginPath(); c.moveTo(px, py);
        const segs = 2 + Math.floor(rng() * 2);
        for (let s = 0; s < segs; s++) {
            px += (rng() - 0.5) * w * 0.3;
            py += rng() * h * 0.25;
            c.lineTo(px, py);
        }
        c.stroke();
    }
    c.globalAlpha = 1;

    // Mech (klimat ruin)
    if (rng() < 0.7) {
        c.globalAlpha = 0.55; c.fillStyle = '#5a6e3a';
        c.beginPath();
        c.ellipse(cx + (rng() - 0.5) * w * 0.4, cy + h * 0.15, 5 + rng() * 6, 3 + rng() * 3, 0, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
    }

    return { tex: PIXI.Texture.from(cv), m };
}
