import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { JUNKYARD_HEX, JUNKYARD_WRECK_TINTS } from '../JunkyardMap';
import { bakeCanvas, css, propRng, roundRect } from './junkyardBake';

/**
 * WreckStack — a small pile of 2-3 crushed cars (ZLOMOWISKO, DECOR layer, solid).
 *
 * REV 3 (playtest Mariusz: "stosy ciagle za duze — niech beda wielkosciowo podobne do czolgow; 3-4 typy
 * zgniecionych aut; pogieta karoseria, spekane szyby lub bez szyb; auto ma wygladac jak auto, nie placek"):
 *  - footprint 80x56 (a tank is ~56x40) — one measure for everything on the map;
 *  - FOUR car types baked ONCE as neutral-grey textures (`car_<type>_<variant>`), tinted per instance with the
 *    DECOR pastels => a dozen small textures for every wreck on the map;
 *  - each car is a 3/4 body: lower block (doors, wheels, rocker) + raised cabin block (pillars + glass band)
 *    on top of the hood/trunk => it reads as a solid, not a sticker;
 *  - crumple: wavy fenders, roof dents, creases, popped hood with the engine bay, a missing window (black
 *    hole) or a crack web, hanging bumper, rust blooms;
 *  - cars in a pile are shifted / rotated; one soft shadow per pile.
 *
 * Hitbox = the FOOTPRINT only; the pile above it is decoration.
 */
type CarType = 'sedan' | 'van' | 'beetle' | 'pickup';
const TYPES: CarType[] = ['sedan', 'van', 'beetle', 'pickup'];
export const STACK_W = 80;
export const STACK_H = 56;
const CAR_W = 78, CAR_D = 40;   // top face (width along X, depth along Y)
const BODY = 16;                 // lower block visible S face
const CABIN = 10;                // cabin lift above the hood
const PAD = 16;                  // texture margin
const TIER = BODY + 4;           // vertical step per car in the pile

/** Shared car sprite (tinted) for the crane's carried / dropped wrecks. Same textures as the piles. */
export function bakeCarSprite(parent: PIXI.Container, typeIdx: number, variant: number, tint: number): PIXI.Sprite {
    const type = TYPES[typeIdx % TYPES.length];
    const spr = bakeCanvas(parent, `car_${type}_${variant}`, CAR_W, CAR_D + BODY, { l: PAD, t: PAD + CABIN + 6, r: PAD, b: PAD }, c => WreckStack.drawCar(c, type, variant, propRng(7, variant, TYPES.indexOf(type))));
    spr.tint = tint;
    spr.position.set(spr.position.x - CAR_W / 2, spr.position.y - (CAR_D + BODY) / 2);
    return spr;
}

export class WreckStack implements ICollidable {
    public x: number; public y: number; public w: number; public h: number;
    public container: PIXI.Container;

    constructor(x: number, y: number, tiers: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y; this.w = STACK_W; this.h = STACK_H;
        this.container = new PIXI.Container();
        this.container.position.set(x, y);
        this.container.zIndex = y + this.h;
        worldContainer.addChild(this.container);
        this.build(Math.max(2, Math.min(3, tiers)), propRng(x, y, 9));
    }

    /** J6a: set by the event director during the hubcap-avalanche telegraph; update() jitters the pile (visual only). */
    public shaking = false;
    private shakeT = 0;
    update(): void {
        if (!this.shaking) { if (this.container.x !== this.x) { this.container.position.set(this.x, this.y); } return; }
        this.shakeT++;
        this.container.x = this.x + Math.sin(this.shakeT * 1.7) * 3;
        this.container.y = this.y + Math.cos(this.shakeT * 2.3) * 2;
    }

    private build(tiers: number, rng: () => number): void {
        const shH = TIER * tiers + 30;
        bakeCanvas(this.container, `stackshadow_${tiers}`, STACK_W, STACK_H, { l: 20, t: 20, r: 40, b: 40 }, c => {
            c.save(); c.filter = 'blur(7px)'; c.fillStyle = css(JUNKYARD_HEX.shadow, 0.48);
            const sx = 8 + shH * 0.3, sy = 8 + shH * 0.3;
            c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + STACK_W, sy); c.lineTo(sx + STACK_W + 8, sy + STACK_H); c.lineTo(sx + 8, sy + STACK_H); c.closePath(); c.fill();
            c.restore();
        });
        for (let t = 0; t < tiers; t++) {
            const type = TYPES[(rng() * TYPES.length) | 0];
            const tint = JUNKYARD_WRECK_TINTS[(rng() * JUNKYARD_WRECK_TINTS.length) | 0];
            const variant = (rng() * 3) | 0;
            const holder = new PIXI.Container();
            const ox = (t === 0 ? 0 : (rng() - 0.5) * 18), oy = STACK_H - CAR_D - BODY - TIER * t;
            holder.position.set(STACK_W / 2 + ox, oy + (CAR_D + BODY) / 2);
            holder.rotation = t === 0 ? (rng() - 0.5) * 0.06 : (rng() - 0.5) * 0.22;
            this.container.addChild(holder);
            const spr = bakeCanvas(holder, `car_${type}_${variant}`, CAR_W, CAR_D + BODY, { l: PAD, t: PAD + CABIN + 6, r: PAD, b: PAD }, c => WreckStack.drawCar(c, type, variant, propRng(7, variant, TYPES.indexOf(type))));
            spr.tint = tint;
            // bakeCanvas anchors local (0,0) at the holder origin — recentre so rotation pivots on the car
            spr.position.set(spr.position.x - CAR_W / 2, spr.position.y - (CAR_D + BODY) / 2);
        }
    }

    /** Neutral-grey car (tinted later). Local: (0,0)=top-left of the hood plane; S face below [CAR_D, CAR_D+BODY]. */
    static drawCar(c: CanvasRenderingContext2D, type: CarType, variant: number, rng: () => number): void {
        const W = CAR_W, D = CAR_D;
        const L = (k: number) => { const v = Math.min(255, Math.round(216 * k)); return `rgb(${v},${v},${v})`; };
        const glass = '#28323c', glassHi = '#7f9bb0';
        const rad = type === 'beetle' ? 18 : type === 'van' ? 5 : 10;
        // ── lower block S face: doors, seams, handles, rocker, wheels ──
        const sg = c.createLinearGradient(0, D, 0, D + BODY);
        sg.addColorStop(0, L(1.0)); sg.addColorStop(0.55, L(0.72)); sg.addColorStop(1, L(0.5));
        c.fillStyle = sg; roundRect(c, 0, D - 2, W, BODY + 2, 3); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(0, D + BODY - 3, W, 3);
        c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.2;
        const seams = type === 'van' ? [0.3, 0.52, 0.74] : type === 'pickup' ? [0.42, 0.6] : [0.36, 0.6];
        for (const s of seams) { c.beginPath(); c.moveTo(W * s, D); c.lineTo(W * s, D + BODY - 3); c.stroke(); }
        c.fillStyle = '#f4f4f4'; for (const s of seams) c.fillRect(W * s + 3, D + BODY * 0.45, 5, 1.6);
        if (variant === 1) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(W * 0.48, D + BODY * 0.55, 10, 4, 0, 0, Math.PI * 2); c.fill(); }
        for (const wx of [W * 0.22, W * 0.78]) {
            c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(wx + 2, D + BODY + 1, 9, 4.5, 0, 0, Math.PI * 2); c.fill();
            const wg = c.createRadialGradient(wx - 2, D + BODY - 2, 1, wx, D + BODY - 1, 9); wg.addColorStop(0, '#4a4a4a'); wg.addColorStop(0.6, '#1c1c1c'); wg.addColorStop(1, '#0b0b0b');
            c.fillStyle = wg; c.beginPath(); c.ellipse(wx, D + BODY - 1, 9, 5, 0, 0, Math.PI * 2); c.fill();
            if (variant !== 2 || wx < W / 2) {
                c.fillStyle = '#9da3aa'; c.beginPath(); c.ellipse(wx, D + BODY - 1, 4, 2.2, 0, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#e8ecef'; c.beginPath(); c.ellipse(wx - 1, D + BODY - 1.5, 1.6, 0.9, 0, 0, Math.PI * 2); c.fill();
            }
        }
        // ── top plane: hood (E) + trunk/bed (W), crumpled fenders ──
        const tg = c.createLinearGradient(0, 0, W, D);
        tg.addColorStop(0, L(1.12)); tg.addColorStop(0.5, L(0.98)); tg.addColorStop(1, L(0.8));
        c.fillStyle = tg;
        c.beginPath();
        c.moveTo(rad, 0);
        for (let x = rad; x < W - rad; x += 10) c.lineTo(x + 5, (rng() - 0.5) * 2.4);
        c.quadraticCurveTo(W, 0, W, rad); c.lineTo(W, D - rad); c.quadraticCurveTo(W, D, W - rad, D);
        for (let x = W - rad; x > rad; x -= 10) c.lineTo(x - 5, D + (rng() - 0.5) * 2.4);
        c.quadraticCurveTo(0, D, 0, D - rad); c.lineTo(0, rad); c.quadraticCurveTo(0, 0, rad, 0); c.closePath(); c.fill();
        const hx = type === 'van' ? W * 0.78 : W * 0.64, hw = W - hx - 2;
        if (variant === 0 && type !== 'van') {
            // popped hood: dark engine bay + lid standing up
            c.fillStyle = '#1b1d20'; roundRect(c, hx, 4, hw, D - 8, 4); c.fill();
            c.fillStyle = '#3a3f45'; c.fillRect(hx + 6, D * 0.3, hw - 12, D * 0.4); c.fillStyle = '#202326'; for (let k = 0; k < 4; k++) c.fillRect(hx + 8 + k * 6, D * 0.32, 3, D * 0.36);
            const lg = c.createLinearGradient(0, -CABIN - 6, 0, 2); lg.addColorStop(0, L(1.15)); lg.addColorStop(1, L(0.85));
            c.fillStyle = lg; c.beginPath(); c.moveTo(hx + 2, 2); c.lineTo(hx + hw - 2, 2); c.lineTo(hx + hw - 8, -CABIN - 5); c.lineTo(hx + 8, -CABIN - 5); c.closePath(); c.fill();
            c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.stroke();
        } else {
            c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(hx + 2, D / 2); c.lineTo(W - 4, D / 2); c.stroke();
            c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(hx + hw * 0.5, D * 0.5, hw * 0.3, D * 0.22, 0.3, 0, Math.PI * 2); c.fill();
            c.strokeStyle = 'rgba(0,0,0,0.35)'; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(hx + 4 + k * 6, 6 + rng() * 4); c.lineTo(hx + 10 + k * 6, D - 6 - rng() * 4); c.stroke(); }
        }
        if (type === 'pickup') {
            const bg = c.createLinearGradient(0, 4, 0, D - 4); bg.addColorStop(0, L(0.55)); bg.addColorStop(1, L(0.4));
            c.fillStyle = bg; roundRect(c, 4, 4, W * 0.4, D - 8, 3); c.fill();
            c.strokeStyle = 'rgba(0,0,0,0.4)'; for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(4 + W * 0.4 * k / 5, 4); c.lineTo(4 + W * 0.4 * k / 5, D - 4); c.stroke(); }
            c.fillStyle = '#9a4f2a'; c.fillRect(8, D * 0.4, 14, 6); c.fillRect(24, D * 0.55, 10, 5);
        } else if (type !== 'van') {
            c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(W * 0.24, 4); c.lineTo(W * 0.24, D - 4); c.stroke();
            c.fillStyle = 'rgba(0,0,0,0.12)'; roundRect(c, 3, 3, W * 0.2, D - 6, 6); c.fill();
        }
        // ── cabin block (raised): S face = window band with pillars; roof on top ──
        const cx0 = type === 'van' ? 4 : type === 'pickup' ? W * 0.44 : W * 0.26;
        const cw = type === 'van' ? W * 0.72 : type === 'pickup' ? W * 0.18 : W * 0.36;
        const cy0 = -CABIN + 5, ch = D - 10;
        const cs = c.createLinearGradient(0, cy0 + ch, 0, cy0 + ch + CABIN);
        cs.addColorStop(0, glassHi); cs.addColorStop(0.35, glass); cs.addColorStop(1, '#141a20');
        c.fillStyle = cs; c.fillRect(cx0, cy0 + ch, cw, CABIN);
        c.fillStyle = L(0.7); for (const px of type === 'van' ? [0, 0.33, 0.66, 1] : [0, 0.5, 1]) c.fillRect(cx0 + cw * px - 1.5, cy0 + ch, 3, CABIN);
        if (variant === 2) { c.fillStyle = '#050607'; c.fillRect(cx0 + cw * 0.52, cy0 + ch + 1, cw * 0.44, CABIN - 2); }
        const rg = c.createLinearGradient(cx0, cy0, cx0 + cw, cy0 + ch);
        rg.addColorStop(0, L(1.08)); rg.addColorStop(1, L(0.76));
        c.fillStyle = rg; roundRect(c, cx0, cy0, cw, ch, type === 'beetle' ? 12 : 5); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(cx0 + cw * 0.5, cy0 + ch * 0.5, cw * 0.34, ch * 0.28, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(cx0 + 3, cy0 + ch * (0.3 + k * 0.2) + (rng() - 0.5) * 3); c.lineTo(cx0 + cw - 3, cy0 + ch * (0.3 + k * 0.2) + (rng() - 0.5) * 3); c.stroke(); }
        const win = (x: number, w: number, gone: boolean, cracked: boolean) => {
            if (gone) { c.fillStyle = '#050607'; roundRect(c, x, cy0 + 3, w, ch - 6, 2); c.fill(); return; }
            const g = c.createLinearGradient(x, cy0, x + w, cy0 + ch); g.addColorStop(0, glassHi); g.addColorStop(0.45, glass); g.addColorStop(1, '#141a20');
            c.fillStyle = g; roundRect(c, x, cy0 + 3, w, ch - 6, 2); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + 1, cy0 + 5, w * 0.35, ch * 0.3);
            if (cracked) { c.strokeStyle = 'rgba(230,238,245,0.8)'; c.lineWidth = 0.9; const mx = x + w / 2, my = cy0 + ch / 2; for (let i = 0; i < 7; i++) { const a = rng() * Math.PI * 2; c.beginPath(); c.moveTo(mx, my); c.lineTo(mx + Math.cos(a) * (3 + rng() * w * 0.5), my + Math.sin(a) * (3 + rng() * ch * 0.45)); c.stroke(); } }
        };
        win(cx0 + cw, type === 'van' ? 6 : 9, variant === 2, variant === 1);
        if (type !== 'pickup') win(cx0 - (type === 'van' ? 4 : 7), type === 'van' ? 4 : 7, false, variant === 1);
        c.fillStyle = '#e8ecef'; c.fillRect(W - 3, 6, 2.5, D - 12); c.fillRect(0.5, 7, 2.5, D - 14);
        if (variant === 1) { c.save(); c.translate(W - 2, D - 6); c.rotate(0.5); c.fillStyle = '#d2d6da'; c.fillRect(0, 0, 2.5, 14); c.restore(); }
        c.fillStyle = '#f6ecb0'; c.fillRect(W - 8, 4, 4, 5); c.fillRect(W - 8, D - 9, 4, 5);
        c.fillStyle = '#c94a3b'; c.fillRect(3, 4, 4, 4); c.fillRect(3, D - 8, 4, 4);
        for (let i = 0; i < 5; i++) {
            const rx = 6 + rng() * (W - 12), ry = 3 + rng() * (D + BODY - 8), rr = 1.5 + rng() * 3.5;
            const g = c.createRadialGradient(rx, ry, 0, rx, ry, rr); g.addColorStop(0, 'rgba(154,79,42,0.85)'); g.addColorStop(1, 'rgba(154,79,42,0)');
            c.fillStyle = g; c.beginPath(); c.arc(rx, ry, rr, 0, Math.PI * 2); c.fill();
        }
        c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(1, D - rad); c.lineTo(1, rad); c.quadraticCurveTo(1, 1, rad, 1); c.lineTo(W - rad, 1); c.stroke();
    }
}
