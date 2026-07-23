import * as PIXI from 'pixi.js';

/**
 * RuinsMediPad — medi pad scenariusza CTF (FAZA F4.2), wariant w klimacie ruin.
 *
 * Mechanika 1:1 z HoverRepairPad (main.ts pad-loop dziala bez zmian):
 *  range 60, stoj nieruchomo 2250 ms, cooldown 60 s, zwraca {healed} (heal +100
 *  aplikuje main.ts). x/y = TOP-LEFT footprintu 100x100, centrum = x+50,y+50.
 *
 * F4.2 mobile-crisp (spojnie z F4.1): kamienny dais + zielona runa lecznicza
 * WYPIECZONE w Canvas 2D (AA) -> Texture -> Sprite (cache module-level). Glow =
 * baked zielony radial na NORMAL alpha (NIE SCREEN-blend jak stock) -> tani na
 * mobile. Dynamiczne (pasek postepu, label, hover-bob, pulsy) = lekkie overlaye.
 */

const PAD_SIZE = 100;
const ACTIVATE_RANGE = 60;
const REPAIR_TIME_MS = 2250;
const COOLDOWN_MS = 60000;

let _platformTex: PIXI.Texture | null = null;
let _glowTex: PIXI.Texture | null = null;

export interface PadInteractionResult {
    healed: boolean;
}

export class RuinsMediPad {
    public x: number;
    public y: number;
    public cooldownEnd: number = -1;
    public repairProgress: number = 0;
    private _repairStart: number | null = null;

    public container: PIXI.Container;
    private glowSprite: PIXI.Sprite;
    private platformSprite: PIXI.Sprite;
    private progressBarBg: PIXI.Graphics;
    private progressBarFill: PIXI.Graphics;
    private progressLabel: PIXI.Text;
    private cooldownLabel: PIXI.Text;
    private motesGfx: PIXI.Graphics;

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

        this.motesGfx = new PIXI.Graphics();
        this.container.addChild(this.motesGfx);

        this.progressBarBg = new PIXI.Graphics();
        this.progressBarBg.visible = false;
        this.container.addChild(this.progressBarBg);
        this.progressBarFill = new PIXI.Graphics();
        this.progressBarFill.visible = false;
        this.container.addChild(this.progressBarFill);

        this.progressLabel = new PIXI.Text('NAPRAWIAM...', {
            fontFamily: 'Courier New', fontSize: 10, fontWeight: 'bold', fill: 0xd6ffe0,
        });
        this.progressLabel.anchor.set(0.5);
        this.progressLabel.visible = false;
        this.container.addChild(this.progressLabel);

        this.cooldownLabel = new PIXI.Text('', {
            fontFamily: 'Arial', fontSize: 9, fontWeight: 'bold', fill: 0xcfe8d4,
        });
        this.cooldownLabel.anchor.set(0.5);
        this.cooldownLabel.visible = false;
        this.container.addChild(this.cooldownLabel);
    }

    update(
        playerX: number,
        playerY: number,
        isPlayerMoving: boolean,
        playerHp: number,
        playerMaxHp: number,
        time: number,
    ): PadInteractionResult {
        const now = Date.now();
        const isActive = now >= this.cooldownEnd;
        let healed = false;

        if (isActive) {
            const cx = this.x + PAD_SIZE / 2;
            const cy = this.y + PAD_SIZE / 2;
            const dx = playerX - cx, dy = playerY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < ACTIVATE_RANGE && playerHp < playerMaxHp) {
                if (!isPlayerMoving) {
                    if (!this._repairStart) this._repairStart = now;
                    this.repairProgress = Math.min(1, (now - this._repairStart) / REPAIR_TIME_MS);
                    if (this.repairProgress >= 1) {
                        healed = true;
                        this.cooldownEnd = now + COOLDOWN_MS;
                        this.repairProgress = 0;
                        this._repairStart = null;
                    }
                } else {
                    this.repairProgress = 0;
                    this._repairStart = null;
                }
            } else {
                this.repairProgress = 0;
                this._repairStart = null;
            }
        } else {
            this.repairProgress = 0;
        }

        this.drawVisuals(isActive, time);
        return { healed };
    }

    private drawVisuals(isActive: boolean, time: number): void {
        const isRepairing = this.repairProgress > 0;
        const hoverH = isActive ? 8 + Math.sin(time * 3) * 4 : 2;
        this.platformSprite.y = PAD_SIZE / 2 - hoverH;

        // Runa: pelny kolor gdy aktywna, przygaszona na cooldownie
        this.platformSprite.tint = isActive ? 0xffffff : 0x5a6b5e;

        // Glow (normal alpha, pulsowany)
        this.glowSprite.visible = isActive;
        if (isActive) {
            this.glowSprite.alpha = isRepairing
                ? 0.55 + Math.abs(Math.sin(time * 8)) * 0.35
                : 0.35 + Math.sin(time * 2.5) * 0.1;
            this.glowSprite.scale.set(1 + (isRepairing ? Math.sin(time * 8) * 0.06 : 0));
        }

        // Motes leczace (kilka zielonych iskier krazacych) — tylko podczas naprawy
        const g = this.motesGfx;
        g.clear();
        if (isRepairing) {
            g.beginFill(0x8effc0, 0.9);
            for (let i = 0; i < 4; i++) {
                const a = time * 3 + (i * Math.PI) / 2;
                const rr = 20 - this.repairProgress * 12;
                g.drawCircle(PAD_SIZE / 2 + Math.cos(a) * rr, PAD_SIZE / 2 - hoverH + Math.sin(a) * rr * 0.6, 2.2);
            }
            g.endFill();
        }

        // Pasek postepu
        if (isRepairing) {
            this.progressBarBg.visible = true;
            this.progressBarFill.visible = true;
            this.progressLabel.visible = true;
            this.progressBarBg.clear();
            this.progressBarBg.beginFill(0x000000, 0.7);
            this.progressBarBg.drawRoundedRect(PAD_SIZE / 2 - 40, -30, 80, 12, 4);
            this.progressBarBg.endFill();
            this.progressBarFill.clear();
            this.progressBarFill.beginFill(0x2ecc71);
            this.progressBarFill.drawRoundedRect(PAD_SIZE / 2 - 38, -28, 76 * this.repairProgress, 8, 3);
            this.progressBarFill.endFill();
            this.progressLabel.x = PAD_SIZE / 2;
            this.progressLabel.y = -40;
        } else {
            this.progressBarBg.visible = false;
            this.progressBarFill.visible = false;
            this.progressLabel.visible = false;
        }

        // Cooldown label
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
// Canvas 2D bake (AA) — dais + zielona runa, glow. Cache module-level.
// =================================================================

function getPlatformTex(): PIXI.Texture {
    if (_platformTex) return _platformTex;
    const S = PAD_SIZE;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    const cx = S / 2, cy = S / 2;

    // Cien pod daisem
    c.fillStyle = 'rgba(20,28,18,0.5)';
    c.beginPath(); c.ellipse(cx + 3, cy + 6, 46, 40, 0, 0, Math.PI * 2); c.fill();

    // Pierscien kamienny zewnetrzny (osmiokatny blok ruin)
    c.fillStyle = '#6b6152';
    ngon(c, cx, cy, 46, 8, -Math.PI / 8); c.fill();
    c.fillStyle = '#7d7360';
    ngon(c, cx, cy, 42, 8, -Math.PI / 8); c.fill();
    // Fugi bloczkow
    c.strokeStyle = 'rgba(40,36,28,0.6)'; c.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 8 + (i / 8) * Math.PI * 2;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44); c.stroke();
    }

    // Dysk wewnetrzny (ciemniejszy kamien z zielonkawym nalotem)
    c.fillStyle = '#3a4a34';
    c.beginPath(); c.arc(cx, cy, 32, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2c3a28';
    c.beginPath(); c.arc(cx, cy, 26, 0, Math.PI * 2); c.fill();

    // Runa lecznicza: swiecacy zielony okrag + krzyz medyczny
    c.strokeStyle = '#3ddc7a'; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.stroke();
    // glify na okregu
    c.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const gx = cx + Math.cos(a) * 20, gy = cy + Math.sin(a) * 20;
        c.beginPath(); c.moveTo(gx - 3, gy - 3); c.lineTo(gx + 3, gy + 3); c.stroke();
    }
    // krzyz
    c.fillStyle = '#5effa0';
    c.fillRect(cx - 4, cy - 13, 8, 26);
    c.fillRect(cx - 13, cy - 4, 26, 8);
    // rdzen jasny
    c.fillStyle = '#c6ffdd';
    c.fillRect(cx - 2.5, cy - 11, 5, 22);
    c.fillRect(cx - 11, cy - 2.5, 22, 5);

    // Mech na kamieniu (klimat ruin)
    c.fillStyle = 'rgba(90,110,58,0.5)';
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
    grad.addColorStop(0, 'rgba(62,220,122,0.5)');
    grad.addColorStop(0.5, 'rgba(46,204,113,0.18)');
    grad.addColorStop(1, 'rgba(46,204,113,0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, size, size);
    _glowTex = PIXI.Texture.from(cv);
    return _glowTex;
}

/** Sciezka N-kata (regularny wielokat). */
function ngon(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, rot: number): void {
    c.beginPath();
    for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
}
