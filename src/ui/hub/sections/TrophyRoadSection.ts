import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import { ACT_I_MILESTONES, ACT_II_MILESTONES, type TrophyMilestone } from '../../../config/progression';
import { getCurrentSeason, type SeasonMilestone } from '../../../config/season';

/**
 * TrophyRoadSection (TROFEA) — HUB-4. Pelnoekranowy Szlak Trofeow zasilony shipped
 * PROG-F1. READ-ONLY: nagrody sa auto-przyznawane po meczu (recordRun), wiec sekcja
 * WIZUALIZUJE postep — zdobyte (✓) / nastepny / przyszle milestony. Akty II/III =
 * teaser (w PROG-F1 zdefiniowany tylko Akt I 0..750).
 *
 * SEASON-1 (v0.118.0): Season Track NA ZYWO (byl placeholder z v0.94) — trofea
 * SEZONOWE (licznik od 0, reset przy nowym sezonie) + 5 progow nagrod
 * (auto-wyplata w recordRun) + countdown dni. Kotwica data-season-track —
 * badge S2 w readoucie scrolluje tutaj.
 */
export class TrophyRoadSection implements HubSection {
    public readonly id = 'trophies';
    public readonly icon = '🏆';
    label(): string { return t('hub.nav.trophies'); }

    render(el: HTMLElement): void {
        const pid = ProfileService.getActiveProfile()?.id ?? 'default';
        const snap = ProgressionService.getSnapshot(pid);
        const trophies = snap.trophies;
        const pct = Math.round(snap.progressToNext * 100);
        const nextTxt = snap.nextMilestone
            ? t('hub.trophyNext', { n: snap.nextMilestone.threshold - trophies })
            : t('hub.trophyMax');

        // F7b: labelKey (odblokowana moc) renderowany przy nagrodzie — marchewka contentu.
        const node = (m: TrophyMilestone): string => {
            const achieved = trophies >= m.threshold;
            const isNext = !achieved && snap.nextMilestone?.threshold === m.threshold;
            const cls = achieved ? 'is-done' : isNext ? 'is-next' : 'is-future';
            return `
                <div class="bt-hub0-node ${cls}">
                    <span class="mark" aria-hidden="true">${achieved ? '✓' : '🏆'}</span>
                    <div class="info">
                        <b>${m.threshold} 🏆</b>
                        <span class="reward"><img class="bt-sigma" src="${import.meta.env.BASE_URL}assets/sigma.png" alt=""> ${m.bolts}${m.labelKey ? ` · ${t(m.labelKey)}` : ''}</span>
                    </div>
                    ${isNext ? `<span class="tag">${t('hub.road.next')}</span>` : ''}
                </div>`;
        };
        const act1Nodes = ACT_I_MILESTONES.map(node).join('');
        const act2Nodes = ACT_II_MILESTONES.map(node).join('');

        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.trophies')}</h2>

            <div class="bt-hub0-road-head">
                <div class="bt-hub0-road-count">🏆 <b>${trophies}</b></div>
                <div class="bt-hub0-road-progress">
                    <div class="bt-hub0-trophybar-track"><div class="fill" style="width:${pct}%;"></div></div>
                    <span class="next">${nextTxt}</span>
                </div>
            </div>

            <div class="bt-hub0-road-act">${t('hub.road.act1')}</div>
            <div class="bt-hub0-road-list">${act1Nodes}</div>

            <div class="bt-hub0-road-act">${t('hub.road.act2')}</div>
            <div class="bt-hub0-road-list">${act2Nodes}</div>

            <div class="bt-hub0-node is-future is-teaser">
                <span class="mark" aria-hidden="true">🔒</span>
                <div class="info"><b>${t('common.soon')}</b><span class="reward">1500+ 🏆</span></div>
            </div>

            ${this.seasonTrackHtml(pid)}
        `;
    }

    /** SEASON-1: pasek trofeow sezonowych + progi nagrod + countdown. */
    private seasonTrackHtml(pid: string): string {
        const season = ProgressionService.getSeasonState(pid);
        const pct = Math.round(season.progressToNext * 100);
        const timeChip = season.active
            ? `<span class="st-days">⏳ ${t('hub.season.daysLeft', { n: season.daysLeft })}</span>`
            : `<span class="st-days st-days--ended">${t('hub.season.ended')}</span>`;
        const nextTxt = season.active
            ? (season.nextMilestone
                ? t('hub.trophyNext', { n: season.nextMilestone.threshold - season.trophies })
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
                        <span class="reward"><img class="bt-sigma" src="${import.meta.env.BASE_URL}assets/sigma.png" alt=""> ${m.bolts}${m.crates ? ` · 📦${m.crates > 1 ? ` x${m.crates}` : ''}` : ''}</span>
                    </div>
                    ${isNext ? `<span class="tag">${t('hub.road.next')}</span>` : ''}
                </div>`;
        };

        return `
            <div class="bt-hub0-road-act st-head" data-season-track>
                <span>${t('hub.road.seasonTitle')} — ${t(getCurrentSeason().nameKey)}</span>
                ${timeChip}
            </div>
            <div class="bt-hub0-road-head${season.active ? '' : ' st-ended'}">
                <div class="bt-hub0-road-count">🏆 <b>${season.trophies}</b></div>
                <div class="bt-hub0-road-progress">
                    <div class="bt-hub0-trophybar-track"><div class="fill" style="width:${pct}%;"></div></div>
                    <span class="next">${nextTxt}</span>
                </div>
            </div>
            <div class="bt-hub0-road-list">${season.milestones.map(node).join('')}</div>
        `;
    }
}
