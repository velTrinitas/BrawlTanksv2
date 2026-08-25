/**
 * IdentityScreen.ts — Onboarding identity picker (FAZA 7b + 9b.3b cloud claim).
 *
 * Compact 3-step screen w jednym widoku:
 *  1. Avatar (2x2 mobile / 4x1 desktop) — wybor postaci-czolgisty
 *  2. Pseudonim (text input) — required, 2-16 alfanumerycznych znakow
 *  3. Flaga (4x1) — narodowa flaga ktora gracz nosi na czolgu
 *
 * Po wyborze wszystkich + klik ROZPOCZNIJ → server-side nickname check →
 * ProfileService.createProfile() + cloud push + callback.
 *
 * v0.47.0 FAZA 9b.3b — atomic nickname claim:
 *  - PRZED createProfile: await supabaseProfileService.isNicknameAvailable(nick).
 *  - Online + zajety -> komunikat 'nicknameTaken', NIE tworzymy profilu.
 *  - Online + wolny / Offline -> tworzymy lokalnie (offline = optimistic: UNIQUE
 *    constraint + boot sync zlapie kolizje pozniej; onboarding NIE moze paść bez sieci).
 *  - Po stworzeniu: void pushProfileToCloud() — profil w chmurze od razu (FK dla scores).
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
 */

import type { IScreen } from './MainMenu';
import { t } from '../i18n/i18n';
import { AVATAR_SLOTS, AVATARS } from '../config/avatars';
import { flagImgHtml, sortedFlagIds, FLAG_NAME_KEY } from './flagArt';
// Onboarding renderuje kafle .bt-hub0-* — arkusz huba musi byc zaladowany nawet
// gdy HubShell jeszcze nie powstal (fresh boot pokazuje ten ekran PRZED hubem).
import './hub/hub-styles.css';
import { ProfileService } from '../services/ProfileService';
import { supabaseProfileService } from '../services/SupabaseProfileService';
import { pushProfileToCloud } from '../services/profileSync';
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

// PROFILE-1 (v0.118.0): roster v2 — 9 czolgistow + 18 flag.
const AVATAR_NAME_KEYS = {
    ash:   'profile.avatar.ash.name',
    chris: 'profile.avatar.chris.name',
    dane:  'profile.avatar.dane.name',
    jack:  'profile.avatar.jack.name',
    johny: 'profile.avatar.johny.name',
    matti: 'profile.avatar.matti.name',
    pablo: 'profile.avatar.pablo.name',
    steve: 'profile.avatar.steve.name',
    tommy: 'profile.avatar.tommy.name',
} as const;

const AVATAR_DESC_KEYS = {
    ash:   'profile.avatar.ash.desc',
    chris: 'profile.avatar.chris.desc',
    dane:  'profile.avatar.dane.desc',
    jack:  'profile.avatar.jack.desc',
    johny: 'profile.avatar.johny.desc',
    matti: 'profile.avatar.matti.desc',
    pablo: 'profile.avatar.pablo.desc',
    steve: 'profile.avatar.steve.desc',
    tommy: 'profile.avatar.tommy.desc',
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

    /** v0.47.0 FAZA 9b.3b: guard przeciw double-submit podczas async check. */
    private isSubmitting: boolean = false;

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

        // Uklad 1:1 z ProfileEditView (hub, tryb edit): PSEUDONIM pelna szerokosc
        // na gorze, nizej dwie kolumny — CZOLGISCI 3x3 po lewej, FLAGI po prawej.
        // Onboarding dokłada tylko powitanie i CTA; reszta MUSI wygladac tak samo,
        // bo to ten sam wybor tych samych rzeczy (playtest: "fresh boot != edycja").
        root.innerHTML = `
            <div class="bt-hub-bg" aria-hidden="true"></div>
            <div class="bt-hub-overlay" aria-hidden="true"></div>

            <div class="bt-picker-content">
                <div class="bt-identity-welcome">
                    <h2 class="bt-identity-title">${t('profile.onboarding.welcomeTitle')}</h2>
                    <p class="bt-identity-subtitle">${t('profile.onboarding.welcomeSubtitle')}</p>
                </div>

                <div class="bt-hub0-pedit">
                    <div class="bt-hub0-subhead">✏️ ${t('profile.onboarding.nicknameLabel')}</div>
                    <input
                        type="text"
                        class="bt-hub0-input"
                        data-action="nickname"
                        placeholder="${t('profile.onboarding.nicknamePlaceholder')}"
                        maxlength="${NICKNAME_MAX_LENGTH}"
                        autocomplete="off"
                        autocapitalize="off"
                        spellcheck="false"
                        inputmode="text"
                        aria-label="${t('profile.onboarding.nicknameLabel')}"
                    />
                    <small class="bt-hub0-input-hint" data-role="nickname-hint">
                        ${t('profile.onboarding.nicknameHint')}
                    </small>

                    <div class="bt-hub0-pedit-cols">
                        <div class="bt-hub0-pedit-col">
                            <div class="bt-hub0-subhead">🪖 ${t('profile.onboarding.pickAvatarLabel')}</div>
                            <div class="bt-hub0-av-grid">${this.renderAvatarCards()}</div>
                        </div>
                        <div class="bt-hub0-pedit-col bt-hub0-pedit-col--flags">
                            <div class="bt-hub0-subhead">🚩 ${t('profile.onboarding.pickFlagLabel')}</div>
                            <div class="bt-hub0-flag-grid">${this.renderFlagCards()}</div>
                        </div>
                    </div>
                </div>

                <div class="bt-picker-footer bt-identity-footer">
                    <button class="bt-cta-button" type="button" data-action="start" disabled>
                        <span class="bt-cta-label">${t('profile.onboarding.startButton')}</span>
                    </button>
                </div>
            </div>
        `;

        return root;
    }

    /** Kafle czolgistow 3x3 — AVATAR_SLOTS (nie AVATAR_IDS), zeby ewentualny
     *  zablokowany slot pojawil sie tu i w edycji profilu jednoczesnie. */
    private renderAvatarCards(): string {
        const baseUrl = this.getBaseUrl();

        return AVATAR_SLOTS.map(slotId => {
            if (slotId === null) {
                return `
                <span class="bt-hub0-av-tile is-soon">
                    <span class="av-q" aria-hidden="true">?</span>
                    <span class="av-name">${t('common.soon')}</span>
                </span>`;
            }
            const config = AVATARS[slotId];
            const imgUrl = `${baseUrl}${config.assetPath}`;
            const name = t(AVATAR_NAME_KEYS[slotId]);
            const desc = t(AVATAR_DESC_KEYS[slotId]);

            return `
                <button class="bt-hub0-av-tile" type="button"
                        data-avatar-id="${slotId}"
                        aria-label="${name}: ${desc}">
                    <img src="${imgUrl}" alt="${name}" loading="eager" draggable="false">
                    <span class="av-name">${name}</span>
                </button>`;
        }).join('');
    }

    /**
     * Flagi z `flagArt.ts` — ten sam DOKLADNY art co w hubie, alfabetycznie wg
     * nazwy kraju w biezacym jezyku. Poprzednio onboarding rysowal wlasne
     * `linear-gradient` z `config/flags.ts`, czyli pasiaste aproksymacje dla
     * FlagRenderera na czolgu: Brazylia wychodzila zielona z zoltym pasem BEZ
     * rombu, Kanada paskami BEZ liscia klonu. Dziecko wybieralo flage, ktorej
     * potem nie poznawalo w profilu — a to jest pierwszy ekran w grze.
     */
    private renderFlagCards(): string {
        return sortedFlagIds().map(id => {
            const name = t(FLAG_NAME_KEY[id]);
            return `
                <button class="bt-hub0-flag-tile" type="button"
                        data-flag-id="${id}"
                        aria-label="${name}" title="${name}">
                    ${flagImgHtml(id, 'fl-img')}
                </button>`;
        }).join('');
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
                void this.handleStartClick();
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

    /**
     * v0.47.0 FAZA 9b.3b: async — server-side nickname claim przed createProfile.
     * Offline-tolerant (patrz naglowek pliku).
     */
    private async handleStartClick(): Promise<void> {
        if (this.isSubmitting) return;
        if (!this.selectedAvatarId || !this.selectedFlagId) return;
        if (!isValidNickname(this.nicknameValue)) return;

        this.isSubmitting = true;
        this.setCtaBusy(true);

        // Server-side uniqueness check (atomic claim). Offline -> optimistic.
        // Cap ~1.5s: na wolnej/mobilnej sieci ten await blokowal przycisk (gracz klikal ROZPOCZNIJ
        // kilka razy). Po timeout idziemy optymistycznie dalej — kolizje i tak lapie DB unique index
        // przy upsert do chmury (upsertProfile -> NicknameTakenError na 23505).
        try {
            const available = await Promise.race<boolean>([
                supabaseProfileService.isNicknameAvailable(this.nicknameValue),
                new Promise<boolean>((res) => window.setTimeout(() => res(true), 1500)),
            ]);
            if (!available) {
                this.showNicknameTaken();
                this.isSubmitting = false;
                this.updateCtaButton(); // re-enable (fields nadal valid)
                return;
            }
        } catch (e) {
            console.warn('[IdentityScreen] Nickname check failed (offline?), proceeding optimistically:', e);
        }

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

        // v0.47.0 FAZA 9b.3b: natychmiastowy push do chmury (+ flush kolejki scores).
        // Fire-and-forget z catch — race z UNIQUE constraint zlapie boot sync.
        pushProfileToCloud().catch((e) => console.warn('[IdentityScreen] cloud push failed:', e));

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

    /** v0.47.0 FAZA 9b.3b: pokaz komunikat "nick zajety" (po server check). */
    private showNicknameTaken(): void {
        if (!this.el) return;
        const input = this.el.querySelector<HTMLInputElement>('[data-action="nickname"]');
        const hint = this.el.querySelector<HTMLElement>('[data-role="nickname-hint"]');
        if (input) {
            input.classList.remove('is-valid');
            input.classList.add('is-invalid');
        }
        if (hint) {
            hint.classList.add('is-error');
            hint.textContent = t('profile.onboarding.nicknameTaken');
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
        cta.classList.remove('is-busy');
    }

    /** v0.47.0 FAZA 9b.3b: wizualny stan "sprawdzam..." podczas async check. */
    private setCtaBusy(busy: boolean): void {
        const cta = this.el?.querySelector<HTMLButtonElement>('[data-action="start"]');
        if (!cta) return;
        cta.disabled = busy;
        cta.classList.toggle('is-busy', busy);
    }
}