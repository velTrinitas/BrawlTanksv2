import type { IScreen } from '../MainMenu';
import { t } from '../../i18n/i18n';
import { ProfileService } from '../../services/ProfileService';
import { ProgressionService } from '../../services/ProgressionService';
import type { ScenarioId } from '../../types/Scenario';
import type { MapId } from '../../types/MapType';
import type { HubSection } from './sections/HubSection';
import { BattleSection } from './sections/BattleSection';
import { GarageSection } from './sections/GarageSection';
import { QuestsSection } from './sections/QuestsSection';
import { TrophyRoadSection } from './sections/TrophyRoadSection';
import { RankSection } from './sections/RankSection';

import './hub-styles.css';

/**
 * HubShell — Menu Hub „COMMAND DECK” (HUB-0, DOM-overlay za flaga ?hub=1).
 *
 * IScreen (wzorzec LeaderboardScreen): buduje wlasny root .bt-hub0-screen, montuje w
 * kontenerze MainMenu (ktory daje warstwe fixed inset:0). Chrome = gorny readout
 * (profil + 2 waluty Trofea/Srubki + ⚙️ + tab S2) + nawigacja (rail desktop / dock
 * mobile — jeden element .bt-hub0-nav, orientacje robi CSS via body.bt-desktop) +
 * content routujacy 5 sekcji. HUB-0: sekcje to stuby; tresc dochodzi w HUB-1+.
 *
 * Nawigacja i akcje przez nullable callbacki (jak inne ekrany) — HubShell nie importuje
 * logiki MainMenu. Match-launch idzie przez onPlay → MainMenu.show('scenarioPicker')
 * (HUB-0 nie buduje wlasnego GRAJ-flow — to HUB-1).
 */

type SectionId = 'battle' | 'garage' | 'quests' | 'trophies' | 'rank';

export class HubShell implements IScreen {
    private rootEl: HTMLElement | null = null;
    private activeSection: SectionId = 'battle';

    private readonly battle = new BattleSection();
    private readonly rank = new RankSection();
    private readonly sections: HubSection[];

    // callbacki wpinane przez MainMenu.createHub0Screen()
    public onOpenSettings: (() => void) | null = null;
    public onOpenProfile: (() => void) | null = null;
    public onOpenLeaderboard: (() => void) | null = null;
    public onPlay: ((scenario: ScenarioId, map: MapId) => void) | null = null;

    constructor() {
        this.battle.onPlay = (scenario, map) => this.onPlay?.(scenario, map);
        this.rank.onOpenLeaderboard = () => this.onOpenLeaderboard?.();
        this.sections = [
            this.battle,
            new GarageSection(),
            new QuestsSection(),
            new TrophyRoadSection(),
            this.rank,
        ];
    }

    mount(root: HTMLElement): void {
        this.rootEl = document.createElement('div');
        this.rootEl.className = 'bt-hub0-screen';
        this.rootEl.innerHTML = this.renderChrome();
        root.appendChild(this.rootEl);
        this.wire();
        this.renderMain();
    }

    unmount(): void {
        this.rootEl?.remove();
        this.rootEl = null;
    }

    // ── render ──────────────────────────────────────────────────────────────
    private renderChrome(): string {
        const nav = this.sections.map(s => `
            <button class="bt-hub0-navbtn${s.id === this.activeSection ? ' is-active' : ''}"
                    data-section="${s.id}" type="button">
                <span class="gi" aria-hidden="true">${s.icon}</span>
                <small>${s.label()}</small>
            </button>`).join('');

        return `
            <div class="bt-hub0-top">${this.renderReadout()}</div>
            <nav class="bt-hub0-nav">${nav}</nav>
            <div class="bt-hub0-main"></div>
        `;
    }

    private renderReadout(): string {
        const profile = ProfileService.getActiveProfile();
        const name = profile?.nickname ?? 'Brawler';
        const initial = name.charAt(0).toUpperCase();
        const pid = profile?.id ?? 'default';
        const trophies = ProgressionService.getTrophies(pid);
        const bolts = ProgressionService.getBolts(pid);

        return `
            <button class="bt-hub0-profile" data-action="profile" type="button">
                <span class="bt-hub0-avatar" aria-hidden="true">${initial}</span>
                <span class="bt-hub0-pname">${name}</span>
            </button>
            <span class="bt-hub0-spacer"></span>
            <span class="bt-hub0-wallet">
                <span class="bt-hub0-coin"><span class="ic" aria-hidden="true">🏆</span>${trophies}</span>
                <span class="bt-hub0-coin"><span class="ic" aria-hidden="true">🔩</span>${bolts}</span>
            </span>
            <button class="bt-hub0-gear" data-action="settings" type="button"
                    aria-label="${t('hub.settings')}">⚙️</button>
            <span class="bt-hub0-s2" aria-hidden="true"><span>S2</span></span>
        `;
    }

    private renderMain(): void {
        const main = this.rootEl?.querySelector('.bt-hub0-main') as HTMLElement | null;
        if (!main) return;
        main.innerHTML = '';
        this.sections.find(s => s.id === this.activeSection)?.render(main);
    }

    // ── input ───────────────────────────────────────────────────────────────
    private wire(): void {
        const r = this.rootEl;
        if (!r) return;
        r.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const navBtn = target.closest<HTMLElement>('[data-section]');
            if (navBtn?.dataset.section) {
                this.setActive(navBtn.dataset.section as SectionId);
                return;
            }
            const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
            if (action === 'settings') this.onOpenSettings?.();
            else if (action === 'profile') this.onOpenProfile?.();
            // 'play' obslugiwane wewnatrz BattleSection (wlasny listener)
        });
    }

    private setActive(id: SectionId): void {
        if (id === this.activeSection) return;
        this.activeSection = id;
        this.rootEl?.querySelectorAll<HTMLElement>('.bt-hub0-navbtn').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.section === id);
        });
        this.renderMain();
    }
}
