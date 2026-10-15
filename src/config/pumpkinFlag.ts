/**
 * pumpkinFlag.ts — PUMPKIN, czolg sezonu 4 (Dia de los Muertos). ETAP 2: w grze za flaga, wzorzec 1:1 z enigmaFlag.ts.
 *
 * `?pumpkin=1` wlacza przed flipem, `?pumpkin=0` ZAWSZE wylacza (rollback bez deployu).
 * Flip = PUMPKIN_LIVE true + bump SIM_VERSION (nowy czolg w rosterze koopa) jednym commitem.
 * Dopoki flaga nie jest LIVE: wyniki Pumpkina NIE ida do rankingu (SupabaseScoreService).
 */
export const PUMPKIN_LIVE = false;

export function isPumpkinEnabled(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('pumpkin');
        if (q === '0') return false;
        if (PUMPKIN_LIVE) return true;
        return q === '1';
    } catch { return PUMPKIN_LIVE; }
}
