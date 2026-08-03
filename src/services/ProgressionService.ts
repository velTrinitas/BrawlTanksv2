/**
 * ProgressionService — konto-progresja gracza (PROG-F1 spine).
 *
 * Design: docs/PROGRESSION_DESIGN_v1_2.md. Wzorzec: ProfileService (singleton,
 * localStorage, defensywne parsowanie). Per-profil (keyed by profileId).
 *
 * OFFLINE-FIRST: localStorage = zrodlo prawdy. Sync do Supabase = OSOBNA pod-faza
 * (F1b) — wymaga migracji tabeli/kolumny (profiles.progression JSONB); trofea/rubki
 * tylko rosna => merge trywialny (max/suma), do zaprojektowania z anti-cheat L2.
 *
 * recordRun() woluj RAZ na koncu meczu (triggerVictory/triggerGameOver) PO ustaleniu
 * finalnego score (po Perfect Run bonus). Dziala dla WSZYSTKICH scenariuszy — progresja
 * jest lokalna i niezalezna od submitu leaderboardu (CTF liczy sie do progresji nawet
 * gdy nie submituje wyniku).
 */

import type { MapId } from '../types/MapType';
import {
    computeTrophies,
    getMilestonesCrossed,
    getNextMilestone,
    BOLTS_PER_TROPHY,
    type TrophyMilestone,
} from '../config/progression';

const STORAGE_KEY = 'bt2:progression';

/** Stan progresji jednego profilu (localStorage). */
interface ProgressionState {
    profileId: string;
    trophies: number;
    bolts: number;
    /** Rekord score per mapa (do detekcji nowego PB = bonus trofeow). */
    perMapBest: Record<string, number>;
    /** Progi milestone juz nagrodzone (idempotencja — nagroda pada raz). */
    claimedMilestones: number[];
    /** Klucz dnia ostatniego runa (YYYY-MM-DD lokalnie) — bonus "pierwszy run dnia". */
    lastRunDayKey: string | null;
    totalRuns: number;
    updatedAt: number;
}

/** Wynik recordRun — zasila endcard ("+X trofea", milestone) + telemetrie. */
export interface RunProgressionResult {
    trophiesGained: number;
    trophyBase: number;
    trophyBonus: number;
    bonusPerfectRun: boolean;
    bonusFirstRunOfDay: boolean;
    bonusNewPersonalBest: boolean;
    trophiesBefore: number;
    trophiesAfter: number;
    milestonesCrossed: TrophyMilestone[];
    boltsGained: number;
    boltsTotal: number;
    /** Najblizszy nieosiagniety milestone PO runie (do paska w hubie / "jeszcze X"). */
    nextMilestone: TrophyMilestone | null;
}

/** Migawka stanu do UI (hub trophy bar). */
export interface ProgressionSnapshot {
    trophies: number;
    bolts: number;
    nextMilestone: TrophyMilestone | null;
    /** Postep 0..1 do nastepnego milestone (od poprzedniego progu). Gdy brak next: 1. */
    progressToNext: number;
}

/** Lokalny klucz dnia (YYYY-MM-DD) — bonus "pierwszy run dnia". */
function localDayKey(now: number = Date.now()): string {
    const d = new Date(now);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

class ProgressionServiceImpl {
    private states: Record<string, ProgressionState> = {};
    private initialized = false;

    // === Public API ===

    /**
     * Zarejestruj zakonczony mecz. Zwraca RunProgressionResult (trofea/rubki/milestony).
     * @param score finalny GameSession.score (po Perfect Run bonus)
     */
    recordRun(
        profileId: string,
        score: number,
        map: MapId,
        opts: { perfectRun?: boolean } = {},
    ): RunProgressionResult {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId);

        const dayKey = localDayKey();
        const firstRunOfDay = st.lastRunDayKey !== dayKey;
        const prevBest = st.perMapBest[map] ?? 0;
        const newPersonalBest = score > prevBest;

        const breakdown = computeTrophies(score, map, {
            perfectRun: opts.perfectRun,
            firstRunOfDay,
            newPersonalBest,
        });

        const before = st.trophies;
        const after = before + breakdown.total;

        // milestony: przekroczone tym runem, jeszcze nie nagrodzone (idempotencja)
        const crossed = getMilestonesCrossed(before, after)
            .filter(m => !st.claimedMilestones.includes(m.threshold));
        const boltsFromMilestones = crossed.reduce((s, m) => s + m.bolts, 0);
        const boltsFromRun = Math.round(breakdown.total * BOLTS_PER_TROPHY);
        const boltsGained = boltsFromRun + boltsFromMilestones;

        // commit
        st.trophies = after;
        st.bolts += boltsGained;
        if (newPersonalBest) st.perMapBest[map] = score;
        st.lastRunDayKey = dayKey;
        st.totalRuns += 1;
        for (const m of crossed) st.claimedMilestones.push(m.threshold);
        st.updatedAt = Date.now();
        this.save();

        return {
            trophiesGained: breakdown.total,
            trophyBase: breakdown.base,
            trophyBonus: breakdown.bonus,
            bonusPerfectRun: !!opts.perfectRun,
            bonusFirstRunOfDay: firstRunOfDay,
            bonusNewPersonalBest: newPersonalBest,
            trophiesBefore: before,
            trophiesAfter: after,
            milestonesCrossed: crossed,
            boltsGained,
            boltsTotal: st.bolts,
            nextMilestone: getNextMilestone(after),
        };
    }

    /** Migawka do hub trophy bar. */
    getSnapshot(profileId: string): ProgressionSnapshot {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId);
        const next = getNextMilestone(st.trophies);
        let progressToNext = 1;
        if (next) {
            // poprzedni prog = najwyzszy zdobyty threshold ponizej next (albo 0)
            const prevThreshold = this.prevThresholdBelow(next.threshold, st.trophies);
            const span = next.threshold - prevThreshold;
            progressToNext = span > 0 ? Math.min(1, Math.max(0, (st.trophies - prevThreshold) / span)) : 0;
        }
        return { trophies: st.trophies, bolts: st.bolts, nextMilestone: next, progressToNext };
    }

    getTrophies(profileId: string): number {
        this.ensureInitialized();
        return this.getOrCreate(profileId).trophies;
    }

    getBolts(profileId: string): number {
        this.ensureInitialized();
        return this.getOrCreate(profileId).bolts;
    }

    // === Internal ===

    private prevThresholdBelow(nextThreshold: number, _trophies: number): number {
        // najwyzszy prog milestone ponizej nextThreshold (start segmentu paska)
        let prev = 0;
        for (const m of getNextMilestoneList()) {
            if (m.threshold >= nextThreshold) break;
            prev = m.threshold;
        }
        return prev;
    }

    private getOrCreate(profileId: string): ProgressionState {
        let st = this.states[profileId];
        if (!st) {
            st = {
                profileId,
                trophies: 0,
                bolts: 0,
                perMapBest: {},
                claimedMilestones: [],
                lastRunDayKey: null,
                totalRuns: 0,
                updatedAt: Date.now(),
            };
            this.states[profileId] = st;
        }
        return st;
    }

    private ensureInitialized(): void {
        if (this.initialized) return;
        this.load();
        this.initialized = true;
    }

    private load(): void {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            this.states = {};
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                console.warn('[ProgressionService] Stored state not a map, resetting');
                this.states = {};
                return;
            }
            const valid: Record<string, ProgressionState> = {};
            for (const [pid, entry] of Object.entries(parsed as Record<string, unknown>)) {
                if (this.isValidState(entry)) valid[pid] = entry as ProgressionState;
                else console.warn('[ProgressionService] Dropping invalid progression entry:', pid);
            }
            this.states = valid;
        } catch (e) {
            console.error('[ProgressionService] Failed to parse progression, resetting:', e);
            this.states = {};
        }
    }

    private save(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.states));
        } catch (e) {
            console.error('[ProgressionService] Failed to save progression:', e);
        }
    }

    private isValidState(entry: unknown): boolean {
        if (typeof entry !== 'object' || entry === null) return false;
        const e = entry as Record<string, unknown>;
        return (
            typeof e.profileId === 'string' &&
            typeof e.trophies === 'number' &&
            typeof e.bolts === 'number' &&
            typeof e.perMapBest === 'object' && e.perMapBest !== null &&
            Array.isArray(e.claimedMilestones) &&
            typeof e.totalRuns === 'number'
        );
    }
}

// import lokalny bez cyklu — lista milestonow do prevThresholdBelow
import { TROPHY_MILESTONES } from '../config/progression';
function getNextMilestoneList(): readonly TrophyMilestone[] { return TROPHY_MILESTONES; }

/** Singleton — import wszedzie. */
export const ProgressionService = new ProgressionServiceImpl();
