/**
 * junkyardFlag.ts — ZLOMOWISKO (junkyard), new KTB map. Built behind a flag, pattern 1:1 with enigmaFlag.ts.
 *
 * `?junkyard=1` enables before the flip, `?junkyard=0` ALWAYS disables (rollback without a deploy).
 * Flip = JUNKYARD_LIVE true + bump SIM_VERSION + Edge whitelist (supabase/functions/submit-score) in one commit.
 * Until the flag is LIVE: the map card is a "COMING SOON" tile (replaces the old POLIGON teaser) and junkyard
 * scores do NOT go to the ranking (SupabaseScoreService -> provisionalEntry).
 */
export const JUNKYARD_LIVE = true; // FLIP v0.243.0 (2026-10-09): Edge whitelist deployed first, SIM_VERSION 14

export function isJunkyardEnabled(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('junkyard');
        if (q === '0') return false;
        if (JUNKYARD_LIVE) return true;
        return q === '1';
    } catch { return JUNKYARD_LIVE; }
}

/**
 * J6a: fake-3D PARALLAX of the tall machines (press plate + pistons, crusher, crane tower + arm).
 * Default ON; `?jyparallax=0` turns it off without a deploy (then every roof sits exactly where it did before).
 */
export const JUNKYARD_PARALLAX = true;
export function isJunkyardParallaxEnabled(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('jyparallax');
        if (q === '0') return false;
        if (q === '1') return true;
        return JUNKYARD_PARALLAX;
    } catch { return JUNKYARD_PARALLAX; }
}
