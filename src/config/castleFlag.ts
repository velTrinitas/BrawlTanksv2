/**
 * castleFlag.ts — OBRON ZAMEK F1 (2026-09-10): flaga scenariusza "Defend the Castle".
 *
 * Wzorzec 1:1 z hubChoose.ts / shop.ts. Przy OFF (default) hub i menu renderuja sie
 * DOKLADNIE jak dotad: karta Zamku zablokowana (klodka), toast "wkrotce" na probie
 * startu, ranking Zamku enabled:false. Scenariusz buduje sie i playtestuje za
 * `?castle=1`; `?castle=0` wylacza nawet po flipie CASTLE_LIVE (rollback bez rebuildu).
 *
 * Ranking + whitelist Edge Function dla ('castle','castle_grounds') = zaplecze,
 * redeploy PO 23.09.2026 (okno testow). Do tego czasu CASTLE_LIVE zostaje false.
 */

export const CASTLE_LIVE = true; // v0.178.0 (2026-09-14, decyzja Mariusza): PROD; ?castle=0 = rollback bez rebuildu. Ranking/Edge whitelist nadal PO 23.09 (wynik zamku nie idzie do Supabase).

/** Scenariusz Zamku aktywny? Kill switch kompilowany; ?castle=1 wlacza, ?castle=0 wylacza. */
export function isCastleMode(): boolean {
    try {
        const v = new URLSearchParams(location.search).get('castle');
        if (v === '0') return false;
        if (v === '1') return true;
        return CASTLE_LIVE;
    } catch { return CASTLE_LIVE; }
}
