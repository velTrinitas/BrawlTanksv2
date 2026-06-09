/**
 * BrawlerPicker.ts — Ekran 2 game setup (FAZA 6d).
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
import { t } from '../i18n/i18n';
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
 */
interface BrawlerForPicker {
    id: string;
    name: string;
    emoji?: string;
    icon?: string;
    colorMain?: string;  // tank theme color (used in old main.ts dla name pill + border)
    hp?: number;
    speed?: number;
    damage?: number;
    reload?: number;
}

/**
 * DAMAGE DISPLAY VALUES (Runda 1.10 — defensive mapping z wieloma wariantami casing).
 *
 * Mapping pokrywa: lowercase, Capitalized, UPPERCASE + popularne EN nazwy.
 * Jeśli twoje IDs/names nie matchują żadnego — zobacz console.log w renderBrawlerCards
 * i dodaj brakujące warianty (lub wyślij brawlers.ts zeby Claude wygenerował exact match).
 */
const DAMAGE_DISPLAY: Record<string, number> = {
    // Lowercase (Polish IDs as Claude assumed)
    twardy:   1,   pancerny: 1.5, zwiad:    0.8, snajper:  3,
    tech:     1.2, ogniarz:  0.5, shadow:   1.5, king:     2,
    // Capitalized
    Twardy:   1,   Pancerny: 1.5, Zwiad:    0.8, Snajper:  3,
    Tech:     1.2, Ogniarz:  0.5, Shadow:   1.5, King:     2,
    // UPPERCASE
    TWARDY:   1,   PANCERNY: 1.5, ZWIAD:    0.8, SNAJPER:  3,
    TECH:     1.2, OGNIARZ:  0.5, SHADOW:   1.5, KING:     2,
    // English variants (jesli IDs sa po angielsku)
    hardy:    1,   armor:    1.5, scout:    0.8, sniper:   3,
    fire:     0.5,
};

/**
 * Lookup damage display value (Runda 1.9 fix — case-insensitive z fallbackiem).
 * Tries: b.id (raw) → b.id lowercase → b.name lowercase.
 * Returns '-' if no match (NOT b.reload — bo to absolute damage value w niektorych configach).
 */
function lookupDamage(b: BrawlerForPicker): number | string {
    if (DAMAGE_DISPLAY[b.id] !== undefined) return DAMAGE_DISPLAY[b.id];
    const idLower = b.id?.toLowerCase();
    if (idLower && DAMAGE_DISPLAY[idLower] !== undefined) return DAMAGE_DISPLAY[idLower];
    const nameLower = b.name?.toLowerCase();
    if (nameLower && DAMAGE_DISPLAY[nameLower] !== undefined) return DAMAGE_DISPLAY[nameLower];
    return '-';
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
    }

    unmount(): void {
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

        // DEBUG (Runda 1.10): wyswietl IDs zeby Mariusz mogl zweryfikowac mapping
        if (typeof console !== 'undefined') {
            console.log('[BrawlerPicker DEBUG] Brawler IDs from config:',
                brawlers.map(b => ({ id: b.id, name: b.name, mappedDamage: lookupDamage(b) }))
            );
        }

        return brawlers.map(b => {
            // Stats: zgodnie ze stary projektem — display values per Mariusz spec (Runda 1.7)
            const hp = b.hp ?? '-';
            const speed = b.speed ?? '-';
            // Case-insensitive lookup z fallbackiem na name (Runda 1.9 fix — niektore IDs maja inny case)
            const damage = lookupDamage(b);

            // ALTERNATIVE render: icon path OR emoji fallback (NEVER both — Runda 1 fix)
            const visualHtml = b.icon
                ? `<img class="bt-brawler-card-icon" src="${b.icon}" alt="${b.name}" loading="lazy">`
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
                    <div class="bt-brawler-card-name"${nameBgStyle}>${namePrefix}${b.name}</div>
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