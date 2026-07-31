/**
 * SupabaseScoreService.ts — FAZA 9b.2 (v0.47.0)
 *
 * Implementacja IScoreService oparta o Supabase (Postgres + REST).
 * Podmienia LocalStorageScoreService w bootstrap (DI, 1 linijka w ScoreService.ts).
 *
 * KLUCZOWE WLASNOSCI:
 *  - Offline queue fallback: gdy siec padnie, wynik laduje w localStorage kolejce
 *    i submituje sie przy nastepnym polaczeniu (gracze 9-12 graja na slabym WiFi —
 *    submit NIGDY nie moze zablokowac flow gry). Gra dostaje provisional ScoreEntry.
 *  - score_version: kazdy submit oznaczany CURRENT_SCORE_VERSION. Leaderboard
 *    czyta tylko biezaca wersje — po HP/DMG x100 refactorze (v0.46.0) bumpniesz
 *    stala na 2 i stare wyniki znikna z rankingu (nie sa porownywalne).
 *  - clearAll: czysci TYLKO lokalna kolejke. Server scores sa immutable z klienta
 *    (brak DELETE policy w RLS — anti-tamper). Reset serwera tylko z dashboardu.
 *
 * SIGNATURE DRIFT GUARD (constitution): zgodne z realnym IScoreService —
 *  submitScore zwraca ScoreEntry (nie void), getTopScores bierze ScoreFilter.
 *
 * UWAGA — staty anti-cheat (kills/gems/shots/game_seconds):
 *  Aktualny IScoreService.submitScore(score, config) NIE niesie statystyk.
 *  Te kolumny zostaja na DEFAULT (0) az osobna faza rozszerzy interfejs.
 *  Swiadomie NIE ruszamy game logiki w 9b.2 (out of scope).
 *
 * Import cykl: uzywamy `import type` dla IScoreService/ScoreEntry/ScoreFilter,
 *  bo ScoreService.ts importuje runtime ten plik (bootstrap). Type-only import
 *  jest wymazywany przy kompilacji -> brak cyklu w runtime.
 */

import type { IScoreService, ScoreEntry, ScoreFilter } from './ScoreService';
import type { ScenarioId } from '../types/Scenario';
import type { MapId } from '../types/MapType';
import type { DifficultyId, GameConfig } from '../types/GameConfig';
import type { ScoreInsert, ScoreRow } from './supabase/types';
import { getSupabase } from './supabase/SupabaseClient';
import { obfuscate, deobfuscate } from './secureStore';
import type {
    BoardDefinition, ILeaderboardService, LeaderboardEntry, LeaderboardQuery, MyRank,
} from './leaderboard';
import { sanitizeDisplayName } from './leaderboard';

/** Ksztalt wiersza z RPC leaderboard_top (patrz supabase/leaderboard_rpc.sql). */
interface LeaderboardTopRow {
    rank: number; profile_id: string; nickname: string; avatar_id: string;
    flag_id: string | null; score: number; map: string; brawler_id: string; created_at: string;
}
/** Ksztalt wiersza z RPC leaderboard_my_rank. */
interface MyRankRow { rank: number | null; my_score: number | null; total: number; }

/**
 * Wersja regul scoringu. Single source of truth — zmienna na wszystko co wplywa
 * na finalny `score`. Leaderboard filtruje po `score_version` zeby nie miesac
 * wynikow z roznych formul (niesprawiedliwe porownanie).
 *
 * Historia bumpow:
 *  - v1 (do v0.48.0): plaska suma `score += gem.value | enemy.scoreValue`,
 *    bez mnoznikow, bez bonusow.
 *  - v2 (od v0.50.0): pelny refactor scoringu w fazie Scoring v2 + Difficulty Balance v1:
 *     - Difficulty score multipliers (Easy/Normal x1.0, Hard x1.2, Nightmare x1.4)
 *     - Combo score multipliers (DOUBLE x1.2, TRIPLE x1.5, MEGA KILL x2.0 cap)
 *     - Frozen kill bonus (per-difficulty: +50% / +75% / +100% / +125%)
 *     - Mega bomb multi-kill bonus (>=3 wrogow: +50% sumy base values)
 *     - Ramming/collision kill bonus (+100% base value)
 *     - Perfect Run bonus (no-damage victory: +50/+75/+100/+125 POST diff mult)
 *     - Realne skalowanie trudnosci (HP/dmg/speed/spawn rate/boss thresholds)
 *
 * NASTEPNY BUMP: po anti-cheat fazie (Layer 1+2) zeby wymusic nowe walidacje
 * server-side, ALBO przy kolejnym duzym balance refactor.
 */
export const CURRENT_SCORE_VERSION = 2;

const QUEUE_KEY = 'brawltanks.scores.queue.v1';

export class SupabaseScoreService implements IScoreService, ILeaderboardService {
    constructor() {
        // Proba oproznienia kolejki przy starcie (fire-and-forget).
        void this.flushQueue();
        // Re-flush gdy przegladarka wroci online (np. po WiFi dropie w pociagu).
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => void this.flushQueue());
        }
    }

    // ── Mapowanie DB row -> ScoreEntry (kontrakt gry) ──────────────────────────
    private rowToEntry(row: ScoreRow): ScoreEntry {
        return Object.freeze({
            id: row.id,
            profileId: row.profile_id ?? '',
            brawlerId: row.brawler_id,
            score: row.score,
            scenario: row.scenario as ScenarioId,
            map: row.map as MapId,
            difficulty: row.difficulty as DifficultyId,
            // DB trzyma server-side created_at; ScoreEntry oczekuje ms timestamp.
            timestamp: new Date(row.created_at).getTime(),
            sessionId: row.session_id ?? '',
        });
    }

    // ── Offline queue ──────────────────────────────────────────────────────────
    private loadQueue(): ScoreInsert[] {
        try {
            // Anti-cheat L1: kolejka trzymana zaciemniona; deobfuscate toleruje legacy plaintext.
            const raw = deobfuscate(localStorage.getItem(QUEUE_KEY));
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('[ScoreService:Supabase] load queue failed', e);
            return [];
        }
    }

    private saveQueue(items: ScoreInsert[]): void {
        try {
            localStorage.setItem(QUEUE_KEY, obfuscate(JSON.stringify(items))); // L1: zaciemnione
        } catch (e) {
            console.warn('[ScoreService:Supabase] save queue failed', e);
        }
    }

    private enqueue(item: ScoreInsert): void {
        const q = this.loadQueue();
        q.push(item);
        this.saveQueue(q);
        console.log(`[ScoreService:Supabase] wynik zakolejkowany offline (${q.length} w kolejce).`);
    }

    /**
     * Probuje wyslac wszystkie zakolejkowane wyniki. Te, ktore sie nie udaly,
     * zostaja w kolejce na nastepna probe. Publiczne — mozna wywolac recznie.
     */
    /**
     * Czy blad jest PRZEJSCIOWY (siec / 5xx / rate-limit 429 = warto ponowic)?
     * 4xx walidacja (poza 429) = submit nigdy nie przejdzie => NIE kolejkuj (drop, nie zapetlaj).
     */
    private isTransientError(e: unknown): boolean {
        const status = (e as { context?: { status?: number } } | null)?.context?.status;
        if (typeof status !== 'number') return true; // brak statusu = siec/nieznane => przejsciowe
        return status >= 500 || status === 429;
    }

    async flushQueue(): Promise<void> {
        const q = this.loadQueue();
        if (q.length === 0) return;

        const sb = getSupabase();
        const remaining: ScoreInsert[] = [];

        for (let i = 0; i < q.length; i++) {
            const item = q[i];
            try {
                // L2a: insert TYLKO przez Edge Function (walidacja serwerowa), nie bezposrednio.
                const { error } = await sb.functions.invoke('submit-score', { body: item });
                if (error) throw error;
            } catch (e) {
                const status = (e as { context?: { status?: number } } | null)?.context?.status;
                if (status === 429) {
                    // Rate-limit: kazda kolejna proba w tej godzinie tez dostanie 429 —
                    // przerwij i zachowaj ten oraz WSZYSTKIE pozostale itemy na nastepna sesje
                    // (duza zalegle kolejka rozladowuje sie porcjami, bez mlocenia endpointu).
                    remaining.push(...q.slice(i));
                    break;
                }
                if (this.isTransientError(e)) remaining.push(item); // ponow pozniej
                // walidacyjnie odrzucone (4xx) — porzucamy (nigdy nie przejdzie)
            }
        }

        this.saveQueue(remaining);
        const flushed = q.length - remaining.length;
        if (flushed > 0) {
            console.log(`[ScoreService:Supabase] wyslano ${flushed} zakolejkowanych wynikow.`);
        }
    }

    // ── IScoreService ────────────────────────────────────────────────────────────

    async submitScore(score: number, config: GameConfig): Promise<ScoreEntry> {
        const insert: ScoreInsert = {
            profile_id: config.profileId,
            score,
            scenario: config.scenario,
            map: config.map,
            difficulty: config.difficulty,
            brawler_id: config.brawlerId,
            session_id: config.sessionId,
            score_version: CURRENT_SCORE_VERSION,
        };

        try {
            const sb = getSupabase();
            // L2a: insert TYLKO przez Edge Function submit-score (walidacja serwerowa + service-role).
            // Bezposredni .from('scores').insert jest zablokowany w RLS po lockdownie.
            const { data, error } = await sb.functions.invoke('submit-score', { body: insert });
            if (error) throw error;
            const row = (data as { row?: ScoreRow } | null)?.row;
            if (!row) throw new Error('submit-score: brak row w odpowiedzi');

            // Sukces online — przy okazji oprozn ewentualna zalegla kolejke.
            void this.flushQueue();
            return this.rowToEntry(row);
        } catch (e) {
            // Przejsciowy blad (offline/5xx/429): kolejkuj i zwroc provisional entry, zeby flow gry
            // (ekran zwyciestwa/przegranej) NIE byl zablokowany. Walidacja 4xx = drop (nie zapetlaj).
            if (this.isTransientError(e)) {
                console.warn('[ScoreService:Supabase] submit przejsciowo nieudany — kolejkuje offline', e);
                this.enqueue(insert);
            } else {
                console.warn('[ScoreService:Supabase] submit odrzucony (walidacja) — nie kolejkuje', e);
            }
            return Object.freeze({
                id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                profileId: config.profileId,
                brawlerId: config.brawlerId,
                score,
                scenario: config.scenario,
                map: config.map,
                difficulty: config.difficulty,
                timestamp: Date.now(),
                sessionId: config.sessionId,
            });
        }
    }

    async getTopScores(filter: ScoreFilter): Promise<ScoreEntry[]> {
        try {
            const sb = getSupabase();
            let q = sb
                .from('scores')
                .select('*')
                .eq('score_version', CURRENT_SCORE_VERSION);

            if (filter.scenario)   q = q.eq('scenario', filter.scenario);
            if (filter.map)        q = q.eq('map', filter.map);
            if (filter.difficulty) q = q.eq('difficulty', filter.difficulty);
            if (filter.profileId)  q = q.eq('profile_id', filter.profileId);

            q = q.order('score', { ascending: false });
            if (filter.limit && filter.limit > 0) q = q.limit(filter.limit);

            const { data, error } = await q;
            if (error) throw error;

            return (data as ScoreRow[] ?? []).map((r) => this.rowToEntry(r));
        } catch (e) {
            console.warn('[ScoreService:Supabase] getTopScores failed', e);
            return [];
        }
    }

    async getBestForProfile(profileId: string, scenario?: ScenarioId): Promise<ScoreEntry | null> {
        const results = await this.getTopScores({ profileId, scenario, limit: 1 });
        return results[0] ?? null;
    }

    // ── ILeaderboardService (RPC: dedupe best-per-player + join profiles + ranga) ──

    async getLeaderboard(board: BoardDefinition, query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
        try {
            const sb = getSupabase();
            const { data, error } = await sb.rpc('leaderboard_top', {
                p_scenario: board.scenario,
                p_score_version: CURRENT_SCORE_VERSION,
                p_map: query.map ?? null,
                p_window: query.window,
                p_limit: query.limit ?? 100,
            });
            if (error) throw error;
            return ((data ?? []) as LeaderboardTopRow[]).map((r) => Object.freeze({
                rank: Number(r.rank),
                profileId: r.profile_id,
                nickname: r.nickname,
                displayName: sanitizeDisplayName(r.nickname),
                avatarId: r.avatar_id,
                flagId: r.flag_id,
                score: r.score,
                map: r.map as MapId,
                brawlerId: r.brawler_id,
                timestamp: new Date(r.created_at).getTime(),
            }));
        } catch (e) {
            console.warn('[ScoreService:Supabase] getLeaderboard failed', e);
            return [];
        }
    }

    async getMyRank(
        profileId: string,
        board: BoardDefinition,
        query: Omit<LeaderboardQuery, 'limit'>,
    ): Promise<MyRank> {
        try {
            const sb = getSupabase();
            const { data, error } = await sb.rpc('leaderboard_my_rank', {
                p_profile_id: profileId,
                p_scenario: board.scenario,
                p_score_version: CURRENT_SCORE_VERSION,
                p_map: query.map ?? null,
                p_window: query.window,
            });
            if (error) throw error;
            // RPC RETURNS TABLE => tablica jednowierszowa.
            const row = (Array.isArray(data) ? data[0] : data) as MyRankRow | undefined;
            return Object.freeze({
                rank: row?.rank != null ? Number(row.rank) : null,
                score: row?.my_score ?? null,
                total: row?.total != null ? Number(row.total) : 0,
            });
        } catch (e) {
            console.warn('[ScoreService:Supabase] getMyRank failed', e);
            return Object.freeze({ rank: null, score: null, total: 0 });
        }
    }

    async clearAll(): Promise<void> {
        // Server scores sa immutable z klienta (brak DELETE policy — anti-tamper).
        // Czyscimy tylko lokalna kolejke offline. Reset serwera = Supabase dashboard.
        this.saveQueue([]);
        console.warn(
            '[ScoreService:Supabase] clearAll: wyczyszczono tylko kolejke offline. ' +
            'Server scores kasowalne wylacznie z dashboardu (RLS anti-tamper, brak DELETE policy).'
        );
    }
}