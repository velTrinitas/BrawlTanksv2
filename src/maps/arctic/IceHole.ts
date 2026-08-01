import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';

/**
 * IceHole — przerebel w lodzie + zycie wokol (ARC-R2 "Lodowa Arena").
 *
 * Feedback Mariusza (2026-08-01): rozmiar x0.5, woda ROZJASNIONA (byla zbyt granatowa),
 * dodane FOKI (wynurzaja glowe z wody, rozgladaja sie, nurkuja — na zmiane z ryba)
 * i LWY MORSKIE wylegujace sie obok przerebla (oddychaja, co kilka sekund przeciagniecie).
 *
 * Mechanika bez zmian: czolgi NIE wjezdzaja (buildings), pociski PRZELATUJA
 * (nie solidBuildings), isPointInside => spawnBlocked. Zwierzeta = passable ambient.
 * Koszt: 1 maly gfx redraw/klatke na przerebel + transformy lwow. Groszowe.
 */

const RIPPLE_PERIOD_MS = 2600;
const EVENT_MIN_GAP_MS = 4500;
const EVENT_MAX_GAP_MS = 8000;
const FISH_JUMP_MS = 750;
const SEAL_PEEK_MS = 2100;

const COLORS = {
    waterDeep:  0x2a5a70,   // srodek — ROZJASNIONY morski teal (byl 0x0d2530)
    waterEdge:  0x3a6a92,   // krawedz — jasniejszy lazur (byl granat 0x1b3a6b)
    rimFrost:   0xdfeef4,   // rama szronu
    rimIce:     0xbcdfec,   // wewnetrzny lip lodu
    ripple:     0xbfe6f5,   // fale (jasniejsze na jasniejszej wodzie)
    fishBody:   0x6690ae,
    fishBelly:  0xd4e5ee,
    droplet:    0xd4ecf8,
    sealHead:   0x8d99a4,   // foka — szara glowa
    sealSnout:  0xb4bec6,
    lionBody:   0x8f8073,   // lew morski — cieplo-szarobrazowy
    lionBelly:  0xb5a898,
    lionDark:   0x6a5e52,
} as const;

function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return function (): number {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface SeaLion {
    container: PIXI.Container;
    baseY: number;
    phase: number;
    stretchAt: number; // timestamp nastepnego przeciagniecia
}

export class IceHole {
    private cx: number;
    private cy: number;
    private rx: number;
    private ry: number;

    private container: PIXI.Container;
    private gfxAnim: PIXI.Graphics;
    private seaLions: SeaLion[] = [];

    private rippleOffset: number;
    private nextEventAt: number;
    private eventStartAt: number = -1;
    private eventKind: 'fish' | 'seal' = 'fish';
    private eventDir: number = 1;
    private rng: () => number;

    constructor(cx: number, cy: number, rx: number, ry: number, seed: number, worldContainer: PIXI.Container) {
        this.cx = cx;
        this.cy = cy;
        this.rx = rx;
        this.ry = ry;
        this.rng = makeRng(seed);

        // PIXI init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = cx;
        this.container.y = cy;
        this.container.zIndex = -95; // nad tafla (-100), pod cieniami AO — dziura W gruncie
        worldContainer.addChild(this.container);

        const gfxStatic = new PIXI.Graphics();
        this.container.addChild(gfxStatic);
        this.drawStatic(gfxStatic);

        this.gfxAnim = new PIXI.Graphics();
        this.container.addChild(this.gfxAnim);

        // 1-2 lwy morskie wylegujace sie obok (seeded pozycja wokol przerebla)
        const lionCount = 1 + (this.rng() < 0.5 ? 1 : 0);
        for (let i = 0; i < lionCount; i++) {
            this.seaLions.push(this.buildSeaLion(i, worldContainer));
        }

        this.rippleOffset = this.rng() * RIPPLE_PERIOD_MS;
        this.nextEventAt = Date.now() + EVENT_MIN_GAP_MS + this.rng() * (EVENT_MAX_GAP_MS - EVENT_MIN_GAP_MS);
    }

    /** Rama lodowa + woda — baked raz. */
    private drawStatic(g: PIXI.Graphics): void {
        const { rx, ry } = this;

        // rama szronu (poszarpany 12-kat)
        g.beginFill(COLORS.rimFrost, 0.9);
        const N = 12;
        const pts: number[] = [];
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            const rr = 1.16 + this.rng() * 0.10;
            pts.push(Math.cos(a) * rx * rr, Math.sin(a) * ry * rr);
        }
        g.drawPolygon(pts);
        g.endFill();

        // wewnetrzny lip lodu
        g.beginFill(COLORS.rimIce);
        g.drawEllipse(0, 0, rx * 1.06, ry * 1.06);
        g.endFill();

        // woda: jasniejszy lazur -> morski teal (2 elipsy = tani gradient)
        g.beginFill(COLORS.waterEdge);
        g.drawEllipse(0, 0, rx, ry);
        g.endFill();
        g.beginFill(COLORS.waterDeep);
        g.drawEllipse(0, ry * 0.06, rx * 0.70, ry * 0.62);
        g.endFill();

        // blik NW
        g.beginFill(0xffffff, 0.14);
        g.drawEllipse(-rx * 0.3, -ry * 0.35, rx * 0.30, ry * 0.18);
        g.endFill();
    }

    /** Lew morski wylegujacy sie obok przerebla (passable ambient; transformy w update). */
    private buildSeaLion(index: number, worldContainer: PIXI.Container): SeaLion {
        // seeded pozycja: kat + dystans od srodka przerebla (poza rama)
        const ang = this.rng() * Math.PI * 2;
        const dist = this.rx + 34 + this.rng() * 18;
        const lx = this.cx + Math.cos(ang) * dist;
        const ly = this.cy + Math.sin(ang) * dist * 0.8;
        const flip = Math.cos(ang) < 0 ? -1 : 1; // glowa "od" przerebla

        const container = new PIXI.Container();
        container.x = lx;
        container.y = ly;
        container.zIndex = ly + 10; // Y-sort — lezy NA lodzie
        const g = new PIXI.Graphics();
        container.addChild(g);

        // cien
        g.beginFill(0x15323d, 0.20);
        g.drawEllipse(0, 7, 24, 6);
        g.endFill();
        // cialo (pekaty ogon->klata)
        g.beginFill(COLORS.lionBody);
        g.drawEllipse(-4, 0, 21, 9);
        g.endFill();
        // klata + uniesiona glowa (wylegiwanie z gracja)
        g.beginFill(COLORS.lionBody);
        g.drawEllipse(13, -5, 8, 8);
        g.drawCircle(17, -11, 5.5);
        g.endFill();
        // brzuch
        g.beginFill(COLORS.lionBelly, 0.8);
        g.drawEllipse(-2, 3, 15, 5);
        g.endFill();
        // pyszczek + wasy
        g.beginFill(COLORS.lionBelly);
        g.drawEllipse(20.5, -9.5, 3, 2.2);
        g.endFill();
        g.beginFill(COLORS.lionDark);
        g.drawCircle(21.8, -10, 0.9); // nos
        g.endFill();
        // zamkniete "szczesliwe" oko (luk)
        g.lineStyle(1.1, COLORS.lionDark, 0.9);
        g.arc(16.5, -12, 2, Math.PI * 0.15, Math.PI * 0.85);
        g.lineStyle(0);
        // pletwa przednia + ogonowa
        g.beginFill(COLORS.lionDark, 0.85);
        g.drawEllipse(8, 4, 5, 2.6);
        g.drawPolygon([-23, -2, -30, -7, -28, 2]);
        g.endFill();

        g.scale.x = flip;
        worldContainer.addChild(container);

        return {
            container,
            baseY: ly,
            phase: index * 2.1 + this.rng() * 3,
            stretchAt: Date.now() + 3000 + this.rng() * 5000,
        };
    }

    /** Kolizja RUCHU (tylko buildings — pociski przelatuja). AABB elipsy. */
    public getCollisionRect(): ICollidable {
        return {
            x: this.cx - this.rx,
            y: this.cy - this.ry,
            w: this.rx * 2,
            h: this.ry * 2,
            update: () => { /* static */ },
        };
    }

    /** Test elipsy (margines 1.2) — dla spawnBlocked. */
    public isPointInside(px: number, py: number): boolean {
        const dx = (px - this.cx) / (this.rx * 1.2);
        const dy = (py - this.cy) / (this.ry * 1.2);
        return dx * dx + dy * dy <= 1;
    }

    /** Fale + zdarzenia (ryba/foka) + oddech lwow — per frame, tanie. */
    public update(): void {
        const now = Date.now();
        const g = this.gfxAnim;
        g.clear();

        // ── fale ──
        for (let k = 0; k < 2; k++) {
            const t = (((now + this.rippleOffset) / RIPPLE_PERIOD_MS) + k * 0.5) % 1;
            const alpha = 0.30 * (1 - t);
            if (alpha > 0.02) {
                g.lineStyle(1.4, COLORS.ripple, alpha);
                g.drawEllipse(0, 0, this.rx * (0.25 + t * 0.65), this.ry * (0.25 + t * 0.65));
            }
        }
        g.lineStyle(0);

        // ── harmonogram zdarzen: ryba (55%) albo foka (45%) ──
        if (this.eventStartAt < 0 && now >= this.nextEventAt) {
            this.eventStartAt = now;
            this.eventKind = this.rng() < 0.55 ? 'fish' : 'seal';
            this.eventDir = this.rng() < 0.5 ? -1 : 1;
        }
        if (this.eventStartAt >= 0) {
            const dur = this.eventKind === 'fish' ? FISH_JUMP_MS : SEAL_PEEK_MS;
            const p = (now - this.eventStartAt) / dur;
            if (p >= 1) {
                this.eventStartAt = -1;
                this.nextEventAt = now + EVENT_MIN_GAP_MS + this.rng() * (EVENT_MAX_GAP_MS - EVENT_MIN_GAP_MS);
            } else if (this.eventKind === 'fish') {
                this.drawFishJump(g, p);
            } else {
                this.drawSealPeek(g, p);
            }
        }

        // ── lwy morskie: oddech + okazjonalne przeciagniecie (transformy, zero redraw) ──
        for (const lion of this.seaLions) {
            const breathe = Math.sin(now / 900 + lion.phase) * 0.025;
            let rock = 0;
            if (now >= lion.stretchAt) {
                const sp = (now - lion.stretchAt) / 900;
                if (sp >= 1) {
                    lion.stretchAt = now + 4000 + this.rng() * 6000;
                } else {
                    rock = Math.sin(sp * Math.PI) * -0.09; // uniesienie przodu (przeciagniecie)
                }
            }
            lion.container.scale.y = 1 + breathe;
            lion.container.rotation = rock;
        }
    }

    /** Ryba: luk paraboliczny + krople (przeskalowana do malego przerebla). */
    private drawFishJump(g: PIXI.Graphics, p: number): void {
        const fx = this.eventDir * this.rx * (p - 0.5) * 0.9;
        const fy = -Math.sin(p * Math.PI) * 30;
        const rot = this.eventDir * (0.5 - p) * 1.6;

        if (p < 0.2 || p > 0.8) {
            const sx = p < 0.2 ? this.eventDir * -this.rx * 0.45 : this.eventDir * this.rx * 0.45;
            const dp = p < 0.2 ? p / 0.2 : (1 - p) / 0.2;
            g.beginFill(COLORS.droplet, 0.7);
            for (let d = 0; d < 3; d++) g.drawCircle(sx + (d - 1) * 5, -dp * (8 + d * 4), 1.3);
            g.endFill();
        }

        const cos = Math.cos(rot), sin = Math.sin(rot);
        const R = (lx: number, ly: number): [number, number] =>
            [fx + lx * cos - ly * sin, fy + lx * sin + ly * cos];
        g.beginFill(COLORS.fishBody);
        const body: number[] = [];
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const [bx, by] = R(Math.cos(a) * 8 * this.eventDir, Math.sin(a) * 3.4);
            body.push(bx, by);
        }
        g.drawPolygon(body);
        g.endFill();
        g.beginFill(COLORS.fishBelly, 0.8);
        g.drawEllipse(fx, fy + 1.2, 5, 1.8);
        g.endFill();
        const [t1x, t1y] = R(-8 * this.eventDir, 0);
        const [t2x, t2y] = R(-13 * this.eventDir, -3.8);
        const [t3x, t3y] = R(-13 * this.eventDir, 3.8);
        g.beginFill(COLORS.fishBody);
        g.drawPolygon([t1x, t1y, t2x, t2y, t3x, t3y]);
        g.endFill();
        const [ex, ey] = R(5 * this.eventDir, -1);
        g.beginFill(0x1e3540);
        g.drawCircle(ex, ey, 1);
        g.endFill();
    }

    /** Foka: wynurza glowe, rozglada sie, nurkuje (feedback: "foki wyskakujace"). */
    private drawSealPeek(g: PIXI.Graphics, p: number): void {
        // faza: 0-0.22 wynurzenie, 0.22-0.78 rozgladanie, 0.78-1 nurkowanie
        let rise: number;
        if (p < 0.22) rise = p / 0.22;
        else if (p > 0.78) rise = (1 - p) / 0.22;
        else rise = 1;
        const headY = 6 - rise * 13; // spod wody -> nad tafle
        const look = p >= 0.22 && p <= 0.78
            ? Math.sin((p - 0.22) / 0.56 * Math.PI * 2) * 0.35 * this.eventDir
            : 0;

        // krag wody wokol wynurzenia
        g.lineStyle(1.3, COLORS.ripple, 0.35 * rise);
        g.drawEllipse(0, 4, 11 + (1 - rise) * 4, 4.5);
        g.lineStyle(0);

        const cos = Math.cos(look), sin = Math.sin(look);
        const R = (lx: number, ly: number): [number, number] =>
            [lx * cos - ly * sin, headY + lx * sin + ly * cos];

        // glowa (kopulka) + pyszczek
        const [hx, hy] = R(0, 0);
        g.beginFill(COLORS.sealHead);
        g.drawEllipse(hx, hy, 6.5, 7 * Math.max(0.25, rise));
        g.endFill();
        if (rise > 0.5) {
            const [sx2, sy2] = R(this.eventDir * 3.5, 2);
            g.beginFill(COLORS.sealSnout);
            g.drawEllipse(sx2, sy2, 3.2, 2.2);
            g.endFill();
            const [nx, ny] = R(this.eventDir * 5.5, 1.4);
            g.beginFill(0x2a2e33);
            g.drawCircle(nx, ny, 0.9);
            g.endFill();
            // oczy (duze, urocze)
            const [e1x, e1y] = R(this.eventDir * 1.5, -2.5);
            const [e2x, e2y] = R(this.eventDir * 4.6, -2.2);
            g.beginFill(0x1e2328);
            g.drawCircle(e1x, e1y, 1.3);
            g.drawCircle(e2x, e2y, 1.15);
            g.endFill();
            g.beginFill(0xffffff, 0.9);
            g.drawCircle(e1x + 0.4, e1y - 0.4, 0.4);
            g.drawCircle(e2x + 0.4, e2y - 0.4, 0.4);
            g.endFill();
        }
    }
}
