/**
 * tropicsArtFlag.ts — TROPICS ART v2 (nowy look Tropikow: fake-3D, pieczone budynki, zwierzeta 3/4,
 * zdarzenia farmy). Wzorzec 1:1 z desertArtFlag.ts.
 *
 * `?tropicsart=1` wlacza przed flipem, `?tropicsart=0` ZAWSZE wylacza (rollback bez deployu).
 * Flip = TROPICS_ART_V2 true + bump SIM_VERSION (gdy wejda zdarzenia T6) jednym commitem.
 */
export const TROPICS_ART_V2 = false;

export function isTropicsArtV2(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('tropicsart');
        if (q === '0') return false;
        if (TROPICS_ART_V2) return true;
        return q === '1';
    } catch { return TROPICS_ART_V2; }
}
