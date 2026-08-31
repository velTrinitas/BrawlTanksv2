/**
 * crosshairPreview.ts — SHOP-2 (v0.138.0). Podglad celownika w hubie.
 *
 * DLACZEGO OSOBNY PLIK: ten sam podglad potrzebny jest w trzech miejscach (kafel
 * sklepu, modal produktu, karta w Kolekcji profilu). Trzy kopie rozjechalyby sie przy
 * pierwszej zmianie — a najgorszy mozliwy blad w tej fazie to podglad pokazujacy co
 * innego niz gracz dostanie w meczu.
 *
 * DLACZEGO DWA KROKI (html -> paint): kafle huba sa budowane jako STRINGI wstrzykiwane
 * przez `innerHTML`, wiec w momencie skladania markupu canvas jeszcze nie istnieje.
 * `crosshairCanvasHtml()` emituje pusty element, a `paintCrosshairPreviews(root)`
 * domalowuje go JEDNYM przejsciem po wstawieniu do DOM.
 *
 * ZRODLO PRAWDY: rysuje PRAWDZIWA funkcja z `CROSSHAIR_STYLES` — nie emoji, nie
 * kolorowe kolko. Gracz placi do 3200 sigm, wiec musi widziec dokladnie to, co kupuje.
 */
import { CROSSHAIR_STYLES, crosshairStyle, type CrosshairId } from '../../rendering/crosshairs';

/** Cap DPR 1:1 z rendererem gry (v0.133.0) — bez tego podglad byłby rozmyty. */
const DPR_CAP = 2;

/** Bok kafla podgladu w px CSS (grid sklepu / kolekcji). */
export const PREVIEW_PX = 64;

/**
 * Pusty canvas do wstawienia w string HTML. Malowany dopiero przez
 * `paintCrosshairPreviews()` — patrz naglowek pliku.
 *
 * @param animated true = modal produktu; canvas krec sie w rAF (patrz `animateCrosshair`)
 */
export function crosshairCanvasHtml(id: string, px = PREVIEW_PX, animated = false): string {
    return `<canvas class="bt-chprev" data-ch="${id}"${animated ? ' data-ch-anim="1"' : ''}
                    style="width:${px}px;height:${px}px" aria-hidden="true"></canvas>`;
}

/** Ustawia bufor pod DPR i zwraca kontekst z juz zaaplikowana skala. */
function prepare(cv: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; px: number } | null {
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const px = cv.clientWidth || PREVIEW_PX;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    cv.width = Math.round(px * dpr);
    cv.height = Math.round(px * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, px };
}

/**
 * Skala podgladu. Koperta celownika to <= 20*s promienia (kontrakt czytelnosci §3),
 * wiec przy boku `px` marginesem bezpieczenstwa jest `px / 2 / 20`. Bez tego Snajper
 * (ramie 20*s) wychodzilby poza kafel, a Sigma miescilaby sie z zapasem — czyli
 * warianty roznilyby sie wielkoscia, a maja roznic sie sylwetka.
 */
function previewScale(px: number): number {
    return px / 2 / 21;   // 21, nie 20 — jeden piksel luzu na grubosc konturu
}

/**
 * Maluje WSZYSTKIE podglady w poddrzewie. Wolac PO kazdym `innerHTML`.
 * Statycznie (t=0) — animowanie kilkunastu canvasow w siatce menu to jalowe palenie
 * baterii. Wyjatek robi `animateCrosshair()` dla pojedynczego canvasu w modalu.
 */
export function paintCrosshairPreviews(root: HTMLElement): void {
    root.querySelectorAll<HTMLCanvasElement>('canvas.bt-chprev').forEach(cv => {
        if (cv.dataset.chAnim === '1') { animateCrosshair(cv); return; }
        const p = prepare(cv);
        if (!p) return;
        crosshairStyle(cv.dataset.ch).draw(p.ctx, p.px / 2, p.px / 2, previewScale(p.px), 0);
    });
}

/** Aktywne petle podgladu — trzymane po elemencie, zeby dalo sie je zatrzymac. */
const _loops = new WeakMap<HTMLCanvasElement, number>();

/**
 * Animowany podglad — TYLKO modal produktu w sklepie i tylko dopoki jest otwarty.
 * Uzasadnienie wyjatku: obrot jest jedyna rzecza, ktora odroznia Sigme (3200 sigm)
 * od tanszych wariantow. Statyczny podglad sprzedawalby ja nieuczciwie.
 *
 * Petla rusza WYLACZNIE dla wariantow, ktore faktycznie animuja — reszta dostaje
 * jedna klatke i zero rAF.
 */
export function animateCrosshair(cv: HTMLCanvasElement): void {
    const p = prepare(cv);
    if (!p) return;
    const id = cv.dataset.ch as CrosshairId | undefined;
    const style = crosshairStyle(id);
    const s = previewScale(p.px);
    // Dzis animuje sie tylko ch_sigma. Sprawdzamy po id, a nie flaga w rejestrze,
    // bo rejestr celowo nie wie nic o hubie.
    if (id !== 'ch_sigma' || !CROSSHAIR_STYLES[id]) {
        style.draw(p.ctx, p.px / 2, p.px / 2, s, 0);
        return;
    }
    const t0 = Date.now();
    const tick = (): void => {
        if (!cv.isConnected) { stopCrosshairAnimation(cv); return; }
        p.ctx.clearRect(0, 0, p.px, p.px);
        style.draw(p.ctx, p.px / 2, p.px / 2, s, (Date.now() - t0) / 1000);
        _loops.set(cv, requestAnimationFrame(tick));
    };
    tick();
}

/** Zatrzymuje petle podgladu (zamkniecie modala). Bezpieczne przy braku petli. */
export function stopCrosshairAnimation(cv: HTMLCanvasElement): void {
    const h = _loops.get(cv);
    if (h !== undefined) { cancelAnimationFrame(h); _loops.delete(cv); }
}

/** Zatrzymuje wszystkie petle w poddrzewie — wolac przed usunieciem overlaya. */
export function stopCrosshairPreviews(root: HTMLElement): void {
    root.querySelectorAll<HTMLCanvasElement>('canvas.bt-chprev').forEach(stopCrosshairAnimation);
}
