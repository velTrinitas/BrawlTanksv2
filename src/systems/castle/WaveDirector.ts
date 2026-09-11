import * as PIXI from 'pixi.js';
import { Enemy } from '../../entities/Enemy';
import { worldRng } from '../Rng';
import { ENEMY_NORMAL, ENEMY_BOSS, ENEMY_MEGA_BOSS, ENEMY_TARAN, ENEMY_KATAPULTA, ENEMY_TREBUCHET, type EnemyConfig } from '../../config/enemies';
import { bakeSiegeMachine } from '../../maps/castle/castleBake'; // F4: plaskie sprite'y maszyn
import { CASTLE_LANES, type CastleLaneId } from '../../maps/CastleMap';
import { CASTLE_TUNING as T, CASTLE_WAVES, type CastleRole, type CastleWaveDef } from './castleWaves';
import type { DifficultyModifiers } from '../../config/difficulty';

/**
 * WaveDirector — spawner fal scenariusza OBRON ZAMEK (F3).
 *
 * Konsumuje tabele CASTLE_WAVES: kazda fala = kolejka wpisow {role, lane}; co
 * batchIntervalMs wypuszcza batchSize wrogow z JEDNEGO lane'u (rotacja lane'ow
 * fali), pod capem jednoczesnych wrogow (mobile). Spawn = punkt obozu lane'u
 * (CASTLE_LANES) + jitter. Fala "wyspawnowana" gdy kolejka pusta; koniec fali
 * rozstrzyga CastleSystem (zero zywych wrogow z castleRole).
 *
 * Maszyny (taran/katapulta/trebuchet): F3 spawnuje je jako siegery z nadana rola
 * (AI + configi w F4) — dzieki temu tabela fal i bramki koncow fal dzialaja od razu.
 *
 * Mega boss (fala 6): opozniony o megaDelayMs od startu fali, z lane'u S.
 */

interface WaveEntry { role: CastleRole; lane: CastleLaneId; boss: boolean }

export interface WaveDirectorOpts {
    worldContainer: PIXI.Container;
    enemies: Enemy[];
    difficulty: DifficultyModifiers;
    /** Wolane po KAZDYM spawnie (main: attachEnemyCubeStolenCallback + freeze-on-spawn). */
    onSpawn: (enemy: Enemy) => void;
    /** Mega boss wjechal (baner + strzalka — main/HUD). */
    onMegaSpawned: (enemy: Enemy) => void;
    /** Lane, z ktorego za chwile wyjedzie batch (flara/telegraf — F6). */
    onLaneBatch: (lane: CastleLaneId) => void;
}

export class WaveDirector {
    private readonly opts: WaveDirectorOpts;
    private queue: WaveEntry[] = [];
    private def: CastleWaveDef | null = null;
    private laneCursor = 0;
    private nextBatchAt = 0;
    private waveStartedAt = 0;
    private megaPending = false;
    private megaEnemy: Enemy | null = null;
    private laneCounts: Record<CastleLaneId, number> = { N: 0, E: 0, S: 0, W: 0 };

    constructor(opts: WaveDirectorOpts) {
        this.opts = opts;
    }

    /** Skala difficulty jak SpawnSystem.scaleConfig / CtfSystem.scaleConfig. */
    private scaleConfig(base: EnemyConfig, speedMult = 1): EnemyConfig {
        const m = this.opts.difficulty;
        return {
            ...base,
            hp: Math.round(base.hp * m.enemyHpMult),
            dmg: Math.round(base.dmg * m.enemyDmgMult),
            bulletDmg: Math.round(base.bulletDmg * m.enemyDmgMult),
            speedMin: base.speedMin * m.enemySpeedMult * speedMult,
            speedMax: base.speedMax * m.enemySpeedMult * speedMult,
        };
    }

    /** Liczby fali skalowane przez stosunek maxEnemiesOnMap trudnosci do Normal (20). */
    private countMult(): number {
        return Math.max(0.6, Math.min(1.5, this.opts.difficulty.maxEnemiesOnMap / 20));
    }

    public startWave(idx: number, now: number): void {
        const def = CASTLE_WAVES[idx - 1];
        if (!def) { console.error('[WaveDirector] brak definicji fali', idx); return; }
        this.def = def;
        this.queue = [];
        this.laneCursor = 0;
        this.waveStartedAt = now;
        this.nextBatchAt = now + 1500; // krotki telegraf przed pierwszym batchem
        this.megaPending = def.mega;
        this.megaEnemy = null;
        this.laneCounts = { N: 0, E: 0, S: 0, W: 0 };
        const k = this.countMult();
        const push = (role: CastleRole, n: number, boss = false): void => {
            const count = Math.max(boss ? n : (n > 0 ? 1 : 0), Math.round(n * k));
            for (let i = 0; i < count; i++) {
                const lane = def.lanes[(this.laneCursor++) % def.lanes.length];
                this.queue.push({ role, lane, boss });
            }
        };
        // kolejnosc: siegery przeplatane raiderami, bossy w srodku fali, maszyny na koncu
        // pierwszej polowy (gracz najpierw widzi zwyklych, potem "cos duzego")
        push('sieger', Math.ceil(def.sieger / 2));
        push('raider', def.raider);
        let mi = 0;
        const machine = (role: CastleRole, n: number): void => {
            for (let i = 0; i < n; i++) {
                const lane = def.machineLanes[mi++ % Math.max(1, def.machineLanes.length)] ?? def.lanes[0];
                this.queue.push({ role, lane, boss: false });
            }
        };
        machine('taran', def.taran);
        machine('katapulta', def.katapulta);
        push('sieger', def.boss, true);
        push('sieger', Math.floor(def.sieger / 2));
        machine('trebuchet', def.trebuchet);
        // shuffle lekko w obrebie kolejki (seeded) — zeby lane'y sie mieszaly, ale bez chaosu
        for (let i = this.queue.length - 1; i > 0; i--) {
            if (worldRng.chance(0.35)) {
                const j = Math.max(0, i - 1 - worldRng.int(3));
                const tmp = this.queue[i]; this.queue[i] = this.queue[j]; this.queue[j] = tmp;
            }
        }
        console.log(`[WaveDirector] fala ${idx}: ${this.queue.length} wrogow w kolejce${def.mega ? ' + MEGA' : ''}`);
    }

    public get quotaDone(): boolean { return this.queue.length === 0 && !this.megaPending; }
    public get megaSpawned(): Enemy | null { return this.megaEnemy; }

    /** Zywi wrogowie fali (z castleRole). */
    public aliveCount(): number {
        let n = 0;
        for (const e of this.opts.enemies) if (e.active && e.castleRole) n++;
        return n;
    }

    public update(now: number): void {
        if (!this.def) return;
        // mega boss fali 6
        if (this.megaPending && now - this.waveStartedAt >= T.megaDelayMs) {
            this.megaPending = false;
            const e = this.spawnOne({ role: 'sieger', lane: 'S', boss: true }, true);
            if (e) { this.megaEnemy = e; this.opts.onMegaSpawned(e); }
        }
        if (this.queue.length === 0) return;
        if (now < this.nextBatchAt) return;
        if (this.aliveCount() >= T.concurrentCap) { this.nextBatchAt = now + 800; return; }
        // batch z jednego lane'u: bierz pierwszy wpis, potem do batchSize wpisow z tego samego lane'u
        const lane = this.queue[0].lane;
        this.opts.onLaneBatch(lane);
        let spawned = 0;
        for (let i = 0; i < this.queue.length && spawned < T.batchSize; ) {
            if (this.queue[i].lane === lane) {
                const entry = this.queue.splice(i, 1)[0];
                if (this.spawnOne(entry, false)) spawned++;
            } else i++;
        }
        this.nextBatchAt = now + T.batchIntervalMs;
    }

    /** TUTORIAL: zwiad — n siegerow z jednego lane'u, poza tabela fal (quotaDone bez zmian). */
    public spawnScouts(n: number, lane: CastleLaneId): void {
        for (let i = 0; i < n; i++) this.spawnOne({ role: 'sieger', lane, boss: false }, false);
    }

    private spawnOne(entry: WaveEntry, mega: boolean): Enemy | null {
        const lane = CASTLE_LANES.find(l => l.id === entry.lane);
        if (!lane) return null;
        const horizontal = entry.lane === 'N' || entry.lane === 'S';
        const idx = this.laneCounts[entry.lane]++;
        const spread = (idx % 3 - 1) * 60 + worldRng.range(-20, 20);
        const x = horizontal ? lane.x + spread : lane.x;
        const y = horizontal ? lane.y : lane.y + spread;
        let cfg: EnemyConfig;
        let isBoss = false;
        const machine = entry.role === 'taran' || entry.role === 'katapulta' || entry.role === 'trebuchet';
        if (mega) { cfg = this.scaleConfig(ENEMY_MEGA_BOSS); isBoss = true; }
        else if (entry.boss) { cfg = this.scaleConfig(ENEMY_BOSS); isBoss = true; }
        else if (entry.role === 'taran') cfg = this.scaleConfig(ENEMY_TARAN);
        else if (entry.role === 'katapulta') cfg = this.scaleConfig(ENEMY_KATAPULTA);
        else if (entry.role === 'trebuchet') cfg = this.scaleConfig(ENEMY_TREBUCHET);
        else if (entry.role === 'raider') cfg = this.scaleConfig(ENEMY_NORMAL);
        else cfg = this.scaleConfig(ENEMY_NORMAL, T.siegerSpeedMult);
        const enemy = new Enemy(x, y, cfg, isBoss, this.opts.worldContainer, mega);
        enemy.castleRole = entry.role;
        enemy.castleLane = entry.lane;
        if (machine) {
            // F4: plaski pieczony sprite (rotacja jak flat path), zero pociskow (lob = CastleSystem)
            // F6 (#8): +25% rozmiaru; (#10): HP rosnie z fala (+15% na fale).
            enemy.useCustomSprite(bakeSiegeMachine(entry.role as 'taran' | 'katapulta' | 'trebuchet'), 1.25);
            enemy.castleNoShoot = true;
            const waveIdx = this.def?.idx ?? 1;
            const hpMult = 1 + 0.15 * (waveIdx - 1);
            enemy.maxHp = Math.round(enemy.maxHp * hpMult);
            enemy.hp = enemy.maxHp;
        }
        this.opts.enemies.push(enemy);
        this.opts.onSpawn(enemy);
        // F4: trebuchet jedzie z eskorta 2 raiderow (gracz musi sie przebic, zeby go zdjac)
        if (entry.role === 'trebuchet') {
            this.spawnOne({ role: 'raider', lane: entry.lane, boss: false }, false);
            this.spawnOne({ role: 'raider', lane: entry.lane, boss: false }, false);
        }
        return enemy;
    }

    public reset(): void {
        this.queue = [];
        this.def = null;
        this.megaPending = false;
        this.megaEnemy = null;
    }
}
