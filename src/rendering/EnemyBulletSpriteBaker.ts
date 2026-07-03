/**
 * EnemyBulletSpriteBaker — FAZA P4 (Sprite Baker, pociski wrogow)
 *
 * Per-feature isolated cache (Constitution §7) for 2.5D ENEMY bullet textures baked from the
 * tank25d lab renderer (render2d.ts drawBullet: enemy_basic / boss_shell / mega_shell). Replaces
 * the flat PIXI.Graphics circle enemy bullets with the lab look ("lepsze shoty jak w labie") —
 * WITHOUT per-frame Canvas2D cost: drawBullet runs ONCE per type under the loading screen, baked
 * into lightweight PIXI.Textures; in-game each enemy bullet is a single PIXI.Sprite.
 *
 * DLACZEGO drawBullet WPROST (nie fire.ts drawBulletWithFx jak gracz):
 *   Wrogowie nie maja super/aury — enemy_basic/boss_shell/mega_shell to czyste typy drawBullet.
 *   Zaden nie uzywa performance.now() (tylko super_mega_shell go uzywa, a tego nie bakujemy) =>
 *   bake deterministyczny.
 *
 * BAKED pointing RIGHT (vx=1, vy=0):
 *   - enemy_basic: kula z glow+core, rotacyjnie symetryczna => spin 'none'.
 *   - boss_shell / mega_shell: elipsa zorientowana wzdluz predkosci (drawBullet robi rotate(atan2(vy,vx)))
 *     => baked poziomo, a EnemyBullet.ts ustawia sprite.rotation = atan2(vy,vx) raz (spin 'dir').
 *
 * MOBILE: resolution=1 (spojnie z EnemySpriteBaker). 3 male tekstury => pamiec pomijalna (~0.1 MB).
 *
 * ISOLATION / ROLLBACK (mirrors TankSpriteBaker/BulletSpriteBaker):
 *   render2d.ts imported DYNAMICALLY inside doBake() — FIX#1 patch installs ONLY when a bake runs.
 *   Flag off => never imported => game renders bit-for-bit (flat blue pursuit bullet etc. untouched).
 *
 * Usage (EnemyBullet.ts + main.ts, behind BAKER_ENABLED):
 *   await EnemyBulletSpriteBaker.bakeAll(app);                       // under loading screen
 *   sprite.texture = EnemyBulletSpriteBaker.getTexture('boss_shell');
 *   const { mode } = EnemyBulletSpriteBaker.getSpin('boss_shell');   // 'dir' | 'none'
 */
import * as PIXI from 'pixi.js';

// ── Enemy bullet types baked (render2d drawBullet cases) ─────────────────────
export type EnemyBulletType = 'enemy_basic' | 'boss_shell' | 'mega_shell';

// ── Bake config (single source of truth; tune here) ──────────────────────────
// size 1:1 z render2d GRUNT/REGULAR_BOSS/MEGA_BOSS bullet.size (6 / 7 / 8).
// tex: 2R + margines, safe nad realnym extentem (glow arc size*1.5 / ellipse size*1.5). Male => memory trywialne.
// spin: 'dir' = sprite.rotation = atan2(vy,vx) set once (elipsa zorientowana); 'none' = brak rotacji (kula).
interface EnemyBulletBakeCfg {
    type: EnemyBulletType;
    size: number;
    tex: number;
    spin: 'dir' | 'none';
}

const CFG: Record<EnemyBulletType, EnemyBulletBakeCfg> = {
    enemy_basic: { type: 'enemy_basic', size: 6, tex: 40, spin: 'none' },
    boss_shell: { type: 'boss_shell', size: 7, tex: 44, spin: 'dir' },
    mega_shell: { type: 'mega_shell', size: 8, tex: 72, spin: 'dir' }, // tex 72 (bylo 48): premium glow ma miejsce
};

/**
 * On-screen display scale for enemy bullet sprites (applied in EnemyBullet.ts). Konserwatywnie 1.0 —
 * render2d core ~= obecny flat radius 5, wiec wroga nie robimy nagle wiekszym (czytelnosc/balans; hitbox
 * i tak osobny w main.ts). Tune okiem jesli maja byc bardziej "labowe".
 */
export const ENEMY_BULLET_DISPLAY_SCALE = 1.0;

interface BakedEnemyBullet {
    tex: PIXI.Texture;
}

class EnemyBulletSpriteBakerImpl {
    private cache = new Map<EnemyBulletType, BakedEnemyBullet>();
    private baking = new Map<EnemyBulletType, Promise<BakedEnemyBullet>>();

    /** True if this bullet type's texture is baked and cached. */
    isBaked(type: EnemyBulletType): boolean {
        return this.cache.has(type);
    }

    /**
     * Bake all 3 enemy bullet types. Idempotent & concurrency-safe.
     * Call ONCE under the loading screen, behind BAKER_ENABLED.
     */
    async bakeAll(app: PIXI.Application): Promise<void> {
        await Promise.all([
            this.bakeType(app, 'enemy_basic'),
            this.bakeType(app, 'boss_shell'),
            this.bakeType(app, 'mega_shell'),
        ]);
    }

    /** Bake (or return cached) the texture for one enemy bullet type. */
    async bakeType(app: PIXI.Application, type: EnemyBulletType): Promise<BakedEnemyBullet> {
        const cached = this.cache.get(type);
        if (cached) return cached;

        const inFlight = this.baking.get(type);
        if (inFlight) return inFlight;

        const promise = this.doBake(app, type);
        this.baking.set(type, promise);
        try {
            const result = await promise;
            this.cache.set(type, result);
            return result;
        } finally {
            this.baking.delete(type);
        }
    }

    private async doBake(app: PIXI.Application, type: EnemyBulletType): Promise<BakedEnemyBullet> {
        const cfg = CFG[type];
        if (!cfg) {
            throw new Error(`[EnemyBulletSpriteBaker] unknown enemy bullet type: ${type}`);
        }

        // DYNAMIC import — FIX#1 patch installs HERE only (rollback-safe). drawBullet is exported directly.
        const r2d = await import('../experimental/tank25d/render2d');

        // MOBILE: force resolution=1 (spojnie z EnemySpriteBaker).
        const resolution = 1;
        void app; // kept in signature for symmetry with other bakers / future use.

        const tex = this.bakeOne(r2d, cfg, resolution);
        return { tex };
    }

    private bakeOne(
        r2d: typeof import('../experimental/tank25d/render2d'),
        cfg: EnemyBulletBakeCfg,
        resolution: number,
    ): PIXI.Texture {
        const canvas = document.createElement('canvas');
        canvas.width = cfg.tex * resolution;
        canvas.height = cfg.tex * resolution;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('[EnemyBulletSpriteBaker] failed to get 2D context for bake canvas');
        }

        ctx.scale(resolution, resolution);
        (ctx as unknown as { _lwBase: number })._lwBase = resolution;

        const c = cfg.tex / 2;

        // Unit velocity (vx=1, vy=0): oriented shells baked pointing RIGHT; direction applied via
        // sprite.rotation in-game (spin 'dir'). enemy_basic ignores vx/vy (rotationally symmetric).
        const b = {
            type: cfg.type,
            size: cfg.size,
            vx: 1,
            vy: 0,
            x: c,
            y: c,
        };

        if (cfg.type === 'mega_shell') {
            // PREMIUM bespoke: magnetyczno-zolta bomba (multi-tone core + glow halo + field rings).
            // NIE przez render2d.drawBullet — swiadomy upgrade PONAD lab (mega finalowy shot ma byc AAA).
            // Baked pointing RIGHT; spin 'dir' orientuje w locie. Trade: lab.html pokaze stary ellipse
            // (dev-only); jesli chcesz parytet lab<->gra, portujemy te funkcje do render2d mega_shell.
            this.drawMegaBombPremium(ctx as unknown as CanvasRenderingContext2D, c, c, cfg.size);
        } else {
            r2d.drawBullet(ctx as unknown as CanvasRenderingContext2D, b);
        }

        return PIXI.Texture.from(canvas, { resolution } as PIXI.IBaseTextureOptions);
    }

    /**
     * PREMIUM mega_shell — "mala magnetyczno-zolta bomba" (Mariusz P4 polish). Pure Canvas2D, baked
     * pointing RIGHT. Warstwy: (1) magnetyczna poswiata (radial gold halo), (2) 2 pierscienie pola,
     * (3) multi-tone rdzen (white-hot -> zolto -> bursztyn, offset highlight = 3D), (4) hot-spot,
     * (5) wiodace jadro (cue kierunku). Statyczne (bake) — zero performance.now (deterministyczne).
     */
    private drawMegaBombPremium(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
        ctx.save();
        ctx.translate(x, y);

        // 1) magnetyczna poswiata (halo)
        const gR = size * 3.4;
        const halo = ctx.createRadialGradient(0, 0, size * 0.5, 0, 0, gR);
        halo.addColorStop(0, 'rgba(255,225,90,0.55)');
        halo.addColorStop(0.4, 'rgba(255,200,40,0.28)');
        halo.addColorStop(1, 'rgba(255,180,20,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(0, 0, gR, 0, Math.PI * 2); ctx.fill();

        // 2) pierscienie pola magnetycznego
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(255,236,120,0.5)';
        ctx.beginPath(); ctx.ellipse(0, 0, size * 2.0, size * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,214,60,0.32)';
        ctx.beginPath(); ctx.ellipse(0, 0, size * 2.6, size * 1.05, 0, 0, Math.PI * 2); ctx.stroke();

        // 3) multi-tone rdzen
        const core = ctx.createRadialGradient(-size * 0.3, -size * 0.3, size * 0.15, 0, 0, size * 1.15);
        core.addColorStop(0, '#ffffff');
        core.addColorStop(0.22, '#fff59a');
        core.addColorStop(0.5, '#ffe11f');
        core.addColorStop(0.78, '#f1a90f');
        core.addColorStop(1, '#b26a06');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(0, 0, size * 1.12, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(120,70,6,0.9)';
        ctx.beginPath(); ctx.arc(0, 0, size * 1.12, 0, Math.PI * 2); ctx.stroke();

        // 4) hot-spot (molten highlight)
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.ellipse(-size * 0.35, -size * 0.4, size * 0.34, size * 0.24, -0.5, 0, Math.PI * 2); ctx.fill();

        // 5) wiodace jadro (cue kierunku)
        ctx.fillStyle = 'rgba(255,180,40,0.85)';
        ctx.beginPath(); ctx.arc(size * 0.55, 0, size * 0.28, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }

    /** Baked texture for an enemy bullet type. Throws if not baked. */
    getTexture(type: EnemyBulletType): PIXI.Texture {
        const baked = this.cache.get(type);
        if (!baked) {
            throw new Error(
                `[EnemyBulletSpriteBaker] type not baked: ${type} — call bakeAll(app) under loading screen first`,
            );
        }
        return baked.tex;
    }

    /** Rotation behavior for this bullet type's sprite. */
    getSpin(type: EnemyBulletType): { mode: 'dir' | 'none' } {
        const cfg = CFG[type];
        return cfg ? { mode: cfg.spin } : { mode: 'none' };
    }

    /** Free the texture for one type (optional teardown). */
    dispose(type: EnemyBulletType): void {
        const baked = this.cache.get(type);
        if (!baked) return;
        baked.tex.destroy(true);
        this.cache.delete(type);
    }

    /** Free every baked bullet type. */
    disposeAll(): void {
        for (const type of this.cache.keys()) this.dispose(type);
    }
}

/** Singleton — use this everywhere. */
export const EnemyBulletSpriteBaker = new EnemyBulletSpriteBakerImpl();