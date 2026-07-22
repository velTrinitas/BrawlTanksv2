import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * RuinBlock — kamienny blok kolizyjny mapy Fortified Ruins (FAZA CTF F1).
 *
 * Dwa warianty:
 *  - 'wall': segment muru fortecy (U-shape wokol flag) — plaski kamien z fugami,
 *  - 'rock': skala oslonowa / zwalona kolumna — bryła 2.5D z cieniem i szczelinami.
 *
 * ICollidable: x/y = TOP-LEFT hitboxa (konwencja repo), hitbox == wizual (Czytelnosc).
 * Static baked (rysowane raz w konstruktorze), update() = no-op.
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

export class RuinBlock implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private container: PIXI.Container;
    private gfx: PIXI.Graphics;

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

        // PIXI.Graphics init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.gfx = new PIXI.Graphics();
        this.container.addChild(this.gfx);
        this.container.x = x;
        this.container.y = y;
        // Y-sort: dolna krawedz bryly decyduje o kolejnosci z czolgami
        this.container.zIndex = y + h;
        worldContainer.addChild(this.container);

        const rng = makeRng(seed);
        if (kind === 'wall') {
            this.drawWall(tone, rng);
        } else {
            this.drawRock(tone, rng);
        }
    }

    /** Segment muru: plaski top z fugami blokow + krawedz 3D od dolu. */
    private drawWall(tone: number, rng: () => number): void {
        const g = this.gfx;
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

    /** Skala 2.5D: cien + bryla nieregularna + top-face + szczeliny + mech. */
    private drawRock(tone: number, rng: () => number): void {
        const g = this.gfx;
        const w = this.w;
        const h = this.h;
        const cx = w / 2;
        const cy = h / 2;

        // Cien
        g.beginFill(0x3c2c18, 0.30);
        g.drawEllipse(cx + 5, h - 2, w * 0.55, h * 0.28);
        g.endFill();

        // Bryla — nieregularny wielokat wpisany w AABB (hitbox = pelny AABB,
        // wielokat go wypelnia prawie w calosci, roznica < 6 px => hitbox uczciwy)
        const pts: number[] = [];
        const N = 9;
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            const rx = (w / 2) * (0.90 + rng() * 0.10);
            const ry = (h / 2) * (0.88 + rng() * 0.12);
            pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
        }
        g.beginFill(shade(tone, 0.72));
        g.drawPolygon(pts);
        g.endFill();

        // Top-face (przesuniety w gore i mniejszy — bryła 2.5D)
        const topPts: number[] = [];
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            const rx = (w / 2) * (0.72 + rng() * 0.08);
            const ry = (h / 2) * (0.66 + rng() * 0.08);
            topPts.push(cx + Math.cos(a) * rx, cy - h * 0.12 + Math.sin(a) * ry);
        }
        g.beginFill(tone);
        g.drawPolygon(topPts);
        g.endFill();

        // Highlight polnocno-zachodni
        g.beginFill(shade(tone, 1.3), 0.5);
        g.drawEllipse(cx - w * 0.18, cy - h * 0.28, w * 0.18, h * 0.12);
        g.endFill();

        // Szczeliny
        g.lineStyle(1.5, shade(tone, 0.45), 0.8);
        const cracks = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < cracks; i++) {
            let px = cx + (rng() - 0.5) * w * 0.5;
            let py = cy - h * 0.2 + (rng() - 0.5) * h * 0.3;
            g.moveTo(px, py);
            const segs = 2 + Math.floor(rng() * 2);
            for (let s = 0; s < segs; s++) {
                px += (rng() - 0.5) * w * 0.3;
                py += rng() * h * 0.25;
                g.lineTo(px, py);
            }
        }
        g.lineStyle(0);

        // Mech (klimat ruin)
        if (rng() < 0.7) {
            g.beginFill(0x5a6e3a, 0.55);
            g.drawEllipse(cx + (rng() - 0.5) * w * 0.4, cy + h * 0.15, 5 + rng() * 6, 3 + rng() * 3);
            g.endFill();
        }
    }

    public update(): void {
        // static block — no per-frame work
    }
}
