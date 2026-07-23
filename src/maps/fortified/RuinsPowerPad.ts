import * as PIXI from 'pixi.js';

/**
 * RuinsPowerPad — power/turbo pad scenariusza CTF (FAZA F4.2), wariant ruin.
 *
 * Mechanika 1:1 z PowerHoverPad (main.ts pad-loop dziala bez zmian):
 *  range 50, INSTANT turbo x2 na 5 s, cooldown 20 s, zwraca {activated,durationMs,
 *  multiplier}. x/y = TOP-LEFT footprintu 100x100, centrum = x+50,y+50.
 *
 * F4.2 mobile-crisp: kamienny dais + bursztynowa runa blyskawicy WYPIECZONE w
 * Canvas 2D (AA) -> Texture -> Sprite (cache module-level). Glow = baked bursztyn
 * na NORMAL alpha (NIE SCREEN). Luki energii (Graphics, tylko gdy aktywny) = lekki
 * overlay. "Sprint lane" na trasach odwrotu z flaga (risk/reward: nadloz po turbo).
 */

const PAD_SIZE = 100;
const ACTIVATE_RANGE = 50;
const TURBO_DURATION_MS = 5000;
const COOLDOWN_MS = 20000;
const TURBO_MULT = 2.0;

let _platformTex: PIXI.Texture | null = null;
let _glowTex: PIXI.Texture | null = null;

export interface PowerPadInteractionResult {
    activated: boolean;
    durationMs: number;
    multiplier: number;
}

export class RuinsPowerPad {
    public x: number;
    public y: number;
    public cooldownEnd: number = -1;

    public container: PIXI.Container;
    private glowSprite: PIXI.Sprite;
    private platformSprite: PIXI.Sprite;
    private arcsGfx: PIXI.Graphics;
    private cooldownLabel: PIXI.Text;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;

        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + 50;
        worldContainer.addChild(this.container);

        this.glowSprite = new PIXI.Sprite(getGlowTex());
        this.glowSprite.anchor.set(0.5);
        this.glowSprite.x = PAD_SIZE / 2;
        this.glowSprite.y = PAD_SIZE / 2;
        this.container.addChild(this.glowSprite);

        this.platformSprite = new PIXI.Sprite(getPlatformTex());
        this.platformSprite.anchor.set(0.5);
        this.platformSprite.x = PAD_SIZE / 2;
        this.platformSprite.y = PAD_SIZE / 2;
        this.container.addChild(this.platformSprite);

        this.arcsGfx = new PIXI.Graphics();
        this.container.addChild(this.arcsGfx);

        this.cooldownLabel = new PIXI.Text('', {
            fontFamily: 'Arial', fontSize: 9, fontWeight: 'bold', fill: 0xffe6c0,
        });
        this.cooldownLabel.anchor.set(0.5);
        this.cooldownLabel.visible = false;
        this.container.addChild(this.cooldownLabel);
    }

    update(playerX: number, playerY: number, time: number): PowerPadInteractionResult {
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
        return { activated, durationMs: TURBO_DURATION_MS, multiplier: TURBO_MULT };
    }

    private drawVisuals(isActive: boolean, time: number): void {
        const hoverH = isActive ? 10 + Math.sin(time * 6) * 4 : 3;
        this.platformSprite.y = PAD_SIZE / 2 - hoverH;
        this.platformSprite.tint = isActive ? 0xffffff : 0x6b5e4a;

        this.glowSprite.visible = isActive;
        if (isActive) {
            this.glowSprite.alpha = 0.4 + Math.abs(Math.sin(time * 4)) * 0.3;
            this.glowSprite.scale.set(1 + Math.sin(time * 6) * 0.05);
        }

        // Luki energii rotujace (tylko aktywny)
        const g = this.arcsGfx;
        g.clear();
        if (isActive) {
            const cx = PAD_SIZE / 2, cy = PAD_SIZE / 2 - hoverH;
            for (let i = 0; i < 4; i++) {
                const a0 = time * 2 + (i * Math.PI) / 2;
                g.lineStyle(2, 0xffa63c, 0.85);
                g.arc(cx, cy, 26, a0, a0 + 0.9);
            }
            g.lineStyle(0);
        }

        if (!isActive) {
            this.cooldownLabel.visible = true;
            const cdLeft = Math.ceil((this.cooldownEnd - Date.now()) / 1000);
            this.cooldownLabel.text = `⏱ ${cdLeft}s`;
            this.cooldownLabel.x = PAD_SIZE / 2;
            this.cooldownLabel.y = -18;
        } else {
            this.cooldownLabel.visible = false;
        }
    }
}

// =================================================================
// Canvas 2D bake (AA) — dais + runa blyskawicy, glow. Cache module-level.
// =================================================================

function getPlatformTex(): PIXI.Texture {
    if (_platformTex) return _platformTex;
    const S = PAD_SIZE;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    const cx = S / 2, cy = S / 2;

    // Cien
    c.fillStyle = 'rgba(24,20,12,0.5)';
    c.beginPath(); c.ellipse(cx + 3, cy + 6, 46, 40, 0, 0, Math.PI * 2); c.fill();

    // Pierscien kamienny (osmiokat)
    c.fillStyle = '#6b6152';
    ngon(c, cx, cy, 46, 8, -Math.PI / 8); c.fill();
    c.fillStyle = '#7d7360';
    ngon(c, cx, cy, 42, 8, -Math.PI / 8); c.fill();
    c.strokeStyle = 'rgba(40,34,24,0.6)'; c.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 8 + (i / 8) * Math.PI * 2;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44); c.stroke();
    }

    // Dysk wewnetrzny (ciemny kamien z bursztynowym nalotem)
    c.fillStyle = '#4a3d28';
    c.beginPath(); c.arc(cx, cy, 32, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a2f1f';
    c.beginPath(); c.arc(cx, cy, 26, 0, Math.PI * 2); c.fill();

    // Runa: bursztynowy okrag + glify + blyskawica
    c.strokeStyle = '#ffa63c'; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const gx = cx + Math.cos(a) * 20, gy = cy + Math.sin(a) * 20;
        c.beginPath(); c.moveTo(gx - 3, gy - 3); c.lineTo(gx + 3, gy + 3); c.stroke();
    }
    // Blyskawica (zygzak)
    const bolt = [
        [cx + 5, cy - 15], [cx - 6, cy - 1], [cx + 1, cy - 1],
        [cx - 5, cy + 15], [cx + 8, cy - 3], [cx + 1, cy - 3],
    ];
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.moveTo(bolt[0][0], bolt[0][1]);
    for (let i = 1; i < bolt.length; i++) c.lineTo(bolt[i][0], bolt[i][1]);
    c.closePath(); c.fill();
    c.strokeStyle = '#fff2b0'; c.lineWidth = 1;
    c.stroke();

    // Mech
    c.fillStyle = 'rgba(90,110,58,0.45)';
    c.beginPath(); c.ellipse(cx - 30, cy + 18, 7, 4, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + 28, cy - 22, 6, 3.5, 0, 0, Math.PI * 2); c.fill();

    _platformTex = PIXI.Texture.from(cv);
    return _platformTex;
}

function getGlowTex(): PIXI.Texture {
    if (_glowTex) return _glowTex;
    const size = 140;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const c = cv.getContext('2d')!;
    const grad = c.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,166,60,0.5)');
    grad.addColorStop(0.5, 'rgba(255,140,30,0.18)');
    grad.addColorStop(1, 'rgba(255,140,30,0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, size, size);
    _glowTex = PIXI.Texture.from(cv);
    return _glowTex;
}

function ngon(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, rot: number): void {
    c.beginPath();
    for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
}
