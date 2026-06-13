/**
 * TouchInputManager.ts — orchestrator dla touch UI (FAZA 8.5).
 *
 * v0.23.1 updates:
 *  - Left joystick: mode='floating' (Brawl Stars pattern — tap anywhere w lewej 40% zone → joystick teleports under finger)
 *  - Right joystick: mode='fixed' (aim precision wymaga stalej pozycji dla wizualnego sprzezenia palec→cel)
 *  - onCycleRequested callback (long-press SuperButton → cycle do next power)
 *  - updateSelectedPower(emoji) — forward selected power icon do SuperButton
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
    private superButton: SuperButton;

    /** Whether touch UI is active (detected as touch device OR forced). */
    readonly isActive: boolean;

    /** Edge-triggered super-shot tap (consumed by main.ts via consumeSuperRequest). */
    onSuperRequested: (() => void) | null = null;

    /** v0.23.1: long-press super button → cycle selected power. */
    onCycleRequested: (() => void) | null = null;

    constructor() {
        this.isActive = this.detectTouchDevice();
        // v0.23.1: left joystick = FLOATING (Brawl Stars pattern)
        this.moveJoystick = new VirtualJoystick('left', 'floating');
        // v0.23.1: right joystick = FIXED (aim precision)
        this.aimJoystick = new VirtualJoystick('right', 'fixed');
        this.superButton = new SuperButton();
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
        this.superButton.mount(this.rootEl);

        this.superButton.onRequest = () => {
            this.onSuperRequested?.();
        };

        this.superButton.onCycleRequested = () => {
            this.onCycleRequested?.();
        };

        this.hide();

        console.log('[TouchInput] initialized — left=floating, right=fixed');
    }

    show(): void {
        if (!this.isActive || !this.rootEl) return;
        this.rootEl.style.display = '';
        this.moveJoystick.show();
        this.aimJoystick.show();
        this.superButton.show();
    }

    hide(): void {
        if (!this.rootEl) return;
        this.rootEl.style.display = 'none';
        this.moveJoystick.hide();
        this.aimJoystick.hide();
        this.superButton.hide();
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

    consumeSuperRequest(): boolean {
        if (!this.isActive) return false;
        return this.superButton.consumeRequest();
    }

    updateSuperChargedVisual(hasCharges: boolean): void {
        if (!this.isActive) return;
        this.superButton.setHasCharges(hasCharges);
    }

    updateSelectedPower(emoji: string): void {
        if (!this.isActive) return;
        this.superButton.setSelectedPower(emoji);
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