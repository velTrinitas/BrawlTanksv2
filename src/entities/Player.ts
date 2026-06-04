import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';
import { getBrawlerTextures, PROGRAMMATIC_BRAWLER_CONFIG, TANK_CANVAS_SCALE } from '../rendering/SpriteFactory';
import { checkRectCollision } from '../systems/Physics';
import type { CyberBuilding } from '../maps/CityMap';
import type { EffectsManager } from '../rendering/Effects';

interface KeysState { w: boolean; a: boolean; s: boolean; d: boolean; }

const SUPER_SHOT_DURATION_MS = 5000;
const SUPER_MAX_CHARGES = 9;
const SUPER_TINT = 0xc850ff;

// Flag — pozycja WEWNĄTRZ hull (drzewce -25px od center, flag ciągnie w lewo)
const FLAG_W = 21;
const FLAG_H = 13.5;
const FLAG_POLE_W = 2.25;
const FLAG_POLE_H = 17.5;
const FLAG_POLE_DIST = 25; // drzewce x = -25 (w hull bounds dla wszystkich brawlerów)

export class Player {
    public brawler: Brawler;
    public x: number;
    public y: number;
    public baseSpeed: number;
    public maxHp: number;
    public hp: number;
    public container: PIXI.Container;
    public hull: PIXI.Sprite;
    public turret: PIXI.Sprite;
    
    public speedBoostMult: number = 1;
    public speedBoostEnd: number = 0;
    public superCharges: number = 0;
    public superActive: boolean = false;
    public superEndTime: number = 0;
    private superRingGfx: PIXI.Graphics;
    
    private flagGfx: PIXI.Graphics;
    private tracksGfx: PIXI.Graphics;
    private exhaustGfx: PIXI.Graphics;
    
    private trackTimer: number = 0;
    private lastMoveAngle: number = 0;
    public isMoving: boolean = false;
    
    constructor(brawlerData: Brawler, worldContainer: PIXI.Container) {
        this.brawler = brawlerData;
        this.x = 800;
        this.y = 800;
        this.baseSpeed = brawlerData.speed;
        this.maxHp = brawlerData.hp;
        this.hp = this.maxHp;
        
        this.container = new PIXI.Container();
        this.container.x = this.x;
        this.container.y = this.y;
        
        const tex = getBrawlerTextures(this.brawler);
        this.hull = new PIXI.Sprite(tex.hull);
        this.hull.anchor.set(0.5);
        this.turret = new PIXI.Sprite(tex.turret);
        this.turret.anchor.set(0.5);
        
        this.superRingGfx = new PIXI.Graphics();
        this.superRingGfx.visible = false;
        this.tracksGfx = new PIXI.Graphics();
        this.exhaustGfx = new PIXI.Graphics();
        this.flagGfx = new PIXI.Graphics();
        this.drawFlag(this.brawler.flag ?? 'PL');
        
        // Order: super-ring → hull → tracks → exhaust → flag → turret (turret zasłania flag)
        this.container.addChild(this.superRingGfx);
        this.container.addChild(this.hull);
        this.container.addChild(this.tracksGfx);
        this.container.addChild(this.exhaustGfx);
        this.container.addChild(this.flagGfx);
        this.container.addChild(this.turret);
        worldContainer.addChild(this.container);
    }
    
    /**
     * Flaga — drzewce w (0,0), flaga ciągnie w LEWO (x ∈ [-FLAG_W, 0]).
     * Biało-czerwona PL: biały TOP (-y), czerwony BOTTOM (+y) — w default rotation widoczne jako biały NA GÓRZE.
     */
    drawFlag(countryCode: string): void {
        this.flagGfx.clear();
        const flagStartX = -FLAG_W;
        
        // Drzewce
        this.flagGfx.beginFill(0x4a3520);
        this.flagGfx.drawRect(-FLAG_POLE_W / 2, -FLAG_POLE_H / 2, FLAG_POLE_W, FLAG_POLE_H);
        this.flagGfx.endFill();
        
        switch (countryCode.toUpperCase()) {
            case 'PL':
                this.flagGfx.beginFill(0xffffff);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H / 2);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xdc143c);
                this.flagGfx.drawRect(flagStartX, 0, FLAG_W, FLAG_H / 2);
                this.flagGfx.endFill();
                break;
            case 'UA':
                this.flagGfx.beginFill(0x0057b8);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H / 2);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xffd700);
                this.flagGfx.drawRect(flagStartX, 0, FLAG_W, FLAG_H / 2);
                this.flagGfx.endFill();
                break;
            case 'DE':
                this.flagGfx.beginFill(0x000000);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H / 3);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xdd0000);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2 + FLAG_H / 3, FLAG_W, FLAG_H / 3);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xffce00);
                this.flagGfx.drawRect(flagStartX, FLAG_H / 2 - FLAG_H / 3, FLAG_W, FLAG_H / 3);
                this.flagGfx.endFill();
                break;
            case 'JP':
                this.flagGfx.beginFill(0xffffff);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H);
                this.flagGfx.endFill();
                this.flagGfx.beginFill(0xbc002d);
                this.flagGfx.drawCircle(flagStartX + FLAG_W / 2, 0, FLAG_H / 3.5);
                this.flagGfx.endFill();
                break;
            default:
                this.flagGfx.beginFill(0xaaaaaa);
                this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H);
                this.flagGfx.endFill();
        }
        
        this.flagGfx.lineStyle(0.8, 0x000000, 0.75);
        this.flagGfx.drawRect(flagStartX, -FLAG_H / 2, FLAG_W, FLAG_H);
        this.flagGfx.lineStyle(0);
        this.flagGfx.beginFill(0xd4af37);
        this.flagGfx.drawCircle(0, -FLAG_POLE_H / 2 - 0.5, 2);
        this.flagGfx.endFill();
    }
    
    takeDamage(amount: number, isInvulnerable: boolean = false): boolean {
        if (isInvulnerable) return false;
        this.hp -= amount;
        return this.hp <= 0;
    }
    
    applyTurboBoost(durationMs: number, multiplier: number): void {
        this.speedBoostMult = multiplier;
        this.speedBoostEnd = Date.now() + durationMs;
    }
    
    get currentSpeed(): number {
        if (Date.now() > this.speedBoostEnd) this.speedBoostMult = 1;
        return this.baseSpeed * this.speedBoostMult;
    }
    
    get hasSpeedBoost(): boolean {
        return Date.now() < this.speedBoostEnd && this.speedBoostMult > 1;
    }
    
    addSuperCharge(amount: number): void {
        this.superCharges = Math.min(SUPER_MAX_CHARGES, this.superCharges + amount);
    }
    
    tryActivateOrContinueSuperShot(): boolean {
        const now = Date.now();
        if (this.superActive && now < this.superEndTime) return true;
        if (this.superActive && now >= this.superEndTime) this.superActive = false;
        if (!this.superActive && this.superCharges > 0) {
            this.superActive = true;
            this.superEndTime = now + SUPER_SHOT_DURATION_MS;
            this.superCharges--;
            return true;
        }
        return false;
    }
    
    get isSuperShotActive(): boolean {
        return this.superActive && Date.now() < this.superEndTime;
    }
    
    get superShotSecondsLeft(): number {
        if (!this.superActive) return 0;
        return Math.max(0, (this.superEndTime - Date.now()) / 1000);
    }
    
    private updateSuperRing(): void {
        const showRing = this.superCharges > 0 || this.isSuperShotActive;
        if (!showRing) { this.superRingGfx.visible = false; return; }
        this.superRingGfx.visible = true;
        this.superRingGfx.clear();
        const t = Date.now() / 100;
        const pulse = 0.6 + Math.sin(t) * 0.4;
        const isActive = this.isSuperShotActive;
        if (isActive) {
            const r = 38 + Math.sin(t * 1.5) * 3;
            this.superRingGfx.lineStyle(5, SUPER_TINT, pulse);
            this.superRingGfx.drawCircle(0, 0, r);
            this.superRingGfx.lineStyle(3, 0xffffff, pulse * 0.7);
            this.superRingGfx.drawCircle(0, 0, r - 6);
            this.superRingGfx.beginFill(SUPER_TINT, 0.08 * pulse);
            this.superRingGfx.drawCircle(0, 0, r);
            this.superRingGfx.endFill();
            for (let i = 0; i < 6; i++) {
                const angle = Date.now() / 150 + (i / 6) * Math.PI * 2;
                this.superRingGfx.beginFill(0xffffff, pulse);
                this.superRingGfx.drawCircle(Math.cos(angle) * r, Math.sin(angle) * r, 2.5);
                this.superRingGfx.endFill();
            }
        } else {
            this.superRingGfx.lineStyle(2.5, SUPER_TINT, pulse * 0.6);
            this.superRingGfx.drawCircle(0, 0, 35);
        }
    }
    
    private updateBrawlerTracks(): void {
        this.tracksGfx.clear();
        const config = PROGRAMMATIC_BRAWLER_CONFIG[this.brawler.id];
        if (!config) return;
        if (!this.isMoving) return;
        
        const time = Date.now();
        const speedFactor = this.currentSpeed / 5;
        const phase = (time * speedFactor * 0.04) % 12;
        const trackHalfLen = config.HL / 2;
        const trackY = (config.HW / 2) + (config.TRK_H / 2);
        const cos = Math.cos(this.hull.rotation);
        const sin = Math.sin(this.hull.rotation);
        
        this.tracksGfx.lineStyle(1.8, 0xfff5cf, 0.55);
        
        for (const ty of [-trackY, trackY]) {
            for (let i = -3; i <= 3; i++) {
                const localX1 = i * 12 + phase - 8;
                const localX2 = localX1 + 5;
                const cx1 = Math.max(localX1, -trackHalfLen);
                const cx2 = Math.min(localX2, trackHalfLen);
                if (cx2 <= cx1) continue;
                const sx1 = (cx1 * cos - ty * sin) * TANK_CANVAS_SCALE;
                const sy1 = (cx1 * sin + ty * cos) * TANK_CANVAS_SCALE;
                const sx2 = (cx2 * cos - ty * sin) * TANK_CANVAS_SCALE;
                const sy2 = (cx2 * sin + ty * cos) * TANK_CANVAS_SCALE;
                this.tracksGfx.moveTo(sx1, sy1);
                this.tracksGfx.lineTo(sx2, sy2);
            }
        }
    }
    
    private updateBrawlerExhaust(): void {
        this.exhaustGfx.clear();
        const config = PROGRAMMATIC_BRAWLER_CONFIG[this.brawler.id];
        if (!config) return;
        if (!config.HAS_FLAME && !config.HAS_SMOKE) return;
        
        const time = Date.now();
        const cos = Math.cos(this.hull.rotation);
        const sin = Math.sin(this.hull.rotation);
        const rearDirX = -cos;
        const rearDirY = -sin;
        const intensityBase = this.isMoving ? 1.0 : 0.55;
        const offsets = [-config.EXHAUST_Y, config.EXHAUST_Y];
        
        for (let idx = 0; idx < 2; idx++) {
            const offLocalY = offsets[idx];
            const ex = (config.EXHAUST_X * cos - offLocalY * sin) * TANK_CANVAS_SCALE;
            const ey = (config.EXHAUST_X * sin + offLocalY * cos) * TANK_CANVAS_SCALE;
            
            if (config.HAS_FLAME) {
                const flamePhase = time / 130 + idx * 1.7;
                const flameScale = 0.85 + Math.sin(flamePhase) * 0.25;
                const flameSize = 5 * flameScale * intensityBase;
                const flameDist = 5 + Math.sin(flamePhase * 0.7) * 1.5;
                const fx = ex + rearDirX * flameDist;
                const fy = ey + rearDirY * flameDist;
                this.exhaustGfx.beginFill(config.FLAME_COLOR_OUTER!, 0.75 * intensityBase);
                this.exhaustGfx.drawCircle(fx, fy, flameSize);
                this.exhaustGfx.endFill();
                this.exhaustGfx.beginFill(config.FLAME_COLOR_INNER!, 0.92 * intensityBase);
                this.exhaustGfx.drawCircle(fx, fy, flameSize * 0.55);
                this.exhaustGfx.endFill();
                this.exhaustGfx.beginFill(0xffffff, 0.6 * intensityBase);
                this.exhaustGfx.drawCircle(fx, fy, flameSize * 0.22);
                this.exhaustGfx.endFill();
            }
            
            if (config.HAS_SMOKE) {
                const smokeBoost = config.SMOKE_BOOST ?? 1.0; // 1.5 dla większego dymu
                for (let s = 0; s < 4; s++) {
                    const smokePhase = ((time / 900) + s * 0.25 + idx * 0.17) % 1.0;
                    const smokeDist = (10 + smokePhase * 25) * smokeBoost;
                    const smokeSize = (2.5 + smokePhase * 4) * smokeBoost;
                    const smokeAlpha = config.SMOKE_ALPHA! * (1 - smokePhase) * intensityBase;
                    const driftPerp = Math.sin(smokePhase * Math.PI * 2 + idx) * 2.5;
                    const perpX = -rearDirY * driftPerp;
                    const perpY = rearDirX * driftPerp;
                    const smx = ex + rearDirX * smokeDist + perpX;
                    const smy = ey + rearDirY * smokeDist + perpY;
                    
                    this.exhaustGfx.beginFill(config.SMOKE_COLOR!, smokeAlpha);
                    this.exhaustGfx.drawCircle(smx, smy, smokeSize);
                    this.exhaustGfx.endFill();
                    this.exhaustGfx.beginFill(0xffffff, smokeAlpha * 0.3);
                    this.exhaustGfx.drawCircle(smx, smy, smokeSize * 0.4);
                    this.exhaustGfx.endFill();
                }
            }
        }
    }
    
    update(keys: KeysState, mouseWorldX: number, mouseWorldY: number, buildings: CyberBuilding[], effects: EffectsManager): void {
        let dx = 0, dy = 0;
        if (keys.w) dy -= 1;
        if (keys.s) dy += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;
        this.isMoving = false;
        
        if (dx !== 0 || dy !== 0) {
            this.isMoving = true;
            const len = Math.sqrt(dx * dx + dy * dy);
            const speed = this.currentSpeed;
            const nx = this.x + (dx / len) * speed;
            const ny = this.y + (dy / len) * speed;
            let canMoveX = true, canMoveY = true;
            for (const b of buildings) {
                if (checkRectCollision(b.x, b.y, b.w, b.h, nx, this.y, 20)) canMoveX = false;
                if (checkRectCollision(b.x, b.y, b.w, b.h, this.x, ny, 20)) canMoveY = false;
            }
            if (canMoveX) this.x = nx;
            if (canMoveY) this.y = ny;
            this.lastMoveAngle = Math.atan2(dy, dx);
            this.hull.rotation = this.lastMoveAngle;
        }
        
        this.container.x = this.x;
        this.container.y = this.y;
        this.turret.rotation = Math.atan2(mouseWorldY - this.y, mouseWorldX - this.x);
        this.container.zIndex = this.y + 19;
        
        // Flag — drzewce w (FLAG_POLE_DIST za center hull), w hull local space (rotuje z hull, biały NA GÓRZE)
        this.flagGfx.x = -Math.cos(this.hull.rotation) * FLAG_POLE_DIST;
        this.flagGfx.y = -Math.sin(this.hull.rotation) * FLAG_POLE_DIST;
        this.flagGfx.rotation = this.hull.rotation;
        
        if (this.isSuperShotActive) this.hull.tint = SUPER_TINT;
        else if (this.hasSpeedBoost) this.hull.tint = 0xffcc66;
        else this.hull.tint = 0xffffff;
        
        if (this.superActive && Date.now() >= this.superEndTime) this.superActive = false;
        
        this.updateSuperRing();
        this.updateBrawlerTracks();
        this.updateBrawlerExhaust();
        
        if (this.isMoving) {
            this.trackTimer++;
            const trackInterval = this.hasSpeedBoost ? 2 : 4;
            if (this.trackTimer >= trackInterval) {
                this.trackTimer = 0;
                const perpX = -Math.sin(this.lastMoveAngle) * 12;
                const perpY = Math.cos(this.lastMoveAngle) * 12;
                effects.spawnTrackMark(this.x + perpX, this.y + perpY, this.lastMoveAngle);
                effects.spawnTrackMark(this.x - perpX, this.y - perpY, this.lastMoveAngle);
            }
        }
    }
}