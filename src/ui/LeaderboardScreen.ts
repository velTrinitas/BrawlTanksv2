/**
 * LeaderboardScreen.ts — LB-F2 (FAZA 9c). Publiczny ranking, DOM overlay (jak MainMenu),
 * poza petla PIXI. Zakladki = rejestr boardow (LEADERBOARD_BOARDS), segment czasu
 * (Wszech/Tydzien/Dzis), chipy map w KTB, podium top-3 | lista 4..N, przypiety wiersz "TY".
 *
 * Dane: leaderboardService (RPC leaderboard_top / my_rank — dedupe best-per-player + ranga
 * + join profiles, po stronie Postgres). Avatary z AVATARS[avatarId].assetPath (DOM <img>).
 * i18n: t() literalne (board.id -> literal switch, bo dynamiczne t(varName) sie nie kompiluje).
 */

import type { IScreen } from './MainMenu';
import { AudioSys } from '../audio/AudioSys';
import { t } from '../i18n/i18n';
import { ProfileService } from '../services/ProfileService';
import { leaderboardService } from '../services/ScoreService';
import { LEADERBOARD_BOARDS, type BoardDefinition, type LeaderboardEntry, type MyRank, type TimeWindow } from '../services/leaderboard';
import { AVATARS, AVATAR_IDS } from '../config/avatars';
import type { AvatarId } from '../types/Profile';
import type { MapId } from '../types/MapType';

const WINDOWS: readonly TimeWindow[] = ['all', 'week', 'day'];
const DEFAULT_AVATAR: AvatarId = AVATAR_IDS[0];

export class LeaderboardScreen implements IScreen {
    private rootEl: HTMLElement | null = null;
    onBack: (() => void) | null = null;

    // Stan wyboru
    private board: BoardDefinition = LEADERBOARD_BOARDS.find(b => b.enabled) ?? LEADERBOARD_BOARDS[0];
    private window: TimeWindow = 'all';
    private map: MapId | null = null; // null = agregat "Wszystkie (najlepszy)"
    private loadToken = 0;            // guard przeciw wyscigom async przy szybkim klikaniu

    mount(root: HTMLElement): void {
        this.rootEl = document.createElement('div');
        this.rootEl.className = 'bt-settings-screen bt-lb-screen';
        root.appendChild(this.rootEl);
        this.renderShell();
        void this.reload();
    }

    unmount(): void {
        this.loadToken++; // uniewaznij pending load
        this.rootEl?.remove();
        this.rootEl = null;
    }

    // ── Shell (naglowek + zakladki + segment + chipy) — statyczne az do zmiany stanu ──
    private renderShell(): void {
        if (!this.rootEl) return;
        this.rootEl.innerHTML = `
            <header class="bt-settings-header">
                <button class="bt-settings-back" type="button" aria-label="${t('common.back')}">
                    <span class="bt-settings-back-arrow" aria-hidden="true">←</span>
                    <span class="bt-settings-back-label">${t('common.back')}</span>
                </button>
                <h2 class="bt-settings-title">${t('leaderboard.title')}</h2>
                <button class="bt-lb-refresh" type="button" aria-label="${t('leaderboard.refresh')}">🔄</button>
            </header>
            <div class="bt-lb-controls">
                <div class="bt-lb-tabs" role="tablist">${this.renderTabs()}</div>
                <div class="bt-lb-segment" role="tablist">${this.renderWindowSegment()}</div>
            </div>
            <div class="bt-lb-chips">${this.renderMapChips()}</div>
            <div class="bt-lb-body"><div class="bt-lb-status">${t('leaderboard.loading')}</div></div>
            <div class="bt-lb-you"></div>
        `;
        this.wireShell();
    }

    private renderTabs(): string {
        return LEADERBOARD_BOARDS.map(b => {
            const active = b.id === this.board.id ? 'is-active' : '';
            const locked = b.enabled ? '' : 'is-locked';
            return `<button class="bt-lb-tab ${active} ${locked}" type="button"
                        data-board="${b.id}" ${b.enabled ? '' : 'aria-disabled="true"'}>
                        <span aria-hidden="true">${b.icon}</span>
                        <span>${this.boardLabel(b.id)}</span>
                    </button>`;
        }).join('');
    }

    private renderWindowSegment(): string {
        return WINDOWS.map(w => {
            const active = w === this.window ? 'is-active' : '';
            return `<button class="bt-lb-seg ${active}" type="button" data-window="${w}">${this.windowLabel(w)}</button>`;
        }).join('');
    }

    private renderMapChips(): string {
        const chips = this.board.mapChips;
        if (!chips) return ''; // CTF / brak filtra mapy
        const all = `<button class="bt-lb-chip ${this.map === null ? 'is-active' : ''}" type="button" data-map="__all__">${t('leaderboard.map.all')}</button>`;
        const rest = chips.map(m =>
            `<button class="bt-lb-chip ${this.map === m ? 'is-active' : ''}" type="button" data-map="${m}">${this.mapLabel(m)}</button>`
        ).join('');
        return all + rest;
    }

    private wireShell(): void {
        const r = this.rootEl;
        if (!r) return;
        r.querySelector('.bt-settings-back')?.addEventListener('click', () => {
            AudioSys.getInstance().playMenuClick();
            this.onBack?.();
        });
        r.querySelector('.bt-lb-refresh')?.addEventListener('click', () => {
            AudioSys.getInstance().playMenuClick();
            void this.reload();
        });
        r.querySelectorAll<HTMLElement>('.bt-lb-tab').forEach(el => el.addEventListener('click', () => {
            const id = el.dataset.board;
            const b = LEADERBOARD_BOARDS.find(x => x.id === id);
            if (!b || !b.enabled || b.id === this.board.id) return;
            AudioSys.getInstance().playMenuClick();
            this.board = b;
            this.map = null; // reset filtra mapy przy zmianie scenariusza
            this.renderShell();
            void this.reload();
        }));
        r.querySelectorAll<HTMLElement>('.bt-lb-seg').forEach(el => el.addEventListener('click', () => {
            const w = el.dataset.window as TimeWindow | undefined;
            if (!w || w === this.window) return;
            AudioSys.getInstance().playMenuClick();
            this.window = w;
            this.renderShell();
            void this.reload();
        }));
        r.querySelectorAll<HTMLElement>('.bt-lb-chip').forEach(el => el.addEventListener('click', () => {
            const raw = el.dataset.map;
            const next = raw === '__all__' ? null : (raw as MapId);
            if (next === this.map) return;
            AudioSys.getInstance().playMenuClick();
            this.map = next;
            this.renderShell();
            void this.reload();
        }));
    }

    // ── Ladowanie danych + render listy ──────────────────────────────────────────
    private async reload(): Promise<void> {
        const token = ++this.loadToken;
        const bodyEl = this.rootEl?.querySelector('.bt-lb-body');
        const youEl = this.rootEl?.querySelector('.bt-lb-you');
        if (!bodyEl || !youEl) return;

        bodyEl.innerHTML = this.skeleton();
        youEl.innerHTML = '';

        const profileId = ProfileService.getActiveProfile()?.id ?? null;
        const q = { window: this.window, map: this.map, limit: 100 };

        let entries: LeaderboardEntry[] = [];
        let myRank: MyRank | null = null;
        try {
            [entries, myRank] = await Promise.all([
                leaderboardService.getLeaderboard(this.board, q),
                profileId ? leaderboardService.getMyRank(profileId, this.board, { window: this.window, map: this.map }) : Promise.resolve(null),
            ]);
        } catch {
            if (token !== this.loadToken) return;
            bodyEl.innerHTML = `<div class="bt-lb-status is-error">
                    <div class="bt-lb-status-msg">${t('leaderboard.error')}</div>
                    <button class="bt-lb-retry" type="button">${t('leaderboard.retry')}</button>
                </div>`;
            bodyEl.querySelector('.bt-lb-retry')?.addEventListener('click', () => {
                AudioSys.getInstance().playMenuClick();
                void this.reload();
            });
            return;
        }
        if (token !== this.loadToken) return; // przyszly starsze dane — porzuc

        if (entries.length === 0) {
            bodyEl.innerHTML = `<div class="bt-lb-status">${t('leaderboard.empty')}</div>`;
        } else {
            // Jedna lista — top-3 wyroznione tlem (zloto/srebro/braz); wejscie ze staggerem (i = opoznienie).
            bodyEl.innerHTML = `<div class="bt-lb-list">${entries.map((e, i) => this.listRow(e, profileId, i)).join('')}</div>`;
        }
        const rankUp = this.detectRankUp(myRank);
        youEl.innerHTML = this.youRow(myRank, profileId, rankUp);
    }

    /** Wiersze-szkielet (pulsujace) na czas ladowania — zamiast surowego "Wczytywanie…". */
    private skeleton(): string {
        const rows = Array.from({ length: 7 }, () =>
            `<div class="bt-lb-skel-row">
                <span class="bt-lb-skel bt-lb-skel-rank"></span>
                <span class="bt-lb-skel bt-lb-skel-av"></span>
                <span class="bt-lb-skel bt-lb-skel-name"></span>
                <span class="bt-lb-skel bt-lb-skel-score"></span>
            </div>`
        ).join('');
        return `<div class="bt-lb-list bt-lb-skeleton">${rows}</div>`;
    }

    // ── Rank-up flex: porownaj range z ostatnio ogladana (per board+okno+mapa) ──────
    private rankStorageKey(): string {
        return `bt2:lbrank_${this.board.id}_${this.window}_${this.map ?? 'all'}`;
    }
    /** true = ranga poprawila sie od ostatniego ogladania tego samego widoku. Zapisuje nowa range. */
    private detectRankUp(my: MyRank | null): boolean {
        if (!my || my.rank === null) return false;
        let improved = false;
        try {
            const raw = localStorage.getItem(this.rankStorageKey());
            const prev = raw ? parseInt(raw, 10) : NaN;
            if (Number.isFinite(prev) && my.rank < prev) improved = true; // mniejsza ranga = lepiej
            localStorage.setItem(this.rankStorageKey(), String(my.rank));
        } catch { /* localStorage niedostepny — pomijamy flex */ }
        return improved;
    }

    private listRow(e: LeaderboardEntry, myId: string | null, i = 0): string {
        const me = e.profileId === myId ? 'is-me' : '';
        const top = e.rank <= 3 ? `bt-lb-row--${e.rank}` : ''; // 1/2/3 => zlote/srebrne/brazowe tlo
        const delay = Math.min(i * 28, 560); // stagger wejscia, ale z cap zeby ogon nie czekal
        return `<div class="bt-lb-row ${top} ${me}" style="animation-delay:${delay}ms">
                    <span class="bt-lb-rank">${e.rank}</span>
                    ${this.avatarImg(e.avatarId)}
                    <span class="bt-lb-name">${this.esc(e.displayName)}</span>
                    <span class="bt-lb-score">${e.score.toLocaleString('pl-PL')}</span>
                </div>`;
    }

    private youRow(my: MyRank | null, myId: string | null, rankUp = false): string {
        if (!myId) return '';
        if (!my || my.rank === null || my.score === null) {
            return `<div class="bt-lb-you-row is-unranked">${t('leaderboard.noRank')}</div>`;
        }
        const up = rankUp ? 'is-rankup' : '';
        const badge = rankUp ? `<span class="bt-lb-rankup">▲ ${t('leaderboard.rankup')}</span>` : '';
        return `<div class="bt-lb-you-row ${up}">
                    <span class="bt-lb-you-label">${t('leaderboard.you')}</span>
                    <span class="bt-lb-rank">#${my.rank}</span>
                    ${badge}
                    <span class="bt-lb-you-total">/ ${my.total}</span>
                    <span class="bt-lb-score">${my.score.toLocaleString('pl-PL')}</span>
                </div>`;
    }

    private avatarImg(avatarId: string): string {
        const av = AVATARS[avatarId as AvatarId] ?? AVATARS[DEFAULT_AVATAR];
        const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
        return `<img class="bt-lb-avatar" src="${base}${av.assetPath}" alt="" loading="lazy" draggable="false">`;
    }

    // ── i18n helpers (literal t(), bo dynamiczne t(varName) sie nie kompiluje) ──────
    private boardLabel(id: string): string {
        switch (id) {
            case 'ktb':    return t('leaderboard.tab.ktb');
            case 'ctf':    return t('leaderboard.tab.ctf');
            case 'castle': return t('leaderboard.tab.castle');
            default:       return id;
        }
    }
    private windowLabel(w: TimeWindow): string {
        switch (w) {
            case 'all':  return t('leaderboard.window.all');
            case 'week': return t('leaderboard.window.week');
            case 'day':  return t('leaderboard.window.day');
        }
    }
    private mapLabel(m: MapId): string {
        switch (m) {
            case 'city':    return t('leaderboard.map.city');
            case 'desert':  return t('leaderboard.map.desert');
            case 'tropics': return t('leaderboard.map.tropics');
            case 'arctic':  return t('leaderboard.map.arctic');
            case 'mars':    return t('leaderboard.map.mars');
            default:        return m;
        }
    }

    private esc(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
