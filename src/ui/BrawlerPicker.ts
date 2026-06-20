/**
 * BrawlerPicker.ts — Ekran 2 game setup (FAZA 6d).
 *
 * v0.24.0 FAZA 8a update:
 * - Brawler display names z i18n (klucz: 'brawler.{id}.name')
 * - Subskrybuje i18n.onLanguageChange dla live re-render gdy zmieni jezyk z Settings
 *
 * v0.46.0 HP/DMG x100 fix:
 * - USUNIETY hardcoded DAMAGE_DISPLAY map (stare wartosci sprzed x100, powodowaly
 *   "bledne dane": HP z configa pokazywal 400/700, a DMG ze starej tabeli 1/1.5).
 * - DMG czytany bezposrednio z configa (b.dmg) = single source of truth, zawsze spojny
 *   z brawlers.ts niezaleznie od skali.
 *
 * Flow:
 * 1. Gracz widzi 8 brawlerow w gridzie (2x4 mobile / 4x2 tablet+)
 * 2. 4 difficulty pills pod spodem (Easy/Normal/Hard/Nightmare)
 * 3. Hero CTA z dynamicznym tekstem (zalezy od scenario + map z poprzedniego picker)
 * 4. Klik CTA → callback z (brawlerId, difficulty)
 * 5. Klik Back → callback (MainMenu zachowa state)
 *
 * Constructor injection (z MainMenu):
 *   - scenario, map (z poprzedniego ScenarioPicker, do dynamicznego CTA)
 *   - initialBrawler, initialDifficulty (do state restoration po Back)
 *
 * Dynamic CTA via getCtaKey() z Scenario.ts:
 *   KTB + Desert    → "Wyrusz na Pustynie! 🐪"
 *   KTB + Cyberpunk → "Wejdz do Miasta! 🌆"
 *   CTF             → "Zdobadz Flagi! 🚩"
 *   Castle          → "Bron Zamku! 🏰"
 *
 * SFX: playUiClick() przy wyborze brawlera i difficulty pill.
 */

import type { IScreen } from './MainMenu';
import { t, i18n, type TranslationKey } from '../i18n/i18n';
import { getCtaKey, type ScenarioId } from '../types/Scenario';
import { type MapId } from '../types/MapType';
import { DIFFICULTY_CONFIGS, type DifficultyId } from '../types/GameConfig';
import { BRAWLERS } from '../config/brawlers';
import { playUiClick } from './uiSounds';

// ============================================================
// Types
// ============================================================

/**
 * Minimal flexible brawler shape — picker dziala z dowolnym brawlers.ts
 * zachowujac forward compatibility (brawler config moze ewoluować).
 *
 * v0.46.0: `dmg` to realne pole z brawlers.ts (wczesniej picker uzywal hardcoded
 * mapy bo interfejs mial `damage` ktory nie matchowal configa — usuniete).
 */
interface BrawlerForPicker {
    id: string;
    name: string;
    emoji?: string;
    icon?: string;
    colorMain?: string;  // tank theme color (used in old main.ts dla name pill + border)
    hp?: number;
    speed?: number;
    dmg?: number;        // realne pole damage z brawlers.ts (x100 scale od v0.46.0)
    reload?: number;
}

/**
 * v0.24.0: Resolve translated brawler display name.
 * Lookup `brawler.{id}.name` key. Fallback to b.name (config) jezeli key nie istnieje
 * — defensive dla future brawlers added bez aktualizacji i18n.
 */
function lookupBrawlerName(b: BrawlerForPicker): string {
    const key = `brawler.${b.id}.name` as TranslationKey;
    const translated = t(key);
    // If t() zwroci ten sam klucz (czyli brak tlumaczenia), fallback to config name
    if (translated === key) return b.name;
    return translated;
}

export interface BrawlerPickerOptions {
    scenario: ScenarioId;
    map: MapId;
    initialBrawler?: string;
    initialDifficulty?: DifficultyId;
}

// ============================================================
// BrawlerPicker
// ============================================================

export class BrawlerPicker implements IScreen {
    private el: HTMLElement | null = null;
    private langUnsub: (() => void) | null = null;

    private readonly scenario: ScenarioId;
    private readonly map: MapId;

    selectedBrawlerId: string | null = null;
    selectedDifficulty: DifficultyId = 'normal';

    // === Callbacks ===
    onBack: (() => void) | null = null;
    /** Wywolane przy klik Hero CTA — final selections gotowe do build GameConfig. */
    onPlay: ((brawlerId: string, difficulty: DifficultyId) => void) | null = null;

    constructor(opts: BrawlerPickerOptions) {
        this.scenario = opts.scenario;
        this.map = opts.map;
        if (opts.initialBrawler) this.selectedBrawlerId = opts.initialBrawler;
        if (opts.initialDifficulty) this.selectedDifficulty = opts.initialDifficulty;
    }

    mount(root: HTMLElement): void {
        this.el = this.render();
        root.appendChild(this.el);
        this.wireEvents();
        this.applyInitialSelections();

        // v0.24.0: subscribe do language changes dla live re-render
        // (gdy uzytkownik zmieni jezyk w Settings i wroci do BrawlerPicker —
        //  ale aktualnie BrawlerPicker jest unmount'owany przy nav, wiec to defensive)
        this.langUnsub = i18n.onLanguageChange(() => {
            // Preserve selections, re-render content
            const root = this.el?.parentElement;
            if (!root) return;
            this.el?.remove();
            this.el = this.render();
            root.appendChild(this.el);
            this.wireEvents();
            this.applyInitialSelections();
        });
    }

    unmount(): void {
        if (this.langUnsub) {
            this.langUnsub();
            this.langUnsub = null;
        }
        this.el?.remove();
        this.el = null;
    }

    // === Internal: render ===

    private render(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'bt-picker-screen bt-brawler-picker';

        root.innerHTML = `
            <div class="bt-hub-bg" aria-hidden="true"></div>
            <div class="bt-hub-overlay" aria-hidden="true"></div>

            <div class="bt-picker-content">
                <div class="bt-picker-header">
                    <h2 class="bt-picker-title">${t('picker.brawlerTitle')}</h2>
                    <div class="bt-step-indicator" role="progressbar" aria-valuenow="2" aria-valuemax="2">
                        <span class="step is-active"></span>
                        <span class="step is-active" aria-label="${t('picker.step', { current: 2, total: 2 })}"></span>
                    </div>
                </div>

                <div class="bt-brawler-grid">
                    ${this.renderBrawlerCards()}
                </div>

                <h3 class="bt-picker-subtitle">${t('picker.difficultyTitle')}</h3>
                <div class="bt-difficulty-pills">
                    ${this.renderDifficultyPills()}
                </div>

                <div class="bt-picker-footer">
                    <button class="bt-btn-secondary" type="button" data-action="back">
                        ← ${t('common.back')}
                    </button>
                    <button class="bt-cta-button" type="button" data-action="play" disabled>
                        <span class="bt-cta-label">${this.computeCtaText()}</span>
                    </button>
                </div>
            </div>
        `;

        return root;
    }

    private renderBrawlerCards(): string {
        const brawlers = BRAWLERS as unknown as BrawlerForPicker[];

        return brawlers.map(b => {
            // Stats czytane bezposrednio z configa (single source of truth, x100 scale).
            const hp = b.hp ?? '-';
            const speed = b.speed ?? '-';
            const damage = b.dmg ?? '-';

            // v0.24.0: i18n lookup dla display name (fallback to b.name jezeli brak klucza)
            const displayName = lookupBrawlerName(b);

            // ALTERNATIVE render: icon path OR emoji fallback (NEVER both — Runda 1 fix)
            const visualHtml = b.icon
                ? `<img class="bt-brawler-card-icon" src="${b.icon}" alt="${displayName}" loading="lazy">`
                : (b.emoji ? `<div class="bt-brawler-card-emoji" aria-hidden="true">${b.emoji}</div>` : '');

            // Colored name pill + colored icon border (uses b.colorMain from brawlers.ts)
            const nameBgStyle = b.colorMain ? ` style="background: ${b.colorMain};"` : '';
            const iconBorderStyle = b.colorMain ? ` style="border-color: ${b.colorMain};"` : '';
            const namePrefix = b.emoji ? `${b.emoji} ` : '';

            return `
                <button class="bt-brawler-card" type="button" data-brawler-id="${b.id}">
                    <div class="bt-brawler-card-icon-wrap"${iconBorderStyle}>
                        ${visualHtml}
                    </div>
                    <div class="bt-brawler-card-name"${nameBgStyle}>${namePrefix}${displayName}</div>
                    <div class="bt-brawler-card-stats">
                        <span class="stat"><span class="stat-icon">❤️</span>${hp}</span>
                        <span class="stat-divider" aria-hidden="true">|</span>
                        <span class="stat"><span class="stat-icon">⚡</span>${speed}</span>
                        <span class="stat-divider" aria-hidden="true">|</span>
                        <span class="stat"><span class="stat-icon">💥</span>${damage}</span>
                    </div>
                </button>
            `;
        }).join('');
    }

    private renderDifficultyPills(): string {
        const ids: DifficultyId[] = ['easy', 'normal', 'hard', 'nightmare'];
        return ids.map(id => {
            const cfg = DIFFICULTY_CONFIGS[id];
            return `
                <button class="bt-difficulty-pill" type="button"
                        data-difficulty-id="${id}"
                        style="--pill-color: ${cfg.color};">
                    <span class="pill-label">${t(cfg.labelKey)}</span>
                </button>
            `;
        }).join('');
    }

    private computeCtaText(): string {
        // getCtaKey resolves do property translation key (np. 'scenario.ktb.cta.desert')
        const ctaKey = getCtaKey(this.scenario, this.map);
        return t(ctaKey);
    }

    // === Internal: events ===

    private wireEvents(): void {
        if (!this.el) return;

        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            const action = target.closest<HTMLElement>('[data-action]');
            if (action) {
                this.handleFooterClick(action.dataset.action!);
                return;
            }

            const brawlerCard = target.closest<HTMLElement>('.bt-brawler-card');
            if (brawlerCard) {
                this.handleBrawlerClick(brawlerCard.dataset.brawlerId!, brawlerCard);
                return;
            }

            const difficultyPill = target.closest<HTMLElement>('.bt-difficulty-pill');
            if (difficultyPill) {
                this.handleDifficultyClick(difficultyPill.dataset.difficultyId as DifficultyId, difficultyPill);
                return;
            }
        });
    }

    private handleBrawlerClick(brawlerId: string, cardEl: HTMLElement): void {
        playUiClick();
        this.selectedBrawlerId = brawlerId;

        this.el?.querySelectorAll<HTMLElement>('.bt-brawler-card').forEach(c => {
            c.classList.toggle('is-selected', c === cardEl);
        });

        this.updateCtaButton();
    }

    private handleDifficultyClick(diffId: DifficultyId, pillEl: HTMLElement): void {
        playUiClick();
        this.selectedDifficulty = diffId;

        this.el?.querySelectorAll<HTMLElement>('.bt-difficulty-pill').forEach(p => {
            p.classList.toggle('is-selected', p === pillEl);
        });
    }

    private handleFooterClick(action: string): void {
        if (action === 'back') {
            this.onBack?.();
        } else if (action === 'play') {
            if (this.selectedBrawlerId) {
                this.onPlay?.(this.selectedBrawlerId, this.selectedDifficulty);
            }
        }
    }

    // === Internal: state restoration ===

    private applyInitialSelections(): void {
        if (this.selectedBrawlerId) {
            const card = this.el?.querySelector<HTMLElement>(
                `.bt-brawler-card[data-brawler-id="${this.selectedBrawlerId}"]`
            );
            card?.classList.add('is-selected');
        }

        // Difficulty zawsze ma selekcje (default 'normal')
        const pill = this.el?.querySelector<HTMLElement>(
            `.bt-difficulty-pill[data-difficulty-id="${this.selectedDifficulty}"]`
        );
        pill?.classList.add('is-selected');

        this.updateCtaButton();
    }

    private updateCtaButton(): void {
        const cta = this.el?.querySelector<HTMLButtonElement>('[data-action="play"]');
        if (!cta) return;
        cta.disabled = !this.selectedBrawlerId;
    }
}