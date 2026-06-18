import * as PIXI from 'pixi.js';
import './ui/menu-styles.css';  // FAZA 6.5.2b: CSS bundle dla MainMenu
import { WORLD_W, WORLD_H } from './config/constants';
import { BRAWLERS } from './config/brawlers';
import {
    buildCityTexture, CITY_BUILDINGS_LAYOUT, CyberBuilding,
    MEDI_PAD_POSITIONS, POWER_PAD_POSITIONS,
} from './maps/CityMap';
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
let patrolTractor: PatrolTractor | null = null;
let stable: Stable | null = null;
let paddock: Paddock | null = null;
let horses: Horse[] = [];
let quicksands: Quicksand[] = [];
let oases: Oasis[] = [];
let farmFields: IFarmField[] = [];
let caravan: Caravan | null = null;

let oasisStealthEndTime: number = 0;
let wasInOasisLastFrame: boolean = false;
let wasInCornLastFrame: boolean = false;
let wasStealthActiveLastFrame: boolean = false;
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

    if (result.powerId === 'aura') {
        hud.addNotif('🛡️ TARCZA AKTYWNA!', '#ffdd00');
        effects.shake(4, 6);
        audio.playSuperActivate('aura');
    } else if (result.powerId === 'megaBomb' && result.megaBombTargets) {
        effects.spawnMegaBomb(player.x, player.y);
        hud.addNotif(`💣 MEGA BOMBA — ${result.megaBombTargets.length} celów!`, '#ff4400');
        audio.playSuperActivate('megaBomb');

        for (const enemy of result.megaBombTargets) {
            const killed = enemy.takeDamage(MEGA_BOMB_CONFIG.damage, enemy.x, enemy.y, worldContainer, effects);
            if (killed) {
                spawnSystem!.registerKill(enemy);
                currentSession.score += enemy.scoreValue;
                handleEnemyDrop(enemy); // v0.44.0 FAZA 8.6
                if (enemy.isMegaBoss) setTimeout(() => triggerVictory(), 800);
            }
        }
    } else if (result.powerId === 'freeze' && result.freezeUntil !== undefined) {
        for (const enemy of enemies) {
            if (enemy.active) enemy.freeze(result.freezeUntil);
        }
        effects.spawnFreezeOverlay(300);
        hud.addNotif('❄️ MRÓZ NA WSZYSTKICH WROGACH!', '#66ddff');
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
        hud.addNotif(nowMuted ? '🔇 WYCISZONO' : '🔊 DŹWIĘK WŁ.', '#aaaaaa');
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
    patrolTractor = null;
    stable = null;
    paddock = null;
    horses = [];
    quicksands = [];
    oases = [];
    farmFields = [];
    caravan = null;

    oasisStealthEndTime = 0;
    wasInOasisLastFrame = false;
    wasInCornLastFrame = false;
    wasStealthActiveLastFrame = false;
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

        mediPads = MEDI_PAD_POSITIONS.map(p => new HoverRepairPad(p.x, p.y, worldContainer));
        powerPads = POWER_PAD_POSITIONS.map(p => new PowerHoverPad(p.x, p.y, worldContainer));
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
    }

    effects = new EffectsManager(worldContainer);
    spawnSystem = new SpawnSystem();
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

    const gameSeconds = currentSession?.getElapsedSeconds() ?? 0;
    const finalScore = currentSession?.score ?? 0;
    const cubesTotal = currentSession?.cubesTotal ?? 0;
    const dmgBonusPct = Math.round((currentSession?.dmgBonus ?? 0) * 100);
    const hpCubesPicked = currentSession?.hpCubesPicked ?? 0;
    const statsEl = document.getElementById('gameOverStats')!;

    const cubesLine = cubesTotal > 0
        ? `<div>🟦 PowerCube'y: <b>${cubesTotal}</b>${dmgBonusPct > 0 ? ` (+${dmgBonusPct}% DMG)` : ''}${hpCubesPicked > 0 ? ` (+${(hpCubesPicked * 0.25).toFixed(2)} HP)` : ''}</div>`
        : '';

    statsEl.innerHTML = `
        <div>💀 Killów: <b>${spawnSystem?.totalKills ?? 0}</b></div>
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
            <img src="${import.meta.env.BASE_URL}assets/gem.svg" alt="gem" style="width:36px;height:36px;">
            <span>Gemów: <b>${spawnSystem?.gemsCollected ?? 0}</b></span>
        </div>
        ${cubesLine}
        <div>⭐ Punkty: <b>${finalScore}</b></div>
        <div>⏱️ Czas: <b>${gameSeconds}s</b></div>
        <div>👑 Bossów zabitych: <b>${spawnSystem?.bossKills ?? 0}</b></div>
    `;
    document.getElementById('gameOverScreen')!.classList.add('active-screen');
    document.body.classList.remove('game-cursor-hidden');
    hud.clear();
}

async function triggerVictory(): Promise<void> {
    gameState = 'VICTORY';
    audio.playVictory();

    touchManager.hide();

    if (currentSession) {
        try {
            await scoreService.submitScore(currentSession.score, currentSession.config);
            console.log(`[Score] Submitted (Victory): ${currentSession.score} pts`);
        } catch (e) {
            console.warn('[Score] Submit failed:', e);
        }
    }

    const gameSeconds = currentSession?.getElapsedSeconds() ?? 0;
    const finalScore = currentSession?.score ?? 0;
    const cubesTotal = currentSession?.cubesTotal ?? 0;
    const dmgBonusPct = Math.round((currentSession?.dmgBonus ?? 0) * 100);
    const hpCubesPicked = currentSession?.hpCubesPicked ?? 0;
    const statsEl = document.getElementById('victoryStats')!;

    const cubesLine = cubesTotal > 0
        ? `<div>🟦 PowerCube'y: <b>${cubesTotal}</b>${dmgBonusPct > 0 ? ` (+${dmgBonusPct}% DMG)` : ''}${hpCubesPicked > 0 ? ` (+${(hpCubesPicked * 0.25).toFixed(2)} HP)` : ''}</div>`
        : '';

    statsEl.innerHTML = `
        <div>💀 Killów: <b>${spawnSystem?.totalKills ?? 0}</b></div>
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
            <img src="${import.meta.env.BASE_URL}assets/gem.svg" alt="gem" style="width:36px;height:36px;">
            <span>Gemów: <b>${spawnSystem?.gemsCollected ?? 0}</b></span>
        </div>
        ${cubesLine}
        <div>⭐ Punkty: <b>${finalScore}</b></div>
        <div>⏱️ Czas: <b>${gameSeconds}s</b></div>
        <div>👑 Bossów: <b>${spawnSystem?.bossKills ?? 0}</b></div>
        <div>🏆 Mega Boss: <b>POKONANY!</b></div>
    `;
    document.getElementById('victoryScreen')!.classList.add('active-screen');
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
    player.speedModifier = playerInQuicksand ? 0.5 : 1.0;

    for (const enemy of enemies) {
        let enemyInQuicksand = false;
        for (const qs of quicksands) {
            if (qs.isPointInside(enemy.x, enemy.y)) {
                enemyInQuicksand = true;
                break;
            }
        }
        enemy.speedModifier = enemyInQuicksand ? 0.5 : 1.0;
    }

    let playerInOasis = false;
    for (const oasis of oases) {
        oasis.update();
        if (oasis.isPointInside(player.x, player.y)) {
            playerInOasis = true;
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
    const playerInAnyStealth = playerInOasis || playerInFarmStealth;
    const wasInAnyStealthLastFrame = wasInOasisLastFrame || wasInCornLastFrame;

    if (playerInAnyStealth && !wasInAnyStealthLastFrame) {
        oasisStealthEndTime = nowMs + OASIS_STEALTH_DURATION_MS;
    }

    const isStealthActive = playerInAnyStealth && nowMs < oasisStealthEndTime;

    if (isStealthActive && !wasStealthActiveLastFrame) {
        if (playerInSugarcaneField && !playerInOasis) {
            hud.addNotif('🎋 UKRYTY W TRZCINIE (10s)!', '#a8d870');
        } else if (playerInCornField && !playerInOasis) {
            hud.addNotif('🌾 UKRYTY W KUKURYDZY (10s)!', '#d4b830');
        } else {
            hud.addNotif('🌴 NIEWIDZIALNY (10s)!', '#a8c878');
        }
        audio.playMagnetPickup();
    } else if (!isStealthActive && wasStealthActiveLastFrame && playerInAnyStealth) {
        hud.addNotif('👁️ ZOSTAŁEŚ ZAUWAŻONY!', '#ff8855');
        effects.shake(3, 8);
    }

    for (const enemy of enemies) {
        enemy.playerStealthed = isStealthActive;
    }

    wasInOasisLastFrame = playerInOasis;
    wasInCornLastFrame = playerInFarmStealth;
    wasStealthActiveLastFrame = isStealthActive;

    if (river) river.update();
    if (waterLife) waterLife.update();
    if (sandstormBorder) sandstormBorder.update();
    if (tropicalBorder) tropicalBorder.update();
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
                hud.addNotif('🐪 Karawana dropiła 💎', '#d97e3a');
            } else if (drop.type === 'heart') {
                hearts.push(new Heart(drop.x, drop.y, worldContainer));
                hud.addNotif('🐪 Karawana dropiła ❤️', '#d97e3a');
            } else if (drop.type === 'magnet') {
                magnets.push(new Magnet(drop.x, drop.y, worldContainer));
                hud.addNotif('🐪 Karawana dropiła 🧲', '#d97e3a');
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
            player.hp = Math.min(player.maxHp, player.hp + 1);
            effects.spawnEnemyHitSparks(player.x, player.y, 0x2ecc71);
            hud.addNotif('🔧 +1 HP', '#2ecc71');
            audio.playHeartPickup();
        }
    }
    for (const pad of powerPads) {
        const result = pad.update(player.x, player.y, time);
        if (result.activated) {
            player.applyTurboBoost(result.durationMs, result.multiplier);
            effects.spawnEnemyHitSparks(player.x, player.y, 0xff6600);
            effects.shake(5, 8);
            hud.addNotif('⚡ TURBO ×2 — 5s!', '#ffcc00');
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
                hud.addNotif(`❤️ +${h.healAmount} HP`, '#ff3366');
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
                currentSession.score += 1;
                audio.playGemPickup();

                const prevTrigger = Math.floor(prevTotal / GEMS_PER_SUPER_CHARGE_TRIGGER);
                const newTrigger = Math.floor(spawnSystem.gemsCollected / GEMS_PER_SUPER_CHARGE_TRIGGER);
                if (newTrigger > prevTrigger) {
                    player.addSuperCharge(SUPER_CHARGES_PER_TRIGGER);
                    hud.addNotif(`⚡ +${SUPER_CHARGES_PER_TRIGGER} SUPER STRZAŁY! (×${player.superCharges})`, '#c850ff');
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
                hud.addNotif('🧲 MAGNET 5s!', '#e74c3c');
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
            b1.dmg *= dmgMultiplier;
            b2.dmg *= dmgMultiplier;
            b3.dmg *= dmgMultiplier;
            bullets.push(b1, b2, b3);
        } else {
            const b = new Bullet(sX, sY, angle, player.brawler, worldContainer, isSuperShot);
            b.dmg *= dmgMultiplier;
            bullets.push(b);
            if (isSuperShot) {
                const b1 = new Bullet(sX, sY, angle - 0.1, player.brawler, worldContainer, isSuperShot);
                const b2 = new Bullet(sX, sY, angle + 0.1, player.brawler, worldContainer, isSuperShot);
                b1.dmg *= dmgMultiplier;
                b2.dmg *= dmgMultiplier;
                bullets.push(b1, b2);
            }
        }
        lastShotTime = now;
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

            if (!enemy.isBoss && !enemy.isMegaBoss) {
                effects.spawnExplosionAndWreck(enemy.x, enemy.y, enemy.tintHex);
                audio.playExplosion();
                handleEnemyDrop(enemy);
                enemy.active = false;
                spawnSystem.registerKill(enemy);
                currentSession.score += enemy.scoreValue;
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
                const killed = enemy.takeDamage(b.dmg, hitX, hitY, worldContainer, effects);
                const damageApplied = enemy.hp < hpBefore || killed;

                if (killed) {
                    audio.playExplosion();
                    spawnSystem.registerKill(enemy);
                    currentSession.score += enemy.scoreValue;
                    handleEnemyDrop(enemy);
                    if (enemy.isMegaBoss) setTimeout(() => triggerVictory(), 800);

                    const comboNow = currentSession.registerKill(COMBO_WINDOW_MS);
                    if (comboNow === 2) { hud.comboText = 'DOUBLE!'; hud.comboTextTimer = 90; }
                    else if (comboNow === 3) { hud.comboText = 'TRIPLE!'; hud.comboTextTimer = 100; }
                    else if (comboNow >= 4) { hud.comboText = 'MEGA KILL! 💥'; hud.comboTextTimer = 110; }
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
    hud.render(player, currentSession.score, spawnSystem.totalKills, mouse, spawnSystem, megaBoss, powerSystem);
});