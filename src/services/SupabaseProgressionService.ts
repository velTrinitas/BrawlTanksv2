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

import type { ProgressionInsert, ProgressionRow } from './supabase/types';
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
}

/** Singleton. */
export const supabaseProgressionService = new SupabaseProgressionService();
