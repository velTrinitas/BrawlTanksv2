import { t } from '../i18n/i18n';

/**
 * LoadingScreen.ts — v0.241.0 ekran ladowania meczu (Mariusz 2026-10-08).
 *
 * Problem: `startGame` buduje grunt i propsy SYNCHRONICZNIE (2-3 s na mobile) — przegladarka nie
 * miala kiedy nic narysowac, gracz widzial zamrozony ekran po GRAJ.
 * Rozwiazanie: overlay DOM (losowa tapeta intro z cache, logo w kadrze + podpowiedz + pasek ladowania),
 * `painted` czeka 2 klatki, zeby overlay NA PEWNO byl na ekranie przed ciezkim blokiem.
 * Widoczny min. MIN_VISIBLE_MS (czas na przeczytanie podpowiedzi), chowany po pierwszej klatce meczu.
 *
 * Koszt mobile: jedna tapeta ~200 KB (juz w cache po intro), animacje tylko transform/opacity
 * (kompozytor), zero JS w petli. Brak wplywu na symulacje (Math.random = tylko wybor UI).
 */

const BASE_URL = import.meta.env.BASE_URL;
const WALLPAPERS = ['SigmaTanks_1.jpg', 'SigmaTanks2.jpg', 'SigmaTanks_3.jpg', 'SigmaTanks_4.jpg'];
const MIN_VISIBLE_MS = 2500; // Mariusz 2026-10-08: czas na przeczytanie podpowiedzi
const FAILSAFE_MS = 15000;
const FADE_MS = 250;

function tips(): string[] {
    // Literalne klucze (i18n nie kompiluje dynamicznych t(var)).
    return [
        t('loading.tip1'), t('loading.tip2'), t('loading.tip3'), t('loading.tip4'), t('loading.tip5'),
        t('loading.tip6'), t('loading.tip7'), t('loading.tip8'), t('loading.tip9'), t('loading.tip10'),
        t('loading.tip11'), t('loading.tip12'), t('loading.tip13'), t('loading.tip14'), t('loading.tip15'),
        t('loading.tip16'), t('loading.tip17'), t('loading.tip18'), t('loading.tip19'), t('loading.tip20'),
        t('loading.tip21'), t('loading.tip22'), t('loading.tip23'), t('loading.tip24'), t('loading.tip25'),
        t('loading.tip26'), t('loading.tip27'), t('loading.tip28'), t('loading.tip29'), t('loading.tip30'),
        t('loading.tip31'), t('loading.tip32'), t('loading.tip33'), t('loading.tip34'),
    ];
}

const CSS = `
#bt-loading{position:fixed;inset:0;z-index:100000;background:#0b1020;overflow:hidden;
  display:flex;align-items:flex-end;justify-content:center;opacity:1;transition:opacity ${FADE_MS}ms ease-out;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;pointer-events:auto}
#bt-loading.is-out{opacity:0;pointer-events:none}
/* logo jest u gory tapety: kadr od gory, zoom zakotwiczony na logo (nie ucina go) */
#bt-loading .bt-ld-bg{position:absolute;inset:0;background-size:cover;background-position:center top;
  transform-origin:50% 12%;animation:btLdZoom 4s ease-out forwards;will-change:transform}
#bt-loading .bt-ld-shade{position:absolute;inset:0;
  background:linear-gradient(to top,rgba(5,8,20,.85) 0%,rgba(5,8,20,.25) 32%,rgba(5,8,20,0) 50%)}
#bt-loading .bt-ld-box{position:relative;width:min(520px,calc(100vw - 32px));margin:0 16px max(52px,12vh);
  text-align:center;color:#fff}
/* v0.242.0 (playtest): one line, no wrapping, game font (Titan One) instead of the formal system UI font */
#bt-loading .bt-ld-tip{font-family:'Titan One',cursive,sans-serif;font-weight:400;font-size:clamp(12px,1.7vw,16px);letter-spacing:.4px;
  line-height:1.3;color:rgba(255,255,255,.95);text-shadow:0 2px 0 rgba(0,0,0,.7),0 0 10px rgba(0,0,0,.6);
  position:absolute;left:16px;right:16px;bottom:max(12px,2.5vh);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-align:left;animation:btLdIn .5s ease-out both}
#bt-loading .bt-ld-tip b{color:#f5c542;font-weight:400;margin-right:6px}
#bt-loading .bt-ld-row{display:flex;flex-direction:column;align-items:stretch;gap:6px}
#bt-loading .bt-ld-label{font-family:'Titan One',cursive,sans-serif;font-weight:400;font-size:14px;letter-spacing:2px;
  color:#f5c542;text-shadow:0 2px 0 rgba(0,0,0,.6)}
#bt-loading .bt-ld-bar{height:9px;border-radius:5px;background:rgba(255,255,255,.15);overflow:hidden}
#bt-loading .bt-ld-bar i{display:block;height:100%;width:100%;border-radius:5px;
  background:linear-gradient(90deg,#f0a020,#f5c542);transform-origin:left;transform:scaleX(0);
  animation:btLdFill ${MIN_VISIBLE_MS}ms linear forwards;will-change:transform}
#bt-loading.is-out .bt-ld-bar i{animation:none;transform:scaleX(1)}
@keyframes btLdZoom{from{transform:scale(1)}to{transform:scale(1.06)}}
@keyframes btLdFill{from{transform:scaleX(0)}to{transform:scaleX(.97)}}
@keyframes btLdIn{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}
`;

let styleInjected = false;
let lastTip = -1;

export interface LoadingHandle {
    /** Resolves when the overlay has been painted (safe to start the heavy synchronous work). */
    painted: Promise<void>;
    /** Hide after the next rendered frames (first match frame on canvas), respecting MIN_VISIBLE_MS. */
    hide(): void;
}

function nextFrames(n: number): Promise<void> {
    return new Promise(res => {
        const step = (): void => { if (--n <= 0) setTimeout(res, 0); else requestAnimationFrame(step); };
        requestAnimationFrame(step);
    });
}

export function showLoadingScreen(): LoadingHandle {
    try {
        if (!styleInjected) {
            const st = document.createElement('style');
            st.id = 'bt-loading-style';
            st.textContent = CSS;
            document.head.appendChild(st);
            styleInjected = true;
        }
        document.getElementById('bt-loading')?.remove();

        const list = tips();
        let idx = Math.floor(Math.random() * list.length);
        if (idx === lastTip) idx = (idx + 1) % list.length;
        lastTip = idx;
        const wp = WALLPAPERS[Math.floor(Math.random() * WALLPAPERS.length)];

        const root = document.createElement('div');
        root.id = 'bt-loading';
        root.innerHTML = `<div class="bt-ld-bg"></div><div class="bt-ld-shade"></div>`
            + `<div class="bt-ld-box"><div class="bt-ld-row"><span class="bt-ld-label"></span><div class="bt-ld-bar"><i></i></div></div></div>`
            + `<div class="bt-ld-tip"><b></b><span></span></div>`;
        (root.querySelector('.bt-ld-bg') as HTMLElement).style.backgroundImage = `url('${BASE_URL}intro/${wp}')`;
        (root.querySelector('.bt-ld-tip b') as HTMLElement).textContent = t('loading.tipTitle');
        (root.querySelector('.bt-ld-tip span') as HTMLElement).textContent = list[idx];
        (root.querySelector('.bt-ld-label') as HTMLElement).textContent = t('common.loading').toUpperCase();
        document.body.appendChild(root);

        const shownAt = performance.now();
        let hidden = false;
        const remove = (): void => {
            if (hidden) return;
            hidden = true;
            root.classList.add('is-out');
            setTimeout(() => root.remove(), FADE_MS + 50);
        };
        const failsafe = setTimeout(() => {
            console.warn('[LoadingScreen] failsafe hide after', FAILSAFE_MS, 'ms');
            remove();
        }, FAILSAFE_MS);

        return {
            painted: nextFrames(2),
            hide: () => {
                void nextFrames(2).then(() => {
                    const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - shownAt));
                    setTimeout(() => { clearTimeout(failsafe); remove(); }, wait);
                });
            },
        };
    } catch (e) {
        console.error('[LoadingScreen] show failed', (e as Error).stack);
        return { painted: Promise.resolve(), hide: () => { document.getElementById('bt-loading')?.remove(); } };
    }
}
