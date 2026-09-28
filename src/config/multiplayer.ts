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
 *  (uzupelnione wstecz, COOP S0: miedzy 1 a 2 symulacje zmienily tez OBRON ZAMEK v0.162+,
 *   SAVE THE QUEEN v0.174+, Strzelnica v0.209 i BALANCE_V2 v0.212 — bez bumpu w tamtym czasie;
 *   wersja 2 obejmuje ich stan).
 *  2 — DESERT ART v2 na produkcji (v0.218.0): nowe kolizje Pustyni (piramidy/sfinks pad 30,
 *      katarakty, obrzeze 28, piaskowiec, zabytki zniszczalne, jeep), petla karawany,
 *      klatwa piramidy / Zemsta Ra (DamageSource curse_fog / ra_fire, CURSE_RULESET_ID).
 *  3 — COOP S0 (v0.219.0): SMOOTH domyslnie ON — logika w stalych krokach 60 Hz
 *      (runLogicStep(1) + catch-up do 3 krokow) zamiast zmiennej delty; rollback ?smooth=0.
 *  4 — COOP S1 (v0.220.0): SimClock — cooldowny, moce, zamrozenie, combo, pickupy, pady i timery
 *      propsow map licza z simNowMs() (rosnie tylko w krokach logiki) zamiast Date.now().
 *  5 — COOP S5 (v0.222.0): petle players[] (strefy, stealth per gracz, pickupy, pady, pociski wrogow,
 *      taran, klatwa/Ra/Yeti), netId encji, Bullet.ownerIndex + playerIndex w DamageSource.
 *  6 — COOP S6 (v0.223.0): krok logiki czyta sterowanie WYLACZNIE z PlayerInput (kwantyzowany:
 *      ruch 1/127, aim w swiecie int px); dash i moce z kolejki w kroku, nie w handlerze zdarzen.
 *  7 — COOP S7 (v0.224.0): PowerSystem na gracza (aura/cooldowny/magnes per gracz), efekty swiatowe
 *      (freeze/disco/pong/widmo/strach) agregowane po instancjach, macierz mocy koopa (Tier 1 bez Widma).
 */
export const SIM_VERSION = 7;
