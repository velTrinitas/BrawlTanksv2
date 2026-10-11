/**
 * playability.ts — FAZA GRYWALNOSC (v0.245.0): jeden plik = jeden tuning pass "lzejszej gry".
 *
 * Decyzja Mariusza (2026-10-10): na Trudnym i Koszmarze nie da sie wygrac. Cel: lekkie ulatwienie,
 * Trudny = Normalny +5%, Koszmar = Normalny +10% (tabela w difficulty.ts), plus pakiet pomocy:
 * gemy na start, 3 s spokoju, czestsze/dluzsze serca i magnesy, szybsze medi pady, dluzsze turbo,
 * premia za wygrana i punkty za leczenie na padzie.
 *
 * Rollback bez rebuildu: `?bal3=0` (wraca stary ruleset trudnosci i stare liczby pickupow/padow).
 * Uwaga: `?bal3=0` NIE cofa SCORE_VERSION (ranking juz na 6) — wynik z rollbacku liczy sie jak v3.
 *
 * NETCODE (COOP/MP): `difficultyRulesetId()` idzie do handshake'u obok SIM_VERSION i rosteru
 * (`balanceRulesetId`). Rozjazd = odmowa startu meczu sieciowego.
 */

import type { DifficultyId } from '../types/GameConfig';
import { ENEMY_MEGA_BOSS, type EnemyConfig } from './enemies';

/** Kill switch kompilowany. FLIP v0.245.0 (2026-10-10). */
export const PLAYABILITY_V3 = true;

let cached: boolean | null = null;

/** `?bal3=0` wylacza mimo flagi, `?bal3=1` wlacza przy wylaczonej. Liczone raz na sesje. */
export function isPlayabilityV3(): boolean {
    if (cached !== null) return cached;
    let v = PLAYABILITY_V3;
    try {
        const q = new URLSearchParams(location.search).get('bal3');
        if (q === '0') v = false;
        else if (q === '1') v = true;
    } catch { /* brak location (node/test) — zostaje flaga */ }
    cached = v;
    return v;
}

/** Identyfikator rulesetu trudnosci/pickupow do handshake'u sieciowego. */
export function difficultyRulesetId(): 'd1' | 'd3' {
    return isPlayabilityV3() ? 'd3' : 'd1';
}

const pick = <T>(v3: T, legacy: T): T => (isPlayabilityV3() ? v3 : legacy);

// ── Start meczu ─────────────────────────────────────────────────────────────

/** Spokoj na starcie (s czasu meczu): zaden wrog nie spawnuje sie przez ten czas (KTB). */
export function startNoSpawnSeconds(): number { return pick(3, 0); }

/** Darmowe gemy rozsypane w polu widzenia gracza na starcie (KTB + Zamek). 8 = 2 zabicia do supera. */
export function startGemCount(): number { return pick(8, 0); }
/** Pierscien rozsypania gemow startowych wokol gracza (px swiata; widok mobile przy zoom 0.6). */
export const START_GEM_RING_MIN = 250;
export const START_GEM_RING_MAX = 450;

// ── Serca ───────────────────────────────────────────────────────────────────

/** Interwal serc w KTB i CTF (klatki @60). +20% czestosci: 360 -> 300. */
export function heartIntervalKtb(): number { return pick(300, 360); }
/** Interwal serc w Zamku i Krolowej. +20% czestosci: 420 -> 350. */
export function heartIntervalCastle(): number { return pick(350, 420); }
/** Czas zycia serca na mapie (ms). +5 s: 15000 -> 20000. Ostatnie 3 s miga jak dotad. */
export function heartLifetimeMs(): number { return pick(20000, 15000); }

// ── Magnesy ─────────────────────────────────────────────────────────────────

/** Interwal magnesu (klatki). +10% czestosci: 900 -> 818. */
export function magnetIntervalFrames(): number { return pick(818, 900); }
/** Czas dzialania magnesu (ms). +3 s: 5000 -> 8000. */
export function magnetActiveMs(): number { return pick(8000, 5000); }

// ── Pady ────────────────────────────────────────────────────────────────────

/** Czas naprawy na medi padzie (ms). x0.7: 2250 -> 1575. Wspolne dla wszystkich klas padow. */
export function medPadRepairMs(): number { return pick(1575, 2250); }
/** Czas turbo z power pada (ms). +2 s: 5000 -> 7000. Wspolne dla wszystkich klas padow. */
export function powerPadTurboMs(): number { return pick(7000, 5000); }
/** Punkty za leczenie na medi padzie — TYLKO gdy pad faktycznie leczy (HP < max). Bez mnoznika trudnosci. */
export function medPadScore(): number { return pick(35, 0); }

// ── Wynik ───────────────────────────────────────────────────────────────────

/** Mnoznik wyniku za trudnosc — proporcjonalny do nowej trudnosci (+5% / +10%). */
export function difficultyScoreMult(d: DifficultyId): number {
    if (isPlayabilityV3()) return d === 'hard' ? 1.1 : d === 'nightmare' ? 1.2 : 1.0;
    return d === 'hard' ? 1.2 : d === 'nightmare' ? 1.4 : 1.0;
}

/** Premia za wygrana (po mnozniku, jak Perfect Run). */
export function victoryBonus(d: DifficultyId): number {
    if (!isPlayabilityV3()) return 0;
    return d === 'normal' ? 25 : d === 'hard' ? 75 : d === 'nightmare' ? 150 : 0;
}

// ── Mega Boss ───────────────────────────────────────────────────────────────

/** Szansa telegrafowanego uniku mega bossa per wykryty pocisk (cooldown 2.5 s w Enemy.ts). Legacy: brak uniku. */
export function megaDodgeChance(d: DifficultyId): number {
    if (!isPlayabilityV3()) return 0;
    return d === 'easy' ? 0.20 : d === 'normal' ? 0.30 : d === 'hard' ? 0.35 : 0.40;
}

/** Statystyki mega bossa: HP -10%, predkosc +10%, ogien +10%, pocisk -20%. Legacy = enemies.ts. */
export function megaBossOverrides(): { hp: number; speedMin: number; speedMax: number; shootIntervalMs: number; bulletDmg: number } | null {
    if (!isPlayabilityV3()) return null;
    return { hp: 1800, speedMin: 2.2, speedMax: 3.1, shootIntervalMs: 900, bulletDmg: 160 };
}

/** Bazowy config mega bossa z nadpisaniami v3 (przed skalowaniem trudnosci w scaleConfig). */
export function megaBossBase(): EnemyConfig {
    const o = megaBossOverrides();
    return o ? { ...ENEMY_MEGA_BOSS, ...o } : ENEMY_MEGA_BOSS;
}
