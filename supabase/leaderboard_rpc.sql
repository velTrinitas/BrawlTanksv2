-- ══════════════════════════════════════════════════════════════════════════════
-- Brawl Tanks Season 2 — Leaderboard RPC (LB-F1, FAZA 9c)
-- Projekt: brawltanks-dev (eu-central-1)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- JAK URUCHOMIC:
--   Supabase Dashboard -> SQL Editor -> New query -> wklej CALOSC -> Run.
--   Idempotentne (CREATE OR REPLACE) — mozna puscic kilka razy.
--   Wymaga wczesniej uruchomionego schema.sql (tabele scores + profiles).
--
-- PO CO TO:
--   Zwykly select w getTopScores nie robi (a) dedupu "najlepszy-per-gracz"
--   (jeden gracz z 50 podejsciami zapelnia TOP 100), (b) joinu do profiles po
--   nick/avatar/flage, (c) rangi gracza. RPC (Postgres) robi to poprawnie i tanio
--   (indeks idx_scores_leaderboard_v obsluguje filtr scenario+map+wersja+score).
--
-- DECYZJE (zatwierdzone 2026-07-29):
--   - Dedupe best-per-player + moja-ranga = RPC (nie client-side).
--   - scenariusz = zakladka; mapa = p_map (NULL => agregat "Wszystkie, najlepszy").
--   - okna czasowe (all/week/day) rolling po created_at — bez cronow.
--
-- ANTI-CHEAT (interim, risk #2 planu):
--   Sanity-clamp c_max_score odrzuca niemozliwe wyniki JUZ na poziomie boardu.
--   To bramka tymczasowa — pelne zaufanie = obfuskacja L1 + Edge Function L2
--   (osobny wpis backlogu). c_max_score = TUNABLE: ustaw wg realnego maks. wyniku
--   z playtestow (teraz hojne 100M, zeby NIE odciac legitnych high-scorow).
-- ══════════════════════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────────────────────
-- FUNKCJA: leaderboard_top
--   Zwraca najlepszy wynik NA GRACZA dla (scenario [, map], score_version, okno),
--   z nickiem/avatarem/flaga, posortowane malejaco, limit p_limit.
--   p_map = NULL  => agregat po wszystkich mapach (najlepszy wynik gracza gdziekolwiek).
--   p_window IN ('all','week','day').
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leaderboard_top(
    p_scenario       TEXT,
    p_score_version  INTEGER,
    p_map            TEXT    DEFAULT NULL,
    p_window         TEXT    DEFAULT 'all',
    p_limit          INTEGER DEFAULT 100
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
    created_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
    WITH filtered AS (
        SELECT s.profile_id, s.score, s.map, s.brawler_id, s.created_at
        FROM public.scores s
        WHERE s.score_version = p_score_version
          AND s.scenario      = p_scenario
          AND s.profile_id IS NOT NULL
          AND (p_map IS NULL OR s.map = p_map)
          AND s.score < 100000000                         -- sanity-clamp (TUNABLE)
          AND (
                p_window = 'all'
             OR (p_window = 'week' AND s.created_at >= now() - interval '7 days')
             OR (p_window = 'day'  AND s.created_at >= now() - interval '1 day')
          )
    ),
    best_per_player AS (
        -- DISTINCT ON = jeden (najlepszy) wiersz na gracza; zachowuje ktora mapa/brawler.
        SELECT DISTINCT ON (f.profile_id)
               f.profile_id, f.score, f.map, f.brawler_id, f.created_at
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
        b.created_at
    FROM best_per_player b
    JOIN public.profiles p ON p.id = b.profile_id
    ORDER BY b.score DESC, b.created_at ASC
    LIMIT GREATEST(p_limit, 0);
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- FUNKCJA: leaderboard_my_rank
--   Ranga danego gracza = liczba graczy z lepszym najlepszym-wynikiem + 1.
--   Zwraca tez jego najlepszy wynik. Gdy gracz nie ma wyniku na tym boardzie ->
--   rank = NULL, my_score = NULL (UI pokaze "zagraj, by trafic do rankingu").
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leaderboard_my_rank(
    p_profile_id     UUID,
    p_scenario       TEXT,
    p_score_version  INTEGER,
    p_map            TEXT DEFAULT NULL,
    p_window         TEXT DEFAULT 'all'
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
          AND (p_map IS NULL OR s.map = p_map)
          AND s.score < 100000000                         -- sanity-clamp (TUNABLE, jak wyzej)
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


-- ──────────────────────────────────────────────────────────────────────────────
-- UPRAWNIENIA — RPC wolane przez klienta anon (publishable key), jak reszta API.
-- Funkcje sa STABLE + tylko-do-odczytu; SELECT na scores/profiles jest publiczny (RLS),
-- wiec dzialaja jako invoker (bez SECURITY DEFINER = bezpieczniej).
-- ──────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.leaderboard_top(TEXT, INTEGER, TEXT, TEXT, INTEGER)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_my_rank(UUID, TEXT, INTEGER, TEXT, TEXT)  TO anon, authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- WERYFIKACJA (uruchom po Run — powinny zwrocic wiersze bez bledu):
--   SELECT * FROM public.leaderboard_top('ktb', 2, NULL, 'all', 10);
--   SELECT * FROM public.leaderboard_top('ktb', 2, 'city', 'week', 10);
--   SELECT * FROM public.leaderboard_my_rank('<TWOJE-profile-uuid>', 'ktb', 2, NULL, 'all');
-- ══════════════════════════════════════════════════════════════════════════════
