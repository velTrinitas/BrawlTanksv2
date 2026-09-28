/**
 * desertArtFlag.ts — DESERT ART v2 (nowy look Pustyni: fake-3D, mniejsze collidery,
 * brak deadzonow, klatwa piramidy).
 *
 * Wzorzec 1:1 z tankArtFlag.ts: kill switch kompilowany + parametr URL. `?desertart=1` wlacza
 * przed flipem, `?desertart=0` ZAWSZE wylacza (rollback bez deployu). Balans wrogow, pady,
 * spawn gemow sa nietkniete niezaleznie od flagi.
 */
export const DESERT_ART_V2 = false; // flip po playtescie A54

export function isDesertArtV2(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('desertart');
        if (q === '0') return false;
        if (DESERT_ART_V2) return true;
        return q === '1';
    } catch { return DESERT_ART_V2; }
}
