import * as PIXI from 'pixi.js';

/**
 * v0.56.0 — SkyTraffic (Warstwa B planu taxi/police). Ambient ruch lotniczy.
 *
 * NIEKOLIZYJNY — nie trafia do buildings/solidBuildings. Manager updatowany w tickerze
 * main.ts (osobne wywolanie, NIE buildings.forEach). Zarzadza 3 jednostkami:
 *   - taksowka ZOLTA: baza1 (TR, yellowStand) <-> baza2 (BL)
 *   - taksowka CZERWONA: baza1 (TR, redStand) <-> baza2 (BR)
 *   - policja: baza (TR, helipad), wolny patrol po obwodzie mapy + skan w dol co ~7s
 *
 * Warstwy renderu (trik decoupled shadow z AntiGravScrap):
 *   - ciala pojazdow -> airLayer (zIndex 8000, always-on-top jak hologram turbiny)
 *   - cienie -> shadowLayer (zIndex 3, nad tekstura/pod obiektami); odsprzezone od ciala:
 *     przy wznoszeniu cien kurczy sie, blednie, odsuwa (swiatlo upper-left) = iluzja wysokosci
 *
 * Cykl taksowki: DWELL -> ASCEND (pionowy start) -> CRUISE (wysoko) -> DESCEND (pionowe
 * ladowanie) -> DWELL -> powrot. Policja: ciagly CRUISE po waypointach, altitude=1.
 *
 * Bazy przekazywane jako czyste wspolrzedne (zero importu klas stacji — brak coupling).
 */

const Z_AIR = 8000;
const Z_SCAN = 7990;
const Z_SHADOW = 3;

// Lot
const CRUISE_SPEED_TAXI = 3.6;     // px/frame
const CRUISE_SPEED_POLICE = 1.9;
const ALT_RATE = 0.016;            // altitude/frame (~1.1s na pelny start/lądowanie)
const ALT_LIFT_PX = 74;            // px wyniesienia ciala przy altitude=1
const DWELL_FRAMES = 150;          // ~2.5s postoju na bazie

interface Pt { x: number; y: number; }

interface SkyBases {
    yellowA: Pt;   // baza1 TR (yellowStand)
    redA: Pt;      // baza1 TR (redStand)
    yellowB: Pt;   // baza2 BL
    redB: Pt;      // baza2 BR
    policeBase: Pt;
}

type FlightState = 'dwell' | 'ascend' | 'cruise' | 'descend';

class AirVehicle {
    public gx: number;          // ground X (pozycja cienia)
    public gy: number;          // ground Y
    private altitude: number = 0;
    private heading: number = 0;
    private bob: number = Math.random() * Math.PI * 2;

    private state: FlightState;
    private dwellT: number = DWELL_FRAMES;
    private legFrom: Pt;
    private legTo: Pt;
    private legIdx: number = 0;   // dla taxi: 0 = A->B, 1 = B->A; dla police: waypoint idx

    private readonly mode: 'shuttle' | 'patrol';
    private readonly bases: Pt[];          // shuttle: [A,B]; patrol: waypoint loop
    private readonly speed: number;

    private readonly bodyC: PIXI.Container;
    private readonly bodyGfx: PIXI.Graphics;
    private readonly lightsGfx: PIXI.Graphics;
    private readonly shadowGfx: PIXI.Graphics;
    private readonly scanGfx: PIXI.Graphics | null;

    private readonly colBody: number;
    private readonly colAccent: number;
    private readonly colGlass: number;

    private scanT: number = 0;
    private scanning: boolean = false;
    private animT: number = 0;

    constructor(
        mode: 'shuttle' | 'patrol',
        bases: Pt[],
        colors: { body: number; accent: number; glass: number },
        airLayer: PIXI.Container,
        shadowLayer: PIXI.Container,
    ) {
        this.mode = mode;
        this.bases = bases;
        this.speed = mode === 'patrol' ? CRUISE_SPEED_POLICE : CRUISE_SPEED_TAXI;
        this.colBody = colors.body;
        this.colAccent = colors.accent;
        this.colGlass = colors.glass;

        // Start na pierwszej bazie
        this.gx = bases[0].x;
        this.gy = bases[0].y;
        this.legFrom = bases[0];
        this.legTo = bases[1 % bases.length];

        this.shadowGfx = new PIXI.Graphics();
        this.shadowGfx.zIndex = Z_SHADOW;
        shadowLayer.addChild(this.shadowGfx);

        this.bodyC = new PIXI.Container();
        this.bodyC.zIndex = Z_AIR;
        airLayer.addChild(this.bodyC);
        this.bodyGfx = new PIXI.Graphics();
        this.lightsGfx = new PIXI.Graphics();
        this.bodyC.addChild(this.bodyGfx);
        this.bodyC.addChild(this.lightsGfx);

        if (mode === 'patrol') {
            this.scanGfx = new PIXI.Graphics();
            this.scanGfx.zIndex = Z_SCAN;
            this.scanGfx.blendMode = PIXI.BLEND_MODES.ADD;
            airLayer.addChild(this.scanGfx);
            // Policja startuje juz w powietrzu (altitude pelne), patrol bez ladowania
            this.altitude = 1;
            this.state = 'cruise';
            this.heading = 0;
        } else {
            this.scanGfx = null;
            this.state = 'dwell';
        }

        this.drawBody();
    }

    private drawBody(): void {
        const g = this.bodyGfx;
        g.clear();
        // Top-down pod, dziob skierowany w -Y (do gory). Heading obraca caly bodyC.
        const L = this.mode === 'patrol' ? 24 : 20;   // pol-dlugosc
        const Wd = this.mode === 'patrol' ? 13 : 12;   // pol-szerokosc

        // Kadlub
        g.beginFill(this.colBody, 1);
        g.drawRoundedRect(-Wd, -L, Wd * 2, L * 2, Wd * 0.7);
        g.endFill();
        // Dziob jasniejszy (przod)
        g.beginFill(this.colAccent, 0.9);
        g.moveTo(-Wd + 2, -L + 3);
        g.lineTo(0, -L - 5);
        g.lineTo(Wd - 2, -L + 3);
        g.closePath();
        g.endFill();
        // Pas akcentowy
        g.lineStyle(2, this.colAccent, 0.85);
        g.moveTo(-Wd, -2); g.lineTo(Wd, -2);
        g.lineStyle(0);
        // Kokpit / szyba
        g.beginFill(this.colGlass, 0.92);
        g.drawEllipse(0, -L * 0.45, Wd * 0.6, L * 0.32);
        g.endFill();
        g.beginFill(0xffffff, 0.25);
        g.drawEllipse(-Wd * 0.18, -L * 0.55, Wd * 0.22, L * 0.12);
        g.endFill();
        // Pody silnikow (boki) + glow
        for (const sx of [-1, 1]) {
            g.beginFill(0x10131a, 1);
            g.drawRoundedRect(sx * (Wd - 1) - 4, L * 0.25, 8, 12, 3);
            g.endFill();
            g.beginFill(this.colAccent, 0.5);
            g.drawCircle(sx * (Wd + 1), L * 0.55, 4);
            g.endFill();
        }
        // Ogon
        g.beginFill(this.colBody, 1);
        g.drawRoundedRect(-3, L - 2, 6, 7, 2);
        g.endFill();
    }

    /** Wybor nastepnej trasy po dotarciu/dwell. */
    private advanceLeg(): void {
        if (this.mode === 'patrol') {
            this.legIdx = (this.legIdx + 1) % this.bases.length;
            this.legFrom = { x: this.gx, y: this.gy };
            this.legTo = this.bases[this.legIdx];
            this.state = 'cruise';
        } else {
            // shuttle: przelacz kierunek A<->B
            this.legIdx = this.legIdx === 0 ? 1 : 0;
            this.legFrom = this.bases[this.legIdx === 0 ? 1 : 0];
            this.legTo = this.bases[this.legIdx === 0 ? 0 : 1];
            // legFrom = aktualna baza (gdzie stoimy), legTo = cel
            this.legFrom = { x: this.gx, y: this.gy };
            this.legTo = this.legIdx === 0 ? this.bases[1] : this.bases[0];
            this.state = 'ascend';
        }
    }

    update(): void {
        this.animT += 1 / 60;
        this.bob += 0.05;

        switch (this.state) {
            case 'dwell': {
                this.dwellT--;
                if (this.dwellT <= 0) {
                    this.dwellT = DWELL_FRAMES;
                    this.advanceLeg();
                }
                break;
            }
            case 'ascend': {
                this.altitude = Math.min(1, this.altitude + ALT_RATE);
                // obrot dziobu w strone celu juz na starcie
                this.heading = Math.atan2(this.legTo.y - this.gy, this.legTo.x - this.gx) + Math.PI / 2;
                if (this.altitude >= 1) this.state = 'cruise';
                break;
            }
            case 'cruise': {
                const dx = this.legTo.x - this.gx;
                const dy = this.legTo.y - this.gy;
                const dist = Math.hypot(dx, dy);
                this.heading = Math.atan2(dy, dx) + Math.PI / 2;
                if (dist <= this.speed) {
                    this.gx = this.legTo.x;
                    this.gy = this.legTo.y;
                    if (this.mode === 'patrol') {
                        this.advanceLeg();   // patrol: lec dalej, bez ladowania
                    } else {
                        this.state = 'descend';
                    }
                } else {
                    this.gx += (dx / dist) * this.speed;
                    this.gy += (dy / dist) * this.speed;
                }
                break;
            }
            case 'descend': {
                this.altitude = Math.max(0, this.altitude - ALT_RATE);
                if (this.altitude <= 0) {
                    this.state = 'dwell';
                    this.dwellT = DWELL_FRAMES;
                }
                break;
            }
        }

        this.renderTransforms();
        this.renderShadow();
        this.renderLights();
        if (this.scanGfx) this.renderScan();
    }

    private renderTransforms(): void {
        const lift = this.altitude * ALT_LIFT_PX;
        const bobOff = this.altitude * Math.sin(this.bob) * 2.5;   // delikatne kolysanie w locie
        this.bodyC.x = this.gx;
        this.bodyC.y = this.gy - lift + bobOff;
        this.bodyC.rotation = this.heading;
        this.bodyC.scale.set(1 + this.altitude * 0.22);
    }

    private renderShadow(): void {
        const g = this.shadowGfx;
        g.clear();
        // wysoko -> cien mniejszy, bledszy, odsuniety (swiatlo upper-left => cien dol-prawo)
        const sScale = 1 - this.altitude * 0.45;
        const sAlpha = 0.34 * (1 - this.altitude * 0.55);
        const off = this.altitude * 16;
        g.beginFill(0x000000, sAlpha);
        g.drawEllipse(this.gx + off, this.gy + off * 0.7, 18 * sScale, 11 * sScale);
        g.endFill();
    }

    private renderLights(): void {
        const g = this.lightsGfx;
        g.clear();
        const L = this.mode === 'patrol' ? 24 : 20;
        const Wd = this.mode === 'patrol' ? 13 : 12;
        // nav: lewy czerwony, prawy zielony (sta\u0142e), ogon bialy strobe
        const navOn = Math.sin(this.animT * 6) > -0.5;
        g.beginFill(0xff3322, navOn ? 0.95 : 0.4); g.drawCircle(-Wd, 0, 1.8); g.endFill();
        g.beginFill(0x22ff44, navOn ? 0.95 : 0.4); g.drawCircle(Wd, 0, 1.8); g.endFill();
        const strobe = Math.sin(this.animT * 14) > 0.7;
        if (strobe) {
            g.beginFill(0xffffff, 0.95); g.drawCircle(0, L + 1, 2.2); g.endFill();
            g.beginFill(0xffffff, 0.4); g.drawCircle(0, L + 1, 4.5); g.endFill();
        }
        // policja: pulsujacy kogut cyan/magenta na grzbiecie
        if (this.mode === 'patrol') {
            const ph = Math.sin(this.animT * 8) > 0;
            g.beginFill(ph ? 0x2e9bff : 0xff3ce0, 0.95);
            g.drawCircle(0, -2, 3);
            g.endFill();
            g.beginFill(ph ? 0x2e9bff : 0xff3ce0, 0.35);
            g.drawCircle(0, -2, 6);
            g.endFill();
        }
    }

    private renderScan(): void {
        const g = this.scanGfx!;
        g.clear();
        // skan co ~7s, trwa ~2s — stozek swiatla w DOL (screen-space, nieobrocony)
        this.scanT++;
        if (!this.scanning && this.scanT > 60 * 7) { this.scanning = true; this.scanT = 0; }
        if (this.scanning && this.scanT > 60 * 2) { this.scanning = false; this.scanT = 0; }
        if (!this.scanning) return;

        const bx = this.gx;
        const by = this.gy - this.altitude * ALT_LIFT_PX;
        const len = this.altitude * ALT_LIFT_PX + 40;
        const spread = 26;
        const pulse = 0.18 + 0.12 * Math.sin(this.animT * 10);
        g.beginFill(0x2e9bff, pulse);
        g.moveTo(bx, by + 4);
        g.lineTo(bx - spread, by + len);
        g.lineTo(bx + spread, by + len);
        g.closePath();
        g.endFill();
        // jasna elipsa skanu na ziemi
        g.beginFill(0x9cd4ff, pulse * 1.4);
        g.drawEllipse(bx, by + len, spread, spread * 0.4);
        g.endFill();
    }

    destroy(): void {
        this.bodyC.destroy({ children: true });
        this.shadowGfx.destroy();
        if (this.scanGfx) this.scanGfx.destroy();
    }
}

export class SkyTraffic {
    private airLayer: PIXI.Container;
    private shadowLayer: PIXI.Container;
    private padGfx: PIXI.Graphics;       // neonowe lądowiska baz2 (BL/BR), niekolizyjne
    private vehicles: AirVehicle[] = [];

    constructor(parent: PIXI.Container, bases: SkyBases) {
        // Warstwa cieni (nisko, nad tekstura) + warstwa powietrzna (always-on-top)
        this.shadowLayer = new PIXI.Container();
        this.shadowLayer.sortableChildren = true;
        this.shadowLayer.zIndex = Z_SHADOW;
        parent.addChild(this.shadowLayer);

        this.airLayer = new PIXI.Container();
        this.airLayer.sortableChildren = true;
        this.airLayer.zIndex = Z_AIR;
        parent.addChild(this.airLayer);

        // Neonowe lądowiska baz2 (rysowane raz, niekolizyjne)
        this.padGfx = new PIXI.Graphics();
        this.padGfx.zIndex = Z_SHADOW + 1;
        this.shadowLayer.addChild(this.padGfx);
        this.drawLandingPad(bases.yellowB, 0xffd21e);
        this.drawLandingPad(bases.redB, 0xff2e4d);

        // ZOLTA taksowka: TR <-> BL
        this.vehicles.push(new AirVehicle('shuttle', [bases.yellowA, bases.yellowB],
            { body: 0xf5c518, accent: 0xfff07a, glass: 0x2a2410 },
            this.airLayer, this.shadowLayer));

        // CZERWONA taksowka: TR <-> BR
        this.vehicles.push(new AirVehicle('shuttle', [bases.redA, bases.redB],
            { body: 0xe53152, accent: 0xff7a93, glass: 0x2a1015 },
            this.airLayer, this.shadowLayer));

        // POLICJA: patrol po obwodzie (start z bazy TR), waypointy w narozach mapy (~WORLD 2000)
        const policeRoute: Pt[] = [
            bases.policeBase,
            { x: 450, y: 450 },
            { x: 450, y: 2550 },
            { x: 2550, y: 2550 },
            { x: 2550, y: 450 },
        ];
        this.vehicles.push(new AirVehicle('patrol', policeRoute,
            { body: 0x1e2c44, accent: 0x9cd4ff, glass: 0x0a1828 },
            this.airLayer, this.shadowLayer));
    }

    private drawLandingPad(p: Pt, color: number): void {
        const g = this.padGfx;
        g.beginFill(0x12141a, 0.55);
        g.drawCircle(p.x, p.y, 26);
        g.endFill();
        g.lineStyle(2.5, color, 0.85);
        g.drawCircle(p.x, p.y, 26);
        g.lineStyle(1.5, color, 0.5);
        g.drawCircle(p.x, p.y, 19);
        // krzyz lądowania
        g.lineStyle(2, color, 0.8);
        g.moveTo(p.x - 10, p.y); g.lineTo(p.x + 10, p.y);
        g.moveTo(p.x, p.y - 10); g.lineTo(p.x, p.y + 10);
        g.lineStyle(0);
    }

    update(): void {
        for (const v of this.vehicles) v.update();
    }

    destroy(): void {
        for (const v of this.vehicles) v.destroy();
        this.vehicles = [];
        this.padGfx.destroy();
        this.airLayer.destroy({ children: true });
        this.shadowLayer.destroy({ children: true });
    }
}