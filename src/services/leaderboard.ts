/**
 * leaderboard.ts — LB-F1 (FAZA 9c) warstwa danych leaderboardu.
 *
 * Config-driven REJESTR boardow (nie hardkodowana lista) — KTB (rosnacy survival-score)
 * i CTF (capture) to inne skale, mieszanie ich lamie Czytelnosc #1. Dodanie Daily
 * Challenge / Boss Rush / PvP w przyszlosci = jeden wpis w LEADERBOARD_BOARDS, nie
 * przepisywanie ekranu (forward-proof).
 *
 * Read-only API (getLeaderboard/getMyRank) implementuje SupabaseScoreService przez RPC
 * (leaderboard_top / leaderboard_my_rank z supabase/leaderboard_rpc.sql — dedupe
 * best-per-player + ranga + join profiles, po stronie Postgres).
 *
 * i18n uwaga: NIE trzymamy tu kluczy t() — dynamiczne t(varName) sie nie kompiluje.
 * UI (LB-F2) mapuje board.id -> literalny t('leaderboard.tab.<id>').
 */

import type { ScenarioId } from '../types/Scenario';
import type { MapId } from '../types/MapType';

export type TimeWindow = 'all' | 'week' | 'day';
export type BoardMetric = 'score'; // 'time' | 'wins' — przyszlosc (Boss Rush/PvP)

/** Definicja pojedynczego rankingu w rejestrze. */
export interface BoardDefinition {
    /** Stabilny id (== ScenarioId dla boardow scenariuszowych). UI mapuje na label i18n. */
    readonly id: string;
    readonly scenario: ScenarioId;
    /** Emoji do zakladki. */
    readonly icon: string;
    /** Chipy map (KTB). null = brak filtra mapy (CTF = jedna mapa / agregat). */
    readonly mapChips: readonly MapId[] | null;
    readonly metric: BoardMetric;
    readonly sortDir: 'desc' | 'asc';
    /** false = zakladka widoczna, ale zablokowana (np. Zamek). */
    readonly enabled: boolean;
}

/**
 * REJESTR — jedyne zrodlo prawdy dla zakladek leaderboardu.
 * Kolejnosc = kolejnosc zakladek. Dodajesz tryb => dopisujesz wpis.
 */
export const LEADERBOARD_BOARDS: readonly BoardDefinition[] = [
    {
        id: 'ktb',
        scenario: 'ktb',
        icon: '🎯',
        mapChips: ['city', 'desert', 'tropics', 'arctic', 'mars'],
        metric: 'score',
        sortDir: 'desc',
        enabled: true,
    },
    {
        id: 'ctf',
        scenario: 'ctf',
        icon: '🚩',
        mapChips: null, // jedna mapa (fortified_ruins) => bez chipow
        metric: 'score',
        sortDir: 'desc',
        enabled: true,
    },
    {
        id: 'castle',
        scenario: 'castle',
        icon: '🏰',
        mapChips: null,
        metric: 'score',
        sortDir: 'desc',
        enabled: false, // locked (scenariusz jeszcze niegrywalny)
    },
] as const;

/** Wiersz leaderboardu gotowy do renderu (po dedupie + joinie profilu + name-safety). */
export interface LeaderboardEntry {
    readonly rank: number;
    readonly profileId: string;
    /** Surowy nick z bazy (do porownan / matchu wlasnego wiersza). */
    readonly nickname: string;
    /** Nick przefiltrowany do wyswietlenia (name-safety, patrz sanitizeDisplayName). */
    readonly displayName: string;
    readonly avatarId: string;
    readonly flagId: string | null;
    readonly score: number;
    readonly map: MapId;
    readonly brawlerId: string;
    readonly timestamp: number;
}

/** Wynik zapytania o wlasna range (my_rank). */
export interface MyRank {
    /** null = gracz nie ma jeszcze wyniku na tym boardzie. */
    readonly rank: number | null;
    readonly score: number | null;
    /** Ilu graczy jest sklasyfikowanych na tym boardzie. */
    readonly total: number;
}

export interface LeaderboardQuery {
    readonly window: TimeWindow;
    /** null/undefined = agregat po wszystkich mapach ("Wszystkie, najlepszy"). */
    readonly map?: MapId | null;
    readonly limit?: number;
}

/** Kontrakt read-only leaderboardu (implementuje SupabaseScoreService). */
export interface ILeaderboardService {
    getLeaderboard(board: BoardDefinition, query: LeaderboardQuery): Promise<LeaderboardEntry[]>;
    getMyRank(profileId: string, board: BoardDefinition, query: Omit<LeaderboardQuery, 'limit'>): Promise<MyRank>;
}

// ── Name-safety (risk #3: bezpieczenstwo dzieci 9-12) ──────────────────────────
//
// STARTER blocklist — display-only (nick w bazie zostaje surowy). To NIE jest pelna
// lista; docelowo rozszerzyc + najlepiej walidowac przy TWORZENIU nicku (server-side).
// Token-based (caly wyraz), NIE substring — zeby uniknac falszywych trafien
// (problem "Scunthorpe": niewinne slowo z wulgarnym fragmentem).
const PROFANITY_TOKENS: ReadonlySet<string> = new Set([
    // PL
    'kurwa', 'chuj', 'chuja', 'huj', 'huja', 'pizda', 'pierdol', 'pierdole',
    'jebac', 'jebany', 'jebana', 'skurwysyn', 'debil', 'idiota', 'cwel',
    // EN
    'fuck', 'fucker', 'fucking', 'shit', 'bitch', 'asshole', 'dick',
    'cunt', 'nigger', 'nigga', 'fag', 'faggot', 'slut', 'whore',
]);

const MASK = '***';

/**
 * Zwraca nick bezpieczny do wyswietlenia. Maskuje tylko wulgarne TOKENY, resztę
 * zostawia (np. "kurwaKomandor" -> "***Komandor"). Gdy calosc znika/pusta -> "Gracz".
 * Puste/whitespace -> "Gracz". Nie mutuje danych w bazie.
 */
export function sanitizeDisplayName(nickname: string): string {
    const raw = (nickname ?? '').trim();
    if (raw.length === 0) return 'Gracz';

    // Tnij na tokeny slowne, zachowujac separatory (spacje/podkreslniki/cyfry granice).
    const cleaned = raw.replace(/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+/g, (word) =>
        PROFANITY_TOKENS.has(word.toLowerCase()) ? MASK : word
    );

    // Jesli po maskowaniu zostaly same maski/nie-litery -> neutralny label.
    const hasReal = /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9]/.test(cleaned.replace(/\*/g, ''));
    return hasReal ? cleaned : 'Gracz';
}
