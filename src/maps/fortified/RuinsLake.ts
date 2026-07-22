import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * RuinsLake — jeziorko mapy Fortified Ruins (FAZA CTF F1).
 *
 * ICollidable (x/y = TOP-LEFT): wchodzi TYLKO do `buildings` (blokuje czolgi),
 * NIE do `solidBuildings` — pociski przelatuja nad woda (zachowanie legacy 1:1).
 * Wizual: owal wody 2.5D w AABB (brzeg + toń + glebia) static baked +
 * tania animacja blikow (6 krotkich krech na powierzchni — maly redraw).
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

const PALETTE = {
    bank:      0x6b5a3c,
    waterEdge: 0x4e6e52,
    waterMid:  0x3a5a54,
    waterDeep: 0x2a4650,
    glint:     0x9fc8a8,
};

interface LakeGlint {
    x: number;
    y: number;
    len: number;
    phase: number;
}

export class RuinsLake implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private container: PIXI.Container;
    private gfxStatic: PIXI.Graphics;
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

        // PIXI.Graphics init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = 4; // woda pod wszystkim ruchomym
        worldContainer.addChild(this.container);

        this.gfxStatic = new PIXI.Graphics();
        this.gfxGlints = new PIXI.Graphics();
        this.container.addChild(this.gfxStatic);
        this.container.addChild(this.gfxGlints);

        const rng = makeRng(seed);
        this.glints = [];
        for (let i = 0; i < 6; i++) {
            this.glints.push({
                x: w * (0.2 + rng() * 0.6),
                y: h * (0.25 + rng() * 0.5),
                len: 8 + rng() * 14,
                phase: rng() * Math.PI * 2,
            });
        }

        this.drawStatic(rng);
    }

    private drawStatic(rng: () => number): void {
        const g = this.gfxStatic;
        const cx = this.w / 2;
        const cy = this.h / 2;
        const rx = this.w / 2;
        const ry = this.h / 2;

        // Brzeg (ciemna ziemia) — wypelnia caly AABB => hitbox uczciwy
        g.beginFill(PALETTE.bank);
        g.drawEllipse(cx, cy, rx, ry);
        g.endFill();

        // Ton wody (koncentryczne elipsy => glebia 2.5D)
        g.beginFill(PALETTE.waterEdge);
        g.drawEllipse(cx, cy, rx * 0.92, ry * 0.88);
        g.endFill();
        g.beginFill(PALETTE.waterMid);
        g.drawEllipse(cx, cy + ry * 0.05, rx * 0.72, ry * 0.64);
        g.endFill();
        g.beginFill(PALETTE.waterDeep);
        g.drawEllipse(cx, cy + ry * 0.1, rx * 0.46, ry * 0.38);
        g.endFill();

        // Kamienie brzegowe
        g.beginFill(0x8a7a5c);
        const stones = 6 + Math.floor(rng() * 4);
        for (let i = 0; i < stones; i++) {
            const a = rng() * Math.PI * 2;
            g.drawCircle(cx + Math.cos(a) * rx * 0.93, cy + Math.sin(a) * ry * 0.9, 3 + rng() * 3);
        }
        g.endFill();

        // Lilie wodne
        g.beginFill(0x5f9450, 0.85);
        const pads = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < pads; i++) {
            g.drawEllipse(cx + (rng() - 0.5) * rx, cy + (rng() - 0.5) * ry * 0.7, 6 + rng() * 4, 4 + rng() * 3);
        }
        g.endFill();
    }

    /** Tania animacja: 6 blikow swiatla pulsujacych na powierzchni. */
    public update(): void {
        const time = Date.now();
        const g = this.gfxGlints;
        g.clear();
        for (const gl of this.glints) {
            const alpha = 0.25 + Math.sin(time / 800 + gl.phase) * 0.2;
            if (alpha <= 0.08) continue;
            g.lineStyle(1.5, PALETTE.glint, alpha);
            g.moveTo(gl.x, gl.y);
            g.lineTo(gl.x + gl.len, gl.y);
        }
        g.lineStyle(0);
    }
}
