/**
 * castleArtFlag.ts — CASTLE ART v2 (juicy Zamek: glebia fosy, mosty z desek, bruk dziedzinca,
 * dlugie cienie, majestat bryly, tani ruch wody/dymu).
 *
 * Wzorzec 1:1 z desertArtFlag.ts: kill switch kompilowany + parametr URL. `?castleart=1` wlacza
 * przed flipem, `?castleart=0` ZAWSZE wylacza (rollback bez deployu). Czysty wizual: hitboxy,
 * fale, HP i slow fosy sa nietkniete niezaleznie od flagi (brak wplywu na symulacje).
 */
export const CASTLE_ART_V2 = true; // v0.252.0 FLIP (rollback ?castleart=0)

export function isCastleArtV2(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('castleart');
        if (q === '0') return false;
        if (CASTLE_ART_V2) return true;
        return q === '1';
    } catch { return CASTLE_ART_V2; }
}
