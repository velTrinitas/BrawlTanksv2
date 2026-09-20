/**
 * TouchInputManager.ts — orchestrator dla touch UI (FAZA 8.5).
 *
 * v0.23.1 updates:
 *  - Left joystick: mode='floating' (Brawl Stars pattern — tap anywhere w lewej 40% zone → joystick teleports under finger)
 *  - Right joystick: mode='fixed' (aim precision wymaga stalej pozycji dla wizualnego sprzezenia palec→cel)
 *
 * PROG-F7a: DWA przyciski super mocy = dwa sloty loadoutu (long-press cycle usuniety).
 * Aktywacja wylacznie callbackiem onSuperRequested(slot) — jedna sciezka.
 *
 * Detection priority (highest wins):
 *  1. URL param ?touch=force / ?touch=never (dev override)
 *  2. localStorage 'bt2:forceTouch' = '1' / '0' (persistent dev override)
 *  3. Auto-detect: 'ontouchstart' in window || navigator.maxTouchPoints > 0
 *
 * Layout (CSS section 27):
 *   ┌──────────────────────────────────┐
 *   │                       [SUPER]    │
 *   │                       [AIM ]     │
 *   │ [MOVE]                           │
 *   └──────────────────────────────────┘
 *   ← left zone (40%) → ← buffer (20%) → ← right (40%) →
 *      tap anywhere                          aim sticks here
 */

import { VirtualJoystick, type Vector2 } from './VirtualJoystick';
import { SuperButton } from './SuperButton';
import { DashButton } from './DashButton';   // BALANCE_V2 S3 — dash Shadowa

export class TouchInputManager {
    private rootEl: HTMLElement | null = null;
    private moveJoystick: VirtualJoystick;
    private aimJoystick: VirtualJoystick;
    /** PROG-F7a: przyciski slotow (0/1) + v0.114.0 kostka 🎲 (index 2, per-mecz). */
    private superButtons: [SuperButton, SuperButton, SuperButton];
    private dashButton: DashButton;

    /** v0.114.0: czy slot 🎲 aktywny w biezacym meczu (toggle "Szalone Moce" w Garazu). */
    private diceEnabled: boolean = false;

    /** Whether touch UI is active (detected as touch device OR forced). */
    readonly isActive: boolean;

    /** F7a: tap przycisku slotu → aktywacja mocy z tego slotu (JEDYNA sciezka aktywacji). */
    onSuperRequested: ((slot: 0 | 1 | 2) => void) | null = null;
    /** BALANCE_V2 S3: tap w przycisk dasha (tylko gdy widoczny). */
    onDashRequested: (() => void) | null = null;

    // ── SigmaTester (J6): wstrzykiwanie inputu przez TE SAME gettery, ktore czyta main.ts ──
    // Bot nie symuluje dotyku; podaje gotowe wektory. undefined = nie ruszaj tego kanalu.
    private injMove: Vector2 | null | undefined = undefined;
    private injAim: Vector2 | null | undefined = undefined;
    private injFire: boolean | undefined = undefined;
    inject(move?: Vector2 | null, aim?: Vector2 | null, fire?: boolean): void {
        if (move !== undefined) this.injMove = move;
        if (aim !== undefined) this.injAim = aim;
        if (fire !== undefined) this.injFire = fire;
    }
    injectClear(): void { this.injMove = undefined; this.injAim = undefined; this.injFire = undefined; }

    constructor() {
        this.isActive = this.detectTouchDevice();
        // v0.23.1: left joystick = FLOATING (Brawl Stars pattern)
        this.moveJoystick = new VirtualJoystick('left', 'floating');
        // v0.23.1: right joystick = FIXED (aim precision)
        this.aimJoystick = new VirtualJoystick('right', 'fixed');
        this.superButtons = [new SuperButton(0), new SuperButton(1), new SuperButton(2)];
        this.dashButton = new DashButton();
    }

    init(): void {
        if (!this.isActive) {
            console.log('[TouchInput] non-touch device — UI not initialized');
            return;
        }

        this.rootEl = document.createElement('div');
        this.rootEl.id = 'bt-touch-root';
        this.rootEl.className = 'bt-touch-root';
        this.rootEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.rootEl);

        this.moveJoystick.mount(this.rootEl);
        this.aimJoystick.mount(this.rootEl);
        // Slot 1 montowany PIERWSZY (tutorial ringSelector '.bt-super-button--slot1').
        // Kostka (index 2) montowana ZAWSZE, pokazywana per mecz (setDiceEnabled).
        for (const [i, btn] of this.superButtons.entries()) {
            btn.mount(this.rootEl);
            btn.onRequest = () => this.onSuperRequested?.(i as 0 | 1 | 2);
        }
        this.dashButton.mount(this.rootEl);
        this.dashButton.onRequest = () => this.onDashRequested?.();

        this.hide();

        console.log('[TouchInput] initialized — left=floating, right=fixed, 2 super slots + dice');
    }

    show(): void {
        if (!this.isActive || !this.rootEl) return;
        this.rootEl.style.display = '';
        this.moveJoystick.show();
        this.aimJoystick.show();
        for (const btn of this.superButtons) btn.show();
        this.dashButton.show();
    }

    hide(): void {
        if (!this.rootEl) return;
        this.rootEl.style.display = 'none';
        this.moveJoystick.hide();
        this.aimJoystick.hide();
        for (const btn of this.superButtons) btn.hide();
        this.dashButton.hide();
    }

    // === Bridge API for main.ts gameLoop ===

    get moveVector(): Vector2 | null {
        if (this.injMove !== undefined) return this.injMove;
        if (!this.isActive) return null;
        if (!this.moveJoystick.isActive) return null;
        if (this.moveJoystick.magnitude < 0.1) return null;
        return this.moveJoystick.vector;
    }

    get aimVector(): Vector2 | null {
        if (this.injAim !== undefined) return this.injAim;
        if (!this.isActive) return null;
        if (!this.aimJoystick.isActive) return null;
        if (this.aimJoystick.magnitude < 0.1) return null;
        return this.aimJoystick.vector;
    }

    get isFiring(): boolean {
        if (this.injFire !== undefined) return this.injFire;
        if (!this.isActive) return false;
        return this.aimJoystick.isActive && this.aimJoystick.magnitude > 0.1;
    }

    /** F7a: charged glow per slot (wolane per-frame z main.ts; no-op wewnatrz przy braku zmiany). */
    updateSuperChargedVisual(slot: 0 | 1 | 2, charged: boolean): void {
        if (!this.isActive) return;
        this.superButtons[slot].setCharged(charged);
    }

    /**
     * v0.108.0: licznik cooldownu NA przycisku (mobile nie ma paska HUD) — wolane
     * per-frame z main.ts; SuperButton wewnetrznie thrash-guarduje DOM.
     */
    /**
     * BALANCE_V2 S3 — stan przycisku dasha, wolane per-frame z main.ts (DashButton
     * thrash-guarduje DOM wewnetrznie). `visible=false` = czolg bez dasha: przycisku NIE MA,
     * zamiast martwej kontrolki w kadrze.
     */
    updateDashState(visible: boolean, progress: number, secsLeft: number): void {
        if (!this.isActive) return;
        this.dashButton.setVisible(visible);
        if (visible) this.dashButton.setCooldown(progress, secsLeft);
    }

    updateSuperCooldown(slot: 0 | 1 | 2, progress: number, secsLeft: number): void {
        if (!this.isActive) return;
        this.superButtons[slot].setCooldown(progress, secsLeft);
    }

    /** F7a: ikony mocy z loadoutu (v0.114.0: 3 sloty) — RAZ na mecz (startGame), nie per-frame. */
    setSlotPowers(emojis: [string, string, string]): void {
        if (!this.isActive) return;
        this.superButtons[0].setPowerIcon(emojis[0]);
        this.superButtons[1].setPowerIcon(emojis[1]);
        this.superButtons[2].setPowerIcon(emojis[2]);
    }

    /**
     * v0.114.0: kostka 🎲 per mecz (toggle "Szalone Moce" w Garazu). Przycisk 3 jest
     * ZAWSZE widoczny (3 sloty) — flaga przelacza tylko wyroznienie kostki (fioletowy
     * shimmer-ring + badge 🎲, klasa CSS na przycisku).
     */
    setDiceEnabled(on: boolean): void {
        if (!this.isActive) return;
        this.diceEnabled = on;
        this.superButtons[2].setDiceStyle(on);
    }

    /**
     * v0.114.0: ikona kostki per-frame — emoji wylosowanej mocy podczas cooldownu,
     * 🎲 gdy gotowa (Czytelnosc: dziecko widzi co wypadlo). setPowerIcon ma thrash-guard.
     */
    setDiceIcon(emoji: string): void {
        if (!this.isActive) return;
        this.superButtons[2].setPowerIcon(emoji);
    }

    // === Internal ===

    private detectTouchDevice(): boolean {
        try {
            const params = new URLSearchParams(window.location.search);
            const touchParam = params.get('touch');
            if (touchParam === 'force') {
                console.log('[TouchInput] forced via URL ?touch=force');
                return true;
            }
            if (touchParam === 'never') {
                console.log('[TouchInput] disabled via URL ?touch=never');
                return false;
            }
        } catch {
            // URLSearchParams may fail in some sandboxes — fall through
        }

        try {
            const stored = localStorage.getItem('bt2:forceTouch');
            if (stored === '1') {
                console.log('[TouchInput] forced via localStorage bt2:forceTouch=1');
                return true;
            }
            if (stored === '0') {
                console.log('[TouchInput] disabled via localStorage bt2:forceTouch=0');
                return false;
            }
        } catch {
            // localStorage may be blocked — fall through
        }

        const hasOnTouchStart = 'ontouchstart' in window;
        const hasMaxTouchPoints = navigator.maxTouchPoints > 0;
        const isTouch = hasOnTouchStart || hasMaxTouchPoints;
        console.log(`[TouchInput] auto-detect: touch=${isTouch} (ontouchstart=${hasOnTouchStart}, maxTouchPoints=${navigator.maxTouchPoints})`);
        return isTouch;
    }
}