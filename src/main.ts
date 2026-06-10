import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from './config/constants';
import { BRAWLERS } from './config/brawlers';
import type { Brawler } from './types/Brawler';
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
import { MAP_CONFIGS, getMapIdFromUrl, type MapId, type ICollidable } from './types/MapType';
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
import { PICKUP_CONFIG, MEGA_BOMB_CONFIG } from './config/powers';
import { AudioSys } from './audio/AudioSys';

// === FAZA 6.5.1: Config + Session architecture ===
import { GameConfigBuilder, describeGameConfig, type GameConfig } from './types/GameConfig';
import { GameSession } from './services/GameSession';
import { scoreService } from './services/ScoreService';
import { sessionService } from './services/SessionService';
import { SCENARIO_CONFIGS } from './types/Scenario';
import { t } from './i18n/i18n';

const GEMS_PER_SUPER_CHARGE_TRIGGER = 10;
const SUPER_CHARGES_PER_TRIGGER = 3;
const COMBO_WINDOW_MS = 2000;

const OASIS_STEALTH_DURATION_MS = 10000;

// === Legacy menu selection state (FAZA 6.5.2b zlikwiduje gdy MainMenu wpiety) ===
// Te dwa zostaja TYLKO dla legacy welcomeScreen UI (charGrid + mapBadge).
// NIE sa juz uzywane w game loop — gameplay czyta z currentSession.config.
let selectedBrawler: Brawler = BRAWLERS[0];
let selectedMapId: MapId = getMapIdFromUrl();
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
let caravan: Caravan | null = null;

// Frame-transient state
let oasisStealthEndTime: number = 0;
let wasInOasisLastFrame: boolean = false;
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

const charGrid = document.getElementById('charGrid')!;
BRAWLERS.forEach(b => {
    const div = document.createElement('div');
    div.className = `select-card ${b.id === selectedBrawler.id ? 'selected' : ''}`;
    div.innerHTML = `
        <div style="width:100%; height:130px; position:relative; border-radius:10px; overflow:hidden; border:2px solid ${b.colorMain}; background: #1a1a2e;">
            <img src="${b.icon}" alt="${b.name}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:1;">
        </div>
        <div class="name" style="background:${b.colorMain};border-radius:8px;padding:4px 2px;margin-top:8px;">${b.emoji} ${b.name}</div>
        <div class="card-stats-row">
            <span class="card-stat">❤️ ${b.hp}</span>
            <span class="card-stat">⚡ ${b.speed}</span>
            <span class="card-stat">💥 ${b.dmg}</span>
        </div>
    `;
    div.onclick = () => {
        document.querySelectorAll('.char-grid .select-card').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        selectedBrawler = b;
    };
    charGrid.appendChild(div);
});

const mapBadge = document.createElement('div');
mapBadge.style.cssText = 'position:fixed;bottom:14px;right:14px;padding:6px 12px;background:rgba(0,0,0,0.65);color:#fff;border-radius:8px;font-family:sans-serif;font-size:13px;z-index:100;pointer-events:none;transition:opacity 0.6s ease-out;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
mapBadge.innerHTML = `🗺️ Mapa: <b style="color:${MAP_CONFIGS[selectedMapId].badge}">${MAP_CONFIGS[selectedMapId].name}</b>`;
document.body.appendChild(mapBadge);

setTimeout(() => {
    mapBadge.style.opacity = '0';
    setTimeout(() => mapBadge.remove(), 700);
}, 10000);

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
    if (e.button === 0) isMouseDown = true;
});
(app.view as HTMLCanvasElement).addEventListener('pointerup', () => { isMouseDown = false; });
(app.view as HTMLCanvasElement).addEventListener('pointerupoutside' as any, () => { isMouseDown = false; });

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
 * FAZA 6.5.2a: Build GameConfig from legacy menu state (welcomeScreen + URL).
 * Wywolywane przez 3 click handlers (startBtn/playAgainBtn/retryBtn) ktore
 * legacy menu produkuje. Po FAZA 6.5.2b MainMenu zastapi te handlery i
 * dostarczy juz pelny config z user-selected scenariusz/difficulty.
 */
function buildLegacyConfig(): GameConfig {
    return new GameConfigBuilder()
        .setScenario('ktb')
        .setMap(selectedMapId)
        .setDifficulty('normal')
        .setBrawlerId(selectedBrawler.id)
        .setMode('solo')
        .build();
}

/**
 * FAZA 6.5.2a: startGame teraz przyjmuje immutable GameConfig jako argument.
 * Single source of truth dla gameplay — selectedMapId/selectedBrawler nie sa
 * juz potrzebne wewnatrz (config.map / config.brawlerId zastapily).
 *
 * Wywolywane przez:
 *  - Legacy handlers: startGame(buildLegacyConfig())
 *  - FAZA 6.5.2b: MainMenu.onGameRequested -> startGame(config)
 *  - FAZA 6.5.2c: MainMenu.onContinueRequested -> startGame(rebuiltConfigFromLastSession)
 */
function startGame(config: GameConfig): void {
    document.getElementById('welcomeScreen')!.classList.remove('active-screen');
    document.getElementById('victoryScreen')!.classList.remove('active-screen');
    document.getElementById('gameOverScreen')!.classList.remove('active-screen');
    document.body.classList.add('game-cursor-hidden');
    
    // === FAZA 6.5.1: GameSession wraps immutable config + tracks runtime state ===
    currentSession = new GameSession(config);
    console.log(describeGameConfig(config));
    
    // === FAZA 6.5.1: Save last session snapshot dla MainHub "Kontynuuj" ===
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
    caravan = null;
    
    oasisStealthEndTime = 0;
    wasInOasisLastFrame = false;
    wasStealthActiveLastFrame = false;
    sandKickFrameCounter = 0;
    
    // === Map setup — czyta z config.map (NIE selectedMapId) ===
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
    }
    
    effects = new EffectsManager(worldContainer);
    spawnSystem = new SpawnSystem();
    powerSystem = new PowerSystem(worldContainer);
    
    // === Player setup — z config.brawlerId (lookup z BRAWLERS array) ===
    const brawler = BRAWLERS.find(b => b.id === config.brawlerId) ?? BRAWLERS[0];
    player = new Player(brawler, worldContainer);
    
    enemies = [];
    bullets = [];
    enemyBullets = [];
    hearts = [];
    gems = [];
    magnets = [];
    isMouseDown = false;
    gameState = 'PLAYING';
    
    // === Music — z config.map ===
    audio.startMusic(config.map);
}

// === FAZA 6.5.2a: Legacy handlers buduja config z legacy state + przekazuja do startGame ===
// FAZA 6.5.2b zastapi te 3 listenery przez MainMenu.onGameRequested wiring.
document.getElementById('startBtn')!.addEventListener('click', () => startGame(buildLegacyConfig()));
document.getElementById('playAgainBtn')!.addEventListener('click', () => startGame(buildLegacyConfig()));
document.getElementById('retryBtn')!.addEventListener('click', () => startGame(buildLegacyConfig()));

async function triggerGameOver(): Promise<void> {
    gameState = 'GAMEOVER';
    audio.playGameOver();
    
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
    
    camera.x = Math.max(0, Math.min(WORLD_W - hud.screenW, ~~(player.x - hud.screenW / 2)));
    camera.y = Math.max(0, Math.min(WORLD_H - hud.screenH, ~~(player.y - hud.screenH / 2)));
    worldContainer.x = -camera.x + effects.shakeOffsetX;
    worldContainer.y = -camera.y + effects.shakeOffsetY;
    
    const mouseWorldX = mouse.screenX + camera.x;
    const mouseWorldY = mouse.screenY + camera.y;
    
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
    
    const nowMs = Date.now();
    
    if (playerInOasis && !wasInOasisLastFrame) {
        oasisStealthEndTime = nowMs + OASIS_STEALTH_DURATION_MS;
    }
    
    const isStealthActive = playerInOasis && nowMs < oasisStealthEndTime;
    
    if (isStealthActive && !wasStealthActiveLastFrame) {
        hud.addNotif('🌴 NIEWIDZIALNY (10s)!', '#a8c878');
        audio.playMagnetPickup();
    } else if (!isStealthActive && wasStealthActiveLastFrame && playerInOasis) {
        hud.addNotif('👁️ ZOSTAŁEŚ ZAUWAŻONY!', '#ff8855');
        effects.shake(3, 8);
    }
    
    for (const enemy of enemies) {
        enemy.playerStealthed = isStealthActive;
    }
    
    wasInOasisLastFrame = playerInOasis;
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
    
    buildings.forEach(b => b.update(camera.x, camera.y, hud.screenW, hud.screenH));
    
    player.update(keys, mouseWorldX, mouseWorldY, buildings, effects);
    
    // FAZA 6.5.2a: sand kick check uses currentSession.config.map (NIE selectedMapId)
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