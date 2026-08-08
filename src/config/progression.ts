/**
 * progression.ts — stale ekonomii progresji (PROG-F1, spine).
 *
 * Design: docs/PROGRESSION_DESIGN_v1_2.md. Wszystkie liczby SKALIBROWANE na realnych
 * danych prod 2026-08-02 (476 wynikow, 18 graczy) — RE-KALIBROWAC po ruchu store/POKI
 * (>=200 realnych wynikow) i po pierwszych danych CTF. Jeden plik = jeden tuning pass.
 *
 * Rdzen: TROFEA z runa liczone wzorem znormalizowanym PER MAPA (decyzja Mariusza
 * 2026-08-02) — "swietna gra" (~p90 danej mapy) daje ~TARGET trofeow na KAZDEJ mapie,
 * wiec zadna mapa nie jest "farma XP". Nagradzamy wynik WZGLEDEM skali mapy, nie surowy.
 */

import type { MapId } from '../types/MapType';
import type { TranslationKey } from '../i18n/i18n';

// ── Parametry wzoru trofeow (Doc v1.2 §B/§F) ────────────────────────────────
export const TROPHY_TARGET_AT_P90 = 50;   // "swietna gra" (p90) ~= tyle trofeow na kazdej mapie
export const TROPHY_CAP_PER_RUN = 75;      // anty-farm: gorny cap czesci "za wynik" (bonusy dochodza NAD)
export const TROPHY_FLOOR_PER_RUN = 1;     // pasek ZAWSZE drga — nawet bounce daje +1

/**
 * Dzielnik per mapa = p90(mapy) / TARGET_AT_P90. Znormalizowany: score/dzielnik ~= trofea.
 * p90 z kalibracji: city 55, arctic 264, tropics 90, desert 62 (n=14 low-conf).
 * fortified_ruins (CTF): 1.8 provisional (jak tropics) — kalibrowac po 1. danych CTF.
 */
export const MAP_TROPHY_DIVISOR: Record<MapId, number> = {
    city: 1.1,
    desert: 1.25,
    tropics: 1.8,
    arctic: 5.3,
    fortified_ruins: 1.8,
};
const DEFAULT_DIVISOR = 1.8; // mapa bez wpisu (nie powinno sie zdarzyc — MapId jest zamkniety)

/** Bonusy do trofeow (flat, dochodza NAD capem — czysta nagroda za skill/rytm). */
export const TROPHY_BONUS = {
    perfectRun: 5,
    firstRunOfDay: 5,
    newPersonalBest: 10,
} as const;

/** Rubki (soft currency) z runa: trofeaGained * ten wspolczynnik. Tunable. */
export const BOLTS_PER_TROPHY = 1;

// ── Wzor trofeow ────────────────────────────────────────────────────────────
export interface TrophyBonusFlags {
    perfectRun?: boolean;
    firstRunOfDay?: boolean;
    newPersonalBest?: boolean;
}

export interface TrophyBreakdown {
    /** Czesc "za wynik" (score/dzielnik, sciete capem). */
    base: number;
    /** Suma bonusow (perfect/firstOfDay/PB). */
    bonus: number;
    /** Finalne trofea z runa (base + bonus, min FLOOR). */
    total: number;
    /** True gdy surowy wynik przebil cap (info dla UI/telemetrii). */
    cappedByRun: boolean;
}

/**
 * Trofea z jednego runa. score = GameSession.score (dowolny scenariusz).
 * Normalizacja PER MAPA: base = floor(score / dzielnik_mapy), sciete do CAP.
 * Bonusy dochodza NAD capem. Podloga FLOOR gwarantuje >=1 (pasek zawsze drga).
 */
export function computeTrophies(
    score: number,
    map: MapId,
    flags: TrophyBonusFlags = {},
): TrophyBreakdown {
    const divisor = MAP_TROPHY_DIVISOR[map] ?? DEFAULT_DIVISOR;
    const raw = Math.max(0, Math.floor(score / divisor));
    const base = Math.min(raw, TROPHY_CAP_PER_RUN);

    let bonus = 0;
    if (flags.perfectRun) bonus += TROPHY_BONUS.perfectRun;
    if (flags.firstRunOfDay) bonus += TROPHY_BONUS.firstRunOfDay;
    if (flags.newPersonalBest) bonus += TROPHY_BONUS.newPersonalBest;

    const total = Math.max(TROPHY_FLOOR_PER_RUN, base + bonus);
    return { base, bonus, total, cappedByRun: raw > TROPHY_CAP_PER_RUN };
}

// ── Szlak Trofeow — milestony (Doc v1.2 §C) ─────────────────────────────────
export interface TrophyMilestone {
    /** Prog trofeow (skumulowany na koncie), po ktorego przekroczeniu pada nagroda. */
    threshold: number;
    /** Nagroda rubkowa (F1: milestony = rubki; content-unlocki wpieta w pozniejsze pod-fazy). */
    bolts: number;
    /** Opcjonalna nagroda-content (display-only na Szlaku, np. odblokowana moc). */
    labelKey?: TranslationKey;
}

/**
 * AKT I "Rekrut" (Doc v1.2 §C): 0 -> 750, kadencja rozszerza sie.
 * Pierwsze 2 milestony male (30/70) => wpadaja w 1. sesje (regula D1: 2 milestony w 15 min).
 * Akty II/III dojda w pozniejszych pod-fazach (content-unlocki gdy systemy gotowe).
 */
export const ACT_I_MILESTONES: readonly TrophyMilestone[] = [
    { threshold: 30, bolts: 40 },
    { threshold: 70, bolts: 50 },
    { threshold: 120, bolts: 60 },
    { threshold: 180, bolts: 70 },
    { threshold: 250, bolts: 90 },
    // F7b-3: Salwa Rakiet w Akcie I (decyzja Mariusza — zamiast Turbo, ktore duplikowalo pady)
    { threshold: 330, bolts: 110, labelKey: 'road.unlock.rockets' },
    { threshold: 430, bolts: 130 },
    // F7b-5: Miny w Akcie I (Tier 1 = 9 mocy, decyzja Mariusza 2026-08-07)
    { threshold: 560, bolts: 160, labelKey: 'road.unlock.mines' },
    // F7b: domkniecie Aktu I odblokowuje NAPRAWE (unlockAtTrophies 750 w rejestrze mocy;
    // labelKey = marchewka na Szlaku — sama mechanika odblokowania liczy sie z trofeow).
    { threshold: 750, bolts: 200, labelKey: 'road.unlock.repair' },
];

/**
 * F7b: POCZATEK Aktu II — dwa pierwsze milestony, zeby Szlak pokazywal marchewke za 750
 * (bez nich Wieza @1500 lezalaby poza cala droga i odblokowanie nie mialoby celebracji).
 * Bolty = kontynuacja kadencji Aktu I; PROWIZORYCZNE — pelny Akt II przy jego designie.
 */
export const ACT_II_MILESTONES: readonly TrophyMilestone[] = [
    // F7b-6: Builder w Akcie II (Tier 1 = 9 mocy, decyzja Mariusza 2026-08-07)
    { threshold: 1000, bolts: 240, labelKey: 'road.unlock.build' },
    { threshold: 1500, bolts: 280, labelKey: 'road.unlock.tower' },
];

/** Wszystkie milestony. Zawsze posortowane rosnaco po threshold. */
export const TROPHY_MILESTONES: readonly TrophyMilestone[] = [...ACT_I_MILESTONES, ...ACT_II_MILESTONES];

/** Najblizszy nieosiagniety milestone dla danej liczby trofeow (null = wszystkie zdobyte). */
export function getNextMilestone(trophies: number): TrophyMilestone | null {
    for (const m of TROPHY_MILESTONES) {
        if (m.threshold > trophies) return m;
    }
    return null;
}

/** Milestony przekroczone w runie (before < threshold <= after). */
export function getMilestonesCrossed(before: number, after: number): TrophyMilestone[] {
    return TROPHY_MILESTONES.filter(m => m.threshold > before && m.threshold <= after);
}

// ── ZRZUTY / skrzynki (F2a, design doc §4) ──────────────────────────────────
// ZASADA: skrzynki dropia KOSMETYKE + srubki, NIGDY moc/staty. Jawne pule + pity (§4.2).
import { cosmeticIdsOfRarity, type Rarity } from './cosmetics';

export const CRATE_RARITY_WEIGHTS: Record<Rarity, number> = { c: 60, r: 28, e: 10, l: 2 };
export const CRATE_BOLT_RANGE: Record<Rarity, readonly [number, number]> = {
    c: [30, 60], r: [60, 100], e: [100, 160], l: [200, 200],
};
/** Gdy pula kosmetykow danej rzadkosci wyczerpana -> jawna konwersja na srubki. */
export const CRATE_DUP_BOLTS: Record<Rarity, number> = { c: 40, r: 80, e: 140, l: 250 };
export const PITY_RARE_AT = 10;       // co 10. skrzynka: gwarantowany rzadki+ (§4.2)
export const PITY_LEGENDARY_AT = 30;  // co 30. skrzynka: gwarantowany legendarny

export interface CrateOpenResult {
    rarity: Rarity;
    cosmeticId: string | null;   // null = pula rzadkosci wyczerpana -> same srubki (konwersja)
    bolts: number;
    wasPity: boolean;
}

function rollRarity(rng: () => number, allowed: readonly Rarity[]): Rarity {
    const total = allowed.reduce((s, r) => s + CRATE_RARITY_WEIGHTS[r], 0);
    let x = rng() * total;
    for (const r of allowed) {
        x -= CRATE_RARITY_WEIGHTS[r];
        if (x < 0) return r;
    }
    return allowed[allowed.length - 1];
}

function randInt(rng: () => number, range: readonly [number, number]): number {
    const [lo, hi] = range;
    return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * Otwarcie skrzynki (CZYSTA funkcja — deterministyczna przy danym rng). openIndex =
 * 1-bazowy numer otwarcia (pityCounter+1) => pity: co 10. rzadki+, co 30. legendarny.
 * Losuje NIEPOSIADANY kosmetyk wylosowanej rzadkosci; pula pusta -> konwersja na srubki.
 */
export function openCrate(
    openIndex: number,
    rng: () => number,
    owned: readonly string[],
): CrateOpenResult {
    let rarity: Rarity;
    let wasPity = false;
    if (openIndex % PITY_LEGENDARY_AT === 0) { rarity = 'l'; wasPity = true; }
    else if (openIndex % PITY_RARE_AT === 0) { rarity = rollRarity(rng, ['r', 'e', 'l']); wasPity = true; }
    else { rarity = rollRarity(rng, ['c', 'r', 'e', 'l']); }

    const pool = cosmeticIdsOfRarity(rarity).filter(id => !owned.includes(id));
    let bolts = randInt(rng, CRATE_BOLT_RANGE[rarity]);
    let cosmeticId: string | null = null;
    if (pool.length > 0) {
        cosmeticId = pool[Math.floor(rng() * pool.length)];
    } else {
        bolts += CRATE_DUP_BOLTS[rarity]; // pula wyczerpana -> jawna konwersja
    }
    return { rarity, cosmeticId, bolts, wasPity };
}
