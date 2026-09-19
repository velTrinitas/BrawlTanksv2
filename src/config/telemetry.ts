/**
 * telemetry.ts — Z0.9 (COOP ETAP 0, v0.151.0): flaga telemetrii bazowej.
 *
 * Wzorzec 1:1 z shop.ts (SHOP_LIVE). Kill switch kompilowany — wylaczenie
 * telemetrii to flip stalej + deploy, zero innych zmian.
 *
 * RODO (decyzja Mariusza 2026-09-04): TELEMETRY_LIVE = true od startu.
 * Wysylamy WYLACZNIE dane techniczne bez identyfikatorow (bez profile_id,
 * session_id, nicku, pelnego user-agenta) — wiersza nie da sie powiazac
 * z osoba, wiec nie sa to dane osobowe. Wpis do polityki prywatnosci
 * ("anonimowe dane techniczne o wydajnosci") = osobna karta w backlogu
 * (mandatory / law requirement).
 */

export const TELEMETRY_LIVE = true;

/**
 * Telemetria aktywna? (kill switch — patrz naglowek)
 * v0.198.1: `?telemetry=0` wylacza wysylke bez redeployu (wzorzec `?castle=0`/`?skins=0`).
 */
export function isTelemetryEnabled(): boolean {
    try {
        if (new URLSearchParams(location.search).get('telemetry') === '0') return false;
    } catch { /* brak location (test/SSR) — zostaje stala */ }
    return TELEMETRY_LIVE;
}
