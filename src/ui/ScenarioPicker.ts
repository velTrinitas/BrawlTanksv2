/**
 * ScenarioPicker.ts — Ekran 1 game setup (FAZA 6d).
 *
 * Flow:
 * 1. Gracz widzi 4 scenariusze (KTB, CTF, Castle, STK locked)
 * 2. Klik KTB → pojawia sie mapa-section (slide-down + fade-in) z 4 mapami
 * 3. Klik CTF/Castle → ukrywa mapa-section, ustawia fixed mapId, enable Next
 * 4. Klik STK → toast "Wkrotce" (no-op selection)
 * 5. Klik Next → callback z (scenarioId, mapId)
 * 6. Klik Back → callback bez selekcji (MainMenu zachowa state przez constructor injection)
 *
 * State preservation (constructor inject z MainMenu):
 *   ScenarioPicker.selectedScenario = lastScenarioSelection
 *   ScenarioPicker.selectedMap      = lastMapSelection
 *   → po Back/forward gracz widzi swoje poprzednie wybory zaznaczone
 *
 * SFX: playUiClick() przy kazdej selekcji karty.
 */

import type { IScreen } from './MainMenu';
import { t } from '../i18n/i18n';
import { SCENARIO_CONFIGS, getOrderedScenarios, type ScenarioId } from '../types/Scenario';
import { MENU_MAP_CARDS, isPlayableMapId, type MapId, type MenuMapCardId } from '../types/MapType';
import { renderMapPreview } from './MapPreview';
import { renderScenarioPreview, type ScenarioPreviewId } from './ScenarioPreview';
import { showToast } from './toast';
import { playUiClick } from './uiSounds';

// ============================================================
// ScenarioPicker
// ============================================================

export class ScenarioPicker implements IScreen {
    private el: HTMLElement | null = null;

    // === State (set przez MainMenu przed mount) ===
    selectedScenario: ScenarioId | null = null;
    selectedMap: MapId | null = null;

    // === Callbacks ===
    onBack: (() => void) | null = null;
    /** Wywolane przy klik DALEJ — przekazuje finalne selekcje. */
    onNext: ((scenario: ScenarioId, map: MapId) => void) | null = null;

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
        root.className = 'bt-picker-screen bt-scenario-picker';

        root.innerHTML = `
            <div class="bt-hub-bg" aria-hidden="true"></div>
            <div class="bt-hub-overlay" aria-hidden="true"></div>

            <div class="bt-picker-content">
                <div class="bt-picker-header">
                    <h2 class="bt-picker-title">${t('picker.scenarioTitle')}</h2>
                    <div class="bt-step-indicator" role="progressbar" aria-valuenow="1" aria-valuemax="2">
                        <span class="step is-active" aria-label="${t('picker.step', { current: 1, total: 2 })}"></span>
                        <span class="step"></span>
                    </div>
                </div>

                <div class="bt-scenario-grid">
                    ${this.renderScenarioCards()}
                </div>

                <div class="bt-map-section is-hidden" data-role="map-section">
                    <h3 class="bt-picker-subtitle">${t('picker.mapTitle')}</h3>
                    <div class="bt-map-grid">
                        ${this.renderMapCards()}
                    </div>
                </div>

                <div class="bt-picker-footer">
                    <button class="bt-btn-secondary" type="button" data-action="back">
                        ← ${t('common.back')}
                    </button>
                    <button class="bt-btn-primary" type="button" data-action="next" disabled>
                        ${t('common.next')} →
                    </button>
                </div>
            </div>
        `;

        return root;
    }

    private renderScenarioCards(): string {
        return getOrderedScenarios().map(scenario => {
            const isLocked = !scenario.available;
            const lockedClass = isLocked ? ' is-locked' : '';

            // Runda 1.20: mapBadge usunięty per feedback Mariusza
            // (was: "Map: Fortified Ruins" / "Map: Castle Grounds")

            const lockOverlay = isLocked ? `
                <div class="bt-scenario-lock-overlay">
                    <span class="lock-icon" aria-hidden="true">🔒</span>
                    <span class="lock-badge">${scenario.comingSoonKey ? t(scenario.comingSoonKey) : t('common.locked')}</span>
                </div>
            ` : '';

            // Runda 1.27: thematic SVG background per scenario (KTB/CTF/Castle, NOT save_king which keeps sparkles)
            const SCENARIOS_WITH_SVG_PREVIEW: ScenarioPreviewId[] = ['ktb', 'ctf', 'castle'];
            const previewBg = SCENARIOS_WITH_SVG_PREVIEW.includes(scenario.id as ScenarioPreviewId)
                ? renderScenarioPreview(scenario.id as ScenarioPreviewId)
                : '';

            return `
                <button class="bt-scenario-card${lockedClass}"
                        type="button"
                        data-scenario-id="${scenario.id}"
                        style="--accent: ${scenario.color};"
                        ${isLocked ? 'aria-disabled="true"' : ''}>
                    <div class="bt-scenario-card-preview" aria-hidden="true">
                        ${previewBg}
                        <div class="bt-scenario-card-emoji">${scenario.emoji}</div>
                    </div>
                    <div class="bt-scenario-card-info">
                        <div class="bt-scenario-card-name">${t(scenario.nameKey)}</div>
                        <div class="bt-scenario-card-desc">${t(scenario.descKey)}</div>
                    </div>
                    ${lockOverlay}
                </button>
            `;
        }).join('');
    }

    private renderMapCards(): string {
        return MENU_MAP_CARDS.map(map => {
            const isLocked = !map.available;
            const lockedClass = isLocked ? ' is-locked' : '';

            const lockOverlay = isLocked ? `
                <div class="bt-map-lock-overlay">
                    <span class="lock-icon" aria-hidden="true">🔒</span>
                    <span class="lock-badge">${map.comingSoonKey ? t(map.comingSoonKey) : t('common.soon')}</span>
                </div>
            ` : '';

            return `
                <button class="bt-map-card${lockedClass}"
                        type="button"
                        data-map-id="${map.id}"
                        style="--accent: ${map.accentColor};"
                        ${isLocked ? 'aria-disabled="true"' : ''}>
                    <div class="bt-map-preview-wrap">
                        ${renderMapPreview(map.previewType)}
                        ${lockOverlay}
                    </div>
                    <div class="bt-map-card-info">
                        <h3 class="bt-map-card-name">${t(map.nameKey)}</h3>
                        <p class="bt-map-card-tagline">${t(map.taglineKey)}</p>
                    </div>
                </button>
            `;
        }).join('');
    }

    // === Internal: events ===

    private wireEvents(): void {
        if (!this.el) return;

        this.el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            // Footer buttons
            const action = target.closest<HTMLElement>('[data-action]');
            if (action) {
                this.handleFooterClick(action.dataset.action!);
                return;
            }

            // Scenario card
            const scenarioCard = target.closest<HTMLElement>('.bt-scenario-card');
            if (scenarioCard) {
                const id = scenarioCard.dataset.scenarioId as ScenarioId;
                this.handleScenarioClick(id, scenarioCard);
                return;
            }

            // Map card
            const mapCard = target.closest<HTMLElement>('.bt-map-card');
            if (mapCard) {
                const id = mapCard.dataset.mapId as MenuMapCardId;
                this.handleMapClick(id, mapCard);
                return;
            }
        });
    }

    private handleScenarioClick(id: ScenarioId, cardEl: HTMLElement): void {
        const scenario = SCENARIO_CONFIGS[id];

        // Locked → toast, no selection change
        if (!scenario.available) {
            showToast(t('settings.comingSoon'), 1800);
            return;
        }

        playUiClick();

        // Update selection
        this.selectedScenario = id;

        // Visual: deselect inne, select tę
        this.el?.querySelectorAll<HTMLElement>('.bt-scenario-card').forEach(c => {
            c.classList.toggle('is-selected', c === cardEl);
        });

        // Map handling:
        if (scenario.fixedMapId === null) {
            // KTB — pokaz mapa-section, gracz wybierze
            this.showMapSection();
        } else {
            // CTF / Castle / STK — fixed map, hide section
            this.hideMapSection();
            // Auto-select fixed map (cast as MapId — w obecnej fazie tylko KTB ma faktyczna playable mapa,
            // CTF/Castle uzywaja external HTML files → FAZA 6.5+ refactor)
            // Na razie zapisujemy 'desert' jako placeholder dla CTF/Castle (FAZA 6.5 podmieni na fortified_ruins itd.)
            this.selectedMap = 'desert'; // TEMP placeholder dla CTF/Castle
        }

        this.updateNextButton();
    }

    private handleMapClick(id: MenuMapCardId, cardEl: HTMLElement): void {
        const map = MENU_MAP_CARDS.find(m => m.id === id);
        if (!map || !map.available) {
            showToast(t('common.soon'), 1800);
            return;
        }

        if (!isPlayableMapId(id)) return;

        playUiClick();
        this.selectedMap = id;

        // Visual: deselect inne mapy, select tę
        this.el?.querySelectorAll<HTMLElement>('.bt-map-card').forEach(c => {
            c.classList.toggle('is-selected', c === cardEl);
        });

        this.updateNextButton();
    }

    private handleFooterClick(action: string): void {
        if (action === 'back') {
            this.onBack?.();
        } else if (action === 'next') {
            if (this.selectedScenario && this.selectedMap) {
                this.onNext?.(this.selectedScenario, this.selectedMap);
            }
        }
    }

    // === Internal: map section animation ===

    private showMapSection(): void {
        const section = this.el?.querySelector<HTMLElement>('[data-role="map-section"]');
        if (!section) return;
        section.classList.remove('is-hidden');
        // Force reflow before adding visible class — gwarantuje smooth transition
        void section.offsetHeight;
        section.classList.add('is-visible');

        // Runda 1.16 fix: po zakonczeniu slide-down animation, ustaw overflow: visible
        // zeby effects (gold glow + scale + drop shadow) selected map card nie byly clipowane
        // przez section's overflow:hidden (ktore jest wymagane DLA animacji max-height).
        const onTransitionEnd = (e: TransitionEvent) => {
            if (e.propertyName === 'max-height' && e.target === section) {
                section.classList.add('is-expanded');
                section.removeEventListener('transitionend', onTransitionEnd);
            }
        };
        section.addEventListener('transitionend', onTransitionEnd);
    }

    private hideMapSection(): void {
        const section = this.el?.querySelector<HTMLElement>('[data-role="map-section"]');
        if (!section) return;
        // Runda 1.16 fix: PIERWSZA usuwamy is-expanded (overflow → hidden ponownie)
        // zeby overflow chronil content podczas collapse animacji max-height.
        section.classList.remove('is-expanded');
        section.classList.remove('is-visible');
        // After transition end, fully hide
        setTimeout(() => {
            section.classList.add('is-hidden');
        }, 280);
    }

    // === Internal: initial state restoration ===

    private applyInitialSelections(): void {
        if (this.selectedScenario) {
            const card = this.el?.querySelector<HTMLElement>(
                `.bt-scenario-card[data-scenario-id="${this.selectedScenario}"]`
            );
            if (card && !card.classList.contains('is-locked')) {
                card.classList.add('is-selected');
                const scenario = SCENARIO_CONFIGS[this.selectedScenario];
                if (scenario.fixedMapId === null) {
                    // KTB — show map section immediately (no animation on restore)
                    const section = this.el?.querySelector<HTMLElement>('[data-role="map-section"]');
                    if (section) {
                        section.classList.remove('is-hidden');
                        section.classList.add('is-visible');
                        // Runda 1.16 fix: instant is-expanded bo nie ma animacji do czekania
                        section.classList.add('is-expanded');
                    }
                }
            }
        }

        if (this.selectedMap) {
            const mapCard = this.el?.querySelector<HTMLElement>(
                `.bt-map-card[data-map-id="${this.selectedMap}"]`
            );
            if (mapCard && !mapCard.classList.contains('is-locked')) {
                mapCard.classList.add('is-selected');
            }
        }

        this.updateNextButton();
    }

    private updateNextButton(): void {
        const nextBtn = this.el?.querySelector<HTMLButtonElement>('[data-action="next"]');
        if (!nextBtn) return;
        const isValid = !!(this.selectedScenario && this.selectedMap);
        nextBtn.disabled = !isValid;
    }
}