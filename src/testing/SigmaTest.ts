import type * as PIXI from 'pixi.js';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { ICollidable } from '../types/MapType';
import type { GameConfig, DifficultyId } from '../types/GameConfig';
import type { ScenarioId } from '../types/Scenario';
import type { MapId } from '../types/MapType';
import { GameConfigBuilder } from '../types/GameConfig';
import { setSigmaEmitter, sigmaFrame, type SigmaEvent } from './sigmaFlag';
import { runOracles, ORACLES, type OracleInput } from './oracles';
import { BotPolicy, type BotMode } from './BotPolicy';

/**
 * SigmaTest — warstwa testowa gry (`window.__sigmaTest`), ladowana DYNAMICZNIE tylko z `?bot=1`.
 *
 * Daje botowi/runnerowi (Playwright) trzy rzeczy:
 *  - snapshot(): stan swiata w jednej strukturze (gracz, wrogowie, pociski, pickupy, kolizje, scenariusz),
 *  - events: ring zdarzen z silnika (spawn/damage/kill/power/outcome/error/submitAttempt),
 *  - control + input: start meczu z configu, deterministyczne step(n) (pompowanie tickera, dziala w
 *    ukrytej karcie), god-mode, teleport, wstrzykiwanie inputu (desktop keys/mouse lub TouchInputManager).
 * Most do stanu main.ts = `SigmaBridge` (gettery/zamkniecia) — SigmaTest NIE importuje main.ts.
 * Oracles (S2) sa czystymi funkcjami nad {snapshot, events} — zob. ./oracles.
 */

export interface SigmaBridge {
    app: PIXI.Application;
    worldW: number; worldH: number;
    get gameState(): string;
    get player(): Player | null;
    get enemies(): Enemy[];
    get bullets(): { x: number; y: number; active?: boolean }[];
    get enemyBullets(): { x: number; y: number; vx: number; vy: number }[];
    /** S5a: sloty mocy (loadout + gotowosc + cooldown) */
    get powers(): { loadout: string[]; ready: boolean[]; cdLeft: number[]; active: string | null; dice: boolean } | null;
    get powersUsed(): number;
    /** S5a: srodki padow naprawy + gotowosc */
    get mediPads(): { x: number; y: number; ready: boolean }[];
    /** S5a: stan CTF z HUD (flagi, hangar, niesienie) */
    get ctfInfo(): { flags: { x: number; y: number; state: string; name: string }[]; hangarX: number; hangarY: number; carrying: boolean } | null;
    get hearts(): { x: number; y: number }[];
    get magnets(): { x: number; y: number }[];
    get gems(): { x: number; y: number }[];
    get powerCubes(): { x: number; y: number }[];
    get buildings(): ICollidable[];
    get solidBuildings(): ICollidable[];
    get camera(): { x: number; y: number };
    get session(): { score: number; config: GameConfig; getElapsedSeconds(): number } | null;
    get seed(): number;
    get scenarioInfo(): unknown; // queen/castle/ctf HUD info (per scenariusz)
    get perfCounts(): { particles: number; floatingTexts: number; trackMarks: number; poolParticles: number };
    get screen(): { w: number; h: number; zoom: number; isTouch: boolean };
    startGame(cfg: GameConfig): Promise<void>;
    returnToMenu(): void;
    hideMenu(): void;
    /** desktop input */
    setKeys(k: { w: boolean; a: boolean; s: boolean; d: boolean }): void;
    setMouse(screenX: number, screenY: number, down: boolean): void;
    /** mobile input (TouchInputManager.inject*) */
    injectTouch(move: { x: number; y: number } | null, aim: { x: number; y: number } | null, fire: boolean): void;
    requestSuper(slot: 0 | 1 | 2): void;
    setGod(on: boolean): void;
    teleport(x: number, y: number): void;
}

export interface SigmaSnapshot {
    build: string; frame: number; gameState: string; seed: number;
    config: { scenario: ScenarioId; map: MapId; brawler: string; difficulty: DifficultyId } | null;
    world: { w: number; h: number };
    screen: { w: number; h: number; zoom: number; isTouch: boolean };
    camera: { x: number; y: number };
    player: { x: number; y: number; hp: number; maxHp: number; super: number; moving: boolean } | null;
    enemies: Array<{ id: number; x: number; y: number; hp: number; maxHp: number; kind: 'enemy' | 'boss' | 'mega' | 'pursuit'; role: string | null; frozen: boolean; active: boolean; stuck: number; shots: number }>;
    bullets: number; enemyBullets: number;
    /** S5a: do 30 najblizszych pociskow wroga (< 450 px od gracza) z predkoscia — unik bota */
    bulletsNear: Array<{ x: number; y: number; vx: number; vy: number }>;
    powers: { loadout: string[]; ready: boolean[]; cdLeft: number[]; active: string | null; dice: boolean } | null;
    powersUsed: number;
    mediPads: Array<{ x: number; y: number; ready: boolean }>;
    ctf: { flags: { x: number; y: number; state: string; name: string }[]; hangarX: number; hangarY: number; carrying: boolean } | null;
    pickups: { hearts: number; magnets: number; gems: number; cubes: number };
    pickupPos: { hearts: { x: number; y: number }[]; gems: { x: number; y: number }[] };
    buildings: Array<{ x: number; y: number; w: number; h: number }>;
    solids: Array<{ x: number; y: number; w: number; h: number }>;
    score: number; elapsedSec: number;
    scenario: unknown;
    perf: { particles: number; heapMB: number };
}

const RING_MAX = 5000;
const BUILD = ((): string => { try { return (document.getElementById('credits')?.textContent ?? '').replace('Game version: ', '').trim(); } catch { return '?'; } })();

export function installSigmaTest(bridge: SigmaBridge): void {
    // WIRTUALNY ZEGAR (tylko ?bot=1): runner pompuje klatki szybciej niz czas rzeczywisty (90 s meczu w ~23 s),
    // a czesc logiki gry liczy z Date.now/performance.now (fazy Zamku, freeze, laska startowa, wieza, banery).
    // Bez tego intro Zamku (12 s) trwalo ~48 s meczu, a laska Krolowej (5 s) caly mecz bota.
    // Zegar idzie WYLACZNIE ze step(): +1000/60 ms na klatke => logika czasowa = logika klatkowa (krok do M: seed 1:1).
    const realDateNow = Date.now.bind(Date);
    const realPerfNow = performance.now.bind(performance);
    const t0 = realDateNow(), p0 = realPerfNow();
    let virtualMs = 0;
    Date.now = (): number => t0 + virtualMs;
    performance.now = (): number => p0 + virtualMs;

    const events: Array<SigmaEvent & { frame: number; ts: number }> = [];
    const push = (e: SigmaEvent): void => {
        events.push({ ...e, frame: sigmaFrame.n, ts: realDateNow() });
        if (events.length > RING_MAX) events.splice(0, events.length - RING_MAX);
    };
    setSigmaEmitter(push);

    // L1: kazdy uncaught / unhandled rejection = zdarzenie (bot nie moze przegapic crasha)
    window.addEventListener('error', (ev) => push({ t: 'error', msg: String(ev.message ?? ev), stack: String((ev.error as Error | undefined)?.stack ?? '') }));
    window.addEventListener('unhandledrejection', (ev) => { const r = (ev as PromiseRejectionEvent).reason as { message?: string; stack?: string } | string; push({ t: 'error', msg: String(typeof r === 'string' ? r : r?.message ?? r), stack: String(typeof r === 'string' ? '' : r?.stack ?? '') }); });

    let stepClock = p0;
    let god = false;

    const snapshot = (): SigmaSnapshot => {
        const p = bridge.player;
        const s = bridge.session;
        const cfg = s?.config ?? null;
        const rect = (b: ICollidable): { x: number; y: number; w: number; h: number } => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
        const mem = ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576;
        return {
            build: BUILD, frame: sigmaFrame.n, gameState: bridge.gameState, seed: bridge.seed,
            config: cfg ? { scenario: cfg.scenario, map: cfg.map, brawler: cfg.brawlerId, difficulty: cfg.difficulty } : null,
            world: { w: bridge.worldW, h: bridge.worldH },
            screen: bridge.screen,
            camera: { x: bridge.camera.x, y: bridge.camera.y },
            player: p ? { x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, super: p.superCharges, moving: p.isMoving } : null,
            enemies: bridge.enemies.map(e => ({
                id: e.sigmaId, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp,
                kind: e.isMegaBoss ? 'mega' : e.isBoss ? 'boss' : e.isPursuit ? 'pursuit' : 'enemy',
                role: e.castleRole ?? e.queenRole ?? (e.guard ? 'guard' : null), frozen: Date.now() < e.frozenUntil, active: e.active, stuck: e.sigmaStuckFrames, shots: e.sigmaShots,
            })),
            bullets: bridge.bullets.length, enemyBullets: bridge.enemyBullets.length,
            bulletsNear: p ? bridge.enemyBullets
                .map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, d: Math.hypot(b.x - p.x, b.y - p.y) }))
                .filter(b => b.d < 450).sort((a, b) => a.d - b.d).slice(0, 30)
                .map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })) : [],
            powers: bridge.powers, powersUsed: bridge.powersUsed, mediPads: bridge.mediPads,
            ctf: ((): SigmaSnapshot['ctf'] => { const c = bridge.ctfInfo; return c ? { flags: c.flags.map(f => ({ x: f.x, y: f.y, state: f.state, name: f.name })), hangarX: c.hangarX, hangarY: c.hangarY, carrying: c.carrying } : null; })(),
            pickups: { hearts: bridge.hearts.length, magnets: bridge.magnets.length, gems: bridge.gems.length, cubes: bridge.powerCubes.length },
            pickupPos: { hearts: bridge.hearts.map(h => ({ x: h.x, y: h.y })), gems: bridge.gems.slice(0, 20).map(g => ({ x: g.x, y: g.y })) },
            buildings: bridge.buildings.filter(b => b.w > 0 && b.h > 0).map(rect),
            solids: bridge.solidBuildings.filter(b => b.w > 0 && b.h > 0).map(rect),
            score: s?.score ?? 0, elapsedSec: s?.getElapsedSeconds() ?? 0,
            scenario: bridge.scenarioInfo,
            perf: { particles: bridge.perfCounts.particles, heapMB: Math.round(mem) },
        };
    };

    /** Pompuje n klatek logiki przez ticker PIXI (60 Hz, monotoniczny zegar — dziala w ukrytej karcie). */
    const step = (n: number): void => {
        for (let i = 0; i < n; i++) {
            virtualMs += 1000 / 60;
            stepClock = p0 + virtualMs;
            sigmaFrame.n++;
            bridge.app.ticker.update(stepClock);
            if (god) { const p = bridge.player; if (p) p.hp = p.maxHp; }
        }
    };

    const control = {
        /** Start meczu z prostego opisu (domyslnie: ktb/desert/twardy/normal). */
        start: async (o: { scenario?: ScenarioId; map?: MapId; brawler?: string; difficulty?: DifficultyId; tutorial?: boolean } = {}): Promise<void> => {
            const scenario = o.scenario ?? 'ktb';
            // Swiezy profil Playwrighta = pusty localStorage = szkolenie Zamku/Krolowej ON (zero fal przez caly mecz).
            // Domyslnie bot gra WLASCIWY mecz; { tutorial: true } zostawia szkolenie (osobny test K/UX).
            if (!o.tutorial) { try { localStorage.setItem('bt2:castle_tut_done', '1'); localStorage.setItem('bt2:queen_tut_done', '1'); } catch { /* prywatny tryb */ } }
            const map: MapId = o.map ?? (scenario === 'ctf' ? 'fortified_ruins' : scenario === 'castle' ? 'castle_grounds' : scenario === 'save_queen' ? 'dungeon' : 'desert');
            const cfg = new GameConfigBuilder().setScenario(scenario).setMap(map).setBrawlerId(o.brawler ?? 'twardy').setDifficulty(o.difficulty ?? 'normal').setProfileId('sigma-bot').build();
            bridge.hideMenu();
            events.length = 0; sigmaFrame.n = 0;
            await bridge.startGame(cfg);
            push({ t: 'mark', tag: `start ${scenario}/${map}/${cfg.brawlerId}/${cfg.difficulty} seed=${bridge.seed}` });
        },
        step,
        stop: (): void => { bridge.returnToMenu(); },
        god: (on: boolean): void => { god = on; bridge.setGod(on); },
        teleport: (x: number, y: number): void => bridge.teleport(x, y),
        mark: (tag: string): void => push({ t: 'mark', tag }),
    };

    const input = {
        /** kierunek ruchu (-1..1) lub null = stop */
        move: (v: { x: number; y: number } | null): void => {
            if (bridge.screen.isTouch) { bridge.injectTouch(v, undefined as unknown as null, undefined as unknown as boolean); return; }
            const k = { w: false, a: false, s: false, d: false };
            if (v) { if (v.y < -0.3) k.w = true; if (v.y > 0.3) k.s = true; if (v.x < -0.3) k.a = true; if (v.x > 0.3) k.d = true; }
            bridge.setKeys(k);
        },
        /** cel w swiecie + ogien */
        aimWorld: (wx: number, wy: number, fire: boolean): void => {
            const p = bridge.player; if (!p) return;
            if (bridge.screen.isTouch) {
                const dx = wx - p.x, dy = wy - p.y, d = Math.hypot(dx, dy) || 1;
                bridge.injectTouch(undefined as unknown as null, { x: dx / d, y: dy / d }, fire);
                return;
            }
            const z = bridge.screen.zoom;
            bridge.setMouse((wx - bridge.camera.x) * z, (wy - bridge.camera.y) * z, fire);
        },
        super: (slot: 0 | 1 | 2 = 0): void => bridge.requestSuper(slot),
        release: (): void => { bridge.setKeys({ w: false, a: false, s: false, d: false }); bridge.setMouse(bridge.screen.w / 2, bridge.screen.h / 2, false); bridge.injectTouch(null, null, false); },
    };

    // bot: polityka w przegladarce; tick(n) = n klatek logiki z decyzja co 6 klatek
    let bot: BotPolicy | null = null;
    const botApi = {
        setMode: (m: BotMode): void => { if (!bot) bot = new BotPolicy({ snapshot, move: input.move, aimWorld: input.aimWorld, super: input.super, release: input.release }, bridge.seed || 1); bot.setMode(m); },
        tick: (n: number): void => { if (!bot) botApi.setMode('play'); for (let i = 0; i < n; i++) { bot!.tick(); step(1); } },
        get mode(): BotMode | null { return bot?.currentMode ?? null; },
    };
    const oracles = {
        ids: ORACLES.map(o => ({ id: o.id, title: o.title })),
        run: (inp: OracleInput) => runOracles(inp),
    };

    (window as unknown as { __sigmaTest: unknown }).__sigmaTest = {
        version: 1, build: BUILD,
        snapshot, events, control, input, bot: botApi, oracles,
        clearEvents: (): void => { events.length = 0; },
    };
    console.log(`[SigmaTest] installed (build ${BUILD}) — window.__sigmaTest { snapshot, events, control, input }`);
}
