/**
 * juice.ts — v0.208.0 „MENU JUICE": jedno miejsce na feedback nawigacji huba.
 *
 * Wartosc projektowa nr 2 (Sensoryka) przeniesiona na menu: kazdy tap ma odpowiedz
 * (ripple + squash + haptyka), liczby sie NABIJAJA zamiast przeskakiwac, sekcje
 * WJEZDZAJA zamiast sie podmieniac, sigmy LECA do licznika. Wszystko transform/opacity
 * (kompozytor), zero PIXI w hubie (utrzymane), `prefers-reduced-motion` wycisza calosc.
 *
 * Zero `Math.random` — rozrzut monet jest deterministyczny (to prezentacja, ale nie ma
 * powodu laczyc RNG z UI). Brak wplywu na symulacje.
 */
import { haptic, HAPTIC } from '../../input/Haptics';

/** Cele ripple/squash — wszystko, co w hubie jest „do tapniecia". */
const TAP_TARGETS = [
    '.bt-hub0-navbtn', '.bt-hub0-diff-pill', '.bt-gr2-cratechip', '.bt-hub0-coin--btn',
    '.bt-hub0-s2', '.bt-hub0-gear', '.bt-hub0-card', '.bt-hub0-node', '.ps-item',
    '.bt-hub0-q-claim', '.bt-hub0-play', '.bt-hub0-pbtn', '.bt-hub0-powcard',
    '.bt-hub0-profile', '.bt-hub0-mapcard', '.bt-hub0-lslot', '.bt-hub0-cos',
].join(', ');

/** Elementy, ktore wjezdzaja kaskada przy wejsciu do sekcji (max 8 z opoznieniem). */
const ENTER_TARGETS = [
    '.bt-hub0-sectitle', '.bt-hub0-subhead', '.bt-hub0-road-act', '.bt-hub0-road-head',
    '.bt-hub0-road-season-head', '.bt-hub0-card', '.bt-hub0-mapcard', '.bt-hub0-node',
    '.ps-item', '.bt-hub0-q', '.bt-hub0-cratebox', '.bt-gr2-titlerow', '.bt-gr2-hero',
    '.bt-gr2-slots', '.bt-hub0-stat', '.bt-hub0-diff-pills', '.ps-tracks', '.bt-hub0-rankrow',
].join(', ');

const MAX_STAGGER = 8;

export function reducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Restart animacji CSS przez zdjecie i ponowne nalozenie klasy (reflow miedzy). */
export function retrigger(el: Element | null | undefined, cls: string): void {
    if (!el) return;
    el.classList.remove(cls);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

/**
 * J1 — ripple + squash-release + haptyka na KAZDY tap w hubie. Jeden delegowany
 * listener na roocie (przezywa `innerHTML=''` sekcji). Ripple siedzi we wrapperze
 * z `overflow:hidden; border-radius:inherit`, wiec nie wychodzi poza przycisk.
 */
export function attachRipple(root: HTMLElement): void {
    root.addEventListener('pointerdown', (e) => {
        const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(TAP_TARGETS);
        if (!target || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') return;
        haptic(HAPTIC.tap);
        if (reducedMotion()) return;
        try {
            if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
            const rect = target.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height) * 1.25;
            const box = document.createElement('i');
            box.className = 'bt-ripple-box';
            const r = document.createElement('i');
            r.className = 'bt-ripple';
            r.style.width = r.style.height = `${size}px`;
            r.style.left = `${e.clientX - rect.left - size / 2}px`;
            r.style.top = `${e.clientY - rect.top - size / 2}px`;
            box.appendChild(r);
            target.appendChild(box);
            r.addEventListener('animationend', () => box.remove(), { once: true });
            window.setTimeout(() => box.remove(), 700); // bezpiecznik: zero wycieku, gdy animationend nie padnie
        } catch (err) {
            console.warn('[juice] ripple failed', (err as Error).stack ?? err);
        }
    }, { passive: true });

    root.addEventListener('pointerup', (e) => {
        const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(TAP_TARGETS);
        if (!target || reducedMotion()) return;
        retrigger(target, 'bt-tap-release');
    }, { passive: true });
}

/**
 * J4 — count-up: liczba tyka od `from` do `to` (ease-out cubic), `onTick` co ~10% drogi
 * (ikona podskakuje). Przy reduced-motion od razu wartosc koncowa.
 */
export function countUp(el: HTMLElement, from: number, to: number, ms = 600, onTick?: () => void): void {
    if (from === to || reducedMotion()) { el.textContent = String(to); return; }
    const start = performance.now();
    const tickEvery = Math.max(1, Math.abs(to - from) / 10);
    let shown = from;
    let lastTick = from;
    el.textContent = String(from);
    const step = (now: number): void => {
        const p = Math.min(1, (now - start) / ms);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = Math.round(from + (to - from) * eased);
        if (v !== shown) {
            shown = v;
            el.textContent = String(v);
            if (Math.abs(v - lastTick) >= tickEvery) { lastTick = v; onTick?.(); }
        }
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = String(to);
    };
    requestAnimationFrame(step);
}

/** J4 — „+47" wylatujace w gore z kotwicy (tylko dodatnie). */
export function floatDelta(anchor: HTMLElement, delta: number): void {
    if (delta <= 0 || reducedMotion()) return;
    const d = document.createElement('i');
    d.className = 'bt-delta';
    d.textContent = `+${delta}`;
    anchor.appendChild(d);
    d.addEventListener('animationend', () => d.remove(), { once: true });
    window.setTimeout(() => d.remove(), 1500);
}

/**
 * J3 — kaskadowe wejscie sekcji: pierwsze MAX_STAGGER elementow dostaje `--i` (opoznienie
 * w CSS), reszta wchodzi bez opoznienia (dluga lista nie moze „ladowac sie" wiecznie).
 * Klasa schodzi po animacji, zeby `transform` nie psul pozniejszego `:active`.
 */
export function stagger(root: HTMLElement): void {
    if (reducedMotion()) return;
    let i = 0;
    root.querySelectorAll<HTMLElement>(ENTER_TARGETS).forEach(el => {
        // zagniezdzone cele (np. node w kolumnie) — animuje sie tylko element, nie jego rodzic
        el.style.setProperty('--i', String(Math.min(i++, MAX_STAGGER - 1)));
        el.classList.add('bt-enter');
        el.addEventListener('animationend', (ev) => {
            if (ev.target !== el) return; // animationend dzieci (kropka, iskry) nie zdejmuje klasy
            el.classList.remove('bt-enter');
            el.style.removeProperty('--i');
        });
    });
    root.querySelector('.bt-hub0-sectitle')?.classList.add('bt-stamp');
}

export interface FlyFrom { left: number; top: number; width: number; height: number }

/**
 * J6 — sigmy leca po luku z miejsca nagrody do coina na belce. Web Animations API,
 * elementy `position:fixed` w body (poza scrollem sekcji). `onArrive(i)` przy kazdym
 * trafieniu — coin podskakuje, count-up startuje przy PIERWSZYM, nie przy kliknieciu.
 */
export function flyCoins(from: FlyFrom, toEl: HTMLElement, count: number, src: string, onArrive: (i: number) => void): void {
    const n = Math.max(3, Math.min(8, count));
    if (reducedMotion() || from.width === 0) { onArrive(0); return; }
    const b = toEl.getBoundingClientRect();
    const x1 = b.left + b.width / 2 - 10;
    const y1 = b.top + b.height / 2 - 10;
    for (let i = 0; i < n; i++) {
        // deterministyczny rozrzut startu (bez RNG)
        const dx = ((i * 7) % 5 - 2) * 7;
        const dy = ((i * 3) % 4 - 1.5) * 6;
        const x0 = from.left + from.width / 2 - 10 + dx;
        const y0 = from.top + from.height / 2 - 10 + dy;
        const c = document.createElement('img');
        c.className = 'bt-coinfly';
        c.src = src;
        c.alt = '';
        c.style.transform = `translate(${x0}px, ${y0}px)`;
        document.body.appendChild(c);
        try {
            const anim = c.animate([
                { transform: `translate(${x0}px, ${y0}px) scale(0.6)`, opacity: 0 },
                { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 60}px) scale(1.15)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${x1}px, ${y1}px) scale(0.8)`, opacity: 1 },
            ], { duration: 900 + i * 70, delay: i * 60, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' }); // wolniej (A54)
            anim.onfinish = () => { c.remove(); onArrive(i); };
        } catch (err) {
            console.warn('[juice] coin fly failed', (err as Error).stack ?? err);
            c.remove();
            onArrive(i);
        }
        window.setTimeout(() => c.remove(), 2600);
    }
}
