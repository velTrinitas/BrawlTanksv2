import * as PIXI from 'pixi.js';
import { Enemy } from '../entities/Enemy';
import { Heart } from '../entities/pickups/Heart';
import { Magnet } from '../entities/pickups/Magnet';
import { ENEMY_NORMAL, ENEMY_BOSS, ENEMY_MEGA_BOSS, HEART_CONFIG, type EnemyConfig } from '../config/enemies';
import { PICKUP_CONFIG } from '../config/powers';
import { WORLD_W, WORLD_H } from '../config/constants';
import type { ICollidable } from '../types/MapType';
import type { DifficultyModifiers } from '../config/difficulty';

export interface SpawnResult {
    newEnemies: Enemy[];
    newHearts: Heart[];
    newMagnets: Magnet[];
    megaBossJustSpawned: boolean;
}

const MAX_CONCURRENT_REGULAR_BOSSES = 2;

/**
 * Hard cap na spawn interval — wspolny dla wszystkich difficulty (decyzja design v0.50.0).
 * Nizszy cap (np. 20kl = 3 wrogow/sec) prowadzilby do chaosu bez gameplayu na Nightmare.
 * Zostawione na 30kl (= 2 wrogow/sec @ 60fps) jako sufit dla wszystkich tierow.
 */
const MIN_SPAWN_FRAMES = 30;

/**
 * v0.50.0 Difficulty Balance v1: SpawnSystem przyjmuje DifficultyModifiers w konstruktorze.
 *
 * Wszystkie spawn-related stale (interval, timeScaling, maxEnemies, boss thresholds)
 * pochodza teraz z `this.modifiers` zamiast z SPAWN_CONFIG. EnemyConfig jest skalowane
 * w `scaleConfig()` przed `new Enemy(...)` — Enemy.ts dostaje juz przeliczony config
 * i NIE wie nic o difficulty (clean separation of concerns).
 *
 * SPAWN_CONFIG w enemies.ts zostaje jako Normal-equivalent defaults (na wypadek
 * gdyby kiedys ktos chcial uruchomic gre bez difficulty modifiers, fallback).
 * W v0.50.0 SpawnSystem nie referencuje SPAWN_CONFIG juz w ogole.
 */
export class SpawnSystem {
    private frameCounter: number = 0;
    private gameTimeSeconds: number = 0;
    private heartFrameCounter: number = 0;
    private magnetFrameCounter: number = 0;

    public regularKills: number = 0;
    public bossKills: number = 0;
    public totalKills: number = 0;
    public gemsCollected: number = 0; // licznik dla HUD

    public megaBossSpawned: boolean = false;
    public megaBossKilled: boolean = false;

    private lastBossKillTrigger: number = 0;
    private pendingBossSpawns: number = 0;

    private readonly modifiers: DifficultyModifiers;

    constructor(modifiers: DifficultyModifiers) {
        this.modifiers = modifiers;
    }

    /**
     * v0.50.0 — skaluje EnemyConfig wg DifficultyModifiers przed utworzeniem Enemy.
     *
     * Mnozniki HP/DMG: zaokraglone do int (HP/dmg sa intami po HP/DMG x100 refactor).
     * Speed: zostaje floatem (random range speedMin..speedMax w Enemy.constructor).
     * scoreValue: NIE skalowane (to robi GameSession.recomputeScore przez score mult).
     * tint, scale, shootIntervalMs, bulletSpeed, bulletColor: NIETKNIETE.
     */
    private scaleConfig(base: EnemyConfig): EnemyConfig {
        return {
            ...base,
            hp: Math.round(base.hp * this.modifiers.enemyHpMult),
            dmg: Math.round(base.dmg * this.modifiers.enemyDmgMult),
            bulletDmg: Math.round(base.bulletDmg * this.modifiers.enemyDmgMult),
            speedMin: base.speedMin * this.modifiers.enemySpeedMult,
            speedMax: base.speedMax * this.modifiers.enemySpeedMult,
        };
    }

    update(
        delta: number,
        currentEnemies: Enemy[],
        currentHearts: Heart[],
        currentMagnets: Magnet[],
        playerX: number,
        playerY: number,
        worldContainer: PIXI.Container,
        buildings: ICollidable[]
    ): SpawnResult {
        this.frameCounter += delta;
        this.gameTimeSeconds += delta / 60;
        this.heartFrameCounter += delta;
        this.magnetFrameCounter += delta;

        const newEnemies: Enemy[] = [];
        const newHearts: Heart[] = [];
        const newMagnets: Magnet[] = [];
        let megaBossJustSpawned = false;

        // v0.50.0: spawn rate uses modifiers (replaces SPAWN_CONFIG.diffBase + timeScaling).
        // MIN_SPAWN_FRAMES = 30 wspolne dla wszystkich difficulty (decyzja design).
        const spawnRate = Math.max(
            MIN_SPAWN_FRAMES,
            this.modifiers.spawnIntervalFrames - Math.floor(this.gameTimeSeconds * this.modifiers.timeScaling)
        );

        // v0.50.0: maxEnemiesOnMap z modifiers (15/20/25/30 per difficulty).
        if (this.frameCounter % spawnRate < delta && currentEnemies.length < this.modifiers.maxEnemiesOnMap) {
            const pos = this.findSafeSpawnPos(playerX, playerY, buildings);
            if (pos) {
                newEnemies.push(new Enemy(pos.x, pos.y, this.scaleConfig(ENEMY_NORMAL), false, worldContainer));
            }
        }

        // v0.50.0: bossKillTrigger + megaBossKillThreshold z modifiers.
        if (
            this.regularKills > 0 &&
            this.regularKills % this.modifiers.bossKillTrigger === 0 &&
            this.regularKills !== this.lastBossKillTrigger &&
            this.regularKills < this.modifiers.megaBossKillThreshold
        ) {
            this.lastBossKillTrigger = this.regularKills;
            this.pendingBossSpawns++;
        }

        const aliveBosses = currentEnemies.filter(e => e.isBoss && !e.isMegaBoss).length;
        if (this.pendingBossSpawns > 0 && aliveBosses < MAX_CONCURRENT_REGULAR_BOSSES) {
            const pos = this.findSafeSpawnPos(playerX, playerY, buildings, 400);
            if (pos) {
                newEnemies.push(new Enemy(pos.x, pos.y, this.scaleConfig(ENEMY_BOSS), true, worldContainer));
                this.pendingBossSpawns--;
            }
        }

        const anyRegularBossAlive = currentEnemies.some(e => e.isBoss && !e.isMegaBoss);
        if (
            this.regularKills >= this.modifiers.megaBossKillThreshold &&
            !anyRegularBossAlive &&
            this.pendingBossSpawns === 0 &&
            !this.megaBossSpawned
        ) {
            const pos = this.findSafeSpawnPos(playerX, playerY, buildings, 500);
            if (pos) {
                newEnemies.push(new Enemy(pos.x, pos.y, this.scaleConfig(ENEMY_MEGA_BOSS), true, worldContainer, true));
                this.megaBossSpawned = true;
                megaBossJustSpawned = true;
            }
        }

        // Heart spawn — NIE skalowane przez difficulty w v1 (decyzja design).
        if (
            this.heartFrameCounter >= HEART_CONFIG.spawnIntervalFrames &&
            currentHearts.length < HEART_CONFIG.maxOnMap
        ) {
            this.heartFrameCounter = 0;
            const pos = this.findSafeSpawnPos(playerX, playerY, buildings, 200);
            if (pos) {
                newHearts.push(new Heart(pos.x, pos.y, worldContainer));
            }
        }

        // Magnet spawn — NIE skalowane przez difficulty w v1 (decyzja design).
        if (
            this.magnetFrameCounter >= PICKUP_CONFIG.magnetSpawnIntervalFrames &&
            currentMagnets.length < PICKUP_CONFIG.magnetMaxOnMap
        ) {
            this.magnetFrameCounter = 0;
            const pos = this.findSafeSpawnPos(playerX, playerY, buildings, 250);
            if (pos) {
                newMagnets.push(new Magnet(pos.x, pos.y, worldContainer));
            }
        }

        return { newEnemies, newHearts, newMagnets, megaBossJustSpawned };
    }

    registerKill(enemy: Enemy): void {
        this.totalKills++;
        if (enemy.isMegaBoss) {
            this.megaBossKilled = true;
        } else if (enemy.isBoss) {
            this.bossKills++;
        } else {
            this.regularKills++;
        }
    }

    /**
     * Wywolaj gdy gracz zbiera gem (dla HUD counter).
     */
    registerGemCollected(): void {
        this.gemsCollected++;
    }

    private findSafeSpawnPos(
        playerX: number, playerY: number,
        buildings: ICollidable[],
        minDistFromPlayer: number = 300
    ): { x: number, y: number } | null {
        for (let i = 0; i < 30; i++) {
            const x = 100 + Math.random() * (WORLD_W - 200);
            const y = 100 + Math.random() * (WORLD_H - 200);
            const dx = x - playerX, dy = y - playerY;
            if (dx * dx + dy * dy < minDistFromPlayer * minDistFromPlayer) continue;

            let inBuilding = false;
            for (const b of buildings) {
                if (x > b.x - 30 && x < b.x + b.w + 30 && y > b.y - 30 && y < b.y + b.h + 30) {
                    inBuilding = true;
                    break;
                }
            }
            if (inBuilding) continue;
            return { x, y };
        }
        return null;
    }

    reset(): void {
        this.frameCounter = 0;
        this.gameTimeSeconds = 0;
        this.heartFrameCounter = 0;
        this.magnetFrameCounter = 0;
        this.regularKills = 0;
        this.bossKills = 0;
        this.totalKills = 0;
        this.gemsCollected = 0;
        this.megaBossSpawned = false;
        this.megaBossKilled = false;
        this.lastBossKillTrigger = 0;
        this.pendingBossSpawns = 0;
    }
}