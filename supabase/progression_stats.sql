-- PROFILE-1 (v0.118.0) — staty lifetime + rekordy per-run w profilu gracza.
-- Uruchom w Supabase SQL Editor (idempotentne) PRZED testem syncu nowego klienta:
-- upsert klienta wysyla kolumne `stats` — bez niej padnie caly syncPush.
--
-- 1) Kolumna pod-dokumentu statow (wzorzec cosmetics/quests/powers).
-- 2) RPC agregujace WLASNE wiersze `scores` do jednorazowego backfillu klienta
--    (konta sprzed fazy profilu maja historie w scores, lokalnie zera).

ALTER TABLE public.progression
    ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Agregat lifetime + rekordy per-run z scores danego profilu.
-- max_accuracy: celnosc per-run liczona TYLKO dla runow z >= 20 strzalami
-- (prog ACCURACY_MIN_SHOTS w src/config/progression.ts — trzymac w zgodzie)
-- i LEAST(100, ...) bo fragi/breakup pociskow potrafia dac shots_hit > shots_fired.
-- NULL gdy zaden run nie przekroczyl progu.
CREATE OR REPLACE FUNCTION public.profile_lifetime_stats(p_profile_id uuid)
RETURNS TABLE (
    sum_kills bigint,
    sum_gems bigint,
    sum_seconds bigint,
    sum_shots_fired bigint,
    sum_shots_hit bigint,
    run_count bigint,
    max_kills integer,
    max_gems integer,
    max_seconds integer,
    max_accuracy integer
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        COALESCE(SUM(kills), 0)::bigint,
        COALESCE(SUM(gems_collected), 0)::bigint,
        COALESCE(SUM(game_seconds), 0)::bigint,
        COALESCE(SUM(shots_fired), 0)::bigint,
        COALESCE(SUM(shots_hit), 0)::bigint,
        COUNT(*)::bigint,
        COALESCE(MAX(kills), 0)::integer,
        COALESCE(MAX(gems_collected), 0)::integer,
        COALESCE(MAX(game_seconds), 0)::integer,
        MAX(CASE WHEN shots_fired >= 20
                 THEN LEAST(100, (shots_hit * 100) / shots_fired)
            END)::integer
    FROM public.scores
    WHERE profile_id = p_profile_id;
$$;

-- Anon klient wola RPC bezposrednio (jak leaderboard_top / leaderboard_my_rank).
GRANT EXECUTE ON FUNCTION public.profile_lifetime_stats(uuid) TO anon;
