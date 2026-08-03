import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';

/** RankSection (RANKING) — HUB-0 stub. Pelna tresc (mini-board reuse LeaderboardScreen +
 *  wiersz „TY”, deep-link do pelnego ekranu) = HUB-6. */
export class RankSection implements HubSection {
    public readonly id = 'rank';
    public readonly icon = '🏅';
    label(): string { return t('hub.nav.rank'); }

    render(el: HTMLElement): void {
        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.rank')}</h2>
            <div class="bt-hub0-placeholder">${t('common.soon')}</div>
        `;
    }
}
