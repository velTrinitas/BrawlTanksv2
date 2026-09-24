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
import { isCloudEnabled } from '../../config/cloud';

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
                // Z0.10b (2026-09-24): anon auth WLACZONE. Do v0.204.0 stalo tu
                // `persistSession: false` i komentarz "anon auth dojdzie w v0.48.0" —
                // przez co `auth.uid()` bylo NULL przy kazdym zadaniu, a RLS na
                // `profiles`/`progression` nie mialo CZEGO sprawdzac. Sesja MUSI byc
                // trwala: bez niej kazde odswiezenie strony dawaloby nowy uid, czyli
                // gracz traciłby dostep do wlasnego profilu po przeladowaniu.
                persistSession: true,
                autoRefreshToken: true,
            },
        });
        console.log('[Supabase] Klient zainicjalizowany (singleton).');
    }
    return _client;
}

/**
 * ANONIMOWA SESJA — tozsamosc urzadzenia dla RLS (Z0.10b).
 *
 * PO CO: `profiles.id` to UUID generowany po stronie klienta i PUBLICZNY — wyciek
 * przez ranking, bo `leaderboard_top` zwraca `profile_id`. Dopoki `auth.uid()` bylo
 * NULL, kazdy mogl odczytac cudze id z tablicy wynikow i nadpisac ten profil (RLS
 * mial `USING (true)`). Anonimowa sesja daje serwerowi STABILNY identyfikator
 * urzadzenia, ktorego klient nie moze podrobic — i dopiero on pozwala RLS odroznic
 * wlasciciela wiersza od obcego.
 *
 * OFFLINE-FIRST: brak sesji NIE jest bledem krytycznym. localStorage pozostaje
 * zrodlem prawdy (patrz ProgressionService), wiec gra dziala dalej — traci tylko
 * synchronizacje z chmura. Dlatego zwracamy `null` zamiast rzucac.
 *
 * WYMAGANIE PO STRONIE PROJEKTU: w Supabase Dashboard musi byc wlaczony provider
 * "Anonymous sign-ins" (Authentication → Providers). Bez tego `signInAnonymously()`
 * zwraca blad i ta funkcja konsekwentnie oddaje `null`.
 */
let _uidPromise: Promise<string | null> | null = null;

export function ensureAnonSession(): Promise<string | null> {
    // Jedna proba na cykl zycia strony — inaczej rownolegle zapisy (profil + progresja
    // przy koncu meczu) zrobilyby dwa logowania naraz i drugie nadpisaloby sesje.
    if (_uidPromise) return _uidPromise;

    _uidPromise = (async () => {
        try {
            // Chmura odcieta => zadnego logowania. Bez tego `?cloud=0` nadal wysylalby
            // POST /auth/v1/signup i obietnica „zero zadan do supabase.co" bylaby falszywa.
            if (!isCloudEnabled()) return null;
            const sb = getSupabase();
            const { data: existing } = await sb.auth.getSession();
            if (existing.session?.user?.id) return existing.session.user.id;

            const { data, error } = await sb.auth.signInAnonymously();
            if (error) {
                console.warn('[Supabase] Anonimowa sesja nieudana — sync do chmury wylaczony, '
                    + 'gra dziala na localStorage. Sprawdz provider "Anonymous sign-ins".', error);
                return null;
            }
            return data.user?.id ?? null;
        } catch (e) {
            console.warn('[Supabase] Anonimowa sesja rzucila wyjatkiem:', e);
            return null;
        }
    })();

    return _uidPromise;
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