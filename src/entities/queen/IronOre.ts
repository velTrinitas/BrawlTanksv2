import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import { applyHitShake } from '../../rendering/hitShake';
import { DUNGEON_PALETTE as P } from '../../maps/dungeon/dungeonPalette';

/**
 * IronOre — blok rudy zelaza w murze wiezienia (SAVE THE QUEEN Q2). NIE do rozwalenia.
 * Czytelnie INNY niz cegla: metal (stalowy szaro-niebieski, nity, zimny blysk krawedzi)
 * vs glina. Trafienie = iskra (3 czastki) + "clink" + pocisk znika; ZERO stanow obrazen,
 * zero pekniec — gracz po 2 trafieniach WIE, ze to nie ta droga. Pierwsze trafienie w
 * meczu => callback (ItemHint "Ruda — nie do przebicia", Q5).
 *
 * ICollidable x/y = TOP-LEFT, 56 px. Jedna tekstura wspoldzielona (sprite'y batchuja).
 * Duck-typed takeDamage (pocisk deaktywuje sie sam) — obrazenia ignorowane.
 */

export const IRON_ORE_SIZE = 56;
const RISE = 16;
const MARGIN = 10;
let _tex: PIXI.Texture | null = null;

function bakeOre(): PIXI.Texture {
    const size = IRON_ORE_SIZE, m = MARGIN, rise = RISE;
    const cv = document.createElement('canvas');
    cv.width = size + m * 2; cv.height = size + rise + m * 2;
    const c = cv.getContext('2d')!;
    c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(m + 5, m + rise + 5, size, size);
    c.fillStyle = P.iron; c.fillRect(m, m + rise, size, size);
    c.fillStyle = '#2a2d33'; c.fillRect(m + size - 6, m + rise, 6, size);
    c.fillStyle = P.ironLight; c.fillRect(m, m, size, rise + 4);
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(m, m, size, 3);
    // zimny niebieski blysk krawedzi (wpieczony)
    c.strokeStyle = '#8fb8e8'; c.lineWidth = 2; c.globalAlpha = 0.55;
    c.beginPath(); c.moveTo(m + 2, m + rise + size - 2); c.lineTo(m + 2, m + 2); c.lineTo(m + size - 2, m + 2); c.stroke();
    c.globalAlpha = 1;
    // nity po obwodzie lica
    c.fillStyle = '#6a7078';
    for (const [rx, ry] of [[9, 9], [size - 9, 9], [9, size - 9], [size - 9, size - 9], [size / 2, 9], [size / 2, size - 9], [9, size / 2], [size - 9, size / 2]]) {
        c.beginPath(); c.arc(m + rx, m + rise + ry, 3, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#9aa2ab'; c.beginPath(); c.arc(m + rx - 1, m + rise + ry - 1, 1.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#6a7078';
    }
    // ciemna plyta srodkowa + rysa
    c.fillStyle = '#30343a'; c.fillRect(m + 14, m + rise + 14, size - 28, size - 28);
    c.strokeStyle = '#1f2226'; c.lineWidth = 2; c.beginPath(); c.moveTo(m + 18, m + rise + 20); c.lineTo(m + size - 20, m + rise + size - 18); c.stroke();
    return PIXI.Texture.from(cv);
}

export class IronOre implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private readonly container: PIXI.Container;
    private readonly effects: EffectsManager;
    private readonly audio: AudioSys;
    private readonly onClink: (() => void) | null;

    constructor(x: number, y: number, worldContainer: PIXI.Container, effects: EffectsManager, audio: AudioSys, onClink?: () => void) {
        this.x = x; this.y = y; this.w = IRON_ORE_SIZE; this.h = IRON_ORE_SIZE;
        this.effects = effects; this.audio = audio; this.onClink = onClink ?? null;
        this.container = new PIXI.Container();
        this.container.x = x; this.container.y = y;
        this.container.zIndex = y + IRON_ORE_SIZE;
        worldContainer.addChild(this.container);
        if (!_tex) _tex = bakeOre();
        const sp = new PIXI.Sprite(_tex);
        sp.x = -MARGIN; sp.y = -(RISE + MARGIN);
        this.container.addChild(sp);
    }

    /** Duck-typed z Bullet/EnemyBullet: iskra + clink, ZERO obrazen. */
    public takeDamage(_dmg: number, hitX: number, hitY: number): void {
        this.effects.spawnEnemyHitSparks(hitX, hitY, 0xbcd6f5);
        this.audio.playWallThunk();
        applyHitShake(this.container, this.x, this.y, 0.8, 50, () => false);
        this.onClink?.();
    }

    /** Padded hitbox dla PLAYER collision — do buildings[]. */
    public getExtraCollidables(): ICollidable[] {
        const PAD = 8;
        return [{ x: this.x - PAD, y: this.y - PAD, w: IRON_ORE_SIZE + PAD * 2, h: IRON_ORE_SIZE + PAD * 2, update: () => {} }];
    }

    public update(): void { /* static */ }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
