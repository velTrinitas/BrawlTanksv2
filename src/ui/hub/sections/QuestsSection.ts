import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';

/** QuestsSection (ROZKAZY) — HUB-0 stub. Pelna tresc (Rozkazy Dnia/Tygodnia + Generał)
 *  = HUB-3 (bramka: quest metrics / stat counters). */
export class QuestsSection implements HubSection {
    public readonly id = 'quests';
    public readonly icon = '📋';
    label(): string { return t('hub.nav.quests'); }

    render(el: HTMLElement): void {
        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.quests')}</h2>
            <div class="bt-hub0-placeholder">${t('common.soon')}</div>
        `;
    }
}
