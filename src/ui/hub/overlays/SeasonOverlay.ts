import { t } from '../../../i18n/i18n';
import { getCurrentSeason, isSeasonActive, seasonDaysLeft } from '../../../config/season';
import { getSeasonContent } from '../../../config/seasonContent';
import { ProgressionService } from '../../../services/ProgressionService';
import { ProfileService } from '../../../services/ProfileService';

/**
 * SeasonOverlay — SEASON-2 (v0.118.0). Pop-up sezonu otwierany zlotym pillem
 * na belce (wzorzec modalu StatsOverlay: scrim + .bt-hub0-modal, X / klik w tlo).
 *
 * Layout per sezon (projekt Mariusza): GORA = panel-grafika sezonu (opcjonalny
 * public/seasons/<id>.jpg gdy Mariusz dorzuci art; fallback = gradient akcentu
 * + wielkie emoji motywu) z tytulem; nizej countdown, bullet-lista "co wprowadza
 * sezon" (bulletKeys z configu) i CTA "Zobacz Season Track" -> TROFEA + scroll.
 */
export class SeasonOverlay {
    private el: HTMLElement | null = null;

    /** HubShell: przejscie do TROFEA + scroll do Season Tracku (reuse openSeasonTrack). */
    public onViewTrack: (() => void) | null = null;

    /**
     * Pasek zbiorki "37 / 60". Odpowiedz na pytanie Mariusza "gdzie widac, ile
     * znaleziono ksiazek" — to jest miejsce, w ktorym gracz sprawdza postep
     * jednym rzutem oka. Sezon bez znajdziek (Arena, roadmapa 2027) nie dostaje
     * paska w ogole, zamiast pokazywac pusty 0/0.
     */
    private collectBarHtml(seasonId: string): string {
        const content = getSeasonContent(seasonId);
        if (!content) return '';
        const profile = ProfileService.getActiveProfile();
        if (!profile) return '';
        const have = ProgressionService.getSeasonCollected(profile.id);
        const owned = ProgressionService.getSeasonItemsOwned(profile.id);

        // MINI-SIATKA 3x2 — tor ROZNORODNOSCI. Pokazuje CZEGO BRAKUJE, a nie "ile":
        // niezdobyte kafle sa zagadka "?", bo dzieciak ma chciec zobaczyc, jak
        // wyglada szostka. To jest silniejszy hak niz sam licznik.
        const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
        const tiles = content.items.map(it => {
            const has = (owned[it.value] ?? 0) > 0;
            return has
                ? `<span class="so-tile is-owned" title="${t(it.nameKey)}" style="--g:#${it.glow.toString(16).padStart(6, '0')}">
                       <img src="${base}${it.asset}" alt="${t(it.nameKey)}" draggable="false">
                   </span>`
                : `<span class="so-tile" title="?"><b>?</b></span>`;
        }).join('');

        // PASEK do NAJBLIZSZEGO PROGU Z NAGRODA — nigdy do abstrakcyjnego celu.
        // Pasek ma mowic, co dostaniesz i za ile; "32/60" bez nagrody na koncu bylo
        // obietnica bez pokrycia (patrz SEASON_ENGINE.md §10).
        const next = content.pointThresholds.find(th => have < th.points);
        const bar = next
            ? `<div class="so-collect-row">
                   <span>📕 ${t(content.counterKey)}</span>
                   <span class="so-collect-val">${have} / ${next.points} → 📦${next.crates > 1 ? `×${next.crates}` : ''}</span>
               </div>
               <div class="so-collect-bar"><i style="width:${Math.min(100, Math.round((have / next.points) * 100))}%"></i></div>`
            : `<div class="so-collect-row">
                   <span>📕 ${t(content.counterKey)}</span>
                   <span class="so-collect-val">${have} · ${t('season.allRewards')}</span>
               </div>`;

        return `<div class="so-collect"><div class="so-grid">${tiles}</div>${bar}</div>`;
    }

    open(parent: HTMLElement): void {
        this.close(); // pojedyncza instancja
        const season = getCurrentSeason();
        const active = isSeasonActive();
        const timeChip = active
            ? `⏳ ${t('hub.season.daysLeft', { n: seasonDaysLeft() })}`
            : t('hub.season.ended');
        const bullets = season.bulletKeys
            .map(key => `<li>${t(key)}</li>`)
            .join('');
        // Opcjonalny art sezonu: <img> laduje sie NAD fallbackiem (gradient+emoji);
        // brak pliku => onerror chowa img i zostaje fallback. Zero configu.
        // `onload` oznacza hero klasa `has-art`, bo z artem i bez niego hero wyglada
        // inaczej: z artem dostaje proporcje obrazu (zero przyciecia) i chowa emoji,
        // bez artu zostaje gradientem z emoji na stalej wysokosci.
        // `onload` ustawia klase `has-art` ORAZ realna proporcje pliku w `--so-ar`.
        // Dzieki temu kolumna z artem przyjmuje DOKLADNIE ksztalt obrazka, wiec
        // `object-fit: cover` nie ma czego przycinac — widac caly plakat. Proporcja
        // idzie z pliku, nie z hardkodu, wiec przyszly sezon o innym ksztalcie
        // (kontrakt dopuszcza tez panorame) zadziala bez zmian w CSS.
        const heroImg = `<img class="so-art" src="${import.meta.env.BASE_URL}seasons/${season.id}.jpg"
            alt="" draggable="false" onerror="this.remove()"
            onload="this.parentElement.classList.add('has-art');this.parentElement.style.setProperty('--so-ar', this.naturalWidth + ' / ' + this.naturalHeight)">`;

        this.el = document.createElement('div');
        this.el.className = 'bt-hub0-overlay';
        this.el.innerHTML = `
            <div class="bt-hub0-modal bt-hub0-season-modal" role="dialog" aria-modal="true">
                <button class="bt-hub0-modal-close" data-action="close" type="button"
                        aria-label="${t('common.close')}">✕</button>
                <div class="so-hero" style="--season:${season.accentColor}">
                    ${heroImg}
                    <span class="so-ghost" aria-hidden="true">${season.id.toUpperCase()}</span>
                    <span class="so-emoji" aria-hidden="true">${season.emoji}</span>
                </div>
                <div class="so-body">
                    <h3 class="so-title">${t(season.nameKey)}</h3>
                    <div class="so-time${active ? '' : ' is-ended'}">${timeChip}</div>
                    ${this.collectBarHtml(season.id)}
                    <div class="so-whatsnew">${t('hub.season.whatsNew')}</div>
                    <ul class="so-bullets">${bullets}</ul>
                    <button class="bt-hub0-pbtn bt-hub0-pbtn--gold so-cta" data-action="view-track" type="button">
                        🏆 ${t('hub.season.viewTrack')}
                    </button>
                </div>
            </div>`;
        parent.appendChild(this.el);

        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target === this.el || target.closest('[data-action="close"]')) {
                this.close();
            } else if (target.closest('[data-action="view-track"]')) {
                this.close();
                this.onViewTrack?.();
            }
        });
    }

    close(): void {
        this.el?.remove();
        this.el = null;
    }
}
