import * as PIXI from 'pixi.js';

/**
 * RuinsBush — strefa zarosli (stealth) mapy Fortified Ruins (FAZA CTF F1).
 *
 * Kolista strefa stealth (passable, bez kolizji) — wzorzec Oasis:
 * isPointInside + wpiecie w petle stealth w main.ts (jak corn/oasis/neon).
 * Wizual: klaster 5-7 blobow listowia (static baked) + tania animacja
 * "oddychania" (scale pulse calego kontenera — zero redraw geometrii).
 * Y-sort: zIndex = y + r, czolg w srodku chowa sie POD listowie (czytelny stealth).
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

const GREENS = [0x3f6e38, 0x4a7c3f, 0x5f9450, 0x557a30];

export class RuinsBush {
    public readonly x: number;   // center
    public readonly y: number;   // center
    public readonly r: number;   // stealth radius

    private container: PIXI.Container;
    private gfxBase: PIXI.Graphics;
    private gfxFoliage: PIXI.Graphics;
    private phase: number;

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

        // PIXI.Graphics init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + r; // listowie NAD czolgiem w strefie
        worldContainer.addChild(this.container);

        this.gfxBase = new PIXI.Graphics();
        this.gfxFoliage = new PIXI.Graphics();
        this.container.addChild(this.gfxBase);
        this.container.addChild(this.gfxFoliage);

        const rng = makeRng(seed);
        this.phase = rng() * Math.PI * 2;

        this.drawBase(rng);
        this.drawFoliage(rng);
    }

    /** Punkt (world coords) w kole stealth? */
    public isPointInside(px: number, py: number): boolean {
        const dx = px - this.x;
        const dy = py - this.y;
        return dx * dx + dy * dy <= this.r * this.r;
    }

    /** Ciemna podstawa + obrys strefy (czytelna granica stealth). */
    private drawBase(rng: () => number): void {
        const g = this.gfxBase;
        const r = this.r;

        // Cien strefy
        g.beginFill(0x2c3c22, 0.35);
        g.drawEllipse(0, r * 0.12, r * 1.02, r * 0.82);
        g.endFill();

        // Sciolka
        g.beginFill(0x4a5a30, 0.5);
        g.drawEllipse(0, 0, r * 0.95, r * 0.78);
        g.endFill();

        // Delikatny obrys granicy strefy
        g.lineStyle(2, 0x76ab63, 0.4);
        g.drawCircle(0, 0, r);
        g.lineStyle(0);
        void rng;
    }

    /** 5-7 blobow listowia + highlighty (static bake). */
    private drawFoliage(rng: () => number): void {
        const g = this.gfxFoliage;
        const r = this.r;
        const blobs = 5 + Math.floor(rng() * 3);

        for (let b = 0; b < blobs; b++) {
            const a = (b / blobs) * Math.PI * 2 + rng() * 0.6;
            const dist = r * (0.25 + rng() * 0.35);
            const bx = Math.cos(a) * dist;
            const by = Math.sin(a) * dist * 0.75;
            const br = r * (0.38 + rng() * 0.22);
            const col = GREENS[Math.floor(rng() * GREENS.length)];

            g.beginFill(col);
            g.drawCircle(bx, by, br);
            g.endFill();

            // Highlight blobu (polnocno-zachodni)
            g.beginFill(0x8cc26a, 0.4);
            g.drawCircle(bx - br * 0.3, by - br * 0.35, br * 0.35);
            g.endFill();
        }

        // Centralny blob (najwyzszy)
        g.beginFill(0x5f9450);
        g.drawCircle(0, -r * 0.1, r * 0.45);
        g.endFill();
        g.beginFill(0x9cd276, 0.45);
        g.drawCircle(-r * 0.14, -r * 0.24, r * 0.16);
        g.endFill();
    }

    /** Tania animacja: pulsowanie skali listowia (zero redraw geometrii). */
    public update(): void {
        const s = 1 + Math.sin(Date.now() / 1100 + this.phase) * 0.025;
        this.gfxFoliage.scale.set(s);
    }
}
