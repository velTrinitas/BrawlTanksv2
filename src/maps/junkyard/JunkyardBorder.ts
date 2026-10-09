import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { JUNKYARD_HEX } from '../JunkyardMap';
import { bakeStatic, propRng, staticRect } from './junkyardBake';

/**
 * JunkyardBorder — corrugated sheet-metal fence around the yard (ZLOMOWISKO J1).
 *
 * Same contract as DuststormBorder / SandstormBorder: outer 30 px collision band (4 AABBs),
 * playable [40, 2960], `update()` takes no arguments. STATIC art, zero per-frame cost.
 *
 * VRAM: the first cut baked eight 1500 px strips (~9 MB at 2x). Now ONE 240x48 panel pair is
 * baked (two textures: horizontal + vertical) and repeated with PIXI.TilingSprite along each edge —
 * ~0.1 MB total, same look. Faded paint panels repeat every 240 px; nobody counts fence panels.
 */
const OUTER = 30;
const INNER = 48;
const COLLISION_INNER_EDGE = 40;
const TILE = 240;

export class JunkyardBorder {
    private container: PIXI.Container;
    private collisionRects: ICollidable[];

    constructor(private worldW: number, private worldH: number, worldContainer: PIXI.Container) {
        this.container = new PIXI.Container();
        this.container.zIndex = 250;
        worldContainer.addChild(this.container);
        this.collisionRects = this.buildCollisionRects();
        this.drawFence();
    }

    public getCollisionRects(): ICollidable[] { return this.collisionRects; }

    public update(): void { /* static fence — nothing animates */ }

    private buildCollisionRects(): ICollidable[] {
        const W = this.worldW, H = this.worldH;
        return [
            staticRect(0, -OUTER, W, OUTER + COLLISION_INNER_EDGE),
            staticRect(0, H - COLLISION_INNER_EDGE, W, OUTER + COLLISION_INNER_EDGE),
            staticRect(-OUTER, 0, OUTER + COLLISION_INNER_EDGE, H),
            staticRect(W - COLLISION_INNER_EDGE, 0, OUTER + COLLISION_INNER_EDGE, H),
        ];
    }

    private drawFence(): void {
        const W = this.worldW, H = this.worldH;
        const texH = this.bakePanel('h');
        const texV = this.bakePanel('v');
        const tile = (tex: PIXI.Texture, x: number, y: number, w: number, h: number): void => {
            const ts = new PIXI.TilingSprite(tex, w, h);
            ts.position.set(x, y);
            this.container.addChild(ts);
        };
        tile(texH, 0, 0, W, INNER);
        tile(texH, 0, H - INNER, W, INNER);
        tile(texV, 0, 0, INNER, H);
        tile(texV, W - INNER, 0, INNER, H);
    }

    /** Bakes one panel pair and returns its texture (sprite is discarded; texture stays in propBaker cache). */
    private bakePanel(dir: 'h' | 'v'): PIXI.Texture {
        const scratch = new PIXI.Container();
        this.container.addChild(scratch);
        const w = dir === 'h' ? TILE : INNER, h = dir === 'h' ? INNER : TILE;
        const node = bakeStatic(scratch, `jy_fence_tile_${dir}`, g => this.drawStrip(g, w, h, dir, propRng(7, dir === 'h' ? 1 : 2)),
            new PIXI.Rectangle(0, 0, w, h));
        this.container.removeChild(scratch);
        if (node instanceof PIXI.Sprite) return node.texture;
        // fallback (no renderer): render the live Graphics into a texture-less tiling is impossible — keep it visible
        this.container.addChild(scratch);
        return PIXI.Texture.WHITE;
    }

    /** One fence tile in local coords. Horizontal: panels along x; vertical: along y. */
    private drawStrip(g: PIXI.Graphics, w: number, h: number, dir: 'h' | 'v', rng: () => number): void {
        const PANEL = 120;
        const len = dir === 'h' ? w : h;
        const base = JUNKYARD_HEX.steel;
        for (let p = 0; p < len; p += PANEL) {
            const faded = rng() < 0.4;
            const col = faded ? [JUNKYARD_HEX.wreck1, JUNKYARD_HEX.wreck3, JUNKYARD_HEX.wreck4][(rng() * 3) | 0] : base;
            const pw = Math.min(PANEL, len - p);
            if (dir === 'h') {
                g.beginFill(col); g.drawRect(p, 0, pw, h); g.endFill();
                g.beginFill(JUNKYARD_HEX.steelDark, 0.35);
                for (let r = p + 6; r < p + pw - 4; r += 12) g.drawRect(r, 2, 3, h - 4);
                g.endFill();
                if (rng() < 0.6) { g.beginFill(JUNKYARD_HEX.rust, 0.45); g.drawRect(p + 10 + rng() * (pw - 30), 0, 6 + rng() * 10, h * (0.4 + rng() * 0.5)); g.endFill(); }
                g.beginFill(JUNKYARD_HEX.steelDark); g.drawRect(p, 0, 6, h); g.endFill();
                g.beginFill(JUNKYARD_HEX.steelLight, 0.5); g.drawRect(p, 0, 2, h); g.endFill();
            } else {
                g.beginFill(col); g.drawRect(0, p, w, pw); g.endFill();
                g.beginFill(JUNKYARD_HEX.steelDark, 0.35);
                for (let r = p + 6; r < p + pw - 4; r += 12) g.drawRect(2, r, w - 4, 3);
                g.endFill();
                if (rng() < 0.6) { g.beginFill(JUNKYARD_HEX.rust, 0.45); g.drawRect(0, p + 10 + rng() * (pw - 30), w * (0.4 + rng() * 0.5), 6 + rng() * 10); g.endFill(); }
                g.beginFill(JUNKYARD_HEX.steelDark); g.drawRect(0, p, w, 6); g.endFill();
                g.beginFill(JUNKYARD_HEX.steelLight, 0.5); g.drawRect(0, p, w, 2); g.endFill();
            }
        }
        if (dir === 'h') {
            g.beginFill(JUNKYARD_HEX.steelLight, 0.6); g.drawRect(0, 0, w, 2); g.endFill();
            g.beginFill(JUNKYARD_HEX.shadow, 0.25); g.drawRect(0, h - 6, w, 6); g.endFill();
        } else {
            g.beginFill(JUNKYARD_HEX.steelLight, 0.6); g.drawRect(0, 0, 2, h); g.endFill();
            g.beginFill(JUNKYARD_HEX.shadow, 0.25); g.drawRect(w - 6, 0, 6, h); g.endFill();
        }
    }
}
