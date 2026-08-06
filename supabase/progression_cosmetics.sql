-- ============================================================================
-- PROGRESSION COSMETICS — kolumna cosmetics (PROG-F2b, 2026-08-04)
-- ============================================================================
-- Domyka F2a: wlasnosc kosmetykow + equipped + ekonomia skrzynek syncuja sie
-- miedzy urzadzeniami (do tej pory tylko localStorage => zmiana urzadzenia /
-- czyszczenie cache kasowaly kolekcje).
--
-- Uruchom w Supabase SQL Editor (projekt brawltanks-dev). Idempotentne.
-- Rozszerza tabele z progression_sync.sql — RLS/trigger juz istnieja, nie ruszamy.
--
-- Ksztalt dokumentu `cosmetics` (klient = jedyny autor, patrz services/supabase/types.ts):
--   {
--     "v": 1,
--     "owned": ["nc_gold", "fr_blue"],          -- union przy merdze
--     "equipped": { "nickColor": "nc_gold" },   -- last-write-wins po equippedAt
--     "equippedAt": 1754300000000,              -- ms (klient) — rozstrzyga LWW
--     "cratesEarned": 5,                        -- MONOTONICZNY (max przy merdze)
--     "cratesOpened": 3,                        -- MONOTONICZNY (max przy merdze)
--     "pityCounter": 3,                         -- MONOTONICZNY (max przy merdze)
--     "crateMilestones": [30, 70, 120]          -- union przy merdze
--   }
--
-- UWAGA PROJEKTOWA: liczba nieotwartych skrzynek NIE jest przechowywana — jest
-- WYLICZANA jako max(0, cratesEarned - cratesOpened). Pole malejace (crateCount)
-- przy merdze "max" wskrzeszaloby wydane skrzynki = duplikacja zasobu.
--
-- Anti-cheat: tabela jest client-writable (jak profiles, NIE jak scores). Kosmetyki
-- nie daja przewagi (skrzynki = srubki + kosmetyka, nigdy moc/staty), wiec akceptowalne.
-- Hardening razem z L2b / auth.uid.
-- ============================================================================

ALTER TABLE public.progression
    ADD COLUMN IF NOT EXISTS cosmetics JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Stare wiersze dostaja '{}' — klient traktuje brakujace pola jako puste/0, wiec
-- pusta chmura NIGDY nie kasuje stanu lokalnego (merge jest bezstratny).
