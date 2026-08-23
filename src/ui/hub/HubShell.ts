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
import { ProfileSection } from './sections/ProfileSection'; // PROFILE-1 (zastapil StatsOverlay)
import { CrateOverlay } from './overlays/CrateOverlay';
import { getCosmetic, nickColorStyle, frameStyle } from '../../config/cosmetics'; // F2a
import { AVATARS } from '../../config/avatars'; // PROFILE-1 — miniatura w chipie
import { seasonDaysLeft, seasonShortLabel } from '../../config/season'; // SEASON-1/2 — pill sezonu
import { SeasonOverlay } from './overlays/SeasonOverlay'; // SEASON-2 — popup sezonu
import { RankUpOverlay } from './overlays/RankUpOverlay'; // RANKS-1 — celebracja awansu
import type { DifficultyId } from '../../types/GameConfig'; // HUB-1.5

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

type SectionId = 'battle' | 'garage' | 'quests' | 'trophies' | 'rank' | 'profile';

export class HubShell implements IScreen {
    private rootEl: HTMLElement | null = null;
    private activeSection: SectionId = 'battle';
    /** PROG-F2b — odsubskrybowanie nasluchu "chmura domergowala progresje". */
    private unsubscribeSync: (() => void) | null = null;

    private readonly battle = new BattleSection();
    private readonly garage = new GarageSection();
    private readonly quests = new QuestsSection();
    private readonly rank = new RankSection();
    /** PROFILE-1 — strona profilu (ukryta sekcja poza nav, wejscie przez chip). */
    private readonly profile = new ProfileSection();
    private readonly crate = new CrateOverlay();
    /** SEASON-2 — popup sezonu (pill na belce). */
    private readonly season = new SeasonOverlay();
    /** RANKS-1 — spektakularna celebracja awansu rangi. */
    private readonly rankUp = new RankUpOverlay();
    private readonly sections: HubSection[];
    /** Sekcja, z ktorej otwarto profil — ← wraca dokladnie tam. */
    private prevSection: SectionId = 'battle';

    // callbacki wpinane przez MainMenu.createHub0Screen()
    public onOpenSettings: (() => void) | null = null;
    public onOpenLeaderboard: (() => void) | null = null;
    /** HUB-1.5: pelny wybor z BITWY — MainMenu buduje GameConfig i startuje mecz od razu. */
    public onPlay: ((scenario: ScenarioId, map: MapId, brawlerId: string, difficulty: DifficultyId) => void) | null = null;

    constructor() {
        // HUB-1.5b: wybor czolgu zyje INLINE w BattleSection (grid 8 kart) —
        // hub tylko przekazuje pelny wybor do MainMenu (bezposredni start meczu).
        this.battle.onPlay = (scenario, map, brawlerId, difficulty) =>
            this.onPlay?.(scenario, map, brawlerId, difficulty);
        this.rank.onOpenLeaderboard = () => this.onOpenLeaderboard?.();
        // F2a — GARAŻ: OTWÓRZ skrzynkę => CrateOverlay; po zamknięciu re-render GARAŻU
        this.garage.onOpenCrate = () => {
            if (this.rootEl) this.crate.open(this.rootEl, this.pid(), () => this.renderMain());
        };
        // PROFILE-1 — powrot ze strony profilu + refresh readoutu po zmianach
        // (awatar/nick/kosmetyk zmieniaja chip na zywo).
        this.profile.onBack = () => this.setActive(this.prevSection);
        this.profile.onProfileChanged = () => this.refreshReadout();
        // SEASON-2 — CTA popupu prowadzi do Season Tracku w TROFEA.
        this.season.onViewTrack = () => this.openSeasonTrack();
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
            this.maybeCelebrateRank(); // RANKS-1 — awans domergowany z chmury
        });

        this.rootEl = document.createElement('div');
        this.rootEl.className = 'bt-hub0-screen';
        this.rootEl.innerHTML = this.renderChrome();
        root.appendChild(this.rootEl);
        this.wire();
        this.renderMain();
        this.maybeCelebrateRank(); // RANKS-1 — awans z ostatniego meczu (powrot do huba)
    }

    /**
     * RANKS-1 fix: powrot z meczu NIE remountuje huba (MainMenu.show ma guard
     * "juz na hubie" — hub zyje schowany przez caly mecz), wiec mount-trigger
     * celebracji nie odpalal. MainMenu.showHub wola ten hook przy re-show:
     * odswieza readout (trofea/sigmy z meczu) + sekcje + sprawdza awans.
     */
    onReshown(): void {
        if (!this.rootEl) return;
        this.refreshReadout();
        this.renderMain();
        this.maybeCelebrateRank();
    }

    /**
     * RANKS-1: odpal celebracje awansu, gdy ranga czeka na pokazanie
     * (rankShown < poziom). Po zamknieciu stemplujemy rankShown (takze sync),
     * a readout/sekcja odswieza sie z nowa ranga i naliczonymi nagrodami.
     */
    private maybeCelebrateRank(): void {
        if (!this.rootEl || this.rankUp.isOpen) return;
        const pid = this.pid();
        const pending = ProgressionService.getRankState(pid).pendingCelebration;
        if (!pending) return;
        this.rankUp.open(this.rootEl, pending, () => {
            ProgressionService.markRankShown(pid, pending.level);
            this.refreshReadout();
            this.renderMain();
        });
    }

    unmount(): void {
        this.unsubscribeSync?.();
        this.unsubscribeSync = null;
        this.crate.close();
        this.season.close();
        this.rankUp.close();
        this.rootEl?.remove();
        this.rootEl = null;
    }

    // ── render ──────────────────────────────────────────────────────────────
    private renderChrome(): string {
        // v0.108.0 — BITWA dostaje modyfikator: na mobile dock centruje ja jako
        // wyniesiony zloty FAB (feedback Mariusza: glowna akcja byla nieodroznialna).
        const nav = this.sections.map(s => `
            <button class="bt-hub0-navbtn${s.id === 'battle' ? ' bt-hub0-navbtn--battle' : ''}${s.id === this.activeSection ? ' is-active' : ''}"
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
        const pid = profile?.id ?? 'default';
        const trophies = ProgressionService.getTrophies(pid);
        const bolts = ProgressionService.getBolts(pid);

        // F2a — equipped kosmetyki (kolor nicku / ramka avatara). PROFILE-1: tytul
        // WYCIETY z chipa (kolidowal z planowanymi Rangami Zalog), chip pokazuje
        // MINIATURE awatara (PNG) zamiast litery — tap otwiera strone profilu.
        const cos = ProgressionService.getCosmeticState(pid);
        const nickDef = cos.equipped.nickColor ? getCosmetic(cos.equipped.nickColor) : undefined;
        const frameDef = cos.equipped.frame ? getCosmetic(cos.equipped.frame) : undefined;
        const nickStyle = nickColorStyle(nickDef);
        const shimmer = nickDef?.animated ? ' bt-cos-shimmer' : '';
        const avatarInner = profile
            ? `<img src="${import.meta.env.BASE_URL}${AVATARS[profile.avatarId].assetPath}" alt="" draggable="false">`
            : name.charAt(0).toUpperCase();

        return `
            <button class="bt-hub0-profile" data-action="profile" type="button">
                <span class="bt-hub0-avatar" aria-hidden="true" style="${frameStyle(frameDef)}">${avatarInner}</span>
                <span class="bt-hub0-pname${shimmer}" style="${nickStyle}">${name}</span>
            </button>
            <span class="bt-hub0-spacer"></span>
            <span class="bt-hub0-wallet">
                <button class="bt-hub0-coin bt-hub0-coin--btn" data-action="trophies" type="button"
                        aria-label="${t('hub.nav.trophies')}"><span class="ic" aria-hidden="true">🏆</span>${trophies}</button>
                <span class="bt-hub0-coin"><img class="bt-sigma" src="${import.meta.env.BASE_URL}assets/sigma.png" alt="">${bolts}</span>
            </span>
            <button class="bt-hub0-gear" data-action="settings" type="button"
                    aria-label="${t('hub.settings')}">⚙️</button>
            <button class="bt-hub0-s2" data-action="season" type="button"
                    aria-label="${t('hub.season.eyebrow')}"><span>${seasonShortLabel()}</span>${seasonDaysLeft() > 0 ? `<small>⏳${seasonDaysLeft()}d</small>` : ''}</button>
        `;
    }

    private renderMain(): void {
        const main = this.rootEl?.querySelector('.bt-hub0-main') as HTMLElement | null;
        if (!main) return;
        main.innerHTML = '';
        // PROFILE-1 — profil to ukryta sekcja poza nav (wejscie przez chip w readoucie).
        if (this.activeSection === 'profile') {
            this.profile.render(main);
            return;
        }
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
            else if (action === 'profile') this.openProfile(); // PROFILE-1 — strona profilu
            else if (action === 'trophies') this.setActive('trophies'); // PROFILE-1 — pill 🏆
            // SEASON-2 — pill sezonu otwiera POPUP (CTA popupu prowadzi do tracku)
            else if (action === 'season' && this.rootEl) this.season.open(this.rootEl);
            // 'play' obslugiwane wewnatrz BattleSection (wlasny listener)
        });
    }

    /**
     * SEASON-1 — badge S2: sekcja TROFEA + scroll do Season Tracku (wszystko
     * o sezonie zyje w TROFEA — badge przestaje byc dekoracja-zagadka).
     */
    private openSeasonTrack(): void {
        this.setActive('trophies');
        const main = this.rootEl?.querySelector('.bt-hub0-main');
        main?.querySelector('[data-season-track]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /** PROFILE-1 — otworz strone profilu (chip); ← wraca do zapamietanej sekcji. */
    private openProfile(): void {
        if (this.activeSection === 'profile') return;
        this.prevSection = this.activeSection;
        this.activeSection = 'profile';
        // Zdejmij podswietlenie nav (profil nie jest przypisany do zadnego przycisku).
        this.rootEl?.querySelectorAll<HTMLElement>('.bt-hub0-navbtn').forEach(btn => {
            btn.classList.remove('is-active');
        });
        this.renderMain();
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
