/**
 * skins.ts — SKIN-1 (v0.159.0): flaga trybu "Barwy czolgu" (tank skins).
 *
 * Wzorzec 1:1 z hubChoose.ts/shop.ts. OSOBNA flaga od ?choose, bo skiny maja
 * powierzchnie poza Garazem: mecz (baker), sklep (tab+SKU), skrzynki (pula
 * dropow), kolekcja w Profilu. Kill switch odcina WSZYSTKIE te powierzchnie
 * naraz; dane sa odporne (equipped['tankSkin'] przy OFF jest po prostu
 * ignorowany, owned przechodzi merge — defy zostaja w rejestrze na zawsze).
 *
 * v0.198.0 (2026-09-19): DEFAULT ON — Mariusz przetestowal skiny na desktopie i mobile
 * („dzialaja super"). Rollback bez rebuildu: ?skins=0 (wzorzec ?choose=0 / ?hub=0).
 * UWAGA: `?choose` nie jest juz potrzebne — CHOOSE_LIVE=true od GARAZ-4.
 * Skiny sa od tego flipu towarem WYLACZNIE SKLEPOWYM (SHOP_ONLY_TYPES w cosmetics.ts):
 * pula dropow skrzynek zostaje nietknieta.
 */

export const SKINS_LIVE = true;

/** Tryb SKIN-1 aktywny? Kill switch kompilowany, ?skins=0 wylacza, ?skins=1 wlaczal przed flipem. */
export function isSkinsEnabled(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('skins');
        if (q === '0') return false;   // rollback: musi bic flage, inaczej nie ma jak wycofac bez deployu
        if (SKINS_LIVE) return true;
        return q === '1';
    } catch { return SKINS_LIVE; }
}

/**
 * GARAZ v2 / TRANSZA E+F (v0.199.0) — PRZYMIERZALNIA zamiast tasmy skinow w widoku
 * glownym Garazu. ON: hero + przycisk BARWY CZOLGU -> SkinsOverlay.
 * `?skinsmode=0`: wraca stara tasma pod obrotnica (pelna sciezka rollbacku —
 * obie zyja obok siebie do akceptacji Mariusza po playtescie).
 */
export const SKINS_MODE_LIVE = true;

export function isSkinsModeEnabled(): boolean {
    if (!isSkinsEnabled()) return false; // bez skinow nie ma czego przymierzac
    try {
        const q = new URLSearchParams(location.search).get('skinsmode');
        if (q === '0') return false;
        if (SKINS_MODE_LIVE) return true;
        return q === '1';
    } catch { return SKINS_MODE_LIVE; }
}
