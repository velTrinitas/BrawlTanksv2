import * as PIXI from 'pixi.js';
import { simNowMs } from '../systems/SimClock';

/**
 * NickSpray — v0.246.0 (Mariusz 2026-10-11): klawisz R maluje sprayem NICK gracza na podlodze. Efekt FUN:
 * tylko wizual, lokalny (zero wplywu na symulacje / koop), za flaga SPRAY_LIVE (`?spray=1`).
 *
 * Zasady: 1 napis na gracza, cooldown 60 s, napis zyje 60 s (ostatnie 5 s blaknie). Tylko na PODLODZE — caller
 * podaje `isBlocked(x, y)` (budynki, woda, lawa, strefy); probujemy 5 punktow prostokata napisu.
 *
 * Art: Canvas 2D bake RAZ na (nick, kolor) — mgielka (shadowBlur), wypelnienie z gradientem, ciemny kontur,
 * zacieki z kropla na koncu, drobinki rozprysku. Rozrzut deterministyczny z hasha nicku (ten sam nick = ten sam
 * "podpis"). Wejscie: maska odslania napis od lewej przez 0,4 s ("malowanie"). zIndex 9 = jak scorch (podloga,
 * pod wszystkim, co Y-sortowane).
 */

export const SPRAY_COOLDOWN_MS = 60_000;
export const SPRAY_LIFETIME_MS = 60_000;
const FADE_MS = 5_000;
const REVEAL_MS = 400;
const BAKE_SCALE = 2;          // ostre krawedzie przy DPR 2 (mobile)
const FONT_PX = 24; // v0.246.1: -50%, v0.246.3: +20% (Mariusz)

export type SprayResult = 'ok' | 'cooldown' | 'blocked' | 'empty';

const TEX_CACHE = new Map<string, { tex: PIXI.Texture; w: number; h: number }>();

/** Prosty deterministyczny generator (mulberry32) z hasha tekstu — tylko do artu. */
function rngFrom(text: string): () => number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    let a = h >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shade(hex: string, k: number): string {
    const n = parseInt(hex.replace('#', ''), 16);
    const f = (c: number): number => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function bakeSpray(nick: string, color: string): { tex: PIXI.Texture; w: number; h: number } {
    const key = `${nick}|${color}|v2`;
    const hit = TEX_CACHE.get(key);
    if (hit) return hit;
    const rnd = rngFrom(nick);
    const font = `${FONT_PX}px "Titan One", system-ui, sans-serif`;
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = font;
    // v0.246.1 GRAFFITI "bubble tag": kazda litera osobno — obrot +-10 st, skala +-12%, przesuniecie w pionie,
    // lekkie nachodzenie liter (ciasny tag). Szerokosc liczona z tych samych parametrow co rysowanie.
    const letters = [...nick].map((ch) => ({ ch, w: probe.measureText(ch).width, rot: (rnd() - 0.5) * 0.35, sc: 0.9 + rnd() * 0.24, dy: (rnd() - 0.5) * FONT_PX * 0.22 }));
    const textW = Math.ceil(letters.reduce((acc, l) => acc + l.w * l.sc * 0.9, 0));
    const PADX = 22, PADT = 16, PADB = 26;
    const w = textW + PADX * 2, h = FONT_PX + PADT + PADB;
    const cv = document.createElement('canvas');
    cv.width = w * BAKE_SCALE; cv.height = h * BAKE_SCALE;
    const c = cv.getContext('2d')!;
    c.scale(BAKE_SCALE, BAKE_SCALE);
    c.font = font;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const baseY = PADT + FONT_PX * 0.82;
    const eachLetter = (fn: (l: typeof letters[number], cx: number, cy: number) => void): void => {
        let x = PADX;
        for (const l of letters) {
            const lw = l.w * l.sc * 0.9;
            c.save(); c.translate(x + lw / 2, baseY + l.dy); c.rotate(l.rot); c.scale(l.sc, l.sc);
            fn(l, 0, 0);
            c.restore();
            x += lw;
        }
    };

    // 1. Halo rozprysku (spray "mgla" wokol calego tagu) + drobinki x2
    for (let i = 0; i < 140; i++) {
        const px = PADX - 8 + rnd() * (textW + 16), py = PADT - 6 + rnd() * (FONT_PX + 14);
        c.globalAlpha = 0.15 + rnd() * 0.45; c.fillStyle = color;
        c.beginPath(); c.arc(px, py, 0.4 + rnd() * 1.2, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    // 2. GLOW: dwie warstwy poswiaty w kolorze czolgu (szeroka + ostra)
    for (const [blur, alpha] of [[16, 0.55], [7, 0.75]] as const) {
        c.save(); c.shadowColor = color; c.shadowBlur = blur; c.globalAlpha = alpha; c.fillStyle = color;
        eachLetter((l) => c.fillText(l.ch, 0, 0));
        c.restore();
    }
    // 3. Zacieki 4-7 (gradient + kropla)
    const drips = 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < drips; i++) {
        const dx = PADX + 4 + rnd() * (textW - 8), top = baseY - 3, len = 6 + rnd() * 16;
        const g = c.createLinearGradient(0, top, 0, top + len);
        g.addColorStop(0, color); g.addColorStop(1, shade(color, -0.3));
        c.fillStyle = g; c.beginPath(); c.roundRect(dx - 1.1, top, 2.2, len, 1.1); c.fill();
        c.beginPath(); c.arc(dx, top + len, 2, 0, Math.PI * 2); c.fill();
    }
    // 4. Podwojny kontur (czarny zewn. + jasny wewn.) i wypelnienie gradientem — klasyczny bubble tag
    c.lineJoin = 'round';
    eachLetter((l) => { c.lineWidth = 6; c.strokeStyle = 'rgba(10,10,14,0.9)'; c.strokeText(l.ch, 0, 0); });
    eachLetter((l) => { c.lineWidth = 2.6; c.strokeStyle = 'rgba(255,255,255,0.92)'; c.strokeText(l.ch, 0, 0); });
    eachLetter((l) => {
        const fill = c.createLinearGradient(0, -FONT_PX * 0.8, 0, 0);
        fill.addColorStop(0, shade(color, 0.55)); fill.addColorStop(0.5, color); fill.addColorStop(1, shade(color, -0.35));
        c.fillStyle = fill; c.fillText(l.ch, 0, 0);
    });
    // 5. Gwiazdki-bliki na 2 literach
    for (let i = 0; i < Math.min(2, letters.length); i++) {
        const sx = PADX + rnd() * textW, sy = PADT + rnd() * FONT_PX * 0.5;
        c.fillStyle = '#ffffff'; c.globalAlpha = 0.95;
        c.beginPath(); c.moveTo(sx, sy - 4); c.lineTo(sx + 1, sy - 1); c.lineTo(sx + 4, sy); c.lineTo(sx + 1, sy + 1); c.lineTo(sx, sy + 4); c.lineTo(sx - 1, sy + 1); c.lineTo(sx - 4, sy); c.lineTo(sx - 1, sy - 1); c.closePath(); c.fill();
        c.globalAlpha = 1;
    }

    const res = { tex: PIXI.Texture.from(cv), w, h };
    TEX_CACHE.set(key, res);
    return res;
}

export class NickSpray {
    private readonly world: PIXI.Container;
    private container: PIXI.Container | null = null;
    private sprite: PIXI.Sprite | null = null;
    private mask: PIXI.Graphics | null = null;
    private bornAt = 0;
    private lastSprayAt = -Infinity;
    private texW = 0;
    private texH = 0;

    constructor(worldContainer: PIXI.Container) {
        this.world = worldContainer;
    }

    /** Ile ms do nastepnego sprayu (0 = gotowe). */
    cooldownLeftMs(): number {
        return Math.max(0, this.lastSprayAt + SPRAY_COOLDOWN_MS - simNowMs());
    }

    /**
     * Maluje nick na podlodze w punkcie (x, y) — srodek napisu. Zwraca powod odmowy, gdy sie nie da.
     * `isBlocked` = budynek / woda / lawa / strefa — sprawdzamy srodek i 4 rogi prostokata napisu.
     */
    tryPaint(x: number, y: number, nick: string, color: string, isBlocked: (x: number, y: number) => boolean): SprayResult {
        const name = nick.trim();
        if (!name) return 'empty';
        if (this.cooldownLeftMs() > 0) return 'cooldown';
        const baked = bakeSpray(name, color);
        const hw = baked.w * 0.42, hh = baked.h * 0.32; // rdzen napisu (bez marginesu mgielki)
        for (const [px, py] of [[x, y], [x - hw, y - hh], [x + hw, y - hh], [x - hw, y + hh], [x + hw, y + hh]]) {
            if (isBlocked(px, py)) return 'blocked';
        }
        this.clear();
        const rnd = rngFrom(name + Math.round(x) + Math.round(y));
        const cont = new PIXI.Container();
        cont.position.set(x, y);
        cont.rotation = (rnd() - 0.5) * 0.28; // +-8 st — reka grafficiarza, nie maszyna
        cont.zIndex = 9;
        const spr = new PIXI.Sprite(baked.tex);
        spr.anchor.set(0.5);
        spr.scale.set(1 / BAKE_SCALE);
        const mask = new PIXI.Graphics();
        cont.addChild(spr, mask);
        spr.mask = mask;
        this.world.addChild(cont);
        this.container = cont; this.sprite = spr; this.mask = mask;
        this.texW = baked.w; this.texH = baked.h;
        this.bornAt = simNowMs();
        this.lastSprayAt = this.bornAt;
        this.drawMask(0);
        return 'ok';
    }

    /** Co klatke: odslanianie (malowanie), blakniecie, usuniecie po czasie zycia. */
    update(): void {
        if (!this.container || !this.sprite) return;
        const age = simNowMs() - this.bornAt;
        if (age < REVEAL_MS) this.drawMask(age / REVEAL_MS);
        else if (this.sprite.mask) { this.sprite.mask = null; this.mask?.destroy(); this.mask = null; }
        const left = SPRAY_LIFETIME_MS - age;
        if (left <= 0) { this.clear(); return; }
        this.container.alpha = left < FADE_MS ? left / FADE_MS : 1;
    }

    private drawMask(p: number): void {
        if (!this.mask) return;
        const w = this.texW, h = this.texH;
        this.mask.clear();
        this.mask.beginFill(0xffffff);
        this.mask.drawRect(-w / 2, -h / 2, w * Math.max(0.02, p), h);
        this.mask.endFill();
    }

    clear(): void {
        if (this.container) {
            if (this.container.parent) this.container.parent.removeChild(this.container);
            this.container.destroy({ children: true, texture: false, baseTexture: false });
        }
        this.container = null; this.sprite = null; this.mask = null;
    }

    destroy(): void { this.clear(); }
}
