/**
 * TankSpriteBaker — FAZA P1 (Sprite Baker) + TANK ART v2 (atlas / trim / 2 fazy gasienic)
 *
 * Per-feature isolated cache (Constitution §7) for 2.5D tank textures baked from the
 * tank25d lab renderer. In-game the player is just two PIXI.Sprites (hull + turret).
 *
 * Two independent rotations (hullAngle, turretAngle) are baked as TWO disjoint layers:
 *   - HULL   layer: drop shadow + treads + extrusion + hull top  -> BAKE_ANGLES textures (per hullAngle)
 *   - TURRET layer: turret extrusion + top + barrel (barrelBehind) -> BAKE_ANGLES textures (per turretAngle)
 *
 * LEGACY PATH (isTankArtV2() false — production today, bit-for-bit):
 *   render2d.bakeHullLayer / bakeTurretLayer, one 160x160 canvas -> one PIXI.Texture per frame.
 *
 * V2 PATH (?tankart=1 — TANK ART v2):
 *   render2dV2.bakeHullLayerV2 / bakeTurretLayerV2, hull baked in TREAD_PHASES phases (treads crawl),
 *   every frame ALPHA-SCANNED and TRIMMED to its content, then shelf-packed into ATLASES
 *   (<= ATLAS_MAX_CSS px per side, so <= 2048 device px at resolution 2 — safe on old Androids).
 *   PIXI.Texture(base, frame, orig=160x160, trim) keeps anchor 0.5 + BAKE_DISPLAY_SCALE math in
 *   Player.ts unchanged. Estimated VRAM: ~19 MB @res2 vs 29.5 MB legacy despite 2 tread phases
 *   (today ~55% of every 160x160 texture is empty margin). Bake runs in chunks (await between
 *   BAKE_CHUNK frames) so the loading screen keeps animating.
 *   The alpha scan doubles as the AABB MEASUREMENT: with ?diag=1 every brawler logs its max
 *   extent and margin to the 160 box; margin < AABB_MIN_MARGIN is a console.error.
 *
 * ISOLATION / ROLLBACK:
 *   render2d.ts / render2dV2.ts are imported DYNAMICALLY inside the bake — the module-level
 *   CanvasRenderingContext2D.prototype.stroke patch (FIX#1) executes ONLY when a bake runs.
 *
 * Usage (Player.ts, behind BAKER_ENABLED):
 *   await TankSpriteBaker.bakeBrawler(app, 'twardy', look);   // under loading screen
 *   hull.texture   = TankSpriteBaker.getHullTexture('twardy', hullAngle, treadPhase);
 *   turret.texture = TankSpriteBaker.getTurretTexture('twardy', turretAngle);
 *   turret.rotation = 0;  // rotation is BAKED IN — do NOT also rotate the sprite
 */
import * as PIXI from 'pixi.js';
import { isTankArtV2 } from '../config/tankArtFlag';
import { tankLookKey, type TankLook } from './tankLook';

// ── Bake parameters (single source of truth; tune here) ──────────────────────
/** Number of baked angles per layer. 36 => 10deg quantization. */
export const BAKE_ANGLES = 36;
/** Square texture size in CSS px. AABB Twardy: barrel reach muzzleDist(51)+barrelLen(30)=81
 *  from centre, + drop shadow ~36 down. Measured max extent 112x102 -> 160 leaves 24px/side margin. */
export const BAKE_TEX_SIZE = 160;
/** V2: tread phases baked for the hull (2 = classic sprite trick: links alternate half a link). */
export const TREAD_PHASES = 2;
/** V2: atlas side limit in CSS px (x resolution = device px; 1024*2 = 2048 = safe GPU limit). */
const ATLAS_MAX_CSS = 1024;
/** V2: frames baked per chunk before yielding to the event loop (loading screen keeps moving). */
const BAKE_CHUNK = 12;
/** V2: alpha-scan stride (px) and safety margin added around the found content rect. */
const TRIM_STRIDE = 2;
const TRIM_MARGIN = 2;
/** V2: dev assertion — content closer than this to the 160 box edge = art too big for the bake. */
const AABB_MIN_MARGIN = 2;

const ANGLE_STEP = (Math.PI * 2) / BAKE_ANGLES;

interface BakedBrawler {
    /** hull[phase][angleIndex]; legacy path has exactly one phase. */
    hull: PIXI.Texture[][];
    turret: PIXI.Texture[];   // length BAKE_ANGLES, indexed by turretAngle quantum
    /** Cache key (tankLookKey + art version) — rebake on change. */
    key: string;
    /** V2: atlas base textures to destroy on dispose (legacy: empty, textures own their bases). */
    atlases: PIXI.BaseTexture[];
}

/** Minimal shape render2d.bakeHullLayer / bakeTurretLayer read off the tank object. */
interface BakeTank {
    brawler: unknown;
    x: number; y: number;
    hullAngle: number;
    turretAngle: number;
    recoil: number;
    pitch: number;
    treadShift: number;
    hitFlashTimer: number;
    isIdle: boolean;
}

/** One trimmed frame waiting for atlas packing (V2). */
interface TrimmedFrame {
    canvas: HTMLCanvasElement;   // full 160x160 bake (device px)
    x: number; y: number; w: number; h: number; // content rect in CSS px within the 160 box
    kind: 'hull' | 'turret';
    phase: number;
    index: number;
}

const DIAG = ((): boolean => {
    try { return new URLSearchParams(location.search).get('diag') === '1'; } catch { return false; }
})();

class TankSpriteBakerImpl {
    // LAB_TEX_CACHE — isolated, keyed by brawlerId. Separate from BRAWLER_TEX_CACHE (flat path).
    private cache = new Map<string, BakedBrawler>();
    // De-dupe concurrent bake requests for the same brawler (one bake in flight per id).
    private baking = new Map<string, Promise<BakedBrawler>>();

    /** True if this brawler's textures are already baked and cached. */
    isBaked(brawlerId: string): boolean {
        return this.cache.has(brawlerId);
    }

    /** Number of hull tread phases available for a baked brawler (1 legacy, TREAD_PHASES v2). */
    getTreadPhases(brawlerId: string): number {
        const baked = this.cache.get(brawlerId);
        return baked ? baked.hull.length : 1;
    }

    /**
     * Bake (or return cached) the hull + turret textures for one brawler.
     * Idempotent and concurrency-safe. Call under the loading screen (async).
     *
     * @throws if the brawler id is unknown in the renderer config.
     */
    async bakeBrawler(app: PIXI.Application, brawlerId: string, look: TankLook): Promise<BakedBrawler> {
        const v2 = isTankArtV2();
        const key = (v2 ? 'v2|' : 'v1|') + tankLookKey(look);
        const cached = this.cache.get(brawlerId);
        if (cached && cached.key === key) return cached;
        // Look or art version changed since last bake -> drop stale textures, rebake.
        if (cached) this.dispose(brawlerId);

        // De-dupe stays keyed by brawlerId: bake runs once per match start, so an
        // in-flight bake with a DIFFERENT look is a deliberately unsupported case.
        const inFlight = this.baking.get(brawlerId);
        if (inFlight) return inFlight;

        const promise = v2 ? this.doBakeV2(app, brawlerId, look, key) : this.doBake(app, brawlerId, look, key);
        this.baking.set(brawlerId, promise);
        try {
            const result = await promise;
            this.cache.set(brawlerId, result);
            return result;
        } finally {
            this.baking.delete(brawlerId);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // LEGACY PATH (bit-for-bit as before TANK ART v2)
    // ═════════════════════════════════════════════════════════════════════════
    private async doBake(app: PIXI.Application, brawlerId: string, look: TankLook, key: string): Promise<BakedBrawler> {
        // DYNAMIC import — FIX#1 prototype patch installs HERE, not at game boot (rollback-safe).
        const r2d = await import('../experimental/tank25d/render2d');

        const srcBrawler = (r2d.BRAWLERS as Array<{ id: string }>).find((b) => b.id === brawlerId);
        if (!srcBrawler) {
            throw new Error(`[TankSpriteBaker] unknown brawler id: ${brawlerId}`);
        }

        // National flag baked INTO the hull texture (1:1 with lab via drawHullTop), so it inherits
        // the exact 2.5D compression/rotation at every angle. Map game flagId -> render2d FLAGS id.
        const fId = this.mapFlag(r2d.FLAGS as string[], look.flagId);
        // SKIN-1: tank skin = palette override. BOTH fields swapped together
        // (colors for drawTank/bake*, color for muzzle-flash path in fire.ts) —
        // consistency rule for every brawler spread that feeds render2d.
        const derive = r2d.derive as (hex: string) => unknown;
        // SKIN-2: _skinPhase: 0 ZAWSZE — 36 katow piecze sie w JEDNEJ zamrozonej
        // fazie (determinizm bake; painterzy wzorow nie znaja performance.now()).
        const brawler = {
            ...srcBrawler,
            flag: fId,
            _skinPhase: 0,
            ...(look.skinHex ? { color: look.skinHex, colors: derive(look.skinHex) } : {}),
            ...(look.skinPattern ? { skinPattern: look.skinPattern } : {}),
        };

        const resolution = app.renderer.resolution || 1;

        const hull: PIXI.Texture[] = new Array(BAKE_ANGLES);
        const turret: PIXI.Texture[] = new Array(BAKE_ANGLES);

        for (let i = 0; i < BAKE_ANGLES; i++) {
            const angle = i * ANGLE_STEP;
            hull[i] = this.bakeLayer(r2d, brawler, 'hull', angle, resolution);
            turret[i] = this.bakeLayer(r2d, brawler, 'turret', angle, resolution);
        }

        return { hull: [hull], turret, key, atlases: [] };
    }

    private bakeLayer(
        r2d: typeof import('../experimental/tank25d/render2d'),
        brawler: unknown,
        layer: 'hull' | 'turret',
        angle: number,
        resolution: number,
    ): PIXI.Texture {
        const { canvas, ctx } = this.makeBakeCanvas(resolution);
        const tank = this.makeTank(brawler, layer, angle, 0);

        if (layer === 'hull') {
            r2d.bakeHullLayer(ctx, tank, false);
        } else {
            r2d.bakeTurretLayer(ctx, tank, false);
        }

        // Canvas2D -> PIXI.Texture. resolution carried so the sprite measures BAKE_TEX_SIZE in CSS px.
        const tex = PIXI.Texture.from(canvas, { resolution } as PIXI.IBaseTextureOptions);
        return tex;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // V2 PATH — TANK ART v2: render2dV2 + tread phases + trim + atlas + AABB diag
    // ═════════════════════════════════════════════════════════════════════════
    private async doBakeV2(app: PIXI.Application, brawlerId: string, look: TankLook, key: string): Promise<BakedBrawler> {
        // DYNAMIC import: render2dV2 statically imports render2d, so FIX#1 installs here as well.
        const r2dV2 = await import('../experimental/tank25d/render2dV2');
        const r2d = await import('../experimental/tank25d/render2d');

        const base = r2dV2.brawlerV2(brawlerId) as { id: string } | undefined;
        if (!base || base.id !== brawlerId) {
            throw new Error(`[TankSpriteBaker] unknown brawler id (v2): ${brawlerId}`);
        }
        // SKIN-1 palette + SKIN-2 pattern (frozen phase 0 — determinism across all frames).
        const withSkin = r2dV2.withSkin as (b: unknown, hex: string | null) => unknown;
        const brawler = {
            ...(withSkin(base, look.skinHex) as object),
            _skinPhase: 0,
            ...(look.skinPattern ? { skinPattern: look.skinPattern } : {}),
        };
        const drawSkin = r2d.drawSkinPattern as (ctx: CanvasRenderingContext2D, b: unknown, c: unknown, area: string) => void;
        const opts = {
            liveCanvas: false, phase: 0, isSuper: false, spin: 0, charge: 1,
            number: look.number, flagId: look.flagId,
            drawSkin: look.skinPattern ? drawSkin : undefined,
        };

        const resolution = app.renderer.resolution || 1;
        const treadLink = (r2dV2.TREAD_LINK as number) || 6;

        // 1) Bake every frame to its own 160x160 canvas + alpha-scan its content rect.
        const frames: TrimmedFrame[] = [];
        let baked = 0;
        const yieldFrame = async (): Promise<void> => {
            baked++;
            if (baked % BAKE_CHUNK === 0) await new Promise<void>((r) => setTimeout(r, 0));
        };
        for (let phase = 0; phase < TREAD_PHASES; phase++) {
            const treadShift = (treadLink / TREAD_PHASES) * phase;
            for (let i = 0; i < BAKE_ANGLES; i++) {
                const { canvas, ctx } = this.makeBakeCanvas(resolution);
                const tank = this.makeTank(brawler, 'hull', i * ANGLE_STEP, treadShift);
                r2dV2.bakeHullLayerV2(ctx, tank, opts);
                frames.push({ canvas, kind: 'hull', phase, index: i, ...this.scanAlpha(canvas, resolution) });
                await yieldFrame();
            }
        }
        for (let i = 0; i < BAKE_ANGLES; i++) {
            const { canvas, ctx } = this.makeBakeCanvas(resolution);
            const tank = this.makeTank(brawler, 'turret', i * ANGLE_STEP, 0);
            r2dV2.bakeTurretLayerV2(ctx, tank, opts);
            frames.push({ canvas, kind: 'turret', phase: 0, index: i, ...this.scanAlpha(canvas, resolution) });
            await yieldFrame();
        }

        // 2) AABB measurement (dev): max extent + margin to the box. This IS the math-verify.
        this.reportAabb(brawlerId, frames);

        // 3) Shelf-pack trimmed frames into atlases (<= ATLAS_MAX_CSS per side).
        const { atlases, placed } = this.packAtlases(frames, resolution);

        // 4) PIXI textures: frame = atlas rect, orig = 160 box, trim = content rect within the box.
        const hull: PIXI.Texture[][] = [];
        for (let p = 0; p < TREAD_PHASES; p++) hull.push(new Array(BAKE_ANGLES));
        const turret: PIXI.Texture[] = new Array(BAKE_ANGLES);
        const bases = atlases.map((c) => new PIXI.BaseTexture(c, { resolution } as PIXI.IBaseTextureOptions));
        for (const pl of placed) {
            const tex = new PIXI.Texture(
                bases[pl.atlas],
                new PIXI.Rectangle(pl.ax, pl.ay, pl.f.w, pl.f.h),
                new PIXI.Rectangle(0, 0, BAKE_TEX_SIZE, BAKE_TEX_SIZE),
                new PIXI.Rectangle(pl.f.x, pl.f.y, pl.f.w, pl.f.h),
            );
            if (pl.f.kind === 'hull') hull[pl.f.phase][pl.f.index] = tex;
            else turret[pl.f.index] = tex;
        }
        // Scratch canvases are garbage now — release their bitmaps eagerly (mobile memory).
        for (const f of frames) { f.canvas.width = 0; f.canvas.height = 0; }

        if (DIAG) {
            const px = atlases.reduce((s, c) => s + c.width * c.height, 0);
            console.log(`[TankSpriteBaker] v2 ${brawlerId}: ${frames.length} frames -> ${atlases.length} atlas(es), `
                + `${(px * 4 / 1048576).toFixed(1)} MB VRAM (legacy: ${(frames.length * (BAKE_TEX_SIZE * resolution) ** 2 * 4 / 1048576).toFixed(1)} MB for the same frame count)`);
        }

        return { hull, turret, key, atlases: bases };
    }

    /** Alpha scan of a bake canvas (device px) -> content rect in CSS px (with safety margin). */
    private scanAlpha(canvas: HTMLCanvasElement, resolution: number): { x: number; y: number; w: number; h: number } {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('[TankSpriteBaker] no 2D context for alpha scan');
        const W = canvas.width, H = canvas.height;
        const data = ctx.getImageData(0, 0, W, H).data;
        let minX = W, minY = H, maxX = -1, maxY = -1;
        for (let y = 0; y < H; y += TRIM_STRIDE) {
            const row = y * W * 4;
            for (let x = 0; x < W; x += TRIM_STRIDE) {
                if (data[row + x * 4 + 3] !== 0) {
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return { x: 0, y: 0, w: 1, h: 1 }; // empty frame (should never happen)
        // stride can skip up to TRIM_STRIDE-1 px on each side -> widen by stride + margin, clamp to box.
        const pad = (TRIM_STRIDE + TRIM_MARGIN) * resolution;
        const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
        const x1 = Math.min(W, maxX + 1 + pad), y1 = Math.min(H, maxY + 1 + pad);
        return {
            x: Math.floor(x0 / resolution), y: Math.floor(y0 / resolution),
            w: Math.ceil((x1 - x0) / resolution), h: Math.ceil((y1 - y0) / resolution),
        };
    }

    /** Dev AABB report: how much of the 160 box the art uses and how close it gets to the edge. */
    private reportAabb(brawlerId: string, frames: TrimmedFrame[]): void {
        let maxW = 0, maxH = 0, minMargin = BAKE_TEX_SIZE;
        for (const f of frames) {
            maxW = Math.max(maxW, f.w); maxH = Math.max(maxH, f.h);
            const m = Math.min(f.x, f.y, BAKE_TEX_SIZE - (f.x + f.w), BAKE_TEX_SIZE - (f.y + f.h)) + TRIM_MARGIN + TRIM_STRIDE;
            minMargin = Math.min(minMargin, m);
        }
        if (minMargin < AABB_MIN_MARGIN) {
            console.error(`[TankSpriteBaker] AABB OVERFLOW ${brawlerId}: art reaches ${minMargin.toFixed(1)}px from the `
                + `${BAKE_TEX_SIZE}px bake box (min ${AABB_MIN_MARGIN}). Shrink the v2 art or raise BAKE_TEX_SIZE.`);
        } else if (DIAG) {
            console.log(`[TankSpriteBaker] AABB ${brawlerId}: max extent ${maxW}x${maxH} of ${BAKE_TEX_SIZE}, min margin ${minMargin.toFixed(1)}px`);
        }
    }

    /**
     * Shelf packing: frames sorted by height, rows filled left->right, new atlas when the
     * next row would not fit. All rects in CSS px; canvases sized in device px.
     */
    private packAtlases(frames: TrimmedFrame[], resolution: number): {
        atlases: HTMLCanvasElement[];
        placed: Array<{ f: TrimmedFrame; atlas: number; ax: number; ay: number }>;
    } {
        const GAP = 1; // CSS px between frames (bilinear bleed guard)
        const order = [...frames].sort((a, b) => b.h - a.h);
        const atlases: HTMLCanvasElement[] = [];
        const placed: Array<{ f: TrimmedFrame; atlas: number; ax: number; ay: number }> = [];
        let atlasIdx = -1, curX = 0, curY = 0, rowH = 0, usedW = 0, usedH = 0;
        const shelves: Array<{ w: number; h: number }> = [];
        const newAtlas = (): void => {
            atlasIdx++; curX = 0; curY = 0; rowH = 0; usedW = 0; usedH = 0;
            atlases.push(document.createElement('canvas'));
            shelves.length = 0;
        };
        const finishAtlas = (): void => {
            if (atlasIdx < 0) return;
            const c = atlases[atlasIdx];
            c.width = Math.max(1, Math.ceil(usedW * resolution));
            c.height = Math.max(1, Math.ceil(usedH * resolution));
        };
        newAtlas();
        for (const f of order) {
            if (f.w + GAP > ATLAS_MAX_CSS || f.h + GAP > ATLAS_MAX_CSS) {
                throw new Error(`[TankSpriteBaker] frame ${f.kind}#${f.index} ${f.w}x${f.h} exceeds atlas ${ATLAS_MAX_CSS}`);
            }
            if (curX + f.w + GAP > ATLAS_MAX_CSS) { curX = 0; curY += rowH + GAP; rowH = 0; }
            if (curY + f.h + GAP > ATLAS_MAX_CSS) { finishAtlas(); newAtlas(); }
            placed.push({ f, atlas: atlasIdx, ax: curX, ay: curY });
            curX += f.w + GAP;
            rowH = Math.max(rowH, f.h);
            usedW = Math.max(usedW, curX);
            usedH = Math.max(usedH, curY + rowH + GAP);
        }
        finishAtlas();
        // Blit the trimmed content of every frame into its atlas slot (device px).
        for (const pl of placed) {
            const c = atlases[pl.atlas];
            const ctx = c.getContext('2d');
            if (!ctx) throw new Error('[TankSpriteBaker] no 2D context for atlas');
            const f = pl.f;
            ctx.drawImage(
                f.canvas,
                f.x * resolution, f.y * resolution, f.w * resolution, f.h * resolution,
                pl.ax * resolution, pl.ay * resolution, f.w * resolution, f.h * resolution,
            );
        }
        return { atlases, placed };
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Shared helpers
    // ═════════════════════════════════════════════════════════════════════════
    private makeBakeCanvas(resolution: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
        const canvas = document.createElement('canvas');
        canvas.width = BAKE_TEX_SIZE * resolution;
        canvas.height = BAKE_TEX_SIZE * resolution;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('[TankSpriteBaker] failed to get 2D context for bake canvas');
        }
        // Scale so render2d draws in CSS-px space while the bitmap is retina-sharp.
        ctx.scale(resolution, resolution);
        // _lwBase = resolution => FIX#1 keeps stroke widths constant in CSS px AND sharp on retina
        // (mirrors the lab). Game/HUD contexts never set _lwBase, so they keep base=1 behaviour.
        (ctx as unknown as { _lwBase: number })._lwBase = resolution;
        return { canvas, ctx };
    }

    private makeTank(brawler: unknown, layer: 'hull' | 'turret', angle: number, treadShift: number): BakeTank {
        return {
            brawler,
            x: BAKE_TEX_SIZE / 2,
            y: BAKE_TEX_SIZE / 2,
            hullAngle: layer === 'hull' ? angle : 0,
            turretAngle: layer === 'turret' ? angle : 0,
            recoil: 0,
            pitch: 0,
            treadShift,
            hitFlashTimer: 0,
            isIdle: false,
        };
    }

    /** Nearest baked HULL texture for a continuous hullAngle (radians) and tread phase. */
    getHullTexture(brawlerId: string, hullAngle: number, treadPhase: number = 0): PIXI.Texture {
        const baked = this.requireBaked(brawlerId);
        const phases = baked.hull.length;
        const p = phases > 1 ? ((treadPhase % phases) + phases) % phases : 0;
        return baked.hull[p][this.angleToIndex(hullAngle)];
    }

    /** Nearest baked TURRET texture for a continuous turretAngle (radians). */
    getTurretTexture(brawlerId: string, turretAngle: number): PIXI.Texture {
        const baked = this.requireBaked(brawlerId);
        return baked.turret[this.angleToIndex(turretAngle)];
    }

    /** Square texture size in CSS px (for sprite scale math in Player.ts). */
    getTexSize(): number {
        return BAKE_TEX_SIZE;
    }

    /** Free all textures for a brawler (e.g. on match teardown if desired). */
    dispose(brawlerId: string): void {
        const baked = this.cache.get(brawlerId);
        if (!baked) return;
        if (baked.atlases.length) {
            // V2: textures are views into atlases — destroy the views, then the bases (GPU memory).
            for (const ph of baked.hull) ph.forEach((t) => t.destroy(false));
            baked.turret.forEach((t) => t.destroy(false));
            baked.atlases.forEach((b) => b.destroy());
        } else {
            for (const ph of baked.hull) ph.forEach((t) => t.destroy(true));
            baked.turret.forEach((t) => t.destroy(true));
        }
        this.cache.delete(brawlerId);
    }

    private requireBaked(brawlerId: string): BakedBrawler {
        const baked = this.cache.get(brawlerId);
        if (!baked) {
            throw new Error(
                `[TankSpriteBaker] brawler not baked: ${brawlerId} — call bakeBrawler(app, id, look) under loading screen first`,
            );
        }
        return baked;
    }

    /** Map a game flagId (e.g. 'pl') to a render2d FLAGS id (e.g. 'PL'), or null if unsupported. */
    private mapFlag(flags: string[], flagId: string | null): string | null {
        if (!flagId) return null;
        const up = flagId.toUpperCase();
        return flags.indexOf(up) !== -1 ? up : null;
    }

    /** Quantize a continuous angle (radians) to the nearest of BAKE_ANGLES indices. */
    private angleToIndex(angle: number): number {
        const twoPi = Math.PI * 2;
        let a = angle % twoPi;
        if (a < 0) a += twoPi;
        return Math.round(a / ANGLE_STEP) % BAKE_ANGLES;
    }
}

/** Singleton — use this everywhere. */
export const TankSpriteBaker = new TankSpriteBakerImpl();
