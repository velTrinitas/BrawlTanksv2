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
// Database — typ zbiorczy dla createClient<Database> (opcjonalnie, type-safe queries)
// ──────────────────────────────────────────────────────────────────────────────

export interface Database {
    public: {
        Tables: {
            profiles: { Row: ProfileRow; Insert: ProfileInsert; Update: ProfileUpdate };
            scores: { Row: ScoreRow; Insert: ScoreInsert; Update: never };
            sessions: { Row: SessionRow; Insert: SessionInsert; Update: Partial<SessionInsert> };
        };
    };
}