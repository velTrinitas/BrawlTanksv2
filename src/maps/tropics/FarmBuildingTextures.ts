import * as PIXI from 'pixi.js';

/**
 * v0.31.0 — Shared texture cache for all tropics farm buildings (barn, henhouse, cowshed).
 *
 * RATIONALE: Each building uses Canvas+Texture vertical gradients dla walls/foundation/roof.
 * Bez shared cache każdy building tworzy duplicates → memory leak przy spawn wielu instancji.
 * Pattern: key = "v-<topHex>-<botHex>-<height>", reused across all building types.
 *
 * Plus: helper utilities (Pt interface, makeStaticCollidable factory dla getExtraCollidables()).
 *
 * UŻYTKOWNIK API:
 *   getVerticalGradientTexture(colorTop, colorBot, height) — get/create cached texture
 *   fillGradientPolygon(g, points, colorTop, colorBot) — convenience polygon fill
 *   getSiloGradientTexture(width) — horizontal silver gradient (silo-specific)
 *   makeStaticCollidable(x, y, w, h) — ICollidable factory dla collision extras
 */

export interface Pt {
    x: number;
    y: number;
}

const verticalGradientCache: Map<string, PIXI.Texture> = new Map();
const horizontalGradientCache: Map<string, PIXI.Texture> = new Map();

export function getVerticalGradientTexture(
    colorTop: number,
    colorBot: number,
    height: number,
): PIXI.Texture {
    const h = Math.max(1, Math.ceil(height));
    const key = `v-${colorTop.toString(16)}-${colorBot.toString(16)}-${h}`;
    const cached = verticalGradientCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#' + colorTop.toString(16).padStart(6, '0'));
    grd.addColorStop(1, '#' + colorBot.toString(16).padStart(6, '0'));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 1, h);

    const tex = PIXI.Texture.from(canvas);
    verticalGradientCache.set(key, tex);
    return tex;
}

export function fillGradientPolygon(
    g: PIXI.Graphics,
    points: Pt[],
    colorTop: number,
    colorBot: number,
): void {
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));
    const height = maxY - minY;

    const texture = getVerticalGradientTexture(colorTop, colorBot, height);
    const matrix = new PIXI.Matrix();
    matrix.translate(0, minY);

    g.beginTextureFill({ texture, matrix });
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.closePath();
    g.endFill();
}

/** Horizontal silver gradient dla silosów (cylinder body). */
export function getSiloGradientTexture(width: number): PIXI.Texture {
    const w = Math.max(2, Math.ceil(width));
    const key = `silo-h-${w}`;
    const cached = horizontalGradientCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#363c41');
    grd.addColorStop(0.18, '#6a7177');
    grd.addColorStop(0.55, '#9ea7ad');
    grd.addColorStop(0.85, '#c4cad0');
    grd.addColorStop(1.0, '#c4cad0');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, 1);

    const tex = PIXI.Texture.from(canvas);
    horizontalGradientCache.set(key, tex);
    return tex;
}

export interface StaticCollidable {
    x: number;
    y: number;
    w: number;
    h: number;
    update: (camX: number, camY: number, sw: number, sh: number) => void;
}

/** Factory dla getExtraCollidables() pattern — empty update no-op. */
export function makeStaticCollidable(
    x: number,
    y: number,
    w: number,
    h: number,
): StaticCollidable {
    return { x, y, w, h, update: () => {} };
}

/** Seeded RNG generator dla deterministic random (gwoździe, wyłamania, kępki). */
export function makeRng(seed: number): () => number {
    let state = (seed | 0) || 1;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}