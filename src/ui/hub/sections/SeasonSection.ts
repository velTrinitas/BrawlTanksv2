import { t } from '../../../i18n/i18n';
import { crateIcon, sigmaIcon, cosmeticThumb } from '../gameIcons';
import type { HubSection } from './HubSection';
import {
    getCurrentSeason, isSeasonActive, seasonDaysLeft, seasonElapsedPct, SEASONS,
} from '../../../config/season';
import { getSeasonContent, type SeasonTrackReward } from '../../../config/seasonContent';
import { seasonTankForSeason } from '../../../config/seasonTank'; // v0.250.0 czolg sezonu
import { brawlerById, tankPortrait } from '../seasonTankUi';
import { tankName } from './BattleSection';
import { isSeasonV2Enabled } from '../../../config/seasonV2Flag'; // v0.250.0 SEZON v2
import { cosmeticArtHtml } from '../cosmeticGrid'; // v0.250.0: ta sama grafika nagrody co w skrzynce
import { getCosmetic } from '../../../config/cosmetics';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';

/**
 * SeasonSection (SEZON) — v0.129.0. Pelna strona sezonu, wejscie przez pill na belce.
 *
 * DLACZEGO POWSTALA. Do v0.128.0 tresc sezonu byla rozsypana na TRZY powierzchnie,
 * z ktorych kazda pokazywala kawalek tego samego:
 *   - pill na belce: numer + licznik znajdziek + dni do konca,
 *   - popup `SeasonOverlay`: art, odliczanie, mini-siatka 6 kafli, pasek ksiazek,
 *     bullety "co wprowadza sezon", CTA do Season Tracku,
 *   - czwarta zakladka w PROFILU: pelna kolekcja z nazwami, tor progow, tor bramek.
 * Gracz musial zlozyc obraz sezonu z trzech miejsc, a dwa z nich dublowaly kolekcje
 * i postep. Ta sekcja to SCALENIE, nie nowa funkcja — kazdy blok nizej pochodzi
 * z popupu albo z zakladki profilu, oba zrodla zostaly skasowane.
 *
 * KOLEKCJA JEST JEDNA. Popup mial kafle ~92 px bez nazw, profil ~46 px z nazwami
 * i licznikami. Zostal wariant z profilu (`.ps-items`) — przy okazji realizuje
 * zgloszenie Mariusza "pomniejsz ikony o 50%", bo 46 to dokladnie polowa 92.
 *
 * v0.206.0 (Mariusz, playtest mobile): kafel sezoniaka w dwoch wierszach (ikona +
 * nazwa obok, liczba pod spodem, duza), nagrody bramek jako PRAWDZIWY ART z rejestru
 * zamiast emoji (🏅 czytalo sie jako „metal", 👑 nic nie mowilo) — i co wazniejsze,
 * te nagrody TERAZ ISTNIEJA w `ProgressionService.creditSeasonRewards` (sigmy za 5/5,
 * skin profilu za 6/6). Do tej wersji ikony obiecywaly nagrody, ktorych kod nie dawal.
 *
 * Wszystko czytane z manifestu sezonu, wiec nowy sezon nie wymaga tu zmian.
 */
export class SeasonSection implements HubSection {
    public readonly id = 'season';
    public readonly icon = '🎖️';
    label(): string { return t('hub.nav.season'); }

    /** HubShell: przejscie do PUCHARKOW + scroll do Season Tracku. */
    public onViewTrack: (() => void) | null = null;
    /** v0.250.0 — HubShell: odswiez belke (sigmy) po wyplacie toru przy wejsciu na strone. */
    public onRewardsClaimed: (() => void) | null = null;

    private el: HTMLElement | null = null;

    render(el: HTMLElement): void {
        this.el = el;
        // v0.250.0 SEZON v2: dociagniecie wyplat toru (np. progi sprzed flipu), potem nowa strona.
        const pid = ProfileService.getActiveProfile()?.id;
        if (isSeasonV2Enabled() && pid) {
            const grant = ProgressionService.claimSeasonTrack(pid);
            el.innerHTML = this.htmlV2(pid);
            for (const id of grant.tiers ?? []) el.querySelector(`[data-tier="${id}"]`)?.classList.add('is-fresh');
            if (grant.tiers?.length) this.onRewardsClaimed?.();
            requestAnimationFrame(() => this.scrollTrailToNext(el));
            return;
        }
        el.innerHTML = this.html();
        el.querySelector('[data-action="view-track"]')?.addEventListener('click', () => {
            this.onViewTrack?.();
        });
    }

    /**
     * Blok INFO — to, co do v0.128.0 bylo popupem. Art sezonu jest opcjonalny:
     * `onerror` zdejmuje <img> i zostaje proceduralne tlo sterowane tokenem
     * `--season`, wiec sezon bez dostarczonej grafiki wyglada poprawnie sam z siebie.
     *
     * SCIEZKA ARTU: `seasons/<id>/hero.jpg`. Do v0.128.0 kod czytal plaski
     * `seasons/<id>.jpg` ze STAREGO formatu, mimo ze kontrakt SEASON_ENGINE v2
     * dawno przeszedl na katalogi — dlatego hero Sezonu 2 sie nie ladowal, choc
     * plik lezal na dysku.
     */
    private infoHtml(points: number | null): string {
        const season = getCurrentSeason();
        const active = isSeasonActive();
        const timeChip = active
            ? `⏳ ${t('hub.season.daysLeft', { n: seasonDaysLeft() })}`
            : t('hub.season.ended');
        // v0.140.0 — MINI-PASEK DNI pod tytulem. Jezyk wizualny odtworzony ze skasowanego
        // `SeasonOverlay` (`.so-collect-bar`, v0.129.0): cienki tor z wypelnieniem
        // w gradiencie akcentu. Rozny jest tylko sens — tamten liczyl punkty do progu,
        // ten uplyw sezonu.
        //
        // Pasek pokazuje CZAS, ktory uplynal, a chip obok mowi ile ZOSTALO — to ta sama
        // informacja z dwoch stron i celowo: liczba jest konkretna, pasek daje wyczucie
        // „ile jeszcze zdaze". Sezon zakonczony nie dostaje paska (pelny tor niczego juz
        // nie komunikuje, a sugerowalby, ze cos trwa).
        const daysBar = active
            ? `<div class="so-daysbar" role="presentation">
                   <i style="width:${Math.round(seasonElapsedPct() * 100)}%"></i>
               </div>`
            : '';
        const bullets = season.bulletKeys.map(key => `<li>${t(key)}</li>`).join('');
        const heroImg = `<img class="so-art" src="${import.meta.env.BASE_URL}seasons/${season.id}/hero.jpg"
            alt="" draggable="false" onerror="this.remove()"
            onload="this.parentElement.classList.add('has-art')">`;

        // v0.140.0 — RZAD DZIELONY 5/6 + 1/6 (uklad wskazany przez Mariusza).
        // Baner zostaje w swoim boksie, a licznik dostaje WLASNY, waski kafel obok:
        // podpis w pierwszym wierszu, liczba w drugim. W v0.139.0 licznik byl chipem
        // wewnatrz bloku info — gubil sie obok licznika dni, bo oba wygladaly tak samo.
        // Sezon bez znajdziek (`points === null`) nie dostaje boksu i baner bierze
        // caly rzad, wiec Arena nie pokazuje pustej ramki z zerem.
        const countBox = points !== null
            ? `<div class="bt-season-count" style="--season:${season.accentColor}">
                   <span class="sc-label">${t('hub.season.itemsBox')}</span>
                   <b class="sc-value">${points}</b>
               </div>`
            : '';

        return `
            <div class="bt-season-row${points !== null ? '' : ' is-solo'}">
                <div class="bt-season-info" style="--season:${season.accentColor}">
                    <div class="so-hero">
                        ${heroImg}
                        <span class="so-ghost" aria-hidden="true">${season.id.toUpperCase()}</span>
                        <span class="so-emoji" aria-hidden="true">${season.emoji}</span>
                    </div>
                    <div class="bt-season-info-body">
                        <h3 class="so-title">${t(season.nameKey)}</h3>
                        <div class="so-meta">
                            <div class="so-time${active ? '' : ' is-ended'}">${timeChip}</div>
                        </div>
                        ${daysBar}
                        <div class="so-whatsnew">${t('hub.season.whatsNew')}</div>
                        <ul class="so-bullets">${bullets}</ul>
                        <button class="bt-hub0-pbtn bt-hub0-pbtn--gold so-cta" data-action="view-track" type="button">
                            🏆 ${t('hub.season.viewTrack')}
                        </button>
                    </div>
                </div>
                ${countBox}
            </div>`;
    }

    private html(): string {
        const season = getCurrentSeason();
        const content = getSeasonContent(season.id);
        const profile = ProfileService.getActiveProfile();
        // v0.206.0 — bez emoji przy naglowku (Mariusz, pkt 8a); pole `icon` zostaje dla
        // ewentualnej nawigacji.
        const head = `<h2 class="bt-hub0-sectitle">${t('hub.nav.season')}</h2>`;

        // Sezon bez znajdziek (Arena w roadmapie 2027, sezony fabularne) dostaje sam
        // blok info — pusta kolekcja i tory z zerami byly by szumem, nie informacja.
        if (!content || !profile) return head + this.infoHtml(null);

        const owned = ProgressionService.getSeasonItemsOwned(profile.id);
        const points = ProgressionService.getSeasonCollected(profile.id);
        const claimed = new Set(ProgressionService.getSeasonRewardsClaimed(profile.id));
        const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
        const pts = t('season.pts');

        // Kolekcja: 6 kafli. v0.206.0 — DWA WIERSZE: [ikona | nazwa] nad duza liczba.
        // Niezdobyte to "?" — luka ciekawosci; zamiast liczby pokazuja WARTOSC (N pkt).
        const tiles = content.items.map(it => {
            const n = owned[it.value] ?? 0;
            const glow = '#' + it.glow.toString(16).padStart(6, '0');
            return n > 0
                ? `<div class="ps-item is-owned" style="--g:${glow}">
                       <div class="ps-item-top">
                           <img src="${base}${it.asset}" alt="" draggable="false">
                           <span class="ps-item-name">${t(it.nameKey)}</span>
                       </div>
                       <span class="ps-item-n">×${n}</span>
                   </div>`
                : `<div class="ps-item">
                       <div class="ps-item-top">
                           <span class="ps-item-q">?</span>
                           <span class="ps-item-name">???</span>
                       </div>
                       <span class="ps-item-n">${it.value} ${pts}</span>
                   </div>`;
        }).join('');

        // Tor ILOSCI: progi punktowe -> skrzynki
        const ptRows = content.pointThresholds.map(th => {
            const done = claimed.has(`pts:${th.points}`) || points >= th.points;
            return `<div class="ps-th${done ? ' is-done' : ''}">
                        <span>${done ? '✓' : '○'} ${th.points} ${pts}</span>
                        <span class="ps-th-rew">${crateIcon(18)}${th.crates > 1 ? ` ×${th.crates}` : ''}</span>
                    </div>`;
        }).join('');

        // Tor ROZNORODNOSCI: bramki zbiorow (kolejnosc zdobycia bez znaczenia)
        const gate = (key: string, values: readonly number[], label: string, reward: string) => {
            const have = values.filter(v => (owned[v] ?? 0) > 0).length;
            const done = claimed.has(`set:${key}`) || have === values.length;
            return `<div class="ps-th${done ? ' is-done' : ''}">
                        <span>${done ? '✓' : '○'} ${label} <b>${have}/${values.length}</b></span>
                        <span class="ps-th-rew">${reward}</span>
                    </div>`;
        };

        // v0.206.0 — nagrody bramek z MANIFESTU i z REJESTRU KOSMETYKOW, nie z emoji:
        // 3/3 skrzynka (art skrzynki), 5/5 sigmy (art sigmy + kwota), 6/6 skin profilu
        // (miniatura dekoru + nazwa). Gracz widzi DOKLADNIE to, co dostanie.
        const { titleBolts, fullCosmetic } = content.setRewards;
        const skinDef = getCosmetic(fullCosmetic);
        const skinReward = skinDef
            ? `${cosmeticThumb(fullCosmetic, 20)}<small class="ps-rew-name">${t(skinDef.labelKey)}</small>`
            : cosmeticThumb(fullCosmetic, 20);
        const sigmaReward = `${sigmaIcon(16)}<b>${titleBolts}</b>`;

        // v0.139.0 (pkt 7): dwa tory OBOK SIEBIE. Kazdy ma po 3-4 krotkie wiersze,
        // wiec ustawione pod soba zjadaly pol ekranu na powietrze. Podzial na kolumny
        // jest w CSS (`.ps-tracks`), na waskim ekranie wraca do jednej kolumny.
        // Naglowki obu torow to <img> (nie emoji) — ten sam typ elementu = ta sama
        // wysokosc linii = wyrownane kolumny (pkt 8e).
        return `
            ${head}
            ${this.infoHtml(points)}
            <div class="ps-season">
                <div class="bt-hub0-subhead">${t('season.currentSeasonals')}</div>
                <div class="ps-items">${tiles}</div>

                <div class="ps-tracks">
                    <div class="ps-track">
                        <div class="bt-hub0-subhead">${crateIcon(16)} ${t('hub.profile.season.pointTrack')}</div>
                        <div class="ps-ths">${ptRows}</div>
                    </div>
                    <div class="ps-track">
                        <div class="bt-hub0-subhead">${cosmeticThumb(fullCosmetic, 16)} ${t('hub.profile.season.setTrack')}</div>
                        <div class="ps-ths">
                            ${gate('crate', content.varietyGates.crate, t('hub.profile.season.gateCrate'), crateIcon(18))}
                            ${gate('title', content.varietyGates.title, t('hub.profile.season.gateTitle'), sigmaReward)}
                            ${gate('full', content.varietyGates.full, t('hub.profile.season.gateFull'), skinReward)}
                        </div>
                    </div>
                </div>
            </div>`;
    }


    // ══════════════════════════════════════════════════════════════════════════
    // v0.250.0 SEZON v2 — sezoniaki = jedyny licznik sezonu; Szlak Sezonu na tej stronie.
    // Uklad: [hero sezonu | box SEZONIAKI] -> SZLAK SEZONU (poziomy tor) -> [KOLEKCJA | KOMPLETY].
    // Wszystko z manifestu (seasonContent.track), wiec nowy sezon = dane, nie kod.
    // ══════════════════════════════════════════════════════════════════════════

    /** Ilustracja nagrody tieru: kosmetyk (ta sama grafika co w skrzynce) albo sigmy/skrzynki. */
    private rewardArt(rw: SeasonTrackReward, px: number): string {
        const def = rw.cosmetic ? getCosmetic(rw.cosmetic) : undefined;
        if (def) return cosmeticArtHtml(def, px);
        if (rw.seasonTank) {
            // v0.250.0: gdy czolg sezonu jest zdefiniowany — jego portret (zablokowany = przygaszony z klodka).
            const tank = seasonTankForSeason(getCurrentSeason().id);
            const b = tank ? brawlerById(tank.brawlerId) : undefined;
            if (b) {
                const locked = ProgressionService.isTankLocked(ProfileService.getActiveProfile()?.id ?? 'default', b.id);
                return `<span class="sv2-art sv2-art--tankimg${locked ? ' is-locked' : ''}" style="width:${Math.round(px * 1.5)}px;height:${px}px;--tank:${b.colorMain}"><img src="${tankPortrait(b)}" alt="" draggable="false">${locked ? '<i>🔒</i>' : ''}</span>`;
            }
            return `<span class="sv2-art sv2-art--tank" style="width:${Math.round(px * 1.25)}px;height:${px}px;">🛡️<i>?</i></span>`;
        }
        if (rw.crates) return `<span class="sv2-art">${crateIcon(Math.round(px * 0.8))}</span>`;
        return `<span class="sv2-art">${sigmaIcon(Math.round(px * 0.7))}</span>`;
    }

    /** Podpis nagrody: nazwa kosmetyku / czolg sezonu + dodatki (sigmy, skrzynki). */
    private rewardLabel(rw: SeasonTrackReward): string {
        const parts: string[] = [];
        const def = rw.cosmetic ? getCosmetic(rw.cosmetic) : undefined;
        if (def) parts.push(`<b class="sv2-rname">${t(def.labelKey)}</b>`);
        if (rw.seasonTank) {
            const tank = seasonTankForSeason(getCurrentSeason().id);
            const b = tank ? brawlerById(tank.brawlerId) : undefined;
            parts.push(b ? `<b class="sv2-rname">${t('hub.seasonTank.title')}: ${tankName(b)}</b>` : `<b class="sv2-rname">${t('hub.season.tankSoon')}</b>`);
        }
        const extras: string[] = [];
        if (rw.bolts) extras.push(`${sigmaIcon(13)}<b>${rw.bolts}</b>`);
        if (rw.crates) extras.push(`${crateIcon(15)}${rw.crates > 1 ? `<b>×${rw.crates}</b>` : ''}`);
        if (extras.length) parts.push(`<span class="sv2-rextra">${extras.join('<i class="sep">+</i>')}</span>`);
        return parts.join('');
    }

    private htmlV2(pid: string): string {
        const season = getCurrentSeason();
        const content = getSeasonContent(season.id);
        const track = ProgressionService.getSeasonTrackState(pid);
        if (!content || !track) return `<h2 class="bt-hub0-sectitle">${t('hub.nav.season')}</h2>` + this.infoHtml(null);

        const base = import.meta.env.BASE_URL;
        const active = isSeasonActive();
        const pts = t('season.pts');
        const pointTiers = track.tiers.filter(x => x.tier.kind === 'points');
        // v0.250.0: komplety + „Ukoncz caly szlak" w jednym panelu (oba to cele kolekcjonerskie).
        const setTiers = track.tiers.filter(x => x.tier.kind === 'set' || x.tier.kind === 'complete');
        const maxPts = pointTiers.length ? pointTiers[pointTiers.length - 1].tier.need : 0;
        const icon = content.counterIcon ?? content.items[content.items.length - 1].asset;
        const owned = ProgressionService.getSeasonItemsOwned(pid);

        // ── HERO + BOX SEZONIAKI ──
        const timeChip = active ? `⏳ ${t('hub.season.daysLeft', { n: seasonDaysLeft() })}` : t('hub.season.ended');
        const daysBar = active ? `<div class="so-daysbar" role="presentation"><i style="width:${Math.round(seasonElapsedPct() * 100)}%"></i></div>` : '';
        const nextTxt = track.next
            ? t('hub.season.toNext', { n: track.next.tier.need - track.points })
            : t('hub.season.trailDone');
        const top = `
            <div class="sv2-top" style="--season:${season.accentColor}">
                <div class="sv2-hero">
                    <img class="sv2-hero-art" src="${base}seasons/${season.id}/hero.jpg" alt="" draggable="false" onerror="this.remove()">
                    <div class="sv2-hero-body">
                        <span class="sv2-eyebrow">${season.emoji} ${t('hub.season.eyebrow')}</span>
                        <h3 class="sv2-title">${t(season.nameKey)}</h3>
                        <div class="sv2-time${active ? '' : ' is-ended'}">${timeChip}</div>
                        ${daysBar}
                    </div>
                </div>
                <div class="sv2-count">
                    <img class="sv2-count-ico" src="${base}${icon}" alt="" draggable="false">
                    <b class="sv2-count-n">${track.points}</b>
                    <span class="sv2-count-lbl">${t('hub.season.itemsBox')}</span>
                    <span class="sv2-count-next">${nextTxt}</span>
                </div>
            </div>`;

        // ── SZLAK SEZONU (progi punktowe) ──
        let prevNeed = 0;
        const nextId = track.next?.tier.id;
        const nodes = pointTiers.map(x => {
            const span = x.tier.need - prevNeed;
            const pct = x.done ? 100 : Math.max(0, Math.min(100, Math.round(((track.points - prevNeed) / span) * 100)));
            prevNeed = x.tier.need;
            const state = x.done ? 'is-done' : x.tier.id === nextId ? 'is-next' : 'is-future';
            const big = x.tier.reward.cosmetic || x.tier.reward.seasonTank ? ' is-big' : '';
            return `<div class="sv2-node ${state}${big}" data-tier="${x.tier.id}">
                        <div class="sv2-need"><span>${x.tier.need}</span> ${pts}</div>
                        <div class="sv2-bar"><i style="width:${pct}%"></i></div>
                        <div class="sv2-card">
                            ${this.rewardArt(x.tier.reward, 46)}
                            <div class="sv2-rlabel">${this.rewardLabel(x.tier.reward)}</div>
                            ${x.done ? '<span class="sv2-check" aria-hidden="true">✓</span>' : ''}
                        </div>
                    </div>`;
        }).join('');
        const trail = `
            <div class="sv2-trail">
                <div class="sv2-trail-head">
                    <span class="sv2-trail-title">🗺️ ${t('hub.season.trail')}</span>
                    <span class="sv2-trail-pts"><img src="${base}${icon}" alt="">${t('hub.season.trailPts', { n: track.points, max: maxPts })}</span>
                </div>
                <div class="sv2-track" data-trail>${nodes}</div>
            </div>`;

        // ── KOLEKCJA (6 sezoniakow) ──
        const tiles = content.items.map(it => {
            const n = owned[it.value] ?? 0;
            const glow = '#' + it.glow.toString(16).padStart(6, '0');
            // Uklad wg szkicu Mariusza: [ikona nad nazwa | duze ×N]; tlo w kolorze rzadkosci + odblask.
            return n > 0
                ? `<div class="sv2-item is-owned" style="--g:${glow}" title="${t(it.nameKey)}">
                       <div class="sv2-item-l">
                           <img src="${base}${it.asset}" alt="" draggable="false">
                           <span class="sv2-item-name">${t(it.nameKey)}</span>
                       </div>
                       <b class="sv2-item-n">×${n}</b>
                       <i class="sv2-item-shine" aria-hidden="true"></i>
                   </div>`
                : `<div class="sv2-item">
                       <div class="sv2-item-l">
                           <span class="sv2-item-q">?</span>
                           <span class="sv2-item-name">???</span>
                       </div>
                       <b class="sv2-item-n is-pts">${it.value}<small>${pts}</small></b>
                   </div>`;
        }).join('');

        // ── KOMPLETY (rozne sezoniaki) ──
        const sets = setTiers.map(x => {
            const pct = Math.min(100, Math.round((x.value / x.tier.need) * 100));
            return `<div class="sv2-set${x.done ? ' is-done' : ''}">
                        <div class="sv2-set-art">${this.rewardArt(x.tier.reward, 36)}</div>
                        <div class="sv2-set-body">
                            <div class="sv2-set-need">${x.tier.kind === 'complete'
                                ? `🏅 ${t('hub.season.complete')} · ${t('hub.season.completeNeed', { n: Math.min(x.value, x.tier.need), need: x.tier.need })}`
                                : t('hub.season.setNeed', { n: Math.min(x.value, x.tier.need), need: x.tier.need })}</div>
                            <div class="sv2-bar"><i style="width:${pct}%"></i></div>
                            <div class="sv2-rlabel">${this.rewardLabel(x.tier.reward)}</div>
                        </div>
                        ${x.done ? '<span class="sv2-check" aria-hidden="true">✓</span>' : ''}
                    </div>`;
        }).join('');

        return `
            <h2 class="bt-hub0-sectitle">${t('hub.nav.season')}</h2>
            ${top}
            ${trail}
            <div class="sv2-bottom">
                <div class="sv2-panel">
                    <div class="bt-hub0-subhead">${t('season.currentSeasonals')}</div>
                    <div class="sv2-items">${tiles}</div>
                    <p class="sv2-howto">💡 ${t('hub.season.howTo')}</p>
                </div>
                <div class="sv2-panel">
                    <div class="bt-hub0-subhead">${t('hub.season.sets')}</div>
                    <div class="sv2-sets">${sets}</div>
                </div>
            </div>            ${this.museumHtml(pid)}
        `;
    }

    /**
     * v0.250.0 — MUZEUM SEZONOW: zakonczone sezony z archiwum (nazwa, zebrane sezoniaki, 6 mini-ikon,
     * odznaka UKONCZONY). Pusta lista = brak sekcji (nowy gracz nie widzi pustej gabloty).
     */
    private museumHtml(pid: string): string {
        const arch = ProgressionService.getSeasonArchive(pid);
        if (!arch.length) return '';
        const base = import.meta.env.BASE_URL;
        const rows = arch.map(e => {
            const cfg = SEASONS.find(x => x.id === e.id);
            const c = getSeasonContent(e.id);
            const icons = (c?.items ?? []).map(it => (e.items[it.value] ?? 0) > 0
                ? `<img src="${base}${it.asset}" alt="" draggable="false">`
                : '<span class="q">?</span>').join('');
            return `<div class="sv2-mus${e.completed ? ' is-done' : ''}" style="--season:${cfg?.accentColor ?? '#888'}">
                        <span class="sv2-mus-emo">${cfg?.emoji ?? '🎖️'}</span>
                        <span class="sv2-mus-name">${cfg ? t(cfg.nameKey) : e.id}</span>
                        <span class="sv2-mus-items">${icons}</span>
                        <b class="sv2-mus-pts">${e.collected} ${t('season.pts')}</b>
                        ${e.completed ? `<span class="sv2-mus-badge">🏅 ${t('hub.season.completedBadge')}</span>` : ''}
                    </div>`;
        }).join('');
        return `<div class="sv2-panel sv2-museum"><div class="bt-hub0-subhead">🏛️ ${t('hub.season.museum')}</div>${rows}</div>`;
    }

    /** Auto-scroll toru do najblizszej nagrody (gracz od razu widzi, na co zbiera). */
    private scrollTrailToNext(el: HTMLElement): void {
        const trackEl = el.querySelector<HTMLElement>('[data-trail]');
        const target = trackEl?.querySelector<HTMLElement>('.sv2-node.is-next') ?? null;
        if (!trackEl || !target) return;
        trackEl.scrollLeft = Math.max(0, target.offsetLeft - trackEl.clientWidth / 2 + target.clientWidth / 2);
    }

    /** Odswiezenie po zmianie stanu (np. powrot z meczu). */
    refresh(): void {
        if (this.el) this.render(this.el);
    }
}
