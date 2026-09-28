import * as PIXI from 'pixi.js';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import { DESERT_CURSE } from '../../config/desertCurse';
import { bakeToSprite } from '../propBaker';

/** COOP S5: gracz widziany przez klatwe/Ra (Player spelnia ten ksztalt). */
export interface CursePlayer { x: number; y: number; isDashing: boolean; hp: number }

/** COOP S5: najblizszy zywy gracz do punktu (null gdy brak). */
export function nearestCursePlayer(pls: ReadonlyArray<CursePlayer>, x: number, y: number): CursePlayer | null {
    let best: CursePlayer | null = null;
    let bestD = Infinity;
    for (const p of pls) {
        if (p.hp <= 0) continue;
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) { bestD = d; best = p; }
    }
    return best;
}

/**
 * RaWrath — DESERT ART v2 / E7 (uwaga Mariusza 2026-09-28). ZEMSTA BOGA RA: jednorazowo
 * na piramidzie „na dole" — po poludniowej stronie piramidy objawia sie Ra (sokol z tarcza
 * slonca, programowo na podstawie ryciny, nie kopia) i zrzuca deszcz ognistych kul ze smuga.
 *
 * CZYTELNOSC (#1): kazda kula ma TELEGRAF — pierscien na ziemi w miejscu upadku, ktory
 * zapelnia sie przez caly lot (~0.8 s). Kula leci LUKIEM z tarczy slonca nad glowa Ra,
 * wiec widac, skad przyszlo trafienie. Obrazenia tylko w promieniu pierscienia.
 * SENSORYKA: wybuch rakietowy, fala, iskry, wstrzas, osmalenie piasku 8 s, dzwiek.
 *
 * COOP/MP: cele i harmonogram z indeksu kuli i kroku (bez RNG), czas w krokach logiki,
 * obrazenia przez DamageSource `ra_fire`. Wyglad (smugi, aura, osmalenia) lokalny.
 */

export interface RaHooks {
    /** COOP S5: wszyscy gracze (indeks = players[]). */
    getPlayers(): ReadonlyArray<CursePlayer>;
    damagePlayer(index: number, amount: number): void;
    /** Liczby per poziom trudnosci (CURSE_BY_DIFFICULTY). */
    balls: number;
    dmg: number;
    /** Co ktora kula celuje prosto w gracza. */
    directEvery: number;
}

interface Ball {
    sx: number; sy: number; tx: number; ty: number;
    t: number;
    head: PIXI.Sprite;
    trail: { x: number; y: number }[];
}

let _fireTex: PIXI.Texture | null = null;
function fireTexture(): PIXI.Texture {
    if (_fireTex && !_fireTex.destroyed) return _fireTex;
    const S = 64;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(0.25, 'rgba(255,230,90,1)');
    g.addColorStop(0.55, 'rgba(255,120,20,0.85)');
    g.addColorStop(1, 'rgba(200,30,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    _fireTex = PIXI.Texture.from(cv);
    return _fireTex;
}

let _auraTex: PIXI.Texture | null = null;
function auraTexture(): PIXI.Texture {
    if (_auraTex && !_auraTex.destroyed) return _auraTex;
    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,220,120,0.55)');
    g.addColorStop(0.6, 'rgba(255,160,40,0.18)');
    g.addColorStop(1, 'rgba(255,120,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    _auraTex = PIXI.Texture.from(cv);
    return _auraTex;
}

/** Ra — rysunek programowy (profil w prawo, stopy w (0,0)), ~190 px z tarcza. */
function drawRa(g: PIXI.Graphics): void {
    const RED = 0xb8322a, RED_D = 0x8a2018, GOLD = 0xf2b82a, GOLD_D = 0xb8841a;
    const BLUE = 0x24488a, GREEN = 0x2c6a3c, WHITE = 0xf6f2e6;
    g.beginFill(0x000000, 0.001); g.drawRect(-60, -200, 130, 206); g.endFill();
    // cien SE
    g.beginFill(0x000000, 0.28); g.drawEllipse(18, 2, 40, 8); g.endFill();
    // laska was (za postacia, prawa reka)
    g.lineStyle(3.5, BLUE, 1); g.moveTo(44, -150); g.lineTo(44, -2);
    g.moveTo(44, -2); g.lineTo(40, 4); g.moveTo(44, -2); g.lineTo(48, 4);
    g.moveTo(44, -150); g.quadraticCurveTo(50, -156, 47, -162);          // glowka zwierzecia seta
    g.lineStyle(0);
    // nogi (walce) + bransolety
    const leg = (x: number, c: number) => {
        g.beginFill(c); g.drawRoundedRect(x, -62, 12, 58, 5); g.endFill();
        g.beginFill(RED_D, 0.5); g.drawRoundedRect(x + 8, -60, 4, 54, 2); g.endFill();
        g.beginFill(BLUE); g.drawRect(x - 1, -14, 14, 3); g.endFill();
        g.beginFill(GOLD); g.drawRect(x - 1, -11, 14, 2); g.endFill();
        g.beginFill(RED_D); g.drawRoundedRect(x - 1, -5, 16, 5, 2); g.endFill();     // stopa
    };
    leg(-16, RED_D); leg(2, RED);
    // kilt (shendyt): zloty trapez z plisami + fartuch
    g.beginFill(GOLD); g.drawPolygon([-20, -100, 20, -100, 26, -58, -24, -58]); g.endFill();
    g.beginFill(GOLD_D, 0.6); g.drawPolygon([10, -100, 20, -100, 26, -58, 14, -58]); g.endFill();
    g.lineStyle(1, GOLD_D, 0.8);
    for (let i = 0; i < 7; i++) { const x = -18 + i * 6; g.moveTo(x, -98); g.lineTo(x + 2, -60); }
    g.lineStyle(0);
    g.beginFill(WHITE); g.drawPolygon([-6, -98, 8, -98, 4, -64, -2, -64]); g.endFill();
    g.beginFill(BLUE); g.drawRect(-20, -104, 40, 5); g.endFill();                    // pas
    g.beginFill(GOLD); g.drawRect(-20, -104, 40, 1.8); g.endFill();
    g.beginFill(RED); g.drawRect(-2, -99, 5, 8); g.endFill();                         // tassel
    // tulow
    g.beginFill(RED); g.drawRoundedRect(-18, -150, 36, 48, 8); g.endFill();
    g.beginFill(RED_D, 0.45); g.drawRoundedRect(8, -148, 10, 44, 5); g.endFill();
    // kolnierz (usekh): zielony z paciorkami
    g.beginFill(GREEN); g.drawRoundedRect(-17, -148, 34, 26, 6); g.endFill();
    for (let r = 0; r < 3; r++) {
        g.beginFill(r % 2 ? GOLD : BLUE);
        g.drawRect(-17, -126 + r * 2.2, 34, 1.6);
        g.endFill();
    }
    // lewa reka (w dol, z ankh) — walec + bransolety
    g.lineStyle(9, RED_D, 1); g.moveTo(-15, -140); g.lineTo(-24, -92); g.lineStyle(0);
    g.beginFill(BLUE); g.drawRect(-22, -134, 9, 3); g.drawRect(-27, -100, 9, 3); g.endFill();
    g.lineStyle(3, GOLD, 1);                                                          // ankh
    g.drawEllipse(-26, -84, 4, 5); g.moveTo(-26, -79); g.lineTo(-26, -64); g.moveTo(-32, -78); g.lineTo(-20, -78);
    g.lineStyle(0);
    // prawa reka (wyciagnieta do laski)
    g.lineStyle(9, RED, 1); g.moveTo(14, -140); g.lineTo(26, -112); g.lineTo(42, -104); g.lineStyle(0);
    g.beginFill(BLUE); g.drawRect(14, -134, 9, 3); g.drawRect(34, -108, 3, 9); g.endFill();
    g.beginFill(RED); g.drawCircle(44, -104, 4.5); g.endFill();                      // dlon na lasce
    // nemes w pasy (klapy na ramionach)
    const stripes = [BLUE, GREEN, RED, GOLD];
    for (let i = 0; i < 8; i++) {
        g.beginFill(stripes[i % 4]);
        g.drawPolygon([-16 + i * 1.2, -170 + i * 3, -2, -170 + i * 3, -2, -167 + i * 3, -16 + i * 1.2, -167 + i * 3]);
        g.endFill();
    }
    g.beginFill(BLUE); g.drawPolygon([-18, -172, -4, -176, -4, -146, -20, -140]); g.endFill();
    for (let i = 0; i < 6; i++) { g.beginFill(i % 2 ? GREEN : RED); g.drawRect(-19, -168 + i * 4.5, 14, 2); g.endFill(); }
    // glowa sokola: biala z czarna „lza" (znak Horusa), dziob
    g.beginFill(0x1a1a1a); g.drawCircle(4, -170, 13); g.endFill();
    g.beginFill(WHITE); g.drawCircle(6, -168, 10); g.endFill();
    g.beginFill(0x1a1a1a); g.drawCircle(9, -172, 2.6); g.endFill();
    g.beginFill(0xffffff); g.drawCircle(8.2, -172.8, 0.9); g.endFill();
    g.lineStyle(2.2, 0x1a1a1a, 1); g.moveTo(8, -168); g.quadraticCurveTo(7, -161, 3, -158); g.lineStyle(0);
    g.beginFill(0xe8c050); g.drawPolygon([14, -172, 24, -168, 17, -160, 14, -164]); g.endFill();   // dziob
    g.beginFill(0x1a1a1a); g.drawPolygon([17, -160, 20, -163, 18, -158]); g.endFill();
    // tarcza slonca + zlote obramowanie + ureusz (kobra)
    g.beginFill(GOLD); g.drawCircle(0, -206, 37); g.endFill();
    g.beginFill(0xd8321e); g.drawCircle(0, -206, 31); g.endFill();
    g.beginFill(0xff6a40, 0.55); g.drawCircle(-9, -215, 13); g.endFill();
    g.lineStyle(4, GOLD, 1); g.moveTo(22, -180); g.quadraticCurveTo(32, -186, 28, -196); g.lineStyle(0);
    g.beginFill(GREEN); g.drawEllipse(28, -198, 4, 5); g.endFill();
    g.beginFill(GOLD); g.drawCircle(29, -199, 1.6); g.endFill();
}

export class RaWrath {
    public done = false;
    private t = 0;
    private fired = 0;
    private balls: Ball[] = [];
    private scorches: { s: PIXI.Sprite; life: number }[] = [];
    private ra: PIXI.Container;
    private aura: PIXI.Sprite;
    private telegraph: PIXI.Graphics;
    private trails: PIXI.Graphics;
    private diskX: number;
    private diskY: number;

    /** Fazy (kroki): objawienie 60, deszcz = BALLS * interval, znikanie 60. */
    /** Skala rysunku Ra (uwaga Mariusza: -25% wzgledem 1.1). */
    private static readonly SCALE = 0.825;
    private static readonly APPEAR = 60;
    private static readonly INTERVAL = 11;
    private static readonly FLIGHT = 48;
    private static readonly FADE = 60;

    constructor(
        private px: number, private py: number, private pyrSize: number,
        private world: PIXI.Container,
        private effects: EffectsManager,
        private audio: AudioSys,
        private hooks: RaHooks,
    ) {
        // PIXI init w pierwszym bloku
        this.ra = new PIXI.Container();
        this.aura = new PIXI.Sprite(auraTexture());
        this.telegraph = new PIXI.Graphics();
        this.trails = new PIXI.Graphics();
        const baseX = px, baseY = py + pyrSize / 2 + 34;     // poludniowa strona piramidy
        this.ra.x = baseX; this.ra.y = baseY;
        this.ra.zIndex = baseY + 10;
        this.aura.anchor.set(0.5);
        this.aura.y = -120 * RaWrath.SCALE / 1.1;
        this.aura.scale.set(2.6 * RaWrath.SCALE / 1.1);
        this.ra.addChild(this.aura);
        const wrap = new PIXI.Container();
        const g = new PIXI.Graphics();
        g.scale.set(RaWrath.SCALE);
        wrap.addChild(g);
        drawRa(g);
        const spr = bakeToSprite(wrap, 'ra_god_v2');
        wrap.destroy({ children: true });
        if (spr) this.ra.addChild(spr);
        else console.error('[RaWrath] brak renderera do pieczenia Ra', { px, py });
        this.ra.alpha = 0;
        this.diskX = baseX;
        this.diskY = baseY - 206 * RaWrath.SCALE;
        this.telegraph.zIndex = 7;
        this.trails.zIndex = 20500;                          // smugi nad czolgami
        world.addChild(this.ra, this.telegraph, this.trails);
        effects.shake(10, 20);
        effects.spawnShockwaveRing(baseX, baseY - 120, 260, 0xffb030);
        audio.playRaAppear();
    }

    /** Krok logiki. */
    update(): void {
        if (this.done) return;
        this.t++;
        const C = DESERT_CURSE;
        const total = RaWrath.APPEAR + this.hooks.balls * RaWrath.INTERVAL + RaWrath.FLIGHT;
        // objawienie / trwanie / znikanie
        const a = this.t < RaWrath.APPEAR ? this.t / RaWrath.APPEAR
            : this.t > total ? Math.max(0, 1 - (this.t - total) / RaWrath.FADE) : 1;
        this.ra.alpha = a;
        this.ra.pivot.y = (1 - Math.min(1, this.t / RaWrath.APPEAR)) * -30;   // wynurza sie z piasku
        this.aura.alpha = 0.8 + Math.sin(this.t * 0.12) * 0.2;
        this.aura.rotation += 0.01;

        // wystrzal kolejnej kuli z tarczy slonca
        if (this.t >= RaWrath.APPEAR && this.fired < this.hooks.balls && (this.t - RaWrath.APPEAR) % RaWrath.INTERVAL === 0) {
            this.launch(this.fired++);
        }

        this.telegraph.clear();
        this.trails.clear();
        const pls = this.hooks.getPlayers();
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const b = this.balls[i];
            b.t++;
            const k = b.t / RaWrath.FLIGHT;
            const x = b.sx + (b.tx - b.sx) * k;
            const y = b.sy + (b.ty - b.sy) * k - Math.sin(Math.PI * k) * C.raArc;
            b.trail.unshift({ x, y });
            if (b.trail.length > 10) b.trail.pop();
            b.head.x = x; b.head.y = y;
            b.head.rotation += 0.3;
            b.head.scale.set(0.7 + Math.sin(b.t * 0.8) * 0.08);
            // TELEGRAF: pierscien w miejscu upadku zapelnia sie w trakcie lotu
            this.telegraph.lineStyle(3, 0xff5a1a, 0.55 + k * 0.4);
            this.telegraph.drawEllipse(b.tx, b.ty, C.raHitRadius, C.raHitRadius * 0.7);
            this.telegraph.lineStyle(0);
            this.telegraph.beginFill(0xff7a2a, 0.12 + k * 0.28);
            this.telegraph.drawEllipse(b.tx, b.ty, C.raHitRadius * k, C.raHitRadius * 0.7 * k);
            this.telegraph.endFill();
            // SMUGA: zwezajaca sie, od bieli przez pomarancz do czerwieni
            for (let s = 1; s < b.trail.length; s++) {
                const f = 1 - s / b.trail.length;
                this.trails.lineStyle(9 * f + 1, s < 3 ? 0xfff0a0 : s < 6 ? 0xff9a2a : 0xd8321e, 0.75 * f);
                this.trails.moveTo(b.trail[s - 1].x, b.trail[s - 1].y);
                this.trails.lineTo(b.trail[s].x, b.trail[s].y);
            }
            this.trails.lineStyle(0);
            if (b.t >= RaWrath.FLIGHT) {
                this.impact(b.tx, b.ty, pls);
                b.head.destroy();
                this.balls.splice(i, 1);
            }
        }
        for (let i = this.scorches.length - 1; i >= 0; i--) {
            const s = this.scorches[i];
            s.life--;
            s.s.alpha = Math.min(0.55, s.life / 120);
            if (s.life <= 0) { s.s.destroy(); this.scorches.splice(i, 1); }
        }
        if (this.t > total + RaWrath.FADE && this.balls.length === 0 && this.scorches.length === 0) this.finish();
    }

    /** Cel: gracz (co 3. kula prosto w niego) albo pierscien wokol; daleko = okolice piramidy. */
    private launch(i: number): void {
        const C = DESERT_CURSE;
        const pl = nearestCursePlayer(this.hooks.getPlayers(), this.px, this.py); // COOP S5: cel = najblizszy piramidy
        const h = (n: number) => { const v = Math.sin(n * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };
        let cx = this.px, cy = this.py + this.pyrSize / 2 + 160;
        if (pl && Math.hypot(pl.x - this.px, pl.y - this.py) < C.raReach) { cx = pl.x; cy = pl.y; }
        const r = i % this.hooks.directEvery === 0 ? 0 : 60 + h(i) * 150;
        const ang = h(i + 50) * Math.PI * 2;
        const head = new PIXI.Sprite(fireTexture());
        head.anchor.set(0.5);
        head.zIndex = 20501;
        this.world.addChild(head);
        this.balls.push({
            sx: this.diskX, sy: this.diskY,
            tx: cx + Math.cos(ang) * r, ty: cy + Math.sin(ang) * r * 0.75,
            t: 0, head, trail: [],
        });
        this.audio.playFireballWhoosh();
    }

    private impact(x: number, y: number, pls: ReadonlyArray<CursePlayer>): void {
        const C = DESERT_CURSE;
        this.effects.spawnRocketExplosion(x, y);
        this.effects.spawnShockwaveRing(x, y, C.raHitRadius + 20, 0xff8a2a);
        this.effects.spawnEnemyHitSparks(x, y, 0xffd84a);
        this.effects.shake(3, 5);
        this.audio.playFireImpact();
        const s = new PIXI.Sprite(auraTexture());
        s.anchor.set(0.5);
        s.tint = 0x2a1408;                                 // osmalony piasek
        s.scale.set(0.9, 0.6);
        s.x = x; s.y = y;
        s.zIndex = 6;
        this.world.addChild(s);
        this.scorches.push({ s, life: 480 });
        for (let pi = 0; pi < pls.length; pi++) { // COOP S5: wybuch rani kazdego gracza w strefie
            const pl = pls[pi];
            const nx = (pl.x - x) / C.raHitRadius, ny = (pl.y - y) / (C.raHitRadius * 0.7);
            if (nx * nx + ny * ny <= 1) this.hooks.damagePlayer(pi, this.hooks.dmg);
        }
    }

    private finish(): void {
        this.done = true;
        this.ra.destroy({ children: true });
        this.telegraph.destroy();
        this.trails.destroy();
    }

    destroy(): void {
        if (this.done) return;
        for (const b of this.balls) b.head.destroy();
        for (const s of this.scorches) s.s.destroy();
        this.balls = [];
        this.scorches = [];
        this.finish();
    }
}

