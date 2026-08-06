/**
 * SuperButton.ts — tappable przycisk aktywacji super mocy (FAZA 8.5, przepisany w PROG-F7a).
 *
 * F7a: DWA egzemplarze = DWA SLOTY loadoutu (wzorzec Brawl Stars super+gadget).
 * Kazdy przycisk odpala JEDNA konkretna moc — zero ukrytego stanu "wybranej" mocy,
 * wiec long-press cycle z v0.23.1 USUNIETY w calosci (tap = jedyna interakcja).
 * Ikona mocy ustawiana RAZ na mecz z loadoutu (setPowerIcon), nie per-frame.
 *
 * Aktywacja idzie WYLACZNIE callbackiem onRequest — edge-triggered polling
 * (consumeRequest) usuniety, bo dubla sciezka przy 2 slotach = 2 moce z 1 tapu.
 *
 * Pozycja: bottom-right corner, above right joystick; slot 2 na lewo od slotu 1
 * (CSS .bt-super-button--slot2, offsety we WSZYSTKICH 3 galeziach media queries).
 */

export class SuperButton {
    private rootEl: HTMLButtonElement | null = null;
    private iconEl: HTMLElement | null = null;
    private pointerId: number | null = null;

    /** Whether button is visually enabled (moc gotowa). Set externally by TouchInputManager. */
    private _charged: boolean = false;

    /** Slot loadoutu (0/1) — daje klase CSS pozycji + aria-label. */
    private readonly slot: 0 | 1;

    onRequest: (() => void) | null = null;

    constructor(slot: 0 | 1) {
        this.slot = slot;
    }

    mount(parent: HTMLElement): void {
        if (this.rootEl) {
            console.warn('[SuperButton] already mounted');
            return;
        }

        this.rootEl = document.createElement('button');
        this.rootEl.type = 'button';
        // --slot1/--slot2: pozycje w CSS; --slot1 to tez jednoznaczny selektor dla tutorialu.
        this.rootEl.className = `bt-super-button bt-super-button--slot${this.slot + 1}`;
        this.rootEl.setAttribute('aria-label', `Super power slot ${this.slot + 1} — tap to activate`);
        // Default icon = ⚡, nadpisywana z loadoutu przez setPowerIcon() na starcie meczu
        this.rootEl.innerHTML = `<span class="bt-super-button-icon" aria-hidden="true">⚡</span>`;
        this.iconEl = this.rootEl.querySelector<HTMLElement>('.bt-super-button-icon');

        parent.appendChild(this.rootEl);
        this.wireEvents();
    }

    unmount(): void {
        if (!this.rootEl) return;
        this.releasePointer();
        this.rootEl.remove();
        this.rootEl = null;
        this.iconEl = null;
    }

    show(): void {
        if (this.rootEl) this.rootEl.style.display = '';
    }

    hide(): void {
        if (this.rootEl) this.rootEl.style.display = 'none';
        this.releasePointer();
    }

    /**
     * Update visual state — called per-frame by TouchInputManager from main.ts.
     * No-op gdy stan nie zmienia sie (DOM thrash unikany).
     */
    setCharged(charged: boolean): void {
        if (this._charged === charged) return;
        this._charged = charged;
        if (this.rootEl) {
            this.rootEl.classList.toggle('is-charged', charged);
        }
    }

    /** Ikona mocy ze slotu loadoutu — RAZ na mecz (startGame), nie per-frame. */
    setPowerIcon(emoji: string): void {
        if (!this.iconEl) return;
        if (this.iconEl.textContent === emoji) return;
        this.iconEl.textContent = emoji;
    }

    // === Internal: event wiring ===

    private wireEvents(): void {
        if (!this.rootEl) return;

        this.rootEl.addEventListener('pointerdown', this.handlePointerDown);
        this.rootEl.addEventListener('pointerup', this.handlePointerUp);
        this.rootEl.addEventListener('pointercancel', this.handlePointerCancel);
        this.rootEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    private handlePointerDown = (e: PointerEvent): void => {
        if (!this.rootEl || this.pointerId !== null) return;
        e.preventDefault();
        e.stopPropagation(); // don't propagate to joystick if overlap

        this.pointerId = e.pointerId;
        this.rootEl.setPointerCapture(e.pointerId);
        this.rootEl.classList.add('is-pressed');
    };

    private handlePointerUp = (e: PointerEvent): void => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        this.onRequest?.();
        this.releasePointer();
    };

    private handlePointerCancel = (e: PointerEvent): void => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        // Cancel = NIE activate (user gestured cancel, np. swipe poza button)
        this.releasePointer();
    };

    private releasePointer(): void {
        if (this.pointerId !== null && this.rootEl) {
            try {
                this.rootEl.releasePointerCapture(this.pointerId);
            } catch {
                // pointer may have been released externally — ignore
            }
        }
        this.pointerId = null;
        if (this.rootEl) this.rootEl.classList.remove('is-pressed');
    }
}
