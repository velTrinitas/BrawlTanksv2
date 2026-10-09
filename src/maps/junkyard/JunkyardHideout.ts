import * as PIXI from 'pixi.js';
import { JUNKYARD_HEX } from '../JunkyardMap';
import { isBoxInView } from '../cullGate';

/**
 * JunkyardHideout — stealth zone of ZLOMOWISKO (J2). Three kinds, one contract (`isPointInside`,
 * plugged into the shared stealth loop in main.ts exactly like HydroGarden / castle wheat):
 *  - 'wash'      — Myjnia Piany: point test only; the canopy, brushes and suds live in FoamStation (REV 8).
 *  - 'tires'     — Labirynt Opon interior: the tire walls are the cover; a faint pulsing dashed outline marks
 *                  the pocket (Czytelnosc: the player sees where the hideout starts).
 *  - 'container' — Otwarte Kontenery: the roof (baked in ScrapContainer) hides the tank; same outline.
 *
 * Purely visual + a point test. Timers / detection live in main.ts (players[] loop); no sim state here.
 */
export type HideoutKind = 'wash' | 'tires' | 'container';

export class JunkyardHideout {
    public container: PIXI.Container;
    private outline: PIXI.Graphics | null = null;
    private lastMs = 0;
    private t = 0;

    constructor(public kind: HideoutKind, public x: number, public y: number, public w: number, public h: number, worldContainer: PIXI.Container) {
        this.container = new PIXI.Container();
        this.container.position.set(x, y);
        // Above anything standing inside (tank zIndex = its y <= y+h), below HUD-ish overlays.
        this.container.zIndex = y + h + 40;
        worldContainer.addChild(this.container);
        if (kind !== 'wash') this.buildOutline(); // REV 8: piana/wiata rysowane w FoamStation; 'wash' = sam test punktu
    }

    public isPointInside(px: number, py: number): boolean {
        return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
    }

    private buildOutline(): void {
        const g = new PIXI.Graphics();
        const col = this.kind === 'tires' ? JUNKYARD_HEX.tireText : JUNKYARD_HEX.foam;
        g.lineStyle(2, col, 0.5);
        // dashed rectangle (static geometry; only alpha pulses)
        const dash = 14, gap = 10;
        const edge = (x0: number, y0: number, x1: number, y1: number) => {
            const len = Math.hypot(x1 - x0, y1 - y0); const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
            for (let d = 0; d < len; d += dash + gap) { const e = Math.min(len, d + dash); g.moveTo(x0 + ux * d, y0 + uy * d); g.lineTo(x0 + ux * e, y0 + uy * e); }
        };
        const m = 6;
        edge(m, m, this.w - m, m); edge(this.w - m, m, this.w - m, this.h - m); edge(this.w - m, this.h - m, m, this.h - m); edge(m, this.h - m, m, m);
        g.lineStyle(0);
        this.container.addChild(g);
        this.outline = g;
    }

    /** Camera args optional by kit contract; without them the zone always animates. */
    public update(camX?: number, camY?: number, viewW?: number, viewH?: number): void {
        const now = performance.now(); // visual only (bubbles / pulse) — not sim state
        const dt = this.lastMs ? Math.min(4, (now - this.lastMs) / 16.667) : 1;
        this.lastMs = now;
        this.t += dt;
        if (camX !== undefined && camY !== undefined && viewW !== undefined && viewH !== undefined) {
            const vis = isBoxInView(this.x, this.y, this.w, this.h, camX, camY, viewW, viewH);
            this.container.renderable = vis;
            if (!vis) return;
        }
        if (this.outline) this.outline.alpha = 0.55 + Math.sin(this.t * 0.06) * 0.3;
    }
}
