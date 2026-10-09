import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { JUNKYARD_HEX, JUNKYARD_LIGHT } from '../JunkyardMap';
import { bakeCanvas, css, propRng } from './junkyardBake';

/**
 * TireWall — one segment of a tire maze (ZLOMOWISKO, DECOR layer, solid).
 *
 * REV 2: tires are Canvas 2D with radial gradients (rubber falls off into shadow at the rim, hub hole
 * is a dark well with a lit edge), stacked two high with a shaded side band; every segment is N sprites
 * of ONE shared texture per variant + a single soft shadow sprite. Hitbox = the layout segment (50 px).
 */
const D = 46;
const RISE = 16;
const PAD = 10;

export class TireWall implements ICollidable {
    public x: number; public y: number; public w: number; public h: number;
    public container: PIXI.Container;

    constructor(x: number, y: number, w: number, h: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.container = new PIXI.Container();
        this.container.position.set(x, y);
        this.container.zIndex = y + h;
        worldContainer.addChild(this.container);
        this.build(propRng(x, y, 3));
    }

    update(): void { /* static */ }

    private build(rng: () => number): void {
        // soft shadow for the whole segment (one small canvas, blurred)
        const sx = JUNKYARD_LIGHT.shX + RISE * 0.45, sy = JUNKYARD_LIGHT.shY + RISE * 0.45;
        const shW = this.w + 40, shH = this.h + 40;
        bakeCanvas(this.container, `tireshadow_${this.w}_${this.h}`, this.w, this.h, { l: 20, t: 20, r: 20, b: 20 }, c => {
            c.save(); c.filter = 'blur(6px)';
            c.fillStyle = css(JUNKYARD_HEX.shadow, 0.42);
            c.fillRect(sx, sy, this.w, this.h);
            c.restore();
            void shW; void shH;
        });
        const horizontal = this.w >= this.h;
        const len = horizontal ? this.w : this.h;
        const n = Math.max(1, Math.round(len / D));
        for (let i = 0; i < n; i++) {
            const cx = horizontal ? (i + 0.5) * (len / n) : this.w / 2;
            const cy = horizontal ? this.h / 2 : (i + 0.5) * (len / n);
            const variant = rng() < 0.35 ? 1 : 0;
            const holder = new PIXI.Container();
            holder.position.set(cx - D / 2 - PAD, cy - D / 2 * 0.72 - RISE - PAD);
            this.container.addChild(holder);
            bakeCanvas(holder, `tire_${variant}`, D + 2 * PAD, D * 0.72 + RISE + 2 * PAD, { l: 0, t: 0, r: 0, b: 0 }, c => TireWall.drawTire(c, variant));
        }
    }

    private static drawTire(c: CanvasRenderingContext2D, variant: number): void {
        const cx = PAD + D / 2, cyTop = PAD + D / 2 * 0.72, cyBot = cyTop + RISE;
        const ry = D / 2 * 0.72;
        // lower tire: only its front band shows under the top one
        const bandG = c.createLinearGradient(0, cyTop, 0, cyBot + ry);
        bandG.addColorStop(0, '#333'); bandG.addColorStop(0.6, '#1e1e1e'); bandG.addColorStop(1, '#101010');
        c.fillStyle = bandG;
        c.beginPath(); c.ellipse(cx, cyBot, D / 2, ry, 0, 0, Math.PI * 2); c.fill();
        c.fillRect(cx - D / 2, cyTop, D, RISE);
        // tread grooves on the band
        c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1.5;
        for (let k = -D / 2 + 4; k < D / 2; k += 7) { c.beginPath(); c.moveTo(cx + k, cyTop + 2); c.lineTo(cx + k + 2, cyBot + 2); c.stroke(); }
        // top tire face: radial gradient (lit NW)
        const tg = c.createRadialGradient(cx - 6, cyTop - 5, 2, cx, cyTop, D / 2);
        tg.addColorStop(0, '#5a5a5a'); tg.addColorStop(0.45, css(JUNKYARD_HEX.tire)); tg.addColorStop(1, '#141414');
        c.fillStyle = tg;
        c.beginPath(); c.ellipse(cx, cyTop, D / 2, ry, 0, 0, Math.PI * 2); c.fill();
        // tread edge ring + sidewall ring
        c.strokeStyle = 'rgba(120,120,120,0.9)'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(cx, cyTop, D / 2 - 3, (D / 2 - 3) * 0.72, 0, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(cx, cyTop, D / 2 - 8, (D / 2 - 8) * 0.72, 0, 0, Math.PI * 2); c.stroke();
        // hub hole: dark well with a lit far edge
        const hg = c.createRadialGradient(cx, cyTop + 2, 1, cx, cyTop, D * 0.22);
        hg.addColorStop(0, '#000'); hg.addColorStop(0.8, '#0a0a0a'); hg.addColorStop(1, '#3a3a3a');
        c.fillStyle = hg; c.beginPath(); c.ellipse(cx, cyTop, D * 0.21, D * 0.21 * 0.72, 0, 0, Math.PI * 2); c.fill();
        if (variant === 1) { c.strokeStyle = 'rgba(225,225,225,0.8)'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx, cyTop, D / 2 - 6, (D / 2 - 6) * 0.72, 0, Math.PI * 1.12, Math.PI * 1.88); c.stroke(); }
        // specular on the NW rim
        c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx, cyTop, D / 2 - 1.5, (D / 2 - 1.5) * 0.72, 0, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
    }
}
