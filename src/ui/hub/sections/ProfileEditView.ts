import { t, type TranslationKey } from '../../../i18n/i18n';
import { ProfileService } from '../../../services/ProfileService';
import { supabaseProfileService } from '../../../services/SupabaseProfileService';
import { pushProfileToCloud } from '../../../services/profileSync';
import {
    type AvatarId,
    type FlagId,
    isValidNickname,
    sanitizeNickname,
    NICKNAME_MAX_LENGTH,
} from '../../../types/Profile';
import { AVATARS, AVATAR_SLOTS, DEFAULT_AVATAR_ID } from '../../../config/avatars';
import { DEFAULT_FLAG_ID } from '../../../config/flags';
import { flagImgHtml, sortedFlagIds, FLAG_NAME_KEY } from '../../flagArt';
import { showToast } from '../../toast';
import { playUiClick } from '../../uiSounds';

/**
 * ProfileEditView — PROFILE-1 (v0.118.0). Edycja profilu W JEZYKU HUBA,
 * renderowana przez ProfileSection w trybie edit. Layout wg makiety Mariusza
 * (20260823_UI.png): PSEUDONIM na gorze pelna szerokosc, nizej dwie kolumny —
 * CZOLGISCI 3x3 (roster v2: 9 postaci, kafle ze zdjeciem+imieniem) po lewej,
 * FLAGI (18, SAME flagi bez podpisow, kolejnosc alfabetyczna wg nazwy kraju
 * w biezacym jezyku gry) po prawej. Na waskim ekranie kolumny staczaja sie.
 *
 * Zastepuje w hubie stary ProfileEditScreen (ZOSTAJE jako legacy ?hub=0+Settings).
 * Logika zapisu 1:1: sanitize/walidacja nicku, server-side uniqueness
 * (offline => optymistycznie), updateProfile + pushProfileToCloud.
 */

/** Literalowe klucze i18n per avatar (dynamiczny t(var) nie kompiluje). */
const AVATAR_NAME_KEY: Record<AvatarId, TranslationKey> = {
    ash: 'profile.avatar.ash.name',
    chris: 'profile.avatar.chris.name',
    dane: 'profile.avatar.dane.name',
    jack: 'profile.avatar.jack.name',
    johny: 'profile.avatar.johny.name',
    matti: 'profile.avatar.matti.name',
    pablo: 'profile.avatar.pablo.name',
    steve: 'profile.avatar.steve.name',
    tommy: 'profile.avatar.tommy.name',
};

export class ProfileEditView {
    /** Zapis lub anulowanie — ProfileSection wraca do widoku profilu. */
    public onDone: (() => void) | null = null;

    private selectedAvatarId: AvatarId = DEFAULT_AVATAR_ID;
    private selectedFlagId: FlagId = DEFAULT_FLAG_ID;
    private currentNickname = '';
    private originalNickname = '';
    /** Guard przeciw double-submit podczas async nickname check. */
    private isSaving = false;
    private el: HTMLElement | null = null;

    /** Wolane przy KAZDYM wejsciu w tryb edit — stan formularza z aktywnego profilu. */
    reset(): void {
        const profile = ProfileService.getActiveProfile();
        this.selectedAvatarId = profile?.avatarId ?? DEFAULT_AVATAR_ID;
        this.selectedFlagId = profile?.flagId ?? DEFAULT_FLAG_ID;
        this.currentNickname = profile?.nickname ?? '';
        this.originalNickname = profile?.nickname ?? '';
        this.isSaving = false;
    }

    render(el: HTMLElement): void {
        this.el = el;
        el.innerHTML = this.html();
        this.wire();
        this.updateSaveButtonState();
    }

    private html(): string {
        // ── Czolgisci: kafle 3x3 (zdjecie + imie; WKROTCE gdy slot null) ────
        const avatarTiles = AVATAR_SLOTS.map(slotId => {
            if (slotId === null) {
                return `
                <span class="bt-hub0-av-tile is-soon">
                    <span class="av-q" aria-hidden="true">?</span>
                    <span class="av-name">${t('common.soon')}</span>
                </span>`;
            }
            const name = t(AVATAR_NAME_KEY[slotId]);
            return `
                <button class="bt-hub0-av-tile${slotId === this.selectedAvatarId ? ' is-selected' : ''}"
                        data-avatar="${slotId}" type="button" aria-label="${name}">
                    <img src="${import.meta.env.BASE_URL}${AVATARS[slotId].assetPath}" alt="" loading="lazy" draggable="false">
                    <span class="av-name">${name}</span>
                </button>`;
        }).join('');

        // ── Flagi: SAME flagi (alfabetycznie wg jezyka gry), bez podpisow ───
        const flagTiles = sortedFlagIds().map(flagId => `
                <button class="bt-hub0-flag-tile${flagId === this.selectedFlagId ? ' is-selected' : ''}"
                        data-flag="${flagId}" type="button" aria-label="${t(FLAG_NAME_KEY[flagId])}"
                        title="${t(FLAG_NAME_KEY[flagId])}">
                    ${flagImgHtml(flagId, 'fl-img')}
                </button>`).join('');

        const validClass = isValidNickname(this.currentNickname) ? ' is-valid' : '';
        return `
            <div class="bt-hub0-pedit">
                <div class="bt-hub0-subhead">✏️ ${t('profile.onboarding.nicknameLabel')}</div>
                <input type="text" class="bt-hub0-input${validClass}" data-nick
                       value="${this.escapeHtml(this.currentNickname)}"
                       maxlength="${NICKNAME_MAX_LENGTH}"
                       placeholder="${t('profile.onboarding.nicknamePlaceholder')}"
                       autocomplete="off" spellcheck="false"
                       aria-label="${t('profile.onboarding.nicknameLabel')}">
                <small class="bt-hub0-input-hint" data-nick-hint>${this.computeNicknameHint()}</small>

                <div class="bt-hub0-pedit-cols">
                    <div class="bt-hub0-pedit-col">
                        <div class="bt-hub0-subhead">🪖 ${t('profile.onboarding.pickAvatarLabel')}</div>
                        <div class="bt-hub0-av-grid">${avatarTiles}</div>
                    </div>
                    <div class="bt-hub0-pedit-col bt-hub0-pedit-col--flags">
                        <div class="bt-hub0-subhead">🚩 ${t('profile.onboarding.pickFlagLabel')}</div>
                        <div class="bt-hub0-flag-grid">${flagTiles}</div>
                    </div>
                </div>

                <div class="bt-hub0-pedit-footer">
                    <button class="bt-hub0-pbtn" data-action="edit-back" type="button">← ${t('common.back')}</button>
                    <button class="bt-hub0-pbtn bt-hub0-pbtn--gold" data-action="edit-save" type="button" disabled>
                        💾 ${t('profile.edit.saveButton')}
                    </button>
                </div>
            </div>
        `;
    }

    private wire(): void {
        const el = this.el;
        if (!el) return;

        el.querySelectorAll<HTMLElement>('[data-avatar]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.avatar as AvatarId | undefined;
                if (!id || id === this.selectedAvatarId) return;
                playUiClick();
                this.selectedAvatarId = id;
                this.render(el); // full re-render (wzorzec BattleSection) — zloty ring + ✓
            });
        });
        el.querySelectorAll<HTMLElement>('[data-flag]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.flag as FlagId | undefined;
                if (!id || id === this.selectedFlagId) return;
                playUiClick();
                this.selectedFlagId = id;
                this.render(el);
            });
        });

        // Nick: live sanitize + walidacja BEZ re-renderu (input nie moze tracic focusu).
        const nickInput = el.querySelector<HTMLInputElement>('[data-nick]');
        const nickHint = el.querySelector<HTMLElement>('[data-nick-hint]');
        nickInput?.addEventListener('input', () => {
            const sanitized = sanitizeNickname(nickInput.value);
            if (sanitized !== nickInput.value) nickInput.value = sanitized;
            this.currentNickname = sanitized;
            const valid = isValidNickname(sanitized);
            nickInput.classList.toggle('is-valid', valid && sanitized.length > 0);
            nickInput.classList.toggle('is-invalid', !valid && sanitized.length > 0);
            if (nickHint) {
                nickHint.textContent = this.computeNicknameHint();
                nickHint.classList.toggle('is-error', !valid && sanitized.length > 0);
            }
            this.updateSaveButtonState();
        });

        el.querySelector('[data-action="edit-back"]')?.addEventListener('click', () => {
            playUiClick();
            this.onDone?.();
        });
        el.querySelector('[data-action="edit-save"]')?.addEventListener('click', () => {
            void this.handleSave();
        });
    }

    private updateSaveButtonState(): void {
        const saveBtn = this.el?.querySelector<HTMLButtonElement>('[data-action="edit-save"]');
        if (!saveBtn) return;
        saveBtn.disabled = !isValidNickname(this.currentNickname) || this.isSaving;
    }

    private setSaveBusy(busy: boolean): void {
        const saveBtn = this.el?.querySelector<HTMLButtonElement>('[data-action="edit-save"]');
        if (!saveBtn) return;
        saveBtn.disabled = busy;
        saveBtn.classList.toggle('is-busy', busy);
    }

    /** Walidacja + server nickname check + persist + cloud push (1:1 ProfileEditScreen). */
    private async handleSave(): Promise<void> {
        if (this.isSaving) return;
        const profile = ProfileService.getActiveProfile();
        if (!profile) {
            console.warn('[ProfileEditView] handleSave without active profile');
            this.onDone?.();
            return;
        }
        if (!isValidNickname(this.currentNickname)) {
            showToast(t('profile.onboarding.nicknameError'), 2500);
            return;
        }

        this.isSaving = true;
        this.setSaveBusy(true);

        // Uniqueness tylko gdy nick sie zmienil; offline => optymistycznie (boot sync zlapie).
        if (this.currentNickname !== this.originalNickname) {
            try {
                const available = await supabaseProfileService.isNicknameAvailable(this.currentNickname, profile.id);
                if (!available) {
                    showToast(t('profile.edit.nicknameTaken'), 2500);
                    this.isSaving = false;
                    this.setSaveBusy(false);
                    this.updateSaveButtonState();
                    return;
                }
            } catch (e) {
                console.warn('[ProfileEditView] nickname check failed (offline?), proceeding optimistically:', e);
            }
        }

        playUiClick();
        try {
            ProfileService.updateProfile(profile.id, {
                avatarId: this.selectedAvatarId,
                flagId: this.selectedFlagId,
                nickname: this.currentNickname,
            });
            pushProfileToCloud().catch((e) => console.warn('[ProfileEditView] cloud push failed:', e));
            showToast(t('profile.edit.savedToast'), 1800);
            this.isSaving = false;
            this.onDone?.();
        } catch (err) {
            console.error('[ProfileEditView] updateProfile failed:', (err as Error).stack ?? err);
            showToast(t('error.invalidConfig'), 2500);
            this.isSaving = false;
            this.setSaveBusy(false);
        }
    }

    private computeNicknameHint(): string {
        const len = this.currentNickname.length;
        if (len === 0) return t('profile.onboarding.nicknameHint');
        if (!isValidNickname(this.currentNickname)) return t('profile.onboarding.nicknameError');
        if (this.currentNickname === this.originalNickname) return t('profile.edit.nicknameUnchanged');
        return t('profile.onboarding.nicknameHint');
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
