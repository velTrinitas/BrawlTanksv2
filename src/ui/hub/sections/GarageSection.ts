import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import {
    COSMETICS, cosmeticsByType, RARITY_COLOR,
    type CosmeticDef, type CosmeticType,
} from '../../../config/cosmetics';
import { PITY_RARE_AT } from '../../../config/progression';

/**
 * GarageSection (GARAŻ) — HUB-2/F2a. Zrzuty (skrzynki) + kolekcja kosmetykow profilowych.
 * Skrzynki = srubki + KOSMETYKA (nigdy moc/staty). Otwarcie -> CrateOverlay (przez onOpenCrate).
 * Kosmetyki: grid wszystkich (owned interaktywne / locked wyszarzone), tap owned = equip (toggle).
 * Loadout Super Mocy (§18) = osobna faza F7 (tu teaser).
 */
export class GarageSection implements HubSection {
    public readonly id = 'garage';
    public readonly icon = '🔧';
    label(): string { return t('hub.nav.garage'); }

    /** HubShell otwiera CrateOverlay. */
    public onOpenCrate: (() => void) | null = null;
    /** Equipped zmienione -> HubShell odswieza readout. */
    public onCosmeticChanged: (() => void) | null = null;

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
            ${crateBox}
            <div class="bt-hub0-cos-head">${t('hub.garage.cosmetics', { owned: cos.owned.length, total: COSMETICS.length })}</div>
            ${groups}
            <div class="bt-hub0-node is-future is-teaser" style="margin-top:12px;">
                <span class="mark" aria-hidden="true">⚡</span>
                <div class="info"><b>${t('hub.garage.loadoutSoon')}</b><span class="reward">${t('common.soon')}</span></div>
            </div>
        `;
        this.wire();
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
