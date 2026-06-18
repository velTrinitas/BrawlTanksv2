/**
 * SupabaseClient.ts — FAZA 9b.0 (v0.47.0)
 *
 * Singleton dostepu do Supabase (Postgres + REST + Realtime).
 * Wzorzec analogiczny do AudioSys: jeden klient na cala aplikacje,
 * tworzony leniwie przy pierwszym uzyciu, frozen przed eksportem.
 *
 * Konwencje (Architectural Constitution):
 *  - separation of concerns: TYLKO bootstrap klienta, zero logiki domenowej
 *  - type-safe: env vars walidowane przy starcie, twardy blad gdy brak
 *  - Object.freeze na obiekcie konfiguracyjnym (immutable)
 *  - per-project: VITE_SUPABASE_* czytane z .env (dev/prod swap przez Vite MODE)
 *
 * Klucze:
 *  - URL + PUBLISHABLE key sa client-safe (i tak laduja w bundlu przegladarki).
 *    Prawdziwa brama bezpieczenstwa to RLS po stronie bazy, NIE ukrywanie klucza.
 *  - SECRET key NIGDY nie trafia do client kodu (nie uzywany w 9b w ogole).
 */

import { createClient, type SupabaseClient as SbClient } from '@supabase/supabase-js';

// ── Konfiguracja z env (Vite injectuje import.meta.env.VITE_*) ────────────────

interface SupabaseEnv {
    readonly url: string;
    readonly publishableKey: string;
}

/**
 * Czyta i waliduje zmienne srodowiskowe.
 * Twardy blad przy braku — lepiej crash przy starcie niz ciche null pozniej.
 */
function readEnv(): SupabaseEnv {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !publishableKey) {
        throw new Error(
            '[Supabase] Brak konfiguracji. Utworz plik .env w katalogu glownym ' +
            'projektu i uzupelnij VITE_SUPABASE_URL oraz VITE_SUPABASE_PUBLISHABLE_KEY ' +
            '(wzorzec w .env.example). Restart `npm run dev` po zmianie .env.'
        );
    }

    return Object.freeze({ url, publishableKey });
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _client: SbClient | null = null;

/**
 * Zwraca jedyna instancje klienta Supabase. Leniwa inicjalizacja —
 * klient tworzony przy pierwszym wywolaniu, potem reuzywany.
 */
export function getSupabase(): SbClient {
    if (_client === null) {
        const env = readEnv();
        _client = createClient(env.url, env.publishableKey, {
            auth: {
                // 9b: bez anon auth (decyzja Q2) — profil identyfikowany przez
                // client-side UUID. Anon auth dojdzie w v0.48.0 przed external test.
                persistSession: false,
                autoRefreshToken: false,
            },
        });
        console.log('[Supabase] Klient zainicjalizowany (singleton).');
    }
    return _client;
}

/**
 * Smoke test polaczenia. Zwraca true gdy baza odpowiada.
 * Uzywany w 9b.0 do weryfikacji setupu PRZED budowa serwisow.
 *
 * UWAGA: na tym etapie tabele jeszcze nie istnieja (powstana w 9b.1),
 * wiec test sprawdza tylko czy klient potrafi nawiazac polaczenie HTTP —
 * blad "relation does not exist" tez liczymy jako sukces (serwer odpowiada).
 */
export async function smokeTest(): Promise<boolean> {
    try {
        const sb = getSupabase();
        // Lekki ping na nieistniejaca tabele — interesuje nas tylko czy
        // dostaniemy odpowiedz z serwera (kod bledu = polaczenie dziala).
        const { error } = await sb.from('profiles').select('id').limit(1);

        if (error) {
            // PGRST205 / "does not exist" = tabela jeszcze nie utworzona, ale
            // serwer odpowiedzial => polaczenie OK.
            const benign = /does not exist|PGRST205|schema cache/i.test(error.message);
            if (benign) {
                console.log('[Supabase] Polaczenie OK (tabela profiles jeszcze nie istnieje — to normalne w 9b.0).');
                return true;
            }
            console.error('[Supabase] Smoke test — blad:', error.message);
            return false;
        }

        console.log('[Supabase] Polaczenie OK (tabela profiles istnieje).');
        return true;
    } catch (e) {
        console.error('[Supabase] Smoke test — wyjatek:', e);
        return false;
    }
}