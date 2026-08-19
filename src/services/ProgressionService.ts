/**
 * ProgressionService — konto-progresja gracza (PROG-F1 spine).
 *
 * Design: docs/PROGRESSION_DESIGN_v1_2.md. Wzorzec: ProfileService (singleton,
 * localStorage, defensywne parsowanie). Per-profil (keyed by profileId).
 *
 * OFFLINE-FIRST: localStorage = zrodlo prawdy, chmura (tabela `progression`) = warstwa
 * dokladana best-effort. F1b = trofea/srubki/PB, F2b = kosmetyki + ekonomia skrzynek.
 * Merge: pola monotoniczne przez max/union, `equipped` przez last-write-wins (equippedAt).
 * ZASADA: nigdy nie synchronizujemy pola MALEJACEGO — max wskrzesilby wydany zasob
 * (dlatego liczba skrzynek jest wyliczana z cratesEarned - cratesOpened).
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
import type { ProgressionCosmetics, ProgressionPowers } from './supabase/types'; // PROG-F2b/F7a sync
import {
    getPowerDef, POWER_ORDER, DEFAULT_LOADOUT, TIER3_POWERS,
    type PowerId, type LoadoutTriple,
} from '../config/powers'; // PROG-F7a — loadout Super Mocy (v0.114.0: 3 sloty)
import { QuestService } from './QuestService'; // PROG-F3 — rozkazy (sync jedna sciezka upsertu)

const STORAGE_KEY = 'bt2:progression';

/**
 * F7b dev-flaga `?powersdev=1` — bypass progow trofeow mocy (testy przed 750/1500 🏆).
 * Inertna bez wpisania w URL. NIE wycieka na inne urzadzenia: nawet jesli zapiszesz
 * loadout z moca zza progu (syncPush), mecz i tak filtruje po owned
 * (resolveLoadoutForMatch), a owned liczy sie na kazdym urzadzeniu lokalnie.
 */
const DEV_ALL_POWERS: boolean = (() => {
    try { return new URLSearchParams(window.location.search).get('powersdev') === '1'; }
    catch { return false; }
})();

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

    // ── F2a: Zrzuty + kosmetyki (F2b: syncowane) ──
    /** Ile skrzynek gracz LACZNIE zdobyl (MONOTONICZNY — merge: max). */
    cratesEarned: number;
    /** Ile skrzynek gracz LACZNIE otworzyl (MONOTONICZNY — merge: max). */
    cratesOpened: number;
    /** Licznik otwartych skrzynek dla pity (co 10 rzadki+, co 30 legendarny). */
    pityCounter: number;
    /** Posiadane kosmetyki (id z config/cosmetics). Merge: union. */
    ownedCosmetics: string[];
    /** Zalozone kosmetyki per typ. Merge: last-write-wins po equippedAt. */
    equipped: Partial<Record<CosmeticType, string>>;
    /** Kiedy ostatnio zmieniono equipped (ms) — rozstrzyga LWW przy merdze. */
    equippedAt: number;
    /** Progi milestone za ktore juz skredytowano skrzynke (idempotencja + backfill). */
    crateMilestonesCredited: number[];

    // ── F7a: Super Moce (loadout z GARAZU) ──
    /** Moce przyznane JAWNIE (F7b eventy/granty). Bazowa trojka + progi liczone z rejestru. */
    ownedPowers: string[];
    /** 2 sloty loadoutu. Merge: last-write-wins po loadoutAt (preferencja, nie zasob). */
    loadout: (string | null)[];
    loadoutAt: number;
    /** v0.114.0: toggle "Szalone Moce" (slot 🎲). Merge: LWW po funModeAt (preferencja). */
    funModeOn: boolean;
    funModeAt: number;
}

/**
 * Liczba NIEOTWARTYCH skrzynek — zawsze WYLICZANA z dwoch licznikow monotonicznych.
 * Nigdy nie trzymamy jej w stanie: pole malejace zmergowane przez `max` (wzorzec F1b)
 * wskrzeszaloby wydane skrzynki miedzy urzadzeniami = duplikacja zasobu.
 */
function crateCountOf(st: ProgressionState): number {
    return Math.max(0, st.cratesEarned - st.cratesOpened);
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
    /** Subskrybenci "chmura wlasnie domergowala stan" (PROG-F2b) — patrz subscribeSync. */
    private syncListeners = new Set<(profileId: string) => void>();

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
                // F2b — kosmetyki + ekonomia skrzynek. KOLEJNOSC KRYTYCZNA: merge MUSI byc
                // przed creditMilestoneCrates, inaczej backfill zobaczy jeszcze niescalona
                // liste crateMilestonesCredited i wygeneruje skrzynki za milestony ktore
                // gracz juz otworzyl (dziura w ekonomii przy czystym localStorage).
                this.mergeCosmetics(st, remote.cosmetics);
                this.mergePowers(st, remote.powers); // F7a — po merdze trofeow (progi licza z trofeow)
                this.creditMilestoneCrates(st);
                // PROG-F3 — rozkazy scalane PO trofeach (skalowanie celow czyta trofea konta).
                QuestService.mergeRemote(profileId, remote.quests, st.trophies);
                st.updatedAt = Date.now();
                this.save();
                this.notifySynced(profileId);
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
                cosmetics: {
                    v: 1,
                    owned: st.ownedCosmetics,
                    equipped: st.equipped as Record<string, string>,
                    equippedAt: st.equippedAt,
                    cratesEarned: st.cratesEarned,
                    cratesOpened: st.cratesOpened,
                    pityCounter: st.pityCounter,
                    crateMilestones: st.crateMilestonesCredited,
                },
                quests: QuestService.serialize(profileId), // PROG-F3
                powers: {                                   // PROG-F7a
                    v: 1,
                    owned: st.ownedPowers,
                    loadout: st.loadout,
                    loadoutAt: st.loadoutAt,
                    funModeOn: st.funModeOn,                // v0.114.0 — toggle 🎲
                    funModeAt: st.funModeAt,
                },
            })
            .catch((e) => console.warn('[Progression] syncPush failed (offline?):', (e as Error).message));
    }

    /**
     * Subskrybuj "chmura domergowala stan" (PROG-F2b). Zwraca funkcje odsubskrybowania.
     * Potrzebne, bo syncPull startuje na boocie fire-and-forget (main.ts) — hub potrafi
     * wyrenderowac sie ZANIM dane wroca i pokazalby stary readout/kolekcje.
     */
    subscribeSync(fn: (profileId: string) => void): () => void {
        this.syncListeners.add(fn);
        return () => { this.syncListeners.delete(fn); };
    }

    private notifySynced(profileId: string): void {
        for (const fn of this.syncListeners) {
            try {
                fn(profileId);
            } catch (e) {
                console.error('[Progression] sync listener failed:', (e as Error).stack ?? e, { profileId });
            }
        }
    }

    /**
     * Merge pod-dokumentu kosmetycznego (F2b). Reguly:
     *  - owned / crateMilestones     -> UNION (bezstratne)
     *  - cratesEarned/Opened, pity   -> MAX (monotoniczne; liczba skrzynek = roznica)
     *  - equipped                    -> LAST-WRITE-WINS po equippedAt (to preferencja,
     *                                   nie zasob — union nie mialby sensu)
     * Brak pola / pusty '{}' (wiersz sprzed migracji) => stan lokalny zostaje nietkniety.
     * SWIADOMY KOMPROMIS: dwa urzadzenia offline otwierajace skrzynke jednoczesnie daja
     * cratesOpened=max (zero duplikacji skrzynek), ale owned=union => gracz zachowuje oba
     * kosmetyki. Na korzysc gracza, bez wplywu na balans (kosmetyka nie daje statow).
     */
    private mergeCosmetics(st: ProgressionState, remote: ProgressionCosmetics | null | undefined): void {
        if (!remote || typeof remote !== 'object') return;

        if (Array.isArray(remote.owned)) {
            const owned = new Set<string>([...st.ownedCosmetics, ...remote.owned.filter(id => !!getCosmetic(id))]);
            st.ownedCosmetics = [...owned];
        }
        if (Array.isArray(remote.crateMilestones)) {
            const ms = new Set<number>([
                ...st.crateMilestonesCredited,
                ...remote.crateMilestones.map(Number).filter(n => Number.isFinite(n)),
            ]);
            st.crateMilestonesCredited = [...ms].sort((a, b) => a - b);
        }
        st.cratesEarned = Math.max(st.cratesEarned, Number(remote.cratesEarned) || 0);
        st.cratesOpened = Math.max(st.cratesOpened, Number(remote.cratesOpened) || 0);
        st.pityCounter = Math.max(st.pityCounter, Number(remote.pityCounter) || 0);

        // Adoptuj zdalny wyglad gdy jest NOWSZY, albo gdy to urzadzenie NIGDY nie dokonalo
        // wlasnego wyboru (equippedAt=0 = swieza instalacja / wyczyszczony localStorage) —
        // nie ma wtedy czego nadpisac. Bez tej sciezki stan sprzed F2b (znacznik 0 po obu
        // stronach) nie odtworzylby sie nigdy. Swiadome zdjecie kosmetyku stempluje czas,
        // wiec nie zostanie cofniete przez starszy wpis w chmurze.
        const remoteAt = Number(remote.equippedAt) || 0;
        const localNeverChosen = st.equippedAt === 0;
        if (remote.equipped && (remoteAt > st.equippedAt || localNeverChosen)) {
            const next: Partial<Record<CosmeticType, string>> = {};
            for (const [type, id] of Object.entries(remote.equipped)) {
                const def = getCosmetic(String(id));
                // odrzuc nieznane id (kosmetyk wyciety z rejestru / recznie zmajstrowany wiersz)
                // oraz takie, ktorych gracz po merdze nie posiada
                if (def && def.type === type && st.ownedCosmetics.includes(def.id)) next[def.type] = def.id;
            }
            st.equipped = next;
            st.equippedAt = remoteAt;
        }
    }

    getBolts(profileId: string): number {
        this.ensureInitialized();
        return this.getOrCreate(profileId).bolts;
    }

    // === F2a: Zrzuty + kosmetyki (F2b: syncowane przez kolumne progression.cosmetics) ===

    /** Migawka kosmetyczna (GARAZ + readout). */
    getCosmeticState(profileId: string): CosmeticState {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId);
        return {
            crateCount: crateCountOf(st), // wyliczane (earned - opened), nigdy trzymane
            pityCounter: st.pityCounter,
            owned: st.ownedCosmetics,
            equipped: st.equipped,
        };
    }

    /**
     * Otworz jedna skrzynke. Zwraca wynik do reveal UI albo null (brak skrzynek).
     * Pity deterministyczny (openIndex = pityCounter+1: co 10 rzadki+, co 30 legendarny).
     * Kosmetyk (jesli nieposiadany) -> ownedCosmetics; zawsze srubki. Wszystko syncuje (F2b).
     */
    openCrate(profileId: string): CrateOpenResult | null {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId);
        if (crateCountOf(st) <= 0) return null;

        const openIndex = st.pityCounter + 1;
        const result = configOpenCrate(openIndex, Math.random, st.ownedCosmetics);

        st.cratesOpened += 1; // MONOTONICZNY — licznik nieotwartych to (earned - opened)
        st.pityCounter = openIndex;
        st.bolts += result.bolts;
        if (result.cosmeticId && !st.ownedCosmetics.includes(result.cosmeticId)) {
            st.ownedCosmetics.push(result.cosmeticId);
        }
        st.updatedAt = Date.now();
        this.save();
        this.syncPush(profileId); // F2b — srubki + kosmetyk + licznik otwarc ida do chmury
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
        st.equippedAt = Date.now(); // znacznik LWW — rozstrzyga merge miedzy urzadzeniami
        st.updatedAt = st.equippedAt;
        this.save();
        this.syncPush(profileId); // F2b — bez tego zmiana wygladu nie przechodzi na inne urzadzenie
    }

    // === F7a: Super Moce (loadout z GARAZU) ===

    /** Migawka mocy: dostepne moce (prog trofeow LUB jawny grant) + loadout 3 slotow + toggle 🎲. */
    getPowerState(profileId: string): { owned: readonly PowerId[]; loadout: LoadoutTriple; trophies: number; funModeOn: boolean } {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId);
        return {
            owned: POWER_ORDER.filter(id => this.isPowerOwned(st, id)),
            loadout: [asPowerId(st.loadout[0]), asPowerId(st.loadout[1]), asPowerId(st.loadout[2])],
            trophies: st.trophies,
            funModeOn: st.funModeOn,
        };
    }

    /**
     * v0.114.0: toggle "Szalone Moce" (GARAZ) — wlacza slot 🎲 w meczach. Dostepny dla
     * wszystkich (slot jest mechanizmem dostepu do puli T3; runy flagowane fun_mode).
     */
    setFunMode(profileId: string, on: boolean): void {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId);
        st.funModeOn = on;
        st.funModeAt = Date.now(); // znacznik LWW — jak loadoutAt
        st.updatedAt = st.funModeAt;
        this.save();
        this.syncPush(profileId);
    }

    /**
     * Ustaw moc w slocie loadoutu (GARAZ). Duplikat w drugim slocie => SWAP (klasyk
     * pickerow — gracz nie moze miec 2x tej samej mocy). No-op gdy moc nieznana/niedostepna.
     */
    setLoadoutSlot(profileId: string, slot: 0 | 1 | 2, id: PowerId): void {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId);
        if (!this.isPowerOwned(st, id)) return;
        // v0.114.0: Tier 3 tylko przez kostke 🎲 — nie wchodzi do loadoutu (UI tez
        // nie oferuje, ale to jest bramka na zmajstrowane wywolania).
        if (TIER3_POWERS.includes(id)) return;
        // v0.114.0: 3 sloty — duplikat w KTORYMKOLWIEK innym slocie => swap wartosci.
        for (const other of [0, 1, 2] as const) {
            if (other !== slot && st.loadout[other] === id) {
                st.loadout[other] = st.loadout[slot] ?? null;
            }
        }
        st.loadout[slot] = id;
        st.loadoutAt = Date.now(); // znacznik LWW — rozstrzyga merge miedzy urzadzeniami
        st.updatedAt = st.loadoutAt;
        this.save();
        this.syncPush(profileId); // preferencja idzie do chmury od razu (jak equip kosmetyku)
    }

    /**
     * Dostepnosc mocy: prog trofeow z REJESTRU (samonaprawialne miedzy urzadzeniami —
     * trofea sa monotoniczne) LUB jawny grant w ownedPowers (F7b eventy).
     */
    private isPowerOwned(st: ProgressionState, id: PowerId): boolean {
        const def = getPowerDef(id);
        if (!def) return false;
        if (DEV_ALL_POWERS) return true; // ?powersdev=1 — testy przed progiem
        return st.trophies >= def.unlockAtTrophies || st.ownedPowers.includes(id);
    }

    /**
     * Merge pod-dokumentu mocy (F7a, wzorzec F2b): owned = UNION (grant gdziekolwiek =
     * grant wszedzie), loadout = LAST-WRITE-WINS po loadoutAt (preferencja, nie zasob).
     * Nieznane id (moc wycieta z rejestru / zmajstrowany wiersz) sa odrzucane.
     */
    private mergePowers(st: ProgressionState, remote: ProgressionPowers | null | undefined): void {
        if (!remote || typeof remote !== 'object') return;

        if (Array.isArray(remote.owned)) {
            const owned = new Set<string>([...st.ownedPowers, ...remote.owned.filter(id => !!getPowerDef(String(id)))]);
            st.ownedPowers = [...owned];
        }

        const remoteAt = Number(remote.loadoutAt) || 0;
        const localNeverChosen = st.loadoutAt === 0;
        if (Array.isArray(remote.loadout) && (remoteAt > st.loadoutAt || localNeverChosen)) {
            // v0.114.0: T3 odrzucany jak nieznane id (kostka = jedyny dostep do szalonych).
            const next = remote.loadout.slice(0, 3).map(id => {
                const s = String(id);
                return getPowerDef(s) && !TIER3_POWERS.includes(s as PowerId) ? s : null;
            });
            if (next.some(id => id !== null)) {
                st.loadout = [next[0] ?? null, next[1] ?? null, next[2] ?? null];
                st.loadoutAt = Math.max(remoteAt, st.loadoutAt);
                // Zdalny stan 2-slotowy (stary klient) => dopelnij dziury lokalnie.
                fillLoadoutEmptySlots(st);
            }
        }

        // v0.114.0 — toggle 🎲: LWW po funModeAt (preferencja, wzorzec loadoutu).
        const remoteFunAt = Number(remote.funModeAt) || 0;
        if (typeof remote.funModeOn === 'boolean' && (remoteFunAt > st.funModeAt || st.funModeAt === 0)) {
            st.funModeOn = remote.funModeOn;
            st.funModeAt = Math.max(remoteFunAt, st.funModeAt);
        }
    }

    // === F3: nagrody za rozkazy ===

    /**
     * Zaksieguj nagrode za rozkaz (PROG-F3). JEDYNA sciezka przyznawania srubek/skrzynek
     * za questy — dzieki temu `cratesEarned` pozostaje jedynym autorytetem skrzynek
     * (lekcja F2b: pole malejace + merge max = duplikacja zasobu).
     * Idempotencje pilnuje QuestService (klucz claimed z prefiksem okresu) — tutaj tylko ksiegujemy.
     */
    grantQuestReward(profileId: string, reward: { bolts: number; crates: number }): void {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId);
        st.bolts += Math.max(0, Math.round(reward.bolts));
        st.cratesEarned += Math.max(0, Math.round(reward.crates));
        st.updatedAt = Date.now();
        this.save();
        this.syncPush(profileId);
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
                cratesEarned: 0,
                cratesOpened: 0,
                pityCounter: 0,
                ownedCosmetics: [],
                equipped: {},
                equippedAt: 0,
                crateMilestonesCredited: [],
                ownedPowers: [],
                loadout: [...DEFAULT_LOADOUT],
                loadoutAt: 0,
                funModeOn: false,
                funModeAt: 0,
            };
            this.states[profileId] = st;
        } else {
            // normalizacja starych stanow z localStorage (sprzed F2a) — dopelnij nowe pola
            st.pityCounter ??= 0;
            st.ownedCosmetics ??= [];
            st.equipped ??= {};
            st.equippedAt ??= 0;
            st.crateMilestonesCredited ??= [];
            // F2b — migracja z malejacego crateCount na dwa liczniki monotoniczne.
            // Do F2a pityCounter == liczba otwarc, wiec earned = nieotwarte + otwarte
            // odtwarza stan gracza 1:1 (bez gubienia i bez dosypywania skrzynek).
            const legacy = st as ProgressionState & { crateCount?: number };
            if (legacy.cratesEarned === undefined || legacy.cratesOpened === undefined) {
                st.cratesOpened = st.pityCounter;
                st.cratesEarned = (legacy.crateCount ?? 0) + st.pityCounter;
            }
            delete legacy.crateCount;
            // F7a — normalizacja starych stanow o pola super mocy
            st.ownedPowers ??= [];
            st.loadout ??= [...DEFAULT_LOADOUT];
            st.loadoutAt ??= 0;
            // v0.114.0 — stary stan 2-slotowy dostaje 3. slot; T3 wypada z loadoutu
            // (kostka jest jedynym dostepem — stany dev/zmajstrowane czyscimy, inaczej
            // resolve remapowalby z notifem CO MECZ). Bez bumpu loadoutAt.
            for (let i = 0; i < 3; i++) {
                const cur = st.loadout[i];
                if (cur && TIER3_POWERS.includes(cur as PowerId)) st.loadout[i] = null;
            }
            fillLoadoutEmptySlots(st);
            // v0.114.0 — toggle Szalonych Mocy (slot 🎲)
            st.funModeOn ??= false;
            st.funModeAt ??= 0;
            // F2b — kosmetyk zalozony jeszcze w F2a nie ma znacznika LWW (equippedAt=0),
            // wiec przegralby kazde porownanie i nie odtworzylby sie na innym urzadzeniu.
            // Nadaj mu czas ostatniego zapisu stanu (realny moment tamtej zmiany).
            if (st.equippedAt === 0 && Object.keys(st.equipped).length > 0) {
                st.equippedAt = st.updatedAt || Date.now();
            }
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
                st.cratesEarned += 1;
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

/** Waliduj id mocy ze stanu (localStorage/chmura moga niesc smieci) — nieznane => null. */
function asPowerId(id: string | null | undefined): PowerId | null {
    return id && getPowerDef(id) ? (id as PowerId) : null;
}

/**
 * v0.114.0: dopelnij puste sloty loadoutu do 3 (stare stany/starzy klienci mieli 2;
 * scrub T3 tez zostawia dziury). Kandydaci = trojka legacy (kazdy ma je od startu).
 * NIE bumpuje loadoutAt — to dopelnienie techniczne, nie preferencja gracza.
 */
function fillLoadoutEmptySlots(st: ProgressionState): void {
    while (st.loadout.length < 3) st.loadout.push(null);
    const candidates: PowerId[] = ['freeze', 'aura', 'megaBomb'];
    for (let i = 0; i < 3; i++) {
        if (st.loadout[i]) continue;
        st.loadout[i] = candidates.find(id => !st.loadout.includes(id)) ?? null;
    }
}

// import lokalny bez cyklu — lista milestonow do prevThresholdBelow
import { TROPHY_MILESTONES } from '../config/progression';
function getNextMilestoneList(): readonly TrophyMilestone[] { return TROPHY_MILESTONES; }

/** Singleton — import wszedzie. */
export const ProgressionService = new ProgressionServiceImpl();
