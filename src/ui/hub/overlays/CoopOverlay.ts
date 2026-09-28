import { t } from '../../../i18n/i18n';
import { playUiClick } from '../../uiSounds';
import { coopSession, type CoopState, type CoopFailReason } from '../../../net/CoopSession';
import { buildJoinLink, normalizeRoomCode, isValidRoomCode, ROOM_CODE_LEN } from '../../../net/RoomCode';

/**
 * CoopOverlay — COOP LAN-1: ekran "Zagraj z kolega" (za ?mp=1, isMultiplayerEnabled()).
 *
 * Widoki: wybor (Zaloz pokoj / Dolacz) -> host (duzy kod + kopiuj link) / gosc (pole kodu)
 * -> laczenie -> POLACZONO (ping). "Graj razem" nieaktywne do LAN-2 (start meczu).
 * Stan prowadzi `coopSession` — overlay tylko go rysuje; zamkniecie overlaya NIE zrywa
 * polaczenia (hub moze byc przerysowany), zrywa je dopiero "Rozlacz".
 *
 * Czytelnosc dla 9-12 lat: kod w duzych literach, alfabet bez mylacych sie znakow
 * (RoomCode), dwa ROZNE bledy — "zly kod" i "nie ta sama siec Wi-Fi".
 */
export class CoopOverlay {
    private el: HTMLElement | null = null;
    private unsub: (() => void) | null = null;
    private view: 'choose' | 'join' = 'choose';
    private joinDraft = '';
    private copied = false;
    /** COOP LAN-3a: host kliknal "Graj razem" — shell startuje biezacy wybor BITWY jako mecz koopowy. */
    public onPlayTogether: (() => void) | null = null;

    open(parent: HTMLElement, joinCode: string | null = null): void {
        this.close();
        this.el = document.createElement('div');
        this.el.className = 'bt-hub0-overlay bt-coop-overlay';
        parent.appendChild(this.el);
        this.el.addEventListener('click', (e) => this.onClick(e));
        this.el.addEventListener('input', (e) => this.onInput(e));
        if (joinCode) {
            this.joinDraft = joinCode;
            this.view = 'join';
            void coopSession.join(joinCode);
        }
        this.unsub = coopSession.subscribe((s) => this.render(s));
    }

    close(): void {
        this.unsub?.();
        this.unsub = null;
        this.el?.remove();
        this.el = null;
    }

    private failText(r: CoopFailReason): string {
        switch (r) {
            case 'no_match': return t('coop.errNoMatch');
            case 'no_lan': return t('coop.errNoLan');
            case 'version': return t('coop.errVersion');
            case 'cloud_off': return t('coop.errCloudOff');
            case 'expired': return t('coop.errExpired');
            default: return t('coop.errClosed');
        }
    }

    private render(s: CoopState): void {
        if (!this.el) return;
        let body = '';
        if (s.k === 'idle' && this.view === 'choose') {
            body = `
                <p class="bt-coop-lead">${t('coop.lead')}</p>
                <div class="bt-coop-actions">
                    <button class="bt-coop-btn is-primary" data-action="host" type="button">🏠 ${t('coop.host')}</button>
                    <button class="bt-coop-btn" data-action="show-join" type="button">🔑 ${t('coop.join')}</button>
                </div>
                <p class="bt-coop-note">📶 ${t('coop.sameWifi')}</p>`;
        } else if (s.k === 'idle' && this.view === 'join') {
            const ok = isValidRoomCode(this.joinDraft);
            body = `
                <p class="bt-coop-lead">${t('coop.enterCode')}</p>
                <input class="bt-coop-input" data-role="code" maxlength="${ROOM_CODE_LEN}" autocomplete="off"
                       autocapitalize="characters" spellcheck="false" inputmode="text" value="${this.joinDraft}"
                       aria-label="${t('coop.codeLabel')}">
                <div class="bt-coop-actions">
                    <button class="bt-coop-btn is-primary" data-action="join" type="button"${ok ? '' : ' disabled'}>${t('coop.connect')}</button>
                    <button class="bt-coop-btn" data-action="back" type="button">${t('coop.back')}</button>
                </div>`;
        } else if (s.k === 'hosting') {
            body = `
                <p class="bt-coop-lead">${t('coop.hostLead')}</p>
                <div class="bt-coop-code" aria-label="${t('coop.codeLabel')}">${s.code}</div>
                <div class="bt-coop-actions">
                    <button class="bt-coop-btn" data-action="copy" type="button">${this.copied ? '✅ ' + t('coop.copied') : '🔗 ' + t('coop.copyLink')}</button>
                    <button class="bt-coop-btn" data-action="leave" type="button">${t('coop.cancel')}</button>
                </div>
                <p class="bt-coop-status is-wait">⏳ ${t('coop.waiting')}</p>`;
        } else if (s.k === 'joining' || s.k === 'pairing') {
            body = `
                <div class="bt-coop-code is-small">${s.code}</div>
                <p class="bt-coop-status is-wait">⏳ ${s.k === 'joining' ? t('coop.searching') : t('coop.connecting')}</p>
                <div class="bt-coop-actions">
                    <button class="bt-coop-btn" data-action="leave" type="button">${t('coop.cancel')}</button>
                </div>`;
        } else if (s.k === 'connected') {
            const ping = s.rtt === null ? '…' : `${s.rtt} ms`;
            body = `
                <div class="bt-coop-code is-small">${s.code}</div>
                <p class="bt-coop-status is-ok">✅ ${t('coop.connected')}</p>
                <p class="bt-coop-ping">${t('coop.ping')}: <b>${ping}</b>${s.route ? ` <span class="bt-coop-route">${s.route}</span>` : ''}</p>
                <div class="bt-coop-actions">
                    ${s.role === 'host'
                        ? `<button class="bt-coop-btn is-primary" data-action="play" type="button">▶ ${t('coop.playTogether')}</button>`
                        : `<p class="bt-coop-status is-wait">⏳ ${t('coop.waitHost')}</p>`}
                    <button class="bt-coop-btn" data-action="leave" type="button">${t('coop.disconnect')}</button>
                </div>`;
        } else if (s.k === 'failed') {
            body = `
                <p class="bt-coop-status is-err">⚠️ ${this.failText(s.reason)}</p>
                <div class="bt-coop-actions">
                    <button class="bt-coop-btn is-primary" data-action="reset" type="button">${t('coop.tryAgain')}</button>
                </div>`;
        }
        this.el.innerHTML = `
            <div class="bt-hub0-modal bt-coop-modal" role="dialog" aria-modal="true" aria-label="${t('coop.title')}">
                <button class="bt-hub0-modal-close" data-action="close" type="button" aria-label="${t('common.close')}">✕</button>
                <h3 class="bt-hub0-modal-title">🤝 ${t('coop.title')}</h3>
                ${body}
            </div>`;
        if (s.k === 'idle' && this.view === 'join') {
            const inp = this.el.querySelector<HTMLInputElement>('[data-role="code"]');
            if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
        }
    }

    private onInput(e: Event): void {
        const inp = e.target as HTMLInputElement;
        if (inp?.dataset.role !== 'code') return;
        const norm = normalizeRoomCode(inp.value);
        if (inp.value !== norm) inp.value = norm;
        this.joinDraft = norm;
        const btn = this.el?.querySelector<HTMLButtonElement>('[data-action="join"]');
        if (btn) btn.disabled = !isValidRoomCode(norm);
    }

    private onClick(e: Event): void {
        const target = e.target as HTMLElement;
        if (target === this.el || target.closest('[data-action="close"]')) {
            // Zamkniecie okna nie zrywa pokoju w toku laczenia/polaczenia — tylko idle/failed.
            const k = coopSession.current.k;
            if (k === 'failed') coopSession.leave();
            this.close();
            return;
        }
        const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
        if (!action) return;
        playUiClick();
        switch (action) {
            case 'host': this.copied = false; void coopSession.host(); break;
            case 'show-join': this.view = 'join'; this.render(coopSession.current); break;
            case 'back': this.view = 'choose'; this.render(coopSession.current); break;
            case 'join':
                if (isValidRoomCode(this.joinDraft)) void coopSession.join(this.joinDraft);
                break;
            case 'copy': {
                const s = coopSession.current;
                if (s.k !== 'hosting') break;
                const link = buildJoinLink(s.code);
                void navigator.clipboard?.writeText(link).then(() => {
                    this.copied = true;
                    this.render(coopSession.current);
                }).catch((err: unknown) => console.warn('[CoopOverlay] clipboard failed', (err as Error)?.stack));
                break;
            }
            case 'play': this.onPlayTogether?.(); break;
            case 'leave': this.view = 'choose'; coopSession.leave(); break;
            case 'reset': this.view = 'choose'; coopSession.leave(); break;
        }
    }
}
