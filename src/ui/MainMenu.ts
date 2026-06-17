/**
 * MainMenu.ts — orchestrator dla wszystkich screens menu (FAZA 6c + 6d + 7b + 7c + 8a + 8b).
 *
 * Lifecycle: bootstrap() → show('intro') → on START →
 *            (if needsOnboarding) → show('identity') → onCreated → show('hub')
 *            (else) → show('hub')
 *            → on GRAJ → show('scenarioPicker') → on Next → show('brawlerPicker')
 *            → on Play → onGameRequested(config)
 *            → on USTAWIENIA → show('settings') → on Back → show('hub')
 *            → on EDYTUJ PROFIL → show('profileEdit') → on Back/Save → show('hub')
 *
 * v0.43.0 FAZA 8b ARCHITECTURAL FIX (kolega Mariusza discovery):
 * - Internal menu navigation używa DIRECT `this.show('profileEdit')` w factory methods,
 *   NIE external callback chain.
 * - Eliminacja 2 z 3 ogniw pipeline (no main.ts wire dependency dla profile edit).
 * - LEKCJA: External callback (onProfileEditRequested) wprowadzal silent skip ?.() 
 *   na każdym ogniwie — gdy main.ts wire failed, pipeline milczal bez błędu.
 * - Pattern dla menu navigation: BEZPOŚREDNI this.show() w factories.
 * - External callbacks (onGameRequested, onContinueRequested) zachowane TYLKO dla 
 *   cross-cutting events ktore main.ts MUSI obslugiwac (game lifecycle, PIXI scene).
 *
 * Property onProfileEditRequested zachowane jako optional dla future-proof (np. analytics),
 * ale NIE jest wymagane do dzialania profile edit flow.
 */

import { IntroScreen } from './IntroScreen';
import { MainHub } from './MainHub';
import { ScenarioPicker } from './ScenarioPicker';
import { BrawlerPicker } from './BrawlerPicker';
import { IdentityScreen } from './IdentityScreen';
import { SettingsScreen } from './SettingsScreen';
import { ProfileEditScreen } from './ProfileEditScreen';
import { sessionService, type LastSession } from '../services/SessionService';
import { ProfileService } from '../services/ProfileService';
import { GameConfigBuilder, type GameConfig, type DifficultyId } from '../types/GameConfig';
import type { ScenarioId } from '../types/Scenario';
import type { MapId } from '../types/MapType';
import { AudioSys } from '../audio/AudioSys';

// ============================================================
// Types
// ============================================================

export type ScreenId =
    | 'intro'
    | 'identity'
    | 'hub'
    | 'scenarioPicker'
    | 'brawlerPicker'
    | 'settings'
    | 'profileEdit';

export interface IScreen {
    mount(root: HTMLElement): void;
    unmount(): void;
    onShow?(): void;
}

// ============================================================
// MainMenu
// ============================================================

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class MainMenu {
    private rootEl: HTMLElement;
    private containerEl: HTMLElement;
    private currentScreen: IScreen | null = null;
    private currentScreenId: ScreenId | null = null;
    private isTransitioning: boolean = false;

    // === State preservation across pickers (FAZA 6d) ===
    private lastScenarioSelection: ScenarioId | null = null;
    private lastMapSelection: MapId | null = null;
    private lastBrawlerSelection: string | null = null;
    private lastDifficultySelection: DifficultyId = 'normal';

    // === Public callbacks (cross-cutting events tylko) ===

    /** Game start — main.ts laduje PIXI scene, init player, itd. Cross-cutting concern. */
    onGameRequested: ((config: GameConfig) => void) | null = null;

    /** Continue session — main.ts laduje istniejaca sesje. Cross-cutting concern. */
    onContinueRequested: ((lastSession: LastSession) => void) | null = null;

    /** Future: How-to-play modal (FAZA 8c). Cross-cutting concern. */
    onHowToPlayRequested: (() => void) | null = null;

    /**
     * Settings opened from hub.
     * v0.43.0: Mogłoby też być direct (`this.show('settings')`), ale zachowane
     * jako external callback dla backward compatibility z main.ts integration testami.
     */
    onSettingsRequested: (() => void) | null = null;

    /**
     * v0.43.0 FAZA 8b: optional, dla future-proof (np. analytics hook).
     * NIE jest wymagane do dzialania profile edit flow — MainMenu nawiguje direct.
     */
    onProfileEditRequested: (() => void) | null = null;

    constructor(rootSelector: string) {
        const el = document.querySelector<HTMLElement>(rootSelector);
        if (!el) {
            throw new Error(`[MainMenu] Root element not found: ${rootSelector}`);
        }
        this.rootEl = el;
        this.rootEl.classList.add('bt-menu', 'bt-menu-root');

        this.containerEl = document.createElement('div');
        this.containerEl.className = 'bt-screen-container';
        this.rootEl.appendChild(this.containerEl);
    }

    async start(): Promise<void> {
        AudioSys.getInstance().startIntroMusic();
        await this.show('intro');
    }

    async show(screenId: ScreenId): Promise<void> {
        if (this.isTransitioning) {
            console.warn(`[MainMenu] Transition in progress, ignoring show(${screenId})`);
            return;
        }
        if (this.currentScreenId === screenId) return;

        this.isTransitioning = true;

        try {
            if (this.currentScreen) {
                this.containerEl.classList.add('is-fading-out');
                await wait(180);
                this.currentScreen.unmount();
                this.containerEl.innerHTML = '';
                this.containerEl.classList.remove('is-fading-out');
            }

            const screen = this.createScreen(screenId);
            screen.mount(this.containerEl);
            this.currentScreen = screen;
            this.currentScreenId = screenId;

            this.containerEl.classList.add('is-fading-in');
            await wait(20);
            this.containerEl.classList.remove('is-fading-in');

            screen.onShow?.();
        } finally {
            this.isTransitioning = false;
        }
    }

    getCurrentScreenId(): ScreenId | null {
        return this.currentScreenId;
    }

    hide(): void {
        this.rootEl.style.display = 'none';
    }

    reshow(): void {
        this.rootEl.style.display = '';
    }

    destroy(): void {
        if (this.currentScreen) {
            this.currentScreen.unmount();
            this.currentScreen = null;
            this.currentScreenId = null;
        }
        this.containerEl.remove();
        this.rootEl.classList.remove('bt-menu', 'bt-menu-root');
    }

    resetPickerState(): void {
        this.lastScenarioSelection = null;
        this.lastMapSelection = null;
        this.lastBrawlerSelection = null;
        this.lastDifficultySelection = 'normal';
    }

    // === Internal: screen factory ===

    private createScreen(id: ScreenId): IScreen {
        switch (id) {
            case 'intro':
                return this.createIntroScreen();
            case 'identity':
                return this.createIdentityScreen();
            case 'hub':
                return this.createMainHub();
            case 'scenarioPicker':
                return this.createScenarioPicker();
            case 'brawlerPicker':
                return this.createBrawlerPicker();
            case 'settings':
                return this.createSettingsScreen();
            case 'profileEdit':
                return this.createProfileEditScreen();
            default: {
                const _exhaustive: never = id;
                throw new Error(`[MainMenu] Unknown screen: ${_exhaustive}`);
            }
        }
    }

    private createIntroScreen(): IScreen {
        const screen = new IntroScreen();
        screen.onStartClick = () => {
            AudioSys.getInstance().startHubMusic();

            if (ProfileService.needsOnboarding()) {
                this.show('identity');
            } else {
                this.show('hub');
            }
        };
        return screen;
    }

    private createIdentityScreen(): IScreen {
        const screen = new IdentityScreen({
            onProfileCreated: () => {
                this.show('hub');
            },
        });
        return screen;
    }

    private createMainHub(): IScreen {
        const hub = new MainHub();
        hub.lastSession = sessionService.getLastSession();
        hub.activeProfile = ProfileService.getActiveProfile();

        hub.onContinueClick = (session) => {
            this.onContinueRequested?.(session);
        };

        hub.onPlayClick = () => {
            this.show('scenarioPicker');
        };

        hub.onHowToPlayClick = () => {
            this.onHowToPlayRequested?.();
        };

        hub.onSettingsClick = () => {
            this.onSettingsRequested?.();
        };

        // v0.43.0 FAZA 8b ARCHITECTURAL FIX: direct navigation, no external callback chain.
        // Klik profile chip → bezposrednio show ProfileEditScreen (NIE czeka na main.ts wire).
        // onProfileEditRequested?.() wywolane optional dla future analytics hooks (no-op gdy null).
        hub.onProfileEditClick = () => {
            this.onProfileEditRequested?.(); // optional hook (analytics, telemetry)
            this.show('profileEdit');         // direct navigation — robust, no chain
        };

        return hub;
    }

    private createScenarioPicker(): IScreen {
        const picker = new ScenarioPicker();

        picker.selectedScenario = this.lastScenarioSelection;
        picker.selectedMap = this.lastMapSelection;

        picker.onBack = () => {
            this.show('hub');
        };

        picker.onNext = (scenario, map) => {
            this.lastScenarioSelection = scenario;
            this.lastMapSelection = map;
            this.show('brawlerPicker');
        };

        return picker;
    }

    private createBrawlerPicker(): IScreen {
        if (!this.lastScenarioSelection || !this.lastMapSelection) {
            console.warn('[MainMenu] BrawlerPicker without scenario+map, redirecting to scenario picker');
            this.show('scenarioPicker');
            throw new Error('[MainMenu] Cannot create BrawlerPicker without prior selections');
        }

        const picker = new BrawlerPicker({
            scenario: this.lastScenarioSelection,
            map: this.lastMapSelection,
            initialBrawler: this.lastBrawlerSelection ?? undefined,
            initialDifficulty: this.lastDifficultySelection,
        });

        picker.onBack = () => {
            picker.selectedBrawlerId !== null && (this.lastBrawlerSelection = picker.selectedBrawlerId);
            this.lastDifficultySelection = picker.selectedDifficulty;

            this.show('scenarioPicker');
        };

        picker.onPlay = (brawlerId, difficulty) => {
            this.lastBrawlerSelection = brawlerId;
            this.lastDifficultySelection = difficulty;

            const activeProfileId = ProfileService.getActiveProfile()?.id ?? 'default';

            const config = new GameConfigBuilder()
                .setScenario(this.lastScenarioSelection!)
                .setMap(this.lastMapSelection!)
                .setBrawlerId(brawlerId)
                .setDifficulty(difficulty)
                .setProfileId(activeProfileId)
                .build();

            console.log('[MainMenu] GameConfig built:', config);

            this.onGameRequested?.(config);
        };

        return picker;
    }

    /**
     * v0.43.0 FAZA 8b ARCHITECTURAL FIX: Settings → ProfileEdit direct navigation.
     * Eliminacja external callback chain — onProfileEditRequested był silent skip
     * gdy main.ts wire failed, co maskowalo cale 8b debug.
     */
    private createSettingsScreen(): IScreen {
        const screen = new SettingsScreen();
        screen.onBack = () => {
            this.show('hub');
        };
        // Direct navigation — eliminuje external callback chain.
        screen.onEditProfileClick = () => {
            this.onProfileEditRequested?.(); // optional hook (no-op gdy null)
            this.show('profileEdit');         // direct — gwarantowany efekt
        };
        return screen;
    }

    private createProfileEditScreen(): IScreen {
        const screen = new ProfileEditScreen();
        screen.onBack = () => {
            this.show('hub');
        };
        return screen;
    }
}