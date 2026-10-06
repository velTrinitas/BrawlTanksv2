import * as PIXI from 'pixi.js';
import { bakeToSprite } from '../propBaker';

/**
 * TROPICS ART v2 / T1 — fundament wydajnosci budynkow farmy.
 *
 * Rozpoznanie: kazdy budynek Tropikow to dziesiatki-setki ZYWYCH `PIXI.Graphics` (geometria
 * teselowana przy kazdym rysowaniu) i zaden nie byl ukrywany poza kadrem. To byl najwiekszy
 * koszt draw calli na tej mapie.
 *
 * 1) `bakeStaticGraphics` — wszystkie BEZPOSREDNIE dzieci-`Graphics` kontenera statycznego
 *    piecze do JEDNEGO sprite'a (propBaker, supersampling x2). Dzieci, ktore NIE sa Graphics
 *    (drzwi, okiennice, dzwon, wrobel — animowane transformami), zostaja zywe nad sprite'em.
 * 2) `CullGroup` — ukrywa (`renderable=false`) wszystkie kontenery budynku poza kadrem i mowi
 *    wolajacemu, ze moze pominac animacje (oszczednosc CPU).
 */
export function bakeStaticGraphics(c: PIXI.Container, cacheKey: string, clip?: PIXI.Rectangle): void {
    try {
        const keep = c.children.filter(ch => !(ch instanceof PIXI.Graphics));
        for (const k of keep) c.removeChild(k);
        if (c.children.length === 0) { for (const k of keep) c.addChild(k); return; }
        const spr = bakeToSprite(c, cacheKey, clip);
        if (!spr) { for (const k of keep) c.addChild(k); return; }
        const old = c.removeChildren();
        for (const o of old) o.destroy(); // tekstury gradientow sa wspoldzielone — nie niszczymy
        c.addChild(spr);
        for (const k of keep) c.addChild(k);
    } catch (e) {
        console.error('[tropicsBake] bake failed', (e as Error).stack, { cacheKey });
    }
}

export class CullGroup {
    private hidden = false;

    constructor(
        private readonly containers: PIXI.Container[],
        private readonly x0: number, private readonly y0: number,
        private readonly x1: number, private readonly y1: number,
    ) {}

    /** @returns true gdy grupa jest POZA kadrem (wolajacy moze pominac animacje). */
    update(camX: number, camY: number, viewW: number, viewH: number): boolean {
        if (viewW === undefined || viewH === undefined) return false;
        const M = 80;
        const off = this.x1 < camX - M || this.x0 > camX + viewW + M
                 || this.y1 < camY - M || this.y0 > camY + viewH + M;
        if (off !== this.hidden) {
            this.hidden = off;
            for (const c of this.containers) c.renderable = !off;
        }
        return off;
    }
}
