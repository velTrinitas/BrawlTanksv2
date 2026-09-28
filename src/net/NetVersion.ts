/**
 * NetVersion.ts — COOP LAN-1: uzgadnianie wersji miedzy hostem a gosciem.
 *
 * W koopie obie strony musza liczyc/rozumiec swiat tak samo. Rozjazd dowolnego pola =
 * ODMOWA polaczenia z czytelnym komunikatem (bramka COOP/MP §3), nie ciche "jakos to bedzie".
 * Typowa przyczyna: jedno urzadzenie ma stara wersje z cache GitHub Pages.
 */
import { SIM_VERSION } from '../config/multiplayer';
import { INPUT_FORMAT_VERSION } from '../input/PlayerInput';
import { balanceRulesetId } from '../config/balanceFlag';
import { CURSE_RULESET_ID } from '../config/desertCurse';

/** Wersja protokolu sieciowego (format komunikatow kanalow danych). Bij przy kazdej zmianie. */
export const NET_PROTOCOL_VERSION = 1;

export interface NetVersion {
    proto: number;
    sim: number;
    input: number;
    balance: string;
    curse: string;
    game: string;
}

/** Wersja gry ze stopki #credits (to samo zrodlo co telemetria). */
function gameVersion(): string {
    const el = document.getElementById('credits');
    return el?.textContent?.match(/v[\d.]+/)?.[0] ?? 'v?';
}

export function localNetVersion(): NetVersion {
    // Dev: ?mpver=N podbija protokol u JEDNEJ strony — test odmowy przy rozjezdzie wersji.
    let proto = NET_PROTOCOL_VERSION;
    try {
        const o = new URLSearchParams(window.location.search).get('mpver');
        if (o !== null && !isNaN(parseInt(o, 10))) proto = parseInt(o, 10);
    } catch { /* brak location (testy) — zostaje stala */ }
    return {
        proto,
        sim: SIM_VERSION,
        input: INPUT_FORMAT_VERSION,
        balance: balanceRulesetId(),
        curse: CURSE_RULESET_ID,
        game: gameVersion(),
    };
}

/** null = zgodne; inaczej nazwa pierwszego rozjechanego pola (do logu i komunikatu). */
export function compareNetVersion(a: NetVersion, b: NetVersion): keyof NetVersion | null {
    const keys: (keyof NetVersion)[] = ['proto', 'sim', 'input', 'balance', 'curse', 'game'];
    for (const k of keys) if (a[k] !== b[k]) return k;
    return null;
}

/** Walidacja ksztaltu obcej wersji (dane z sieci = niezaufane). */
export function isNetVersion(v: unknown): v is NetVersion {
    if (!v || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    return typeof o.proto === 'number' && typeof o.sim === 'number' && typeof o.input === 'number'
        && typeof o.balance === 'string' && typeof o.curse === 'string' && typeof o.game === 'string';
}
