/**
 * ShopSection — sekcja SKLEP (SHOP-1, v0.124.0).
 *
 * Uklad „witryna": hero z saldem -> zakladki kategorii -> siatka kafli.
 * Kafel NIE ma przycisku KUP — jest celem tapniecia w calosci i otwiera modal
 * szczegolow (ShopOverlay). Kafel bez przycisku jest o ~44px nizszy, a przy 375px
 * wysokosci w poziomie to roznica miedzy „widac rzad kart" a „widac pol kafla".
 *
 * ZASADA ASORTYMENTU: skrzynki daja kosmetyke profilowa (jak dzis), sklep sprzedaje
 * WYLACZNIE kategorie, ktorych skrzynki nie daja (SHOP_ONLY_TYPES). Zero kanibalizacji.
 */

import { t } from '../../../i18n/i18n';
import type { HubSection } from './HubSection';
import { ProfileService } from '../../../services/ProfileService';
import { ProgressionService } from '../../../services/ProgressionService';
import { getCosmetic, RARITY_COLOR } from '../../../config/cosmetics';
import { crateStack } from '../gameIcons';
import { crosshairCanvasHtml, paintCrosshairPreviews } from '../crosshairPreview'; // SHOP-2
import {
    SHOP_TABS, shopItemsOf, assertShopCatalog,
    type ShopCategory, type ShopItemDef,
} from '../../../config/shop';

const BASE = import.meta.env.BASE_URL;

/** Walidacja katalogu raz na sesje — glosny blad w konsoli zamiast martwego kafla. */
let catalogChecked = false;

export class ShopSection implements HubSection {
    public readonly id = 'shop';
    public readonly icon = '🛒';
    label(): string { return t('hub.shop'); }

    /** Zakup zmienia saldo => HubShell odswieza gorna belke. */
    public onBalanceChanged: (() => void) | null = null;
    /** Otwarcie modalu szczegolow (HubShell ma root, do ktorego montuje sie overlay). */
    public onOpenItem: ((sku: string) => void) | null = null;

    private tab: ShopCategory = 'crates';

    render(el: HTMLElement): void {
        if (!catalogChecked) { assertShopCatalog(); catalogChecked = true; }

        const pid = ProfileService.getActiveProfile()?.id ?? 'default';
        const balance = ProgressionService.getBoltsBalance(pid);

        el.innerHTML = `
            <h2 class="bt-hub0-sectitle bt-shop-title">${this.icon} ${t('shop.title')}</h2>
            ${this.heroHtml(balance)}
            ${this.sandboxHtml(pid)}
            <div class="bt-shop-tabs">${this.tabsHtml()}</div>
            <div class="bt-shop-grid">${this.gridHtml(pid)}</div>
        `;
        // SHOP-2: kafle to stringi HTML, wiec canvasy podgladu istnieja dopiero TERAZ.
        // Jedno przejscie po wstawieniu do DOM; wolane takze przy zmianie zakladki,
        // bo `render()` przebudowuje siatke od zera.
        paintCrosshairPreviews(el);
        this.wire(el, pid);
    }

    private heroHtml(balance: number): string {
        // Sciezka monety wchodzi do CSS przez zmienna, a nie hardkodem w arkuszu —
        // tlo hubu ma wpisany prefiks repo na sztywno i to jest pulapka przy zmianie
        // BASE_URL (np. inna domena po rebrandzie). Tu robimy to poprawnie.
        return `
            <div class="bt-shop-hero" style="--sh-coin:url('${BASE}assets/sigma.png')">
                <div class="sh-art" aria-hidden="true"></div>
                <div class="sh-info">
                    <div class="sh-balance">
                        <span class="sh-balance-lbl">${t('shop.balance')}</span>
                        <img class="bt-sigma bt-sigma--lg" src="${BASE}assets/sigma.png" alt="">
                        <b>${balance}</b>
                    </div>
                    <p class="sh-copy">${t('shop.heroLine1')}<br>${t('shop.heroLine2')}</p>
                </div>
            </div>`;
    }

    /** Pasek piaskownicy — widoczny tylko poza produkcja; RESET tylko gdy jest co cofac. */
    private sandboxHtml(pid: string): string {
        if (!ProgressionService.isSandboxActive()) return '';
        const dirty = ProgressionService.hasSandboxChanges(pid);
        const reset = dirty
            ? `<button class="bt-shop-reset" data-action="sandbox-reset" type="button">${t('shop.sandboxReset')}</button>`
            : '';
        return `<div class="bt-shop-sandbox">🧪 ${t('shop.sandbox')}${reset}</div>`;
    }

    private tabsHtml(): string {
        return SHOP_TABS.map(tab => `
            <button class="bt-hub0-ptab${tab.id === this.tab ? ' is-active' : ''}"
                    data-tab="${tab.id}" type="button">${t(tab.labelKey)}</button>`).join('');
    }

    private gridHtml(pid: string): string {
        const items = shopItemsOf(this.tab);
        if (!items.length) return `<p class="bt-hub0-placeholder">${t('shop.empty')}</p>`;
        const owned = ProgressionService.getCosmeticState(pid).owned;
        const balance = ProgressionService.getBoltsBalance(pid);
        return items.map(item => this.cardHtml(item, owned, balance)).join('');
    }

    private cardHtml(item: ShopItemDef, owned: readonly string[], balance: number): string {
        const def = item.grant.kind === 'cosmetic' ? getCosmetic(item.grant.id) : undefined;
        const isOwned = item.grant.kind === 'cosmetic' && owned.includes(item.grant.id);
        const src = item.art ?? def?.asset;
        const emoji = item.emoji ?? '🛒';
        // v0.131.0 (zgloszenie Mariusza): paczka skrzynek pokazuje TE SAMA skrzynke,
        // ktora gracz otwiera w Garazu, i TYLE sztuk, ile kupuje — zamiast emoji 📦
        // identycznego dla paczki po 1, 3 i 10.
        // SHOP-2: celownik pokazuje sie PRAWDZIWA funkcja rysujaca z rejestru. Emoji
        // zastepcze wygladaloby identycznie dla wszystkich szesciu wariantow, czyli
        // gracz nie widzialby, za co placi (a to najdrozsza kategoria w sklepie).
        const art = item.grant.kind === 'crates'
            ? crateStack(item.grant.count)
            : def?.type === 'crosshair'
                ? crosshairCanvasHtml(def.id)
                : src
                    ? `<img src="${BASE}${src}" alt="" draggable="false" loading="lazy" onerror="this.remove()">
                       <span class="sk-emoji" aria-hidden="true">${emoji}</span>`
                    : `<span class="sk-emoji" aria-hidden="true">${emoji}</span>`;

        // Trzy wykluczajace sie stany kafla; "za drogo" NIE blokuje wejscia w szczegoly —
        // gracz ma prawo obejrzec, na co zbiera.
        let cls = '';
        let foot: string;
        if (item.soon) {
            cls = ' is-locked';
            foot = `<span class="sk-soon">${t('shop.badge.soon')}</span>`;
        } else if (isOwned) {
            cls = ' is-owned';
            foot = `<span class="sk-owned">✓ ${t('shop.badge.owned')}</span>`;
        } else {
            cls = balance >= item.price ? '' : ' is-poor';
            foot = `<span class="sk-price"><img class="bt-sigma" src="${BASE}assets/sigma.png" alt=""><b>${item.price}</b></span>`;
        }

        // v0.126.0 — towar `desktopOnly` jest od teraz kupowalny takze na telefonie,
        // ale MUSI o tym mowic PRZED zakupem. Badge na kaflu widac bez otwierania
        // szczegolow — a to jedyny moment, w ktorym gracz jeszcze nie zdecydowal.
        const pcBadge = item.desktopOnly
            ? `<span class="sk-pc" title="${t('shop.hornDesktopNote')}">🖥️ PC</span>` : '';

        return `
            <button class="bt-shop-card${cls}" data-sku="${item.sku}" type="button"
                    style="--g:${RARITY_COLOR[item.rarity]}">
                <span class="sk-art">${art}${pcBadge}</span>
                <span class="sk-name">${t(item.nameKey)}</span>
                ${foot}
            </button>`;
    }

    private wire(el: HTMLElement, pid: string): void {
        el.querySelectorAll<HTMLElement>('[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const next = btn.dataset.tab as ShopCategory | undefined;
                if (!next || next === this.tab) return;
                this.tab = next;
                this.render(el);
            });
        });
        el.querySelectorAll<HTMLElement>('[data-sku]').forEach(btn => {
            btn.addEventListener('click', () => {
                const sku = btn.dataset.sku;
                if (sku) this.onOpenItem?.(sku);
            });
        });
        el.querySelector('[data-action="sandbox-reset"]')?.addEventListener('click', () => {
            ProgressionService.resetShopSandbox(pid);
            this.render(el);
            this.onBalanceChanged?.();
        });
    }
}
