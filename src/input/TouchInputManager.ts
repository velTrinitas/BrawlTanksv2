/**
 * TouchInputManager.ts — orchestrator dla touch UI (FAZA 8.5).
 *
 * Owija 2 instancje VirtualJoystick + SuperButton, wystawia clean API dla main.ts.
 *
 * Detection priority (highest wins):
 *  1. URL param ?touch=force / ?touch=never (dev override)
 *  2. localStorage 'bt2:forceTouch' = '1' / '0' (persistent dev override)
 *  3. Auto-detect: 'ontouchstart' in window || navigator.maxTouchPoints > 0
 *
 * Lifecycle:
 *  - constructor → detection (synchronous, no DOM yet)
 *  - init() → tworzy #bt-touch-root w body, mounts joysticki + button (hidden)
 *  - show() → reveals UI (call from main.ts startGame)
 *  - hide() → hides UI (call from main.ts returnToMenuFromEnd / triggerGameOver / triggerVictory)
 *  - destroy() → cleanup (not used currently, gra ma single touchManager instance for app lifetime)
 *
 * Bridge API (main.ts czyta state per-frame):
 *  - moveVector: {x, y} | null — left joystick (use w Player.update jako moveVector arg)
 *  - aimVector: {x, y} | null — right joystick direction (main.ts liczy fake mouse position)
 *  - isFiring: boolean — true gdy right joystick aktywny (continuous fire B1)
 *  - consumeSuperRequest(): boolean — edge-triggered super-shot tap
 *  - updateSuperChargedVisual(hasCharges) — feed player state back do UI
 *
 * Layout (CSS in section 27):
 *   ┌──────────────────────────────────┐
 *   │              [SUPER]             │ ← above aim, bottom-right area
 *   │              [AIM ]              │
 *   │   [MOVE]                         │
 *   └──────────────────────────────────┘
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

    constructor() {
        this.isActive = this.detectTouchDevice();
        this.moveJoystick = new VirtualJoystick('left');
        this.aimJoystick = new VirtualJoystick('right');
        this.superButton = new SuperButton();
    }

    /**
     * Initialize touch UI in DOM.
     * Safe to call on non-touch devices (returns early — no DOM created).
     * main.ts wywołuje na boot, niezależnie od isActive.
     */
    init(): void {
        if (!this.isActive) {
            console.log('[TouchInput] non-touch device — UI not initialized');
            return;
        }

        // Create root container — covers viewport, pointer-events: none default
        // (individual UI elements re-enable pointer-events via CSS)
        this.rootEl = document.createElement('div');
        this.rootEl.id = 'bt-touch-root';
        this.rootEl.className = 'bt-touch-root';
        this.rootEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.rootEl);

        this.moveJoystick.mount(this.rootEl);
        this.aimJoystick.mount(this.rootEl);
        this.superButton.mount(this.rootEl);

        // Wire super button → external callback (main.ts.tryActivateSuper)
        this.superButton.onRequest = () => {
            this.onSuperRequested?.();
        };

        // Hide by default — gra musi explicitly call show()
        this.hide();

        console.log('[TouchInput] initialized (touch UI ready)');
    }

    /** Show touch UI overlay — call when game starts (gameState → PLAYING). */
    show(): void {
        if (!this.isActive || !this.rootEl) return;
        this.rootEl.style.display = '';
        this.moveJoystick.show();
        this.aimJoystick.show();
        this.superButton.show();
    }

    /** Hide touch UI overlay — call when returning to menu / game over / victory. */
    hide(): void {
        if (!this.rootEl) return;
        this.rootEl.style.display = 'none';
        this.moveJoystick.hide();
        this.aimJoystick.hide();
        this.superButton.hide();
    }

    // === Bridge API for main.ts gameLoop ===

    /**
     * Current move vector from left joystick.
     * Returns null gdy joystick nie aktywny (main.ts wtedy używa keys.wasd fallback).
     */
    get moveVector(): Vector2 | null {
        if (!this.isActive) return null;
        if (!this.moveJoystick.isActive) return null;
        // Guard: tiny deadzone (avoids drift on resting fingers)
        if (this.moveJoystick.magnitude < 0.1) return null;
        return this.moveJoystick.vector;
    }

    /**
     * Current aim vector from right joystick.
     * Returns null gdy joystick nie aktywny (main.ts wtedy zachowuje istniejący mouse position).
     */
    get aimVector(): Vector2 | null {
        if (!this.isActive) return null;
        if (!this.aimJoystick.isActive) return null;
        if (this.aimJoystick.magnitude < 0.1) return null;
        return this.aimJoystick.vector;
    }

    /**
     * True gdy gracz chce strzelać (right joystick aktywny per decyzja B1: aim+fire łączone).
     * main.ts ustawia isMouseDown = this.isFiring podczas gameLoop.
     */
    get isFiring(): boolean {
        if (!this.isActive) return false;
        return this.aimJoystick.isActive && this.aimJoystick.magnitude > 0.1;
    }

    /**
     * Consume edge-triggered super-shot tap.
     * main.ts wywołuje per-frame: if consumeSuperRequest() tryActivateSuper().
     */
    consumeSuperRequest(): boolean {
        if (!this.isActive) return false;
        return this.superButton.consumeRequest();
    }

    /**
     * Update super button visual state.
     * main.ts wywołuje per-frame: touchManager.updateSuperChargedVisual(player.superCharges > 0).
     */
    updateSuperChargedVisual(hasCharges: boolean): void {
        if (!this.isActive) return;
        this.superButton.setHasCharges(hasCharges);
    }

    // === Internal ===

    /**
     * Detect touch device via 3-tier priority:
     * 1. URL param ?touch=force/never (dev override)
     * 2. localStorage 'bt2:forceTouch' = '1'/'0' (persistent dev override)
     * 3. Auto: ontouchstart || maxTouchPoints
     */
    private detectTouchDevice(): boolean {
        // 1. URL param
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
            // URLSearchParams or location may fail in some sandboxes — fall through
        }

        // 2. localStorage persistent override
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

        // 3. Auto-detect
        const hasOnTouchStart = 'ontouchstart' in window;
        const hasMaxTouchPoints = navigator.maxTouchPoints > 0;
        const isTouch = hasOnTouchStart || hasMaxTouchPoints;
        console.log(`[TouchInput] auto-detect: touch=${isTouch} (ontouchstart=${hasOnTouchStart}, maxTouchPoints=${navigator.maxTouchPoints})`);
        return isTouch;
    }
}