import * as PIXI from 'pixi.js';

/**
 * v0.60.0 — Parking (cyberpunk parking lot — cichy wypelniacz pustej przestrzeni).
 *
 * PASSABLE (niekolizyjny): czolg/pociski przelatuja. NIE w buildings/solidBuildings.
 * Czysta dekoracja wypelniajaca pustke. Zaprojektowany tak, by NIE dominowac mapy:
 *   - linie miejsc PRZYTLUMIONE (alpha ~0.15-0.20)
 *   - pojazdy CIEMNE, statyczne, mix hover + auta na kolach, mala dioda pozycyjna (wolny puls)
 *   - latarnie uliczne: ciemny slup + miekki stozek cieplego swiatla w dol (nie neon)
 *
 * Render: 3 warstwy na ziemi (pod tankami):
 *   gfxGround (zIndex -76): asfalt + przytlumione linie miejsc
 *   gfxLamps  (zIndex -75): stozki swiatla latarni (lekko nad asfaltem)
 *   gfxCars   (zIndex = y-sort per auto? NIE — staly niski, by nie skakac): pojazdy
 *   gfxLED    (zIndex high-ish): diody pozycyjne aut (delikatny puls, additive)
 *
 * Wszystko baked raz; tylko diody pulsuja w update() (bardzo wolno). Reszta statyczna.
 *
 * API: constructor(x, y, w, h, seed, worldContainer); update(); destroy().
 * Brak isPointInside (to nie strefa-efekt). Brak onTankEnter (passable, brak interakcji).
 */

const PAL = {
    asphalt: 0x191c22,
    asphaltVar: 0x21252d,
    line: 0x6a7280,          // linie miejsc (rysowane z niska alpha)
    // pojazdy (ciemne, przygaszone — niski kontrast)
    carBodies: [0x2a3038, 0x322836, 0x283038, 0x2e2a32, 0x263038, 0x302c28],
    carGlass: 0x10141c,
    carTrim: 0x3e4654,
    hoverGlow: 0x2a4a5a,     // przygaszony hover podswietlenie (spod auta)
    led: 0x44ddaa,           // dioda pozycyjna (wolny puls)
    ledAlt: 0xff6688,
    lampPost: 0x2a2e36,
    lampLight: 0xffcc88,     // cieple swiatlo latarni (nie neon)
};

interface CarLED {
    x: number;
    y: number;
    phase: number;
    color: number;
    carX: number;       // v0.60.0 #3 — srodek auta (do detekcji najechania czolgiem)
    carY: number;
    alarmTimer: number; // v0.60.0 #3 — >0 = alarm aktywny (nerwowy puls), liczony w dol
}

export class Parking {
    public readonly x: number;
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private worldContainer: PIXI.Container;
    private gfxGround: PIXI.Graphics;
    private gfxLamps: PIXI.Graphics;
    private gfxCars: PIXI.Graphics;
    private gfxLED: PIXI.Graphics;
    private leds: CarLED[] = [];
    private time: number = 0;

    constructor(
        x: number, y: number,
        w: number, h: number,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.worldContainer = worldContainer;
        const rng = makeRng(seed);

        this.gfxGround = new PIXI.Graphics();
        this.gfxGround.zIndex = -76; // nad bazowa tekstura mapy, pod tankami
        worldContainer.addChild(this.gfxGround);

        this.gfxLamps = new PIXI.Graphics();
        this.gfxLamps.zIndex = -75;
        this.gfxLamps.blendMode = PIXI.BLEND_MODES.ADD; // miekkie swiatlo
        worldContainer.addChild(this.gfxLamps);

        this.gfxCars = new PIXI.Graphics();
        this.gfxCars.zIndex = -74; // auta nad asfaltem, ale pod tankami (passable, plaskie)
        worldContainer.addChild(this.gfxCars);

        this.gfxLED = new PIXI.Graphics();
        this.gfxLED.zIndex = -73;
        this.gfxLED.blendMode = PIXI.BLEND_MODES.ADD;
        worldContainer.addChild(this.gfxLED);

        this.drawGround(rng);
        this.drawCarsAndLamps(rng);
    }

    private drawGround(rng: () => number): void {
        const g = this.gfxGround;
        const R = 16;
        // cien terenu (osadzenie)
        g.beginFill(0x000000, 0.18);
        g.drawRoundedRect(this.x + 5, this.y + 8, this.w, this.h, R);
        g.endFill();
        // plyta asfaltu (ciemniejsza od mapy = wydzielony plac)
        g.beginFill(PAL.asphalt, 0.90);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, R);
        g.endFill();
        // wariacja tekstury (plamy)
        g.beginFill(PAL.asphaltVar, 0.30);
        for (let i = 0; i < Math.floor((this.w * this.h) / 5000); i++) {
            g.drawCircle(this.x + rng() * this.w, this.y + rng() * this.h, 2 + rng() * 4);
        }
        g.endFill();
        // outline placu (subtelny)
        g.lineStyle(2, 0x0a0c10, 0.5);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, R);
        g.lineStyle(0);

        // --- PRZYTLUMIONE LINIE MIEJSC (rzedy prostopadlych miejsc parkingowych) ---
        // Rysujemy rzedy miejsc (pionowe kreski dzielace) z bardzo niska alpha.
        const SLOT_W = 46;       // szerokosc miejsca
        const ROW_H = 84;        // glebokosc rzedu (auto + pas)
        const AISLE = 54;        // alejka miedzy rzedami (podwojny rzad + alejka)
        const margin = 24;
        g.lineStyle(2, PAL.line, 0.16); // PRZYTLUMIONE (alpha 0.16)
        let ry = this.y + margin;
        let rowToggle = 0;
        while (ry + ROW_H < this.y + this.h - margin) {
            // linia bazowa rzedu (gdzie auta "stykaja sie" zderzakami) co drugi to alejka
            for (let sx = this.x + margin; sx < this.x + this.w - margin; sx += SLOT_W) {
                // pionowe kreski miejsc
                g.moveTo(sx, ry);
                g.lineTo(sx, ry + ROW_H * 0.62);
            }
            // pozioma linia konca miejsc
            g.moveTo(this.x + margin, ry + ROW_H * 0.62);
            g.lineTo(this.x + this.w - margin, ry + ROW_H * 0.62);
            ry += ROW_H + (rowToggle % 2 === 0 ? AISLE : 0);
            rowToggle++;
        }
        g.lineStyle(0);
        // strzalki kierunku jazdy w alejkach (jeszcze bledsze)
        g.lineStyle(1.5, PAL.line, 0.10);
        for (let ay = this.y + margin + ROW_H + 20; ay < this.y + this.h - margin; ay += (ROW_H + AISLE)) {
            const axc = this.x + this.w / 2;
            g.moveTo(axc - 6, ay + 6); g.lineTo(axc, ay); g.lineTo(axc + 6, ay + 6);
        }
        g.lineStyle(0);
    }

    private drawCarsAndLamps(rng: () => number): void {
        const cg = this.gfxCars;
        const margin = 24;
        const SLOT_W = 46;
        const ROW_H = 84;
        const AISLE = 54;

        // --- POJAZDY w miejscach (mix hover + auta, ~60% wypelnienia = nie tloczno) ---
        let ry = this.y + margin;
        let rowToggle = 0;
        while (ry + ROW_H < this.y + this.h - margin) {
            for (let sx = this.x + margin + 3; sx < this.x + this.w - margin - SLOT_W; sx += SLOT_W) {
                if (rng() > 0.62) continue; // ~38% miejsc pustych
                const carCX = sx + SLOT_W / 2 - 2;
                const carCY = ry + ROW_H * 0.34;
                const isHover = rng() < 0.45;
                this.drawCar(cg, carCX, carCY, rng, isHover);
                // dioda pozycyjna (wolny puls) — zapamietana do update
                this.leds.push({
                    x: carCX + (rng() < 0.5 ? -8 : 8),
                    y: carCY - 14,
                    phase: rng() * Math.PI * 2,
                    color: rng() < 0.5 ? PAL.led : PAL.ledAlt,
                    carX: carCX,        // v0.60.0 #3
                    carY: carCY,
                    alarmTimer: 0,
                });
            }
            ry += ROW_H + (rowToggle % 2 === 0 ? AISLE : 0);
            rowToggle++;
        }

        // --- LATARNIE ULICZNE (slup + miekki stozek cieplego swiatla w dol) ---
        const lg = this.gfxLamps;
        // rozstaw latarni: po obwodzie + ewentualnie srodkowa kolumna dla duzego parkingu
        const lampPositions: Array<[number, number]> = [];
        const lampGap = 220;
        for (let lx = this.x + 60; lx < this.x + this.w - 40; lx += lampGap) {
            lampPositions.push([lx, this.y + 50]);
            lampPositions.push([lx, this.y + this.h - 50]);
        }
        // dla ogromnego parkingu — srodkowy rzad latarni
        if (this.w > 500) {
            for (let lx = this.x + 160; lx < this.x + this.w - 120; lx += lampGap) {
                lampPositions.push([lx, this.y + this.h / 2]);
            }
        }
        for (const [lx, ly] of lampPositions) {
            // stozek swiatla na ziemi (miekki, cieply, w dol) — na gfxLamps (ADD)
            lg.beginFill(PAL.lampLight, 0.06);
            lg.drawEllipse(lx, ly + 14, 38, 22);
            lg.endFill();
            lg.beginFill(PAL.lampLight, 0.10);
            lg.drawEllipse(lx, ly + 14, 22, 13);
            lg.endFill();
            // slup latarni (na gfxCars zeby byl ciemny, nie additive)
            cg.beginFill(0x000000, 0.22);
            cg.drawEllipse(lx + 3, ly + 16, 7, 2.5); // cien slupa
            cg.endFill();
            cg.beginFill(PAL.lampPost, 1);
            cg.drawRect(lx - 2, ly - 18, 4, 32); // slup
            cg.endFill();
            cg.beginFill(PAL.lampPost, 1);
            cg.drawRoundedRect(lx - 7, ly - 22, 14, 6, 2); // oprawa
            cg.endFill();
            // zarowka (cieply punkt)
            lg.beginFill(PAL.lampLight, 0.5);
            lg.drawCircle(lx, ly - 19, 3);
            lg.endFill();
        }
    }

    /** Rysuje pojedynczy pojazd (hover lub auto na kolach) — ciemny, statyczny, top-down. */
    private drawCar(g: PIXI.Graphics, cx: number, cy: number, rng: () => number, isHover: boolean): void {
        const body = PAL.carBodies[Math.floor(rng() * PAL.carBodies.length)];
        const L = 30 + rng() * 6;  // dlugosc (pol)
        const W = 15;              // szerokosc (pol)

        if (isHover) {
            // hover — przygaszone podswietlenie spod auta (lewituje)
            g.beginFill(PAL.hoverGlow, 0.18);
            g.drawEllipse(cx, cy + 4, W + 4, L * 0.5);
            g.endFill();
        } else {
            // cien auta na ziemi
            g.beginFill(0x000000, 0.25);
            g.drawEllipse(cx + 2, cy + 3, W, L * 0.5);
            g.endFill();
            // kola (4, ciemne, wystajace lekko)
            g.beginFill(0x0c0e12, 1);
            for (const wy of [cy - L * 0.45, cy + L * 0.45]) {
                g.drawRoundedRect(cx - W - 1, wy - 4, 4, 8, 2);
                g.drawRoundedRect(cx + W - 3, wy - 4, 4, 8, 2);
            }
            g.endFill();
        }

        // kadlub (baza/boki — zaokraglony prostokat, ciemny)
        g.beginFill(body, 1);
        g.drawRoundedRect(cx - W, cy - L * 0.5, W * 2, L, 6);
        g.endFill();

        // v0.60.0 #2 — BRYLA 2.5D: trapezy szyb (skrot perspektywiczny) + osobny dach wyzej.
        // Trapez = waski u gory (dach), szeroki u dolu (maska/bagaznik) -> mozg czyta nachylenie.
        const roofW = W * 0.62;
        const roofL = L * 0.40;
        const roofCY = cy + L * 0.04; // dach minimalnie do tylu (wydluza maske z przodu)
        const roofTopY = roofCY - roofL * 0.5;
        const roofBotY = roofCY + roofL * 0.5;
        const hoodY = cy - L * 0.40;  // podszybie przod
        const trunkY = cy + L * 0.42; // podszybie tyl
        const glassBaseW = W * 0.82;

        g.beginFill(PAL.carGlass, 0.95);
        // przednia szyba (trapez: waski u gory przy dachu, szeroki u dolu przy masce)
        g.drawPolygon([
            cx - roofW, roofTopY,
            cx + roofW, roofTopY,
            cx + glassBaseW, hoodY,
            cx - glassBaseW, hoodY,
        ]);
        // tylna szyba (odwrocony trapez)
        g.drawPolygon([
            cx + roofW, roofBotY,
            cx - roofW, roofBotY,
            cx - glassBaseW, trunkY,
            cx + glassBaseW, trunkY,
        ]);
        g.endFill();

        // dach (najwyzszy punkt — rysowany na koncu, ostro przykrywa styki szyb)
        g.beginFill(body, 1);
        g.drawRoundedRect(cx - roofW, roofTopY, roofW * 2, roofL, 3);
        g.endFill();

        // highlight gornej krawedzi dachu (light upper-left)
        g.lineStyle(1.5, 0xffffff, 0.10);
        g.moveTo(cx - roofW + 2, roofTopY + 1);
        g.lineTo(cx + roofW - 2, roofTopY + 1);
        g.lineStyle(0);
        // ukosny matowy refleks na przedniej szybie (pancerne szklo)
        g.beginFill(0xffffff, 0.06);
        g.drawPolygon([
            cx - roofW * 0.5, roofTopY + 2,
            cx + roofW * 0.2, roofTopY + 2,
            cx + glassBaseW * 0.2, hoodY - 2,
            cx - glassBaseW * 0.5, hoodY - 2,
        ]);
        g.endFill();

        // przygaszone swiatla (przod — reflektory)
        g.beginFill(0x99aabb, 0.35);
        g.drawCircle(cx - W * 0.5, cy - L * 0.5 + 3, 2);
        g.drawCircle(cx + W * 0.5, cy - L * 0.5 + 3, 2);
        g.endFill();
    }

    /**
     * Diody pozycyjne pulsuja (bardzo wolno). v0.60.0 #3: gdy czolg najedzie na auto,
     * jego dioda przechodzi w ALARM (nerwowy, szybki, ostry puls PAL.ledAlt) na ~4s.
     * playerX/playerY opcjonalne — bez nich tylko spokojny puls (brak alarmu).
     */
    public update(playerX?: number, playerY?: number): void {
        this.time += 1 / 60;
        const g = this.gfxLED;
        g.clear();
        for (const led of this.leds) {
            // detekcja najechania czolgiem -> wlacz alarm (4s = 240 klatek)
            if (playerX !== undefined && playerY !== undefined && led.alarmTimer <= 0) {
                const dx = playerX - led.carX, dy = playerY - led.carY;
                if (dx * dx + dy * dy < 32 * 32) led.alarmTimer = 240;
            }
            if (led.alarmTimer > 0) led.alarmTimer--;

            if (led.alarmTimer > 0) {
                // ALARM — nerwowy, szybki puls ostrym czerwono-rozowym (ledAlt)
                const a = Math.sin(this.time * 22 + led.phase) > 0 ? 0.95 : 0.25;
                g.beginFill(PAL.ledAlt, a * 0.6);
                g.drawCircle(led.x, led.y, 4);
                g.endFill();
                g.beginFill(PAL.ledAlt, a);
                g.drawCircle(led.x, led.y, 1.6);
                g.endFill();
            } else {
                // spokojny wolny puls (oddychanie ~3s) — niski kontrast
                const a = 0.18 + 0.18 * (0.5 + 0.5 * Math.sin(this.time * 1.1 + led.phase));
                g.beginFill(led.color, a * 0.5);
                g.drawCircle(led.x, led.y, 2.5);
                g.endFill();
                g.beginFill(led.color, a);
                g.drawCircle(led.x, led.y, 1);
                g.endFill();
            }
        }
    }

    public destroy(): void {
        this.gfxGround.destroy();
        this.gfxLamps.destroy();
        this.gfxCars.destroy();
        this.gfxLED.destroy();
        this.leds = [];
    }
}

// ───────────────────────────────────────────────────────────────
function makeRng(seed: number): () => number {
    let state = (seed | 0) || 1;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}