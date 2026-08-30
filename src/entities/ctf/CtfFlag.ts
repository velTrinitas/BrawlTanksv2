import * as PIXI from 'pixi.js';
// TYPO-P1-7: napis szedl hardkodem po polsku — w EN byl bledem widocznym od razu.
import { t } from '../../i18n/i18n';

/**
 * CtfFlag — flaga scenariusza CTF (FAZA CTF F2, mobile-crisp F4.1f).
 *
 * Port legacy class Flag (ctf.html 3869-3933), wartosci 1:1:
 *  - stany: IDLE | CARRIED | CAPTURED,
 *  - pulse += 0.055/klatke (bob = sin(pulse)*5),
 *  - CARRIED: follow 34 px ZA kadlubem gracza (D8),
 *  - IDLE po dropie: reset do pozycji startowej po 10 000 ms (dropTimer),
 *  - CAPTURED: niewidoczna.
 *
 * F4.1f (mobile): proporzec (trojkat) + plyta gruntu to byly zywe wektory
 * przerysowywane co klatke (proporzec faluje) — na mobile (AA renderera OFF)
 * ukosne krawedzie "pikselowaly" i migotaly. Fix: proporzec i plyta sa
 * WYPIECZONE w Canvas 2D (AA) -> Textures -> Sprite'y (cache per-kolor,
 * module-level => zero rebake/leaku). Falowanie proporca = tanie skew.y sprite'a
 * (gladko). Maszt + podstawa zostaja jako Graphics (pionowe = ostre bez AA).
 */

export type CtfFlagState = 'idle' | 'carried' | 'captured';

interface FlagTex {
    banner: PIXI.Texture; plate: PIXI.Texture;
    bAX: number; bAY: number; pAX: number; pAY: number;
}
const FLAG_CACHE = new Map<number, FlagTex>();

export class CtfFlag {
    public readonly id: number;
    public readonly name: string;
    public readonly color: number;
    public readonly startX: number;
    public readonly startY: number;

    public x: number;
    public y: number;
    public state: CtfFlagState = 'idle';
    public dropTimer: number = 0;

    private container: PIXI.Container;
    private plateSprite: PIXI.Sprite;
    private gfxMast: PIXI.Graphics;
    private bannerSprite: PIXI.Sprite;
    private gfxTrail: PIXI.Graphics;
    private trailPoints: Array<{ x: number; y: number }> = [];
    private trailFrameCounter: number = 0;
    private label: PIXI.Text;
    private pulse: number;

    constructor(
        id: number,
        name: string,
        x: number,
        y: number,
        color: number,
        worldContainer: PIXI.Container,
    ) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.startX = x;
        this.startY = y;
        this.x = x;
        this.y = y;

        const tex = getFlagTextures(color);

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y;
        worldContainer.addChild(this.container);

        this.plateSprite = new PIXI.Sprite(tex.plate);
        this.plateSprite.anchor.set(tex.pAX, tex.pAY);
        this.container.addChild(this.plateSprite);

        this.gfxMast = new PIXI.Graphics();
        this.container.addChild(this.gfxMast);

        this.bannerSprite = new PIXI.Sprite(tex.banner);
        this.bannerSprite.anchor.set(tex.bAX, tex.bAY);
        this.container.addChild(this.bannerSprite);

        // Smuga w WORLD-space (osobny gfx na poziomie gruntu)
        this.gfxTrail = new PIXI.Graphics();
        this.gfxTrail.zIndex = 9;
        worldContainer.addChild(this.gfxTrail);

        this.label = new PIXI.Text(t('ctf.flagLabel', { team: name }), {
            fontFamily: "'Titan One', cursive",
            fontSize: 13,
            fill: color,
            stroke: 0x000000,
            strokeThickness: 3,
        });
        this.label.anchor.set(0.5, 0);
        this.label.y = 30;
        this.container.addChild(this.label);

        this.pulse = Math.random() * Math.PI * 2;
    }

    public update(delta: number, playerX: number, playerY: number, playerHullAngle: number): void {
        this.pulse += 0.055 * delta;

        if (this.state === 'carried') {
            const behind = playerHullAngle + Math.PI;
            this.x = playerX + Math.cos(behind) * 34;
            this.y = playerY + Math.sin(behind) * 34;
        }

        if (this.state === 'idle' && this.dropTimer > 0 && Date.now() > this.dropTimer) {
            this.x = this.startX;
            this.y = this.startY;
            this.dropTimer = 0;
        }

        this.container.visible = this.state !== 'captured';
        this.plateSprite.visible = this.state === 'idle';
        this.label.visible = this.state === 'idle';

        this.container.x = this.x;
        this.container.y = this.y;
        this.container.zIndex = this.y + 2;

        if (this.container.visible) {
            const bob = Math.sin(this.pulse) * 5;
            const wave = Math.sin(this.pulse * 1.9) * 5 + Math.sin(this.pulse * 3.1) * 2;
            // Maszt + podstawa (Graphics, pionowe = ostre)
            const g = this.gfxMast;
            g.clear();
            g.lineStyle(4, 0x000000, 0.2);
            g.moveTo(2, bob + 24); g.lineTo(2, bob - 28);
            g.lineStyle(4, 0xc8a86b, 1);
            g.moveTo(0, bob + 22); g.lineTo(0, bob - 28);
            g.lineStyle(0);
            g.beginFill(0xb8956a);
            g.lineStyle(1, 0x8b6914, 1);
            g.drawRoundedRect(-8, bob + 18, 16, 8, 2);
            g.endFill();
            g.lineStyle(0);
            // Proporzec (baked sprite) — bob + falowanie przez skew.y (gladko)
            this.bannerSprite.y = bob;
            this.bannerSprite.skew.y = wave / 35; // ~ta sama amplituda co legacy tip
        }

        this.updateTrail(delta);
    }

    private updateTrail(delta: number): void {
        if (this.state === 'carried') {
            this.trailFrameCounter += delta;
            if (this.trailFrameCounter >= 3) {
                this.trailFrameCounter = 0;
                this.trailPoints.push({ x: this.x, y: this.y });
                if (this.trailPoints.length > 14) this.trailPoints.shift();
            }
        } else if (this.trailPoints.length > 0) {
            this.trailPoints.shift();
        }

        const g = this.gfxTrail;
        g.clear();
        const n = this.trailPoints.length;
        for (let i = 0; i < n; i++) {
            const p = this.trailPoints[i];
            const tFade = (i + 1) / n;
            g.beginFill(this.color, 0.32 * tFade);
            g.drawCircle(p.x, p.y, 3 + 5 * tFade);
            g.endFill();
        }
    }

    public destroy(): void {
        if (this.container.parent) this.container.parent.removeChild(this.container);
        this.container.destroy({ children: true });
        if (this.gfxTrail.parent) this.gfxTrail.parent.removeChild(this.gfxTrail);
        this.gfxTrail.destroy();
    }
}

// =================================================================
// Canvas 2D bake (AA) — proporzec + plyta, cache per-kolor
// =================================================================

function getFlagTextures(color: number): FlagTex {
    const cached = FLAG_CACHE.get(color);
    if (cached) return cached;
    const built = buildFlagTextures(color);
    FLAG_CACHE.set(color, built);
    return built;
}

function buildFlagTextures(color: number): FlagTex {
    const col = '#' + color.toString(16).padStart(6, '0');

    // ── Proporzec (trojkat + obrys + highlight); local (0,0) = punkt na maszcie ──
    const bPad = 4;
    const bW = 35 + bPad * 2;
    const bH = 30 + bPad * 2;       // y od -28 do 2
    const bOX = bPad;               // canvas x dla local x=0
    const bOY = 28 + bPad;          // canvas y dla local y=0
    const bc = document.createElement('canvas');
    bc.width = bW; bc.height = bH;
    const b = bc.getContext('2d')!;
    b.translate(bOX, bOY);
    // proporzec
    b.fillStyle = col;
    b.beginPath();
    b.moveTo(0, -28); b.lineTo(35, -14); b.lineTo(0, 2); b.closePath();
    b.fill();
    b.lineWidth = 1.2; b.strokeStyle = 'rgba(0,0,0,0.35)'; b.stroke();
    // highlight
    b.fillStyle = 'rgba(255,255,255,0.28)';
    b.beginPath();
    b.moveTo(0, -28); b.lineTo(17, -22); b.lineTo(0, -20); b.closePath();
    b.fill();

    // ── Plyta gruntu (koncentryczne elipsy w kolorze flagi); local (0,0) = kotwica ──
    const pW = 110, pH = 72;
    const pOX = 55, pOY = 30;       // canvas coord dla local (0,0)
    const pc = document.createElement('canvas');
    pc.width = pW; pc.height = pH;
    const p = pc.getContext('2d')!;
    p.translate(pOX, pOY);
    for (let i = 3; i >= 1; i--) {
        p.globalAlpha = 0.13 * i;
        p.fillStyle = col;
        p.beginPath();
        p.ellipse(0, 8, (50 / 3) * (4 - i), (30 / 3) * (4 - i), 0, 0, Math.PI * 2);
        p.fill();
    }
    p.globalAlpha = 1;

    return {
        banner: PIXI.Texture.from(bc),
        plate: PIXI.Texture.from(pc),
        bAX: bOX / bW, bAY: bOY / bH,
        pAX: pOX / pW, pAY: pOY / pH,
    };
}
