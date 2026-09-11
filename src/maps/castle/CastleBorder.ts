import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { CASTLE_HEX } from '../CastleMap';

/**
 * CastleBorder — granica mapy Castle Grounds (OBRON ZAMEK F1).
 *
 * Wzorzec RuinsBorder (klasa S, tanio): 4 AABB kolizji (outer 30 + inner 40,
 * gracz zatrzymuje sie ~10 px przed krawedzia), ZERO animacji per-frame. Wizual
 * granicy (zywoplot / palisada) bedzie WYPIEKANY w teksture gruntu w F2 — ten
 * modul dodaje tylko delikatny statyczny cien lasu przy krawedziach (glebia).
 */
export class CastleBorder {
    private worldW: number;
    private worldH: number;

    private container: PIXI.Container;
    private gfxShade: PIXI.Graphics;

    private collisionRects: ICollidable[];

    constructor(worldW: number, worldH: number, worldContainer: PIXI.Container) {
        this.worldW = worldW;
        this.worldH = worldH;

        this.container = new PIXI.Container();
        this.container.zIndex = 250;
        worldContainer.addChild(this.container);

        this.gfxShade = new PIXI.Graphics();
        this.container.addChild(this.gfxShade);

        this.collisionRects = this.buildCollisionRects();
        this.drawInnerShade();
    }

    public getCollisionRects(): ICollidable[] {
        return this.collisionRects;
    }

    /** 4 AABB — identyczna matematyka jak SandstormBorder / RuinsBorder. */
    private buildCollisionRects(): ICollidable[] {
        const W = this.worldW;
        const H = this.worldH;
        const OUTER = 30;
        const COLLISION_INNER_EDGE = 40;

        return [
            { x: 0, y: -OUTER, w: W, h: OUTER + COLLISION_INNER_EDGE, update: () => {} },
            { x: 0, y: H - COLLISION_INNER_EDGE, w: W, h: OUTER + COLLISION_INNER_EDGE, update: () => {} },
            { x: -OUTER, y: 0, w: OUTER + COLLISION_INNER_EDGE, h: H, update: () => {} },
            { x: W - COLLISION_INNER_EDGE, y: 0, w: OUTER + COLLISION_INNER_EDGE, h: H, update: () => {} },
        ];
    }

    /** Statyczny cien lasu od krawedzi do wewnatrz (4 pasy po 5 krokow, ciemna zielen). */
    private drawInnerShade(): void {
        const g = this.gfxShade;
        const W = this.worldW;
        const H = this.worldH;
        const BAND = 56;
        const STEPS = 5;
        const SHADE = CASTLE_HEX.forestDeep;

        for (let i = 0; i < STEPS; i++) {
            const alpha = 0.26 * (1 - i / STEPS);
            const slice = BAND / STEPS;
            g.beginFill(SHADE, alpha);
            g.drawRect(0, 20 + i * slice, W, slice);                 // TOP
            g.drawRect(0, H - 20 - (i + 1) * slice, W, slice);       // BOTTOM
            g.drawRect(20 + i * slice, 0, slice, H);                 // LEFT
            g.drawRect(W - 20 - (i + 1) * slice, 0, slice, H);       // RIGHT
            g.endFill();
        }
    }

    /** Brak animacji per-frame (fill-rate) — interfejs spojny z innymi borderami. */
    public update(): void {
        // static border — intentionally no per-frame work
    }
}
