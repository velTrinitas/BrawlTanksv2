import { t, type TranslationKey } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { SCENARIO_CONFIGS, type ScenarioId } from '../../../types/Scenario';
import { DIFFICULTY_CONFIGS, type DifficultyId } from '../../../types/GameConfig';
import { MENU_MAP_CARDS, type MapId } from '../../../types/MapType';
import { BRAWLERS } from '../../../config/brawlers';
import type { Brawler } from '../../../types/Brawler';
import { sessionService } from '../../../services/SessionService';
import { renderMapPreview } from '../../MapPreview'; // zywe podglady map (SVG, reuse)
import { renderScenarioPreview, type ScenarioPreviewId } from '../../ScenarioPreview';
import { playUiClick } from '../../uiSounds'; // Sensoryka: wybor "klika"
import { getCurrentSeason } from '../../../config/season'; // SEASON-2 — baner biezacego sezonu

/**
 * BattleSection (BITWA) — home hubu.
 *
 * HUB-1.7 (v0.117.0, referencja 20260821_tanks3.png): JEDEN spojny komponent karty
 * `.bt-hub0-card` (media z lewej + tresc z prawej) dla trzech grup wyboru:
 *  - CZOLGI 3x3: zdjecie z poswiata w kolorze czolgu | nazwa + badge roli + 3 paski
 *    statow (label/pasek w kolorze/biala REALNA liczba). 9. slot = placeholder Enigma.
 *  - SCENARIUSZE 3x1: animowany podglad SVG | nazwa + opis (save_king wyciety z widoku).
 *  - MAPY 3x2: podglad SVG | nazwa + tagline; sloty 5-6 = placeholdery WKROTCE.
 * Wybor = zloty ring + ✓ (wspolny), hover = zoom mediow (easing strony), GRAJ pokazuje
 * PODSUMOWANIE wyboru i startuje mecz natychmiast. Wybor pamietany przez LastSession.
 * PRZYSZLOSC: badge Crew Rank na karcie czolgu (docs/crew-ranks-v1.md §8).
 */

/** Przetlumaczona nazwa czolgu: `brawler.{id}.name`, fallback na config.name. */
function tankName(b: Brawler): string {
    const key = `brawler.${b.id}.name` as TranslationKey;
    const translated = t(key);
    return translated === key ? b.name : translated;
}

const SCENARIO_ORDER: ScenarioId[] = ['ktb', 'ctf', 'castle']; // HUB-1.7: save_king wyciety z widoku
const SCENARIO_EMOJI: Record<string, string> = { ktb: '👑', ctf: '🚩', castle: '🏰' };
const AVAILABLE_MAPS = MENU_MAP_CARDS.filter(m => m.available);
const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard', 'nightmare'];
const SCEN_WITH_SVG: ScenarioPreviewId[] = ['ktb', 'ctf', 'castle'];

// Normalizacja paskow = maksima rosteru (heavy 700hp / sniper 300dmg / scout 7.5 speed).
const STAT_MAX = { hp: 700, dmg: 300, speed: 7.5 } as const;

// Badge roli per czolg — tokeny 1:1 ze strona sigmatanks.eu (miedzynarodowe, bez i18n).
const ROLE_BADGE: Record<string, string> = {
    twardy: 'STANDARD', heavy: 'TANK', scout: 'SCOUT', sniper: 'SNIPER',
    plasma: 'PLASMA', pyro: 'SPREAD', shadow: 'ASSASSIN', king: 'ALL-AROUND',
};

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
    /**
     * v0.126.0 — „ten render wynika ze ZMIANY WYBORU", nie z wejscia do sekcji.
     * Steruje jednorazowym blyskiem przycisku GRAJ. Zero timerow i zero sprzatania:
     * kazdy wybor i tak odtwarza cale DOM sekcji (`render()` nadpisuje innerHTML),
     * wiec animacja odpala sie raz — przy tworzeniu elementu z klasa `is-bumped`.
     */
    private bump = false;

    constructor() {
        // Ostatni wybor gracza z LastSession (wygasa 30 dni) — walidowany, fallback
        // twardy/normal. "GRAJ" gra tym, czym gralem ostatnio (zero pickera).
        const last = sessionService.getLastSession();
        this.selectedBrawlerId = last && BRAWLERS.some(b => b.id === last.brawlerId)
            ? last.brawlerId : (BRAWLERS[0]?.id ?? 'twardy');
        this.selectedDifficulty = last && (DIFFICULTY_ORDER as string[]).includes(last.difficulty)
            ? last.difficulty as DifficultyId : 'normal';
    }

    /**
     * v0.126.0 — start meczu BIEZACYM wyborem. Wyciagniete z handlera przycisku, bo od
     * teraz wola to takze GRAJ z doku (HubShell), czyli akcja dostepna z KAZDEJ sekcji
     * huba. Sekcja BITWA nie musi byc otwarta — wybor zyje w polach tej klasy, a przy
     * pierwszym uruchomieniu pochodzi z LastSession.
     */
    public startCurrentMatch(): void {
        const map: MapId = this.selectedScenario === 'ctf' ? 'fortified_ruins' : this.selectedMap;
        this.onPlay?.(this.selectedScenario, map, this.selectedBrawlerId, this.selectedDifficulty);
    }

    render(el: HTMLElement): void {
        this.el = el;
        // v0.126.0 — ZACHOWAJ POZYCJE PRZEWIJANIA. Kazdy wybor czolgu/scenariusza/mapy
        // odtwarza cale DOM sekcji, wiec kontener scrolla ginie razem ze swoim scrollTop
        // i widok skakal na gore. Gracz wybieral mape na dole listy i ladowal przy
        // banerze sezonu — musial przewijac od nowa do KAZDEGO kolejnego wyboru.
        const keepScroll = el.querySelector('.bt-battle-scroll')?.scrollTop ?? 0;
        el.innerHTML = this.html();
        if (keepScroll > 0) {
            const sc = el.querySelector('.bt-battle-scroll');
            if (sc) sc.scrollTop = keepScroll;
        }
        this.wire();
    }

    // ── wspolne kawalki karty ───────────────────────────────────────────────

    /** Rzad statu czolgu (referencja: label + pasek w kolorze czolgu + biala liczba). */
    private statRow(label: string, val: number | null, max: number): string {
        const pct = val === null ? 0 : Math.round((val / max) * 100);
        return `
            <span class="cd-stat">
                <em>${label}</em>
                <span class="bar"><b style="width:${pct}%"></b></span>
                <u>${val === null ? '???' : val}</u>
            </span>`;
    }

    private html(): string {
        const cur = getCurrentSeason(); // SEASON-2: baner zawsze pokazuje biezacy sezon
        const season = `
            <div class="bt-hub0-season">
                <span class="bt-hub0-season-art" aria-hidden="true">${cur.emoji}</span>
                <div class="bt-hub0-season-info">
                    <span class="bt-hub0-season-eyebrow">${t('hub.season.eyebrow')}</span>
                    <h3>${t(cur.nameKey)}</h3>
                </div>
            </div>`;

        // ── CZOLGI 3x3 (8 + placeholder Enigma) ─────────────────────────────
        const tankCards = BRAWLERS.map(b => `
            <button class="bt-hub0-card${b.id === this.selectedBrawlerId ? ' is-selected' : ''}"
                    data-tank="${b.id}" type="button" style="--tank:${b.colorMain}">
                <span class="cd-media">
                    ${b.icon
                        ? `<img src="${b.icon}" alt="" loading="lazy">`
                        : `<span class="cd-emoji" aria-hidden="true">${b.emoji}</span>`}
                </span>
                <span class="cd-body">
                    <span class="cd-top">
                        <b class="cd-name">${tankName(b)}</b>
                        <i class="cd-badge">${ROLE_BADGE[b.id] ?? 'STANDARD'}</i>
                    </span>
                    ${this.statRow('HP', b.hp, STAT_MAX.hp)}
                    ${this.statRow('DMG', b.dmg, STAT_MAX.dmg)}
                    ${this.statRow('SPEED', b.speed, STAT_MAX.speed)}
                </span>
            </button>`).join('');
        // 9. slot — teaser przyszlego czolgu (nazwa wlasna "Enigma", bez i18n).
        const enigma = `
            <span class="bt-hub0-card is-soon">
                <span class="cd-media"><span class="cd-q" aria-hidden="true">?</span></span>
                <span class="cd-body">
                    <span class="cd-top">
                        <b class="cd-name">Enigma</b>
                        <i class="cd-badge">${t('common.soon')}</i>
                    </span>
                    ${this.statRow('HP', null, 1)}
                    ${this.statRow('DMG', null, 1)}
                    ${this.statRow('SPEED', null, 1)}
                </span>
            </span>`;
        const tanks = `
            <div class="bt-hub0-subhead">🚜 ${t('hub.battle.pickTank')}</div>
            <div class="bt-hub0-cards bt-hub0-cards--tanks">${tankCards}${enigma}</div>`;

        // ── SCENARIUSZE 3x1 (ktb/ctf/castle; save_king wyciety) ─────────────
        const scenCards = SCENARIO_ORDER.map(id => {
            const c = SCENARIO_CONFIGS[id];
            const locked = !c.available;
            const sel = id === this.selectedScenario && !locked;
            const preview = SCEN_WITH_SVG.includes(id as ScenarioPreviewId)
                ? renderScenarioPreview(id as ScenarioPreviewId)
                : `<span class="cd-emoji" aria-hidden="true">${SCENARIO_EMOJI[id] ?? '🎮'}</span>`;
            return `
            <button class="bt-hub0-card${sel ? ' is-selected' : ''}${locked ? ' is-locked' : ''}"
                    data-scenario="${id}" type="button" style="--tank:${c.color}" ${locked ? 'aria-disabled="true"' : ''}>
                <span class="cd-media">${preview}${locked ? '<span class="cd-lock" aria-hidden="true">🔒</span>' : ''}</span>
                <span class="cd-body">
                    <span class="cd-top">
                        <b class="cd-name">${SCENARIO_EMOJI[id] ?? ''} ${t(c.nameKey)}</b>
                    </span>
                    <span class="cd-sub">${t(c.descKey)}</span>
                </span>
            </button>`;
        }).join('');
        const scenarios = `
            <div class="bt-hub0-subhead">⚔️ ${t('picker.scenarioTitle')}</div>
            <div class="bt-hub0-cards">${scenCards}</div>`;

        // ── MAPY 3x2 (4 realne + 2 placeholdery WKROTCE) ────────────────────
        let maps = '';
        if (this.selectedScenario === 'ktb') {
            // M5d: renderujemy WSZYSTKIE karty, takze zablokowane. Locked mapa
            // jest <span> (nieklikalna) z badge "WKROTCE", ale ma PELNY animowany
            // podglad — gracz widzi, co jest w drodze, zamiast pustego "???".
            const mapCards = MENU_MAP_CARDS.map(m => {
                const preview = `<span class="cd-media">${renderMapPreview(m.previewType)}</span>`;
                const body = `
                    <span class="cd-body">
                        <span class="cd-top">
                            <b class="cd-name">${m.emoji} ${t(m.nameKey)}</b>
                            ${m.available ? '' : `<i class="cd-badge">${t(m.comingSoonKey ?? 'common.soon')}</i>`}
                        </span>
                        <span class="cd-sub">${t(m.taglineKey)}</span>
                    </span>`;
                if (!m.available) {
                    return `<span class="bt-hub0-card is-soon" style="--tank:${m.accentColor}">${preview}${body}</span>`;
                }
                return `
                <button class="bt-hub0-card${m.id === this.selectedMap ? ' is-selected' : ''}"
                        data-map="${m.id}" type="button" style="--tank:${m.accentColor}">
                    ${preview}${body}
                </button>`;
            }).join('');
            const soonMap = `
                <span class="bt-hub0-card is-soon">
                    <span class="cd-media"><span class="cd-q" aria-hidden="true">?</span></span>
                    <span class="cd-body">
                        <span class="cd-top">
                            <b class="cd-name">???</b>
                            <i class="cd-badge">${t('common.soon')}</i>
                        </span>
                        <span class="cd-sub"></span>
                    </span>
                </span>`;
            maps = `
            <div class="bt-hub0-subhead">🗺️ ${t('picker.mapTitle')}</div>
            <div class="bt-hub0-cards">${mapCards}</div>`;
        }
        // Iteracja 7 (pkt 5, decyzja Mariusza): CTF BEZ osobnego boxa mapy —
        // mapa jest wbudowana (fortified_ruins), wybor scenariusza = gotowy do GRAJ
        // (PLAY summary dalej pokazuje FORTIFIED RUINS).

        // ── TRUDNOSC (pigulki — bez zmian) ──────────────────────────────────
        const diffs = `
            <div class="bt-hub0-subhead">🎚️ ${t('picker.difficultyTitle')}</div>
            <div class="bt-hub0-diff-pills" role="radiogroup" aria-label="${t('hub.battle.difficulty')}">
                ${DIFFICULTY_ORDER.map(id => `
                <button class="bt-hub0-diff-pill${id === this.selectedDifficulty ? ' is-active' : ''}"
                        data-difficulty="${id}" type="button" style="--pill:${DIFFICULTY_CONFIGS[id].color}">
                    ${t(DIFFICULTY_CONFIGS[id].labelKey)}
                </button>`).join('')}
            </div>`;

        // ── GRAJ z PODSUMOWANIEM wyboru (Czytelnosc: widzisz CO odpalasz) ───
        const b = BRAWLERS.find(x => x.id === this.selectedBrawlerId) ?? BRAWLERS[0];
        const summaryParts = [tankName(b)];
        if (this.selectedScenario === 'ktb') {
            const m = AVAILABLE_MAPS.find(x => x.id === this.selectedMap);
            if (m) summaryParts.push(t(m.nameKey));
        } else if (this.selectedScenario === 'ctf') {
            summaryParts.push('FORTIFIED RUINS');
        }
        summaryParts.push(t(DIFFICULTY_CONFIGS[this.selectedDifficulty].labelKey));
        const summary = summaryParts.join(' · ');

        // v0.126.0 — PASEK AKCJI POZA OBSZAREM PRZEWIJANIA.
        //
        // Do v0.125.0 GRAJ byl `position: sticky` W STRUMIENIU tresci, przez co plywal
        // NAD nia: karty i pigulki chowaly sie pod nim i lapaly jego klikniecia. Teraz
        // sekcja ma dwa pietra — `.bt-battle-scroll` przewija sie, `.bt-battle-bar` nie —
        // wiec obszar przewijania jest fizycznie krotszy o wysokosc paska i tresc NIGDY
        // pod niego nie wchodzi. Tryb dzielony wlacza klasa `--split` na `.bt-hub0-main`
        // (HubShell.renderMain), bo to ona jest scrollportem sekcji.
        //
        // NIE wracamy do inline: `sticky` rozwiazywal realny problem z v0.108.0 („przycisk
        // ginal na koncu sekcji"). Pasek trzyma OBA warunki — zawsze widoczny i nic nie zaslania.
        //
        // `is-bumped` odpala JEDNORAZOWY blysk po zmianie wyboru; ciagly puls ciagnal oko
        // przez caly czas wybierania, czyli konkurowal z trescia (Czytelnosc > Sensoryka).
        const bump = this.bump ? ' is-bumped' : '';
        this.bump = false;

        return `
            <div class="bt-battle-scroll">
                <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.battle')}</h2>
                ${season}
                ${tanks}
                ${scenarios}
                ${maps}
                ${diffs}
            </div>
            <div class="bt-battle-bar">
                <span class="bb-summary">${summary}</span>
                <button class="bt-hub0-play bt-hub0-play--go${bump}" data-action="play" type="button">
                    ▶ ${t('hub.play')}
                </button>
            </div>
        `;
    }

    private wire(): void {
        const el = this.el;
        if (!el) return;
        el.querySelectorAll<HTMLElement>('[data-scenario]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.scenario as ScenarioId;
                if (!SCENARIO_CONFIGS[id].available) return; // locked — ignoruj
                playUiClick();
                this.selectedScenario = id;
                this.bump = true;
                this.render(el);
            });
        });
        el.querySelectorAll<HTMLElement>('[data-map]').forEach(btn => {
            btn.addEventListener('click', () => {
                playUiClick();
                this.selectedMap = btn.dataset.map as MapId;
                this.bump = true;
                this.render(el);
            });
        });
        el.querySelectorAll<HTMLElement>('[data-difficulty]').forEach(btn => {
            btn.addEventListener('click', () => {
                playUiClick();
                this.selectedDifficulty = btn.dataset.difficulty as DifficultyId;
                this.bump = true;
                this.render(el);
            });
        });
        el.querySelectorAll<HTMLElement>('[data-tank]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.tank;
                if (!id || !BRAWLERS.some(b => b.id === id)) return;
                playUiClick();
                this.selectedBrawlerId = id;
                this.bump = true;
                this.render(el);
            });
        });
        el.querySelector('[data-action="play"]')?.addEventListener('click', () => this.startCurrentMatch());
    }
}
