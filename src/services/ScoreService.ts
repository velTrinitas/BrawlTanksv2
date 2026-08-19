/**
 * ScoreService.ts — abstraction nad leaderboard storage.
 *
 * FAZA 6: LocalStorageScoreService impl (placeholder, no UI exposure).
 * FAZA 9b.2: bootstrap podmieniony na SupabaseScoreService (DI, 1 linijka).
 *            LocalStorageScoreService ZOSTAJE — uzywany przez migracje (9b.4)
 *            do odczytu istniejacych localStorage wynikow.
 *
 * Dlaczego abstraction od początku:
 * - 10 minut pracy teraz vs 3h refaktoru gdy 50 miejsc w kodzie odwołuje się do localStorage.
 * - Backend swap (Supabase / Firebase / custom REST) = zmiana 1 importu w bootstrap.
 * - Game logic nigdy nie wie skąd score pochodzi — testowalne, mockable.
 */

import type { ScenarioId } from '../types/Scenario';
import type { MapId } from '../types/MapType';
import type { DifficultyId, GameConfig } from '../types/GameConfig';
import { SupabaseScoreService } from './SupabaseScoreService';
import type { ILeaderboardService } from './leaderboard';

/**
 * Pojedynczy wpis score (immutable).
 * Zawiera pełen context rozgrywki dla filtracji i analytics.
 */
export interface ScoreEntry {
    readonly id: string;            // unique entry id
    readonly profileId: string;
    readonly brawlerId: string;
    readonly score: number;
    readonly scenario: ScenarioId;
    readonly map: MapId;
    readonly difficulty: DifficultyId;
    readonly timestamp: number;     // Date.now() z momentu submitu
    readonly sessionId: string;     // GameConfig.sessionId
}

/**
 * Statystyki jednego meczu wysylane razem z wynikiem (v0.100.0).
 *
 * PO CO: kolumny `kills`/`gems_collected`/`game_seconds`/... istnieja w tabeli `scores`
 * od FAZY 9b, ale interfejs ich NIE niosl => 491 wierszy z samymi zerami. Skutki byly
 * dwa i oba realne: (1) kalibracja celow rozkazow (PROG-F3) nie miala z czego liczyc,
 * (2) anti-cheat L2b (kill-rate, score/time ratio, megaboss XOR survival) nie mial
 * czego walidowac. Ten patch zamyka zrodlo danych — wartosci ida z licznikow, ktore
 * juz istnieja w GameSession/SpawnSystem, wiec gameplay jest nietkniety.
 *
 * Wszystkie pola opcjonalne: brak = kolumna zostaje na DEFAULT (kompatybilnosc wstecz
 * z kolejka offline zapisana przed tym patchem).
 */
export interface RunStats {
    gameSeconds?: number;
    kills?: number;
    gemsCollected?: number;
    cubesCollected?: number;
    shotsFired?: number;
    shotsHit?: number;
    /** Super STRZALY (ladunek z gemow), nie super moce. */
    supersFired?: number;
    /** Super MOCE (Aura / MegaBomba / Freeze). */
    powersUsed?: number;
    megaBossDefeated?: boolean;
    /** v0.114.0 — true gdy w runie uzyto kostki 🎲 (Szalone Moce; inny sufit wyniku). */
    funMode?: boolean;
}

/**
 * Filter dla zapytań — wszystkie pola optional.
 * Brak filtru = wszystkie wpisy.
 */
export interface ScoreFilter {
    scenario?: ScenarioId;
    map?: MapId;
    difficulty?: DifficultyId;
    profileId?: string;
    limit?: number;          // top N (default: bez limitu)
}

/**
 * Główny interfejs serwisu score.
 * Wszystkie metody async — przygotowane na REST/backend impl.
 */
export interface IScoreService {
    /** Zapisz score z aktualnej rozgrywki (po victory / game over). `stats` = metryki meczu. */
    submitScore(score: number, config: GameConfig, stats?: RunStats): Promise<ScoreEntry>;

    /** Pobierz top scores wg filtra (sortowane DESC po score). */
    getTopScores(filter: ScoreFilter): Promise<ScoreEntry[]>;

    /** Pobierz najlepszy score dla profilu (opcjonalnie per scenario). */
    getBestForProfile(profileId: string, scenario?: ScenarioId): Promise<ScoreEntry | null>;

    /** Wyczyść WSZYSTKIE score (testing / reset). */
    clearAll(): Promise<void>;

    /**
     * Opcjonalne: wymuś wysłanie zakolejkowanych offline wyników.
     * Implementuje tylko backend z kolejką (Supabase). LocalStorage pomija.
     */
    flushQueue?(): Promise<void>;
}

// ============================================================
// LocalStorage Implementation (FAZA 6 — placeholder, zostaje dla migracji 9b.4)
// ============================================================

const STORAGE_KEY = 'brawltanks.scores.v1';

export class LocalStorageScoreService implements IScoreService {
    private load(): ScoreEntry[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('[ScoreService] Failed to load scores', e);
            return [];
        }
    }

    private save(entries: ScoreEntry[]): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
        } catch (e) {
            console.warn('[ScoreService] Failed to save scores', e);
        }
    }

    private generateEntryId(): string {
        return `score_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    /** Surowy odczyt wszystkich lokalnych wynikow — uzywane przez migracje 9b.4. */
    getAllRaw(): ScoreEntry[] {
        return this.load();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async submitScore(score: number, config: GameConfig, _stats?: RunStats): Promise<ScoreEntry> {
        // LocalStorage impl (legacy/migracje) nie przechowuje statystyk — ScoreEntry ich nie ma.
        const entry: ScoreEntry = Object.freeze({
            id: this.generateEntryId(),
            profileId: config.profileId,
            brawlerId: config.brawlerId,
            score,
            scenario: config.scenario,
            map: config.map,
            difficulty: config.difficulty,
            timestamp: Date.now(),
            sessionId: config.sessionId,
        });
        const entries = this.load();
        entries.push(entry);
        this.save(entries);
        return entry;
    }

    async getTopScores(filter: ScoreFilter): Promise<ScoreEntry[]> {
        let entries = this.load();

        if (filter.scenario)   entries = entries.filter(e => e.scenario === filter.scenario);
        if (filter.map)        entries = entries.filter(e => e.map === filter.map);
        if (filter.difficulty) entries = entries.filter(e => e.difficulty === filter.difficulty);
        if (filter.profileId)  entries = entries.filter(e => e.profileId === filter.profileId);

        entries.sort((a, b) => b.score - a.score);

        if (filter.limit && filter.limit > 0) {
            entries = entries.slice(0, filter.limit);
        }
        return entries;
    }

    async getBestForProfile(profileId: string, scenario?: ScenarioId): Promise<ScoreEntry | null> {
        const results = await this.getTopScores({ profileId, scenario, limit: 1 });
        return results[0] ?? null;
    }

    async clearAll(): Promise<void> {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.warn('[ScoreService] Failed to clear', e);
        }
    }
}

// ============================================================
// Singleton — easily swappable w bootstrap (DI)
// ============================================================

/**
 * Domyślna instancja serwisu.
 * FAZA 9b.2: Supabase backend (REST + offline queue fallback).
 *
 * Powrot do localStorage (np. lokalne testy bez sieci): podmien na
 *   export const scoreService: IScoreService = new LocalStorageScoreService();
 *
 * LB-F1: ta sama instancja wystawiona tez jako leaderboardService (drugi typowany
 * widok — read-only RPC leaderboardu). Jeden klient Supabase, dwa kontrakty.
 */
const _scoreServiceImpl = new SupabaseScoreService();
export const scoreService: IScoreService = _scoreServiceImpl;
export const leaderboardService: ILeaderboardService = _scoreServiceImpl;