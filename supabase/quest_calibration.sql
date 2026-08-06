-- ============================================================================
-- KALIBRACJA CELOW ROZKAZOW (PROG-F3, Q7) — 2026-08-04
-- ============================================================================
-- Kalibracja Q1-Q6 (2026-08-02) objela WYNIK, ale nie objela kolumn per-run, ktore
-- teraz napedzaja rozkazy: kills / gems_collected / game_seconds / supers / powers.
-- Bez tych rozkladow cele w src/config/quests.ts (QUEST_TARGETS) sa OSZACOWANIEM
-- z matematyki score, nie pomiarem.
--
-- Uruchom w Supabase SQL Editor (brawltanks-dev) i wklej wyniki — dostroje cele
-- jednym passem (wszystkie liczby siedza w jednym bloku config).
--
-- ZASADA DOBORU CELOW:
--   ŁATWY      ~ p50 pojedynczego meczu  (domknie sie sam przy normalnej grze)
--   ŚREDNI     ~ p75-p90 meczu           (1-2 runy albo jeden dobry run)
--   KIERUNKOWY ~ rzadka mechanika        (nie z rozkladu — z tego, czego gracz nie tyka)
-- ============================================================================

-- Q7.1 — rozklad metryk questowych na mecz (score_version = 2, wszystkie scenariusze)
SELECT
    count(*)                                                              AS runs,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY kills)          AS kills_p50,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY kills)          AS kills_p75,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY kills)          AS kills_p90,
    max(kills)                                                            AS kills_max,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY gems_collected) AS gems_p50,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY gems_collected) AS gems_p75,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY gems_collected) AS gems_p90,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY game_seconds)   AS secs_p50,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY game_seconds)   AS secs_p90,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY supers_fired)   AS supers_p50,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY supers_fired)   AS supers_p90,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY powers_used)    AS powers_p50,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY powers_used)    AS powers_p90,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY cubes_collected) AS cubes_p90
FROM public.scores
WHERE score_version = 2;

-- Q7.2 — to samo per mapa (czy cele musza byc normalizowane per mapa jak trofea?)
SELECT
    map,
    count(*)                                                     AS runs,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY kills)          AS kills_p50,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY kills)          AS kills_p90,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY gems_collected) AS gems_p50,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY game_seconds)   AS secs_p90
FROM public.scores
WHERE score_version = 2
GROUP BY map
ORDER BY runs DESC;

-- Q7.3 — ile meczow dziennie gra realny gracz (czy 3 rozkazy dnia sa wykonalne?)
-- Mediana tej kolumny MUSI wystarczyc na domkniecie kompletu dnia, inaczej
-- glowna nagroda (skrzynka za 3/3) jest martwa.
SELECT
    percentile_cont(0.50) WITHIN GROUP (ORDER BY runs_that_day) AS runs_per_day_p50,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY runs_that_day) AS runs_per_day_p75,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY runs_that_day) AS runs_per_day_p90,
    max(runs_that_day)                                          AS runs_per_day_max
FROM (
    SELECT profile_id, date_trunc('day', created_at) AS d, count(*) AS runs_that_day
    FROM public.scores
    WHERE score_version = 2 AND profile_id IS NOT NULL
    GROUP BY profile_id, d
) t;

-- Q7.4 — mega bossy (czy rozkaz "wygraj mecz" ma sens jako tygodniowka aspiracyjna?)
SELECT
    count(*)                                              AS runs,
    count(*) FILTER (WHERE mega_boss_defeated)            AS victories,
    round(100.0 * count(*) FILTER (WHERE mega_boss_defeated) / nullif(count(*), 0), 1) AS victory_pct
FROM public.scores
WHERE score_version = 2;
