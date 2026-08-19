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

    // v0.108.0 — licznik cooldownu NA przycisku (mobile nie ma paska HUD; feedback A54:
    // "brakuje licznika po uzyciu"). Sweep = conic-gradient zegar, tekst = sekundy.
    private cdSweepEl: HTMLElement | null = null;
    private cdTextEl: HTMLElement | null = null;
    /** Cache ostatnio wyrenderowanych wartosci — DOM ruszany TYLKO przy realnej zmianie. */
    private lastCdPct: number = -1;
    private lastCdSecs: number = -1;

    /** Slot loadoutu (0/1) lub kostka 🎲 (2) — daje klase CSS pozycji + aria-label. */
    private readonly slot: 0 | 1 | 2;

    onRequest: (() => void) | null = null;

    constructor(slot: 0 | 1 | 2) {
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
        // Default icon = ⚡, nadpisywana z loadoutu przez setPowerIcon() na starcie meczu.
        // cd-sweep (zegar conic-gradient) + cd-text (sekundy) domyslnie ukryte (display:none
        // w CSS, pokazywane przez .has-cd na przycisku) — patrz setCooldown().
        // dice-badge: male 🎲 w rogu, widoczne TYLKO z klasa --dice (setDiceStyle) —
        // zostaje gdy ikona pokazuje wylosowana moc, zeby slot byl jednoznaczny.
        this.rootEl.innerHTML = `
            <span class="bt-super-button-icon" aria-hidden="true">⚡</span>
            <div class="bt-super-button-cd" aria-hidden="true"></div>
            <span class="bt-super-button-cd-text" aria-hidden="true"></span>
            <span class="bt-super-button-dice-badge" aria-hidden="true">🎲</span>
        `;
        this.iconEl = this.rootEl.querySelector<HTMLElement>('.bt-super-button-icon');
        this.cdSweepEl = this.rootEl.querySelector<HTMLElement>('.bt-super-button-cd');
        this.cdTextEl = this.rootEl.querySelector<HTMLElement>('.bt-super-button-cd-text');

        parent.appendChild(this.rootEl);
        this.wireEvents();
    }

    unmount(): void {
        if (!this.rootEl) return;
        this.releasePointer();
        this.rootEl.remove();
        this.rootEl = null;
        this.iconEl = null;
        this.cdSweepEl = null;
        this.cdTextEl = null;
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

    /**
     * v0.114.0: wyroznienie slotu kostki (tylko przy Szalonych Mocach) — fioletowy
     * shimmer-ring + badge 🎲 przez klase CSS. Wolane raz na mecz.
     */
    setDiceStyle(on: boolean): void {
        this.rootEl?.classList.toggle('bt-super-button--dice', on);
    }

    /**
     * v0.108.0 — cooldown NA przycisku (wolane per-frame z TouchInputManager).
     * progress 0..1 (1 = pelny cooldown), secsLeft w sekundach. progress=0 chowa
     * wskaznik — takze przy blokadzie "inna moc aktywna" (to nie cooldown, przycisk
     * jest wtedy szary bez liczby, jak dotad). DOM ruszany TYLKO przy zmianie
     * (sweep: krok 1%; tekst: pelna sekunda) — zero thrashu przy 60fps.
     */
    setCooldown(progress: number, secsLeft: number): void {
        if (!this.rootEl || !this.cdSweepEl || !this.cdTextEl) return;
        if (progress <= 0) {
            if (this.lastCdPct !== 0) {
                this.lastCdPct = 0;
                this.lastCdSecs = -1;
                this.rootEl.classList.remove('has-cd');
            }
            return;
        }
        const pct = Math.min(100, Math.max(1, Math.round(progress * 100)));
        if (this.lastCdPct <= 0) this.rootEl.classList.add('has-cd');
        if (pct !== this.lastCdPct) {
            this.lastCdPct = pct;
            // Ciemny "zegar" od godziny 12 (jak pie w desktopowym HUD): zaciemnienie
            // pokrywa POZOSTALY cooldown i kurczy sie do zera.
            this.cdSweepEl.style.background =
                `conic-gradient(rgba(0,0,0,0.55) 0turn ${pct / 100}turn, transparent ${pct / 100}turn)`;
        }
        const secs = Math.max(1, Math.ceil(secsLeft));
        if (secs !== this.lastCdSecs) {
            this.lastCdSecs = secs;
            this.cdTextEl.textContent = String(secs);
        }
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
