/**
 * PWAInstallManager.ts — install prompt detection + state management (FAZA 6e.4).
 *
 * Co robi:
 * - Listens for `beforeinstallprompt` event (Chrome/Edge/Android Chrome)
 * - Saves deferred prompt for later trigger (must be user-gesture activated)
 * - Detects if app is already installed (standalone display mode)
 * - Detects iOS Safari (which uses Add-to-Home-Screen instead of beforeinstallprompt)
 *
 * Co NIE robi (zostawione dla MainHub.ts UI integration):
 * - Nie pokazuje banner UI
 * - Nie wywoluje promptu automatycznie
 *
 * Usage (do dodania w MainHub.ts lub Settings):
 *   import { pwaInstall } from '../pwa/PWAInstallManager';
 *
 *   if (pwaInstall.canPrompt()) {
 *       button.style.display = 'block';
 *       button.onclick = () => pwaInstall.triggerPrompt();
 *   } else if (pwaInstall.isIOSSafari()) {
 *       button.style.display = 'block';
 *       button.textContent = 'Dodaj do ekranu glownego';
 *       button.onclick = () => showIOSInstallTutorial();
 *   }
 *
 * SSR-safe: jesli window not exists, manager no-ops.
 */

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

class PWAInstallManager {
    private deferredPrompt: BeforeInstallPromptEvent | null = null;
    private isInstalled: boolean = false;
    private listeners: Array<(canPrompt: boolean) => void> = [];

    constructor() {
        if (typeof window === 'undefined') return;

        // Listen for prompt event (saved until user gesture)
        window.addEventListener('beforeinstallprompt', (e: Event) => {
            // Prevent default browser mini-info bar
            e.preventDefault();
            this.deferredPrompt = e as BeforeInstallPromptEvent;
            console.log('[PWA] Install prompt available');
            this.notifyListeners();
        });

        // Listen for successful install (clear deferred prompt)
        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            this.isInstalled = true;
            console.log('[PWA] App installed');
            this.notifyListeners();
        });

        // Detect if running as installed PWA (standalone display mode)
        this.detectStandaloneMode();
    }

    /**
     * True if standalone (no browser chrome) - either real PWA install OR iOS Safari home screen.
     */
    private detectStandaloneMode(): void {
        const isStandalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone === true; // iOS Safari specific

        if (isStandalone) {
            this.isInstalled = true;
        }
    }

    /**
     * True if can show install prompt (Chrome/Edge/Android with prompt available, NOT installed).
     */
    canPrompt(): boolean {
        return this.deferredPrompt !== null && !this.isInstalled;
    }

    /**
     * Trigger install prompt (MUST be called from user gesture, e.g. button click).
     * Returns true if accepted, false if dismissed/unavailable.
     */
    async triggerPrompt(): Promise<boolean> {
        if (!this.deferredPrompt) {
            console.warn('[PWA] No install prompt available');
            return false;
        }

        try {
            await this.deferredPrompt.prompt();
            const result = await this.deferredPrompt.userChoice;
            console.log('[PWA] User choice:', result.outcome);

            // Prompt only usable once - clear after attempt
            this.deferredPrompt = null;
            this.notifyListeners();

            return result.outcome === 'accepted';
        } catch (err) {
            console.warn('[PWA] Prompt trigger failed:', err);
            return false;
        }
    }

    /**
     * True if iOS Safari (which doesn't support beforeinstallprompt).
     * Use this to show "Add to Home Screen" tutorial instead.
     */
    isIOSSafari(): boolean {
        if (typeof navigator === 'undefined') return false;
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
        const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
        return isIOS && isSafari && !this.isInstalled;
    }

    /**
     * True if app is running as installed PWA (standalone display mode).
     */
    isRunningStandalone(): boolean {
        return this.isInstalled;
    }

    /**
     * Subscribe to state changes (canPrompt status updates).
     * Returns unsubscribe function.
     */
    subscribe(listener: (canPrompt: boolean) => void): () => void {
        this.listeners.push(listener);
        // Emit current state immediately
        listener(this.canPrompt());
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners(): void {
        const state = this.canPrompt();
        this.listeners.forEach(l => l(state));
    }
}

// Singleton export
export const pwaInstall = new PWAInstallManager();