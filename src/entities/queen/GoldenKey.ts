import * as PIXI from 'pixi.js';

/**
 * GoldenKey — ZLOTY KLUCZ do stalowych drzwi celi (SAVE THE QUEEN Q4.6, decyzja Mariusza).
 * Ukryty w jednym z "samotnych" miejsc mapy (worldRng z DUNGEON_KEY_SPOTS). Ma byc BARDZO
 * ladny i wyrazisty: pieczony klucz (zloto z blikiem — JEDYNY zloty element mapy, celowo:
 * czytelnosc "to jest TO") + pulsujaca zlota aura (2 pierscienie + poswiata) + iskierki
 * krazace + bob. Zebranie = zniknięcie z rozblyskiem (QueenSystem). Klasa A: 1 sprite +
 * 1 Graphics (aura), ~8 prymitywow/klatke.
 */

const GOLD = 0xffd54a, GOLD_DARK = 0xb8860b, GOLD_HI = 0xfff6c8;
const KEY_SCALE = 0.68;         // POLISH-2: klucz na mapie (bylo 1.0)
const KEY_CARRY_SCALE = 0.4;    // niesiony nad czolgiem (bylo 0.55)
let _tex: PIXI.Texture | null = null;

function bakeKey(): PIXI.Texture {
    const W = 84, H = 44;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    c.save(); c.translate(0, 0);
    // cien
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(W / 2 + 2, H / 2 + 6, 36, 8, 0, 0, Math.PI * 2); c.fill();
    const g = c.createLinearGradient(0, 6, 0, 36);
    g.addColorStop(0, '#fff1a8'); g.addColorStop(0.35, '#ffd54a'); g.addColorStop(0.7, '#e0a820'); g.addColorStop(1, '#8a5f08');
    // glowka (pierscien) z lewej
    c.strokeStyle = g; c.lineWidth = 8; c.lineCap = 'round';
    c.beginPath(); c.arc(18, 22, 11, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#8a5f08'; c.beginPath(); c.arc(18, 22, 4, 0, Math.PI * 2); c.fill();
    // trzon
    c.beginPath(); c.moveTo(29, 22); c.lineTo(74, 22); c.stroke();
    // zeby
    c.lineWidth = 7;
    c.beginPath(); c.moveTo(56, 22); c.lineTo(56, 34); c.moveTo(66, 22); c.lineTo(66, 36); c.moveTo(74, 22); c.lineTo(74, 30); c.stroke();
    // blik
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(30, 19); c.lineTo(70, 19); c.stroke();
    c.beginPath(); c.arc(18, 22, 11, Math.PI * 1.15, Math.PI * 1.6); c.stroke();
    // ornament w glowce (rubinowe oczko — para z Krolowa)
    c.fillStyle = '#ff5fb0'; c.beginPath(); c.arc(18, 11, 2.6, 0, Math.PI * 2); c.fill();
    c.restore();
    return PIXI.Texture.from(cv);
}

export class GoldenKey {
    public readonly x: number;
    public readonly y: number;
    public taken = false;
    private readonly container: PIXI.Container;
    private readonly sprite: PIXI.Sprite;
    private readonly aura: PIXI.Graphics;
    private t = 0;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x; this.y = y;
        this.container = new PIXI.Container();
        this.aura = new PIXI.Graphics();
        this.sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
        this.container.addChild(this.aura, this.sprite);
        this.container.x = x; this.container.y = y;
        this.container.zIndex = 9000; // nad propami — klucz ma byc WIDOCZNY
        worldContainer.addChild(this.container);
        if (!_tex) _tex = bakeKey();
        this.sprite.texture = _tex;
        this.sprite.anchor.set(0.5);
        this.container.scale.set(KEY_SCALE); // POLISH-2 (Mariusz): klucz mniejszy
    }

    private carried = false;

    /** Q6: klucz "niesiony" — leci nad czolgiem gracza (gracz WIDZI, ze ma klucz). */
    public follow(px: number, py: number): void {
        if (!this.carried) { this.carried = true; this.container.visible = true; this.container.scale.set(KEY_CARRY_SCALE); this.sprite.rotation = -0.5; }
        this.container.x = px + 34; this.container.y = py - 40;
    }
    /** Zuzyty w drzwiach — znika na dobre. */
    public consume(): void { this.carried = false; this.container.visible = false; }

    public update(delta: number): void {
        if (this.taken && !this.carried) return;
        this.t += delta / 60;
        const p = 0.5 + 0.5 * Math.sin(this.t * 3.2);
        this.sprite.y = Math.sin(this.t * 2.1) * 5;
        if (!this.carried) this.sprite.rotation = Math.sin(this.t * 1.3) * 0.14;
        const a = this.aura; a.clear();
        // poswiata + 2 pulsujace pierscienie + 4 iskierki krazace
        a.beginFill(GOLD, 0.16 + 0.1 * p); a.drawCircle(0, 0, 46 + 8 * p); a.endFill();
        a.beginFill(GOLD_HI, 0.12); a.drawCircle(0, 0, 26); a.endFill();
        const r1 = 34 + ((this.t * 40) % 30), r2 = 34 + ((this.t * 40 + 15) % 30);
        a.lineStyle(3, GOLD, 0.9 * (1 - (r1 - 34) / 30)); a.drawCircle(0, 0, r1);
        a.lineStyle(2, GOLD_HI, 0.8 * (1 - (r2 - 34) / 30)); a.drawCircle(0, 0, r2);
        a.lineStyle(0);
        a.beginFill(GOLD_HI, 0.95);
        for (let i = 0; i < 4; i++) { const ang = this.t * 2.4 + i * 1.57; a.drawCircle(Math.cos(ang) * 38, Math.sin(ang) * 22 - 4, 2.5 + 1.5 * Math.sin(this.t * 6 + i)); }
        a.endFill();
    }

    /** Q6 tutorial: klucz wraca na swoje miejsce. */
    public reset(): void {
        this.taken = false; this.carried = false;
        this.container.scale.set(KEY_SCALE); this.container.x = this.x; this.container.y = this.y; this.container.visible = true;
    }

    /** Zebrany: znika (QueenSystem robi rozblysk/baner). */
    public take(): void { this.taken = true; this.container.visible = false; }

    public destroy(): void { this.container.destroy({ children: true }); }
}

export const KEY_COLOR = GOLD;
export const KEY_COLOR_DARK = GOLD_DARK;
