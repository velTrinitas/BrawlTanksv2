/**
 * rangeFlag.ts — STRZELNICA (v0.209.0, KROK 3 planu po testach): flaga scenariusza 'range'.
 *
 * Wzorzec 1:1 z queenFlag.ts / castleFlag.ts. RANGE_LIVE = false NA STALE: to narzedzie
 * pomiarowe balansu (dev), nie tryb gry dla graczy. Bez `?range=1` hub jest bit-identyczny
 * (kafel nierenderowany w BattleSection, toast "wkrotce" na probie startu). SigmaTester
 * omija ten guard (control.start -> startGame bezposrednio), wiec bot nie potrzebuje flagi.
 *
 * Po co: bot na KTB dawal 22-82 zabic tym samym czolgiem — pomiar za tepy na strojenie.
 * Strzelnica = stale stanowiska, zero losowych spawnow, czas w KROKACH logiki.
 */

export const RANGE_LIVE = false;

/** Strzelnica dostepna? ?range=1 wlacza, ?range=0 wylacza; bez parametru = RANGE_LIVE. */
export function isRangeMode(): boolean {
    try {
        const v = new URLSearchParams(location.search).get('range');
        if (v === '0') return false;
        if (v === '1') return true;
        return RANGE_LIVE;
    } catch { return RANGE_LIVE; }
}
