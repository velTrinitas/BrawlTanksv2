/**
 * toast.ts — minimalna utility dla ephemeral notifications (FAZA 6c).
 *
 * Uzycie:
 *   showToast('Wkrotce dostepne!');
 *   showToast('Custom message', 3000); // custom duration
 *
 * CSS w menu-styles.css (klasa .bt-toast).
 */

const DEFAULT_DURATION_MS = 2500;
const FADE_OUT_MS = 280;

let activeToast: HTMLElement | null = null;
let activeTimer: number | null = null;

/**
 * Show toast message. Replaces any previous toast (no stacking).
 */
export function showToast(message: string, durationMs: number = DEFAULT_DURATION_MS): void {
    // Remove any existing toast immediately
    if (activeToast) {
        activeToast.remove();
        activeToast = null;
    }
    if (activeTimer !== null) {
        clearTimeout(activeTimer);
        activeTimer = null;
    }

    const toast = document.createElement('div');
    toast.className = 'bt-toast';
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
    activeToast = toast;

    // Trigger CSS transition (next frame)
    requestAnimationFrame(() => {
        toast.classList.add('is-visible');
    });

    // Auto-dismiss
    activeTimer = window.setTimeout(() => {
        toast.classList.remove('is-visible');
        setTimeout(() => {
            toast.remove();
            if (activeToast === toast) activeToast = null;
        }, FADE_OUT_MS);
        activeTimer = null;
    }, durationMs);
}