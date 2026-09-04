/**
 * Rng.ts — Z0.1 (COOP ETAP 0, v0.150.0): seedowany generator losowy dla gameplayu.
 *
 * Cel: ten sam seed => ten sam przebieg rozgrywki (uklad skal, fale wrogow, dropy).
 * To fundament pod multiplayer (wspolny swiat u obu graczy) i pod odtwarzanie bugow
 * (?seed=N w URL wymusza seed, log "[RNG] seed=..." pozwala powtorzyc mecz).
 *
 * Generator: mulberry32 — 32-bit, deterministyczny, kilka operacji int na losowanie
 * (szybszy niz Math.random), zero zaleznosci. Jakosc az nadto dla gameplayu.
 *
 * DWA STRUMIENIE (wnioski z audytu Z0.2 — nie laczyc!):
 *  - worldRng   — wszystko co ksztaltuje rozgrywke: pozycje/rozmiary obiektow swiata,
 *                 fale, dropy, rozrzuty pociskow, wybory celow, timing pogody.
 *  - ambientRng — ozdobne NPC widoczne w swiecie (konie): ich petle potrafia zuzyc
 *                 ZMIENNA liczbe losowan (do-while), co wpiete we wspolny strumien
 *                 rozjechaloby cala symulacje.
 * KOSMETYKA (tekstury, particle, shake kontenerow, fazy pulsowania) ZOSTAJE na
 * Math.random() — celowo, zgodnie ze specem COOP §4/Z0.1.
 *
 * Oba strumienie resetuje seedMatchRng() na starcie kazdego meczu (startGame).
 * Poza meczem (menu/hub) strumienie tez dzialaja — stan po prostu plynie dalej,
 * bo liczy sie wylacznie stan OD resetu na starcie meczu.
 */

export class Rng {
    private s: number;

    constructor(seed: number) {
        this.s = seed >>> 0;
    }

    /** Ustaw nowy seed (reset strumienia). */
    reseed(seed: number): void {
        this.s = seed >>> 0;
    }

    /** Losowa liczba [0, 1) — zamiennik 1:1 dla Math.random(). */
    next(): number {
        let t = (this.s += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Losowa liczba [min, max). */
    range(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    /** Losowa calkowita [0, n). */
    int(n: number): number {
        return Math.floor(this.next() * n);
    }

    /** Losowy element tablicy (pusta tablica => undefined, jak arr[0]). */
    pick<T>(arr: readonly T[]): T {
        return arr[this.int(arr.length)];
    }

    /** True z prawdopodobienstwem p — zamiennik dla `Math.random() < p`. */
    chance(p: number): boolean {
        return this.next() < p;
    }
}

/** Strumien gameplayowy — wszystko co ksztaltuje swiat i przebieg meczu. */
export const worldRng = new Rng(1);

/** Strumien ambient — ozdobne NPC (konie); NIGDY nie mieszac z worldRng. */
export const ambientRng = new Rng(2);

/**
 * Reset obu strumieni na start meczu. Ambient dostaje seed przesuniety stala
 * (golden ratio 32-bit), zeby strumienie nie byly identyczne przy tym samym seedzie.
 */
export function seedMatchRng(seed: number): void {
    const s = seed >>> 0;
    worldRng.reseed(s);
    ambientRng.reseed((s ^ 0x9E3779B9) >>> 0);
    console.log(`[RNG] seed=${s} (powtorz mecz: ?seed=${s})`);
}
