/**
 * EnemySpriteBaker — FAZA P4 (Sprite Baker, wrogowie 2.5D)
 *
 * Per-feature isolated cache (Constitution §7) for 2.5D ENEMY tank textures baked from the
 * tank25d lab renderer (render2d.ts GRUNT / REGULAR_BOSS / MEGA_BOSS). Domyka look 2.5D na
 * calym polu bitwy: gracz juz 2.5D (P1) + juice (P3), tu dochodza wrogowie — bez placenia
 * drawTank's per-frame Canvas2D cost (drawTank runs ONCE per angle under the loading screen).
 *
 * DLACZEGO COMBINED (jedna warstwa), a nie split hull+turret jak gracz:
 *   Wrogowie celuja calym czolgiem — hull.rotation === turret.rotation === angleToTarget ZAWSZE
 *   (Enemy.ts). Wiec nie potrzeba niezaleznych warstw hull/turret (te sa dla gracza, ktory ma
 *   osobny hullAngle/turretAngle). Bake pelnego drawTank per angle => 36 tekstur/archetyp (nie 72),
 *   POLOWA pamieci i 1 sprite/wroga zamiast 2 (fill-rate WIN przy hordzie: mniej niz obecny flat 2-sprite).
 *   Trade: ginie niezalezny wobble wiezy podczas stealth gracza — pomijalny detal (caly czolg dalej
 *   sie kreci confusedRotation). Freeze/hit-flash obsluzone w Enemy.ts (tint + additive overlay).
 *
 * ZERO JUICE (decyzja Mariusz P4): recoil=0, pitch=0, isIdle=false — wrogowie maja wygladac jak
 *   nasze czolgi + strzelac lepszymi shotami, bez recoilu. Bake deterministyczny (performance.now()
 *   w drawTank odpala sie TYLKO przy T.rumble && isIdle, ktore tu sa off).
 *
 * ROZMIAR ON-SCREEN (kotwica = gracz Twardy 2.5D, wg zyczenia Mariusz):
 *   grunt ~= Twardy, boss lekko wiekszy, mega znacznie wiekszy. render2d wpieka bryle (hullW 78/90/100),
 *   a ENEMY_BAKE_DISPLAY_SCALE dostraja do celu: grunt 1.01x, boss 1.25x, mega 1.95x Twardego.
 *   Skale STARTOWE — eyeball-tune (lekcja "proporcje matematyczne != wizualne").
 *
 * MOBILE: bake w resolution=1 (NIE app.renderer DPR jak gracz) — wrogow jest duzo i sa mali (zoom 0.7),
 *   res=1 tnie pamiec x4 (15.7 MB zamiast 62.7 MB @DPR2). Swiadomy trade jakosci (jak "frozen crackle").
 *
 * ISOLATION / ROLLBACK (mirrors TankSpriteBaker):
 *   render2d.ts imported DYNAMICALLY inside doBake() — FIX#1 prototype patch installs ONLY when a bake
 *   runs (BAKER_ENABLED on + bake requested). Flag off => never imported => game renders bit-for-bit.
 *
 * Usage (main.ts + Enemy.ts, behind BAKER_ENABLED):
 *   await EnemySpriteBaker.bakeAll(app);                        // under loading screen
 *   hull.texture = EnemySpriteBaker.getTexture('grunt', angleToTarget);
 *   hull.rotation = 0;  // rotation is BAKED IN — do NOT also rotate the sprite
 *   container.scale.set(EnemySpriteBaker.getDisplayScale('grunt'));
 */
import * as PIXI from 'pixi.js';

// ── Enemy archetypes baked (render2d has exactly these 3 configs) ────────────
export type EnemyArchetype = 'grunt' | 'boss' | 'mega';

// ── Bake parameters (single source of truth; tune here) ──────────────────────
/** Number of baked angles. 36 => 10deg quantization. Lever mobile: 36->24 if horde stutters. */
export const ENEMY_BAKE_ANGLES = 36;

/**
 * Square texture size in CSS px, PER archetype. Model geometryczny (AABB = max radius z centrum
 * przez wszystkie katy, dominanta = drop shadow) x render2d size, + ~20-29% marginesu nad REALNA
 * zawartoscia (model odtwarza zmierzone P1 112px dla size-1.0). Zero clipping.
 *   grunt (s1.00, hull 78x44): real ~112 -> 144
 *   boss  (s1.35, hull 90x54): real ~172 -> 208
 *   mega  (s1.36, hull 100x58): real ~188 -> 224
 * DEV-warn ponizej skanuje alpha na kacie 45deg i ostrzega w F12 gdyby realny render przekroczyl tex.
 */
export const ENEMY_TEX_SIZE: Record<EnemyArchetype, number> = {
    grunt: 144,
    boss: 208,
    mega: 224,
};

/**
 * Per-archetype display scale — mnoznik sprite'a on-screen. Kotwica: gracz Twardy 2.5D (100x55px hull,
 * BAKE_DISPLAY_SCALE 1.25). Cel: grunt=1.0x, boss=1.2x, mega=1.9x liniowo vs Twardy. render2d juz wpieka
 * wieksza bryle bossowi/mega, wiec te liczby tylko dostrajaja. STARTOWE — tune okiem po 1. playtescie.
 */
export const ENEMY_BAKE_DISPLAY_SCALE: Record<EnemyArchetype, number> = {
    grunt: 1.14,  // -10% wg playtestu (bylo 1.27)
    boss: 0.95,
    mega: 1.36,
};

/** Map archetype -> render2d exported config name. */
const R2D_CONFIG_KEY: Record<EnemyArchetype, 'GRUNT' | 'REGULAR_BOSS' | 'MEGA_BOSS'> = {
    grunt: 'GRUNT',
    boss: 'REGULAR_BOSS',
    mega: 'MEGA_BOSS',
};

const ANGLE_STEP = (Math.PI * 2) / ENEMY_BAKE_ANGLES;

/** Minimal shape render2d.drawTank reads off the tank object. */
interface BakeTank {
    brawler: unknown;
    x: number;
    y: number;
    hullAngle: number;
    turretAngle: number;
    recoil: number;
    pitch: number;
    treadShift: number;
    hitFlashTimer: number;
    isIdle: boolean;
}

interface BakedEnemy {
    tex: PIXI.Texture[]; // length ENEMY_BAKE_ANGLES, indexed by angle quantum (hull==turret angle)
}

class EnemySpriteBakerImpl {
    // Isolated cache, keyed by archetype. Separate from player caches (per-feature isolation).
    private cache = new Map<EnemyArchetype, BakedEnemy>();
    // De-dupe concurrent bake requests for the same archetype.
    private baking = new Map<EnemyArchetype, Promise<BakedEnemy>>();

    /** True if this archetype's textures are baked and cached. */
    isBaked(arch: EnemyArchetype): boolean {
        return this.cache.has(arch);
    }

    /**
     * Bake all 3 archetypes (grunt/boss/mega). Idempotent & concurrency-safe.
     * Call ONCE under the loading screen, behind BAKER_ENABLED. Adds ~108 drawTank calls to load.
     */
    async bakeAll(app: PIXI.Application): Promise<void> {
        await Promise.all([
            this.bakeArchetype(app, 'grunt'),
            this.bakeArchetype(app, 'boss'),
            this.bakeArchetype(app, 'mega'),
        ]);
    }

    /** Bake (or return cached) the ENEMY_BAKE_ANGLES textures for one archetype. */
    async bakeArchetype(app: PIXI.Application, arch: EnemyArchetype): Promise<BakedEnemy> {
        const cached = this.cache.get(arch);
        if (cached) return cached;

        const inFlight = this.baking.get(arch);
        if (inFlight) return inFlight;

        const promise = this.doBake(app, arch);
        this.baking.set(arch, promise);
        try {
            const result = await promise;
            this.cache.set(arch, result);
            return result;
        } finally {
            this.baking.delete(arch);
        }
    }

    private async doBake(app: PIXI.Application, arch: EnemyArchetype): Promise<BakedEnemy> {
        // DYNAMIC import — FIX#1 prototype patch installs HERE, not at game boot (rollback-safe).
        const r2d = await import('../experimental/tank25d/render2d');

        const cfg = (r2d as Record<string, unknown>)[R2D_CONFIG_KEY[arch]];
        if (!cfg) {
            throw new Error(`[EnemySpriteBaker] missing render2d config for archetype: ${arch}`);
        }
        // Spread for parity with TankSpriteBaker (flag already null on enemy configs). .colors preserved.
        const brawler = { ...(cfg as object) };

        // MOBILE: force resolution=1 for enemies (many small entities) — NOT app.renderer DPR.
        const resolution = 1;
        void app; // app kept in signature for symmetry with player bakers / future use.

        const texSize = ENEMY_TEX_SIZE[arch];
        const tex: PIXI.Texture[] = new Array(ENEMY_BAKE_ANGLES);

        for (let i = 0; i < ENEMY_BAKE_ANGLES; i++) {
            const angle = i * ANGLE_STEP;
            tex[i] = this.bakeAngle(r2d, brawler, angle, texSize, resolution);
        }

        this.devAssertBounds(arch, tex);
        return { tex };
    }

    private bakeAngle(
        r2d: typeof import('../experimental/tank25d/render2d'),
        brawler: unknown,
        angle: number,
        texSize: number,
        resolution: number,
    ): PIXI.Texture {
        const canvas = document.createElement('canvas');
        canvas.width = texSize * resolution;
        canvas.height = texSize * resolution;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('[EnemySpriteBaker] failed to get 2D context for bake canvas');
        }

        // Draw in CSS-px space while the bitmap stays sharp (mirrors TankSpriteBaker).
        ctx.scale(resolution, resolution);
        (ctx as unknown as { _lwBase: number })._lwBase = resolution;

        const c = texSize / 2;

        // COMBINED bake: hullAngle === turretAngle === angle (enemy aims whole tank).
        // ZERO JUICE: recoil/pitch/treadShift/hitFlash = 0, isIdle=false => deterministic, no recoil baked.
        const tank: BakeTank = {
            brawler,
            x: c,
            y: c,
            hullAngle: angle,
            turretAngle: angle,
            recoil: 0,
            pitch: 0,
            treadShift: 0,
            hitFlashTimer: 0,
            isIdle: false,
        };

        r2d.drawTank(ctx as unknown as CanvasRenderingContext2D, tank, false);

        // resolution carried so the sprite measures texSize in CSS px (scaled by getDisplayScale in Enemy.ts).
        return PIXI.Texture.from(canvas, { resolution } as PIXI.IBaseTextureOptions);
    }

    /** Nearest baked texture for a continuous angle (radians). */
    getTexture(arch: EnemyArchetype, angle: number): PIXI.Texture {
        const baked = this.requireBaked(arch);
        return baked.tex[this.angleToIndex(angle)];
    }

    /** On-screen display scale for this archetype (container.scale in Enemy.ts). */
    getDisplayScale(arch: EnemyArchetype): number {
        return ENEMY_BAKE_DISPLAY_SCALE[arch];
    }

    /** Square texture size in CSS px for this archetype (for sprite anchor/offset math). */
    getTexSize(arch: EnemyArchetype): number {
        return ENEMY_TEX_SIZE[arch];
    }

    /** Free all textures for an archetype (optional teardown). */
    dispose(arch: EnemyArchetype): void {
        const baked = this.cache.get(arch);
        if (!baked) return;
        baked.tex.forEach((t) => t.destroy(true));
        this.cache.delete(arch);
    }

    /** Free every baked archetype. */
    disposeAll(): void {
        for (const arch of this.cache.keys()) this.dispose(arch);
    }

    private requireBaked(arch: EnemyArchetype): BakedEnemy {
        const baked = this.cache.get(arch);
        if (!baked) {
            throw new Error(
                `[EnemySpriteBaker] archetype not baked: ${arch} — call bakeAll(app) under loading screen first`,
            );
        }
        return baked;
    }

    /** Quantize a continuous angle (radians) to the nearest of ENEMY_BAKE_ANGLES indices. */
    private angleToIndex(angle: number): number {
        const twoPi = Math.PI * 2;
        let a = angle % twoPi;
        if (a < 0) a += twoPi;
        return Math.round(a / ANGLE_STEP) % ENEMY_BAKE_ANGLES;
    }

    /**
     * DEV safety: scan the 45deg texture (worst-case diagonal extent) for alpha touching the tex edge.
     * Converts the geometric tex-size estimate into a runtime-verified guard on the FIRST F12 test —
     * if any archetype ever clips, it warns loudly with the exact archetype + measured bounds.
     * Cheap: one canvas scan per archetype under the loading screen. No-op if it can't read pixels.
     */
    private devAssertBounds(arch: EnemyArchetype, tex: PIXI.Texture[]): void {
        try {
            const idx = Math.round(ENEMY_BAKE_ANGLES / 8) % ENEMY_BAKE_ANGLES; // ~45deg
            const base = tex[idx].baseTexture.resource as unknown as { source?: HTMLCanvasElement };
            const canvas = base?.source;
            if (!canvas || typeof canvas.getContext !== 'function') return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const w = canvas.width;
            const h = canvas.height;
            const data = ctx.getImageData(0, 0, w, h).data;
            let minX = w;
            let minY = h;
            let maxX = -1;
            let maxY = -1;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (data[(y * w + x) * 4 + 3] > 8) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (maxX < 0) return; // empty (shouldn't happen)
            const clipped = minX <= 1 || minY <= 1 || maxX >= w - 2 || maxY >= h - 2;
            if (clipped) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[EnemySpriteBaker] CLIP RISK arch=${arch}: content bounds ${minX},${minY}..${maxX},${maxY} ` +
                        `in ${w}x${h} tex — bump ENEMY_TEX_SIZE.${arch}.`,
                );
            }
        } catch {
            // getImageData can throw (tainted canvas / headless) — non-fatal, skip the check.
        }
    }
}

/** Singleton — use this everywhere. */
export const EnemySpriteBaker = new EnemySpriteBakerImpl();