/**
 * shotFx.ts — TANK ART v2: JUICE ZWYKLEGO STRZALU, dane per czolg (jeden plik = jeden tuning pass).
 *
 * Czysto wizualne (bramka COOP: stan lokalny, zero wplywu na symulacje). Wyjatek: `hitStopFrames`
 * = klatki pauzy calej petli przy trafieniu — istniejacy mechanizm `triggerHitStop` (main.ts).
 * Przy `?smooth=1` early-return hit-stopu stoi PRZED akumulatorem czasu, wiec zamrozone ms nie
 * staja sie dlugiem catch-upu (sprawdzone: main.ts ~4001 vs ~4016) — brak „mikro-zrywu" po pauzie.
 *
 * Mobile: kazdy strzal = 1 sprite stozka + `smoke` dymkow + `sparks` iskier z ISTNIEJACEJ puli
 * (MAX_PARTICLES 200 nietkniety). Zwiad 4 strz./s x 8 = 32 czastki/s, zycie ~0.3 s => ~10 naraz.
 */
export interface ShotFx {
    /** Kolor rozblysku / smugi / iskier (hex PIXI). Domyslnie kolor czolgu. */
    readonly color: number;
    /** Skala stozka rozblysku (1 = ~36 px dlugosci w swiecie). */
    readonly flashScale: number;
    /** Dymki z lufy per strzal (0 = brak). */
    readonly smoke: number;
    /** Iskry z lufy per strzal. */
    readonly sparks: number;
    /** Dlugosc smugi za pociskiem w px swiata (0 = bez smugi). */
    readonly trailLen: number;
    /** Szerokosc smugi w px swiata. */
    readonly trailWidth: number;
    /** Promien pierscienia trafienia (px swiata). */
    readonly ringRadius: number;
    /** Iskry przy trafieniu (w kolorze) + 2 biale zawsze. */
    readonly hitSparks: number;
    /** Mikro hit-stop przy trafieniu wroga (klatki; 0 = brak). Tylko ciezkie strzaly. */
    readonly hitStopFrames: number;
    /** Drzenie kamery przy trafieniu (px; 0 = brak). */
    readonly nudgePx: number;
}

const DEF: ShotFx = {
    color: 0xffffff, flashScale: 1, smoke: 3, sparks: 4, trailLen: 44, trailWidth: 6,
    ringRadius: 22, hitSparks: 6, hitStopFrames: 0, nudgePx: 0,
};

/** Per czolg — kolory 1:1 z Bullet.ts COLOR_MAP / paleta czolgu. */
export const SHOT_FX: Record<string, ShotFx> = {
    twardy: { ...DEF, color: 0x2ecc71 },
    heavy:  { ...DEF, color: 0xb56cf0, flashScale: 1.3, smoke: 4, trailLen: 36, trailWidth: 7, ringRadius: 28, hitSparks: 8, hitStopFrames: 2, nudgePx: 1.5 },
    scout:  { ...DEF, color: 0xf1c40f, flashScale: 0.75, smoke: 1, sparks: 3, trailLen: 52, trailWidth: 4, ringRadius: 16, hitSparks: 4 },
    sniper: { ...DEF, color: 0x7fd0ff, flashScale: 1.2, smoke: 2, trailLen: 90, trailWidth: 5, ringRadius: 26, hitSparks: 8, hitStopFrames: 2, nudgePx: 1.5 },
    plasma: { ...DEF, color: 0x00e5ff, flashScale: 1.1, smoke: 0, sparks: 5, trailLen: 40, trailWidth: 7, ringRadius: 24 },
    pyro:   { ...DEF, color: 0xff7a2a, flashScale: 1.0, smoke: 2, sparks: 3, trailLen: 26, trailWidth: 8, ringRadius: 18, hitSparks: 5 },
    shadow: { ...DEF, color: 0xb48cff, flashScale: 0.8, smoke: 1, sparks: 3, trailLen: 48, trailWidth: 4, ringRadius: 20 },
    king:   { ...DEF, color: 0xffb340, flashScale: 1.25, smoke: 3, sparks: 5, trailLen: 44, trailWidth: 7, ringRadius: 26, hitSparks: 7, hitStopFrames: 1, nudgePx: 1 },
};

export function shotFxFor(brawlerId: string): ShotFx {
    return SHOT_FX[brawlerId] ?? DEF;
}
