import type { IScreen } from './MainMenu';
import { AudioSys } from '../audio/AudioSys';
import { t } from '../i18n/i18n';

/**
 * HowToPlayScreen — ekran "JAK GRAC" w menu (3. warstwa onboardingu: stala sciaga do wgladu).
 *
 * Warstwy onboardingu: (1) interaktywny samouczek raz, (2) dymki just-in-time w meczu,
 * (3) TA sciaga — konsultowana kiedy chcesz. Sekcje: STEROWANIE + PRZEDMIOTY + CELE TRYBOW,
 * plus przycisk POWTORZ SAMOUCZEK (odpala istniejacy onHowToPlayRequested = replay).
 *
 * Re-uzywa klas bt-settings-* (shell + scroll + sekcje) i bt-cta-button (per recon). Teksty celow
 * (goal.ktb/goal.ctf) wspoldzielone z karta celu in-game (GoalCard) — jedno zrodlo prawdy.
 * i18n: t() literalne.
 */
export class HowToPlayScreen implements IScreen {
    private rootEl: HTMLElement | null = null;
    onBack: (() => void) | null = null;
    onReplayTutorial: (() => void) | null = null;

    mount(root: HTMLElement): void {
        this.rootEl = document.createElement('div');
        // Re-uzywa shella bt-settings-screen (scroll+padding); modyfikator bt-howto-screen scopuje
        // wlasne tlo (MainHub) + lzejsza czcionke naglowkow — bez dotykania ekranu Ustawien.
        this.rootEl.className = 'bt-settings-screen bt-howto-screen';
        root.appendChild(this.rootEl);

        this.rootEl.innerHTML = `
            <header class="bt-settings-header">
                <button class="bt-settings-back" type="button" aria-label="${t('common.back')}">
                    <span class="bt-settings-back-arrow" aria-hidden="true">←</span>
                    <span class="bt-settings-back-label">${t('common.back')}</span>
                </button>
                <h2 class="bt-settings-title">${t('howto.title')}</h2>
                <button class="bt-howto-replay" type="button" data-action="replay">🔁 ${t('howto.replay')}</button>
            </header>
            <div class="bt-settings-content">
                <section class="bt-settings-section">
                    <h3 class="bt-settings-section-title"><span class="bt-settings-icon" aria-hidden="true">🕹️</span>${t('howto.controls')}</h3>
                    <div class="bt-howto-row"><span class="bt-howto-key">${t('howto.move')}</span><span class="bt-howto-val">${t('howto.moveVal')}</span></div>
                    <div class="bt-howto-row"><span class="bt-howto-key">${t('howto.shoot')}</span><span class="bt-howto-val">${t('howto.shootVal')}</span></div>
                    <div class="bt-howto-row"><span class="bt-howto-key">${t('howto.super')}</span><span class="bt-howto-val">${t('howto.superVal')}</span></div>
                    <div class="bt-howto-row"><span class="bt-howto-key">${t('howto.power')}</span><span class="bt-howto-val">${t('howto.powerVal')}</span></div>
                </section>

                <section class="bt-settings-section">
                    <h3 class="bt-settings-section-title"><span class="bt-settings-icon" aria-hidden="true">🎁</span>${t('howto.items')}</h3>
                    <div class="bt-howto-item">${t('howto.heart')}</div>
                    <div class="bt-howto-item">${t('howto.magnet')}</div>
                    <div class="bt-howto-item">${t('howto.cube')}</div>
                    <div class="bt-howto-item">${t('howto.medipad')}</div><!-- red cross emoji in i18n -->
                    <div class="bt-howto-item">${t('howto.powerpad')}</div>
                </section>

                <section class="bt-settings-section">
                    <h3 class="bt-settings-section-title"><span class="bt-settings-icon" aria-hidden="true">🎯</span>${t('howto.goals')}</h3>
                    <div class="bt-howto-item">🎯 <b>KTB</b> — ${t('goal.ktb')}</div>
                    <div class="bt-howto-item">🚩 <b>CTF</b> — ${t('goal.ctf')}</div>
                </section>
            </div>
        `;

        this.rootEl.querySelector('.bt-settings-back')?.addEventListener('click', () => {
            AudioSys.getInstance().playMenuClick();
            this.onBack?.();
        });
        this.rootEl.querySelector('[data-action="replay"]')?.addEventListener('click', () => {
            AudioSys.getInstance().playMenuClick();
            this.onReplayTutorial?.();
        });
    }

    unmount(): void {
        this.rootEl?.remove();
        this.rootEl = null;
    }
}
