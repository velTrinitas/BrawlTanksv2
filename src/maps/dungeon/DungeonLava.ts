import * as PIXI from 'pixi.js';
import { ambientRng } from '../../systems/Rng';
import { DUNGEON_HEX as H } from './dungeonPalette';
import { lavaPoolOutline, traceSmooth, type LavaOutline } from './dungeonLavaShape';

/**
 * DungeonLava — ZYWA warstwa lawy nad wpieczonym basenem (SAVE THE QUEEN).
 *
 * v0.179.0 (brief art directora, decyzja Mariusza): "soczysta" komiksowa strefa na samych prymitywach.
 * Baza (cebula bordo->pomarancz->zolty, najjasniej w srodku) jest w BAKE gruntu (DungeonMap). Tu tylko ruch:
 *  - BABLE: pool max LAVA_BUBBLES_MAX na basen. Start r=3 pomarancz -> rosnie do r=15 -> ostatnie 25% zycia
 *    ZOLTY (skok koloru, bez alpha) -> PEKNIECIE = POP_FRAMES klatek SAMEGO OBRYSU lineStyle(3, 0xffff00)
 *    (pelne kolo -> sam obrys = "chrupniecie" z geometrii) -> powrot do poola, respawn po losowej pauzie.
 *  - ODPRYSKI: przy peknieciu 1-2 mikroczastki r 2-3 px, zolte; parabola czystym offsetem (bez fizyki),
 *    zanik przez SKALE promienia do 0 (zero animowanego alpha). Pool max LAVA_SPLATS_MAX.
 *  - Zostaja z v0.166 (prosba Mariusza): plucie kula lukiem co 3-6 s + rozprysk, dym <=5 obloczkow,
 *    puls krawedzi (obrys lobow = czytelnik granicy strefy).
 * Mobile: JEDEN PIXI.Graphics per basen, <= ~25 prymitywow/klatke, zero blendow ADD/screen, zero filtrow;
 * cull do viewportu (poza kamera: visible=false, tylko symulacja). Lever slabego sprzetu: LAVA_LOW_END
 * (2 bable, bez fazy obrysu, odpryski = prostokaty 1x3 w osi Y).
 * x/y = TOP-LEFT strefy (regula ICollidable, jak layout); wizual >= AABB strefy DoT.
 */

/** Lever mobile (brak progu jakosci w silniku — stala; podpiac pod pomiar A54 gdy bedzie). */
const LAVA_LOW_END = false;
const LAVA_BUBBLES_MAX = LAVA_LOW_END ? 2 : 5;
const LAVA_SPLATS_PER_POP = LAVA_LOW_END ? 1 : 2;
const LAVA_SPLATS_MAX = 8;
const POP_FRAMES = LAVA_LOW_END ? 0 : 6;
const BUBBLE_R0 = 3, BUBBLE_R1 = 15;
const MAX_SPLASH = 14;
const MINI_PLATES = LAVA_LOW_END ? 0 : 3;   // v0.180: dryfujace mini-placki skorupy (zycie placków)
const HEAT_PULSES = LAVA_LOW_END ? 0 : 4;   // v0.180: pulsujace odcinki zaru szczelin

interface Bubble { x: number; y: number; life: number; age: number; pop: number; wait: number; rMax: number }
interface Splat { x: number; y0: number; vx: number; vy: number; g: number; r: number; age: number; life: number }
interface Puff { x: number; y: number; r: number; age: number; life: number; vx: number }
interface MiniPlate { x: number; y: number; rot: number; r: number; poly: number[]; vx: number; vy: number; vr: number }
interface HeatPulse { x1: number; y1: number; x2: number; y2: number; phase: number; speed: number }
interface Spit { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; h: number; splash: number }

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
    private readonly splats: Splat[] = [];
    private readonly puffs: Puff[] = [];
    private readonly plates: MiniPlate[] = [];
    private readonly pulses: HeatPulse[] = [];
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
        // pool babli: male baseny dostaja mniej (proporcjonalnie do pola), duze pelny limit
        const count = Math.max(2, Math.min(LAVA_BUBBLES_MAX, Math.round((rect.w * rect.h) / 40000)));
        for (let i = 0; i < count; i++) this.bubbles.push(this.newBubble(ambientRng.range(0, 60)));
        this.spitCooldown = ambientRng.range(60, 240);
        // v0.180: mini-placki dryfujace wzdluz dluzszej osi basenu + odcinki pulsujacego zaru (pozycje stale)
        for (let i = 0; i < MINI_PLATES; i++) this.plates.push(this.newPlate(true));
        for (let i = 0; i < HEAT_PULSES; i++) {
            const a = this.randPoint(24); const ang = ambientRng.range(0, Math.PI * 2), len = 18 + ambientRng.next() * 22;
            this.pulses.push({ x1: a.x, y1: a.y, x2: a.x + Math.cos(ang) * len, y2: a.y + Math.sin(ang) * len, phase: ambientRng.range(0, Math.PI * 2), speed: 0.03 + ambientRng.next() * 0.03 });
        }
    }

    private newPlate(anywhere: boolean): MiniPlate {
        const horiz = this.w >= this.h;
        const dir = ambientRng.chance(0.5) ? 1 : -1;
        const r = 7 + ambientRng.next() * 5;
        const p = anywhere ? this.randPoint(r + 12) : { x: horiz ? (dir > 0 ? this.x + r + 12 : this.x + this.w - r - 12) : this.x + r + 12 + ambientRng.next() * (this.w - 2 * r - 24), y: horiz ? this.y + r + 12 + ambientRng.next() * (this.h - 2 * r - 24) : (dir > 0 ? this.y + r + 12 : this.y + this.h - r - 12) };
        const n = 7; const poly: number[] = [];
        for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const j = 0.75 + ambientRng.next() * 0.4; poly.push(Math.cos(a) * r * j, Math.sin(a) * r * 0.75 * j); }
        return { x: p.x, y: p.y, rot: ambientRng.range(0, Math.PI), r, poly, vx: horiz ? 0.25 * dir : 0, vy: horiz ? 0 : 0.25 * dir, vr: (ambientRng.next() - 0.5) * 0.004 };
    }

    private randPoint(margin: number): { x: number; y: number } {
        for (let i = 0; i < 8; i++) {
            const px = this.x + margin + ambientRng.next() * (this.w - margin * 2);
            const py = this.y + margin + ambientRng.next() * (this.h - margin * 2);
            if (this.isLava(px, py)) return { x: px, y: py };
        }
        return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
    }

    /** Nowy babel w poolu: czeka `wait` klatek, potem rosnie przez `life` klatek (1.2-1.8 s). */
    private newBubble(wait: number): Bubble {
        const p = this.randPoint(20);
        return { x: p.x, y: p.y, life: 72 + ambientRng.next() * 36, age: 0, pop: 0, wait, rMax: BUBBLE_R1 * (0.75 + ambientRng.next() * 0.25) };
    }

    private popBubble(b: Bubble): void {
        // odpryski: 1-2 mikroczastki, parabola offsetem, zanik przez skale
        for (let i = 0; i < LAVA_SPLATS_PER_POP && this.splats.length < LAVA_SPLATS_MAX; i++) {
            this.splats.push({ x: b.x, y0: b.y, vx: (ambientRng.next() - 0.5) * 1.6, vy: 2.2 + ambientRng.next() * 1.4, g: 0.12, r: 2 + ambientRng.next(), age: 0, life: 34 + ambientRng.next() * 8 });
        }
        if (ambientRng.chance(0.3)) this.addPuff(b.x, b.y);
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

    /** Symulacja idzie takze poza ekranem (rytm nie "zamarza" na krawedzi kadru). */
    private advance(delta: number): void {
        this.t += delta;
        // bable: wait -> wzrost -> pop (obrys) -> respawn z losowa pauza (rytm, nie takt)
        for (let i = 0; i < this.bubbles.length; i++) {
            const b = this.bubbles[i];
            if (b.wait > 0) { b.wait -= delta; continue; }
            if (b.pop > 0) { b.pop -= delta; if (b.pop <= 0) this.bubbles[i] = this.newBubble(12 + ambientRng.next() * 36); continue; }
            b.age += delta;
            if (b.age >= b.life) {
                this.popBubble(b);
                if (POP_FRAMES > 0) b.pop = POP_FRAMES; else this.bubbles[i] = this.newBubble(12 + ambientRng.next() * 36);
            }
        }
        // odpryski
        for (let i = this.splats.length - 1; i >= 0; i--) {
            const s = this.splats[i];
            s.age += delta; s.x += s.vx * delta;
            if (s.age >= s.life) this.splats.splice(i, 1);
        }
        // dym
        for (let i = this.puffs.length - 1; i >= 0; i--) {
            const p = this.puffs[i];
            p.age += delta; p.y -= 0.35 * delta; p.x += p.vx * delta; p.r += 0.16 * delta;
            if (p.age >= p.life) this.puffs.splice(i, 1);
        }
        // mini-placki: dryf + obrot; poza basenem/na moscie => respawn po przeciwnej stronie
        for (let i = 0; i < this.plates.length; i++) {
            const m = this.plates[i];
            m.x += m.vx * delta; m.y += m.vy * delta; m.rot += m.vr * delta;
            const inside = m.x > this.x + m.r + 10 && m.x < this.x + this.w - m.r - 10 && m.y > this.y + m.r + 10 && m.y < this.y + this.h - m.r - 10 && this.isLava(m.x, m.y);
            if (!inside) { const np = this.newPlate(false); np.vx = m.vx; np.vy = m.vy; this.plates[i] = np; }
        }
        // plucie lukiem (v0.166)
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
        // puls krawedzi (obrys lobow = granica strefy)
        const pulse = 0.3 + Math.sin(this.t * 0.06) * 0.12;
        g.lineStyle(3, H.lavaBright, pulse);
        traceSmooth(g, this.outline.pts);
        g.closePath();
        g.lineStyle(0);
        // puls zaru szczelin: odcinki oddychaja jasnoscia (alpha 0.5..1) i grubosci
        for (const hp of this.pulses) {
            const k = 0.5 + 0.5 * Math.sin(this.t * hp.speed + hp.phase);
            g.lineStyle(2 + 2 * k, H.lavaCoreHot, 0.5 + 0.5 * k); g.moveTo(hp.x1, hp.y1); g.lineTo(hp.x2, hp.y2);
            g.lineStyle(1 + k, H.lavaWhite, 0.4 + 0.6 * k); g.moveTo(hp.x1, hp.y1); g.lineTo(hp.x2, hp.y2);
        }
        g.lineStyle(0);
        // mini-placki: cien offsetowy + korpus + rim NW + szczelina zaru
        for (const m of this.plates) {
            const pts = (dx: number, dy: number): number[] => { const out: number[] = []; const cs = Math.cos(m.rot), sn = Math.sin(m.rot); for (let k = 0; k < m.poly.length; k += 2) { const px = m.poly[k], py = m.poly[k + 1]; out.push(m.x + dx + px * cs - py * sn, m.y + dy + px * sn + py * cs); } return out; };
            g.lineStyle(3, H.lavaCoreHot, 0.85); g.drawPolygon(pts(0, 0)); g.lineStyle(0);
            g.beginFill(H.lavaCrustDark, 0.5); g.drawPolygon(pts(3, 4)); g.endFill();
            g.beginFill(H.lavaCrust, 1); g.lineStyle(1.5, H.lavaCrustDark, 1); g.drawPolygon(pts(0, 0)); g.endFill(); g.lineStyle(0);
            g.beginFill(H.lavaCrustLight, 0.55); g.drawPolygon(pts(-1.5, -1.5).map((v, i) => i % 2 === 0 ? (v - m.x) * 0.55 + m.x : (v - m.y) * 0.55 + m.y)); g.endFill();
        }
        // BABLE: pelne kolo (pomarancz -> zolty) albo sam obrys (pekniecie)
        for (const b of this.bubbles) {
            if (b.wait > 0) continue;
            if (b.pop > 0) {
                g.lineStyle(3, 0xffff00, 1); g.drawCircle(b.x, b.y, b.rMax + (POP_FRAMES - b.pop) * 0.8); g.lineStyle(0);
                continue;
            }
            const k = b.age / b.life;
            const r = BUBBLE_R0 + (b.rMax - BUBBLE_R0) * k;
            const hot = k >= 0.75;
            g.beginFill(hot ? H.lavaWhite : H.lavaCoreMid, 1); g.drawCircle(b.x, b.y, r); g.endFill();
            g.beginFill(hot ? 0xffffff : H.lavaCoreHot, 1); g.drawCircle(b.x - r * 0.35, b.y - r * 0.35, Math.max(1, r * 0.28)); g.endFill();
        }
        // ODPRYSKI: parabola, zanik przez skale (zero alpha)
        g.beginFill(H.lavaWhite, 1);
        for (const s of this.splats) {
            const t = s.age;
            const hgt = s.vy * t - 0.5 * s.g * t * t;
            const r = s.r * (1 - s.age / s.life);
            if (r <= 0.2) continue;
            if (LAVA_LOW_END) g.drawRect(s.x - 0.5, s.y0 - hgt - 1.5, 1, 3);
            else g.drawCircle(s.x, s.y0 - hgt, r);
        }
        g.endFill();
        // plucie: cien na powierzchni + kula w powietrzu (luk), rozprysk po ladowaniu
        if (this.spit) {
            const s = this.spit;
            if (s.splash > 0) {
                const k = 1 - s.splash / MAX_SPLASH;
                g.lineStyle(3, H.lavaCoreHot, 1); g.drawCircle(s.tx, s.ty, 8 + k * 30); g.lineStyle(0);
                g.beginFill(H.lavaCoreMid, 1);
                for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.6; const rr = 3.5 * (1 - k); if (rr > 0.3) g.drawCircle(s.tx + Math.cos(a) * (10 + k * 22), s.ty + Math.sin(a) * (10 + k * 22) - k * 10, rr); }
                g.endFill();
            } else {
                const k = s.t / s.dur;
                const px = s.sx + (s.tx - s.sx) * k, py = s.sy + (s.ty - s.sy) * k;
                const hgt = Math.sin(k * Math.PI) * s.h;
                g.beginFill(0x000000, 0.28); g.drawEllipse(px, py, 9 - hgt * 0.04, 5 - hgt * 0.02); g.endFill();
                g.beginFill(H.lavaDark, 1); g.drawCircle(px, py - hgt, 9); g.endFill();
                g.beginFill(H.lavaCoreMid, 1); g.drawCircle(px, py - hgt, 7); g.endFill();
                g.beginFill(H.lavaCoreHot, 1); g.drawCircle(px - 2, py - hgt - 2, 2.6); g.endFill();
            }
        }
        // dym: fioletowo-szare obloczki, male, gasnace (jedyne alpha w warstwie — <=5 kolek)
        for (const p of this.puffs) {
            const a = 0.3 * (1 - p.age / p.life);
            g.beginFill(0x4a3a58, a); g.drawCircle(p.x, p.y, p.r); g.drawCircle(p.x + p.r * 0.6, p.y + p.r * 0.2, p.r * 0.7); g.endFill();
        }
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
