/**
 * DashButton.ts — przycisk DASHA (BALANCE_V2 S3, Shadow).
 *
 * Wzorzec 1:1 z `SuperButton`: pointer capture, `stopPropagation` (zeby tap nie uruchomil
 * plywajacego joysticka pod spodem), cache stanu DOM (zero thrashu przy 60 fps), zegar
 * conic-gradient + sekundy na cooldownie.
 *
 * POZYCJA: LEWA strona, lustrzanie do slotu kostki. Prawy dolny luk jest juz zajety przez
 * 3 sloty mocy — czwarty przycisk tam nie zmiesci sie przy 375 px. Lewa strona jest tez
 * uczciwsza ergonomicznie: dash to RUCH (ucieczka), a ruchem steruje lewy kciuk.
 *
 * WIDOCZNY TYLKO gdy gracz ma dash (Shadow w rulesecie v2) — przy `?bal=0` nie istnieje w DOM-ie.
 */
export class DashButton {
    private rootEl: HTMLButtonElement | null = null;
    private cdSweepEl: HTMLElement | null = null;
    private cdTextEl: HTMLElement | null = null;
    private pointerId: number | null = null;

    private lastCdPct = -1;
    private lastCdSecs = -1;
    private _visible = false;

    onRequest: (() => void) | null = null;

    mount(parent: HTMLElement): void {
        if (this.rootEl) return;
        this.rootEl = document.createElement('button');
        this.rootEl.type = 'button';
        this.rootEl.className = 'bt-dash-button';
        this.rootEl.setAttribute('aria-label', 'Dash — tap to dash');
        this.rootEl.innerHTML = `
            <span class="bt-dash-button-icon" aria-hidden="true">💨</span>
            <div class="bt-super-button-cd" aria-hidden="true"></div>
            <span class="bt-super-button-cd-text" aria-hidden="true"></span>
        `;
        this.cdSweepEl = this.rootEl.querySelector<HTMLElement>('.bt-super-button-cd');
        this.cdTextEl = this.rootEl.querySelector<HTMLElement>('.bt-super-button-cd-text');
        this.rootEl.style.display = 'none';   // domyslnie ukryty — pokazuje go dopiero setVisible(true)
        parent.appendChild(this.rootEl);

        this.rootEl.addEventListener('pointerdown', this.onDown);
        this.rootEl.addEventListener('pointerup', this.onUp);
        this.rootEl.addEventListener('pointercancel', this.onCancel);
        this.rootEl.addEventListener('contextmenu', e => e.preventDefault());
    }

    unmount(): void {
        if (!this.rootEl) return;
        this.release();
        this.rootEl.remove();
        this.rootEl = null;
        this.cdSweepEl = null;
        this.cdTextEl = null;
    }

    /** Czolg bez dasha = przycisku nie ma wcale (a nie „jest, ale nie dziala"). */
    setVisible(on: boolean): void {
        if (this._visible === on) return;
        this._visible = on;
        if (this.rootEl) this.rootEl.style.display = on ? '' : 'none';
    }

    show(): void { if (this.rootEl && this._visible) this.rootEl.style.display = ''; }
    hide(): void { if (this.rootEl) this.rootEl.style.display = 'none'; this.release(); }

    /** `progress` 0..1 = ile odnowienia ZOSTALO; 0 chowa zegar i rozjasnia przycisk. */
    setCooldown(progress: number, secsLeft: number): void {
        if (!this.rootEl || !this.cdSweepEl || !this.cdTextEl) return;
        if (progress <= 0) {
            if (this.lastCdPct !== 0) {
                this.lastCdPct = 0;
                this.lastCdSecs = -1;
                this.rootEl.classList.remove('has-cd');
                this.rootEl.classList.add('is-charged');
            }
            return;
        }
        const pct = Math.min(100, Math.max(1, Math.round(progress * 100)));
        if (this.lastCdPct <= 0) {
            this.rootEl.classList.add('has-cd');
            this.rootEl.classList.remove('is-charged');
        }
        if (pct !== this.lastCdPct) {
            this.lastCdPct = pct;
            this.cdSweepEl.style.background =
                `conic-gradient(rgba(0,0,0,0.55) 0turn ${pct / 100}turn, transparent ${pct / 100}turn)`;
        }
        const secs = Math.max(1, Math.ceil(secsLeft));
        if (secs !== this.lastCdSecs) {
            this.lastCdSecs = secs;
            this.cdTextEl.textContent = String(secs);
        }
    }

    private onDown = (e: PointerEvent): void => {
        if (!this.rootEl || this.pointerId !== null) return;
        e.preventDefault();
        e.stopPropagation();          // bez tego tap w przycisk rozwinalby plywajacy joystick
        this.pointerId = e.pointerId;
        // Capture bywa niedostepny (pointer juz zwolniony przez przegladarke, zdarzenia syntetyczne):
        // brak capture to gorszy UX przy zjechaniu palcem, ale NIE powod, zeby dash nie zadzialal.
        try { this.rootEl.setPointerCapture(e.pointerId); } catch { /* bez capture — tap dalej dziala */ }
        this.rootEl.classList.add('is-pressed');
    };

    private onUp = (e: PointerEvent): void => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        this.onRequest?.();
        this.release();
    };

    private onCancel = (e: PointerEvent): void => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        this.release();               // gest anulowany = brak dasha (jak przy SuperButton)
    };

    private release(): void {
        if (this.pointerId !== null && this.rootEl) {
            try { this.rootEl.releasePointerCapture(this.pointerId); } catch { /* juz zwolniony */ }
        }
        this.pointerId = null;
        this.rootEl?.classList.remove('is-pressed');
    }
}
