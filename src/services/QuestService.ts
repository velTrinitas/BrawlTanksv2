/**
 * QuestService — ROZKAZY: stan, postep, rollover, odbior nagrod (PROG-F3).
 *
 * Wzorzec: ProgressionService (singleton, localStorage per profil, defensywne parsowanie).
 * OFFLINE-FIRST: localStorage = zrodlo prawdy; chmura dochodzi kolumna `progression.quests`
 * (serialize/mergeRemote wolane przez ProgressionService — JEDNA sciezka upsertu).
 *
 * IDEMPOTENCJA NAGROD (lekcja F2b): `claimed` trzyma klucze z PREFIKSEM OKRESU
 * ("2026-08-04:e_kill"), a nagrody ida przez ProgressionService (monotoniczne liczniki).
 * Dzieki temu wyczyszczenie localStorage + pull z chmury NIE pozwala odebrac drugi raz.
 *
 * KOSZT W PETLI GRY: track() to porownanie <=6 wpisow + inkrementacja inta, wolane przy
 * zdarzeniach ktore i tak juz zachodza (kill/pickup). Zero alokacji per klatke.
 */

import type { ProgressionQuests } from './supabase/types';
import {
    pickDailyQuests, pickWeeklyQuests, getQuestDef, getQuestScale,
    QUEST_UNLOCK_TROPHIES, DAILY_SET_BOLTS, DAILY_SET_CRATES, QUEST_CONFIG_VERSION,
    WEEKLY_SET_BOLTS, WEEKLY_SET_CRATES,
    type ActiveQuest, type QuestMetric, type QuestDef,
} from '../config/quests';

const STORAGE_KEY = 'bt2:quests';
/** Anty-spam toastow postepu w trakcie meczu (§17.6: pokazujemy progi, nie kazdy tick). */
const PROGRESS_TOAST_COOLDOWN_MS = 8000;
/** Ile ostatnich wpisow claimed trzymamy (klucze sa prefiksowane okresem => rosna w czasie). */
const CLAIMED_HISTORY_LIMIT = 120;

/** Zapisana instancja rozkazu (odtwarzana przez getQuestDef po id). */
interface StoredQuest {
    key: string;
    defId: string;
    target: number;
    param?: string;
}

interface QuestState {
    profileId: string;
    /** Wersja konfiguracji, z ktorej wylosowano zestawy (QUEST_CONFIG_VERSION). */
    cfg: number;
    dayKey: string;
    weekKey: string;
    daily: StoredQuest[];
    weekly: StoredQuest[];
    /** postep per klucz rozkazu: number (sum/max) albo string[] (set). */
    progress: Record<string, number | string[]>;
    /** odebrane nagrody — klucze z prefiksem okresu ("2026-08-04:e_kill", "...:__set"). */
    claimed: string[];
    updatedAt: number;
}

/** Widok pojedynczego rozkazu dla UI. */
export interface QuestView {
    key: string;
    def: QuestDef;
    target: number;
    param?: string;
    current: number;
    done: boolean;
    claimed: boolean;
}

/** Pelna deska rozkazow dla sekcji HUB-3. */
export interface QuestBoard {
    unlocked: boolean;
    unlockAt: number;
    dayKey: string;
    daily: QuestView[];
    weekly: QuestView[];
    /** Ile z 3 dziennych ukonczonych (do paska "komplet dnia"). */
    dailyDone: number;
    dailySetReady: boolean;
    dailySetClaimed: boolean;
    setBolts: number;
    setCrates: number;
    /** v0.126.0 — KOMPLET TYGODNIA, lustro kompletu dnia (osobny klucz okresu). */
    weeklyDone: number;
    weeklySetReady: boolean;
    weeklySetClaimed: boolean;
    weeklySetBolts: number;
    weeklySetCrates: number;
}

export interface QuestReward {
    bolts: number;
    crates: number;
}

/** Klucz dnia (YYYY-MM-DD, lokalnie) — spojny z ProgressionService.lastRunDayKey. */
function dayKeyOf(now: number = Date.now()): string {
    const d = new Date(now);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

/** Klucz tygodnia ISO (YYYY-Www) — poniedzialek startuje tydzien. */
function weekKeyOf(now: number = Date.now()): string {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    // ISO: czwartek tego samego tygodnia wyznacza rok i numer
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const firstThursday = new Date(d.getFullYear(), 0, 4);
    firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
    const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

class QuestServiceImpl {
    private states: Record<string, QuestState> = {};
    private initialized = false;

    /** Profil aktywnego meczu — ustawiany w beginRun(), zeby track() nie nosil pid. */
    private runProfileId: string | null = null;
    private lastProgressToastAt = 0;

    /**
     * Callback do feedbacku w grze (main.ts podpina hud.addNotif). 'progress' jest
     * throttlowany, 'done' leci zawsze. Ustawiany raz — nie wolaj z niego cieżkich rzeczy.
     */
    public onQuestEvent: ((kind: 'progress' | 'done', quest: QuestView) => void) | null = null;

    // === Deska rozkazow (UI) ===

    /** Odswiez okresy + zwroc pelna deske. Wolaj przy renderze sekcji ROZKAZY. */
    getBoard(profileId: string, trophies: number): QuestBoard {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId, trophies);
        const daily = st.daily.map(q => this.toViewSafe(st, q, st.dayKey)).filter((v): v is QuestView => !!v);
        const weekly = st.weekly.map(q => this.toViewSafe(st, q, st.weekKey)).filter((v): v is QuestView => !!v);
        const dailyDone = daily.filter(v => v.done).length;
        const weeklyDone = weekly.filter(v => v.done).length;
        return {
            unlocked: trophies >= QUEST_UNLOCK_TROPHIES,
            unlockAt: QUEST_UNLOCK_TROPHIES,
            dayKey: st.dayKey,
            daily,
            weekly,
            dailyDone,
            dailySetReady: dailyDone >= st.daily.length && st.daily.length > 0,
            dailySetClaimed: st.claimed.includes(`${st.dayKey}:__set`),
            setBolts: DAILY_SET_BOLTS,
            setCrates: DAILY_SET_CRATES,
            weeklyDone,
            weeklySetReady: weeklyDone >= st.weekly.length && st.weekly.length > 0,
            weeklySetClaimed: st.claimed.includes(`${st.weekKey}:__wset`),
            weeklySetBolts: WEEKLY_SET_BOLTS,
            weeklySetCrates: WEEKLY_SET_CRATES,
        };
    }

    /**
     * Odbierz nagrode za rozkaz. Zwraca nagrode do zaksiegowania przez ProgressionService
     * albo null (nieukonczony / juz odebrany / nieznany). Wywolujacy MUSI zaksiegowac.
     */
    claim(profileId: string, questKey: string, trophies: number): QuestReward | null {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId, trophies);
        const daily = st.daily.find(q => q.key === questKey);
        const weekly = daily ? undefined : st.weekly.find(q => q.key === questKey);
        const stored = daily ?? weekly;
        if (!stored) return null;

        const period = daily ? st.dayKey : st.weekKey;
        const claimKey = `${period}:${questKey}`;
        if (st.claimed.includes(claimKey)) return null;

        const view = this.toView(st, stored, period);
        if (!view.done) return null;

        st.claimed.push(claimKey);
        this.trimClaimed(st);
        st.updatedAt = Date.now();
        this.save();
        return { bolts: view.def.bolts, crates: view.def.crates ?? 0 };
    }

    /** Odbierz bonus za KOMPLET DNIA (3/3) — glowny hak dnia: skrzynka. */
    claimDailySet(profileId: string, trophies: number): QuestReward | null {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId, trophies);
        const claimKey = `${st.dayKey}:__set`;
        if (st.claimed.includes(claimKey)) return null;
        const done = st.daily.filter(q => this.toView(st, q, st.dayKey).done).length;
        if (st.daily.length === 0 || done < st.daily.length) return null;

        st.claimed.push(claimKey);
        this.trimClaimed(st);
        st.updatedAt = Date.now();
        this.save();
        return { bolts: DAILY_SET_BOLTS, crates: DAILY_SET_CRATES };
    }

    /**
     * v0.126.0 — KOMPLET TYGODNIA. Lustro `claimDailySet`, ale na kluczu TYGODNIA
     * (`weekKey:__wset`), wiec nie koliduje z dziennym `dayKey:__set` nawet tego
     * samego dnia — klucze `claimed` sa prefiksowane okresem.
     */
    claimWeeklySet(profileId: string, trophies: number): QuestReward | null {
        this.ensureInitialized();
        const st = this.getOrCreate(profileId, trophies);
        const claimKey = `${st.weekKey}:__wset`;
        if (st.claimed.includes(claimKey)) return null;
        const done = st.weekly.filter(q => this.toView(st, q, st.weekKey).done).length;
        if (st.weekly.length === 0 || done < st.weekly.length) return null;

        st.claimed.push(claimKey);
        this.trimClaimed(st);
        st.updatedAt = Date.now();
        this.save();
        return { bolts: WEEKLY_SET_BOLTS, crates: WEEKLY_SET_CRATES };
    }

    // === Sciezka gry (main.ts) ===

    /**
     * Start meczu — ustawia profil, do ktorego track() ksieguje. Tutorial NIE wola tego
     * (samouczek nie liczy sie do rozkazow).
     */
    beginRun(profileId: string, trophies: number): void {
        this.ensureInitialized();
        this.getOrCreate(profileId, trophies); // rollover ZANIM zaczniemy liczyc
        this.runProfileId = profileId;
        this.lastProgressToastAt = 0;
    }

    /** Koniec meczu — dalsze track() sa ignorowane (bezpiecznik przed liczeniem w menu). */
    endRun(): void {
        this.runProfileId = null;
        this.save();
    }

    /**
     * Zaksieguj zdarzenie. `value`: przyrost (sum), wartosc rekordu (max) albo element (set).
     * `param` zawezaja rozkazy sparametryzowane (np. mapa dnia).
     */
    track(metric: QuestMetric, value: number | string = 1, param?: string): void {
        const pid = this.runProfileId;
        if (!pid) return;
        const st = this.states[pid];
        if (!st) return;

        let changed = false;
        for (const stored of [...st.daily, ...st.weekly]) {
            const def = getQuestDef(stored.defId);
            if (!def || def.metric !== metric) continue;
            if (stored.param && stored.param !== param) continue;

            const before = this.currentOf(st, stored);
            if (def.mode === 'set') {
                const key = String(value);
                const arr = Array.isArray(st.progress[stored.key]) ? st.progress[stored.key] as string[] : [];
                if (!arr.includes(key)) {
                    arr.push(key);
                    st.progress[stored.key] = arr;
                }
            } else if (def.mode === 'max') {
                const v = typeof value === 'number' ? value : 0;
                const cur = Number(st.progress[stored.key]) || 0;
                if (v > cur) st.progress[stored.key] = v;
            } else {
                // sum: liczba = przyrost; string (np. id mapy) = pojedyncze zdarzenie => +1
                const v = typeof value === 'number' ? value : 1;
                st.progress[stored.key] = (Number(st.progress[stored.key]) || 0) + v;
            }

            const after = this.currentOf(st, stored);
            if (after === before) continue;
            changed = true;
            this.emit(st, stored, before, after, st.daily.includes(stored) ? st.dayKey : st.weekKey);
        }
        if (changed) {
            st.updatedAt = Date.now();
            this.save();
        }
    }

    // === Sync (wolane przez ProgressionService — jedna sciezka upsertu) ===

    /** Migawka do kolumny progression.quests. */
    serialize(profileId: string): ProgressionQuests {
        this.ensureInitialized();
        const st = this.states[profileId];
        if (!st) return { v: 1 };
        return {
            v: 1,
            dayKey: st.dayKey,
            weekKey: st.weekKey,
            progress: st.progress,
            claimed: st.claimed,
            updatedAt: st.updatedAt,
        };
    }

    /**
     * Merge z chmury. `claimed` = UNION (nagroda odebrana gdziekolwiek zostaje odebrana).
     * Postep scalany TYLKO gdy okres sie zgadza (stary postep z innego dnia jest smieciem).
     * Zestaw rozkazow NIE przychodzi z chmury — jest deterministyczny z klucza okresu.
     */
    mergeRemote(profileId: string, remote: ProgressionQuests | null | undefined, trophies: number): void {
        if (!remote || typeof remote !== 'object') return;
        this.ensureInitialized();
        const st = this.getOrCreate(profileId, trophies);

        if (Array.isArray(remote.claimed)) {
            const union = new Set<string>([...st.claimed, ...remote.claimed.map(String)]);
            st.claimed = [...union];
            this.trimClaimed(st);
        }

        if (remote.progress && typeof remote.progress === 'object') {
            const dailyKeys = new Set(st.daily.map(q => q.key));
            const weeklyKeys = new Set(st.weekly.map(q => q.key));
            const sameDay = remote.dayKey === st.dayKey;
            const sameWeek = remote.weekKey === st.weekKey;
            for (const [key, val] of Object.entries(remote.progress)) {
                const isDaily = dailyKeys.has(key);
                const isWeekly = weeklyKeys.has(key);
                if ((isDaily && !sameDay) || (isWeekly && !sameWeek) || (!isDaily && !isWeekly)) continue;
                if (Array.isArray(val)) {
                    const local = Array.isArray(st.progress[key]) ? st.progress[key] as string[] : [];
                    st.progress[key] = [...new Set<string>([...local, ...val.map(String)])];
                } else {
                    const v = Number(val) || 0;
                    st.progress[key] = Math.max(Number(st.progress[key]) || 0, v);
                }
            }
        }
        st.updatedAt = Date.now();
        this.save();
    }

    // === Internal ===

    /** Zwraca null gdy definicja zniknela z konfiguracji (nie wywracamy hubu na stale dane). */
    private toViewSafe(st: QuestState, stored: StoredQuest, period: string): QuestView | null {
        return getQuestDef(stored.defId) ? this.toView(st, stored, period) : null;
    }

    private toView(st: QuestState, stored: StoredQuest, period: string): QuestView {
        const def = getQuestDef(stored.defId)!;
        const current = this.currentOf(st, stored);
        return {
            key: stored.key,
            def,
            target: stored.target,
            param: stored.param,
            current,
            done: current >= stored.target,
            claimed: st.claimed.includes(`${period}:${stored.key}`),
        };
    }

    private currentOf(st: QuestState, stored: StoredQuest): number {
        const raw = st.progress[stored.key];
        if (Array.isArray(raw)) return raw.length;
        return Math.min(Number(raw) || 0, stored.target);
    }

    /** Feedback w grze: prog 50% (throttlowany) + ukonczenie (zawsze). */
    private emit(st: QuestState, stored: StoredQuest, before: number, after: number, period: string): void {
        if (!this.onQuestEvent) return;
        const view = this.toView(st, stored, period);
        const half = stored.target / 2;
        try {
            if (before < stored.target && after >= stored.target) {
                this.onQuestEvent('done', view);
            } else if (before < half && after >= half) {
                const now = Date.now();
                if (now - this.lastProgressToastAt >= PROGRESS_TOAST_COOLDOWN_MS) {
                    this.lastProgressToastAt = now;
                    this.onQuestEvent('progress', view);
                }
            }
        } catch (e) {
            console.error('[Quests] onQuestEvent failed:', (e as Error).stack ?? e, { quest: stored.key });
        }
    }

    private getOrCreate(profileId: string, trophies: number): QuestState {
        let st = this.states[profileId];
        const day = dayKeyOf();
        const week = weekKeyOf();

        if (!st) {
            st = {
                profileId,
                cfg: QUEST_CONFIG_VERSION,
                dayKey: day,
                weekKey: week,
                daily: [],
                weekly: [],
                progress: {},
                claimed: [],
                updatedAt: Date.now(),
            };
            this.states[profileId] = st;
            this.rollDaily(st, trophies);
            this.rollWeekly(st, trophies);
            this.save();
            return st;
        }

        // Strojenie puli/celow (podbity QUEST_CONFIG_VERSION) => przelosuj OBA zestawy.
        // Bez tego gracz zostalby ze starymi celami do zmiany doby, a w skrajnym przypadku
        // z rozkazem, ktorego definicja juz nie istnieje (stale defId w localStorage).
        let changed = false;
        if (st.cfg !== QUEST_CONFIG_VERSION) {
            st.cfg = QUEST_CONFIG_VERSION;
            st.dayKey = day;
            st.weekKey = week;
            this.rollDaily(st, trophies);
            this.rollWeekly(st, trophies);
            changed = true;
        }

        // rollover — niewykonane rozkazy przepadaja BEZ KARY i bez komunikatu (§17.1 pkt 10)
        if (st.dayKey !== day) {
            st.dayKey = day;
            this.rollDaily(st, trophies);
            changed = true;
        }
        if (st.weekKey !== week) {
            st.weekKey = week;
            this.rollWeekly(st, trophies);
            changed = true;
        }
        if (!Array.isArray(st.claimed)) { st.claimed = []; changed = true; }
        if (!st.progress || typeof st.progress !== 'object') { st.progress = {}; changed = true; }
        if (changed) {
            st.updatedAt = Date.now();
            this.save();
        }
        return st;
    }

    private rollDaily(st: QuestState, trophies: number): void {
        for (const q of st.daily) delete st.progress[q.key];
        st.daily = pickDailyQuests(st.dayKey, trophies).map(toStored);
    }

    private rollWeekly(st: QuestState, trophies: number): void {
        for (const q of st.weekly) delete st.progress[q.key];
        st.weekly = pickWeeklyQuests(st.weekKey, trophies).map(toStored);
    }

    private trimClaimed(st: QuestState): void {
        if (st.claimed.length > CLAIMED_HISTORY_LIMIT) {
            st.claimed = st.claimed.slice(-CLAIMED_HISTORY_LIMIT);
        }
    }

    private ensureInitialized(): void {
        if (this.initialized) return;
        this.load();
        this.initialized = true;
    }

    private load(): void {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) { this.states = {}; return; }
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                console.warn('[QuestService] Stored state not a map, resetting');
                this.states = {};
                return;
            }
            const valid: Record<string, QuestState> = {};
            for (const [pid, entry] of Object.entries(parsed as Record<string, unknown>)) {
                if (isValidState(entry)) valid[pid] = entry as QuestState;
                else console.warn('[QuestService] Dropping invalid quest entry:', pid);
            }
            this.states = valid;
        } catch (e) {
            console.error('[QuestService] Failed to parse quests, resetting:', e);
            this.states = {};
        }
    }

    private save(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.states));
        } catch (e) {
            console.error('[QuestService] Failed to save quests:', e);
        }
    }
}

function toStored(q: ActiveQuest): StoredQuest {
    return { key: q.key, defId: q.def.id, target: q.target, param: q.param };
}

function isValidState(entry: unknown): boolean {
    if (typeof entry !== 'object' || entry === null) return false;
    const e = entry as Record<string, unknown>;
    return (
        typeof e.profileId === 'string' &&
        typeof e.dayKey === 'string' &&
        typeof e.weekKey === 'string' &&
        Array.isArray(e.daily) && Array.isArray(e.weekly) &&
        typeof e.progress === 'object' && e.progress !== null
    );
}

/** Re-export dla UI (pasek "jeszcze X trofeow do odblokowania rozkazow"). */
export { QUEST_UNLOCK_TROPHIES, getQuestScale };

/** Singleton — import wszedzie. */
export const QuestService = new QuestServiceImpl();
