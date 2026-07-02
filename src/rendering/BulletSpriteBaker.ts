/**
 * BulletSpriteBaker — FAZA P2 (Sprite Baker, pociski gracza)
 *
 * Per-feature isolated cache (Constitution §7) for 2.5D bullet textures baked from the
 * tank25d lab renderer (fire.ts drawBulletWithFx -> render2d drawBullet + aura). Replaces the
 * flat PIXI.Graphics circle bullets with the lab look — WITHOUT paying drawBullet's per-frame
 * Canvas2D cost: drawBullet runs ONCE per (brawler, isSuper) under the loading screen, baked into
 * lightweight PIXI.Textures; in-game each bullet is a single PIXI.Sprite (cheaper than the old
 * re-tesselated Graphics).
 *
 * ISOLATION / ROLLBACK (mirrors TankSpriteBaker):
 *   fire.ts (and through it render2d.ts) is imported DYNAMICALLY inside doBake() — so render2d's
 *   module-level CanvasRenderingContext2D.prototype.stroke patch (FIX#1) installs ONLY when a bake
 *   actually runs (BAKER_ENABLED on + bake requested). Flag off => never imported => game renders
 *   bit-for-bit as before.
 *
 * WHAT IS BAKED (visual-only, P2 scope):
 *   - Head/comet/aura of every bullet type, 1:1 with lab. Super = per-brawler signature tint +
 *     aura (fire.ts drawAura, additive), drawn via drawBulletWithFx (aura first, then bullet).
 *   - Baked pointing RIGHT at unit velocity (vx=1, vy=0): the lab trail collapses to ~0, so the
 *     game keeps its own TRAIL_LEN_MAP trail (decision B). Sprite rotation handles orientation/spin.
 *
 * WHAT IS FROZEN (conscious trade-off, like P1's barrel anim): per-frame micro-animations driven by
 *   performance.now() inside drawBullet — plasma crackle arcs, flame flicker/sparks, gold orbit pulse.
 *   Continuous spin (quick/shadow/gold) is preserved cheaply via sprite.rotation in Bullet.ts.
 *
 * Usage (Bullet.ts + main.ts, behind BAKER_ENABLED):
 *   await BulletSpriteBaker.bakeBrawler(app, 'twardy');         // under loading screen
 *   sprite.texture = BulletSpriteBaker.getTexture('twardy', isSuper);
 *   const { mode, rate } = BulletSpriteBaker.getSpin('twardy'); // 'dir' | 'spin' | 'none'
 */
import * as PIXI from 'pixi.js';

// ── Bake config (single source of truth; tune here) ────────────────────────────
// type/size 1:1 z render2d BRAWLERS bullet + fire.ts SUPER profiles & SUPER_TINTS.
// tex/superTex = render-measured AABB (napi-rs, 2R + ~12 margin, x4-aligned).
// spin: 'dir' = sprite.rotation = atan2(vy,vx) (oriented head/comet, set once — bullets fly straight);
//       'spin' = continuous sprite.rotation = now()*rate (boomerang/shuriken/gold orbit);
//       'none' = no rotation (rotationally symmetric ball).
interface BulletBakeCfg {
    type: string; size: number; tex: number;
    superType: string; superSize: number; superTex: number;
    tint: string; auraScale: number;
    spin: 'dir' | 'spin' | 'none'; spinRate: number;
    muzzleDist: number;
}

const CFG: Record<string, BulletBakeCfg> = {
    twardy: { type: 'tracer',        size: 6,   tex: 44, superType: 'tracer',        superSize: 6,   superTex: 64,  tint: '#5BE12C', auraScale: 1,    spin: 'dir',  spinRate: 0,     muzzleDist: 51 },
    heavy:  { type: 'shell',         size: 6,   tex: 44, superType: 'shell',         superSize: 9,   superTex: 92,  tint: '#C026D3', auraScale: 1,    spin: 'dir',  spinRate: 0,     muzzleDist: 46 },
    scout:  { type: 'quick',         size: 10,  tex: 56, superType: 'quick',         superSize: 10,  superTex: 100, tint: '#FFE94D', auraScale: 1,    spin: 'spin', spinRate: 0.025, muzzleDist: 44 },
    sniper: { type: 'laser',         size: 28,  tex: 72, superType: 'super_laser',   superSize: 30,  superTex: 204, tint: '#22D3FF', auraScale: 0.75, spin: 'dir',  spinRate: 0,     muzzleDist: 62 },
    plasma: { type: 'plasma',        size: 6,   tex: 56, superType: 'plasma',        superSize: 8,   superTex: 80,  tint: '#00E5FF', auraScale: 1,    spin: 'none', spinRate: 0,     muzzleDist: 65 },
    pyro:   { type: 'flame',         size: 5,   tex: 76, superType: 'super_flame',   superSize: 6,   superTex: 148, tint: '#FF6A1A', auraScale: 1,    spin: 'dir',  spinRate: 0,     muzzleDist: 38 },
    shadow: { type: 'shadow_bullet', size: 4,   tex: 48, superType: 'shadow_bullet', superSize: 4.5, superTex: 52,  tint: '#C0C6D4', auraScale: 1,    spin: 'spin', spinRate: 0.02,  muzzleDist: 50 },
    king:   { type: 'gold',          size: 7.5, tex: 52, superType: 'gold',          superSize: 12,  superTex: 112, tint: '#FF5A2C', auraScale: 1,    spin: 'spin', spinRate: 0.012, muzzleDist: 54 },
};

// render2d constants (for muzzle geometry mapping render2d-space -> world-space).
const CAMERA_TILT_Y = 0.866;
const Z_TO_SCREEN = 0.78;
const Z_LIFT = 14;
// MUST match Player.ts BAKE_DISPLAY_SCALE (player tank is rendered at this scale in bake mode).
const BAKE_DISPLAY_SCALE = 1.25;

interface BakedBullet {
    normal: PIXI.Texture;
    super: PIXI.Texture;
}

class BulletSpriteBakerImpl {
    private cache = new Map<string, BakedBullet>();
    private baking = new Map<string, Promise<BakedBullet>>();

    /** True if this brawler's normal+super bullet textures are baked and cached. */
    isBaked(brawlerId: string): boolean {
        return this.cache.has(brawlerId);
    }

    /**
     * Bake (or return cached) the normal + super bullet textures for one brawler.
     * Idempotent and concurrency-safe. Call under the loading screen (async).
     */
    async bakeBrawler(app: PIXI.Application, brawlerId: string): Promise<BakedBullet> {
        const cached = this.cache.get(brawlerId);
        if (cached) return cached;

        const inFlight = this.baking.get(brawlerId);
        if (inFlight) return inFlight;

        const promise = this.doBake(app, brawlerId);
        this.baking.set(brawlerId, promise);
        try {
            const result = await promise;
            this.cache.set(brawlerId, result);
            return result;
        } finally {
            this.baking.delete(brawlerId);
        }
    }

    private async doBake(app: PIXI.Application, brawlerId: string): Promise<BakedBullet> {
        const cfg = CFG[brawlerId];
        if (!cfg) {
            throw new Error(`[BulletSpriteBaker] unknown brawler id: ${brawlerId}`);
        }

        // DYNAMIC import — FIX#1 prototype patch installs HERE only (rollback-safe). fire.ts pulls
        // render2d's drawBullet and exposes drawBulletWithFx (aura + bullet, exactly the lab pipeline).
        const fire = await import('../experimental/tank25d/fire');

        const resolution = app.renderer.resolution || 1;

        const normal = this.bakeOne(fire, cfg.type, cfg.size, false, null, 1, cfg.tex, resolution);
        const superTex = this.bakeOne(fire, cfg.superType, cfg.superSize, true, cfg.tint, cfg.auraScale, cfg.superTex, resolution);

        return { normal, super: superTex };
    }

    private bakeOne(
        fire: typeof import('../experimental/tank25d/fire'),
        type: string,
        size: number,
        isSuper: boolean,
        tint: string | null,
        auraScale: number,
        texSize: number,
        resolution: number,
    ): PIXI.Texture {
        const canvas = document.createElement('canvas');
        canvas.width = texSize * resolution;
        canvas.height = texSize * resolution;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('[BulletSpriteBaker] failed to get 2D context for bake canvas');
        }

        // Draw in CSS-px space while the bitmap stays retina-sharp (mirrors TankSpriteBaker).
        ctx.scale(resolution, resolution);
        (ctx as unknown as { _lwBase: number })._lwBase = resolution;

        const c = texSize / 2;

        // Unit velocity (vx=1, vy=0): lab trail collapses to ~0px (game keeps TRAIL_LEN_MAP trail),
        // head/comet/aura baked pointing RIGHT. Direction/spin applied via sprite.rotation in-game.
        const b = {
            type,
            size,
            isSuper,
            vx: 1,
            vy: 0,
            x: c,
            y: c,
            phaseOffset: 0,
            superTint: isSuper ? tint : null,
            auraScale,
            life: 1,
            maxLife: 1,
        };

        // drawBulletWithFx: if b.superTint -> drawAura (additive 'lighter') then drawBullet; else
        // drawBullet only. Exactly the lab render order. 'behavior' is undefined so the wave branch is skipped.
        fire.drawBulletWithFx(ctx as unknown as CanvasRenderingContext2D, b);

        // resolution carried so the sprite measures texSize in CSS px (sprite scaled by BAKE_DISPLAY_SCALE in Bullet.ts).
        return PIXI.Texture.from(canvas, { resolution } as PIXI.IBaseTextureOptions);
    }

    /** Baked texture for (brawler, isSuper). Throws if not baked. */
    getTexture(brawlerId: string, isSuper: boolean): PIXI.Texture {
        const baked = this.requireBaked(brawlerId);
        return isSuper ? baked.super : baked.normal;
    }

    /** Rotation behavior for this brawler's bullet sprite. */
    getSpin(brawlerId: string): { mode: 'dir' | 'spin' | 'none'; rate: number } {
        const cfg = CFG[brawlerId];
        return cfg ? { mode: cfg.spin, rate: cfg.spinRate } : { mode: 'none', rate: 0 };
    }

    /** Per-brawler super tint as a PIXI color number (for super trail + sparkle in bake mode). */
    getSuperTintNum(brawlerId: string): number {
        const cfg = CFG[brawlerId];
        if (!cfg) return 0xc850ff;
        return parseInt(cfg.tint.slice(1), 16);
    }

    /**
     * Muzzle tip in WORLD space for the 2.5D player (per-brawler muzzleDist + camera tilt + Z lift,
     * scaled by BAKE_DISPLAY_SCALE). Mirrors render2d getMuzzlePos at recoil=0, single barrel (pe=0).
     */
    getMuzzlePos(brawlerId: string, px: number, py: number, angle: number): { x: number; y: number } {
        const cfg = CFG[brawlerId];
        const md = cfg ? cfg.muzzleDist : 50;
        const offX = md * Math.cos(angle);
        const offY = md * Math.sin(angle) * CAMERA_TILT_Y - Z_LIFT * Z_TO_SCREEN;
        return { x: px + offX * BAKE_DISPLAY_SCALE, y: py + offY * BAKE_DISPLAY_SCALE };
    }

    /** Free both textures for a brawler (optional teardown). */
    dispose(brawlerId: string): void {
        const baked = this.cache.get(brawlerId);
        if (!baked) return;
        baked.normal.destroy(true);
        baked.super.destroy(true);
        this.cache.delete(brawlerId);
    }

    private requireBaked(brawlerId: string): BakedBullet {
        const baked = this.cache.get(brawlerId);
        if (!baked) {
            throw new Error(
                `[BulletSpriteBaker] brawler not baked: ${brawlerId} — call bakeBrawler(app, id) under loading screen first`,
            );
        }
        return baked;
    }
}

/** Singleton — use this everywhere. */
export const BulletSpriteBaker = new BulletSpriteBakerImpl();