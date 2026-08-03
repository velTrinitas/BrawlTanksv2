import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';

/**
 * BattleSection (BITWA) — home hubu. HUB-0: stub z dzialajacym GRAJ (routuje do
 * scenarioPicker, zeby hub nie byl slepy zaulkiem). Pelna tresc (baner sezonu,
 * tryby, chipy map, toggle Szalone Moce) = HUB-1.
 */
export class BattleSection implements HubSection {
    public readonly id = 'battle';
    public readonly icon = '⚔️';
    label(): string { return t('hub.nav.battle'); }

    /** Wpiete przez HubShell → MainMenu.show('scenarioPicker'). */
    public onPlay: (() => void) | null = null;

    render(el: HTMLElement): void {
        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.battle')}</h2>
            <div class="bt-hub0-placeholder">${t('common.soon')}</div>
            <button class="bt-hub0-play" data-action="play" type="button">▶ ${t('hub.play')}</button>
        `;
        el.querySelector('[data-action="play"]')?.addEventListener('click', () => this.onPlay?.());
    }
}
