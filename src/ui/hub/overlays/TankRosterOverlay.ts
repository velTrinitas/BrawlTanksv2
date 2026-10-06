import { t } from '../../../i18n/i18n';
import { BRAWLERS } from '../../../config/brawlers';
import { isBalanceV2Enabled } from '../../../config/balanceFlag';
import { isEnigmaEnabled } from '../../../config/enigmaFlag'; // ENIGMA: z flaga czolg jest w BRAWLERS — karta "wkrotce" znika
import { tankName, statRowHtml, STAT_MAX, tempoOf } from '../sections/BattleSection';
import { reducedMotion } from '../juice';
import { playUiClick, playUiSelect, playUiBack } from '../../uiSounds';
import type { Brawler } from '../../../types/Brawler';

/**
 * GALERIA CZOLGOW (v0.230.0) — wszystkie czolgi z aktualnymi statami obok siebie.
 *
 * Garaz pokazuje JEDEN czolg na obrotnicy; porownanie wymagalo 8 klikniec strzalka.
 * Tu dziecko widzi caly roster naraz. Tap karty = wybierz czolg (ta sama sciezka co karuzela).
 *
 * Obrazki: `assets/tanks/tanks_200/<nazwa>_200.png` maja BIALE tlo — panel obrazka ma jasny
 * gradient w kolorze czolgu, a <img> `mix-blend-mode: multiply`, wiec biel znika w panelu.
 * Czysty DOM/CSS: zero canvasu, zero kosztu dla petli gry (hub).
 */

const ENIGMA_IMG = import.meta.env.BASE_URL + 'assets/tanks/tanks_200/EnigmaX7_200.png';

/** `assets/tanks/twardy.jpg` -> `assets/tanks/tanks_200/twardy_200.png` */
function portraitOf(b: Brawler): string {
    return b.icon.replace(/assets\/tanks\/([\w-]+)\.jpg$/, 'assets/tanks/tanks_200/$1_200.png');
}

/** Chipy cech specjalnych (tylko te, ktore czolg realnie ma w aktywnym rulesecie). */
function traitsHtml(b: Brawler): string {
    const chips: string[] = [];
    if (b.volley && b.volley.count > 1) chips.push(`💥 ${t('hub.roster.trait.volley', { n: b.volley.count })}`);
    if (b.pierce && b.pierce > 1) chips.push(`➹ ${t('hub.roster.trait.pierce', { n: b.pierce })}`);
    if (b.dash) chips.push(`💨 ${t('hub.roster.trait.dash')}`);
    // ENIGMA: realna kadencja (reload zaokraglony w gore do kroku logiki 16,67 ms) — pasek TEMPO jest przyciety do 5/s.
    if (b.spinUpSteps) chips.push(`🔫 ${t('hub.roster.trait.gatling', { n: Math.round(1000 / (Math.ceil(b.reload / (1000 / 60)) * (1000 / 60))) })}`);
    return chips.length ? `<div class="rs-traits">${chips.map(c => `<span>${c}</span>`).join('')}</div>` : '';
}

export interface RosterOpenOpts {
    selectedId: string;
    onPick: (brawlerId: string) => void;
    onDone?: () => void;
}

export class TankRosterOverlay {
    private el: HTMLElement | null = null;
    private onKey: ((e: KeyboardEvent) => void) | null = null;
    private onDone: (() => void) | null = null;

    open(parent: HTMLElement, opts: RosterOpenOpts): void {
        this.close(); // pojedyncza instancja
        this.onDone = opts.onDone ?? null;
        const v2 = isBalanceV2Enabled();

        const cards = BRAWLERS.map((b, i) => {
            const mine = b.id === opts.selectedId;
            return `
            <button class="bt-rs-card${mine ? ' is-mine' : ''}" type="button" data-pick="${b.id}"
                    style="--tank:${b.colorMain}; --i:${i}" aria-pressed="${mine}">
                ${mine ? `<i class="rs-mine">★ ${t('hub.roster.mine')}</i>` : ''}
                <span class="rs-media">
                    <img src="${portraitOf(b)}" alt="" loading="lazy" draggable="false">
                </span>
                <span class="rs-name">${tankName(b)}</span>
                <span class="rs-stats">
                    ${statRowHtml(t('stat.hp'), b.hp, STAT_MAX.hp)}
                    ${statRowHtml(t('stat.dmg'), b.dmg, STAT_MAX.dmg)}
                    ${statRowHtml(t('stat.speed'), b.speed, STAT_MAX.speed)}
                    ${statRowHtml(t('stat.tempo'), tempoOf(b.reload), STAT_MAX.tempo)}
                    ${v2 && b.maxDist ? statRowHtml(t('stat.range'), b.maxDist, STAT_MAX.range) : ''}
                </span>
                ${traitsHtml(b)}
                <span class="rs-cta">${mine ? `✓ ${t('hub.roster.selected')}` : t('hub.roster.pick')}</span>
            </button>`;
        }).join('');

        const enigma = `
            <div class="bt-rs-card is-soon" style="--tank:#6c7a89; --i:${BRAWLERS.length}">
                <span class="rs-media"><img src="${ENIGMA_IMG}" alt="" loading="lazy" draggable="false"></span>
                <span class="rs-name">???</span>
                <span class="rs-soon">🔒 ${t('hub.roster.soon')}</span>
            </div>`;

        this.el = document.createElement('div');
        this.el.className = 'bt-hub0-overlay bt-rs-overlay';
        this.el.innerHTML = `
            <div class="bt-hub0-modal bt-rs-modal${reducedMotion() ? '' : ' is-anim'}" role="dialog" aria-modal="true"
                 aria-label="${t('hub.roster.title')}">
                <button class="bt-hub0-modal-close" data-action="close" type="button"
                        aria-label="${t('common.close')}">✕</button>
                <h3 class="bt-hub0-modal-title bt-rs-title">${t('hub.roster.title')}
                    <small>${t('hub.roster.hint')}</small></h3>
                <div class="bt-rs-grid">${cards}${isEnigmaEnabled() ? '' : enigma}</div>
            </div>`;
        parent.appendChild(this.el);
        playUiSelect();

        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target === this.el || target.closest('[data-action="close"]')) {
                playUiBack();
                this.close();
                return;
            }
            const card = target.closest<HTMLElement>('[data-pick]');
            if (!card) return;
            const id = card.dataset.pick ?? '';
            if (id === opts.selectedId) { playUiClick(); this.close(); return; }
            try {
                opts.onPick(id);
            } catch (err) {
                console.error('[TankRosterOverlay] onPick failed:', (err as Error).stack ?? err, { brawlerId: id });
            }
            this.close();
        });
        this.onKey = (e) => { if (e.key === 'Escape') this.close(); };
        window.addEventListener('keydown', this.onKey);
    }

    close(): void {
        if (this.onKey) window.removeEventListener('keydown', this.onKey);
        this.onKey = null;
        const wasOpen = this.el !== null;
        this.el?.remove();
        this.el = null;
        const done = this.onDone;
        this.onDone = null;
        if (wasOpen) done?.();
    }
}
