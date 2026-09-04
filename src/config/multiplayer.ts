/**
 * multiplayer.ts — Z0.8 (COOP ETAP 0): kill switch modulu multiplayera + wersja symulacji.
 *
 * Wzorzec 1:1 z shop.ts (SHOP_LIVE + isShopEnabled + isShopSandbox) — spojnosc projektu.
 *
 * MP_LIVE = false do konca ETAPU 2 (koop lokalny). Zaden kod jeszcze tego nie
 * importuje — Vite tree-shakuje modul, wiec build jest bitowo tozsamy z v0.154.0.
 * Kazda przyszla powierzchnia koopa (sekcja w hubie, ekran dolaczania, logika
 * meczu wieloosobowego) MUSI byc bramkowana przez isMultiplayerEnabled().
 */

export const MP_LIVE = false;

/** Sekcja KOOP widoczna: zawsze przy MP_LIVE, inaczej tylko za flaga ?mp=1 (dev preview). */
export function isMultiplayerEnabled(): boolean {
    try {
        if (MP_LIVE) return true;
        return new URLSearchParams(location.search).get('mp') === '1';
    } catch { return false; }
}

/** Piaskownica multiplayera aktywna zawsze, gdy modul dziala spoza produkcji. */
export function isMultiplayerSandbox(): boolean {
    return !MP_LIVE;
}

/**
 * SIM_VERSION — wersja symulacji rozgrywki. BIJ PRZY KAZDEJ zmianie wplywajacej
 * na przebieg symulacji: krok logiki, RNG (Rng.ts / rozklad strumieni), formuly
 * obrazen/predkosci, kolizje, spawny, zachowanie AI.
 *
 * Po co: mamy udokumentowany przypadek stalego cache GitHub Pages (fetch pokazywal
 * v0.65.0 przy realnym v0.67.0). W koopie stary klient w pokoju z nowym = rozjazd
 * swiata — klasa bledow niemozliwych do odtworzenia. Serwer/host odrzuci klienta
 * z innym SIM_VERSION zamiast grac w dwa rozne swiaty.
 *
 * Historia:
 *  1 — stan symulacji na koniec ETAPU 0 (v0.154.0): fixed-step OFF, seeded RNG
 *      (mulberry32, worldRng/ambientRng), DamageSource, resolveEnemyTarget.
 */
export const SIM_VERSION = 1;
