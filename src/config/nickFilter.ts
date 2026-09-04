/**
 * nickFilter.ts — Z0.10 (COOP ETAP 0, v0.149.0): profanity filter for nicknames (PL + EN).
 *
 * Why here: nicks land on the PUBLIC leaderboard and the target players are kids 9-12.
 * Until v0.148.0 the only protection was a display-only word mask on leaderboard rows
 * (leaderboard.ts) — nothing blocked a dirty nick at creation/edit time.
 *
 * Scope (Z0.10a): CLIENT-SIDE gate only. Server-side gate (Edge Function + RLS lockdown
 * on `profiles`) is deferred to Z0.10b — locking RLS now would break profile sync for
 * testers on the frozen test build (window until 2026-09-23).
 *
 * Design:
 *  - Kill switch NICK_FILTER_LIVE (pattern copied from shop.ts SHOP_LIVE). Compiled
 *    constant on purpose — NOT a URL param, so a kid cannot switch it off.
 *  - Matching is substitution-resistant: lowercase -> PL diacritics fold -> leet map
 *    (0->o, 1->i, 3->e...) -> plus a digits-stripped variant -> plus collapsed-repeats
 *    variants (fuckk -> fuck). Every variant is tested.
 *  - Two lists to avoid the "Scunthorpe problem" (innocent word containing a vulgar
 *    fragment): SUBSTRING_TERMS = unambiguous roots matched anywhere; EXACT_TOKENS =
 *    short/ambiguous words matched only as the WHOLE normalized nick (e.g. 'cunt'
 *    stays exact so 'Scunthorpe' passes, 'dick' exact so 'Dickens' passes).
 *  - This is a STARTER list — extend here (single source; leaderboard display mask
 *    imports from this module too).
 *
 * NOTE: existing player nicks are NOT retro-deleted. isValidNickname() in
 * types/Profile.ts must stay untouched — ProfileService.loadProfiles() DROPS stored
 * profiles failing that predicate, so tightening it would destroy saves. This module
 * is a separate predicate used only at creation / nick-change time.
 */

export const NICK_FILTER_LIVE = true;

/** Kill switch (rollback = flip the const, no other changes needed). */
export function isNickFilterEnabled(): boolean {
    return NICK_FILTER_LIVE;
}

// ── Normalization ────────────────────────────────────────────────────────────

/** PL diacritics fold (DB nicks have NO charset check — may contain anything). */
const DIACRITICS_MAP: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
    'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
};

/** Leet substitutions kids actually use. */
const LEET_MAP: Record<string, string> = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't',
    '8': 'b', '9': 'g', '@': 'a', '$': 's', '€': 'e',
};

function foldDiacritics(s: string): string {
    return s.replace(/[ąćęłńóśźż]/g, (ch) => DIACRITICS_MAP[ch] ?? ch);
}

/**
 * All normalized variants of a nick to test against the lists:
 *  [letters-only (digits stripped), leet-mapped, collapsed(letters-only), collapsed(leet)]
 * Two bases catch both "kurwa123" (strip) and "kurw4" / "sh1t" (leet); collapse
 * catches elongations ("fuckk"). Deduplicated.
 */
function normalizedVariants(nick: string): string[] {
    const lower = foldDiacritics((nick ?? '').toLowerCase());
    const lettersOnly = lower.replace(/[^a-z]/g, '');
    const leet = lower
        .replace(/[0134-9@$€]/g, (ch) => LEET_MAP[ch] ?? '')
        .replace(/[^a-z]/g, '');
    const collapse = (s: string) => s.replace(/(.)\1+/g, '$1');
    return Array.from(new Set([lettersOnly, leet, collapse(lettersOnly), collapse(leet)]));
}

// ── Lists (STARTER — extend here) ────────────────────────────────────────────

/** Unambiguous vulgar roots — blocked ANYWHERE inside the normalized nick. */
const SUBSTRING_TERMS: readonly string[] = [
    // PL
    'kurw', 'kurew', 'chuj', 'huj', 'jeb', 'pierd', 'pizd', 'kutas', 'dziwk',
    'skurwy', 'spierdal', 'wypierdal',
    // EN
    'fuck', 'shit', 'bitch', 'whore', 'nigg', 'faggot', 'asshole', 'porn',
];

/** Short/ambiguous words — blocked only as the WHOLE normalized nick. */
const EXACT_TOKENS: ReadonlySet<string> = new Set([
    // PL
    'cwel', 'dupa', 'cipa', 'suka', 'gowno', 'szmata', 'pedal', 'debil',
    'idiota', 'kretyn', 'seks', 'penis', 'wagina', 'hwdp', 'chwdp',
    // EN
    'dick', 'cunt', 'slut', 'fag', 'sex', 'ass', 'cock', 'pussy',
]);

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * True when the (raw) nick contains blocked content in ANY normalized variant.
 * Flag-independent — display-layer masking uses this directly.
 */
export function containsProfanity(nick: string): boolean {
    try {
        for (const variant of normalizedVariants(nick)) {
            if (variant.length === 0) continue;
            if (EXACT_TOKENS.has(variant)) return true;
            for (const term of SUBSTRING_TERMS) {
                if (variant.includes(term)) return true;
            }
        }
        return false;
    } catch (e) {
        // Never break profile flows on a filter bug — log loudly, let the nick through
        // (display mask on the leaderboard is the second line of defense).
        console.error('[nickFilter] containsProfanity failed:', (e as Error).stack ?? e, { nick });
        return false;
    }
}

/** Gate used at nick creation / change. Respects the kill switch. */
export function isCleanNickname(nick: string): boolean {
    if (!isNickFilterEnabled()) return true;
    return !containsProfanity(nick);
}
