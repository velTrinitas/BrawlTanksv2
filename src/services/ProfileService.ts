/**
 * ProfileService — FAZA 7
 *
 * Manages player profiles (LocalStorage persistence, REST API ready interface).
 *
 * Architecture:
 *  - Singleton instance (matches ScoreService/SessionService pattern)
 *  - All read methods return Object.freeze'd profiles (Constitution §8 immutability)
 *  - FAZA 7+ REST swap: rewrite persistence layer only; public API unchanged
 *
 * Storage keys:
 *   'bt2:profiles'         — Profile[] JSON array
 *   'bt2:activeProfileId'  — string | null
 *
 * Schema validation:
 *  - Defensive parsing on load: invalid stored entries are dropped (forward-compat)
 *  - Avatar/flag id validation on create + update (runtime type guards)
 */
import type {
  Profile,
  ProfileCreateInput,
} from '../types/Profile';
import { DEFAULT_LANGUAGE } from '../types/Profile';
import { isValidAvatarId } from '../config/avatars';
import { isValidFlagId } from '../config/flags';

const STORAGE_KEYS = {
  PROFILES: 'bt2:profiles',
  ACTIVE_PROFILE_ID: 'bt2:activeProfileId',
} as const;

/** Patchable fields on update (id + createdAt are immutable). */
type ProfileUpdate = Partial<Pick<
  Profile,
  'avatarId' | 'flagId' | 'language' | 'lastPlayedAt' | 'totalGamesPlayed'
>>;

class ProfileServiceImpl {
  private profiles: Profile[];
  private activeProfileId: string | null;

  constructor() {
    this.profiles = this.loadProfiles();
    this.activeProfileId = this.loadActiveProfileId();
  }

  // ============ Public API ============

  /** True if no active profile exists (first launch or after delete) — trigger onboarding. */
  needsOnboarding(): boolean {
    return this.getActiveProfile() === null;
  }

  /** Returns active profile (FROZEN) or null. */
  getActiveProfile(): Profile | null {
    if (!this.activeProfileId) return null;
    const p = this.profiles.find(p => p.id === this.activeProfileId);
    return p ? Object.freeze({ ...p }) : null;
  }

  /** Returns all profiles (FROZEN array of FROZEN profiles). */
  listProfiles(): readonly Profile[] {
    return Object.freeze(this.profiles.map(p => Object.freeze({ ...p })));
  }

  /** Returns specific profile by id (FROZEN) or null. */
  getProfile(id: string): Profile | null {
    const p = this.profiles.find(p => p.id === id);
    return p ? Object.freeze({ ...p }) : null;
  }

  /**
   * Creates a new profile, marks it as active.
   * @throws if avatarId or flagId is invalid (runtime type guard).
   */
  createProfile(input: ProfileCreateInput): Profile {
    if (!isValidAvatarId(input.avatarId)) {
      throw new Error(`[ProfileService] invalid avatarId: ${input.avatarId}`);
    }
    if (!isValidFlagId(input.flagId)) {
      throw new Error(`[ProfileService] invalid flagId: ${input.flagId}`);
    }

    const now = Date.now();
    const profile: Profile = {
      id: this.generateId(),
      avatarId: input.avatarId,
      flagId: input.flagId,
      language: input.language ?? DEFAULT_LANGUAGE,
      createdAt: now,
      lastPlayedAt: now,
      totalGamesPlayed: 0,
    };

    this.profiles.push(profile);
    this.activeProfileId = profile.id;
    this.persistProfiles();
    this.persistActiveProfileId();

    return Object.freeze({ ...profile });
  }

  /**
   * Updates select fields of a profile. Returns updated FROZEN profile.
   * @throws if profile not found or invalid avatar/flag id in patch.
   */
  updateProfile(id: string, patch: ProfileUpdate): Profile {
    const idx = this.profiles.findIndex(p => p.id === id);
    if (idx < 0) {
      throw new Error(`[ProfileService] profile not found: ${id}`);
    }

    if (patch.avatarId !== undefined && !isValidAvatarId(patch.avatarId)) {
      throw new Error(`[ProfileService] invalid avatarId: ${patch.avatarId}`);
    }
    if (patch.flagId !== undefined && !isValidFlagId(patch.flagId)) {
      throw new Error(`[ProfileService] invalid flagId: ${patch.flagId}`);
    }

    const updated: Profile = { ...this.profiles[idx], ...patch };
    this.profiles[idx] = updated;
    this.persistProfiles();

    return Object.freeze({ ...updated });
  }

  /** Sets active profile. @throws if id not found. */
  setActiveProfile(id: string): void {
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) {
      throw new Error(`[ProfileService] profile not found: ${id}`);
    }
    this.activeProfileId = id;
    this.persistActiveProfileId();
  }

  /** Deletes a profile. Active falls back to first remaining (or null). */
  deleteProfile(id: string): void {
    this.profiles = this.profiles.filter(p => p.id !== id);
    if (this.activeProfileId === id) {
      this.activeProfileId = this.profiles[0]?.id ?? null;
      this.persistActiveProfileId();
    }
    this.persistProfiles();
  }

  /**
   * Records a game session start — bumps lastPlayedAt + totalGamesPlayed for active profile.
   * Called from main.ts when GameConfig is finalized and game begins.
   * No-op if no active profile.
   */
  recordSessionStart(): void {
    const active = this.getActiveProfile();
    if (!active) return;
    this.updateProfile(active.id, {
      lastPlayedAt: Date.now(),
      totalGamesPlayed: active.totalGamesPlayed + 1,
    });
  }

  // ============ Internal ============

  private loadProfiles(): Profile[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PROFILES);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Defensive filtering — drop invalid entries (forward-compat with schema migrations)
      return parsed.filter((p): p is Profile => this.isValidProfileShape(p));
    } catch (e) {
      console.warn('[ProfileService] loadProfiles failed:', e);
      return [];
    }
  }

  private loadActiveProfileId(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_ID);
    } catch (e) {
      console.warn('[ProfileService] loadActiveProfileId failed:', e);
      return null;
    }
  }

  private persistProfiles(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(this.profiles));
    } catch (e) {
      console.warn('[ProfileService] persistProfiles failed:', e);
    }
  }

  private persistActiveProfileId(): void {
    try {
      if (this.activeProfileId) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, this.activeProfileId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE_ID);
      }
    } catch (e) {
      console.warn('[ProfileService] persistActiveProfileId failed:', e);
    }
  }

  /** Runtime schema validation for stored profiles. */
  private isValidProfileShape(p: unknown): p is Profile {
    if (typeof p !== 'object' || p === null) return false;
    const o = p as Record<string, unknown>;
    return (
      typeof o.id === 'string' &&
      typeof o.avatarId === 'string' && isValidAvatarId(o.avatarId) &&
      typeof o.flagId === 'string' && isValidFlagId(o.flagId) &&
      (o.language === 'pl' || o.language === 'en') &&
      typeof o.createdAt === 'number' &&
      typeof o.lastPlayedAt === 'number' &&
      typeof o.totalGamesPlayed === 'number'
    );
  }

  /** UUID generation — crypto.randomUUID per Constitution §9, fallback for older browsers. */
  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback: timestamp + random (not RFC4122 but adequate for local-only ids)
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

/** Singleton — use this everywhere */
export const ProfileService = new ProfileServiceImpl();