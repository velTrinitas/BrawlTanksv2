/**
 * Avatar config — FAZA 7
 *
 * 4 awatary jako profile identity. Each loaded as PIXI.Texture from
 * external PNG asset (1024x1024, radial gradient background).
 *
 * Constitution §10 exception:
 * "All programmatic art" rule applies to game-world entities (tanks, maps, enemies).
 * Profile avatars are UI-only assets (settings/onboarding/main hub portrait chips),
 * never rendered inside the gameplay arena — hence baked PNG is acceptable here.
 *
 * `displayName` doubles as the player's in-game name (per FAZA 7 decision —
 * no separate nickname input in MVP).
 *
 * Asset location on disk: public/profile/avatars/avatar_<id>.png
 * URL resolution at runtime: BASE_URL + assetPath
 *   - dev:   /profile/avatars/avatar_komandor.png
 *   - prod:  /BrawlTanksv2/profile/avatars/avatar_komandor.png  (GitHub Pages base)
 */
import type { AvatarId } from '../types/Profile';

export interface AvatarConfig {
  readonly id: AvatarId;
  readonly displayName: string;     // shown to player; ALSO their in-game name
  readonly description: string;     // 1-line role/personality (PL, no diacritics)
  readonly assetPath: string;       // relative to Vite base URL (no leading slash)
}

const _AVATARS = {
  komandor: {
    id: 'komandor',
    displayName: 'Komandor',
    description: 'Doswiadczony taktyk',
    assetPath: 'profile/avatars/avatar_komandor.png',
  },
  pilotka: {
    id: 'pilotka',
    displayName: 'Pilotka',
    description: 'Odwazna zwiadowczyni',
    assetPath: 'profile/avatars/avatar_pilotka.png',
  },
  smyk: {
    id: 'smyk',
    displayName: 'Smyk',
    description: 'Energiczny rookie',
    assetPath: 'profile/avatars/avatar_smyk.png',
  },
  inzynier: {
    id: 'inzynier',
    displayName: 'Inzynier',
    description: 'Spokojny strateg',
    assetPath: 'profile/avatars/avatar_inzynier.png',
  },
} as const satisfies Record<AvatarId, AvatarConfig>;

export const AVATARS: Readonly<Record<AvatarId, AvatarConfig>> = Object.freeze(_AVATARS);

export const AVATAR_IDS: readonly AvatarId[] = Object.freeze([
  'komandor',
  'pilotka',
  'smyk',
  'inzynier',
] as const);

/** Returns avatar config by id (compile-time safe via AvatarId union). */
export function getAvatar(id: AvatarId): AvatarConfig {
  return AVATARS[id];
}

/** Runtime type guard for unknown strings from localStorage / URL params. */
export function isValidAvatarId(id: string): id is AvatarId {
  return id in AVATARS;
}