import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from './config/constants';
import { BRAWLERS } from './config/brawlers';
import type { Brawler } from './types/Brawler';
import { buildCityTexture, CITY_BUILDINGS_LAYOUT, CyberBuilding } from './maps/CityMap';
import { Player } from './entities/Player';
import { Enemy } from './entities/Enemy';
import { Bullet } from './entities/Bullet';
import { EnemyBullet } from './entities/EnemyBullet';
import { HUD } from './rendering/HUD';
import { EffectsManager } from './rendering/Effects';
import { SpawnSystem } from './systems/Spawn';

// ==========================================
// STATE
// ==========================================
let selectedBrawler: Brawler = BRAWLERS[0];
let gameState: 'MENU' | 'PLAYING' = 'MENU';

let stats = { score: 0 };
let frames = 0;

let player: Player | null = null;
let enemies: Enemy[] = [];
let bullets: Bullet[] = [];
let enemyBullets: EnemyBullet[] = [];
let buildings: CyberBuilding[] = [];
let effects: EffectsManager | null = null;
let spawnSystem: SpawnSystem | null = null;
let camera = { x: 0, y: 0 };

const keys = { w: false, a: false, s: false, d: false };
const mouse = { screenX: window.innerWidth / 2, screenY: window.innerHeight / 2 };
let lastShotTime = 0;
let isMouseDown = false;

let comboCount = 0;
let comboEndTime = 0;

// ==========================================
// PIXI APP
// ==========================================
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

// ==========================================
// MENU — char select grid
// ==========================================
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

// ==========================================
// INPUT HANDLERS
// ==========================================
window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k in keys) (keys as any)[k] = true;
});
window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k in keys) (keys as any)[k] = false;
});
(app.view as HTMLCanvasElement).addEventListener('pointermove', (e: any) => {
    mouse.screenX = e.clientX;
    mouse.screenY = e.clientY;
});
(app.view as HTMLCanvasElement).addEventListener('pointerdown', () => { isMouseDown = true; });
(app.view as HTMLCanvasElement).addEventListener('pointerup', () => { isMouseDown = false; });
(app.view as HTMLCanvasElement).addEventListener('pointerupoutside' as any, () => { isMouseDown = false; });

// ==========================================
// HELPER — spawn pocisku wroga (z burst support)
// ==========================================
function spawnEnemyShot(shot: import('./entities/Enemy').EnemyShotInfo): void {
    const half = (shot.burstCount - 1) / 2;
    for (let i = 0; i < shot.burstCount; i++) {
        const offsetAngle = shot.burstCount > 1
            ? (i - half) * (shot.burstSpread / Math.max(1, shot.burstCount - 1))
            : 0;
        enemyBullets.push(new EnemyBullet(
            shot.x, shot.y, shot.angle + offsetAngle,
            shot.speed, shot.dmg, shot.color, worldContainer
        ));
    }
}

// ==========================================
// START GAME
// ==========================================
document.getElementById('startBtn')!.addEventListener('click', () => {
    document.getElementById('welcomeScreen')!.classList.remove('active-screen');
    document.body.classList.add('game-cursor-hidden');
    
    worldContainer.removeChildren();
    
    // City
    const cityTex = buildCityTexture();
    const citySprite = new PIXI.Sprite(cityTex);
    citySprite.zIndex = -100;
    worldContainer.addChild(citySprite);
    
    // Buildings
    buildings = [];
    CITY_BUILDINGS_LAYOUT.forEach(b => {
        buildings.push(new CyberBuilding(b[0], b[1], b[2], b[3], b[4], b[5], worldContainer));
    });
    
    // Effects + Spawn system
    effects = new EffectsManager(worldContainer);
    spawnSystem = new SpawnSystem();
    
    // Reset state
    stats.score = 0;
    comboCount = 0;
    comboEndTime = 0;
    
    // Spawn entities
    player = new Player(selectedBrawler, worldContainer);
    enemies = [];
    bullets = [];
    enemyBullets = [];
    isMouseDown = false;
    gameState = 'PLAYING';
});

// ==========================================
// GAME LOOP
// ==========================================
app.ticker.add((delta) => {
    if (gameState !== 'PLAYING' || !player || !effects || !spawnSystem) return;
    frames++;
    
    // Camera + screen shake
    camera.x = Math.max(0, Math.min(WORLD_W - hud.screenW, ~~(player.x - hud.screenW / 2)));
    camera.y = Math.max(0, Math.min(WORLD_H - hud.screenH, ~~(player.y - hud.screenH / 2)));
    worldContainer.x = -camera.x + effects.shakeOffsetX;
    worldContainer.y = -camera.y + effects.shakeOffsetY;
    
    const mouseWorldX = mouse.screenX + camera.x;
    const mouseWorldY = mouse.screenY + camera.y;
    
    // Buildings parallax
    buildings.forEach(b => b.update(camera.x, camera.y, hud.screenW, hud.screenH));
    
    // Player
    player.update(keys, mouseWorldX, mouseWorldY, buildings, effects);
    
    // Player shooting
    const now = Date.now();
    if (isMouseDown && now - lastShotTime > player.brawler.reload) {
        const angle = player.turret.rotation;
        const sX = player.x + Math.cos(angle) * 45;
        const sY = player.y + Math.sin(angle) * 45;
        effects.spawnMuzzleFlash(sX, sY, angle);
        
        if (player.brawler.type === 'spread') {
            bullets.push(new Bullet(sX, sY, angle - 0.2, player.brawler, worldContainer));
            bullets.push(new Bullet(sX, sY, angle, player.brawler, worldContainer));
            bullets.push(new Bullet(sX, sY, angle + 0.2, player.brawler, worldContainer));
        } else {
            bullets.push(new Bullet(sX, sY, angle, player.brawler, worldContainer));
        }
        lastShotTime = now;
    }
    
    // Player bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.update(delta, buildings, effects);
        if (!b.active) bullets.splice(i, 1);
    }
    
    // Enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const eb = enemyBullets[i];
        eb.update(delta, buildings, effects);
        if (!eb.active) {
            enemyBullets.splice(i, 1);
            continue;
        }
        // Hit player?
        const dx = eb.x - player.x, dy = eb.y - player.y;
        if (dx * dx + dy * dy < 25 * 25) {
            const playerDied = player.takeDamage(eb.dmg);
            effects.spawnEnemyHitSparks(eb.x, eb.y, 0xff0000);
            effects.shake(4, 6);
            eb.destroy();
            enemyBullets.splice(i, 1);
            if (playerDied) {
                triggerGameOver();
                return;
            }
        }
    }
    
    // Spawn system — dodaj nowych wrogów
    const newEnemies = spawnSystem.update(delta, enemies, player.x, player.y, worldContainer, buildings);
    enemies.push(...newEnemies);
    
    // Enemies update + collisions
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        const shotInfo = enemy.update(delta, player.x, player.y, buildings);
        
        // Enemy chciał strzelić?
        if (shotInfo) {
            spawnEnemyShot(shotInfo);
        }
        
        // Player-enemy collision (taranowanie)
        const dP = (player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2;
        const collisionDist = enemy.isBoss ? 60 : 45;
        if (dP < collisionDist * collisionDist) {
            const playerDied = player.takeDamage(enemy.collisionDmg);
            effects.spawnExplosionAndWreck(enemy.x, enemy.y, enemy.tintHex);
            enemy.active = false;
            spawnSystem.registerKill(enemy);
            stats.score += enemy.scoreValue;
            if (enemy.container.parent) {
                enemy.container.parent.removeChild(enemy.container);
            }
            enemy.container.destroy({ children: true });
            if (playerDied) {
                triggerGameOver();
                return;
            }
        }
        
        // Bullet-enemy collision
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (!b.active) continue;
            const hitDist = enemy.isBoss ? 45 : 30;
            if ((b.x - enemy.x) ** 2 + (b.y - enemy.y) ** 2 < (hitDist + b.radius) ** 2) {
                const hitX = b.x, hitY = b.y;
                b.destroy();
                bullets.splice(j, 1);
                const killed = enemy.takeDamage(b.dmg, hitX, hitY, worldContainer, effects);
                if (killed) {
                    spawnSystem.registerKill(enemy);
                    stats.score += enemy.scoreValue;
                    
                    // Combo
                    if (now < comboEndTime) comboCount++;
                    else comboCount = 1;
                    comboEndTime = now + 2000;
                    
                    if (comboCount === 2) { hud.comboText = 'DOUBLE!'; hud.comboTextTimer = 90; }
                    else if (comboCount === 3) { hud.comboText = 'TRIPLE!'; hud.comboTextTimer = 100; }
                    else if (comboCount >= 4) { hud.comboText = 'MEGA KILL! 💥'; hud.comboTextTimer = 110; }
                }
                break;
            }
        }
        
        if (!enemy.active) enemies.splice(i, 1);
    }
    
    if (hud.comboTextTimer > 0) hud.comboTextTimer--;
    
    effects.update(delta);
    
    hud.render(player, stats.score, spawnSystem.totalKills, mouse, spawnSystem);
});

// ==========================================
// GAME OVER
// ==========================================
function triggerGameOver(): void {
    gameState = 'MENU';
    document.getElementById('welcomeScreen')!.classList.add('active-screen');
    document.body.classList.remove('game-cursor-hidden');
    hud.clear();
}