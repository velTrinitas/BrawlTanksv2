// @ts-nocheck
// ^ plik dziala w runtime DENO (Supabase Edge), nie w przegladarce.
// tsconfig projektu ma include:["src"] i lib DOM, wiec edytor zglaszalby tu 4 falszywe
// bledy: import z URL (esm.sh) + globalny `Deno` (serve/env). Zadnego z nich nie da sie
// naprawic bez wciagania toolingu Deno do repo, a kod i tak jest typowany po stronie
// Supabase przy deployu. Wylaczamy sprawdzanie TYLKO w tym pliku.
// ══════════════════════════════════════════════════════════════════════════════
// Edge Function: submit-score — Anti-cheat L2a (walidacja serwerowa + insert)
// Brawl Tanks S2 · Supabase (Deno runtime)
// ══════════════════════════════════════════════════════════════════════════════
//
// PO CO: RLS pozwala anon na bezposredni insert do `scores` => klient moze ominac
// gre i POST-owac dowolny wynik przez REST. Ta funkcja jest JEDYNA sciezka insertu:
// waliduje (bounds / dozwolone zbiory / rate-limit) i wstawia przez SERVICE-ROLE
// (omija RLS). Po wdrozeniu ODBIERAMY anon insert w RLS (patrz rls_lockdown_scores.sql).
//
// DEPLOY (Mariusz):
//   supabase functions deploy submit-score --no-verify-jwt
//   (--no-verify-jwt bo model 9b uzywa anon UUID bez auth JWT; funkcja robi wlasna
//    walidacje. Prawdziwe per-user auth = v0.48.0.)
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sa wstrzykiwane AUTOMATYCZNIE — zero sekretow do ustawienia.
//
// KOLEJNOSC WDROZENIA (zeby nie zabic zywych submitow):
//   1) deploy tej funkcji  2) push klienta (routing przez funkcje)  3) DOPIERO potem rls_lockdown_scores.sql
//
// v0.100.0: submit NIESIE JUZ STATY (kills/gems/shots/game_seconds/...). Sa walidowane
// i KLAMPOWANE do rozsadnych gornych granic, nie odrzucaja submitu — staty sa danymi
// analitycznymi, nie wynikiem, wiec nie chcemy przez nie tracic legalnych wynikow.
// L2b (nastepny krok): na tych polach dolozyc REGULY ODRZUCENIA — kill-rate cap
// (kills/game_seconds), score/time ratio, celnosc > 100%, megaboss XOR survival.
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SCORE_CAP = 100_000_000;            // TUNABLE (spojne z sanity-clamp w leaderboard_rpc.sql)
const RATE_LIMIT_PER_HOUR = 20;           // max submitow / godzine / profil
const SCENARIOS = new Set(['ktb', 'ctf', 'castle', 'save_king']);
const MAPS = new Set(['city', 'desert', 'tropics', 'arctic', 'fortified_ruins', 'mars']);
const DIFFICULTIES = new Set(['easy', 'normal', 'hard', 'nightmare']);

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

const isUuid = (s: unknown): s is string =>
    typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ── Staty meczu (v0.100.0) ────────────────────────────────────────────────────
// Gorne granice sa SANITY, nie balansem: maja odciac absurdy (NaN, ujemne, 10^9),
// nie ograniczac dobrej gry. Wartosc poza zakresem jest przycinana, nie odrzucana.
const STAT_CAPS: Record<string, number> = {
    game_seconds: 86_400,     // doba — dluzszy mecz nie istnieje
    kills: 100_000,
    gems_collected: 100_000,
    cubes_collected: 1_000,
    shots_fired: 1_000_000,
    shots_hit: 1_000_000,
    supers_fired: 100_000,
    powers_used: 100_000,
};

/** Nieujemny int przyciety do capa; brak/smiec => 0. */
function stat(body: Record<string, unknown>, key: string): number {
    const v = body[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0;
    return Math.min(Math.round(v), STAT_CAPS[key] ?? 0);
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'invalid_json' }, 400);
    }

    // ── Walidacja pol ──────────────────────────────────────────────────────────
    const profile_id = body.profile_id;
    const score = body.score;
    const scenario = body.scenario;
    const map = body.map;
    const difficulty = body.difficulty;
    const brawler_id = body.brawler_id;
    const score_version = body.score_version;

    if (!isUuid(profile_id)) return json({ error: 'bad_profile_id' }, 400);
    if (typeof score !== 'number' || !Number.isFinite(score) || !Number.isInteger(score) || score < 0 || score >= SCORE_CAP) {
        return json({ error: 'bad_score' }, 400);
    }
    if (typeof scenario !== 'string' || !SCENARIOS.has(scenario)) return json({ error: 'bad_scenario' }, 400);
    if (typeof map !== 'string' || !MAPS.has(map)) return json({ error: 'bad_map' }, 400);
    if (typeof difficulty !== 'string' || !DIFFICULTIES.has(difficulty)) return json({ error: 'bad_difficulty' }, 400);
    if (typeof brawler_id !== 'string' || brawler_id.length === 0 || brawler_id.length > 40) return json({ error: 'bad_brawler' }, 400);
    if (typeof score_version !== 'number' || !Number.isInteger(score_version) || score_version < 1 || score_version > 1000) {
        return json({ error: 'bad_version' }, 400);
    }
    const session_id = typeof body.session_id === 'string' ? body.session_id.slice(0, 100) : null;

    // ── Klient service-role (omija RLS) ────────────────────────────────────────
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ error: 'server_misconfig' }, 500);
    const admin = createClient(url, serviceKey);

    // ── Rate-limit: max N insertow / godzine / profil ──────────────────────────
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error: countErr } = await admin
        .from('scores')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profile_id)
        .gte('created_at', since);
    if (countErr) return json({ error: 'rate_check_failed' }, 500);
    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) return json({ error: 'rate_limited' }, 429);

    // ── Staty meczu: przycinane do sanity-capow, nigdy nie odrzucaja submitu ────
    const shots_fired = stat(body, 'shots_fired');
    const stats = {
        game_seconds: stat(body, 'game_seconds'),
        kills: stat(body, 'kills'),
        gems_collected: stat(body, 'gems_collected'),
        cubes_collected: stat(body, 'cubes_collected'),
        shots_fired,
        // klient liczy POCISKI (nie pociagniecia spustu), wiec trafien nie moze byc wiecej
        // niz wystrzelonych pociskow — z zapasem na pierce/bumerang (1 pocisk, wiele trafien)
        shots_hit: Math.min(stat(body, 'shots_hit'), shots_fired * 4),
        supers_fired: stat(body, 'supers_fired'),
        powers_used: stat(body, 'powers_used'),
        mega_boss_defeated: body.mega_boss_defeated === true,
        // v0.114.0 — run z uzyta kostka 🎲 (Szalone Moce). Stara kolejka offline /
        // stary klient nie niosa pola => false (zgodne z DEFAULT kolumny).
        fun_mode: body.fun_mode === true,
    };

    // ── Insert (created_at = server default) ───────────────────────────────────
    const { data, error } = await admin
        .from('scores')
        .insert({ profile_id, score, scenario, map, difficulty, brawler_id, session_id, score_version, ...stats })
        .select()
        .single();
    if (error) return json({ error: 'insert_failed', detail: error.message }, 500);

    return json({ row: data }, 200);
});
