import * as PIXI from 'pixi.js';
import { bakePennant } from './castleBake';
import { isPointInView } from '../cullGate';
import { CastleCampFlags } from './CastleCampFlags';
import { CastleTrees } from './CastleTrees';
import { CastleCampfires } from './CastleCampfires';

/**
 * CastlePennants — proporce na wiezach + sztandar glowny donzonu (OBRON ZAMEK F2).
 * 2 pieczone tekstury, animacja WYLACZNIE transformami (T9): skew.x + scale.x
 * (lopot), amplituda 2x "za duza" (T12). Culling przez isPointInView (kotwice
 * poza ekranem nie sa dotykane). Klasa A.
 */

export interface PennantAnchor { x: number; y: number; color: 'crimson' | 'gold'; scale?: number }

export class CastlePennants {
    private container: PIXI.Container;
    private sprites: PIXI.Sprite[];
    private anchors: PennantAnchor[];
    /** B3 (v0.194.0): flagi obozow jada na tym samym update/destroy — zero nowych wpiec w main.ts. */
    private campFlags: CastleCampFlags;
    /** v0.195.0 — bujajace sie korony drzew; tworzone PO lesie (main.ts buduje las przed proporcami). */
    private trees: CastleTrees;
    /** v0.195.0: ogien w ogniskach obozow — ten sam update/destroy, zero wpiec w main.ts. */
    private campfires: CastleCampfires;

    constructor(anchors: PennantAnchor[], worldContainer: PIXI.Container) {
        this.anchors = anchors;
        this.campFlags = new CastleCampFlags(worldContainer);
        this.trees = new CastleTrees(worldContainer);
        this.campfires = new CastleCampfires(worldContainer);
        this.container = new PIXI.Container();
        this.container.zIndex = 5000; // nad dachami (wyzej niz kazda bryla, ponizej overlayow 1e6)
        worldContainer.addChild(this.container);
        this.sprites = anchors.map(a => {
            const s = new PIXI.Sprite(bakePennant(a.color));
            s.anchor.set(0, 0.5);
            s.x = a.x; s.y = a.y;
            s.scale.set(a.scale ?? 1);
            this.container.addChild(s);
            return s;
        });
    }

    public update(camX: number, camY: number, viewW: number, viewH: number): void {
        this.campFlags.update(camX, camY, viewW, viewH);
        this.trees.update(camX, camY, viewW, viewH);
        this.campfires.update(camX, camY, viewW, viewH);
        const t = Date.now() / 1000;
        for (let i = 0; i < this.sprites.length; i++) {
            const s = this.sprites[i], a = this.anchors[i];
            const visible = isPointInView(a.x, a.y, camX, camY, viewW, viewH, 40);
            s.renderable = visible;
            if (!visible) continue;
            const base = a.scale ?? 1;
            s.skew.y = Math.sin(t * 4 + i * 1.3) * 0.28;
            s.scale.x = base * (0.85 + (Math.sin(t * 5.2 + i) + 1) * 0.1);
        }
    }

    public destroy(): void {
        this.campFlags.destroy();
        this.trees.destroy();
        this.campfires.destroy();
        this.container.destroy({ children: true });
    }
}
