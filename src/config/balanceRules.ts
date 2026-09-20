/**
 * balanceRules.ts — BALANS JAKO DANE Z WERSJA (ruleset), nie liczby rozsypane po kodzie.
 *
 * Zrodlo wartosci v2: `tools/balance/solver.js` (kalibracja do SREDNIEJ indeksu dzisiejszego
 * rosteru = 76.4, zero power creep; rozrzut indeksu 3.36%). Pelny opis modelu i tego, czego on
 * NIE wie — `tools/balance/README.md`.
 *
 * DLACZEGO OSOBNY PLIK, A NIE EDYCJA `brawlers.ts`:
 *  1. rollback bez rebuildu (`?bal=0`) wymaga, zeby OBIE wersje istnialy naraz;
 *  2. COOP/MP: ruleset musi dac sie zidentyfikowac i porownac miedzy klientami (`balanceRulesetId`),
 *     a to jest niemozliwe, gdy liczby sa wpisane w jeden roster;
 *  3. kazdy przyszly tuning to diff w JEDNYM miejscu, a nie polowanie po plikach.
 *
 * POLA NOWE W v2 (w v1 `undefined` = dzisiejsze zachowanie globalne):
 *  - `maxDist`  — zasieg pocisku; dzis SZTYWNE 1000 dla wszystkich (`Bullet.ts:166`). Wchodzi w S2.
 *  - `bulletRadius` — UKRYTA statystyka celnosci: trafienie liczy sie jako `30 + radius`
 *     (`main.ts:4885`), wiec Zwiad/Snajper (4) mieli ~40% mniejsze pole trafienia niz King (10),
 *     czego UI nigdy nie pokazywalo.
 *  - `volley` — liczba pociskow w salwie i kat rozrzutu (Ogniarz: 5 pociskow, 0.34 rad).
 *  - `pierce` / `dash` — mechaniki tozsamosci (S3), tu tylko deklaracja danych.
 */

export interface BalanceStats {
    readonly hp: number;
    readonly dmg: number;
    readonly reload: number;
    readonly speed: number;
    /** Zasieg pocisku w px (S2). Brak = globalne 1000. */
    readonly maxDist?: number;
    /** Promien pocisku (pole trafienia = 30 + radius). Brak = mapa w `Bullet.ts`. */
    readonly bulletRadius?: number;
    /** Salwa: ile pociskow i jaki kat rozrzutu (rad). Brak = dzisiejsze offsety. */
    readonly volley?: { readonly count: number; readonly spread: number };
    /** Tech (S3): pocisk przebija do N wrogow z pelnym dmg. */
    readonly pierce?: number;
    /** Shadow (S3): dash — BEZ klatek nietykalnosci (decyzja Mariusza: i-frames lamia Czytelnosc). */
    readonly dash?: boolean;
}

export type BalanceRulesetId = 'v1' | 'v2';

/**
 * DASH (S3, Shadow) — decyzja Mariusza: 180 px, odnowienie 4 s, BEZ klatek nietykalnosci.
 * Dash jest UCIECZKA I SKROTEM, nie tarcza: gracz ma widziec, ze wyszedl z linii ognia, a nie
 * ze „przezyl mimo trafienia" (i-frames lamalyby Czytelnosc #1 — obrazenia bez widocznej przyczyny).
 *
 * WSZYSTKO W KROKACH LOGIKI, NIE W MILISEKUNDACH (regula `multiplayer-ready.md` #1 i #2):
 * zegar systemowy (`Date.now`) nie zatrzymuje sie w pauzie i rozjezdza klientow przy catch-upie
 * (`runLogicStep`, `?smooth=1`) — dokladnie ten dlug mamy juz w zegarach Zamku. Liczone w krokach:
 * dash trwa `steps` wywolan update i cooldown tyka `cooldownSteps` wywolan, identycznie u kazdego.
 * Przy 60 kroków/s: 9 krokow = 0.15 s lotu, 240 krokow = 4 s odnowienia.
 */
export const DASH_CONFIG = {
    /** Liczba krokow logiki, przez ktore czolg leci. */
    steps: 9,
    /** Dystans na KROK (px). 9 x 20 = 180 px calkowitego dystansu. */
    stepPx: 20,
    /** Odnowienie w krokach logiki (240 = 4 s przy 60 krokach/s). */
    cooldownSteps: 240,
} as const;

/** Calkowity dystans dasha w px — do UI i do math-verify trasy. */
export const DASH_TOTAL_PX = DASH_CONFIG.steps * DASH_CONFIG.stepPx;

/**
 * v2 — wynik solvera. Reload Ogniarza (220) i Twardego (400) byly ZABLOKOWANE: feel karabinu
 * i baseline cadence zostaja, solver szukal balansu pozostalymi osiami. Dlatego Ogniarz placi
 * zasiegiem (350 px) i szerszym rozrzutem — pelna salwa trafia jednego wroga tylko do ~118 px.
 */
export const BALANCE_V2_STATS: Readonly<Record<string, BalanceStats>> = Object.freeze({
    twardy: { hp: 400, dmg: 145, reload: 400, speed: 5.2, maxDist: 750,  bulletRadius: 7 },
    heavy:  { hp: 600, dmg: 125, reload: 860, speed: 4.3, maxDist: 750 },
    scout:  { hp: 250, dmg: 100, reload: 250, speed: 7.5, maxDist: 700,  bulletRadius: 7 },
    sniper: { hp: 350, dmg: 275, reload: 940, speed: 4.9, maxDist: 1300, bulletRadius: 6 },
    plasma: { hp: 450, dmg: 130, reload: 660, speed: 5.3, maxDist: 1000, pierce: 3 },
    pyro:   { hp: 400, dmg: 65,  reload: 220, speed: 4.5, maxDist: 350,  volley: { count: 5, spread: 0.34 } },
    shadow: { hp: 300, dmg: 185, reload: 580, speed: 6.9, maxDist: 850,  dash: true },
    king:   { hp: 500, dmg: 225, reload: 740, speed: 5.6, maxDist: 700 },
});
