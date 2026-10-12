-- ══════════════════════════════════════════════════════════════════════════════
-- leaderboard_rpc_v2.sql — v0.246.0: POZIOM TRUDNOSCI W RANKINGU
--
-- Kopia leaderboard_top / leaderboard_my_rank (leaderboard_rpc.sql) z dwiema zmianami:
--   1. parametr p_difficulty (NULL = wszystkie poziomy),
--   2. leaderboard_top_v2 zwraca kolumne `difficulty` NAJLEPSZEGO wiersza gracza.
--
-- NOWE NAZWY FUNKCJI (_v2) zamiast przeciazenia: stare v1 dzialaja dalej bez zmian,
-- klient przelacza sie flaga LB_DIFF_LIVE (src/config/lbDiffFlag.ts, rollback ?lbdiff=0).
--
-- KOLEJNOSC (backend-supabase.md §2): ten plik uruchomic w SQL Editorze PRZED flipem flagi.
-- Bezpieczne do wielokrotnego uruchomienia (CREATE OR REPLACE). Nie rusza tabel ani RLS.
-- GRANT do anon + authenticated (§4: anonimowy uzytkownik ma role authenticated).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.leaderboard_top_v2(
    p_scenario       TEXT,
    p_score_version  INTEGER,
    p_map            TEXT    DEFAULT NULL,
    p_window         TEXT    DEFAULT 'all',
    p_limit          INTEGER DEFAULT 100,
    p_difficulty     TEXT    DEFAULT NULL
)
RETURNS TABLE (
    rank        BIGINT,
    profile_id  UUID,
    nickname    TEXT,
    avatar_id   TEXT,
    flag_id     TEXT,
    score       INTEGER,
    map         TEXT,
    brawler_id  TEXT,
    difficulty  TEXT,
    created_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
    WITH filtered AS (
        SELECT s.profile_id, s.score, s.map, s.brawler_id, s.difficulty, s.created_at
        FROM public.scores s
        WHERE s.score_version = p_score_version
          AND s.scenario      = p_scenario
          AND s.profile_id IS NOT NULL
          AND s.mode = 'solo'                               -- Z0.7b: ranking solowy (jak v1)
          AND (p_map IS NULL OR s.map = p_map)
          AND (p_difficulty IS NULL OR s.difficulty = p_difficulty)
          AND s.score < 100000000                           -- sanity-clamp (jak v1)
          AND (
                p_window = 'all'
             OR (p_window = 'week' AND s.created_at >= now() - interval '7 days')
             OR (p_window = 'day'  AND s.created_at >= now() - interval '1 day')
          )
    ),
    best_per_player AS (
        SELECT DISTINCT ON (f.profile_id)
               f.profile_id, f.score, f.map, f.brawler_id, f.difficulty, f.created_at
        FROM filtered f
        ORDER BY f.profile_id, f.score DESC, f.created_at ASC
    )
    SELECT
        row_number() OVER (ORDER BY b.score DESC, b.created_at ASC) AS rank,
        b.profile_id,
        p.nickname,
        p.avatar_id,
        p.flag_id,
        b.score,
        b.map,
        b.brawler_id,
        b.difficulty,
        b.created_at
    FROM best_per_player b
    JOIN public.profiles p ON p.id = b.profile_id
    ORDER BY b.score DESC, b.created_at ASC
    LIMIT GREATEST(p_limit, 0);
$$;

CREATE OR REPLACE FUNCTION public.leaderboard_my_rank_v2(
    p_profile_id     UUID,
    p_scenario       TEXT,
    p_score_version  INTEGER,
    p_map            TEXT DEFAULT NULL,
    p_window         TEXT DEFAULT 'all',
    p_difficulty     TEXT DEFAULT NULL
)
RETURNS TABLE (
    rank      BIGINT,
    my_score  INTEGER,
    total     BIGINT
)
LANGUAGE sql
STABLE
AS $$
    WITH filtered AS (
        SELECT s.profile_id, s.score
        FROM public.scores s
        WHERE s.score_version = p_score_version
          AND s.scenario      = p_scenario
          AND s.profile_id IS NOT NULL
          AND s.mode = 'solo'
          AND (p_map IS NULL OR s.map = p_map)
          AND (p_difficulty IS NULL OR s.difficulty = p_difficulty)
          AND s.score < 100000000
          AND (
                p_window = 'all'
             OR (p_window = 'week' AND s.created_at >= now() - interval '7 days')
             OR (p_window = 'day'  AND s.created_at >= now() - interval '1 day')
          )
    ),
    best_per_player AS (
        SELECT f.profile_id, max(f.score) AS score
        FROM filtered f
        GROUP BY f.profile_id
    ),
    me AS (
        SELECT score FROM best_per_player WHERE profile_id = p_profile_id
    )
    SELECT
        CASE WHEN (SELECT score FROM me) IS NULL THEN NULL
             ELSE (SELECT count(*) FROM best_per_player b
                   WHERE b.score > (SELECT score FROM me)) + 1
        END                                              AS rank,
        (SELECT score FROM me)                           AS my_score,
        (SELECT count(*) FROM best_per_player)           AS total;
$$;

GRANT EXECUTE ON FUNCTION public.leaderboard_top_v2(TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_my_rank_v2(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT) TO anon, authenticated;
