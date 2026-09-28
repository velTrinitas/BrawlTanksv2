/**
 * desertCurse.ts — DESERT ART v2 / E4. JEDYNE zrodlo liczb klatwy piramidy
 * (wzorzec `queenTuning.ts`: zamrozony const, jeden plik = jeden pass tuningu).
 *
 * Wszystkie czasy w KROKACH LOGIKI (60 / s), nie w ms — licza sie w `runLogicStep`,
 * wiec catch-up i przyszly koop licza identycznie (multiplayer-ready #1/#2).
 *
 * `CURSE_RULESET_ID` idzie obok `SIM_VERSION`: rozjazd = odmowa startu meczu sieciowego.
 * SIM_VERSION NIE jest podbity, bo cala mechanika siedzi za flaga `?desertart=1`
 * (DESERT_ART_V2=false). Bump SIM_VERSION + ewentualne punkty (score_version) = flip flagi.
 */
export const CURSE_RULESET_ID = 'curse-v1';

import type { DifficultyId } from '../types/GameConfig';

/**
 * Obrazenia klatwy / Ra per poziom trudnosci (decyzja Mariusza 2026-09-28: pierwotne liczby
 * wygladaly na „koszmar" na kazdym poziomie). Koszmar = wartosci sprzed skalowania.
 * Maks. obrazenia Ra przy ~1/3 trafien: latwy ~70, normalny ~120, trudny ~175, koszmar ~250.
 */
export const CURSE_BY_DIFFICULTY: Readonly<Record<DifficultyId, {
    raBalls: number; raDmg: number; raDirectEvery: number;
    fogDps: number; deathCloudDmg: number;
}>> = Object.freeze({
    easy:      { raBalls: 14, raDmg: 15, raDirectEvery: 5, fogDps: 4, deathCloudDmg: 15 },
    normal:    { raBalls: 18, raDmg: 20, raDirectEvery: 4, fogDps: 5, deathCloudDmg: 20 },
    hard:      { raBalls: 24, raDmg: 22, raDirectEvery: 3, fogDps: 6, deathCloudDmg: 22 },
    nightmare: { raBalls: 30, raDmg: 25, raDirectEvery: 3, fogDps: 8, deathCloudDmg: 25 },
});

export const DESERT_CURSE = Object.freeze({
    /** Suma obrazen od POCISKOW GRACZA w oknie, ktora budzi klatwe. */
    threshold: 500,
    /** Okno sumowania obrazen (5 s). Starsze trafienia wypadaja. */
    windowSteps: 300,
    /** Od tego ulamka progu piramida drzy + pyli + zielona poswiata (telegraf). */
    telegraphFrac: 0.6,
    /** Po zdjeciu / wygasnieciu klatwy TA piramida spi 60 s (uwaga Mariusza); inne dzialaja niezaleznie. */
    cooldownSteps: 3600,
    /** Mumia wychodzi z mgly po tylu krokach od triggera (czas na reakcje). */
    emergeSteps: 75,
    /** Klatwa sama wygasa po 45 s (mumia wraca do piramidy) — nikt nie jest scigany wiecznie. */
    lifeSteps: 2700,

    /** Zielona mgla z wejscia (N) przy przebudzeniu: duza strefa, gasnie po 10 s, podgryza HP. */
    fogRadius: 240,
    fogSteps: 600,            // obrazenia mgly: CURSE_BY_DIFFICULTY.fogDps
    /** Chmurka przy smierci mumii: 20% wieksza niz dotychczasowy rozprysk (obrazenia: CURSE_BY_DIFFICULTY). */
    deathCloudRadius: 110,
    deathCloudSteps: 150,

    mummyHp: 300,
    mummySpeed: 1.1,          // px / krok — wolniej niz kazdy czolg
    mummyScale: 1.5,          // uwaga Mariusza: +50%
    mummyHitRadius: 39,       // 26 * 1.5
    /** Promien kolizji mumii z przeszkodami (nie wchodzi na piramidy/skaly/rzeke). */
    mummyBodyRadius: 18,
    /** Poza tym dystansem od piramidy mumia i stado zawracaja (zasieg klatwy). */
    leashRange: 900,

    scarabCount: 16,          // uwaga Mariusza: x2 (polowa wchodzi na czolg, polowa krazy)
    scarabSpeed: 3.6,         // px / krok — wolniej niz najwolniejszy czolg (4)
    scarabHitRadius: 11,
    /** Skarabeusze szukaja gracza na CALEJ mapie (bez smyczy). Krazacy: promien i predkosc orbity. */
    orbitRadius: 62,
    orbitSpeed: 5.5,          // krazacy musza nadazyc za czolgiem
    /** Maks. skarabeuszy naraz NA kadlubie (reszta z roli „wspinacz" dolacza do orbity). */
    maxAttached: 6,
    /** Dystans przyklejenia do kadluba. */
    attachRange: 30,
    /** Skarabeusze TYLKO przeszkadzaja (uwaga Mariusza) — oblepiaja czolg, zero obrazen. */
    scarabBodyRadius: 6,
    /** Po smierci mumii: tyle krokow ucieczki, potem zakopanie w piasku. */
    scarabFleeSteps: 50,
    scarabBurrowSteps: 30,
    /**
     * E7 — zdarzenia per piramida (indeks w DESERT_PYRAMID_LAYOUT; uwaga Mariusza 2026-09-28):
     *   0 (540,2160)  — klatwa mumii (powtarzalna, cooldown 60 s),
     *   1 (1650,2460) — „na dole": ZEMSTA RA (jednorazowo),
     *   2 (2550,1260) — „po prawej za rzeka": ARCHEOLODZY (jednorazowo, niegrozni).
     */
    pyramidEvents: ['mummy', 'ra', 'archaeologists'] as const,
    archaeologistCount: 3,
    /** Zemsta Ra: luk lotu, promien razenia (= telegraf), zasieg celowania. Liczba kul i obrazenia: CURSE_BY_DIFFICULTY. */
    raArc: 170,
    raHitRadius: 55,
    raReach: 1300,
    /** Odpada sam po 4 s. */
    stickSteps: 240,
    /** Po odpadnieciu (czas / dash) nie wraca przez 1 s. */
    regroupSteps: 60,
    /** Obrazenia z mgly naliczane paczkami co 0.5 s (czytelny feedback, nie spam). */
    damageTickSteps: 30,
});
