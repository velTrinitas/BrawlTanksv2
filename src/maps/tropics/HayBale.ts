import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import { applyHitShake } from '../../rendering/hitShake';

/**
 * TROPICS ART v2 / T2 — BELA SIANA (zamiast skrzyni na Tropikach, prosba Mariusza 2026-10-03).
 *
 * Kontrakt 1:1 z `Crate` (te same pozycje z TROPICS_CRATES_LAYOUT, hitbox 36x36, HP 3, respawn
 * 60 s, padded proxy dla gracza, netState dla koopa) — zmienia sie TYLKO wyglad, dzwiek i efekt.
 *
 * Wyglad: okragla bela lezaca na boku w widoku 3/4 (walec: gradient od slonca NW, czolo ze spirala,
 * sznurki, zdzbla), pieczona RAZ jako wspolna tekstura (2 warianty, lustrzane odbicie) — w meczu
 * kazda bela to 1 sprite + cien. Rozbicie: deszcz zdzbel (pula w Effects) + kleby + dzwiek siana.
 */
/** v0.2xx (Mariusz): bele +25% — wizual I hitbox razem (Czytelnosc: hitbox = obrazek). */
const BALE_SCALE = 1.25;
const BALE_W = 45;
const BALE_H = 45;
/** Srodek beli zostaje w srodku dawnej skrzyni 36x36 z layoutu. */
const LAYOUT_HALF = 18;
const BALE_HP = 3;
const RESPAWN_TIME = 60;

const _tex: PIXI.Texture[] = [];
/** Proxy kolizji -> bela (pchanie: inne bele rozpoznawane po proxy w buildings). */
const BALE_OF_PROXY = new WeakMap<ICollidable, HayBale>();

function bakeBale(variant: number): PIXI.Texture {
    if (_tex[variant]) return _tex[variant];
    const S = 2, W = 60, H = 52;
    const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    const c = cv.getContext('2d')!;
    c.scale(S, S);
    let seed = 777 + variant * 131;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const cx = W / 2, cy = H / 2 + 2;
    const bw = 40, bh = 30, er = 10; // dlugosc walca, wysokosc, promien czola (rx)
    // 2026-10-05 (Mariusz: "gradient, fake 3d"): walec jak bryly czolgow — gruby obrys, pas blasku,
    // okluzja przy ziemi, czolo z faza (jasna krawedz od NW) i glebokimi rowkami spirali.
    const OL = '#4a2e0a';
    const x0 = cx - bw / 2 + er * 0.6, x1 = cx + bw / 2;
    const top = cy - bh / 2, bot = cy + bh / 2;
    // cien rzucony SE (miekki) + kontakt z ziemia
    c.save(); c.shadowColor = 'rgba(15,30,5,0.5)'; c.shadowBlur = 5;
    c.fillStyle = 'rgba(20,35,10,0.42)';
    c.beginPath(); c.ellipse(cx + 5, bot - 1, bw / 2 + 6, 6.5, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    const bodyPath = () => {
        c.beginPath();
        c.moveTo(x0, top); c.lineTo(x1 - 4, top);
        c.quadraticCurveTo(x1 + 5, cy, x1 - 4, bot);
        c.lineTo(x0, bot); c.closePath();
    };
    // obrys sylwety (pod spodem, gruby)
    bodyPath(); c.strokeStyle = OL; c.lineWidth = 3; c.lineJoin = 'round'; c.stroke();
    c.beginPath(); c.ellipse(x0, cy, er, bh / 2, 0, 0, Math.PI * 2); c.stroke();
    // korpus: krzywizna walca (blask u gory, ciemny spod)
    const body = c.createLinearGradient(0, top, 0, bot);
    body.addColorStop(0, '#f6d77e'); body.addColorStop(0.18, '#fff2c0'); body.addColorStop(0.32, '#f0cc6c');
    body.addColorStop(0.7, '#c99434'); body.addColorStop(1, '#6e4a14');
    c.fillStyle = body; bodyPath(); c.fill();
    c.save(); bodyPath(); c.clip();
    // swiatlo ekranowe NW -> SE (jak na czolgach)
    const lg = c.createLinearGradient(x0, top, x1, bot);
    lg.addColorStop(0, 'rgba(255,255,255,0.18)'); lg.addColorStop(0.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(60,30,0,0.28)');
    c.fillStyle = lg; c.fillRect(x0 - 2, top - 2, bw + 8, bh + 4);
    // zdzbla wzdluz walca (jasne u gory, ciemne u dolu)
    for (let i = 0; i < 34; i++) {
        const y = top + 2 + rnd() * (bh - 4);
        const x = x0 + rnd() * (x1 - x0 - 4);
        const t = (y - top) / bh;
        c.strokeStyle = t < 0.4 ? 'rgba(255,248,210,0.8)' : 'rgba(120,78,20,0.55)';
        c.lineWidth = 1; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + 5 + rnd() * 7, y + (rnd() - 0.5) * 2); c.stroke();
    }
    c.restore();
    // sznurki (z cieniem i blikiem)
    for (const fx of [0.38, 0.72]) {
        const sx = x0 + (x1 - x0) * fx;
        c.strokeStyle = 'rgba(60,25,5,0.55)'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(sx + 0.8, top); c.quadraticCurveTo(sx + 3.3, cy, sx + 0.8, bot); c.stroke();
        c.strokeStyle = '#b5532a'; c.lineWidth = 1.8;
        c.beginPath(); c.moveTo(sx, top); c.quadraticCurveTo(sx + 2.5, cy, sx, bot); c.stroke();
        c.strokeStyle = 'rgba(255,215,170,0.75)'; c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(sx - 0.6, top + 1); c.quadraticCurveTo(sx + 1.8, cy - 3, sx - 0.4, cy + 3); c.stroke();
    }
    // CZOLO: tarcza z gradientem od slonca + faza krawedzi + gleboka spirala
    const face = c.createRadialGradient(x0 - 3, cy - 5, 1, x0, cy, bh / 2);
    face.addColorStop(0, '#fff3c4'); face.addColorStop(0.55, '#ebc260'); face.addColorStop(1, '#9a6c22');
    c.fillStyle = face; c.beginPath(); c.ellipse(x0, cy, er, bh / 2, 0, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.ellipse(x0, cy, er, bh / 2, 0, 0, Math.PI * 2); c.clip();
    c.lineWidth = 2.2;
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(x0 + 1, cy + 1.2, er, bh / 2, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(80,45,5,0.5)'; c.beginPath(); c.ellipse(x0 - 1, cy - 1.2, er, bh / 2, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
    const spiral = (dx: number, dy: number, col: string, w: number) => {
        c.strokeStyle = col; c.lineWidth = w; c.beginPath();
        for (let a = 0; a < Math.PI * 7; a += 0.2) {
            const r = 0.6 + a * 0.42;
            const px = x0 + dx + Math.cos(a) * r * (er / (bh / 2)), py = cy + dy + Math.sin(a) * r;
            if (a === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.stroke();
    };
    spiral(0.5, 0.6, 'rgba(255,240,190,0.55)', 0.8); // swiatlo na krawedzi rowka
    spiral(0, 0, 'rgba(110,70,15,0.85)', 1.1);       // rowek
    c.strokeStyle = OL; c.lineWidth = 1.6;
    c.beginPath(); c.ellipse(x0, cy, er, bh / 2, 0, 0, Math.PI * 2); c.stroke();
    // odstajace zdzbla na grzbiecie (puszysta sylweta)
    for (let i = 0; i < 11; i++) {
        const x = x0 + rnd() * (x1 - x0);
        c.strokeStyle = 'rgba(250,222,130,0.95)'; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(x, top + 1); c.lineTo(x + (rnd() - 0.5) * 6, top - 3 - rnd() * 3); c.stroke();
    }
    const tex = PIXI.Texture.from(cv, { resolution: S } as PIXI.IBaseTextureOptions);
    _tex[variant] = tex;
    return tex;
}

export class HayBale implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    public isDestroyed = false;

    /** Miejsce z layoutu — tu bela odradza sie po rozbiciu (moze byc przepchnieta gdzie indziej). */
    private readonly homeX: number;
    private readonly homeY: number;
    private pushFx = 0;
    private proxy: ICollidable | null = null;
    private hp = BALE_HP;
    private respawnTimer = 0;
    private popT = 0;
    private readonly sprite: PIXI.Sprite;
    private readonly remains: PIXI.Graphics;

    constructor(
        x: number, y: number, seed: number,
        worldContainer: PIXI.Container,
        private readonly effects: EffectsManager,
        private readonly audio: AudioSys,
    ) {
        this.x = this.homeX = x + LAYOUT_HALF - BALE_W / 2;
        this.y = this.homeY = y + LAYOUT_HALF - BALE_H / 2;
        this.w = BALE_W; this.h = BALE_H;
        const variant = seed % 2;
        this.sprite = new PIXI.Sprite(bakeBale(variant));
        this.sprite.anchor.set(0.5, 0.56);
        this.sprite.x = x + LAYOUT_HALF;
        this.sprite.y = y + LAYOUT_HALF;
        this.sprite.scale.set(seed % 3 === 0 ? -BALE_SCALE : BALE_SCALE, BALE_SCALE); // lustro = mniej powtarzalnosci
        this.sprite.zIndex = Math.floor(this.y + BALE_H);
        worldContainer.addChild(this.sprite);
        // resztki po rozbiciu (rysowane raz, widoczne tylko gdy bela zniszczona)
        this.remains = new PIXI.Graphics();
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + (seed % 7) * 0.3;
            const r = 6 + ((i * 37 + seed) % 14);
            const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.6;
            this.remains.lineStyle(1.6, i % 3 === 0 ? 0xf5dc8a : 0xc99a42, 0.9);
            this.remains.moveTo(px, py); this.remains.lineTo(px + Math.cos(a + 1.3) * 6, py + Math.sin(a + 1.3) * 3);
        }
        this.remains.x = x + LAYOUT_HALF; this.remains.y = y + LAYOUT_HALF + 6;
        this.remains.zIndex = -80; this.remains.visible = false;
        worldContainer.addChild(this.remains);
    }

    public takeDamage(dmg: number, hitX: number, hitY: number): void {
        if (this.isDestroyed) return;
        this.hp -= dmg;
        if (this.hp <= 0) { this.destroy(); return; }
        this.effects.spawnHayBits(hitX, hitY, 6, false);
        this.audio.playHayHit();
        applyHitShake(this.sprite, this.x + BALE_W / 2, this.y + BALE_H / 2, 2, 90, () => this.isDestroyed);
    }

    private destroy(): void {
        this.isDestroyed = true;
        this.respawnTimer = RESPAWN_TIME;
        const cx = this.x + BALE_W / 2, cy = this.y + BALE_H / 2;
        this.remains.x = cx; this.remains.y = cy + 6;
        this.w = 0; this.h = 0;
        this.sprite.visible = false;
        this.remains.visible = true;
        this.effects.spawnHayBits(cx, cy, 26, true);
        this.audio.playHayBreak();
    }

    private respawn(): void {
        this.isDestroyed = false;
        this.hp = BALE_HP;
        this.w = BALE_W; this.h = BALE_H;
        this.x = this.homeX; this.y = this.homeY; this.syncVisual(); // odradza sie w miejscu z layoutu
        this.sprite.visible = true;
        this.remains.visible = false;
        this.popT = 12; // wejscie z odbiciem
    }

    /** COOP LAN-3b: stan do migawki hosta (jak Crate). */
    public netState(): number { return this.isDestroyed ? 255 : 0; }
    public applyNetState(s: number): void {
        if (s === 255) { if (!this.isDestroyed) this.destroy(); this.respawnTimer = 1e9; return; }
        if (this.isDestroyed) this.respawn();
    }

    public update(_camX: number, _camY: number, _screenW: number, _screenH: number): void {
        if (this.isDestroyed) {
            this.respawnTimer -= 1 / 60;
            if (this.respawnTimer <= 0) this.respawn();
            return;
        }
        if (this.popT > 0) {
            this.popT -= 1;
            const p = 1 - this.popT / 12;
            const s = p < 0.7 ? p / 0.7 * 1.15 : 1.15 - (p - 0.7) / 0.3 * 0.15;
            this.sprite.scale.set(Math.sign(this.sprite.scale.x || 1) * s * BALE_SCALE, s * BALE_SCALE);
        }
    }

    /** Padded hitbox dla gracza (jak Crate v0.34.1). */
    public getExtraCollidables(): ICollidable[] {
        const self = this;
        const PAD = 8;
        this.proxy = {
            get x() { return self.isDestroyed ? -10000 : self.x - PAD; },
            get y() { return self.isDestroyed ? -10000 : self.y - PAD; },
            get w() { return self.isDestroyed ? 0 : BALE_W + PAD * 2; },
            get h() { return self.isDestroyed ? 0 : BALE_H + PAD * 2; },
            update: () => {},
        };
        BALE_OF_PROXY.set(this.proxy, this);
        return [this.proxy];
    }

    /** Hitbox, w ktory wjezdza czolg (padded proxy). */
    public get pushRect(): ICollidable | null { return this.isDestroyed ? null : this.proxy; }

    /**
     * 2026-10-05 (Mariusz): czolg PCHA bele — mozna z nich ukladac oslony. Bela przesuwa sie o (dx, dy)
     * tylko gdy nowe miejsce jest wolne (budynki, inne bele, brzeg mapy). true = przesunieta.
     */
    public tryPush(dx: number, dy: number, obstacles: readonly ICollidable[], together?: ReadonlySet<HayBale>): boolean {
        if (this.isDestroyed) return false;
        const nx = this.x + dx, ny = this.y + dy;
        if (nx < 40 || ny < 40 || nx + BALE_W > 2960 || ny + BALE_H > 2960) return false;
        for (const b of obstacles) {
            if (b === this || b === this.proxy || b.w <= 0) continue;
            const other = BALE_OF_PROXY.get(b);
            if (other) {
                // inna bela: jej PRAWDZIWY prostokat (bez paddingu); bele z layoutu stoja na zakladke 3 px
                if (other.isDestroyed || together?.has(other)) continue; // pchane razem w tym kroku
                // blokuje tylko, gdy ruch ZWIEKSZA zakladke (pchniecie w nia); istniejaca zakladka z layoutu nie przeszkadza
                const ov = (x0: number, y0: number) => Math.max(0, Math.min(x0 + BALE_W, other.x + BALE_W) - Math.max(x0, other.x)) * Math.max(0, Math.min(y0 + BALE_H, other.y + BALE_H) - Math.max(y0, other.y));
                if (ov(nx, ny) > ov(this.x, this.y) + 0.01) return false;
                continue;
            }
            if (nx < b.x + b.w && nx + BALE_W > b.x && ny < b.y + b.h && ny + BALE_H > b.y) return false;
        }
        this.x = nx; this.y = ny;
        this.syncVisual();
        // Sensoryka: toczaca sie bela sypie zdzblami i lekko sie kolysze
        if (++this.pushFx % 8 === 0) this.effects.spawnHayBits(this.x + BALE_W / 2 - dx * 6, this.y + BALE_H - 4, 2, false);
        this.sprite.rotation = Math.sin(this.pushFx * 0.35) * 0.05;
        return true;
    }

    /** Cofniecie pchniecia (stos bel rusza sie razem albo wcale) — bez sprawdzania kolizji. */
    public undoPush(dx: number, dy: number): void { this.x -= dx; this.y -= dy; this.syncVisual(); }

    private syncVisual(): void {
        this.sprite.x = this.x + BALE_W / 2;
        this.sprite.y = this.y + BALE_H / 2;
        this.sprite.zIndex = Math.floor(this.y + BALE_H);
    }
}
