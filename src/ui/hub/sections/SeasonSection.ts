import { t } from '../../../i18n/i18n';
import { crateIcon } from '../gameIcons';
import type { HubSection } from './HubSection';
import {
    getCurrentSeason, isSeasonActive, seasonDaysLeft, seasonElapsedPct,
} from '../../../config/season';
import { getSeasonContent } from '../../../config/seasonContent';
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
 * Wszystko czytane z manifestu sezonu, wiec nowy sezon nie wymaga tu zmian.
 */
export class SeasonSection implements HubSection {
    public readonly id = 'season';
    public readonly icon = '🎖️';
    label(): string { return t('hub.nav.season'); }

    /** HubShell: przejscie do TROFEOW + scroll do Season Tracku. */
    public onViewTrack: (() => void) | null = null;

    private el: HTMLElement | null = null;

    render(el: HTMLElement): void {
        this.el = el;
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
        const head = `<h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.season')}</h2>`;

        // Sezon bez znajdziek (Arena w roadmapie 2027, sezony fabularne) dostaje sam
        // blok info — pusta kolekcja i tory z zerami byly by szumem, nie informacja.
        if (!content || !profile) return head + this.infoHtml(null);

        const owned = ProgressionService.getSeasonItemsOwned(profile.id);
        const points = ProgressionService.getSeasonCollected(profile.id);
        const claimed = new Set(ProgressionService.getSeasonRewardsClaimed(profile.id));
        const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

        // Kolekcja: 6 kafli z licznikiem. Niezdobyte to "?" — luka ciekawosci.
        const tiles = content.items.map(it => {
            const n = owned[it.value] ?? 0;
            const glow = '#' + it.glow.toString(16).padStart(6, '0');
            return n > 0
                ? `<div class="ps-item is-owned" style="--g:${glow}">
                       <img src="${base}${it.asset}" alt="" draggable="false">
                       <span class="ps-item-name">${t(it.nameKey)}</span>
                       <span class="ps-item-n">×${n}</span>
                   </div>`
                : `<div class="ps-item">
                       <span class="ps-item-q">?</span>
                       <span class="ps-item-name">???</span>
                       <span class="ps-item-n">${it.value} pkt</span>
                   </div>`;
        }).join('');

        // Tor ILOSCI: progi punktowe -> skrzynki
        const ptRows = content.pointThresholds.map(th => {
            const done = claimed.has(`pts:${th.points}`) || points >= th.points;
            return `<div class="ps-th${done ? ' is-done' : ''}">
                        <span>${done ? '✓' : '○'} ${th.points} pkt</span>
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

        // v0.139.0 (pkt 7): dwa tory OBOK SIEBIE. Kazdy ma po 3-4 krotkie wiersze,
        // wiec ustawione pod soba zjadaly pol ekranu na powietrze. Podzial na kolumny
        // jest w CSS (`.ps-tracks`), na waskim ekranie wraca do jednej kolumny.
        return `
            ${head}
            ${this.infoHtml(points)}
            <div class="ps-season">
                <div class="bt-hub0-subhead">🎒 ${t('season.findThemAll')}</div>
                <div class="ps-items">${tiles}</div>

                <div class="ps-tracks">
                    <div class="ps-track">
                        <div class="bt-hub0-subhead">${crateIcon(16)} ${t('hub.profile.season.pointTrack')}</div>
                        <div class="ps-ths">${ptRows}</div>
                    </div>
                    <div class="ps-track">
                        <div class="bt-hub0-subhead">🏅 ${t('hub.profile.season.setTrack')}</div>
                        <div class="ps-ths">
                            ${gate('crate', content.varietyGates.crate, t('hub.profile.season.gateCrate'), crateIcon(18))}
                            ${gate('title', content.varietyGates.title, t('hub.profile.season.gateTitle'), '🏅')}
                            ${gate('full', content.varietyGates.full, t('hub.profile.season.gateFull'), '👑')}
                        </div>
                    </div>
                </div>
            </div>`;
    }

    /** Odswiezenie po zmianie stanu (np. powrot z meczu). */
    refresh(): void {
        if (this.el) this.render(this.el);
    }
}
