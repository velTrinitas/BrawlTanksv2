/**
 * IdentityScreen.ts — Onboarding identity picker (FAZA 7b).
 *
 * Compact 3-step screen w jednym widoku:
 *  1. Avatar (2x2 mobile / 4x1 desktop) — wybor postaci-czolgisty
 *  2. Pseudonim (text input) — required, 2-16 alfanumerycznych znakow
 *  3. Flaga (4x1) — narodowa flaga ktora gracz nosi na czolgu
 *
 * Po wyborze wszystkich + klik ROZPOCZNIJ → ProfileService.createProfile() + callback.
 *
 * UX decisions (per FAZA 7b nickname fix):
 *  - Auto-prefill nickname z avatar.displayName po klikniecie awatara (zero-friction
 *    happy path: klik avatar → pole juz wypelnione → klik flag → ROZPOCZNIJ)
 *  - Nickname edytowalny po prefill — user moze nadpisac (Komandor → Mariusz)
 *  - Alphanumeric only — niedozwolone znaki sa silently strippnowane przy input
 *  - Real-time walidacja — border red gdy < 2 chars, gold gdy valid
 *  - CTA disabled dopoki wszystkie 3 selekcje (avatar + valid nickname + flag) OK
 *  - Brak Ken Burns na backgrounds (reusing subtle .bt-hub-bg ze ScenarioPicker)
 *
 * Constitution §10 exception (juz dokumentowane w avatars.ts):
 *  Awatary renderowane jako <img> w HTML to UI-only display.
 *  Flagi renderowane jako CSS linear-gradient (same colors co PIXI FlagRenderer).
 *
 * TypeScript note (FAZA 7b fix #2):
 * - i18n key maps uzywaja `as const` zamiast `Record<K, string>` annotation,
 *   zeby TS zachowal literalne typy stringów dla t() narrow-key union.
 *   Reverse pitfall vs FAZA 7a (gdzie `as const` na pl.ts wartosciach
 *   blokowal EN translations — tu kierunek jest odwrotny: chcemy literals).
 */

import type { IScreen } from './MainMenu';
import { t } from '../i18n/i18n';
import { AVATAR_IDS, AVATARS } from '../config/avatars';
import { FLAG_IDS, FLAGS, type FlagConfig } from '../config/flags';
import { ProfileService } from '../services/ProfileService';
import { playUiClick, playUiSelect } from './uiSounds';
import {
    isValidNickname,
    sanitizeNickname,
    NICKNAME_MAX_LENGTH,
    type AvatarId,
    type FlagId,
    type LanguageId,
} from '../types/Profile';

// ============================================================
// i18n key tables — `as const` preserves literal types for t()
// ============================================================

const AVATAR_NAME_KEYS = {
    komandor: 'profile.avatar.komandor.name',
    pilotka:  'profile.avatar.pilotka.name',
    smyk:     'profile.avatar.smyk.name',
    inzynier: 'profile.avatar.inzynier.name',
} as const;

const AVATAR_DESC_KEYS = {
    komandor: 'profile.avatar.komandor.desc',
    pilotka:  'profile.avatar.pilotka.desc',
    smyk:     'profile.avatar.smyk.desc',
    inzynier: 'profile.avatar.inzynier.desc',
} as const;

const FLAG_NAME_KEYS = {
    pl: 'profile.flag.pl',
    fr: 'profile.flag.fr',
    it: 'profile.flag.it',
    de: 'profile.flag.de',
} as const;

// ============================================================
// IdentityScreen
// ============================================================

export interface IdentityScreenOptions {
    /** Wywolane gdy profil zostal stworzony — MainMenu nawiguje do MainHub. */
    onProfileCreated?: (() => void) | null;
}

export class IdentityScreen implements IScreen {
    private el: HTMLElement | null = null;

    selectedAvatarId: AvatarId | null = null;
    selectedFlagId: FlagId | null = null;
    nicknameValue: string = '';

    /** True jezeli user recznie zmienil nickname — wtedy avatar click NIE nadpisuje. */
    private nicknameManuallyEdited: boolean = false;

    /** Wywolane po stworzeniu profilu — MainMenu nawiguje do MainHub. */
    onProfileCreated: (() => void) | null = null;

    constructor(opts: IdentityScreenOptions = {}) {
        if (opts.onProfileCreated !== undefined) {
            this.onProfileCreated = opts.onProfileCreated;
        }
    }

    mount(root: HTMLElement): void {
        this.el = this.render();
        root.appendChild(this.el);
        this.wireEvents();
    }

    unmount(): void {
        this.el?.remove();
        this.el = null;
    }

    // === Internal: render ===

    private render(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'bt-picker-screen bt-identity-screen';

        root.innerHTML = `
            <div class="bt-hub-bg" aria-hidden="true"></div>
            <div class="bt-hub-overlay" aria-hidden="true"></div>

            <div class="bt-picker-content">
                <div class="bt-identity-welcome">
                    <h2 class="bt-identity-title">${t('profile.onboarding.welcomeTitle')}</h2>
                    <p class="bt-identity-subtitle">${t('profile.onboarding.welcomeSubtitle')}</p>
                </div>

                <section class="bt-identity-section">
                    <h3 class="bt-identity-section-title">${t('profile.onboarding.pickAvatarLabel')}</h3>
                    <div class="bt-identity-avatar-grid">
                        ${this.renderAvatarCards()}
                    </div>
                </section>

                <section class="bt-identity-section bt-identity-section--nickname">
                    <h3 class="bt-identity-section-title">${t('profile.onboarding.nicknameLabel')}</h3>
                    <div class="bt-identity-nickname-wrap">
                        <input
                            type="text"
                            class="bt-identity-nickname-input"
                            data-action="nickname"
                            placeholder="${t('profile.onboarding.nicknamePlaceholder')}"
                            maxlength="${NICKNAME_MAX_LENGTH}"
                            autocomplete="off"
                            autocapitalize="off"
                            spellcheck="false"
                            inputmode="text"
                            aria-label="${t('profile.onboarding.nicknameLabel')}"
                        />
                        <div class="bt-identity-nickname-hint" data-role="nickname-hint">
                            ${t('profile.onboarding.nicknameHint')}
                        </div>
                    </div>
                </section>

                <section class="bt-identity-section">
                    <h3 class="bt-identity-section-title">${t('profile.onboarding.pickFlagLabel')}</h3>
                    <div class="bt-identity-flag-grid">
                        ${this.renderFlagCards()}
                    </div>
                </section>

                <div class="bt-picker-footer bt-identity-footer">
                    <button class="bt-cta-button" type="button" data-action="start" disabled>
                        <span class="bt-cta-label">${t('profile.onboarding.startButton')}</span>
                    </button>
                </div>
            </div>
        `;

        return root;
    }

    private renderAvatarCards(): string {
        const baseUrl = this.getBaseUrl();

        return AVATAR_IDS.map(id => {
            const config = AVATARS[id];
            const imgUrl = `${baseUrl}${config.assetPath}`;
            const name = t(AVATAR_NAME_KEYS[id]);
            const desc = t(AVATAR_DESC_KEYS[id]);

            return `
                <button class="bt-identity-card bt-identity-card--avatar" type="button"
                        data-avatar-id="${id}"
                        aria-label="${name}: ${desc}">
                    <div class="bt-identity-card-visual">
                        <img class="bt-identity-card-img" src="${imgUrl}"
                             alt="${name}" loading="eager" draggable="false">
                    </div>
                    <div class="bt-identity-card-name">${name}</div>
                </button>
            `;
        }).join('');
    }

    private renderFlagCards(): string {
        return FLAG_IDS.map(id => {
            const config = FLAGS[id];
            const bgStyle = this.computeFlagGradient(config);
            const name = t(FLAG_NAME_KEYS[id]);

            return `
                <button class="bt-identity-card bt-identity-card--flag" type="button"
                        data-flag-id="${id}"
                        aria-label="${name}">
                    <div class="bt-identity-flag-swatch" style="background: ${bgStyle};"
                         aria-hidden="true"></div>
                    <div class="bt-identity-card-name bt-identity-card-name--small">${name}</div>
                </button>
            `;
        }).join('');
    }

    /**
     * Generates CSS linear-gradient matching PIXI FlagRenderer colors + patterns.
     * Math verification: hard color stops (0% to N% same color, then jump to next)
     * = sharp stripe boundary, no anti-aliasing between bands.
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

    // === Internal: events ===

    private wireEvents(): void {
        if (!this.el) return;

        // Delegated click handler (cards + CTA)
        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            const avatarBtn = target.closest<HTMLElement>('[data-avatar-id]');
            if (avatarBtn) {
                this.handleAvatarClick(avatarBtn.dataset.avatarId as AvatarId, avatarBtn);
                return;
            }

            const flagBtn = target.closest<HTMLElement>('[data-flag-id]');
            if (flagBtn) {
                this.handleFlagClick(flagBtn.dataset.flagId as FlagId, flagBtn);
                return;
            }

            const startBtn = target.closest<HTMLElement>('[data-action="start"]');
            if (startBtn && !(startBtn as HTMLButtonElement).disabled) {
                this.handleStartClick();
            }
        });

        // Nickname input — direct listener for input/change events
        const nicknameInput = this.el.querySelector<HTMLInputElement>('[data-action="nickname"]');
        if (nicknameInput) {
            nicknameInput.addEventListener('input', (e) => {
                this.handleNicknameInput(e.target as HTMLInputElement);
            });
            // Track manual edits — once user types, avatar click stops auto-prefilling
            nicknameInput.addEventListener('keydown', () => {
                this.nicknameManuallyEdited = true;
            });
        }
    }

    private handleAvatarClick(id: AvatarId, cardEl: HTMLElement): void {
        playUiClick();
        this.selectedAvatarId = id;

        this.el?.querySelectorAll<HTMLElement>('[data-avatar-id]').forEach(c => {
            c.classList.toggle('is-selected', c === cardEl);
        });

        // Auto-prefill nickname jezeli user jeszcze nie tyknal recznie
        if (!this.nicknameManuallyEdited) {
            const suggestedName = t(AVATAR_NAME_KEYS[id]);
            // Avatar names moga miec spacje/specjalne (np. "Inzynier") — sanitize
            const sanitized = sanitizeNickname(suggestedName);
            this.nicknameValue = sanitized;

            const input = this.el?.querySelector<HTMLInputElement>('[data-action="nickname"]');
            if (input) input.value = sanitized;

            this.updateNicknameValidation();
        }

        this.updateCtaButton();
    }

    private handleFlagClick(id: FlagId, cardEl: HTMLElement): void {
        playUiClick();
        this.selectedFlagId = id;

        this.el?.querySelectorAll<HTMLElement>('[data-flag-id]').forEach(c => {
            c.classList.toggle('is-selected', c === cardEl);
        });

        this.updateCtaButton();
    }

    private handleNicknameInput(input: HTMLInputElement): void {
        // Strip invalid chars silently (alphanumeric only)
        const sanitized = sanitizeNickname(input.value);
        if (sanitized !== input.value) {
            input.value = sanitized;
        }
        this.nicknameValue = sanitized;
        this.nicknameManuallyEdited = true;

        this.updateNicknameValidation();
        this.updateCtaButton();
    }

    private handleStartClick(): void {
        if (!this.selectedAvatarId || !this.selectedFlagId) return;
        if (!isValidNickname(this.nicknameValue)) return;

        playUiSelect();

        // Auto-detect language from browser locale; fallback PL (target audience).
        const lang: LanguageId = navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en';

        const profile = ProfileService.createProfile({
            avatarId: this.selectedAvatarId,
            flagId: this.selectedFlagId,
            nickname: this.nicknameValue,
            language: lang,
        });
        console.log('[IdentityScreen] Profile created:', profile);

        this.onProfileCreated?.();
    }

    // === Internal: validation UI feedback ===

    private updateNicknameValidation(): void {
        if (!this.el) return;
        const input = this.el.querySelector<HTMLInputElement>('[data-action="nickname"]');
        const hint = this.el.querySelector<HTMLElement>('[data-role="nickname-hint"]');
        if (!input || !hint) return;

        if (this.nicknameValue.length === 0) {
            // Empty — neutral state (no error shown until user starts typing)
            input.classList.remove('is-invalid', 'is-valid');
            hint.classList.remove('is-error');
            hint.textContent = t('profile.onboarding.nicknameHint');
        } else if (isValidNickname(this.nicknameValue)) {
            input.classList.remove('is-invalid');
            input.classList.add('is-valid');
            hint.classList.remove('is-error');
            hint.textContent = t('profile.onboarding.nicknameHint');
        } else {
            input.classList.remove('is-valid');
            input.classList.add('is-invalid');
            hint.classList.add('is-error');
            hint.textContent = t('profile.onboarding.nicknameError');
        }
    }

    private updateCtaButton(): void {
        const cta = this.el?.querySelector<HTMLButtonElement>('[data-action="start"]');
        if (!cta) return;

        const allValid =
            !!this.selectedAvatarId &&
            !!this.selectedFlagId &&
            isValidNickname(this.nicknameValue);

        cta.disabled = !allValid;
    }
}