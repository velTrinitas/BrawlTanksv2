/**
 * RoomCode.ts — COOP LAN-1: kod pokoju koopa + link zaproszenia.
 *
 * 6 znakow z alfabetu BEZ mylacych sie znakow (0/O, 1/I/L) — dziecko przepisuje kod z ekranu
 * kolegi. Losowanie z crypto.getRandomValues: to NIE jest symulacja (worldRng nietkniety).
 * 30^6 ≈ 729 mln kombinacji — przy pokojach zyjacych minuty zgadniecie cudzego kodu jest
 * nierealne (przeglad cross-model: >= 6 znakow przed wyjsciem poza dom).
 */

export const ROOM_CODE_LEN = 6;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
    const buf = new Uint32Array(ROOM_CODE_LEN);
    crypto.getRandomValues(buf);
    let out = '';
    for (let i = 0; i < ROOM_CODE_LEN; i++) out += ALPHABET[buf[i] % ALPHABET.length];
    return out;
}

/** Normalizuje wpis gracza (male litery, spacje, myslniki) do postaci kodu. */
export function normalizeRoomCode(raw: string): string {
    // Znaki spoza alfabetu (0/O/1/I/L) zostaja — isValidRoomCode je odrzuci z czytelnym bledem.
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LEN);
}

export function isValidRoomCode(code: string): boolean {
    if (code.length !== ROOM_CODE_LEN) return false;
    for (const ch of code) if (!ALPHABET.includes(ch)) return false;
    return true;
}

/** Link zaproszenia: ta sama strona + ?mp=1&join=KOD (inne parametry zachowane). */
export function buildJoinLink(code: string): string {
    const url = new URL(window.location.href);
    url.searchParams.set('mp', '1');
    url.searchParams.set('join', code);
    return url.toString();
}

/** Kod z URL (?join=KOD) albo null. */
export function readJoinCodeFromUrl(): string | null {
    try {
        const raw = new URLSearchParams(window.location.search).get('join');
        if (!raw) return null;
        const code = normalizeRoomCode(raw);
        return isValidRoomCode(code) ? code : null;
    } catch { return null; }
}
