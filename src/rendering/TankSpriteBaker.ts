/**
 * TankSpriteBaker — FAZA P1 (Sprite Baker)
 *
 * Per-feature isolated cache (Constitution §7) for 2.5D tank textures baked from the
 * tank25d lab renderer (render2d.ts). Replaces flat "pancake" player rendering with the
 * extruded 2.5D look — WITHOUT paying drawTank's per-frame Canvas2D cost: drawTank runs
 * ONCE per angle under the loading screen, baked into lightweight PIXI.Textures; in-game
 * the player is just two PIXI.Sprites (hull + turret), same per-frame cost as today.
 *
 * Two independent rotations (hullAngle, turretAngle) are baked as TWO disjoint layers:
 *   - HULL   layer: drop shadow + treads + extrusion + hull top  -> 36 textures (per hullAngle)
 *   - TURRET layer: turret extrusion + top + barrel (barrelBehind) -> 36 textures (per turretAngle)
 * This collapses the naive 36x36 grid to 36+36. Validated pixel-identical to full drawTank.
 *
 * ISOLATION / ROLLBACK:
 *   render2d.ts is imported DYNAMICALLY inside bakeBrawler() — so its module-level
 *   CanvasRenderingContext2D.prototype.stroke patch (FIX#1) executes ONLY when a bake
 *   actually runs (i.e. only when BAKER_ENABLED is on and a bake is requested). With the
 *   flag off, render2d is never imported, the patch never installs, and the game renders
 *   bit-for-bit as before.
 *
 * FLAG:
 *   The baked config has flag=null (lab bakes a PL flag into the hull top). The player's
 *   national flag stays a runtime overlay in Player.ts (per-profile FlagConfig).
 *
 * Usage (Player.ts, behind BAKER_ENABLED):
 *   await TankSpriteBaker.bakeBrawler(app, 'twardy');   // under loading screen
 *   hull.texture   = TankSpriteBaker.getHullTexture('twardy', hullAngle);
 *   turret.texture = TankSpriteBaker.getTurretTexture('twardy', turretAngle);
 *   turret.rotation = 0;  // rotation is BAKED IN — do NOT also rotate the sprite
 */
import * as PIXI from 'pixi.js';

// ── Bake parameters (single source of truth; tune here) ──────────────────────
/** Number of baked angles per layer. 36 => 10deg quantization. */
export const BAKE_ANGLES = 36;
/** Square texture size in CSS px. AABB Twardy: barrel reach muzzleDist(51)+barrelLen(30)=81
 *  from centre, + drop shadow ~36 down. Measured max extent 112x102 -> 160 leaves 24px/side margin. */
export const BAKE_TEX_SIZE = 160;

const ANGLE_STEP = (Math.PI * 2) / BAKE_ANGLES;

interface BakedBrawler {
    hull: PIXI.Texture[];   // length BAKE_ANGLES, indexed by hullAngle quantum
    turret: PIXI.Texture[]; // length BAKE_ANGLES, indexed by turretAngle quantum
    flagId: string | null;  // raw flagId baked into hull textures (cache key — rebake on change)
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

class TankSpriteBakerImpl {
    // LAB_TEX_CACHE — isolated, keyed by brawlerId. Separate from BRAWLER_TEX_CACHE (flat path).
    private cache = new Map<string, BakedBrawler>();
    // De-dupe concurrent bake requests for the same brawler (one bake in flight per id).
    private baking = new Map<string, Promise<BakedBrawler>>();

    /** True if this brawler's 72 textures are already baked and cached. */
    isBaked(brawlerId: string): boolean {
        return this.cache.has(brawlerId);
    }

    /**
     * Bake (or return cached) the 36 hull + 36 turret textures for one brawler.
     * Idempotent and concurrency-safe. Call under the loading screen (async).
     *
     * @throws if the brawler id is unknown in render2d's BRAWLERS config.
     */
    async bakeBrawler(
        app: PIXI.Application,
        brawlerId: string,
        flagId: string | null = null,
    ): Promise<BakedBrawler> {
        const cached = this.cache.get(brawlerId);
        if (cached && cached.flagId === flagId) return cached;
        // Flag changed since last bake (or new player flag) -> drop stale textures, rebake.
        if (cached) this.dispose(brawlerId);

        const inFlight = this.baking.get(brawlerId);
        if (inFlight) return inFlight;

        const promise = this.doBake(app, brawlerId, flagId);
        this.baking.set(brawlerId, promise);
        try {
            const result = await promise;
            this.cache.set(brawlerId, result);
            return result;
        } finally {
            this.baking.delete(brawlerId);
        }
    }

    private async doBake(
        app: PIXI.Application,
        brawlerId: string,
        flagId: string | null,
    ): Promise<BakedBrawler> {
        // DYNAMIC import — FIX#1 prototype patch installs HERE, not at game boot (rollback-safe).
        const r2d = await import('../experimental/tank25d/render2d');

        const srcBrawler = (r2d.BRAWLERS as Array<{ id: string }>).find((b) => b.id === brawlerId);
        if (!srcBrawler) {
            throw new Error(`[TankSpriteBaker] unknown brawler id: ${brawlerId}`);
        }

        // National flag baked INTO the hull texture (1:1 with lab via drawHullTop), so it inherits
        // the exact 2.5D compression/rotation at every angle. Map game flagId -> render2d FLAGS id.
        const fId = this.mapFlag(r2d.FLAGS as string[], flagId);
        const brawler = { ...srcBrawler, flag: fId };

        const resolution = app.renderer.resolution || 1;

        const hull: PIXI.Texture[] = new Array(BAKE_ANGLES);
        const turret: PIXI.Texture[] = new Array(BAKE_ANGLES);

        for (let i = 0; i < BAKE_ANGLES; i++) {
            const angle = i * ANGLE_STEP;
            hull[i] = this.bakeLayer(r2d, brawler, 'hull', angle, resolution);
            turret[i] = this.bakeLayer(r2d, brawler, 'turret', angle, resolution);
        }

        return { hull, turret, flagId };
    }

    private bakeLayer(
        r2d: typeof import('../experimental/tank25d/render2d'),
        brawler: unknown,
        layer: 'hull' | 'turret',
        angle: number,
        resolution: number,
    ): PIXI.Texture {
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

        const cx = BAKE_TEX_SIZE / 2;
        const cy = BAKE_TEX_SIZE / 2;

        const tank: BakeTank = {
            brawler,
            x: cx,
            y: cy,
            hullAngle: layer === 'hull' ? angle : 0,
            turretAngle: layer === 'turret' ? angle : 0,
            recoil: 0,
            pitch: 0,
            treadShift: 0,
            hitFlashTimer: 0,
            isIdle: false,
        };

        if (layer === 'hull') {
            r2d.bakeHullLayer(ctx as unknown as CanvasRenderingContext2D, tank, false);
        } else {
            r2d.bakeTurretLayer(ctx as unknown as CanvasRenderingContext2D, tank, false);
        }

        // Canvas2D -> PIXI.Texture. resolution carried so the sprite measures BAKE_TEX_SIZE in CSS px.
        const tex = PIXI.Texture.from(canvas, { resolution } as PIXI.IBaseTextureOptions);
        return tex;
    }

    /** Nearest baked HULL texture for a continuous hullAngle (radians). */
    getHullTexture(brawlerId: string, hullAngle: number): PIXI.Texture {
        const baked = this.requireBaked(brawlerId);
        return baked.hull[this.angleToIndex(hullAngle)];
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
        baked.hull.forEach((t) => t.destroy(true));
        baked.turret.forEach((t) => t.destroy(true));
        this.cache.delete(brawlerId);
    }

    private requireBaked(brawlerId: string): BakedBrawler {
        const baked = this.cache.get(brawlerId);
        if (!baked) {
            throw new Error(
                `[TankSpriteBaker] brawler not baked: ${brawlerId} — call bakeBrawler(app, id) under loading screen first`,
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