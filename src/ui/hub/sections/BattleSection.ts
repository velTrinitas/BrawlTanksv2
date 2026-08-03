import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { SCENARIO_CONFIGS, type ScenarioId } from '../../../types/Scenario';
import { MENU_MAP_CARDS, type MapId } from '../../../types/MapType';

/**
 * BattleSection (BITWA) — home hubu (HUB-1). Realne dane: SCENARIO_CONFIGS (tryby,
 * locked-state) + MENU_MAP_CARDS (mapy KTB). Baner sezonu STATYCZNY (Season config =
 * pozniejsza faza). GRAJ ustawia wybor scenariusza+mapy i routuje do istniejacego
 * brawlerPicker (reuse drugiej polowy flow → play) — HUB nie dotyka silnika.
 */

const SCENARIO_ORDER: ScenarioId[] = ['ktb', 'ctf', 'castle', 'save_king'];
const SCENARIO_EMOJI: Record<ScenarioId, string> = { ktb: '👑', ctf: '🚩', castle: '🏰', save_king: '🛡️' };
const AVAILABLE_MAPS = MENU_MAP_CARDS.filter(m => m.available);

export class BattleSection implements HubSection {
    public readonly id = 'battle';
    public readonly icon = '⚔️';
    label(): string { return t('hub.nav.battle'); }

    /** Wpiete przez HubShell → MainMenu (ustawia wybor + show('brawlerPicker')). */
    public onPlay: ((scenario: ScenarioId, map: MapId) => void) | null = null;

    private selectedScenario: ScenarioId = 'ktb';
    private selectedMap: MapId = (AVAILABLE_MAPS[0]?.id ?? 'desert') as MapId;
    private el: HTMLElement | null = null;

    render(el: HTMLElement): void {
        this.el = el;
        el.innerHTML = this.html();
        this.wire();
    }

    private html(): string {
        const season = `
            <div class="bt-hub0-season">
                <span class="bt-hub0-season-art" aria-hidden="true">🎖️</span>
                <div class="bt-hub0-season-info">
                    <span class="bt-hub0-season-eyebrow">${t('hub.season.eyebrow')}</span>
                    <h3>${t('hub.season.title')}</h3>
                </div>
            </div>`;

        const modes = SCENARIO_ORDER.map(id => {
            const c = SCENARIO_CONFIGS[id];
            const locked = !c.available;
            const sel = id === this.selectedScenario && !locked;
            return `
                <button class="bt-hub0-mode${sel ? ' is-active' : ''}${locked ? ' is-locked' : ''}"
                        data-scenario="${id}" type="button" ${locked ? 'aria-disabled="true"' : ''}>
                    <span class="em" aria-hidden="true">${SCENARIO_EMOJI[id]}</span>
                    <b>${t(c.nameKey)}</b>
                    ${locked ? `<span class="lock">🔒 ${t(c.comingSoonKey ?? 'common.locked')}</span>` : ''}
                </button>`;
        }).join('');

        let maps = '';
        if (this.selectedScenario === 'ktb') {
            maps = `<div class="bt-hub0-maps">${AVAILABLE_MAPS.map(m => `
                <button class="bt-hub0-mapchip${m.id === this.selectedMap ? ' is-active' : ''}"
                        data-map="${m.id}" type="button" style="--chip:${m.accentColor}">
                    <span aria-hidden="true">${m.emoji}</span>${t(m.nameKey)}
                </button>`).join('')}</div>`;
        } else if (this.selectedScenario === 'ctf') {
            maps = `<div class="bt-hub0-maps"><span class="bt-hub0-mapfixed">🏛️ FORTIFIED RUINS</span></div>`;
        }

        return `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.battle')}</h2>
            ${season}
            <div class="bt-hub0-modes">${modes}</div>
            ${maps}
            <button class="bt-hub0-play" data-action="play" type="button">▶ ${t('hub.play')}</button>
        `;
    }

    private wire(): void {
        const el = this.el;
        if (!el) return;
        el.querySelectorAll<HTMLElement>('[data-scenario]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.scenario as ScenarioId;
                if (!SCENARIO_CONFIGS[id].available) return; // locked — ignoruj
                this.selectedScenario = id;
                this.render(el);
            });
        });
        el.querySelectorAll<HTMLElement>('[data-map]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedMap = btn.dataset.map as MapId;
                this.render(el);
            });
        });
        el.querySelector('[data-action="play"]')?.addEventListener('click', () => {
            const map: MapId = this.selectedScenario === 'ctf' ? 'fortified_ruins' : this.selectedMap;
            this.onPlay?.(this.selectedScenario, map);
        });
    }
}
