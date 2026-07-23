import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * RuinsLake — jeziorko mapy Fortified Ruins (FAZA CTF F1, mobile-crisp F4.1d).
 *
 * ICollidable (x/y = TOP-LEFT): wchodzi TYLKO do `buildings` (blokuje czolgi),
 * NIE do `solidBuildings` — pociski przelatuja nad woda.
 *
 * F4.1d (mobile): na mobile antialiasing renderera jest OFF => zywe wektory PIXI
 * mialy postrzepione ("pikselowate") krawedzie. Fix: caly STATYCZNY wizual jest
 * teraz WYPIEKANY w Canvas 2D (ktory zawsze AA) -> jedna PIXI.Texture -> Sprite
 * (gladkie krawedzie, tańszy fill-rate, spojne z reszta baked mapy). Animowane
 * zostaja tylko cienkie bliki + 2 pierscienie fal (Graphics overlay).
 *
 * Ksztalt NIEREGULARNY (postrzepiona sylwetka, wspolna dla warstw wody).
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

const CSS = {
    bank:      '#6b5a3c',
    bankWet:   '#4a4226',
    shallow:   '#4f9a92',
    mid:       '#347a78',
    deep:      '#214f58',
    highlight: '#c8ece4',
    stone:     '#8a7a5c',
    stoneHi:   '#b0a488',
    reed:      '#4a7c3f',
    reedDark:  '#35602c',
    lily:      '#4f8a44',
    lilyDark:  '#35662f',
    flower:    '#f4ead0',
    flowerHot: '#e8a0c0',
    flowerMid: '#ffd848',
};
const HL_NUM = 0xc8ece4;   // highlight dla animowanych blikow/fal
const MARGIN = 28;         // zapas canvasa na trzcine/kamienie wystajace poza AABB

interface LakeGlint { x: number; y: number; len: number; phase: number; }

export class RuinsLake implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private container: PIXI.Container;
    private sprite: PIXI.Sprite;
    private gfxGlints: PIXI.Graphics;
    private glints: LakeGlint[];

    constructor(
        x: number,
        y: number,
        w: number,
        h: number,
        seed: number,
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
        this.container.zIndex = 4; // woda pod wszystkim ruchomym
        worldContainer.addChild(this.container);

        const rng = makeRng(seed);

        // Sylwetka: 16 katow, mnoznik 0.78..1.0 (wglebienia, nigdy poza AABB)
        const shape: number[] = [];
        for (let i = 0; i < 16; i++) shape.push(0.78 + rng() * 0.22);

        // ── Wypiecz statyczna tafle w Canvas 2D (AA) -> Texture -> Sprite ──
        const canvas = buildLakeCanvas(w, h, shape, rng);
        this.sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
        this.sprite.x = -MARGIN;
        this.sprite.y = -MARGIN;
        this.container.addChild(this.sprite);

        // Overlay animacji (bliki + fale) — cienki, na wierzchu
        this.gfxGlints = new PIXI.Graphics();
        this.container.addChild(this.gfxGlints);

        this.glints = [];
        for (let i = 0; i < 6; i++) {
            this.glints.push({
                x: (rng() - 0.5) * w * 0.6,
                y: (rng() - 0.5) * h * 0.4,
                len: 8 + rng() * 14,
                phase: rng() * Math.PI * 2,
            });
        }
    }

    /** Tania animacja: 2 rozchodzace sie pierscienie fal (mini-ruch) + bliki. */
    public update(): void {
        const time = Date.now();
        const g = this.gfxGlints;
        g.clear();
        const cx = this.w / 2;
        const cy = this.h / 2;
        const rx = this.w / 2;
        const ry = this.h / 2;

        for (let k = 0; k < 2; k++) {
            const period = 2600;
            const t = ((time + k * 1300) % period) / period;
            const rr = 6 + t * Math.min(rx, ry) * 0.8;
            const alpha = 0.26 * (1 - t);
            if (alpha <= 0.03) continue;
            g.lineStyle(1.5, HL_NUM, alpha);
            g.drawEllipse(cx, cy + ry * 0.06, rr, rr * 0.7);
            g.lineStyle(0);
        }

        for (const gl of this.glints) {
            const alpha = 0.22 + Math.sin(time / 800 + gl.phase) * 0.18;
            if (alpha <= 0.06) continue;
            g.lineStyle(1.5, HL_NUM, alpha);
            g.moveTo(cx + gl.x, cy + gl.y);
            g.lineTo(cx + gl.x + gl.len, cy + gl.y);
            g.lineStyle(0);
        }
    }
}

// =================================================================
// Canvas 2D bake (AA) — statyczna tafla jeziorka
// =================================================================

function blobPath(
    c: CanvasRenderingContext2D, shape: number[],
    cx: number, cy: number, rx: number, ry: number, scale: number,
): void {
    const N = shape.length;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const m = shape[i] * scale;
        pts.push([cx + Math.cos(a) * rx * m, cy + Math.sin(a) * ry * m]);
    }
    c.beginPath();
    c.moveTo((pts[0][0] + pts[N - 1][0]) / 2, (pts[0][1] + pts[N - 1][1]) / 2);
    for (let i = 0; i < N; i++) {
        const [px, py] = pts[i];
        const [nx, ny] = pts[(i + 1) % N];
        c.quadraticCurveTo(px, py, (px + nx) / 2, (py + ny) / 2);
    }
    c.closePath();
}

function buildLakeCanvas(w: number, h: number, shape: number[], rng: () => number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w + MARGIN * 2);
    cv.height = Math.ceil(h + MARGIN * 2);
    const c = cv.getContext('2d')!;
    c.translate(MARGIN, MARGIN);   // canvas (MARGIN,MARGIN) == world-local (0,0)

    const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;

    // Brzeg (sucha ziemia) — postrzepiony, ~AABB => hitbox uczciwy
    c.fillStyle = CSS.bank;
    blobPath(c, shape, cx, cy, rx, ry, 1.0); c.fill();
    c.globalAlpha = 0.85; c.fillStyle = CSS.bankWet;
    blobPath(c, shape, cx, cy, rx, ry, 0.94); c.fill();
    c.globalAlpha = 1;

    // Woda: plytko -> gleboko (te same wglebienia => spojna tafla)
    c.fillStyle = CSS.shallow; blobPath(c, shape, cx, cy, rx, ry, 0.87); c.fill();
    c.fillStyle = CSS.mid;     blobPath(c, shape, cx, cy + ry * 0.05, rx, ry, 0.66); c.fill();
    c.fillStyle = CSS.deep;    blobPath(c, shape, cx, cy + ry * 0.09, rx, ry, 0.42); c.fill();

    // Refleks nieba (jasny sierp przy gornej krawedzi wody)
    c.save();
    c.globalAlpha = 0.32; c.fillStyle = CSS.highlight;
    c.beginPath(); c.ellipse(cx - rx * 0.12, cy - ry * 0.42, rx * 0.46, ry * 0.13, 0, 0, Math.PI * 2); c.fill();
    c.restore();

    // Kamienie brzegowe (osadzone: cien pod kazdym)
    const stones = 7 + Math.floor(rng() * 4);
    for (let i = 0; i < stones; i++) {
        const a = rng() * Math.PI * 2;
        const idx = Math.floor((a / (Math.PI * 2)) * shape.length) % shape.length;
        const edge = shape[idx] * 0.96;
        const sx = cx + Math.cos(a) * rx * edge;
        const sy = cy + Math.sin(a) * ry * edge;
        const sr = 3 + rng() * 3.5;
        c.save();
        c.globalAlpha = 0.3; c.fillStyle = '#2c2416';
        c.beginPath(); c.ellipse(sx + 1, sy + sr * 0.6, sr * 1.1, sr * 0.5, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1; c.fillStyle = CSS.stone;
        c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.5; c.fillStyle = CSS.stoneHi;
        c.beginPath(); c.arc(sx - sr * 0.3, sy - sr * 0.3, sr * 0.4, 0, Math.PI * 2); c.fill();
        c.restore();
    }

    // Sitowie / trzcina na 3 lukach brzegu
    for (const baseA of [Math.PI * 1.15, Math.PI * 1.7, Math.PI * 0.35]) {
        const clumps = 5 + Math.floor(rng() * 4);
        for (let i = 0; i < clumps; i++) {
            const a = baseA + (rng() - 0.5) * 0.5;
            const bx = cx + Math.cos(a) * rx * 0.9;
            const by = cy + Math.sin(a) * ry * 0.88;
            const hh = 10 + rng() * 12;
            const lean = (rng() - 0.5) * 6;
            c.strokeStyle = rng() < 0.5 ? CSS.reed : CSS.reedDark;
            c.lineWidth = 2; c.globalAlpha = 0.85;
            c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + lean, by - hh); c.stroke();
            c.globalAlpha = 1;
            if (rng() < 0.5) {
                c.fillStyle = '#6b4c2a';
                c.beginPath(); c.ellipse(bx + lean, by - hh, 1.4, 3, 0, 0, Math.PI * 2); c.fill();
            }
        }
    }

    // Lilie wodne z kwiatem
    const pads = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < pads; i++) {
        const lx = cx + (rng() - 0.5) * rx * 0.9;
        const ly = cy + (rng() - 0.5) * ry * 0.6;
        const pr = 6 + rng() * 4;
        c.globalAlpha = 0.9; c.fillStyle = CSS.lilyDark;
        c.beginPath(); c.ellipse(lx, ly, pr, pr * 0.72, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = CSS.lily;
        c.beginPath(); c.ellipse(lx - pr * 0.1, ly - pr * 0.12, pr * 0.8, pr * 0.56, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1; c.fillStyle = CSS.mid;
        c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + pr * 0.9, ly - pr * 0.3); c.lineTo(lx + pr * 0.9, ly + pr * 0.3); c.closePath(); c.fill();
        if (rng() < 0.6) {
            const fc = rng() < 0.5 ? CSS.flower : CSS.flowerHot;
            c.fillStyle = fc;
            for (let p = 0; p < 6; p++) {
                const pa = (p / 6) * Math.PI * 2;
                c.beginPath(); c.ellipse(lx + Math.cos(pa) * 2.2, ly + Math.sin(pa) * 1.6, 1.6, 1.0, 0, 0, Math.PI * 2); c.fill();
            }
            c.fillStyle = CSS.flowerMid;
            c.beginPath(); c.arc(lx, ly, 1.2, 0, Math.PI * 2); c.fill();
        }
    }

    return cv;
}
