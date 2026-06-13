/**
 * SuperButton.ts — dedicated tappable button dla super-shot trigger (FAZA 8.5).
 *
 * v0.23.1 update — long-press cycle support:
 *  - Tap (short press <500ms) → activate selected super power
 *  - Long-press (≥500ms) → cycle do next power (no activation)
 *  - Button visual pokazuje aktualnie selected power emoji (🛡️/💣/❄️)
 *  - Pulsing gold glow gdy canActivate (charges + cooldown ready)
 *
 * Pozycja: bottom-right corner, above-and-left od right joystick.
 * Visual: gold gradient button z icon (60-80px).
 *
 * UX rationale:
 *  - Tap = primary action (activate) — immediate response, no learning curve
 *  - Long-press = secondary action (switch) — secondary intent, less frequent
 *  - Patterns matchują Brawl Stars conventions (validated for 9-12 audience)
 *
 * Edge cases:
 *  - User taps and immediately releases: long-press NIE triggers, tap activates
 *  - User holds button: po 500ms cycle triggers, follow-up release NIE activates
 *  - Cancel scenario: pointer leaves button area while held → release cleanup
 */

const LONG_PRESS_MS = 500;  // Brawl Stars uses 400ms — 500 is slightly more forgiving

export class SuperButton {
    // FAZA 8.5 fix: HTMLButtonElement (not generic HTMLElement) so .type assignment compiles
    private rootEl: HTMLButtonElement | null = null;
    private iconEl: HTMLElement | null = null;
    private pointerId: number | null = null;

    /** Edge-triggered flag — true on tap, reset by consumeRequest(). */
    private _requested: boolean = false;

    /** Whether button is visually enabled (charges > 0 + ready). Set externally by TouchInputManager. */
    private _hasCharges: boolean = false;

    /** Long-press detection state */
    private longPressTimer: number | null = null;
    private wasLongPress: boolean = false;

    onRequest: (() => void) | null = null;
    /** v0.23.1: long-press → cycle do next power (TouchInputManager → main.ts → powerSystem.cycleSelected) */
    onCycleRequested: (() => void) | null = null;

    mount(parent: HTMLElement): void {
        if (this.rootEl) {
            console.warn('[SuperButton] already mounted');
            return;
        }

        this.rootEl = document.createElement('button');
        this.rootEl.type = 'button';
        this.rootEl.className = 'bt-super-button';
        this.rootEl.setAttribute('aria-label', 'Super shot — tap to activate, hold to switch');
        // Default icon = ⚡, replaced by setSelectedPower() per-frame
        this.rootEl.innerHTML = `<span class="bt-super-button-icon" aria-hidden="true">⚡</span>`;
        this.iconEl = this.rootEl.querySelector<HTMLElement>('.bt-super-button-icon');

        parent.appendChild(this.rootEl);
        this.wireEvents();
    }

    unmount(): void {
        if (!this.rootEl) return;
        this.releasePointer();
        this.clearLongPressTimer();
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
        this.clearLongPressTimer();
    }

    /**
     * Update visual state — called per-frame by TouchInputManager from main.ts.
     * No-op gdy stan nie zmienia się (DOM thrash unikany).
     */
    setHasCharges(hasCharges: boolean): void {
        if (this._hasCharges === hasCharges) return;
        this._hasCharges = hasCharges;
        if (this.rootEl) {
            this.rootEl.classList.toggle('is-charged', hasCharges);
        }
    }

    /**
     * v0.23.1: update icon dla aktualnie selected power.
     * Wywoluje TouchInputManager per-frame z POWERS[selectedPowerId].emoji.
     * No-op gdy emoji bez zmian.
     */
    setSelectedPower(emoji: string): void {
        if (!this.iconEl) return;
        if (this.iconEl.textContent === emoji) return;
        this.iconEl.textContent = emoji;
    }

    /**
     * Consume the edge-triggered super request.
     * Returns true if user tapped (short press, not long-press) since last consume.
     * Resets flag to false.
     */
    consumeRequest(): boolean {
        if (!this._requested) return false;
        this._requested = false;
        return true;
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

        // Reset long-press state
        this.wasLongPress = false;

        // v0.23.1: start long-press timer — if pointer held ≥500ms, cycle instead of activate
        this.longPressTimer = window.setTimeout(() => {
            this.wasLongPress = true;
            this.onCycleRequested?.();

            // Visual feedback dla long-press (krotkie pulse animation via klasa)
            this.rootEl?.classList.add('is-cycling');
            window.setTimeout(() => {
                this.rootEl?.classList.remove('is-cycling');
            }, 250);
        }, LONG_PRESS_MS);
    };

    private handlePointerUp = (e: PointerEvent): void => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();

        this.clearLongPressTimer();

        // Edge-triggered request — ONLY if to NIE byl long-press
        if (!this.wasLongPress) {
            this._requested = true;
            this.onRequest?.();
        }
        // (jesli wasLongPress, cycle juz wystrzelilo w timer callback — tu nic nie robimy)

        this.releasePointer();
    };

    private handlePointerCancel = (e: PointerEvent): void => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        this.clearLongPressTimer();
        // Cancel = NIE activate, NIE cycle (user gestured cancel, np. swipe poza button)
        this.releasePointer();
    };

    private clearLongPressTimer(): void {
        if (this.longPressTimer !== null) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

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