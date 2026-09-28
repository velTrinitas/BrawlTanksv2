import * as PIXI from 'pixi.js';
import { bakeToSprite } from '../../maps/propBaker';

/**
 * Archaeologist — DESERT ART v2 / E7 (uwaga Mariusza 2026-09-28). Grupa 2-3 archeologow
 * wybiega z piramidy za rzeka po ostrzale, wygraza graczowi, krzyczy (dymki z
 * „ocenzurowanymi przeklenstwami" #@$%!) i wraca do srodka. NIEGROZNI, niestrzelalni —
 * czysty flex / humor (wlasciwie reakcja swiata na gracza: Sensoryka).
 *
 * Realistyczne proporcje czlowieka (glowa ~1/7 wzrostu), wzrost jak mumia x1.5 (~80 px):
 * helm korkowy, koszula khaki z kieszeniami, spodnie, wysokie buty, rekwizyt per osoba
 * (lampa naftowa / pedzel i notes / lopatka). Cieniowanie walcowe jak mumia (slonce NW).
 * 4 klatki chodu + 2 klatki wygrazania, pieczone raz na wariant (cache propBaker).
 * Stan tylko wizualny (nie wplywa na symulacje) — kroki liczone lokalnie.
 */

const SCALE = 1.3;   // uwaga Mariusza: nizsi o ~13% (bylo 1.5 = wzrost mumii)
const WALK = 4;
const SHOUT = 2;

const SKIN = [0xe8b890, 0xc88a60, 0x9a6440];
const SHIRT = [0xc8b27a, 0xb8a070, 0xd4c08a];
const PANTS = [0x7a6a4a, 0x5e5a48, 0x8a7654];

const _tex = new Map<string, PIXI.Texture>();
let _anchor = { x: 0.5, y: 1 };

function shade(c: number, k: number): number {
    const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 0xff) * k)));
    const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 0xff) * k)));
    const b = Math.min(255, Math.max(0, Math.round((c & 0xff) * k)));
    return (r << 16) | (g << 8) | b;
}

/** Konczyna jako walec (jasny pas NW, ciemny SE). */
function limb(g: PIXI.Graphics, x1: number, y1: number, x2: number, y2: number, w: number, c: number): void {
    g.lineStyle(w, shade(c, 0.78), 1); g.moveTo(x1 + 0.6, y1); g.lineTo(x2 + 0.6, y2);
    g.lineStyle(w * 0.7, c, 1); g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.lineStyle(w * 0.25, shade(c, 1.2), 0.9); g.moveTo(x1 - w * 0.2, y1); g.lineTo(x2 - w * 0.2, y2);
    g.lineStyle(0);
}

function drawPerson(g: PIXI.Graphics, v: number, pose: 'walk' | 'shout', f: number): void {
    const skin = SKIN[v % 3], shirt = SHIRT[v % 3], pants = PANTS[v % 3];
    const sw = pose === 'walk' ? [-1, 0, 1, 0][f] : 0;
    const bob = pose === 'walk' && f % 2 === 1 ? -0.8 : 0;
    // cien SE
    g.beginFill(0x000000, 0.26); g.drawEllipse(6, 0.5, 13, 4); g.endFill();
    // nogi (tylna ciemniejsza) + buty
    limb(g, 2, -24 + bob, 2 - sw * 4, -3, 5, shade(pants, 0.8));
    limb(g, -2, -24 + bob, -2 + sw * 4, -3, 5.5, pants);
    g.beginFill(0x3a2410);
    g.drawRoundedRect(2 - sw * 4 - 2, -6, 6, 6, 2);
    g.drawRoundedRect(-2 + sw * 4 - 2.5, -6, 6.5, 6, 2);
    g.endFill();
    // tulow (koszula khaki) — walec + kieszenie + pasek
    g.beginFill(shade(shirt, 0.78)); g.drawRoundedRect(-6.5, -41 + bob, 13, 18, 4); g.endFill();
    g.beginFill(shirt); g.drawRoundedRect(-6.5, -41 + bob, 9.5, 18, 4); g.endFill();
    g.beginFill(shade(shirt, 1.15)); g.drawRoundedRect(-5.5, -40 + bob, 3, 16, 2); g.endFill();
    g.lineStyle(0.8, shade(shirt, 0.6), 0.9);
    g.drawRect(-4.5, -37 + bob, 3.5, 3); g.drawRect(1, -37 + bob, 3.5, 3);
    g.moveTo(0, -41 + bob); g.lineTo(0, -24 + bob);
    g.lineStyle(0);
    g.beginFill(0x4a2e14); g.drawRect(-6.5, -25 + bob, 13, 2.2); g.endFill();
    g.beginFill(0xc8a040); g.drawRect(-1, -25 + bob, 2, 2.2); g.endFill();
    // rece: chod = wymach, krzyk = piesc w gorze (f=0) / obie w gorze (f=1)
    if (pose === 'walk') {
        limb(g, 5, -39 + bob, 6 + sw * 3, -27, 3.6, shirt);
        limb(g, -5, -39 + bob, -6 - sw * 3, -27, 3.8, shirt);
        g.beginFill(skin); g.drawCircle(6 + sw * 3, -26, 1.9); g.drawCircle(-6 - sw * 3, -26, 1.9); g.endFill();
    } else {
        const up = f === 0 ? -52 : -54;
        limb(g, 5, -39, 9, up, 3.6, shirt);
        g.beginFill(skin); g.drawCircle(9, up - 1.5, 2.3); g.endFill();                  // piesc
        if (f === 1) { limb(g, -5, -39, -9, up + 1, 3.8, shirt); g.beginFill(skin); g.drawCircle(-9, up - 0.5, 2.3); g.endFill(); }
        else { limb(g, -5, -39, -8, -28, 3.8, shirt); }
    }
    // rekwizyt
    if (pose === 'walk' || f === 0) {
        const hx = pose === 'walk' ? -6 - sw * 3 : -8, hy = pose === 'walk' ? -26 : -28;
        if (v % 3 === 0) {          // lampa naftowa
            g.lineStyle(0.8, 0x2a2a2a, 1); g.moveTo(hx, hy); g.lineTo(hx, hy + 3); g.lineStyle(0);
            g.beginFill(0x8a6a2a); g.drawRoundedRect(hx - 2.2, hy + 3, 4.4, 5.5, 1.2); g.endFill();
            g.beginFill(0xffd070, 0.9); g.drawRect(hx - 1.2, hy + 4, 2.4, 3); g.endFill();
        } else if (v % 3 === 1) {   // notes
            g.beginFill(0x7a2a1a); g.drawRect(hx - 3, hy - 1, 5, 6.5); g.endFill();
            g.beginFill(0xf0e8d0); g.drawRect(hx - 2.4, hy - 0.4, 3.8, 5.3); g.endFill();
        } else {                    // lopatka archeologiczna
            g.lineStyle(1.2, 0x5a3a1c, 1); g.moveTo(hx, hy); g.lineTo(hx, hy + 5); g.lineStyle(0);
            g.beginFill(0xa0a8b0); g.drawPolygon([hx - 2.2, hy + 5, hx + 2.2, hy + 5, hx, hy + 10]); g.endFill();
        }
    }
    // szyja + glowa (kula) + twarz
    g.beginFill(shade(skin, 0.85)); g.drawRect(-1.8, -44 + bob, 3.6, 4); g.endFill();
    g.beginFill(shade(skin, 0.8)); g.drawCircle(0.6, -48.5 + bob, 5.2); g.endFill();
    g.beginFill(skin); g.drawCircle(0, -49 + bob, 4.6); g.endFill();
    g.beginFill(shade(skin, 1.12)); g.drawCircle(-1.5, -50.5 + bob, 2); g.endFill();
    g.beginFill(0x1a1a1a); g.drawCircle(2, -49.5 + bob, 0.7); g.endFill();          // oko (profil w prawo)
    if (v % 3 === 2) { g.beginFill(0x4a3020); g.drawEllipse(1.5, -45.8 + bob, 2.6, 1.2); g.endFill(); } // wasy
    if (pose === 'shout') {                                                            // otwarte usta
        g.beginFill(0x3a0a0a); g.drawEllipse(3, -46.5, 1.4, 1.8); g.endFill();
        g.lineStyle(1, 0x3a2410, 1); g.moveTo(0.5, -52.3); g.lineTo(3.5, -51.3); g.lineStyle(0); // zmarszczona brew
    }
    // helm korkowy (pith helmet): rondo + kopula + opaska
    g.beginFill(0x000000, 0.2); g.drawEllipse(1, -52 + bob, 8.5, 2.4); g.endFill();
    g.beginFill(0xe4dcc0); g.drawEllipse(0, -53 + bob, 8.2, 2.2); g.endFill();
    g.beginFill(0xd8ceb0); g.drawEllipse(0.5, -56 + bob, 5.4, 4.2); g.endFill();
    g.beginFill(0xf4eed8); g.drawEllipse(-1.2, -57.5 + bob, 2.4, 2); g.endFill();
    g.beginFill(0x8a6a3a); g.drawRect(-5, -54.6 + bob, 10.8, 1.4); g.endFill();
}

function frame(v: number, pose: 'walk' | 'shout', f: number): PIXI.Texture | null {
    const key = `${v % 3}:${pose}:${f}`;
    const hit = _tex.get(key);
    if (hit && !hit.destroyed) return hit;
    const wrap = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.scale.set(SCALE);
    wrap.addChild(g);
    g.beginFill(0x000000, 0.001); g.drawRect(-16, -62, 34, 64); g.endFill();   // stala ramka
    drawPerson(g, v, pose, f);
    const spr = bakeToSprite(wrap, `archeo2:${key}`);
    wrap.destroy({ children: true });
    if (!spr) return null;
    _anchor = { x: spr.anchor.x, y: spr.anchor.y };
    _tex.set(key, spr.texture);
    return spr.texture;
}

/**
 * Archeolog NA STANOWISKU (uwaga Mariusza): kleczy w wykopie pochylony nad znaleziskiem
 * i kopie lopatka (2 klatki: lopatka w gorze / w ziemi). Ten sam styl i skala co grupa.
 */
function drawDigger(g: PIXI.Graphics, f: number): void {
    const skin = SKIN[1], shirt = SHIRT[0], pants = PANTS[1];
    const dn = f === 1 ? 3 : 0;                               // wychylenie przy uderzeniu
    g.beginFill(0x000000, 0.24); g.drawEllipse(5, 0.5, 14, 4); g.endFill();
    // noga kleczaca (udo poziomo, lydka na ziemi) + but
    limb(g, -2, -14, -10, -3, 5.5, pants);
    g.beginFill(0x3a2410); g.drawRoundedRect(-15, -5, 7, 5, 2); g.endFill();
    limb(g, 2, -14, 6, -2, 5.5, shade(pants, 0.85));
    g.beginFill(0x3a2410); g.drawRoundedRect(4, -5, 7, 5, 2); g.endFill();
    // tulow pochylony do przodu (w prawo)
    g.beginFill(shade(shirt, 0.78)); g.drawPolygon([-5, -14, 5, -14, 13 + dn, -30, 3 + dn, -33]); g.endFill();
    g.beginFill(shirt); g.drawPolygon([-5, -14, 1, -14, 8 + dn, -31, 3 + dn, -33]); g.endFill();
    g.beginFill(0x4a2e14); g.drawRect(-5, -16, 10, 2); g.endFill();
    // rece do lopatki
    const hx = 16 + dn, hy = f === 1 ? -8 : -18;
    limb(g, 8 + dn, -30, hx, hy, 3.6, shirt);
    g.beginFill(skin); g.drawCircle(hx, hy, 2); g.endFill();
    g.lineStyle(1.3, 0x5a3a1c, 1); g.moveTo(hx, hy); g.lineTo(hx + 3, hy + 5); g.lineStyle(0);
    g.beginFill(0xa0a8b0); g.drawPolygon([hx + 1, hy + 5, hx + 6, hy + 4, hx + 5, hy + 10]); g.endFill();
    // glowa + helm korkowy
    const gx = 9 + dn, gy = -38;
    g.beginFill(shade(skin, 0.8)); g.drawCircle(gx + 0.6, gy + 0.5, 5); g.endFill();
    g.beginFill(skin); g.drawCircle(gx, gy, 4.4); g.endFill();
    g.beginFill(0x1a1a1a); g.drawCircle(gx + 2, gy + 0.5, 0.7); g.endFill();
    g.beginFill(0xe4dcc0); g.drawEllipse(gx, gy - 4, 8, 2.1); g.endFill();
    g.beginFill(0xd8ceb0); g.drawEllipse(gx + 0.5, gy - 7, 5.2, 4); g.endFill();
    g.beginFill(0x8a6a3a); g.drawRect(gx - 4.8, gy - 5.6, 10.4, 1.3); g.endFill();
}

function diggerFrame(f: number): PIXI.Texture | null {
    const key = `digger:${f}`;
    const hit = _tex.get(key);
    if (hit && !hit.destroyed) return hit;
    const wrap = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.scale.set(SCALE);
    wrap.addChild(g);
    g.beginFill(0x000000, 0.001); g.drawRect(-18, -50, 44, 52); g.endFill();   // stala ramka
    drawDigger(g, f);
    const spr = bakeToSprite(wrap, `archeo2:${key}`);
    wrap.destroy({ children: true });
    if (!spr) return null;
    _tex.set(key, spr.texture);
    return spr.texture;
}

/** Archeolog kopiacy na stanowisku (lokalny wizual, co jakis czas odpoczywa). */
export class ArchaeologistDigger {
    private spr: PIXI.Sprite;
    private t = 0;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        const t0 = diggerFrame(0);
        this.spr = new PIXI.Sprite(t0 ?? PIXI.Texture.EMPTY);
        this.spr.anchor.set(0.5, 0.96);
        this.spr.x = x; this.spr.y = y;
        this.spr.zIndex = y + 10;
        worldContainer.addChild(this.spr);
    }

    update(): void {
        this.t++;
        const cycle = this.t % 400;
        // 5 s kopania (uderzenie co ~0.4 s), potem ~1.7 s przerwy nad znaleziskiem
        const f = cycle < 300 ? (Math.floor(cycle / 12) % 2) : 0;
        const tex = diggerFrame(f);
        if (tex) this.spr.texture = tex;
    }
}

/** Dymek z „ocenzurowanym przeklenstwem" (symbole, nie jezyk — bez i18n). */
const CURSES = ['#@$%!', '&*#@!!', '%$#&!', '@#!*%', '$%#@!?'];

export class ArchaeologistGroup {
    private people: { spr: PIXI.Sprite; x: number; y: number; ox: number; v: number }[] = [];
    private bubbles: { c: PIXI.Container; life: number }[] = [];
    private t = 0;
    private container: PIXI.Container;
    public done = false;

    /** Fazy (kroki): wyjscie 90, krzyk 300, powrot 90. */
    private static readonly OUT = 90;
    private static readonly SHOUT_STEPS = 300;
    private static readonly BACK = 90;

    constructor(private homeX: number, private homeY: number, count: number, worldContainer: PIXI.Container) {
        this.container = worldContainer;
        for (let i = 0; i < count; i++) {
            const t0 = frame(i, 'walk', 0);
            const spr = new PIXI.Sprite(t0 ?? PIXI.Texture.EMPTY);
            spr.anchor.set(_anchor.x, _anchor.y);
            spr.x = homeX; spr.y = homeY;
            spr.visible = false;
            worldContainer.addChild(spr);
            const ox = (i - (count - 1) / 2) * 34;
            this.people.push({ spr, x: homeX, y: homeY, ox, v: i });
        }
    }

    /** Krok animacji (lokalny wizual). `onShout` = dzwiek krzyku. */
    update(playerX: number | null, onShout: () => void): void {
        if (this.done) return;
        this.t++;
        const { OUT, SHOUT_STEPS, BACK } = ArchaeologistGroup;
        this.people.forEach((p, i) => {
            const delay = i * 12;
            const t = this.t - delay;
            if (t < 0) return;
            p.spr.visible = true;
            let pose: 'walk' | 'shout' = 'walk';
            let f = 0;
            const tx = this.homeX + p.ox, ty = this.homeY - 70 - (i % 2) * 14;
            if (t < OUT) {
                const k = t / OUT;
                p.x = this.homeX + (tx - this.homeX) * k;
                p.y = this.homeY + (ty - this.homeY) * k;
                f = Math.floor(t / 7) % WALK;
                p.spr.scale.x = tx >= this.homeX ? 1 : -1;
            } else if (t < OUT + SHOUT_STEPS) {
                pose = 'shout';
                f = Math.floor(t / 14) % SHOUT;
                p.x = tx + Math.sin(t * 0.9) * (f === 1 ? 1.2 : 0);   // podskakuje ze zlosci
                p.y = ty;
                if (playerX !== null) p.spr.scale.x = playerX >= p.x ? 1 : -1;   // wygraza graczowi
                if ((t - OUT) % 70 === 5 + i * 17) { this.bubble(p.x, p.y - 84, i + this.t); onShout(); }
            } else if (t < OUT + SHOUT_STEPS + BACK) {
                const k = (t - OUT - SHOUT_STEPS) / BACK;
                p.x = tx + (this.homeX - tx) * k;
                p.y = ty + (this.homeY - ty) * k;
                f = Math.floor(t / 7) % WALK;
                p.spr.scale.x = this.homeX >= tx ? 1 : -1;
                p.spr.alpha = k > 0.8 ? (1 - k) / 0.2 : 1;           // znika w ciemnym wejsciu
            } else {
                p.spr.visible = false;
            }
            const tex = frame(p.v, pose, f);
            if (tex) p.spr.texture = tex;
            p.spr.x = p.x; p.spr.y = p.y;
            p.spr.zIndex = p.y + 20;
        });
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            const b = this.bubbles[i];
            b.life--;
            b.c.y -= 0.35;
            b.c.alpha = Math.min(1, b.life / 20);
            if (b.life <= 0) { b.c.destroy({ children: true }); this.bubbles.splice(i, 1); }
        }
        if (this.t > OUT + SHOUT_STEPS + BACK + this.people.length * 12 && this.bubbles.length === 0) this.finish();
    }

    /** Chmurka-dymek z symbolami (jak w komiksie). */
    private bubble(x: number, y: number, seed: number): void {
        const c = new PIXI.Container();
        const txt = new PIXI.Text(CURSES[seed % CURSES.length], {
            fontFamily: 'Titan One', fontSize: 14, fill: 0xd02020, stroke: 0xffffff, strokeThickness: 2,
        });
        txt.anchor.set(0.5);
        const w = txt.width + 18, h = 26;
        const g = new PIXI.Graphics();
        g.beginFill(0x000000, 0.18); g.drawEllipse(2, 2, w / 2, h / 2); g.endFill();
        g.beginFill(0xffffff); g.drawEllipse(0, 0, w / 2, h / 2); g.endFill();
        g.beginFill(0xffffff); g.drawCircle(-w * 0.2, h / 2 + 4, 4); g.drawCircle(-w * 0.28, h / 2 + 10, 2.5); g.endFill();
        g.lineStyle(1.5, 0x333333, 0.8); g.drawEllipse(0, 0, w / 2, h / 2); g.lineStyle(0);
        c.addChild(g, txt);
        c.x = x; c.y = y;
        c.zIndex = 20001;
        this.container.addChild(c);
        this.bubbles.push({ c, life: 80 });
    }

    private finish(): void {
        this.done = true;
        for (const p of this.people) p.spr.destroy();
        this.people = [];
    }

    destroy(): void {
        this.finish();
        for (const b of this.bubbles) b.c.destroy({ children: true });
        this.bubbles = [];
    }
}
