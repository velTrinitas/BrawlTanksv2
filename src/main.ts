import * as PIXI from 'pixi.js';
import './ui/menu-styles.css';  // FAZA 6.5.2b: CSS bundle dla MainMenu
import { WORLD_W, WORLD_H } from './config/constants';
import { BRAWLERS } from './config/brawlers';
import { getBrawlerTextures, BAKER_ENABLED } from './rendering/SpriteFactory';
import { TankSpriteBaker } from './rendering/TankSpriteBaker';
import { BulletSpriteBaker } from './rendering/BulletSpriteBaker'; // FAZA P2
import { EnemySpriteBaker } from './rendering/EnemySpriteBaker'; // FAZA P4
import { EnemyBulletSpriteBaker } from './rendering/EnemyBulletSpriteBaker'; // FAZA P4
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
import {
    buildFortifiedRuinsTexture,
    FORTIFIED_FORTRESS_WALLS, FORTIFIED_ROCKS_LAYOUT,
    FORTIFIED_BUSHES_LAYOUT, FORTIFIED_LAKES_LAYOUT,
    FORTIFIED_FOSA_RECT, FORTIFIED_BRIDGE_RECT,
    FORTIFIED_HANGAR_RECT, FORTIFIED_PLAYER_SPAWN,
    FORTIFIED_MEDI_PAD_POSITIONS, FORTIFIED_POWER_PAD_POSITIONS, // FAZA F4.2
} from './maps/FortifiedRuinsMap'; // FAZA CTF F1
import { RuinsBorder } from './maps/fortified/RuinsBorder';   // FAZA CTF F1
import { RuinBlock } from './maps/fortified/RuinBlock';       // FAZA CTF F1
import { RuinsFosa } from './maps/fortified/RuinsFosa';       // FAZA CTF F1
import { RuinsBush } from './maps/fortified/RuinsBush';       // FAZA CTF F1
import { RuinsLake } from './maps/fortified/RuinsLake';       // FAZA CTF F1
import { RuinsHangar } from './maps/fortified/RuinsHangar';   // FAZA CTF F1
import { RuinsMediPad } from './maps/fortified/RuinsMediPad'; // FAZA F4.2
import { RuinsPowerPad } from './maps/fortified/RuinsPowerPad'; // FAZA F4.2
import { CtfSystem } from './systems/ctf/CtfSystem';          // FAZA CTF F2
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
import { ENEMY_NORMAL, ENEMY_PURSUIT } from './config/enemies'; // v0.58.0 Warstwa C2; FAZA B tutorial dummy/wave
import { Bullet } from './entities/Bullet';
import { EnemyBullet } from './entities/EnemyBullet';
import { Heart } from './entities/pickups/Heart';
import { Gem } from './entities/pickups/Gem';
import { Magnet } from './entities/pickups/Magnet';
import { PowerCube } from './entities/pickups/PowerCube'; // v0.44.0 FAZA 8.6
import { HoverRepairPad } from './maps/HoverRepairPad';
import { PowerHoverPad } from './maps/PowerHoverPad';
import { HUD, type HudCtfInfo } from './rendering/HUD';
import { EffectsManager } from './rendering/Effects';
import { SpawnSystem } from './systems/Spawn';
import { PowerSystem } from './systems/PowerSystem';
import { PICKUP_CONFIG, MEGA_BOMB_CONFIG, POWERS } from './config/powers';
import { AudioSys } from './audio/AudioSys';

// === FAZA 6.5.1: Config + Session architecture ===
import { GameConfigBuilder, describeGameConfig, type GameConfig } from './types/GameConfig';
import { TutorialController } from './tutorial/TutorialController'; // FAZA A — onboarding
import { ItemHints } from './tutorial/ItemHints'; // just-in-time podpowiedzi przedmiotow/stref
import { showModeGoal, clearModeGoal } from './tutorial/GoalCard'; // FAZA C — karta celu trybu
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
// v0.69.0: default 0.7 -> 0.6 = +36% widocznej mapy (Mariusz gra mobile, chce widziec wiecej).
// Cena: sprite'y -14.3% na ekranie (375px gate) + wiecej kafli w viewport (fill-rate). Walidacja
// na realnym Androidzie. Override do strojenia bez rebuilda: ?zoom=0.55 / 0.65 itd. (clamp 0.4..1.0).
const MOBILE_WORLD_ZOOM = (() => {
    const q = parseFloat(new URLSearchParams(window.location.search).get('zoom') ?? '');
    return q >= 0.4 && q <= 1.0 ? q : 0.6;
})();
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

// === FAZA P2 Sprite Baker — Warstwa 2: lab super layouts (TYLKO ?baker=1 + super) ===
// Flat path i normal fire NIETKNIETE. Zatwierdzone uklady z laba: pyro 5-cone, shadow 5-spread,
// sniper 1 super_laser, heavy 2-shell, king 1. twardy/scout/plasma = stary uklad super (3 / 1+2).
// UWAGA: uklady zmieniaja liczbe pociskow super -> output dmg shift (pyro/shadow w gore, sniper/heavy
// w dol). Gated ?baker=1, wiec LIVE (default) bez zmian balansu — tuning per-pocisk dmg w playtestach.
const BAKE_SUPER_LAYOUTS: Record<string, number[]> = {
    pyro:   [-0.42, -0.21, 0, 0.21, 0.42],
    shadow: [-0.34, -0.17, 0, 0.17, 0.34],
    sniper: [0],
    heavy:  [-0.05, 0.05],
    king:   [0],
};

/**
 * FAZA P2 — offsety katowe jednej salwy. Bake+super+zatwierdzony brawler => uklad z laba.
 * Inaczej (flat path, bake-normal, super dla niezatwierdzonych) => stara logika (bit-for-bit).
 */
function getVolleyOffsets(brawler: Brawler, isSuperShot: boolean): number[] {
    const bakeActive = BAKER_ENABLED && BulletSpriteBaker.isBaked(brawler.id);
    if (bakeActive && isSuperShot && BAKE_SUPER_LAYOUTS[brawler.id]) {
        return BAKE_SUPER_LAYOUTS[brawler.id];
    }
    if (brawler.type === 'spread') return [-0.2, 0, 0.2];
    if (isSuperShot) return [0, -0.1, 0.1];
    return [0];
}
// === FAZA P5 — Super Shot v2 (rebalans + behaviory), ROZDZIELONE od renderu (?baker) ===
// Domyslnie OFF => produkcja (flat i bake) bit-for-bit. Test: ?superv2=1. Gdy cala P5 sprawdzona:
// SUPER_V2_DEFAULT=true (flip = 1 linia, rollback trywialny). Niezalezne od BAKER_ENABLED.
const SUPER_V2_DEFAULT = true; // P5 przetestowany -> live dla wszystkich (rollback = false)
const SUPER_V2_ENABLED: boolean = SUPER_V2_DEFAULT || new URLSearchParams(location.search).has('superv2');

// === End-screen v2 — landscape two-column layout (375px gate) ===
// Problem: stary single-column endcard nie miescil sie w landscape (~375px wys.) -> scroll do przycisku.
// v2 uklada tytul + hero + score (lewa) obok siatki statow 4x2 + button (prawa) -> no-scroll, przycisk
// zawsze widoczny. Cala stylistyka (Titan One, kolory, hero effects, chipy) zachowana 1:1.
// Domyslnie ON. Escape do starego single-column dla porownania: ?endv1=1. Gdy sprawdzone na Androidzie -> usunac v1.
const END_V2_ENABLED: boolean = !new URLSearchParams(location.search).has('endv1');

interface SuperProfile { offsets: number[]; dmg: number; behavior?: 'breakup' | 'boomerang' | 'shockwave'; breakupDist?: number; fragCount?: number; fragSpread?: number; fragDmgMult?: number; maxOutDist?: number; shockwaveRadius?: number; shockwaveDmg?: number; }
const SUPER_PROFILES: Record<string, SuperProfile> = {
    // --- bez zmian vs live (total 1:1) ---
    twardy: { offsets: [0, -0.1, 0.1], dmg: 300, behavior: 'breakup', breakupDist: 220, fragCount: 5, fragSpread: 0.26, fragDmgMult: 0.35 }, // 3 tracery -> 5 fragow x0.35
    heavy:  { offsets: [-0.05, 0.05], dmg: 450, behavior: 'shockwave', shockwaveRadius: 150, shockwaveDmg: 225 }, // 2x450 + AoE 225/trafienie (R150)                 // 2 x 450 = 900
    scout:  { offsets: [-0.12, 0.12], dmg: 200, behavior: 'boomerang', maxOutDist: 600 }, // 2 boomerangi, 200/hit (out+back)
    plasma: { offsets: [0, -0.1, 0.1], dmg: 300, behavior: 'breakup', breakupDist: 220, fragCount: 5, fragSpread: 0.26, fragDmgMult: 0.35 }, // tech breakup jak twardy
    king:   { offsets: [0, -0.06, 0.06], dmg: 300 },               // 3 x 300 = 900
    // --- REBALANS P5 Batch 1 ---
    sniper: { offsets: [-0.06, 0.06], dmg: 450 },                  // 2 x 450 = 900  (bylo 1 x 900)
    pyro:   { offsets: [-0.42, -0.21, 0, 0.21, 0.42], dmg: 160 },  // 5 x 160 = 800  (bylo 5 x 150 = 750)
    shadow: { offsets: [-0.2, 0, 0.2], dmg: 300 },                 // 3 x 300 = 900  (bylo 5 x 450 = 2250)
};
// FAZA P5 — NORMAL fire tweaks (gated SUPER_V2): heavy = 2 rownolegle pociski (2 lufy), dmg total /2.
const NORMAL_PROFILES: Record<string, SuperProfile> = {
    heavy: { offsets: [-0.04, 0.04], dmg: 75 },  // 2 x 75 = 150 (bez zmiany total; efekt 2 luf)
};

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
let mediPads: Array<HoverRepairPad | DesertHeartPad | CloverMediPad | RuinsMediPad> = [];
let powerPads: Array<PowerHoverPad | DesertStormPad | StumpPowerPad | RuinsPowerPad> = [];
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
// FAZA CTF F1 — Fortified Ruins (jeziorka NIE maja globala: update via buildings.forEach)
let ruinsBorder: RuinsBorder | null = null;
let ruinsFosa: RuinsFosa | null = null;
let ruinsBushes: RuinsBush[] = [];
let ruinsHangar: RuinsHangar | null = null;
let ctfSystem: CtfSystem | null = null; // FAZA CTF F2 — rdzen logiki CTF
// F3 — bariera kolizyjna WROGOW- only wokol strefy domowej (gracz przejezdza swobodnie).
let ctfEnemyBarriers: ICollidable[] = [];
// F3 perf — PRECOMPUTED buildings+bariery dla wrogow (buildings statyczne przez caly
// mecz CTF). Bez tego spread [...buildings,...barriers] alokowal 40+ elem. tablice
// KAZDA klatke => skoki GC = szarpanie na mobile. Zbudowane raz w startGame.
let ctfEnemyBuildings: ICollidable[] | null = null;
// F3 perf — STALY obiekt HUD CTF (mutowany per klatke zamiast alokacji nowego).
const ctfHudInfo: HudCtfInfo = {
    flags: [
        { x: 0, y: 0, color: 0, state: 'idle', name: '' },
        { x: 0, y: 0, color: 0, state: 'idle', name: '' },
        { x: 0, y: 0, color: 0, state: 'idle', name: '' },
    ],
    hangarX: 0, hangarY: 0, carrying: false, carryColor: 0xf1c40f,
    flagsCaptured: 0, cameraX: 0, cameraY: 0, zoom: 1,
};
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
let wasInRuinsBushLastFrame: boolean = false; // FAZA CTF F1 — stealth zarosla
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

// Smoothed frame delta (mobile pacing fix). PIXI rawDelta faluje nawet przy maxFPS=60 (FPS 46..60
// => rawDelta ~0.98..1.3). Bez delty gracz zwalnial przy spadku FPS; z surowa delta krok skakal
// klatka-do-klatki (szarpanie). Clamp outlierow + wygladzanie wykladnicze = stala UCZCIWA predkosc
// (Scout dalej ucieka) BEZ szarpania. Srednia zachowana => spawn/timery/score bez zmian.
let smoothedDelta = 1;
const DELTA_SMOOTH = 0.2; // waga wygladzania (0.2 = mocne sciecie falowania, min lag). Wieksza = szybsza reakcja, mniej gladko.

// === F5 ship-blocker (gladkosc mobile): fixed-timestep + render interpolation ===
// Objaw: na 120Hz A54 pojedyncze zgubione vsync (~33ms) => world-scroll szarpie mimo lekkiego JS
// (~1-2ms/klatka). Fix: logika w STALYM kroku 60Hz, a render interpoluje world-scroll (kamera) +
// gracza wg realnego czasu klatki => plynnie niezaleznie od tego, kiedy panel dostarczy klatke.
// Wszystkie encje sa dziecmi worldContainer, wiec dziedzicza gladkie przewijanie.
let logicAccMs = 0;
let smoothNeedsInit = true;
let icCamPX = 0, icCamPY = 0, icCamCX = 0, icCamCY = 0; // interp kamera: prev/curr (world coords)
let icPlPX = 0, icPlPY = 0, icPlCX = 0, icPlCY = 0;     // interp gracz: prev/curr (container coords)

/** Naloz interpolowany render (world-scroll + gracz) dla ulamka klatki a=0..1. */
function applySmoothInterp(a: number): void {
    if (!effects || !player) return;
    const Z = touchManager.isActive ? MOBILE_WORLD_ZOOM : DESKTOP_WORLD_ZOOM;
    const cx = icCamPX + (icCamCX - icCamPX) * a;
    const cy = icCamPY + (icCamCY - icCamPY) * a;
    worldContainer.x = -cx * Z + effects.shakeOffsetX;
    worldContainer.y = -cy * Z + effects.shakeOffsetY;
    player.container.x = icPlPX + (icPlCX - icPlPX) * a;
    player.container.y = icPlPY + (icPlCY - icPlPY) * a;
}

const keys = { w: false, a: false, s: false, d: false };
const mouse = { screenX: window.innerWidth / 2, screenY: window.innerHeight / 2 };
let lastShotTime = 0;
let isMouseDown = false;

const audio = AudioSys.getInstance();

const _prefersTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
// Desktop-only marker: endcard v2 skalowany 1.5x TYLKO na desktopie (CSS w index.html).
// Mobile (touch) zostaje 1:1 — landscape/zoom-locked, nie ma zapasu ekranu na powiekszenie.
document.body.classList.toggle('bt-desktop', !_prefersTouch);
// F5 harness ?res=N: render w N-krotnej rozdzielczosci (0.5 = pol pikseli => test fill-rate/upscale GPU).
// Domyslnie 1 = bez zmiany dla produkcji.
const _resParam = new URLSearchParams(window.location.search).get('res');
const _renderRes = _resParam !== null && !isNaN(parseFloat(_resParam)) ? Math.max(0.25, Math.min(2, parseFloat(_resParam))) : 1;
// F5 (ship-blocker): ?cap=N = TWARDY limiter klatek (nasz PIXI maxFPS nie trzyma — log pokazal
// 130fps przy maxFPS 60 => oscylacja 21<->130 = judder). ?cap=1 => 60fps, ?cap=30/90 => wartosc.
// Wlacza tez powerPreference:'high-performance' (szybsza sciezka present). Domyslnie OFF.
const _capParam = new URLSearchParams(window.location.search).get('cap');
// v0.77.0: cap DOMYSLNIE ON na mobile (touch) => stabilne 60fps (mniej grzania/baterii, koniec
// oscylacji FPS; PIXI maxFPS nie trzymal na A54 — log 130fps). Desktop bez zmian.
// ?cap=0 = wylacz (escape hatch), ?cap=N = ustaw inna wartosc (np. 30).
let CAP_ENABLED: boolean;
let CAP_FPS = 60;
if (_capParam !== null) {
    const _cv = parseInt(_capParam, 10);
    CAP_ENABLED = _cv !== 0;                 // ?cap=0 => OFF
    if (CAP_ENABLED) CAP_FPS = _cv > 1 ? _cv : 60;
} else {
    CAP_ENABLED = _prefersTouch;             // brak param: ON na mobile, OFF na desktop
}
// F5: desync (canvas desynchronized:true) WYCOFANY — PIXI v7 nie da sie wstrzyknac wlasnego
// kontekstu bez wysypania boota (page nie ladowala sie). Zostaje czyste Application + cap.
const app = new PIXI.Application({
    resizeTo: window,
    backgroundColor: 0x14141e,
    antialias: !_prefersTouch, // mobile: MSAA off (fill-rate); baked art juz AA przy bake. Desktop bez zmian.
    resolution: _renderRes,        // F5 harness (1 = bez zmian)
    autoDensity: _renderRes !== 1, // przy res!=1: skaluj canvas CSS by wypelnil ekran
    powerPreference: CAP_ENABLED ? 'high-performance' : 'default', // F5: prosba o wydajny profil GPU
});
// Cap ticker na 60 FPS. A54 ma ekran 120Hz -> PIXI leci uncapped 90-120fps, a przy wahaniu obciazenia
// FPS skacze (46..93) => PIXI delta skacze 0.5..1.3 => krok ruchu (delta-scaled) zmienia sie 2x/klatke
// => kamera szarpie swiatem. Cap 60 daje mocnemu A54 zapas na klatke i przypina delta~1.0 (plynnie)
// + oszczedza baterie. Zero straty wizualnej (60 = plynne). Delty NIE ruszamy (uczciwa predkosc zostaje).
// TEST (v0.73.7): maxFPS sterowalne z URL (?fps=N) do A/B pacingu na high-refresh (A54 120Hz).
//   brak param -> 60 (domyslne, produkcja bez zmian) | ?fps=120 -> natywne 120Hz | ?fps=0 -> uncapped.
// Hipoteza: 60fps-owy content na 120Hz panelu juddery; natywne 120 = kazda klatka=1 vsync = gladko.
const _fpsParam = new URLSearchParams(window.location.search).get('fps');
const _maxFps = _fpsParam !== null && !isNaN(parseInt(_fpsParam, 10)) ? parseInt(_fpsParam, 10) : 60;
// F5 (ship-blocker gladkosc): ?smooth=1 = fixed 60Hz logika + interpolacja renderu. Domyslnie
// odblokowuje render (maxFPS 0 = natywne odswiezanie panelu) — interpolacja potrzebuje klatek
// render POMIEDZY krokami logiki. Domyslnie OFF = zero zmiany dla produkcji (A/B na A54).
const SMOOTH_MODE = new URLSearchParams(window.location.search).get('smooth') === '1';
app.ticker.maxFPS = SMOOTH_MODE && _fpsParam === null ? 0 : _maxFps;

// === F5 harness diagnostyczny (kill-switche izolacji ship-blockera gladkosci) ===
// Idea: wylaczaj podejrzanych po JEDNYM na urzadzeniu; przy ktorej fladze judder znika = winny.
// Wszystkie domyslnie OFF => produkcja bez zmian.
const HARNESS_NOHUD = new URLSearchParams(window.location.search).get('nohud') === '1';   // HUD Canvas 2D off (kompozycja 2 canvasow)
const HARNESS_STATIC = new URLSearchParams(window.location.search).get('static') === '1'; // freeze world-scroll (render zyje) — scroll vs present
const HARNESS_EMPTY = new URLSearchParams(window.location.search).get('empty') === '1';   // nie rysuj swiata — czysty present/compositor/vsync
document.body.appendChild(app.view as HTMLCanvasElement);
(app.view as HTMLCanvasElement).style.position = 'absolute';
(app.view as HTMLCanvasElement).style.zIndex = '1';

const worldContainer = new PIXI.Container();
// v0.68.0: auto-sort OFF — manual (throttlowany) sortChildren to jedyne zrodlo kolejnosci.
// Z sortableChildren=true PIXI auto-sortowal na klatkach nieparzystych (throttle), a manual na
// parzystych — dwie rozne kolejnosci => migotanie z-order skrzyn/budynkow. OFF = na off-frame
// kolejnosc STOI (stabilna, max 1 klatka opoznienia = niewidoczne). Zero migotania, perf zostaje.
worldContainer.sortableChildren = false;
app.stage.addChild(worldContainer);
if (HARNESS_EMPTY) worldContainer.visible = false; // F5 harness: pusty present (test compositor/vsync/present)

const hud = new HUD('hudCanvas');
if (HARNESS_NOHUD) { const _hc = document.getElementById('hudCanvas'); if (_hc) _hc.style.display = 'none'; } // F5 harness: HUD 2D off

// ── Diagnostyka wydajnosci (?perf=1) — overlay FPS + liczniki obiektow. ──
// Cel: znalezc co koreluje z oscylacja "zwalnia/przyspiesza" na mobile bez
// czytania kodu (zasada mobile-first: dane z realnego urzadzenia, nie zgadywanie).
const PERF_ENABLED = new URLSearchParams(window.location.search).has('perf');

// F5 harness: Long Animation Frame observer — atrybuuje DLUGA klatke do SCRIPT (nasz JS) vs
// RENDER/compositor. KLUCZOWE: jesli duration >> sum(scripts) => judder jest w renderze/present,
// NIE w JS (nasza teza). Beacon do /perf-log (czyta Claude). Chrome 123+; gentle-fail gdzie brak.
if (PERF_ENABLED && 'PerformanceObserver' in window) {
    try {
        const _loaf = new PerformanceObserver((list) => {
            for (const e of list.getEntries() as unknown as Array<Record<string, unknown>>) {
                const dur = (e.duration as number) || 0;
                if (dur < 30) continue;
                const scripts = (e.scripts as Array<Record<string, unknown>>) || [];
                let scriptMs = 0, topMs = 0, top = '-';
                for (const s of scripts) {
                    const sd = (s.duration as number) || 0;
                    scriptMs += sd;
                    if (sd > topMs) { topMs = sd; top = (s.name as string) || (s.invoker as string) || '?'; }
                }
                const block = (e.blockingDuration as number) || 0;
                const msg = `LOAF ${dur.toFixed(0)}ms  script ${scriptMs.toFixed(0)}  block ${block.toFixed(0)}  top ${top} ${topMs.toFixed(0)}`;
                try { navigator.sendBeacon(import.meta.env.BASE_URL + 'perf-log', msg); } catch { /* noop */ }
            }
        });
        _loaf.observe({ type: 'long-animation-frame', buffered: true } as PerformanceObserverInit);
    } catch { /* LoAF nieobslugiwane (Firefox/Safari/starszy Chrome) */ }
}

let perfEl: HTMLDivElement | null = null;
let perfFrames = 0, perfMinFps = 9999, perfMaxFps = 0, perfSumMs = 0, perfLastT = 0;
// Szczyty (od startu meczu) — pokazuja korelacje z najgorsza klatka, nawet gdy juz minela.
let perfWorstMs = 0, perfPeakEBul = 0, perfPeakBul = 0, perfPeakPart = 0, perfPeakKids = 0, perfPeakEnemies = 0;
let perfLastHitchT = 0; // DEV-ONLY: czas ostatniej dlugiej klatki (>28ms) — do pomiaru odstepu miedzy hitchami.
// DEV-ONLY: mikro-profiler klatki — rozbicie kosztu na hud.render vs cala logika callbacku.
// perfHudMs/perfCbMs opisuja POPRZEDNIA klatke (zapisane na jej koncu), logowane przy hitchu.
let perfHudMs = 0, perfCbMs = 0, perfCbStart = 0;
if (PERF_ENABLED) {
    perfEl = document.createElement('div');
    perfEl.style.cssText =
        'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:99999;' +
        'font:11px/1.35 monospace;color:#0f0;background:rgba(0,0,0,0.72);padding:4px 8px;' +
        'border-radius:6px;white-space:pre;pointer-events:none;text-align:left;';
    perfEl.textContent = 'perf: warming up...';
    document.body.appendChild(perfEl);
}

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

// Just-in-time podpowiedzi przedmiotow/stref (serce/magnes/kostka/medi-pad/power-pad).
const itemHints = new ItemHints(touchManager.isActive);
/** Najblizszy obiekt {x,y} w zasiegu od gracza (do podpowiedzi kontekstowych). */
function nearestInRange<T extends { x: number; y: number }>(items: T[], range: number): T | null {
    if (!player) return null;
    let best: T | null = null;
    let bestD = range * range;
    for (const it of items) {
        const d = (it.x - player.x) ** 2 + (it.y - player.y) ** 2;
        if (d < bestD) { bestD = d; best = it; }
    }
    return best;
}

/**
 * Czy punkt jest na terenie NIEdrivalnym w OSOBNYCH tablicach (nie w `buildings`): strefy
 * quicksand / oazy / sludge / fosa. Rzeka, duze skaly i jeziora sa juz w `buildings` (omijane
 * przez findSafeSpawnPos). Wstrzykiwane do SpawnSystem => wrogowie i pickupy nie spawnuja sie na
 * przeszkodach ani w miejscach nieprzeznaczonych do jazdy (bug: "wrogowie na skalach/rzekach").
 * Czyta LIVE tablice modulowe (puste na mapach bez danego typu => no-op).
 */
const spawnBlocked = (x: number, y: number): boolean => {
    for (const q of quicksands) if (q.isPointInside(x, y)) return true;
    for (const o of oases) if (o.isPointInside(x, y)) return true;
    for (const sp of sludgePools) if (sp.isPointInside(x, y)) return true;
    if (ruinsFosa && ruinsFosa.isPointInside(x, y)) return true;
    return false;
};

// ── FAZA A: tutorial onboarding ──
// tutorialActive: gdy true, spawn wrogow jest OFF (sandbox nauki na realnej mapie).
// Flaga bt2:tutorialCoreDone: konwencja `bt2:` (urzadzenie/gracz); dziala PRZED zalozeniem nicku.
let tutorialActive = false;
let lastGameConfig: GameConfig | null = null;
const TUTORIAL_FLAG = 'bt2:tutorialCoreDone';
function isTutorialCoreDone(): boolean {
    try { return localStorage.getItem(TUTORIAL_FLAG) === '1'; } catch { return false; }
}
function markTutorialCoreDone(): void {
    try { localStorage.setItem(TUTORIAL_FLAG, '1'); } catch { /* localStorage blocked */ }
}
// ── FAZA B: sandbox combat lessons (STRZELAJ + FALA) ──
// SpawnSystem jest OFF w tutorialu, wiec wrogowie-manekiny tworzeni recznie i sledzeni osobno
// (tutorialEnemies) by wykryc "cel zniszczony". Ring PIXI zyje w worldContainer = world-space
// (sam podaza za kamera/zoomem, zero matematyki uiScale) i celuje w najblizszego zywego manekina.
let tutorialEnemies: Enemy[] = [];
let tutorialRing: PIXI.Graphics | null = null;

// Bezpieczny spawn manekina: pozycja liczona KU SRODKOWI mapy (otwarte pole, nie krawedz/border)
// i twardo ograniczona do [M, WORLD-M]. Fix blockera z playtestu FALA: gdy gracz startowal blisko
// krawedzi, staly offset wypychal wroga na/za border planszy — widoczny tylko czesciowo, nie do
// zestrzelenia. Teraz wrogi zawsze celuja w glab mapy i nigdy nie ladauja na krawedzi.
const TUT_SPAWN_MARGIN = 320;
function tutorialCenterAngle(): number {
    if (!player) return 0;
    return Math.atan2(WORLD_H / 2 - player.y, WORLD_W / 2 - player.x);
}
function tutorialSpawnAt(angle: number, radius: number): void {
    if (!player) return;
    const M = TUT_SPAWN_MARGIN;
    const x = Math.max(M, Math.min(WORLD_W - M, player.x + Math.cos(angle) * radius));
    const y = Math.max(M, Math.min(WORLD_H - M, player.y + Math.sin(angle) * radius));
    const e = new Enemy(x, y, ENEMY_NORMAL, false, worldContainer);
    attachEnemyCubeStolenCallback(e);
    enemies.push(e);
    tutorialEnemies.push(e);
}
function tutorialSpawnDummy(): void {
    tutorialEnemies = [];
    tutorialSpawnAt(tutorialCenterAngle(), 260); // ku srodkowi mapy => otwarte pole
}
function tutorialSpawnWave(): void {
    tutorialEnemies = [];
    const base = tutorialCenterAngle();
    tutorialSpawnAt(base - 0.55, 250); // wachlarz 3 wrogow skierowany w glab mapy
    tutorialSpawnAt(base, 300);
    tutorialSpawnAt(base + 0.55, 250);
}
function tutorialEnemiesAlive(): number {
    let n = 0;
    for (const e of tutorialEnemies) if (e.active) n++;
    return n;
}
/** Ring PIXI (world-space) celujacy w najblizszego zywego manekina. Lazy-create, chowany gdy brak celu. */
function updateTutorialRing(): void {
    if (!tutorialActive) { if (tutorialRing) tutorialRing.visible = false; return; }
    let target: Enemy | null = null;
    let best = Infinity;
    if (player) {
        for (const e of tutorialEnemies) {
            if (!e.active) continue;
            const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
            if (d < best) { best = d; target = e; }
        }
    }
    if (!target) { if (tutorialRing) tutorialRing.visible = false; return; }
    if (!tutorialRing) {
        const g = new PIXI.Graphics();
        g.lineStyle(5, 0x5fe0e8, 1);
        g.drawCircle(0, 0, 46);
        worldContainer.addChild(g); // sortableChildren=false -> rysowany nad wczesniej dodanymi manekinami
        tutorialRing = g;
    }
    tutorialRing.visible = true;
    tutorialRing.x = target.x;
    tutorialRing.y = target.y;
    tutorialRing.scale.set(1 + 0.14 * Math.sin(performance.now() / 180));
}
/** Sprzataj po sandboxie tutorialu (ring + tracking). Manekiny zostaja w `enemies` jako czesc meczu. */
function clearTutorialSandbox(): void {
    if (tutorialRing) {
        try { tutorialRing.destroy(); } catch { /* juz zniszczony */ }
        tutorialRing = null;
    }
    tutorialEnemies = [];
}

// ── FAZA B2: GEMY (ladowanie SUPER) + SUPER SHOT ──
let tutSuperBase = 0;      // superCharges przy wejsciu w krok GEMY
let tutSuperShotBase = 0;  // superCharges przy wejsciu w krok SUPER SHOT

function tutorialSpawnGems(): void {
    tutSuperBase = player ? player.superCharges : 0;
    if (!player) return;
    // 12 gemow w dwoch pierscieniach wokol gracza — zbierane przejazdem (auto-collect).
    // 12 > GEMS_PER_SUPER_CHARGE_TRIGGER(10) => zebranie gwarantuje przekroczenie progu (+3 ladunki),
    // niezaleznie ile gemow gracz mial wczesniej (manekin/FALA dropia po 1).
    for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const r = 120 + (k % 2) * 90;
        spawnGem(player.x + Math.cos(a) * r, player.y + Math.sin(a) * r);
    }
}
function tutorialSuperEarned(): boolean {
    return !!player && player.superCharges > tutSuperBase;
}
/** Watchdog GEMY: gdy gemy sie skonczyly/wygasly a super jeszcze nie naladowany -> dosyp swiezych.
 *  Zapobiega soft-lockowi gdy gracz zwleka ze zbieraniem (gemy w meczu maja czas zycia). */
function tutorialTopUpGems(): void {
    if (!player) return;
    if (gems.length < 3 && !tutorialSuperEarned()) {
        for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            spawnGem(player.x + Math.cos(a) * 150, player.y + Math.sin(a) * 150);
        }
    }
}
function tutorialArmSuperShot(): void {
    if (player && player.superCharges === 0) player.addSuperCharge(1); // gwarancja: lekcja ma dzialac
    tutSuperShotBase = player ? player.superCharges : 0;
    tutorialEnemies = [];
    tutorialSpawnAt(tutorialCenterAngle(), 260); // cel dla super-strzalu (+ ring PIXI z updateTutorialRing)
}
function tutorialSuperShotFired(): boolean {
    // super-strzal auto-odpala sie przy strzale gdy sa ladunki => wykryj drop ladunku / aktywny super.
    return !!player && (player.isSuperShotActive || player.superCharges < tutSuperShotBase);
}
function tutorialSuperPillRect(): { x: number; y: number; w: number; h: number } {
    const s = hud.uiScale; // pasek SUPER rysowany na (14,70,172,54) w scaled space => screen px = *uiScale
    return { x: 14 * s, y: 70 * s, w: 172 * s, h: 54 * s };
}

// ── SUPER MOC (Aura/MegaBomb/Freeze — cooldown-based, zero ladunkow) ──
let tutSuperPowerBase = 0;
function tutorialArmSuperPower(): void {
    if (powerSystem) {
        powerSystem.powerCooldowns = { aura: 0, megaBomb: 0, freeze: 0 }; // gwarancja: moc gotowa do uzycia
        powerSystem.activePowerId = null;
    }
    tutSuperPowerBase = currentSession ? currentSession.superPowersUsed : 0;
    tutorialEnemies = [];
    const base = tutorialCenterAngle();
    tutorialSpawnAt(base - 0.4, 240); // cele, by bomba/freeze mialy co zmiesc (aura = self-buff)
    tutorialSpawnAt(base + 0.4, 240);
}
function tutorialSuperPowerUsed(): boolean {
    return !!currentSession && currentSession.superPowersUsed > tutSuperPowerBase;
}

/** Uruchom tutorial nad juz-wystartowanym sandboxem. onDone(cont): cont=graj dalej, !cont=powrot do menu. */
function launchTutorial(onDone: (continuePlaying: boolean) => void): void {
    new TutorialController({
        isTouch: touchManager.isActive,
        isMoving: () => !!player && player.isMoving,
        spawnDummy: tutorialSpawnDummy,
        spawnWave: tutorialSpawnWave,
        enemiesAlive: tutorialEnemiesAlive,
        spawnGems: tutorialSpawnGems,
        superEarned: tutorialSuperEarned,
        topUpGems: tutorialTopUpGems,
        armSuperShot: tutorialArmSuperShot,
        superShotFired: tutorialSuperShotFired,
        superPillRect: tutorialSuperPillRect,
        armSuperPower: tutorialArmSuperPower,
        superPowerUsed: tutorialSuperPowerUsed,
        onDone,
    });
}

menu.onGameRequested = (config: GameConfig) => {
    // FAZA CTF F1: ctf odblokowane (mapa fortified_ruins zintegrowana modularnie)
    if (config.scenario === 'castle') {
        showToast(t('settings.comingSoon'), 2500);
        console.log('[Menu] Game start blocked - scenario not yet implemented:', config.scenario);
        return;
    }
    menu.hide();
    if (!isTutorialCoreDone()) {
        // FAZA A: pierwsze uruchomienie => tutorial nad sandboxem (spawn off) TYM czolgiem,
        // po ukonczeniu/skip -> flaga + spawn wraca => plynnie prawdziwy mecz (bez restartu sceny).
        void startGame(config, true).then(() => {
            launchTutorial((cont) => {
                markTutorialCoreDone(); tutorialActive = false; clearTutorialSandbox();
                if (cont) {
                    if (lastGameConfig && lastGameConfig.scenario === 'ctf') spawnCtfMatchForces();
                    if (lastGameConfig && (lastGameConfig.scenario === 'ktb' || lastGameConfig.scenario === 'ctf')) showModeGoal(lastGameConfig.scenario, touchManager.isActive);
                } else returnToMenuFromEnd();
            });
        });
    } else {
        void startGame(config);
    }
};

menu.onContinueRequested = (lastSession: LastSession) => {
    // FAZA CTF F1: ctf odblokowane. Guard na stale sesje sprzed odblokowania:
    // ctf z placeholderowa mapa != fortified_ruins naprawiamy na wlasciwa.
    if (lastSession.scenario === 'castle') {
        showToast(t('settings.comingSoon'), 2500);
        console.log('[Menu] Continue blocked - scenario not yet implemented:', lastSession.scenario);
        return;
    }
    if (lastSession.scenario === 'ctf' && lastSession.map !== 'fortified_ruins') {
        lastSession.map = 'fortified_ruins';
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
    void startGame(config);
};

menu.onHowToPlayRequested = () => {
    // FAZA A: replay tutorialu z huba. Sandbox (spawn off) na ostatnim configu -> powrot do huba.
    // (Dziala gdy grales w tej sesji; pelny replay z persistem = pozniejsza faza.)
    if (!lastGameConfig) { console.log('[Tutorial] replay: brak lastGameConfig (zagraj raz najpierw)'); return; }
    menu.hide();
    void startGame(lastGameConfig, true).then(() => {
        launchTutorial((cont) => {
            markTutorialCoreDone(); tutorialActive = false; clearTutorialSandbox();
            if (cont) {
                if (lastGameConfig && lastGameConfig.scenario === 'ctf') spawnCtfMatchForces();
                if (lastGameConfig && (lastGameConfig.scenario === 'ktb' || lastGameConfig.scenario === 'ctf')) showModeGoal(lastGameConfig.scenario, touchManager.isActive);
            } else returnToMenuFromEnd();
        });
    });
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
    itemHints.clear(); // schowaj ewentualny wiszacy dymek podpowiedzi
    clearModeGoal();   // FAZA C: schowaj ewentualna wiszaca karte celu
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

/**
 * POOLING (v0.73.6) — "pudelko z kubkami" dla pociskow wroga. Zamiast
 * new EnemyBullet/destroy przy kazdym strzale+trafieniu (churn PIXI => rytmiczne
 * pauzy GC), reuzywamy instancje. Pula zyje w obrebie meczu (reset w startGame).
 */
let enemyBulletPool: EnemyBullet[] = [];
function spawnEnemyBullet(x: number, y: number, angle: number, speed: number, dmg: number, color: number, bulletType: import('./rendering/EnemyBulletSpriteBaker').EnemyBulletType | null): void {
    const pooled = enemyBulletPool.pop();
    if (pooled) {
        pooled.reset(x, y, angle, speed, dmg, color, bulletType);
        enemyBullets.push(pooled);
    } else {
        enemyBullets.push(new EnemyBullet(x, y, angle, speed, dmg, color, worldContainer, bulletType));
    }
}

function spawnEnemyShot(shot: import('./entities/Enemy').EnemyShotInfo): void {
    const half = (shot.burstCount - 1) / 2;
    for (let i = 0; i < shot.burstCount; i++) {
        const offsetAngle = shot.burstCount > 1
            ? (i - half) * (shot.burstSpread / Math.max(1, shot.burstCount - 1))
            : 0;
        spawnEnemyBullet(
            shot.x, shot.y, shot.angle + offsetAngle,
            shot.speed, shot.dmg, shot.color,
            shot.bulletType, // FAZA P4 — typ pocisku dla bakera (null => flat)
        );
    }
}

/**
 * POOLING (v0.73.7) — "pudelko z kubkami" dla pociskow gracza. Reuzycie zamiast
 * new Bullet/destroy przy kazdym strzale (najwiekszy churn przy "strzelam caly czas").
 * reset() w Bullet ZERUJE caly stan zachowan (super/bumerang/breakup/shockwave/smuga),
 * wiec pooled pocisk nie niesie sladu po poprzednim strzale. Pula per mecz.
 * Zwraca instancje (caller sam robi dmg-mult + applyBehavior + push, jak przy new Bullet).
 */
let bulletPool: Bullet[] = [];
function acquireBullet(x: number, y: number, angle: number, isSuper: boolean, superDmgOverride?: number): Bullet {
    const pooled = bulletPool.pop();
    if (pooled) {
        pooled.reset(x, y, angle, isSuper, superDmgOverride);
        return pooled;
    }
    // Fallback: nowa instancja. brawler staly per mecz -> pooled.reset uzywa this.brawlerInfo.
    return new Bullet(x, y, angle, player!.brawler, worldContainer, isSuper, superDmgOverride);
}

/**
 * POOLING (v0.73.5) — "pudelko z kubkami" dla gemow. Zamiast new Gem/destroy co
 * kill+pickup (churn PIXI => rytmiczne pauzy GC = szarpanie), reuzywamy instancje.
 * Pula zyje w obrebie meczu (reset w startGame); w meczu sprite'y gemow nie sa
 * nigdy niszczone — tylko chowane (visible=false) i wskrzeszane przez reset().
 */
let gemPool: Gem[] = [];
function spawnGem(x: number, y: number): void {
    const pooled = gemPool.pop();
    if (pooled) {
        pooled.reset(x, y);
        gems.push(pooled);
    } else {
        gems.push(new Gem(x, y, worldContainer));
    }
}

function dropGems(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
        spawnGem(x, y);
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

// FAZA P5 Batch 3 — pancerny shockwave-on-hit: AoE dmg wokol punktu trafienia + pierscien + detonacja.
// Wzorzec mega bomby: AoE-kille = registerKill(spawnSystem)+addKillScore+drop, ale NIE
// currentSession.registerKill (AOE != skill streak). Nie splice'uje — outer loop sprząta martwych.
function triggerShockwave(x: number, y: number, radius: number, dmg: number, source: Enemy): void {
    const eff = effects, ss = spawnSystem, cs = currentSession;
    if (!eff || !ss || !cs) return;
    eff.spawnShockwaveRing(x, y, radius);
    audio.playShockwave();
    const r2 = radius * radius;
    for (const other of enemies) {
        if (other === source || !other.active) continue;
        if ((other.x - x) ** 2 + (other.y - y) ** 2 <= r2) {
            const killed = other.takeDamage(dmg, other.x, other.y, worldContainer, eff);
            if (killed) {
                ss.registerKill(other);
                cs.addKillScore(other.scoreValue);
                handleEnemyDrop(other);
            }
        }
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

/**
 * Inicjalne sily CTF (straznicy/bossy + roamerzy). Pominiete w tutorialu (startGame tutorialMode),
 * dospawnowane gdy samouczek oddaje sterowanie prawdziwemu meczowi (onDone cont). Inaczej mecz CTF
 * po samouczku byl pusty — bug: "przeszedlem samouczek na CTF i nie spawnuja sie czolgi".
 */
function spawnCtfMatchForces(): void {
    if (!ctfSystem || !spawnSystem || !player) return;
    ctfSystem.spawnInitialForces();
    enemies.push(...spawnSystem.spawnCtfInitialRoamers(10, player.x, player.y, worldContainer, buildings, spawnBlocked));
    for (const e of enemies) attachEnemyCubeStolenCallback(e);
}

async function startGame(config: GameConfig, tutorialMode = false): Promise<void> {
    // FAZA A: tutorialMode = sandbox nauki na realnej mapie tego czolgu, spawn wrogow OFF.
    tutorialActive = tutorialMode;
    lastGameConfig = config;
    clearTutorialSandbox(); // FAZA B: wyczysc ring/tracking z ew. poprzedniego tutorialu
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
    smoothNeedsInit = true; logicAccMs = 0; // F5: reset interpolacji na nowy mecz (zero skoku ze starego stanu)
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
    ruinsBorder = null;   // FAZA CTF F1
    ruinsFosa = null;     // FAZA CTF F1
    ruinsBushes = [];     // FAZA CTF F1
    ruinsHangar = null;   // FAZA CTF F1
    ctfSystem?.destroy(); // FAZA CTF F2 — sprzatniecie flag/bomb poprzedniego meczu
    ctfSystem = null;
    ctfEnemyBarriers = []; // F3
    ctfEnemyBuildings = null; // F3 perf
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
    } else if (config.map === 'fortified_ruins') {
        // ── FAZA CTF F1: Fortified Ruins (mapa scenariusza CTF) ──
        // Layout deterministyczny, AABB-verified (scratchpad ctf_f1_aabb.js — 15 checkow PASS).
        const ruinsTex = buildFortifiedRuinsTexture();
        const ruinsSprite = new PIXI.Sprite(ruinsTex);
        ruinsSprite.zIndex = -100;
        worldContainer.addChild(ruinsSprite);

        // Granica mapy: 4 AABB kolizji (wizual muru baked w teksture gruntu)
        ruinsBorder = new RuinsBorder(WORLD_W, WORLD_H, worldContainer);
        buildings.push(...ruinsBorder.getCollisionRects());
        solidBuildings.push(...ruinsBorder.getCollisionRects());

        // Mury fortec (U-shape wokol flag) + 29 skal oslonowych — pelna kolizja
        for (const wl of FORTIFIED_FORTRESS_WALLS) {
            const block = new RuinBlock(wl.x, wl.y, wl.w, wl.h, wl.tone, wl.seed, wl.kind, worldContainer);
            buildings.push(block);
            solidBuildings.push(block);
        }
        for (const rk of FORTIFIED_ROCKS_LAYOUT) {
            const block = new RuinBlock(rk.x, rk.y, rk.w, rk.h, rk.tone, rk.seed, rk.kind, worldContainer);
            buildings.push(block);
            solidBuildings.push(block);
        }

        // Jeziorka: blokuja czolgi (buildings), pociski przelatuja (BEZ solidBuildings).
        // Update blikow wody idzie przez buildings.forEach — bez dedykowanej petli.
        for (const lk of FORTIFIED_LAKES_LAYOUT) {
            const lake = new RuinsLake(lk.x, lk.y, lk.w, lk.h, lk.seed, worldContainer);
            buildings.push(lake);
        }

        // Fosa (slow 0.5x, passable) + zarosla (stealth) + hangar (strefa domowa, wizual)
        // F3: most (x-pas) wyciety ze strefy slow — przejazd po deskach = pelna predkosc.
        ruinsFosa = new RuinsFosa(
            FORTIFIED_FOSA_RECT.x, FORTIFIED_FOSA_RECT.y,
            FORTIFIED_FOSA_RECT.w, FORTIFIED_FOSA_RECT.h,
            worldContainer,
            { x: FORTIFIED_BRIDGE_RECT.x, w: FORTIFIED_BRIDGE_RECT.w },
        );
        ruinsBushes = FORTIFIED_BUSHES_LAYOUT.map(b =>
            new RuinsBush(b.x, b.y, b.r, b.seed, worldContainer));
        ruinsHangar = new RuinsHangar(worldContainer);
        // F1.1: bryla wojskowego hangaru jest SOLID (czolgi + pociski)
        buildings.push(...ruinsHangar.getCollisionRects());
        solidBuildings.push(...ruinsHangar.getCollisionRects());

        // F3 (playtest): strefa domowa (szachownica) kolizyjna dla WROGOW-only.
        // 3 cienkie sciany (wschod/polnoc/poludnie) domykaja strefe; zachod = mur mapy.
        // Trafiaja WYLACZNIE do ctfEnemyBarriers (NIE buildings/solidBuildings) — gracz
        // wjezdza swobodnie z flaga, wrogowie sa zatrzymani na granicy.
        const HR = FORTIFIED_HANGAR_RECT;
        ctfEnemyBarriers = [
            { x: HR.x + HR.w - 8, y: HR.y - 8, w: 12, h: HR.h + 16, update: () => {} }, // wschod
            { x: HR.x, y: HR.y - 10, w: HR.w, h: 12, update: () => {} },                 // polnoc
            { x: HR.x, y: HR.y + HR.h - 2, w: HR.w, h: 12, update: () => {} },           // poludnie
        ];

        // D6/F3: CTF ma serduszka (playtest: bez nich za trudno).
        // F4.2: pady WLACZONE (warianty ruin, baked). Medi = sustain po obu stronach
        // fosy; Power = sprint lane na trasach odwrotu BRAVO/CHARLIE. Petle update
        // (main.ts pad-loop) sa scenario-agnostyczne, wiec dzialaja bez zmian.
        mediPads = FORTIFIED_MEDI_PAD_POSITIONS.map(p => new RuinsMediPad(p.x, p.y, worldContainer));
        powerPads = FORTIFIED_POWER_PAD_POSITIONS.map(p => new RuinsPowerPad(p.x, p.y, worldContainer));
    }

    effects = new EffectsManager(worldContainer);
    // v0.50.0 Difficulty Balance v1: SpawnSystem dostaje per-difficulty modifiers
    // (enemy HP/dmg/speed mults + spawn interval + max enemies + boss thresholds).
    // FAZA CTF F2 (D7): dla ctf tryb roamer-cap 10 (bossy/mega/hearty/magnesy off).
    spawnSystem = new SpawnSystem(
        getDifficultyModifiers(config.difficulty),
        config.scenario === 'ctf' ? { roamerCap: 10 } : null,
    );
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

    // FAZA P1 Sprite Baker — bake 2.5D gracza PRZED stworzeniem Player (czolg nie mignie pusty).
    // Flaga gracza wpieczona w teksture hull (per-profil). Tylko gdy ?baker=1. Idempotentny (cache).
    if (BAKER_ENABLED) {
        await TankSpriteBaker.bakeBrawler(app, brawler.id, activeProfile?.flagId ?? null);
        await BulletSpriteBaker.bakeBrawler(app, brawler.id); // FAZA P2 — pociski 2.5D (normal+super)
        await EnemySpriteBaker.bakeAll(app);        // FAZA P4 — wrogowie 2.5D (grunt/boss/mega)
        await EnemyBulletSpriteBaker.bakeAll(app);  // FAZA P4 — pociski wrogow 2.5D
    }

    player = new Player(brawler, worldContainer, activeProfile?.flagId ?? null);

    // FAZA CTF F1: spawn w hangarze (200,1500) — legacy 1:1. Player konstruktor
    // ustawia (800,800); nadpisanie przed pierwsza klatka (container synce w update).
    if (config.scenario === 'ctf') {
        player.x = FORTIFIED_PLAYER_SPAWN.x;
        player.y = FORTIFIED_PLAYER_SPAWN.y;
    }

    enemies = [];
    bullets = [];
    bulletPool = []; // POOLING: pula pociskow gracza (stare sprite'y znika removeChildren)
    enemyBullets = [];
    enemyBulletPool = []; // POOLING: pula pociskow wroga (stare sprite'y znika removeChildren)
    hearts = [];
    gems = [];
    gemPool = []; // POOLING: pula zyje w obrebie meczu (stare sprite'y znika removeChildren)
    magnets = [];
    powerCubes = []; // v0.44.0 FAZA 8.6 reset
    isMouseDown = false;
    gameState = 'PLAYING';

    // Reset szczytow perf-overlay na nowy mecz (?perf=1).
    perfWorstMs = 0; perfPeakEBul = 0; perfPeakBul = 0; perfPeakPart = 0; perfPeakKids = 0; perfPeakEnemies = 0;

    touchManager.show();

    if (touchManager.isActive) {
        tryLockLandscape();
    }

    // ── FAZA CTF F2: inicjalizacja rdzenia CTF (flagi, straznicy, bossy, roamerzy, gemy) ──
    if (config.scenario === 'ctf' && effects && spawnSystem && currentSession && player) {
        ctfSystem = new CtfSystem({
            session: currentSession,
            worldContainer,
            enemies,
            effects,
            difficulty: getDifficultyModifiers(config.difficulty),
            hudNotif: (text, cssColor) => hud.addNotif(text, cssColor),
            onPickupSfx: () => { audio.playMagnetPickup(); audio.startFlagCarryMusic(); }, // F4: carry-state music ON
            onCaptureSfx: () => { audio.playHeartPickup(); audio.stopFlagCarryMusic(); }, // F4: wroc do muzyki mapy
            onBombExplosionSfx: () => audio.playExplosion(),
            onEnrage: () => hud.triggerCtfEnrage(), // F4.3: baner eskalacji
        });
        // F3 perf: zbuduj RAZ tablice kolizji wrogow (buildings statyczne w CTF po tym
        // punkcie — spawnInitialForces dodaje tylko do enemies, nie do buildings).
        ctfEnemyBuildings = ctfEnemyBarriers.length > 0
            ? [...buildings, ...ctfEnemyBarriers]
            : buildings;
        // FAZA A: inicjalne sily CTF (straznicy/bossy + roamerzy) NIE w tutorialu — dospawnowane gdy
        // samouczek oddaje sterowanie prawdziwemu meczowi (spawnCtfMatchForces w onDone launchTutorial).
        if (!tutorialMode) spawnCtfMatchForces();
        for (let i = 0; i < 12; i++) {
            const pos = spawnSystem.findSafePickupPos(player.x, player.y, buildings, spawnBlocked);
            if (pos) spawnGem(pos.x, pos.y);
        }
    }

    audio.startMusic(config.map);

    // FAZA C: karta celu przy 1. wejsciu w tryb (raz na urzadzenie). Nie w tutorialu — po handoff w onDone.
    if (!tutorialMode && (config.scenario === 'ktb' || config.scenario === 'ctf')) {
        showModeGoal(config.scenario, touchManager.isActive);
    }
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
    /** FAZA CTF F2 — zdobyte flagi (null = scenariusz bez flag, tile heartow zostaje). */
    ctfFlags: number | null;
}

/**
 * v0.46.0 — Render wybranego czolgu (hull+turret) do dataURL (PNG) na hero ekranu konca.
 * Buduje TYMCZASOWY kontener (baked 2.5D gdy ?baker=1, inaczej flat getBrawlerTextures), lufa w PRAWO,
 * scale x2 dla ostrosci na karcie, ekstrahuje przez renderer.extract. Tekstury sa cache'owane
 * i WSPOLDZIELONE z zywym graczem — destroy({children}) NIE niszczy textur (tylko sprite'y).
 * Zwraca '' przy bledzie -> renderEndScreen fallbackuje do emoji.
 */
function renderTankHeroDataURL(brawler: Brawler, damaged: boolean = false): string {
    try {
        const temp = new PIXI.Container();
        const hull = new PIXI.Sprite();
        hull.anchor.set(0.5);
        const turret = new PIXI.Sprite();
        turret.anchor.set(0.5);

        // FAZA P4 — hero 2.5D: gdy ?baker=1 i gracz upieczony, baked tekstury (jak w grze) zamiast
        // flat placka. Poza JEDZIE W PRAWO: baked bierze angle 0 (barrel-right), flat NIE rotuje temp.
        const bakerHero = BAKER_ENABLED && TankSpriteBaker.isBaked(brawler.id);
        if (bakerHero) {
            const heroAngle = 0; // jazda/lufa w PRAWO (angle 0 = baked barrel-right)
            hull.texture = TankSpriteBaker.getHullTexture(brawler.id, heroAngle);
            turret.texture = TankSpriteBaker.getTurretTexture(brawler.id, heroAngle);
        } else {
            const tex = getBrawlerTextures(brawler);
            hull.texture = tex.hull;
            turret.texture = tex.turret;
        }
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

        // Poza "w prawo" dla obu sciezek: flat tekstury sa barrel-right przy rotation 0,
        // baked wybralo angle 0 -> zadna rotacja temp nie jest potrzebna.
        temp.scale.set(bakerHero ? 2.2 : 2); // baked = wieksza tekstura -> 2.2 dla podobnego rozmiaru na karcie
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

    // v2 (landscape) — kompaktowy mini-kafelek: ikona+liczba w jednym rzedzie, label pod spodem.
    // Wchodzi 4-w-rzedzie w prawej kolumnie (siatka 4x2). Mniejszy gem (1.3rem) bo pelny 2.25rem
    // rozwalilby waskie kafelki.
    const gemIconSm = `<img src="${import.meta.env.BASE_URL}assets/gem.png" alt="" style="width:1.3rem;height:1.3rem;display:block;object-fit:contain;">`;
    const statTile = (iconHtml: string, value: string | number, label: string): string => `
        <div style="background:#f1f0f6;border:2px solid #e2e1ea;border-radius:12px;padding:6px 3px 5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;text-align:center;box-sizing:border-box;">
            <div style="display:flex;align-items:center;justify-content:center;gap:5px;line-height:1;">
                <span style="font-size:1.15rem;line-height:1;display:flex;align-items:center;justify-content:center;">${iconHtml}</span>
                <span style="font-family:${TITAN};font-size:1.3rem;color:#2c3e50;">${value}</span>
            </div>
            <span style="font-family:${SYS};font-size:0.58rem;font-weight:700;letter-spacing:0.4px;color:#8a8a99;text-transform:uppercase;">${label}</span>
        </div>`;

    // Slim bonus-row z PowerCube'ow — tylko gdy realnie cos dropnelo.
    const bonusRow = (d.dmgBonusPct > 0 || d.hpCubesPicked > 0) ? `
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:10px;">
            ${d.dmgBonusPct > 0 ? `<span style="font-family:${SYS};font-size:0.74rem;font-weight:700;color:#fff;background:#e74c3c;padding:4px 11px;border-radius:11px;white-space:nowrap;">🟦 +${d.dmgBonusPct}% ${t('end.dmgBonus')}</span>` : ''}
            ${d.hpCubesPicked > 0 ? `<span style="font-family:${SYS};font-size:0.74rem;font-weight:700;color:#fff;background:#2980b9;padding:4px 11px;border-radius:11px;white-space:nowrap;">🟦 +${d.hpCubesPicked * 25} ${t('end.hpBonus')}</span>` : ''}
        </div>` : '';

    // FAZA CTF F2 — badge zwyciestwa per scenariusz: CTF = flagi 3/3, inaczej mega boss.
    const victoryBadgeText = d.ctfFlags !== null
        ? `🚩 ${t('end.flags')}: ${d.ctfFlags}/3`
        : `🏆 ${t('end.megaBoss')} — ${t('end.megaBossDefeated')}`;
    const victoryBadge = isVictory ? `
        <div style="font-family:${TITAN};font-size:0.95rem;color:#fff;background:#27ae60;padding:6px 18px;border-radius:14px;border:2px solid #2c3e50;box-shadow:2px 2px 0 #2c3e50;margin-top:12px;">${victoryBadgeText}</div>` : '';

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

    // v2 hero — nizszy (136 vs 168) i wezszy dla lewej kolumny landscape. Te same heroEffects/keyframes/glow.
    // +10% wzgledem 124/112 (Mariusz chce troche wieksza animacje po tescie).
    const heroZoneV2 = d.tankImg ? `
        <style>${heroKeyframes}</style>
        <div style="position:relative;width:100%;height:136px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;">
            <div style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);width:154px;height:154px;border-radius:50%;background:radial-gradient(circle,${glow} 0%,transparent 68%);z-index:0;"></div>
            <div style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);width:110px;height:22px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,0.4) 0%,transparent 72%);z-index:1;"></div>
            ${heroEffects}
            <img src="${d.tankImg}" alt="" style="position:relative;z-index:2;height:123px;width:auto;filter:drop-shadow(0 6px 7px rgba(0,0,0,0.4));">
        </div>`
        : `<div style="font-size:2.9rem;line-height:1;">${icon}</div>`;

    // === v2 LANDSCAPE — tytul u gory na pelnej szer., ponizej dwie kolumny: (lewa) subtitle+hero+score, ===
    // === (prawa) siatka statow 4x2 + bonus + badge + button. Cel: brak scrolla @375px, przycisk zawsze widoczny.
    if (END_V2_ENABLED) {
        return `
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;box-sizing:border-box;gap:10px;">
            <div style="display:flex;flex-direction:row;align-items:center;justify-content:center;width:100%;">
                <div class="es-title" style="font-family:${TITAN};font-size:2.1rem;line-height:1;color:${accent};text-transform:uppercase;-webkit-text-stroke:2px #000;text-shadow:3px 3px 0 #000;text-align:center;white-space:nowrap;">${title}</div>
            </div>
            <div style="display:flex;flex-direction:row;align-items:center;justify-content:center;gap:20px;width:100%;">
                <div style="flex:0 0 42%;max-width:250px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-width:0;">
                    ${heroZoneV2}
                    <div style="text-align:center;background:#fdf6d8;border:2px solid #f1c40f;border-radius:14px;padding:4px 22px 6px;box-shadow:2px 2px 0 rgba(0,0,0,0.12);">
                        <div style="font-family:${SYS};font-size:0.6rem;font-weight:700;letter-spacing:1.2px;color:#b8973a;text-transform:uppercase;">${t('end.score')}</div>
                        <div style="font-family:${TITAN};font-size:2.4rem;line-height:1;color:#f1c40f;-webkit-text-stroke:2px #000;text-shadow:2px 2px 0 rgba(0,0,0,0.22);">${d.score}</div>
                    </div>
                </div>
                <div style="flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-width:0;">
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:100%;">
                        ${statTile('💀', d.kills, t('end.kills'))}
                        ${statTile(gemIconSm, d.gems, t('end.gems'))}
                        ${statTile('👑', d.bosses, t('end.bosses'))}
                        ${statTile('🔥', `${d.maxCombo}x`, t('end.combo'))}
                        ${statTile('🟦', d.cubesTotal, t('end.cubes'))}
                        ${d.ctfFlags !== null ? statTile('🚩', `${d.ctfFlags}/3`, t('end.flags')) : statTile('❤️', d.hearts, t('end.hearts'))}
                        ${statTile('💥', d.supers, t('end.supers'))}
                        ${statTile('⏱️', `${d.seconds}s`, t('end.time'))}
                    </div>
                    ${bonusRow}
                    ${victoryBadge}
                    <button class="brawl-btn" id="${btnId}" style="font-size:1.4rem;padding:11px 34px;margin-top:16px;">${t('end.backToMenu')}</button>
                </div>
            </div>
        </div>`;
    }

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
                ${d.ctfFlags !== null ? chip('🚩', `${d.ctfFlags}/3`, t('end.flags')) : chip('❤️', d.hearts, t('end.hearts'))}
                ${chip('💥', d.supers, t('end.supers'))}
                ${chip('⏱️', `${d.seconds}s`, t('end.time'))}
            </div>
            ${bonusRow}
            ${victoryBadge}

            <button class="brawl-btn" id="${btnId}" style="font-size:1.6rem;padding:13px 40px;margin-top:22px;">${t('end.backToMenu')}</button>
        </div>`;
}

/**
 * v2 endcard — tytul dostaje DOKLADNIE szerokosc przycisku (Mariusz: "tej samej szerokosci co button").
 * Mierzymy button po insercie, liczymy letter-spacing tak, by slowo wypelnilo te szerokosc.
 * Dzielimy przez n (nie n-1) bo CSS dodaje letter-spacing takze PO ostatniej literze.
 * rAF: pewnosc, ze layout + font (Titan One) sa gotowe zanim zmierzymy przycisk.
 */
function fitEndTitleToButton(screenEl: HTMLElement): void {
    if (!END_V2_ENABLED) return;
    const btn = screenEl.querySelector('.brawl-btn') as HTMLElement | null;
    const titleEl = screenEl.querySelector('.es-title') as HTMLElement | null;
    if (!btn || !titleEl) return;
    requestAnimationFrame(() => {
        titleEl.style.letterSpacing = '0px';
        titleEl.style.width = 'auto';
        // offsetWidth (NIE getBoundingClientRect) — mierzy w jednostkach layoutu, ignoruje
        // ewentalny transform:scale karty (desktop 1.5x). Inaczej letter-spacing wyszedlby przeskalowany.
        const target = btn.offsetWidth;
        const natural = titleEl.offsetWidth;
        const n = (titleEl.textContent ?? '').length;
        if (n > 1 && target > 0 && natural > 0) {
            titleEl.style.letterSpacing = `${(target - natural) / n}px`;
            titleEl.style.width = `${target}px`;
            titleEl.style.boxSizing = 'border-box';
        }
    });
}

async function triggerGameOver(): Promise<void> {
    // FAZA CTF F2 — drop niesionej flagi przy smierci (legacy 1:1: IDLE @gracz + 10 s reset)
    if (ctfSystem && player) ctfSystem.handlePlayerDeath(player.x, player.y);
    gameState = 'GAMEOVER';
    audio.playGameOver();

    touchManager.hide();

    if (currentSession && currentSession.config.scenario === 'ctf') {
        // FAZA CTF F1 (D10): CTF MVP bez submitu do leaderboardu — endcard lokalny.
        console.log('[Score] CTF: score submit skipped (local endcard only)');
    } else if (currentSession) {
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
        ctfFlags: currentSession?.ctf ? currentSession.ctf.flagsCaptured : null, // FAZA CTF F2
    }, 'retryBtn');
    document.getElementById('retryBtn')!.addEventListener('click', returnToMenuFromEnd);
    screenEl.classList.add('active-screen');
    fitEndTitleToButton(screenEl);
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

        if (currentSession.config.scenario === 'ctf') {
            // FAZA CTF F1 (D10): CTF MVP bez submitu do leaderboardu — endcard lokalny.
            console.log('[Score] CTF: score submit skipped (local endcard only)');
        } else {
            try {
                await scoreService.submitScore(currentSession.score, currentSession.config);
                console.log(`[Score] Submitted (Victory): ${currentSession.score} pts`);
            } catch (e) {
                console.warn('[Score] Submit failed:', e);
            }
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
        ctfFlags: currentSession?.ctf ? currentSession.ctf.flagsCaptured : null, // FAZA CTF F2
    }, 'playAgainBtn');
    document.getElementById('playAgainBtn')!.addEventListener('click', returnToMenuFromEnd);
    screenEl.classList.add('active-screen');
    fitEndTitleToButton(screenEl);
    document.body.classList.remove('game-cursor-hidden');
    hud.clear();
}

app.ticker.add((rawDelta) => {
    // Perf sampling — mierzy REALNY czas klatki (przed early-returnami), akumuluje
    // min/max/avg i co 20 klatek wypisuje wraz z licznikami obiektow.
    if (PERF_ENABLED && perfEl) {
        const nowT = performance.now();
        perfCbStart = nowT; // DEV: start pomiaru czasu callbacku tej klatki
        if (perfLastT > 0) {
            const ms = nowT - perfLastT;
            const fps = 1000 / ms;
            perfSumMs += ms;
            if (fps < perfMinFps) perfMinFps = fps;
            if (fps > perfMaxFps) perfMaxFps = fps;
            if (ms > perfWorstMs) perfWorstMs = ms;
            const pcNow = effects ? effects.getPerfCounts() : { particles: 0, floatingTexts: 0, trackMarks: 0, poolParticles: 0 };
            // Detektor dlugich klatek. Loguje kazdy hitch (>28ms) + ODSTEP od poprzedniego.
            // Dziala tez w preview (prod build) — beacon leci gdy ?perf=1 (na GitHub Pages 404 = noop).
            if (ms > 28) {
                const iv = perfLastHitchT > 0 ? (nowT - perfLastHitchT) : 0;
                perfLastHitchT = nowT;
                const _mem = (((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize) || 0) / 1048576;
                try { navigator.sendBeacon(import.meta.env.BASE_URL + 'perf-log',
                    `HITCH ${ms.toFixed(0)}ms  hud ${perfHudMs.toFixed(1)} cb ${perfCbMs.toFixed(1)}  interval ${iv.toFixed(0)}ms  mem ${_mem.toFixed(0)}MB  enemies ${enemies.length} eBul ${enemyBullets.length} part ${pcNow.particles} kids ${worldContainer.children.length} state ${gameState}`); } catch { /* noop */ }
            }
            if (enemyBullets.length > perfPeakEBul) perfPeakEBul = enemyBullets.length;
            if (bullets.length > perfPeakBul) perfPeakBul = bullets.length;
            if (pcNow.particles > perfPeakPart) perfPeakPart = pcNow.particles;
            if (worldContainer.children.length > perfPeakKids) perfPeakKids = worldContainer.children.length;
            if (enemies.length > perfPeakEnemies) perfPeakEnemies = enemies.length;
            perfFrames++;
            if (perfFrames >= 20) {
                const avg = 1000 / (perfSumMs / perfFrames);
                const perfText =
                    `FPS ${avg.toFixed(0)} (min ${perfMinFps.toFixed(0)} / max ${perfMaxFps.toFixed(0)})  worst ${perfWorstMs.toFixed(0)}ms\n` +
                    `NOW: enemies ${enemies.length}  eBul ${enemyBullets.length}  part ${pcNow.particles}  kids ${worldContainer.children.length}\n` +
                    `PEAK: enemies ${perfPeakEnemies}  eBul ${perfPeakEBul}  bul ${perfPeakBul}\n` +
                    `PEAK: part ${perfPeakPart}  kids ${perfPeakKids}  (poolPart ${pcNow.poolParticles})`;
                perfEl.textContent = perfText;
                // Przeslij te sama linijke do serwera (czyta Claude Code). Dziala w dev i preview.
                // sendBeacon = fire-and-forget, nie blokuje klatki. Tylko gdy ?perf=1.
                {
                    try { navigator.sendBeacon(import.meta.env.BASE_URL + 'perf-log', perfText); } catch { /* noop */ }
                }
                perfFrames = 0; perfSumMs = 0; perfMinFps = 9999; perfMaxFps = 0;
            }
        }
        perfLastT = nowT;
    }

    if (gameState !== 'PLAYING' || !player || !effects || !spawnSystem || !powerSystem || !currentSession) return;

    // === v0.45.0 FAZA 8.7: HIT-STOP ===
    // Early return jeśli aktywny hit-stop — frame freeze (movement, AI, effects, bullets stoją).
    // Audio gra naturalnie (poza ticker context).
    if (hitStopFramesRemaining > 0) {
        hitStopFramesRemaining--;
        return;
    }

    // === F5 SMOOTH MODE: fixed 60Hz logika + interpolowany render ===
    // Akumuluj realny czas; krok logiki tylko gdy uzbieral sie STEP_MS. Klatki bez kroku =
    // render-only: tylko interpoluj world-scroll + gracza (encje jada z worldContainer) i wyjdz.
    const STEP_MS = 1000 / 60;
    if (SMOOTH_MODE) {
        logicAccMs += app.ticker.elapsedMS;
        if (logicAccMs > STEP_MS * 4) logicAccMs = STEP_MS; // guard: tab-switch / spiral of death
        if (logicAccMs < STEP_MS) {
            applySmoothInterp(logicAccMs / STEP_MS); // render-only frame
            return;
        }
        logicAccMs -= STEP_MS;
        // snapshot prev PRZED krokiem logiki (curr stanie sie nowym stanem po kroku)
        icCamPX = icCamCX; icCamPY = icCamCY;
        icPlPX = icPlCX; icPlPY = icPlCY;
    }

    // Wygladzona delta (pacing fix): clamp outlierow (0.5..2.0 = 120..30fps) + wygladzanie wykladnicze.
    // Cala reszta tickera uzywa `delta` (= smoothedDelta), wiec ruch/animacje sa stabilne mimo falowania FPS.
    // SMOOTH_MODE: krok logiki jest STALY (delta=1) — plynnosc daje interpolacja renderu, nie delta.
    const clampedDelta = Math.max(0.5, Math.min(2.0, rawDelta));
    smoothedDelta += (clampedDelta - smoothedDelta) * DELTA_SMOOTH;
    const delta = SMOOTH_MODE ? 1 : smoothedDelta;

    const ZOOM = touchManager.isActive ? MOBILE_WORLD_ZOOM : DESKTOP_WORLD_ZOOM;
    const viewW = hud.screenW / ZOOM;
    const viewH = hud.screenH / ZOOM;

    // Kamera sledzi gracza FLOATEM (bez ~~). ~~ ucinal do px SWIATA, a przy ZOOM 0.7 to nierowne
    // kroki 2,3,3.. => swiat przewijal sie skokowo mimo gladkiej jazdy. Snap przeniesiony NIZEJ do
    // przestrzeni EKRANU. Kamera = dokladny target (zero lagu, gracz wysrodkowany).
    camera.x = Math.max(0, Math.min(WORLD_W - viewW, ~~(player.x - viewW / 2)));
    camera.y = Math.max(0, Math.min(WORLD_H - viewH, ~~(player.y - viewH / 2)));

    worldContainer.x = -camera.x * ZOOM + effects.shakeOffsetX;
    worldContainer.y = -camera.y * ZOOM + effects.shakeOffsetY;
    if (HARNESS_STATIC) { worldContainer.x = -900 * ZOOM; worldContainer.y = -900 * ZOOM; } // F5 harness: freeze scroll (present vs scroll)

    updateTutorialRing(); // FAZA B: ring celujacy w manekina/fale (early-return gdy nie-tutorial)

    // ── Just-in-time item hints: 1. spotkanie przedmiotu/strefy -> dymek przy realnym obiekcie ──
    if (!tutorialActive && !itemHints.isActive()) {
        const onScr = (ox: number, oy: number): boolean =>
            ox > camera.x - 40 && ox < camera.x + viewW + 40 && oy > camera.y - 40 && oy < camera.y + viewH + 40;
        if (!itemHints.hasSeen('heart') && hearts.length > 0 && onScr(hearts[0].x, hearts[0].y)) {
            itemHints.trigger('heart', t('hint.heart'), hearts[0].x, hearts[0].y);
        } else if (!itemHints.hasSeen('magnet') && magnets.length > 0 && onScr(magnets[0].x, magnets[0].y)) {
            itemHints.trigger('magnet', t('hint.magnet'), magnets[0].x, magnets[0].y);
        } else if (!itemHints.hasSeen('cube') && powerCubes.length > 0 && onScr(powerCubes[0].x, powerCubes[0].y)) {
            itemHints.trigger('cube', t('hint.cube'), powerCubes[0].x, powerCubes[0].y);
        } else if (!itemHints.hasSeen('mediPad')) {
            const p = nearestInRange(mediPads, 240);
            if (p) itemHints.trigger('mediPad', t('hint.mediPad'), p.x, p.y);
        } else if (!itemHints.hasSeen('powerPad')) {
            const p = nearestInRange(powerPads, 240);
            if (p) itemHints.trigger('powerPad', t('hint.powerPad'), p.x, p.y);
        }
    }
    itemHints.updateWorld(worldContainer.x, worldContainer.y, ZOOM);

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
    // FAZA CTF F1 — fosa: slow 0.5x jak quicksand/sludge (passable)
    let playerInFosa = false;
    if (ruinsFosa) {
        ruinsFosa.update();
        if (ruinsFosa.isPointInside(player.x, player.y)) {
            playerInFosa = true;
        }
    }
    // FAZA CTF F2 — carry penalty (x0.90/0.85/0.80 wg eskalacji) MULTIPLIKATYWNIE
    // ze slow-zone (fosa z flaga = 0.5 * carry) — legacy 1536 1:1.
    const ctfCarryMult = ctfSystem ? ctfSystem.getCarrySpeedMult() : 1.0;
    player.speedModifier = ((playerInQuicksand || playerInSludge || playerInFosa) ? 0.5 : 1.0) * ctfCarryMult;
    
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
        if (!enemyInSlow && ruinsFosa && ruinsFosa.isPointInside(enemy.x, enemy.y)) {
            enemyInSlow = true; // FAZA CTF F1 — fosa spowalnia tez wrogow (fair play)
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

    // FAZA CTF F1 — zarosla (stealth kola, wzorzec oasis)
    let playerInRuinsBush = false;
    for (const rb of ruinsBushes) {
        rb.update();
        if (rb.isPointInside(player.x, player.y)) {
            playerInRuinsBush = true;
        }
    }

    let playerInCornField = false;
    let playerInSugarcaneField = false;
    for (const ff of farmFields) {
        ff.update(camera.x, camera.y, viewW, viewH);
        ff.onTankEnter(player.x, player.y);
        if (ff.isPointInside(player.x, player.y)) {
            if (ff instanceof CornField) playerInCornField = true;
            else if (ff instanceof SugarcaneField) playerInSugarcaneField = true;
        }
    }
    const playerInFarmStealth = playerInCornField || playerInSugarcaneField;

    const nowMs = Date.now();
    const playerInAnyStealth = playerInOasis || playerInFarmStealth || playerInNeonStation || playerInRuinsBush;
    const wasInAnyStealthLastFrame = wasInOasisLastFrame || wasInCornLastFrame || wasInNeonLastFrame || wasInRuinsBushLastFrame;

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
        } else if (playerInRuinsBush) {
            hud.addNotif(t('hud.stealthBush'), '#76ab63'); // FAZA CTF F1
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
    wasInRuinsBushLastFrame = playerInRuinsBush; // FAZA CTF F1
    wasStealthActiveLastFrame = isStealthActive;
    // v0.50.1: catch-all reset flag stealthBrokenByShot gdy stealth nieaktywne.
    // Pokrywa edge case: gracz strzelil ze strefy ale wyszedl ZARAZ -> flag bez reset
    // -> nastepne wejscie do strefy -> bledny komunikat. Reset tutaj eliminuje problem.
    if (!isStealthActive) {
        stealthBrokenByShot = false;
    }

    // FAZA CTF F2 — rdzen CTF. Po bloku stealth (enemy.playerStealthed swieze),
    // przed petla enemies (stany guardow ustawione w TEJ klatce).
    if (ctfSystem) {
        const ctfResult = ctfSystem.update(delta, player, powerSystem.isInvulnerable);
        if (ctfResult.victory) { triggerVictory(); return; }
        if (ctfResult.playerDied) { triggerGameOver(); return; }
    }

    if (river) river.update();
    if (waterLife) waterLife.update();
    if (sandstormBorder) sandstormBorder.update();
    if (tropicalBorder) tropicalBorder.update();
    if (cyberpunkBorder) cyberpunkBorder.update(); // v0.52.0 fix #21
    if (glacialBorder) glacialBorder.update(); // FAZA A (Arctic)
    if (ruinsBorder) ruinsBorder.update();     // FAZA CTF F1 (no-op, spojnosc interfejsu)
    // FAZA CTF F3 — beacon dostawy: dramatyczny tryb gdy gracz niesie flage
    if (ruinsHangar) ruinsHangar.update(ctfSystem ? ctfSystem.getCarriedFlag() !== null : false);
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
                spawnGem(drop.x, drop.y);
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

    player.firing = isMouseDown; // FAZA P3 — supresja taunt bounce podczas strzelania (lab: !pointer.down)
    player.update(delta, keys, mouseWorldX, mouseWorldY, buildings, effects, touchMoveVector);

    if (currentSession.config.map === 'desert' && player.isMoving) {
        sandKickFrameCounter++;
        const interval = player.hasSpeedBoost ? 2 : 3;
        if (sandKickFrameCounter >= interval) {
            sandKickFrameCounter = 0;
            const intensity = player.hasSpeedBoost ? 1.6 : 1.0;
            effects.spawnSandKick(player.x, player.y, player.hullAngle, intensity);
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
        if (!g.active) { gems.splice(i, 1); gemPool.push(g); continue; } // POOLING: zwrot do puli
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
                gemPool.push(g); // POOLING: zwrot do puli po zebraniu
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

        const angle = player.turretAngle;
        // FAZA P2 — muzzle z czubka lufy 2.5D (per-brawler muzzleDist + camera tilt + Z lift),
        // gated ?baker=1. Flat path: stare planarne +45 (bit-for-bit nietkniete).
        const muzzle = BAKER_ENABLED && BulletSpriteBaker.isBaked(player.brawler.id)
            ? BulletSpriteBaker.getMuzzlePos(player.brawler.id, player.x, player.y, angle)
            : { x: player.x + Math.cos(angle) * 45, y: player.y + Math.sin(angle) * 45 };
        const sX = muzzle.x;
        const sY = muzzle.y;
        effects.spawnMuzzleFlash(sX, sY, angle);

        const wasActive = player.isSuperShotActive;
        const isSuperShot = player.tryActivateOrContinueSuperShot();
        const justActivated = !wasActive && isSuperShot;

        if (justActivated) {
            audio.playSuperShotActivate();
        }

        audio.playShoot(player.brawler.id);

        const dmgMultiplier = 1 + currentSession.dmgBonus;

        // FAZA P2 — Warstwa 2 super uklady (bake+super); flat/normal = stara logika (3 / 1+2).
        // dmg per-pocisk * dmgMultiplier (round) jak dotad.
        // FAZA P5 — super v2 (rozdzielone od renderu): SUPER_V2 + super => SUPER_PROFILES (uklad + dmg
        // per-pocisk absolutny). Inaczej stara sciezka getVolleyOffsets (bit-for-bit).
        const superProfile = (SUPER_V2_ENABLED && isSuperShot) ? SUPER_PROFILES[player.brawler.id] : null;
        const normalProfile = (SUPER_V2_ENABLED && !isSuperShot) ? NORMAL_PROFILES[player.brawler.id] : null;
        const shotProfile = superProfile || normalProfile;
        const volleyOffsets = shotProfile ? shotProfile.offsets : getVolleyOffsets(player.brawler, isSuperShot);
        for (const off of volleyOffsets) {
            const b = acquireBullet(sX, sY, angle + off, isSuperShot, shotProfile?.dmg); // POOLING
            b.dmg = Math.round(b.dmg * dmgMultiplier);
            if (shotProfile) b.applyBehavior(shotProfile); // FAZA P5 Batch 2 — breakup/boomerang
            bullets.push(b);
        }
        
        player.triggerRecoil(); // FAZA P3 — recoil + chassis kick + pitch bump (no-op w flat)
        lastShotTime = now;
        neonDidShootLastFrame = true; // v0.60.0 TIER 3 — sygnal dla drona (panika)
    }

    // FAZA P5 Batch 2 — ctx dla behaviorow (breakup -> fragi do bullets[], boomerang -> namierza gracza).
    const bulletCtx = { bullets, playerX: player?.x ?? 0, playerY: player?.y ?? 0 };
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.update(delta, solidBuildings, effects, bulletCtx);
        if (!b.active) { bullets.splice(i, 1); bulletPool.push(b); } // POOLING: zwrot do puli
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const eb = enemyBullets[i];
        eb.update(delta, solidBuildings, effects);
        if (!eb.active) { enemyBullets.splice(i, 1); enemyBulletPool.push(eb); continue; } // POOLING
        // FAZA CTF F2 — strefa domowa: pociski wroga gina na x<450 (legacy 4456 1:1).
        // F3 (playtest): + "swiete altary" — pociski gina takze w kieszeni flagi
        // (100 px), zeby boss nie zestrzeliwal gracza podczas podnoszenia flagi.
        if (ctfSystem && (eb.x < 450 || ctfSystem.isInFlagSafePocket(eb.x, eb.y))) {
            eb.deactivate();
            enemyBullets.splice(i, 1);
            enemyBulletPool.push(eb); // POOLING
            continue;
        }
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
            eb.deactivate();
            enemyBullets.splice(i, 1);
            enemyBulletPool.push(eb); // POOLING
            if (playerDied) { triggerGameOver(); return; }
        }
    }

    if (!tutorialActive) { // FAZA A: w tutorialu spawn OFF (bezpieczny sandbox nauki)
        const spawnResult = spawnSystem.update(delta, enemies, hearts, magnets, player.x, player.y, worldContainer, buildings, spawnBlocked);
        for (const newEnemy of spawnResult.newEnemies) {
            attachEnemyCubeStolenCallback(newEnemy);
        }
        enemies.push(...spawnResult.newEnemies);
        hearts.push(...spawnResult.newHearts);
        magnets.push(...spawnResult.newMagnets);
        if (spawnResult.megaBossJustSpawned) hud.triggerMegaBossAlert();
    }

    powerSystem.update(delta, player, enemies, worldContainer, effects);

    for (const crate of crates) {
        crate.update(0, 0, 0, 0);
    }

    // F3 — wrogowie (roamerzy + straznicy) koliduja z bariera strefy domowej;
    // gracz uzywa czystego `buildings`, wiec wjezdza do bazy z flaga swobodnie.
    // F3 perf: tablica PRECOMPUTED w startGame (zero alokacji per-klatka).
    const enemyBuildings = ctfEnemyBuildings ?? buildings;
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        const shotInfo = enemy.update(delta, player.x, player.y, enemyBuildings, powerCubes);
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
                // FAZA P5 Batch 2 — boomerang: pierce (nie ginie), 1 hit/wroga/faza.
                const isBoomerang = b.behavior === 'boomerang';
                if (isBoomerang && b.hitEnemies.has(enemy)) continue;
                const hitX = b.x, hitY = b.y;
                if (isBoomerang) {
                    b.hitEnemies.add(enemy);
                } else {
                    b.deactivate();
                    bullets.splice(j, 1);
                    bulletPool.push(b); // POOLING: zwrot do puli po trafieniu
                }
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
                // FAZA P5 Batch 3 — pancerny shockwave-on-hit: AoE + pierscien + detonacja.
                if (b.behavior === 'shockwave') {
                    triggerShockwave(hitX, hitY, b.shockwaveRadius, b.shockwaveDmg, enemy);
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
    // v0.68.0: sortableChildren=false (auto-sort OFF) + manual sort CO KLATKE = 1 sort/frame
    // (oryginal robil 2: auto+manual). Poprawna glebokosc co klatke => zero migotania, taniej niz oryginal.
    worldContainer.sortChildren();

    // FAZA CTF F3 — dane CTF dla HUD (panel flag + carry banner + edge arrows).
    // Edge arrows to WARUNEK grywalnosci przy zoom 0.6 (flagi 2200-2700 px od siebie).
    // F3 perf: MUTUJEMY staly obiekt (ctfHudInfo) zamiast alokowac nowy + .map co klatke
    // (poprzednio: obiekt + tablica + 3 obiekty na klatke => skoki GC = szarpanie mobile).
    if (ctfSystem && currentSession.ctf) {
        const carried = ctfSystem.getCarriedFlag();
        const sysFlags = ctfSystem.flags;
        for (let fi = 0; fi < sysFlags.length; fi++) {
            const f = sysFlags[fi];
            const slot = ctfHudInfo.flags[fi];
            slot.x = f.x; slot.y = f.y; slot.color = f.color; slot.state = f.state; slot.name = f.name;
        }
        ctfHudInfo.hangarX = ctfSystem.hangarRect.x + ctfSystem.hangarRect.w / 2;
        ctfHudInfo.hangarY = ctfSystem.hangarRect.y + ctfSystem.hangarRect.h / 2;
        ctfHudInfo.carrying = carried !== null;
        ctfHudInfo.carryColor = carried ? carried.color : 0xf1c40f;
        ctfHudInfo.flagsCaptured = currentSession.ctf.flagsCaptured;
        ctfHudInfo.cameraX = camera.x;
        ctfHudInfo.cameraY = camera.y;
        ctfHudInfo.zoom = ZOOM;
        hud.ctfInfo = ctfHudInfo;
    } else {
        hud.ctfInfo = null;
    }

    // DEV-ONLY: mikro-profiler — czas hud.render() + calego callbacku (do rozbicia hitcha).
    if (PERF_ENABLED) {
        const _hudT = performance.now();
        if (!HARNESS_NOHUD) hud.render(player, currentSession.score, spawnSystem.totalKills, mouse, spawnSystem, megaBoss, powerSystem);
        perfHudMs = performance.now() - _hudT;
        perfCbMs = performance.now() - perfCbStart;
    } else {
        if (!HARNESS_NOHUD) hud.render(player, currentSession.score, spawnSystem.totalKills, mouse, spawnSystem, megaBoss, powerSystem);
    }

    // === F5 SMOOTH MODE: zapisz stan po kroku (kamera+gracz) i naloz interpolacje renderu ===
    if (SMOOTH_MODE) {
        if (smoothNeedsInit) {
            // pierwszy krok nowego meczu: prev=curr => zero skoku na spawnie
            icCamPX = icCamCX = camera.x; icCamPY = icCamCY = camera.y;
            icPlPX = icPlCX = player.container.x; icPlPY = icPlCY = player.container.y;
            smoothNeedsInit = false;
        } else {
            icCamCX = camera.x; icCamCY = camera.y;
            icPlCX = player.container.x; icPlCY = player.container.y;
        }
        applySmoothInterp(logicAccMs / STEP_MS);
    }
});

// === F5: TWARDY frame-limiter (?cap=N). PIXI app.ticker.maxFPS NIE trzymal na A54 (log: 130fps
// przy maxFPS 60). Przejmujemy pompowanie tickera wlasnym rAF z bramka czasowa => render
// zablokowany na CAP_FPS. Cel: zamienic oscylacje 21<->130fps (governor/throttle A54) na stabilne
// 60 = koniec juddera. Domyslnie OFF (produkcja bez zmian).
if (CAP_ENABLED) {
    app.ticker.stop(); // zatrzymaj wewnetrzny rAF PIXI — pompujemy recznie
    const CAP_MS = 1000 / CAP_FPS;
    let _next = performance.now(); // czas NASTEPNEJ dozwolonej klatki
    const _capLoop = (now: number): void => {
        requestAnimationFrame(_capLoop);
        if (now < _next - 1) return;             // za wczesnie (1ms tolerancji) => pomin te klatke
        _next += CAP_MS;                          // zaplanuj kolejna o staly interwal
        if (_next < now) _next = now + CAP_MS;    // spadlismy w tyl => resync (bez burst catch-up)
        app.ticker.update(now);                   // 1 cykl tickera: nasz callback + render PIXI
    };
    requestAnimationFrame(_capLoop);
}