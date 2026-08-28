/**
 * types.ts — FAZA 9b.1 (v0.47.0)
 *
 * Typy TypeScript odpowiadajace schematowi bazy (schema.sql).
 * Zrodlo prawdy: schema.sql — przy KAZDEJ zmianie schematu zaktualizuj tu typy.
 *
 * Wzorzec: rozdzielamy Row (co czytamy z bazy) od Insert (co wysylamy).
 * Pola z DEFAULT w bazie sa opcjonalne w *Insert (baza je dopelni).
 * created_at/updated_at NIGDY w *Insert — wymuszane server-side (anti-cheat).
 */

// ──────────────────────────────────────────────────────────────────────────────
// profiles
// ──────────────────────────────────────────────────────────────────────────────

export interface ProfileRow {
    id: string;                 // UUID (client-side generated w 9b)
    nickname: string;
    avatar_id: string;
    flag_id: string | null;
    language: 'pl' | 'en';
    session_count: number;
    created_at: string;         // ISO timestamp (server-side)
    updated_at: string;         // ISO timestamp (server-side, auto-trigger)
}

export interface ProfileInsert {
    id: string;                 // wymagany — generujemy client-side
    nickname: string;
    avatar_id: string;
    flag_id?: string | null;
    language?: 'pl' | 'en';     // DEFAULT 'pl'
    session_count?: number;     // DEFAULT 0
    // created_at / updated_at — NIE wysylamy (server-side)
}

export interface ProfileUpdate {
    nickname?: string;
    avatar_id?: string;
    flag_id?: string | null;
    language?: 'pl' | 'en';
    session_count?: number;
    // id niezmienny; created_at/updated_at server-side
}

// ──────────────────────────────────────────────────────────────────────────────
// scores
// ──────────────────────────────────────────────────────────────────────────────

export interface ScoreRow {
    id: string;
    profile_id: string | null;  // null po kasacji profilu (ON DELETE SET NULL)
    score: number;
    scenario: string;
    map: string;
    difficulty: string;
    brawler_id: string;
    session_id: string | null;
    score_version: number;
    game_seconds: number;
    kills: number;
    gems_collected: number;
    cubes_collected: number;
    shots_fired: number;
    shots_hit: number;
    supers_fired: number;
    powers_used: number;
    mega_boss_defeated: boolean;
    fun_mode: boolean;          // v0.114.0 — run z uzyta kostka 🎲 (inny sufit wyniku)
    created_at: string;
}

export interface ScoreInsert {
    profile_id: string;
    score: number;
    scenario: string;
    map: string;
    difficulty: string;
    brawler_id: string;
    session_id?: string | null;
    score_version?: number;     // DEFAULT 1 (bump po HP x100 refactorze)
    game_seconds?: number;      // DEFAULT 0 (interfejs jeszcze nie niesie czasu gry)
    kills?: number;             // wszystkie ponizej maja DEFAULT w bazie
    gems_collected?: number;
    cubes_collected?: number;
    shots_fired?: number;
    shots_hit?: number;
    supers_fired?: number;
    powers_used?: number;
    mega_boss_defeated?: boolean;
    fun_mode?: boolean;         // v0.114.0 — DEFAULT false (stara kolejka offline bez pola)
    // id / created_at — NIE wysylamy (server-side)
}

/**
 * ScoreRow + dolaczony profil (dla leaderboard z nickiem/avatarem).
 * Odpowiada zapytaniu: .select('*, profiles(nickname, avatar_id, flag_id)')
 */
export interface ScoreWithProfile extends ScoreRow {
    profiles: Pick<ProfileRow, 'nickname' | 'avatar_id' | 'flag_id'> | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// sessions
// ──────────────────────────────────────────────────────────────────────────────

export type SessionResult = 'victory' | 'gameover' | 'abandoned';

export interface SessionRow {
    id: string;
    profile_id: string | null;
    started_at: string;
    ended_at: string | null;
    result: SessionResult | null;
}

export interface SessionInsert {
    profile_id: string;
    started_at?: string;        // DEFAULT now()
    ended_at?: string | null;
    result?: SessionResult | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// progression (PROG-F1b — cloud sync progresji konta, 1:1 z profilem)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Pod-dokument kosmetyczny (PROG-F2b, kolumna progression.cosmetics JSONB).
 * Wszystkie pola opcjonalne — stare wiersze maja '{}' i merge traktuje braki jako puste/0.
 * cratesEarned/cratesOpened/pityCounter sa MONOTONICZNE (merge = max); liczba nieotwartych
 * skrzynek jest WYLICZANA (earned - opened), nigdy przechowywana (pole malejace + max = duplikacja).
 */
export interface ProgressionCosmetics {
    v?: number;                              // wersja dokumentu (1)
    owned?: string[];                        // id z config/cosmetics — merge: union
    equipped?: Record<string, string>;       // CosmeticType -> id — merge: last-write-wins
    equippedAt?: number;                     // ms (klient) — rozstrzyga LWW dla equipped
    cratesEarned?: number;
    cratesOpened?: number;
    pityCounter?: number;
    crateMilestones?: number[];              // progi ze skredytowana skrzynka — merge: union
}

/**
 * Pod-dokument rozkazow (PROG-F3, kolumna progression.quests JSONB).
 * `claimed` = klucze z prefiksem okresu ("2026-08-04:e_kill") — merge przez UNION,
 * wiec nagrody sa nieodbieralne po raz drugi nawet po wyczyszczeniu localStorage.
 * `progress` scalany tylko gdy dayKey/weekKey sie zgadzaja (starszy okres = smiec).
 */
export interface ProgressionQuests {
    v?: number;
    dayKey?: string;
    weekKey?: string;
    progress?: Record<string, number | string[]>;
    claimed?: string[];
    updatedAt?: number;
}

/**
 * Pod-dokument super mocy (PROG-F7a, kolumna progression.powers JSONB).
 * `owned` = jawnie przyznane moce (merge: union; bazowa trojka wynika z unlockAtTrophies=0,
 * a odblokowania progowe liczy klient z trofeow — samonaprawialne miedzy urzadzeniami).
 * `loadout` = 2 sloty z GARAZU (merge: last-write-wins po loadoutAt — to preferencja, nie zasob).
 */
export interface ProgressionPowers {
    v?: number;
    owned?: string[];
    loadout?: (string | null)[];
    loadoutAt?: number;
    /** v0.114.0: toggle "Szalone Moce" (slot 🎲) — merge: LWW po funModeAt. */
    funModeOn?: boolean;
    funModeAt?: number;
}

/**
 * Pod-dokument statystyk lifetime + rekordow (PROFILE-1, kolumna progression.stats JSONB).
 * Wszystkie pola MONOTONICZNE => merge = MAX per pole. Sumy sa lower-boundem miedzy
 * urzadzeniami (gra na 2 naraz = undercount) — ta sama akceptowana semantyka co bolts.
 */
export interface ProgressionStats {
    v?: number;
    /** Sumy lifetime. */
    kills?: number;
    gems?: number;
    seconds?: number;
    shotsFired?: number;
    shotsHit?: number;
    /** Rekordy per-run. */
    maxKills?: number;
    maxGems?: number;
    maxSeconds?: number;
    /** Cale procenty 0..100 (clamp — fragi/breakup potrafia dac hits > fired). */
    bestAccuracy?: number;
    maxCombo?: number;
    /** SEASON-1 — postep sezonu. Merge TYLKO gdy seasonId == CURRENT_SEASON.id
     *  (trophies MAX, claimed UNION); inny/stary sezon = ignorowany. */
    seasonId?: string;
    /** SEASON KIT — suma zebranych znajdziek sezonowych. Merge: MAX przy zgodnym seasonId. */
    seasonCollected?: number;
    /** SEASON KIT — liczniki per przedmiot (klucz = value 1..6). Merge: MAX per klucz. */
    seasonItems?: Record<string, number>;
    /** SEASON KIT — wyplacone nagrody sezonowe. Merge: UNION. */
    seasonRewards?: string[];
    seasonTrophies?: number;
    seasonClaimed?: number[];
    /** RANKS-1 — ranga czolgisty: wins/rankShown MAX, rankClaimed UNION.
     *  Stemple backfilli (stats/ranks) CELOWO lokalne — nie syncowane. */
    wins?: number;
    rankClaimed?: number[];
    rankShown?: number;
}

/** Wynik RPC profile_lifetime_stats — agregat z wlasnych wierszy `scores`. */
export interface LifetimeStatsRow {
    sum_kills: number;
    sum_gems: number;
    sum_seconds: number;
    sum_shots_fired: number;
    sum_shots_hit: number;
    run_count: number;
    max_kills: number;
    max_gems: number;
    max_seconds: number;
    max_accuracy: number | null;    // null gdy zaden run nie przekroczyl progu strzalow
}

export interface ProgressionRow {
    profile_id: string;
    trophies: number;
    bolts: number;
    total_runs: number;
    per_map_best: Record<string, number>;   // JSONB: { city: 174, arctic: 748, ... }
    claimed_milestones: number[];            // JSONB: [30, 70, ...]
    last_run_day: string | null;             // YYYY-MM-DD
    cosmetics: ProgressionCosmetics;         // JSONB (F2b; stare wiersze = {})
    quests: ProgressionQuests;               // JSONB (F3; stare wiersze = {})
    powers: ProgressionPowers;               // JSONB (F7a; stare wiersze = {})
    stats: ProgressionStats;                 // JSONB (PROFILE-1; stare wiersze = {})
    created_at: string;
    updated_at: string;
}

export interface ProgressionInsert {
    profile_id: string;
    trophies?: number;
    bolts?: number;
    total_runs?: number;
    per_map_best?: Record<string, number>;
    claimed_milestones?: number[];
    last_run_day?: string | null;
    cosmetics?: ProgressionCosmetics;
    quests?: ProgressionQuests;
    powers?: ProgressionPowers;
    stats?: ProgressionStats;   // PROFILE-1 (wymaga kolumny z progression_stats.sql)
    // created_at / updated_at — NIE wysylamy (server-side)
}

// ──────────────────────────────────────────────────────────────────────────────
// Database — typ zbiorczy dla createClient<Database> (opcjonalnie, type-safe queries)
// ──────────────────────────────────────────────────────────────────────────────

export interface Database {
    public: {
        Tables: {
            profiles: { Row: ProfileRow; Insert: ProfileInsert; Update: ProfileUpdate };
            scores: { Row: ScoreRow; Insert: ScoreInsert; Update: never };
            sessions: { Row: SessionRow; Insert: SessionInsert; Update: Partial<SessionInsert> };
            progression: { Row: ProgressionRow; Insert: ProgressionInsert; Update: Partial<ProgressionInsert> };
        };
    };
}