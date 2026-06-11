/**
 * MainHub.ts — main menu hub (FAZA 6c + FAZA 7c).
 *
 * Layout v0.22.0 (FAZA 7c):
 *   ┌─────────────────────────────────────────────┐
 *   │ [👤] 👋 Witaj, Mariusz!            [🇵🇱]    │  ← Profile chip (whole welcome bar tappable)
 *   ├─────────────────────────────────────────────┤
 *   │  🔁 Kontynuuj jako Mariusz na mapie X   →   │  ← Continue card (uses nickname, not brawler)
 *   ├─────────────────────────────────────────────┤
 *   │                                             │
 *   │     ▶️  GRAJ                                │  ← Hero PLAY (unchanged)
 *   │       Nowa rozgrywka                        │
 *   │                                             │
 *   ├─────────────────────────────────────────────┤
 *   │  📖 JAK GRAC  │  ⚙️ USTAWIENIA              │
 *   ├───────────────┼─────────────────────────────┤
 *   │  🏆 LB 🔒     │  🛒 SKLEP 🔒                │
 *   └─────────────────────────────────────────────┘
 *
 * FAZA 7c additions:
 * - activeProfile property (injected by MainMenu before mount)
 * - Welcome bar promoted to PROFILE CHIP — wraps avatar + nickname + flag swatch,
 *   whole bar is tappable (klik → toast "Edycja w Ustawieniach")
 * - welcomeName lookup from profile.nickname (fallback 'Brawler' for backward compat)
 * - Continue card uses profile.nickname instead of session.brawlerName
 *   (identity > vehicle: nickname unique, brawler reusable)
 */

import type { IScreen } from './MainMenu';
import { t } from '../i18n/i18n';
import type { LastSession } from '../services/SessionService';
import type { Profile, FlagId } from '../types/Profile';
import { AVATARS } from '../config/avatars';
import { FLAGS, type FlagConfig } from '../config/flags';
import { showToast } from './toast';

// ============================================================
// MainHub
// ============================================================

export class MainHub implements IScreen {
    private el: HTMLElement | null = null;

    /**
     * Last session (z SessionService) — gdy null, Continue card nie renderuje sie.
     * Ustawiane przez MainMenu przed mount() (constructor injection style).
     */
    lastSession: LastSession | null = null;

    /**
     * FAZA 7c: active profile injected by MainMenu before mount.
     * Drives welcome chip display (avatar + nickname + flag).
     * null = fallback ('Brawler' welcome, no chip visuals) — edge case for tests.
     */
    activeProfile: Profile | null = null;

    /**
     * Imie wyswietlane w welcome bar.
     * FAZA 7c: derived from activeProfile.nickname (set in render() if profile exists).
     */
    welcomeName: string = 'Brawler';

    // === Callbacks ===

    /** Klik Hero PLAY → nowa rozgrywka (full menu flow przez pickery). */
    onPlayClick: (() => void) | null = null;

    /** Klik Continue card → instant replay z lastSession. */
    onContinueClick: ((lastSession: LastSession) => void) | null = null;

    onHowToPlayClick: (() => void) | null = null;
    onSettingsClick:  (() => void) | null = null;

    mount(root: HTMLElement): void {
        // FAZA 7c: derive welcomeName from active profile (or fallback)
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

        // === Welcome bar — FAZA 7c: now a profile chip ===
        const welcomeBar = this.renderProfileChip();

        // === Continue card (conditional) ===
        const continueCard = this.lastSession ? this.renderContinueCard(this.lastSession) : '';

        // === Hero PLAY ===
        const heroPlay = `
            <button class="bt-hub-hero-play" type="button" data-action="play">
                <span class="bt-hub-hero-play-icon" aria-hidden="true">▶</span>
                <span class="bt-hub-hero-play-stack">
                    <span class="bt-hub-hero-play-label">${t('hub.play')}</span>
                    <span class="bt-hub-hero-play-sub">${t(this.lastSession ? 'hub.playSubNew' : 'hub.playSubFirst')}</span>
                </span>
            </button>
        `;

        // === Secondary grid (4 buttons, 2x2 mobile / 4x1 desktop) ===
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
     * FAZA 7c: profile chip is the welcome bar.
     * Layout: [avatar] 👋 Witaj, {nickname}! [flag swatch]
     * Whole chip tappable → toast (FAZA 8 will open Settings/edit profile).
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
        // FAZA 7c: nickname-driven identity (not brawlerName)
        // Fallback for edge case: no active profile (use 'Brawler' generic)
        const nickname = this.activeProfile?.nickname ?? 'Brawler';

        return `
            <button class="bt-hub-continue" type="button" data-action="continue">
                <span class="bt-hub-continue-icon" aria-hidden="true">🔁</span>
                <span class="bt-hub-continue-text">${t('hub.continue', {
                    nickname,
                    map: session.mapName,
                })}</span>
                <span class="bt-hub-continue-arrow" aria-hidden="true">→</span>
            </button>
        `;
    }

    /**
     * Generates CSS linear-gradient matching PIXI FlagRenderer + IdentityScreen flag swatches.
     * Same math as IdentityScreen.computeFlagGradient (shared visual language).
     */
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
                    // FAZA 7c: profile chip click — toast informing FAZA 8 will add edit screen
                    showToast(t('hub.editProfile'), 2200);
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