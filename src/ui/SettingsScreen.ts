/**
 * SettingsScreen.ts — FAZA 8a (v0.24.0, finalized v0.42.0).
 *
 * 2 sekcje:
 *  - Audio: Music volume + SFX volume sliders (decyzja B1: linear 0-100%, C1: no separate mute button)
 *  - Język: PL / EN toggle buttons (decyzja D1: stay-in-place re-render, E2: per-profile persistence)
 *
 * Subscribuje do i18n.onLanguageChange dla live UI reload — po klik EN cala
 * Settings screen re-renderuje sie w nowym jezyku bez utraty kontekstu (D1).
 *
 * Audio settings persistowane per-device w localStorage (E2 — environment preference).
 * Language persistowany per-profile w Profile.language (user identity).
 *
 * v0.42.0 FAZA 8a finalize:
 * - Back button: dodany visible label "COFNIJ" obok strzałki (UX 9-12: tylko ikon byl
 *   zbyt minimalistic dla młodszych graczy)
 * - Flag swatch: SVG inline zamiast emoji 🇵🇱/🇬🇧 (Windows-Chrome regional indicator
 *   fallback renderował emoji jako "PL"/"GB" tekst, brak visual flag consistency)
 */

import type { IScreen } from './MainMenu';
import { AudioSys } from '../audio/AudioSys';
import { i18n, t, type Language } from '../i18n/i18n';
import { ProfileService } from '../services/ProfileService';

/**
 * Inline SVG flagi dla language toggle.
 * Cross-platform consistent (nie polega na emoji font support).
 * PL: 2-stripe horizontal (biały/czerwony — barwy państwowe RP).
 * GB: Union Jack uproszczony do 3-warstwowego layered crosses.
 *
 * Nie reuse FLAGS config z ../config/flags bo:
 *  1. Tam Profile.FlagId = 'pl'|'fr'|'it'|'de' — nie ma 'gb'
 *  2. Profile flag = player identity (np. Mariusz reprezentuje IT)
 *  3. Language flag = UI lang (PL/EN są jedynym mapping na flag — różne domeny)
 */
const FLAG_SVG_PL = `<svg viewBox="0 0 8 5" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <rect width="8" height="2.5" fill="#ffffff"/>
    <rect y="2.5" width="8" height="2.5" fill="#dc143c"/>
</svg>`;

const FLAG_SVG_GB = `<svg viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <rect width="60" height="30" fill="#012169"/>
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" stroke-width="6"/>
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="2.5" clip-path="polygon(0 0, 50% 50%, 100% 0, 100% 50%, 50% 50%, 100% 100%, 50% 50%, 0 100%, 0 50%, 50% 50%)"/>
    <rect x="25" width="10" height="30" fill="#ffffff"/>
    <rect y="10" width="60" height="10" fill="#ffffff"/>
    <rect x="27" width="6" height="30" fill="#C8102E"/>
    <rect y="12" width="60" height="6" fill="#C8102E"/>
</svg>`;

export class SettingsScreen implements IScreen {
    private rootEl: HTMLElement | null = null;
    private langUnsub: (() => void) | null = null;

    /** Wstrzykiwane przez MainMenu — clicked "Powrót" CTA. */
    onBack: (() => void) | null = null;

    mount(root: HTMLElement): void {
        this.rootEl = document.createElement('div');
        this.rootEl.className = 'bt-settings-screen';
        root.appendChild(this.rootEl);

        this.renderContent();

        // D1: subscribe do language changes — kazda zmiana powoduje re-render Settings
        // (po klik EN cala screen przelacza sie na angielski natychmiast)
        this.langUnsub = i18n.onLanguageChange(() => {
            this.renderContent();
        });
    }

    unmount(): void {
        if (this.langUnsub) {
            this.langUnsub();
            this.langUnsub = null;
        }
        if (this.rootEl) {
            this.rootEl.remove();
            this.rootEl = null;
        }
    }

    /**
     * Re-render full screen content. Wywolane:
     *  1. Initial mount
     *  2. Po zmianie jezyka (i18n.onLanguageChange subscription)
     *
     * Po renderContent() wywolaj wireEvents() bo innerHTML resetuje wszystkie listeners.
     */
    private renderContent(): void {
        if (!this.rootEl) return;

        const audio = AudioSys.getInstance();
        const musicVolPct = Math.round(audio.getMusicVolume() * 100);
        const sfxVolPct = Math.round(audio.getSfxVolume() * 100);
        const currentLang = i18n.getLanguage();

        this.rootEl.innerHTML = `
            <header class="bt-settings-header">
                <button class="bt-settings-back" type="button" aria-label="${t('common.back')}">
                    <span class="bt-settings-back-arrow" aria-hidden="true">←</span>
                    <span class="bt-settings-back-label">${t('common.back')}</span>
                </button>
                <h2 class="bt-settings-title">${t('settings.title')}</h2>
            </header>

            <div class="bt-settings-content">

                <section class="bt-settings-section">
                    <h3 class="bt-settings-section-title">
                        <span class="bt-settings-icon" aria-hidden="true">🔊</span>
                        ${t('settings.audio')}
                    </h3>

                    <div class="bt-settings-row">
                        <label class="bt-settings-label" for="bt-music-vol">${t('settings.music')}</label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value="${musicVolPct}"
                            id="bt-music-vol"
                            class="bt-settings-slider"
                            aria-label="${t('settings.music')}"
                        >
                        <span class="bt-settings-value" data-for="bt-music-vol">${musicVolPct}%</span>
                    </div>

                    <div class="bt-settings-row">
                        <label class="bt-settings-label" for="bt-sfx-vol">${t('settings.sfx')}</label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value="${sfxVolPct}"
                            id="bt-sfx-vol"
                            class="bt-settings-slider"
                            aria-label="${t('settings.sfx')}"
                        >
                        <span class="bt-settings-value" data-for="bt-sfx-vol">${sfxVolPct}%</span>
                    </div>
                </section>

                <section class="bt-settings-section">
                    <h3 class="bt-settings-section-title">
                        <span class="bt-settings-icon" aria-hidden="true">🌍</span>
                        ${t('settings.language')}
                    </h3>

                    <div class="bt-settings-lang-buttons">
                        <button
                            class="bt-settings-lang-btn ${currentLang === 'pl' ? 'is-active' : ''}"
                            data-lang="pl"
                            type="button"
                        >
                            <span class="bt-settings-flag" aria-hidden="true">${FLAG_SVG_PL}</span>
                            ${t('settings.language.pl')}
                        </button>
                        <button
                            class="bt-settings-lang-btn ${currentLang === 'en' ? 'is-active' : ''}"
                            data-lang="en"
                            type="button"
                        >
                            <span class="bt-settings-flag" aria-hidden="true">${FLAG_SVG_GB}</span>
                            ${t('settings.language.en')}
                        </button>
                    </div>
                </section>

            </div>
        `;

        this.wireEvents();
    }

    private wireEvents(): void {
        if (!this.rootEl) return;

        // === Back button (CTA na powrot do MainHub) ===
        const backBtn = this.rootEl.querySelector<HTMLButtonElement>('.bt-settings-back');
        backBtn?.addEventListener('click', () => {
            AudioSys.getInstance().playMenuClick();
            this.onBack?.();
        });

        // === Music volume slider ===
        const musicSlider = this.rootEl.querySelector<HTMLInputElement>('#bt-music-vol');
        const musicValueEl = this.rootEl.querySelector<HTMLElement>('[data-for="bt-music-vol"]');
        musicSlider?.addEventListener('input', (e) => {
            const pct = parseInt((e.target as HTMLInputElement).value, 10);
            const v = pct / 100;
            AudioSys.getInstance().setMusicVolume(v);
            if (musicValueEl) musicValueEl.textContent = `${pct}%`;
        });

        // === SFX volume slider ===
        // 'input' event fires podczas drag, 'change' tylko po release.
        // Dla SFX preview gramy click sound na 'change' (nie spam podczas slide)
        const sfxSlider = this.rootEl.querySelector<HTMLInputElement>('#bt-sfx-vol');
        const sfxValueEl = this.rootEl.querySelector<HTMLElement>('[data-for="bt-sfx-vol"]');
        sfxSlider?.addEventListener('input', (e) => {
            const pct = parseInt((e.target as HTMLInputElement).value, 10);
            const v = pct / 100;
            AudioSys.getInstance().setSfxVolume(v);
            if (sfxValueEl) sfxValueEl.textContent = `${pct}%`;
        });

        // SFX preview ping na release (audio feedback dla "ile to jest")
        sfxSlider?.addEventListener('change', () => {
            AudioSys.getInstance().playMenuClick();
        });

        // === Language buttons ===
        const langButtons = this.rootEl.querySelectorAll<HTMLButtonElement>('.bt-settings-lang-btn');
        langButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang as Language | undefined;
                if (!lang || (lang !== 'pl' && lang !== 'en')) return;
                if (i18n.getLanguage() === lang) return; // idempotent — skip if same

                AudioSys.getInstance().playMenuClick();

                // E2: persist per-profile (active profile gets language updated)
                const profile = ProfileService.getActiveProfile();
                if (profile && profile.language !== lang) {
                    ProfileService.updateProfile(profile.id, { language: lang });
                }

                // Update i18n state → triggers onLanguageChange subscription → renderContent()
                // (cala Settings screen re-renderuje sie w nowym jezyku)
                i18n.setLanguage(lang);
            });
        });
    }
}