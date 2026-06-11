/**
 * Flag config — FAZA 7
 *
 * 4 flagi narodowe jako profile identity override.
 * Gracz wybiera swoja flage, ktora ZASTEPUJE brawler's default flag na czolgu
 * niezaleznie od wybranego brawlera. "To moj czolg" feeling dla 9-12 latkow.
 *
 * Architecture:
 *  - Flag config = colors + pattern type (pure data)
 *  - FlagRenderer.ts produkuje PIXI.Container per pattern (Constitution §10 — programmatic)
 *  - ProfileSpriteCache baked textures one-time at boot
 */
import type { FlagId } from '../types/Profile';

export type FlagPattern = 'horizontal_2' | 'vertical_3' | 'horizontal_3';

export interface FlagColors {
  readonly primary: number;       // top / left stripe
  readonly secondary: number;     // middle stripe
  readonly tertiary?: number;     // bottom / right stripe (tricolor only)
}

export interface FlagConfig {
  readonly id: FlagId;
  readonly displayName: string;     // PL, no diacritics
  readonly englishName: string;     // full EN
  readonly pattern: FlagPattern;
  readonly colors: FlagColors;
  readonly countryCode: string;     // ISO 3166-1 alpha-2
}

const _FLAGS = {
  pl: {
    id: 'pl',
    displayName: 'Polska',
    englishName: 'Poland',
    pattern: 'horizontal_2',
    colors: {
      primary: 0xFFFFFF,
      secondary: 0xDC143C,
    },
    countryCode: 'PL',
  },
  fr: {
    id: 'fr',
    displayName: 'Francja',
    englishName: 'France',
    pattern: 'vertical_3',
    colors: {
      primary: 0x002395,
      secondary: 0xFFFFFF,
      tertiary: 0xED2939,
    },
    countryCode: 'FR',
  },
  it: {
    id: 'it',
    displayName: 'Wlochy',
    englishName: 'Italy',
    pattern: 'vertical_3',
    colors: {
      primary: 0x009246,
      secondary: 0xFFFFFF,
      tertiary: 0xCE2B37,
    },
    countryCode: 'IT',
  },
  de: {
    id: 'de',
    displayName: 'Niemcy',
    englishName: 'Germany',
    pattern: 'horizontal_3',
    colors: {
      primary: 0x000000,
      secondary: 0xDD0000,
      tertiary: 0xFFCE00,
    },
    countryCode: 'DE',
  },
} as const satisfies Record<FlagId, FlagConfig>;

export const FLAGS: Readonly<Record<FlagId, FlagConfig>> = Object.freeze(_FLAGS);

export const FLAG_IDS: readonly FlagId[] = Object.freeze(['pl', 'fr', 'it', 'de'] as const);

export function getFlag(id: FlagId): FlagConfig {
  return FLAGS[id];
}

export function isValidFlagId(id: string): id is FlagId {
  return id in FLAGS;
}