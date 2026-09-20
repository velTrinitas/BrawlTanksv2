import { t } from '../../../i18n/i18n';
import { ProgressionService } from '../../../services/ProgressionService';
import { BRAWLERS } from '../../../config/brawlers';
import { cosmeticsByType, TANK_SKIN_CAT_ORDER, type CosmeticDef } from '../../../config/cosmetics';
import { tankName } from '../sections/BattleSection';
import { turntableCanvasHtml, mountTankTurntable, type TurntableHandle } from '../tankTurntable';
import { mountTankTurn360 } from '../tankTurn360';
import {
    applySkinToViewer, baseSkinTileHtml, skinDefOf, skinNeeds360, skinPrice, skinTileHtml,
} from '../skinCommon';
import { playUiClick } from '../../uiSounds';

/**
 * SkinsOverlay — GARAZ v2 / TRANSZA F (v0.199.0). PRZYMIERZALNIA barw czolgu.
 *
 * DLACZEGO OSOBNY TRYB (brief Mariusza „Garaz bardzo mi sie nie podoba"): widok
 * glowny Garazu robil TRZY ekrany naraz (gablota + loadout + sklep ze skinami).
 * Paradoks tasmy skinow: do wyboru barwy chcesz DUZY czolg, a tasma spychala go
 * w dol wlasnie wtedy, gdy byl najbardziej potrzebny. Tu czolg jest bohaterem,
 * a probki stoja w SIATCE (skanuje sie duzo lepiej niz poziomy scroll).
 *
 * WZORZEC: LoadoutOverlay (.bt-ld / .bt-ld-top / .bt-ld-scroll, delegowany click
 * na roocie, targeted repaint, montaz w rootEl HubShella).
 *
 * ⚠️ OBROTNICA TO SINGLETON (`mountTankTurntable` niszczy poprzednia instancje).
 * Overlay montuje WLASNY canvas, czyli zabija gablote Garazu pod spodem — dlatego
 * `onDone` jest OBOWIAZKOWY i Garaz przemontowuje hero przy zamknieciu. Bez tego
 * po wyjsciu z trybu zostalby martwy, nieruchomy czolg.
 *
 * PODZIAL RYNKU (decyzja Mariusza 2026-09-19): Garaz PRZYMIERZA, Sklep SPRZEDAJE.
 * Zablokowany skin = ulotny podglad + CTA prowadzace do karty SKU w sklepie.
 */

export interface SkinsOverlayOpts {
    pid: string;
    brawlerId: string;
    flagId: string | null;
    /** Zablokowany skin: przejdz do karty SKU w sklepie (overlay zamyka sie sam). */
    onBuy: (sku: string) => void;
    /** Zamkniecie: Garaz MUSI przemontowac swoja obrotnice (singleton!). */
    onDone: () => void;
}

export class SkinsOverlay {
    private el: HTMLElement | null = null;
    private handle: TurntableHandle | null = null;
    private opts: SkinsOverlayOpts | null = null;
    /** ULOTNY podglad zablokowanego skina (nie zapisuje sie nigdzie). */
    private previewSkinId: string | null = null;
    /** Typ zamontowanego viewera — zmiana wymusza remount zamiast setSkin. */
    private viewerIs360 = false;

    get isOpen(): boolean { return this.el !== null; }

    open(parent: HTMLElement, opts: SkinsOverlayOpts): void {
        this.close();
        this.opts = opts;
        this.previewSkinId = null;

        const el = document.createElement('div');
        el.className = 'bt-ld bt-sk';
        el.innerHTML = `
            <div class="bt-ld-top bt-sk-top">
                <button class="bt-hub0-modal-close" data-action="close" type="button"
                        aria-label="${t('common.close')}">✕</button>
                <h3 class="bt-ld-title">🎨 ${t('hub.garage.type.tankSkin')}</h3>
                <div class="bt-sk-base" data-sk-base>${this.baseBtnHtml()}</div>
            </div>
            <div class="bt-sk-stage">
                ${turntableCanvasHtml()}
                <div class="bt-sk-info" data-sk-info>${this.infoHtml()}</div>
            </div>
            <div class="bt-sk-rack" data-sk-grid>${this.gridHtml()}</div>`;
        parent.appendChild(el);
        this.el = el;

        this.mountViewer();

        // Delegacja na roocie overlaya — przezywa repaint siatki i panelu info.
        el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-action="close"]')) {
                playUiClick();
                this.finish();
                return;
            }
            if (target.closest('[data-action="sk-buy"]')) {
                // Callback trzeba wyjac PRZED `finish()` — zamkniecie zeruje `opts`.
                const sku = this.previewSkinId;
                const buy = this.opts?.onBuy;
                playUiClick();
                this.finish();
                if (sku) buy?.(sku);
                return;
            }
            const tile = target.closest<HTMLElement>('[data-action="sk-skin"]');
            if (tile) {
                this.pickSkin(tile.dataset.skin ?? '');
            }
        });
    }

    close(): void {
        // Handle konczymy SAMI: `destroy()` jest idempotentny, a zostawiona petla
        // rAF zylaby do pierwszego `canvas.isConnected === false` (klatka zmarnowana).
        try {
            this.handle?.destroy();
        } catch (e) {
            console.error('[SkinsOverlay] turntable destroy failed:',
                (e as Error).stack ?? e, { brawlerId: this.opts?.brawlerId });
        }
        this.handle = null;
        this.el?.remove();
        this.el = null;
        this.previewSkinId = null;
    }

    /** Zamkniecie + oddanie sterowania Garazowi (remount gabloty). */
    private finish(): void {
        const done = this.opts?.onDone;
        this.close();
        this.opts = null;
        try {
            done?.();
        } catch (e) {
            console.error('[SkinsOverlay] onDone failed:', (e as Error).stack ?? e);
        }
    }

    // ── stan ────────────────────────────────────────────────────────────────

    private equippedId(): string | null {
        const pid = this.opts?.pid ?? 'default';
        return ProgressionService.getCosmeticState(pid).equipped['tankSkin'] ?? null;
    }

    /** Skin pokazywany na obrotnicy: ulotny podglad albo zalozony. */
    private displayedSkin(): CosmeticDef | null {
        return skinDefOf(this.previewSkinId) ?? skinDefOf(this.equippedId());
    }

    private brawler() {
        const id = this.opts?.brawlerId;
        return BRAWLERS.find(b => b.id === id) ?? BRAWLERS[0];
    }

    // ── render ──────────────────────────────────────────────────────────────

    /** Panel pod czolgiem: nazwa barwy + czolg + CTA sklepu przy podgladzie. */
    private infoHtml(): string {
        const def = this.displayedSkin();
        const b = this.brawler();
        const price = def && this.previewSkinId === def.id ? skinPrice(def) : undefined;
        const cta = this.previewSkinId && def
            ? `<button class="bt-sk-buy" data-action="sk-buy" type="button">
                   ${t('hub.garage.skinBuy', { n: price ?? 0 })}
               </button>`
            : '';
        return `
            <b class="bt-sk-name" style="color:${def?.hex ?? b.colorMain}">${def ? t(def.labelKey) : t('hub.garage.skinBase')}</b>
            <small class="bt-sk-tank">${tankName(b)}</small>
            ${cta}`;
    }

    /** Kafel BAZA — w naglowku, NIE w siatce (siatka ma byc rowne 12x3). */
    private baseBtnHtml(): string {
        const active = !this.equippedId() && !this.previewSkinId;
        return baseSkinTileHtml(this.brawler().colorMain, active, 'sk-skin');
    }

    /**
     * SIATKA 12x3 (uwaga Mariusza: „zrób grid 12x3, wieksze boxy, zero scrolla").
     *
     * Po wycofaniu 6 palet (v0.199.0) zostaje DOKLADNIE 36 barw: 6 palet + 5 kategorii
     * wzorow po 6. Sortowanie po kategorii uklada je w pary na rzad — 1: palety+zwierzeta,
     * 2: gry+zywioly, 3: wojskowe+sezonowe — wiec grupy czytaja sie bez naglowkow.
     * Naglowki kategorii PADLY swiadomie: kazdy z nich to osobny wiersz siatki, a te
     * wiersze byly jedynym powodem, dla ktorego przymierzalnia w ogole potrzebowala scrolla.
     * Kategoria zostaje w `title` kafla (tooltip) i w kolejnosci.
     */
    private gridHtml(): string {
        const pid = this.opts?.pid ?? 'default';
        const cos = ProgressionService.getCosmeticState(pid);
        const equippedId = this.equippedId();
        const defs = [...cosmeticsByType('tankSkin')].sort((x, y) =>
            TANK_SKIN_CAT_ORDER.indexOf(x.patternCat) - TANK_SKIN_CAT_ORDER.indexOf(y.patternCat));

        return defs.map(def => {
            const state = def.id === equippedId ? 'equipped'
                : def.id === this.previewSkinId ? 'preview'
                : cos.owned.includes(def.id) ? 'owned' : 'locked';
            return skinTileHtml(def, state, 'sk-skin');
        }).join('');
    }

    /** Targeted repaint: siatka + panel info + kafel BAZA (canvas zostaje nietkniety). */
    private repaint(): void {
        if (!this.el) return;
        const grid = this.el.querySelector<HTMLElement>('[data-sk-grid]');
        const info = this.el.querySelector<HTMLElement>('[data-sk-info]');
        const base = this.el.querySelector<HTMLElement>('[data-sk-base]');
        if (grid) grid.innerHTML = this.gridHtml();
        if (info) info.innerHTML = this.infoHtml();
        if (base) base.innerHTML = this.baseBtnHtml();
    }

    // ── interakcja ──────────────────────────────────────────────────────────

    /**
     * WYSIWYG 1:1 z paskiem Garazu: posiadany = commit OD RAZU, BAZA = zdejmij,
     * zablokowany = ULOTNY podglad (zero zapisu) + CTA do sklepu.
     */
    private pickSkin(skinId: string): void {
        const pid = this.opts?.pid ?? 'default';
        const cos = ProgressionService.getCosmeticState(pid);
        playUiClick();
        if (skinId === '') {
            this.previewSkinId = null;
            const eq = cos.equipped['tankSkin'];
            if (eq) ProgressionService.equipCosmetic(pid, eq); // toggle OFF
        } else if (cos.owned.includes(skinId)) {
            this.previewSkinId = null;
            ProgressionService.equipCosmetic(pid, skinId);
        } else {
            this.previewSkinId = this.previewSkinId === skinId ? null : skinId;
        }
        this.applySkin();
        this.repaint();
    }

    /** Przemaluj czolg (remount tylko, gdy zmienil sie WYMAGANY typ viewera). */
    private applySkin(): void {
        const def = this.displayedSkin();
        if (skinNeeds360(this.opts?.brawlerId ?? '', def) !== this.viewerIs360) {
            this.mountViewer();
            return;
        }
        applySkinToViewer(this.handle, def);
    }

    /**
     * Montuje obrotnice na WLASNYM canvasie overlaya. Singleton modulu ubija przy
     * okazji gablote Garazu — to swiadome, Garaz odtwarza ja w `onDone`.
     */
    private mountViewer(): void {
        const cv = this.el?.querySelector<HTMLCanvasElement>('canvas.bt-gr2-canvas');
        const o = this.opts;
        if (!cv || !o) return;
        try {
            this.handle?.destroy();
            const def = this.displayedSkin();
            this.viewerIs360 = skinNeeds360(o.brawlerId, def);
            this.handle = this.viewerIs360
                ? mountTankTurn360(cv, o.brawlerId, o.flagId)
                : mountTankTurntable(cv, o.brawlerId, o.flagId);
            applySkinToViewer(this.handle, def);
        } catch (e) {
            console.error('[SkinsOverlay] mountViewer failed:', (e as Error).stack ?? e,
                { brawlerId: o.brawlerId, skin: this.displayedSkin()?.id ?? null });
        }
    }
}
