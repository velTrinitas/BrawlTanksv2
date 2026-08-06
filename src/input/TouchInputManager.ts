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

export class TouchInputManager {
    private rootEl: HTMLElement | null = null;
    private moveJoystick: VirtualJoystick;
    private aimJoystick: VirtualJoystick;
    /** PROG-F7a: dwa przyciski = dwa sloty loadoutu (index 0/1). */
    private superButtons: [SuperButton, SuperButton];

    /** Whether touch UI is active (detected as touch device OR forced). */
    readonly isActive: boolean;

    /** F7a: tap przycisku slotu → aktywacja mocy z tego slotu (JEDYNA sciezka aktywacji). */
    onSuperRequested: ((slot: 0 | 1) => void) | null = null;

    constructor() {
        this.isActive = this.detectTouchDevice();
        // v0.23.1: left joystick = FLOATING (Brawl Stars pattern)
        this.moveJoystick = new VirtualJoystick('left', 'floating');
        // v0.23.1: right joystick = FIXED (aim precision)
        this.aimJoystick = new VirtualJoystick('right', 'fixed');
        this.superButtons = [new SuperButton(0), new SuperButton(1)];
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
        for (const [i, btn] of this.superButtons.entries()) {
            btn.mount(this.rootEl);
            btn.onRequest = () => this.onSuperRequested?.(i as 0 | 1);
        }

        this.hide();

        console.log('[TouchInput] initialized — left=floating, right=fixed, 2 super slots');
    }

    show(): void {
        if (!this.isActive || !this.rootEl) return;
        this.rootEl.style.display = '';
        this.moveJoystick.show();
        this.aimJoystick.show();
        for (const btn of this.superButtons) btn.show();
    }

    hide(): void {
        if (!this.rootEl) return;
        this.rootEl.style.display = 'none';
        this.moveJoystick.hide();
        this.aimJoystick.hide();
        for (const btn of this.superButtons) btn.hide();
    }

    // === Bridge API for main.ts gameLoop ===

    get moveVector(): Vector2 | null {
        if (!this.isActive) return null;
        if (!this.moveJoystick.isActive) return null;
        if (this.moveJoystick.magnitude < 0.1) return null;
        return this.moveJoystick.vector;
    }

    get aimVector(): Vector2 | null {
        if (!this.isActive) return null;
        if (!this.aimJoystick.isActive) return null;
        if (this.aimJoystick.magnitude < 0.1) return null;
        return this.aimJoystick.vector;
    }

    get isFiring(): boolean {
        if (!this.isActive) return false;
        return this.aimJoystick.isActive && this.aimJoystick.magnitude > 0.1;
    }

    /** F7a: charged glow per slot (wolane per-frame z main.ts; no-op wewnatrz przy braku zmiany). */
    updateSuperChargedVisual(slot: 0 | 1, charged: boolean): void {
        if (!this.isActive) return;
        this.superButtons[slot].setCharged(charged);
    }

    /** F7a: ikony mocy z loadoutu — RAZ na mecz (startGame), nie per-frame. */
    setSlotPowers(emojis: [string, string]): void {
        if (!this.isActive) return;
        this.superButtons[0].setPowerIcon(emojis[0]);
        this.superButtons[1].setPowerIcon(emojis[1]);
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