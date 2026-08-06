-- ============================================================================
-- PROGRESSION POWERS — kolumna powers (PROG-F7a LOADOUT SUPER MOCY, 2026-08-06)
-- ============================================================================
-- Loadout 2 slotow (wybor w GARAZU) + jawnie przyznane moce syncuja sie miedzy
-- urzadzeniami. Uruchom w Supabase SQL Editor (brawltanks-dev). Idempotentne.
-- Rozszerza tabele z progression_sync.sql — RLS/trigger juz istnieja, nie ruszamy.
--
-- Ksztalt dokumentu `powers` (patrz services/supabase/types.ts):
--   {
--     "v": 1,
--     "owned": [],                        -- moce przyznane JAWNIE (F7b eventy/granty)
--     "loadout": ["aura", "megaBomb"],    -- 2 sloty z GARAZU
--     "loadoutAt": 1785963490138          -- ms (klient) — rozstrzyga LWW
--   }
--
-- ZASADY MERGE (klient, wzorzec F2b):
--   owned    -> UNION (grant gdziekolwiek = grant wszedzie); nieznane id odrzucane
--   loadout  -> LAST-WRITE-WINS po loadoutAt (to preferencja, nie zasob — union bez sensu)
--   Odblokowania PROGOWE (unlockAtTrophies w rejestrze) NIE sa przechowywane — klient
--   liczy je z trofeow (monotoniczne => samonaprawialne miedzy urzadzeniami).
--
-- F7a: wszystkie 3 obecne moce maja prog 0 (kazdy ma je od startu — zablokowanie
-- czegos, co gracze maja dzis, byloby regresja). Pierwsze realne odblokowanie = F7b.
-- ============================================================================

ALTER TABLE public.progression
    ADD COLUMN IF NOT EXISTS powers JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Stare wiersze dostaja '{}' — klient traktuje brakujace pola jako puste (merge bezstratny;
-- loadout z pustej chmury NIE nadpisuje lokalnego: LWW z loadoutAt=0 przegrywa).
