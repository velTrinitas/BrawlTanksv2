/**
 * SupabaseProgressionService — cloud sync progresji konta (PROG-F1b).
 *
 * Wzorzec: SupabaseProfileService (async, per-feature isolation). ProgressionService
 * (localStorage, sync) zostaje ZRODLEM PRAWDY lokalnie; ta warstwa dokłada chmurę jako
 * OSOBNY concern (best-effort — offline nigdy nie blokuje flow gry).
 *
 * Tabela `progression` (supabase/progression_sync.sql): 1:1 z profilem, pola
 * MONOTONICZNE => merge miedzy urzadzeniami bezstratny (max/union po stronie klienta).
 */

import type { LifetimeStatsRow, ProgressionInsert, ProgressionRow } from './supabase/types';
import { getSupabase } from './supabase/SupabaseClient';

export class SupabaseProgressionService {
    /** UPSERT progresji (insert lub update po profile_id). */
    async upsert(row: ProgressionInsert): Promise<void> {
        const sb = getSupabase();
        const { error } = await sb.from('progression').upsert(row, { onConflict: 'profile_id' });
        if (error) throw error;
    }

    /** Pobierz progresje z chmury po profile_id (cross-device sync down). null = brak wiersza. */
    async fetch(profileId: string): Promise<ProgressionRow | null> {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('progression')
            .select('*')
            .eq('profile_id', profileId)
            .maybeSingle();
        if (error) throw error;
        return (data as ProgressionRow) ?? null;
    }

    /**
     * RANKS-1: liczba ZWYCIESTW z historii scores (KTB: mega_boss_defeated).
     * Zwykle count-query na otwartym SELECT (zero SQL-a po stronie Mariusza).
     * BEZ filtra game_seconds: wiersze sprzed v0.100.0 maja 0 w kolumnach statow
     * (interfejs ich nie niosl) — filtr >=60s wycialby CALA legalna historie.
     * Guard anty-farm RANK_MIN_SECONDS obowiazuje tylko liczenie NA ZYWO (recordRun).
     * null = blad/offline.
     */
    async fetchWinsCount(profileId: string): Promise<number | null> {
        const sb = getSupabase();
        const { count, error } = await sb
            .from('scores')
            .select('id', { count: 'exact', head: true })
            .eq('profile_id', profileId)
            .eq('mega_boss_defeated', true);
        if (error) throw error;
        return count;
    }

    /**
     * PROFILE-1: jednorazowy backfill statow lifetime + rekordow z WLASNYCH wierszy
     * `scores` (RPC profile_lifetime_stats — supabase/progression_stats.sql).
     * null = brak wierszy / RPC niedostepne. Idempotentny z natury (MAX-merge u klienta).
     */
    async fetchLifetimeStats(profileId: string): Promise<LifetimeStatsRow | null> {
        const sb = getSupabase();
        const { data, error } = await sb.rpc('profile_lifetime_stats', { p_profile_id: profileId });
        if (error) throw error;
        // RPC RETURNS TABLE => supabase-js zwraca tablice wierszy (tu zawsze 1 wiersz agregatu)
        const row = Array.isArray(data) ? data[0] : data;
        return (row as LifetimeStatsRow) ?? null;
    }
}

/** Singleton. */
export const supabaseProgressionService = new SupabaseProgressionService();
