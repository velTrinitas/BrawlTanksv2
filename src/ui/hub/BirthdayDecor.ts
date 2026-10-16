/**
 * EVENT 10. URODZINY MICHALA — dekory hubu, konfetti, nakladka Start.jpg, baner wyniku.
 * Czysto kosmetyczne (DOM/CSS). Kazde wejscie strzezone przez `isBirthdayActive()`
 * (src/config/birthdayEvent.ts) — po nd 25.10.2026 13:00 nic sie nie montuje.
 */
import './birthday.css';
import { t } from '../../i18n/i18n';
import { isBirthdayActive, bdayOncePerSession } from '../../config/birthdayEvent';
import { AudioSys } from '../../audio/AudioSys';

const COLORS = ['#ff5fa2', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#e67e22', '#ffffff'];
const FLAG_COLORS = ['#ff5fa2', '#f1c40f', '#2ecc71', '#3498db', '#e67e22'];

/** Srodek belki hubu (zamiast pustego spacera / paska motywu). */
export function birthdayStripHtml(): string {
    const flags = Array.from({ length: 24 }, (_, i) =>
        `<i style="left:${(i * 4.2).toFixed(1)}%;background:${FLAG_COLORS[i % FLAG_COLORS.length]};animation-delay:${(-i * 0.13).toFixed(2)}s"></i>`).join('');
    return `<div class="bt-hub0-spacer bt-bday-strip" data-bday="strip" role="img" aria-label="${t('bday.title')}">
        <span class="bt-bday-flags" aria-hidden="true">${flags}</span>
        <span class="bt-bday-emo b1" aria-hidden="true">🎈</span>
        <span class="bt-bday-emo x" aria-hidden="true">🎉</span>
        <span class="bt-bday-title"><span class="l">${t('bday.title')}</span><span class="s">${t('bday.short')}</span></span>
        <span class="bt-bday-emo cake" aria-hidden="true">🎂</span>
        <span class="bt-bday-emo b2" aria-hidden="true">🎈</span>
    </div>`;
}

/** Kolumna pod railem nawigacji (widoczna tylko na desktopie — CSS). */
export function birthdayRailHtml(): string {
    return `<span class="bt-bday-rail" aria-hidden="true">
        <i class="garland"></i>
        <span class="bt-bday-balloon" data-bday="pop">🎈</span>
        <span class="bt-bday-balloon" data-bday="pop">🎈</span>
        <span class="bt-bday-balloon" data-bday="pop">🎁</span>
        <span class="bt-bday-balloon" data-bday="pop">🎂</span>
        <b class="bt-bday-ten">10</b>
        <small>${t('bday.rail')}</small>
    </span>`;
}

/** Podpina klikniecia (pop balonow, tap w pas = salwa konfetti). Wolac po kazdym renderze chrome. */
export function wireBirthdayDecor(root: HTMLElement): void {
    if (!isBirthdayActive()) return;
    root.querySelectorAll<HTMLElement>('[data-bday="pop"]').forEach(el => {
        el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            confettiBurst(ev.clientX, ev.clientY);
            el.classList.add('popped');
            window.setTimeout(() => el.classList.remove('popped'), 2500); // balon wraca — mozna strzelac dalej
        });
    });
    root.querySelector<HTMLElement>('[data-bday="strip"]')?.addEventListener('click', (ev) => {
        confettiBurst(ev.clientX, ev.clientY);
    });
}

/** Deszcz konfetti na caly ekran (~2.5-4 s), 60 elementow, transform/opacity only. */
export function confettiRain(count = 60): void {
    const host = document.createElement('div');
    host.className = 'bt-bday-confetti';
    let html = '';
    for (let i = 0; i < count; i++) {
        const c = COLORS[i % COLORS.length];
        html += `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--c:${c};--w:${6 + Math.round(Math.random() * 6)}px;--d:${(Math.random() * 0.9).toFixed(2)}s;--dur:${(2.2 + Math.random() * 1.6).toFixed(2)}s;--dx:${Math.round(Math.random() * 160 - 80)}px;--r:${Math.round(360 + Math.random() * 720)}deg"></i>`;
    }
    host.innerHTML = html;
    document.body.appendChild(host);
    window.setTimeout(() => host.remove(), 4800);
}

/** Mala eksplozja konfetti w punkcie (pop balonu). */
export function confettiBurst(x: number, y: number): void {
    const host = document.createElement('div');
    host.className = 'bt-bday-burst';
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    let html = '';
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = 40 + Math.random() * 50;
        html += `<i style="--c:${COLORS[i % COLORS.length]};--dx:${Math.round(Math.cos(a) * r)}px;--dy:${Math.round(Math.sin(a) * r)}px"></i>`;
    }
    host.innerHTML = html;
    document.body.appendChild(host);
    window.setTimeout(() => host.remove(), 800);
    try { AudioSys.getInstance().playMenuClick(); } catch (e) { console.warn('[Birthday] pop sfx', (e as Error).stack ?? e); }
}

/** Raz na sesje przy wejsciu do hubu. */
export function maybeHubBirthdayConfetti(): void {
    if (!isBirthdayActive() || !bdayOncePerSession('hubconfetti')) return;
    window.setTimeout(() => confettiRain(70), 350);
}

/**
 * Po START w intro: Start.jpg z X w prawym gornym rogu, zamkniecie po 6 s / X / tapnieciu tla.
 * Raz na sesje. Zwraca false, gdy nie pokazano (wtedy wolajacy od razu idzie dalej).
 */
export function showBirthdayStart(onDone: () => void): boolean {
    if (!isBirthdayActive() || !bdayOncePerSession('start')) return false;
    const el = document.createElement('div');
    el.className = 'bt-bday-start';
    el.innerHTML = `
        <img src="${import.meta.env.BASE_URL}intro/Start.jpg" alt="${t('bday.title')}" draggable="false">
        <button class="bt-bday-close" type="button" aria-label="${t('bday.close')}">✕</button>
        <div class="bt-bday-timer" aria-hidden="true"><i></i></div>`;
    document.body.appendChild(el);
    confettiRain(50);
    let done = false;
    const close = (): void => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        el.classList.add('closing');
        window.setTimeout(() => el.remove(), 300);
        try { AudioSys.getInstance().playBirthdayJingle(); } catch (e) { console.warn('[Birthday] jingle', (e as Error).stack ?? e); }
        onDone();
    };
    const timer = window.setTimeout(close, 6000);
    el.addEventListener('click', close); // X i tlo — jedno zamkniecie
    return true;
}

/** Baner nad ekranem wyniku meczu (zwyciestwo i porazka). */
export function birthdayEndBannerHtml(): string {
    if (!isBirthdayActive()) return '';
    return `<div style="text-align:center"><span class="bt-bday-endbanner">${t('bday.end')}</span></div>`;
}
