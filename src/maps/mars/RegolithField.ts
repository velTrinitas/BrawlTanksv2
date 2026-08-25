import * as PIXI from 'pixi.js';
import { MARS_HEX } from '../MarsMap';

/**
 * RegolithField — patch of loose dust that bogs tracks down (grammar layer 6).
 *
 * FAZA MARS M4. Slow zone, 0.5x speed, passable — the Quicksand contract, but
 * RECTANGULAR: rect zones are the kit default (K3); the desert ellipse is legacy.
 * No collision, no spawnBlocked (you may drive and fight here, just slowly).
 *
 * Readability: a slow zone must announce itself BEFORE the player is stuck in it,
 * so the patch is lighter than the surrounding ground, has a pulsing warm rim,
 * and its dust visibly swirls. Hitbox == the drawn rectangle (B5).
 */

interface Mote {
    ax: number;      // orbit centre, local
    ay: number;
    r: number;       // orbit radius
    ang: number;
    spin: number;
    size: number;
}

export class RegolithField {
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private container: PIXI.Container;
    private gfxStatic: PIXI.Graphics;
    private gfxRim: PIXI.Graphics;
    private gfxMotes: PIXI.Graphics;
    private motes: Mote[];
    private lastMs = 0;                   // for clock-derived delta (D4)

    constructor(x: number, y: number, w: number, h: number, seed: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;

        // ALL Graphics up front (E1)
        this.container = new PIXI.Container();
        this.gfxStatic = new PIXI.Graphics();
        this.gfxRim = new PIXI.Graphics();
        this.gfxMotes = new PIXI.Graphics();
        this.motes = [];

        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = 5;   // above ground decals, below the tank
        worldContainer.addChild(this.container);
        this.container.addChild(this.gfxStatic);
        this.container.addChild(this.gfxRim);
        this.container.addChild(this.gfxMotes);

        let s = seed >>> 0;
        const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

        this.drawStatic(rng);
        const COUNT = 14;
        for (let i = 0; i < COUNT; i++) {
            this.motes.push({
                ax: 10 + rng() * (w - 20),
                ay: 10 + rng() * (h - 20),
                r: 3 + rng() * 9,
                ang: rng() * Math.PI * 2,
                spin: (rng() < 0.5 ? -1 : 1) * (0.006 + rng() * 0.014),
                size: 1.2 + rng() * 2.2,
            });
        }
    }

    /** Sunken dust bed: light fill + inner darkening + settled grain. */
    private drawStatic(rng: () => number): void {
        const g = this.gfxStatic;
        const W = this.w, H = this.h;

        // soft light bed — reads as "powder", brighter than packed regolith
        g.beginFill(MARS_HEX.duneLight, 0.30);
        g.drawRoundedRect(0, 0, W, H, 16);
        g.endFill();
        g.beginFill(MARS_HEX.craterRim, 0.16);
        g.drawRoundedRect(6, 5, W - 12, H - 12, 13);
        g.endFill();
        // centre depression (you sink in the middle)
        g.beginFill(MARS_HEX.trackDark, 0.13);
        g.drawEllipse(W / 2, H / 2, W * 0.32, H * 0.30);
        g.endFill();

        // settled grain clumps so the patch is not a flat blob
        for (let i = 0; i < 70; i++) {
            const px = 4 + rng() * (W - 8);
            const py = 4 + rng() * (H - 8);
            g.beginFill(rng() < 0.5 ? MARS_HEX.duneLight : MARS_HEX.craterRim, 0.10 + rng() * 0.18);
            g.drawEllipse(px, py, 2 + rng() * 5, 1.4 + rng() * 3);
            g.endFill();
        }
    }

    /** Point test — plain AABB, exactly what is drawn (B5). */
    public isPointInside(px: number, py: number): boolean {
        return px >= this.x && px <= this.x + this.w
            && py >= this.y && py <= this.y + this.h;
    }

    /** Pulsing warning rim + slow dust swirl. Two small redraws per frame. */
    public update(): void {
        const t = Date.now();

        // rim: warm, breathing — "careful, soft ground" without an icon
        const rim = this.gfxRim;
        rim.clear();
        const a = 0.24 + Math.sin(t / 780) * 0.10;
        rim.lineStyle(2.6, MARS_HEX.craterRim, a);
        rim.drawRoundedRect(1.5, 1.5, this.w - 3, this.h - 3, 15);
        rim.lineStyle(1.4, MARS_HEX.duneLight, a * 0.6);
        rim.drawRoundedRect(6, 6, this.w - 12, this.h - 12, 12);
        rim.lineStyle(0);

        // motes: tiny orbiting grains — the patch is never static
        // D4: swirl must be time-scaled, not per-frame (144 Hz ran 2.4x faster).
        const dt = this.lastMs ? Math.min(4, (t - this.lastMs) / 16.667) : 1;
        this.lastMs = t;

        const g = this.gfxMotes;
        g.clear();
        for (const m of this.motes) {
            m.ang += m.spin * dt;
            const mx = m.ax + Math.cos(m.ang) * m.r;
            const my = m.ay + Math.sin(m.ang) * m.r * 0.6;
            g.beginFill(MARS_HEX.duneLight, 0.42);
            g.drawEllipse(mx, my, m.size, m.size * 0.7);
            g.endFill();
        }
    }
}
