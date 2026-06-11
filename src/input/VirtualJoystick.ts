/**
 * VirtualJoystick.ts — reusable touch joystick component (FAZA 8.5).
 *
 * Single class używana dla both:
 *  - Left joystick (movement) — TouchInputManager mapuje vector na Player.moveVector
 *  - Right joystick (aim+fire) — TouchInputManager mapuje vector na mouse position + isFiring
 *
 * Mechanics:
 *  - Pointer events (unified mouse/touch/pen via PointerEvent API)
 *  - setPointerCapture — kciuk może wyjść poza joystick bounds, tracking nie pęka
 *  - Knob clamped do circle (maxRadius = baseRadius - knobRadius)
 *  - Vector normalized -1..+1 (x,y) + magnitude 0..1
 *  - Snap-back to center after release
 *
 * Visual:
 *  - SVG base circle (translucent dark)
 *  - SVG knob circle (translucent gold)
 *  - Active state: brighter colors, subtle glow
 *
 * Layout:
 *  - position: fixed (mounted in #bt-touch-root)
 *  - side='left' → bottom-left corner z safe-area-insets
 *  - side='right' → bottom-right corner z safe-area-insets
 */

export type JoystickSide = 'left' | 'right';

export interface Vector2 {
    x: number;
    y: number;
}

export class VirtualJoystick {
    private rootEl: HTMLElement | null = null;
    private knobEl: HTMLElement | null = null;
    private pointerId: number | null = null;
    private side: JoystickSide;

    // Cached element-center positions (recalc on activate, not per-frame)
    private centerX: number = 0;
    private centerY: number = 0;
    private maxRadius: number = 0;

    /** Current normalized vector (-1..+1 for each axis). */
    vector: Vector2 = { x: 0, y: 0 };

    /** True gdy palec dotyka joysticka. */
    isActive: boolean = false;

    /** Normalized magnitude 0..1 (distance from center, clamped). */
    magnitude: number = 0;

    /** Optional callback hooks. */
    onActivate: (() => void) | null = null;
    onMove: ((v: Vector2) => void) | null = null;
    onRelease: (() => void) | null = null;

    constructor(side: JoystickSide) {
        this.side = side;
    }

    /** Mount joystick DOM into parent container. Idempotent — call unmount() first if remounting. */
    mount(parent: HTMLElement): void {
        if (this.rootEl) {
            console.warn('[VirtualJoystick] already mounted');
            return;
        }

        this.rootEl = document.createElement('div');
        this.rootEl.className = `bt-joystick bt-joystick--${this.side}`;
        this.rootEl.setAttribute('aria-hidden', 'true');

        this.rootEl.innerHTML = `
            <div class="bt-joystick-base"></div>
            <div class="bt-joystick-knob"></div>
        `;

        this.knobEl = this.rootEl.querySelector<HTMLElement>('.bt-joystick-knob');

        parent.appendChild(this.rootEl);
        this.wireEvents();
    }

    unmount(): void {
        if (!this.rootEl) return;
        this.releasePointer();
        this.rootEl.remove();
        this.rootEl = null;
        this.knobEl = null;
    }

    /** Show joystick (call when game starts). */
    show(): void {
        if (this.rootEl) this.rootEl.style.display = '';
    }

    /** Hide joystick (call when returning to menu / game over). */
    hide(): void {
        if (this.rootEl) this.rootEl.style.display = 'none';
        this.releasePointer();
    }

    // === Internal: event wiring ===

    private wireEvents(): void {
        if (!this.rootEl) return;

        this.rootEl.addEventListener('pointerdown', this.handlePointerDown);
        this.rootEl.addEventListener('pointermove', this.handlePointerMove);
        this.rootEl.addEventListener('pointerup', this.handlePointerUp);
        this.rootEl.addEventListener('pointercancel', this.handlePointerUp);
        // Prevent context menu on long-press (mobile Safari shows magnifier otherwise)
        this.rootEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    private handlePointerDown = (e: PointerEvent): void => {
        if (!this.rootEl || this.pointerId !== null) return; // ignore second finger
        e.preventDefault();

        this.pointerId = e.pointerId;
        this.rootEl.setPointerCapture(e.pointerId);

        // Cache center based on current element position (handles resize/orientation change)
        const rect = this.rootEl.getBoundingClientRect();
        this.centerX = rect.left + rect.width / 2;
        this.centerY = rect.top + rect.height / 2;

        // maxRadius = how far knob center can move from base center.
        // Base is rect.width (e.g. 120px); knob is ~40% of that (visible in CSS).
        // Conservative: leave room so knob doesn't visually escape base.
        this.maxRadius = rect.width * 0.36;

        this.isActive = true;
        this.rootEl.classList.add('is-active');

        // Update immediately so first contact registers vector (no dead first frame)
        this.updateVector(e.clientX, e.clientY);
        this.onActivate?.();
    };

    private handlePointerMove = (e: PointerEvent): void => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        this.updateVector(e.clientX, e.clientY);
        this.onMove?.(this.vector);
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
        this.isActive = false;
        this.vector.x = 0;
        this.vector.y = 0;
        this.magnitude = 0;

        if (this.rootEl) this.rootEl.classList.remove('is-active');
        if (this.knobEl) this.knobEl.style.transform = '';

        this.onRelease?.();
    }

    private updateVector(clientX: number, clientY: number): void {
        if (!this.knobEl) return;

        const dx = clientX - this.centerX;
        const dy = clientY - this.centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.01) {
            // Direct hit on center → vector zero, knob centered
            this.vector.x = 0;
            this.vector.y = 0;
            this.magnitude = 0;
            this.knobEl.style.transform = '';
            return;
        }

        const clampedDist = Math.min(dist, this.maxRadius);
        const angle = Math.atan2(dy, dx);

        // Knob visual position (clamped to circle radius)
        const knobX = Math.cos(angle) * clampedDist;
        const knobY = Math.sin(angle) * clampedDist;
        this.knobEl.style.transform = `translate(${knobX}px, ${knobY}px)`;

        // Normalized vector for gameplay consumption
        const normalized = clampedDist / this.maxRadius;
        this.vector.x = Math.cos(angle) * normalized;
        this.vector.y = Math.sin(angle) * normalized;
        this.magnitude = normalized;
    }
}