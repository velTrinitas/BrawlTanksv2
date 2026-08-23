/**
 * Flag config — FAZA 7, roster 18 flag w PROFILE-1 (v0.118.0).
 *
 * Gracz wybiera flage, ktora ZASTEPUJE brawler's default flag na czolgu.
 * "To moj czolg" feeling dla 9-12 latkow.
 *
 * Architecture (dwie warstwy artu):
 *  - Flag config = colors + pattern (pure data) — uzywane przez FlagRenderer
 *    (PIXI, flaga NA CZOLGU) i legacy CSS-gradienty. Dla flag zlozonych
 *    (USA/UK/Japonia/...) pattern jest APROKSYMACJA paskowa — na malej fladze
 *    czolgu wystarcza, a stare renderery kompiluja bez zmian.
 *  - DOKLADNY art flag w UI profilu = src/ui/flagArt.ts (programmatic mini-SVG
 *    per id: gwiazdy/krzyze/kola — Constitution §10 OK, zero external assets).
 *
 * Wybor 18 krajow (decyzja Mariusza: USA/PL/DE/IT/FR/ES/JP/KR/IL + 9 dobranych
 * pod graczy i rozpoznawalnosc dla 9-12 latkow): AR, BR, CA, GB, NL, PT, SE,
 * TR, UA. Stare 4 id (pl/fr/it/de) zostaly => zapisane wybory graczy wazne.
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
  ar: {
    id: 'ar',
    displayName: 'Argentyna',
    englishName: 'Argentina',
    pattern: 'horizontal_3',
    colors: { primary: 0x74ACDF, secondary: 0xFFFFFF, tertiary: 0x74ACDF },
    countryCode: 'AR',
  },
  br: {
    id: 'br',
    displayName: 'Brazylia',
    englishName: 'Brazil',
    pattern: 'horizontal_3',
    colors: { primary: 0x009C3B, secondary: 0xFFDF00, tertiary: 0x009C3B },
    countryCode: 'BR',
  },
  ca: {
    id: 'ca',
    displayName: 'Kanada',
    englishName: 'Canada',
    pattern: 'vertical_3',
    colors: { primary: 0xFF0000, secondary: 0xFFFFFF, tertiary: 0xFF0000 },
    countryCode: 'CA',
  },
  de: {
    id: 'de',
    displayName: 'Niemcy',
    englishName: 'Germany',
    pattern: 'horizontal_3',
    colors: { primary: 0x000000, secondary: 0xDD0000, tertiary: 0xFFCE00 },
    countryCode: 'DE',
  },
  es: {
    id: 'es',
    displayName: 'Hiszpania',
    englishName: 'Spain',
    pattern: 'horizontal_3',
    colors: { primary: 0xAA151B, secondary: 0xF1BF00, tertiary: 0xAA151B },
    countryCode: 'ES',
  },
  fr: {
    id: 'fr',
    displayName: 'Francja',
    englishName: 'France',
    pattern: 'vertical_3',
    colors: { primary: 0x002395, secondary: 0xFFFFFF, tertiary: 0xED2939 },
    countryCode: 'FR',
  },
  gb: {
    id: 'gb',
    displayName: 'Wielka Brytania',
    englishName: 'Great Britain',
    pattern: 'horizontal_3',
    colors: { primary: 0x012169, secondary: 0xFFFFFF, tertiary: 0xC8102F },
    countryCode: 'GB',
  },
  il: {
    id: 'il',
    displayName: 'Izrael',
    englishName: 'Israel',
    pattern: 'horizontal_3',
    colors: { primary: 0xFFFFFF, secondary: 0x0038B8, tertiary: 0xFFFFFF },
    countryCode: 'IL',
  },
  it: {
    id: 'it',
    displayName: 'Wlochy',
    englishName: 'Italy',
    pattern: 'vertical_3',
    colors: { primary: 0x009246, secondary: 0xFFFFFF, tertiary: 0xCE2B37 },
    countryCode: 'IT',
  },
  jp: {
    id: 'jp',
    displayName: 'Japonia',
    englishName: 'Japan',
    pattern: 'horizontal_3',
    colors: { primary: 0xFFFFFF, secondary: 0xBC002D, tertiary: 0xFFFFFF },
    countryCode: 'JP',
  },
  kr: {
    id: 'kr',
    displayName: 'Korea Poludniowa',
    englishName: 'South Korea',
    pattern: 'horizontal_3',
    colors: { primary: 0xFFFFFF, secondary: 0xCD2E3A, tertiary: 0x0047A0 },
    countryCode: 'KR',
  },
  nl: {
    id: 'nl',
    displayName: 'Holandia',
    englishName: 'Netherlands',
    pattern: 'horizontal_3',
    colors: { primary: 0xAE1C28, secondary: 0xFFFFFF, tertiary: 0x21468B },
    countryCode: 'NL',
  },
  pl: {
    id: 'pl',
    displayName: 'Polska',
    englishName: 'Poland',
    pattern: 'horizontal_2',
    colors: { primary: 0xFFFFFF, secondary: 0xDC143C },
    countryCode: 'PL',
  },
  pt: {
    id: 'pt',
    displayName: 'Portugalia',
    englishName: 'Portugal',
    pattern: 'vertical_3',
    colors: { primary: 0x046A38, secondary: 0xDA291C, tertiary: 0xDA291C },
    countryCode: 'PT',
  },
  se: {
    id: 'se',
    displayName: 'Szwecja',
    englishName: 'Sweden',
    pattern: 'horizontal_3',
    colors: { primary: 0x006AA7, secondary: 0xFECC02, tertiary: 0x006AA7 },
    countryCode: 'SE',
  },
  tr: {
    id: 'tr',
    displayName: 'Turcja',
    englishName: 'Turkey',
    pattern: 'horizontal_2',
    colors: { primary: 0xE30A17, secondary: 0xE30A17 },
    countryCode: 'TR',
  },
  ua: {
    id: 'ua',
    displayName: 'Ukraina',
    englishName: 'Ukraine',
    pattern: 'horizontal_2',
    colors: { primary: 0x005BBB, secondary: 0xFFD500 },
    countryCode: 'UA',
  },
  us: {
    id: 'us',
    displayName: 'USA',
    englishName: 'USA',
    pattern: 'horizontal_3',
    colors: { primary: 0xB22234, secondary: 0xFFFFFF, tertiary: 0x3C3B6E },
    countryCode: 'US',
  },
} as const satisfies Record<FlagId, FlagConfig>;

export const FLAGS: Readonly<Record<FlagId, FlagConfig>> = Object.freeze(_FLAGS);

export const FLAG_IDS: readonly FlagId[] = Object.freeze([
  'ar', 'br', 'ca', 'de', 'es', 'fr', 'gb', 'il', 'it',
  'jp', 'kr', 'nl', 'pl', 'pt', 'se', 'tr', 'ua', 'us',
] as const);

/** Fallback dla nieznanych id (zmajstrowany localStorage / przyszle usuniecia). */
export const DEFAULT_FLAG_ID: FlagId = 'pl';

export function getFlag(id: FlagId): FlagConfig {
  return FLAGS[id];
}

export function isValidFlagId(id: string): id is FlagId {
  return id in FLAGS;
}
