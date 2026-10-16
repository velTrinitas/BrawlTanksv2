/**
 * EVENT: 10. URODZINY MICHALA (wspoltworcy gry) — czasowy, czysto kosmetyczny (DOM/CSS/audio).
 * Brak wplywu na symulacje: nic tu nie dotyka meczu, punktow, ekonomii ani chmury.
 *
 * Wylacza sie SAM: nd 25.10.2026 13:00 czasu PL. Zmiana czasu letniego jest tej samej nocy
 * (03:00 CEST -> 02:00 CET), wiec o 13:00 obowiazuje juz CET = UTC+1.
 * Rollback reczny: `?bday=0`. Podglad po terminie: `?bday=1`.
 * Sprzatanie po evencie: usunac ten plik + BirthdayDecor/BirthdayStartOverlay/birthday.css
 * i wywolania `isBirthdayActive()` (grep).
 */
export const BDAY_END_MS = Date.parse('2026-10-25T13:00:00+01:00');

let override: string | null | undefined;

export function isBirthdayActive(): boolean {
    if (override === undefined) {
        try { override = new URLSearchParams(window.location.search).get('bday'); } catch { override = null; }
    }
    if (override === '0') return false;
    if (override === '1') return true;
    return Date.now() < BDAY_END_MS; // UI-only: zegar systemowy dozwolony (nie symulacja); liczony co wywolanie
}

/** Raz na sesje (sessionStorage moze rzucic w trybie prywatnym — wtedy pokazujemy). */
export function bdayOncePerSession(key: string): boolean {
    try {
        const k = 'bt_bday_' + key;
        if (sessionStorage.getItem(k)) return false;
        sessionStorage.setItem(k, '1');
    } catch { /* storage blocked */ }
    return true;
}
