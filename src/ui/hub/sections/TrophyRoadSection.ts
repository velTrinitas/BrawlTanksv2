import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import { ACT_I_MILESTONES, ACT_II_MILESTONES, type TrophyMilestone } from '../../../config/progression';

/**
 * TrophyRoadSection (TROFEA) — HUB-4. Pelnoekranowy Szlak Trofeow zasilony shipped
 * PROG-F1. READ-ONLY: nagrody sa auto-przyznawane po meczu (recordRun), wiec sekcja
 * WIZUALIZUJE postep — zdobyte (✓) / nastepny / przyszle milestony. Season track =
 * statyczny placeholder (Season config w pozniejszej fazie). Akty II/III = teaser
 * (w PROG-F1 zdefiniowany tylko Akt I 0..750).
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

            <div class="bt-hub0-road-act">${t('hub.road.seasonTitle')}</div>
            <div class="bt-hub0-season-track">
                <div class="bt-hub0-trophybar-track"><div class="fill" style="width:0%;"></div></div>
                <span class="next">${t('common.soon')}</span>
            </div>
        `;
    }
}
