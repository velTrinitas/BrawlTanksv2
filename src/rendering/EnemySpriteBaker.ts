/**
 * EnemySpriteBaker — FAZA P4 + ATLAS (mobile perf)
 *
 * Per-feature isolated cache (Constitution §7) for 2.5D ENEMY tank textures baked from the
 * tank25d lab renderer (render2d.ts GRUNT / REGULAR_BOSS / MEGA_BOSS).
 *
 * ── ATLAS (mobile batch-break fix) ────────────────────────────────────────────
 * Wszystkie ENEMY_BAKE_ANGLES katy JEDNEGO archetypu leza w JEDNEJ baseTexture (siatka COLS x ROWS),
 * a getTexture zwraca ramke (PIXI.Texture z frame) tej wspolnej baseTexture. Efekt: cala horda danego
 * archetypu (dowolne katy) batchuje sie w JEDEN draw call zamiast do 36 (kazdy kat = osobna baseTexture
 * wczesniej = batch break). PIKSELE IDENTYCZNE (ten sam drawTank per kat), API bez zmian => Enemy.ts
 * nietkniety. Kazda komorka jest CLIPowana do texSize (bit-for-bit jak stara osobna tekstura, zero
 * bleedu do sasiada) + ATLAS_GUTTER transparentnego marginesu chroni przed bilinear seam.
 *
 * DLACZEGO COMBINED (jedna warstwa), a nie split hull+turret jak gracz:
 *   Wrogowie celuja calym czolgiem — hull.rotation === turret.rotation === angleToTarget ZAWSZE.
 *   Bake pelnego drawTank per angle => ENEMY_BAKE_ANGLES tekstur/archetyp i 1 sprite/wroga (fill-rate WIN).
 *
 * MOBILE: bake w resolution=1 (NIE app.renderer DPR) — wrogow duzo i sa mali (zoom 0.7).
 *
 * ISOLATION / ROLLBACK: render2d.ts imported DYNAMICALLY inside doBake() — FIX#1 patch installs ONLY
 *   when a bake runs. Flag off => never imported => game renders bit-for-bit.
 */
import * as PIXI from 'pixi.js';

export type EnemyArchetype = 'grunt' | 'boss' | 'mega';

/** Number of baked angles. 36 => 10deg quantization. Lever mobile: 36->24 if horde stutters. */
export const ENEMY_BAKE_ANGLES = 36;

/**
 * Square texture size in CSS px, PER archetype (rozmiar KOMORKI atlasu).
 *   grunt (s1.00, hull 78x44): real ~112 -> 144
 *   boss  (s1.35, hull 90x54): real ~172 -> 208
 *   mega  (s1.36, hull 100x58): model ~188 NIEDOSZACOWAL, real >=224 @50deg (twin-barrel) -> 288
 * DEV-warn ponizej skanuje alpha na kacie ~45deg (w obrebie komorki) i ostrzega gdyby content clipowal.
 */
export const ENEMY_TEX_SIZE: Record<EnemyArchetype, number> = {
    grunt: 144,
    boss: 208,
    mega: 288,
};

/** Per-archetype display scale — mnoznik sprite'a on-screen (kotwica: gracz Twardy 2.5D). */
export const ENEMY_BAKE_DISPLAY_SCALE: Record<EnemyArchetype, number> = {
    grunt: 1.14,
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

// ── Atlas layout ─────────────────────────────────────────────────────────────
/** Kolumny siatki atlasu. 6 => 36 katow w 6x6. Max wymiar canvas = COLS*(texSize+GUTTER):
 *  mega 6*(288+2)=1740 < 2048 (safe nawet na starych mobile GPU MAX_TEXTURE_SIZE=2048). */
const ATLAS_COLS = 6;
/** Transparentny margines miedzy komorkami (px) — chroni przed bilinear bleed na krawedzi ramki. */
const ATLAS_GUTTER = 2;

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
    tex: PIXI.Texture[];      // length ENEMY_BAKE_ANGLES, ramki jednej wspolnej baseTexture
    base: PIXI.BaseTexture;   // wspolna baseTexture atlasu (dispose osobno)
}

class EnemySpriteBakerImpl {
    private cache = new Map<EnemyArchetype, BakedEnemy>();
    private baking = new Map<EnemyArchetype, Promise<BakedEnemy>>();

    isBaked(arch: EnemyArchetype): boolean {
        return this.cache.has(arch);
    }

    async bakeAll(app: PIXI.Application): Promise<void> {
        await Promise.all([
            this.bakeArchetype(app, 'grunt'),
            this.bakeArchetype(app, 'boss'),
            this.bakeArchetype(app, 'mega'),
        ]);
    }

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
        const r2d = await import('../experimental/tank25d/render2d');

        const cfg = (r2d as Record<string, unknown>)[R2D_CONFIG_KEY[arch]];
        if (!cfg) {
            throw new Error(`[EnemySpriteBaker] missing render2d config for archetype: ${arch}`);
        }
        const brawler = { ...(cfg as object) };

        // MOBILE: force resolution=1 for enemies (many small entities) — NOT app.renderer DPR.
        const resolution = 1;
        void app;

        const texSize = ENEMY_TEX_SIZE[arch];
        const cols = ATLAS_COLS;
        const rows = Math.ceil(ENEMY_BAKE_ANGLES / cols);
        const pitch = texSize + ATLAS_GUTTER;
        const inset = ATLAS_GUTTER / 2;

        // Jeden wielki canvas = cala siatka katow (res=1).
        const canvas = document.createElement('canvas');
        canvas.width = cols * pitch * resolution;
        canvas.height = rows * pitch * resolution;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('[EnemySpriteBaker] failed to get 2D context for bake canvas');
        }
        ctx.scale(resolution, resolution);
        (ctx as unknown as { _lwBase: number })._lwBase = resolution;

        for (let i = 0; i < ENEMY_BAKE_ANGLES; i++) {
            const angle = i * ANGLE_STEP;
            const col = i % cols;
            const row = (i / cols) | 0;
            const cellX = col * pitch + inset;
            const cellY = row * pitch + inset;

            // CLIP do komorki => bit-for-bit jak stara osobna tekstura (zero bleedu do sasiada).
            ctx.save();
            ctx.beginPath();
            ctx.rect(cellX, cellY, texSize, texSize);
            ctx.clip();

            const tank: BakeTank = {
                brawler,
                x: cellX + texSize / 2,
                y: cellY + texSize / 2,
                hullAngle: angle,
                turretAngle: angle,
                recoil: 0,
                pitch: 0,
                treadShift: 0,
                hitFlashTimer: 0,
                isIdle: false,
            };
            r2d.drawTank(ctx as unknown as CanvasRenderingContext2D, tank, false);
            ctx.restore();
        }

        const base = new PIXI.BaseTexture(canvas, { resolution } as PIXI.IBaseTextureOptions);

        const tex: PIXI.Texture[] = new Array(ENEMY_BAKE_ANGLES);
        for (let i = 0; i < ENEMY_BAKE_ANGLES; i++) {
            const col = i % cols;
            const row = (i / cols) | 0;
            const fx = col * pitch + inset;
            const fy = row * pitch + inset;
            tex[i] = new PIXI.Texture(base, new PIXI.Rectangle(fx, fy, texSize, texSize));
        }

        this.devAssertBounds(arch, canvas, texSize, cols, pitch, inset);
        return { tex, base };
    }

    getTexture(arch: EnemyArchetype, angle: number): PIXI.Texture {
        const baked = this.requireBaked(arch);
        return baked.tex[this.angleToIndex(angle)];
    }

    getDisplayScale(arch: EnemyArchetype): number {
        return ENEMY_BAKE_DISPLAY_SCALE[arch];
    }

    getTexSize(arch: EnemyArchetype): number {
        return ENEMY_TEX_SIZE[arch];
    }

    dispose(arch: EnemyArchetype): void {
        const baked = this.cache.get(arch);
        if (!baked) return;
        // Ramki dziela jedna baseTexture — niszcz ramki BEZ bazy, potem baze raz.
        baked.tex.forEach((t) => t.destroy(false));
        baked.base.destroy();
        this.cache.delete(arch);
    }

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

    private angleToIndex(angle: number): number {
        const twoPi = Math.PI * 2;
        let a = angle % twoPi;
        if (a < 0) a += twoPi;
        return Math.round(a / ANGLE_STEP) % ENEMY_BAKE_ANGLES;
    }

    /**
     * DEV safety: skan komorki ~45deg (worst-case diagonal) na alpha dotykajaca krawedzi KOMORKI.
     * Atlas-aware: liczy bounds w obrebie komorki (fx..fx+texSize), ostrzega gdy content clipuje.
     */
    private devAssertBounds(
        arch: EnemyArchetype,
        canvas: HTMLCanvasElement,
        texSize: number,
        cols: number,
        pitch: number,
        inset: number,
    ): void {
        try {
            const idx = Math.round(ENEMY_BAKE_ANGLES / 8) % ENEMY_BAKE_ANGLES; // ~45deg
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const col = idx % cols;
            const row = (idx / cols) | 0;
            const ox = col * pitch + inset;
            const oy = row * pitch + inset;

            const data = ctx.getImageData(ox, oy, texSize, texSize).data;
            let minX = texSize;
            let minY = texSize;
            let maxX = -1;
            let maxY = -1;
            for (let y = 0; y < texSize; y++) {
                for (let x = 0; x < texSize; x++) {
                    if (data[(y * texSize + x) * 4 + 3] > 8) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (maxX < 0) return;
            const clipped = minX <= 1 || minY <= 1 || maxX >= texSize - 2 || maxY >= texSize - 2;
            if (clipped) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[EnemySpriteBaker] CLIP RISK arch=${arch}: content bounds ${minX},${minY}..${maxX},${maxY} ` +
                        `in ${texSize}x${texSize} cell — bump ENEMY_TEX_SIZE.${arch}.`,
                );
            }
        } catch {
            // getImageData can throw (tainted/headless) — skip.
        }
    }
}

export const EnemySpriteBaker = new EnemySpriteBakerImpl();