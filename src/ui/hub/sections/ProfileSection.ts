import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import { TROPHY_MILESTONES, ACCURACY_MIN_SHOTS } from '../../../config/progression';
import { leaderboardService } from '../../../services/ScoreService';
import { LEADERBOARD_BOARDS } from '../../../services/leaderboard';
import {
    getCosmetic, nickColorStyle, frameStyle, COSMETICS, cosmeticsByType, RARITY_COLOR,
    type CosmeticType,
} from '../../../config/cosmetics';
import { AVATARS } from '../../../config/avatars';
import { RANKS } from '../../../config/ranks';
import { flagImgHtml } from '../../flagArt';
import { rankBadgeHtml } from '../rankBadge';
import { cosmeticGroupsHtml, wireCosmeticGrid } from '../cosmeticGrid';
import { ProfileEditView } from './ProfileEditView';
import { playUiClick } from '../../uiSounds';
import { getCurrentSeason } from '../../../config/season';          // SEASON KIT — zakladka SEZON
import { getSeasonContent } from '../../../config/seasonContent';

/**
 * ProfileSection — PROFILE-1 (v0.118.0). Strona PROFILU GRACZA, otwierana tapnieciem
 * chipa gracza w readoucie (zastapila StatsOverlay HUB-5 — jego kafle wchlonal tab
 * Przeglad). Ukryta "sekcja" huba: renderuje sie w .bt-hub0-main (chrome top+nav
 * zostaje, scroll wewnetrzny za darmo), ale NIE jest w nawigacji — wejscie tylko
 * przez chip, wyjscie przyciskiem ← (HubShell wraca do poprzedniej sekcji).
 *
 * Zawartosc: hero (portret + nick WYSIWYG + flaga + pille trofea/SIGMA + EDYTUJ) →
 * pas Rang Zalog (placeholder per-czolg wg docs/crew-ranks-v1.md §8 — CR-4 wypelni) →
 * taby Przeglad / Rekordy / Kolekcja (kosmetyki przeniesione z GARAZU; skrzynki
 * zostaly w Garazu). Tryb edit = ProfileEditView (awatar 8 slotow / flaga / nick).
 * Caly DOM poza petla gry — zero kosztu frame-pacing.
 */

// v0.129.0: zakladka 'season' wycieta — cala tresc sezonu przeniesiona do
// dedykowanej sekcji SEZON (`SeasonSection`), do ktorej wchodzi sie pillem na belce.
type ProfileTab = 'overview' | 'records' | 'collection';

/** Kosmetyki aktywne w kolekcji — tytuly WYCIETE z UI (PROFILE-1; dane zostaja). */
const ACTIVE_COSMETIC_COUNT = COSMETICS.filter(c => c.type !== 'title').length;

export class ProfileSection implements HubSection {
    public readonly id = 'profile';
    public readonly icon = '🪖';
    label(): string { return t('hub.profile.title'); }

    /** Powrot do poprzedniej sekcji (HubShell pamieta ktora). */
    public onBack: (() => void) | null = null;
    /** Zmiana awatara/nicku/kosmetyku — HubShell odswieza readout. */
    public onProfileChanged: (() => void) | null = null;
    /**
     * v0.126.0 — skrot z pigulek profilu do wlasciwej sekcji (prosba Mariusza):
     * 🏆 -> TROFEA, sigmy -> SKLEP. Te dwie sekcje wypadly z doku, wiec profil jest
     * naturalnym drugim wejsciem — liczba stoi obok, a tapniecie prowadzi tam,
     * gdzie sie ja wydaje albo zdobywa.
     */
    public onNavigate: ((id: 'trophies' | 'shop') => void) | null = null;

    private activeTab: ProfileTab = 'overview';
    /** SHOP-1 — czy rozwiniety jest wybor stickera (kulka w rogu portretu). */
    private stickerPickerOpen = false;
    private editMode = false;
    private readonly editView = new ProfileEditView();
    private el: HTMLElement | null = null;
    /** Token async ladowania rankingu (wzorzec StatsOverlay.loadBest). */
    private rankToken = 0;

    constructor() {
        this.editView.onDone = () => {
            this.editMode = false;
            if (this.el) this.render(this.el);
            this.onProfileChanged?.();
        };
    }

    render(el: HTMLElement): void {
        this.el = el;
        const profile = ProfileService.getActiveProfile();

        // Defensywnie: brak profilu (manual localStorage clear) => fallback + powrot.
        if (!profile) {
            el.innerHTML = `
                <div class="bt-hub0-phead">
                    <button class="bt-hub0-pback" data-action="profile-back" type="button">←</button>
                    <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.profile.title')}</h2>
                </div>
                <div class="bt-hub0-phero"><b>${t('profile.edit.noProfileTitle')}</b></div>`;
            this.wireBack();
            return;
        }

        if (this.editMode) {
            el.innerHTML = `
                <div class="bt-hub0-phead">
                    <button class="bt-hub0-pback" data-action="profile-back" type="button">←</button>
                    <h2 class="bt-hub0-sectitle">✏️ ${t('profile.edit.title')}</h2>
                </div>
                <div data-edit-slot></div>`;
            this.wireBack();
            const slot = el.querySelector<HTMLElement>('[data-edit-slot]');
            if (slot) this.editView.render(slot);
            return;
        }

        el.innerHTML = `
            <div class="bt-hub0-phead">
                <button class="bt-hub0-pback" data-action="profile-back" type="button">←</button>
                <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.profile.title')}</h2>
            </div>
            ${this.heroHtml()}
            ${this.stickerPickerHtml()}
            ${this.ranksHtml()}
            ${this.tabsHtml()}
            <div class="bt-hub0-ptabcontent">${this.tabContentHtml()}</div>
        `;
        this.wire();
        if (this.activeTab === 'overview') void this.loadRank(profile.id);
    }

    // ── HERO: duzy portret + nick WYSIWYG + rzad duzych pilli + EDYTUJ ──────

    private heroHtml(): string {
        const profile = ProfileService.getActiveProfile()!;
        const pid = profile.id;
        const trophies = ProgressionService.getTrophies(pid);
        // SHOP-1: pille pokazuja SALDO, tak samo jak belka hubu — dwa miejsca nie moga
        // pokazywac dwoch roznych liczb tej samej waluty.
        const bolts = ProgressionService.getBoltsBalance(pid);
        const cos = ProgressionService.getCosmeticState(pid);
        const nickDef = cos.equipped.nickColor ? getCosmetic(cos.equipped.nickColor) : undefined;
        const frameDef = cos.equipped.frame ? getCosmetic(cos.equipped.frame) : undefined;
        const shimmer = nickDef?.animated ? ' bt-cos-shimmer' : '';
        const avatar = AVATARS[profile.avatarId];
        const since = new Date(profile.createdAt).toLocaleDateString();

        // Iteracja 5 (pkt 4): pustke w srodku hero wypelnia RANGA CZOLGISTY —
        // aktualny badge + pasek postepu zwyciestw do nastepnej rangi.
        const rank = ProgressionService.getRankState(pid);
        let rankProgress: string;
        if (rank.next) {
            const prev = rank.current?.wins ?? 0;
            const span = rank.next.wins - prev;
            const pct = span > 0 ? Math.round(Math.min(1, Math.max(0, (rank.wins - prev) / span)) * 100) : 0;
            rankProgress = `
                <span class="ph-rank-bar"><i style="width:${pct}%"></i></span>
                <small>${rank.wins}/${rank.next.wins} · ${rank.next.name}</small>`;
        } else {
            rankProgress = `<small>${t('hub.profile.rankMax')}</small>`;
        }
        const rankBadge = rank.current
            ? rankBadgeHtml(rank.current)
            : `<span class="rb-hex rb-hex--empty" aria-hidden="true"><i>?</i></span>`;
        const rankBlock = `
            <span class="ph-rank">
                <span class="ph-rank-badge">${rankBadge}</span>
                <span class="ph-rank-info">
                    <small class="ph-rank-label">${t('hub.profile.rankTitle')}</small>
                    <b>${rank.current?.name ?? '—'}</b>
                    ${rankProgress}
                </span>
            </span>`;

        return `
            <div class="bt-hub0-phero bt-hub0-phero--v2">
                <span class="ph-portrait-wrap">
                    <span class="ph-portrait" style="${frameStyle(frameDef)}">
                        <img src="${import.meta.env.BASE_URL}${avatar.assetPath}" alt="" draggable="false">
                    </span>
                    ${this.stickerBubbleHtml(cos)}
                </span>
                <span class="ph-info">
                    <b class="ph-nick${shimmer}" style="${nickColorStyle(nickDef)}">${profile.nickname}</b>
                    <span class="ph-pills">
                        <span class="ph-pill ph-pill--flag">${flagImgHtml(profile.flagId, 'ph-flagimg')}</span>
                        <button class="ph-pill ph-pill--btn" data-goto="trophies" type="button"
                                aria-label="${t('hub.nav.trophies')}"><span class="ic" aria-hidden="true">🏆</span>${trophies}</button>
                        <button class="ph-pill ph-pill--btn" data-goto="shop" type="button"
                                aria-label="${t('hub.shop')}"><img class="bt-sigma" src="${import.meta.env.BASE_URL}assets/sigma.png" alt="">${bolts}</button>
                        <span class="ph-pill ph-pill--dim"><span class="ic" aria-hidden="true">📅</span>${since}</span>
                    </span>
                </span>
                ${rankBlock}
                <button class="bt-hub0-pbtn bt-hub0-pbtn--gold ph-edit" data-action="profile-edit" type="button">
                    ✏️ ${t('hub.profile.edit')}
                </button>
            </div>`;
    }

    // ── SHOP-1: sticker na portrecie ────────────────────────────────────────

    /**
     * Kulka w rogu portretu — zalozony sticker albo zaproszenie „+".
     * MUSI byc rodzenstwem .ph-portrait, nie dzieckiem: portret ma overflow:hidden
     * (potrzebne na zaokraglenie awatara), wiec kulka w srodku zostalaby przycieta.
     */
    private stickerBubbleHtml(cos: { equipped: Partial<Record<CosmeticType, string>> }): string {
        const def = cos.equipped.sticker ? getCosmetic(cos.equipped.sticker) : undefined;
        let inner: string;
        if (def?.emoji) inner = `<span class="ph-sticker-emoji" aria-hidden="true">${def.emoji}</span>`;
        else if (def?.asset) inner = `<img src="${import.meta.env.BASE_URL}${def.asset}" alt="" draggable="false" onerror="this.remove()">`;
        else inner = `<span class="ph-sticker-add" aria-hidden="true">+</span>`;
        return `<button class="ph-sticker${def ? ' is-set' : ''}" data-action="sticker-toggle"
                        type="button" aria-label="${t('hub.profile.sticker')}">${inner}</button>`;
    }

    /**
     * Wybor stickera — rozwijany pod hero. Pokazuje TYLKO posiadane; pusta lista
     * mowi wprost, gdzie ich szukac, zamiast zostawiac gracza z pusta ramka.
     * Ponowne tapniecie zalozonego zdejmuje go (equipCosmetic to toggle po typie).
     */
    private stickerPickerHtml(): string {
        if (!this.stickerPickerOpen) return '';
        const pid = ProfileService.getActiveProfile()?.id ?? 'default';
        const cos = ProgressionService.getCosmeticState(pid);
        const owned = cosmeticsByType('sticker').filter(d => cos.owned.includes(d.id));
        if (!owned.length) {
            return `<div class="ph-stickerpick"><p class="sp-empty">${t('hub.profile.stickerEmpty')}</p></div>`;
        }
        const tiles = owned.map(d => {
            const art = d.emoji
                ? `<span class="sp-emoji" aria-hidden="true">${d.emoji}</span>`
                : `<img src="${import.meta.env.BASE_URL}${d.asset ?? ''}" alt="" draggable="false" onerror="this.remove()">`;
            return `
            <button class="sp-tile${cos.equipped.sticker === d.id ? ' is-equipped' : ''}"
                    data-sticker="${d.id}" type="button" style="--g:${RARITY_COLOR[d.rarity]}"
                    aria-label="${t(d.labelKey)}">${art}</button>`;
        }).join('');
        return `<div class="ph-stickerpick">${tiles}</div>`;
    }

    // ── RANGA CZOLGISTY: drabinka 10 rang NA ZYWO (RANKS-1) ─────────────────

    private ranksHtml(): string {
        // Iteracja 5 (pkt 6, decyzja Mariusza): rangi PER GRACZ (zwyciestwa
        // dowolnym czolgiem), system DZIALA — chip WKROTCE usuniety. Sloty:
        // zdobyte = badge w kolorze, nastepny = podswietlony z postepem X/Y,
        // przyszle = przyciemniony badge/hex z nazwa (aspiracja).
        const pid = ProfileService.getActiveProfile()?.id ?? 'default';
        const rank = ProgressionService.getRankState(pid);
        const slots = RANKS.map(r => {
            const done = rank.current !== null && r.level <= rank.current.level;
            const isNext = rank.next?.level === r.level;
            const cls = done ? ' pr-slot--done' : isNext ? ' pr-slot--next' : ' pr-slot--future';
            const label = isNext ? `${rank.wins}/${r.wins}` : r.name;
            return `
            <span class="pr-slot${cls}" title="${r.name}">
                ${rankBadgeHtml(r)}
                <small>${label}</small>
            </span>`;
        }).join('');
        return `
            <div class="bt-hub0-ranks-teaser bt-hub0-pranks">
                <div class="rt-head">
                    <span class="rt-title">🎖️ ${t('hub.profile.rankTitle')}</span>
                </div>
                <div class="pr-line">${slots}</div>
                <small class="rt-hint">${t('hub.profile.rankHint')}</small>
            </div>`;
    }

    // ── TABY ────────────────────────────────────────────────────────────────

    private tabsHtml(): string {
        const tab = (id: ProfileTab, label: string) => `
            <button class="bt-hub0-ptab${this.activeTab === id ? ' is-active' : ''}"
                    data-ptab="${id}" type="button">${label}</button>`;
        return `
            <div class="bt-hub0-ptabs" role="tablist">
                ${tab('overview', t('hub.profile.tab.overview'))}
                ${tab('records', t('hub.profile.tab.records'))}
                ${tab('collection', t('hub.profile.tab.collection'))}
            </div>`;
    }

    private tabContentHtml(): string {
        switch (this.activeTab) {
            case 'overview': return this.overviewHtml();
            case 'records': return this.recordsHtml();
            case 'collection': return this.collectionHtml();
        }
    }

    /** Kafel statystyki (gramatyka StatsOverlay/HUB-5 — CSS .bt-hub0-stat reuse). */
    /**
     * v0.128.0 (zgloszenie Mariusza) — emoji 💎 to systemowy niebieski brylant, czyli
     * INNY ksztalt i kolor niz gem, ktory gracz realnie zbiera na mapie. Kafel ma
     * pokazywac te sama rzecz co gra. Wzorzec 1:1 z `sigmaImg` w `overviewHtml`;
     * metoda, bo ikona jest potrzebna w DWOCH zakladkach (Przeglad i Rekordy).
     */
    private gemIcon(): string {
        return `<img class="bt-sigma bt-sigma--gem" src="${import.meta.env.BASE_URL}assets/gem.png" alt="">`;
    }

    private tile(icon: string, value: string | number, label: string): string {
        return `
            <div class="bt-hub0-stat">
                <span class="i" aria-hidden="true">${icon}</span>
                <b>${value}</b>
                <small>${label}</small>
            </div>`;
    }

    /** Czas gry dla dziecka: "3h 24m" / "24m" / "45s". */
    private formatPlaytime(totalSeconds: number): string {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m`;
        return `${totalSeconds}s`;
    }

    private overviewHtml(): string {
        const pid = ProfileService.getActiveProfile()!.id;
        const stats = ProgressionService.getStatsState(pid);
        const trophies = ProgressionService.getTrophies(pid);
        // SHOP-1: SALDO, nie lifetime. Kafel podpisany jest po prostu „SIGMY", a obok
        // w hero stoja pille z ta sama etykieta — dwie rozne liczby pod tym samym
        // slowem to gotowe poczucie, ze gra sie myli. Jedno slowo = jedna liczba.
        const bolts = ProgressionService.getBoltsBalance(pid);
        const milestones = TROPHY_MILESTONES.filter(m => trophies >= m.threshold).length;
        const sigmaImg = `<img class="bt-sigma bt-sigma--lg" src="${import.meta.env.BASE_URL}assets/sigma.png" alt="">`;
        const gemImg = this.gemIcon();
        // 9. kafel (iteracja 2: pelny grid 3x3 na desktopie): CELNOSC OGOLNA
        // lifetime — clamp 100 (fragi/breakup zawyzaja trafienia, fix przy L2b).
        const lifeAcc = stats.lifetime.shotsFired > 0
            ? `${Math.min(100, Math.round((stats.lifetime.shotsHit / stats.lifetime.shotsFired) * 100))}%`
            : '—';
        // "Najlepsze na mapach" WYCIETE (iteracja 2, decyzja Mariusza: nic nie wnosi).
        return `
            <div class="bt-hub0-stats bt-hub0-stats--9">
                ${this.tile('🏆', trophies, t('hub.nav.trophies'))}
                ${this.tile(sigmaImg, bolts, t('hub.stats.bolts'))}
                ${this.tile('🎮', stats.totalRuns, t('hub.stats.games'))}
                ${this.tile('⭐', milestones, t('hub.stats.milestones'))}
                ${this.tile('💀', stats.lifetime.kills, t('hub.profile.kills'))}
                ${this.tile(gemImg, stats.lifetime.gems, t('hub.profile.gems'))}
                ${this.tile('⏱️', this.formatPlaytime(stats.lifetime.seconds), t('hub.profile.time'))}
                ${this.tile('🎯', lifeAcc, t('hub.profile.accuracy'))}
                ${this.tile('🏅', '<span data-rank>…</span>', t('hub.profile.rank'))}
            </div>`;
    }

    private recordsHtml(): string {
        const pid = ProfileService.getActiveProfile()!.id;
        const { records, perMapBest } = ProgressionService.getStatsState(pid);
        const dash = '—';
        const acc = records.bestAccuracy > 0 ? `${records.bestAccuracy}%` : dash;
        const combo = records.maxCombo > 0 ? `${records.maxCombo}x` : dash;
        // 6. rekord (iteracja 2): NAJLEPSZY WYNIK = max z PB na mapach.
        const bestScore = Math.max(0, ...Object.values(perMapBest));
        return `
            <div class="bt-hub0-stats bt-hub0-stats--9">
                ${this.tile('🥇', bestScore || dash, t('hub.stats.best'))}
                ${this.tile('💀', records.maxKills || dash, t('hub.profile.rec.kills'))}
                ${this.tile(this.gemIcon(), records.maxGems || dash, t('hub.profile.rec.gems'))}
                ${this.tile('⏱️', records.maxSeconds > 0 ? this.formatPlaytime(records.maxSeconds) : dash, t('hub.profile.rec.time'))}
                ${this.tile('🎯', acc, t('hub.profile.rec.accuracy'))}
                ${this.tile('🔥', combo, t('hub.profile.rec.combo'))}
            </div>
            <small class="bt-hub0-phint">${t('hub.profile.accHint', { n: ACCURACY_MIN_SHOTS })} · ${t('hub.profile.recHint')}</small>`;
    }

    private collectionHtml(): string {
        const pid = ProfileService.getActiveProfile()!.id;
        const cos = ProgressionService.getCosmeticState(pid);
        // Licznik i grid BEZ tytulow (wyciete z UI w PROFILE-1; dane zostaja).
        const ownedActive = cos.owned.filter(id => getCosmetic(id)?.type !== 'title').length;
        return `
            <div class="bt-hub0-cos-head">${t('hub.garage.cosmetics', { owned: ownedActive, total: ACTIVE_COSMETIC_COUNT })}</div>
            ${cosmeticGroupsHtml(cos, ['nickColor', 'frame'])}`;
    }

    // ── async ranking (token-guard — wzorzec StatsOverlay.loadBest) ─────────

    private async loadRank(pid: string): Promise<void> {
        const myToken = ++this.rankToken;
        let label = '—';
        try {
            const mine = await leaderboardService.getMyRank(pid, LEADERBOARD_BOARDS[0], { window: 'all', map: null });
            label = mine.rank != null ? `#${mine.rank}` : '—';
        } catch (e) {
            console.warn('[Profile] rank load failed:', (e as Error).stack ?? e);
        }
        if (myToken !== this.rankToken || !this.el) return;
        const slot = this.el.querySelector('[data-rank]');
        if (slot) slot.textContent = label;
    }

    // ── wiring ──────────────────────────────────────────────────────────────

    private wireBack(): void {
        this.el?.querySelector('[data-action="profile-back"]')?.addEventListener('click', () => {
            playUiClick();
            if (this.editMode) {
                this.editMode = false;
                if (this.el) this.render(this.el);
            } else {
                this.onBack?.();
            }
        });
    }

    private wire(): void {
        const el = this.el;
        if (!el) return;
        this.wireBack();

        el.querySelector('[data-action="profile-edit"]')?.addEventListener('click', () => {
            playUiClick();
            this.editMode = true;
            this.editView.reset();
            this.render(el);
        });

        // v0.126.0 — pigulki 🏆 / sigmy jako skroty do TROFEOW i SKLEPU.
        el.querySelectorAll<HTMLElement>('[data-goto]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.goto;
                if (id !== 'trophies' && id !== 'shop') return;
                playUiClick();
                this.onNavigate?.(id);
            });
        });

        // SHOP-1 — kulka stickera: rozwin/zwin wybor, a w nim zaloz/zdejmij.
        el.querySelector('[data-action="sticker-toggle"]')?.addEventListener('click', () => {
            playUiClick();
            this.stickerPickerOpen = !this.stickerPickerOpen;
            this.render(el);
        });
        el.querySelectorAll<HTMLElement>('[data-sticker]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.sticker;
                if (!id) return;
                playUiClick();
                const pid = ProfileService.getActiveProfile()?.id ?? 'default';
                ProgressionService.equipCosmetic(pid, id); // toggle po typie
                this.render(el);
            });
        });

        el.querySelectorAll<HTMLElement>('[data-ptab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.ptab as ProfileTab;
                if (tab === this.activeTab) return;
                playUiClick();
                this.activeTab = tab;
                this.render(el);
            });
        });

        if (this.activeTab === 'collection') {
            const pid = ProfileService.getActiveProfile()?.id ?? 'default';
            wireCosmeticGrid(el, pid, () => {
                this.render(el);            // odswiez grid (equipped highlight)
                this.onProfileChanged?.();  // odswiez readout hubu (nick/ramka na zywo)
            });
        }
    }
}
