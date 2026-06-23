import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { Bullet } from '../../entities/Bullet';

/**
 * v0.54.0 — HoloTurbine (Hiper-Turbina z Glitchujacym Holo-Billboardem).
 * v0.54.1 — AAA juice pass: housing color-bleed glow, intake inner shadow (depth),
 *           projector micro-sparks (physical<->glitch link), side heat-venting.
 *
 * Gigantyczny przemyslowy wentylator chlodzacy osadzony w ziemi, nad ktorym unosi sie
 * zepsuty hologram reklamujacy dawno nieistniejaca korporacje zbrojeniowa (obracajacy sie
 * neonowy shuriken). Hologram glitchuje, przerywa, ma mocny chromatic aberration.
 * 100% niezniszczalny ciezki cover (twarda kolizja jak CyberBuilding / SludgeReactor).
 *
 * Architektura zgodna z AntiGravScrap.ts / SludgeReactor.ts:
 *   - Constructor(x, y, parent) — x,y = top-left obudowy (footprint kolizji)
 *   - Implements ICollidable — push do buildings + solidBuildings
 *   - update(camX, camY, viewW, viewH, bullets?) — driven dedykowana petla (z bullets);
 *     wywolanie z buildings.forEach (bez bullets) = early-return (anti-double-update)
 *   - setPlayerNear(px, py) — EXCITED gdy gracz < 200 px (szybszy spin + wiecej kurzu/ventow)
 *
 * DUAL HITBOX:
 *   - Obudowa (footprint x/y/w/h): SOLID. Strzal = zloty deszcz iskier (spawarka), blocked.
 *   - Hologram: WIRTUALNY AABB nad obudowa, NON-SOLID. Pocisk przelatuje (read-only) =
 *     mocny glitch + niebieskie micro-sparks z emitera (v0.54.1).
 *
 * AAA juice (v0.54.1, wszystko bez shaderow):
 *   1. housingGlowGfx (ADD): obudowa lapie blekitne swiatlo holo; podczas glitcha
 *      ostre rozblyski + tint cyan<->red (color bleeding zsynchronizowany z holo).
 *   2. intakeShadowGfx (masked crescent): otwor rzuca cien do wewnatrz na lopaty = glebia szybu.
 *   3. beam micro-sparks: holo hit -> 1-2 niebieskie iskry u podstawy emitera (fizycznosc).
 *   4. heat venting: boczne vent-slits wyrzucaja poziome puffy powietrza (zasys->wyrzut loop).
 *
 * Dwa kontenery (correct depth):
 *   - baseContainer (zIndex = y+h): obudowa + glow + turbina + intake shadow + kurz + venty + iskry.
 *   - holoContainer (zIndex = 8000): hologram + beam. ZAWSZE na wierzchu.
 */

const COLOR_IRON_DARK = 0x24242c;
const COLOR_IRON_MID = 0x34343e;
const COLOR_IRON_LIGHT = 0x4e4e5a;
const COLOR_HAZARD = 0xf1c40f;
const COLOR_RUST = 0x6b3a1f;
const COLOR_BLADE = 0x3a3a44;
const COLOR_BLADE_EDGE = 0x6a6a78;
const COLOR_INTAKE_DARK = 0x0a0a10;
const COLOR_DUST = 0x66ddff;
const COLOR_SPARK_HOT = 0xffe14a;
const COLOR_SPARK_COOL = 0xff8a1e;
const COLOR_HOLO_BASE = 0x33ccff;
const COLOR_HOLO_R = 0xff3366;
const COLOR_HOLO_B = 0x33ffee;
const COLOR_HOLO_BEAM = 0x44bbff;

const HIT_FLASH_DURATION = 30;
const GLITCH_DURATION = 24;
const PROXIMITY_RADIUS = 200;
const PROXIMITY_RADIUS_SQ = PROXIMITY_RADIUS * PROXIMITY_RADIUS;

const BLADE_COUNT = 6;
const SPIN_SPEED_IDLE = 0.42;
const SPIN_SPEED_EXCITED = 0.62;

const VENT_INTERVAL_IDLE = 15;    // frames miedzy wyrzutami
const VENT_INTERVAL_EXCITED = 8;

interface DustParticle {
    angle: number;
    dist: number;
    speed: number;
    size: number;
    alpha: number;
}

interface Spark {
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    maxAge: number;
    size: number;
    beam: boolean;   // true = niebieska iskra emitera (v0.54.1), false = welding spawarka
}

interface VentPuff {
    x: number;
    y: number;
    vx: number;
    w: number;
    h: number;
    age: number;
    maxAge: number;
}

export class HoloTurbine implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private baseContainer: PIXI.Container;
    private holoContainer: PIXI.Container;
    private shadowGfx: PIXI.Graphics;       // baked
    private housingGfx: PIXI.Graphics;      // baked
    private housingGlowGfx: PIXI.Graphics;  // baked shape, animated alpha+tint (v0.54.1 #1)
    private ventGfx: PIXI.Graphics;         // animated (v0.54.1 #4)
    private turbineGfx: PIXI.Graphics;      // animated
    private intakeShadowGfx: PIXI.Graphics; // baked, masked crescent (v0.54.1 #2)
    private intakeMaskGfx: PIXI.Graphics;   // mask dla intakeShadow
    private dustGfx: PIXI.Graphics;         // animated
    private sparkGfx: PIXI.Graphics;        // animated
    private holoGfx: PIXI.Graphics;         // animated, ADD

    private dust: DustParticle[] = [];
    private sparks: Spark[] = [];
    private vents: VentPuff[] = [];

    private animTime: number = 0;
    private bladeAngle: number = 0;
    private hitFlashTimer: number = 0;
    private glitchTimer: number = 0;
    private isPlayerNear: boolean = false;
    private dustCooldown: number = 0;
    private ventCooldown: number = 0;

    private readonly cx: number;
    private readonly cy: number;
    private readonly intakeR: number;

    private readonly holoWorldL: number;
    private readonly holoWorldR: number;
    private readonly holoWorldT: number;
    private readonly holoWorldB: number;
    private readonly holoLocalX: number;
    private readonly holoLocalY: number;

    private housingHitBullets: WeakSet<Bullet> = new WeakSet();
    private holoHitBullets: WeakSet<Bullet> = new WeakSet();

    constructor(x: number, y: number, parent: PIXI.Container) {
        this.x = x;
        this.y = y;
        this.w = 110;
        this.h = 64;

        this.cx = this.w / 2;
        this.cy = 30;
        this.intakeR = 26;

        this.holoLocalX = this.w / 2;
        this.holoLocalY = -88;
        this.holoWorldL = x + 10;
        this.holoWorldR = x + this.w - 10;
        this.holoWorldT = y - 118;
        this.holoWorldB = y - 58;

        this.baseContainer = new PIXI.Container();
        this.baseContainer.x = x;
        this.baseContainer.y = y;
        this.baseContainer.zIndex = y + this.h;
        this.baseContainer.sortableChildren = true;
        parent.addChild(this.baseContainer);

        this.holoContainer = new PIXI.Container();
        this.holoContainer.x = x;
        this.holoContainer.y = y;
        this.holoContainer.zIndex = 8000;
        parent.addChild(this.holoContainer);

        this.shadowGfx = new PIXI.Graphics();
        this.shadowGfx.zIndex = -1;
        this.housingGfx = new PIXI.Graphics();
        this.housingGfx.zIndex = 0;
        this.housingGlowGfx = new PIXI.Graphics();   // v0.54.1 #1 — nad housing, pod turbine
        this.housingGlowGfx.zIndex = 0.4;
        this.housingGlowGfx.blendMode = PIXI.BLEND_MODES.ADD;
        this.ventGfx = new PIXI.Graphics();          // v0.54.1 #4
        this.ventGfx.zIndex = 0.6;
        this.ventGfx.blendMode = PIXI.BLEND_MODES.ADD;
        this.turbineGfx = new PIXI.Graphics();
        this.turbineGfx.zIndex = 1;
        this.intakeShadowGfx = new PIXI.Graphics();  // v0.54.1 #2 — nad turbine, pod dust
        this.intakeShadowGfx.zIndex = 1.5;
        this.intakeMaskGfx = new PIXI.Graphics();
        this.dustGfx = new PIXI.Graphics();
        this.dustGfx.zIndex = 2;
        this.sparkGfx = new PIXI.Graphics();
        this.sparkGfx.zIndex = 3;

        this.baseContainer.addChild(this.shadowGfx);
        this.baseContainer.addChild(this.housingGfx);
        this.baseContainer.addChild(this.housingGlowGfx);
        this.baseContainer.addChild(this.ventGfx);
        this.baseContainer.addChild(this.turbineGfx);
        this.baseContainer.addChild(this.intakeShadowGfx);
        this.baseContainer.addChild(this.intakeMaskGfx); // mask (nie renderowany)
        this.baseContainer.addChild(this.dustGfx);
        this.baseContainer.addChild(this.sparkGfx);

        this.holoGfx = new PIXI.Graphics();
        this.holoGfx.blendMode = PIXI.BLEND_MODES.ADD;
        this.holoContainer.addChild(this.holoGfx);

        this.drawShadow();
        this.drawHousing();
        this.drawHousingGlow();   // v0.54.1 #1
        this.drawIntakeShadow();  // v0.54.1 #2
    }

    private drawShadow(): void {
        const gy = this.h;
        this.shadowGfx.beginFill(0x000000, 0.42);
        this.shadowGfx.drawEllipse(this.cx, gy, this.w * 0.46, 10);
        this.shadowGfx.endFill();
        this.shadowGfx.beginFill(0x000000, 0.22);
        this.shadowGfx.drawEllipse(this.cx, gy, this.w * 0.56, 13);
        this.shadowGfx.endFill();
    }

    private drawHousing(): void {
        const g = this.housingGfx;
        const W = this.w;
        const H = this.h;

        g.beginFill(COLOR_IRON_LIGHT, 1);
        g.drawRoundedRect(2, 6, W * 0.34, H - 8, 6);
        g.endFill();
        g.beginFill(COLOR_IRON_MID, 1);
        g.drawRoundedRect(2 + W * 0.32, 6, W * 0.36, H - 8, 6);
        g.endFill();
        g.beginFill(COLOR_IRON_DARK, 1);
        g.drawRoundedRect(2 + W * 0.66, 6, W * 0.32, H - 8, 6);
        g.endFill();

        g.lineStyle(1.4, COLOR_IRON_LIGHT, 0.85);
        g.moveTo(8, 8); g.lineTo(W - 8, 8);
        g.lineStyle(0);

        const stripeY = H - 12;
        for (let sx = 4; sx < W - 8; sx += 12) {
            g.beginFill(COLOR_HAZARD, 0.9);
            g.drawPolygon([sx, stripeY, sx + 6, stripeY, sx, stripeY + 8, sx - 6, stripeY + 8]);
            g.endFill();
        }
        g.beginFill(0x101014, 0.45);
        g.drawRect(0, H - 4, W, 4);
        g.endFill();

        g.beginFill(COLOR_INTAKE_DARK, 1);
        g.drawCircle(this.cx, this.cy, this.intakeR);
        g.endFill();
        g.beginFill(0x16161e, 1);
        g.drawCircle(this.cx, this.cy, this.intakeR - 5);
        g.endFill();

        g.lineStyle(4, COLOR_IRON_DARK, 1);
        g.drawCircle(this.cx, this.cy, this.intakeR + 1);
        g.lineStyle(1.5, COLOR_IRON_LIGHT, 0.8);
        g.drawCircle(this.cx, this.cy, this.intakeR + 3);
        g.lineStyle(0);

        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const bx = this.cx + Math.cos(a) * (this.intakeR + 5);
            const by = this.cy + Math.sin(a) * (this.intakeR + 5);
            g.beginFill(0x101014, 0.8); g.drawCircle(bx + 0.5, by + 0.5, 2); g.endFill();
            g.beginFill(0x4a4a54, 1);   g.drawCircle(bx, by, 1.6); g.endFill();
            g.beginFill(0x8a8a96, 1);   g.drawCircle(bx - 0.5, by - 0.5, 0.7); g.endFill();
        }

        // Vent slits po bokach (zrodlo heat venting v0.54.1 #4)
        g.lineStyle(2, 0x101014, 0.7);
        for (let i = 0; i < 3; i++) {
            const vy = 16 + i * 8;
            g.moveTo(6, vy); g.lineTo(16, vy);
            g.moveTo(W - 16, vy); g.lineTo(W - 6, vy);
        }
        g.lineStyle(0);

        g.beginFill(COLOR_RUST, 0.5);
        g.drawCircle(14, 46, 3);
        g.drawCircle(W - 18, 20, 2.4);
        g.endFill();
    }

    /**
     * v0.54.1 #1 — Color bleeding. Bakowany glow (bialy, recolor przez .tint, ADD blend)
     * skupiony wokol intake + gornej krawedzi (gdzie pada swiatlo holo). Alpha+tint animowane
     * w update: oddycha w idle, ostre rozblyski + cyan<->red podczas glitcha.
     */
    private drawHousingGlow(): void {
        const g = this.housingGlowGfx;
        const W = this.w;
        // soft glow pool (bialy — tint recolors). Kilka warstw = miekka poswiata.
        g.beginFill(0xffffff, 0.5);
        g.drawCircle(this.cx, this.cy, this.intakeR + 6);
        g.endFill();
        g.beginFill(0xffffff, 0.28);
        g.drawCircle(this.cx, this.cy, this.intakeR + 14);
        g.endFill();
        g.beginFill(0xffffff, 0.30);
        g.drawEllipse(this.cx, 12, W * 0.40, 11); // gorna krawedz lapie swiatlo z gory (holo)
        g.endFill();
        this.housingGlowGfx.tint = COLOR_HOLO_BASE;
        this.housingGlowGfx.alpha = 0.15;
    }

    /**
     * v0.54.1 #2 — Inner cast shadow szybu. Ciemne koło offsetowane w dol-prawo,
     * przyciete maska do okregu intake => asymetryczny polksiezyc na lopatach.
     * Daje wrazenie glebokiego cylindra (lopaty wchodza w cien).
     */
    private drawIntakeShadow(): void {
        // mask = okrag intake (tylko wnetrze otworu pokazuje cien)
        this.intakeMaskGfx.beginFill(0xffffff, 1);
        this.intakeMaskGfx.drawCircle(this.cx, this.cy, this.intakeR - 2);
        this.intakeMaskGfx.endFill();

        // cien = ciemne koło offset dol-prawo (2 warstwy dla soft edge)
        this.intakeShadowGfx.beginFill(0x000000, 0.5);
        this.intakeShadowGfx.drawCircle(this.cx + 10, this.cy + 10, this.intakeR);
        this.intakeShadowGfx.endFill();
        this.intakeShadowGfx.beginFill(0x000000, 0.32);
        this.intakeShadowGfx.drawCircle(this.cx + 6, this.cy + 6, this.intakeR);
        this.intakeShadowGfx.endFill();

        this.intakeShadowGfx.mask = this.intakeMaskGfx;
    }

    private drawTurbine(): void {
        const g = this.turbineGfx;
        g.clear();

        const echoes = 4;
        for (let e = echoes - 1; e >= 0; e--) {
            const angOffset = -e * 0.16;
            const alpha = e === 0 ? 1.0 : 0.18 * (echoes - e) / echoes;
            this.drawBlades(g, this.bladeAngle + angOffset, alpha);
        }

        g.beginFill(COLOR_IRON_LIGHT, 1);
        g.drawCircle(this.cx, this.cy, 5);
        g.endFill();
        g.beginFill(COLOR_IRON_DARK, 1);
        g.drawCircle(this.cx, this.cy, 3);
        g.endFill();
        g.beginFill(0x8a8a96, 0.9);
        g.drawCircle(this.cx - 1, this.cy - 1, 1.2);
        g.endFill();
    }

    private drawBlades(g: PIXI.Graphics, baseAngle: number, alpha: number): void {
        for (let i = 0; i < BLADE_COUNT; i++) {
            const a = baseAngle + (i / BLADE_COUNT) * Math.PI * 2;
            const r = this.intakeR - 3;
            const ax = this.cx + Math.cos(a) * 5;
            const ay = this.cy + Math.sin(a) * 5;
            const tipA = a + 0.35;
            const tx = this.cx + Math.cos(tipA) * r;
            const ty = this.cy + Math.sin(tipA) * r;
            const perpA = a + Math.PI / 2;
            const wBlade = 3.2;
            const bx1 = ax + Math.cos(perpA) * wBlade;
            const by1 = ay + Math.sin(perpA) * wBlade;
            const bx2 = ax - Math.cos(perpA) * wBlade;
            const by2 = ay - Math.sin(perpA) * wBlade;
            g.beginFill(COLOR_BLADE, alpha);
            g.drawPolygon([bx1, by1, bx2, by2, tx, ty]);
            g.endFill();
            if (alpha > 0.5) {
                g.lineStyle(0.8, COLOR_BLADE_EDGE, alpha * 0.8);
                g.moveTo(bx1, by1); g.lineTo(tx, ty);
                g.lineStyle(0);
            }
        }
    }

    private spawnDust(): void {
        const a = Math.random() * Math.PI * 2;
        this.dust.push({
            angle: a,
            dist: this.intakeR + 18 + Math.random() * 22,
            speed: 0.8 + Math.random() * 0.7,
            size: 1 + Math.random() * 1.4,
            alpha: 0.5 + Math.random() * 0.4,
        });
    }

    private updateDust(delta: number): void {
        this.dustGfx.clear();
        for (let i = this.dust.length - 1; i >= 0; i--) {
            const p = this.dust[i];
            p.dist -= p.speed * delta;
            if (p.dist <= 4) { this.dust.splice(i, 1); continue; }
            const px = this.cx + Math.cos(p.angle) * p.dist;
            const py = this.cy + Math.sin(p.angle) * p.dist;
            const fade = Math.min(1, (p.dist - 4) / 20);
            this.dustGfx.beginFill(COLOR_DUST, p.alpha * fade);
            this.dustGfx.drawRect(px - p.size / 2, py - p.size / 2, p.size, p.size);
            this.dustGfx.endFill();
        }
    }

    /**
     * v0.54.1 #4 — Heat venting. Wyrzut z bocznych vent-slits: poziomy puff w lewo/prawo,
     * szybki + fade. EXCITED = agresywniej. Dopelnia loop: zasys (dust) -> wyrzut (vent).
     */
    private spawnVentBurst(): void {
        const excited = this.isPlayerNear;
        const speedMul = excited ? 1.7 : 1.0;
        // lewy puff (z lewych slits)
        this.vents.push({
            x: 6, y: 16 + Math.floor(Math.random() * 3) * 8,
            vx: -(0.9 + Math.random() * 0.8) * speedMul,
            w: 6 + Math.random() * 6, h: 2 + Math.random() * 2,
            age: 0, maxAge: 18 + Math.random() * 10,
        });
        // prawy puff (z prawych slits)
        this.vents.push({
            x: this.w - 6, y: 16 + Math.floor(Math.random() * 3) * 8,
            vx: (0.9 + Math.random() * 0.8) * speedMul,
            w: 6 + Math.random() * 6, h: 2 + Math.random() * 2,
            age: 0, maxAge: 18 + Math.random() * 10,
        });
    }

    private updateVents(delta: number): void {
        this.ventGfx.clear();
        for (let i = this.vents.length - 1; i >= 0; i--) {
            const v = this.vents[i];
            v.age += delta;
            if (v.age >= v.maxAge) { this.vents.splice(i, 1); continue; }
            v.x += v.vx * delta;
            const lifeT = v.age / v.maxAge;
            const alpha = (1 - lifeT) * 0.28;          // bardzo przezroczyste
            const stretch = 1 + lifeT * 1.5;            // rozciaga sie jak leci
            const drawW = v.w * stretch;
            // dla puffa lecacego w lewo rysuj prostokat rozciagniety w lewo od x
            const drawX = v.vx < 0 ? v.x - drawW : v.x;
            this.ventGfx.beginFill(0xddf4ff, alpha);
            this.ventGfx.drawRect(drawX, v.y - v.h / 2, drawW, v.h);
            this.ventGfx.endFill();
        }
    }

    private spawnWeldingSparks(localHitX: number, localHitY: number): void {
        const count = 9 + Math.floor(Math.random() * 5);
        for (let i = 0; i < count; i++) {
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
            const spd = 1.2 + Math.random() * 2.2;
            this.sparks.push({
                x: localHitX + (Math.random() - 0.5) * 5,
                y: localHitY,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                age: 0,
                maxAge: 28 + Math.random() * 22,
                size: 1.3 + Math.random() * 1.5,
                beam: false,
            });
        }
    }

    /**
     * v0.54.1 #3 — Projector micro-sparks. 1-2 niebieskie iskry u podstawy emitera
     * (gorny srodek obudowy, skad bije beam). Wiaze fizyczny projektor z wirtualnym glitchem.
     */
    private spawnBeamSparks(): void {
        const count = 1 + Math.floor(Math.random() * 2);
        const ex = this.cx;       // emiter: gorny srodek obudowy
        const ey = 6;
        for (let i = 0; i < count; i++) {
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
            const spd = 0.8 + Math.random() * 1.2;
            this.sparks.push({
                x: ex + (Math.random() - 0.5) * 6,
                y: ey,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                age: 0,
                maxAge: 16 + Math.random() * 12,
                size: 1.0 + Math.random() * 1.0,
                beam: true,
            });
        }
    }

    private updateSparks(delta: number): void {
        this.sparkGfx.clear();
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.age += delta;
            if (s.age >= s.maxAge) { this.sparks.splice(i, 1); continue; }
            s.vy += 0.12 * delta;
            s.vx *= 0.97;
            s.x += s.vx * delta;
            s.y += s.vy * delta;
            const lifeT = s.age / s.maxAge;
            const alpha = (1 - lifeT) * 0.95;
            let color: number;
            if (s.beam) {
                color = COLOR_HOLO_BEAM; // niebieska iskra emitera
            } else {
                color = lifeT < 0.45 ? COLOR_SPARK_HOT : COLOR_SPARK_COOL;
            }
            this.sparkGfx.beginFill(color, alpha);
            this.sparkGfx.drawCircle(s.x, s.y, s.size);
            this.sparkGfx.endFill();
            this.sparkGfx.beginFill(color, alpha * 0.4);
            this.sparkGfx.drawCircle(s.x - s.vx, s.y - s.vy, s.size * 0.6);
            this.sparkGfx.endFill();
        }
    }

    private drawShuriken(ox: number, oy: number, rot: number, color: number, alpha: number, scale: number): void {
        const g = this.holoGfx;
        const cx = this.holoLocalX + ox;
        const cy = this.holoLocalY + oy;
        const R = 26 * scale;
        const r = 9 * scale;
        const pts: number[] = [];
        for (let i = 0; i < 4; i++) {
            const aOut = rot + (i / 4) * Math.PI * 2;
            const aIn = aOut + Math.PI / 4;
            pts.push(cx + Math.cos(aOut) * R, cy + Math.sin(aOut) * R);
            pts.push(cx + Math.cos(aIn) * r, cy + Math.sin(aIn) * r);
        }
        g.beginFill(color, alpha);
        g.drawPolygon(pts);
        g.endFill();
        g.beginFill(0x000000, alpha * 0.6);
        g.drawCircle(cx, cy, 3 * scale);
        g.endFill();
    }

    private drawHologram(): void {
        const g = this.holoGfx;
        g.clear();

        const glitching = this.glitchTimer > 0;
        const ambientGlitch = Math.random() < 0.04;

        if (glitching && Math.random() < 0.18) {
            return;
        }

        const beamTopY = this.holoLocalY + 24;
        const beamBotY = -6;
        g.beginFill(COLOR_HOLO_BEAM, glitching ? 0.06 : 0.10);
        g.drawPolygon([
            this.holoLocalX - 6, beamBotY,
            this.holoLocalX + 6, beamBotY,
            this.holoLocalX + 22, beamTopY,
            this.holoLocalX - 22, beamTopY,
        ]);
        g.endFill();

        let off = 1.6;
        if (glitching) off = 4 + Math.random() * 4;
        else if (ambientGlitch) off = 2.5 + Math.random() * 1.5;
        const jx = glitching ? (Math.random() - 0.5) * 6 : 0;
        const jy = glitching ? (Math.random() - 0.5) * 3 : 0;

        const rot = this.animTime * 0.8;
        const scale = glitching ? 1 + (Math.random() - 0.5) * 0.2 : 1;

        this.drawShuriken(jx - off, jy, rot, COLOR_HOLO_R, 0.55, scale);
        this.drawShuriken(jx + off, jy, rot, COLOR_HOLO_B, 0.55, scale);
        this.drawShuriken(jx, jy, rot, COLOR_HOLO_BASE, 0.85, scale);

        const holoTop = this.holoLocalY - 30;
        const holoBot = this.holoLocalY + 30;
        const holoL = this.holoLocalX - 32;
        const holoR = this.holoLocalX + 32;
        g.lineStyle(1, 0x001018, 0.35);
        for (let ly = holoTop; ly < holoBot; ly += 3) {
            g.moveTo(holoL, ly); g.lineTo(holoR, ly);
        }
        g.lineStyle(0);

        if (glitching) {
            const slices = 2 + Math.floor(Math.random() * 3);
            for (let s = 0; s < slices; s++) {
                const sy = holoTop + Math.random() * (holoBot - holoTop);
                const sh = 2 + Math.random() * 4;
                const shift = (Math.random() - 0.5) * 18;
                g.beginFill(Math.random() < 0.5 ? COLOR_HOLO_R : COLOR_HOLO_B, 0.5);
                g.drawRect(holoL + shift, sy, (holoR - holoL), sh);
                g.endFill();
            }
        }
    }

    private checkHousingHits(bullets: Bullet[]): void {
        const L = this.x, R = this.x + this.w, T = this.y, B = this.y + this.h;
        for (const b of bullets) {
            if (!b.active) continue;
            if (this.housingHitBullets.has(b)) continue;
            const br = b.radius ?? 4;
            if (b.x + br < L || b.x - br > R) continue;
            if (b.y + br < T || b.y - br > B) continue;
            this.housingHitBullets.add(b);
            this.hitFlashTimer = HIT_FLASH_DURATION;
            this.spawnWeldingSparks(b.x - this.x, b.y - this.y);
        }
    }

    private checkHoloHits(bullets: Bullet[]): void {
        for (const b of bullets) {
            if (!b.active) continue;
            if (this.holoHitBullets.has(b)) continue;
            if (b.x < this.holoWorldL || b.x > this.holoWorldR) continue;
            if (b.y < this.holoWorldT || b.y > this.holoWorldB) continue;
            this.holoHitBullets.add(b);
            this.glitchTimer = GLITCH_DURATION;
            this.spawnBeamSparks(); // v0.54.1 #3 — fizyczny link
        }
    }

    update(_camX: number, _camY: number, _viewW: number, _viewH: number, bullets?: Bullet[]): void {
        if (!bullets) return;

        this.animTime += 0.016;

        if (this.hitFlashTimer > 0) this.hitFlashTimer--;
        if (this.glitchTimer > 0) this.glitchTimer--;

        const spin = this.isPlayerNear ? SPIN_SPEED_EXCITED : SPIN_SPEED_IDLE;
        this.bladeAngle += spin;

        // v0.54.1 #1 — color bleeding na obudowie
        if (this.glitchTimer > 0) {
            // ostre rozblyski + cyan<->red sync z holo
            this.housingGlowGfx.alpha = Math.random() > 0.5 ? 0.4 : 0.05;
            this.housingGlowGfx.tint = Math.random() < 0.5 ? COLOR_HOLO_R : COLOR_HOLO_B;
        } else {
            this.housingGlowGfx.alpha = 0.15 + 0.05 * Math.sin(this.animTime * 2);
            this.housingGlowGfx.tint = COLOR_HOLO_BASE;
        }

        // Housing shake przy HIT obudowy
        if (this.hitFlashTimer > 0) {
            const s = (this.hitFlashTimer / HIT_FLASH_DURATION) * 2.5;
            this.baseContainer.x = this.x + (Math.random() - 0.5) * 2 * s;
            this.baseContainer.y = this.y + (Math.random() - 0.5) * 2 * s;
        } else {
            this.baseContainer.x = this.x;
            this.baseContainer.y = this.y;
        }

        // Dust (zasys)
        this.dustCooldown -= 1;
        if (this.dustCooldown <= 0) {
            this.spawnDust();
            this.dustCooldown = this.isPlayerNear ? 2 + Math.floor(Math.random() * 3)
                                                  : 5 + Math.floor(Math.random() * 5);
        }

        // v0.54.1 #4 — Heat venting (wyrzut)
        this.ventCooldown -= 1;
        if (this.ventCooldown <= 0) {
            this.spawnVentBurst();
            this.ventCooldown = this.isPlayerNear ? VENT_INTERVAL_EXCITED : VENT_INTERVAL_IDLE;
        }

        this.checkHousingHits(bullets);
        this.checkHoloHits(bullets);

        this.drawTurbine();
        this.updateVents(1.0);
        this.updateDust(1.0);
        this.updateSparks(1.0);
        this.drawHologram();
    }

    setPlayerNear(playerX: number, playerY: number): void {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const dx = playerX - cx;
        const dy = playerY - cy;
        this.isPlayerNear = (dx * dx + dy * dy) < PROXIMITY_RADIUS_SQ;
    }

    destroy(): void {
        this.baseContainer.destroy({ children: true });
        this.holoContainer.destroy({ children: true });
    }
}