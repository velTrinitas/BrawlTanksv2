import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * RuinsBorder — granica mapy Fortified Ruins (FAZA CTF F1).
 *
 * Wzorzec SandstormBorder: 4 AABB rects kolizji (COLLISION_INNER_EDGE = 40 px,
 * player visual edge zatrzymuje sie ~10 px przed murem). Wizual muru obwodowego
 * (22 px kamien + krenelaz) jest WYPIEKANY w teksture gruntu
 * (FortifiedRuinsMap.drawPerimeterWall) — ten modul dodaje tylko delikatny
 * statyczny cien wewnetrzny przy krawedziach (glebia, zero animacji per-frame).
 */
export class RuinsBorder {
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

    /**
     * 4 AABB — identyczna matematyka jak SandstormBorder (40 + 20 radius - 50 tank half = 10 px
     * wizualnego marginesu do muru).
     */
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

    /** Statyczny gradientowy cien od muru do wewnatrz (4 pasy po 5 krokow). */
    private drawInnerShade(): void {
        const g = this.gfxShade;
        const W = this.worldW;
        const H = this.worldH;
        const BAND = 50;
        const STEPS = 5;
        const SHADE = 0x3c2c18;

        for (let i = 0; i < STEPS; i++) {
            const alpha = 0.22 * (1 - i / STEPS);
            const slice = BAND / STEPS;
            g.beginFill(SHADE, alpha);
            g.drawRect(0, 22 + i * slice, W, slice);                 // TOP
            g.drawRect(0, H - 22 - (i + 1) * slice, W, slice);       // BOTTOM
            g.drawRect(22 + i * slice, 0, slice, H);                 // LEFT
            g.drawRect(W - 22 - (i + 1) * slice, 0, slice, H);       // RIGHT
            g.endFill();
        }
    }

    /** Brak animacji per-frame (fill-rate) — interfejs spojny z innymi borderami. */
    public update(): void {
        // static border — intentionally no per-frame work
    }
}
