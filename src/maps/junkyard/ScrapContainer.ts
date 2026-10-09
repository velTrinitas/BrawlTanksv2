import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { JUNKYARD_HEX } from '../JunkyardMap';
import { bakeCanvas, block, css, darken, grime, lighten, propRng, softShadow, staticRect } from './junkyardBake';

/**
 * ScrapContainer — shipping container with its doors open to the SOUTH (ZLOMOWISKO J1/J2).
 * REV 2: Canvas 2D block with corrugation as alternating gradient ribs, soft shadow, AO, rust streaks.
 * Collision = three walls (N, W, E, 20 px); the inside is a one-entrance stealth pocket (`interior`).
 * The roof is sorted ABOVE a tank inside (zIndex y+h+30, alpha 0.82 so the player still sees himself).
 */
const WALL = 20;
const RISE = 44;

export class ScrapContainer {
    public x: number; public y: number; public w: number; public h: number;
    public container: PIXI.Container;
    public readonly interior: { x: number; y: number; w: number; h: number };
    private walls: ICollidable[];

    constructor(x: number, y: number, w: number, h: number, variant: 'red' | 'blue', worldContainer: PIXI.Container) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.container = new PIXI.Container();
        this.container.position.set(x, y);
        this.container.zIndex = y + h + 30;
        this.container.alpha = 0.82; // dach lekko przeswituje: gracz widzi, ze w nim stoi (Czytelnosc)
        worldContainer.addChild(this.container);
        this.walls = [staticRect(x, y, w, WALL), staticRect(x, y + WALL, WALL, h - WALL), staticRect(x + w - WALL, y + WALL, WALL, h - WALL)];
        this.interior = { x: x + WALL, y: y + WALL, w: w - 2 * WALL, h: h - WALL };
        const rng = propRng(x, y, variant === 'red' ? 11 : 12);
        bakeCanvas(this.container, `cont_${variant}_${x}_${y}`, w, h, { l: 30, t: RISE + 6, r: 46, b: 54 }, c => this.draw(c, variant, rng));
    }

    public getCollisionRects(): ICollidable[] { return this.walls; }

    update(): void { /* static */ }

    private draw(c: CanvasRenderingContext2D, variant: 'red' | 'blue', rng: () => number): void {
        const col = variant === 'red' ? 0xa8584a : 0x5f7a99;
        const W = this.w, H = this.h;
        softShadow(c, 0, 0, W, H, RISE, 0.45);
        // pocket floor (dark, gradient toward the back) — visible through the open S side
        const fg = c.createLinearGradient(0, WALL, 0, H);
        fg.addColorStop(0, '#15120f'); fg.addColorStop(1, '#2e2823');
        c.fillStyle = fg; c.fillRect(WALL, WALL, W - 2 * WALL, H - WALL);
        // the box
        block(c, 0, 0, W, H, RISE, { top: col, radius: 3 });
        // corrugation ribs on the roof: alternating light/dark gradient strips
        for (let r = 8; r < W - 8; r += 14) {
            const rg = c.createLinearGradient(r, 0, r + 14, 0);
            rg.addColorStop(0, css(lighten(col, 0.12), 0.9)); rg.addColorStop(0.5, css(col, 0)); rg.addColorStop(1, css(darken(col, 0.75), 0.9));
            c.fillStyle = rg; c.fillRect(r, -RISE + 4, 14, H - 8);
        }
        // corner castings
        c.fillStyle = css(darken(col, 0.45));
        for (const [cx, cy] of [[0, -RISE], [W - 10, -RISE], [0, H - RISE - 10], [W - 10, H - RISE - 10]]) c.fillRect(cx, cy, 10, 10);
        // open doors on the S face: dark opening + door leaves swung outward, lying on the ground
        const og = c.createLinearGradient(0, H - RISE, 0, H);
        og.addColorStop(0, '#0d0c0b'); og.addColorStop(1, '#24201c');
        c.fillStyle = og; c.fillRect(WALL, H - RISE, W - 2 * WALL, RISE);
        for (const dx of [WALL - 26, W - WALL + 4]) {
            const dg = c.createLinearGradient(dx, H + 2, dx + 22, H + 34);
            dg.addColorStop(0, css(lighten(col, 0.1))); dg.addColorStop(1, css(darken(col, 0.6)));
            c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(dx + 3, H + 5, 22, 32);
            c.fillStyle = dg; c.fillRect(dx, H + 2, 22, 32);
            c.strokeStyle = css(lighten(col, 0.4), 0.6); c.lineWidth = 1; c.strokeRect(dx + 0.5, H + 2.5, 21, 31);
            c.fillStyle = css(JUNKYARD_HEX.chrome, 0.7); c.fillRect(dx + 9, H + 12, 4, 10);
        }
        // door frame posts
        c.fillStyle = css(darken(col, 0.5)); c.fillRect(WALL - 3, H - RISE, 3, RISE); c.fillRect(W - WALL, H - RISE, 3, RISE);
        // stencil block + rust
        c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(W * 0.42, -RISE + H * 0.4, W * 0.16, 12);
        c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(W * 0.44, -RISE + H * 0.4 + 15, W * 0.1, 4);
        grime(c, 4, -RISE + 2, W - 8, H, rng, 6);
    }
}
