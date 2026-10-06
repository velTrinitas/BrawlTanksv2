/**
 * tropicsEvents.ts — TROPICS ART v2 / T6: zdarzenia farmy (wzorzec desertCurse.ts).
 *
 * Wszystkie czasy w KROKACH logiki (60/s) — liczone w `runLogicStep`, zero Date.now / Math.random.
 * `TROPICS_EVENTS_RULESET_ID` idzie do uzgadniania wersji koopa (zmiana liczb = nowe ID).
 */
import type { DifficultyId } from '../types/GameConfig';

export const TROPICS_EVENTS_RULESET_ID = 'farm-v5';

/** SZALONE KURCZAKI — parametry per trudnosc (latwy = zdarzenie mocniejsze dla gracza). */
export interface ChickenTuning {
    flock: number;          // liczba kur (bez koguta)
    hitsToWake: number;     // trafien kurnika w oknie
    peckDps: number;        // obrazenia/s od jednej kury
}
export const CHICKENS_BY_DIFFICULTY: Record<DifficultyId, ChickenTuning> = {
    easy:      { flock: 12, hitsToWake: 2, peckDps: 22 },
    normal:    { flock: 10, hitsToWake: 3, peckDps: 18 },
    hard:      { flock: 9,  hitsToWake: 3, peckDps: 15 },
    nightmare: { flock: 8,  hitsToWake: 4, peckDps: 12 },
};

export const CHICKENS = {
    windowSteps: 360,        // 6 s — okno liczenia trafien kurnika
    telegraphFromHit: 1,     // od 2. trafienia kurnik "KO-KO!" (telegraf)
    activeSteps: 720,        // 12 s szalenstwa
    cooldownSteps: 3600,     // 60 s per kurnik
    seekRange: 500,          // kury gonia wroga w tym promieniu od siebie
    speed: 2.6,              // px/krok (szybsze od wiekszosci wrogow)
    peckRange: 26,           // dystans dziobania
    maxPeckersPerEnemy: 4,
    peckEverySteps: 20,      // obrazenia porcjami co 1/3 s (mniej spamu iskier)
    slowMult: 0.6,           // oblepiony wrog: -40% predkosci
    hitRadius: 11,           // trafienie kury pociskiem gracza
    eggGems: 5,              // zlote jajo koguta
    eggScore: 50,
} as const;

/** SZARZA BYKA — per trudnosc. ramDmg dla zwyklego wroga (300 HP) = zabicie jednym trafieniem. */
export interface BullTuning { hitsToWake: number; ramDmg: number; playerDmg: number; }
export const BULL_BY_DIFFICULTY: Record<DifficultyId, BullTuning> = {
    // v2 (Mariusz: "bardzo trudno wywolac"): budzi STODOLA, mniej trafien, dluzsze okno
    easy:      { hitsToWake: 2, ramDmg: 500, playerDmg: 10 },
    normal:    { hitsToWake: 2, ramDmg: 400, playerDmg: 15 },
    hard:      { hitsToWake: 2, ramDmg: 350, playerDmg: 25 },
    nightmare: { hitsToWake: 3, ramDmg: 300, playerDmg: 40 },
};
export const BULL = {
    windowSteps: 300,        // 5 s
    telegraphSteps: 60,      // 1 s strzalki na ziemi
    speed: 9,                // px/krok
    returnSpeed: 2.5,
    maxDistance: 1100,       // dlugosc JEDNEJ prostej (2026-10-05: dluzsze)
    legs: 3,                 // 3 proste ze zakretami (~+5 s szarzy)
    turnSteps: 24,           // 0,4 s zakretu z strzalka
    width: 40,               // polszerokosc toru
    bossMult: 0.25,
    cooldownSteps: 5400,     // 90 s
} as const;

/** ZNIWIARKA-POTWOR — per trudnosc. */
export interface ReaperTuning { hitsToWake: number; mowDmg: number; playerDmg: number; }
export const REAPER_BY_DIFFICULTY: Record<DifficultyId, ReaperTuning> = {
    easy:      { hitsToWake: 4, mowDmg: 320, playerDmg: 8 },
    normal:    { hitsToWake: 5, mowDmg: 250, playerDmg: 10 },
    hard:      { hitsToWake: 6, mowDmg: 220, playerDmg: 18 },
    nightmare: { hitsToWake: 7, mowDmg: 200, playerDmg: 30 },
};
export const REAPER = {
    windowSteps: 360,        // 6 s
    telegraphSteps: 60,      // 1 s: swiatla + noze + syrena
    rageSteps: 600,          // 10 s szalu (Mariusz)
    speedMult: 3,
    chaseSpeedMult: 3.2,     // T6.3c: w szale goni najblizszego gracza (~2.1 px/krok, wolniej niz kazdy czolg)
    biteDmg: 15,             // T6.3c: ugryzienie zebami hedera (Mariusz: 15 / 0,7 s)
    biteSteps: 42,           // 0,7 s miedzy ugryzieniami
    // Hitbox = KSZTALT kombajnu (Combine.ts, skala 0.9), w ukladzie maszyny: f = do przodu, r = w bok.
    bodyBack: -54,           // tyl korpusu
    bodyFront: 50,           // przod korpusu = poczatek hedera
    bodyHalfW: 42,           // korpus + kola
    headerFront: 79,         // czubki zebow
    headerHalfW: 53,         // polszerokosc hedera
    mowPad: 14,              // tolerancja dla kadluba wroga
    bitePad: 16,             // tolerancja dla kadluba gracza
    bossMult: 0.25,
    cooldownSteps: 7200,     // 120 s
} as const;
