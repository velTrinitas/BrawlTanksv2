import * as PIXI from 'pixi.js';
import type { EffectsManager } from '../../rendering/Effects';

/**
 * Magnet pickup — rare. Aktywuje 5s podczas których wszystkie gems lecą do gracza.
 * v0.4d: dodany błękitnawy glow aura (był praktycznie niewidoczny bez glow).
 * v0.118.0: podkowa PROGRAMMATIC zastąpiona assetem Mariusza
 * (public/assets/items/magnet_120.png, 120px) — glow ZOSTAJE jako osobny sprite
 * pod spodem (lekcja v0.4d: bez poświaty magnes ginie na mapach).
 */

/** Bazowa skala assetu 120px -> ~44px w świecie (stary rozmiar podkowy). */
const MAGNET_ASSET_SIZE = 120;
const MAGNET_DISPLAY_SIZE = 44;
const MAGNET_BASE_SCALE = MAGNET_DISPLAY_SIZE / MAGNET_ASSET_SIZE;

let _magnetTexture: PIXI.Texture | null = null;
function getMagnetTexture(): PIXI.Texture {
    if (_magnetTexture) return _magnetTexture;
    // PIXI v7: Texture.from(url) ładuje async — sprite pojawia się po wczytaniu
    // (pickup jest rzadki i żyje 20s, opóźnienie pierwszego wczytania niezauważalne).
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    _magnetTexture = PIXI.Texture.from(`${base}assets/items/magnet_120.png`);
    return _magnetTexture;
}

let _magnetGlowTexture: PIXI.Texture | null = null;
function getMagnetGlowTexture(): PIXI.Texture {
    if (_magnetGlowTexture) return _magnetGlowTexture;
    const cv = document.createElement('canvas');
    cv.width = 72; cv.height = 72;
    const ctx = cv.getContext('2d')!;
    const glowGrad = ctx.createRadialGradient(36, 36, 10, 36, 36, 36);
    glowGrad.addColorStop(0, 'rgba(102,204,255,0.7)');
    glowGrad.addColorStop(0.5, 'rgba(102,204,255,0.35)');
    glowGrad.addColorStop(1, 'rgba(102,204,255,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, 72, 72);
    _magnetGlowTexture = PIXI.Texture.from(cv);
    return _magnetGlowTexture;
}

export class Magnet {
    public x: number;
    public y: number;
    public active: boolean;
    public sprite: PIXI.Sprite;
    private glowSprite: PIXI.Sprite;
    public radius: number = 22;
    private bornAt: number;
    private static readonly LIFETIME_MS = 20000;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y;
        this.active = true;
        this.bornAt = Date.now();

        // glow POD magnesem (osobny sprite — asset nie ma własnej poświaty)
        this.glowSprite = new PIXI.Sprite(getMagnetGlowTexture());
        this.glowSprite.anchor.set(0.5);
        this.glowSprite.x = x;
        this.glowSprite.y = y;
        this.glowSprite.zIndex = y + 3;
        worldContainer.addChild(this.glowSprite);

        this.sprite = new PIXI.Sprite(getMagnetTexture());
        this.sprite.anchor.set(0.5);
        this.sprite.scale.set(MAGNET_BASE_SCALE);
        this.sprite.x = x;
        this.sprite.y = y;
        this.sprite.zIndex = y + 4;
        worldContainer.addChild(this.sprite);
    }

    update(_delta: number): void {
        if (!this.active) return;

        // Pulsing scale + lekki obrót (skala bazowa wpieczona — asset 120px)
        const t = Date.now() / 300;
        const pulse = 1 + Math.sin(t) * 0.12;
        this.sprite.scale.set(MAGNET_BASE_SCALE * pulse);
        this.sprite.rotation += 0.015;
        this.glowSprite.scale.set(pulse);

        const age = Date.now() - this.bornAt;
        if (age > Magnet.LIFETIME_MS - 3000) {
            const blink = Math.sin(Date.now() / 80) > 0 ? 1 : 0.4;
            this.sprite.alpha = blink;
            this.glowSprite.alpha = blink;
        }

        if (age > Magnet.LIFETIME_MS) {
            this.destroy();
        }
    }

    pickup(effects: EffectsManager): boolean {
        if (!this.active) return false;
        // Błękitne iskry (matching glow)
        effects.spawnEnemyHitSparks(this.x, this.y, 0x66ccff);
        this.destroy();
        return true;
    }

    destroy(): void {
        this.active = false;
        if (this.glowSprite.parent) {
            this.glowSprite.parent.removeChild(this.glowSprite);
        }
        this.glowSprite.destroy();
        if (this.sprite.parent) {
            this.sprite.parent.removeChild(this.sprite);
        }
        this.sprite.destroy();
    }
}