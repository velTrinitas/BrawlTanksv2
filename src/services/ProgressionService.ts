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
    openCrate as configOpenCrate,
    type TrophyMilestone,
    type CrateOpenResult,
} from '../config/progression';
import { getCosmetic, type CosmeticType } from '../config/cosmetics'; // F2a kosmetyki
import { supabaseProgressionService } from './SupabaseProgressionService'; // PROG-F1b cloud sync

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

    // ── F2a: Zrzuty + kosmetyki (lokalnie; sync = F2b) ──
    /** Ilosc nieotwartych skrzynek. */
    crateCount: number;
    /** Licznik otwartych skrzynek (pity: co 10 rzadki+, co 30 legendarny). */
    pityCounter: number;
    /** Posiadane kosmetyki (id z config/cosmetics). */
    ownedCosmetics: string[];
    /** Zalozone kosmetyki per typ. */
    equipped: Partial<Record<CosmeticType, string>>;
    /** Progi milestone za ktore juz skredytowano skrzynke (idempotencja + backfill). */
    crateMilestonesCredited: number[];
}

/** Migawka kosmetyczna do GARAZU / readout. */
export interface CosmeticState {
    crateCount: number;
    pityCounter: number;
    owned: readonly string[];
    equipped: Partial<Record<CosmeticType, string>>;
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
        this.creditMilestoneCrates(st); // F2a — skrzynka za milestony przekroczone tym runem
        st.updatedAt = Date.now();
        this.save();
        this.syncPush(profileId); // PROG-F1b — best-effort push do chmury (fire-and-forget)

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

    // === PROG-F1b: cloud sync (offline-first, best-effort) ===

    /**
     * Pobierz progresje z chmury i SCAL do lokalnej. Wszystkie pola MONOTONICZNE =>
     * merge = max/union, bezstratny miedzy urzadzeniami. Best-effort: blad (offline /
     * brak tabeli) => localStorage zostaje zrodlem prawdy. Woluj na starcie / gdy profil
     * aktywny (przed pokazaniem hubu, zeby readout mial scalone wartosci).
     * UWAGA: bolts=max jest OK DOPOKI srubki tylko rosna (brak wydawania). Gdy wejdzie
     * sklep (F2+), przejsc na ledger delt (design doc §13).
     */
    async syncPull(profileId: string): Promise<void> {
        this.ensureInitialized();
        try {
            const remote = await supabaseProgressionService.fetch(profileId);
            if (remote) {
                const st = this.getOrCreate(profileId);
                st.trophies = Math.max(st.trophies, remote.trophies ?? 0);
                st.bolts = Math.max(st.bolts, remote.bolts ?? 0);
                st.totalRuns = Math.max(st.totalRuns, remote.total_runs ?? 0);
                for (const [k, v] of Object.entries(remote.per_map_best ?? {})) {
                    st.perMapBest[k] = Math.max(st.perMapBest[k] ?? 0, Number(v) || 0);
                }
                const union = new Set<number>([...st.claimedMilestones, ...(remote.claimed_milestones ?? [])]);
                st.claimedMilestones = [...union].sort((a, b) => a - b);
                if (remote.last_run_day && (!st.lastRunDayKey || remote.last_run_day > st.lastRunDayKey)) {
                    st.lastRunDayKey = remote.last_run_day;
                }
                st.updatedAt = Date.now();
                this.save();
            }
        } catch (e) {
            console.warn('[Progression] syncPull failed (offline / brak tabeli?):', (e as Error).message);
            return; // localStorage pozostaje zrodlem prawdy
        }
        this.syncPush(profileId); // odeslij scalony stan (remote nadgania lokalne)
    }

    /** Best-effort push aktualnego stanu do chmury (fire-and-forget; offline => no-op). */
    syncPush(profileId: string): void {
        const st = this.states[profileId];
        if (!st) return;
        void supabaseProgressionService
            .upsert({
                profile_id: profileId,
                trophies: st.trophies,
                bolts: st.bolts,
                total_runs: st.totalRuns,
                per_map_best: st.perMapBest,
                claimed_milestones: st.claimedMilestones,
                last_run_day: st.lastRunDayKey,
            })
            .catch((e) => console.warn('[Progression] syncPush failed (offline?):', (e as Error).message));
    }

    getBolts(profileId: string): number {
        this.ensureInitialized();
        return this.getOrCreate(profileId).bolts;
    }

    // === F2a: Zrzuty + kosmetyki (lokalnie; sync = F2b) ===

    /** Migawka kosmetyczna (GARAZ + readout). */
    getCosmeticState(profileId: string): CosmeticState {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId);
        return {
            crateCount: st.crateCount,
            pityCounter: st.pityCounter,
            owned: st.ownedCosmetics,
            equipped: st.equipped,
        };
    }

    /**
     * Otworz jedna skrzynke. Zwraca wynik do reveal UI albo null (brak skrzynek).
     * Pity deterministyczny (openIndex = pityCounter+1: co 10 rzadki+, co 30 legendarny).
     * Kosmetyk (jesli nieposiadany) -> ownedCosmetics; zawsze srubki. Bolts syncuja (F1b).
     */
    openCrate(profileId: string): CrateOpenResult | null {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId);
        if (st.crateCount <= 0) return null;

        const openIndex = st.pityCounter + 1;
        const result = configOpenCrate(openIndex, Math.random, st.ownedCosmetics);

        st.crateCount -= 1;
        st.pityCounter = openIndex;
        st.bolts += result.bolts;
        if (result.cosmeticId && !st.ownedCosmetics.includes(result.cosmeticId)) {
            st.ownedCosmetics.push(result.cosmeticId);
        }
        st.updatedAt = Date.now();
        this.save();
        this.syncPush(profileId); // srubki z crate syncuja (kosmetyki = F2b)
        return result;
    }

    /** Zaloz/zdejmij kosmetyk (toggle po typie). No-op gdy nieposiadany. */
    equipCosmetic(profileId: string, cosmeticId: string): void {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId);
        if (!st.ownedCosmetics.includes(cosmeticId)) return;
        const def = getCosmetic(cosmeticId);
        if (!def) return;
        if (st.equipped[def.type] === cosmeticId) delete st.equipped[def.type]; // toggle off
        else st.equipped[def.type] = cosmeticId;
        st.updatedAt = Date.now();
        this.save();
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
                crateCount: 0,
                pityCounter: 0,
                ownedCosmetics: [],
                equipped: {},
                crateMilestonesCredited: [],
            };
            this.states[profileId] = st;
        } else {
            // normalizacja starych stanow z localStorage (sprzed F2a) — dopelnij nowe pola
            st.crateCount ??= 0;
            st.pityCounter ??= 0;
            st.ownedCosmetics ??= [];
            st.equipped ??= {};
            st.crateMilestonesCredited ??= [];
        }
        // backfill: skrzynka za kazdy osiagniety milestone jeszcze nieskredytowany (idempotentne)
        this.creditMilestoneCrates(st);
        return st;
    }

    /** Grantuje 1 skrzynke za kazdy osiagniety (trophies>=threshold) milestone niebedacy
     *  jeszcze w crateMilestonesCredited. Idempotentne (backfill + biezace przekroczenia). */
    private creditMilestoneCrates(st: ProgressionState): void {
        for (const m of TROPHY_MILESTONES) {
            if (st.trophies >= m.threshold && !st.crateMilestonesCredited.includes(m.threshold)) {
                st.crateCount += 1;
                st.crateMilestonesCredited.push(m.threshold);
            }
        }
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
