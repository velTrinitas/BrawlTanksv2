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
    twardy: { hp: 400, dmg: 150, reload: 380, speed: 5.0, maxDist: 800,  bulletRadius: 8 },
    // +40/pocisk (salwa 230): zysk przeciw poscigowym (500 HP), zero inflacji przeciw zwyklym
    heavy:  { hp: 700, dmg: 115, reload: 700, speed: 4.0, maxDist: 800,  bulletRadius: 8 },
    // najwiekszy pakiet: jako JEDYNY systematycznie wypadal ponizej modelu (-13 zabic).
    // 425 HP to swiadomy naddatek Mariusza ponad wyliczone 350.
    scout:  { hp: 425, dmg: 120, reload: 190, speed: 7.5, maxDist: 800,  bulletRadius: 8 },
    // 400 dmg = JEDEN strzal na zwyklego wroga; tempo 1000->750 (dalej wolny, ale kara za pudlo mniejsza)
    sniper: { hp: 350, dmg: 400, reload: 750, speed: 4.5, maxDist: 1300, bulletRadius: 8 },
    // tempo +25% (zyczenie Mariusza) + pierce; pierce byl wart +12 zabic w pomiarze
    plasma: { hp: 400, dmg: 130, reload: 400, speed: 5.0, maxDist: 1000, bulletRadius: 8, pierce: 3 },
    // zasieg 350 NIE zadzialal jako kara (zmierzone: mial 350 i byl pierwszy) — placi obrazeniami
    pyro:   { hp: 450, dmg: 40,  reload: 260, speed: 4.8, maxDist: 350,  bulletRadius: 8, volley: { count: 5, spread: 0.34 } },
    shadow: { hp: 300, dmg: 150, reload: 640, speed: 6.5, maxDist: 900,  bulletRadius: 8, dash: true },
    // spowolniony, nie oslabiony (patrz ustalenie 2)
    king:   { hp: 500, dmg: 220, reload: 800, speed: 5.5, maxDist: 800,  bulletRadius: 8 },
});
