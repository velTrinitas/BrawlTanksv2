-- ============================================================================
-- PROGRESSION SYNC — tabela + RLS (PROG-F1b, 2026-08-03)
-- ============================================================================
-- Cloud sync progresji konta (offline-first: localStorage = zrodlo prawdy, chmura
-- = warstwa dokladana). 1:1 z profilem. Wszystkie pola MONOTONICZNE (rosna) =>
-- merge miedzy urzadzeniami bezstratny (max/union po stronie klienta).
--
-- Uruchom w Supabase SQL Editor (projekt brawltanks-dev). Idempotentne.
-- Wzorzec: profiles (schema.sql) — anon RLS otwarty, updated_at przez set_updated_at().
--
-- UWAGA anti-cheat: progresja jest client-writable (jak profiles, NIE jak scores).
-- To osobista progresja, nie ranking. Hardening (L2b / Edge Function) = pozniej;
-- gdy wejdzie auth.uid, zaostrzyc policy do (auth.uid() = profile_id) — komentarze nizej.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.progression (
    profile_id          UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

    trophies            INTEGER NOT NULL DEFAULT 0,
    bolts               INTEGER NOT NULL DEFAULT 0,
    total_runs          INTEGER NOT NULL DEFAULT 0,

    -- rekord score per mapa: { "city": 174, "arctic": 748, ... }
    per_map_best        JSONB   NOT NULL DEFAULT '{}'::jsonb,
    -- progi milestone juz nagrodzone: [30, 70, 120, ...]
    claimed_milestones  JSONB   NOT NULL DEFAULT '[]'::jsonb,
    -- klucz dnia ostatniego runa (YYYY-MM-DD) — bonus "pierwszy run dnia"
    last_run_day        TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT progression_nonneg CHECK (trophies >= 0 AND bolts >= 0 AND total_runs >= 0)
);

-- auto-update updated_at (reuse funkcji z schema.sql)
DROP TRIGGER IF EXISTS trg_progression_updated_at ON public.progression;
CREATE TRIGGER trg_progression_updated_at
    BEFORE UPDATE ON public.progression
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.progression ENABLE ROW LEVEL SECURITY;

-- SELECT: publiczny (progresja nie jest sekretem; spojne z profiles; przyszly hub
-- innych graczy / social moze to czytac). Alternatywa gdy auth: tylko wlasny.
DROP POLICY IF EXISTS progression_select_public ON public.progression;
CREATE POLICY progression_select_public ON public.progression
    FOR SELECT TO anon, authenticated
    USING (true);

-- INSERT: otwarty (pierwszy zapis konta).
DROP POLICY IF EXISTS progression_insert_open ON public.progression;
CREATE POLICY progression_insert_open ON public.progression
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);
-- [przyszlosc auth] WITH CHECK (auth.uid() = profile_id)

-- UPDATE: otwarty (sync po meczu).
DROP POLICY IF EXISTS progression_update_open ON public.progression;
CREATE POLICY progression_update_open ON public.progression
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);
-- [przyszlosc auth] USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id)

-- DELETE: BRAK polityki = zablokowane (kasacja kaskadowo z profilem).
