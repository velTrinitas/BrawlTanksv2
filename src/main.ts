import * as PIXI from 'pixi.js';
import './ui/menu-styles.css';  // FAZA 6.5.2b: CSS bundle dla MainMenu
import { WORLD_W, WORLD_H } from './config/constants';
import { BRAWLERS } from './config/brawlers';
import { getBrawlerTextures } from './rendering/SpriteFactory';
import type { Brawler } from './types/Brawler';
import {
    buildCityTexture, CITY_BUILDINGS_LAYOUT, CyberBuilding,
    MEDI_PAD_POSITIONS, POWER_PAD_POSITIONS,
    CITY_BILLBOARDS_LAYOUT, // v0.52.0
} from './maps/CityMap';
import { NeonBillboard } from './maps/city/NeonBillboard'; // v0.52.0
import {
    buildDesertTexture,
    DESERT_PYRAMID_LAYOUT,
    DESERT_MEDI_PAD_POSITIONS, DESERT_POWER_PAD_POSITIONS,
    DESERT_SPHINX_POSITION,
    DESERT_RIVER_PATH, DESERT_RIVER_WIDTH,
    DESERT_BRIDGE_COUNT, DESERT_BRIDGE_DECK_LENGTH, DESERT_BRIDGE_DECK_WIDTH,
    DESERT_LARGE_ROCKS_LAYOUT, DESERT_SMALL_ROCKS_COUNT,
    DESERT_SMALL_ROCK_MIN_SIZE, DESERT_SMALL_ROCK_MAX_SIZE,
    DESERT_QUICKSAND_LAYOUT,
    DESERT_RIVER_CATARACT_ROCKS,
    DESERT_OASIS_LAYOUT,
} from './maps/DesertMap';
import {
    buildTropicsTexture,
    TROPICS_MEDI_PAD_POSITIONS, TROPICS_POWER_PAD_POSITIONS,
    TROPICS_PATROL_WAYPOINTS,
    TROPICS_STABLE_LAYOUT,
    TROPICS_CORN_LAYOUT,
    TROPICS_DIRT_ROAD_PATHS,
    TROPICS_FARM_BUILDINGS_LAYOUT,
    TROPICS_HOUSES_LAYOUT,
    TROPICS_CRATES_LAYOUT,
    TROPICS_WINDMILL_POSITION,
    TROPICS_FARM_FIELDS_LAYOUT,
} from './maps/TropicsMap';
import {
    buildArcticTexture,
    ARCTIC_MEDI_PAD_POSITIONS, ARCTIC_POWER_PAD_POSITIONS,
} from './maps/ArcticMap'; // FAZA A (Arctic)
import { GlacialBorder } from './maps/arctic/GlacialBorder'; // FAZA A (Arctic)
import { CornField } from './maps/tropics/CornField';
import { SugarcaneField } from './maps/tropics/SugarcaneField';
import { LettuceField } from './maps/tropics/LettuceField';
import { PastureField } from './maps/tropics/PastureField';
import type { IFarmField } from './maps/tropics/IFarmField';
import { DirtRoad } from './maps/tropics/DirtRoad';
import { BarnBuilding } from './maps/tropics/BarnBuilding';
import { Henhouse } from './maps/tropics/Henhouse';
import { Cowshed } from './maps/tropics/Cowshed';
import { CountryHouse, PALETTE_TEAL, PALETTE_YELLOW, PALETTE_PINK, type CottagePalette } from './maps/tropics/CountryHouse';
import { Windmill } from './maps/tropics/Windmill';
import { PatrolTractor } from './maps/tropics/PatrolTractor';
import { Stable } from './maps/tropics/Stable';
import { Paddock } from './maps/tropics/Paddock';
import { Horse, type HorsePaletteType } from './maps/tropics/Horse';
import { TropicalBorder } from './maps/tropics/TropicalBorder';
import { CyberpunkBorder } from './maps/city/CyberpunkBorder'; // v0.52.0 fix #21
import { SludgeReactor } from './maps/city/SludgeReactor'; // v0.52.0 phase 2
import { AntiGravScrap } from './maps/city/AntiGravScrap'; // v0.53.0
import { HoloTurbine } from './maps/city/HoloTurbine'; // v0.54.0
import { AirTaxiStation } from './maps/city/AirTaxiStation'; // v0.55.0
import { PoliceStation } from './maps/city/PoliceStation';   // v0.55.0
import { SkyTraffic } from './maps/city/SkyTraffic'; // v0.56.0
import { SludgePool } from './maps/city/SludgePool'; // v0.59.0 Warstwa D
import { OldFactory } from './maps/city/OldFactory'; // v0.59.0
import { Parking } from './maps/city/Parking'; // v0.60.0 — parkingi (wypelniacze, passable)
import { GroundClutter } from './maps/city/GroundClutter'; // v0.60.0 — oleje + studzienki
import { NeonOasisStation } from './maps/city/NeonOasisStation'; // v0.60.0 stealth zone
import { Crate } from './entities/Crate';
import { Pyramid } from './maps/desert/Pyramid';
import { DesertHeartPad } from './maps/desert/DesertHeartPad';
import { CloverMediPad } from './maps/tropics/CloverMediPad';
import { StumpPowerPad } from './maps/tropics/StumpPowerPad';
import { DesertStormPad } from './maps/desert/DesertStormPad';
import { Sphinx } from './maps/desert/Sphinx';
import { RiverNile } from './maps/desert/RiverNile';
import { Bridge } from './maps/desert/Bridge';
import { WaterLife } from './maps/desert/WaterLife';
import { Rock } from './maps/desert/Rock';
import { SandstormBorder } from './maps/desert/SandstormBorder';
import { Quicksand } from './maps/desert/Quicksand';
import { Oasis } from './maps/desert/Oasis';
import { Caravan } from './maps/desert/Caravan';
import { MAP_CONFIGS, type ICollidable } from './types/MapType';
import { Player } from './entities/Player';
import { Enemy } from './entities/Enemy';
import { ENEMY_PURSUIT } from './config/enemies'; // v0.58.0 Warstwa C2
import { Bullet } from './entities/Bullet';
import { EnemyBullet } from './entities/EnemyBullet';
import { Heart } from './entities/pickups/Heart';
import { Gem } from './entities/pickups/Gem';
import { Magnet } from './entities/pickups/Magnet';
import { PowerCube } from './entities/pickups/PowerCube'; // v0.44.0 FAZA 8.6
import { HoverRepairPad } from './maps/HoverRepairPad';
import { PowerHoverPad } from './maps/PowerHoverPad';
import { HUD } from './rendering/HUD';
import { EffectsManager } from './rendering/Effects';
import { SpawnSystem } from './systems/Spawn';
import { PowerSystem } from './systems/PowerSystem';
import { PICKUP_CONFIG, MEGA_BOMB_CONFIG, POWERS } from './config/powers';
import { AudioSys } from './audio/AudioSys';

// === FAZA 6.5.1: Config + Session architecture ===
import { GameConfigBuilder, describeGameConfig, type GameConfig } from './types/GameConfig';
import {
    GameSession,
    MAX_POWERCUBES_PER_MATCH,
    POWERCUBE_HP_BONUS_PER_PICKUP,
} from './services/GameSession';
import { scoreService } from './services/ScoreService';
import { sessionService, type LastSession } from './services/SessionService';
import { SCENARIO_CONFIGS } from './types/Scenario';
import { t, i18n } from './i18n/i18n';

// === v0.50.0 Difficulty Balance v1: per-difficulty enemy stats + spawn config ===
import { getDifficultyModifiers } from './config/difficulty';

// === FAZA 6.5.2b: MainMenu jako bootstrap entry point ===
import { MainMenu } from './ui/MainMenu';
import { showToast } from './ui/toast';

// === FAZA 7a: Profile system foundation ===
import { ProfileSpriteCache } from './rendering/profile/ProfileSpriteCache';
import { ProfileService } from './services/ProfileService';

// === FAZA 9b.3a: cloud profile sync (push aktywny profil -> oproznia kolejke scores) ===
import { syncActiveProfileToCloud } from './services/profileSync';

// === FAZA 8.5: Mobile touch controls ===
import { TouchInputManager } from './input/TouchInputManager';

const GEMS_PER_SUPER_CHARGE_TRIGGER = 10;
const SUPER_CHARGES_PER_TRIGGER = 3;
const COMBO_WINDOW_MS = 2000;

const OASIS_STEALTH_DURATION_MS = 10000;

// v0.23.1: world zoom dla mobile (kompensuje smaller screen + zwieksza viewable area)
const MOBILE_WORLD_ZOOM = 0.7;
const DESKTOP_WORLD_ZOOM = 1.0;

// v0.44.0 FAZA 8.6: PowerCube drop chance dla regular enemies
// Boss = 100% gwarantowany cube (jesli pod capem MAX_POWERCUBES_PER_MATCH)
const POWERCUBE_REGULAR_DROP_CHANCE = 0.30;

// ============================================================
// v0.45.0 FAZA 8.7 — HIT-STOP CONSTANTS
// ============================================================
//
// Hit-stop = frame freeze technique. Po krytycznym hicie, game ticker
// robi early return przez N klatek — całość zamarza (ruch, AI, particles,
// bullets, effects). Daje "weight" i satisfaction.
//
// Audio NIE pauzuje (dźwięki płyną naturalnie z poza ticker callback).
// Camera shake "freezes" razem (część ticker), ale to OK — wygląda jak
// emfaza ciężaru hitu.
//
// Triggery (priority: większa wartość wygrywa — `if (frames > current)`):
// - Mega boss DEATH: 8 frames (~130ms @ 60fps) — finale payoff
// - Super shot KILL: 4 frames (~65ms) — power moment
// - Mega boss HIT (alive, damage applied): 3 frames (~50ms) — solid thud
//
const HITSTOP_MEGA_BOSS_DEATH = 8;
const HITSTOP_SUPER_SHOT_KILL = 4;
const HITSTOP_MEGA_BOSS_HIT = 3;

let gameState: 'MENU' | 'PLAYING' | 'VICTORY' | 'GAMEOVER' = 'MENU';

// === FAZA 6.5.1: Single source of truth dla aktualnej rozgrywki ===
let currentSession: GameSession | null = null;

let player: Player | null = null;
let enemies: Enemy[] = [];
let bullets: Bullet[] = [];
let enemyBullets: EnemyBullet[] = [];
let hearts: Heart[] = [];
let gems: Gem[] = [];
let magnets: Magnet[] = [];
let powerCubes: PowerCube[] = []; // v0.44.0 FAZA 8.6
let mediPads: Array<HoverRepairPad | DesertHeartPad | CloverMediPad> = [];
let powerPads: Array<PowerHoverPad | DesertStormPad | StumpPowerPad> = [];
let river: RiverNile | null = null;
let bridges: Bridge[] = [];
let waterLife: WaterLife | null = null;
let smallRocks: Rock[] = [];
let sandstormBorder: SandstormBorder | null = null;
let tropicalBorder: TropicalBorder | null = null;
let cyberpunkBorder: CyberpunkBorder | null = null; // v0.52.0 fix #21
let glacialBorder: GlacialBorder | null = null; // FAZA A (Arctic)
let patrolTractor: PatrolTractor | null = null;
let stable: Stable | null = null;
let paddock: Paddock | null = null;
let horses: Horse[] = [];
let quicksands: Quicksand[] = [];
let oases: Oasis[] = [];
let farmFields: IFarmField[] = [];
let caravan: Caravan | null = null;

// v0.52.0 Cyberpunk Map Visual Upgrade #1: neon billboardy na dachach
let cityBillboards: NeonBillboard[] = [];

// v0.52.0 phase 2: SludgeReactor instances (industrial decor + cover)
let sludgeReactors: SludgeReactor[] = [];
let ecoCrimeActive = false; // v0.57.0 — alarm krytyczny reaktora (hook dla C2 spawn)
let pursuitSpawned = false; // v0.58.0 Warstwa C2 — woz poscigowy spawniony (jednorazowo per match)

// v0.53.0: AntiGravScrap instances (levitating scrap cover + junkyard barrier)
let antiGravScraps: AntiGravScrap[] = [];
let holoTurbines: HoloTurbine[] = []; // v0.54.0
let airTaxiStation: AirTaxiStation | null = null; // v0.55.0
let bottomTaxiStations: AirTaxiStation[] = []; // v0.60.0 — dolne stacje single-stand (niekolizyjne)
let policeStation: PoliceStation | null = null;   // v0.55.0
let skyTraffic: SkyTraffic | null = null; // v0.56.0
let oldFactory: OldFactory | null = null; // v0.59.0 — stara fabryka z kominem
let sludgePools: SludgePool[] = []; // v0.59.0 Warstwa D — toksyczne rozlewiska (slow zone)
let parkings: Parking[] = []; // v0.60.0 — parkingi (niekolizyjne dekoracje)
let groundClutter: GroundClutter | null = null; // v0.60.0 — wypelniacze tla (passable)
let neonStations: NeonOasisStation[] = []; // v0.60.0 — cyberpunk stealth (kriogeniczna myjnia)

let oasisStealthEndTime: number = 0;
let wasInOasisLastFrame: boolean = false;
let wasInCornLastFrame: boolean = false;
let wasInNeonLastFrame: boolean = false; // v0.60.0 — stealth NEON-OASIS
let neonDidShootLastFrame = false; // v0.60.0 TIER 3 — strzal z poprzedniej klatki (panika drona)
let wasStealthActiveLastFrame: boolean = false;
// v0.50.1 fix: track czy ostatnie zerwanie stealth bylo wynikiem strzalu (anti-cheese Michala).
// Strzal ze strefy stealth = natychmiastowe wykrycie. Flag pozwala pokazac inny komunikat HUD.
let stealthBrokenByShot: boolean = false;
let sandKickFrameCounter: number = 0;

// v0.45.0 FAZA 8.7: hit-stop frame counter. Gdy > 0, ticker robi early return.
let hitStopFramesRemaining: number = 0;

let buildings: ICollidable[] = [];
let solidBuildings: ICollidable[] = [];
let crates: Crate[] = [];
let effects: EffectsManager | null = null;
let spawnSystem: SpawnSystem | null = null;
let powerSystem: PowerSystem | null = null;
let camera = { x: 0, y: 0 };

const keys = { w: false, a: false, s: false, d: false };
const mouse = { screenX: window.innerWidth / 2, screenY: window.innerHeight / 2 };
let lastShotTime = 0;
let isMouseDown = false;

const audio = AudioSys.getInstance();

const app = new PIXI.Application({
    resizeTo: window,
    backgroundColor: 0x14141e,
    antialias: true,
});
document.body.appendChild(app.view as HTMLCanvasElement);
(app.view as HTMLCanvasElement).style.position = 'absolute';
(app.view as HTMLCanvasElement).style.zIndex = '1';

const worldContainer = new PIXI.Container();
worldContainer.sortableChildren = true;
app.stage.addChild(worldContainer);

const hud = new HUD('hudCanvas');

const menu = new MainMenu('#bt-menu-root');

const touchManager = new TouchInputManager();
touchManager.init();
touchManager.onSuperRequested = () => {
    tryActivateSuper();
};
touchManager.onCycleRequested = () => {
    if (powerSystem) {
        powerSystem.cycleSelected(1);
    }
};

if (touchManager.isActive) {
    hud.uiScale = 0.7;
    hud.showCrosshair = true;
    hud.crosshairScale = 1.5;
    hud.showPowerBar = false;
}

menu.onGameRequested = (config: GameConfig) => {
    if (config.scenario === 'ctf' || config.scenario === 'castle') {
        showToast(t('settings.comingSoon'), 2500);
        console.log('[Menu] Game start blocked - scenario not yet implemented:', config.scenario);
        return;
    }
    menu.hide();
    startGame(config);
};

menu.onContinueRequested = (lastSession: LastSession) => {
    if (lastSession.scenario === 'ctf' || lastSession.scenario === 'castle') {
        showToast(t('settings.comingSoon'), 2500);
        console.log('[Menu] Continue blocked - scenario not yet implemented:', lastSession.scenario);
        return;
    }
    const config = new GameConfigBuilder()
        .setScenario(lastSession.scenario)
        .setMap(lastSession.map)
        .setDifficulty(lastSession.difficulty)
        .setBrawlerId(lastSession.brawlerId)
        .setMode(lastSession.mode)
        .setProfileId(ProfileService.getActiveProfile()?.id ?? 'default')
        .build();
    menu.hide();
    startGame(config);
};

menu.onHowToPlayRequested = () => {
    console.log('[Menu] HowToPlay requested (FAZA 8c will implement)');
};

menu.onSettingsRequested = () => {
    menu.show('settings');
};

menu.onProfileEditRequested = () => {
    menu.show('profileEdit');
};

(async () => {
    try {
        await ProfileSpriteCache.init(app);
        console.log('[boot] ProfileSpriteCache ready (4 avatars + 4 flags cached)');

        const profile = ProfileService.getActiveProfile();
        if (profile) {
            console.log(`[boot] Active profile: ${profile.avatarId} (flag=${profile.flagId})`);

            if (profile.language && profile.language !== i18n.getLanguage()) {
                console.log(`[boot] Syncing i18n to profile language: ${profile.language}`);
                i18n.setLanguage(profile.language);
            }
        } else {
            console.log('[boot] No active profile — onboarding triggers in FAZA 7b');
        }
    } catch (e) {
        console.error('[boot] ProfileSpriteCache init failed — avatars unavailable:', e);
    }

    // FAZA 9b.3a: wypchnij aktywny profil do chmury (fire-and-forget, nie blokuje boota).
    // Profil w bazie -> FK scores.profile_id spelniony -> oproznia kolejke offline z 9b.2.
    void syncActiveProfileToCloud();

    menu.start();
})();

if (import.meta.env.DEV) {
    (window as unknown as { BT_DEV: unknown }).BT_DEV = {
        ProfileService,
        ProfileSpriteCache,
        AudioSys,
        i18n,
    };
    console.log('[FAZA 7a/8a/8b] window.BT_DEV attached — use for smoke testing');
}

async function tryLockLandscape(): Promise<void> {
    try {
        const orient = (screen as Screen & { orientation?: { lock?: (orientation: string) => Promise<void> } }).orientation;
        if (orient?.lock) {
            await orient.lock('landscape');
            console.log('[v0.23.1] screen.orientation locked to landscape');
        }
    } catch {
        // Silently fail
    }
}

function returnToMenuFromEnd(): void {
    document.getElementById('victoryScreen')!.classList.remove('active-screen');
    document.getElementById('gameOverScreen')!.classList.remove('active-screen');
    document.body.classList.remove('game-cursor-hidden');
    gameState = 'MENU';
    currentSession = null;

    touchManager.hide();

    audio.startHubMusic();

    menu.reshow();
    menu.show('hub');
}

document.getElementById('playAgainBtn')!.addEventListener('click', returnToMenuFromEnd);
document.getElementById('retryBtn')!.addEventListener('click', returnToMenuFromEnd);

function tryActivateSuper(): void {
    if (gameState !== 'PLAYING' || !powerSystem || !player || !effects || !currentSession) return;

    const result = powerSystem.activate(player, enemies);
    if (!result.activated) return;

    currentSession.superPowersUsed++;

    if (result.powerId === 'aura') {
        hud.addNotif(t('hud.shieldActive'), '#ffdd00');
        effects.shake(4, 6);
        audio.playSuperActivate('aura');
    } else if (result.powerId === 'megaBomb' && result.megaBombTargets) {
        effects.spawnMegaBomb(player.x, player.y);
        hud.addNotif(t('hud.megaBombHit', { count: result.megaBombTargets.length }), '#ff4400');
        audio.playSuperActivate('megaBomb');

        // v0.50.0 Scoring v2.1: track ile zabilo + sum base values dla multi-kill bonus.
        let multiKillCount = 0;
        let multiKillSumBase = 0;

        for (const enemy of result.megaBombTargets) {
            // v0.50.0 Scoring v2.1: snapshot frozen state PRZED takeDamage (na wszelki wypadek).
            const wasFrozen = Date.now() < enemy.frozenUntil;
            const killed = enemy.takeDamage(MEGA_BOMB_CONFIG.damage, enemy.x, enemy.y, worldContainer, effects);
            if (killed) {
                spawnSystem!.registerKill(enemy);
                // v0.49.0 Scoring v2: mega bomba NIE wola registerKill na GameSession (AOE != skill streak),
                // ale jesli combo bylo aktywne z poprzedniego bullet killa, mnoznik nadal dziala.
                currentSession.addKillScore(enemy.scoreValue);

                // v0.50.0 Scoring v2.1: frozen kill bonus jezeli enemy byl zamrozony.
                if (wasFrozen) {
                    currentSession.addFrozenKillBonus(enemy.scoreValue);
                }

                multiKillCount++;
                multiKillSumBase += enemy.scoreValue;

                handleEnemyDrop(enemy); // v0.44.0 FAZA 8.6
                if (enemy.isMegaBoss) setTimeout(() => triggerVictory(), 800);
            }
        }

        // v0.50.0 Scoring v2.1: multi-kill bonus jezeli zabilo >=3 wrogow w tej bombie.
        if (multiKillCount >= 3) {
            currentSession.addMultiKillBonus(multiKillSumBase, multiKillCount);
            hud.addNotif(t('hud.multiKill', { count: multiKillCount }), '#ff8800');
        }
    } else if (result.powerId === 'freeze' && result.freezeUntil !== undefined) {
        for (const enemy of enemies) {
            if (enemy.active) enemy.freeze(result.freezeUntil);
        }
        effects.spawnFreezeOverlay(300);
        hud.addNotif(t('hud.freezeAll'), '#66ddff');
        effects.shake(3, 8);
        audio.playSuperActivate('freeze');
    }
}

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k in keys) (keys as any)[k] = true;
    if (e.code === 'Space') {
        e.preventDefault();
        tryActivateSuper();
    }
    if (k === 'm') {
        const nowMuted = audio.toggleMute();
        hud.addNotif(nowMuted ? t('hud.muted') : t('hud.unmuted'), '#aaaaaa');
    }
});
window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k in keys) (keys as any)[k] = false;
});

(app.view as HTMLCanvasElement).addEventListener('pointermove', (e: any) => {
    mouse.screenX = e.clientX;
    mouse.screenY = e.clientY;
});

(app.view as HTMLCanvasElement).addEventListener('pointerdown', (e: any) => {
    if (touchManager.isActive) return;
    if (e.button === 0) isMouseDown = true;
});
(app.view as HTMLCanvasElement).addEventListener('pointerup', () => {
    if (touchManager.isActive) return;
    isMouseDown = false;
});
(app.view as HTMLCanvasElement).addEventListener('pointerupoutside' as any, () => {
    if (touchManager.isActive) return;
    isMouseDown = false;
});

(app.view as HTMLCanvasElement).addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    tryActivateSuper();
});

(app.view as HTMLCanvasElement).addEventListener('wheel', (e: any) => {
    if (gameState !== 'PLAYING' || !powerSystem) return;
    e.preventDefault();
    const direction = e.deltaY > 0 ? 1 : -1;
    powerSystem.cycleSelected(direction);
}, { passive: false });

function spawnEnemyShot(shot: import('./entities/Enemy').EnemyShotInfo): void {
    const half = (shot.burstCount - 1) / 2;
    for (let i = 0; i < shot.burstCount; i++) {
        const offsetAngle = shot.burstCount > 1
            ? (i - half) * (shot.burstSpread / Math.max(1, shot.burstCount - 1))
            : 0;
        enemyBullets.push(new EnemyBullet(
            shot.x, shot.y, shot.angle + offsetAngle,
            shot.speed, shot.dmg, shot.color, worldContainer,
        ));
    }
}

function dropGems(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
        gems.push(new Gem(x, y, worldContainer));
    }
}

/**
 * v0.57.0 Warstwa C1 — alarm po przegrzaniu reaktora (5 trafien).
 * Wolany przez reactor1.onCritical (latch w SludgeReactor — odpala sie RAZ).
 * Ustawia ecoCrimeActive (hook dla C2: spawn wozu poscigowego).
 *
 * UWAGA sygnatury (zgodne z reszta main.ts):
 *   - hud.addNotif(text, cssColor) — kolor to STRING hex (np. '#ff2a1a'), nie number.
 *   - effects: EffectsManager | null — guard bo callback leci spoza tickera.
 */
function triggerEcoCrimeAlarm(): void {
    if (ecoCrimeActive) return; // bezpiecznik — reaktor i tak latchuje, ale na wszelki wypadek
    ecoCrimeActive = true;
    hud.addNotif(t('reactor.ecoCrime'), '#ff2a1a'); // czerwony alarm
    if (effects) effects.shake(14, 30);             // mocny wstrzas
}

/**
 * v0.45.0 FAZA 8.7: trigger hit-stop frame freeze.
 *
 * @param frames — ile klatek pauzy (3=mega boss hit, 4=super shot kill, 8=mega boss death)
 *
 * Override logic: tylko jeśli przychodzi większa wartość (mega boss death 8 wins
 * nad super shot kill 4). Bez sumowania — single super shot zabija 5 wrogów =
 * max 4 frames (nie 5×4).
 */
function triggerHitStop(frames: number): void {
    if (frames > hitStopFramesRemaining) {
        hitStopFramesRemaining = frames;
    }
}

/**
 * v0.44.0 FAZA 8.6: handle enemy drop — cube vs gems decision logic (port z v4.48).
 *
 * - Megaboss: tylko gemy (i tak victory, cube nieprzyda się)
 * - Boss: pełna pula gemów + gwarantowany cube (jeśli pod capem MAX_POWERCUBES_PER_MATCH)
 * - Regular: 30% cube / 70% gem (lub 100% gem jeśli cap reached)
 */
function handleEnemyDrop(enemy: Enemy): void {
    if (!currentSession) return;

    const canSpawnCube = currentSession.cubesTotal < MAX_POWERCUBES_PER_MATCH;

    if (enemy.isMegaBoss) {
        dropGems(enemy.x, enemy.y, enemy.getGemDropCount());
        return;
    }

    if (enemy.isBoss) {
        dropGems(enemy.x, enemy.y, enemy.getGemDropCount());
        if (canSpawnCube) {
            powerCubes.push(new PowerCube(enemy.x + 20, enemy.y, worldContainer));
        }
        return;
    }

    // Regular enemy
    if (canSpawnCube && Math.random() < POWERCUBE_REGULAR_DROP_CHANCE) {
        powerCubes.push(new PowerCube(enemy.x, enemy.y, worldContainer));
    } else {
        dropGems(enemy.x, enemy.y, enemy.getGemDropCount());
    }
}

/**
 * v0.44.0 FAZA 8.6: attach onCubeStolen callback do nowo zespawnowanego enemy.
 * Wywolywany gdy enemy kradnie cube -> spawn FloatingText "Cube skradziony!".
 */
function attachEnemyCubeStolenCallback(enemy: Enemy): void {
    enemy.onCubeStolen = (cubeX: number, cubeY: number) => {
        if (effects) {
            effects.spawnFloatingText(cubeX, cubeY - 20, t('pickup.cubeStolen'), 0xff8c00);
        }
    };
}

function startGame(config: GameConfig): void {
    document.getElementById('victoryScreen')!.classList.remove('active-screen');
    document.getElementById('gameOverScreen')!.classList.remove('active-screen');
    document.body.classList.add('game-cursor-hidden');

    currentSession = new GameSession(config);

    ProfileService.recordSessionStart();

    console.log(describeGameConfig(config));

    const brawlerForDisplay = BRAWLERS.find(b => b.id === config.brawlerId) ?? BRAWLERS[0];
    sessionService.saveLastSession({
        brawlerId: config.brawlerId,
        scenario: config.scenario,
        map: config.map,
        difficulty: config.difficulty,
        mode: config.mode,
        lastPlayedAt: Date.now(),
        brawlerName: brawlerForDisplay.name,
        mapName: MAP_CONFIGS[config.map].name,
        scenarioName: t(SCENARIO_CONFIGS[config.scenario].nameKey),
    });

    worldContainer.removeChildren();
    buildings = [];
    solidBuildings = [];
    crates = [];
    river = null;
    bridges = [];
    waterLife = null;
    smallRocks = [];
    sandstormBorder = null;
    tropicalBorder = null;
    cyberpunkBorder = null; // v0.52.0 fix #21
    glacialBorder = null; // FAZA A (Arctic)
    patrolTractor = null;
    stable = null;
    paddock = null;
    horses = [];
    quicksands = [];
    oases = [];
    farmFields = [];
    caravan = null;
    cityBillboards = []; // v0.52.0
    sludgeReactors = []; // v0.52.0 phase 2
    ecoCrimeActive = false; // v0.57.0 — reset alarmu per match
    pursuitSpawned = false; // v0.58.0 — reset spawnu wozu per match

    antiGravScraps = []; // v0.53.0
    holoTurbines = []; // v0.54.0
    airTaxiStation = null; // v0.55.0
    for (const bts of bottomTaxiStations) bts.destroy(); // v0.60.0
        bottomTaxiStations = [];
    skyTraffic?.destroy(); // v0.56.0
    skyTraffic = null;
    policeStation = null;  // v0.55.0
    for (const sp of sludgePools) sp.destroy(); // v0.59.0
    sludgePools = [];
    for (const pk of parkings) pk.destroy(); // v0.60.0
    parkings = [];
    
    groundClutter?.destroy(); // v0.60.0
    groundClutter = null;

    oldFactory = null; // v0.59.0

    for (const ns of neonStations) ns.destroy(); // v0.60.0
    neonStations = [];
    for (const ns of neonStations) {
            ns.onCanCrushed = (ccx, ccy) => {
                if (effects) effects.spawnEnemyHitSparks(ccx, ccy, 0x39ff8a);
                audio.playHit('enemy'); // reuse — chrupniecie puszki
            };
        }

    oasisStealthEndTime = 0;
    wasInOasisLastFrame = false;
    wasInCornLastFrame = false;
    wasStealthActiveLastFrame = false;
    neonDidShootLastFrame = false; // v0.60.0
    stealthBrokenByShot = false; // v0.50.1
    sandKickFrameCounter = 0;
    hitStopFramesRemaining = 0; // v0.45.0 FAZA 8.7 reset

    const worldZoom = touchManager.isActive ? MOBILE_WORLD_ZOOM : DESKTOP_WORLD_ZOOM;
    worldContainer.scale.set(worldZoom);

    if (config.map === 'city') {
        const cityTex = buildCityTexture();
        const citySprite = new PIXI.Sprite(cityTex);
        citySprite.zIndex = -100;
        worldContainer.addChild(citySprite);

        CITY_BUILDINGS_LAYOUT.forEach(b => {
            const cb = new CyberBuilding(b[0], b[1], b[2], b[3], b[4], b[5], worldContainer);
            buildings.push(cb);
            solidBuildings.push(cb);
        });

        // v0.52.0 fix #21: cyberpunk border (ograniczenie wyjazdu z mapy + neon visual)
        cyberpunkBorder = new CyberpunkBorder(WORLD_W, WORLD_H, worldContainer);
        buildings.push(...cyberpunkBorder.getCollisionRects());
        solidBuildings.push(...cyberpunkBorder.getCollisionRects());

        // v0.52.0 phase 2: SludgeReactor — 1 sztuka na H1 corridor (środek mapy, max exposure)
        // Niezniszczalny industrial decor + solid cover. Bulgocze passive, EXCITED gdy gracz w 200px,
        // HIT flash + steam burst + "PRESSURE SPIKE" holo na trafienie pociskiem.
        const reactor1 = new SludgeReactor(960, 760, worldContainer);
        buildings.push(reactor1);
        solidBuildings.push(reactor1);
        sludgeReactors.push(reactor1);
        reactor1.onCritical = () => triggerEcoCrimeAlarm(); // v0.57.0 Warstwa C1
        
        // v0.53.0: AntiGravScrap — 2 lewitujace zlepy zlomu flankujace reaktor (zapora + junkyard).
        // Solid cover (buildings + solidBuildings). Bob + electric arcs + detach sparks.
        const scrapA = new AntiGravScrap(2180, 530, worldContainer);
        buildings.push(scrapA);
        solidBuildings.push(scrapA);
        antiGravScraps.push(scrapA);

        const scrapB = new AntiGravScrap(2380, 1500, worldContainer);
        buildings.push(scrapB);
        solidBuildings.push(scrapB);
        antiGravScraps.push(scrapB);

        // v0.54.0: HoloTurbine — 2 turbiny chlodzace z glitchujacym holo, lewa strona (1 gora / 1 dol).
        // Solid cover (obudowa). Dual hitbox: obudowa=iskry+block, hologram=glitch pass-through.
        const turbineA = new HoloTurbine(170, 530, worldContainer);   // LEWA GORA
        buildings.push(turbineA);
        solidBuildings.push(turbineA);
        holoTurbines.push(turbineA);

        const turbineB = new HoloTurbine(170, 2000, worldContainer);  // LEWA DOL
        buildings.push(turbineB);
        solidBuildings.push(turbineB);
        holoTurbines.push(turbineB);

        // v0.54.2: +3 HoloTurbine przy narozach (dolny-lewy, gorny-prawy, dolny-prawy)
        const turbineC = new HoloTurbine(500, 2500, worldContainer);   // dolny-LEWY
        buildings.push(turbineC);
        solidBuildings.push(turbineC);
        holoTurbines.push(turbineC);

        const turbineD = new HoloTurbine(2500, 470, worldContainer);   // gorny-PRAWY
        buildings.push(turbineD);
        solidBuildings.push(turbineD);
        holoTurbines.push(turbineD);

        const turbineE = new HoloTurbine(2500, 2500, worldContainer);  // dolny-PRAWY
        buildings.push(turbineE);
        solidBuildings.push(turbineE);
        holoTurbines.push(turbineE);

        // v0.55.0: Air Taxi / Police hub (prawy-gorny rog). Solid cover.
        // Animacja neonow przez buildings.forEach (brak hit-detection, brak dedykowanej petli).
        airTaxiStation = new AirTaxiStation(2680, 230, worldContainer);
        buildings.push(airTaxiStation);
        solidBuildings.push(airTaxiStation);

        policeStation = new PoliceStation(2680, 350, worldContainer);
        buildings.push(policeStation);
        solidBuildings.push(policeStation);

        // v0.60.0 — dolne stacje taxi (single-stand, niekolizyjne) zamiast golych markerow.
        // Math-verified top-left: yellow (188,2691), red (2698,2691); stand center wypada
        // dokladnie na (230,2740) i (2740,2740) = bazy lotu taksowek.
        const bottomYellow = new AirTaxiStation(188, 2691, worldContainer, 'single', 0xffd21e);
        const bottomRed = new AirTaxiStation(2698, 2691, worldContainer, 'single', 0xff2e4d);
        bottomTaxiStations = [bottomYellow, bottomRed];

        // v0.56.0: Warstwa B — ruch lotniczy. Bazy dolne = standCenter realnych stacji.
        skyTraffic = new SkyTraffic(worldContainer, {
            yellowA: airTaxiStation.yellowStand,
            redA: airTaxiStation.redStand,
            yellowB: bottomYellow.standCenter,   // v0.60.0 — laduje na stacji, nie na markerze
            redB: bottomRed.standCenter,         // v0.60.0
            policeBase: policeStation.helipad,
        });

        mediPads = MEDI_PAD_POSITIONS.map(p => new HoverRepairPad(p.x, p.y, worldContainer));
        powerPads = POWER_PAD_POSITIONS.map(p => new PowerHoverPad(p.x, p.y, worldContainer));

        // v0.52.0 Cyberpunk Visual Upgrade #1: 7 neon billboardow na dachach wiezowcow
        cityBillboards = CITY_BILLBOARDS_LAYOUT.map(b =>
            new NeonBillboard(b.x, b.y, b.w, b.h, b.seed, b.parallax, worldContainer));
            // v0.59.0 Warstwa D — 2 toksyczne rozlewiska szlamu (slow zone 0.5x, prostokatne).
        // Math-verified pozycje (AABB) z dala od reaktora/scrapow/turbin:
        //   Pool A (duze jezioro) center (1500,1500) 640x440 — srodek mapy, glowny chokepoint
        //   Pool B (mniejsze) center (750,2100) 400x300 — dolny-lewy kwadrant
        sludgePools = [
            new SludgePool(2300, 300, 256, 176, 11, worldContainer),
            new SludgePool(870, 2300, 160, 120, 27, worldContainer),
        ];

        // v0.59.0 — stara fabryka z parujacym kominem (post-industrial landmark, lity hitbox).
        // Math-verified center (2250,2200) -> top-left (2070,2070), 360x260. Clearance:
        // turbE 104px, scrapB 500px, krawedz 570px. Niezniszczalna, solid cover.
        oldFactory = new OldFactory(2070, 2070, worldContainer);
        // v0.60.0 — 2 parkingi (passable wypelniacze). Math-verified AABB:
        //   P1 pod fabryka (2030,2360 420x300) — gap 30px do fabryki, 50px do turbE
        //   P2 ogromny lewy-srodek (160,1180 820x760) — czysty, gap 60px do turbB
        parkings = [
            new Parking(2030, 2360, 420, 300, 41, worldContainer),
            new Parking(1920, 717, 620, 560, 53, worldContainer),
        ];
        // v0.60.0 — oleje + studzienki (najcichszy wypelniacz, passable, math-verified scatter)
        groundClutter = new GroundClutter(worldContainer);
        buildings.push(oldFactory);
        solidBuildings.push(oldFactory);

        // v0.60.0 — NEON-OASIS: 2 strefy stealth (kriogeniczna myjnia plazmy). Passable.
        // Math-verified (AABB): stationA center(1460,1130) — najblizszy reaktor 555px;
        // stationB center(1430,2530) — najblizszy sludgeB 605px. Zero nachodzenia.
        neonStations = [
            new NeonOasisStation(2600, 850, 260, 200, 71, worldContainer),
            new NeonOasisStation(1380, 2300, 260, 200, 89, worldContainer),
        ];

    } else if (config.map === 'desert') {
        const desertTex = buildDesertTexture();
        const desertSprite = new PIXI.Sprite(desertTex);
        desertSprite.zIndex = -100;
        worldContainer.addChild(desertSprite);

        DESERT_PYRAMID_LAYOUT.forEach(p => {
            const pyramid = new Pyramid(p.x, p.y, p.size, p.seed, worldContainer);
            buildings.push(pyramid);
            solidBuildings.push(pyramid);
        });

        const sphinx = new Sphinx(
            DESERT_SPHINX_POSITION.x,
            DESERT_SPHINX_POSITION.y,
            DESERT_SPHINX_POSITION.sizeX,
            DESERT_SPHINX_POSITION.sizeY,
            DESERT_SPHINX_POSITION.seed,
            worldContainer,
        );
        buildings.push(sphinx);
        solidBuildings.push(sphinx);

        river = new RiverNile(
            DESERT_RIVER_PATH,
            DESERT_RIVER_WIDTH,
            DESERT_BRIDGE_COUNT,
            DESERT_BRIDGE_DECK_LENGTH,
            DESERT_BRIDGE_DECK_WIDTH,
            worldContainer,
        );
        buildings.push(...river.getCollisionSegments());

        bridges = river.getBridgeLayout().map(b =>
            new Bridge(b.x, b.y, b.deckLength, b.deckWidth, b.rotation, worldContainer),
        );

        waterLife = new WaterLife(
            DESERT_RIVER_PATH,
            DESERT_RIVER_WIDTH,
            river.getBridgeLayout(),
            worldContainer,
        );

        DESERT_LARGE_ROCKS_LAYOUT.forEach(r => {
            const rock = new Rock(r.x, r.y, r.size, 'large', r.seed, worldContainer);
            buildings.push(rock);
            solidBuildings.push(rock);
        });

        DESERT_RIVER_CATARACT_ROCKS.forEach(r => {
            const rock = new Rock(r.x, r.y, r.size, 'large', r.seed, worldContainer);
            buildings.push(rock);
            solidBuildings.push(rock);
        });

        const MIN_DIST_TO_BUILDINGS = 110;
        const MIN_DIST_BETWEEN_SMALL = 45;
        let smallRockAttempts = 0;
        while (smallRocks.length < DESERT_SMALL_ROCKS_COUNT && smallRockAttempts < 250) {
            smallRockAttempts++;
            const rx = 100 + Math.random() * (WORLD_W - 200);
            const ry = 100 + Math.random() * (WORLD_H - 200);

            let blocked = false;
            for (const b of buildings) {
                if (b.w === 0) continue;
                const bcx = b.x + b.w / 2;
                const bcy = b.y + b.h / 2;
                const dx = rx - bcx;
                const dy = ry - bcy;
                if (dx * dx + dy * dy < MIN_DIST_TO_BUILDINGS * MIN_DIST_TO_BUILDINGS) {
                    blocked = true;
                    break;
                }
            }
            if (blocked) continue;

            for (const sr of smallRocks) {
                const dx = rx - sr.visualX;
                const dy = ry - sr.visualY;
                if (dx * dx + dy * dy < MIN_DIST_BETWEEN_SMALL * MIN_DIST_BETWEEN_SMALL) {
                    blocked = true;
                    break;
                }
            }
            if (blocked) continue;

            const size = DESERT_SMALL_ROCK_MIN_SIZE + Math.random() * (DESERT_SMALL_ROCK_MAX_SIZE - DESERT_SMALL_ROCK_MIN_SIZE);
            const seed = Math.floor(Math.random() * 1000);
            smallRocks.push(new Rock(rx, ry, size, 'small', seed, worldContainer));
        }

        sandstormBorder = new SandstormBorder(WORLD_W, WORLD_H, worldContainer);
        buildings.push(...sandstormBorder.getCollisionRects());
        solidBuildings.push(...sandstormBorder.getCollisionRects());

        quicksands = DESERT_QUICKSAND_LAYOUT.map(q =>
            new Quicksand(q.x, q.y, q.rX, q.rY, q.seed, worldContainer),
        );

        oases = DESERT_OASIS_LAYOUT.map(o =>
            new Oasis(o.x, o.y, o.rX, o.rY, o.seed, worldContainer),
        );

        caravan = new Caravan(worldContainer);

        mediPads = DESERT_MEDI_PAD_POSITIONS.map(p => new DesertHeartPad(p.x, p.y, worldContainer));
        powerPads = DESERT_POWER_PAD_POSITIONS.map(p => new DesertStormPad(p.x, p.y, worldContainer));
    } else if (config.map === 'tropics') {
        const tropicsTex = buildTropicsTexture();
        const tropicsSprite = new PIXI.Sprite(tropicsTex);
        tropicsSprite.zIndex = -100;
        worldContainer.addChild(tropicsSprite);

        TROPICS_DIRT_ROAD_PATHS.forEach((waypoints, i) => {
            new DirtRoad(waypoints, worldContainer, 17 + i * 7);
        });

        farmFields = TROPICS_FARM_FIELDS_LAYOUT.map(f => {
            switch (f.type) {
                case 'corn':      return new CornField(f.x, f.y, f.w, f.h, f.seed, worldContainer);
                case 'sugarcane': return new SugarcaneField(f.x, f.y, f.w, f.h, f.seed, worldContainer);
                case 'lettuce':   return new LettuceField(f.x, f.y, f.w, f.h, f.seed, worldContainer);
                case 'pasture':   return new PastureField(f.x, f.y, f.w, f.h, f.seed, worldContainer);
            }
        });

        for (const fb of TROPICS_FARM_BUILDINGS_LAYOUT) {
            let building: BarnBuilding | Henhouse | Cowshed | null = null;
            if (fb.type === 'barn') {
                building = new BarnBuilding(fb.x, fb.y, fb.w, fb.h, fb.seed, worldContainer);
            } else if (fb.type === 'henhouse') {
                building = new Henhouse(fb.x, fb.y, fb.w, fb.h, fb.seed, worldContainer);
            } else if (fb.type === 'cowshed') {
                building = new Cowshed(fb.x, fb.y, fb.w, fb.h, fb.seed, worldContainer);
            }
            if (building) {
                buildings.push(building);
                solidBuildings.push(building);
                for (const extra of building.getExtraCollidables()) {
                    buildings.push(extra);
                    solidBuildings.push(extra);
                }
            }
        }

        const paletteMap: Record<'teal' | 'yellow' | 'pink', CottagePalette> = {
            teal:   PALETTE_TEAL,
            yellow: PALETTE_YELLOW,
            pink:   PALETTE_PINK,
        };
        for (const hb of TROPICS_HOUSES_LAYOUT) {
            const cottage = new CountryHouse(hb.x, hb.y, hb.w, hb.h, hb.seed, paletteMap[hb.palette], worldContainer);
            buildings.push(cottage);
            solidBuildings.push(cottage);
            for (const extra of cottage.getExtraCollidables()) {
                buildings.push(extra);
                solidBuildings.push(extra);
            }
        }

        if (TROPICS_WINDMILL_POSITION) {
            const wp = TROPICS_WINDMILL_POSITION;
            const windmill = new Windmill(wp.x, wp.y, wp.seed, worldContainer);
            buildings.push(windmill);
            solidBuildings.push(windmill);
        }

        tropicalBorder = new TropicalBorder(WORLD_W, WORLD_H, worldContainer);
        buildings.push(...tropicalBorder.getCollisionRects());
        solidBuildings.push(...tropicalBorder.getCollisionRects());

        mediPads = TROPICS_MEDI_PAD_POSITIONS.map(p => new CloverMediPad(p.x, p.y, worldContainer));
        powerPads = TROPICS_POWER_PAD_POSITIONS.map(p => new StumpPowerPad(p.x, p.y, worldContainer));

        patrolTractor = new PatrolTractor(TROPICS_PATROL_WAYPOINTS, worldContainer);

        if (TROPICS_STABLE_LAYOUT) {
            stable = new Stable(TROPICS_STABLE_LAYOUT.stableX, TROPICS_STABLE_LAYOUT.stableY, worldContainer);
            buildings.push(stable.getCollisionRect());
            solidBuildings.push(stable.getCollisionRect());

            paddock = new Paddock(TROPICS_STABLE_LAYOUT.paddockX, TROPICS_STABLE_LAYOUT.paddockY, worldContainer);
            const paddockRects = paddock.getCollisionRects();
            buildings.push(...paddockRects);
            solidBuildings.push(...paddockRects);

            try {
                const stableDoor = {
                    x: stable.x + stable.w / 2,
                    y: stable.y + stable.h - 8,
                };
                const paddockBounds = {
                    x: paddock.x + 20,
                    y: paddock.y + 20,
                    w: paddock.w - 40,
                    h: paddock.h - 40,
                };
                const palettes: HorsePaletteType[] = ['chestnut', 'gray', 'black'];
                const horseSpawnPositions = [
                    { x: paddock.x + paddock.w * 0.30, y: paddock.y + paddock.h * 0.40 },
                    { x: paddock.x + paddock.w * 0.65, y: paddock.y + paddock.h * 0.55 },
                    { x: paddock.x + paddock.w * 0.45, y: paddock.y + paddock.h * 0.75 },
                ];
                for (let i = 0; i < 3; i++) {
                    try {
                        const horse = new Horse(
                            horseSpawnPositions[i].x,
                            horseSpawnPositions[i].y,
                            palettes[i],
                            stableDoor,
                            paddockBounds,
                            worldContainer,
                        );
                        horse.state = 'idle_paddock';
                        horses.push(horse);
                    } catch (err) {
                        console.error('[T9.1] Failed spawn ' + palettes[i] + ':', err);
                    }
                }
                    } catch (err) {
                console.error('[T9.1] Horse setup error:', err);
            }
        }
    } else if (config.map === 'arctic') {
        // ── FAZA A: Arctic ("Krystaliczny Poranek" / "Kociol Lodowcowy") ──
        const arcticTex = buildArcticTexture();
        const arcticSprite = new PIXI.Sprite(arcticTex);
        arcticSprite.zIndex = -100;
        worldContainer.addChild(arcticSprite);

        // Granica lodowcowej niecki: static-baked klify + 4 prostokaty kolizji.
        glacialBorder = new GlacialBorder(WORLD_W, WORLD_H, worldContainer);
        buildings.push(...glacialBorder.getCollisionRects());
        solidBuildings.push(...glacialBorder.getCollisionRects());

        // FAZA A: generic pady (themed Arctic pady w pozniejszej fazie, jak Tropics T1).
        mediPads = ARCTIC_MEDI_PAD_POSITIONS.map(p => new HoverRepairPad(p.x, p.y, worldContainer));
        powerPads = ARCTIC_POWER_PAD_POSITIONS.map(p => new PowerHoverPad(p.x, p.y, worldContainer));
    }

    effects = new EffectsManager(worldContainer);
    // v0.50.0 Difficulty Balance v1: SpawnSystem dostaje per-difficulty modifiers
    // (enemy HP/dmg/speed mults + spawn interval + max enemies + boss thresholds).
    spawnSystem = new SpawnSystem(getDifficultyModifiers(config.difficulty));
    powerSystem = new PowerSystem(worldContainer);

    if (config.map === 'tropics') {
        for (const cl of TROPICS_CRATES_LAYOUT) {
            const crate = new Crate(cl.x, cl.y, cl.seed, worldContainer, effects, audio);
            crates.push(crate);
            solidBuildings.push(crate);
            for (const extra of crate.getExtraCollidables()) {
                buildings.push(extra);
            }
        }
    }

    const brawler = BRAWLERS.find(b => b.id === config.brawlerId) ?? BRAWLERS[0];

    const activeProfile = ProfileService.getActiveProfile();
    player = new Player(brawler, worldContainer, activeProfile?.flagId ?? null);

    enemies = [];
    bullets = [];
    enemyBullets = [];
    hearts = [];
    gems = [];
    magnets = [];
    powerCubes = []; // v0.44.0 FAZA 8.6 reset
    isMouseDown = false;
    gameState = 'PLAYING';

    touchManager.show();

    if (touchManager.isActive) {
        tryLockLandscape();
    }

    audio.startMusic(config.map);
}

// ============================================================
// v0.46.0 — End screen (Przegrana / Zwyciestwo): redesign + i18n
// ============================================================
interface EndScreenData {
    score: number;
    kills: number;
    gems: number;
    cubesTotal: number;
    dmgBonusPct: number;
    hpCubesPicked: number;
    bosses: number;
    seconds: number;
    maxCombo: number;
    hearts: number;
    supers: number;
    tankImg: string;
}

/**
 * v0.46.0 — Render wybranego czolgu (hull+turret) do dataURL (PNG) na hero ekranu konca.
 * Buduje TYMCZASOWY kontener z TYCH SAMYCH tekstur co gra (getBrawlerTextures), lufa do gory,
 * scale x2 dla ostrosci na karcie, ekstrahuje przez renderer.extract. Tekstury sa cache'owane
 * i WSPOLDZIELONE z zywym graczem — destroy({children}) NIE niszczy textur (tylko sprite'y).
 * Zwraca '' przy bledzie -> renderEndScreen fallbackuje do emoji.
 */
function renderTankHeroDataURL(brawler: Brawler, damaged: boolean = false): string {
    try {
        const tex = getBrawlerTextures(brawler);
        const temp = new PIXI.Container();
        const hull = new PIXI.Sprite(tex.hull);
        hull.anchor.set(0.5);
        const turret = new PIXI.Sprite(tex.turret);
        turret.anchor.set(0.5);
        temp.addChild(hull);
        temp.addChild(turret);

        // Slady przegranej — wpieczone w obraz (local space czolgu, centered 0,0).
        if (damaged) {
            const dmg = new PIXI.Graphics();
            const scorch = (sx: number, sy: number, r: number) => {
                dmg.beginFill(0x080808, 0.52); dmg.drawCircle(sx, sy, r); dmg.endFill();
                dmg.beginFill(0x2c2c2c, 0.4); dmg.drawCircle(sx, sy, r * 0.62); dmg.endFill();
            };
            scorch(-8, -5, 13);
            scorch(17, 7, 10);
            scorch(-25, 6, 8);
            // pekniecia (jagged dark)
            dmg.lineStyle(1.7, 0x000000, 0.6);
            dmg.moveTo(-6, -15); dmg.lineTo(2, -5); dmg.lineTo(-3, 3); dmg.lineTo(6, 13);
            dmg.lineStyle(1.2, 0x000000, 0.5);
            dmg.moveTo(20, -2); dmg.lineTo(26, 6); dmg.lineTo(22, 12);
            dmg.lineStyle(0);
            // tlace zarzewie (baked glints)
            dmg.beginFill(0xff5a1e, 0.85); dmg.drawCircle(-8, -5, 2.4); dmg.endFill();
            dmg.beginFill(0xffd24a, 0.95); dmg.drawCircle(-8, -5, 1.1); dmg.endFill();
            dmg.beginFill(0xff5a1e, 0.8); dmg.drawCircle(17, 7, 1.8); dmg.endFill();
            temp.addChild(dmg);
        }

        temp.rotation = -Math.PI / 2; // lufa do gory = hero pose
        temp.scale.set(2);            // x2 = ostry upscale na karcie
        const canvas = app.renderer.extract.canvas(temp) as HTMLCanvasElement;
        const url = canvas.toDataURL('image/png');
        temp.destroy({ children: true }); // niszczy sprite'y/gfx, NIE tekstury (cache)
        return url;
    } catch (e) {
        console.warn('[EndScreen] tank hero render failed:', e);
        return '';
    }
}

/**
 * Buduje wnetrze ekranu konca gry (defeat/victory) — pelne i18n + premium look.
 * Karta `.screen` (bialy card) jest rama; tutaj generujemy zawartosc.
 * Titan One w NATURALNEJ wadze (zero faux-bold); male labele = system-ui (prawdziwa waga 600/700).
 * Wszystkie stringi przez t() — PL->PL, EN->EN.
 */
function renderEndScreen(kind: 'defeat' | 'victory', d: EndScreenData, btnId: string): string {
    const isVictory = kind === 'victory';
    const accent = isVictory ? '#f1c40f' : '#e74c3c';
    const subBg = isVictory ? '#27ae60' : '#c0392b';
    const icon = isVictory ? '🏆' : '💀';
    const title = isVictory ? t('end.victory.title') : t('end.defeat.title');
    const subtitle = isVictory ? t('end.victory.subtitle') : t('end.defeat.subtitle');

    const TITAN = "'Titan One', cursive";
    const SYS = 'system-ui, -apple-system, sans-serif';

    // v0.50.1: gem PNG (256x256, transparent BG) zastapil legacy SVG. object-fit:contain
    // jako safety belt — gdyby aspect ratio kiedys sie zmienilo, ikona dalej bedzie miescic sie w slocie.
    // v0.51.0: rozmiar 1.5rem -> 2.25rem (+50%). Emoji w sasiednich chipach (skull/crown/itd)
    // maja natywne padding glyphs i wygladaja wieksze; gem PNG bez tego paddingu wizualnie ginal.
    // Powiekszenie tylko gem-icon (span slot 1.7rem nieruszony — flex pozwoli img rozlac sie
    // o ~0.55rem; gap:10px do tekstu i transparent BG sprawiaja ze nic sie nie roznie).
    const gemIcon = `<img src="${import.meta.env.BASE_URL}assets/gem.png" alt="" style="width:2.25rem;height:2.25rem;display:block;object-fit:contain;">`;

    // iconHtml = surowy HTML (emoji-char ALBO <img>) renderowany w ramce ikony.
    const chip = (iconHtml: string, value: string | number, label: string): string => `
        <div style="flex:1 1 calc(50% - 8px);min-width:130px;box-sizing:border-box;background:#f1f0f6;border:2px solid #e2e1ea;border-radius:16px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.55rem;line-height:1;display:flex;align-items:center;justify-content:center;width:1.7rem;flex:0 0 auto;">${iconHtml}</span>
            <div style="display:flex;flex-direction:column;line-height:1.05;min-width:0;">
                <span style="font-family:${TITAN};font-size:1.45rem;color:#2c3e50;">${value}</span>
                <span style="font-family:${SYS};font-size:0.68rem;font-weight:600;letter-spacing:0.5px;color:#8a8a99;text-transform:uppercase;">${label}</span>
            </div>
        </div>`;

    // Slim bonus-row z PowerCube'ow — tylko gdy realnie cos dropnelo.
    const bonusRow = (d.dmgBonusPct > 0 || d.hpCubesPicked > 0) ? `
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:10px;">
            ${d.dmgBonusPct > 0 ? `<span style="font-family:${SYS};font-size:0.74rem;font-weight:700;color:#fff;background:#e74c3c;padding:4px 11px;border-radius:11px;white-space:nowrap;">🟦 +${d.dmgBonusPct}% ${t('end.dmgBonus')}</span>` : ''}
            ${d.hpCubesPicked > 0 ? `<span style="font-family:${SYS};font-size:0.74rem;font-weight:700;color:#fff;background:#2980b9;padding:4px 11px;border-radius:11px;white-space:nowrap;">🟦 +${d.hpCubesPicked * 25} ${t('end.hpBonus')}</span>` : ''}
        </div>` : '';

    const victoryBadge = isVictory ? `
        <div style="font-family:${TITAN};font-size:0.95rem;color:#fff;background:#27ae60;padding:6px 18px;border-radius:14px;border:2px solid #2c3e50;box-shadow:2px 2px 0 #2c3e50;margin-top:12px;">🏆 ${t('end.megaBoss')} — ${t('end.megaBossDefeated')}</div>` : '';

    // v0.50.0 fix — Hero zone rozni sie per outcome:
    //   - DEFEAT  = palacy sie czolg (smoke + flames) — istniejacy efekt
    //   - VICTORY = celebracja (confetti + gold sparkles + radial rays) — NOWE
    // Wczesniej victory mial gold-tinted smoke+flames, czyli czolg wygladal jakby
    // palil sie zlotymi plomieniami. Visual mismatch z "ZWYCIESTWO!" tytulem.
    const glow = isVictory ? 'rgba(241,196,15,0.42)' : 'rgba(231,76,60,0.34)';

    let heroEffects = '';
    let heroKeyframes = '';

    if (isVictory) {
        // ── VICTORY: confetti + sparkles + radial rays ──
        const confettiColors = ['#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#ffffff', '#ff6b9d'];

        // 18 kolorowych pasków opadajacych — staggered delays + rotacje dla varied look
        const confettiPieces = Array.from({ length: 18 }, (_, i) => {
            const xPct = (i * 5.3 + 4) % 96;
            const color = confettiColors[i % confettiColors.length];
            const delay = ((i * 0.17) % 1.8).toFixed(2);
            const dur = (1.6 + (i % 4) * 0.25).toFixed(2);
            const rotEnd = 360 + ((i % 3) * 360);
            const w = 6 + (i % 3); // 6,7,8 px szer
            return `<div style="position:absolute;left:${xPct}%;top:-12px;width:${w}px;height:14px;background:${color};animation:esConfetti ${dur}s linear ${delay}s infinite backwards;border-radius:1px;z-index:1;--rotEnd:${rotEnd}deg;"></div>`;
        }).join('');

        // 6 gold sparkles ✦ — twinkle (scale 0→1→0 + rotate)
        const sparkleDefs = [
            { x: 25, y: 28, d: 0.0, s: 1.4 },
            { x: 75, y: 22, d: 0.5, s: 1.2 },
            { x: 18, y: 75, d: 0.3, s: 1.0 },
            { x: 82, y: 68, d: 0.9, s: 1.3 },
            { x: 50, y: 12, d: 0.7, s: 1.1 },
            { x: 45, y: 88, d: 1.1, s: 1.5 },
        ];
        const sparkles = sparkleDefs.map(s =>
            `<div style="position:absolute;left:${s.x}%;top:${s.y}%;font-size:${Math.round(18 * s.s)}px;line-height:1;color:#fff8c4;text-shadow:0 0 10px rgba(241,196,15,0.95),0 0 4px rgba(255,255,255,1);animation:esSparkle 1.4s ease-in-out ${s.d}s infinite;pointer-events:none;z-index:3;">✦</div>`
        ).join('');

        // Radial rays za tankiem — sun-burst pulsuje
        const rays = `<div style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);width:280px;height:280px;background:radial-gradient(circle at center,rgba(241,196,15,0.35) 0%,rgba(241,196,15,0.12) 30%,transparent 55%);animation:esRays 2.4s ease-in-out infinite;z-index:0;pointer-events:none;"></div>`;

        heroEffects = `${rays}${confettiPieces}${sparkles}`;
        heroKeyframes = `
          @keyframes esConfetti{0%{transform:translateY(-30px) rotate(0deg);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translateY(190px) rotate(var(--rotEnd,720deg));opacity:0}}
          @keyframes esSparkle{0%,100%{transform:scale(0) rotate(0deg);opacity:0}50%{transform:scale(1) rotate(180deg);opacity:1}}
          @keyframes esRays{0%,100%{opacity:0.55;transform:translateX(-50%) scale(1)}50%{opacity:0.85;transform:translateX(-50%) scale(1.06)}}`;
    } else {
        // ── DEFEAT: smoke + flames (existing) ──
        const smoke = 'rgba(58,58,64,0.6)';
        const flameOuter = 'rgba(255,88,28,0.92)';
        const flameInner = 'rgba(255,208,72,0.95)';

        // Dym — 6 klebow, rozne rozmiary/predkosci/delay.
        const smokeDefs = [
            { x: 0, s: 50, d: 0.0, dur: 2.6 }, { x: -17, s: 38, d: 0.7, dur: 2.9 },
            { x: 15, s: 42, d: 1.1, dur: 2.4 }, { x: -6, s: 34, d: 1.6, dur: 3.0 },
            { x: 11, s: 30, d: 2.0, dur: 2.7 }, { x: -13, s: 30, d: 0.4, dur: 3.1 },
        ];
        const smokePuffs = smokeDefs.map(p =>
            `<div style="position:absolute;bottom:40px;left:calc(50% + ${p.x}px);transform:translateX(-50%);width:${p.s}px;height:${p.s}px;border-radius:50%;background:radial-gradient(circle,${smoke} 0%,transparent 70%);animation:esSmoke ${p.dur}s ease-out ${p.d}s infinite backwards;z-index:1;"></div>`
        ).join('');

        // Plomienie — 4 jezyki ognia u podstawy, flicker.
        const flameDefs = [
            { x: 0, w: 30, h: 48, d: 0.0 }, { x: -13, w: 20, h: 34, d: 0.25 },
            { x: 14, w: 22, h: 38, d: 0.5 }, { x: -4, w: 15, h: 26, d: 0.15 },
        ];
        const flames = flameDefs.map(f =>
            `<div style="position:absolute;z-index:3;bottom:32px;left:calc(50% + ${f.x}px);transform:translateX(-50%);width:${f.w}px;height:${f.h}px;border-radius:50% 50% 48% 48% / 64% 64% 36% 36%;background:radial-gradient(ellipse at 50% 78%, ${flameInner} 0%, ${flameOuter} 46%, transparent 76%);animation:esFlame ${(0.55 + f.d).toFixed(2)}s ease-in-out ${f.d}s infinite backwards;filter:blur(0.5px);"></div>`
        ).join('');

        heroEffects = `${smokePuffs}${flames}`;
        heroKeyframes = `
          @keyframes esSmoke{0%{transform:translateX(-50%) translateY(8px) scale(.5);opacity:0}25%{opacity:.6}100%{transform:translateX(-50%) translateY(-88px) scale(1.8);opacity:0}}
          @keyframes esFlame{0%,100%{transform:translateX(-50%) scaleY(.82) scaleX(1);opacity:.85}50%{transform:translateX(-50%) scaleY(1.18) scaleX(.92);opacity:1}}`;
    }

    const heroZone = d.tankImg ? `
        <style>${heroKeyframes}</style>
        <div style="position:relative;width:100%;height:168px;display:flex;align-items:flex-end;justify-content:center;margin-bottom:2px;overflow:hidden;">
            <div style="position:absolute;bottom:22px;left:50%;transform:translateX(-50%);width:178px;height:178px;border-radius:50%;background:radial-gradient(circle,${glow} 0%,transparent 68%);z-index:0;"></div>
            <div style="position:absolute;bottom:22px;left:50%;transform:translateX(-50%);width:128px;height:26px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,0.4) 0%,transparent 72%);z-index:1;"></div>
            ${heroEffects}
            <img src="${d.tankImg}" alt="" style="position:relative;z-index:2;height:152px;width:auto;filter:drop-shadow(0 7px 8px rgba(0,0,0,0.4));">
        </div>`
        : `<div style="font-size:3.2rem;line-height:1;margin-bottom:4px;">${icon}</div>`;

    return `
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;box-sizing:border-box;">
            ${heroZone}
            <div style="font-family:${TITAN};font-size:2.4rem;line-height:1;color:${accent};text-transform:uppercase;-webkit-text-stroke:2px #000;text-shadow:4px 4px 0 #000;letter-spacing:1px;text-align:center;">${title}</div>
            <div style="font-family:${TITAN};font-size:1rem;color:#fff;background:${subBg};padding:7px 22px;border-radius:18px;border:3px solid #2c3e50;box-shadow:3px 3px 0 #2c3e50;margin-top:10px;">${subtitle}</div>

            <div style="text-align:center;margin:18px 0 2px;">
                <div style="font-family:${SYS};font-size:0.74rem;font-weight:700;letter-spacing:1.5px;color:#9a9aa8;text-transform:uppercase;">${t('end.score')}</div>
                <div style="font-family:${TITAN};font-size:2.9rem;line-height:1;color:#f1c40f;-webkit-text-stroke:2px #000;text-shadow:3px 3px 0 rgba(0,0,0,0.22);">${d.score}</div>
            </div>

            <div style="display:flex;flex-wrap:wrap;gap:8px;width:100%;margin-top:12px;">
                ${chip('💀', d.kills, t('end.kills'))}
                ${chip(gemIcon, d.gems, t('end.gems'))}
                ${chip('👑', d.bosses, t('end.bosses'))}
                ${chip('🔥', `${d.maxCombo}x`, t('end.combo'))}
                ${chip('🟦', d.cubesTotal, t('end.cubes'))}
                ${chip('❤️', d.hearts, t('end.hearts'))}
                ${chip('💥', d.supers, t('end.supers'))}
                ${chip('⏱️', `${d.seconds}s`, t('end.time'))}
            </div>
            ${bonusRow}
            ${victoryBadge}

            <button class="brawl-btn" id="${btnId}" style="font-size:1.6rem;padding:13px 40px;margin-top:22px;">${t('end.backToMenu')}</button>
        </div>`;
}

async function triggerGameOver(): Promise<void> {
    gameState = 'GAMEOVER';
    audio.playGameOver();

    touchManager.hide();

    if (currentSession) {
        try {
            await scoreService.submitScore(currentSession.score, currentSession.config);
            console.log(`[Score] Submitted (GameOver): ${currentSession.score} pts`);
        } catch (e) {
            console.warn('[Score] Submit failed:', e);
        }
    }

    const heroBrawler = BRAWLERS.find(b => b.id === currentSession?.config.brawlerId) ?? null;
    const tankImg = heroBrawler ? renderTankHeroDataURL(heroBrawler, true) : '';
    const screenEl = document.getElementById('gameOverScreen')!;
    screenEl.innerHTML = renderEndScreen('defeat', {
        score: currentSession?.score ?? 0,
        kills: spawnSystem?.totalKills ?? 0,
        gems: spawnSystem?.gemsCollected ?? 0,
        cubesTotal: currentSession?.cubesTotal ?? 0,
        dmgBonusPct: Math.round((currentSession?.dmgBonus ?? 0) * 100),
        hpCubesPicked: currentSession?.hpCubesPicked ?? 0,
        bosses: spawnSystem?.bossKills ?? 0,
        seconds: currentSession?.getElapsedSeconds() ?? 0,
        maxCombo: currentSession?.maxCombo ?? 0,
        hearts: currentSession?.heartsHealed ?? 0,
        supers: currentSession?.superPowersUsed ?? 0,
        tankImg,
    }, 'retryBtn');
    document.getElementById('retryBtn')!.addEventListener('click', returnToMenuFromEnd);
    screenEl.classList.add('active-screen');
    document.body.classList.remove('game-cursor-hidden');
    hud.clear();
}

async function triggerVictory(): Promise<void> {
    gameState = 'VICTORY';
    audio.playVictory();

    touchManager.hide();

    if (currentSession) {
        // v0.50.0 Scoring v2.2: Perfect Run check + apply bonus PRZED submit, zeby
        // submitowany score juz uwzglednial bonus. Wolane RAZ na koncu matchu.
        const perfectRun = currentSession.applyPerfectRunBonus();
        if (perfectRun.applied) {
            console.log(`[Score] PERFECT RUN bonus applied: +${perfectRun.bonus} pts`);
            hud.addNotif(t('hud.perfectRun', { bonus: perfectRun.bonus }), '#f1c40f');
        }

        try {
            await scoreService.submitScore(currentSession.score, currentSession.config);
            console.log(`[Score] Submitted (Victory): ${currentSession.score} pts`);
        } catch (e) {
            console.warn('[Score] Submit failed:', e);
        }
    }

    const heroBrawler = BRAWLERS.find(b => b.id === currentSession?.config.brawlerId) ?? null;
    const tankImg = heroBrawler ? renderTankHeroDataURL(heroBrawler, false) : '';
    const screenEl = document.getElementById('victoryScreen')!;
    screenEl.innerHTML = renderEndScreen('victory', {
        score: currentSession?.score ?? 0,
        kills: spawnSystem?.totalKills ?? 0,
        gems: spawnSystem?.gemsCollected ?? 0,
        cubesTotal: currentSession?.cubesTotal ?? 0,
        dmgBonusPct: Math.round((currentSession?.dmgBonus ?? 0) * 100),
        hpCubesPicked: currentSession?.hpCubesPicked ?? 0,
        bosses: spawnSystem?.bossKills ?? 0,
        seconds: currentSession?.getElapsedSeconds() ?? 0,
        maxCombo: currentSession?.maxCombo ?? 0,
        hearts: currentSession?.heartsHealed ?? 0,
        supers: currentSession?.superPowersUsed ?? 0,
        tankImg,
    }, 'playAgainBtn');
    document.getElementById('playAgainBtn')!.addEventListener('click', returnToMenuFromEnd);
    screenEl.classList.add('active-screen');
    document.body.classList.remove('game-cursor-hidden');
    hud.clear();
}

app.ticker.add((delta) => {
    if (gameState !== 'PLAYING' || !player || !effects || !spawnSystem || !powerSystem || !currentSession) return;

    // === v0.45.0 FAZA 8.7: HIT-STOP ===
    // Early return jeśli aktywny hit-stop — frame freeze (movement, AI, effects, bullets stoją).
    // Audio gra naturalnie (poza ticker context).
    if (hitStopFramesRemaining > 0) {
        hitStopFramesRemaining--;
        return;
    }

    const ZOOM = touchManager.isActive ? MOBILE_WORLD_ZOOM : DESKTOP_WORLD_ZOOM;
    const viewW = hud.screenW / ZOOM;
    const viewH = hud.screenH / ZOOM;

    camera.x = Math.max(0, Math.min(WORLD_W - viewW, ~~(player.x - viewW / 2)));
    camera.y = Math.max(0, Math.min(WORLD_H - viewH, ~~(player.y - viewH / 2)));

    worldContainer.x = -camera.x * ZOOM + effects.shakeOffsetX;
    worldContainer.y = -camera.y * ZOOM + effects.shakeOffsetY;

    let touchMoveVector: { x: number; y: number } | null = null;
    if (touchManager.isActive) {
        touchManager.updateSuperChargedVisual(powerSystem.canActivate());

        const selectedPower = POWERS[powerSystem.selectedPowerId];
        touchManager.updateSelectedPower(selectedPower.emoji);

        if (touchManager.consumeSuperRequest()) {
            tryActivateSuper();
        }

        touchMoveVector = touchManager.moveVector;

        const aimVec = touchManager.aimVector;
        if (aimVec) {
            const AIM_DISTANCE = 200;
            mouse.screenX = (player.x - camera.x) * ZOOM + aimVec.x * AIM_DISTANCE;
            mouse.screenY = (player.y - camera.y) * ZOOM + aimVec.y * AIM_DISTANCE;
        }

        hud.showCrosshair = aimVec !== null;

        isMouseDown = touchManager.isFiring;
    }

    const mouseWorldX = mouse.screenX / ZOOM + camera.x;
    const mouseWorldY = mouse.screenY / ZOOM + camera.y;

    let playerInQuicksand = false;
    for (const qs of quicksands) {
        qs.update();
        if (qs.isPointInside(player.x, player.y)) {
            playerInQuicksand = true;
        }
    }
// v0.59.0 Warstwa D — toksyczne rozlewiska (slow 0.5x + fluid wakes)
    let playerInSludge = false;
    for (const sp of sludgePools) {
        sp.update(player.x, player.y, player.isMoving); // v0.59.0 AAA #3 — wakes z gasienic
        if (sp.isPointInside(player.x, player.y)) {
            playerInSludge = true;
        }
    }
    for (const pk of parkings) pk.update(player.x, player.y); // v0.60.0 — puls diod + alarm na najechanie
    player.speedModifier = (playerInQuicksand || playerInSludge) ? 0.5 : 1.0;
    
    groundClutter?.update(); // v0.60.0 — para z 1-2 studzienek
    
    for (const enemy of enemies) {
        let enemyInSlow = false;
        for (const qs of quicksands) {
            if (qs.isPointInside(enemy.x, enemy.y)) { enemyInSlow = true; break; }
        }
        if (!enemyInSlow) {
            for (const sp of sludgePools) {
                if (sp.isPointInside(enemy.x, enemy.y)) { enemyInSlow = true; break; }
            }
        }
        enemy.speedModifier = enemyInSlow ? 0.5 : 1.0;
    }

    let playerInOasis = false;
    for (const oasis of oases) {
        oasis.update();
        if (oasis.isPointInside(player.x, player.y)) {
            playerInOasis = true;
        }
    }

    // v0.60.0 — NEON-OASIS stealth (cyberpunk). update z camera dla parallaxu dachu.
    let playerInNeonStation = false;
    for (const ns of neonStations) {
        ns.update(camera.x, camera.y, player.x, player.y, neonDidShootLastFrame, bullets);
        ns.onTankEnter(player.x, player.y); // fog wakes z gasienic
        if (ns.isPointInside(player.x, player.y)) {
            playerInNeonStation = true;
        }
    }

    let playerInCornField = false;
    let playerInSugarcaneField = false;
    for (const ff of farmFields) {
        ff.update();
        ff.onTankEnter(player.x, player.y);
        if (ff.isPointInside(player.x, player.y)) {
            if (ff instanceof CornField) playerInCornField = true;
            else if (ff instanceof SugarcaneField) playerInSugarcaneField = true;
        }
    }
    const playerInFarmStealth = playerInCornField || playerInSugarcaneField;

    const nowMs = Date.now();
    const playerInAnyStealth = playerInOasis || playerInFarmStealth || playerInNeonStation;
    const wasInAnyStealthLastFrame = wasInOasisLastFrame || wasInCornLastFrame || wasInNeonLastFrame;

    if (playerInAnyStealth && !wasInAnyStealthLastFrame) {
        oasisStealthEndTime = nowMs + OASIS_STEALTH_DURATION_MS;
    }

    const isStealthActive = playerInAnyStealth && nowMs < oasisStealthEndTime;

    if (isStealthActive && !wasStealthActiveLastFrame) {
        if (playerInSugarcaneField && !playerInOasis) {
            hud.addNotif(t('hud.stealthSugarcane'), '#a8d870');
        } else if (playerInCornField && !playerInOasis) {
            hud.addNotif(t('hud.stealthCorn'), '#d4b830');
} else if (playerInNeonStation) {
            hud.addNotif(t('hud.stealthNeon'), '#6ad8ff');
        } else {
            hud.addNotif(t('hud.stealthOasis'), '#a8c878');
        }
        audio.playMagnetPickup();
    } else if (!isStealthActive && wasStealthActiveLastFrame && playerInAnyStealth) {
        // v0.50.1: rozny komunikat zaleznie od powodu zerwania stealth.
        // Strzal -> jasna informacja edukacyjna "STRZAL ZDRADZIL POZYCJE".
        // Natural timeout (10s minelo) -> standardowe "ZOSTALES ZAUWAZONY".
        const breakMsg = stealthBrokenByShot ? t('hud.shotRevealed') : t('hud.stealthSpotted');
        hud.addNotif(breakMsg, '#ff8855');
        effects.shake(3, 8);
    }

    for (const enemy of enemies) {
        enemy.playerStealthed = isStealthActive;
    }

    wasInOasisLastFrame = playerInOasis;
    wasInCornLastFrame = playerInFarmStealth;
    wasInNeonLastFrame = playerInNeonStation; // v0.60.0
    wasStealthActiveLastFrame = isStealthActive;
    // v0.50.1: catch-all reset flag stealthBrokenByShot gdy stealth nieaktywne.
    // Pokrywa edge case: gracz strzelil ze strefy ale wyszedl ZARAZ -> flag bez reset
    // -> nastepne wejscie do strefy -> bledny komunikat. Reset tutaj eliminuje problem.
    if (!isStealthActive) {
        stealthBrokenByShot = false;
    }

    if (river) river.update();
    if (waterLife) waterLife.update();
    if (sandstormBorder) sandstormBorder.update();
    if (tropicalBorder) tropicalBorder.update();
    if (cyberpunkBorder) cyberpunkBorder.update(); // v0.52.0 fix #21
    if (glacialBorder) glacialBorder.update(); // FAZA A (Arctic)
    // v0.52.0: cyberpunk billboards (pulse + content rotation + flicker + parallax)
    for (const bb of cityBillboards) bb.update(delta, camera.x, camera.y, viewW, viewH);
    // v0.52.0 phase 2: sludge reactors — proximity excited state + bullet hit detection
    for (const sr of sludgeReactors) {
        sr.setPlayerNear(player.x, player.y);
        sr.update(camera.x, camera.y, viewW, viewH, bullets);
    }
    // v0.59.0 — stara fabryka: animacja + iskry (potrzebuje bullets; jak reaktor).
    // Fabryka jest tez w buildings, ale tamten update() (bez bullets) jest no-op (guard).
    if (oldFactory) {
        oldFactory.update(camera.x, camera.y, viewW, viewH, bullets);
    }

    // v0.53.0: anti-grav scrap — proximity excited state + bullet hit detection
    for (const sc of antiGravScraps) {
        sc.setPlayerNear(player.x, player.y);
        sc.update(camera.x, camera.y, viewW, viewH, bullets);
    }

    // v0.54.0: holo turbines — proximity excited + dual-hitbox (housing sparks + holo glitch)
    for (const ht of holoTurbines) {
        ht.setPlayerNear(player.x, player.y);
        ht.update(camera.x, camera.y, viewW, viewH, bullets);
    }

    // v0.60.0 — animacja dolnych stacji taxi (niekolizyjne, poza buildings.forEach)
    for (const bts of bottomTaxiStations) bts.update(camera.x, camera.y, viewW, viewH);
    // v0.56.0: Warstwa B — ruch lotniczy (taksowki + patrol policji). Niekolizyjny ambient.
    skyTraffic?.update();

    // v0.58.0 Warstwa C2 — spawn wozu poscigowego gdy reaktor krytyczny (ecoCrimeActive).
    // Jednorazowy per match (pursuitSpawned latch). Wyjezdza z PoliceStation (helipad).
    // Event-driven z main.ts (NIE SpawnSystem — to nie cykliczny spawn, tylko reakcja na event).
    if (ecoCrimeActive && !pursuitSpawned && policeStation) {
        pursuitSpawned = true;
        // v0.58.0 fix: helipad jest w SRODKU hitboxa stacji (woz utykal w scianie).
        // Spawn PONIZEJ dolnej krawedzi komisariatu (y+h+35) = wyjazd z bramy na otwarta droge.
        const spawnX = policeStation.x + policeStation.w / 2;       // = 2755 (wysrodkowany)
        const spawnY = policeStation.y + policeStation.h + 35;      // = 465, ponizej hitboxa (350-430)
        const woz = new Enemy(spawnX, spawnY, ENEMY_PURSUIT, false, worldContainer, false, true);
        attachEnemyCubeStolenCallback(woz);
        enemies.push(woz);
        hud.addNotif(t('reactor.pursuitIncoming'), '#4488ff');
        effects.shake(6, 12);
    }

    if (patrolTractor) patrolTractor.update();
    if (stable) {
        try { stable.update(); } catch (err) { console.error('[T9.0] Stable update:', err); }
    }
    if (paddock) {
        try { paddock.update(); } catch (err) { console.error('[T9.0] Paddock update:', err); }
    }
    for (const h of horses) {
        try { h.update(); } catch (err) { console.error('[T9.1] Horse ' + h.paletteType + ' update:', err); }
    }

    if (caravan) {
        const drop = caravan.update(delta);
        if (drop) {
            if (drop.type === 'gem') {
                gems.push(new Gem(drop.x, drop.y, worldContainer));
                hud.addNotif(t('hud.caravanGem'), '#d97e3a');
            } else if (drop.type === 'heart') {
                hearts.push(new Heart(drop.x, drop.y, worldContainer));
                hud.addNotif(t('hud.caravanHeart'), '#d97e3a');
            } else if (drop.type === 'magnet') {
                magnets.push(new Magnet(drop.x, drop.y, worldContainer));
                hud.addNotif(t('hud.caravanMagnet'), '#d97e3a');
            }
            audio.playGemPickup();
        }
    }

    buildings.forEach(b => b.update(camera.x, camera.y, viewW, viewH));

    player.update(keys, mouseWorldX, mouseWorldY, buildings, effects, touchMoveVector);

    if (currentSession.config.map === 'desert' && player.isMoving) {
        sandKickFrameCounter++;
        const interval = player.hasSpeedBoost ? 2 : 3;
        if (sandKickFrameCounter >= interval) {
            sandKickFrameCounter = 0;
            const intensity = player.hasSpeedBoost ? 1.6 : 1.0;
            effects.spawnSandKick(player.x, player.y, player.hull.rotation, intensity);
        }
    } else {
        sandKickFrameCounter = 0;
    }

    const time = Date.now() / 1000;
    for (const pad of mediPads) {
        const result = pad.update(player.x, player.y, player.isMoving, player.hp, player.maxHp, time);
        if (result.healed) {
            player.hp = Math.min(player.maxHp, player.hp + 100);
            effects.spawnEnemyHitSparks(player.x, player.y, 0x2ecc71);
            hud.addNotif(t('hud.mediPadHeal', { hp: 100 }), '#2ecc71');
            audio.playHeartPickup();
        }
    }
    for (const pad of powerPads) {
        const result = pad.update(player.x, player.y, time);
        if (result.activated) {
            player.applyTurboBoost(result.durationMs, result.multiplier);
            effects.spawnEnemyHitSparks(player.x, player.y, 0xff6600);
            effects.shake(5, 8);
            hud.addNotif(t('hud.turboBoost', { sec: Math.round(result.durationMs / 1000) }), '#ffcc00');
            audio.playMagnetPickup();
        }
    }

    for (let i = hearts.length - 1; i >= 0; i--) {
        const h = hearts[i];
        h.update(delta);
        if (!h.active) { hearts.splice(i, 1); continue; }
        const dx = player.x - h.x, dy = player.y - h.y;
        if (dx * dx + dy * dy < (h.radius + 22) * (h.radius + 22)) {
            if (h.pickup(effects)) {
                player.hp = Math.min(player.maxHp, player.hp + h.healAmount);
                if (currentSession) currentSession.heartsHealed++;
                hud.addNotif(t('hud.heartHeal', { hp: h.healAmount }), '#ff3366');
                audio.playHeartPickup();
                hearts.splice(i, 1);
            }
        }
    }

    for (let i = gems.length - 1; i >= 0; i--) {
        const g = gems[i];
        if (powerSystem.magnetActive) g.attracted = true;
        g.update(delta, player.x, player.y);
        if (!g.active) { gems.splice(i, 1); continue; }
        const dx = player.x - g.x, dy = player.y - g.y;
        if (dx * dx + dy * dy < (g.radius + PICKUP_CONFIG.gemAutoCollectRadius) * (g.radius + PICKUP_CONFIG.gemAutoCollectRadius)) {
            if (g.pickup(effects)) {
                const prevTotal = spawnSystem.gemsCollected;
                spawnSystem.registerGemCollected();
                currentSession.addGemScore(1); // v0.49.0 Scoring v2: gem NIE skaluje combo, tylko difficulty
                audio.playGemPickup();

                const prevTrigger = Math.floor(prevTotal / GEMS_PER_SUPER_CHARGE_TRIGGER);
                const newTrigger = Math.floor(spawnSystem.gemsCollected / GEMS_PER_SUPER_CHARGE_TRIGGER);
                if (newTrigger > prevTrigger) {
                    player.addSuperCharge(SUPER_CHARGES_PER_TRIGGER);
                    hud.addNotif(t('hud.superCharge', { count: SUPER_CHARGES_PER_TRIGGER, total: player.superCharges }), '#c850ff');
                    effects.shake(4, 8);
                }

                gems.splice(i, 1);
            }
        }
    }

    for (let i = magnets.length - 1; i >= 0; i--) {
        const m = magnets[i];
        m.update(delta);
        if (!m.active) { magnets.splice(i, 1); continue; }
        const dx = player.x - m.x, dy = player.y - m.y;
        if (dx * dx + dy * dy < (m.radius + 22) * (m.radius + 22)) {
            if (m.pickup(effects)) {
                powerSystem.activateMagnet(PICKUP_CONFIG.magnetActiveDurationMs);
                hud.addNotif(t('hud.magnetActive', { sec: Math.round(PICKUP_CONFIG.magnetActiveDurationMs / 1000) }), '#e74c3c');
                audio.playMagnetPickup();
                magnets.splice(i, 1);
            }
        }
    }

    // === v0.44.0 FAZA 8.6: PowerCubes pickup loop ===
    for (let i = powerCubes.length - 1; i >= 0; i--) {
        const pc = powerCubes[i];
        pc.update(delta);

        if (!pc.active) {
            pc.destroy();
            powerCubes.splice(i, 1);
            continue;
        }

        const dx = player.x - pc.x, dy = player.y - pc.y;
        const touchR = 22 + pc.radius;
        if (dx * dx + dy * dy < touchR * touchR) {
            const type = pc.type;
            currentSession.registerCubePickup(type);

            const isDmg = type === 'dmg';
            const color = isDmg ? 0xe74c3c : 0x2980b9;
            const labelText = isDmg ? t('pickup.dmgUp') : t('pickup.hpUp');
            effects.spawnFloatingText(player.x, player.y - 30, labelText, color);

            if (type === 'hp') {
                player.maxHp += POWERCUBE_HP_BONUS_PER_PICKUP;
                player.hp = Math.min(player.maxHp, player.hp + POWERCUBE_HP_BONUS_PER_PICKUP);
            }

            effects.spawnEnemyHitSparks(player.x, player.y, color);
            audio.playGemPickup();

            pc.destroy();
            powerCubes.splice(i, 1);
        }
    }

    const now = Date.now();
    if (isMouseDown && now - lastShotTime > player.brawler.reload) {
        // v0.50.1 anti-cheese fix: strzal ze strefy stealth = natychmiastowe wykrycie.
        // Zerujemy timer; next-frame branch "ZOSTALES ZAUWAZONY" pokaze odmienny komunikat
        // dzieki flagi stealthBrokenByShot (informuje gracza POWODU wykrycia).
        // Naprawia exploit: gracz wpadal w corn/sugarcane/oasis, czekal 10s na "reset",
        // wyjezdzal, strzelal — przeciwnicy nie widzieli go bo flagger stealth byl aktywny.
        if (now < oasisStealthEndTime) {
            oasisStealthEndTime = 0;
            stealthBrokenByShot = true;
        }

        const angle = player.turret.rotation;
        const sX = player.x + Math.cos(angle) * 45;
        const sY = player.y + Math.sin(angle) * 45;
        effects.spawnMuzzleFlash(sX, sY, angle);

        const wasActive = player.isSuperShotActive;
        const isSuperShot = player.tryActivateOrContinueSuperShot();
        const justActivated = !wasActive && isSuperShot;

        if (justActivated) {
            audio.playSuperShotActivate();
        }

        audio.playShoot(player.brawler.id);

        const dmgMultiplier = 1 + currentSession.dmgBonus;

        if (player.brawler.type === 'spread') {
            const b1 = new Bullet(sX, sY, angle - 0.2, player.brawler, worldContainer, isSuperShot);
            const b2 = new Bullet(sX, sY, angle, player.brawler, worldContainer, isSuperShot);
            const b3 = new Bullet(sX, sY, angle + 0.2, player.brawler, worldContainer, isSuperShot);
            b1.dmg = Math.round(b1.dmg * dmgMultiplier);
            b2.dmg = Math.round(b2.dmg * dmgMultiplier);
            b3.dmg = Math.round(b3.dmg * dmgMultiplier);
            bullets.push(b1, b2, b3);
        } else {
            const b = new Bullet(sX, sY, angle, player.brawler, worldContainer, isSuperShot);
            b.dmg = Math.round(b.dmg * dmgMultiplier);
            bullets.push(b);
            if (isSuperShot) {
                const b1 = new Bullet(sX, sY, angle - 0.1, player.brawler, worldContainer, isSuperShot);
                const b2 = new Bullet(sX, sY, angle + 0.1, player.brawler, worldContainer, isSuperShot);
                b1.dmg = Math.round(b1.dmg * dmgMultiplier);
                b2.dmg = Math.round(b2.dmg * dmgMultiplier);
                bullets.push(b1, b2);
            }
        }
        lastShotTime = now;
        neonDidShootLastFrame = true; // v0.60.0 TIER 3 — sygnal dla drona (panika)
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.update(delta, solidBuildings, effects);
        if (!b.active) bullets.splice(i, 1);
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const eb = enemyBullets[i];
        eb.update(delta, solidBuildings, effects);
        if (!eb.active) { enemyBullets.splice(i, 1); continue; }
        const dx = eb.x - player.x, dy = eb.y - player.y;
        if (dx * dx + dy * dy < 25 * 25) {
            const playerDied = player.takeDamage(eb.dmg, powerSystem.isInvulnerable);

            if (powerSystem.isInvulnerable) {
                effects.spawnEnemyHitSparks(eb.x, eb.y, 0xffdd00);
            } else {
                effects.spawnEnemyHitSparks(eb.x, eb.y, 0xff0000);
                effects.shake(4, 6);
                audio.playHit('player');
                // v0.50.0 Scoring v2.2: applied damage → Perfect Run flag SET (Aura by zachowala streak).
                currentSession.markDamageTaken();
            }
            eb.destroy();
            enemyBullets.splice(i, 1);
            if (playerDied) { triggerGameOver(); return; }
        }
    }

    const spawnResult = spawnSystem.update(delta, enemies, hearts, magnets, player.x, player.y, worldContainer, buildings);
    for (const newEnemy of spawnResult.newEnemies) {
        attachEnemyCubeStolenCallback(newEnemy);
    }
    enemies.push(...spawnResult.newEnemies);
    hearts.push(...spawnResult.newHearts);
    magnets.push(...spawnResult.newMagnets);
    if (spawnResult.megaBossJustSpawned) hud.triggerMegaBossAlert();

    powerSystem.update(delta, player, enemies, worldContainer, effects);

    for (const crate of crates) {
        crate.update(0, 0, 0, 0);
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        const shotInfo = enemy.update(delta, player.x, player.y, buildings, powerCubes);
        if (shotInfo) spawnEnemyShot(shotInfo);

        const dP = (player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2;
        const collisionDist = enemy.isMegaBoss ? 80 : enemy.isBoss ? 60 : 45;
        if (!enemy.playerStealthed && dP < collisionDist * collisionDist) {
            const playerDied = player.takeDamage(enemy.collisionDmg, powerSystem.isInvulnerable);

            // v0.50.0 Scoring v2.2: applied damage → Perfect Run flag SET (Aura by zachowala streak).
            // Wczesnie tutaj zeby objac OBA path-e ponizej (regular kill + boss hit) jednym wywolaniem.
            if (!powerSystem.isInvulnerable) {
                currentSession.markDamageTaken();
            }

            if (!enemy.isBoss && !enemy.isMegaBoss) {
                // v0.50.0 Scoring v2.1: snapshot frozen state PRZED enemy.active = false.
                const wasFrozen = Date.now() < enemy.frozenUntil;

                effects.spawnExplosionAndWreck(enemy.x, enemy.y, enemy.tintHex);
                audio.playExplosion();
                handleEnemyDrop(enemy);
                enemy.active = false;
                spawnSystem.registerKill(enemy);
                // v0.49.0 Scoring v2: kolizja = przypadkowy kill (enemy wjechal w gracza),
                // NIE inkrementuje combo. Jezeli combo bylo aktywne, mnoznik dziala.
                currentSession.addKillScore(enemy.scoreValue);

                // v0.50.0 Scoring v2.1: ramming kill bonus (+100% baseValue) — swiadomy trade HP <-> score.
                currentSession.addCollisionKillBonus(enemy.scoreValue);

                // v0.50.0 Scoring v2.1: frozen + collision STACKUJA SIE.
                if (wasFrozen) {
                    currentSession.addFrozenKillBonus(enemy.scoreValue);
                }

                if (enemy.container.parent) enemy.container.parent.removeChild(enemy.container);
                enemy.container.destroy({ children: true });
            } else {
                if (!powerSystem.isInvulnerable) {
                    effects.shake(8, 10);
                    audio.playHit('player');
                }
            }
            if (playerDied) { triggerGameOver(); return; }
        }

        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (!b.active) continue;
            const hitDist = enemy.isMegaBoss ? 60 : enemy.isBoss ? 45 : 30;
            if ((b.x - enemy.x) ** 2 + (b.y - enemy.y) ** 2 < (hitDist + b.radius) ** 2) {
                const hitX = b.x, hitY = b.y;
                b.destroy();
                bullets.splice(j, 1);
                audio.playHit('enemy');

                // v0.45.0 FAZA 8.7: snapshot HP przed takeDamage żeby wykryć
                // czy damage faktycznie applied (NIE shielded). Shielded mega boss
                // hits NIE triggerują hit-stop (gold sparks tylko).
                const hpBefore = enemy.hp;
                const wasSuperShot = player.isSuperShotActive;
                // v0.50.0 Scoring v2.1: snapshot frozen state PRZED takeDamage (frozen kill bonus).
                const wasFrozen = Date.now() < enemy.frozenUntil;
                const killed = enemy.takeDamage(b.dmg, hitX, hitY, worldContainer, effects);
                const damageApplied = enemy.hp < hpBefore || killed;

                // v0.46.0 HP/DMG x100: floating damage numbers przy trafieniu (premium feel).
                // Tylko gdy damage faktycznie applied (shielded hit = brak liczby, gold sparks
                // z takeDamage wystarcza). Super shot = fioletowa liczba (motyw super), reszta biala.
                if (damageApplied) {
                    const dmgColor = wasSuperShot ? 0xc850ff : 0xffffff;
                    effects.spawnFloatingText(hitX, hitY - 15, `${Math.round(b.dmg)}`, dmgColor);
                }

                if (killed) {
                    audio.playExplosion();
                    spawnSystem.registerKill(enemy);
                    handleEnemyDrop(enemy);
                    if (enemy.isMegaBoss) setTimeout(() => triggerVictory(), 800);

                    // v0.49.0 Scoring v2 (opcja A): registerKill PRZED addKillScore.
                    // Drugi kill w serii dostaje comboMult=1.2 (DOUBLE) bo comboCount
                    // jest juz inkrementowane do 2 zanim addKillScore zapyta o mnoznik.
                    const comboNow = currentSession.registerKill(COMBO_WINDOW_MS);
                    currentSession.addKillScore(enemy.scoreValue);

                    // v0.50.0 Scoring v2.1: frozen kill bonus jezeli enemy byl zamrozony PRZED hit.
                    // Stackuje sie z combo (oba sa aplikowane do tego samego killa).
                    if (wasFrozen) {
                        currentSession.addFrozenKillBonus(enemy.scoreValue);
                    }

                    if (comboNow === 2) { hud.comboText = t('hud.comboDouble'); hud.comboTextTimer = 90; }
                    else if (comboNow === 3) { hud.comboText = t('hud.comboTriple'); hud.comboTextTimer = 100; }
                    else if (comboNow >= 4) { hud.comboText = t('hud.comboMega'); hud.comboTextTimer = 110; }
                }

                // v0.45.0 FAZA 8.7: trigger hit-stop based on event priority.
                // Mega boss DEATH (8) > Super shot KILL (4) > Mega boss HIT alive (3).
                // triggerHitStop() ma override logic (większa wartość wygrywa).
                if (damageApplied) {
                    if (killed && enemy.isMegaBoss) {
                        triggerHitStop(HITSTOP_MEGA_BOSS_DEATH);
                    } else if (killed && wasSuperShot) {
                        triggerHitStop(HITSTOP_SUPER_SHOT_KILL);
                    } else if (enemy.isMegaBoss) {
                        triggerHitStop(HITSTOP_MEGA_BOSS_HIT);
                    }
                }

                break;
            }
        }

        if (!enemy.active) enemies.splice(i, 1);
    }

    if (hud.comboTextTimer > 0) hud.comboTextTimer--;
    effects.update(delta);

    const megaBoss = enemies.find(e => e.isMegaBoss && e.active) || null;
    // v0.52.0 fix: force PIXI re-sort children co frame. PIXI sortableChildren=true
    // powinno robic auto-sort gdy zIndex sie zmienia (przez setter), ale przy zlozonych
    // scenach z dynamicznymi zIndex (budynki, billboardy, gracz, enemies, bullets, effects)
    // timing czasem rozjezdza sie z kolejnoscia update'ow. Manual sortChildren przed
    // hud.render() to O(n log n) dla ~60-100 dzieci = pomijalny perf, gwarantuje correct
    // pseudo-3D depth.
    // v0.60.0 TIER 3 — reset flagi strzalu po przetworzeniu (uzyta w neonStations.update next frame)
    neonDidShootLastFrame = false;
    worldContainer.sortChildren();
    hud.render(player, currentSession.score, spawnSystem.totalKills, mouse, spawnSystem, megaBoss, powerSystem);
});