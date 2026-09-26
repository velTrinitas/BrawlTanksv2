/**
 * tankArtFlag.ts — TANK ART v2 (rebuild wygladu czolgow gracza + juice strzalu).
 *
 * Wzorzec 1:1 ze skins.ts: kill switch kompilowany + parametr URL. `?tankart=1` wlacza przed
 * flipem, `?tankart=0` ZAWSZE wylacza (rollback bez deployu). Dotyczy WYLACZNIE gracza:
 * bake czolgu (TankSpriteBaker -> render2dV2), obrotnica Garazu, FX strzalu. Wrogowie i
 * render2d.ts sa nietkniete niezaleznie od flagi.
 */
export const TANK_ART_V2 = false;

export function isTankArtV2(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('tankart');
        if (q === '0') return false;
        if (TANK_ART_V2) return true;
        return q === '1';
    } catch { return TANK_ART_V2; }
}
