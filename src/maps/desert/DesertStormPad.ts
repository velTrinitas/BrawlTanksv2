import * as PIXI from 'pixi.js';

/**
 * DesertStormPad — desert wariant PowerHoverPad ("Ołtarz Burzy").
 * 
 * v0.18.6 FIX 2:
 *  - Tło UJEDNOLICONE z DesertHeartPad: wapno-piaskowiec roundedRect 
 *    zamiast czarnego bazaltu / ośmiokąta
 *  - Usunięte: niebieskie elektryczne arcs (wyładowania), neonowe pomarańczowe krawędzie
 *  - Lightning bolt PULSUJE (scale 1.0 → 1.15) gdy aktywny — animowane "życie" symbolu
 *  - Piaszczysta podsypka (jak HeartPad) zamiast czarnego "przypalonego" piasku
 */

const PAD_SIZE = 100;
const ACTIVATE_RANGE = 50;
const TURBO_DURATION_MS = 5000;
const COOLDOWN_MS = 20000;
const TURBO_MULT = 2.0;

let _stormGlowTexture: PIXI.Texture | null = null;
function getStormGlowTexture(): PIXI.Texture {
    if (_stormGlowTexture) return _stormGlowTexture;
    // v0.18.6 FIX 2: powiększony 240 → 260px + wzmocniony alpha (match HeartPad strength)
    const size = 260;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(size/2, size/2, 8, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(255,210,0,0.7)');       // jasny złoto-żółty core
    grad.addColorStop(0.35, 'rgba(255,170,0,0.42)');   // mid yellow-orange
    grad.addColorStop(0.7, 'rgba(180,110,0,0.18)');    // dark fade
    grad.addColorStop(1, 'rgba(120,70,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    _stormGlowTexture = PIXI.Texture.from(cv);
    return _stormGlowTexture;
}

export interface PowerPadInteractionResult {
    activated: boolean;
    durationMs: number;
    multiplier: number;
}

export class DesertStormPad {
    public x: number;
    public y: number;
    public cooldownEnd: number = -1;
    
    public container: PIXI.Container;
    private floorShadow: PIXI.Graphics;
    private glowSprite: PIXI.Sprite;
    private platformBase: PIXI.Container;
    private wallGfx: PIXI.Graphics;
    private surfaceGfx: PIXI.Graphics;
    /** v0.18.6 FIX 2: lightning bolt jako osobny gfx żeby móc go skalować (pulsowanie) */
    private boltGfx: PIXI.Graphics;
    private cooldownLabel: PIXI.Text;
    
    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;
        
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + 5;
        worldContainer.addChild(this.container);
        
        // v0.18.6 FIX 2 — piaszczysta podsypka (match HeartPad, zamiast czarnego przypalonego)
        this.floorShadow = new PIXI.Graphics();
        this.floorShadow.beginFill(0x8a6a42, 0.4);
        this.floorShadow.drawRoundedRect(-5, -5, PAD_SIZE + 10, PAD_SIZE + 10, 8);
        this.floorShadow.endFill();
        this.container.addChild(this.floorShadow);
        
        this.glowSprite = new PIXI.Sprite(getStormGlowTexture());
        this.glowSprite.anchor.set(0.5);
        this.glowSprite.x = PAD_SIZE / 2;
        this.glowSprite.y = PAD_SIZE / 2;
        this.glowSprite.blendMode = PIXI.BLEND_MODES.ADD;
        this.container.addChild(this.glowSprite);
        
        this.platformBase = new PIXI.Container();
        this.container.addChild(this.platformBase);
        
        this.wallGfx = new PIXI.Graphics();
        this.platformBase.addChild(this.wallGfx);
        
        this.surfaceGfx = new PIXI.Graphics();
        this.platformBase.addChild(this.surfaceGfx);
        
        // v0.18.6 FIX 2: bolt rysowany w lokalnym układzie (0,0) z pivotem w środku
        // — pozycjonowany przez container x/y, skalowany dla pulsowania.
        this.boltGfx = new PIXI.Graphics();
        this.boltGfx.x = PAD_SIZE / 2;
        this.boltGfx.y = PAD_SIZE / 2;
        this.platformBase.addChild(this.boltGfx);
        
        this.cooldownLabel = new PIXI.Text('', {
            fontFamily: 'Arial',
            fontSize: 11,
            fontWeight: 'bold',
            fill: 0x5a3a10,
        });
        this.cooldownLabel.anchor.set(0.5);
        this.cooldownLabel.visible = false;
        this.platformBase.addChild(this.cooldownLabel);
    }
    
    update(
        playerX: number,
        playerY: number,
        time: number
    ): PowerPadInteractionResult {
        const now = Date.now();
        const isActive = now >= this.cooldownEnd;
        let activated = false;
        
        if (isActive) {
            const cx = this.x + PAD_SIZE / 2;
            const cy = this.y + PAD_SIZE / 2;
            const dx = playerX - cx, dy = playerY - cy;
            if (dx * dx + dy * dy < ACTIVATE_RANGE * ACTIVATE_RANGE) {
                activated = true;
                this.cooldownEnd = now + COOLDOWN_MS;
            }
        }
        
        this.drawVisuals(isActive, time);
        
        return {
            activated,
            durationMs: TURBO_DURATION_MS,
            multiplier: TURBO_MULT,
        };
    }
    
    private drawVisuals(isActive: boolean, time: number): void {
        const elevation = isActive ? 4 : 2;
        
        // v0.18.6 FIX 2 — Glow analog do HeartPad: idle breath + active strong
        if (isActive) {
            this.glowSprite.visible = true;
            // Subtle pulse w sync z bolt scale dla unified visual
            this.glowSprite.alpha = 0.72 + Math.sin(time * 4) * 0.13;
            const breathScale = 1.0 + Math.sin(time * 4) * 0.06;
            this.glowSprite.scale.set(breathScale);
        } else {
            this.glowSprite.visible = false;
        }
        
        this.platformBase.y = -elevation;
        
        // v0.18.6 FIX 2 — Wapno-piaskowiec roundedRect (IDENTYCZNE z HeartPad)
        const wallColor = isActive ? 0xc8aa80 : 0x8a7a60;
        this.wallGfx.clear();
        this.wallGfx.beginFill(wallColor);
        this.wallGfx.drawRoundedRect(0, 0, PAD_SIZE, PAD_SIZE, 6);
        this.wallGfx.moveTo(6, elevation);
        this.wallGfx.lineTo(6, 0);
        this.wallGfx.lineTo(PAD_SIZE - 6, 0);
        this.wallGfx.lineTo(PAD_SIZE - 6, elevation);
        this.wallGfx.endFill();
        
        // Powierzchnia ołtarza (IDENTYCZNE z HeartPad — wizualna spójność)
        this.surfaceGfx.clear();
        this.surfaceGfx.beginFill(isActive ? 0xebd2a8 : 0x9a8a70);
        this.surfaceGfx.drawRoundedRect(0, 0, PAD_SIZE, PAD_SIZE, 6);
        this.surfaceGfx.endFill();
        
        // Wykute rowki (identyczne z HeartPad)
        this.surfaceGfx.lineStyle(2, isActive ? 0xb09260 : 0x706040, 1);
        this.surfaceGfx.drawRoundedRect(4, 4, PAD_SIZE - 8, PAD_SIZE - 8, 4);
        
        // v0.18.6 FIX 2 — LIGHTNING BOLT (animowany scale pulse)
        this.boltGfx.clear();
        
        // Bolt rysowany w lokalnym układzie (0, 0) z pivotem center
        // dla idealnego pulse scale wokół środka.
        const boltScale = 0.9;  // v0.18.6-fix1: 50% mniejsze (było 1.8, przytłaczało pad)
        
        if (isActive) {
            // Cień (offset +2 w y dla 3D feel)
            this.boltGfx.beginFill(0x110d00, 0.7);
            this.drawLightningPathLocal(this.boltGfx, 0, 2, boltScale);
            this.boltGfx.endFill();
            
            // Złota błyskawica z highlight
            this.boltGfx.lineStyle(1.8, 0xffffff, 0.85);
            this.boltGfx.beginFill(0xffcc00);
            this.drawLightningPathLocal(this.boltGfx, 0, 0, boltScale);
            this.boltGfx.endFill();
            
            // Inner highlight (jaśniejszy strzał wzdłuż osi)
            this.boltGfx.lineStyle(0);
            this.boltGfx.beginFill(0xffee88, 0.6);
            this.drawLightningPathLocal(this.boltGfx, 0, 0, boltScale * 0.6);
            this.boltGfx.endFill();
            
            // PULSING SCALE: 1.0 → 1.15 (fast pulse, dynamic "życie")
            const pulse = 1.0 + Math.sin(time * 6) * 0.075 + 0.075;  // baseline 1.075 ± 0.075 = 1.0-1.15
            this.boltGfx.scale.set(pulse);
        } else {
            // Inactive: przygaszone, statyczne
            this.boltGfx.lineStyle(1.5, 0x2a1d00, 1);
            this.boltGfx.beginFill(0x554400);
            this.drawLightningPathLocal(this.boltGfx, 0, 0, boltScale);
            this.boltGfx.endFill();
            this.boltGfx.scale.set(1.0);
        }
        
        // Cooldown
        if (!isActive) {
            this.cooldownLabel.visible = true;
            const cdLeft = Math.ceil((this.cooldownEnd - Date.now()) / 1000);
            this.cooldownLabel.text = `${cdLeft}s`;
            this.cooldownLabel.x = PAD_SIZE / 2;
            this.cooldownLabel.y = PAD_SIZE / 2 + 14;  // pod błyskawicą (zmniejszone z 22)
        } else {
            this.cooldownLabel.visible = false;
        }
    }
    
    /**
     * v0.18.6 FIX 2: rysuje błyskawicę w lokalnym układzie (cx, cy) — używane
     * z boltGfx pozycjonowanym do centrum padu. Pivot środkowy = scale wokół środka.
     */
    private drawLightningPathLocal(gfx: PIXI.Graphics, cx: number, cy: number, scale: number): void {
        gfx.moveTo(cx + 4 * scale, cy - 14 * scale);
        gfx.lineTo(cx - 9 * scale, cy + 2 * scale);
        gfx.lineTo(cx - 2 * scale, cy + 2 * scale);
        gfx.lineTo(cx - 7 * scale, cy + 16 * scale);
        gfx.lineTo(cx + 10 * scale, cy - 2 * scale);
        gfx.lineTo(cx + 2 * scale, cy - 2 * scale);
        gfx.lineTo(cx + 8 * scale, cy - 14 * scale);
        gfx.closePath();
    }
}