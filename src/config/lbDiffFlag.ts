/**
 * lbDiffFlag.ts — v0.246.0: POZIOM TRUDNOSCI W RANKINGU (pill w wierszu + filtr poziomu).
 *
 * Wymaga supabase/leaderboard_rpc_v2.sql na produkcji (RPC *_v2 z p_difficulty i kolumna difficulty).
 * KOLEJNOSC: SQL -> flip LB_DIFF_LIVE. Przed flipem: `?lbdiff=1` do testu, po flipie rollback `?lbdiff=0`
 * (klient wraca na stare RPC v1, ktore dalej dzialaja).
 */
export const LB_DIFF_LIVE = true; // v0.247.0: SQL v2 na produkcji (2026-10-12)

export function isLbDiffEnabled(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('lbdiff');
        if (q === '0') return false;
        if (LB_DIFF_LIVE) return true;
        return q === '1';
    } catch { return LB_DIFF_LIVE; }
}
