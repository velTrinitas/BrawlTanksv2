import * as PIXI from 'pixi.js';
import type { EffectsManager } from '../../rendering/Effects';
import type { AudioSys } from '../../audio/AudioSys';
import type { Bridge } from './Bridge';
import type { Oasis } from './Oasis';
import type { Quicksand } from './Quicksand';
import type { NileFlora } from './NileFlora';
import { bakeToSprite } from '../propBaker';
import { ambientRng } from '../../systems/Rng';

/**
 * DesertJuice — DESERT ART v2 / E5. „Chrupanie" Pustyni. WSZYSTKO TU JEST LOKALNYM
 * WIZUALEM: nie zmienia HP, pozycji, kolizji ani dropow (bramka COOP: brak wplywu na
 * symulacje). Losowosc wylacznie z `ambientRng` (nigdy worldRng / Math.random w swiecie).
 *
 * Elementy (plan E5; slady gasienic i pyl spod czolgu JUZ byly w grze — nie dublujemy):
 *  3. odpryski kamienia przy trafieniu w piaskowiec / piramide,
 *  4. rozpad piaskowca na bryly z grawitacja fake-3D (skok + cien na ziemi) + kupka gruzu 10 s,
 *  5. rozbryzg przy wjezdzie do stawu oazy + piasek sypiacy sie na kadlub w ruchomych piaskach,
 *  6. ugiecie mostu pod czolgiem + skrzypienie,
 *  7. mini-wiry piaskowe co ~40 s w poblizu kadru,
 *  8. ibisy zrywaja sie przy wybuchu (NileFlora.scare),
 * 10. wrak zasypuje piasek w 3 s + mocniejszy blysk eksplozji.
 *
 * KOSZT: pule z twardymi limitami (bryly 36, kupki 8, wydmy 10, wiry 1), tekstury pieczone
 * raz (cache propBaker), zero full-screen efektow.
 */

interface Chunk { spr: PIXI.Sprite; sh: PIXI.Sprite; x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; rest: number; on: boolean }
interface Fader { spr: PIXI.Sprite; life: number; max: number; grow: boolean }
interface Devil { spr: PIXI.Sprite; x: number; y: number; vx: number; vy: number; life: number; max: number }

const MAX_CHUNKS = 36;
const MAX_RUBBLE = 8;
const MAX_MOUNDS = 10;

function tex(key: string, draw: (g: PIXI.Graphics) => void): PIXI.Texture | null {
    const g = new PIXI.Graphics();
    draw(g);
    const s = bakeToSprite(g, key);
    g.destroy();
    return s ? s.texture : null;
}

export class DesertJuice {
    /** Aktywna instancja (SandstoneBlock / PyramidCurse wolaja przez nia odpryski). */
    public static active: DesertJuice | null = null;

    private layer: PIXI.Container;
    private chunks: Chunk[] = [];
    private rubble: Fader[] = [];
    private mounds: Fader[] = [];
    private devil: Devil | null = null;
    private devilCooldown = 900;
    private stepNo = 0;
    private wasInPond = false;
    private loadedBridge: Bridge | null = null;

    private texChunk: (PIXI.Texture | null)[];
    private texShadow: PIXI.Texture | null;
    private texRubble: PIXI.Texture | null;
    private texMound: PIXI.Texture | null;
    private texDevil: PIXI.Texture | null;

    constructor(
        worldContainer: PIXI.Container,
        private effects: EffectsManager,
        private audio: AudioSys,
        private bridges: Bridge[],
        private oases: Oasis[],
        private quicksands: Quicksand[],
        private flora: NileFlora | null,
    ) {
        this.layer = new PIXI.Container();
        this.layer.zIndex = 6;                 // nad piaskiem, pod czolgami (bryly maja wlasny zIndex)
        this.layer.sortableChildren = true;
        worldContainer.addChild(this.layer);

        const stone = [0xecca8c, 0xd8a868, 0xb08048];
        this.texChunk = stone.map((c, k) => tex(`juice_chunk:${k}`, g => {
            const pts = k === 0 ? [-5, -4, 4, -5, 6, 2, 0, 5, -6, 2] : k === 1 ? [-4, -5, 5, -3, 4, 4, -5, 4] : [-6, -2, 0, -5, 6, -1, 3, 4, -4, 4];
            g.beginFill(c); g.drawPolygon(pts); g.endFill();
            g.beginFill(0xffffff, 0.3); g.drawPolygon(pts.slice(0, 6).map(v => v * 0.6)); g.endFill();
        }));
        this.texShadow = tex('juice_shadow', g => { g.beginFill(0x000000, 0.3); g.drawEllipse(0, 0, 6, 2.5); g.endFill(); });
        this.texRubble = tex('juice_rubble', g => {
            g.beginFill(0x000000, 0.2); g.drawEllipse(3, 3, 34, 12); g.endFill();
            g.beginFill(0xe6c690, 0.9); g.drawEllipse(0, 0, 32, 11); g.endFill();
            const b: [number, number, number, number][] = [[-18, -4, 10, 6], [-5, -7, 12, 8], [8, -3, 11, 6], [-12, 2, 8, 5], [14, 3, 7, 4]];
            for (const [x, y, w, h] of b) {
                g.beginFill(0x8a5e32); g.drawRect(x + 1, y + 1, w, h); g.endFill();
                g.beginFill(0xd8a868); g.drawRect(x, y, w, h); g.endFill();
                g.beginFill(0xf4dcaa); g.drawRect(x, y, w, 1.5); g.endFill();
            }
        });
        this.texMound = tex('juice_mound', g => {
            g.beginFill(0x000000, 0.15); g.drawEllipse(4, 4, 38, 20); g.endFill();
            g.beginFill(0xc9a060); g.drawEllipse(0, 0, 36, 19); g.endFill();
            g.beginFill(0xe8c890); g.drawEllipse(-5, -4, 28, 13); g.endFill();
            g.beginFill(0xf4e0b0, 0.8); g.drawEllipse(-10, -7, 14, 5); g.endFill();
        });
        this.texDevil = tex('juice_devil', g => {
            for (let arm = 0; arm < 3; arm++) {
                for (let s = 0; s < 16; s++) {
                    const t = s / 16;
                    const a = (arm / 3) * Math.PI * 2 + t * Math.PI * 2.2;
                    const r = 6 + t * 30;
                    g.beginFill(0xe8cc94, 0.5 * (1 - t * 0.6));
                    g.drawCircle(Math.cos(a) * r, Math.sin(a) * r * 0.6, 4 - t * 2);
                    g.endFill();
                }
            }
        });
        DesertJuice.active = this;
    }

    // ── 3. odpryski ──
    public chip(x: number, y: number, count = 2): void {
        for (let i = 0; i < count; i++) this.throwChunk(x, y, 1.4 + ambientRng.next() * 1.2, 3 + ambientRng.next() * 2);
        this.effects.spawnSoftPuff(x, y, 0xe0c890, 0.8);
    }

    /** Trafienie w zabytek (obelisk / pylon / kolos): iskra kamienia + odprysk + pyl. */
    public hitStone(x: number, y: number): void {
        this.effects.spawnEnemyHitSparks(x, y, 0xe0c080);
        this.chip(x, y, 2);
    }

    /**
     * Rozpad zabytku — jak piaskowiec, ale wiekszy: wiecej brył (limit puli 36 zostaje),
     * fala pylu, wstrzas, kupka gruzu. `size` = szerokosc podstawy.
     */
    public bigCrumble(cx: number, cy: number, size: number): void {
        const n = Math.min(12, 6 + Math.round(size / 15));
        for (let i = 0; i < n; i++) this.throwChunk(cx + (ambientRng.next() - 0.5) * size, cy, 2.5 + ambientRng.next() * 3, 5 + ambientRng.next() * 4);
        this.effects.spawnSandstoneCrumble(cx, cy);
        this.effects.spawnShockwaveRing(cx, cy, size + 40, 0xe0c890);
        this.effects.shake(6, 12);
        this.audio.playCrateBreak();
        this.crumble(cx, cy + size * 0.3);
    }

    // ── 4. rozpad piaskowca ──
    public crumble(cx: number, cy: number): void {
        for (let i = 0; i < 7; i++) this.throwChunk(cx + (ambientRng.next() - 0.5) * 30, cy, 2 + ambientRng.next() * 2.5, 4 + ambientRng.next() * 3);
        if (!this.texRubble) return;
        if (this.rubble.length >= MAX_RUBBLE) { const old = this.rubble.shift()!; old.spr.destroy(); }
        const spr = new PIXI.Sprite(this.texRubble);
        spr.anchor.set(0.5);
        spr.x = cx; spr.y = cy + 18;
        spr.zIndex = 1;
        this.layer.addChild(spr);
        this.rubble.push({ spr, life: 600, max: 600, grow: false });
    }

    private throwChunk(x: number, y: number, speed: number, vz: number): void {
        const t = this.texChunk[Math.floor(ambientRng.next() * 3)];
        if (!t || !this.texShadow) return;
        let c = this.chunks.find(k => !k.on);
        if (!c) {
            if (this.chunks.length >= MAX_CHUNKS) return;
            const spr = new PIXI.Sprite(t); spr.anchor.set(0.5);
            const sh = new PIXI.Sprite(this.texShadow); sh.anchor.set(0.5);
            this.layer.addChild(sh, spr);
            c = { spr, sh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, rest: 0, on: false };
            this.chunks.push(c);
        }
        const a = ambientRng.next() * Math.PI * 2;
        c.spr.texture = t;
        c.x = x; c.y = y; c.z = 6;
        c.vx = Math.cos(a) * speed; c.vy = Math.sin(a) * speed * 0.7; c.vz = vz;
        c.spin = (ambientRng.next() - 0.5) * 0.4;
        c.rest = 0; c.on = true;
        c.spr.visible = c.sh.visible = true;
        c.spr.alpha = c.sh.alpha = 1;
        c.spr.scale.set(0.8 + ambientRng.next() * 0.6);
    }

    // ── 10. wybuch: zasypywanie wraku + mocniejszy blysk; 8. ibisy ──
    public onExplosion(x: number, y: number): void {
        this.effects.spawnSoftPuff(x, y, 0xfff4c0, 3.2);             // mocniejszy blysk
        this.effects.spawnShockwaveRing(x, y, 70, 0xe0c890);          // fala piasku
        for (let i = 0; i < 4; i++) this.throwChunk(x, y, 2 + ambientRng.next() * 2, 4 + ambientRng.next() * 2);
        this.flora?.scare(x, y);
        if (!this.texMound) return;
        if (this.mounds.length >= MAX_MOUNDS) { const old = this.mounds.shift()!; old.spr.destroy(); }
        const spr = new PIXI.Sprite(this.texMound);
        spr.anchor.set(0.5);
        spr.x = x; spr.y = y + 4;
        spr.alpha = 0;
        spr.scale.set(0.3);
        // nad wrakiem (wrak ma zIndex y+5 w warstwie efektow) — piasek go przykrywa
        spr.zIndex = 2;
        this.layer.zIndex = 6;
        this.layer.addChild(spr);
        this.mounds.push({ spr, life: 180 + 480, max: 180 + 480, grow: true });
    }

    /** Krok (wolany z petli logiki, ale wszystko tu jest wizualem). */
    public update(player: { x: number; y: number; isMoving: boolean } | null, camX: number, camY: number, viewW: number, viewH: number): void {
        this.stepNo++;
        this.flora?.update();

        // bryly: balistyka fake-3D (z = wysokosc; sprite = ziemia - z; cien na ziemi)
        for (const c of this.chunks) {
            if (!c.on) continue;
            if (c.rest > 0) {
                c.rest--;
                if (c.rest < 60) c.spr.alpha = c.rest / 60;
                if (c.rest === 0) { c.on = false; c.spr.visible = c.sh.visible = false; }
                continue;
            }
            c.x += c.vx; c.y += c.vy; c.z += c.vz; c.vz -= 0.35;
            c.spr.rotation += c.spin;
            if (c.z <= 0) {
                c.z = 0;
                if (c.vz < -2.5) { c.vz = -c.vz * 0.35; c.vx *= 0.5; c.vy *= 0.5; }   // jedno odbicie
                else { c.vz = 0; c.rest = 240; c.sh.visible = false; }
            }
            c.spr.x = c.x; c.spr.y = c.y - c.z;
            c.spr.zIndex = c.y + 3;
            c.sh.x = c.x; c.sh.y = c.y;
            c.sh.zIndex = c.y;
            c.sh.scale.set(Math.max(0.4, 1 - c.z / 60));
        }

        // kupki gruzu i wydmy nad wrakami
        for (const list of [this.rubble, this.mounds]) {
            for (let i = list.length - 1; i >= 0; i--) {
                const f = list[i];
                f.life--;
                const age = f.max - f.life;
                if (f.grow) {
                    // 3 s zasypywania (180 krokow), potem powolne rozwianie
                    const k = Math.min(1, age / 180);
                    f.spr.scale.set(0.3 + 0.7 * k, 0.3 + 0.7 * k);
                    f.spr.alpha = age < 180 ? k : Math.min(1, f.life / 120);
                    if (age < 180 && age % 20 === 0) this.effects.spawnSoftPuff(f.spr.x, f.spr.y - 6, 0xe0c890, 0.9);
                } else {
                    f.spr.alpha = Math.min(1, f.life / 90);
                }
                if (f.life <= 0) { f.spr.destroy(); list.splice(i, 1); }
            }
        }

        if (player) this.updatePlayerFx(player);
        this.updateDevil(camX, camY, viewW, viewH);
    }

    private updatePlayerFx(p: { x: number; y: number; isMoving: boolean }): void {
        // 5a. staw oazy: rozbryzg przy wjezdzie, kregi przy jezdzie
        const inPond = this.oases.some(o => o.isPointInPond(p.x, p.y));
        if (inPond && !this.wasInPond) {
            this.effects.spawnShockwaveRing(p.x, p.y, 50, 0xc8eaff);
            for (let i = 0; i < 3; i++) this.effects.spawnEnemyHitSparks(p.x, p.y, 0xc8eaff);
            this.audio.playSplash();
        } else if (inPond && p.isMoving && this.stepNo % 12 === 0) {
            this.effects.spawnShockwaveRing(p.x, p.y, 32, 0xc8eaff);
            this.effects.spawnEnemyHitSparks(p.x, p.y, 0xe0f4ff);
        }
        this.wasInPond = inPond;

        // 5b. ruchome piaski: piasek sypie sie na kadlub (czolg „zapada sie")
        if (this.stepNo % 7 === 0 && this.quicksands.some(q => q.isPointInside(p.x, p.y))) {
            this.effects.spawnSoftPuff(p.x + (ambientRng.next() - 0.5) * 30, p.y - 10, 0xc8a878, 0.9);
            this.effects.spawnSoftPuff(p.x + (ambientRng.next() - 0.5) * 30, p.y + 8, 0x9a7848, 0.7);
        }

        // 6. most: ugiecie + skrzypienie
        const on = this.bridges.find(b => b.isOnDeck(p.x, p.y)) ?? null;
        if (on !== this.loadedBridge) {
            this.loadedBridge?.setLoaded(false);
            on?.setLoaded(true);
            this.loadedBridge = on;
        }
        if (on && p.isMoving) this.audio.playWoodCreak();
    }

    // ── 7. mini-wir piaskowy (dust devil) co ~40 s, przechodzi przez kadr ──
    private updateDevil(camX: number, camY: number, viewW: number, viewH: number): void {
        const d = this.devil;
        if (!d) {
            if (--this.devilCooldown > 0 || !this.texDevil || viewW <= 0) return;
            this.devilCooldown = 2400;
            const spr = new PIXI.Sprite(this.texDevil);
            spr.anchor.set(0.5);
            const fromLeft = ambientRng.next() < 0.5;
            const x = fromLeft ? camX - 40 : camX + viewW + 40;
            const y = camY + viewH * (0.25 + ambientRng.next() * 0.5);
            spr.zIndex = 5000;                // lokalny layer; wir jest nad piaskiem, pod UI
            this.layer.addChild(spr);
            this.devil = { spr, x, y, vx: (fromLeft ? 1 : -1) * 1.6, vy: (ambientRng.next() - 0.5) * 0.6, life: 520, max: 520 };
            return;
        }
        d.life--;
        d.x += d.vx + Math.sin(this.stepNo * 0.05) * 0.6;
        d.y += d.vy;
        const age = d.max - d.life;
        d.spr.x = d.x; d.spr.y = d.y;
        d.spr.rotation += 0.22;
        d.spr.alpha = Math.min(1, age / 60, d.life / 60) * 0.85;
        d.spr.scale.set(1 + Math.sin(this.stepNo * 0.1) * 0.08);
        if (this.stepNo % 6 === 0) this.effects.spawnSoftPuff(d.x + (ambientRng.next() - 0.5) * 30, d.y - 8, 0xe8cc94, 1.1);
        if (d.life <= 0) { d.spr.destroy(); this.devil = null; }
    }

    public destroy(): void {
        this.loadedBridge?.setLoaded(false);
        if (DesertJuice.active === this) DesertJuice.active = null;
    }
}
