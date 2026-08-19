-- ============================================================================
-- SCORES FUN_MODE — kolumna fun_mode (SLOT 🎲 / SZALONE MOCE, v0.114.0, 2026-08-20)
-- ============================================================================
-- Runy, w ktorych gracz uzyl slotu 🎲 (losowa moc Tier 3), maja inny sufit
-- wyniku. Flaga = surowy podzial danych pod decyzje o splicie leaderboardu
-- (~2 tygodnie zbierania). ZERO zmian w RPC leaderboardu i score_version (=3).
--
-- KOLEJNOSC DEPLOYU (krytyczna — patrz rls_lockdown_scores.sql):
--   1. Uruchom TEN plik w Supabase SQL Editor (brawltanks-dev).
--   2. Redeploy Edge Function submit-score (Dashboard) — nowa wersja pisze kolumne.
--   3. Dopiero potem push klienta.
-- Odwrotnie = insert_failed 500 (nieznana kolumna) i zatruta kolejka offline.
--
-- Idempotentne. Stare wiersze = false (poprawne: kostka nie istniala).
-- Kolejka offline sprzed patcha nie niesie pola => DEFAULT false.
-- Brak indeksu — analiza ad-hoc; indeks dojdzie razem z ewentualnym splitem RPC.

ALTER TABLE public.scores
    ADD COLUMN IF NOT EXISTS fun_mode BOOLEAN NOT NULL DEFAULT false;
