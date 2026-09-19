/**
 * sigmaFlag.ts — SigmaTester (bot AI-tester) — JEDYNY kawalek warstwy testowej, ktory trafia do
 * bundla produkcyjnego: flaga `?bot=1` + emiter zdarzen jako wskaznik funkcji (domyslnie no-op).
 *
 * Zasada izolacji (Konstytucja, per-feature isolation): cala reszta (`SigmaTest.ts`, oracles,
 * BotPolicy) laduje sie DYNAMICZNIE tylko z flaga — bez flagi gra jest bit-identyczna poza
 * jednym `if` per zdarzenie. W trybie bot gra NIE wysyla wynikow/telemetrii/beaconow.
 *
 * Kontrakt oracle'ow: docs/sigma-tester/ORACLES.md (id A1..N6). Zdarzenia ponizej to minimum,
 * ktore silnik emituje, zeby oracle mialy na czym pracowac (needs w checkliscie).
 */

export const SIGMA_BOT: boolean = (() => {
    try { return new URLSearchParams(window.location.search).get('bot') === '1'; } catch { return false; }
})();

export type SigmaEvent =
    | { t: 'spawn'; kind: 'enemy' | 'boss' | 'mega' | 'heart' | 'magnet' | 'gem' | 'cube'; x: number; y: number; w: number; h: number; id?: number }
    | { t: 'damage'; target: 'player' | 'enemy'; id?: number; dmg: number; src: string; hp: number; x: number; y: number }
    | { t: 'kill'; id: number; kind: 'enemy' | 'boss' | 'mega'; x: number; y: number; src: string }
    | { t: 'power'; id: string; phase: 'activate' | 'end' }
    | { t: 'submitAttempt'; mode: string; blocked: boolean }
    | { t: 'outcome'; result: 'victory' | 'gameover'; scenario: string; map: string; score: number; seconds: number }
    | { t: 'banner'; text: string }
    | { t: 'error'; msg: string; stack: string }
    | { t: 'mark'; tag: string }
    /** D5 (v0.197.x): strzal wroga — wylot (x,y), srodek czolgu (cx,cy), kat lotu (angle, srodek serii),
     *  WIDOCZNY kat lufy (barrel: w bake = kat skwantowany do klatki atlasu) i dlugosc lufy (muzzle). */
    | { t: 'shot'; id: number; kind: 'enemy' | 'boss' | 'mega' | 'pursuit'; role: string | null; x: number; y: number; cx: number; cy: number; angle: number; barrel: number; muzzle: number };

/** Wskaznik emitera — no-op w prod; SigmaTest podmienia go po zaladowaniu (setSigmaEmitter). */
export let sigmaEmit: (e: SigmaEvent) => void = () => { /* no-op poza ?bot=1 */ };
export function setSigmaEmitter(fn: (e: SigmaEvent) => void): void { sigmaEmit = fn; }

/** Licznik klatek logiki — SigmaTest inkrementuje w step(); encje stempluja nim zdarzenia. */
export const sigmaFrame = { n: 0 };
