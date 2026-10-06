/**
 * enigmaFlag.ts — ENIGMA, 9. czolg (gatling). ETAP 2: w grze za flaga, wzorzec 1:1 z tropicsArtFlag.ts.
 *
 * `?enigma=1` wlacza przed flipem, `?enigma=0` ZAWSZE wylacza (rollback bez deployu).
 * Flip = ENIGMA_LIVE true + bump SIM_VERSION (gatling zmienia symulacje strzalu) jednym commitem.
 * Dopoki flaga nie jest LIVE: wyniki Enigma NIE ida do rankingu (SupabaseScoreService).
 */
export const ENIGMA_LIVE = false;

export function isEnigmaEnabled(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('enigma');
        if (q === '0') return false;
        if (ENIGMA_LIVE) return true;
        return q === '1';
    } catch { return ENIGMA_LIVE; }
}
