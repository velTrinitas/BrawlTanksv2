import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { leaderboardService } from '../../../services/ScoreService';
import { LEADERBOARD_BOARDS, type LeaderboardEntry, type MyRank } from '../../../services/leaderboard';

/**
 * RankSection (RANKING) — HUB-6. Mini-board reuse istniejacego backendu leaderboardu
 * (leaderboardService RPC — ten sam co LeaderboardScreen): top-5 boardu KTB (all-time,
 * agregat map) + przypiety wiersz „TY”. Deep-link „Pelny ranking” → MainMenu.show('leaderboard').
 * Async z token-guard (przelaczenie sekcji w trakcie fetchu nie nadpisze cudzej tresci).
 *
 * v0.119.0 (decyzja Mariusza): nav RANKING otwiera OD RAZU pelny LeaderboardScreen
 * (przechwycenie w HubShell.wire) — render() mini-boardu NIEOSIAGALNY z nav.
 * Klasa zostaje w sections[] (daje ikone/label nav) i na wypadek powrotu widgetu.
 */
export class RankSection implements HubSection {
    public readonly id = 'rank';
    public readonly icon = '🏅';
    label(): string { return t('hub.nav.rank'); }

    /** Deep-link do pelnego ekranu rankingu. */
    public onOpenLeaderboard: (() => void) | null = null;

    private token = 0;

    render(el: HTMLElement): void {
        const myToken = ++this.token;
        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.rank')}</h2>
            <div class="bt-hub0-placeholder">${t('common.loading')}</div>
            ${this.fullBtn()}
        `;
        this.wireFull(el);
        void this.load(el, myToken);
    }

    private async load(el: HTMLElement, myToken: number): Promise<void> {
        const board = LEADERBOARD_BOARDS[0]; // KTB
        const pid = ProfileService.getActiveProfile()?.id ?? null;
        try {
            const [top, mine] = await Promise.all([
                leaderboardService.getLeaderboard(board, { window: 'all', map: null, limit: 5 }),
                pid ? leaderboardService.getMyRank(pid, board, { window: 'all', map: null }) : Promise.resolve(null),
            ]);
            if (myToken !== this.token || !el.isConnected) return; // stale / unmounted
            el.innerHTML = this.renderBoard(top, mine, pid);
        } catch (e) {
            console.warn('[HubRank] load failed:', (e as Error).stack ?? e);
            if (myToken !== this.token || !el.isConnected) return;
            el.innerHTML = `
                <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.rank')}</h2>
                <div class="bt-hub0-placeholder">${t('hub.rank.error')}</div>
                ${this.fullBtn()}`;
        }
        this.wireFull(el);
    }

    private renderBoard(top: LeaderboardEntry[], mine: MyRank | null, pid: string | null): string {
        const medal = (r: number): string => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);
        const rows = top.length === 0
            ? `<div class="bt-hub0-placeholder">${t('hub.rank.empty')}</div>`
            : top.map(e => `
                <div class="bt-hub0-rankrow${pid && e.profileId === pid ? ' is-me' : ''}">
                    <span class="pos">${medal(e.rank)}</span>
                    <span class="who">${e.displayName}</span>
                    <span class="pts">${e.score}</span>
                </div>`).join('');

        const meRow = mine && mine.rank !== null ? `
            <div class="bt-hub0-rankrow is-me is-you">
                <span class="pos">#${mine.rank}</span>
                <span class="who">${t('hub.rank.you')}</span>
                <span class="pts">${mine.score ?? 0}</span>
            </div>` : '';

        return `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.rank')} · ${t('scenario.ktb.name')}</h2>
            <div class="bt-hub0-ranklist">${rows}</div>
            ${meRow}
            ${this.fullBtn()}
        `;
    }

    private fullBtn(): string {
        return `<button class="bt-hub0-rankfull" data-action="full" type="button">${t('hub.rank.full')} →</button>`;
    }

    private wireFull(el: HTMLElement): void {
        el.querySelector('[data-action="full"]')?.addEventListener('click', () => this.onOpenLeaderboard?.());
    }
}
