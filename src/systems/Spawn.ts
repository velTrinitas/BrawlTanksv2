import * as PIXI from 'pixi.js';
import { Enemy } from '../entities/Enemy';
import { ENEMY_NORMAL, ENEMY_BOSS, SPAWN_CONFIG } from '../config/enemies';
import { WORLD_W, WORLD_H } from '../config/constants';
import type { CyberBuilding } from '../maps/CityMap';

/**
 * Spawn system — zarządza spawnem zwykłych wrogów i bossów.
 * Logika z v4.48 (Kill the Boss scenario).
 */
export class SpawnSystem {
    private frameCounter: number = 0;
    private gameTimeSeconds: number = 0;
    
    // Stats które trzeba śledzić dla logiki bossów
    public regularKills: number = 0;  // tylko zwykli wrogowie (nie bossowie!)
    public bossKills: number = 0;
    public totalKills: number = 0;     // wszyscy zabici (dla HUD)
    
    // Flagi
    private bossSpawnedThisTier: boolean = false; // true gdy boss już spawnowany w tym tier (np. po 20 killach)
    private lastBossKillTrigger: number = 0;       // ostatni triggered % 20
    
    constructor() {}
    
    /**
     * Wywołaj co klatkę z gameLoop.
     * Zwraca array nowych wrogów do dodania (gameLoop dodaje do enemies array).
     */
    update(
        delta: number,
        currentEnemies: Enemy[],
        playerX: number,
        playerY: number,
        worldContainer: PIXI.Container,
        buildings: CyberBuilding[]
    ): Enemy[] {
        this.frameCounter += delta;
        this.gameTimeSeconds += delta / 60; // 60 FPS = 1s
        
        const newEnemies: Enemy[] = [];
        
        // === Regular enemy spawn ===
        // Spawn rate skaluje się z czasem (szybciej w miarę gry)
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
        
        // === Boss spawn trigger ===
        // Co 20 killów spawn 1 boss (regularKills, nie totalKills)
        // Boss przestaje spawnować po regularKills >= 100 (sygnał dla Mega Boss w 3B)
        if (
            this.regularKills > 0 &&
            this.regularKills % SPAWN_CONFIG.bossKillTrigger === 0 &&
            this.regularKills !== this.lastBossKillTrigger &&
            this.regularKills < SPAWN_CONFIG.megaBossKillThreshold
        ) {
            this.lastBossKillTrigger = this.regularKills;
            const pos = this.findSafeSpawnPos(playerX, playerY, buildings, 400); // boss spawn dalej od gracza
            if (pos) {
                newEnemies.push(new Enemy(pos.x, pos.y, ENEMY_BOSS, true, worldContainer));
            }
        }
        
        return newEnemies;
    }
    
    /**
     * Zarejestruj kill — wywoływane z gameLoop gdy wróg zginie.
     */
    registerKill(enemy: Enemy): void {
        this.totalKills++;
        if (enemy.isBoss) {
            this.bossKills++;
        } else {
            this.regularKills++;
        }
    }
    
    /**
     * Znajdź bezpieczną pozycję spawnu — poza polem widzenia gracza, poza budynkami.
     */
    private findSafeSpawnPos(
        playerX: number, playerY: number,
        buildings: CyberBuilding[],
        minDistFromPlayer: number = 300
    ): { x: number, y: number } | null {
        // 30 prób — losowa pozycja, sprawdź czy nie koliduje z budynkiem i jest daleko od gracza
        for (let i = 0; i < 30; i++) {
            const x = 100 + Math.random() * (WORLD_W - 200);
            const y = 100 + Math.random() * (WORLD_H - 200);
            
            // Daleko od gracza?
            const dx = x - playerX, dy = y - playerY;
            if (dx * dx + dy * dy < minDistFromPlayer * minDistFromPlayer) continue;
            
            // Nie w budynku?
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
    
    /**
     * Reset systemu (przy nowej grze).
     */
    reset(): void {
        this.frameCounter = 0;
        this.gameTimeSeconds = 0;
        this.regularKills = 0;
        this.bossKills = 0;
        this.totalKills = 0;
        this.bossSpawnedThisTier = false;
        this.lastBossKillTrigger = 0;
    }
}