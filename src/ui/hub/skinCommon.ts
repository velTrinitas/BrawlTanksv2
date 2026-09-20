import { t } from '../../i18n/i18n';
import { getShopItem } from '../../config/shop';
import { TURN360_TANKS } from '../../config/hubChoose';
import { getCosmetic, tankSkinSwatchStyle, RARITY_COLOR, type CosmeticDef } from '../../config/cosmetics';
import type { TurntableHandle } from './tankTurntable';

/**
 * skinCommon.ts — GARAZ v2 / TRANSZA F (v0.199.0).
 *
 * Wspolna warstwa skinow dla DWOCH powierzchni: starego paska w GarageSection
 * (sciezka rollbacku `?skinsmode=0`) i nowej przymierzalni (SkinsOverlay).
 * Powod wydzielenia: logika `needs360` i markup kafla byly prywatne w GarageSection,
 * a przymierzalnia potrzebuje DOKLADNIE tych samych regul — kopia rozjechalaby sie
 * przy pierwszej zmianie rejestru kosmetykow.
 *
 * ZERO stanu na poziomie modulu: kazda powierzchnia trzyma swoj preview/equip,
 * tu sa tylko czyste funkcje.
 */

/** Stan kafla — mapuje sie 1:1 na klasy CSS `.bt-gr2-skin.is-*`. */
export type SkinTileState = 'equipped' | 'preview' | 'locked' | 'owned';

/** Def skina po id (null dla pustego id = BAZA). */
export function skinDefOf(id: string | null | undefined): CosmeticDef | null {
    return (id ? getCosmetic(id) : undefined) ?? null;
}

/**
 * Czy dla tego czolgu i skina potrzebny jest viewer atlasowy (turn360)?
 * Atlas 3/4 NIE umie wzorow (SKIN-2), wiec wzorzysty skin zrzuca czolg na zywa
 * obrotnice render2d. Zmiana wyniku = pelny remount viewera, nie samo setSkin.
 */
export function skinNeeds360(brawlerId: string, def: CosmeticDef | null): boolean {
    return TURN360_TANKS.includes(brawlerId) && !def?.pattern;
}

/** Podaj skina zamontowanemu viewerowi (paleta + filtr + wzor + animacja). */
export function applySkinToViewer(handle: TurntableHandle | null, def: CosmeticDef | null): void {
    handle?.setSkin(def?.hex ?? null, def?.filter3d ?? null, def?.pattern ?? null, !!def?.animated);
}

/** Cena SKU skina (sklep) — undefined, gdy skin nie jest na sprzedaz. */
export function skinPrice(def: CosmeticDef): number | undefined {
    return getShopItem(def.id)?.price;
}

/**
 * Kafel skina. `action` pozwala obu powierzchniom miec wlasny data-action
 * (pasek: `gr2-skin`, przymierzalnia: `sk-skin`) przy tym samym markupie i CSS.
 * Zablokowany pokazuje CENE zamiast nazwy — to jedyna informacja, ktorej gracz
 * w tym momencie potrzebuje.
 */
export function skinTileHtml(def: CosmeticDef, state: SkinTileState, action: string): string {
    const cls = state === 'owned' ? '' : ` is-${state}`;
    const locked = state === 'locked';
    const price = skinPrice(def);
    return `
        <button class="bt-gr2-skin${cls}" data-action="${action}" data-skin="${def.id}"
                type="button" title="${t(def.labelKey)}"
                style="--rar:${RARITY_COLOR[def.rarity]}">
            <span class="dot${def.animated ? ' is-anim' : ''}" style="${tankSkinSwatchStyle(def)}">${locked ? '<span class="lk">🔒</span>' : ''}</span>
            <small>${locked ? `${price ?? '?'} ⚙` : t(def.labelKey)}</small>
        </button>`;
}

/** Kafel BAZA (goly czolg w barwie brawlera) — `data-skin=""` = zdejmij skina. */
export function baseSkinTileHtml(colorMain: string, active: boolean, action: string): string {
    return `
        <button class="bt-gr2-skin${active ? ' is-equipped' : ''}"
                data-action="${action}" data-skin="" type="button" title="${t('hub.garage.skinBase')}">
            <span class="dot" style="background:
                radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), rgba(255,255,255,0) 55%),
                radial-gradient(circle at 70% 75%, rgba(0,0,0,0.25), rgba(0,0,0,0) 60%),
                ${colorMain};"></span>
            <small>${t('hub.garage.skinBase')}</small>
        </button>`;
}
