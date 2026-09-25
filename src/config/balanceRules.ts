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
    /** v0.211.0 Snajper: po PIERWSZYM trafieniu kolejne cele na linii dostaja tyle dmg (pierce z redukcja). */
    readonly pierceDmgAfter?: number;
    /** v0.211.0 Zwiad/Shadow: mnoznik bonusu czerwonej kostki (+% dmg) — przy 5 strz./s pelny bonus „wyrywal". */
    readonly cubeDmgMult?: number;
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
 * v2 — ITERACJA 1 (v0.201.0). Wartosci NIE pochodza juz z solvera: solver oblal walidacje empiryczna
 * (obiecywal +-5%, pomiar dal 270% rozrzutu — gorzej niz dzisiejsze 190%), bo wazyl ZASIEG, ktory
 * w pomiarze nie mial zadnego zwiazku z wynikiem.
 *
 * ZRODLO: model wyciagniety z NASZYCH 16 pomiarow bota (8 czolgow x 2 rulesety):
 *   `zabicia ≈ 0.068 × (DPS × (pole_trafienia/40)²) + 14.6`   (korelacja 0.83)
 * Najsilniejsze czynniki: surowe DPS (0.76) i PROMIEN POCISKU (0.62). Zasieg: brak zwiazku.
 *
 * TRZY USTALENIA, KTORE UKSZTALTOWALY TE LICZBY (zwykly wrog ma 300 HP — `enemies.ts`):
 *  1. Progi strzalow biją procenty. Pancerny +50 dmg nic nie dawal (salwa 150 i 250 to TAK SAMO
 *     dwie salwy na wroga). Twardy 100 -> 150 to realny przeskok z 3 strzalow na 2.
 *  2. Kinga nie da sie oslabic obrazeniami (200 -> 150 dalej zabija w 2 strzalach) — tylko TEMPEM.
 *  3. Zwiad i Snajper mieli promien pocisku 4, King i Ogniarz 10. Pole trafienia = `30 + promien`,
 *     wiec ich pole bylo mniejsze o 28% POWIERZCHNI — ukryta kara, ktorej gracz nie widzi w UI.
 *     Decyzja Mariusza: WYROWNAC WSZYSTKIM DO 8 i nie uzywac promienia jako dzwigni strojenia.
 *
 * `speed` (predkosc ruchu) CELOWO nietknieta — jedna zmienna mniej przy pomiarze porownawczym.
 * Zasieg zostaje jako TOZSAMOSC (Ogniarz 350 = miotacz, Snajper 1300 = najdalej), nie jako balans.
 */
export const BALANCE_V2_STATS: Readonly<Record<string, BalanceStats>> = Object.freeze({
    // dmg 100->150 = prog 2 strzalow zamiast 3; tempo +5%
    // ITERACJA 3 (KTB Mariusza: „bardzo dobry"): nerf TEMPEM 380 -> 420, nie dmg — 140 dmg = 3 strzaly = czas V1.
    twardy: { hp: 400, dmg: 150, reload: 420, speed: 5.0, maxDist: 800,  bulletRadius: 8 },
    // +40/pocisk (salwa 230): zysk przeciw poscigowym (500 HP), zero inflacji przeciw zwyklym
    // ITERACJA 2 (2026-09-25, Strzelnica): V1 = V2 co do setnej (34.1 s) — prog 2 salw na 300 HP
    // zjada kazdy dmg ponizej 150/pocisk. Jedyna dzwignia, ktora dziala, to tempo: 700 -> 560 (+25%).
    heavy:  { hp: 700, dmg: 115, reload: 560, speed: 4.0, maxDist: 800,  bulletRadius: 8 },
    // najwiekszy pakiet: jako JEDYNY systematycznie wypadal ponizej modelu (-13 zabic).
    // 425 HP to swiadomy naddatek Mariusza ponad wyliczone 350.
    // ITERACJA 3 (KTB: „bardzo dobry, za szybko strzela"): tempo 190 -> 215 (100 dmg = te same 3 strzaly, nic nie zmienia);
    // czerwona kostka daje mu POLOWE bonusu (Mariusz: „power dodaje tylko 1 punkt").
    scout:  { hp: 425, dmg: 120, reload: 215, speed: 7.5, maxDist: 800,  bulletRadius: 8, cubeDmgMult: 0.5 },
    // 400 dmg = JEDEN strzal na zwyklego wroga; tempo 1000->750 (dalej wolny, ale kara za pudlo mniejsza)
    // ITERACJA 3 (zyczenie Mariusza): PRZEBICIE — pocisk zabija pierwszego (400) i leci dalej, kolejny na linii dostaje 100.
    sniper: { hp: 350, dmg: 400, reload: 750, speed: 4.5, maxDist: 1300, bulletRadius: 8, pierce: 2, pierceDmgAfter: 100 },
    // tempo +25% (zyczenie Mariusza) + pierce; pierce byl wart +12 zabic w pomiarze
    plasma: { hp: 400, dmg: 130, reload: 400, speed: 5.0, maxDist: 1000, bulletRadius: 8, pierce: 3 },
    // ITERACJA 2 (2026-09-25, Strzelnica): wachlarz 5 x 0.34 rad (78 st.) byl 3.4x szerszy niz V1 (23 st.)
    // — poza ~100 px trafial tylko srodkowy pocisk (celnosc 34% -> 18%, suma 22.6 -> 36.0 s, Mariusz:
    // "za szeroki spread, ciezko z bossem"). Wracamy do salwy V1 (3 x 50 co 0.2 rad, 210 ms);
    // zasieg 350 -> 500, zeby nie musial stac w zasiegu pociskow bossa (200 dmg = 44% HP).
    // ITERACJA 3 (KTB: „znowu dobry"): nerf tempem 210 -> 235. dmg 50 ZOSTAJE: 3 x 50 = 150 = 2 salwy na 300 HP;
    // kazda wartosc < 50 = 3 salwy = powrot do 36 s (zmierzone).
    pyro:   { hp: 450, dmg: 50,  reload: 235, speed: 4.8, maxDist: 500,  bulletRadius: 8, volley: { count: 3, spread: 0.2 } },
    // ITERACJA 3 (KTB: „zbyt wolno strzela"; Strzelnica: najwolniejszy, 34 s): tempo 640 -> 560; kostka polowa jak Zwiad.
    shadow: { hp: 300, dmg: 150, reload: 560, speed: 6.5, maxDist: 900,  bulletRadius: 8, dash: true, cubeDmgMult: 0.5 },
    // spowolniony, nie oslabiony (patrz ustalenie 2)
    // ITERACJA 2 (2026-09-25, Strzelnica): reload 800 = -37% tempa vs V1 i suma 22.6 -> 33.8 s, a 220 dmg
    // nic nie daje (prog 2 strzalow na 300 HP). Strzelnica V1 stawia Kinga w SRODKU stawki (bot 61 zabic
    // w KTB to byl artefakt stylu bota). 800 -> 620 = -20% tempa; dmg 220 zostaje (lekki plus na bossie).
    // ITERACJA 3 (KTB: „OK"): zasieg 800 -> 700 (zyczenie); super szerszy w main.v2SuperLayout.
    king:   { hp: 500, dmg: 220, reload: 620, speed: 5.5, maxDist: 700,  bulletRadius: 8 },
});
