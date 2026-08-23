/**
 * rankBadge.ts — RANKS-1 (v0.118.0). Wspolny wizual badge rangi:
 * L1/L2 = PNG (art Mariusza w public/ranks/), L3-10 = programmatic zloty hex
 * z numerem rzymskim (placeholder-plus; BadgeRenderer wg crew-ranks doc §7 pozniej).
 * Stany (kolor/szarosc/ciemny hex) nadaje CSS rodzica (.pr-slot--done/--next/--future,
 * .ph-rank-badge, .bt-rankup-badge).
 */
import { RANK_ROMAN, type RankDef } from '../../config/ranks';

export function rankBadgeHtml(rank: RankDef): string {
    if (rank.img) {
        return `<img class="rb-img" src="${import.meta.env.BASE_URL}ranks/${rank.img}" alt="" draggable="false">`;
    }
    return `<span class="rb-hex" aria-hidden="true"><i>${RANK_ROMAN[rank.level - 1]}</i></span>`;
}
