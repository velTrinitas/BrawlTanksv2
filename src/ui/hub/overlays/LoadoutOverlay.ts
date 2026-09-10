import { t, type TranslationKey } from '../../../i18n/i18n';
import { ProgressionService } from '../../../services/ProgressionService';
import { POWERS, POWER_ORDER, TIER3_POWERS, type PowerId, type PowerDef } from '../../../config/powers';
import { statTileHtml } from '../statTile';
import { playUiClick } from '../../uiSounds';

/**
 * LoadoutOverlay — GARAZ-3 (v0.158.0). PELNOEKRANOWY wybor Super Mocy.
 *
 * Wzorzec pelnego ekranu = RankUpOverlay (.bt-rankup): absolute inset:0 w rootEl
 * huba (przykrywa topbar+dok), scrim, BEZ karty-modala. Montaz: pole-singleton
 * w HubShell + callback GarageSection.onOpenLoadout (ta sama sciezka co crate).
 *
 * TRESC przeniesiona 1:1 z inline'owego loadoutu GarageSection (F7a..v0.137):
 * bogate karty mocy + sekcja Szalonych Mocy z toggle 🎲. NOWE: 3 sloty przypiete
 * na gorze jako kafle "record boxa" (statTileHtml — ten sam komponent co Rekordy
 * w Profilu; jedyny jezyk ramek po redesignie) — gracz WIDZI, jak wybor wskakuje
 * w placeholder.
 *
 * Walidacji NIE dublujemy: ProgressionService.setLoadoutSlot jest zrodlem prawdy
 * (no-op dla niedostepnych, blokada TIER3, duplikat => swap slotow, LWW).
 * Scroll: WYLACZNIE wewnatrz .bt-ld-scroll (gate 375px/wysokosc — sam Garaz
 * nie scrolluje).
 */

/** Literalowa mapa opisow (dynamiczny t(`power.${id}.desc`) nie kompiluje). */
const POWER_DESC_KEY: Record<PowerId, TranslationKey> = {
    aura: 'power.aura.desc',
    megaBomb: 'power.megaBomb.desc',
    freeze: 'power.freeze.desc',
    repair: 'power.repair.desc',
    tower: 'power.tower.desc',
    rockets: 'power.rockets.desc',
    ghost: 'power.ghost.desc',
    mines: 'power.mines.desc',
    build: 'power.build.desc',
    strike: 'power.strike.desc',
    hole: 'power.hole.desc',
    laser: 'power.laser.desc',
    pong: 'power.pong.desc',
    duck: 'power.duck.desc',
    locker: 'power.locker.desc',
    disco: 'power.disco.desc',
    granny: 'power.granny.desc',
    burp: 'power.burp.desc',
};

/** Neutralny akcent pustego slotu (kafle --art wymagaja koloru). */
const EMPTY_SLOT_ACCENT = '#8a93a5';
const DICE_ACCENT = '#a55eea';

/** Kafel slotu loadoutu (wspolny dla overlaya i rzedu slotow w Garazu). */
export function loadoutSlotTileHtml(
    pid: string,
    slot: 0 | 1 | 2,
    opts: { armed?: boolean } = {},
): string {
    const ps = ProgressionService.getPowerState(pid);
    const diceSlot = slot === 2 && ps.funModeOn;
    const id = ps.loadout[slot];
    const def = !diceSlot && id ? POWERS[id] : null;
    const accent = diceSlot ? DICE_ACCENT
        : def ? '#' + def.color.toString(16).padStart(6, '0') : EMPTY_SLOT_ACCENT;
    const art = `<span class="slot-emoji" aria-hidden="true">${diceSlot ? '🎲' : def?.emoji ?? '＋'}</span>`;
    const value = diceSlot ? t('power.dice') : def ? t(def.labelKey) : '—';
    const label = t('hub.garage.slot', { n: slot + 1 });
    const css = 'bt-hub0-stat--slot'
        + (opts.armed ? ' is-armed' : '')
        + (def || diceSlot ? '' : ' is-empty')
        + (diceSlot ? ' is-dice' : '');
    return statTileHtml(art, accent, value, label, css);
}

export class LoadoutOverlay {
    private el: HTMLElement | null = null;
    private pid = 'default';
    private armedSlot: 0 | 1 | 2 = 0;
    private onDone: (() => void) | null = null;

    open(parent: HTMLElement, pid: string, armedSlot: 0 | 1 | 2, onDone: () => void): void {
        this.close(); // pojedyncza instancja
        this.pid = pid;
        this.onDone = onDone;
        this.armedSlot = this.clampArmed(armedSlot);

        this.el = document.createElement('div');
        this.el.className = 'bt-ld';
        this.el.innerHTML = `
            <div class="bt-ld-top">
                <button class="bt-hub0-modal-close" data-action="close" type="button"
                        aria-label="${t('common.close')}">✕</button>
                <h3 class="bt-ld-title">⚡ ${t('hub.garage.loadout')}</h3>
                <div class="bt-ld-slots" data-ld-slots>${this.slotsHtml()}</div>
                <small class="bt-hub0-lhint">${t('hub.garage.loadoutHint')}</small>
            </div>
            <div class="bt-ld-scroll" data-ld-grid>${this.gridHtml()}</div>`;
        parent.appendChild(this.el);

        // Delegacja na roocie overlaya (przezywa repaint kontenerow wewnatrz).
        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-action="close"]')) {
                playUiClick();
                this.close();
                this.onDone?.();
                return;
            }
            const slotBtn = target.closest<HTMLElement>('[data-lslot]');
            if (slotBtn) {
                const slot = Number(slotBtn.dataset.lslot) as 0 | 1 | 2;
                if (slot !== this.clampArmed(slot)) return; // slot-kostka: nieuzbrajalny
                playUiClick();
                this.armedSlot = slot;
                this.repaint();
                return;
            }
            if (target.closest('[data-action="fun-toggle"]')) {
                playUiClick();
                ProgressionService.setFunMode(this.pid,
                    !ProgressionService.getPowerState(this.pid).funModeOn);
                this.armedSlot = this.clampArmed(this.armedSlot);
                this.repaint();
                return;
            }
            const powerBtn = target.closest<HTMLElement>('[data-power]');
            const id = powerBtn?.dataset.power as PowerId | '' | undefined;
            if (id) {
                playUiClick();
                // Serwis jest zrodlem prawdy: swap duplikatow, walidacja, LWW.
                ProgressionService.setLoadoutSlot(this.pid, this.armedSlot, id);
                const maxSlot = ProgressionService.getPowerState(this.pid).funModeOn ? 1 : 2;
                // GARAZ-3 v2 (brief: zamykanie bez X): wybor na OSTATNIM
                // uzbrajalnym slocie = komplet -> blysk "wskoczylo" i overlay
                // zamyka sie SAM. Dziala dla pelnego flow (3 tapy: 0->1->2->out)
                // i dla wejscia w konkretny slot (1 tap i po sprawie).
                if (this.armedSlot >= maxSlot) {
                    this.repaint();
                    this.el?.querySelector('[data-ld-slots]')?.classList.add('is-done');
                    window.setTimeout(() => {
                        if (!this.el) return; // gracz zdazyl zamknac recznie
                        this.close();
                        this.onDone?.();
                    }, 650);
                    return;
                }
                // auto-przejscie na kolejny uzbrajalny slot (UX F7a: dziecko
                // sklada zestaw tapami, bez trybow)
                this.armedSlot = (this.armedSlot + 1) as 0 | 1 | 2;
                this.repaint();
            }
        });
    }

    close(): void {
        this.el?.remove();
        this.el = null;
    }

    get isOpen(): boolean { return this.el !== null; }

    /** Przy funMode ON slot 3 to kostka — uzbrajalne sa tylko 0-1. */
    private clampArmed(slot: 0 | 1 | 2): 0 | 1 | 2 {
        const funOn = ProgressionService.getPowerState(this.pid).funModeOn;
        return (funOn && slot === 2) ? 0 : slot;
    }

    /** Targeted repaint slotow + gridu (kontenery zostaja => scroll przezywa). */
    private repaint(): void {
        if (!this.el) return;
        const slots = this.el.querySelector<HTMLElement>('[data-ld-slots]');
        const grid = this.el.querySelector<HTMLElement>('[data-ld-grid]');
        if (slots) slots.innerHTML = this.slotsHtml();
        if (grid) grid.innerHTML = this.gridHtml();
    }

    private slotsHtml(): string {
        return ([0, 1, 2] as const).map(slot => `
            <button class="bt-ld-slotbtn" data-lslot="${slot}" type="button">
                ${loadoutSlotTileHtml(this.pid, slot, { armed: this.armedSlot === slot })}
            </button>`).join('');
    }

    /** Siatka 12 mocy + sekcja Szalonych Mocy — przeniesione 1:1 z GarageSection. */
    private gridHtml(): string {
        const ps = ProgressionService.getPowerState(this.pid);
        const regularPowers = POWER_ORDER.filter(id => !TIER3_POWERS.includes(id));
        const grid = regularPowers.map(id => {
            const owned = ps.owned.includes(id);
            // Badge slotu 3 tylko gdy slot 3 realnie gra ta moca (funMode OFF).
            const inSlot = ps.loadout[0] === id ? 1 : ps.loadout[1] === id ? 2
                : (ps.loadout[2] === id && !ps.funModeOn) ? 3 : 0;
            return this.powerCard(POWERS[id], { owned, inSlot, fun: false });
        }).join('');
        const powersHead = `
            <div class="bt-hub0-powhead">
                <b>⚡ ${t('hub.garage.powersTitle', { n: regularPowers.length })}</b>
                <small>${t('hub.garage.powersSub', { n: regularPowers.length })}</small>
            </div>`;
        const funOn = ps.funModeOn;
        const funCards = TIER3_POWERS.map(id =>
            this.powerCard(POWERS[id], { owned: true, inSlot: 0, fun: true })).join('');
        const crazySection = `
            <div class="bt-hub0-crazy">
                <div class="bt-hub0-funmode">
                    <span class="fm-ico" aria-hidden="true">🎲</span>
                    <span class="fm-txt">
                        <b>${t('hub.garage.funMode')} (${TIER3_POWERS.length})</b>
                        <small>${t('hub.garage.funSub', { n: TIER3_POWERS.length })}</small>
                    </span>
                    <button class="bt-hub0-fun-toggle${funOn ? ' is-on' : ''}" data-action="fun-toggle"
                            type="button" role="switch" aria-checked="${funOn}">
                        <span class="knob" aria-hidden="true"></span>
                    </button>
                </div>
                <div class="bt-hub0-powcards bt-hub0-powcards--fun">${funCards}</div>
            </div>`;
        return `
            ${powersHead}
            <div class="bt-hub0-powcards">${grid}</div>
            ${crazySection}`;
    }

    /** Bogata karta mocy (v0.119.0) — przeniesiona 1:1 z GarageSection. */
    private powerCard(def: PowerDef, opts: { owned: boolean; inSlot: number; fun: boolean }): string {
        const color = '#' + def.color.toString(16).padStart(6, '0');
        const cdChip = t('power.chip.cooldown', { n: Math.round(def.cooldownMs / 1000) });
        const fromChip = def.unlockAtTrophies > 0
            ? t('power.chip.fromTrophies', { n: def.unlockAtTrophies })
            : t('power.chip.fromStart');
        const inner = `
            <span class="pc-icon" style="--pow:${color}" aria-hidden="true">
                ${def.emoji}${opts.owned ? '' : '<span class="pc-lock">🔒</span>'}
            </span>
            <span class="pc-body">
                <b class="pc-nm" style="color:${color}">${t(def.labelKey)}</b>
                <span class="pc-desc">${t(POWER_DESC_KEY[def.id])}</span>
                <span class="pc-chips">
                    <span class="pc-chip">${cdChip}</span>
                    <span class="pc-chip">${opts.fun ? `🎲 ${t('power.dice')}` : fromChip}</span>
                </span>
            </span>
            ${opts.inSlot ? `<span class="eq" aria-hidden="true">${opts.inSlot}</span>` : ''}`;
        if (opts.fun) {
            return `<span class="bt-hub0-powcard bt-hub0-powcard--fun">${inner}</span>`;
        }
        return `
            <button class="bt-hub0-powcard${opts.owned ? '' : ' is-locked'}${opts.inSlot ? ' is-equipped' : ''}"
                    data-power="${opts.owned ? def.id : ''}" type="button" ${opts.owned ? '' : 'aria-disabled="true"'}>
                ${inner}
            </button>`;
    }
}
