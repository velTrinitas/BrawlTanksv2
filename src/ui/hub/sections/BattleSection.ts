import { t, type TranslationKey } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { SCENARIO_CONFIGS, type ScenarioId } from '../../../types/Scenario';
import { DIFFICULTY_CONFIGS, type DifficultyId } from '../../../types/GameConfig';
import { MENU_MAP_CARDS, type MapId } from '../../../types/MapType';
import { BRAWLERS } from '../../../config/brawlers';
import type { Brawler } from '../../../types/Brawler';
import { sessionService } from '../../../services/SessionService';

/**
 * BattleSection (BITWA) — home hubu (HUB-1 + HUB-1.5). Realne dane: SCENARIO_CONFIGS
 * (tryby, locked-state) + MENU_MAP_CARDS (mapy KTB). Baner sezonu STATYCZNY.
 *
 * HUB-1.5 (v0.116.0): wybor czolgu INLINE — 8 duzych kart z portretami i statami
 * wprost w sekcji (feedback Mariusza: czolgi to hero-content gry, nie chowamy ich
 * za overlayem; roster 8 sztuk miesci sie jak scenariusze). Wybrany = is-selected,
 * trudnosc = pigulki, GRAJ odpala mecz NATYCHMIAST (stary ekran BrawlerPicker wypada
 * z flow hubu; zostaje dla ?hub=0 i tutoriala). Wybor pamietany przez LastSession
 * (zapis w startGame juz istnieje). PRZYSZLOSC: badge Crew Rank na karcie czolgu
 * (docs/crew-ranks-v1.md §8).
 */

/**
 * Przetlumaczona nazwa czolgu: klucz `brawler.{id}.name`, fallback na config.name
 * (wzorzec lookupBrawlerName ze starego BrawlerPicker).
 */
function tankName(b: Brawler): string {
    const key = `brawler.${b.id}.name` as TranslationKey;
    const translated = t(key);
    return translated === key ? b.name : translated;
}

const SCENARIO_ORDER: ScenarioId[] = ['ktb', 'ctf', 'castle', 'save_king'];
const SCENARIO_EMOJI: Record<ScenarioId, string> = { ktb: '👑', ctf: '🚩', castle: '🏰', save_king: '🛡️' };
const AVAILABLE_MAPS = MENU_MAP_CARDS.filter(m => m.available);
const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard', 'nightmare'];

export class BattleSection implements HubSection {
    public readonly id = 'battle';
    public readonly icon = '⚔️';
    label(): string { return t('hub.nav.battle'); }

    /** Wpiete przez HubShell → MainMenu (buduje GameConfig i startuje mecz BEZPOSREDNIO). */
    public onPlay: ((scenario: ScenarioId, map: MapId, brawlerId: string, difficulty: DifficultyId) => void) | null = null;

    private selectedScenario: ScenarioId = 'ktb';
    private selectedMap: MapId = (AVAILABLE_MAPS[0]?.id ?? 'desert') as MapId;
    private selectedBrawlerId: string;
    private selectedDifficulty: DifficultyId;
    private el: HTMLElement | null = null;

    constructor() {
        // Ostatni wybor gracza z LastSession (wygasa 30 dni) — walidowany, fallback
        // twardy/normal. Dzieki temu "GRAJ" gra tym, czym gralem ostatnio (zero pickera).
        const last = sessionService.getLastSession();
        this.selectedBrawlerId = last && BRAWLERS.some(b => b.id === last.brawlerId)
            ? last.brawlerId : (BRAWLERS[0]?.id ?? 'twardy');
        this.selectedDifficulty = last && (DIFFICULTY_ORDER as string[]).includes(last.difficulty)
            ? last.difficulty as DifficultyId : 'normal';
    }


    render(el: HTMLElement): void {
        this.el = el;
        el.innerHTML = this.html();
        this.wire();
    }

    private html(): string {
        const season = `
            <div class="bt-hub0-season">
                <span class="bt-hub0-season-art" aria-hidden="true">🎖️</span>
                <div class="bt-hub0-season-info">
                    <span class="bt-hub0-season-eyebrow">${t('hub.season.eyebrow')}</span>
                    <h3>${t('hub.season.title')}</h3>
                </div>
            </div>`;

        // HUB-1.5b: WSZYSTKIE czolgi inline, duze portrety (feedback Mariusza — to gra
        // o czolgach, roster 8 sztuk to wystawa sekcji, nie przypis za overlayem).
        const tanks = `
            <div class="bt-hub0-cos-grouptitle">🚜 ${t('hub.battle.pickTank')}</div>
            <div class="bt-hub0-tanks">
                ${BRAWLERS.map(b => `
                <button class="bt-hub0-tank${b.id === this.selectedBrawlerId ? ' is-selected' : ''}"
                        data-tank="${b.id}" type="button" style="--tank:${b.colorMain}">
                    <span class="tp-portrait">
                        ${b.icon
                            ? `<img src="${b.icon}" alt="" loading="lazy">`
                            : `<span class="tp-emoji" aria-hidden="true">${b.emoji}</span>`}
                    </span>
                    <b class="tp-name">${tankName(b)}</b>
                    <span class="tp-stats" aria-hidden="true">
                        <span class="st"><i>❤️</i><b>${b.hp}</b></span>
                        <span class="st"><i>⚡</i><b>${b.speed}</b></span>
                        <span class="st"><i>💥</i><b>${b.dmg}</b></span>
                    </span>
                </button>`).join('')}
            </div>`;

        // HUB-1.5: trudnosc jako pigulki (decyzja Mariusza: stale widoczne, nie w overlayu).
        const diffs = `
            <div class="bt-hub0-diff-pills" role="radiogroup" aria-label="${t('hub.battle.difficulty')}">
                ${DIFFICULTY_ORDER.map(id => `
                <button class="bt-hub0-diff-pill${id === this.selectedDifficulty ? ' is-active' : ''}"
                        data-difficulty="${id}" type="button" style="--pill:${DIFFICULTY_CONFIGS[id].color}">
                    ${t(DIFFICULTY_CONFIGS[id].labelKey)}
                </button>`).join('')}
            </div>`;

        const modes = SCENARIO_ORDER.map(id => {
            const c = SCENARIO_CONFIGS[id];
            const locked = !c.available;
            const sel = id === this.selectedScenario && !locked;
            return `
                <button class="bt-hub0-mode${sel ? ' is-active' : ''}${locked ? ' is-locked' : ''}"
                        data-scenario="${id}" type="button" ${locked ? 'aria-disabled="true"' : ''}>
                    <span class="em" aria-hidden="true">${SCENARIO_EMOJI[id]}</span>
                    <b>${t(c.nameKey)}</b>
                    ${locked ? `<span class="lock">🔒 ${t(c.comingSoonKey ?? 'common.locked')}</span>` : ''}
                </button>`;
        }).join('');

        let maps = '';
        if (this.selectedScenario === 'ktb') {
            maps = `<div class="bt-hub0-maps">${AVAILABLE_MAPS.map(m => `
                <button class="bt-hub0-mapchip${m.id === this.selectedMap ? ' is-active' : ''}"
                        data-map="${m.id}" type="button" style="--chip:${m.accentColor}">
                    <span aria-hidden="true">${m.emoji}</span>${t(m.nameKey)}
                </button>`).join('')}</div>`;
        } else if (this.selectedScenario === 'ctf') {
            maps = `<div class="bt-hub0-maps"><span class="bt-hub0-mapfixed">🏛️ FORTIFIED RUINS</span></div>`;
        }

        return `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.battle')}</h2>
            ${season}
            ${tanks}
            <div class="bt-hub0-modes">${modes}</div>
            ${maps}
            ${diffs}
            <button class="bt-hub0-play bt-hub0-play--hero" data-action="play" type="button">▶ ${t('hub.play')}</button>
        `;
    }

    private wire(): void {
        const el = this.el;
        if (!el) return;
        el.querySelectorAll<HTMLElement>('[data-scenario]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.scenario as ScenarioId;
                if (!SCENARIO_CONFIGS[id].available) return; // locked — ignoruj
                this.selectedScenario = id;
                this.render(el);
            });
        });
        el.querySelectorAll<HTMLElement>('[data-map]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedMap = btn.dataset.map as MapId;
                this.render(el);
            });
        });
        el.querySelectorAll<HTMLElement>('[data-difficulty]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedDifficulty = btn.dataset.difficulty as DifficultyId;
                this.render(el);
            });
        });
        el.querySelectorAll<HTMLElement>('[data-tank]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.tank;
                if (!id || !BRAWLERS.some(b => b.id === id)) return;
                this.selectedBrawlerId = id;
                this.render(el);
            });
        });
        el.querySelector('[data-action="play"]')?.addEventListener('click', () => {
            const map: MapId = this.selectedScenario === 'ctf' ? 'fortified_ruins' : this.selectedMap;
            this.onPlay?.(this.selectedScenario, map, this.selectedBrawlerId, this.selectedDifficulty);
        });
    }
}
