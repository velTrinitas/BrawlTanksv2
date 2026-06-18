-- ══════════════════════════════════════════════════════════════════════════════
-- Brawl Tanks Season 2 — Database Schema (FAZA 9b.1, v0.47.0)
-- Projekt: brawltanks-dev (eu-central-1)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- JAK URUCHOMIC:
--   Supabase Dashboard -> SQL Editor -> New query -> wklej CALOSC -> Run.
--   Idempotentne (IF NOT EXISTS / DROP POLICY IF EXISTS) — mozna puscic kilka razy.
--
-- DECYZJE (zatwierdzone):
--   - RLS opcja A: write otwarty dla anon (publishable key). Bez anon auth w 9b.
--     Prawdziwy lockdown przez auth.uid() = profile_id dojdzie w v0.48.0 —
--     bedzie to EDYCJA warunku USING/WITH CHECK, NIE przebudowa schematu.
--   - Nickname chroniony przez UNIQUE constraint (DB-level, dziala bez auth).
--   - created_at ZAWSZE server-side (now()) — nigdy z klienta. Anti-cheat hook.
--   - CHECK constraints lapia smieciowe/niemozliwe dane (zero kosztu, FAZA 11 hook).
--
-- ANTI-CHEAT (FAZA 11, NIE teraz):
--   Pola game_seconds/kills/gems/shots_* + server-side created_at sa fundamentem
--   pod przyszla Edge Function walidujaca (score fizycznie mozliwy? burst rate?).
--   Schemat jest READY — walidator dochodzi bez migracji. Szukaj [FAZA 11] nizej.
-- ══════════════════════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────────────────────
-- TABELA: profiles
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    -- id generowany client-side (crypto.randomUUID) — bez auth w 9b.
    -- v0.48.0: zlinkujemy z auth.users(id) dla RLS ownership.
    id              UUID PRIMARY KEY,

    nickname        TEXT NOT NULL,                   -- uniqueness case-insensitive (functional index nizej)
    avatar_id       TEXT NOT NULL,
    flag_id         TEXT,                            -- nullable (gracz moze nie wybrac flagi)
    language        TEXT NOT NULL DEFAULT 'pl',
    session_count   INTEGER NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Sanity guards (tanie, lapia oczywiste smieci)
    CONSTRAINT profiles_nickname_len  CHECK (char_length(nickname) BETWEEN 1 AND 24),
    CONSTRAINT profiles_session_count CHECK (session_count >= 0),
    CONSTRAINT profiles_language_ok   CHECK (language IN ('pl', 'en'))
);

-- Case-insensitive uniqueness nicku: "Komandor"/"komandor"/"KOMANDOR" = jeden nick.
-- Zastepuje inline UNIQUE(nickname). Insert kolidujacego (po lower) -> 23505.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_nickname_lower_uidx
    ON public.profiles (lower(nickname));


-- ──────────────────────────────────────────────────────────────────────────────
-- TABELA: scores
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scores (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ON DELETE SET NULL: kasacja profilu nie kasuje historycznych wynikow
    -- (anonimizacja zamiast utraty danych leaderboard).
    profile_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    score               INTEGER NOT NULL,
    scenario            TEXT NOT NULL,
    map                 TEXT NOT NULL,
    difficulty          TEXT NOT NULL,
    brawler_id          TEXT NOT NULL,

    -- session_id — round-trip ScoreEntry.sessionId + analytics + multiplayer-ready.
    session_id          TEXT,

    -- score_version — wersjonowanie regul scoringu (HP/DMG x100 = v2). Leaderboard
    -- filtruje po wersji, by nie miesac wynikow ze starej i nowej formuly.
    score_version       INTEGER NOT NULL DEFAULT 1,

    -- [FAZA 11] Pola pod walidacje anti-cheat — Edge Function sprawdzi spojnosc.
    -- game_seconds DEFAULT 0: aktualny submitScore(score, config) nie niesie czasu
    -- gry; przyszla faza rozszerzy interfejs i zacznie populowac te pola.
    game_seconds        INTEGER NOT NULL DEFAULT 0,
    kills               INTEGER NOT NULL DEFAULT 0,
    gems_collected      INTEGER NOT NULL DEFAULT 0,
    cubes_collected     INTEGER NOT NULL DEFAULT 0,
    shots_fired         INTEGER NOT NULL DEFAULT 0,
    shots_hit           INTEGER NOT NULL DEFAULT 0,
    supers_fired        INTEGER NOT NULL DEFAULT 0,
    powers_used         INTEGER NOT NULL DEFAULT 0,
    mega_boss_defeated  BOOLEAN NOT NULL DEFAULT false,

    -- [FAZA 11] Server-side timestamp — NIGDY z klienta. Wykrywanie burst/spamu.
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Sanity guards (zero kosztu, lapia niemozliwe wartosci)
    CONSTRAINT scores_score_nonneg    CHECK (score >= 0),
    CONSTRAINT scores_seconds_pos     CHECK (game_seconds >= 0),
    CONSTRAINT scores_kills_nonneg    CHECK (kills >= 0),
    CONSTRAINT scores_gems_nonneg     CHECK (gems_collected >= 0),
    CONSTRAINT scores_cubes_nonneg    CHECK (cubes_collected >= 0),
    CONSTRAINT scores_shots_nonneg    CHECK (shots_fired >= 0 AND shots_hit >= 0),
    CONSTRAINT scores_hit_lte_fired   CHECK (shots_hit <= shots_fired)
);

-- Indeks pod glowne zapytanie leaderboard: top N dla scenario+map+wersja regul.
CREATE INDEX IF NOT EXISTS idx_scores_leaderboard_v
    ON public.scores (score_version, scenario, map, score DESC);

-- Indeks pod getBestForProfile.
CREATE INDEX IF NOT EXISTS idx_scores_profile
    ON public.scores (profile_id);


-- ──────────────────────────────────────────────────────────────────────────────
-- TABELA: sessions (analytics, opcjonalne)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at    TIMESTAMPTZ,
    result      TEXT,

    CONSTRAINT sessions_result_ok CHECK (result IS NULL OR result IN ('victory', 'gameover', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_profile
    ON public.sessions (profile_id);


-- ──────────────────────────────────────────────────────────────────────────────
-- TRIGGER: auto-update profiles.updated_at
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();


-- ══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — Opcja A (write otwarty dla anon, lockdown w v0.48.0)
-- ══════════════════════════════════════════════════════════════════════════════
-- Automatic RLS jest wlaczone (event trigger), ale wlaczamy jawnie dla pewnosci.
-- Polityki pisane TO anon, authenticated — forward-compatible z anon auth.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- ── profiles ──────────────────────────────────────────────────────────────────
-- SELECT: publiczny (leaderboard pokazuje nick/avatar/flage kazdego gracza).
DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
CREATE POLICY profiles_select_public ON public.profiles
    FOR SELECT TO anon, authenticated
    USING (true);

-- INSERT: otwarty (claim nicku; UNIQUE constraint odrzuca duplikaty).
DROP POLICY IF EXISTS profiles_insert_open ON public.profiles;
CREATE POLICY profiles_insert_open ON public.profiles
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);
-- [v0.48.0] zmienic na: WITH CHECK (auth.uid() = id)

-- UPDATE: otwarty (edycja profilu).
DROP POLICY IF EXISTS profiles_update_open ON public.profiles;
CREATE POLICY profiles_update_open ON public.profiles
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);
-- [v0.48.0] zmienic na: USING (auth.uid() = id) WITH CHECK (auth.uid() = id)

-- DELETE: BRAK polityki = zablokowane. Kasacja profilu tylko server-side (FAZA 11+).

-- ── scores ────────────────────────────────────────────────────────────────────
-- SELECT: publiczny (leaderboard).
DROP POLICY IF EXISTS scores_select_public ON public.scores;
CREATE POLICY scores_select_public ON public.scores
    FOR SELECT TO anon, authenticated
    USING (true);

-- INSERT: otwarty (submit score). created_at wymuszany server-side przez DEFAULT.
DROP POLICY IF EXISTS scores_insert_open ON public.scores;
CREATE POLICY scores_insert_open ON public.scores
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);
-- [v0.48.0] zmienic na: WITH CHECK (auth.uid() = profile_id)
-- [FAZA 11] dodatkowa walidacja przez Edge Function (sanity check score vs stats)

-- UPDATE/DELETE: BRAK polityki = scores sa immutable z poziomu klienta (anti-tamper).

-- ── sessions ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sessions_select_open ON public.sessions;
CREATE POLICY sessions_select_open ON public.sessions
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS sessions_insert_open ON public.sessions;
CREATE POLICY sessions_insert_open ON public.sessions
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS sessions_update_open ON public.sessions;
CREATE POLICY sessions_update_open ON public.sessions
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);
-- [v0.48.0] zacieśnić wszystkie sessions policies do auth.uid() = profile_id


-- ══════════════════════════════════════════════════════════════════════════════
-- WERYFIKACJA (uruchom po Run, sprawdz wyniki)
-- ══════════════════════════════════════════════════════════════════════════════
-- Powinno zwrocic 3 tabele z rowsecurity = true:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename IN ('profiles','scores','sessions');
--
-- Powinno zwrocic polityki dla kazdej tabeli:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' ORDER BY tablename, cmd;