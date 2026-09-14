import * as PIXI from 'pixi.js';
import { Enemy } from '../../entities/Enemy';
import { worldRng } from '../Rng';
import { ENEMY_NORMAL, ENEMY_BOSS, type EnemyConfig } from '../../config/enemies';
import type { DifficultyModifiers } from '../../config/difficulty';
import { DUNGEON_SPAWN_SPOTS, DUNGEON_START_RANK, type DungeonPoint } from '../../maps/DungeonMap';

type SpawnSpot = DungeonPoint & { id: string };
import { DUNGEON_HEX as H } from '../../maps/dungeon/dungeonPalette';
import { QUEEN_TUNING as T, type QueenPhaseDef } from './queenTuning';

/**
 * QueenDirector — dyrektor czasu scenariusza SAVE THE QUEEN (Q3). Wzorzec WaveDirector
 * (Zamek), ale sterowany ZEGAREM, nie tabela fal: faza (calm/siege/panic z queenTuning)
 * daje interwal batchy, cap jednoczesnych wrogow i (Q4) udzial Budowniczych.
 *
 *  - CIAGLY SPAWN (Q6, Mariusz: "nie falami, jak KTB"): co spawnIntervalFrames/batchSize fazy
 *    jeden raider wyjezdza z kraty (pod capem fazy). Lane'y rotuja, co 3. spawn z kraty
 *    NAJBLIZSZEJ graczowi. Flara na kracie i strzalka HUD przez 0.6 s PO wyjazdzie
 *    (Czytelnosc: "stad wyjechal"), bez blokujacego telegrafu — napor jest staly, nie falowy.
 *  - BOSS: co bossKillTrigger killi (DifficultyModifiers, 1:1 z KTB), max 1 zywy;
 *    spawn z lane'u najblizszego graczowi (ma byc WIDOCZNY); w PANICE z eskorta 2 raiderow.
 *  - Q4: Budowniczy (builderEvery/builderCap) — tu tylko zarezerwowane liczniki.
 * Zero pathfindingu — raiderzy uzywaja AI KTB (celuja w gracza) + Enemy.moveAvoiding.
 * Wrogowie z tego dyrektora maja `queenLane` (do statystyk/telegrafu), NIE castleRole.
 */

export interface QueenDirectorOpts {
    worldContainer: PIXI.Container;
    enemies: Enemy[];
    difficulty: DifficultyModifiers;
    /** faza z zegara (QueenSystem.phaseDef) */
    phaseDef: () => QueenPhaseDef;
    /** mecz trwa (nie rescued/captured) */
    isRunning: () => boolean;
    /** regular kille gracza (SpawnSystem.regularKills — jeden licznik dla statystyk i bossa) */
    killCount: () => number;
    /** po KAZDYM spawnie (main: attachEnemyCubeStolenCallback + freeze-on-spawn) */
    onSpawn: (enemy: Enemy) => void;
    onBossSpawned: (enemy: Enemy, spot: SpawnSpot) => void;
    /** flara w punkcie spawnu (main: portal + SFX + pochodnie) */
    onLaneTelegraph: (spot: SpawnSpot) => void;
}

const FLARE_FRAMES = 36; // 0.6 s flary po spawnie

export class QueenDirector {
    private readonly opts: QueenDirectorOpts;
    private readonly flare: PIXI.Graphics;
    private elapsedFrames = 0;
    private nextBatchAt: number;
    private telegraphLane: SpawnSpot | null = null;
    private telegraphLeft = 0;
    private spawnNo = 0;
    private laneCursor = 0;
    private batchNo = 0;
    private nextBossAtKills: number;
    private boss: Enemy | null = null;
    private laneCounts = new Map<string, number>();
    public spawnedTotal = 0;
    public bossesSpawned = 0;

    private startRankDone = false;

    constructor(opts: QueenDirectorOpts) {
        this.opts = opts;
        this.nextBatchAt = Math.round(T.firstSpawnDelayMs / 1000 * 60);
        this.nextBossAtKills = opts.difficulty.bossKillTrigger;
        this.flare = new PIXI.Graphics();
        this.flare.zIndex = 3; // na posadzce, pod czolgami
        this.flare.visible = false;
        opts.worldContainer.addChild(this.flare);
    }

    /** Punkt swiezego spawnu (HUD: strzalka pulsuje 0.6 s) — pusta lista, gdy cicho. */
    public get activeLanes(): SpawnSpot[] { return this.telegraphLane ? [this.telegraphLane] : []; }
    public get bossAlive(): boolean { return !!(this.boss && this.boss.active); }

    private scaleConfig(base: EnemyConfig): EnemyConfig {
        const m = this.opts.difficulty;
        return {
            ...base,
            hp: Math.round(base.hp * m.enemyHpMult),
            dmg: Math.round(base.dmg * m.enemyDmgMult),
            bulletDmg: Math.round(base.bulletDmg * m.enemyDmgMult),
            speedMin: base.speedMin * m.enemySpeedMult,
            speedMax: base.speedMax * m.enemySpeedMult,
        };
    }

    /** Liczby batcha skalowane stosunkiem maxEnemiesOnMap trudnosci do Normal (20) — jak WaveDirector. */
    private countMult(): number {
        return Math.max(0.6, Math.min(1.5, this.opts.difficulty.maxEnemiesOnMap / 20));
    }

    /** Zywi RAIDERZY (bez Budowniczych — oni maja wlasny cap). */
    private aliveCount(): number {
        let n = 0;
        for (const e of this.opts.enemies) if (e.active) n++;
        return n;
    }

    /** Q6: punkty dozwolone = dalej niz spawnMinDistFromPlayer od gracza (fair). */
    private allowedSpots(px: number, py: number): SpawnSpot[] {
        const r2 = T.spawnMinDistFromPlayer * T.spawnMinDistFromPlayer;
        const ok = DUNGEON_SPAWN_SPOTS.filter(s => (s.x - px) ** 2 + (s.y - py) ** 2 >= r2);
        return ok.length ? ok : [...DUNGEON_SPAWN_SPOTS];
    }
    private nearestLane(px: number, py: number): SpawnSpot {
        const spots = this.allowedSpots(px, py);
        let best = spots[0];
        let bd = Infinity;
        for (const l of spots) { const d = (l.x - px) ** 2 + (l.y - py) ** 2; if (d < bd) { bd = d; best = l; } }
        return best;
    }
    private rotatingSpot(px: number, py: number): SpawnSpot {
        const spots = this.allowedSpots(px, py);
        return spots[(this.laneCursor++) % spots.length];
    }
    private spotById(id: string): SpawnSpot { return DUNGEON_SPAWN_SPOTS.find(s => s.id === id) ?? DUNGEON_SPAWN_SPOTS[0]; }

    public update(delta: number, playerX: number, playerY: number): void {
        if (!this.opts.isRunning()) { if (this.flare.visible) this.flare.visible = false; return; }
        this.elapsedFrames += delta;
        const phase = this.opts.phaseDef();
        // Q4.5: szpaler + boss czekaja w kolumnadzie, Budowniczowie juz przy murze (1. klatka meczu)
        if (!this.startRankDone) {
            this.startRankDone = true;
            // Q4.6: laska startowa — szpaler CZEKA (freeze) przez spawnInvulMs, gracz ma czas sie przygotowac
            DUNGEON_START_RANK.forEach((p, i) => { const boss = T.startRankBoss && i === DUNGEON_START_RANK.length - 1; if (boss || i < T.startRankRaiders) { const e = this.spawnAt(p.x, p.y, boss); if (e) e.freeze(Date.now() + T.spawnInvulMs); } });
        }

        // ── flara po spawnie (dogasa) ──
        if (this.telegraphLane) {
            this.telegraphLeft -= delta;
            this.drawFlare(this.telegraphLane, Math.max(0, this.telegraphLeft) / FLARE_FRAMES);
            if (this.telegraphLeft <= 0) { this.telegraphLane = null; this.flare.visible = false; }
        }
        // ── ciagly spawn: 1 raider co (interwal fazy / batchSize), pod capem fazy ──
        if (this.elapsedFrames >= this.nextBatchAt) {
            const perOne = Math.max(20, Math.round(phase.spawnIntervalFrames / (T.batchSize * this.countMult())));
            if (this.aliveCount() >= Math.min(phase.cap, T.concurrentCap)) {
                this.nextBatchAt = this.elapsedFrames + 30; // pelno — sprawdz za 0.5 s
            } else {
                this.spawnNo++; this.batchNo = this.spawnNo;
                const lane = this.spawnNo % 3 === 0 ? this.nearestLane(playerX, playerY) : this.rotatingSpot(playerX, playerY);
                this.spawnOne(lane, false);
                this.telegraphLane = lane; this.telegraphLeft = FLARE_FRAMES;
                this.opts.onLaneTelegraph(lane);
                this.nextBatchAt = this.elapsedFrames + perOne;
            }
        }

        // ── boss z killi (max 1 zywy) ──
        if (this.boss && !this.boss.active) this.boss = null;
        if (!this.boss && this.opts.killCount() >= this.nextBossAtKills) {
            this.nextBossAtKills += this.opts.difficulty.bossKillTrigger;
            const lane = this.nearestLane(playerX, playerY);
            const b = this.spawnOne(lane, true);
            if (b) {
                this.boss = b;
                this.bossesSpawned++;
                if (phase.id === 'panic') { this.spawnOne(lane, false); this.spawnOne(lane, false); } // eskorta
                this.opts.onBossSpawned(b, lane);
            }
        }
    }

    private spawnOne(lane: SpawnSpot, boss: boolean): Enemy | null {
        const idx = this.laneCounts.get(lane.id) ?? 0;
        this.laneCounts.set(lane.id, idx + 1);
        const spread = (idx % 3 - 1) * 60 + worldRng.range(-20, 20);
        // kraty sa w ramce N/S: wyjazd o 40 px do srodka pola gry; punkty wnetrza — lekki rozrzut
        const grate = lane.y < 200 || lane.y > 2800;
        const dy = grate ? (lane.y < 1500 ? 40 : -40) : worldRng.range(-30, 30);
        return this.spawnAt(lane.x + spread, lane.y + dy, boss);
    }

    /** Spawn w punkcie swiata (szpaler startowy, kraty, punkty wnetrza). */
    private spawnAt(x: number, y: number, boss: boolean): Enemy | null {
        const cfg = this.scaleConfig(boss ? ENEMY_BOSS : ENEMY_NORMAL);
        const enemy = new Enemy(x, y, cfg, boss, this.opts.worldContainer);
        this.opts.enemies.push(enemy);
        this.spawnedTotal++;
        this.opts.onSpawn(enemy);
        return enemy;
    }

    /** Flara w punkcie spawnu: pierscien rosnie + puls pomaranczu (ten sam kolor co lawa/pochodnie). */
    private drawFlare(lane: SpawnSpot, k: number): void {
        const g = this.flare;
        g.clear(); g.visible = true;
        const grate = lane.y < 200 || lane.y > 2800;
        const top = lane.y < 1500;
        const cy = grate ? lane.y + (top ? 30 : -30) : lane.y;
        const pulse = 0.5 + 0.5 * Math.sin(k * Math.PI * 6);
        g.beginFill(H.lava, 0.18 + 0.12 * pulse); g.drawEllipse(lane.x, cy, 90 + 20 * k, 40 + 8 * k); g.endFill();
        g.lineStyle(4, H.lavaBright, 0.9 - 0.5 * k); g.drawEllipse(lane.x, cy, 40 + 70 * k, 18 + 30 * k); g.lineStyle(0);
        // "iskry" z kraty — 5 kropek pomaranczu
        g.beginFill(H.lavaBright, 0.9);
        for (let i = 0; i < 5; i++) { const a = i * 1.257 + k * 4; g.drawCircle(lane.x + Math.cos(a) * 30, cy + (top ? 1 : -1) * (10 + 26 * ((k * 3 + i * 0.2) % 1)), 3); }
        g.endFill();
    }

    public destroy(): void {
        this.flare.destroy();
    }
}
