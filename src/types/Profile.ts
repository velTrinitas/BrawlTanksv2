/**
 * Profile system types — FAZA 7
 *
 * Profile = player identity layer:
 *  - `avatarId` determines visual identity AND display name
 *    (avatar.displayName == player's in-game name; no separate nickname in MVP)
 *  - `flagId` is the override flag rendered on player's tank in-game
 *    (replaces brawler's default national flag)
 *  - `language` is per-profile (rodzic PL, dziecko EN — niezalezne preferencje)
 *
 * Architectural notes:
 *  - Profile is persisted via ProfileService (LocalStorage MVP, REST API ready)
 *  - All `getXxx` returns are Object.freeze'd (Constitution §8 immutability)
 *  - `profileId` is REQUIRED on GameConfig (Constitution §1)
 */

export type AvatarId = 'komandor' | 'pilotka' | 'smyk' | 'inzynier';

export type FlagId = 'pl' | 'fr' | 'it' | 'de';

export type LanguageId = 'pl' | 'en';

export interface Profile {
  readonly id: string;             // crypto.randomUUID()
  readonly avatarId: AvatarId;     // also serves as display name
  readonly flagId: FlagId;         // override flag on player's tank
  readonly language: LanguageId;
  readonly createdAt: number;      // Date.now() at creation
  readonly lastPlayedAt: number;   // Date.now() at most recent session start
  readonly totalGamesPlayed: number;
}

export interface ProfileCreateInput {
  avatarId: AvatarId;
  flagId: FlagId;
  language?: LanguageId;  // defaults to DEFAULT_LANGUAGE
}

/** Default fallback when no profile preferences known yet */
export const DEFAULT_LANGUAGE: LanguageId = 'pl';