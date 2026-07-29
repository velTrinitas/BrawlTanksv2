import { t } from '../i18n/i18n';

/**
 * GoalCard — FAZA C: karta CELU trybu, pokazywana RAZ przy pierwszym wejsciu w dany tryb
 * (flaga bt2:goal_<scenario>). CORE samouczek uczy mechanik (wspolnych), a to mowi gracza CO ma
 * osiagnac w tym trybie — bo cel KTB (przetrwaj+boss) vs CTF (flaga do bazy) sa rozne.
 *
 * Nieblokujaca, wysrodkowana karta na starcie meczu: gracz czyta cel, klika GRAJ (lub auto po ~6s).
 * Te same teksty (goal.ktb / goal.ctf) uzyje potem ekran "Jak grac" w menu (jedno zrodlo prawdy).
 *
 * Uwaga i18n: `t()` musi byc LITERALNE.
 */

const GOLD = '#ffd24a';
const AUTO_MS = 6000;

type GoalScenario = 'ktb' | 'ctf';

let currentRoot: HTMLDivElement | null = null;
let autoTimer: number | null = null;

function goalKey(scenario: GoalScenario): string { return 'bt2:goal_' + scenario; }

export function hasSeenGoal(scenario: GoalScenario): boolean {
    try { return localStorage.getItem(goalKey(scenario)) === '1'; } catch { return false; }
}

/** Sprzatnij ewentualna wiszaca karte celu (koniec meczu / nowy pokaz). */
export function clearModeGoal(): void {
    if (autoTimer !== null) { window.clearTimeout(autoTimer); autoTimer = null; }
    if (currentRoot && currentRoot.parentElement) currentRoot.parentElement.removeChild(currentRoot);
    currentRoot = null;
}

/**
 * Pokaz karte celu dla trybu, jesli jeszcze nie widziana na tym urzadzeniu. No-op jesli widziana.
 */
export function showModeGoal(scenario: GoalScenario, isTouch: boolean): void {
    if (hasSeenGoal(scenario)) return;
    try { localStorage.setItem(goalKey(scenario), '1'); } catch { /* blocked */ }

    if (!document.getElementById('bt-goal-style')) {
        const st = document.createElement('style');
        st.id = 'bt-goal-style';
        st.textContent = '@keyframes bt-goal-pop{0%{transform:scale(.72);opacity:0}60%{transform:scale(1.05);opacity:1}100%{transform:scale(1);opacity:1}}' +
            '.bt-goal-play:hover{background:#ffdf6b!important;transform:translateY(-1px)}';
        document.head.appendChild(st);
    }

    clearModeGoal();
    const desk = !isTouch;

    const root = document.createElement('div');
    root.id = 'bt-goal-root';
    root.style.cssText = 'position:fixed;inset:0;z-index:59;pointer-events:none;display:flex;align-items:center;justify-content:center;font-family:"Titan One",cursive;user-select:none';

    const card = document.createElement('div');
    card.style.cssText =
        'max-width:88vw;text-align:center;border-radius:22px;' +
        'padding:' + (desk ? '26px 54px 22px' : '18px 30px 18px') + ';' +
        'background:linear-gradient(180deg,rgba(60,64,86,.97),rgba(30,33,46,.97));' +
        'border:3px solid rgba(255,210,74,.75);' +
        'box-shadow:0 16px 44px rgba(0,0,0,.6),0 0 0 4px rgba(255,210,74,.12),inset 0 1px 0 rgba(255,255,255,.1);' +
        'animation:bt-goal-pop .4s cubic-bezier(.2,.9,.3,1.2)';

    const icon = document.createElement('div');
    icon.textContent = scenario === 'ctf' ? '\u{1F6A9}' : '\u{1F3AF}'; // 🚩 / 🎯
    icon.style.cssText = 'font-size:' + (desk ? 'clamp(60px,6vw,92px)' : 'clamp(48px,12vw,76px)') + ';line-height:1;margin-bottom:6px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))';

    const title = document.createElement('div');
    title.textContent = t('goal.title');
    title.style.cssText = 'color:' + GOLD + ';font-size:' + (desk ? 'clamp(30px,3vw,44px)' : 'clamp(22px,5.5vw,36px)') + ';line-height:1.05;text-shadow:0 3px 0 #000,0 0 20px rgba(255,180,40,.55)';

    const text = document.createElement('div');
    text.textContent = scenario === 'ctf' ? t('goal.ctf') : t('goal.ktb');
    text.style.cssText = 'color:#e9edf8;font-family:system-ui,sans-serif;font-weight:700;margin-top:' + (desk ? '10px' : '8px') + ';' +
        'font-size:' + (desk ? 'clamp(17px,1.7vw,24px)' : 'clamp(13px,3.2vw,19px)') + ';line-height:1.3;text-shadow:0 2px 0 rgba(0,0,0,.6)';

    const play = document.createElement('button');
    play.className = 'bt-goal-play';
    play.textContent = t('goal.play') + ' ▶'; // ▶
    play.style.cssText = 'pointer-events:auto;margin-top:' + (desk ? '18px' : '14px') + ';background:' + GOLD + ';color:#3a2c00;border:none;border-radius:14px;' +
        'padding:' + (desk ? '12px 40px' : '10px 30px') + ';font-family:"Titan One",cursive;letter-spacing:.5px;cursor:pointer;transition:background .12s,transform .12s;' +
        'font-size:' + (desk ? 'clamp(18px,1.8vw,24px)' : 'clamp(15px,3.4vw,20px)') + ';box-shadow:0 6px 0 #b8860b,0 9px 16px rgba(0,0,0,.4)';
    play.onclick = () => clearModeGoal();

    card.append(icon, title, text, play);
    root.appendChild(card);
    document.body.appendChild(root);
    currentRoot = root;
    autoTimer = window.setTimeout(() => clearModeGoal(), AUTO_MS);
}
