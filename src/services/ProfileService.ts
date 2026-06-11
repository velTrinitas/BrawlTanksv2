/**
 * ProfileService — singleton, localStorage persistence, REST-API-ready interface.
 *
 * Architecture (Constitution §6):
 * - Service interface stable; implementation swap (localStorage → REST) zero-touch
 * - Object.freeze on every read prevents accidental external mutation
 * - Defensive JSON parsing: invalid stored entries auto-dropped (forward-compat
 *   with schema migrations)
 * - Singleton via module-level instantiation
 *
 * v0.19.2 (FAZA 7b nickname fix):
 * - createProfile now validates nickname (throws on invalid)
 * - loadProfiles defensive parsing drops profiles without valid nickname
 *   (Mariusz's existing test profile from initial FAZA 7b will auto-drop on
 *    next load → IdentityScreen re-shown — clean migration without manual reset)
 */

import type { AvatarId, FlagId, LanguageId, Profile } from '../types/Profile';
import { DEFAULT_LANGUAGE, isValidNickname } from '../types/Profile';

const PROFILES_KEY = 'bt2:profiles';
const ACTIVE_PROFILE_KEY = 'bt2:activeProfileId';

export interface CreateProfileOptions {
    avatarId: AvatarId;
    flagId: FlagId;
    /** FAZA 7b: required, 2-16 alphanumeric chars (validated). */
    nickname: string;
    language?: LanguageId;
}

class ProfileServiceImpl {
    private profiles: Profile[] = [];
    private activeProfileId: string | null = null;
    private initialized = false;

    // === Public API ===

    needsOnboarding(): boolean {
        this.ensureInitialized();
        return this.activeProfileId === null || this.profiles.length === 0;
    }

    getActiveProfile(): Profile | null {
        this.ensureInitialized();
        if (!this.activeProfileId) return null;
        const profile = this.profiles.find(p => p.id === this.activeProfileId);
        return profile ? Object.freeze({ ...profile }) : null;
    }

    listProfiles(): readonly Profile[] {
        this.ensureInitialized();
        return Object.freeze(this.profiles.map(p => Object.freeze({ ...p })));
    }

    createProfile(opts: CreateProfileOptions): Profile {
        this.ensureInitialized();

        // FAZA 7b: validate nickname at the service layer (defense in depth —
        // IdentityScreen also validates, but service is source of truth).
        if (!isValidNickname(opts.nickname)) {
            throw new Error(
                `[ProfileService] Invalid nickname: "${opts.nickname}" ` +
                `(must be 2-16 alphanumeric characters)`
            );
        }

        const now = Date.now();
        const profile: Profile = {
            id: generateUuid(),
            avatarId: opts.avatarId,
            flagId: opts.flagId,
            nickname: opts.nickname,
            language: opts.language ?? DEFAULT_LANGUAGE,
            createdAt: now,
            lastPlayedAt: now,
            totalGamesPlayed: 0,
        };

        this.profiles.push(profile);
        this.activeProfileId = profile.id;
        this.saveProfiles();
        this.saveActiveProfileId();

        return Object.freeze({ ...profile });
    }

    updateProfile(
        id: string,
        updates: Partial<Omit<Profile, 'id' | 'createdAt'>>,
    ): Profile | null {
        this.ensureInitialized();

        const idx = this.profiles.findIndex(p => p.id === id);
        if (idx < 0) return null;

        // FAZA 7b: if nickname being updated, validate it
        if (updates.nickname !== undefined && !isValidNickname(updates.nickname)) {
            throw new Error(
                `[ProfileService] Invalid nickname in update: "${updates.nickname}"`
            );
        }

        const updated: Profile = { ...this.profiles[idx], ...updates };
        this.profiles[idx] = updated;
        this.saveProfiles();

        return Object.freeze({ ...updated });
    }

    setActiveProfile(id: string): boolean {
        this.ensureInitialized();
        const profile = this.profiles.find(p => p.id === id);
        if (!profile) return false;

        this.activeProfileId = id;
        this.saveActiveProfileId();
        return true;
    }

    deleteProfile(id: string): boolean {
        this.ensureInitialized();
        const idx = this.profiles.findIndex(p => p.id === id);
        if (idx < 0) return false;

        this.profiles.splice(idx, 1);
        if (this.activeProfileId === id) {
            this.activeProfileId = this.profiles[0]?.id ?? null;
            this.saveActiveProfileId();
        }
        this.saveProfiles();
        return true;
    }

    recordSessionStart(): void {
        this.ensureInitialized();
        if (!this.activeProfileId) return;

        const idx = this.profiles.findIndex(p => p.id === this.activeProfileId);
        if (idx < 0) return;

        const profile = this.profiles[idx];
        this.profiles[idx] = {
            ...profile,
            lastPlayedAt: Date.now(),
            totalGamesPlayed: profile.totalGamesPlayed + 1,
        };
        this.saveProfiles();
    }

    // === Internal: storage IO ===

    private ensureInitialized(): void {
        if (this.initialized) return;
        this.loadProfiles();
        this.loadActiveProfileId();
        this.initialized = true;
    }

    /**
     * Load profiles from localStorage with defensive parsing.
     * Drops entries that fail schema validation (forward-compat with migrations).
     *
     * FAZA 7b: profiles without valid nickname are dropped automatically →
     * Mariusz's pre-nickname test profile auto-clears, IdentityScreen re-shown.
     */
    private loadProfiles(): void {
        const raw = localStorage.getItem(PROFILES_KEY);
        if (!raw) {
            this.profiles = [];
            return;
        }

        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                console.warn('[ProfileService] Stored profiles not an array, resetting');
                this.profiles = [];
                return;
            }

            const validProfiles: Profile[] = [];
            for (const entry of parsed) {
                if (this.isValidProfileEntry(entry)) {
                    validProfiles.push(entry as Profile);
                } else {
                    console.warn('[ProfileService] Dropping invalid profile entry:', entry);
                }
            }
            this.profiles = validProfiles;
        } catch (e) {
            console.error('[ProfileService] Failed to parse profiles, resetting:', e);
            this.profiles = [];
        }
    }

    private loadActiveProfileId(): void {
        const stored = localStorage.getItem(ACTIVE_PROFILE_KEY);
        if (!stored) {
            this.activeProfileId = null;
            return;
        }

        // Verify that the stored active ID still points at a valid profile
        const exists = this.profiles.some(p => p.id === stored);
        this.activeProfileId = exists ? stored : null;

        if (!exists && stored) {
            console.warn('[ProfileService] Active profile ID stale, clearing');
            localStorage.removeItem(ACTIVE_PROFILE_KEY);
        }
    }

    private saveProfiles(): void {
        try {
            localStorage.setItem(PROFILES_KEY, JSON.stringify(this.profiles));
        } catch (e) {
            console.error('[ProfileService] Failed to save profiles:', e);
        }
    }

    private saveActiveProfileId(): void {
        try {
            if (this.activeProfileId) {
                localStorage.setItem(ACTIVE_PROFILE_KEY, this.activeProfileId);
            } else {
                localStorage.removeItem(ACTIVE_PROFILE_KEY);
            }
        } catch (e) {
            console.error('[ProfileService] Failed to save active profile ID:', e);
        }
    }

    /**
     * Defensive profile schema validation.
     * Returns true if entry has all required fields with correct types.
     *
     * FAZA 7b: nickname required + validated against rules.
     */
    private isValidProfileEntry(entry: unknown): boolean {
        if (typeof entry !== 'object' || entry === null) return false;
        const e = entry as Record<string, unknown>;

        if (typeof e.id !== 'string' || e.id.length === 0) return false;
        if (typeof e.avatarId !== 'string') return false;
        if (typeof e.flagId !== 'string') return false;

        // FAZA 7b: nickname required + validated
        if (typeof e.nickname !== 'string' || !isValidNickname(e.nickname)) return false;

        if (typeof e.language !== 'string') return false;
        if (typeof e.createdAt !== 'number') return false;
        if (typeof e.lastPlayedAt !== 'number') return false;
        if (typeof e.totalGamesPlayed !== 'number') return false;

        return true;
    }
}

/**
 * Generate UUID v4 with crypto.randomUUID fallback.
 * Matches generateSessionId pattern in GameConfig.ts.
 */
function generateUuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // RFC 4122 v4 fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/** Singleton — import this everywhere */
export const ProfileService = new ProfileServiceImpl();