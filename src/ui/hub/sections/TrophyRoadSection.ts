import { t } from '../../../i18n/i18n';
import { crateIcon } from '../gameIcons';
import type { HubSection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import {
    ACT_I_MILESTONES, ACT_II_MILESTONES, ACT_III_MILESTONES, TROPHY_MILESTONES, type TrophyMilestone,
} from '../../../config/progression';
import { playUiSelect } from '../../uiSounds';
import { reducedMotion } from '../juice';
import { getCurrentSeason, type SeasonMilestone } from '../../../config/season';

/**
 * TrophyRoadSection (PUCHARKI) — HUB-4. Pelnoekranowy Szlak Pucharkow zasilony shipped
 * PROG-F1. READ-ONLY: nagrody sa auto-przyznawane po meczu (recordRun), wiec sekcja
 * WIZUALIZUJE postep — zdobyte (✓) / nastepny / przyszle milestony.
 *
 * SEASON-1 (v0.118.0): Season Track NA ZYWO (byl placeholder z v0.94) — pucharki
 * SEZONOWE (licznik od 0, reset przy nowym sezonie) + 5 progow nagrod
 * (auto-wyplata w recordRun) + countdown dni. Kotwica data-season-track —
 * badge S2 w readoucie scrolluje tutaj.
 *
 * v0.206.0 (Mariusz, playtest mobile) — DWIE KOLUMNY: lewa = Szlak Pucharkow (moce),
 * prawa = Sciezka Sezonu. Do tej wersji oba tory lecialy jednym strumieniem pod soba,
 * a gracz nie widzial, ze to DWIE rozne logiki (pucharki odblokowujace moce vs pucharki
 * sezonowe z wlasnym licznikiem). Ponizej 701 px kolumny wracaja pod siebie (CSS).
 * Do prawej kolumny wszedl tez baner sezonu (art + nazwa) wyniesiony z BITWY — jedno
 * miejsce prawdy o sezonie zamiast dwoch banerow o roznej wadze.
 * Akt III (Widmo @5000) zastepuje teaser „1500+ wkrotce".
 */
export class TrophyRoadSection implements HubSection {
    public readonly id = 'trophies';
    public readonly icon = '🏆';
    label(): string { return t('hub.nav.trophies'); }

    /**
     * v0.208.0 (J4) — pucharki sprzed ostatniej zmiany readoutu (ustawia HubShell, gdy
     * liczba urosla). Render zaczyna pasek od STAREJ wartosci i dojezdza do nowej,
     * a wezel przekroczony w miedzyczasie dostaje `.is-fresh` (✓ wbija sie + iskry).
     * Zuzywane raz — po renderze wraca do null.
     */
    public prevTrophies: number | null = null;

    render(el: HTMLElement): void {
        const pid = ProfileService.getActiveProfile()?.id ?? 'default';
        const snap = ProgressionService.getSnapshot(pid);
        const trophies = snap.trophies;
        const pct = Math.round(snap.progressToNext * 100);
        const nextTxt = snap.nextMilestone
            ? t('hub.trophyNext', { n: snap.nextMilestone.threshold - trophies })
            : t('hub.trophyMax');
        const prev = this.prevTrophies;
        this.prevTrophies = null;
        const fromPct = prev === null ? pct : progressPctAt(prev, snap.nextMilestone?.threshold ?? null);

        // F7b: labelKey (odblokowana moc) renderowany przy nagrodzie — marchewka contentu.
        // v0.206.0: prog z `bolts: 0` (Akt III) NIE pokazuje pustego „0 sigm" — sama moc.
        const node = (m: TrophyMilestone): string => {
            const achieved = trophies >= m.threshold;
            const isNext = !achieved && snap.nextMilestone?.threshold === m.threshold;
            const fresh = achieved && prev !== null && m.threshold > prev;
            const cls = (achieved ? 'is-done' : isNext ? 'is-next' : 'is-future') + (fresh ? ' is-fresh' : '');
            const sparks = fresh && !reducedMotion()
                ? Array.from({ length: 6 }, (_, i) => `<i class="sp" style="--rot:${i * 60}deg" aria-hidden="true"></i>`).join('')
                : '';
            const sigma = m.bolts > 0
                ? `<span class="p-sigma"><img class="bt-sigma bt-sigma--lg" src="${import.meta.env.BASE_URL}assets/sigma.png" alt="">${m.bolts}</span>`
                : '';
            return `
                <div class="bt-hub0-node ${cls}" data-threshold="${m.threshold}">
                    <span class="mark" aria-hidden="true">${achieved ? '✓' : '🏆'}${sparks}</span>
                    <div class="info">
                        <b>${m.threshold} 🏆</b>
                    </div>
                    <div class="prize">
                        ${sigma}
                        ${m.labelKey ? `<span class="p-extra">${t(m.labelKey)}</span>` : ''}
                    </div>
                    ${isNext ? `<span class="tag">${t('hub.road.next')}</span>` : ''}
                </div>`;
        };
        const act1Nodes = ACT_I_MILESTONES.map(node).join('');
        const act2Nodes = ACT_II_MILESTONES.map(node).join('');
        const act3Nodes = ACT_III_MILESTONES.map(node).join('');

        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.trophies')}</h2>

            <div class="bt-hub0-road-cols">
                <div class="bt-hub0-road-col">
                    <div class="bt-hub0-road-act">${t('hub.road.title')}</div>
                    <div class="bt-hub0-road-head">
                        <div class="bt-hub0-road-count">🏆 <b>${trophies}</b></div>
                        <div class="bt-hub0-road-progress">
                            <div class="bt-hub0-trophybar-track"><div class="fill" data-road-fill style="width:${fromPct}%;"></div></div>
                            <span class="next">${nextTxt}</span>
                        </div>
                    </div>

                    <div class="bt-hub0-road-act">${t('hub.road.act1')}</div>
                    <div class="bt-hub0-road-list">${act1Nodes}</div>

                    <div class="bt-hub0-road-act">${t('hub.road.act2')}</div>
                    <div class="bt-hub0-road-list">${act2Nodes}</div>

                    <div class="bt-hub0-road-act">${t('hub.road.act3')}</div>
                    <div class="bt-hub0-road-list">${act3Nodes}</div>
                </div>

                <div class="bt-hub0-road-col">
                    ${this.seasonTrackHtml(pid)}
                </div>
            </div>
        `;
        // J4: pasek startuje ze starej szerokosci i DOJEZDZA (transition na .fill);
        // swiezo zdobyty wezel dostaje dzwiek potwierdzenia.
        if (prev !== null && prev !== trophies) {
            const fill = el.querySelector<HTMLElement>('[data-road-fill]');
            if (fill) requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; }));
            if (el.querySelector('.bt-hub0-node.is-fresh')) playUiSelect();
        }
    }

    /** SEASON-1: pasek pucharkow sezonowych + progi nagrod + countdown. */
    private seasonTrackHtml(pid: string): string {
        const season = ProgressionService.getSeasonState(pid);
        const cur = getCurrentSeason();
        const pct = Math.round(season.progressToNext * 100);
        const timeChip = season.active
            ? `<span class="st-days">⏳ ${t('hub.season.daysLeft', { n: season.daysLeft })}</span>`
            : `<span class="st-days st-days--ended">${t('hub.season.ended')}</span>`;
        const nextTxt = season.active
            ? (season.nextMilestone
                ? t('hub.season.pointsNext', { n: season.nextMilestone.threshold - season.trophies })
                : t('hub.trophyMax'))
            : t('hub.season.ended');

        // Progi jako nody Szlaku (reuse gramatyki ✓/next/future — spojnosc).
        const node = (m: SeasonMilestone): string => {
            const achieved = season.claimed.includes(m.threshold);
            const isNext = !achieved && season.nextMilestone?.threshold === m.threshold;
            const cls = achieved ? 'is-done' : isNext ? 'is-next' : 'is-future';
            return `
                <div class="bt-hub0-node ${cls}">
                    <span class="mark" aria-hidden="true">${achieved ? '✓' : '🏆'}</span>
                    <div class="info">
                        <b>${m.threshold} 🏆</b>
                    </div>
                    <div class="prize">
                        <span class="p-sigma"><img class="bt-sigma bt-sigma--lg" src="${import.meta.env.BASE_URL}assets/sigma.png" alt="">${m.bolts}</span>
                        ${m.crates ? `<span class="p-extra">${crateIcon(18)}${m.crates > 1 ? ` x${m.crates}` : ''}</span>` : ''}
                    </div>
                    ${isNext ? `<span class="tag">${t('hub.road.next')}</span>` : ''}
                </div>`;
        };

        // v0.206.0 — naglowek sezonu z ARTEM (emoji z manifestu — JEDNO zrodlo; do tej wersji
        // BITWA pokazywala 🎒 z configu, a strona SEZON 🎖️ z pola klasy). Eyebrow zostaje
        // jako podpis, nazwa sezonu idzie do wlasnego wiersza, chip dni po prawej.
        return `
            <div class="bt-hub0-road-act">${t('hub.road.seasonTitle')}</div>
            <div class="bt-hub0-road-season-head" data-season-track>
                <span class="rs-art" aria-hidden="true">${cur.emoji}</span>
                <div class="rs-info">
                    <span class="rs-eyebrow">${t('hub.season.eyebrow')}</span>
                    <b class="rs-name">${t(cur.nameKey)}</b>
                </div>
                ${timeChip}
            </div>
            <p class="bt-hub0-road-hint">${t('hub.season.pointsHint')}</p>
            <div class="bt-hub0-road-head${season.active ? '' : ' st-ended'}">
                <div class="bt-hub0-road-count">🏆 <b>${season.trophies}</b> <small class="rc-sub">${t('hub.season.thisSeason')}</small></div>
                <div class="bt-hub0-road-progress">
                    <div class="bt-hub0-trophybar-track"><div class="fill" style="width:${pct}%;"></div></div>
                    <span class="next">${nextTxt}</span>
                </div>
            </div>
            <div class="bt-hub0-road-list">${season.milestones.map(node).join('')}</div>
        `;
    }
}

/**
 * v0.208.0 (J4) — procent paska dla DOWOLNEJ liczby pucharkow wzgledem tego samego
 * nastepnego progu, co biezacy render. Gdy stary stan byl PRZED poprzednim progiem
 * (wezel wlasnie zdobyty), pasek startuje od zera — wizualnie „nowy odcinek".
 */
function progressPctAt(trophies: number, nextThreshold: number | null): number {
    if (nextThreshold === null) return 100;
    const lo = TROPHY_MILESTONES.filter(m => m.threshold < nextThreshold).map(m => m.threshold).pop() ?? 0;
    if (trophies < lo) return 0;
    return Math.max(0, Math.min(100, Math.round(((trophies - lo) / (nextThreshold - lo)) * 100)));
}
