/**
 * Profile sprite cache — FAZA 7
 *
 * Per-feature isolated cache (Constitution §7) for profile-related textures:
 *  - PROFILE_AVATAR_TEX_CACHE: 4 PNG avatars loaded via PIXI.Assets.load
 *  - PROFILE_FLAG_TEX_CACHE:   4 programmatic flags baked from PIXI.Graphics
 *
 * Boot sequence (main.ts):
 *   await ProfileSpriteCache.init(app);
 *
 * Lookup:
 *   ProfileSpriteCache.getAvatarTexture(avatarId)
 *   ProfileSpriteCache.getFlagTexture(flagId)
 *
 * Both throw if cache not initialized — fail fast over silent fallback.
 */
import * as PIXI from 'pixi.js';
import type { AvatarId, FlagId } from '../../types/Profile';
import { AVATARS, AVATAR_IDS } from '../../config/avatars';
import { FLAG_IDS } from '../../config/flags';
import { drawFlag, FLAG_RENDER_SIZE } from '../flags/FlagRenderer';

class ProfileSpriteCacheImpl {
    private avatarCache = new Map<AvatarId, PIXI.Texture>();
    private flagCache = new Map<FlagId, PIXI.Texture>();
    private initialized = false;

    /**
     * Initialize cache — call ONCE at boot, before any avatar/flag is rendered.
     * Resolves once all PNG avatars are loaded and all flag textures are baked.
     *
     * @throws if any avatar PNG fails to load (fail fast — app should not start without avatars)
     */
    async init(app: PIXI.Application): Promise<void> {
        if (this.initialized) {
            console.warn('[ProfileSpriteCache] already initialized — skipping');
            return;
        }

        const base = this.getBaseUrl();

        // 1. Load avatar PNGs in parallel (Vite resolves base URL for GitHub Pages)
        const avatarLoads = AVATAR_IDS.map(async (id) => {
            const url = `${base}${AVATARS[id].assetPath}`;
            const tex = (await PIXI.Assets.load(url)) as PIXI.Texture;
            return { id, tex };
        });

        try {
            const results = await Promise.all(avatarLoads);
            results.forEach(({ id, tex }) => this.avatarCache.set(id, tex));
        } catch (e) {
            console.error('[ProfileSpriteCache] avatar load failed:', e);
            throw new Error('Failed to load profile avatars — check public/profile/avatars/ folder');
        }

        // 2. Bake flag textures from programmatic PIXI.Graphics
        const renderer = app.renderer;
        FLAG_IDS.forEach((flagId) => {
            const container = drawFlag(flagId);
            const tex = renderer.generateTexture(container, {
                resolution: 1,
                region: new PIXI.Rectangle(0, 0, FLAG_RENDER_SIZE, FLAG_RENDER_SIZE),
            });
            this.flagCache.set(flagId, tex);
            container.destroy({ children: true });
        });

        this.initialized = true;
    }

    /** Returns avatar texture. Throws if not initialized or id invalid. */
    getAvatarTexture(id: AvatarId): PIXI.Texture {
        this.assertInitialized();
        const tex = this.avatarCache.get(id);
        if (!tex) {
            throw new Error(`[ProfileSpriteCache] avatar texture missing: ${id}`);
        }
        return tex;
    }

    /** Returns flag texture. Throws if not initialized or id invalid. */
    getFlagTexture(id: FlagId): PIXI.Texture {
        this.assertInitialized();
        const tex = this.flagCache.get(id);
        if (!tex) {
            throw new Error(`[ProfileSpriteCache] flag texture missing: ${id}`);
        }
        return tex;
    }

    isReady(): boolean {
        return this.initialized;
    }

    private assertInitialized(): void {
        if (!this.initialized) {
            throw new Error('[ProfileSpriteCache] not initialized — call init(app) at boot before lookup');
        }
    }

    /**
     * Returns Vite base URL so PNG paths work both on local dev ('/')
     * and on GitHub Pages deployment ('/BrawlTanksv2/').
     */
    private getBaseUrl(): string {
        // import.meta.env.BASE_URL is set by Vite at build time
        const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
        return env?.BASE_URL ?? '/';
    }
}

/** Singleton — use this everywhere */
export const ProfileSpriteCache = new ProfileSpriteCacheImpl();