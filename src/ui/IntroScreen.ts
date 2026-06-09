/**
 * IntroScreen.ts — splash screen (FAZA 6c).
 *
 * Skladniki wizualne:
 * - 4 fullscreen slides (Desert, Cyberpunk, Tropic, Arctic) z cross-fade rotation
 * - Ken Burns slow zoom effect na aktywnym slide (cinematic feel)
 * - Dark gradient overlay (top → middle) dla czytelnosci CTA
 * - BIG GOLD "START" button z pulse animation + cartoon shadow
 * - "Stuknij aby zagrac" hint pulsating ponizej (mobile UX)
 * - Subtelny credits w bottom corner (versja gry)
 *
 * Flow:
 *   onShow() → startSlideshow() (co 5s cross-fade do nast.)
 *   START click → onStartClick callback → MainMenu.show('hub')
 *   unmount() → clearInterval, remove DOM
 *
 * Assets: 4 jpg z public/intro/ (base path z import.meta.env.BASE_URL)
 */

import type { IScreen } from './MainMenu';
import { t } from '../i18n/i18n';

// ============================================================
// Config
// ============================================================

const SLIDE_DURATION_MS = 5000;      // Czas pomiedzy zmianami slidow
const TRANSITION_MS = 1200;          // Cross-fade duration (musi byc < SLIDE_DURATION)
const BASE_URL = import.meta.env.BASE_URL;

/**
 * Slides w kolejnosci rotacji. Pierwszy = startujacy.
 * Kolejnosc: Desert (najjasniejszy, friendly) → Cyberpunk → Tropic → Arctic.
 */
const SLIDES = [
    { id: 'desert',    file: 'Brawl_Tanks_Desert.jpg' },
    { id: 'cyberpunk', file: 'Brawl_Tanks_Cyberpunk.jpg' },
    { id: 'tropic',    file: 'Brawl_Tanks_Tropic.jpg' },
    { id: 'arctic',    file: 'Brawl_Tanks_Arctic.jpg' },
];

// ============================================================
// IntroScreen
// ============================================================

export class IntroScreen implements IScreen {
    private el: HTMLElement | null = null;
    private slideEls: HTMLElement[] = [];
    private activeSlideIdx: number = 0;
    private rotationTimer: number | null = null;

    /**
     * Callback dla START button.
     * MainMenu subskrybuje i wywoluje show('hub').
     */
    onStartClick: (() => void) | null = null;

    mount(root: HTMLElement): void {
        this.el = this.render();
        root.appendChild(this.el);

        // Cache slide elements dla szybkiego dostepu w rotation
        this.slideEls = Array.from(this.el.querySelectorAll<HTMLElement>('.bt-intro-slide'));

        // Preload pierwszych 2 obrazow (eager) zeby uniknac flash przy pierwszej zmianie
        this.preloadImages([SLIDES[0].file, SLIDES[1].file]);

        // Wire START button
        const startBtn = this.el.querySelector<HTMLButtonElement>('.bt-intro-start');
        startBtn?.addEventListener('click', async () => {
            // FAZA 6e.1: best-effort fullscreen request on user gesture (mobile native feel).
            // Silently ignored if user denies, API missing (iOS Safari), or document already fullscreen.
            await this.requestFullscreenSafe();
            this.onStartClick?.();
        });
    }

    unmount(): void {
        this.stopSlideshow();
        this.el?.remove();
        this.el = null;
        this.slideEls = [];
    }

    onShow(): void {
        this.startSlideshow();
    }

    // === Internal ===

    private render(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'bt-intro-screen';

        // Slides (4 stacked, fade-cross-fade)
        const slidesHtml = SLIDES.map((slide, idx) => `
            <div class="bt-intro-slide ${idx === 0 ? 'is-active' : ''}"
                 data-slide-id="${slide.id}"
                 style="background-image: url('${BASE_URL}intro/${slide.file}');">
            </div>
        `).join('');

        // Dark gradient overlay (improves text legibility regardless of slide)
        const overlay = `<div class="bt-intro-overlay"></div>`;

        // Content: START button + hint
        const content = `
            <div class="bt-intro-content">
                <button class="bt-intro-start" type="button" aria-label="${t('intro.start')}">
                    <span class="bt-intro-start-label">${t('intro.start')}</span>
                </button>
                <p class="bt-intro-hint">${t('intro.tap_to_play')}</p>
            </div>
        `;

        root.innerHTML = slidesHtml + overlay + content;
        return root;
    }

    private preloadImages(files: string[]): void {
        files.forEach(file => {
            const img = new Image();
            img.src = `${BASE_URL}intro/${file}`;
        });
    }

    private startSlideshow(): void {
        // Defensive: clear any existing timer
        this.stopSlideshow();

        this.rotationTimer = window.setInterval(() => {
            this.advanceSlide();
        }, SLIDE_DURATION_MS);
    }

    private stopSlideshow(): void {
        if (this.rotationTimer !== null) {
            clearInterval(this.rotationTimer);
            this.rotationTimer = null;
        }
    }

    private advanceSlide(): void {
        if (this.slideEls.length === 0) return;

        const prevIdx = this.activeSlideIdx;
        const nextIdx = (prevIdx + 1) % this.slideEls.length;

        // Preload nastepny-nastepny (smooth pipeline)
        const lookaheadIdx = (nextIdx + 1) % SLIDES.length;
        this.preloadImages([SLIDES[lookaheadIdx].file]);

        // Cross-fade: next pojawia sie, prev znika
        this.slideEls[nextIdx].classList.add('is-active');
        // Z opoznieniem usuwamy prev (po crossfade nadpisalibysmy z-index, ale opacity ok)
        setTimeout(() => {
            this.slideEls[prevIdx].classList.remove('is-active');
        }, TRANSITION_MS);

        this.activeSlideIdx = nextIdx;
    }

    /**
     * FAZA 6e.1: request fullscreen on START tap (mobile native feel).
     *
     * Vendor-prefixed fallback dla starszych przegladarek (webkit/moz/ms).
     * Errors silently swallowed: iOS Safari nie supportuje, user moze deny,
     * document moze byc juz fullscreen, lub PWA standalone mode juz pokrywa viewport.
     *
     * Bezpieczne: jesli failed, gra dalej dziala bez fullscreen (graceful degradation).
     */
    private async requestFullscreenSafe(): Promise<void> {
        try {
            // Skip if already fullscreen (PWA standalone, manual F11, etc.)
            if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
                return;
            }

            const el = document.documentElement as any;
            const req =
                el.requestFullscreen ||
                el.webkitRequestFullscreen ||
                el.mozRequestFullScreen ||
                el.msRequestFullscreen;

            if (typeof req === 'function') {
                await req.call(el);
            }
        } catch (err) {
            // Silent fail: user denied, unsupported, etc.
            // Use console.debug (suppressed in production unless verbose)
            console.debug('[IntroScreen] Fullscreen request failed (gracefully ignored):', err);
        }
    }
}