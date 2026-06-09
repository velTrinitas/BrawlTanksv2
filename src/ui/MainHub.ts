/**
 * MainHub.ts — main menu hub (FAZA 6c).
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │  👋 Witaj, Brawler!         [Zmien] │  ← Welcome bar
 *   ├─────────────────────────────────────┤
 *   │  🔁 Kontynuuj jako X na mapie Y  →  │  ← Continue card (conditional)
 *   ├─────────────────────────────────────┤
 *   │                                     │
 *   │     ▶️  GRAJ                         │  ← Hero PLAY (gold gradient)
 *   │       Nowa rozgrywka                 │
 *   │                                     │
 *   ├─────────────────────────────────────┤
 *   │  📖 JAK GRAC  │  ⚙️ USTAWIENIA      │  ← Secondary (2x1)
 *   ├───────────────┼─────────────────────┤
 *   │  🏆 LB 🔒     │  🛒 SKLEP 🔒        │  ← Soon slots (2x1)
 *   └─────────────────────────────────────┘
 *
 * Architectural notes:
 * - "Witaj, Brawler" hardcoded w FAZIE 6c — FAZA 7 podmieni na profile.name
 * - Continue card pojawia sie tylko gdy sessionService.hasValidLastSession()
 * - Brak Continue = Hero PLAY wypelnia wiecej miejsca (CSS flex adapts)
 * - Soon slots klikalne ale pokazuja toast "Wkrotce" (FAZA 7-8 podlaczy)
 */

import type { IScreen } from './MainMenu';
import { t } from '../i18n/i18n';
import type { LastSession } from '../services/SessionService';
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

    /** Imie wyswietlane w welcome bar. FAZA 7: profile.name. */
    welcomeName: string = 'Brawler';

    // === Callbacks ===

    /** Klik Hero PLAY → nowa rozgrywka (full menu flow przez pickery). */
    onPlayClick: (() => void) | null = null;

    /** Klik Continue card → instant replay z lastSession. */
    onContinueClick: ((lastSession: LastSession) => void) | null = null;

    onHowToPlayClick: (() => void) | null = null;
    onSettingsClick:  (() => void) | null = null;

    mount(root: HTMLElement): void {
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

        // === Welcome bar ===
        const welcomeBar = `
            <div class="bt-hub-welcome">
                <div class="bt-hub-welcome-text">
                    <span class="wave" aria-hidden="true">👋</span>
                    <span>${t('hub.welcome', { name: this.welcomeName })}</span>
                </div>
            </div>
        `;

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

    private renderContinueCard(session: LastSession): string {
        return `
            <button class="bt-hub-continue" type="button" data-action="continue">
                <span class="bt-hub-continue-icon" aria-hidden="true">🔁</span>
                <span class="bt-hub-continue-text">${t('hub.continue', {
                    brawler: session.brawlerName,
                    map: session.mapName,
                })}</span>
                <span class="bt-hub-continue-arrow" aria-hidden="true">→</span>
            </button>
        `;
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
                case 'leaderboard':
                case 'shop':
                    // Soon slots — show toast
                    showToast(t('settings.comingSoon'), 2200);
                    break;
            }
        });
    }
}