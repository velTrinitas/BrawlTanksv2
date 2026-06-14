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
    TROPICS_CORN_LAYOUT,
    TROPICS_DIRT_ROAD_PATHS,
    TROPICS_FARM_BUILDINGS_LAYOUT,
} from './maps/TropicsMap';
import { CornField } from './maps/tropics/CornField';
import { DirtRoad } from './maps/tropics/DirtRoad';
import { BarnBuilding } from './maps/tropics/BarnBuilding';
import { Pyramid } from './maps/desert/Pyramid';
import { DesertHeartPad } from './maps/desert/DesertHeartPad';
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
import { GameSession } from './services/GameSession';
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

// === FAZA 8.5: Mobile touch controls ===
import { TouchInputManager } from './input/TouchInputManager';

const GEMS_PER_SUPER_CHARGE_TRIGGER = 10;
const SUPER_CHARGES_PER_TRIGGER = 3;
const COMBO_WINDOW_MS = 2000;

const OASIS_STEALTH_DURATION_MS = 10000;

// v0.23.1: world zoom dla mobile (kompensuje smaller screen + zwieksza viewable area)
const MOBILE_WORLD_ZOOM = 0.7;
const DESKTOP_WORLD_ZOOM = 1.0;

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
let mediPads: Array<HoverRepairPad | DesertHeartPad> = [];
let powerPads: Array<PowerHoverPad | DesertStormPad> = [];
let river: RiverNile | null = null;
let bridges: Bridge[] = [];
let waterLife: WaterLife | null = null;
let smallRocks: Rock[] = [];
let sandstormBorder: SandstormBorder | null = null;
let quicksands: Quicksand[] = [];
let oases: Oasis[] = [];
let cornFields: CornField[] = [];
let caravan: Caravan | null = null;

// Frame-transient state
let oasisStealthEndTime: number = 0;
let wasInOasisLastFrame: boolean = false;
let wasInCornLastFrame: boolean = false;
let wasStealthActiveLastFrame: boolean = false;
let sandKickFrameCounter: number = 0;

let buildings: ICollidable[] = [];
let solidBuildings: ICollidable[] = [];
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

// ============================================================
// FAZA 6.5.2b: MainMenu bootstrap
// ============================================================
const menu = new MainMenu('#bt-menu-root');

// ============================================================
// FAZA 8.5 + v0.23.1: Touch controls dla mobile
// ============================================================
const touchManager = new TouchInputManager();
touchManager.init();
touchManager.onSuperRequested = () => {
    tryActivateSuper();
};
// v0.23.1: long-press SuperButton → cycle do next power
touchManager.onCycleRequested = () => {
    if (powerSystem) {
        powerSystem.cycleSelected(1);
    }
};

// v0.23.1: jeśli touch active — apply mobile gameplay tweaks do HUD
if (touchManager.isActive) {
    hud.uiScale = 0.7;             // mniejsze pille HUD
    hud.showCrosshair = true;      // v0.23.1 hotfix: crosshair JEST potrzebny na mobile (precyzja celowania)
    hud.crosshairScale = 1.5;      // wiekszy crosshair (dalej od ręki gracza, trzeba lepiej widoczny)
    hud.showPowerBar = false;      // SuperButton zastepuje dolny power bar
}

menu.onGameRequested = (config: GameConfig) => {
    // FAZA 6.5.2b-fix2: defensive guard dla scenariuszy CTF/Castle
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

// FAZA 8a: settings screen wired up (zamiast console.log placeholder)
menu.onSettingsRequested = () => {
    menu.show('settings');
};

// ============================================================
// FAZA 7a + FAZA 8a: Async bootstrap
// - Preload profile sprite cache
// - Sync i18n z active profile language (per-profile wygrywa nad device-wide localStorage)
// ============================================================
(async () => {
    try {
        await ProfileSpriteCache.init(app);
        console.log('[boot] ProfileSpriteCache ready (4 avatars + 4 flags cached)');

        const profile = ProfileService.getActiveProfile();
        if (profile) {
            console.log(`[boot] Active profile: ${profile.avatarId} (flag=${profile.flagId})`);

            // FAZA 8a: sync i18n z active profile language (per-profile wygrywa nad localStorage device-wide)
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

    menu.start();
})();

// === FAZA 7a: Dev-only services exposure dla smoke testing ===
if (import.meta.env.DEV) {
    (window as unknown as { BT_DEV: unknown }).BT_DEV = {
        ProfileService,
        ProfileSpriteCache,
        AudioSys,
        i18n,
    };
    console.log('[FAZA 7a/8a] window.BT_DEV attached — use for smoke testing');
}

/**
 * v0.23.1: silently lock orientation to landscape (best-effort).
 * Działa tylko gdy app jest installed jako PWA + przegladarka supports orientation lock API.
 * Wszystkie inne scenariusze → no-op (CSS portrait warning overlay zastepuje).
 */
async function tryLockLandscape(): Promise<void> {
    try {
        const orient = (screen as Screen & { orientation?: { lock?: (orientation: string) => Promise<void> } }).orientation;
        if (orient?.lock) {
            await orient.lock('landscape');
            console.log('[v0.23.1] screen.orientation locked to landscape');
        }
    } catch {
        // Silently fail — orientation lock requires PWA installed mode + Chrome/Edge
        // CSS portrait overlay handles fallback
    }
}

/**
 * FAZA 6.5.2b: Po endgame uzytkownik wraca do MainHub.
 */
function returnToMenuFromEnd(): void {
    document.getElementById('victoryScreen')!.classList.remove('active-screen');
    document.getElementById('gameOverScreen')!.classList.remove('active-screen');
    document.body.classList.remove('game-cursor-hidden');
    gameState = 'MENU';
    currentSession = null;

    // FAZA 8.5: ukryj touch UI po powrocie do menu
    touchManager.hide();

    audio.stopMusic();

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
                dropGems(enemy.x, enemy.y, enemy.getGemDropCount());
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
    // FAZA 8.5: ignore canvas mouse events when touch UI active (touchManager wins)
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
 * FAZA 6.5.2a: startGame przyjmuje immutable GameConfig.
 * FAZA 7c: ProfileService.recordSessionStart + Player flag override.
 * FAZA 8.5: touchManager.show() po setup.
 * v0.23.1: tryLockLandscape + apply world zoom mobile.
 */
function startGame(config: GameConfig): void {
    document.getElementById('victoryScreen')!.classList.remove('active-screen');
    document.getElementById('gameOverScreen')!.classList.remove('active-screen');
    document.body.classList.add('game-cursor-hidden');

    currentSession = new GameSession(config);

    // FAZA 7c: track per-profile play stats (totalGamesPlayed + lastPlayedAt)
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
    river = null;
    bridges = [];
    waterLife = null;
    smallRocks = [];
    sandstormBorder = null;
    quicksands = [];
    oases = [];
    cornFields = [];
    caravan = null;

    oasisStealthEndTime = 0;
    wasInOasisLastFrame = false;
    wasInCornLastFrame = false;
    wasStealthActiveLastFrame = false;
    sandKickFrameCounter = 0;

    // v0.23.1: apply world zoom (mobile = 0.7, desktop = 1.0)
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
        // ── TROPICS MAP — FAZA T2 (v0.26.0) ─────────────────────────
        // Base texture + pady + STEALTH CORN FIELDS (pola kukurydzy).
        // FAZA T3-T10 doda: drogi, budynki, domki, wiatrak, skrzynie,
        // drzewa, stajnie, stawy.
        const tropicsTex = buildTropicsTexture();
        const tropicsSprite = new PIXI.Sprite(tropicsTex);
        tropicsSprite.zIndex = -100;
        worldContainer.addChild(tropicsSprite);

        // Stealth corn fields — analogiczne do desert Oasis,
        // reuse oasisStealthEndTime + enemy.playerStealthed (10s timer).
        // FAZA T3: Drogi szutrowe — renderowane PRZED corn fields zeby
        // corn ground patches mogly je przykryc przy nakładaniu się
        TROPICS_DIRT_ROAD_PATHS.forEach((waypoints, i) => {
            new DirtRoad(waypoints, worldContainer, 17 + i * 7);
        });

        cornFields = TROPICS_CORN_LAYOUT.map(cf =>
            new CornField(cf.x, cf.y, cf.w, cf.h, cf.seed, worldContainer),
        );

        // FAZA T4: Farm buildings (stodoła + kurnik + obora) — ICollidable
        for (const fb of TROPICS_FARM_BUILDINGS_LAYOUT) {
            let building: BarnBuilding | null = null;
            if (fb.type === 'barn') {
                building = new BarnBuilding(fb.x, fb.y, fb.w, fb.h, fb.seed, worldContainer);
            }
            // T4b/T4c: dodać 'henhouse' i 'cowshed' branches
            if (building) {
                buildings.push(building);
                solidBuildings.push(building);
                // v0.32.8: Add extra collidables (side wall sticking-out 32px za x+w)
                for (const extra of building.getExtraCollidables()) {
                    buildings.push(extra);
                    solidBuildings.push(extra);
                }
            }
        }

        // Pady — reuse generic HoverRepairPad + PowerHoverPad (city-style)
        // FAZA T10 zastapi custom tropics pads
        mediPads = TROPICS_MEDI_PAD_POSITIONS.map(p => new HoverRepairPad(p.x, p.y, worldContainer));
        powerPads = TROPICS_POWER_PAD_POSITIONS.map(p => new PowerHoverPad(p.x, p.y, worldContainer));
    }

    effects = new EffectsManager(worldContainer);
    spawnSystem = new SpawnSystem();
    powerSystem = new PowerSystem(worldContainer);

    const brawler = BRAWLERS.find(b => b.id === config.brawlerId) ?? BRAWLERS[0];

    // FAZA 7c: profile flag override - gracz nosi swoja flage zamiast brawler default
    const activeProfile = ProfileService.getActiveProfile();
    player = new Player(brawler, worldContainer, activeProfile?.flagId ?? null);

    enemies = [];
    bullets = [];
    enemyBullets = [];
    hearts = [];
    gems = [];
    magnets = [];
    isMouseDown = false;
    gameState = 'PLAYING';

    // FAZA 8.5: pokaz touch UI gdy gracz wchodzi do gry
    touchManager.show();

    // v0.23.1: best-effort landscape orientation lock (silently fails na desktop / non-PWA)
    if (touchManager.isActive) {
        tryLockLandscape();
    }

    audio.startMusic(config.map);
}

async function triggerGameOver(): Promise<void> {
    gameState = 'GAMEOVER';
    audio.playGameOver();

    // FAZA 8.5: ukryj touch UI na endgame screens
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
    const statsEl = document.getElementById('gameOverStats')!;
    statsEl.innerHTML = `
        <div>💀 Killów: <b>${spawnSystem?.totalKills ?? 0}</b></div>
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
            <img src="${import.meta.env.BASE_URL}assets/gem.svg" alt="gem" style="width:36px;height:36px;">
            <span>Gemów: <b>${spawnSystem?.gemsCollected ?? 0}</b></span>
        </div>
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

    // FAZA 8.5: ukryj touch UI na endgame screens
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
    const statsEl = document.getElementById('victoryStats')!;
    statsEl.innerHTML = `
        <div>💀 Killów: <b>${spawnSystem?.totalKills ?? 0}</b></div>
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
            <img src="${import.meta.env.BASE_URL}assets/gem.svg" alt="gem" style="width:36px;height:36px;">
            <span>Gemów: <b>${spawnSystem?.gemsCollected ?? 0}</b></span>
        </div>
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

    // v0.23.1: world zoom — viewport widzi 1/zoom razy więcej świata.
    const ZOOM = touchManager.isActive ? MOBILE_WORLD_ZOOM : DESKTOP_WORLD_ZOOM;
    const viewW = hud.screenW / ZOOM;
    const viewH = hud.screenH / ZOOM;

    camera.x = Math.max(0, Math.min(WORLD_W - viewW, ~~(player.x - viewW / 2)));
    camera.y = Math.max(0, Math.min(WORLD_H - viewH, ~~(player.y - viewH / 2)));

    // World container positioned z uwzglednieniem zoom (multiplikacja przez ZOOM)
    worldContainer.x = -camera.x * ZOOM + effects.shakeOffsetX;
    worldContainer.y = -camera.y * ZOOM + effects.shakeOffsetY;

    // ============================================================
    // FAZA 8.5 + v0.23.1: Touch input bridge
    // ============================================================
    let touchMoveVector: { x: number; y: number } | null = null;
    if (touchManager.isActive) {
        // Update super button visual feedback per-frame
        touchManager.updateSuperChargedVisual(powerSystem.canActivate());

        // v0.23.1: update selected power icon (🛡️ / 💣 / ❄️)
        const selectedPower = POWERS[powerSystem.selectedPowerId];
        touchManager.updateSelectedPower(selectedPower.emoji);

        // Bridge super-shot tap → tryActivateSuper (edge-triggered)
        if (touchManager.consumeSuperRequest()) {
            tryActivateSuper();
        }

        // Left joystick → moveVector (passed to player.update)
        touchMoveVector = touchManager.moveVector;

        // Right joystick → fake mouse position + isFiring flag
        const aimVec = touchManager.aimVector;
        if (aimVec) {
            // Project aim vector ~200px from player in screen space (uwzgledniajac zoom)
            const AIM_DISTANCE = 200;
            mouse.screenX = (player.x - camera.x) * ZOOM + aimVec.x * AIM_DISTANCE;
            mouse.screenY = (player.y - camera.y) * ZOOM + aimVec.y * AIM_DISTANCE;
        }

        // v0.23.1 hotfix: crosshair visibility zalezne od aim joystick state
        // (widoczny gdy palec na prawym sticku, ukryty po release — nie wisi w starym miejscu)
        hud.showCrosshair = aimVec !== null;

        // Continuous fire while right stick active (decision B1: aim+fire combined)
        isMouseDown = touchManager.isFiring;
    }

    // v0.23.1: mouse → world coordinate conversion uwzglednia zoom
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

    // FAZA T2: CornField stealth — analogiczne do Oasis, reuse oasisStealthEndTime
    let playerInCornField = false;
    for (const cf of cornFields) {
        cf.update();
        // v0.27.5: Sok — kukurydza rozchyla sie wokol czolga (per-frame check
        // z quick-reject by bounds w onTankEnter, tani dla pol poza zasiegiem)
        cf.onTankEnter(player.x, player.y);
        if (cf.isPointInside(player.x, player.y)) {
            playerInCornField = true;
        }
    }

    const nowMs = Date.now();
    const playerInAnyStealth = playerInOasis || playerInCornField;
    const wasInAnyStealthLastFrame = wasInOasisLastFrame || wasInCornLastFrame;

    if (playerInAnyStealth && !wasInAnyStealthLastFrame) {
        oasisStealthEndTime = nowMs + OASIS_STEALTH_DURATION_MS;
    }

    const isStealthActive = playerInAnyStealth && nowMs < oasisStealthEndTime;

    if (isStealthActive && !wasStealthActiveLastFrame) {
        // Differentiated notif: zboze vs oaza (oaza wygrywa jak oba)
        if (playerInCornField && !playerInOasis) {
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
    wasInCornLastFrame = playerInCornField;
    wasStealthActiveLastFrame = isStealthActive;

    if (river) river.update();
    if (waterLife) waterLife.update();
    if (sandstormBorder) sandstormBorder.update();

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

    // FAZA 8.5: passed touchMoveVector jako 6-th arg (null = fallback do keys.wasd)
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

        if (player.brawler.type === 'spread') {
            bullets.push(new Bullet(sX, sY, angle - 0.2, player.brawler, worldContainer, isSuperShot));
            bullets.push(new Bullet(sX, sY, angle, player.brawler, worldContainer, isSuperShot));
            bullets.push(new Bullet(sX, sY, angle + 0.2, player.brawler, worldContainer, isSuperShot));
        } else {
            bullets.push(new Bullet(sX, sY, angle, player.brawler, worldContainer, isSuperShot));
            if (isSuperShot) {
                bullets.push(new Bullet(sX, sY, angle - 0.1, player.brawler, worldContainer, isSuperShot));
                bullets.push(new Bullet(sX, sY, angle + 0.1, player.brawler, worldContainer, isSuperShot));
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
    enemies.push(...spawnResult.newEnemies);
    hearts.push(...spawnResult.newHearts);
    magnets.push(...spawnResult.newMagnets);
    if (spawnResult.megaBossJustSpawned) hud.triggerMegaBossAlert();

    powerSystem.update(delta, player, enemies, worldContainer, effects);

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        const shotInfo = enemy.update(delta, player.x, player.y, buildings);
        if (shotInfo) spawnEnemyShot(shotInfo);

        const dP = (player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2;
        const collisionDist = enemy.isMegaBoss ? 80 : enemy.isBoss ? 60 : 45;
        if (!enemy.playerStealthed && dP < collisionDist * collisionDist) {
            const playerDied = player.takeDamage(enemy.collisionDmg, powerSystem.isInvulnerable);

            if (!enemy.isBoss && !enemy.isMegaBoss) {
                effects.spawnExplosionAndWreck(enemy.x, enemy.y, enemy.tintHex);
                audio.playExplosion();
                dropGems(enemy.x, enemy.y, enemy.getGemDropCount());
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
                const killed = enemy.takeDamage(b.dmg, hitX, hitY, worldContainer, effects);
                if (killed) {
                    audio.playExplosion();
                    spawnSystem.registerKill(enemy);
                    currentSession.score += enemy.scoreValue;
                    dropGems(enemy.x, enemy.y, enemy.getGemDropCount());
                    if (enemy.isMegaBoss) setTimeout(() => triggerVictory(), 800);

                    const comboNow = currentSession.registerKill(COMBO_WINDOW_MS);
                    if (comboNow === 2) { hud.comboText = 'DOUBLE!'; hud.comboTextTimer = 90; }
                    else if (comboNow === 3) { hud.comboText = 'TRIPLE!'; hud.comboTextTimer = 100; }
                    else if (comboNow >= 4) { hud.comboText = 'MEGA KILL! 💥'; hud.comboTextTimer = 110; }
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