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
// L2b (pozniej): gdy submit zacznie niesc staty (kills/shots/game_seconds), dolozyc
// tu kill-rate cap, score/time ratio, megaboss XOR survival>600s.
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SCORE_CAP = 100_000_000;            // TUNABLE (spojne z sanity-clamp w leaderboard_rpc.sql)
const RATE_LIMIT_PER_HOUR = 20;           // max submitow / godzine / profil
const SCENARIOS = new Set(['ktb', 'ctf', 'castle', 'save_king']);
const MAPS = new Set(['city', 'desert', 'tropics', 'arctic', 'fortified_ruins']);
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

    // ── Insert (created_at = server default; staty na DEFAULT do L2b) ───────────
    const { data, error } = await admin
        .from('scores')
        .insert({ profile_id, score, scenario, map, difficulty, brawler_id, session_id, score_version })
        .select()
        .single();
    if (error) return json({ error: 'insert_failed', detail: error.message }, 500);

    return json({ row: data }, 200);
});
