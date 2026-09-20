/**
 * balanceFlag.ts — kill switch REBALANSU ROSTERU (BALANCE_V2).
 *
 * UWAGA NAZEWNICZA: `src/config/flags.ts` to flagi PANSTW (FlagId na czolgu), NIE feature flags.
 * Balans dostaje wlasny plik, wzorcem `castleFlag.ts` / `queenFlag.ts` / `skins.ts`.
 *
 * DLACZEGO ZA FLAGA: rebalans zmienia sufit wynikow, wiec jego wlaczenie musi isc RAZEM z bumpem
 * `CURRENT_SCORE_VERSION` (4 -> 5) — a tego nie wolno ruszac do konca okna testow (23.09.2026).
 * Kod moze wejsc wczesniej, byle domyslnie wylaczony: dopoki `BALANCE_V2 === false`, gra liczy
 * dokladnie tak jak dzis i leaderboard nie miesza formul.
 *
 * NETCODE (COOP/MP): `BALANCE_RULESET_ID` to czesc kontraktu symulacji, obok `SIM_VERSION`
 * (`src/config/multiplayer.ts`). Dwoch graczy na roznych rulesetach = rozne obrazenia z tego samego
 * pocisku, czyli desync nie do zdiagnozowania. Handshake ma ODMOWIC startu, nie "jakos to bedzie".
 */

/** Kill switch kompilowany. Flip na `true` DOPIERO razem z bumpem score_version, po 23.09.2026. */
export const BALANCE_V2 = false;

/**
 * Ruleset aktywny w tej sesji. `?bal=0` wylacza mimo flagi, `?bal=1` wlacza przy wylaczonej —
 * ten sam wzorzec co `?skins=0` / `?castle=0` (v0.198.1: kazda flaga ON musi miec sciezke wyjscia).
 */
export function isBalanceV2Enabled(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('bal');
        if (q === '0') return false;
        if (BALANCE_V2) return true;
        return q === '1';
    } catch { return BALANCE_V2; }
}

/** Identyfikator rulesetu do handshake'u sieciowego, telemetrii i pola `sessions`. */
export function balanceRulesetId(): 'v1' | 'v2' {
    return isBalanceV2Enabled() ? 'v2' : 'v1';
}
