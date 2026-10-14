/**
 * LeaderboardScreen.ts — LB-F2 (FAZA 9c). Publiczny ranking, DOM overlay (jak MainMenu),
 * poza petla PIXI. Zakladki = rejestr boardow (LEADERBOARD_BOARDS), dropdown czasu
 * (Wszech/Tydzien/Dzis), mapa + poziom w popoverze Filtry (v0.249.0), podium top-3 | lista 4..N, przypiety wiersz "TY".
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
import { backArrowIcon } from './hub/gameIcons';
import { tankPillHtml } from './tankPill'; // v0.240.0: czolg obok nazwy gracza
import { difficultyPillHtml, difficultyIcon, difficultyLabel, DIFFICULTY_ORDER } from './difficultyPill'; // v0.246.0
import { isLbDiffEnabled } from '../config/lbDiffFlag'; // v0.246.0
import type { DifficultyId } from '../types/GameConfig';

const WINDOWS: readonly TimeWindow[] = ['all', 'week', 'day'];
const DEFAULT_AVATAR: AvatarId = AVATAR_IDS[0];

export class LeaderboardScreen implements IScreen {
    private rootEl: HTMLElement | null = null;
    onBack: (() => void) | null = null;

    // Stan wyboru
    private board: BoardDefinition = LEADERBOARD_BOARDS.find(b => b.enabled) ?? LEADERBOARD_BOARDS[0];
    private window: TimeWindow = 'all';
    private map: MapId | null = null; // null = agregat "Wszystkie (najlepszy)"
    private difficulty: DifficultyId | null = null; // v0.246.0: null = wszystkie poziomy (tylko przy LB_DIFF_LIVE)
    private openDd: string | null = null; // v0.249.0: otwarty popover (board/window/filters)
    private loadToken = 0;            // guard przeciw wyscigom async przy szybkim klikaniu

    mount(root: HTMLElement): void {
        this.rootEl = document.createElement('div');
        this.rootEl.className = 'bt-settings-screen bt-lb-screen';
        root.appendChild(this.rootEl);
        this.openDd = null;
        document.addEventListener('pointerdown', this.onDocPointer);
        document.addEventListener('keydown', this.onDocKey);
        this.renderShell();
        void this.reload();
    }

    unmount(): void {
        this.loadToken++; // uniewaznij pending load
        document.removeEventListener('pointerdown', this.onDocPointer);
        document.removeEventListener('keydown', this.onDocKey);
        this.rootEl?.remove();
        this.rootEl = null;
    }

    // ── Shell: JEDEN rzad dropdownow (Tryb / Czas / Filtry) + linia skrotu aktywnych filtrow ──
    // v0.249.0 (Mariusz): 4 rzedy chipow zaslanialy ranking na mobile (2-3 widoczne wiersze).
    // Domyslny widok = KTB / wszech czasow / wszystkie mapy / kazdy poziom; szczegoly w popoverze Filtry.
    private renderShell(): void {
        if (!this.rootEl) return;
        this.rootEl.innerHTML = `
            <header class="bt-settings-header">
                <button class="bt-settings-back" type="button" aria-label="${t('common.back')}">
                    ${backArrowIcon(22)}
                    <span class="bt-settings-back-label">${t('common.back')}</span>
                </button>
                <h2 class="bt-settings-title">${t('leaderboard.title')}</h2>
                <button class="bt-lb-refresh" type="button" aria-label="${t('leaderboard.refresh')}">🔄</button>
            </header>
            <div class="bt-lb-bar">
                ${this.renderBoardDropdown()}
                ${this.renderWindowDropdown()}
                ${this.renderFiltersDropdown()}
            </div>
            ${this.renderActiveSummary()}
            <div class="bt-lb-body"><div class="bt-lb-status">${t('leaderboard.loading')}</div></div>
            <div class="bt-lb-you"></div>
        `;
        this.wireShell();
    }

    /** Wspolny przycisk dropdownu: etykieta sekcji (desktop) + wartosc + strzalka. */
    private ddButton(id: string, label: string, valueHtml: string, extra = ''): string {
        const open = this.openDd === id;
        return `<button class="bt-lb-dd ${open ? 'is-open' : ''}" type="button" data-dd="${id}" aria-haspopup="true" aria-expanded="${open}">
                    <span class="bt-lb-dd-label">${label}</span>
                    <span class="bt-lb-dd-value">${valueHtml}</span>
                    ${extra}
                    <span class="bt-lb-dd-caret" aria-hidden="true">▾</span>
                </button>`;
    }

    private renderBoardDropdown(): string {
        const opts = LEADERBOARD_BOARDS.map(b => {
            const active = b.id === this.board.id ? 'is-active' : '';
            const locked = b.enabled ? '' : 'is-locked';
            return `<button class="bt-lb-opt ${active} ${locked}" type="button" data-board="${b.id}" ${b.enabled ? '' : 'aria-disabled="true"'}>
                        <span class="bt-lb-opt-ico" aria-hidden="true">${b.enabled ? b.icon : '🔒'}</span>
                        <span>${this.boardLabel(b.id)}</span>
                    </button>`;
        }).join('');
        const value = `<span aria-hidden="true">${this.board.icon}</span><span class="bt-lb-dd-tx">${this.boardLabel(this.board.id)}</span>`;
        return `<div class="bt-lb-ddwrap bt-lb-ddwrap--board">
                    ${this.ddButton('board', t('leaderboard.dd.mode'), value)}
                    <div class="bt-lb-pop" data-pop="board" ${this.openDd === 'board' ? '' : 'hidden'}>${opts}</div>
                </div>`;
    }

    private renderWindowDropdown(): string {
        const opts = WINDOWS.map(w =>
            `<button class="bt-lb-opt ${w === this.window ? 'is-active' : ''}" type="button" data-window="${w}">${this.windowLabel(w)}</button>`
        ).join('');
        const value = `<span aria-hidden="true">🕒</span><span class="bt-lb-dd-tx">${this.windowLabel(this.window)}</span>`;
        return `<div class="bt-lb-ddwrap bt-lb-ddwrap--window">
                    ${this.ddButton('window', t('leaderboard.dd.time'), value)}
                    <div class="bt-lb-pop" data-pop="window" ${this.openDd === 'window' ? '' : 'hidden'}>${opts}</div>
                </div>`;
    }

    /** Ile filtrow odbiega od domyslnego widoku (badge na przycisku Filtry). */
    private activeFilterCount(): number {
        return (this.map !== null ? 1 : 0) + (this.difficulty !== null ? 1 : 0);
    }

    private renderFiltersDropdown(): string {
        const mapChips = this.renderMapChips();
        const diffChips = this.renderDiffChips();
        if (!mapChips && !diffChips) return ''; // np. CTF bez flagi poziomu — nic do filtrowania
        const n = this.activeFilterCount();
        const badge = n > 0 ? `<span class="bt-lb-dd-badge">${n}</span>` : '';
        // Desktop: wartosc = co odfiltrowane (etykieta FILTRY nad nia). Telefon: krotko 'Filtry' + badge, szczegoly w linii skrotu.
        const valueTx = n > 0 ? this.activeFilterParts().join(' · ') : t('leaderboard.map.all');
        const value = `<span aria-hidden="true">⚙️</span><span class="bt-lb-dd-tx bt-lb-dd-tx--wide">${valueTx}</span><span class="bt-lb-dd-tx bt-lb-dd-tx--short">${t('leaderboard.filters')}</span>`;
        const mapSec = mapChips ? `<div class="bt-lb-popsec"><div class="bt-lb-popsec-title">${t('leaderboard.filters.map')}</div><div class="bt-lb-chips bt-lb-chips--grid">${mapChips}</div></div>` : '';
        const diffSec = diffChips ? `<div class="bt-lb-popsec"><div class="bt-lb-popsec-title">${t('leaderboard.filters.diff')}</div><div class="bt-lb-chips bt-lb-chips--grid bt-lb-diffs">${diffChips}</div></div>` : '';
        const clear = n > 0 ? `<button class="bt-lb-clear" type="button" data-clear="1">✕ ${t('leaderboard.filters.clear')}</button>` : '';
        return `<div class="bt-lb-ddwrap bt-lb-ddwrap--filters">
                    ${this.ddButton('filters', t('leaderboard.filters'), value, badge)}
                    <div class="bt-lb-pop bt-lb-pop--filters" data-pop="filters" ${this.openDd === 'filters' ? '' : 'hidden'}>${mapSec}${diffSec}${clear}</div>
                </div>`;
    }

    private activeFilterParts(): string[] {
        const parts: string[] = [];
        if (this.map !== null) parts.push(this.esc(this.mapLabel(this.map)));
        if (this.difficulty !== null) parts.push(`${difficultyIcon(this.difficulty)} ${this.diffChipLabel(this.difficulty)}`);
        return parts;
    }

    /** Linia skrotu pod paskiem — tylko gdy filtr aktywny; ✕ = jeden tap do domyslnego widoku. */
    private renderActiveSummary(): string {
        if (this.activeFilterCount() === 0) return '';
        const parts = this.activeFilterParts();
        return `<div class="bt-lb-summary">
                    <span class="bt-lb-summary-tx">${parts.join(' · ')}</span>
                    <button class="bt-lb-summary-x" type="button" data-clear="1" aria-label="${t('leaderboard.filters.clear')}">✕</button>
                </div>`;
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

    /** v0.246.0: filtr poziomu (WSZYSTKIE + 4 poziomy w kolorach pickera). Pusty bez flagi => sekcja znika. */
    private renderDiffChips(): string {
        if (!isLbDiffEnabled()) return '';
        const all = `<button class="bt-lb-chip bt-lb-diffchip ${this.difficulty === null ? 'is-active' : ''}" type="button" data-diff="__all__">${t('leaderboard.diff.all')}</button>`;
        const rest = DIFFICULTY_ORDER.map(d =>
            `<button class="bt-lb-chip bt-lb-diffchip bt-lb-diffchip--${d} ${this.difficulty === d ? 'is-active' : ''}" type="button" data-diff="${d}" title="${this.diffChipLabel(d)}">`
            + `<span aria-hidden="true">${difficultyIcon(d)}</span><span class="bt-lb-diffchip-tx">${this.diffChipLabel(d)}</span></button>`
        ).join('');
        return all + rest;
    }

    /** Zmiana stanu filtra: przerysuj shell (popover zostaje wg openDd) i przeladuj liste. */
    private apply(mutate: () => void, closeDd: boolean): void {
        AudioSys.getInstance().playMenuClick();
        mutate();
        if (closeDd) this.openDd = null;
        this.renderShell();
        void this.reload();
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
        // Otwieranie/zamykanie dropdownow — tylko przelaczenie atrybutow, bez przerysowania (lista nie miga).
        r.querySelectorAll<HTMLElement>('.bt-lb-dd').forEach(el => el.addEventListener('click', () => {
            const id = el.dataset.dd ?? null;
            AudioSys.getInstance().playMenuClick();
            this.setOpenDd(this.openDd === id ? null : id);
        }));
        r.querySelectorAll<HTMLElement>('.bt-lb-opt[data-board]').forEach(el => el.addEventListener('click', () => {
            const b = LEADERBOARD_BOARDS.find(x => x.id === el.dataset.board);
            if (!b || !b.enabled) return;
            if (b.id === this.board.id) { this.setOpenDd(null); return; }
            this.apply(() => { this.board = b; this.map = null; }, true); // reset filtra mapy przy zmianie scenariusza
        }));
        r.querySelectorAll<HTMLElement>('.bt-lb-opt[data-window]').forEach(el => el.addEventListener('click', () => {
            const w = el.dataset.window as TimeWindow | undefined;
            if (!w) return;
            if (w === this.window) { this.setOpenDd(null); return; }
            this.apply(() => { this.window = w; }, true);
        }));
        r.querySelectorAll<HTMLElement>('.bt-lb-diffchip').forEach(el => el.addEventListener('click', () => {
            const raw = el.dataset.diff;
            const next = raw === '__all__' ? null : (raw as DifficultyId);
            if (next === this.difficulty) return;
            this.apply(() => { this.difficulty = next; }, false); // panel Filtry zostaje otwarty
        }));
        r.querySelectorAll<HTMLElement>('.bt-lb-chip[data-map]').forEach(el => el.addEventListener('click', () => {
            const raw = el.dataset.map;
            const next = raw === '__all__' ? null : (raw as MapId);
            if (next === this.map) return;
            this.apply(() => { this.map = next; }, false);
        }));
        r.querySelectorAll<HTMLElement>('[data-clear]').forEach(el => el.addEventListener('click', () => {
            this.apply(() => { this.map = null; this.difficulty = null; }, true);
        }));
    }

    private setOpenDd(id: string | null): void {
        this.openDd = id;
        const r = this.rootEl;
        if (!r) return;
        r.querySelectorAll<HTMLElement>('.bt-lb-pop').forEach(p => { p.hidden = p.dataset.pop !== id; });
        r.querySelectorAll<HTMLElement>('.bt-lb-dd').forEach(b => {
            const open = b.dataset.dd === id;
            b.classList.toggle('is-open', open);
            b.setAttribute('aria-expanded', String(open));
        });
    }

    /** Tap poza dropdownem / Esc zamyka popover. Listenery na document — zdejmowane w unmount. */
    private readonly onDocPointer = (e: PointerEvent): void => {
        if (!this.openDd) return;
        const tgt = e.target as Element | null;
        if (tgt && tgt.closest('.bt-lb-ddwrap')) return;
        this.setOpenDd(null);
    };
    private readonly onDocKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape' && this.openDd) this.setOpenDd(null);
    };

    // ── Ladowanie danych + render listy ──────────────────────────────────────────
    private async reload(): Promise<void> {
        const token = ++this.loadToken;
        const bodyEl = this.rootEl?.querySelector('.bt-lb-body');
        const youEl = this.rootEl?.querySelector('.bt-lb-you');
        if (!bodyEl || !youEl) return;

        bodyEl.innerHTML = this.skeleton();
        youEl.innerHTML = '';

        const profileId = ProfileService.getActiveProfile()?.id ?? null;
        const q = { window: this.window, map: this.map, difficulty: this.difficulty, limit: 100 };

        let entries: LeaderboardEntry[] = [];
        let myRank: MyRank | null = null;
        try {
            [entries, myRank] = await Promise.all([
                leaderboardService.getLeaderboard(this.board, q),
                profileId ? leaderboardService.getMyRank(profileId, this.board, { window: this.window, map: this.map, difficulty: this.difficulty }) : Promise.resolve(null),
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
        return `bt2:lbrank_${this.board.id}_${this.window}_${this.map ?? 'all'}${this.difficulty ? '_' + this.difficulty : ''}`; // v0.246.0: + poziom
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
                    ${tankPillHtml(e.brawlerId)}
                    ${difficultyPillHtml(e.difficulty)}
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
            case 'save_queen': return t('leaderboard.tab.save_queen');
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
    /** v0.249.0: w filtrach poziom zapisany normalnie (Łatwy), nie kapitalikami jak pill w wierszu. */
    private diffChipLabel(d: DifficultyId): string {
        switch (d) {
            case 'easy':      return t('leaderboard.diff.easy');
            case 'normal':    return t('leaderboard.diff.normal');
            case 'hard':      return t('leaderboard.diff.hard');
            case 'nightmare': return t('leaderboard.diff.nightmare');
        }
    }
    private mapLabel(m: MapId): string {
        switch (m) {
            case 'city':    return t('leaderboard.map.city');
            case 'desert':  return t('leaderboard.map.desert');
            case 'tropics': return t('leaderboard.map.tropics');
            case 'arctic':  return t('leaderboard.map.arctic');
            case 'mars':    return t('leaderboard.map.mars');
            case 'junkyard': return t('leaderboard.map.junkyard');
            default:        return m;
        }
    }

    private esc(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
