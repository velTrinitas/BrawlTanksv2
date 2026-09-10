/**
 * skins.ts — SKIN-1 (v0.159.0): flaga trybu "Barwy czolgu" (tank skins).
 *
 * Wzorzec 1:1 z hubChoose.ts/shop.ts. OSOBNA flaga od ?choose, bo skiny maja
 * powierzchnie poza Garazem: mecz (baker), sklep (tab+SKU), skrzynki (pula
 * dropow), kolekcja w Profilu. Kill switch odcina WSZYSTKIE te powierzchnie
 * naraz; dane sa odporne (equipped['tankSkin'] przy OFF jest po prostu
 * ignorowany, owned przechodzi merge — defy zostaja w rejestrze na zawsze).
 *
 * Playtest: ?choose=1&skins=1 (pasek skinow w Garazu wymaga OBU flag).
 */

export const SKINS_LIVE = false;

/** Tryb SKIN-1 aktywny? Kill switch kompilowany + ?skins=1 (dev/playtest). */
export function isSkinsEnabled(): boolean {
    try {
        if (SKINS_LIVE) return true;
        return new URLSearchParams(location.search).get('skins') === '1';
    } catch { return false; }
}
