import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';

/** TrophyRoadSection (TROFEA) — HUB-0 stub. Pelna tresc (Szlak Trofeow akty D1/D7/D30 +
 *  Season track, zasilone shipped PROG-F1) = HUB-4. */
export class TrophyRoadSection implements HubSection {
    public readonly id = 'trophies';
    public readonly icon = '🏆';
    label(): string { return t('hub.nav.trophies'); }

    render(el: HTMLElement): void {
        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.trophies')}</h2>
            <div class="bt-hub0-placeholder">${t('common.soon')}</div>
        `;
    }
}
