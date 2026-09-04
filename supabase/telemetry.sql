-- ============================================================================
-- telemetry.sql — Z0.9 (COOP ETAP 0, v0.151.0): telemetria bazowa wydajnosci.
--
-- URUCHOM w Supabase Dashboard > SQL Editor (jak progression_stats.sql).
-- Idempotentne — mozna odpalic wielokrotnie.
--
-- RODO: tabela przechowuje WYLACZNIE dane techniczne. ZERO identyfikatorow:
-- bez profile_id, session_id, nicku, user-agenta, IP. Wiersza nie da sie
-- powiazac z osoba. Decyzja Mariusza 2026-09-04; wpis do polityki prywatnosci
-- = osobna karta w backlogu (mandatory / law requirement).
--
-- Bezpieczenstwo: anon ma TYLKO INSERT (zero SELECT/UPDATE/DELETE) — nikt
-- z zewnatrz nie odczyta zebranych danych. CHECK-i na zakresach chronia przed
-- smieciem. Bez Edge Function celowo: telemetria nie zasila rankingu, nie ma
-- czego oszukiwac; kill switch po stronie klienta (TELEMETRY_LIVE) + TRUNCATE
-- w razie spamu wystarcza.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.telemetry (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    game_version TEXT NOT NULL CHECK (char_length(game_version) BETWEEN 1 AND 20),
    device_model TEXT NOT NULL CHECK (char_length(device_model) BETWEEN 1 AND 48),
    browser TEXT NOT NULL CHECK (char_length(browser) BETWEEN 1 AND 32),
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'desktop', 'other')),
    is_touch BOOLEAN NOT NULL,
    dpr NUMERIC(4, 2) NOT NULL CHECK (dpr > 0 AND dpr <= 10),
    render_res NUMERIC(4, 2) NOT NULL CHECK (render_res > 0 AND render_res <= 4),
    -- fps_p50 = typowa plynnosc; fps_p05 = najgorsze 5% sekund (MIERZY ZACIECIA:
    -- wysoki p50 + niski p05 = judder); fps_avg = srednia kontrolna.
    fps_p50 INT NOT NULL CHECK (fps_p50 BETWEEN 0 AND 1000),
    fps_p05 INT NOT NULL CHECK (fps_p05 BETWEEN 0 AND 1000),
    fps_avg INT NOT NULL CHECK (fps_avg BETWEEN 0 AND 1000),
    match_seconds INT NOT NULL CHECK (match_seconds BETWEEN 0 AND 7200),
    map TEXT NOT NULL CHECK (char_length(map) BETWEEN 1 AND 32),
    scenario TEXT NOT NULL CHECK (char_length(scenario) BETWEEN 1 AND 32),
    difficulty TEXT NOT NULL CHECK (char_length(difficulty) BETWEEN 1 AND 16),
    result TEXT NOT NULL CHECK (result IN ('victory', 'gameover'))
);

CREATE INDEX IF NOT EXISTS idx_telemetry_device
    ON public.telemetry (device_model, created_at DESC);

-- RLS: anon moze TYLKO wstawiac. Zadnego SELECT dla anon/authenticated.
ALTER TABLE public.telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telemetry_insert_anon ON public.telemetry;
CREATE POLICY telemetry_insert_anon ON public.telemetry
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Supabase domyslnie nadaje szerokie granty na public — utnij odczyt jawnie.
REVOKE SELECT, UPDATE, DELETE ON public.telemetry FROM anon, authenticated;
GRANT INSERT ON public.telemetry TO anon, authenticated;

-- ============================================================================
-- Widok dla Mariusza (Dashboard > SQL Editor / Table Editor):
--   SELECT * FROM telemetry_by_device;
-- Kryterium Z0.9: "dane widoczne z podzialem na model urzadzenia".
-- ============================================================================
CREATE OR REPLACE VIEW public.telemetry_by_device AS
SELECT
    device_model,
    platform,
    count(*)                                                    AS matches,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY fps_p50)) AS med_fps_p50,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY fps_p05)) AS med_fps_p05,
    round(avg(match_seconds))                                   AS avg_match_seconds,
    max(created_at)                                             AS last_seen,
    max(game_version)                                           AS newest_version
FROM public.telemetry
GROUP BY device_model, platform
ORDER BY matches DESC;

-- Widok tez nie dla klientow (widoki wykonuja sie z prawami wlasciciela —
-- bez revoke anon moglby czytac agregaty mimo RLS na tabeli).
REVOKE ALL ON public.telemetry_by_device FROM anon, authenticated;
