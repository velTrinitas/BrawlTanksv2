import * as PIXI from 'pixi.js';
import { bakeStone } from '../../maps/castle/castleBake';

/**
 * CatapultStone — glaz katapulty/trebucheta (OBRON ZAMEK F4). Klon mechaniki BossBomb
 * (CTF): lot po luku sx,sy -> tx,ty z TELEGRAFEM przez caly lot (przerywana linia +
 * pulsujacy ZOLTY pierscien ladowania = zarezerwowany kolor "strefa niebezpieczna"),
 * eksplozja zwracana DOKLADNIE RAZ (CastleSystem aplikuje obrazenia struktur w splashR
 * i gracza), potem krater (fade) i active=false.
 *
 * Roznice vs BossBomb: glaz = pieczony sprite (nie Graphics), promien splash mniejszy
 * (90), krater szary (gruz), brak ognia. Koszt: 1 Graphics telegrafu + 1 sprite na glaz,
 * cap <=3 (katapulty) + salwa trebucheta <=5 — sterowane w CastleSystem.
 */

export interface StoneImpact { x: number; y: number }

export class CatapultStone {
    public active = true;

    private readonly sx: number;
    private readonly sy: number;
    private readonly tx: number;
    private readonly ty: number;
    private readonly splashR: number;
    private readonly flightSpeed: number;
    private prog = 0;
    private exploded = false;
    private craterTimer = 0;
    private static readonly CRATER_FRAMES = 420;

    private container: PIXI.Container;
    private craterContainer: PIXI.Container;
    private gfxTelegraph: PIXI.Graphics;
    private gfxCrater: PIXI.Graphics;
    private shadow: PIXI.Graphics;
    private stone: PIXI.Sprite;

    constructor(sx: number, sy: number, tx: number, ty: number, splashR: number, flightFrames: number,
        worldContainer: PIXI.Container, delayFrames = 0) {
        this.sx = sx; this.sy = sy; this.tx = tx; this.ty = ty;
        this.splashR = splashR;
        this.flightSpeed = 1 / Math.max(20, flightFrames);
        this.prog = -delayFrames * this.flightSpeed; // salwa: kolejne glazy startuja z opoznieniem

        this.container = new PIXI.Container();
        this.container.zIndex = 400;
        worldContainer.addChild(this.container);
        this.craterContainer = new PIXI.Container();
        this.craterContainer.zIndex = 8;
        worldContainer.addChild(this.craterContainer);

        this.gfxCrater = new PIXI.Graphics();
        this.craterContainer.addChild(this.gfxCrater);
        this.gfxTelegraph = new PIXI.Graphics();
        this.shadow = new PIXI.Graphics();
        this.stone = new PIXI.Sprite(bakeStone());
        this.stone.anchor.set(0.5);
        this.container.addChild(this.gfxTelegraph);
        this.container.addChild(this.shadow);
        this.container.addChild(this.stone);
        this.stone.visible = false;
    }

    public update(delta: number): StoneImpact | null {
        if (this.exploded) {
            this.craterTimer -= delta;
            this.gfxCrater.alpha = Math.max(0, this.craterTimer / CatapultStone.CRATER_FRAMES);
            if (this.craterTimer <= 0) this.active = false;
            return null;
        }
        this.prog = Math.min(1, this.prog + this.flightSpeed * delta);
        if (this.prog >= 1) {
            this.exploded = true;
            this.craterTimer = CatapultStone.CRATER_FRAMES;
            this.gfxTelegraph.clear();
            this.shadow.clear();
            this.stone.visible = false;
            this.drawCrater();
            return { x: this.tx, y: this.ty };
        }
        this.drawTelegraph();
        if (this.prog >= 0) this.drawStone();
        return null;
    }

    /**
     * v0.194.0 (Mariusz: "wiadomo skad i gdzie spadnie") — telegraf wzmocniony, nie zdublowany:
     * - pierscien ma promien DOKLADNIE splashR (hitbox = wizual, jak bylo),
     * - WYPELNIENIE rosnie od srodka do krawedzi razem z lotem = odliczanie do uderzenia,
     * - ostatnie 35% lotu kolor ucieka z zoltego w CZERWONY i puls przyspiesza = "teraz!".
     * Puls liczony z postepu lotu, nie z Date.now() — zamiera z pauza i hit-stopem.
     */
    private drawTelegraph(): void {
        const g = this.gfxTelegraph;
        const p = Math.max(0, this.prog);
        g.clear();
        const late = p > 0.65;
        const col = late ? 0xff3b30 : 0xf1c40f;
        const pulse = Math.sin(p * (late ? 60 : 24));
        const dx = this.tx - this.sx, dy = this.ty - this.sy;
        const segs = Math.min(24, Math.max(2, Math.floor(Math.hypot(dx, dy) / 24)));
        g.lineStyle(2, 0xf1c40f, 0.35 + pulse * 0.1);
        for (let i = 0; i < segs; i += 2) {
            const t0 = i / segs, t1 = Math.min(1, (i + 1) / segs);
            g.moveTo(this.sx + dx * t0, this.sy + dy * t0);
            g.lineTo(this.sx + dx * t1, this.sy + dy * t1);
        }
        g.lineStyle(0);
        g.beginFill(col, 0.10);
        g.drawCircle(this.tx, this.ty, this.splashR);
        g.endFill();
        g.beginFill(col, late ? 0.30 : 0.20);
        g.drawCircle(this.tx, this.ty, Math.max(4, this.splashR * p));
        g.endFill();
        g.lineStyle(late ? 4 : 3, col, 0.6 + pulse * 0.25);
        g.drawCircle(this.tx, this.ty, this.splashR);
        g.lineStyle(2.5, col, 0.85);
        g.moveTo(this.tx - 12, this.ty); g.lineTo(this.tx + 12, this.ty);
        g.moveTo(this.tx, this.ty - 12); g.lineTo(this.tx, this.ty + 12);
        g.lineStyle(0);
    }

    private drawStone(): void {
        const p = this.prog;
        const bx = this.sx + (this.tx - this.sx) * p;
        const by = this.sy + (this.ty - this.sy) * p;
        const alt = Math.sin(p * Math.PI);          // 0 na ziemi, 1 w szczycie
        const arc = alt * 130;                      // v0.194.0: 110 -> 130, luk ma byc widac
        // v0.194.0 — cien jest OSOBNO na ziemi, pod torem: nisko duzy i ciemny, w gorze maly
        // i blady (do v0.193.0 staly 10x5 px — ginal pod glazem i nie mowil nic o wysokosci).
        this.shadow.clear();
        this.shadow.beginFill(0x000000, 0.5 - alt * 0.28);
        this.shadow.drawEllipse(bx, by, 17 - alt * 7, 8 - alt * 3);
        this.shadow.endFill();
        this.stone.visible = true;
        this.stone.x = bx; this.stone.y = by - arc;
        this.stone.rotation = p * 9;
        this.stone.scale.set(0.95 + alt * 0.6); // wyzej = wiekszy (blizej kamery)
    }

    private drawCrater(): void {
        const g = this.gfxCrater;
        g.clear();
        g.beginFill(0x2e3238, 0.6);
        g.drawEllipse(this.tx, this.ty, 18, 12);
        g.endFill();
        g.beginFill(0x5f656a, 0.7);
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            g.drawCircle(this.tx + Math.cos(a) * 16, this.ty + Math.sin(a) * 11, 3 + (i % 2));
        }
        g.endFill();
    }

    public destroy(): void {
        if (this.container.parent) this.container.parent.removeChild(this.container);
        this.container.destroy({ children: true });
        if (this.craterContainer.parent) this.craterContainer.parent.removeChild(this.craterContainer);
        this.craterContainer.destroy({ children: true });
    }
}
