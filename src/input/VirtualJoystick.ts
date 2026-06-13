/**
 * VirtualJoystick.ts — reusable touch joystick component (FAZA 8.5 + v0.23.1 floating mode).
 *
 * Two modes:
 *  - 'fixed' (default) — joystick at home position, tap MUST hit base circle
 *  - 'floating' (v0.23.1, Brawl Stars pattern) — joystick teleports under finger when user
 *    taps anywhere in the activation zone; returns to home position on release
 *
 * Mechanics:
 *  - Pointer events (unified mouse/touch/pen via PointerEvent API)
 *  - setPointerCapture — kciuk może wyjść poza joystick bounds, tracking nie pęka
 *  - Knob clamped do circle (maxRadius = baseRadius * 0.36)
 *  - Vector normalized -1..+1 (x,y) + magnitude 0..1
 *  - Snap-back to center after release
 *
 * Visual:
 *  - SVG base circle (translucent dark)
 *  - SVG knob circle (translucent gold)
 *  - Active state: brighter colors, subtle glow
 *
 * Activation zone (floating only):
 *  - Left joystick: lewa 40% szerokości × pełna wysokość
 *  - Right joystick: prawa 40% × pełna wysokość (if ever needed — currently only left uses floating)
 *  - Center 20% buffer protects aim joystick + super button from misfires
 */

export type JoystickSide = 'left' | 'right';
export type JoystickMode = 'fixed' | 'floating';

export interface Vector2 {
    x: number;
    y: number;
}

// v0.23.1: activation zone width for floating mode (40% of viewport width)
const FLOATING_ZONE_WIDTH_FRACTION = 0.40;

export class VirtualJoystick {
    private rootEl: HTMLElement | null = null;
    private knobEl: HTMLElement | null = null;
    private activationZoneEl: HTMLElement | null = null;
    private pointerId: number | null = null;
    private side: JoystickSide;
    private mode: JoystickMode;

    // Cached element-center positions (recalc on activate, not per-frame)
    private centerX: number = 0;
    private centerY: number = 0;
    private maxRadius: number = 0;

    // v0.23.1: floating mode — home position (CSS-defined) vs current position
    private homePositionStyle: { left?: string; right?: string; bottom?: string; top?: string } = {};

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

    constructor(side: JoystickSide, mode: JoystickMode = 'fixed') {
        this.side = side;
        this.mode = mode;
    }

    /** Mount joystick DOM into parent container. Idempotent — call unmount() first if remounting. */
    mount(parent: HTMLElement): void {
        if (this.rootEl) {
            console.warn('[VirtualJoystick] already mounted');
            return;
        }

        // v0.23.1: floating mode dorzuca dodatkowy invisible activation zone
        // covering 40% width × 100% height of viewport on the joystick's side
        if (this.mode === 'floating') {
            this.activationZoneEl = document.createElement('div');
            this.activationZoneEl.className = `bt-joystick-zone bt-joystick-zone--${this.side}`;
            this.activationZoneEl.setAttribute('aria-hidden', 'true');
            parent.appendChild(this.activationZoneEl);
        }

        this.rootEl = document.createElement('div');
        this.rootEl.className = `bt-joystick bt-joystick--${this.side} bt-joystick--${this.mode}`;
        this.rootEl.setAttribute('aria-hidden', 'true');

        this.rootEl.innerHTML = `
            <div class="bt-joystick-base"></div>
            <div class="bt-joystick-knob"></div>
        `;

        this.knobEl = this.rootEl.querySelector<HTMLElement>('.bt-joystick-knob');

        parent.appendChild(this.rootEl);

        // Cache home position from CSS (computed style w runtime)
        this.cacheHomePosition();

        this.wireEvents();
    }

    private cacheHomePosition(): void {
        if (!this.rootEl) return;
        const computed = window.getComputedStyle(this.rootEl);
        this.homePositionStyle = {
            left: computed.left,
            right: computed.right,
            bottom: computed.bottom,
            top: computed.top,
        };
    }

    unmount(): void {
        if (!this.rootEl) return;
        this.releasePointer();
        if (this.activationZoneEl) {
            this.activationZoneEl.remove();
            this.activationZoneEl = null;
        }
        this.rootEl.remove();
        this.rootEl = null;
        this.knobEl = null;
    }

    /** Show joystick (call when game starts). */
    show(): void {
        if (this.rootEl) this.rootEl.style.display = '';
        if (this.activationZoneEl) this.activationZoneEl.style.display = '';
    }

    /** Hide joystick (call when returning to menu / game over). */
    hide(): void {
        if (this.rootEl) this.rootEl.style.display = 'none';
        if (this.activationZoneEl) this.activationZoneEl.style.display = 'none';
        this.releasePointer();
    }

    // === Internal: event wiring ===

    private wireEvents(): void {
        if (!this.rootEl) return;

        // v0.23.1: floating mode — pointer events na BOTH activation zone i joystick base.
        // 'fixed' mode — tylko joystick base (legacy behavior).
        const targets: HTMLElement[] = [this.rootEl];
        if (this.activationZoneEl) {
            targets.push(this.activationZoneEl);
        }

        for (const target of targets) {
            target.addEventListener('pointerdown', this.handlePointerDown);
            target.addEventListener('pointermove', this.handlePointerMove);
            target.addEventListener('pointerup', this.handlePointerUp);
            target.addEventListener('pointercancel', this.handlePointerUp);
            target.addEventListener('contextmenu', (e) => e.preventDefault());
        }
    }

    private handlePointerDown = (e: PointerEvent): void => {
        if (!this.rootEl || this.pointerId !== null) return; // ignore second finger
        e.preventDefault();

        this.pointerId = e.pointerId;

        // v0.23.1 floating mode: teleport joystick under finger on first touch
        if (this.mode === 'floating') {
            this.repositionUnderFinger(e.clientX, e.clientY);
        }

        // setPointerCapture on rootEl (joystick itself), nie na activation zone —
        // żeby move events docierały do joystick regardless of where finger drags.
        this.rootEl.setPointerCapture(e.pointerId);

        // Cache center based on current element position (handles floating mode + resize)
        const rect = this.rootEl.getBoundingClientRect();
        this.centerX = rect.left + rect.width / 2;
        this.centerY = rect.top + rect.height / 2;

        // maxRadius = how far knob center can move from base center
        this.maxRadius = rect.width * 0.36;

        this.isActive = true;
        this.rootEl.classList.add('is-active');

        // Update immediately so first contact registers vector (no dead first frame)
        this.updateVector(e.clientX, e.clientY);
        this.onActivate?.();
    };

    /**
     * v0.23.1 floating mode: move joystick element pod palec.
     * Centers joystick on (clientX, clientY) via inline styles.
     * Po release, restorePosition() przywraca CSS-defined home position.
     */
    private repositionUnderFinger(clientX: number, clientY: number): void {
        if (!this.rootEl) return;
        const rect = this.rootEl.getBoundingClientRect();
        const halfW = rect.width / 2;
        const halfH = rect.height / 2;

        // Apply inline positioning that overrides CSS (use left/top, clear right/bottom).
        // Clamp to viewport so joystick nie wychodzi poza ekran.
        const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, clientX - halfW));
        const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, clientY - halfH));

        this.rootEl.style.left = `${left}px`;
        this.rootEl.style.top = `${top}px`;
        this.rootEl.style.right = 'auto';
        this.rootEl.style.bottom = 'auto';
    }

    /** v0.23.1 floating mode: po release wracamy joystick na CSS home position. */
    private restorePosition(): void {
        if (!this.rootEl || this.mode !== 'floating') return;
        // Clear inline styles → CSS rules (left/right/bottom/top z section 27) wracają
        this.rootEl.style.left = '';
        this.rootEl.style.top = '';
        this.rootEl.style.right = '';
        this.rootEl.style.bottom = '';
    }

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

        // v0.23.1 floating mode: wraca joystick na home position
        this.restorePosition();

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

// Export constant for CSS calculation parity (40% activation zone)
export { FLOATING_ZONE_WIDTH_FRACTION };