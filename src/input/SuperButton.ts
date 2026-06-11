/**
 * SuperButton.ts — dedicated tappable button dla super-shot trigger (FAZA 8.5).
 *
 * Pozycja: bottom-right corner, above-and-left od right joystick.
 * Visual: gold gradient button z lightning bolt icon (60-80px).
 *
 * Mechanika:
 *  - Tap (pointerdown) → trigger superRequested flag (edge-triggered, consumed by main.ts)
 *  - Hold NIE powtarza triggera (single tap = single super activation attempt)
 *  - Visual feedback gdy player.superCharges > 0:
 *    - Pulsing gold glow animation (matches super-shot visual language)
 *    - Active state: brighter tint when pressed
 *  - Gdy charges == 0: dimmed/grayed out, tap nadal "działa" (main.ts ignoruje
 *    bo PowerSystem.activate() weryfikuje warunki — UI nie musi dublować logic)
 *
 * UX rationale:
 *  - Tap-only (no long-press) — dzieciaki nie muszą się uczyć złożonych gestów
 *  - Edge-triggered — żaden mash spam nie psuje gameplay
 *  - Auto-disable visual to discoverable feedback ("dlaczego button szary?")
 */

export class SuperButton {
    // FAZA 8.5 fix: HTMLButtonElement (not generic HTMLElement) so .type assignment compiles
    private rootEl: HTMLButtonElement | null = null;
    private pointerId: number | null = null;

    /** Edge-triggered flag — true on tap, reset by consumeRequest(). */
    private _requested: boolean = false;

    /** Whether button is visually enabled (charges > 0). Set externally by TouchInputManager. */
    private _hasCharges: boolean = false;

    onRequest: (() => void) | null = null;

    mount(parent: HTMLElement): void {
        if (this.rootEl) {
            console.warn('[SuperButton] already mounted');
            return;
        }

        this.rootEl = document.createElement('button');
        this.rootEl.type = 'button';
        this.rootEl.className = 'bt-super-button';
        this.rootEl.setAttribute('aria-label', 'Super shot');
        this.rootEl.innerHTML = `<span class="bt-super-button-icon" aria-hidden="true">⚡</span>`;

        parent.appendChild(this.rootEl);
        this.wireEvents();
    }

    unmount(): void {
        if (!this.rootEl) return;
        this.releasePointer();
        this.rootEl.remove();
        this.rootEl = null;
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
     * No-op gdy stan nie zmienia się (CSS class toggle is cheap, ale unikamy DOM thrash).
     */
    setHasCharges(hasCharges: boolean): void {
        if (this._hasCharges === hasCharges) return;
        this._hasCharges = hasCharges;
        if (this.rootEl) {
            this.rootEl.classList.toggle('is-charged', hasCharges);
        }
    }

    /**
     * Consume the edge-triggered super request.
     * Returns true if user tapped since last consume; resets flag to false.
     * main.ts wywołuje per-frame w gameLoop.
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
        this.rootEl.addEventListener('pointercancel', this.handlePointerUp);
        this.rootEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    private handlePointerDown = (e: PointerEvent): void => {
        if (!this.rootEl || this.pointerId !== null) return;
        e.preventDefault();
        e.stopPropagation(); // don't propagate to joystick if overlap

        this.pointerId = e.pointerId;
        this.rootEl.setPointerCapture(e.pointerId);
        this.rootEl.classList.add('is-pressed');

        // Edge-triggered request — set flag, main.ts will consume per-frame
        this._requested = true;
        this.onRequest?.();
    };

    private handlePointerUp = (e: PointerEvent): void => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
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