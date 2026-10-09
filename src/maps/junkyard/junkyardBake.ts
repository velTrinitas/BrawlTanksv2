import * as PIXI from 'pixi.js';
import { bakeToSprite } from '../propBaker';
import { JUNKYARD_HEX, JUNKYARD_LIGHT } from '../JunkyardMap';
// Real wall clock captured at import: SigmaTest (bot) replaces performance.now with a virtual clock for determinism tests.
const REAL_NOW: () => number = performance.now.bind(performance);

/**
 * junkyardBake.ts — shared bake toolkit for ZLOMOWISKO props.
 *
 * REV 2 (playtest Mariusz 2026-10-08: "obiekty nie maja glebi, sa plaskie; budynki bez gradientu; cienie mocne,
 * kwadratowe"): props are now drawn with CANVAS 2D (gradients, soft blurred shadows, ambient occlusion) and
 * uploaded ONCE as a texture — the same pipeline castleBake.ts and MarsCargo use. PIXI.Graphics cannot fill
 * with a gradient, which is exactly why everything looked like paper cut-outs.
 *
 * Fake-3D vocabulary (sun NW, shadows SE), one place so every prop speaks the same language:
 *  - softShadow(): blurred, offset SE, longer for taller objects (shadowBlur, off-canvas draw trick)
 *  - block(): raised cuboid = S face (vertical gradient, darker at the base) + E face (darker) + top face
 *             (diagonal NW->SE gradient) + 2 px lit rim on N/W edges + AO band under the S face
 *  - cylinder(): vertical cylinder with a horizontal highlight band (pistons, rollers)
 *  - hazard(): yellow-black band (INTERACTION layer only)
 *
 * Memory: textures live in a module cache keyed per prop (position in the key => identical every match) and are
 * destroyed by `disposeJunkyardBakes()` when a match starts on ANOTHER map (main.ts reset block) — same
 * lifetime rule as the `jy_` propBaker entries.
 */

export const BAKE_RES = 2;
const _cache = new Map<string, PIXI.Texture>();
const _times = new Map<string, { ms: number; px: number }>();

/** PIXI.Graphics path kept for the fence tiles (tiny, no gradients needed). */
export function bakeStatic(parent: PIXI.Container, key: string, draw: (g: PIXI.Graphics) => void, clip?: PIXI.Rectangle): PIXI.Container {
    const g = new PIXI.Graphics();
    draw(g);
    parent.addChild(g);
    const spr = bakeToSprite(g, key, clip);
    if (spr) { parent.removeChild(g); g.destroy(); parent.addChild(spr); return spr; }
    return g;
}

/**
 * Canvas 2D bake. `draw` works in LOCAL prop coordinates (0,0 = footprint top-left); the canvas has `margin`
 * px of air on every side (shadows, risers above the footprint). Returns a sprite positioned so that local
 * (0,0) lands on the parent's origin.
 */
export function bakeCanvas(parent: PIXI.Container, key: string, w: number, h: number, margin: { l: number; t: number; r: number; b: number },
    draw: (c: CanvasRenderingContext2D) => void, res = BAKE_RES): PIXI.Sprite {
    let tex = _cache.get(key);
    if (!tex || tex.destroyed) {
        const t0 = REAL_NOW();
        const cw = w + margin.l + margin.r, ch = h + margin.t + margin.b;
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(cw * res); cv.height = Math.ceil(ch * res);
        const c = cv.getContext('2d')!;
        c.scale(res, res);
        c.translate(margin.l, margin.t);
        try { draw(c); } catch (e) { console.error('[junkyardBake] draw failed', key, (e as Error).stack); }
        tex = PIXI.Texture.from(cv, { resolution: res });
        _cache.set(key, tex);
        _times.set(key, { ms: REAL_NOW() - t0, px: cv.width * cv.height });
    }
    const spr = new PIXI.Sprite(tex);
    spr.position.set(-margin.l, -margin.t);
    parent.addChild(spr);
    return spr;
}

export function disposeJunkyardBakes(): void {
    for (const [k, t] of [..._cache.entries()]) {
        _cache.delete(k);
        try { if (!t.destroyed) t.destroy(true); } catch (e) { console.error('[junkyardBake] destroy failed', k, (e as Error).stack); }
    }
}

export function getJunkyardBakeCount(): number { return _cache.size; }
/** Diagnostics: draw time (ms) + canvas pixels per bake key, for the FIRST build in this session. */
export function getJunkyardBakeTimes(): Array<{ key: string; ms: number; px: number }> {
    return [..._times.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.ms - a.ms);
}

// ── colour helpers (numeric 0xRRGGBB <-> css) ─────────────────────────────────────────────
export function css(c: number, a = 1): string { return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`; }
export function darken(c: number, k: number): number {
    const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
    return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}
export function lighten(c: number, k: number): number {
    const r = Math.min(255, ((c >> 16) & 255) + (255 - ((c >> 16) & 255)) * k);
    const g = Math.min(255, ((c >> 8) & 255) + (255 - ((c >> 8) & 255)) * k);
    const b = Math.min(255, (c & 255) + (255 - (c & 255)) * k);
    return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

/** Deterministic per-prop RNG (position-seeded) so a bake is identical every match. */
export function propRng(x: number, y: number, salt = 0): () => number {
    let a = ((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791)) >>> 0;
    return function (): number {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Static ICollidable with a no-op update (border rects, machine footprints). */
export function staticRect(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number; update: () => void } {
    return { x, y, w, h, update: () => {} };
}

// ── fake-3D primitives (Canvas 2D) ─────────────────────────────────────────────────────────

/**
 * Soft cast shadow of a footprint (x,y,w,h) for an object `rise` px tall: offset SE, blurred,
 * slightly skewed so it reads as a shadow and not as a second rectangle. Draw BEFORE the body.
 */
export function softShadow(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rise: number, alpha = 0.42): void {
    const sx = JUNKYARD_LIGHT.shX + rise * 0.45, sy = JUNKYARD_LIGHT.shY + rise * 0.45;
    const OFF = 5000; // draw the shape far off-canvas; only its shadow lands on the canvas
    c.save();
    c.shadowColor = css(JUNKYARD_HEX.shadow, alpha);
    c.shadowBlur = 10 + rise * 0.15;
    c.shadowOffsetX = (OFF + sx) * BAKE_RES;
    c.shadowOffsetY = sy * BAKE_RES;
    c.fillStyle = '#000';
    c.beginPath();
    // skewed parallelogram: the far edge slides a little further SE (perspective hint)
    c.moveTo(x - OFF, y); c.lineTo(x - OFF + w, y); c.lineTo(x - OFF + w + rise * 0.15, y + h); c.lineTo(x - OFF + rise * 0.15, y + h); c.closePath();
    c.fill();
    c.restore();
}

export interface BlockStyle {
    top: number;        // top face base colour
    side?: number;      // S face colour (default darken(top,0.72))
    east?: number;      // E face colour (default darken(top,0.6))
    rim?: number;       // lit rim colour (default lighten(top,0.6))
    radius?: number;    // rounded corners of the top face
    eastW?: number;     // visible E face width (default 6)
    noAO?: boolean;
}

/** Raised cuboid on footprint (x,y,w,h) lifted by `rise`. Top face sits at y-rise. */
export function block(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rise: number, st: BlockStyle): void {
    const side = st.side ?? darken(st.top, 0.72), east = st.east ?? darken(st.top, 0.6), rim = st.rim ?? lighten(st.top, 0.6);
    const r = st.radius ?? 0, ew = st.eastW ?? 6;
    // E face (thin, darkest) — drawn as a vertical strip right of the top face, sheared by rise
    c.fillStyle = css(east);
    c.beginPath(); c.moveTo(x + w, y - rise); c.lineTo(x + w + ew * 0.6, y - rise + ew * 0.6); c.lineTo(x + w + ew * 0.6, y + h - rise + ew * 0.6); c.lineTo(x + w, y + h); c.closePath(); c.fill();
    // S face: vertical gradient, lit at the top edge, dark at the base
    const sg = c.createLinearGradient(0, y + h - rise, 0, y + h);
    sg.addColorStop(0, css(lighten(side, 0.12))); sg.addColorStop(0.55, css(side)); sg.addColorStop(1, css(darken(side, 0.72)));
    c.fillStyle = sg;
    c.fillRect(x, y + h - rise, w, rise);
    // top face: diagonal NW (light) -> SE (dark)
    const tg = c.createLinearGradient(x, y - rise, x + w, y + h - rise);
    tg.addColorStop(0, css(lighten(st.top, 0.16))); tg.addColorStop(0.5, css(st.top)); tg.addColorStop(1, css(darken(st.top, 0.86)));
    c.fillStyle = tg;
    roundRect(c, x, y - rise, w, h, r); c.fill();
    // lit rim N + W
    c.strokeStyle = css(rim, JUNKYARD_LIGHT.highlightAlpha + 0.2); c.lineWidth = 2;
    c.beginPath(); c.moveTo(x + 1, y + h - rise - 1); c.lineTo(x + 1, y - rise + 1); c.lineTo(x + w - 1, y - rise + 1); c.stroke();
    // top face edge towards S (crease where top meets the S face)
    c.strokeStyle = css(darken(st.top, 0.55), 0.5); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y + h - rise); c.lineTo(x + w, y + h - rise); c.stroke();
    // ambient occlusion at the base
    if (!st.noAO) {
        const ao = c.createLinearGradient(0, y + h - 6, 0, y + h + 4);
        ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,0.35)');
        c.fillStyle = ao; c.fillRect(x, y + h - 6, w, 10);
    }
}

/** Vertical cylinder (piston, roller, pole): horizontal gradient with a highlight band left of centre. */
export function cylinder(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: number, capH = 0): void {
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, css(darken(col, 0.6))); g.addColorStop(0.25, css(lighten(col, 0.35))); g.addColorStop(0.45, css(col)); g.addColorStop(1, css(darken(col, 0.45)));
    c.fillStyle = g; c.fillRect(x, y, w, h);
    if (capH > 0) {
        const cg = c.createLinearGradient(x, 0, x + w, 0);
        cg.addColorStop(0, css(darken(col, 0.8))); cg.addColorStop(0.4, css(lighten(col, 0.5))); cg.addColorStop(1, css(darken(col, 0.7)));
        c.fillStyle = cg; c.beginPath(); c.ellipse(x + w / 2, y, w / 2, capH, 0, 0, Math.PI * 2); c.fill();
    }
}

export function hazard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step = 14): void {
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = css(JUNKYARD_HEX.hazardK); c.fillRect(x, y, w, h);
    c.fillStyle = css(JUNKYARD_HEX.hazardY);
    for (let sx = -h; sx < w + h; sx += step * 2) {
        c.beginPath(); c.moveTo(x + sx, y); c.lineTo(x + sx + step, y); c.lineTo(x + sx + step + h, y + h); c.lineTo(x + sx + h, y + h); c.closePath(); c.fill();
    }
    // fake bevel (art dir REV 6): 1 px light edge on top, 1 px dark edge at the bottom => thick tape, not paint
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x, y, w, 1);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x, y + h - 1, w, 1);
    c.restore();
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    c.beginPath();
    if (r <= 0) { c.rect(x, y, w, h); return; }
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}

/** Rust / dirt streaks (decor detail) inside a rect. */
export function grime(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rng: () => number, n = 5): void {
    for (let i = 0; i < n; i++) {
        const gx = x + rng() * w, gy = y + rng() * h * 0.6, gw = 3 + rng() * 8, gh = 8 + rng() * (h * 0.5);
        const g = c.createLinearGradient(0, gy, 0, gy + gh);
        g.addColorStop(0, css(JUNKYARD_HEX.rust, 0.55)); g.addColorStop(1, css(JUNKYARD_HEX.rust, 0));
        c.fillStyle = g; c.fillRect(gx, gy, gw, gh);
    }
}

// ── fake-3D PARALLAX (J6a, v2: faces are BAKED gradients sheared per frame, no flat quads) ──────────
/**
 * Camera parallax for a tall prop: the higher a point is above the ground, the more it shifts AWAY from the
 * screen centre (pattern: CyberBuilding / ArctowskiStation). Offset for a point `height` px above ground:
 * (center - camCenter) * PARALLAX_HF * height / 100.
 */
export const PARALLAX_HF = 0.10;
export function parallaxOffset(cx: number, cy: number, height: number, camX: number, camY: number, viewW: number, viewH: number): { ox: number; oy: number } {
    const k = PARALLAX_HF * Math.min(1.6, height / 100);
    return { ox: (cx - (camX + viewW / 2)) * k, oy: (cy - (camY + viewH / 2)) * k };
}

export interface ParallaxBlock {
    /** Ground layer (shadow, AO, anything at floor level) — never moves. */
    base: PIXI.Container;
    /** Ground-level openings drawn OVER the walls (mouth, door, teeth) — never moves. */
    mid: PIXI.Container;
    /** Roof layer (top face + whatever stands on it) — moves with the camera. */
    top: PIXI.Container;
    /** W wall inner (only with opts.west): local x = height above ground 0..unit, local y = along the wall 0..h.
     *  Children placed here are sheared/scaled with the wall (REV 9: crusher jaws live on the W wall). */
    west: PIXI.Container;
    /** Call every frame from the VIEW loop (not the logic step). */
    setOffset(ox: number, oy: number): void;
}

export interface ParallaxBlockOpts {
    /** Custom W wall: baked `unit` px wide (= full height of the wall) with `draw`, and ALWAYS revealed at least
     *  `minReveal` px (the roof shifts with it) — for openings that must stay readable from any camera position. */
    west?: { unit: number; minReveal: number; draw: (c: CanvasRenderingContext2D) => void };
}

/**
 * Shear a holder so its local origin stays put and the local point (0, -len) lands at (dx, -len + dy)
 * (vertical things: walls, columns, pistons). Exact PIXI skew/scale math — no approximation.
 */
export function leanSprite(holder: PIXI.Container, len: number, dx: number, dy: number): void {
    const vis = Math.max(len * 0.05, len - dy);
    const sX = -Math.atan2(dx, vis);
    holder.skew.set(sX, 0);
    holder.scale.set(1, vis / (len * Math.cos(sX)));
}
/** Shear a holder so local (unit, 0) lands at (dx, dy) and vertical edges stay vertical (side faces E/W). */
function shearX(holder: PIXI.Container, unit: number, dx: number, dy: number): void {
    if (Math.abs(dx) < 0.01) { holder.visible = false; return; }
    holder.visible = true;
    const sY = Math.atan2(dy, dx);
    holder.skew.set(0, sY);
    holder.scale.set(dx / (unit * Math.cos(sY)), 1);
}

const EFACE_W = 8;
/**
 * Split cuboid for parallax: baked GROUND layer (soft shadow, AO + `drawBase`), baked S FACE (vertical gradient,
 * lit at the top edge, + `drawSide` details, sheared per frame between the footprint and the shifted roof), baked
 * E/W FACE strip (horizontal gradient, scaled/sheared per frame), baked ROOF (top-face gradient + rim + `drawTop`,
 * local coords identical to `block()`: top face spans y -rise..h-rise). With offset (0,0) it looks like `block()`
 * (thin E face 4 px, S face `rise` tall). Zero per-frame redraws: only transforms change.
 */
export function parallaxBlock(parent: PIXI.Container, key: string, w: number, h: number, rise: number, st: BlockStyle,
    margin: { l: number; t: number; r: number; b: number }, drawBase: (c: CanvasRenderingContext2D) => void, drawTop: (c: CanvasRenderingContext2D) => void,
    drawSide?: (c: CanvasRenderingContext2D) => void, opts?: ParallaxBlockOpts): ParallaxBlock {
    const side = st.side ?? darken(st.top, 0.72), east = st.east ?? darken(st.top, 0.6), rim = st.rim ?? lighten(st.top, 0.6);
    const westOpt = opts?.west;
    const base = new PIXI.Container(); parent.addChild(base);
    bakeCanvas(base, `${key}_base`, w, h, margin, c => {
        softShadow(c, 0, 0, w, h, rise, 0.45);
        if (!st.noAO) { const ao = c.createLinearGradient(0, h - 6, 0, h + 4); ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,0.35)'); c.fillStyle = ao; c.fillRect(0, h - 6, w, 10); }
        drawBase(c);
    });
    // E / W face strip: holder at the footprint's E (or W) edge, scaled in x to the roof shift, sheared in y
    const eHolder = new PIXI.Container(); eHolder.position.set(w, 0); parent.addChild(eHolder);
    const wHolder = new PIXI.Container(); wHolder.position.set(0, 0); parent.addChild(wHolder);
    let west: PIXI.Container = wHolder;
    const wUnit = westOpt ? westOpt.unit : EFACE_W;
    for (const hd of [eHolder, wHolder]) {
        const inner = new PIXI.Container(); hd.addChild(inner);
        const isW = hd === wHolder;
        if (isW) west = inner;
        const fw = isW ? wUnit : EFACE_W;
        bakeCanvas(inner, isW && westOpt ? `${key}_wface` : `${key}_eface`, fw, h, isW && westOpt ? { l: 0, t: 30, r: 0, b: 30 } : { l: 0, t: 0, r: 0, b: 0 }, c => {
            const g = c.createLinearGradient(0, 0, fw, 0);
            g.addColorStop(0, css(darken(east, 0.8))); g.addColorStop(0.5, css(east)); g.addColorStop(1, css(lighten(east, 0.2)));
            c.fillStyle = g; c.fillRect(0, 0, fw, h);
            const v = c.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(255,255,255,0.12)'); v.addColorStop(1, 'rgba(0,0,0,0.25)');
            c.fillStyle = v; c.fillRect(0, 0, fw, h);
            if (isW && westOpt) westOpt.draw(c);
        });
    }
    // S face: holder at the footprint's S edge; texture w x rise placed at local y -rise..0
    const sHolder = new PIXI.Container(); sHolder.position.set(0, h); parent.addChild(sHolder);
    const sInner = new PIXI.Container(); sInner.position.set(0, -rise); sHolder.addChild(sInner);
    bakeCanvas(sInner, `${key}_sface`, w, rise, { l: 0, t: 0, r: 0, b: 0 }, c => {
        const sg = c.createLinearGradient(0, 0, 0, rise);
        sg.addColorStop(0, css(lighten(side, 0.18))); sg.addColorStop(0.12, css(lighten(side, 0.06))); sg.addColorStop(0.6, css(side)); sg.addColorStop(1, css(darken(side, 0.68)));
        c.fillStyle = sg; c.fillRect(0, 0, w, rise);
        const hg = c.createLinearGradient(0, 0, w, 0); hg.addColorStop(0, 'rgba(255,255,255,0.10)'); hg.addColorStop(0.5, 'rgba(255,255,255,0)'); hg.addColorStop(1, 'rgba(0,0,0,0.18)');
        c.fillStyle = hg; c.fillRect(0, 0, w, rise);
        c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(0, 0, w, 1.5);
        if (drawSide) drawSide(c);
    });
    const mid = new PIXI.Container(); parent.addChild(mid);
    const top = new PIXI.Container(); parent.addChild(top);
    bakeCanvas(top, `${key}_top`, w, h, margin, c => {
        const tg = c.createLinearGradient(0, -rise, w, h - rise);
        tg.addColorStop(0, css(lighten(st.top, 0.16))); tg.addColorStop(0.5, css(st.top)); tg.addColorStop(1, css(darken(st.top, 0.86)));
        c.fillStyle = tg; roundRect(c, 0, -rise, w, h, st.radius ?? 0); c.fill();
        c.strokeStyle = css(rim, JUNKYARD_LIGHT.highlightAlpha + 0.2); c.lineWidth = 2;
        c.beginPath(); c.moveTo(1, h - rise - 1); c.lineTo(1, -rise + 1); c.lineTo(w - 1, -rise + 1); c.stroke();
        c.strokeStyle = css(darken(st.top, 0.55), 0.5); c.lineWidth = 1; c.beginPath(); c.moveTo(0, h - rise); c.lineTo(w, h - rise); c.stroke();
        drawTop(c);
    });
    const setOffset = (ox: number, oy: number): void => {
        if (westOpt) {
            // W wall always revealed (opening must stay readable); the E face never shows for such a block
            const tx = Math.max(ox, westOpt.minReveal);
            top.position.set(tx, oy);
            leanSprite(sHolder, rise, tx, oy);
            shearX(wHolder, wUnit, tx, -rise + oy); eHolder.visible = false;
            return;
        }
        const tx = ox - 4; // -4: thin E face always visible at rest (same look as block())
        top.position.set(tx, oy);
        leanSprite(sHolder, rise, tx, oy);
        if (tx < 0) { shearX(eHolder, EFACE_W, tx, -rise + oy); wHolder.visible = false; }
        else { shearX(wHolder, EFACE_W, tx, -rise + oy); eHolder.visible = false; }
    };
    setOffset(0, 0);
    return { base, mid, top, west, setOffset };
}

// dev diagnostics hook (tools/junkyard-bake-times.mjs; a bare dynamic import would get a fresh HMR instance)
(window as any).__jyBakeTimes = getJunkyardBakeTimes;
