/**
 * ProfileEditScreen.ts — FAZA 8b (v0.43.0).
 *
 * Edycja aktywnego profilu: avatar + flag + nickname.
 * Reuse layout IdentityScreen (visual continuity) z różnicami:
 *  - Pre-filled wszystkie pola z ProfileService.getActiveProfile()
 *  - Footer: [← COFNIJ] + [💾 ZAPISZ ZMIANY] zamiast samego "ROZPOCZNIJ"
 *  - onConfirm: ProfileService.updateProfile() zamiast createProfile()
 *  - Toast "Profil zaktualizowany ✓" po save
 *
 * Entry points:
 *  1. MainHub profile chip click → menu.show('profileEdit')
 *  2. SettingsScreen sekcja Profil button "✏️ EDYTUJ PROFIL" → menu.show('profileEdit')
 *
 * Defensive: jeśli getActiveProfile() === null (edge case po localStorage clear),
 * screen renderuje fallback "Brak aktywnego profilu" + button powrót do hub.
 *
 * v0.43.0-fix1: AvatarConfig nie ma property `nameKey` — uzywamy bezposredniego klucza
 * i18n `profile.avatar.{id}.name` (klucze sa zdefiniowane w pl.ts + en.ts FAZA 8b).
 * Flag uzywa tego samego patternu: `profile.flag.{id}`.
 */

import type { IScreen } from './MainMenu';
import { AudioSys } from '../audio/AudioSys';
import { t } from '../i18n/i18n';
import { ProfileService } from '../services/ProfileService';
import {
    type AvatarId,
    type FlagId,
    isValidNickname,
    sanitizeNickname,
    NICKNAME_MAX_LENGTH,
} from '../types/Profile';
import { AVATARS } from '../config/avatars';
import { FLAGS, type FlagConfig } from '../config/flags';
import { showToast } from './toast';

/**
 * Hardcoded ID arrays — TS union types nie generują tablic automatycznie.
 * Kolejność = display order w grid (mobile 2x2, tablet 4x1).
 * Jeśli dodajesz nowy avatar/flag — DODAJ tutaj + do AVATARS/FLAGS configów + do Profile.ts types.
 */
const AVATAR_IDS: readonly AvatarId[] = ['komandor', 'pilotka', 'smyk', 'inzynier'] as const;
const FLAG_IDS: readonly FlagId[] = ['pl', 'fr', 'it', 'de'] as const;

export class ProfileEditScreen implements IScreen {
    private rootEl: HTMLElement | null = null;

    // === Stan formularza (pre-filled z aktywnego profilu) ===
    private selectedAvatarId: AvatarId;
    private selectedFlagId: FlagId;
    private currentNickname: string;
    private originalNickname: string; // dla compare "czy się zmienił"

    /** Wstrzykiwane przez MainMenu — wraca do hub po save lub anulowaniu. */
    onBack: (() => void) | null = null;

    constructor() {
        const profile = ProfileService.getActiveProfile();
        if (profile) {
            this.selectedAvatarId = profile.avatarId;
            this.selectedFlagId = profile.flagId;
            this.currentNickname = profile.nickname;
            this.originalNickname = profile.nickname;
        } else {
            // Defensive fallback — przy normalnym flow niemożliwe
            this.selectedAvatarId = 'komandor';
            this.selectedFlagId = 'pl';
            this.currentNickname = '';
            this.originalNickname = '';
        }
    }

    mount(root: HTMLElement): void {
        this.rootEl = document.createElement('div');
        this.rootEl.className = 'bt-picker-screen';
        root.appendChild(this.rootEl);

        // Edge case: brak aktywnego profilu (po manual localStorage clear)
        const profile = ProfileService.getActiveProfile();
        if (!profile) {
            this.renderNoProfileFallback();
            return;
        }

        this.renderContent();
    }

    unmount(): void {
        if (this.rootEl) {
            this.rootEl.remove();
            this.rootEl = null;
        }
    }

    // ============================================================
    // RENDERING
    // ============================================================

    private renderContent(): void {
        if (!this.rootEl) return;

        this.rootEl.innerHTML = `
            <div class="bt-picker-content">

                <div class="bt-identity-welcome">
                    <h2 class="bt-identity-title">${t('profile.edit.title')}</h2>
                    <p class="bt-identity-subtitle">${t('profile.edit.subtitle')}</p>
                </div>

                ${this.renderAvatarSection()}

                ${this.renderFlagSection()}

                ${this.renderNicknameSection()}

                <div class="bt-picker-footer">
                    <button class="bt-btn-secondary" type="button" data-action="back">
                        ← ${t('common.back')}
                    </button>
                    <button class="bt-cta-button" type="button" data-action="save" disabled>
                        <span class="bt-cta-label">💾 ${t('profile.edit.saveButton')}</span>
                    </button>
                </div>

            </div>
        `;

        this.wireEvents();
        this.updateSaveButtonState();
    }

    /**
     * v0.43.0-fix1: zamiast t(avatar.nameKey) uzywamy bezposrednio klucza i18n.
     * AVATARS[avatarId] dostarcza tylko assetPath — nazwa pobierana z translations
     * pod kluczem profile.avatar.{id}.name (klucze zdefiniowane w pl.ts/en.ts FAZA 8b).
     */
    private renderAvatarSection(): string {
        const cards = AVATAR_IDS.map(avatarId => {
            const avatar = AVATARS[avatarId];
            const baseUrl = this.getBaseUrl();
            const isSelected = this.selectedAvatarId === avatarId;
            const nameKey = `profile.avatar.${avatarId}.name` as const;
            const displayName = t(nameKey as never);
            return `
                <button
                    class="bt-identity-card ${isSelected ? 'is-selected' : ''}"
                    type="button"
                    data-avatar="${avatarId}"
                    aria-label="${displayName}"
                >
                    <div class="bt-identity-card-visual">
                        <img class="bt-identity-card-img" src="${baseUrl}${avatar.assetPath}"
                             alt="" loading="eager" draggable="false">
                    </div>
                    <span class="bt-identity-card-name">${displayName}</span>
                </button>
            `;
        }).join('');

        return `
            <section class="bt-identity-section">
                <h3 class="bt-identity-section-title">${t('profile.onboarding.pickAvatarLabel')}</h3>
                <div class="bt-identity-avatar-grid">
                    ${cards}
                </div>
            </section>
        `;
    }

    private renderFlagSection(): string {
        const cards = FLAG_IDS.map(flagId => {
            const flag = FLAGS[flagId];
            const gradient = this.computeFlagGradient(flag);
            const isSelected = this.selectedFlagId === flagId;
            const flagNameKey = `profile.flag.${flagId}` as const;
            const displayName = t(flagNameKey as never);
            return `
                <button
                    class="bt-identity-card ${isSelected ? 'is-selected' : ''}"
                    type="button"
                    data-flag="${flagId}"
                    aria-label="${displayName}"
                >
                    <div class="bt-identity-flag-swatch" style="background: ${gradient};"></div>
                    <span class="bt-identity-card-name bt-identity-card-name--small">
                        ${displayName}
                    </span>
                </button>
            `;
        }).join('');

        return `
            <section class="bt-identity-section">
                <h3 class="bt-identity-section-title">${t('profile.onboarding.pickFlagLabel')}</h3>
                <div class="bt-identity-flag-grid">
                    ${cards}
                </div>
            </section>
        `;
    }

    private renderNicknameSection(): string {
        const hint = this.computeNicknameHint();
        const validClass = isValidNickname(this.currentNickname) ? 'is-valid' : '';
        return `
            <section class="bt-identity-section bt-identity-section--nickname">
                <h3 class="bt-identity-section-title">${t('profile.onboarding.nicknameLabel')}</h3>
                <div class="bt-identity-nickname-wrap">
                    <input
                        type="text"
                        class="bt-identity-nickname-input ${validClass}"
                        id="bt-profile-edit-nickname"
                        value="${this.escapeHtml(this.currentNickname)}"
                        maxlength="${NICKNAME_MAX_LENGTH}"
                        placeholder="${t('profile.onboarding.nicknamePlaceholder')}"
                        autocomplete="off"
                        spellcheck="false"
                        aria-label="${t('profile.onboarding.nicknameLabel')}"
                    >
                    <p class="bt-identity-nickname-hint" id="bt-profile-edit-hint">
                        ${hint}
                    </p>
                </div>
            </section>
        `;
    }

    private renderNoProfileFallback(): void {
        if (!this.rootEl) return;
        this.rootEl.innerHTML = `
            <div class="bt-picker-content">
                <div class="bt-identity-welcome">
                    <h2 class="bt-identity-title">${t('profile.edit.noProfileTitle')}</h2>
                    <p class="bt-identity-subtitle">${t('profile.edit.noProfileSubtitle')}</p>
                </div>
                <div class="bt-picker-footer" style="justify-content: center;">
                    <button class="bt-btn-secondary" type="button" data-action="back">
                        ← ${t('common.back')}
                    </button>
                </div>
            </div>
        `;
        this.rootEl.querySelector<HTMLButtonElement>('[data-action="back"]')?.addEventListener('click', () => {
            this.onBack?.();
        });
    }

    // ============================================================
    // INTERACTIVITY
    // ============================================================

    private wireEvents(): void {
        if (!this.rootEl) return;

        // === Avatar selection ===
        this.rootEl.querySelectorAll<HTMLButtonElement>('[data-avatar]').forEach(btn => {
            btn.addEventListener('click', () => {
                const avatarId = btn.dataset.avatar as AvatarId | undefined;
                if (!avatarId || avatarId === this.selectedAvatarId) return;

                AudioSys.getInstance().playMenuClick();
                this.selectedAvatarId = avatarId;
                this.refreshAvatarSelection();
                this.updateSaveButtonState();
            });
        });

        // === Flag selection ===
        this.rootEl.querySelectorAll<HTMLButtonElement>('[data-flag]').forEach(btn => {
            btn.addEventListener('click', () => {
                const flagId = btn.dataset.flag as FlagId | undefined;
                if (!flagId || flagId === this.selectedFlagId) return;

                AudioSys.getInstance().playMenuClick();
                this.selectedFlagId = flagId;
                this.refreshFlagSelection();
                this.updateSaveButtonState();
            });
        });

        // === Nickname input (real-time validation + sanitization) ===
        const nickInput = this.rootEl.querySelector<HTMLInputElement>('#bt-profile-edit-nickname');
        const nickHint = this.rootEl.querySelector<HTMLElement>('#bt-profile-edit-hint');
        nickInput?.addEventListener('input', (e) => {
            const raw = (e.target as HTMLInputElement).value;
            const sanitized = sanitizeNickname(raw);

            // Update input value jeśli sanitization usunęło coś (defensive)
            if (sanitized !== raw) {
                (e.target as HTMLInputElement).value = sanitized;
            }

            this.currentNickname = sanitized;

            // Visual validation feedback
            const valid = isValidNickname(sanitized);
            nickInput.classList.toggle('is-valid', valid && sanitized.length > 0);
            nickInput.classList.toggle('is-invalid', !valid && sanitized.length > 0);

            // Hint text + color
            if (nickHint) {
                nickHint.textContent = this.computeNicknameHint();
                nickHint.classList.toggle('is-error', !valid && sanitized.length > 0);
            }

            this.updateSaveButtonState();
        });

        // === Footer buttons ===
        this.rootEl.querySelector<HTMLButtonElement>('[data-action="back"]')?.addEventListener('click', () => {
            AudioSys.getInstance().playMenuClick();
            this.onBack?.();
        });

        this.rootEl.querySelector<HTMLButtonElement>('[data-action="save"]')?.addEventListener('click', () => {
            this.handleSave();
        });
    }

    /**
     * Re-apply 'is-selected' class na avatar cards bez full re-render
     * (zachowuje listeners + transition effects).
     */
    private refreshAvatarSelection(): void {
        if (!this.rootEl) return;
        this.rootEl.querySelectorAll<HTMLButtonElement>('[data-avatar]').forEach(btn => {
            const isSelected = btn.dataset.avatar === this.selectedAvatarId;
            btn.classList.toggle('is-selected', isSelected);
        });
    }

    private refreshFlagSelection(): void {
        if (!this.rootEl) return;
        this.rootEl.querySelectorAll<HTMLButtonElement>('[data-flag]').forEach(btn => {
            const isSelected = btn.dataset.flag === this.selectedFlagId;
            btn.classList.toggle('is-selected', isSelected);
        });
    }

    /**
     * Save button enabled gdy nickname jest valid.
     * No-changes save jest idempotent (toast pokazany mimo wszystko —
     * mniej confusing niż disabled bez powodu).
     */
    private updateSaveButtonState(): void {
        if (!this.rootEl) return;
        const saveBtn = this.rootEl.querySelector<HTMLButtonElement>('[data-action="save"]');
        if (!saveBtn) return;

        const nicknameValid = isValidNickname(this.currentNickname);
        saveBtn.disabled = !nicknameValid;
    }

    /**
     * Walidacja + persist update + toast + back to hub.
     */
    private handleSave(): void {
        const profile = ProfileService.getActiveProfile();
        if (!profile) {
            console.warn('[ProfileEdit] handleSave called without active profile');
            this.onBack?.();
            return;
        }

        if (!isValidNickname(this.currentNickname)) {
            // Defensive — button powinien być disabled, ale safe-guard
            showToast(t('profile.onboarding.nicknameError'), 2500);
            return;
        }

        // Check nickname uniqueness ONLY jeśli nickname się zmienił
        // (idempotent update — nie blokujemy ZAPISZ gdy nickname jest stary)
        if (this.currentNickname !== this.originalNickname) {
            const taken = ProfileService.listProfiles().some(p =>
                p.id !== profile.id &&
                p.nickname.toLowerCase() === this.currentNickname.toLowerCase(),
            );
            if (taken) {
                showToast(t('profile.edit.nicknameTaken'), 2500);
                return;
            }
        }

        AudioSys.getInstance().playMenuClick();

        try {
            ProfileService.updateProfile(profile.id, {
                avatarId: this.selectedAvatarId,
                flagId: this.selectedFlagId,
                nickname: this.currentNickname,
            });

            showToast(t('profile.edit.savedToast'), 1800);
            this.onBack?.();
        } catch (err) {
            console.error('[ProfileEdit] updateProfile failed:', err);
            showToast(t('error.invalidConfig'), 2500);
        }
    }

    // ============================================================
    // HELPERS
    // ============================================================

    private computeNicknameHint(): string {
        const len = this.currentNickname.length;
        if (len === 0) {
            return t('profile.onboarding.nicknameHint');
        }
        if (!isValidNickname(this.currentNickname)) {
            return t('profile.onboarding.nicknameError');
        }
        if (this.currentNickname === this.originalNickname) {
            return t('profile.edit.nicknameUnchanged');
        }
        return t('profile.onboarding.nicknameHint');
    }

    /**
     * CSS linear-gradient matching PIXI FlagRenderer + IdentityScreen.
     * Same math as MainHub.computeFlagGradient (shared visual language).
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

    private escapeHtml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}