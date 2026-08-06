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
import { StatsOverlay } from './overlays/StatsOverlay';
import { CrateOverlay } from './overlays/CrateOverlay';
import { getCosmetic, nickColorStyle, frameStyle } from '../../config/cosmetics'; // F2a

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
    /** PROG-F2b — odsubskrybowanie nasluchu "chmura domergowala progresje". */
    private unsubscribeSync: (() => void) | null = null;

    private readonly battle = new BattleSection();
    private readonly garage = new GarageSection();
    private readonly quests = new QuestsSection();
    private readonly rank = new RankSection();
    private readonly stats = new StatsOverlay();
    private readonly crate = new CrateOverlay();
    private readonly sections: HubSection[];

    // callbacki wpinane przez MainMenu.createHub0Screen()
    public onOpenSettings: (() => void) | null = null;
    public onOpenLeaderboard: (() => void) | null = null;
    public onPlay: ((scenario: ScenarioId, map: MapId) => void) | null = null;

    constructor() {
        this.battle.onPlay = (scenario, map) => this.onPlay?.(scenario, map);
        this.rank.onOpenLeaderboard = () => this.onOpenLeaderboard?.();
        // F2a — GARAŻ: OTWÓRZ skrzynkę => CrateOverlay; po zamknięciu re-render GARAŻU
        this.garage.onOpenCrate = () => {
            if (this.rootEl) this.crate.open(this.rootEl, this.pid(), () => this.renderMain());
        };
        this.garage.onCosmeticChanged = () => this.refreshReadout();
        // PROG-F3 — nagroda za rozkaz zmienia srubki (readout) i moze dosypac skrzynke (GARAŻ).
        this.quests.onRewardClaimed = () => this.refreshReadout();
        this.sections = [
            this.battle,
            this.garage,
            this.quests,
            new TrophyRoadSection(),
            this.rank,
        ];
    }

    private pid(): string {
        return ProfileService.getActiveProfile()?.id ?? 'default';
    }

    /** F2a — odswiez tylko gorny readout (po equip kosmetyku). */
    private refreshReadout(): void {
        const top = this.rootEl?.querySelector('.bt-hub0-top') as HTMLElement | null;
        if (top) top.innerHTML = this.renderReadout();
    }

    mount(root: HTMLElement): void {
        // PROG-F2b — syncPull startuje na boocie fire-and-forget (main.ts), wiec hub potrafi
        // wyrenderowac sie zanim chmura wroci. Po domergowaniu odswiez readout + aktywna sekcje
        // (inaczej gracz po zmianie urzadzenia widzi stara kolekcje az do restartu).
        this.unsubscribeSync?.();
        this.unsubscribeSync = ProgressionService.subscribeSync(() => {
            if (!this.rootEl) return;
            this.refreshReadout();
            this.renderMain();
        });

        this.rootEl = document.createElement('div');
        this.rootEl.className = 'bt-hub0-screen';
        this.rootEl.innerHTML = this.renderChrome();
        root.appendChild(this.rootEl);
        this.wire();
        this.renderMain();
    }

    unmount(): void {
        this.unsubscribeSync?.();
        this.unsubscribeSync = null;
        this.stats.close();
        this.crate.close();
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

        // F2a — equipped kosmetyki (kolor nicku / ramka avatara / tytul)
        const cos = ProgressionService.getCosmeticState(pid);
        const nickDef = cos.equipped.nickColor ? getCosmetic(cos.equipped.nickColor) : undefined;
        const frameDef = cos.equipped.frame ? getCosmetic(cos.equipped.frame) : undefined;
        const titleDef = cos.equipped.title ? getCosmetic(cos.equipped.title) : undefined;
        const nickStyle = nickColorStyle(nickDef);
        const shimmer = nickDef?.animated ? ' bt-cos-shimmer' : '';
        const titleHtml = titleDef ? `<span class="bt-hub0-ptitle">${t(titleDef.labelKey)}</span>` : '';

        return `
            <button class="bt-hub0-profile" data-action="profile" type="button">
                <span class="bt-hub0-avatar" aria-hidden="true" style="${frameStyle(frameDef)}">${initial}</span>
                <span class="bt-hub0-pnamewrap">
                    <span class="bt-hub0-pname${shimmer}" style="${nickStyle}">${name}</span>
                    ${titleHtml}
                </span>
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
            else if (action === 'profile' && this.rootEl) this.stats.open(this.rootEl); // HUB-5 stats overlay
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
