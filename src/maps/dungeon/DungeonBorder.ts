import type { ICollidable } from '../../types/MapType';

/**
 * DungeonBorder — granica mapy LOCHY (SAVE THE QUEEN).
 *
 * Wzorzec CastleBorder (klasa S, ZERO pracy per-frame). Q2 (layout v2): CIENKA ramka
 * z cegielek 60 px (decyzja Mariusza) + lita skala za cela Krolowej (E). Wizual ramki,
 * krat lane'ow, pochodni i lancuchow jest WYPIECZONY w buildDungeonTexture.
 * Kolizja = 4 AABB ramki + AABB skaly. Pole gry = playable (60..2940).
 */
export class DungeonBorder {
    private collisionRects: ICollidable[];

    constructor(worldW: number, worldH: number, playable: { x: number; y: number; w: number; h: number },
        rocks: readonly { x: number; y: number; w: number; h: number }[]) {
        const OUTER = 30; // zapas poza swiatem (jak kazdy border)
        const px1 = playable.x + playable.w, py1 = playable.y + playable.h;
        this.collisionRects = [
            { x: -OUTER, y: -OUTER, w: worldW + OUTER * 2, h: playable.y + OUTER, update: () => {} },            // N
            { x: -OUTER, y: py1, w: worldW + OUTER * 2, h: worldH - py1 + OUTER, update: () => {} },            // S
            { x: -OUTER, y: playable.y, w: playable.x + OUTER, h: playable.h, update: () => {} },               // W
            { x: px1, y: playable.y, w: worldW - px1 + OUTER, h: playable.h, update: () => {} },                // E
            ...rocks.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h, update: () => {} })),                          // skala za cela
        ];
    }

    public getCollisionRects(): ICollidable[] {
        return this.collisionRects;
    }

    /** Brak animacji per-frame — interfejs spojny z innymi borderami. */
    public update(): void {
        // static border — intentionally no per-frame work
    }
}
