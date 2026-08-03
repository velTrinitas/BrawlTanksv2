import { t } from '../../../i18n/i18n';
import { ProgressionService } from '../../../services/ProgressionService';
import { getCosmetic, RARITY_COLOR, RARITY_LABEL_KEY, type Rarity } from '../../../config/cosmetics';
import { CRATE_RARITY_WEIGHTS, type CrateOpenResult } from '../../../config/progression';

/**
 * CrateOverlay (F2a §4) — scena zrzutu: skrzynia na spadochronie, 3 tapy by otworzyc
 * (rosnace napiecie), reveal-karta (kolor rzadkosci + kosmetyk/duplikat + srubki),
 * jawne pule z % ("Co moze wypasc?"). Juice = CSS transform/opacity (mobile-safe, zero
 * PIXI/overdraw), prefers-reduced-motion respektowany w hub-styles. Wzorzec StatsOverlay.
 */
export class CrateOverlay {
    private el: HTMLElement | null = null;
    private tapsLeft = 3;
    private onDone: (() => void) | null = null;

    open(parent: HTMLElement, profileId: string, onDone: () => void): void {
        this.close();
        this.onDone = onDone;
        this.tapsLeft = 3;

        this.el = document.createElement('div');
        this.el.className = 'bt-hub0-overlay';
        this.el.innerHTML = this.sceneHtml();
        parent.appendChild(this.el);
        this.wireScene(profileId);
    }

    private sceneHtml(): string {
        return `
            <div class="bt-hub0-modal bt-hub0-crate-modal" role="dialog" aria-modal="true">
                <button class="bt-hub0-modal-close" data-action="done" type="button"
                        aria-label="${t('common.close')}">✕</button>
                <h3 class="bt-hub0-modal-title">📦 ${t('crate.title')}</h3>
                <div class="bt-hub0-crate-scene">
                    <div class="bt-hub0-parachute" aria-hidden="true">🪂</div>
                    <button class="bt-hub0-crate-box" data-action="tap" type="button" aria-label="${t('crate.tap')}">📦</button>
                </div>
                <div class="bt-hub0-crate-hint">${t('crate.tap')} (${this.tapsLeft}/3)</div>
                <button class="bt-hub0-rankfull" data-action="pools" type="button">${t('crate.pools')}</button>
            </div>`;
    }

    private wireScene(profileId: string): void {
        const el = this.el;
        if (!el) return;
        el.addEventListener('click', (e) => {
            const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
            if (action === 'done' || (e.target === el)) { this.close(); this.onDone?.(); }
            else if (action === 'tap') this.onTap(profileId);
            else if (action === 'pools') this.showPools();
        });
    }

    private onTap(profileId: string): void {
        if (!this.el) return;
        this.tapsLeft -= 1;
        const box = this.el.querySelector<HTMLElement>('.bt-hub0-crate-box');
        box?.classList.remove('shake'); void box?.offsetWidth; box?.classList.add('shake');
        box?.style.setProperty('--glow', String((3 - this.tapsLeft) / 3));
        const hint = this.el.querySelector('.bt-hub0-crate-hint');
        if (this.tapsLeft > 0) {
            if (hint) hint.textContent = `${t('crate.tap')} (${this.tapsLeft}/3)`;
            return;
        }
        const result = ProgressionService.openCrate(profileId);
        if (result) this.renderReveal(result);
        else { this.close(); this.onDone?.(); } // brak skrzynek (nie powinno)
    }

    private renderReveal(r: CrateOpenResult): void {
        if (!this.el) return;
        const color = RARITY_COLOR[r.rarity];
        const cosDef = r.cosmeticId ? getCosmetic(r.cosmeticId) : undefined;
        const rewardLine = cosDef
            ? `<div class="bt-hub0-reveal-cos">${t('crate.newCosmetic')}<b>${t(cosDef.labelKey)}</b></div>`
            : `<div class="bt-hub0-reveal-cos">${t('crate.dup')}</div>`;
        this.el.innerHTML = `
            <div class="bt-hub0-modal bt-hub0-crate-modal" role="dialog" aria-modal="true">
                <div class="bt-hub0-reveal" style="--rc:${color};">
                    <div class="bt-hub0-reveal-rarity" style="color:${color};">${t(RARITY_LABEL_KEY[r.rarity])}</div>
                    ${rewardLine}
                    <div class="bt-hub0-reveal-bolts">🔩 +${r.bolts} ${t('crate.bolts')}</div>
                    <button class="bt-hub0-play" data-action="done" type="button">${t('common.close')}</button>
                </div>
            </div>`;
        // re-wire (nowy DOM)
        this.el.querySelector('[data-action="done"]')?.addEventListener('click', () => { this.close(); this.onDone?.(); });
    }

    private showPools(): void {
        if (!this.el) return;
        const rows = (['l', 'e', 'r', 'c'] as Rarity[]).map(rr => `
            <div class="bt-hub0-rankrow">
                <span class="pos" style="color:${RARITY_COLOR[rr]};">●</span>
                <span class="who">${t(RARITY_LABEL_KEY[rr])}</span>
                <span class="pts">${CRATE_RARITY_WEIGHTS[rr]}%</span>
            </div>`).join('');
        this.el.innerHTML = `
            <div class="bt-hub0-modal" role="dialog" aria-modal="true">
                <button class="bt-hub0-modal-close" data-action="back" type="button" aria-label="${t('common.close')}">✕</button>
                <h3 class="bt-hub0-modal-title">${t('crate.pools')}</h3>
                <div class="bt-hub0-ranklist">${rows}</div>
            </div>`;
        this.el.querySelector('[data-action="back"]')?.addEventListener('click', () => { this.close(); this.onDone?.(); });
    }

    close(): void {
        this.el?.remove();
        this.el = null;
    }
}
