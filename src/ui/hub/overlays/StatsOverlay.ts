import { t } from '../../../i18n/i18n';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import { TROPHY_MILESTONES } from '../../../config/progression';
import { leaderboardService } from '../../../services/ScoreService';
import { LEADERBOARD_BOARDS } from '../../../services/leaderboard';

/**
 * StatsOverlay (HUB-5) — modal statystyk gracza, otwierany tapnieciem profilu w readoucie.
 * Dane z gotowych zrodel (zero nowego backendu): ProfileService (gry/data), PROG-F1
 * (trofea/srubki/milestony), leaderboard (najlepszy wynik KTB — async). Zamkniecie:
 * X / klik w scrim. Montowany w root hubu (position:absolute inset:0).
 */
export class StatsOverlay {
    private el: HTMLElement | null = null;
    private token = 0;

    open(parent: HTMLElement): void {
        this.close(); // pojedyncza instancja
        const myToken = ++this.token;

        const profile = ProfileService.getActiveProfile();
        const pid = profile?.id ?? 'default';
        const trophies = ProgressionService.getTrophies(pid);
        const bolts = ProgressionService.getBolts(pid);
        const milestones = TROPHY_MILESTONES.filter(m => trophies >= m.threshold).length;
        const games = profile?.totalGamesPlayed ?? 0;
        const since = profile ? new Date(profile.createdAt).toLocaleDateString() : '—';

        const tile = (icon: string, value: string | number, label: string): string => `
            <div class="bt-hub0-stat">
                <span class="i" aria-hidden="true">${icon}</span>
                <b>${value}</b>
                <small>${label}</small>
            </div>`;

        this.el = document.createElement('div');
        this.el.className = 'bt-hub0-overlay';
        this.el.innerHTML = `
            <div class="bt-hub0-modal" role="dialog" aria-modal="true">
                <button class="bt-hub0-modal-close" data-action="close" type="button"
                        aria-label="${t('common.close')}">✕</button>
                <h3 class="bt-hub0-modal-title">📊 ${t('hub.stats.title')}</h3>
                <div class="bt-hub0-stats">
                    ${tile('🏆', trophies, t('hub.nav.trophies'))}
                    ${tile(`<img class="bt-sigma bt-sigma--lg" src="${import.meta.env.BASE_URL}assets/sigma.png" alt="">`, bolts, t('hub.stats.bolts'))}
                    ${tile('🎯', milestones, t('hub.stats.milestones'))}
                    ${tile('🎮', games, t('hub.stats.games'))}
                    ${tile('📅', since, t('hub.stats.since'))}
                    ${tile('🏅', '<span data-best>…</span>', t('hub.stats.best'))}
                </div>
            </div>`;
        parent.appendChild(this.el);

        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target === this.el || target.closest('[data-action="close"]')) this.close();
        });

        void this.loadBest(pid, myToken);
    }

    private async loadBest(pid: string, myToken: number): Promise<void> {
        let best = '—';
        try {
            const mine = await leaderboardService.getMyRank(pid, LEADERBOARD_BOARDS[0], { window: 'all', map: null });
            best = mine.score != null ? String(mine.score) : '—';
        } catch (e) {
            console.warn('[HubStats] best score load failed:', (e as Error).stack ?? e);
        }
        if (myToken !== this.token || !this.el) return;
        const slot = this.el.querySelector('[data-best]');
        if (slot) slot.textContent = best;
    }

    close(): void {
        this.token++;
        this.el?.remove();
        this.el = null;
    }
}
