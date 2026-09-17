/**
 * CrashReporter — v0.187.0 (FAZA 1.1d).
 *
 * Do tej wersji globalny handler bledow istnial WYLACZNIE pod `?bot=1` (SigmaTest.ts), wiec crash
 * u realnego gracza nie zostawial zadnego sladu — ani w konsoli, ktorej nikt nie oglada na telefonie,
 * ani w telemetrii (ta wysyla wiersz dopiero na victory/gameover, wiec mecz zakonczony bialym
 * ekranem z definicji nie istnial w danych).
 *
 * Wysylka NIE nastepuje w momencie crasha — wtedy strona czesto juz umiera, a siec bywa nieosiagalna.
 * Zamiast tego bufor ladu ostatnich bledow leci do `sessionStorage`, a odczytuje go kolejny start gry.
 */

const KEY = 'bt_crash_ring';
const MAX_ENTRIES = 20;

export interface CrashEntry {
    ts: number;
    kind: 'error' | 'unhandledrejection';
    msg: string;
    stack?: string;
    /** Wersja gry i stan gry w chwili bledu — bez tego wpis jest bezuzyteczny. */
    version?: string;
    state?: string;
}

let lastError = '';
let installed = false;
let getState: (() => string) | null = null;

/** Ostatni komunikat bledu — czytany przez nakladke `?diag=1`. */
export function getLastError(): string {
    return lastError;
}

function read(): CrashEntry[] {
    try {
        const raw = sessionStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as CrashEntry[]) : [];
    } catch {
        return []; // prywatne okno / zablokowane storage — diagnostyka nie moze wywalic gry
    }
}

function push(entry: CrashEntry): void {
    try {
        const ring = read();
        ring.push(entry);
        while (ring.length > MAX_ENTRIES) ring.shift();
        sessionStorage.setItem(KEY, JSON.stringify(ring));
    } catch (e) {
        console.warn('[CrashReporter] zapis nieudany', (e as Error).message);
    }
}

/** Wpisy z POPRZEDNIEJ sesji (do wyslania przy starcie). Czysci bufor. */
export function drainPending(): CrashEntry[] {
    const ring = read();
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    return ring;
}

export function installCrashReporter(version: string, stateFn: () => string): void {
    if (installed) return;
    installed = true;
    getState = stateFn;

    window.addEventListener('error', (e: ErrorEvent) => {
        lastError = e.message || String(e.error ?? 'error');
        push({
            ts: Date.now(),
            kind: 'error',
            msg: lastError,
            stack: e.error instanceof Error ? e.error.stack : undefined,
            version,
            state: getState?.(),
        });
    });

    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
        const reason = e.reason;
        lastError = reason instanceof Error ? reason.message : String(reason);
        push({
            ts: Date.now(),
            kind: 'unhandledrejection',
            msg: lastError,
            stack: reason instanceof Error ? reason.stack : undefined,
            version,
            state: getState?.(),
        });
    });
}
