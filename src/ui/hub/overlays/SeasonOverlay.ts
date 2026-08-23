import { t } from '../../../i18n/i18n';
import { getCurrentSeason, isSeasonActive, seasonDaysLeft } from '../../../config/season';

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
        const heroImg = `<img class="so-art" src="${import.meta.env.BASE_URL}seasons/${season.id}.jpg"
            alt="" draggable="false" onerror="this.remove()">`;

        this.el = document.createElement('div');
        this.el.className = 'bt-hub0-overlay';
        this.el.innerHTML = `
            <div class="bt-hub0-modal bt-hub0-season-modal" role="dialog" aria-modal="true">
                <button class="bt-hub0-modal-close" data-action="close" type="button"
                        aria-label="${t('common.close')}">✕</button>
                <div class="so-hero" style="--season:${season.accentColor}">
                    ${heroImg}
                    <span class="so-emoji" aria-hidden="true">${season.emoji}</span>
                    <h3 class="so-title">${t(season.nameKey)}</h3>
                </div>
                <div class="so-time${active ? '' : ' is-ended'}">${timeChip}</div>
                <div class="so-whatsnew">${t('hub.season.whatsNew')}</div>
                <ul class="so-bullets">${bullets}</ul>
                <button class="bt-hub0-pbtn bt-hub0-pbtn--gold so-cta" data-action="view-track" type="button">
                    🏆 ${t('hub.season.viewTrack')}
                </button>
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
