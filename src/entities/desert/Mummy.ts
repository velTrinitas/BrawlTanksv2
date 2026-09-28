import * as PIXI from 'pixi.js';
import { bakeToSprite } from '../../maps/propBaker';
import { DESERT_CURSE } from '../../config/desertCurse';

/**
 * Mummy — DESERT ART v2 / E4. Mumia klatwy piramidy: idzie z rekami przed soba, wolno,
 * prowadzi stado skarabeuszy. Zestrzeliwalna (300 HP) — zabicie zdejmuje klatwe.
 *
 * Stan (x, y, hp) zmienia sie WYLACZNIE w `step()` wolanym z petli logiki (staly krok).
 * Ruch przechodzi przez `resolve` (kolizja z przeszkodami) — mumia NIE wchodzi na piramidy,
 * skaly ani rzeke (uwaga Mariusza 2026-09-28).
 *
 * Art (poprawka 2026-09-28): +50% (DESERT_CURSE.mummyScale) i fake-3D — tulow i konczyny
 * cieniowane jak walce (swiatlo NW / cien SE), glowa jak kula, bandaze jako luki
 * owijajace bryle, dlugi cien SE. 4 klatki chodu pieczone raz (cache propBaker).
 */

const FRAMES = 4;
let _frames: PIXI.Texture[] | null = null;
let _anchor = { x: 0.5, y: 1 };

const C_LIGHT = 0xf4ecd6;
const C_MID = 0xd8ccaa;
const C_DARK = 0x9a8c68;
const C_DEEP = 0x5e5238;

/** Walec (konczyna/tulow) z gory-z boku: jasny pas NW, ciemny pas SE. */
function cylinder(g: PIXI.Graphics, x: number, y: number, w: number, h: number, r: number): void {
    g.beginFill(C_DARK);
    g.drawRoundedRect(x, y, w, h, r);
    g.endFill();
    g.beginFill(C_MID);
    g.drawRoundedRect(x, y, w * 0.72, h, r);
    g.endFill();
    g.beginFill(C_LIGHT);
    g.drawRoundedRect(x + w * 0.1, y + 1, w * 0.28, h - 2, r * 0.6);
    g.endFill();
}

function drawFrame(g: PIXI.Graphics, f: number): void {
    const swing = [-1, 0, 1, 0][f];
    const bob = f % 2 === 0 ? 0 : -1;
    // Dlugi cien SE (slonce NW — wspolne dla mapy)
    g.beginFill(0x000000, 0.28);
    g.drawEllipse(7, 1, 17, 5);
    g.endFill();
    g.beginFill(0x000000, 0.12);
    g.drawEllipse(14, 3, 14, 4);
    g.endFill();
    // Noga tylna (ciemniejsza = dalej)
    g.lineStyle(5.5, C_DARK, 1);
    g.moveTo(3, -15 + bob); g.lineTo(3 - swing * 4, -1);
    g.lineStyle(0);
    g.beginFill(C_DEEP);
    g.drawEllipse(3 - swing * 4 + 1, -1, 3.5, 2);
    g.endFill();
    // Tulow (walec) + bandaze jako luki
    cylinder(g, -8, -36 + bob, 17, 23, 7);
    g.lineStyle(1.3, C_DEEP, 0.55);
    for (let k = 0; k < 5; k++) {
        const y = -33 + bob + k * 4.4;
        g.moveTo(-8, y + (k % 2 ? 1.6 : 0));
        g.quadraticCurveTo(0.5, y + 3 + (k % 2 ? 0 : 1), 9, y + (k % 2 ? 0 : 1.6));
    }
    g.lineStyle(1, 0xffffff, 0.35);
    g.moveTo(-6, -31 + bob); g.lineTo(-5, -16 + bob);
    g.lineStyle(0);
    // Noga przednia
    g.lineStyle(6, C_MID, 1);
    g.moveTo(-2, -15 + bob); g.lineTo(-2 + swing * 4, -1);
    g.lineStyle(2, C_LIGHT, 0.8);
    g.moveTo(-3.5, -14 + bob); g.lineTo(-3.5 + swing * 4, -2);
    g.lineStyle(0);
    g.beginFill(C_DEEP);
    g.drawEllipse(-2 + swing * 4 + 1, -1, 3.8, 2.2);
    g.endFill();
    // Ramie tylne (ciemniejsze) i przednie wyciagniete w prawo
    g.beginFill(C_DARK);
    g.drawRoundedRect(4, -26 + bob - swing * 0.8, 17, 5, 2.5);
    g.endFill();
    cylinder(g, 3, -32 + bob + swing * 0.8, 18, 6, 3);
    g.beginFill(C_DEEP, 0.7);                      // dlonie
    g.drawEllipse(21, -29 + bob + swing * 0.8, 2.6, 2.4);
    g.endFill();
    // Luzny bandaz zwisajacy z ramienia
    g.lineStyle(1.6, C_LIGHT, 0.95);
    g.moveTo(13, -26 + bob); g.quadraticCurveTo(15, -19, 12 + swing * 2, -13);
    g.lineStyle(0);
    // Glowa (kula: baza, cien SE, blik NW) + bandaze
    g.beginFill(C_DARK);
    g.drawCircle(1.5, -42 + bob, 7.5);
    g.endFill();
    g.beginFill(C_MID);
    g.drawCircle(0.5, -43 + bob, 6.6);
    g.endFill();
    g.beginFill(C_LIGHT);
    g.drawCircle(-1.5, -45 + bob, 3.2);
    g.endFill();
    g.lineStyle(1.2, C_DEEP, 0.6);
    g.moveTo(-6, -45 + bob); g.quadraticCurveTo(1, -43 + bob, 8, -44 + bob);
    g.moveTo(-6, -40 + bob); g.quadraticCurveTo(1, -38 + bob, 8, -40 + bob);
    g.lineStyle(0);
    // Szpara oczu swiecaca na zielono (sygnal „to jest wrog")
    g.beginFill(0x1a2a10);
    g.drawRoundedRect(1, -44.5 + bob, 7, 3.2, 1.5);
    g.endFill();
    g.beginFill(0x8dff5a);
    g.drawCircle(3.2, -43 + bob, 1.3);
    g.drawCircle(6.2, -43 + bob, 1.2);
    g.endFill();
}

function getFrames(): PIXI.Texture[] | null {
    if (_frames && _frames.every(t => !t.destroyed)) return _frames;
    const out: PIXI.Texture[] = [];
    for (let f = 0; f < FRAMES; f++) {
        const wrap = new PIXI.Container();
        const g = new PIXI.Graphics();
        g.scale.set(DESERT_CURSE.mummyScale);  // skala W PIECZENIU = ostre krawedzie
        wrap.addChild(g);
        g.beginFill(0x000000, 0.001);           // stala ramka dla wszystkich klatek
        g.drawRect(-18, -54, 50, 60);
        g.endFill();
        drawFrame(g, f);
        const spr = bakeToSprite(wrap, `curse_mummy_v2:${f}`);
        wrap.destroy({ children: true });
        if (!spr) return null;
        _anchor = { x: spr.anchor.x, y: spr.anchor.y };
        out.push(spr.texture);
    }
    _frames = out;
    return out;
}

export type Resolver = (x: number, y: number, r: number) => { x: number; y: number };

export class Mummy {
    public x: number;
    public y: number;
    public hp: number = DESERT_CURSE.mummyHp;
    public alive = true;

    private container: PIXI.Container;
    private sprite: PIXI.Sprite;
    private body: PIXI.Container;
    private hpBar: PIXI.Graphics;
    private walk = 0;
    private flashSteps = 0;
    /** Wijace sie bandaze (uwaga Mariusza) — zywe, 3 pasma; tylko wizual. */
    private bandages: PIXI.Graphics;
    private wave = 0;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;
        // PIXI init w pierwszym bloku
        this.container = new PIXI.Container();
        this.body = new PIXI.Container();
        this.hpBar = new PIXI.Graphics();
        this.bandages = new PIXI.Graphics();
        const frames = getFrames();
        this.sprite = new PIXI.Sprite(frames ? frames[0] : PIXI.Texture.EMPTY);
        this.sprite.anchor.set(_anchor.x, _anchor.y);
        this.body.addChild(this.sprite);
        this.body.addChild(this.bandages);   // w `body` => odwracaja sie razem z mumia
        this.container.addChild(this.body);
        this.container.addChild(this.hpBar);
        worldContainer.addChild(this.container);
        if (!frames) console.error('[Mummy] brak renderera do pieczenia', { x, y });
        this.sync();
    }

    /** Krok logiki: idz do celu (gracz albo dom), z kolizja przeszkod. */
    public step(tx: number, ty: number, resolve: Resolver): void {
        if (!this.alive) return;
        this.wave++;
        const dx = tx - this.x, dy = ty - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 4) {
            const p = resolve(
                this.x + (dx / d) * DESERT_CURSE.mummySpeed,
                this.y + (dy / d) * DESERT_CURSE.mummySpeed,
                DESERT_CURSE.mummyBodyRadius,
            );
            this.x = p.x;
            this.y = p.y;
            this.walk++;
            if (Math.abs(dx) > 2) this.body.scale.x = dx < 0 ? -1 : 1;
        }
        if (this.flashSteps > 0) this.flashSteps--;
        this.sync();
    }

    /** Zwraca true, gdy mumia padla. */
    public hit(dmg: number): boolean {
        if (!this.alive) return false;
        this.hp -= dmg;
        this.flashSteps = 6;
        if (this.hp <= 0) {
            this.alive = false;
            this.container.visible = false;
            return true;
        }
        return false;
    }

    private sync(): void {
        this.container.x = this.x;
        this.container.y = this.y;
        this.container.zIndex = this.y + 20;
        const frames = _frames;
        if (frames) this.sprite.texture = frames[Math.floor(this.walk / 8) % FRAMES];
        this.sprite.tint = this.flashSteps > 0 ? 0xff8080 : 0xffffff;
        this.drawBandages();
        // Pasek HP nad glowa (czytelnosc: widac, ile jeszcze)
        const g = this.hpBar;
        g.clear();
        const k = Math.max(0, this.hp / DESERT_CURSE.mummyHp);
        const top = -56 * DESERT_CURSE.mummyScale - 8;
        g.beginFill(0x000000, 0.55);
        g.drawRoundedRect(-22, top, 44, 7, 3.5);
        g.endFill();
        g.beginFill(0x8dff5a);
        g.drawRoundedRect(-21, top + 1, 42 * k, 5, 2.5);
        g.endFill();
    }

    /**
     * 3 pasma bandazy powiewajace ZA mumia (w lewo, bo art patrzy w prawo): fala sinusowa
     * biegnaca od zaczepu ku koncowi, amplituda rosnie ku koncowi, pasmo zweza sie.
     * Cien pod pasmem = fake-3D. Koszt: 1 Graphics, ~18 odcinkow na klatke.
     */
    private drawBandages(): void {
        const g = this.bandages;
        g.clear();
        const s = DESERT_CURSE.mummyScale;
        const t = this.wave * 0.18;
        const strands: [number, number, number, number][] = [
            // [zaczep x, zaczep y, dlugosc, faza]
            [-6, -44, 22, 0],     // tyl glowy
            [-8, -22, 18, 2.1],   // pas
            [8, -27, 16, 4.2],    // ramie (luzny koniec)
        ];
        for (const [ax, ay, len, ph] of strands) {
            const SEG = 6;
            let px = ax * s, py = ay * s;
            for (let i = 1; i <= SEG; i++) {
                const k = i / SEG;
                const nx = (ax - len * k) * s;
                const ny = (ay + k * 6 + Math.sin(t - k * 3.2 + ph) * (1 + k * 4)) * s;
                const w = (3.2 - k * 2) * s;
                g.lineStyle(w + 1.2, 0x5e5238, 0.35);          // cien pasma
                g.moveTo(px + 1, py + 1.5); g.lineTo(nx + 1, ny + 1.5);
                g.lineStyle(w, k < 0.5 ? 0xe6dcc0 : 0xf4ecd6, 1);
                g.moveTo(px, py); g.lineTo(nx, ny);
                px = nx; py = ny;
            }
        }
        g.lineStyle(0);
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
