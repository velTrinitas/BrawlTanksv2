import { t } from '../../../i18n/i18n';
import { AudioSys } from '../../../audio/AudioSys';
import { getCurrentSeason } from '../../../config/season';
import type { SeasonCelebration } from '../../../services/ProgressionService';
import { brawlerById, seasonRibbonHtml, tankPortrait } from '../seasonTankUi';
import { tankName } from '../sections/BattleSection';

/**
 * SeasonCelebrationOverlay — v0.250.0 SEZON v2. Gratulacje sezonu w tej samej oprawie co awans rangi
 * (`.bt-rankup*`: promienie, konfetti, dym, fanfara) — gracz od razu wie, ze to WIELKA chwila (Flex).
 *  - 'tank'     — CZOLG SEZONU ODBLOKOWANY: portret + wstazka SEZONOWY, CTA „WYPROBUJ" (wybiera czolg) / „Pozniej".
 *  - 'complete' — SEZON UKONCZONY: emblemat sezonu w zlotej ramce, +sigmy, odznaka w profilu.
 * Pokazywana przez HubShell.maybeCelebrateSeason (po meczu, po syncu, po odebraniu nagrod na stronie SEZON).
 */
const CONFETTI_COLORS = ['#f1c40f', '#ffe066', '#3aa0e0', '#2ecc71', '#e74c3c', '#b07ef7', '#ffffff'];

export class SeasonCelebrationOverlay {
    private el: HTMLElement | null = null;

    get isOpen(): boolean { return this.el !== null; }

    /** @param onTry tylko dla 'tank' — gracz chce od razu wyprobowac czolg. */
    open(parent: HTMLElement, cel: SeasonCelebration, onDone: () => void, onTry?: (brawlerId: string) => void): void {
        this.close();
        const season = getCurrentSeason();
        let confetti = '';
        for (let i = 0; i < 40; i++) {
            const dx = (Math.random() * 2 - 1) * 46;
            const clr = i % 3 === 0 ? season.accentColor : CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            confetti += `<i style="--dx:${dx.toFixed(1)}vw;--rot:${Math.round(Math.random() * 720 - 360)}deg;--clr:${clr};--d:${(Math.random() * 0.6).toFixed(2)}s;--dur:${(1.6 + Math.random() * 1.2).toFixed(2)}s;--w:${6 + Math.round(Math.random() * 6)}px"></i>`;
        }
        let smoke = '';
        for (let i = 0; i < 6; i++) smoke += `<b style="--sx:${(i - 2.5) * 34}px;--d:${(0.15 + i * 0.12).toFixed(2)}s"></b>`;

        let badge: string, title: string, name: string, sub: string, ctas: string;
        if (cel.kind === 'tank') {
            const b = brawlerById(cel.brawlerId);
            badge = `<span class="bt-scel-tank" style="--season:${season.accentColor};--tank:${b?.colorMain ?? '#888'}">
                        ${b ? `<img src="${tankPortrait(b)}" alt="" draggable="false">` : '🛡️'}
                     </span>`;
            title = t('cel.tank.title');
            name = `${b ? tankName(b) : cel.brawlerId} ${seasonRibbonHtml('is-cel')}`;
            sub = t('cel.tank.sub');
            ctas = `<button class="bt-hub0-pbtn bt-hub0-pbtn--gold bt-rankup-cta" data-action="cel-try" type="button">🚀 ${t('cel.tank.try')}</button>
                    <button class="bt-scel-later" data-action="cel-close" type="button">${t('cel.later')}</button>`;
        } else {
            badge = `<span class="bt-scel-emblem" style="--season:${season.accentColor}">${season.emoji}<i>★</i></span>`;
            title = t('cel.complete.title');
            name = t(season.nameKey);
            const sigma = `<img class="bt-sigma bt-sigma--lg" src="${import.meta.env.BASE_URL}assets/sigma.png" alt=""> ${cel.bolts}`;
            sub = `${t('cel.complete.sub', { name: t(season.nameKey) })}<br><span class="bt-scel-reward">+${sigma} · 🏅 ${t('cel.complete.badge')}</span>`;
            ctas = `<button class="bt-hub0-pbtn bt-hub0-pbtn--gold bt-rankup-cta" data-action="cel-close" type="button">${t('cel.ok')}</button>`;
        }

        this.el = document.createElement('div');
        this.el.className = 'bt-rankup bt-scel';
        this.el.style.setProperty('--season', season.accentColor);
        this.el.innerHTML = `
            <div class="bt-rankup-rays" aria-hidden="true"></div>
            <div class="bt-rankup-confetti" aria-hidden="true">${confetti}</div>
            <div class="bt-rankup-card" role="dialog" aria-modal="true">
                <div class="bt-rankup-glow" aria-hidden="true"></div>
                <div class="bt-rankup-smoke" aria-hidden="true">${smoke}</div>
                <span class="bt-rankup-badge">${badge}</span>
                <h2 class="bt-rankup-title">${title}</h2>
                <div class="bt-rankup-name">${name}</div>
                <div class="bt-rankup-reward">${sub}</div>
                <div class="bt-scel-ctas">${ctas}</div>
            </div>`;
        parent.appendChild(this.el);

        try {
            AudioSys.getInstance().duckMusic(5000);
            AudioSys.getInstance().playRankFanfare();
        } catch (e) {
            console.warn('[SeasonCelebration] fanfare failed:', (e as Error).stack ?? e, { kind: cel.kind });
        }

        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-action="cel-try"]') && cel.kind === 'tank') {
                this.close();
                onDone();
                onTry?.(cel.brawlerId);
                return;
            }
            if (target === this.el || target.closest('[data-action="cel-close"]')) {
                this.close();
                onDone();
            }
        });
    }

    close(): void {
        if (!this.el) return;
        this.el.remove();
        this.el = null;
        AudioSys.getInstance().unduckMusic();
    }
}
