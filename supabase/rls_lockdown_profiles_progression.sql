-- ══════════════════════════════════════════════════════════════════════════════
-- Z0.10b krok 2/2 — LOCKDOWN RLS na `profiles` i `progression`
-- ══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ KOLEJNOSC WDROZENIA — uruchom to JAKO OSTATNIE:
--    (1) provider "Anonymous sign-ins" wlaczony,
--    (2) `owner_uid_columns.sql` wykonany,
--    (3) klient z anon auth NA PRODUKCJI i potwierdzony playtestem,
--    (4) dopiero TEN plik.
--    Puszczenie tego przed (3) ODETNIE graczy od zapisu profilu i progresji —
--    stary klient nie wysyla `owner_uid`, wiec kazdy jego zapis zostanie odrzucony.
--
-- CO ROBI: zamyka zapis do obu tabel na wlasciciela wiersza. SELECT zostaje
-- PUBLICZNY (ranking i podglad profilu musza dzialac dla wszystkich).
--
-- PRZEJECIE WIERSZY SPRZED Z0.10b: polityki UPDATE dopuszczaja wiersz, ktorego
-- `owner_uid IS NULL`. Dzieki temu istniejace profile (w tym Mariusza i Michala)
-- przypisuja sie do urzadzenia przy pierwszym zapisie, zamiast stac sie
-- nieedytowalne. SWIADOMY KOMPROMIS: dopoki wiersz jest nieprzejety, przejac go
-- moze KAZDY — okno zamyka sie z pierwszym zapisem wlasciciela. Przy obecnej
-- liczbie graczy to akceptowalne; przy publicznym uruchomieniu nalezy porzucone
-- wiersze testowe wyczyscic albo przypisac recznie.
--
-- ROLLBACK (przywraca stan otwarty sprzed Z0.10b — wklej i uruchom):
--   DROP POLICY IF EXISTS profiles_insert_own    ON public.profiles;
--   DROP POLICY IF EXISTS profiles_update_own    ON public.profiles;
--   DROP POLICY IF EXISTS progression_insert_own ON public.progression;
--   DROP POLICY IF EXISTS progression_update_own ON public.progression;
--   CREATE POLICY profiles_insert_open ON public.profiles
--       FOR INSERT TO anon, authenticated WITH CHECK (true);
--   CREATE POLICY profiles_update_open ON public.profiles
--       FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
--   CREATE POLICY progression_insert_open ON public.progression
--       FOR INSERT TO anon, authenticated WITH CHECK (true);
--   CREATE POLICY progression_update_open ON public.progression
--       FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
-- ══════════════════════════════════════════════════════════════════════════════

-- ── profiles ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_insert_open ON public.profiles;
DROP POLICY IF EXISTS profiles_update_open ON public.profiles;

-- Nowy wiersz MUSI od razu miec wlasciciela — inaczej powstawalyby kolejne
-- wiersze-sieroty, ktore kazdy moglby przejac.
CREATE POLICY profiles_insert_own ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (owner_uid = auth.uid());

-- USING  = ktore wiersze wolno ruszyc (swoje albo jeszcze nieprzejete).
-- WITH CHECK = jak moga wygladac PO zapisie (zawsze nasze) — to ono blokuje
-- oddanie wlasnego wiersza komus innemu przez podmiane `owner_uid`.
CREATE POLICY profiles_update_own ON public.profiles
    FOR UPDATE TO authenticated
    USING (owner_uid IS NULL OR owner_uid = auth.uid())
    WITH CHECK (owner_uid = auth.uid());

-- ── progression ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS progression_insert_open ON public.progression;
DROP POLICY IF EXISTS progression_update_open ON public.progression;

CREATE POLICY progression_insert_own ON public.progression
    FOR INSERT TO authenticated
    WITH CHECK (owner_uid = auth.uid());

CREATE POLICY progression_update_own ON public.progression
    FOR UPDATE TO authenticated
    USING (owner_uid IS NULL OR owner_uid = auth.uid())
    WITH CHECK (owner_uid = auth.uid());

-- UWAGA: role `anon` celowo NIE ma juz zapisu do zadnej z tych tabel. Klient po
-- `signInAnonymously()` dziala jako `authenticated` (anonimowy uzytkownik to nadal
-- zalogowany uzytkownik w rozumieniu Supabase), wiec normalna gra dziala — a surowe
-- zadanie samym kluczem publicznym, bez sesji, juz nie.
-- DELETE nie ma polityki nigdzie = zablokowane, jak dotad.


-- ══════════════════════════════════════════════════════════════════════════════
-- WERYFIKACJA (uruchom po Run):
--   SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('profiles', 'progression')
--   ORDER BY tablename, cmd;
--
-- Spodziewane: po 3 polityki na tabele (SELECT publiczny + INSERT own + UPDATE own),
-- zadnej o nazwie `*_open`.
-- ══════════════════════════════════════════════════════════════════════════════
