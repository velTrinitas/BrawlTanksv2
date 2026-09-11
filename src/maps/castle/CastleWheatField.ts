import * as PIXI from 'pixi.js';
import { CASTLE_HEX } from './castlePalette';

/**
 * CastleWheatField — pole zboza, strefa STEALTH (OBRON ZAMEK F2).
 * Wzorzec HydroGarden/RuinsBush: prostokat `isPointInside`, wizual klosow WYPIEKANY
 * w gruncie (castlePainters.drawWheatField), runtime = cienka pulsujaca ramka
 * (Czytelnosc: granica strefy) — klasa S/A.
 */
export class CastleWheatField {
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private container: PIXI.Container;
    private gfx: PIXI.Graphics;

    constructor(x: number, y: number, w: number, h: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.container = new PIXI.Container();
        this.container.x = x; this.container.y = y;
        this.container.zIndex = 4;
        worldContainer.addChild(this.container);
        this.gfx = new PIXI.Graphics();
        this.container.addChild(this.gfx);
    }

    public isPointInside(px: number, py: number): boolean {
        return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
    }

    public update(): void {
        const g = this.gfx;
        g.clear();
        const pulse = 0.18 + Math.sin(Date.now() / 800) * 0.1;
        g.lineStyle(2, CASTLE_HEX.wheat, pulse);
        g.drawRect(0, 0, this.w, this.h);
        g.lineStyle(0);
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
