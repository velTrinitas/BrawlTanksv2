import * as PIXI from 'pixi.js';

/**
 * BossBomb — bomba super-bossa CTF (FAZA CTF F2).
 *
 * Port legacy class BossBomb (ctf.html 4076-4152), wartosci 1:1:
 *  - lot: prog += 0.014/klatke (~71 klatek), lerp sx,sy -> tx,ty, luk sin(prog*PI)*55,
 *  - TELEGRAPH przez CALY lot (fairness MUST): przerywana linia boss->cel +
 *    pulsujacy ring R=250 na celu + wypelnienie low-alpha,
 *  - eksplozja: dmg wg dystansu od epicentrum (R<83: 300, R<165: 200, R<250: 100
 *    — legacy 3/2/1 w skali x100), shake 28, krater (fade 600 klatek),
 *  - damage aplikuje CtfSystem (bomba zwraca event), zeby uszanowac aura-invuln
 *    i markDamageTaken.
 *
 * Koszt mobile: gfx redraw ograniczony do 1-3 aktywnych bomb, ring to lineStyle
 * (zero full-screen overdraw); krater = statyczny gfx z fade (alpha per klatke).
 */

export const BOSS_BOMB_BLAST_R = 250;

export interface BombExplosion {
    x: number;
    y: number;
}

export class BossBomb {
    public active: boolean = true;

    private sx: number;
    private sy: number;
    private tx: number;
    private ty: number;
    private prog: number = 0;
    private readonly flightSpeed: number; // v0.73.7: prog/klatke, skalowane trudnoscia (cap 0.012)
    private exploded: boolean = false;
    private craterTimer: number = 0;
    private static readonly CRATER_FRAMES = 600;

    private container: PIXI.Container;
    private craterContainer: PIXI.Container;
    private gfxTelegraph: PIXI.Graphics;
    private gfxBomb: PIXI.Graphics;
    private gfxCrater: PIXI.Graphics;

    constructor(
        sx: number,
        sy: number,
        tx: number,
        ty: number,
        worldContainer: PIXI.Container,
        flightSpeed: number, // v0.73.7: predkosc lotu z difficulty (0.008..0.012)
    ) {
        this.sx = sx;
        this.sy = sy;
        this.tx = tx;
        this.ty = ty;
        this.flightSpeed = flightSpeed;

        // PIXI.Graphics init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.zIndex = 400; // telegraph + bomba NAD wszystkim (czytelnosc zagrozenia)
        worldContainer.addChild(this.container);

        // Krater = decal GRUNTU — osobny kontener pod czolgami (zIndex 8),
        // inaczej wypalone kolo wisialoby nad wrogami/graczem.
        this.craterContainer = new PIXI.Container();
        this.craterContainer.zIndex = 8;
        worldContainer.addChild(this.craterContainer);

        this.gfxCrater = new PIXI.Graphics();
        this.craterContainer.addChild(this.gfxCrater);
        this.gfxTelegraph = new PIXI.Graphics();
        this.gfxBomb = new PIXI.Graphics();
        this.container.addChild(this.gfxTelegraph);
        this.container.addChild(this.gfxBomb);
    }

    /**
     * Zwraca eksplozje DOKLADNIE RAZ (w klatce dotarcia do celu) — CtfSystem
     * aplikuje wtedy damage/shake/floating text. Pozniej bomba zyje jeszcze
     * jako fade-out kratera, potem active=false (caller sprzata).
     */
    public update(delta: number): BombExplosion | null {
        if (this.exploded) {
            this.craterTimer -= delta;
            const alpha = Math.max(0, this.craterTimer / BossBomb.CRATER_FRAMES);
            this.gfxCrater.alpha = alpha;
            if (this.craterTimer <= 0) {
                this.active = false;
            }
            return null;
        }

        // v0.73.7: predkosc lotu z difficulty (0.008 Easy .. 0.012 Nightmare, cap 0.012).
        // Wolniej niz legacy 0.014 (~1.19s) — wiecej czasu na unik = fairness (telegraph caly lot).
        this.prog = Math.min(1, this.prog + this.flightSpeed * delta);

        if (this.prog >= 1) {
            this.exploded = true;
            this.craterTimer = BossBomb.CRATER_FRAMES;
            this.gfxTelegraph.clear();
            this.gfxBomb.clear();
            this.drawCrater();
            return { x: this.tx, y: this.ty };
        }

        this.drawTelegraph();
        this.drawBomb();
        return null;
    }

    private drawTelegraph(): void {
        const g = this.gfxTelegraph;
        const time = Date.now();
        g.clear();

        // Przerywana linia trajektorii boss -> cel (dash symulowany segmentami)
        const lineAlpha = 0.35 + Math.sin(time / 110) * 0.1;
        g.lineStyle(1.5, 0xff6600, lineAlpha);
        const dx = this.tx - this.sx;
        const dy = this.ty - this.sy;
        // F3 perf: cap liczby kresek (dlugi lot boss->gracz mogl dac 80+ segmentow
        // x3 bomby = okresowy skok CPU). 24 kreski wystarcza wizualnie, staly koszt.
        const segs = Math.min(24, Math.max(2, Math.floor(Math.hypot(dx, dy) / 24)));
        for (let i = 0; i < segs; i += 2) {
            const t0 = i / segs;
            const t1 = Math.min(1, (i + 1) / segs);
            g.moveTo(this.sx + dx * t0, this.sy + dy * t0);
            g.lineTo(this.sx + dx * t1, this.sy + dy * t1);
        }
        g.lineStyle(0);

        // Ring ostrzegawczy na celu (pulsujacy) + wypelnienie low-alpha
        const ringAlpha = 0.32 + Math.sin(time / 46) * 0.12;
        g.lineStyle(3, 0xff5500, ringAlpha);
        g.drawCircle(this.tx, this.ty, BOSS_BOMB_BLAST_R);
        g.lineStyle(0);
        g.beginFill(0xff5000, 0.10);
        g.drawCircle(this.tx, this.ty, BOSS_BOMB_BLAST_R);
        g.endFill();
        // Krzyzyk epicentrum (dokladny punkt uderzenia)
        g.lineStyle(2, 0xff5500, ringAlpha + 0.2);
        g.moveTo(this.tx - 10, this.ty);
        g.lineTo(this.tx + 10, this.ty);
        g.moveTo(this.tx, this.ty - 10);
        g.lineTo(this.tx, this.ty + 10);
        g.lineStyle(0);
    }

    private drawBomb(): void {
        const g = this.gfxBomb;
        const time = Date.now();
        g.clear();

        const bx = this.sx + (this.tx - this.sx) * this.prog;
        const by = this.sy + (this.ty - this.sy) * this.prog;
        const arc = Math.sin(this.prog * Math.PI) * 55;

        // Cien bomby na ziemi (roznie ale pod lukiem)
        g.beginFill(0x000000, 0.25);
        g.drawEllipse(bx, by, 8, 4);
        g.endFill();

        // Speed trail (3 echa)
        for (let i = 1; i <= 3; i++) {
            const tp = Math.max(0, this.prog - i * 0.06);
            const ex = this.sx + (this.tx - this.sx) * tp;
            const ey = this.sy + (this.ty - this.sy) * tp;
            const earc = Math.sin(tp * Math.PI) * 55;
            g.beginFill(0xff8800, 0.25);
            g.drawCircle(ex, ey - earc, 8 - i * 2);
            g.endFill();
        }

        // Korpus bomby
        g.beginFill(0x1a1a1a);
        g.lineStyle(2.5, 0xff5500, 1);
        g.drawCircle(bx, by - arc, 10);
        g.endFill();
        g.lineStyle(0);
        // Iskra lontu
        g.beginFill(0xffc800, 0.8 + Math.sin(time / 32) * 0.2);
        g.drawCircle(bx + 8, by - arc - 8, 4);
        g.endFill();
    }

    /** Krater po eksplozji (legacy: fade 600 klatek). */
    private drawCrater(): void {
        const g = this.gfxCrater;
        g.clear();
        g.beginFill(0x140a00, 0.75);
        g.drawEllipse(this.tx, this.ty, 17, 11);
        g.endFill();
        g.beginFill(0x50280a, 0.5);
        g.drawEllipse(this.tx + 1, this.ty + 1, 13, 8);
        g.endFill();
        g.lineStyle(3, 0x3c1e00, 0.5);
        g.drawCircle(this.tx, this.ty, 18);
        g.lineStyle(0);
    }

    public destroy(): void {
        if (this.container.parent) this.container.parent.removeChild(this.container);
        this.container.destroy({ children: true });
        if (this.craterContainer.parent) this.craterContainer.parent.removeChild(this.craterContainer);
        this.craterContainer.destroy({ children: true });
    }
}
