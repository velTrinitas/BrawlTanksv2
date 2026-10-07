import { BRAWLERS } from '../config/brawlers';
import { tankName } from './hub/sections/BattleSection';

/**
 * v0.240.0 (Mariusz 2026-10-07) — PILL CZOLGU w rankingu: czym gracz zdobyl wynik. Nieprzytlaczajacy: tlo i ramka
 * w kolorze TOZSAMOSCI czolgu (`colorMain`) przygaszone, nazwa malym drukiem. Nieznany czolg (stary id, flaga
 * wylaczona) = pusty string — wiersz wyglada jak dotad.
 * `compact` = sama kropka w kolorze + skrocona nazwa (waski mini-ranking w hubie).
 */
export function tankPillHtml(brawlerId: string | null | undefined, compact = false): string {
    if (!brawlerId) return '';
    const b = BRAWLERS.find(x => x.id === brawlerId);
    if (!b) return '';
    const name = tankName(b);
    return `<span class="bt-tank-pill${compact ? ' is-compact' : ''}" style="--tk:${b.colorMain}" title="${name}">`
        + `<i aria-hidden="true"></i>${name}</span>`;
}
