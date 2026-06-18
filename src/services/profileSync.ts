/**
 * profileSync.ts — FAZA 9b.3a (v0.47.0)
 *
 * Orkiestrator synchronizacji profilu z chmura. Laczy ProfileService (lokalny,
 * synchroniczny) z SupabaseProfileService (cloud, async) BEZ modyfikowania zadnego
 * z nich — czysta warstwa koordynacji.
 *
 * Kluczowy efekt: po wypchnieciu profilu do chmury FK dla scores jest spelniony,
 * wiec oprozniamy kolejke offline z 9b.2 (zalegly wynik trafia do bazy).
 */

import { ProfileService } from './ProfileService';
import { supabaseProfileService, NicknameTakenError } from './SupabaseProfileService';
import { scoreService } from './ScoreService';

/**
 * Boot sync: wypycha aktywny lokalny profil do chmury, potem oprozni kolejke scores.
 * Fire-and-forget — NIGDY nie blokuje boota gry. Wywolaj w main.ts po init ProfileService.
 */
export async function syncActiveProfileToCloud(): Promise<void> {
    const profile = ProfileService.getActiveProfile();
    if (!profile) return; // brak profilu (onboarding) — nic do synchronizacji

    try {
        await supabaseProfileService.upsertProfile(profile);
        console.log('[ProfileSync] Aktywny profil zsynchronizowany z chmura.');

        // Profil jest w bazie -> FK scores.profile_id spelniony -> oprozni kolejke.
        // flushQueue jest opcjonalne w IScoreService (tylko impl z kolejka je ma).
        await scoreService.flushQueue?.();
    } catch (e) {
        if (e instanceof NicknameTakenError) {
            // Edge case: nick aktywnego profilu zajety w chmurze przez INNE id
            // (np. kolizja przy migracji wielu urzadzen). Log, nie crash —
            // rozwiazanie pelne dojdzie z anon auth (v0.48.0).
            console.warn('[ProfileSync] Nick aktywnego profilu zajety w chmurze przez inne id:', e.nickname);
        } else {
            // Offline / blad sieci — profil zsynchronizuje sie przy nastepnym boocie.
            console.warn('[ProfileSync] Sync aktywnego profilu nieudany (offline?):', e);
        }
    }
}

/**
 * Pomocnik do recznego wywolania po utworzeniu/edycji profilu (9b.3b wepnie to
 * w IdentityScreen/ProfileEditScreen dla natychmiastowego cloud push).
 * Rzuca NicknameTakenError w gore — UI pokazuje komunikat i NIE zapisuje lokalnie.
 */
export async function pushProfileToCloud(): Promise<void> {
    const profile = ProfileService.getActiveProfile();
    if (!profile) return;
    await supabaseProfileService.upsertProfile(profile);
    await scoreService.flushQueue?.();
}