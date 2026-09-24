/**
 * cloud.ts — GLOWNY WYLACZNIK CALEJ LACZNOSCI Z SUPABASE (v0.205.0).
 *
 * PO CO ISTNIEJE: realnym scenariuszem jest, ze polityka Poki nie dopusci ruchu do
 * zewnetrznego zaplecza. Bez tej flagi „odetnij Supabase" oznaczaloby reczne
 * odnalezienie kilkunastu punktow wyjscia w pieciu plikach — pod terminem, z ryzykiem
 * ze jedno wywolanie zostanie przeoczone i paczka zostanie odrzucona. Z flaga jest to
 * zmiana jednej stalej, a weryfikacja trwa 30 sekund: `?cloud=0` i zakladka Network
 * ma pokazac ZERO zadan do `*.supabase.co`.
 *
 * CO SIE STANIE PO WYLACZENIU: gra dziala w calosci. `ProfileService`
 * i `ProgressionService` trzymaja `localStorage` jako ZRODLO PRAWDY, a chmura zawsze
 * byla osobnym, best-effort concernem. Dzialaja: profil, progresja, trofea, kosmetyki,
 * sklep, skrzynki, wszystkie scenariusze. Znikaja WYLACZNIE rzeczy z natury sieciowe:
 * globalny ranking, sync miedzy urzadzeniami i telemetria.
 *
 * GDZIE SA STRAZNIKI: jawnie na wejsciu kazdej metody sieciowej w
 * `SupabaseProfileService`, `SupabaseProgressionService`, `SupabaseScoreService`
 * i `profileSync`. SWIADOMIE nie w `getSupabase()` — rzucanie albo zwracanie null
 * z singletona przeszloby przez `pushProfileToCloud()` do UI, ktore przy bledzie
 * NIE ZAPISUJE profilu lokalnie, czyli wylaczenie chmury zablokowaloby zakladanie konta.
 *
 * Telemetria ma WLASNA, starsza flage (`telemetry.ts`) i zostaje niezalezna: da sie
 * wylaczyc sama telemetrie, zostawiajac ranking. `isCloudEnabled() === false` wylacza
 * jednak i ja — to nadrzedny wylacznik calego ruchu wychodzacego.
 *
 * Wzorzec 1:1 z `telemetry.ts` / `shop.ts` (SHOP_LIVE).
 */

export const CLOUD_LIVE = true;

/**
 * Lacznosc z chmura aktywna?
 * `?cloud=0` wylacza caly ruch do Supabase bez redeployu (wzorzec `?telemetry=0`).
 */
export function isCloudEnabled(): boolean {
    try {
        if (new URLSearchParams(location.search).get('cloud') === '0') return false;
    } catch { /* brak location (test/SSR) — zostaje stala */ }
    return CLOUD_LIVE;
}
