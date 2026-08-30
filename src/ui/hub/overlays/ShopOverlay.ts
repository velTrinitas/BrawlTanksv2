/**
 * ShopOverlay — dwa modale sklepu (SHOP-1, v0.124.0).
 *
 * Przeplyw wg makiet Mariusza: kafel w siatce -> SZCZEGOLY (art + opis + cena + KUP)
 * -> POTWIERDZENIE ("Kupic za 350 Σ?" + "Zostanie Ci: 500 Σ") -> zakup.
 *
 * Dlaczego dwa kroki, a nie KUP wprost na kaflu: sigmy sa nieodwracalne, a grupa
 * docelowa to 9-12 lat. Potwierdzenie z saldem PO zakupie pokazuje konsekwencje
 * PRZED decyzja — to jest ta sama zasada co telegrafowanie ataku przez bossa.
 *
 * Wzorzec 1:1 z SeasonOverlay/CrateOverlay: pojedyncza instancja (open() wola close()),
 * scrim .bt-hub0-overlay, zamkniecie tlem albo [data-action="close"].
 */

import { t, i18n } from '../../../i18n/i18n';
import { AudioSys } from '../../../audio/AudioSys';
import { ProgressionService } from '../../../services/ProgressionService';
import { getShopItem, type ShopItemDef } from '../../../config/shop';
import {
    getCosmetic, voiceFile, RARITY_COLOR, RARITY_LABEL_KEY, type CosmeticDef,
} from '../../../config/cosmetics';

const BASE = import.meta.env.BASE_URL;

export class ShopOverlay {
    private el: HTMLElement | null = null;
    private parent: HTMLElement | null = null;

    /** Zakup doszedl do skutku — sekcja przerysowuje siatke i readout huba. */
    public onPurchased: (() => void) | null = null;
    /**
     * Kupiono skrzynke — otwieramy OD RAZU istniejacy CrateOverlay.
     * Bez tego zakup konczy sie cisza: sigmy znikaja, a skrzynka laduje w Garazu,
     * o czym dziewieciolatek nie ma skad wiedziec. Sensoryka (wartosc #2) mowi, ze
     * kazda interakcja musi cos zwrocic — a tu jeszcze doszly pieniadze.
     */
    public onCratesBought: ((count: number) => void) | null = null;

    get isOpen(): boolean { return this.el !== null; }

    // ── art produktu ────────────────────────────────────────────────────────
    /**
     * Kolejnosc zrodel: jawny `art` z SKU -> `asset` kosmetyku (stickery) -> emoji.
     * `onerror` zdejmuje zepsuty obrazek i zostawia emoji, wiec brakujacy plik
     * placeholdera nie robi dziury w kaflu.
     */
    private artHtml(item: ShopItemDef, def: CosmeticDef | undefined, cls: string): string {
        const src = item.art ?? def?.asset;
        const emoji = item.emoji ?? '🛒';
        if (!src) return `<span class="${cls}-emoji" aria-hidden="true">${emoji}</span>`;
        return `<img class="${cls}-img" src="${BASE}${src}" alt="" draggable="false"
                     onerror="this.remove()">
                <span class="${cls}-emoji ${cls}-emoji--under" aria-hidden="true">${emoji}</span>`;
    }

    /** Plik do podgladu ▶ POSLUCHAJ (klakson albo kwestia startowa paczki glosowej). */
    private previewSound(def: CosmeticDef | undefined): string | undefined {
        if (!def) return undefined;
        if (def.type === 'horn') return def.sound;
        if (def.type === 'voice') return voiceFile(def, 'start', i18n.getLanguage());
        return undefined;
    }

    // ── KROK 1: szczegoly ───────────────────────────────────────────────────
    openDetail(parent: HTMLElement, sku: string, profileId: string): void {
        const item = getShopItem(sku);
        if (!item) return;
        this.close();
        this.parent = parent;

        const def = item.grant.kind === 'cosmetic' ? getCosmetic(item.grant.id) : undefined;
        const owned = item.grant.kind === 'cosmetic'
            && ProgressionService.getCosmeticState(profileId).owned.includes(item.grant.id);
        const balance = ProgressionService.getBoltsBalance(profileId);
        const affordable = balance >= item.price;
        const preview = this.previewSound(def);

        // Przycisk glowny ma TRZY stany i kazdy mowi wprost, dlaczego nie da sie kupic.
        // Wyszarzony przycisk bez powodu to najczestsze zrodlo poczucia niesprawiedliwosci.
        let cta: string;
        if (item.soon) {
            cta = `<button class="bt-hub0-pbtn sd-cta" type="button" disabled>${t('shop.badge.soon')}</button>`;
        } else if (owned) {
            cta = `<button class="bt-hub0-pbtn sd-cta" type="button" disabled>✓ ${t('shop.badge.owned')}</button>`;
        } else if (!affordable) {
            cta = `<button class="bt-hub0-pbtn sd-cta" type="button" disabled>${t('shop.tooPoor')}</button>`;
        } else {
            cta = `<button class="bt-hub0-pbtn bt-hub0-pbtn--gold sd-cta" data-action="buy" type="button">${t('shop.buy')}</button>`;
        }

        const listenBtn = preview
            ? `<button class="bt-hub0-pbtn sd-listen" data-action="listen" type="button">${t('shop.listen')}</button>`
            : '';
        const hornNote = item.desktopOnly
            ? `<p class="sd-note">${t('shop.hornDesktopNote')}</p>` : '';

        this.el = document.createElement('div');
        this.el.className = 'bt-hub0-overlay';
        this.el.innerHTML = `
            <div class="bt-hub0-modal bt-shop-detail" role="dialog" aria-modal="true"
                 style="--g:${RARITY_COLOR[item.rarity]}">
                <button class="bt-hub0-modal-close" data-action="close" type="button"
                        aria-label="${t('common.close')}">✕</button>
                <div class="sd-art">${this.artHtml(item, def, 'sd')}</div>
                <div class="sd-body">
                    <div class="sd-rarity">◆ ${t(RARITY_LABEL_KEY[item.rarity])}</div>
                    <h3 class="sd-name">${t(item.nameKey)}</h3>
                    <div class="sd-chips">
                        <span class="sd-chip">${t(item.impactKey)}</span>
                    </div>
                    <p class="sd-desc">${t(item.descKey)}</p>
                    ${hornNote}
                    ${item.soon ? '' : `<div class="sd-price">
                        <img class="bt-sigma bt-sigma--lg" src="${BASE}assets/sigma.png" alt="">
                        <b>${item.price}</b>
                    </div>`}
                    <div class="sd-actions">${listenBtn}${cta}</div>
                </div>
            </div>`;
        parent.appendChild(this.el);

        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target === this.el || target.closest('[data-action="close"]')) {
                this.close();
            } else if (target.closest('[data-action="listen"]')) {
                AudioSys.getInstance().playOwnedSound(preview, 0); // podglad bez throttlingu
            } else if (target.closest('[data-action="buy"]')) {
                this.openConfirm(parent, item, def, profileId);
            }
        });
    }

    // ── KROK 2: potwierdzenie ───────────────────────────────────────────────
    private openConfirm(
        parent: HTMLElement, item: ShopItemDef, def: CosmeticDef | undefined, profileId: string,
    ): void {
        this.close();
        const balance = ProgressionService.getBoltsBalance(profileId);
        const after = Math.max(0, balance - item.price);
        const sigma = `<img class="bt-sigma" src="${BASE}assets/sigma.png" alt="">`;

        this.el = document.createElement('div');
        this.el.className = 'bt-hub0-overlay';
        this.el.innerHTML = `
            <div class="bt-hub0-modal bt-shop-confirm" role="dialog" aria-modal="true"
                 style="--g:${RARITY_COLOR[item.rarity]}">
                <div class="sc-art">${this.artHtml(item, def, 'sc')}</div>
                <h3 class="sc-name">${t(item.nameKey)}</h3>
                <p class="sc-q">${t('shop.confirmQuestion')} <b>${item.price}</b>${sigma}?</p>
                <div class="sc-actions">
                    <button class="bt-hub0-pbtn" data-action="close" type="button">${t('common.cancel')}</button>
                    <button class="bt-hub0-pbtn bt-hub0-pbtn--gold" data-action="confirm" type="button">
                        ${t('shop.confirmYes')}
                    </button>
                </div>
                <p class="sc-left">${t('shop.remaining')} <b>${after}</b>${sigma}</p>
            </div>`;
        parent.appendChild(this.el);

        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target === this.el || target.closest('[data-action="close"]')) {
                this.close();
            } else if (target.closest('[data-action="confirm"]')) {
                const result = ProgressionService.purchase(profileId, item.sku);
                this.close();
                if (result === 'ok') {
                    // v0.128.0 — KA-CHING zamiast zwyklego klikniecia menu. Zakup jest
                    // nieodwracalny i kosztuje sigmy, wiec musi brzmiec inaczej niz kazde
                    // inne dotkniecie UI (Sensoryka: to jest moment, ktory ma sie liczyc).
                    AudioSys.getInstance().playShopPurchase();
                    // Kupiony dzwiek sciagamy OD RAZU, zeby pierwsze H w meczu
                    // nie czekalo na siec (rejestr jest leniwy z zalozenia).
                    if (def?.type === 'horn') AudioSys.getInstance().preloadOwnedSound(def.sound);
                    if (def?.type === 'voice') {
                        AudioSys.getInstance().preloadOwnedSound(voiceFile(def, 'start', i18n.getLanguage()));
                        AudioSys.getInstance().preloadOwnedSound(voiceFile(def, 'lowHp', i18n.getLanguage()));
                    }
                    this.onPurchased?.();
                    if (item.grant.kind === 'crates') this.onCratesBought?.(item.grant.count);
                } else {
                    console.warn('[shop] zakup odrzucony:', item.sku, result);
                }
            }
        });
    }

    close(): void {
        this.el?.remove();
        this.el = null;
    }
}
