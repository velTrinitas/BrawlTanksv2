/**
 * MainMenu.ts — orchestrator dla wszystkich screens menu (FAZA 6c + 6d + 7b + 7c + 8a).
 *
 * State machine: zarzadza ktorym screenem jestesmy + transition pomiedzy.
 * Lifecycle: bootstrap() → show('intro') → on START →
 *            (if needsOnboarding) → show('identity') → onCreated → show('hub')
 *            (else) → show('hub')
 *            → on GRAJ → show('scenarioPicker') → on Next → show('brawlerPicker')
 *            → on Play → onGameRequested(config)
 *            → on USTAWIENIA → show('settings') → on Back → show('hub')
 *
 * v0.24.0 FAZA 8a update:
 * - Dorzucone 'settings' do ScreenId union
 * - createSettingsScreen() factory — SettingsScreen z onBack callback wracajacym do 'hub'
 *
 * v0.42.0 FAZA 8a hub-music expansion:
 * - start() → audio.startIntroMusic() (zaraz przed show('intro'))
 *   Autoplay-policy fallback handled w AudioSys (one-shot gesture listener)
 * - createIntroScreen onStartClick → audio.startHubMusic() PRZED show('hub'|'identity')
 *   Hub music gra przez wszystkie menu screens: identity → hub → pickers → settings
 * - Audio sterowane z poziomu orchestratora (MainMenu), nie ze screenów — clean separation
 */

import { IntroScreen } from './IntroScreen';
import { MainHub } from './MainHub';
import { ScenarioPicker } from './ScenarioPicker';
import { BrawlerPicker } from './BrawlerPicker';
import { IdentityScreen } from './IdentityScreen';
import { SettingsScreen } from './SettingsScreen';
import { sessionService, type LastSession } from '../services/SessionService';
import { ProfileService } from '../services/ProfileService';
import { GameConfigBuilder, type GameConfig, type DifficultyId } from '../types/GameConfig';
import type { ScenarioId } from '../types/Scenario';
import type { MapId } from '../types/MapType';
import { AudioSys } from '../audio/AudioSys';

// ============================================================
// Types
// ============================================================

export type ScreenId = 'intro' | 'identity' | 'hub' | 'scenarioPicker' | 'brawlerPicker' | 'settings';

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

    // === Public callbacks ===

    /**
     * Wywolane po pelnym ukonczeniu game setup flow (oba pickery).
     * FAZA 6e: consumer (main.ts) odpalra gre z tym configem.
     */
    onGameRequested: ((config: GameConfig) => void) | null = null;

    /**
     * Wywolane przy klik Continue card w hub.
     * Instant replay z ostatniej sesji.
     */
    onContinueRequested: ((lastSession: LastSession) => void) | null = null;

    /** Wywolane przy klik "JAK GRAC" w hub. FAZA 6e: pokaze instructionsScreen. */
    onHowToPlayRequested: (() => void) | null = null;

    /** Wywolane przy klik "USTAWIENIA" w hub. FAZA 8a: pokaze settings UI. */
    onSettingsRequested: (() => void) | null = null;

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

    /**
     * Bootstrap — pokaz intro screen. Wywolac raz przy starcie aplikacji.
     * v0.42.0: startuje intro music przed pokazaniem splash screen.
     * Autoplay-policy fallback handled w AudioSys (one-shot gesture listener).
     */
    async start(): Promise<void> {
        // v0.42.0: intro music start (best-effort; if blocked by autoplay policy,
        // AudioSys instala one-shot gesture listener i uruchomi na pierwszy klik/keydown)
        AudioSys.getInstance().startIntroMusic();

        await this.show('intro');
    }

    /** Pokazuje wybrany screen. Bezpieczne na concurrent calls. */
    async show(screenId: ScreenId): Promise<void> {
        if (this.isTransitioning) {
            console.warn(`[MainMenu] Transition in progress, ignoring show(${screenId})`);
            return;
        }
        if (this.currentScreenId === screenId) return;

        this.isTransitioning = true;

        try {
            // Fade out current
            if (this.currentScreen) {
                this.containerEl.classList.add('is-fading-out');
                await wait(180);
                this.currentScreen.unmount();
                this.containerEl.innerHTML = '';
                this.containerEl.classList.remove('is-fading-out');
            }

            // Mount new
            const screen = this.createScreen(screenId);
            screen.mount(this.containerEl);
            this.currentScreen = screen;
            this.currentScreenId = screenId;

            // Fade in
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

    /** Hide menu — dla integracji z main.ts gdy gra startuje. */
    hide(): void {
        this.rootEl.style.display = 'none';
    }

    /** Reshow ukryte menu (po game over → powrot do hub). */
    reshow(): void {
        this.rootEl.style.display = '';
    }

    /** Cleanup — destroy menu (np. unmount aplikacji). */
    destroy(): void {
        if (this.currentScreen) {
            this.currentScreen.unmount();
            this.currentScreen = null;
            this.currentScreenId = null;
        }
        this.containerEl.remove();
        this.rootEl.classList.remove('bt-menu', 'bt-menu-root');
    }

    /** Reset accumulated picker state — np. po game over chcemy fresh start. */
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
            default: {
                const _exhaustive: never = id;
                throw new Error(`[MainMenu] Unknown screen: ${_exhaustive}`);
            }
        }
    }

    private createIntroScreen(): IScreen {
        const screen = new IntroScreen();
        screen.onStartClick = () => {
            // v0.42.0: klik START = transition od intro music do hub music.
            // Hub music gra przez WSZYSTKIE pozostałe menu screens (identity → hub → pickers → settings).
            // startHubMusic() stopuje intro automatically (jeden music track w danym momencie).
            AudioSys.getInstance().startHubMusic();

            // FAZA 7b: on first launch, route to IdentityScreen before MainHub
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
                // After successful profile creation, navigate to MainHub
                this.show('hub');
            },
        });
        return screen;
    }

    private createMainHub(): IScreen {
        const hub = new MainHub();
        hub.lastSession = sessionService.getLastSession();

        // FAZA 7c: inject active profile dla welcome chip rendering
        hub.activeProfile = ProfileService.getActiveProfile();

        hub.onContinueClick = (session) => {
            this.onContinueRequested?.(session);
        };

        hub.onPlayClick = () => {
            // Navigate to scenario picker (start game setup flow)
            this.show('scenarioPicker');
        };

        hub.onHowToPlayClick = () => {
            this.onHowToPlayRequested?.();
        };

        hub.onSettingsClick = () => {
            this.onSettingsRequested?.();
        };

        return hub;
    }

    private createScenarioPicker(): IScreen {
        const picker = new ScenarioPicker();

        // State preservation: pre-fill with last selections
        picker.selectedScenario = this.lastScenarioSelection;
        picker.selectedMap = this.lastMapSelection;

        picker.onBack = () => {
            this.show('hub');
        };

        picker.onNext = (scenario, map) => {
            // Persist selections for state restoration
            this.lastScenarioSelection = scenario;
            this.lastMapSelection = map;
            this.show('brawlerPicker');
        };

        return picker;
    }

    private createBrawlerPicker(): IScreen {
        if (!this.lastScenarioSelection || !this.lastMapSelection) {
            // Defensive — shouldn't happen w normal flow
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
            // Persist mid-flow selections (allow user to come back)
            picker.selectedBrawlerId !== null && (this.lastBrawlerSelection = picker.selectedBrawlerId);
            this.lastDifficultySelection = picker.selectedDifficulty;

            this.show('scenarioPicker');
        };

        picker.onPlay = (brawlerId, difficulty) => {
            this.lastBrawlerSelection = brawlerId;
            this.lastDifficultySelection = difficulty;

            // FAZA 7c: hookup real profileId (was 'default' before)
            const activeProfileId = ProfileService.getActiveProfile()?.id ?? 'default';

            // Build immutable GameConfig
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
     * FAZA 8a: Settings screen factory.
     * onBack wraca do hub (najczestszy entry point — Settings dostepne z hub button).
     */
    private createSettingsScreen(): IScreen {
        const screen = new SettingsScreen();
        screen.onBack = () => {
            this.show('hub');
        };
        return screen;
    }
}