-- ============================================================================
-- PROGRESSION CALIBRATION — realny rozklad wynikow (bramka progresji, 2026-08-02)
-- ============================================================================
-- Cel: skalibrowac progi progresji (XP / kamienie milowe / tempo odblokowan)
-- na PRAWDZIWYCH danych z produkcji, a nie zgadywac. Uruchom KAZDE zapytanie
-- osobno w Supabase SQL Editor i wklej mi wyniki (screeny/CSV).
--
-- Uwaga: filtr score_version = 5 (CURRENT_SCORE_VERSION od v0.212.0; wczesniej 4). Tablica CTF/'ctf'
-- jest PUSTA (submit CTF celowo pominiety) => kalibracja = realnie KTB.
-- ============================================================================


-- ── Q1. OVERVIEW: ile danych w ogole mamy ────────────────────────────────────
-- Sanity: liczba wynikow, unikalni gracze, sesje, zakres dat, podzial na scenariusze.
SELECT
  count(*)                              AS total_scores,
  count(DISTINCT profile_id)            AS distinct_players,
  count(DISTINCT session_id)            AS distinct_sessions,
  min(created_at)::date                 AS first_score,
  max(created_at)::date                 AS last_score,
  count(*) FILTER (WHERE scenario = 'ktb')    AS ktb_rows,
  count(*) FILTER (WHERE scenario = 'ctf')    AS ctf_rows,
  count(*) FILTER (WHERE scenario = 'castle') AS castle_rows
FROM scores
WHERE score_version = 5;
-- UWAGA (KROK 2, 2026-09-24): filtry ustawione na CURRENT_SCORE_VERSION = 4.
-- Wczesniej stalo tu 2 — czyli kazde zapytanie kalibracyjne puszczone po bumpie
-- czytalo MARTWE dane i cicho zwracalo wyniki sprzed dwoch wersji formuly.
-- Przy bumpie 4->5 w KROKU 3 podbic te filtry RAZEM z CURRENT_SCORE_VERSION;
-- zeby objac dane sprzed bumpu, uzyj IN (4,5).


-- ── Q2. ROZKLAD WYNIKOW per scenariusz x mapa (RDZEN KALIBRACJI) ─────────────
-- To ustawia krzywa nagrod: ile warta "przecietna" (p50) vs "swietna" (p90/p95) gra.
-- Progi progresji (XP za mecz, kamienie milowe) pinujemy do tych percentyli.
SELECT
  scenario,
  map,
  count(*)                                                          AS n,
  min(score)                                                        AS min,
  round(percentile_cont(0.10) WITHIN GROUP (ORDER BY score))        AS p10,
  round(percentile_cont(0.25) WITHIN GROUP (ORDER BY score))        AS p25,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY score))        AS median,
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY score))        AS p75,
  round(percentile_cont(0.90) WITHIN GROUP (ORDER BY score))        AS p90,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY score))        AS p95,
  round(percentile_cont(0.99) WITHIN GROUP (ORDER BY score))        AS p99,
  max(score)                                                        AS max,
  round(avg(score))                                                 AS avg
FROM scores
WHERE score_version = 5
GROUP BY scenario, map
ORDER BY scenario, n DESC;


-- ── Q3. WYNIK per POZIOM TRUDNOSCI ──────────────────────────────────────────
-- Czy trudniej = wiecej punktow (progresja moze bramkowac/mnozyc przez difficulty).
SELECT
  difficulty,
  count(*)                                                     AS n,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY score))   AS median,
  round(percentile_cont(0.90) WITHIN GROUP (ORDER BY score))   AS p90,
  max(score)                                                   AS max
FROM scores
WHERE score_version = 5
GROUP BY difficulty
ORDER BY median;


-- ── Q4. ILE GIER ROBI GRACZ (TEMPO progresji) ───────────────────────────────
-- Kluczowe dla pacingu: jesli mediana gracza to N gier, odblokowania musza byc
-- osiagalne w ~N gier, nie w 200. Rozklad liczby meczow per gracz.
WITH per_player AS (
  SELECT profile_id, count(*) AS matches
  FROM scores
  WHERE score_version = 5
  GROUP BY profile_id
)
SELECT
  count(*)                                                       AS players,
  count(*) FILTER (WHERE matches = 1)                            AS one_and_done,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY matches))   AS median_matches,
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY matches))   AS p75_matches,
  round(percentile_cont(0.90) WITHIN GROUP (ORDER BY matches))   AS p90_matches,
  max(matches)                                                   AS max_matches,
  round(avg(matches), 1)                                         AS avg_matches
FROM per_player;


-- ── Q5. REKORD ZYCIOWY per gracz (progi kamieni milowych) ───────────────────
-- Kamienie milowe progresji powinny siedziec na OSIAGALNYCH rekordach, nie w kosmosie.
WITH pb AS (
  SELECT profile_id, max(score) AS best
  FROM scores
  WHERE score_version = 5
  GROUP BY profile_id
)
SELECT
  count(*)                                                    AS players,
  round(percentile_cont(0.25) WITHIN GROUP (ORDER BY best))   AS pb_p25,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY best))   AS pb_median,
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY best))   AS pb_p75,
  round(percentile_cont(0.90) WITHIN GROUP (ORDER BY best))   AS pb_p90,
  max(best)                                                   AS pb_max
FROM pb;


-- ── Q6. UZYCIE i SILA BRAWLEROW (balans + co nagradzac/bramkowac) ───────────
-- Ktore czolgi gra sie najczesciej i ktore daja najwyzszy median score.
SELECT
  brawler_id,
  count(*)                                                     AS picks,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1)           AS pick_pct,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY score))   AS median_score,
  round(percentile_cont(0.90) WITHIN GROUP (ORDER BY score))   AS p90_score
FROM scores
WHERE score_version = 5
GROUP BY brawler_id
ORDER BY picks DESC;
