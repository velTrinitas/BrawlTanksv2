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

export class SupabaseScoreService implements IScoreService {
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
            const raw = localStorage.getItem(QUEUE_KEY);
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
            localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
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
    async flushQueue(): Promise<void> {
        const q = this.loadQueue();
        if (q.length === 0) return;

        const sb = getSupabase();
        const remaining: ScoreInsert[] = [];

        for (const item of q) {
            try {
                const { error } = await sb.from('scores').insert(item);
                if (error) {
                    remaining.push(item);
                }
            } catch {
                remaining.push(item);
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
            const { data, error } = await sb
                .from('scores')
                .insert(insert)
                .select()
                .single();

            if (error) throw error;

            // Sukces online — przy okazji oprozn ewentualna zalegla kolejke.
            void this.flushQueue();
            return this.rowToEntry(data as ScoreRow);
        } catch (e) {
            // Offline / blad serwera: kolejkuj i zwroc provisional entry,
            // zeby flow gry (ekran zwyciestwa/przegranej) NIE byl zablokowany.
            console.warn('[ScoreService:Supabase] submit failed — kolejkuje offline', e);
            this.enqueue(insert);
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