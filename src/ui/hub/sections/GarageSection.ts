import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';

/** GarageSection (GARAŻ) — HUB-0 stub. Pelna tresc (karuzela brawlerow, Ranga Zalogi,
 *  2 sloty loadoutu, skiny, Zrzut) = HUB-2 (bramka: PROG-F7 loadout backend). */
export class GarageSection implements HubSection {
    public readonly id = 'garage';
    public readonly icon = '🔧';
    label(): string { return t('hub.nav.garage'); }

    render(el: HTMLElement): void {
        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.garage')}</h2>
            <div class="bt-hub0-placeholder">${t('common.soon')}</div>
        `;
    }
}
