import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { Bullet } from '../../entities/Bullet';

/**
 * v0.53.0 — AntiGravScrap (Magnetyczna Zgniatarka Zlomu / Levitating Hover-Scrap Pile).
 *
 * Przedmiescia cyberpunku = wysypiska technologii. Uszkodzona wieza antygrawitacyjna
 * utrzymuje w powietrzu zlep metalu: spalony dron dostawczy, czesci starych mechow,
 * cybernetyczna proteza. Calosc LEWITUJE kilkanascie px nad ziemia i powoli faluje.
 * 100% niezniszczalny solid cover (twarda kolizja jak CyberBuilding / SludgeReactor).
 *
 * Differentiator: lewitacja to jedyny taki obiekt na mapie — zaden inny sie nie unosi.
 * Cien zostaje NA ZIEMI (nie buja sie z obiektem) — przerwa miedzy bujajacym sie
 * zlomem a statycznym cieniem to cala iluzja float (lekcja z pivot/shadow reaktora).
 *
 * Architektura zgodna z SludgeReactor.ts (analog niezniszczalny):
 *   - Constructor(x, y, parent) — dodaje siebie do worldContainer
 *   - Implements ICollidable (x, y, w, h, update) — push do buildings + solidBuildings
 *   - update(camX, camY, viewW, viewH, bullets?) — driven przez dedykowana petle w main.ts
 *     (ta przekazuje bullets). Wywolanie z buildings.forEach (bez bullets) = early-return
 *     no-op, zeby NIE robic double-update (buildings.forEach + petla dedykowana).
 *   - setPlayerNear(px, py) — EXCITED state gdy gracz < 200 px
 *
 * Kolizja: solid dla pociskow I czolgow (push do buildings + solidBuildings). Pocisk
 * uderzajacy w footprint AABB jest BLOKOWANY (nie przelatuje pod spodem) — swiadoma
 * decyzja balansowa. Hover gap jest czysto kosmetyczny (footprint = ground projection).
 *
 * Stany animacji:
 *   - IDLE (default): bob (sin ~0.8 Hz), pole magnetyczne pulsuje, rzadkie mikro-iskry odpadaja
 *   - EXCITED (gracz < 200 px): bob szybszy/wyzszy, czestsze iskry, sporadyczne luki
 *   - HIT (bullet collision, ~36 frame timer): violent shake zlomu, jaskrawe blekitne
 *     luki elektryczne miedzy elementami, burst iskier z miejsca trafienia
 *
 * Visual layers (zIndex w container, sortableChildren):
 *   -1: shadowGfx (cien na ziemi — NIE buja sie, modulowany scale/alpha inverse do bob)
 *    0: fieldGfx (pole antygraw — cyan glow ellipse u podstawy, pulsuje)
 *    1: hoverContainer { scrapGfx (baked) + arcsGfx (animowane) } — TO sie buja
 *  +250: sparkGfx (iskry — spadaja na ziemie niezaleznie, NIE buja sie)
 *
 * MVP scope: brak audio (dodane w polish phase v0.53.x). Brak per-frame chromatic na
 * lukach — sam cyan core + glow wystarcza.
 */

const COLOR_METAL_DARK = 0x2a2a30;   // ciemny korpus
const COLOR_METAL_MID = 0x3c3c46;    // sredni metal
const COLOR_METAL_LIGHT = 0x55555f;  // highlight upper-left
const COLOR_RUST = 0x6b3a1f;         // rdza (mech parts)
const COLOR_RUST_DARK = 0x3a1f0e;    // ciemna rdza / plamy
const COLOR_CYBER = 0xcfd6dd;        // cyber-proteza (jasny panel)
const COLOR_DRONE_DOME = 0x2a4a55;   // martwa kopula sensora (przygaszony cyan)
const COLOR_ARC = 0x66ddff;          // luk elektryczny (cyan)
const COLOR_ARC_CORE = 0xeaffff;     // rdzen luku (bialo-cyan)
const COLOR_FIELD = 0x44bbff;        // pole antygraw glow
const COLOR_SPARK_HOT = 0xffd24a;    // iskra hot (zolta)
const COLOR_SPARK_COOL = 0xff6a1e;   // iskra cool (pomaranczowa)

const HIT_FLASH_DURATION = 36;       // frames (~600 ms @ 60 fps)
const PROXIMITY_RADIUS = 200;        // px — gracz w tym zasiegu = EXCITED
const PROXIMITY_RADIUS_SQ = PROXIMITY_RADIUS * PROXIMITY_RADIUS;

const HOVER_GAP = 16;                // px — bazowy unos zlomu nad footprint
const BOB_AMP = 4;                   // px — amplituda falowania
const BOB_FREQ_IDLE = 1.6;           // rad/s
const BOB_FREQ_EXCITED = 2.4;

interface ScrapNode {
    x: number;   // local (w hoverContainer) — punkt zaczepienia lukow / odpryskow iskier
    y: number;
}

interface Spark {
    x: number;   // container-local (NIE hover — iskra spada niezaleznie)
    y: number;
    vx: number;
    vy: number;
    age: number;
    maxAge: number;
    size: number;
    landed: boolean;
}

interface ImpactRing {
    x: number;
    age: number;
    maxAge: number;
}

export class AntiGravScrap implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private container: PIXI.Container;
    private shadowGfx: PIXI.Graphics;   // static-ish (modulowany w update)
    private fieldGfx: PIXI.Graphics;    // animated (pulse)
    private hoverContainer: PIXI.Container; // buja sie (scrap + arcs)
    private scrapGfx: PIXI.Graphics;    // baked once
    private arcsGfx: PIXI.Graphics;     // animated
    private sparkGfx: PIXI.Graphics;    // animated (na container, nie hover)

    private nodes: ScrapNode[] = [];
    private sparks: Spark[] = [];
    private impactRings: ImpactRing[] = [];

    private animTime: number = 0;
    private hitFlashTimer: number = 0;
    private isPlayerNear: boolean = false;
    private hoverY: number = -HOVER_GAP;        // biezacy offset hoverContainer.y (negatywny = w gore)
    private sparkCooldown: number = 0;

    private hitBulletIds: WeakSet<Bullet> = new WeakSet();

    private readonly groundLocalY: number;      // y podloza w container-local (= h)

    constructor(x: number, y: number, parent: PIXI.Container) {
        // Footprint: 96 wide × 72 tall (przysadzista zapora). x,y = top-left.
        this.x = x;
        this.y = y;
        this.w = 96;
        this.h = 72;
        this.groundLocalY = this.h;

        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        // zIndex base = y + h (pseudo-3D depth sort, jak CyberBuilding / reactor)
        this.container.zIndex = y + this.h;
        this.container.sortableChildren = true;
        parent.addChild(this.container);

        this.shadowGfx = new PIXI.Graphics();
        this.shadowGfx.zIndex = -1;
        this.fieldGfx = new PIXI.Graphics();
        this.fieldGfx.zIndex = 0;
        this.hoverContainer = new PIXI.Container();
        this.hoverContainer.zIndex = 1;
        this.hoverContainer.sortableChildren = true;
        this.scrapGfx = new PIXI.Graphics();
        this.scrapGfx.zIndex = 0;
        this.arcsGfx = new PIXI.Graphics();
        this.arcsGfx.zIndex = 1;
        this.sparkGfx = new PIXI.Graphics();
        this.sparkGfx.zIndex = 250;

        this.hoverContainer.addChild(this.scrapGfx);
        this.hoverContainer.addChild(this.arcsGfx);
        this.container.addChild(this.shadowGfx);
        this.container.addChild(this.fieldGfx);
        this.container.addChild(this.hoverContainer);
        this.container.addChild(this.sparkGfx);

        this.initNodes();
        this.drawScrapMass();   // baked once (scrapGfx)
        this.drawShadow();      // baked once (shadowGfx, potem modulowany alpha/scale)
    }

    /**
     * Punkty zaczepienia lukow elektrycznych + miejsca odpryskow iskier.
     * Local coords w hoverContainer (przed hover offset). Rozmieszczone na
     * charakterystycznych elementach: ramiona drona, kopula, joint mecha, proteza.
     */
    private initNodes(): void {
        this.nodes = [
            { x: 22, y: 18 },  // lewe ramie drona
            { x: 74, y: 16 },  // prawe ramie drona
            { x: 48, y: 8 },   // kopula sensora (top)
            { x: 16, y: 46 },  // joint mecha (lewy dol)
            { x: 80, y: 44 },  // proteza (prawy dol)
            { x: 50, y: 52 },  // dolny srodek (najnizszy punkt — czesty spawn iskry)
        ];
    }

    /**
     * Baked scrap silhouette (scrapGfx) — rysowany RAZ w konstruktorze.
     * Warstwy od tylu (ciemne) do przodu (highlight upper-left).
     * Local 0,0 = top-left footprint; masa zlomu ~ y[-4 .. 60].
     */
    private drawScrapMass(): void {
        const g = this.scrapGfx;

        // ---- BACK CHUNKS (ciemne, "glebiej") ----
        // Bent armor plate (rdzewiala, lewy tyl)
        g.beginFill(COLOR_RUST_DARK, 1);
        g.drawPolygon([4, 40, 30, 30, 36, 54, 10, 60]);
        g.endFill();
        // Mech leg/piston (prawy tyl)
        g.beginFill(COLOR_METAL_DARK, 1);
        g.drawPolygon([66, 30, 86, 36, 84, 58, 64, 52]);
        g.endFill();

        // ---- CENTRAL HULL: spalony dron dostawczy ----
        // Korpus (rounded dark block)
        g.beginFill(COLOR_METAL_MID, 1);
        g.drawRoundedRect(26, 12, 44, 36, 7);
        g.endFill();
        // Panel lines (ciemne nacieiecia)
        g.lineStyle(1, 0x16161c, 0.7);
        g.moveTo(26, 26); g.lineTo(70, 26);
        g.moveTo(48, 12); g.lineTo(48, 48);
        g.lineStyle(0);
        // Scorch marks (osmalenia — spalony dron)
        g.beginFill(0x101014, 0.55);
        g.drawCircle(40, 22, 7);
        g.drawCircle(58, 34, 5);
        g.endFill();
        // Highlight upper-left strip on hull (light direction)
        g.beginFill(COLOR_METAL_LIGHT, 0.55);
        g.drawRoundedRect(28, 14, 18, 5, 2);
        g.endFill();

        // Rotor arms (2 ramiona z polamanymi smiglami)
        g.lineStyle(3, COLOR_METAL_DARK, 1);
        g.moveTo(30, 16); g.lineTo(18, 18);   // lewe ramie
        g.moveTo(66, 16); g.lineTo(78, 15);   // prawe ramie
        g.lineStyle(0);
        // Stuby smigiel (zlamane)
        g.beginFill(COLOR_METAL_DARK, 1);
        g.drawCircle(18, 18, 3.5);
        g.drawCircle(78, 15, 3.5);
        g.endFill();
        g.lineStyle(2, 0x16161c, 1);
        g.moveTo(18, 18); g.lineTo(12, 14);    // zlamane smiglo L
        g.moveTo(78, 15); g.lineTo(85, 12);    // zlamane smiglo R
        g.lineStyle(0);

        // Martwa kopula sensora (przygaszony cyan — dron offline)
        g.beginFill(COLOR_DRONE_DOME, 1);
        g.drawCircle(48, 10, 5);
        g.endFill();
        g.beginFill(0x86c8d8, 0.4);
        g.drawCircle(46.5, 8.5, 2);  // martwy refleks
        g.endFill();

        // ---- CYBER-PROTEZA (prawy dol, sleek panel z martwa linia swiatla) ----
        g.beginFill(COLOR_CYBER, 1);
        g.drawPolygon([72, 40, 90, 44, 86, 58, 70, 54]);
        g.endFill();
        g.lineStyle(1.4, 0x3aa0c0, 0.55); // martwa seam line (kiedys swiecila)
        g.moveTo(74, 45); g.lineTo(86, 49);
        g.lineStyle(0);

        // ---- FRONT highlights + edge detail (upper-left light) ----
        g.lineStyle(1.2, COLOR_METAL_LIGHT, 0.85);
        g.moveTo(26, 14); g.lineTo(64, 13);      // gorna krawedz korpusu (light catch)
        g.moveTo(6, 41); g.lineTo(30, 31);       // krawedz plyty pancernej
        g.lineStyle(0);

        // Bolts (z 3D shading: shadow lower-right, body, highlight upper-left)
        const bolts: Array<[number, number]> = [[33, 20], [62, 20], [33, 42], [62, 42]];
        for (const [bx, by] of bolts) {
            g.beginFill(0x101014, 0.8); g.drawCircle(bx + 0.6, by + 0.6, 2.2); g.endFill();
            g.beginFill(0x4a4a54, 1);   g.drawCircle(bx, by, 1.8); g.endFill();
            g.beginFill(0x8a8a96, 1);   g.drawCircle(bx - 0.5, by - 0.5, 0.8); g.endFill();
        }

        // Rust spots (losowe ciemne plamy na rdzewialych czesciach)
        g.beginFill(COLOR_RUST, 0.6);
        g.drawCircle(14, 48, 3);
        g.drawCircle(74, 50, 2.4);
        g.endFill();
    }

    /**
     * Baked shadow ellipse (shadowGfx). Modulowany alpha/scale w update (inverse do bob):
     * wyzej = mniejszy/jasniejszy cien = silniejsza iluzja float.
     */
    private drawShadow(): void {
        const cx = this.w / 2;
        const gy = this.groundLocalY;
        this.shadowGfx.beginFill(0x000000, 0.42);
        this.shadowGfx.drawEllipse(cx, gy, this.w * 0.42, 9);
        this.shadowGfx.endFill();
        this.shadowGfx.beginFill(0x000000, 0.22);
        this.shadowGfx.drawEllipse(cx, gy, this.w * 0.52, 12);
        this.shadowGfx.endFill();
        // pivot na centrum cienia, zeby scale szedl od srodka
        this.shadowGfx.pivot.set(cx, gy);
        this.shadowGfx.position.set(cx, gy);
    }

    /**
     * Pole antygraw — cyan glow ellipse u podstawy (emiter trzymajacy zlom).
     * Pulsuje; intensywniej w EXCITED. Rysowany per-frame (alpha + lekki scale).
     */
    private drawField(): void {
        const cx = this.w / 2;
        const gy = this.groundLocalY - 4;
        this.fieldGfx.clear();
        const pulse = 0.5 + 0.5 * Math.sin(this.animTime * (this.isPlayerNear ? 5 : 3));
        const base = this.isPlayerNear ? 0.30 : 0.18;
        const a = base + 0.12 * pulse;
        this.fieldGfx.beginFill(COLOR_FIELD, a * 0.5);
        this.fieldGfx.drawEllipse(cx, gy, this.w * 0.46, 12);
        this.fieldGfx.endFill();
        this.fieldGfx.beginFill(COLOR_FIELD, a);
        this.fieldGfx.drawEllipse(cx, gy, this.w * 0.30, 8);
        this.fieldGfx.endFill();
        this.fieldGfx.beginFill(0xcdeeff, a * 0.7);
        this.fieldGfx.drawEllipse(cx, gy, this.w * 0.16, 4);
        this.fieldGfx.endFill();
    }

    /**
     * Helper: rysuje jeden jagged luk elektryczny miedzy dwoma punktami (local hover coords).
     * Glow (gruby, przezroczysty) + core (cienki, jasny). Perpendykularny jitter na segmentach.
     */
    private drawArcBolt(x1: number, y1: number, x2: number, y2: number, glowAlpha: number): void {
        const g = this.arcsGfx;
        const segs = 4 + Math.floor(Math.random() * 3);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len; // perpendykularny unit
        const py = dx / len;
        const amp = 3 + Math.random() * 3;

        const pts: number[] = [x1, y1];
        for (let i = 1; i < segs; i++) {
            const t = i / segs;
            const jitter = (Math.random() - 0.5) * 2 * amp;
            pts.push(x1 + dx * t + px * jitter, y1 + dy * t + py * jitter);
        }
        pts.push(x2, y2);

        // Glow (gruby)
        g.lineStyle(3, COLOR_ARC, glowAlpha * 0.5);
        g.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        // Core (cienki, jasny)
        g.lineStyle(1, COLOR_ARC_CORE, glowAlpha);
        g.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        g.lineStyle(0);
    }

    /**
     * Per-frame render lukow. HIT = duzo jaskrawych, EXCITED = sporadyczne, IDLE = rzadkie dim.
     */
    private drawArcs(): void {
        this.arcsGfx.clear();
        if (this.nodes.length < 2) return;

        const spawnArc = (count: number, alpha: number) => {
            for (let k = 0; k < count; k++) {
                const a = this.nodes[Math.floor(Math.random() * this.nodes.length)];
                let b = this.nodes[Math.floor(Math.random() * this.nodes.length)];
                if (a === b) b = this.nodes[(this.nodes.indexOf(a) + 1) % this.nodes.length];
                this.drawArcBolt(a.x, a.y, b.x, b.y, alpha);
            }
        };

        if (this.hitFlashTimer > 0) {
            // HIT — co klatke 2-3 jaskrawe luki (flicker przez alpha)
            const flick = (this.hitFlashTimer % 3 === 0) ? 0.55 : 0.95;
            spawnArc(2 + Math.floor(Math.random() * 2), flick);
        } else if (this.isPlayerNear) {
            // EXCITED — ~10% szans/klatke na pojedynczy sredni luk
            if (Math.random() < 0.10) spawnArc(1, 0.6);
        } else {
            // IDLE — ~3% szans/klatke na dim luk
            if (Math.random() < 0.03) spawnArc(1, 0.32);
        }
    }

    /**
     * Spawn pojedynczej iskry odpryskujacej z dolnego node'a (mikro-srubka odpada).
     * Start w container-local coords = node + biezacy hover offset (iskra "wypada" ze zlomu).
     */
    private spawnDetachSpark(): void {
        const n = this.nodes[3 + Math.floor(Math.random() * 3)]; // dolne node'y (joint/proteza/dolny srodek)
        this.sparks.push({
            x: n.x + (Math.random() - 0.5) * 6,
            y: n.y + this.hoverY,
            vx: (Math.random() - 0.5) * 0.6,
            vy: 0.2 + Math.random() * 0.3,
            age: 0,
            maxAge: 120,
            size: 1.2 + Math.random() * 1.0,
            landed: false,
        });
    }

    /**
     * Burst iskier z miejsca trafienia (HIT). localHitX/Y w container-local.
     */
    private spawnHitSparks(localHitX: number, localHitY: number): void {
        const count = 7 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 0.8 + Math.random() * 1.6;
            this.sparks.push({
                x: localHitX + (Math.random() - 0.5) * 6,
                y: localHitY,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 0.4, // lekko w gore na starcie
                age: 0,
                maxAge: 40 + Math.random() * 25,
                size: 1.4 + Math.random() * 1.4,
                landed: false,
            });
        }
    }

    /**
     * Update + render iskier. Grawitacja, ground impact = mikro-flash (impactRing) przy kontakcie.
     */
    private updateSparks(delta: number): void {
        this.sparkGfx.clear();

        // Iskry
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.age += delta;
            if (s.age >= s.maxAge) { this.sparks.splice(i, 1); continue; }

            if (!s.landed) {
                s.vy += 0.06 * delta; // grawitacja
                s.x += s.vx * delta;
                s.y += s.vy * delta;
                if (s.y >= this.groundLocalY) {
                    s.y = this.groundLocalY;
                    s.landed = true;
                    // mikro-flash przy kontakcie z ziemia ("crunchy")
                    this.impactRings.push({ x: s.x, age: 0, maxAge: 10 });
                }
            }

            const lifeT = s.age / s.maxAge;
            const alpha = (1 - lifeT) * 0.95;
            const color = lifeT < 0.5 ? COLOR_SPARK_HOT : COLOR_SPARK_COOL;
            this.sparkGfx.beginFill(color, alpha);
            this.sparkGfx.drawCircle(s.x, s.y, s.size * (s.landed ? 0.6 : 1));
            this.sparkGfx.endFill();
            // mini-trail dla lecacych
            if (!s.landed) {
                this.sparkGfx.beginFill(color, alpha * 0.4);
                this.sparkGfx.drawCircle(s.x - s.vx, s.y - s.vy, s.size * 0.6);
                this.sparkGfx.endFill();
            }
        }

        // Impact rings (mikro-flash na ziemi)
        for (let i = this.impactRings.length - 1; i >= 0; i--) {
            const r = this.impactRings[i];
            r.age += delta;
            if (r.age >= r.maxAge) { this.impactRings.splice(i, 1); continue; }
            const t = r.age / r.maxAge;
            this.sparkGfx.lineStyle(1, COLOR_SPARK_HOT, (1 - t) * 0.8);
            this.sparkGfx.drawEllipse(r.x, this.groundLocalY, 2 + t * 7, 1 + t * 2.5);
            this.sparkGfx.lineStyle(0);
        }
    }

    /**
     * Hit detection — AABB bullets vs footprint, WeakSet anti-multi-trigger (analog reactor).
     */
    private checkBulletHits(bullets: Bullet[]): void {
        const worldL = this.x;
        const worldR = this.x + this.w;
        const worldT = this.y;
        const worldB = this.y + this.h;
        for (const b of bullets) {
            if (!b.active) continue;
            if (this.hitBulletIds.has(b)) continue;
            const br = b.radius ?? 4;
            if (b.x + br < worldL || b.x - br > worldR) continue;
            if (b.y + br < worldT || b.y - br > worldB) continue;
            this.hitBulletIds.add(b);
            this.triggerHit(b.x - this.x, b.y - this.y);
        }
    }

    /**
     * Trigger HIT state: timer reset, spark burst, luki zaczynaja skakac (drawArcs HIT branch).
     */
    private triggerHit(localHitX: number, localHitY: number): void {
        this.hitFlashTimer = HIT_FLASH_DURATION;
        this.spawnHitSparks(localHitX, localHitY);
    }

    /**
     * Public update — ICollidable signature + opcjonalny bullets dla hit detection.
     *
     * Driven przez DEDYKOWANA petle w main.ts (ta przekazuje bullets):
     *   for (const sc of antiGravScraps) { sc.setPlayerNear(...); sc.update(cam..., bullets); }
     *
     * Wywolanie z buildings.forEach(b => b.update(cam...)) NIE przekazuje bullets —
     * wtedy early-return (no-op), zeby uniknac double-update (animacja liczona RAZ).
     * Footprint kolizji (x/y/w/h) jest statyczny, wiec brak update z buildings.forEach
     * nie szkodzi tank-collision.
     */
    update(_camX: number, _camY: number, _viewW: number, _viewH: number, bullets?: Bullet[]): void {
        if (!bullets) return; // buildings.forEach path — skip (dedykowana petla driveuje)

        this.animTime += 0.016; // ~60fps

        if (this.hitFlashTimer > 0) this.hitFlashTimer--;

        // ---- Bob (lewitacja) ----
        const freq = this.isPlayerNear ? BOB_FREQ_EXCITED : BOB_FREQ_IDLE;
        const amp = this.isPlayerNear ? BOB_AMP * 1.4 : BOB_AMP;
        let bob = Math.sin(this.animTime * freq) * amp;
        // HIT shake — violent jitter zlomu
        let shakeX = 0;
        if (this.hitFlashTimer > 0) {
            const s = (this.hitFlashTimer / HIT_FLASH_DURATION) * 3;
            shakeX = (Math.random() - 0.5) * 2 * s;
            bob += (Math.random() - 0.5) * 2 * s;
        }
        this.hoverY = -HOVER_GAP + bob;
        this.hoverContainer.x = shakeX;
        this.hoverContainer.y = this.hoverY;

        // ---- Shadow modulacja (inverse do wysokosci unosu — sells float) ----
        // bob ujemny (wyzej) => mniejszy/jasniejszy cien. Normalizujemy do ~[0.85, 1.15].
        const heightFactor = (-bob + amp) / (2 * amp); // 0 (najwyzej) .. 1 (najnizej)
        const shScale = 0.85 + 0.30 * heightFactor;
        this.shadowGfx.scale.set(shScale);
        this.shadowGfx.alpha = 0.7 + 0.3 * heightFactor;

        // ---- Spark detach (mikro-iskry odpadaja) ----
        this.sparkCooldown -= 1; // ~1/frame (60fps assumption, spojnie z animTime/updateSparks)
        if (this.sparkCooldown <= 0) {
            this.spawnDetachSpark();
            this.sparkCooldown = this.isPlayerNear
                ? 22 + Math.floor(Math.random() * 20)   // EXCITED — czesciej
                : 55 + Math.floor(Math.random() * 50);  // IDLE — rzadko
        }

        // ---- Hit detection ----
        this.checkBulletHits(bullets);

        // ---- Render animated layers ----
        this.drawField();
        this.drawArcs();
        this.updateSparks(1.0);
    }

    /**
     * Public API — EXCITED state gdy gracz w PROXIMITY_RADIUS. Wolane raz/frame w main.ts.
     */
    setPlayerNear(playerX: number, playerY: number): void {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const dx = playerX - cx;
        const dy = playerY - cy;
        this.isPlayerNear = (dx * dx + dy * dy) < PROXIMITY_RADIUS_SQ;
    }

    /**
     * Cleanup — wolane gdy mapa niszczona (worldContainer.removeChildren + array reset).
     */
    destroy(): void {
        this.container.destroy({ children: true });
    }
}