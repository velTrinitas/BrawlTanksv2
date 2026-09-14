/**
 * queenFlag.ts — SAVE THE QUEEN Q1 (2026-09-11): flaga scenariusza "Uratuj Krolowa".
 *
 * Wzorzec 1:1 z castleFlag.ts / hubChoose.ts / shop.ts. Przy OFF (default) hub i menu
 * renderuja sie DOKLADNIE jak dotad: kafel Krolowej NIE jest renderowany w hubie
 * (jak dotychczasowy save_king), toast "wkrotce" na probie startu, ranking enabled:false.
 * Scenariusz buduje sie i playtestuje za `?queen=1`; `?queen=0` wylacza nawet po
 * flipie QUEEN_LIVE (rollback bez rebuildu).
 *
 * Ranking + whitelist Edge Function dla ('save_queen','dungeon') = zaplecze,
 * redeploy PO 23.09.2026 (okno testow, razem z Zamkiem). Do tego czasu QUEEN_LIVE = false.
 */

export const QUEEN_LIVE = true; // v0.178.0 (2026-09-14, decyzja Mariusza): PROD; ?queen=0 = rollback bez rebuildu. Ranking/Edge whitelist nadal PO 23.09 (wynik Krolowej nie idzie do Supabase).

/** Q6 tutorial scenariusza: raz na urzadzenie (bt2:queen_tut_done); ?queentut=1 wymusza, ?queentut=0 pomija. */
export function queenTutorialWanted(): boolean {
    try {
        const v = new URLSearchParams(location.search).get('queentut');
        if (v === '0') return false;
        if (v === '1') return true;
        return localStorage.getItem('bt2:queen_tut_done') !== '1';
    } catch { return false; }
}
export function markQueenTutorialDone(): void { try { localStorage.setItem('bt2:queen_tut_done', '1'); } catch { /* prywatny tryb */ } }

/** Scenariusz Krolowej aktywny? Kill switch kompilowany; ?queen=1 wlacza, ?queen=0 wylacza. */
export function isQueenMode(): boolean {
    try {
        const v = new URLSearchParams(location.search).get('queen');
        if (v === '0') return false;
        if (v === '1') return true;
        return QUEEN_LIVE;
    } catch { return QUEEN_LIVE; }
}
