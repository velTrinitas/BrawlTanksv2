/**
 * Profile types — FAZA 7
 *
 * v0.19.2 (FAZA 7b nickname fix):
 * - Added `nickname` required field (2-16 chars, alphanumeric only)
 * - Solves leaderboard duplicate-identity problem (avatar+flag combos
 *   exhaust at 16 permutations; nickname disambiguates beyond that)
 */

export type AvatarId = 'komandor' | 'pilotka' | 'smyk' | 'inzynier';
export type FlagId = 'pl' | 'fr' | 'it' | 'de';
export type LanguageId = 'pl' | 'en';

/**
 * Nickname validation constants (FAZA 7b).
 * Used by:
 *  - ProfileService.createProfile (server-of-truth validation before persist)
 *  - IdentityScreen (real-time UI validation feedback)
 *  - Future Settings (FAZA 8) profile-edit UI
 *
 * Rules:
 *  - 2-16 chars (short enough for HUD/leaderboard rows, long enough for "Krzysztof")
 *  - Alphanumeric only (a-z, A-Z, 0-9) — no spaces, no underscores, no special chars
 *  - Profanity filtering: out of scope (TODO FAZA 9+ at leaderboard backend)
 */
export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 16;
export const NICKNAME_PATTERN = /^[a-zA-Z0-9]+$/;

/** Returns true if the string is a valid nickname per rules above. */
export function isValidNickname(value: string): boolean {
    if (typeof value !== 'string') return false;
    if (value.length < NICKNAME_MIN_LENGTH || value.length > NICKNAME_MAX_LENGTH) return false;
    return NICKNAME_PATTERN.test(value);
}

/**
 * Sanitize nickname input — strips invalid chars (used in IdentityScreen
 * to reject unwanted keystrokes silently rather than show error spam).
 */
export function sanitizeNickname(value: string): string {
    if (typeof value !== 'string') return '';
    return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, NICKNAME_MAX_LENGTH);
}

/**
 * Player profile — single source of truth for identity, persisted to localStorage.
 *
 * Frozen on every read from ProfileService (defense against accidental mutation).
 * Multiplayer-ready: nickname disambiguates duplicates beyond avatar+flag combos.
 */
export interface Profile {
    readonly id: string;
    readonly avatarId: AvatarId;
    readonly flagId: FlagId;
    /** FAZA 7b: required identity field for leaderboard uniqueness. */
    readonly nickname: string;
    readonly language: LanguageId;
    readonly createdAt: number;
    readonly lastPlayedAt: number;
    readonly totalGamesPlayed: number;
}

export const DEFAULT_LANGUAGE: LanguageId = 'pl';