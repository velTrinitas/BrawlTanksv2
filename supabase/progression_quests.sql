-- ============================================================================
-- PROGRESSION QUESTS — kolumna quests (PROG-F3 ROZKAZY, 2026-08-04)
-- ============================================================================
-- Postep i odebrane nagrody rozkazow dziennych/tygodniowych syncuja sie miedzy
-- urzadzeniami. Uruchom w Supabase SQL Editor (brawltanks-dev). Idempotentne.
-- Rozszerza tabele z progression_sync.sql — RLS/trigger juz istnieja, nie ruszamy.
--
-- Ksztalt dokumentu `quests` (patrz services/supabase/types.ts):
--   {
--     "v": 1,
--     "dayKey": "2026-08-04",              -- okres rozkazow dnia
--     "weekKey": "2026-W32",               -- okres rozkazow tygodnia
--     "progress": { "e_kill": 18, "w_maps": ["city","arctic"] },
--     "claimed": ["2026-08-04:e_kill", "2026-08-04:__set"],
--     "updatedAt": 1785877450626
--   }
--
-- ZASADY MERGE (klient):
--   claimed  -> UNION (nagroda odebrana gdziekolwiek = odebrana wszedzie; klucz ma
--               PREFIKS OKRESU, wiec wyczyszczenie localStorage nie pozwala odebrac 2x)
--   progress -> max/union, ale TYLKO gdy dayKey/weekKey sie zgadzaja (starszy okres = smiec)
--   zestaw rozkazow NIE jest przechowywany — jest deterministyczny z klucza okresu
--   (mulberry32 zasiany data), wiec wszyscy gracze maja ten sam zestaw danego dnia.
--
-- Nagrody (srubki/skrzynki) NIE ida ta kolumna — ksieguje je ProgressionService przez
-- monotoniczne pola (bolts, cratesEarned), zeby istniala JEDNA sciezka przyznawania.
-- ============================================================================

ALTER TABLE public.progression
    ADD COLUMN IF NOT EXISTS quests JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Stare wiersze dostaja '{}' — klient traktuje brakujace pola jako puste (merge bezstratny).
