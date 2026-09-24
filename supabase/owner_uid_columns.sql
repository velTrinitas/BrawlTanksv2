-- ══════════════════════════════════════════════════════════════════════════════
-- Z0.10b krok 1/2 — KOLUMNY WLASCICIELA (`owner_uid`) na `profiles` i `progression`
-- ══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ KOLEJNOSC WDROZENIA — uruchom to JAKO PIERWSZE:
--    (1) wlacz provider "Anonymous sign-ins" (Authentication → Providers),
--    (2) TEN plik (dodaje kolumny, niczego nie blokuje),
--    (3) push klienta (zaczyna wysylac `owner_uid` i przejmowac wiersze),
--    (4) dopiero `rls_lockdown_profiles_progression.sql`.
--    Odwrocenie (3) i (4) ODCINA graczy od zapisu profilu i progresji.
--
-- CO ROBI: dokłada nullowalna kolumne `owner_uid`. Nic sie nie psuje i nic nie
-- zaczyna byc blokowane — to czysto przygotowawczy krok.
--
-- DLACZEGO W OGOLE: do v0.204.0 klient NIE mial anonimowej sesji
-- (`SupabaseClient.ts`: `persistSession: false`), wiec `auth.uid()` bylo NULL przy
-- kazdym zadaniu, a polityki RLS mialy `USING (true)`. `profiles.id` jest PUBLICZNY,
-- bo `leaderboard_top` zwraca `profile_id` — wystarczylo odczytac cudze id z rankingu,
-- zeby nadpisac tamten profil (nick, awatar, flage) albo jego progresje (trofea,
-- srubki, kosmetyki). `owner_uid` daje wierszowi wlasciciela, ktorego klient nie
-- moze podrobic, bo pochodzi z tokenu sesji, a nie z body zadania.
--
-- ROLLBACK (bezpieczny — kolumna jest nullowalna i nikt jej jeszcze nie egzekwuje):
--   ALTER TABLE public.profiles    DROP COLUMN IF EXISTS owner_uid;
--   ALTER TABLE public.progression DROP COLUMN IF EXISTS owner_uid;
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS owner_uid UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.progression
    ADD COLUMN IF NOT EXISTS owner_uid UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- Indeksy pod filtr RLS — polityki porownuja `owner_uid` przy KAZDYM zapisie.
CREATE INDEX IF NOT EXISTS idx_profiles_owner    ON public.profiles (owner_uid);
CREATE INDEX IF NOT EXISTS idx_progression_owner ON public.progression (owner_uid);


-- ══════════════════════════════════════════════════════════════════════════════
-- WERYFIKACJA (uruchom po Run):
--   -- kolumny istnieja i sa nullowalne:
--   SELECT table_name, column_name, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND column_name = 'owner_uid';
--
--   -- ile wierszy czeka na przejecie (przed pushem klienta = WSZYSTKIE):
--   SELECT 'profiles' AS tabela, count(*) FILTER (WHERE owner_uid IS NULL) AS bez_wlasciciela,
--          count(*) AS razem FROM public.profiles
--   UNION ALL
--   SELECT 'progression', count(*) FILTER (WHERE owner_uid IS NULL), count(*)
--   FROM public.progression;
-- ══════════════════════════════════════════════════════════════════════════════
