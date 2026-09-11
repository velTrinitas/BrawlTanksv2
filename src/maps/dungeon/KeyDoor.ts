import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { DUNGEON_PALETTE as P } from './dungeonPalette';

/**
 * KeyDoor — STALOWE DRZWI celi (SAVE THE QUEEN Q4.6, decyzja Mariusza): za rozbitymi
 * Zwornikami stoi zamknieta stalowa krata z ZLOTYM zamkiem. Otwiera ja tylko Zloty Klucz.
 * Kolizja = cienki AABB w licu klatki (x/y TOP-LEFT, jak DUNGEON_CAGE); wizual szerszy
 * (24 px, nity, zamek). open(): krata unosi sie (skala Y -> 0 w 400 ms), kolizja znika.
 * Czytelnosc: zamek pulsuje zlotem (ten sam kolor co klucz = "tu pasuje klucz").
 */

const GOLD = 0xffd54a;

export class KeyDoor implements ICollidable {
    public x: number; public y: number; public w: number; public h: number;
    public isOpen = false;
    private readonly origX: number; private readonly origY: number; private readonly origH: number;
    private readonly container: PIXI.Container;
    private readonly gfx: PIXI.Graphics;
    private readonly lock: PIXI.Graphics;
    private t = 0;
    private openK = 0; // 0 zamknieta .. 1 otwarta

    constructor(x: number, y: number, w: number, h: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.origX = x; this.origY = y; this.origH = h;
        this.container = new PIXI.Container();
        this.gfx = new PIXI.Graphics();
        this.lock = new PIXI.Graphics();
        this.container.addChild(this.gfx, this.lock);
        this.container.x = x + w / 2; this.container.y = y + h; // pivot: dol drzwi (krata unosi sie w gore)
        this.container.zIndex = y + h + 3;
        worldContainer.addChild(this.container);
        this.drawDoor();
    }

    private drawDoor(): void {
        const g = this.gfx; g.clear();
        const W = 24, H = this.origH;
        // rama stalowa
        g.beginFill(0x1f2226); g.drawRoundedRect(-W / 2 - 2, -H - 2, W + 4, H + 4, 3); g.endFill();
        g.beginFill(P.iron ? 0x3b3f46 : 0x3b3f46); g.drawRect(-W / 2, -H, W, H); g.endFill();
        // pionowe prety + poprzeczki
        g.beginFill(0x5a6068);
        for (let i = 0; i < 3; i++) g.drawRect(-W / 2 + 3 + i * 8, -H + 4, 3, H - 8);
        g.drawRect(-W / 2, -H + 14, W, 5); g.drawRect(-W / 2, -H / 2 - 2, W, 5); g.drawRect(-W / 2, -20, W, 5);
        g.endFill();
        // nity
        g.beginFill(0x8a9098);
        for (const yy of [-H + 16, -H / 2, -18]) { g.drawCircle(-W / 2 + 3, yy, 1.6); g.drawCircle(W / 2 - 3, yy, 1.6); }
        g.endFill();
        // blik lewej krawedzi (swiatlo NW)
        g.beginFill(0xffffff, 0.12); g.drawRect(-W / 2, -H, 3, H); g.endFill();
    }

    public update(): void { /* ICollidable — logika w tick() */ }

    public tick(delta: number): void {
        this.t += delta / 60;
        if (this.isOpen && this.openK < 1) {
            this.openK = Math.min(1, this.openK + delta / 24); // 400 ms
            this.container.scale.y = 1 - this.openK;
            if (this.openK >= 1) this.container.visible = false;
        }
        const l = this.lock; l.clear();
        if (this.isOpen) return;
        // zamek: zlota tarcza z dziurka + puls (Czytelnosc: "potrzebny klucz")
        const p = 0.5 + 0.5 * Math.sin(this.t * 3.2);
        l.beginFill(GOLD, 0.18 + 0.14 * p); l.drawCircle(0, -this.origH / 2, 20 + 5 * p); l.endFill();
        l.beginFill(0xb8860b); l.drawCircle(0, -this.origH / 2, 10); l.endFill();
        l.beginFill(GOLD); l.drawCircle(0, -this.origH / 2, 8); l.endFill();
        l.beginFill(0x1f2226); l.drawCircle(0, -this.origH / 2 - 2, 2.6); l.drawRect(-1.5, -this.origH / 2 - 2, 3, 7); l.endFill();
        l.beginFill(0xfff6c8, 0.9); l.drawCircle(-3, -this.origH / 2 - 4, 1.6); l.endFill();
    }

    /** AABB drzwi + pad (test dotkniecia czolgu). */
    public touches(px: number, py: number, half: number, pad: number): boolean {
        return px + half > this.origX - pad && px - half < this.origX + this.w + pad && py + half > this.origY - pad && py - half < this.origY + this.origH + pad;
    }

    public open(): void {
        if (this.isOpen) return;
        this.isOpen = true;
        this.w = 0; this.h = 0; this.x = -10000; this.y = -10000; // kolizja znika (wzorzec PrisonBrick)
    }

    /** Q6 tutorial: zamknij ponownie (kolizja + wizual). */
    public reset(): void {
        this.isOpen = false; this.openK = 0;
        this.x = this.origX; this.y = this.origY; this.w = 12; this.h = this.origH;
        this.container.visible = true; this.container.scale.y = 1;
    }

    public destroy(): void { this.container.destroy({ children: true }); }
}
