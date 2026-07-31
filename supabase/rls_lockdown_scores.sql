-- ══════════════════════════════════════════════════════════════════════════════
-- Anti-cheat L2a — LOCKDOWN insertu do `scores`
-- ══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ KOLEJNOSC WDROZENIA — uruchom to JAKO OSTATNIE:
--   1) supabase functions deploy submit-score --no-verify-jwt
--   2) push klienta (SupabaseScoreService routuje submit przez funkcje)
--   3) DOPIERO TERAZ ten plik (SQL Editor -> Run)
-- Jesli puscisz to PRZED (1)+(2), zywe submity z klienta zaczna byc odrzucane.
--
-- CO ROBI: usuwa polityke INSERT dla anon/authenticated => bezposredni insert z
-- klienta (REST) jest zablokowany. Wstawia JEDYNIE Edge Function submit-score przez
-- service-role (service-role omija RLS). SELECT (leaderboard) zostaje otwarty.
--
-- ROLLBACK (gdyby cos poszlo nie tak — przywraca stary otwarty insert):
--   CREATE POLICY scores_insert_open ON public.scores
--     FOR INSERT TO anon, authenticated WITH CHECK (true);
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS scores_insert_open ON public.scores;

-- Brak polityki INSERT = anon/authenticated NIE moga wstawiac bezposrednio.
-- (service-role uzywany przez Edge Function omija RLS => insert dziala tylko przez funkcje.)

-- Weryfikacja: ponizsze NIE powinno juz pokazywac polityki INSERT dla scores:
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename='scores' ORDER BY cmd;
