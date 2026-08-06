import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import {
    COSMETICS, cosmeticsByType, RARITY_COLOR,
    type CosmeticDef, type CosmeticType,
} from '../../../config/cosmetics';
import { PITY_RARE_AT } from '../../../config/progression';
import { POWERS, POWER_ORDER, type PowerId } from '../../../config/powers'; // F7a loadout

/**
 * GarageSection (GARAŻ) — HUB-2/F2a/F7a. Loadout Super Mocy + Zrzuty (skrzynki) + kosmetyki.
 * Skrzynki = srubki + KOSMETYKA (nigdy moc/staty). Otwarcie -> CrateOverlay (przez onOpenCrate).
 * Kosmetyki: grid wszystkich (owned interaktywne / locked wyszarzone), tap owned = equip (toggle).
 *
 * LOADOUT (F7a): 2 sloty + siatka mocy z rejestru. UX dla 9-12: tap slot = uzbroj go (zloty
 * ring), tap moc = wsadz do uzbrojonego slotu (duplikat w drugim slocie => swap w serwisie),
 * po przypisaniu auto-przejscie na drugi slot. Zablokowane moce wyszarzone z progiem 🏆.
 */
export class GarageSection implements HubSection {
    public readonly id = 'garage';
    public readonly icon = '🔧';
    label(): string { return t('hub.nav.garage'); }

    /** HubShell otwiera CrateOverlay. */
    public onOpenCrate: (() => void) | null = null;
    /** Equipped zmienione -> HubShell odswieza readout. */
    public onCosmeticChanged: (() => void) | null = null;

    /** F7a — ktory slot loadoutu jest "uzbrojony" na przypisanie mocy. */
    private activeSlot: 0 | 1 = 0;

    private el: HTMLElement | null = null;

    render(el: HTMLElement): void {
        this.el = el;
        const pid = ProfileService.getActiveProfile()?.id ?? 'default';
        const cos = ProgressionService.getCosmeticState(pid);
        const pityLeft = PITY_RARE_AT - (cos.pityCounter % PITY_RARE_AT);

        const crateBox = `
            <div class="bt-hub0-cratebox">
                <div class="bt-hub0-crate-art" aria-hidden="true">📦</div>
                <div class="bt-hub0-crate-info">
                    <b>${t('hub.garage.crates', { n: cos.crateCount })}</b>
                    <small>${t('hub.garage.pity', { n: pityLeft })}</small>
                </div>
                <button class="bt-hub0-play" data-action="open-crate" type="button" ${cos.crateCount > 0 ? '' : 'disabled'}>
                    ${t('hub.garage.open')}
                </button>
            </div>`;

        const TYPE_LABEL_KEY = {
            nickColor: 'hub.garage.type.nickColor',
            frame: 'hub.garage.type.frame',
            title: 'hub.garage.type.title',
        } as const;
        const groups = (['nickColor', 'frame', 'title'] as CosmeticType[]).map(type => {
            const items = cosmeticsByType(type).map(def => this.cosmeticChip(def, cos)).join('');
            return `<div class="bt-hub0-cos-group">
                <div class="bt-hub0-cos-grouptitle">${t(TYPE_LABEL_KEY[type])}</div>
                <div class="bt-hub0-cos-grid">${items}</div>
            </div>`;
        }).join('');

        el.innerHTML = `
            <h2 class="bt-hub0-sectitle">${this.icon} ${t('hub.nav.garage')}</h2>
            ${this.loadoutHtml(pid)}
            ${crateBox}
            <div class="bt-hub0-cos-head">${t('hub.garage.cosmetics', { owned: cos.owned.length, total: COSMETICS.length })}</div>
            ${groups}
        `;
        this.wire();
    }

    // ── F7a: Loadout Super Mocy ─────────────────────────────────────────────

    private loadoutHtml(pid: string): string {
        const ps = ProgressionService.getPowerState(pid);

        const slots = ([0, 1] as const).map(slot => {
            const id = ps.loadout[slot];
            const def = id ? POWERS[id] : null;
            const armed = this.activeSlot === slot;
            return `
                <button class="bt-hub0-lslot${armed ? ' is-armed' : ''}" data-lslot="${slot}" type="button">
                    <span class="num">${t('hub.garage.slot', { n: slot + 1 })}</span>
                    <span class="pi" aria-hidden="true">${def?.emoji ?? '❔'}</span>
                    <span class="pn">${def ? t(def.labelKey) : '—'}</span>
                </button>`;
        }).join('');

        const grid = POWER_ORDER.map(id => {
            const def = POWERS[id];
            const owned = ps.owned.includes(id);
            const inSlot = ps.loadout[0] === id ? 1 : ps.loadout[1] === id ? 2 : 0;
            return `
                <button class="bt-hub0-pow${owned ? '' : ' is-locked'}${inSlot ? ' is-equipped' : ''}"
                        data-power="${owned ? id : ''}" type="button" ${owned ? '' : 'aria-disabled="true"'}>
                    <span class="pi" aria-hidden="true">${owned ? def.emoji : '🔒'}</span>
                    <span class="pn">${owned ? t(def.labelKey) : t('hub.garage.powerLocked', { n: def.unlockAtTrophies })}</span>
                    ${inSlot ? `<span class="eq" aria-hidden="true">${inSlot}</span>` : ''}
                </button>`;
        }).join('');

        return `
            <div class="bt-hub0-loadout">
                <div class="bt-hub0-cos-grouptitle">⚡ ${t('hub.garage.loadout')}</div>
                <div class="bt-hub0-lslots">${slots}</div>
                <div class="bt-hub0-pow-grid">${grid}</div>
                <small class="bt-hub0-lhint">${t('hub.garage.loadoutHint')}</small>
            </div>`;
    }

    private cosmeticChip(def: CosmeticDef, cos: { owned: readonly string[]; equipped: Partial<Record<CosmeticType, string>> }): string {
        const owned = cos.owned.includes(def.id);
        const equipped = cos.equipped[def.type] === def.id;
        const label = def.type === 'title' ? t(def.labelKey as 'cosmetic.ti_recruit') : t(def.labelKey as 'cosmetic.nc_silver');
        return `
            <button class="bt-hub0-cos${owned ? '' : ' is-locked'}${equipped ? ' is-equipped' : ''}"
                    data-cos="${owned ? def.id : ''}" type="button" ${owned ? '' : 'aria-disabled="true"'}>
                <span class="dot" style="background:${RARITY_COLOR[def.rarity]};" aria-hidden="true"></span>
                <span class="nm">${owned ? label : '🔒'}</span>
                ${equipped ? '<span class="eq" aria-hidden="true">✓</span>' : ''}
            </button>`;
    }

    private wire(): void {
        const el = this.el;
        if (!el) return;
        el.querySelector('[data-action="open-crate"]')?.addEventListener('click', () => this.onOpenCrate?.());

        // F7a — loadout: tap slot = uzbroj; tap moc = przypisz do uzbrojonego + auto-przejscie
        // na drugi slot (dziecko sklada pare dwoma tapami, bez trybow i menu).
        el.querySelectorAll<HTMLElement>('[data-lslot]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeSlot = btn.dataset.lslot === '1' ? 1 : 0;
                this.render(el);
            });
        });
        el.querySelectorAll<HTMLElement>('[data-power]').forEach(btn => {
            const id = btn.dataset.power as PowerId | '';
            if (!id) return; // locked
            btn.addEventListener('click', () => {
                const pid = ProfileService.getActiveProfile()?.id ?? 'default';
                ProgressionService.setLoadoutSlot(pid, this.activeSlot, id);
                this.activeSlot = this.activeSlot === 0 ? 1 : 0;
                this.render(el);
            });
        });
        el.querySelectorAll<HTMLElement>('[data-cos]').forEach(btn => {
            const id = btn.dataset.cos;
            if (!id) return; // locked
            btn.addEventListener('click', () => {
                const pid = ProfileService.getActiveProfile()?.id ?? 'default';
                ProgressionService.equipCosmetic(pid, id);
                this.render(el);            // odswiez grid (equipped highlight)
                this.onCosmeticChanged?.();  // odswiez readout hubu
            });
        });
    }
}
