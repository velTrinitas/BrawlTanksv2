/**
 * Avatar config — FAZA 7, roster v2 w PROFILE-1 (v0.118.0).
 *
 * 9 czolgistow jako profile identity (art Mariusza, 200x200 PNG). Nazwy = nazwy
 * plikow bez sufiksu _200 (decyzja Mariusza). Stary roster 4 (komandor/pilotka/
 * smyk/inzynier) USUNIETY — stare id migrowane do DEFAULT_AVATAR_ID przy load
 * profilu (ProfileService.normalizeIdentity).
 *
 * Constitution §10 exception:
 * "All programmatic art" rule applies to game-world entities (tanks, maps, enemies).
 * Profile avatars are UI-only assets (edit/onboarding/hub chips), never rendered
 * inside the gameplay arena — hence baked PNG is acceptable here.
 *
 * Asset location on disk: public/profile/avatars/<Name>_200.png
 * URL resolution at runtime: BASE_URL + assetPath
 */
import type { AvatarId } from '../types/Profile';

export interface AvatarConfig {
  readonly id: AvatarId;
  readonly displayName: string;     // shown to player (i18n key preferred in UI)
  readonly description: string;     // 1-line personality (EN, no diacritics)
  readonly assetPath: string;       // relative to Vite base URL (no leading slash)
}

const _AVATARS = {
  ash: {
    id: 'ash',
    displayName: 'Ash',
    description: 'Calm strategist',
    assetPath: 'profile/avatars/Ash_200.png',
  },
  chris: {
    id: 'chris',
    displayName: 'Chris',
    description: 'Ramming master',
    assetPath: 'profile/avatars/Chris_200.png',
  },
  dane: {
    id: 'dane',
    displayName: 'Dane',
    description: 'Fast scout',
    assetPath: 'profile/avatars/Dane_200.png',
  },
  jack: {
    id: 'jack',
    displayName: 'Jack',
    description: 'Born leader',
    assetPath: 'profile/avatars/Jack_200.png',
  },
  johny: {
    id: 'johny',
    displayName: 'Johny',
    description: 'Hothead',
    assetPath: 'profile/avatars/Johny_200.png',
  },
  matti: {
    id: 'matti',
    displayName: 'Matti',
    description: 'Tech genius',
    assetPath: 'profile/avatars/Matti_200.png',
  },
  pablo: {
    id: 'pablo',
    displayName: 'Pablo',
    description: 'Cheerful daredevil',
    assetPath: 'profile/avatars/Pablo_200.png',
  },
  steve: {
    id: 'steve',
    displayName: 'Steve',
    description: 'Tough veteran',
    assetPath: 'profile/avatars/Steve_200.png',
  },
  tommy: {
    id: 'tommy',
    displayName: 'Tommy',
    description: 'Young talent',
    assetPath: 'profile/avatars/Tommy_200.png',
  },
} as const satisfies Record<AvatarId, AvatarConfig>;

export const AVATARS: Readonly<Record<AvatarId, AvatarConfig>> = Object.freeze(_AVATARS);

export const AVATAR_IDS: readonly AvatarId[] = Object.freeze([
  'ash', 'chris', 'dane', 'jack', 'johny', 'matti', 'pablo', 'steve', 'tommy',
] as const);

/** Fallback dla nieznanych/starych id (localStorage/chmura sprzed wymiany rosteru). */
export const DEFAULT_AVATAR_ID: AvatarId = 'ash';

/**
 * PROFILE-1: sloty pickera awatarow w hubie (grid 3x3). `null` = slot WKROTCE.
 * Dodanie postaci = PNG + wpis w _AVATARS + czlon unii AvatarId — UI iteruje
 * sloty, zero zmian w kodzie widoku.
 */
export const AVATAR_SLOTS: readonly (AvatarId | null)[] = Object.freeze([
  ...AVATAR_IDS,
] as const);

/** Returns avatar config by id (compile-time safe via AvatarId union). */
export function getAvatar(id: AvatarId): AvatarConfig {
  return AVATARS[id];
}

/** Runtime type guard for unknown strings from localStorage / URL params. */
export function isValidAvatarId(id: string): id is AvatarId {
  return id in AVATARS;
}
