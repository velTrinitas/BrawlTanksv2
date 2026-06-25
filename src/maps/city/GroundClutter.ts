import * as PIXI from 'pixi.js';

/**
 * v0.60.0 — GroundClutter (najcichszy wypelniacz cyberpunku): plamy oleju + studzienki/kratki.
 *
 * PASSABLE (niekolizyjny), czysta dekoracja tla. NIE w buildings. Render baked raz na ziemi
 * (zIndex pod tankami). Jedyna animacja: delikatna para z 1-2 wybranych studzienek.
 *
 * Pozycje MATH-VERIFIED (auto-scatter w Python, omija reactor/scrapy/turbiny/taxi/factory/
 * sludge/stealth/parkingi z marginesem 50px, min odleglosc 130-150px miedzy elementami).
 * Wpisane jako stale layouty (OIL_LAYOUT, DRAIN_LAYOUT) — deterministyczne, nie losowane runtime.
 *
 * Elementy:
 *   - OIL: teczowa benzynowa plama (ciemna baza + koncentryczne refleksy zielony/cyan/fiolet/
 *     rozowy/zolty, niska alpha + mokry highlight). Spojne z plamami z NEON-OASIS/Parking.
 *   - DRAIN: okragly wlaz kanalizacyjny (zebra/kratka) LUB prostokatna kratka wentylacyjna.
 *     1-2 wybrane (steaming) emituja powolna, rzadka pare (jedyna animacja).
 *
 * API: constructor(worldContainer); update(); destroy(). Singleton-like (jeden na mape city).
 */

const PAL = {
    oilBase: 0x14121a,
    oilSheen: [0x39ff8a, 0x33d0ff, 0x9a6aff, 0xff5ad0, 0xffe04a],
    drainMetal: 0x2a2e36,
    drainDark: 0x181b21,
    drainHi: 0x3e4654,
    steam: 0xaab4c0,
};

// Math-verified pozycje (auto-scatter, omija wszystkie collidable/strefy/parkingi).
// [x, y, seed]
const OIL_LAYOUT: Array<[number, number, number]> = [
    [1446, 737, 51751], [416, 2314, 12338], [999, 273, 11266], [1896, 1832, 9157],
    [1105, 491, 72227], [1858, 362, 74116], [627, 1034, 82658], [2689, 2507, 8109],
    [2400, 665, 37960], [1836, 710, 70869], [860, 542, 76232], [2297, 1871, 41176],
    [1976, 1601, 39292], [1137, 856, 91619],
];
// [x, y, seed] — pierwsze 2 emituja pare (steaming)
const DRAIN_LAYOUT: Array<[number, number, number]> = [
    [2472, 1349, 68839], [2147, 1526, 95610], [1958, 1299, 79818], [419, 603, 67101],
    [2122, 1847, 5139], [1405, 1513, 91134], [2061, 2840, 8520], [1700, 2858, 45483],
    [1575, 808, 80075], [599, 2142, 7728],
];
const STEAMING_DRAIN_COUNT = 2;

interface SteamSource {
    x: number;
    y: number;
}

interface SteamPuff {
    x: number;
    y: number;
    vy: number;
    age: number;
    maxAge: number;
    size: number;
    srcIdx: number;
}

export class GroundClutter {
    private gfxGround: PIXI.Graphics;   // baked: plamy + studzienki
    private gfxSteam: PIXI.Graphics;    // animowane: para z 1-2 studzienek
    private steamSources: SteamSource[] = [];
    private puffs: SteamPuff[] = [];
    private spawnCooldown: number = 0;
    private time: number = 0;

    constructor(worldContainer: PIXI.Container) {
        this.gfxGround = new PIXI.Graphics();
        this.gfxGround.zIndex = -79; // najnizej z dekoracji (pod parkingami nawet), nad mapa
        worldContainer.addChild(this.gfxGround);

        this.gfxSteam = new PIXI.Graphics();
        this.gfxSteam.zIndex = -72; // para lekko nad ziemia, wciaz pod tankami
        worldContainer.addChild(this.gfxSteam);

        this.drawOils();
        this.drawDrains();
    }

    private rand(n: number): number {
        const s = Math.sin(n * 12.9898 + 7.131) * 43758.5453;
        return s - Math.floor(s);
    }

    private drawOils(): void {
        const g = this.gfxGround;
        for (const [x, y, seed] of OIL_LAYOUT) {
            const rng = (i: number) => this.rand(seed + i * 3.7);
            const rx = 35 + rng(1) * 20;          // promien glowny
            const ry = rx * (0.45 + rng(2) * 0.15); // kompresja 2.5D (plaska ciecz w rzucie)

            // 1. ORGANICZNA BAZA (zlepek elips + rozchlapane krople-satelity)
            g.beginFill(PAL.oilBase, 0.85);
            g.drawEllipse(x, y, rx, ry);                                  // glowna kaluza
            g.drawEllipse(x + rx * 0.5, y + ry * 0.4, rx * 0.4, ry * 0.5); // wybrzuszenie prawe
            g.drawEllipse(x - rx * 0.4, y - ry * 0.4, rx * 0.45, ry * 0.3); // wybrzuszenie lewe
            g.drawEllipse(x + rx * 0.9, y - ry * 0.6, 4, 2);              // kropla
            g.drawEllipse(x - rx * 0.8, y + ry * 0.7, 6, 3);              // kropla
            g.endFill();

            // 2. TECZOWY BENZYNOWY FILM (przesuniete, niesymetryczne warstwy — nie matrioszka)
            //    Korekta jasnosci: alpha 0.10 (nizej niz proponowane 0.12) — plama ma byc CICHA.
            for (let i = 0; i < PAL.oilSheen.length; i++) {
                const t = i / PAL.oilSheen.length;
                g.beginFill(PAL.oilSheen[i], 0.10 - t * 0.025);
                const offsetX = (rng(i + 10) - 0.5) * rx * 0.7;
                const offsetY = (rng(i + 11) - 0.5) * ry * 0.7;
                const layerRx = rx * (0.75 - t * 0.3) * (0.8 + rng(i) * 0.4);
                const layerRy = ry * (0.75 - t * 0.3) * (0.8 + rng(i + 1) * 0.4);
                g.drawEllipse(x + offsetX, y + offsetY, layerRx, layerRy);
                g.endFill();
            }

            // 3. PLASKIE REFLEKSY (ukosne waskie poziome rysy = mokry plaski asfalt odbijajacy neony)
            //    Korekta jasnosci: alpha 0.07 (nizej niz proponowane 0.12) — zeby nie blyszczalo
            //    za mocno na ciemnej mapie (lekcja god-rays z NEON-OASIS: additive pral do bieli).
            g.beginFill(0xffffff, 0.07);
            g.drawEllipse(x, y - ry * 0.2, rx * 0.6, 1.5);          // dluga przednia rysa
            g.drawEllipse(x - rx * 0.3, y + ry * 0.3, rx * 0.3, 1.0); // krotka boczna rysa
            g.drawEllipse(x - rx * 0.8, y + ry * 0.7 - 0.5, 1.5, 0.5); // blysk na kropli
            g.endFill();
        }
    }

    private drawDrains(): void {
        const g = this.gfxGround;
        DRAIN_LAYOUT.forEach(([x, y, seed], idx) => {
            const isManhole = this.rand(seed) > 0.45; // ~55% wlaz, reszta kratka wentylacyjna
            if (idx < STEAMING_DRAIN_COUNT) {
                this.steamSources.push({ x, y });
            }
            if (isManhole) {
                this.drawManhole(g, x, y, seed);
            } else {
                this.drawVent(g, x, y, seed);
            }
        });
    }

    private drawManhole(g: PIXI.Graphics, x: number, y: number, _seed: number): void {
        const r = 15;
        // cien/wglebienie (obwodka)
        g.beginFill(0x000000, 0.30);
        g.drawCircle(x, y, r + 2);
        g.endFill();
        // pokrywa metalowa
        g.beginFill(PAL.drainMetal, 1);
        g.drawCircle(x, y, r);
        g.endFill();
        // highlight (light upper-left)
        g.beginFill(PAL.drainHi, 0.5);
        g.drawCircle(x - r * 0.3, y - r * 0.3, r * 0.5);
        g.endFill();
        // wzor — koncentryczne + szprychy (klasyczny wlaz)
        g.lineStyle(1, PAL.drainDark, 0.8);
        g.drawCircle(x, y, r - 3);
        g.drawCircle(x, y, r - 7);
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            g.moveTo(x + Math.cos(a) * (r - 7), y + Math.sin(a) * (r - 7));
            g.lineTo(x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1));
        }
        g.lineStyle(0);
        // 2 otwory podnoszenia
        g.beginFill(PAL.drainDark, 1);
        g.drawCircle(x - 4, y, 1.5);
        g.drawCircle(x + 4, y, 1.5);
        g.endFill();
    }

    private drawVent(g: PIXI.Graphics, x: number, y: number, seed: number): void {
        const w = 22 + this.rand(seed + 1) * 8;
        const h = 14 + this.rand(seed + 2) * 6;
        // rama wglebienia
        g.beginFill(0x000000, 0.28);
        g.drawRoundedRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 3);
        g.endFill();
        // plyta kratki
        g.beginFill(PAL.drainMetal, 1);
        g.drawRoundedRect(x - w / 2, y - h / 2, w, h, 2);
        g.endFill();
        // szczeliny (rownolegle paski)
        g.lineStyle(1.5, PAL.drainDark, 0.85);
        const slots = Math.floor(h / 4);
        for (let i = 1; i < slots; i++) {
            const sy = y - h / 2 + (h * i) / slots;
            g.moveTo(x - w / 2 + 3, sy);
            g.lineTo(x + w / 2 - 3, sy);
        }
        g.lineStyle(0);
        // highlight ramy (gora-lewa)
        g.lineStyle(1, PAL.drainHi, 0.5);
        g.moveTo(x - w / 2, y - h / 2);
        g.lineTo(x + w / 2, y - h / 2);
        g.lineStyle(0);
    }

    /** Tylko para z 1-2 studzienek (powolna, rzadka — jedyna animacja). */
    public update(): void {
        this.time += 1 / 60;
        const g = this.gfxSteam;
        g.clear();
        if (this.steamSources.length === 0) return;

        // spawn rzadko (co ~40-70 klatek) z losowego steaming-source
        this.spawnCooldown--;
        if (this.spawnCooldown <= 0) {
            this.spawnCooldown = 40 + Math.floor(this.rand(this.time * 2.3) * 30);
            const srcIdx = Math.floor(this.rand(this.time * 5.1) * this.steamSources.length) % this.steamSources.length;
            const src = this.steamSources[srcIdx];
            this.puffs.push({
                x: src.x + (this.rand(this.time * 7) - 0.5) * 6,
                y: src.y,
                vy: -0.25 - this.rand(this.time) * 0.2,
                age: 0,
                maxAge: 90 + this.rand(this.time * 3) * 50,
                size: 6 + this.rand(this.time * 1.7) * 5,
                srcIdx,
            });
        }
        for (let i = this.puffs.length - 1; i >= 0; i--) {
            const p = this.puffs[i];
            p.age++;
            if (p.age >= p.maxAge) { this.puffs.splice(i, 1); continue; }
            p.y += p.vy;
            p.x += Math.sin((p.age + i) * 0.05) * 0.15; // delikatny dryf
            const lifeT = p.age / p.maxAge;
            const size = p.size * (1 + lifeT * 1.4);
            const alpha = Math.sin(lifeT * Math.PI) * 0.16; // fade in-out, bardzo subtelne
            g.beginFill(PAL.steam, alpha);
            g.drawCircle(p.x, p.y, size);
            g.endFill();
            g.beginFill(PAL.steam, alpha * 0.5);
            g.drawCircle(p.x - size * 0.15, p.y - size * 0.15, size * 0.6);
            g.endFill();
        }
    }

    public destroy(): void {
        this.gfxGround.destroy();
        this.gfxSteam.destroy();
        this.steamSources = [];
        this.puffs = [];
    }
}