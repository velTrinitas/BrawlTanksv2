/**
 * seasonTankUi.ts — v0.250.0 SEZON v2: wspolne klocki UI CZOLGU SEZONU (galeria, garaz, TRYB GRY,
 * strona SEZON, gratulacje). Jedno zrodlo wygladu = gracz wszedzie rozpoznaje ten sam znak „SEZONOWY".
 */
import { t } from '../../i18n/i18n';
import type { Brawler } from '../../types/Brawler';
import { BRAWLERS } from '../../config/brawlers';
import { getCurrentSeason } from '../../config/season';
import { seasonTankOf } from '../../config/seasonTank';
import { ProgressionService } from '../../services/ProgressionService';

/** `assets/tanks/twardy.jpg` -> `assets/tanks/tanks_200/twardy_200.png` (portret 200 px). */
export function tankPortrait(b: Brawler): string {
    return b.icon.replace(/assets\/tanks\/([\w-]+)\.jpg$/, 'assets/tanks/tanks_200/$1_200.png');
}

export function brawlerById(id: string): Brawler | undefined {
    return BRAWLERS.find(b => b.id === id);
}

/** Czy czolg jest czolgiem sezonu (niezaleznie od blokady). */
export function isSeasonTank(brawlerId: string): boolean {
    return seasonTankOf(brawlerId) !== null;
}

/** Wstazka „SEZONOWY" w kolorze biezacego sezonu (emoji sezonu + napis). */
export function seasonRibbonHtml(extraClass = ''): string {
    const s = getCurrentSeason();
    return `<span class="bt-season-ribbon ${extraClass}" style="--season:${s.accentColor}"><i aria-hidden="true">${s.emoji}</i>${t('hub.seasonTank.ribbon')}</span>`;
}

/** Postep do czolgu sezonu: punkty sezoniakow / prog tieru z nagroda `seasonTank`. */
export function seasonTankProgress(pid: string): { points: number; need: number } {
    const st = ProgressionService.getSeasonTrackState(pid);
    const tier = st?.tiers.find(x => x.tier.reward.seasonTank);
    return { points: st?.points ?? 0, need: tier?.tier.need ?? 0 };
}
