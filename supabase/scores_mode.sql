-- ============================================================================
-- scores_mode.sql — Z0.7 (COOP ETAP 0, v0.154.0): wymiar `mode` + `match_id`
-- w tabeli scores. Przygotowanie schematu ZANIM urosnie — zero zmian formuly
-- wyniku (CURRENT_SCORE_VERSION zostaje 4).
--
-- URUCHOM w Supabase Dashboard > SQL Editor. Idempotentne.
--
-- BEZPIECZENSTWO OKNA TESTOW (do 2026-09-23, decyzja Mariusza 2026-09-04):
--  - ADD COLUMN z DEFAULT na PG11+ jest metadata-only (instant, bez przepisania
--    tabeli). Stara zamrozona paczka testowa NIE wysyla tych pol -> jej wiersze
--    dostaja DEFAULT 'solo' / NULL. Wyniki testerow w 100% nietkniete.
--  - Edge Function submit-score NIE jest ruszana (obecnie i tak ignoruje pola
--    spoza swojej listy). Walidacja `mode` w Edge (slownik wzorem SCENARIOS)
--    + filtr `mode='solo'` w leaderboard_top RPC = Z0.7b, PO 23.09 (razem
--    z Z0.10b). Do tego czasu filtr jest zbedny: KAZDY wiersz ma 'solo'.
-- ============================================================================

ALTER TABLE public.scores
    ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'solo';

ALTER TABLE public.scores
    ADD COLUMN IF NOT EXISTS match_id UUID NULL;

-- CHECK jako nazwany constraint (drop+add = idempotencja). Stare wiersze maja
-- 'solo' z DEFAULT, wiec walidacja przechodzi bez migracji danych.
ALTER TABLE public.scores DROP CONSTRAINT IF EXISTS scores_mode_ok;
ALTER TABLE public.scores
    ADD CONSTRAINT scores_mode_ok CHECK (mode IN ('solo', 'coop'));

-- Indeks pod przyszly filtr leaderboardu (Z0.7b) i zapytania per-mecz koop.
-- Partial na coop: dzis pusty (zero kosztow), rosnie dopiero z koopem.
CREATE INDEX IF NOT EXISTS idx_scores_match
    ON public.scores (match_id)
    WHERE match_id IS NOT NULL;
