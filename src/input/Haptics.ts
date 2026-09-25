/**
 * Haptics.ts — v0.208.0. Wibracje telefonu (Chrome/Android; iOS Safari ignoruje cicho).
 *
 * WARSTWA PREZENTACJI: wolane PO rozstrzygnieciu obrazen / akcji, nic nie wraca do
 * symulacji (bramka COOP/MP: brak wplywu). Zasady (decyzja Mariusza 2026-09-25):
 *  - throttle 120 ms — salwa wrogow nie robi z telefonu golarki; `force` omija throttle
 *    dla zdarzen jednorazowych (smierc, pancerz krytyczny), ktore nie moga zginac;
 *  - przelacznik `bt2:haptics` w Ustawieniach, DEFAULT OFF (decyzja Mariusza 2026-09-25:
 *    „zostawmy to userom do wyboru");
 *  - wyciszone razem z `prefers-reduced-motion`.
 */

const STORAGE_KEY = 'bt2:haptics';
const THROTTLE_MS = 120;

/** Dobor wzorcow — jedno miejsce prawdy, zeby sila wibracji byla spojna w calej grze. */
export const HAPTIC = {
    tap: 8,                          // kazdy tap w hubie
    confirm: 12,                     // GRAJ / potwierdz
    reward: [10, 30, 20],            // ODBIERZ / OTWORZ skrzynke
    nope: 15,                        // zablokowana moc, „nie da sie"
    hit: 20,                         // otrzymany strzal — krotki „tick"
    ram: [30, 40, 30],               // taran / cios bossa — „to bylo cos wiekszego"
    critical: [15, 60, 15, 60, 15],  // wejscie w pancerz krytyczny — RAZ
    death: 80,                       // jedyny dluzszy
} as const;

let lastAt = 0;
let enabledCache: boolean | null = null;

export function hapticsSupported(): boolean {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

export function hapticsEnabled(): boolean {
    if (enabledCache !== null) return enabledCache;
    try {
        enabledCache = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        enabledCache = false; // localStorage zablokowany — default OFF, bez zapisu
    }
    return enabledCache;
}

export function setHapticsEnabled(on: boolean): void {
    enabledCache = on;
    try {
        localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch (e) {
        console.warn('[Haptics] persist failed', (e as Error).stack ?? e);
    }
}

function reducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Zawibruj. Zwraca true, gdy wywolanie realnie poszlo do `navigator.vibrate`
 * (testowalne: throttle / flaga / brak wsparcia => false).
 */
export function haptic(pattern: number | readonly number[], force = false): boolean {
    if (!hapticsSupported() || !hapticsEnabled() || reducedMotion()) return false;
    const now = Date.now();
    if (!force && now - lastAt < THROTTLE_MS) return false;
    lastAt = now;
    try {
        return navigator.vibrate(pattern as number | number[]);
    } catch (e) {
        console.warn('[Haptics] vibrate failed', (e as Error).stack ?? e);
        return false;
    }
}
