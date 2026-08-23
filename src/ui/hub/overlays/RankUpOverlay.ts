import { t } from '../../../i18n/i18n';
import { AudioSys } from '../../../audio/AudioSys';
import { rankBadgeHtml } from '../rankBadge';
import type { RankDef } from '../../../config/ranks';

/**
 * RankUpOverlay — RANKS-1 (v0.118.0). SPEKTAKULARNA celebracja awansu rangi
 * (decyzja Mariusza: "efekt wow, konfetti, fanfary, dym, blask"). Pokazywana
 * w hubie, gdy getRankState().pendingCelebration (HubShell.maybeCelebrateRank).
 *
 * Sensoryka (wszystko CSS/DOM — zero petli gry, zero kosztu frame-pacing):
 * zloty scrim + wirujace promienie (conic, wzorzec crate-reveal) + radial blask
 * + "dym" (miekkie kola unoszace sie fade) + KONFETTI 36 czastek (per-czastka
 * losowe --dx/--rot/--clr/--delay) + badge wjezdza scale-bounce + FANFARA
 * (rank_fanfare.wav, generowana). prefers-reduced-motion: same tresci bez animacji.
 */
const CONFETTI_COLORS = ['#f1c40f', '#ffe066', '#3aa0e0', '#2ecc71', '#e74c3c', '#b07ef7', '#ffffff'];

export class RankUpOverlay {
    private el: HTMLElement | null = null;

    /** Czy overlay jest otwarty (HubShell nie odpala drugiego). */
    get isOpen(): boolean { return this.el !== null; }

    open(parent: HTMLElement, rank: RankDef, onDone: () => void): void {
        this.close();

        // konfetti: deterministycznie rozne czastki przez inline custom properties
        let confetti = '';
        for (let i = 0; i < 36; i++) {
            const dx = (Math.random() * 2 - 1) * 46;          // vw rozrzut poziomy
            const delay = Math.random() * 0.6;
            const dur = 1.6 + Math.random() * 1.2;
            const rot = Math.round(Math.random() * 720 - 360);
            const clr = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            const w = 6 + Math.round(Math.random() * 6);
            confetti += `<i style="--dx:${dx.toFixed(1)}vw;--rot:${rot}deg;--clr:${clr};--d:${delay.toFixed(2)}s;--dur:${dur.toFixed(2)}s;--w:${w}px"></i>`;
        }
        // dym: miekkie kola unoszace sie spod badge
        let smoke = '';
        for (let i = 0; i < 6; i++) {
            const dx = (i - 2.5) * 34;
            smoke += `<b style="--sx:${dx}px;--d:${(0.15 + i * 0.12).toFixed(2)}s"></b>`;
        }
        const reward = `<img class="bt-sigma bt-sigma--lg" src="${import.meta.env.BASE_URL}assets/sigma.png" alt=""> ${rank.bolts}${rank.crates ? ` · 📦${rank.crates > 1 ? ` x${rank.crates}` : ''}` : ''}`;

        this.el = document.createElement('div');
        this.el.className = 'bt-rankup';
        this.el.innerHTML = `
            <div class="bt-rankup-rays" aria-hidden="true"></div>
            <div class="bt-rankup-confetti" aria-hidden="true">${confetti}</div>
            <div class="bt-rankup-card" role="dialog" aria-modal="true">
                <div class="bt-rankup-glow" aria-hidden="true"></div>
                <div class="bt-rankup-smoke" aria-hidden="true">${smoke}</div>
                <span class="bt-rankup-badge">${rankBadgeHtml(rank)}</span>
                <h2 class="bt-rankup-title">${t('rankup.title')}</h2>
                <div class="bt-rankup-name">${rank.name}</div>
                <div class="bt-rankup-reward">${t('rankup.reward')}: ${reward}</div>
                <button class="bt-hub0-pbtn bt-hub0-pbtn--gold bt-rankup-cta" data-action="rankup-close" type="button">
                    ${t('rankup.cta')}
                </button>
            </div>`;
        parent.appendChild(this.el);

        try {
            AudioSys.getInstance().playRankFanfare();
        } catch (e) {
            console.warn('[RankUp] fanfare failed:', (e as Error).stack ?? e);
        }

        const finish = () => {
            this.close();
            onDone();
        };
        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target === this.el || target.closest('[data-action="rankup-close"]')) finish();
        });
    }

    close(): void {
        this.el?.remove();
        this.el = null;
    }
}
