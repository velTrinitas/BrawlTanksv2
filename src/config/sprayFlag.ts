/**
 * sprayFlag.ts — v0.246.0: SPRAY Z NICKIEM (klawisz R, efekt fun, tylko wizualny i lokalny).
 * Flip = SPRAY_LIVE true. Przed flipem `?spray=1`, po flipie rollback `?spray=0`.
 */
export const SPRAY_LIVE = true; // v0.248.0 flip (rollback ?spray=0)

export function isSprayEnabled(): boolean {
    try {
        const q = new URLSearchParams(location.search).get('spray');
        if (q === '0') return false;
        if (SPRAY_LIVE) return true;
        return q === '1';
    } catch { return SPRAY_LIVE; }
}
