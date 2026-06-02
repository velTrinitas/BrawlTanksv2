import * as PIXI from 'pixi.js';
import { Enemy } from '../entities/Enemy';
import { Heart } from '../entities/pickups/Heart';
import { Magnet } from '../entities/pickups/Magnet';
import { PowerCube } from '../entities/pickups/PowerCube';
import { ENEMY_NORMAL, ENEMY_BOSS, ENEMY_MEGA_BOSS, SPAWN_CONFIG, HEART_CONFIG } from '../config/enemies';
import { PICKUP_CONFIG } from '../config/powers';
import { WORLD_W, WORLD_H } from '../config/constants';
import type { CyberBuilding } from '../maps/CityMap';

export interface SpawnResult {
    newEnemies: Enemy[];
    newHearts: Heart[];
    newMagnets: Magnet[];
    newPowerCubes: PowerCube[];
    megaBossJustSpawned: boolean;
}

export class SpawnSystem {
    private frameCounter: number = 0;
    private gameTimeSeconds: number = 0;
    private heartFrameCounter: number = 0;
    private magnetFrameCounter: number = 0;
    private powerCubeFrameCounter: number = 0;
    
    public regularKills: number = 0;
    public bossKills: number = 0;
    public totalKills: number = 0;
    
    public megaBossSpawned: boolean = false;
    public megaBossKilled: boolean = false;
    
    private lastBossKillTrigger: number = 0;
    
    constructor() {}
    
    update(
        delta: number,
        currentEnemies: Enemy[],
        currentHearts: Heart[],
        currentMagnets: Magnet[],
        currentPowerCubes: PowerCube[],
        playerX: number,
        playerY: number,
        worldContainer: PIXI.Container,
        buildings: CyberBuilding[]
    ): SpawnResult {
        this.frameCounter += delta;
        this.gameTimeSeconds += delta / 60;
        this.heartFrameCounter += delta;
        this.magnetFrameCounter += delta;
        this.powerCubeFrameCounter += delta;
        
        const newEnemies: Enemy[] = [];
        const newHearts: Heart[] = [];
        const newMagnets: Magnet[] = [];
        const newPowerCubes: PowerCube[] = [];
        let megaBossJustSpawned = false;
        
        // === Regular enemy spawn ===
        const spawnRate = Math.max(
            SPAWN_CONFIG.minSpawnFrames,
            SPAWN_CONFIG.diffBase - Math.floor(this.gameTimeSeconds * SPAWN_CONFIG.timeScaling)
        );
        
        if (this.frameCounter % spawnRate < delta && currentEnemies.length < SPAWN_CONFIG.maxEnemiesOnMap) {
            const pos = this.findSafeSpawnPos(playerX, playerY, buildings);
            if (pos) {
                newEnemies.push(new Enemy(pos.x, pos.y, ENEMY_NORMAL, false, worldContainer));
            }
        }
        
        // === Regular Boss spawn ===
        if (
            this.regularKills > 0 &&
            this.regularKills % SPAWN_CONFIG.bossKillTrigger === 0 &&
            this.regularKills !== this.lastBossKillTrigger &&
            this.regularKills < SPAWN_CONFIG.megaBossKillThreshold
        ) {
            this.lastBossKillTrigger = this.regularKills;
            const pos = this.findSafeSpawnPos(playerX, playerY, buildings, 400);
            if (pos) {
                newEnemies.push(new Enemy(pos.x, pos.y, ENEMY_BOSS, true, worldContainer));
            }
        }
        
        // === Mega Boss spawn ===
        const anyRegularBossAlive = currentEnemies.some(e => e.isBoss && !e.isMegaBoss);
        if (
            this.regularKills >= SPAWN_CONFIG.megaBossKillThreshold &&
            !anyRegularBossAlive &&
            !this.megaBossSpawned
        ) {
            const pos = this.findSafeSpawnPos(playerX, playerY, buildings, 500);
            if (pos) {
                newEnemies.push(new Enemy(pos.x, pos.y, ENEMY_MEGA_BOSS, true, worldContainer, true));
                this.megaBossSpawned = true;
                megaBossJustSpawned = true;
            }
        }
        
        // === Heart spawn ===
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
        
        // === Magnet spawn ===
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
        
        // === PowerCube spawn ===
        if (
            this.powerCubeFrameCounter >= PICKUP_CONFIG.powerCubeSpawnIntervalFrames &&
            currentPowerCubes.length < PICKUP_CONFIG.powerCubeMaxOnMap
        ) {
            this.powerCubeFrameCounter = 0;
            const pos = this.findSafeSpawnPos(playerX, playerY, buildings, 250);
            if (pos) {
                newPowerCubes.push(new PowerCube(pos.x, pos.y, worldContainer));
            }
        }
        
        return { newEnemies, newHearts, newMagnets, newPowerCubes, megaBossJustSpawned };
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
    
    private findSafeSpawnPos(
        playerX: number, playerY: number,
        buildings: CyberBuilding[],
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
        this.powerCubeFrameCounter = 0;
        this.regularKills = 0;
        this.bossKills = 0;
        this.totalKills = 0;
        this.megaBossSpawned = false;
        this.megaBossKilled = false;
        this.lastBossKillTrigger = 0;
    }
}