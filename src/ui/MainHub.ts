/**
 * MainHub.ts — main menu hub (FAZA 6c + FAZA 7c + v0.24.0 i18n fix + v0.43.0 FAZA 8b profile edit).
 *
 * Layout v0.22.0 (FAZA 7c):
 *   ┌─────────────────────────────────────────────┐
 *   │ [👤] 👋 Witaj, Mariusz!            [🇵🇱]    │  ← Profile chip (tappable → ProfileEditScreen)
 *   ├─────────────────────────────────────────────┤
 *   │  🔁 Kontynuuj jako Mariusz na mapie X   →   │  ← Continue card
 *   ├─────────────────────────────────────────────┤
 *   │                                             │
 *   │     ▶️  GRAJ                                │  ← Hero PLAY
 *   │       Nowa rozgrywka                        │
 *   │                                             │
 *   ├─────────────────────────────────────────────┤
 *   │  📖 JAK GRAC  │  ⚙️ USTAWIENIA              │
 *   ├───────────────┼─────────────────────────────┤
 *   │  🏆 LB 🔒     │  🛒 SKLEP 🔒                │
 *   └─────────────────────────────────────────────┘
 *
 * v0.24.0 FAZA 8a fix:
 * - Continue card map name uses i18n lookup zamiast hardcoded session.mapName
 *
 * v0.43.0 FAZA 8b (Profile management):
 * - Profile chip click przestał pokazywać toast "Edytuj w Ustawieniach"
 * - Klik chip → wywołuje onProfileEditClick callback (MainMenu rozsądza do show('profileEdit'))
 * - 1-tap UX zamiast 2-tap (Settings → Edytuj profil)
 */

import type { IScreen } from './MainMenu';
import { t } from '../i18n/i18n';
import type { LastSession } from '../services/SessionService';
import type { Profile } from '../types/Profile';
import { AVATARS } from '../config/avatars';
import { FLAGS, type FlagConfig } from '../config/flags';
import { showToast } from './toast';
import { MENU_MAP_CARDS } from '../types/MapType';

// ============================================================
// MainHub
// ============================================================

export class MainHub implements IScreen {
    private el: HTMLElement | null = null;

    lastSession: LastSession | null = null;
    activeProfile: Profile | null = null;
    welcomeName: string = 'Brawler';

    // === Callbacks ===

    onPlayClick: (() => void) | null = null;
    onContinueClick: ((lastSession: LastSession) => void) | null = null;
    onHowToPlayClick: (() => void) | null = null;
    onSettingsClick: (() => void) | null = null;

    /**
     * v0.43.0 FAZA 8b: klik profile chip (avatar/nickname/flag bar).
     * MainMenu routuje do show('profileEdit').
     */
    onProfileEditClick: (() => void) | null = null;

    mount(root: HTMLElement): void {
        if (this.activeProfile) {
            this.welcomeName = this.activeProfile.nickname;
        }

        this.el = this.render();
        root.appendChild(this.el);
        this.wireEvents();
    }

    unmount(): void {
        this.el?.remove();
        this.el = null;
    }

    // === Internal ===

    private render(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'bt-hub-screen';

        const welcomeBar = this.renderProfileChip();
        const continueCard = this.lastSession ? this.renderContinueCard(this.lastSession) : '';

        const heroPlay = `
            <button class="bt-hub-hero-play" type="button" data-action="play">
                <span class="bt-hub-hero-play-icon" aria-hidden="true">▶</span>
                <span class="bt-hub-hero-play-stack">
                    <span class="bt-hub-hero-play-label">${t('hub.play')}</span>
                    <span class="bt-hub-hero-play-sub">${t(this.lastSession ? 'hub.playSubNew' : 'hub.playSubFirst')}</span>
                </span>
            </button>
        `;

        const secondaryGrid = `
            <div class="bt-hub-secondary-grid">
                <button class="bt-hub-secondary-btn" type="button" data-action="howToPlay">
                    <span class="icon" aria-hidden="true">📖</span>
                    <span class="label">${t('hub.howToPlay')}</span>
                </button>
                <button class="bt-hub-secondary-btn" type="button" data-action="settings">
                    <span class="icon" aria-hidden="true">⚙️</span>
                    <span class="label">${t('hub.settings')}</span>
                </button>
                <button class="bt-hub-secondary-btn is-soon" type="button" data-action="leaderboard" aria-disabled="true">
                    <span class="icon" aria-hidden="true">🏆</span>
                    <span class="label">${t('hub.leaderboard')}</span>
                    <span class="soon-badge">${t('common.soon')}</span>
                </button>
                <button class="bt-hub-secondary-btn is-soon" type="button" data-action="shop" aria-disabled="true">
                    <span class="icon" aria-hidden="true">🛒</span>
                    <span class="label">${t('hub.shop')}</span>
                    <span class="soon-badge">${t('common.soon')}</span>
                </button>
            </div>
        `;

        root.innerHTML = `
            <div class="bt-hub-bg" aria-hidden="true"></div>
            <div class="bt-hub-overlay" aria-hidden="true"></div>
            ${welcomeBar}
            ${continueCard}
            ${heroPlay}
            ${secondaryGrid}
        `;

        return root;
    }

    /**
     * FAZA 7c + v0.43.0 FAZA 8b: profile chip = welcome bar.
     * Layout: [avatar] 👋 Witaj, {nickname}! [flag swatch]
     * v0.43.0: klik chip → onProfileEditClick (otwiera ProfileEditScreen).
     */
    private renderProfileChip(): string {
        // Edge case: no profile loaded yet (unlikely after FAZA 7b onboarding, but defensive)
        if (!this.activeProfile) {
            return `
                <div class="bt-hub-welcome bt-hub-welcome--no-profile">
                    <div class="bt-hub-welcome-text">
                        <span class="wave" aria-hidden="true">👋</span>
                        <span>${t('hub.welcome', { name: 'Brawler' })}</span>
                    </div>
                </div>
            `;
        }

        const profile = this.activeProfile;
        const avatarConfig = AVATARS[profile.avatarId];
        const flagConfig = FLAGS[profile.flagId];

        const baseUrl = this.getBaseUrl();
        const avatarUrl = `${baseUrl}${avatarConfig.assetPath}`;
        const flagGradient = this.computeFlagGradient(flagConfig);

        return `
            <button class="bt-hub-welcome bt-hub-welcome--chip" type="button" data-action="profile"
                    aria-label="${t('hub.editProfile')}">
                <div class="bt-hub-chip-avatar">
                    <img class="bt-hub-chip-avatar-img" src="${avatarUrl}"
                         alt="" loading="eager" draggable="false">
                </div>
                <div class="bt-hub-welcome-text">
                    <span class="wave" aria-hidden="true">👋</span>
                    <span>${t('hub.welcome', { name: profile.nickname })}</span>
                </div>
                <div class="bt-hub-chip-flag" style="background: ${flagGradient};"
                     aria-hidden="true"></div>
            </button>
        `;
    }

    private renderContinueCard(session: LastSession): string {
        const nickname = this.activeProfile?.nickname ?? 'Brawler';
        const mapName = this.resolveMapName(session.map);

        return `
            <button class="bt-hub-continue" type="button" data-action="continue">
                <span class="bt-hub-continue-icon" aria-hidden="true">🔁</span>
                <span class="bt-hub-continue-text">${t('hub.continue', {
                    nickname,
                    map: mapName,
                })}</span>
                <span class="bt-hub-continue-arrow" aria-hidden="true">→</span>
            </button>
        `;
    }

    private resolveMapName(mapId: string): string {
        const card = MENU_MAP_CARDS.find(c => c.id === mapId);
        if (card) {
            return t(card.nameKey);
        }
        return this.lastSession?.mapName ?? mapId.toUpperCase();
    }

    private computeFlagGradient(config: FlagConfig): string {
        const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
        const p = hex(config.colors.primary);
        const s = hex(config.colors.secondary);
        const tert = hex(config.colors.tertiary ?? config.colors.primary);

        switch (config.pattern) {
            case 'horizontal_2':
                return `linear-gradient(to bottom, ${p} 0%, ${p} 50%, ${s} 50%, ${s} 100%)`;
            case 'horizontal_3':
                return `linear-gradient(to bottom, ${p} 0%, ${p} 33.33%, ${s} 33.33%, ${s} 66.67%, ${tert} 66.67%, ${tert} 100%)`;
            case 'vertical_3':
                return `linear-gradient(to right, ${p} 0%, ${p} 33.33%, ${s} 33.33%, ${s} 66.67%, ${tert} 66.67%, ${tert} 100%)`;
        }
    }

    private getBaseUrl(): string {
        const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
        return env?.BASE_URL ?? '/';
    }

    private wireEvents(): void {
        if (!this.el) return;

        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const btn = target.closest<HTMLElement>('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            switch (action) {
                case 'play':
                    this.onPlayClick?.();
                    break;
                case 'continue':
                    if (this.lastSession) {
                        this.onContinueClick?.(this.lastSession);
                    }
                    break;
                case 'howToPlay':
                    this.onHowToPlayClick?.();
                    break;
                case 'settings':
                    this.onSettingsClick?.();
                    break;
                case 'profile':
                    // v0.43.0 FAZA 8b: zmiana z toast na otwarcie ProfileEditScreen
                    this.onProfileEditClick?.();
                    break;
                case 'leaderboard':
                case 'shop':
                    // Soon slots — show toast
                    showToast(t('settings.comingSoon'), 2200);
                    break;
            }
        });
    }
}