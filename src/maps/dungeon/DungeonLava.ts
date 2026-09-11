import * as PIXI from 'pixi.js';
import { ambientRng } from '../../systems/Rng';
import { DUNGEON_HEX as H } from './dungeonPalette';
import { lavaPoolOutline, traceSmooth, type LavaOutline } from './dungeonLavaShape';

/**
 * DungeonLava — ZYWA warstwa lawy nad wpieczonym basenem (SAVE THE QUEEN Q2 polish).
 *
 * Decyzja Mariusza (2. playtest v3): "lawa wybucha, jest zywa, ma purchajace bable,
 * nieregularna forme, czasem pluje lawa, lekko dymi". Statyczny ksztalt + skorupa + rozlewiska
 * sa w bake gruntu (DungeonMap, ten sam seed => dungeonLavaShape). Tu tylko to, co sie rusza:
 *  - bable: rosna, pekaja (pierscien pop), respawn w losowym punkcie basenu (nie na moscie),
 *  - plucie: co ~3-6 s kula lawy leci lukiem (cien na powierzchni + kula nad nia), lot 0.7 s,
 *    ladowanie = rozprysk (pierscien + 4 krople) — ZAWSZE wewnatrz basenu (bez obrazen; Q4 DoT),
 *  - dym: do 5 obloczkow (fiolet-szary, alpha <= 0.3) unoszacych sie i rozplywajacych,
 *  - puls krawedzi: obrys lobow (dungeonLavaShape) miga jasnym pomaranczem 0.18..0.42,
 *  - smugi powierzchni: 3 leniwie plynace jasne elipsy.
 * Mobile: JEDEN PIXI.Graphics per basen, ~25 prymitywow/klatke, zero blendow ADD/screen, zero
 * duzych gradientow alpha; cull do viewportu (poza kamera: visible=false, tylko symulacja).
 * Klasa A (jak SludgePool). x/y = TOP-LEFT strefy (regula ICollidable, jak layout).
 */

interface Bubble { x: number; y: number; r: number; phase: number; speed: number; pop: number }
interface Puff { x: number; y: number; r: number; age: number; life: number; vx: number }
interface Spit { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; h: number; splash: number }

const MAX_SPLASH = 14;
const POP_FRAMES = 12;

export class DungeonLava {
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private readonly container: PIXI.Container;
    private readonly gfx: PIXI.Graphics;
    private readonly outline: LavaOutline;
    private readonly isLava: (x: number, y: number) => boolean;
    private readonly bubbles: Bubble[] = [];
    private readonly puffs: Puff[] = [];
    private spit: Spit | null = null;
    private spitCooldown: number;
    private t = 0;
    private culled = false;

    constructor(rect: { x: number; y: number; w: number; h: number }, seed: number, worldContainer: PIXI.Container,
        isLava: (x: number, y: number) => boolean) {
        this.x = rect.x; this.y = rect.y; this.w = rect.w; this.h = rect.h;
        this.isLava = isLava;
        this.container = new PIXI.Container();
        this.gfx = new PIXI.Graphics();
        this.container.addChild(this.gfx);
        this.container.zIndex = 5; // nad gruntem (-100), pod czolgami
        worldContainer.addChild(this.container);
        this.outline = lavaPoolOutline(rect, seed);
        const count = Math.max(4, Math.min(9, Math.round((rect.w * rect.h) / 26000)));
        for (let i = 0; i < count; i++) this.bubbles.push(this.newBubble(ambientRng.range(0, Math.PI)));
        this.spitCooldown = ambientRng.range(60, 240);
    }

    private randPoint(margin: number): { x: number; y: number } {
        for (let i = 0; i < 8; i++) {
            const px = this.x + margin + ambientRng.next() * (this.w - margin * 2);
            const py = this.y + margin + ambientRng.next() * (this.h - margin * 2);
            if (this.isLava(px, py)) return { x: px, y: py };
        }
        return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
    }

    private newBubble(phase: number): Bubble {
        const p = this.randPoint(18);
        return { x: p.x, y: p.y, r: 6 + ambientRng.next() * 10, phase, speed: 0.025 + ambientRng.next() * 0.03, pop: 0 };
    }

    /** @param delta klatki (fixed-step); cull do widoku kamery (world units). */
    public update(delta: number, camX: number, camY: number, viewW: number, viewH: number): void {
        const M = 90;
        const visible = this.x + this.w + M > camX && this.x - M < camX + viewW && this.y + this.h + M > camY && this.y - M < camY + viewH;
        this.advance(delta);
        if (!visible) { if (!this.culled) { this.culled = true; this.container.visible = false; } return; }
        if (this.culled) { this.culled = false; this.container.visible = true; }
        this.draw();
    }

    /** Symulacja idzie takze poza ekranem (plucie/bable nie "zamarzaja" na krawedzi kadru). */
    private advance(delta: number): void {
        this.t += delta;
        for (let i = 0; i < this.bubbles.length; i++) {
            const b = this.bubbles[i];
            if (b.pop > 0) { b.pop -= delta; if (b.pop <= 0) this.bubbles[i] = this.newBubble(0); continue; }
            b.phase += b.speed * delta;
            if (b.phase >= Math.PI) { b.pop = POP_FRAMES; if (ambientRng.chance(0.35)) this.addPuff(b.x, b.y); }
        }
        for (let i = this.puffs.length - 1; i >= 0; i--) {
            const p = this.puffs[i];
            p.age += delta; p.y -= 0.35 * delta; p.x += p.vx * delta; p.r += 0.16 * delta;
            if (p.age >= p.life) this.puffs.splice(i, 1);
        }
        if (this.spit) {
            const s = this.spit;
            if (s.splash > 0) { s.splash -= delta; if (s.splash <= 0) this.spit = null; }
            else { s.t += delta; if (s.t >= s.dur) { s.splash = MAX_SPLASH; this.addPuff(s.tx, s.ty); this.addPuff(s.tx + 10, s.ty - 6); } }
        } else {
            this.spitCooldown -= delta;
            if (this.spitCooldown <= 0) {
                const a = this.randPoint(30), b = this.randPoint(30);
                this.spit = { sx: a.x, sy: a.y, tx: b.x, ty: b.y, t: 0, dur: 42, h: 46 + ambientRng.next() * 30, splash: 0 };
                this.spitCooldown = ambientRng.range(180, 360); // 3-6 s
            }
        }
    }

    private addPuff(x: number, y: number): void {
        if (this.puffs.length >= 5) return;
        this.puffs.push({ x, y, r: 7 + ambientRng.next() * 5, age: 0, life: 70 + ambientRng.next() * 30, vx: (ambientRng.next() - 0.5) * 0.3 });
    }

    private draw(): void {
        const g = this.gfx;
        g.clear();
        // puls krawedzi (obrys lobow)
        const pulse = 0.3 + Math.sin(this.t * 0.06) * 0.12;
        g.lineStyle(3, H.lavaBright, pulse);
        traceSmooth(g, this.outline.pts);
        g.closePath();
        g.lineStyle(0);
        // smugi powierzchni (3 leniwe elipsy)
        for (let i = 0; i < 3; i++) {
            const ph = this.t * 0.004 + i * 2.1;
            const ex = this.x + this.w * (0.5 + 0.34 * Math.sin(ph)), ey = this.y + this.h * (0.5 + 0.3 * Math.cos(ph * 0.7));
            if (!this.isLava(ex, ey)) continue;
            g.beginFill(H.lavaBright, 0.22); g.drawEllipse(ex, ey, 34 + 8 * Math.sin(ph * 3), 9); g.endFill();
        }
        // bable + pop
        for (const b of this.bubbles) {
            if (b.pop > 0) {
                const k = 1 - b.pop / POP_FRAMES;
                g.lineStyle(2, H.lavaBright, 0.8 * (1 - k)); g.drawCircle(b.x, b.y, b.r * (1 + k * 1.4)); g.lineStyle(0);
                continue;
            }
            const r = b.r * Math.sin(b.phase);
            if (r < 1) continue;
            g.beginFill(H.lavaDark, 0.85); g.drawCircle(b.x, b.y + 1.5, r); g.endFill();
            g.beginFill(H.lava, 1); g.drawCircle(b.x, b.y, r * 0.86); g.endFill();
            g.beginFill(H.lavaBright, 0.9); g.drawCircle(b.x - r * 0.3, b.y - r * 0.3, r * 0.3); g.endFill();
        }
        // plucie: cien na powierzchni + kula w powietrzu (luk), rozprysk po ladowaniu
        if (this.spit) {
            const s = this.spit;
            if (s.splash > 0) {
                const k = 1 - s.splash / MAX_SPLASH;
                g.lineStyle(3, H.lavaBright, 0.9 * (1 - k)); g.drawCircle(s.tx, s.ty, 8 + k * 30); g.lineStyle(0);
                g.beginFill(H.lava, 0.9 * (1 - k));
                for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.6; g.drawCircle(s.tx + Math.cos(a) * (10 + k * 22), s.ty + Math.sin(a) * (10 + k * 22) - k * 10, 3.5 * (1 - k)); }
                g.endFill();
            } else {
                const k = s.t / s.dur;
                const px = s.sx + (s.tx - s.sx) * k, py = s.sy + (s.ty - s.sy) * k;
                const hgt = Math.sin(k * Math.PI) * s.h;
                g.beginFill(0x000000, 0.28); g.drawEllipse(px, py, 9 - hgt * 0.04, 5 - hgt * 0.02); g.endFill();
                g.beginFill(H.lavaDark, 1); g.drawCircle(px, py - hgt, 9); g.endFill();
                g.beginFill(H.lava, 1); g.drawCircle(px, py - hgt, 7); g.endFill();
                g.beginFill(H.lavaBright, 1); g.drawCircle(px - 2, py - hgt - 2, 2.6); g.endFill();
            }
        }
        // dym: fioletowo-szare obloczki, male, gasnace
        for (const p of this.puffs) {
            const a = 0.3 * (1 - p.age / p.life);
            g.beginFill(0x4a3a58, a); g.drawCircle(p.x, p.y, p.r); g.drawCircle(p.x + p.r * 0.6, p.y + p.r * 0.2, p.r * 0.7); g.endFill();
        }
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
