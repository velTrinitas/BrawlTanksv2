import * as PIXI from 'pixi.js';

/**
 * v0.59.0 Warstwa D — SludgePool (Rozlewisko Toksycznego Szlamu) na mapie cyberpunk.
 *
 * Cyberpunkowy odpowiednik Quicksand z pustyni — slow zone (speedModifier 0.5),
 * ale PROSTOKATNY (nie eliptyczny) z "obtopiona" zaokraglona krawedzia, i wizualnie
 * AAA 2.5D bulgoczacy zielony szlam (jezyk wizualny przeniesiony z SludgeReactor:
 * baqble bg/fg + pop rings + surface specular + emisyjna poswiata).
 *
 * Mechanika (czysty reuse Quicksand API):
 *   - isPointInside(px, py) = test AABB (prostokat halfW x halfH wokol center)
 *   - x/y = CENTER strefy (NIE top-left — spojnie z Quicksand)
 *   - Gracz/wrog wewnatrz: speed x 0.5 (zarzadzane przez main.ts ticker, jak quicksand)
 *   - NO collision — mozna wjechac, pociski przelatuja. NIE w buildings/solidBuildings.
 *
 * Visual layers (zIndex stack w container, container.zIndex = 4 — pod graczem/obiektami):
 *   gfxStatic   — dno 2.5D (gradient glebia krawedz->srodek) + bake raz
 *   gfxSurface  — powierzchnia szlamu (specular highlights + pelzajace smugi) per-frame
 *   gfxBubbles  — bulgoczace pecherze (bg dim + fg vibrant) + pop rings per-frame
 *   gfxRim      — emisyjna poswiata krawedzi (pulsing) per-frame
 *
 * Ksztalt: prostokat z zaokraglonymi rogami + drobne losowe wciecia na krawedzi
 * ("obtopiony" rozlany szlam — nie sztywny basen). Hitbox pozostaje czysto prostokatny
 * (isPointInside = AABB) dla taniej detekcji; nieregularnosc jest TYLKO wizualna.
 *
 * Static-baked art (gfxStatic + ksztalt rozlewiska) NIE odswieza sie przez Vite HMR
 * — wymaga re-entry mapy (znany pattern projektu).
 */

const PALETTE = {
    sludgeBright: 0x39ff6a,  // jasny toksyczny zielony (powierzchnia, hot bubbles)
    sludgeMid: 0x1faa3c,     // sredni zielony (cialo szlamu)
    sludgeDeep: 0x0d5e26,    // ciemny zielony (glebia / dno)
    sludgeDark: 0x06381a,    // najciemniejszy (centrum wglebienia)
    rim: 0x55ff88,           // emisyjna poswiata krawedzi
    bubbleHi: 0xaaffc4,      // highlight pecherza
};

interface SludgeBubble {
    relX: number;            // -1..1 (pozycja w prostokacie, horizontal)
    relY: number;            // -1..1 (vertical)
    radius: number;
    phase: number;
    speed: number;
    depth: 'bg' | 'fg';
    wasNearPop: boolean;     // anti multi-trigger pop ring
}

interface PopRing {
    x: number;
    y: number;
    age: number;
    maxAge: number;
    initialRadius: number;
}

/**
 * v0.59.0 AAA #2 — pol-zatopiony zlom rozpuszczajacy sie w szlamie (lore + skala).
 * Leniwie dryfuje gora-dol + delikatnie sie buja (gesty osrodek). Pod powierzchnia
 * (gfxDebris pod gfxBubbles, nad gfxSurface) — specular powierzchni przykrywa go lekko.
 */
interface SludgeDebris {
    relX: number;
    relY: number;
    angle: number;
    phase: number;
    size: number;
    kind: 'beam' | 'barrel'; // typ zlomu (belka cyber / beczka)
}

/**
 * v0.59.0 AAA #3 — fluid wake (slad gasienic w gestej mazi). Spawnowany gdy gracz
 * jedzie przez basen (licznik klatek w main.ts steruje czestotliwoscia — NIE random).
 * Rozszerzajaca sie + gasnaca elipsa (przeskalowana w X = fake 2.5D perspektywa).
 */
interface WakeRing {
    x: number;  // local coords (wzgledem container = center poola)
    y: number;
    age: number;
    maxAge: number;
}

interface SurfaceStreak {
    relX: number;
    relY: number;
    len: number;
    angle: number;
    speed: number;
    phase: number;
}

export class SludgePool {
    public x: number;          // CENTER X (used dla isPointInside)
    public y: number;          // CENTER Y
    public halfW: number;      // polowa szerokosci (AABB)
    public halfH: number;      // polowa wysokosci (AABB)

    private seed: number;

    private container: PIXI.Container;
    private gfxStatic: PIXI.Graphics;
    private gfxSurface: PIXI.Graphics;
    private gfxDebris: PIXI.Graphics;   // v0.59.0 AAA #2 — pol-zatopiony zlom (pod babelkami)
    private gfxBubbles: PIXI.Graphics;
    private gfxRim: PIXI.Graphics;

    private bubbles: SludgeBubble[] = [];
    private popRings: PopRing[] = [];
    private streaks: SurfaceStreak[] = [];
    private debris: SludgeDebris[] = [];   // v0.59.0 AAA #2
    private wakes: WakeRing[] = [];         // v0.59.0 AAA #3
    private animTime: number = 0;

    // edge "obtopienie" — losowe wciecia krawedzi (znormalizowane 0..1 wzdluz obwodu),
    // generowane raz w konstruktorze (seed) i uzywane w drawStaticBackground.
    private edgeNoise: number[] = [];

    constructor(
        x: number,
        y: number,
        halfW: number,
        halfH: number,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        this.x = x;
        this.y = y;
        this.halfW = halfW;
        this.halfH = halfH;
        this.seed = seed;

        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = 4; // nad tlem mapy, pod graczem/wrogami/obiektami
        worldContainer.addChild(this.container);

        this.gfxStatic = new PIXI.Graphics();
        this.gfxSurface = new PIXI.Graphics();
        this.gfxDebris = new PIXI.Graphics();
        this.gfxBubbles = new PIXI.Graphics();
        this.gfxRim = new PIXI.Graphics();
        this.container.addChild(this.gfxStatic);
        this.container.addChild(this.gfxSurface);
        this.container.addChild(this.gfxDebris);  // v0.59.0 AAA #2 — nad powierzchnia, pod babelkami
        this.container.addChild(this.gfxBubbles);
        this.container.addChild(this.gfxRim);

        this.initEdgeNoise();
        this.initBubbles();
        this.initStreaks();
        this.initDebris();
        this.drawStaticBackground();
    }

    /**
     * AABB test — punkt (px,py) world coords wewnatrz prostokata strefy.
     * Czysto prostokatny (nieregularna krawedz jest tylko wizualna).
     */
    public isPointInside(px: number, py: number): boolean {
        return px >= this.x - this.halfW && px <= this.x + this.halfW
            && py >= this.y - this.halfH && py <= this.y + this.halfH;
    }

    /** Pseudo-random deterministyczny z seed (zeby ksztalt byl powtarzalny per pool). */
    private rand(n: number): number {
        const s = Math.sin(this.seed * 99.13 + n * 12.9898) * 43758.5453;
        return s - Math.floor(s);
    }

    private initEdgeNoise(): void {
        // 48 punktow wzdluz obwodu — drobne wciecia/wypuklenia "obtopionego" szlamu.
        const N = 48;
        for (let i = 0; i < N; i++) {
            // delikatne: 0.86..1.0 mnoznik promienia rogu (lekko falujaca krawedz)
            this.edgeNoise.push(0.86 + this.rand(i) * 0.14);
        }
    }

    private initBubbles(): void {
        // BG (glebia, dim) + FG (powierzchnia, vibrant). Gestosc skalowana powierzchnia.
        const area = (this.halfW * this.halfH) / (200 * 150); // wzgledem mniejszego poola
        const bgCount = Math.round(6 * area);
        const fgCount = Math.round(7 * area);
        for (let i = 0; i < bgCount; i++) {
            this.bubbles.push({
                relX: (this.rand(i * 2.1) - 0.5) * 1.7,
                relY: (this.rand(i * 3.7) - 0.5) * 1.7,
                radius: 2 + this.rand(i * 1.3) * 2,
                phase: this.rand(i * 5.1) * Math.PI * 2,
                speed: 0.7 + this.rand(i * 0.9) * 0.5,
                depth: 'bg',
                wasNearPop: false,
            });
        }
        for (let i = 0; i < fgCount; i++) {
            this.bubbles.push({
                relX: (this.rand(100 + i * 2.3) - 0.5) * 1.7,
                relY: (this.rand(100 + i * 4.1) - 0.5) * 1.7,
                radius: 3.5 + this.rand(100 + i * 1.7) * 3,
                phase: this.rand(100 + i * 6.3) * Math.PI * 2,
                speed: 0.85 + this.rand(100 + i * 1.1) * 0.5,
                depth: 'fg',
                wasNearPop: false,
            });
        }
    }

    private initStreaks(): void {
        // pelzajace smugi na powierzchni (slow drift), 4-7 szt skalowane area
        const count = 4 + Math.round(this.rand(7.7) * 3);
        for (let i = 0; i < count; i++) {
            this.streaks.push({
                relX: (this.rand(200 + i * 2.9) - 0.5) * 1.5,
                relY: (this.rand(200 + i * 3.3) - 0.5) * 1.5,
                len: 18 + this.rand(200 + i * 1.9) * 26,
                angle: this.rand(200 + i * 4.7) * Math.PI,
                speed: 0.1 + this.rand(200 + i * 0.7) * 0.15,
                phase: this.rand(200 + i * 5.9) * Math.PI * 2,
            });
        }
    }

    private initDebris(): void {
        // v0.59.0 AAA #2 — 2-4 sztuki zlomu skalowane area (wieksze jezioro = wiecej smieci).
        const area = (this.halfW * this.halfH) / (200 * 150);
        const count = Math.max(2, Math.round(2.5 * area));
        for (let i = 0; i < count; i++) {
            this.debris.push({
                // trzymamy zlom w srodkowych 60% (nie na samej krawedzi)
                relX: (this.rand(700 + i * 2.7) - 0.5) * 1.2,
                relY: (this.rand(700 + i * 3.9) - 0.5) * 1.2,
                angle: this.rand(700 + i * 4.3) * Math.PI,
                phase: this.rand(700 + i * 5.7) * Math.PI * 2,
                size: 0.8 + this.rand(700 + i * 1.1) * 0.6,
                kind: this.rand(700 + i * 6.1) > 0.5 ? 'beam' : 'barrel',
            });
        }
    }

    /**
     * Ksztalt rozlewiska — zaokraglony prostokat z "obtopiona" nieregularna krawedzia.
     * Buduje sciezke punktow wokol prostokata z rounded corners, modulowana edgeNoise.
     * Wypelniana w drawStaticBackground (dno) i reuse jako clip wizualny.
     */
    private buildShapePath(g: PIXI.Graphics, scaleX: number, scaleY: number): void {
        const hw = this.halfW * scaleX;
        const hh = this.halfH * scaleY;
        const corner = Math.min(hw, hh) * 0.45; // promien zaokraglenia rogow
        const N = this.edgeNoise.length;

        // Parametryzacja: idziemy po obwodzie zaokraglonego prostokata,
        // moduluja promien przez edgeNoise (delikatne wciecia).
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < N; i++) {
            const t = (i / N) * Math.PI * 2;
            // baza: superellipse-ish zaokraglony prostokat
            const cosT = Math.cos(t);
            const sinT = Math.sin(t);
            // znormalizowane do prostokata z zaokraglonymi rogami:
            const ex = Math.sign(cosT) * Math.min(hw, Math.abs(cosT) * (hw + corner));
            const ey = Math.sign(sinT) * Math.min(hh, Math.abs(sinT) * (hh + corner));
            // mix prostokat<->elipsa dla "obtopienia"
            const blend = 0.30; // 0=ostry prostokat, 1=elipsa
            const px = (ex * (1 - blend) + cosT * hw * blend) * this.edgeNoise[i];
            const py = (ey * (1 - blend) + sinT * hh * blend) * this.edgeNoise[i];
            pts.push([px, py]);
        }

        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            g.lineTo(pts[i][0], pts[i][1]);
        }
        g.closePath();
    }

    /**
     * v0.59.0 AAA #1 — wariant buildShapePath z offsetem (dx,dy) w local space.
     * Uzywany jako "dziura" w inner-shadow (evenodd fill): obszar miedzy konturem
     * zewnetrznym a tym przesunietym tworzy cien na gornej-lewej scianie zapadliska.
     */
    private buildShapePathOffset(g: PIXI.Graphics, scaleX: number, scaleY: number, dx: number, dy: number): void {
        const hw = this.halfW * scaleX;
        const hh = this.halfH * scaleY;
        const corner = Math.min(hw, hh) * 0.45;
        const N = this.edgeNoise.length;
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < N; i++) {
            const t = (i / N) * Math.PI * 2;
            const cosT = Math.cos(t);
            const sinT = Math.sin(t);
            const ex = Math.sign(cosT) * Math.min(hw, Math.abs(cosT) * (hw + corner));
            const ey = Math.sign(sinT) * Math.min(hh, Math.abs(sinT) * (hh + corner));
            const blend = 0.30;
            const px = (ex * (1 - blend) + cosT * hw * blend) * this.edgeNoise[i] + dx;
            const py = (ey * (1 - blend) + sinT * hh * blend) * this.edgeNoise[i] + dy;
            pts.push([px, py]);
        }
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            g.lineTo(pts[i][0], pts[i][1]);
        }
        g.closePath();
    }

    /**
     * Statyczne dno 2.5D — gradient glebi krawedz->srodek (ciemniejsze w centrum =
     * iluzja, ze szlam jest glebszy w srodku). Bake raz w konstruktorze.
     */
    private drawStaticBackground(): void {
        const g = this.gfxStatic;

        // 1) Cien rzucany / ciemna otoczka tuz poza krawedzia (subtelne osadzenie w gruncie)
        g.beginFill(0x000000, 0.30);
        this.buildShapePath(g, 1.06, 1.08);
        g.endFill();

        // 2) Cialo szlamu — od jasnego brzegu do ciemnej glebi (5 warstw koncentr.)
        const layers: Array<[number, number, number]> = [
            // [scale, color, alpha]
            [1.0, PALETTE.sludgeMid, 1.0],
            [0.82, PALETTE.sludgeDeep, 0.85],
            [0.62, PALETTE.sludgeDeep, 0.7],
            [0.42, PALETTE.sludgeDark, 0.7],
            [0.24, PALETTE.sludgeDark, 0.85],
        ];
        for (const [s, color, alpha] of layers) {
            g.beginFill(color, alpha);
            this.buildShapePath(g, s, s);
            g.endFill();
        }

        // 3) Drobne ciemne plamki (erozja / osad) rozsypane w srodku
        for (let i = 0; i < 18; i++) {
            const rx = (this.rand(300 + i) - 0.5) * 1.3 * this.halfW;
            const ry = (this.rand(400 + i) - 0.5) * 1.3 * this.halfH;
            g.beginFill(PALETTE.sludgeDark, 0.35 + this.rand(500 + i) * 0.25);
            g.drawCircle(rx, ry, 1 + this.rand(600 + i) * 2);
            g.endFill();
        }

        // 4) v0.59.0 AAA #1 — INNER SHADOW (geometria zapadliska / pit 2.5D).
        // Zamiast PIXI.mask (kapryśna na sortableChildren container) — rysujemy
        // "wewnetrzna sciane" jako ROZNICE dwoch sciezek ksztaltu:
        //   - sciezka pelna (skala 1.0)
        //   - sciezka przesunieta o (+dx,+dy) ku dolowi-prawej, lekko mniejsza
        // PIXI evenodd fill rule: rysujac obie sciezki w jednym beginFill, obszar
        // miedzy nimi (widoczny na GORNEJ-LEWEJ krawedzi, bo offset idzie w dol-prawo)
        // zostaje wypelniony ciemnym kolorem = cien rzucany przez krawedz do wnetrza.
        // Swiatlo z gory-lewej => cien na gornej-lewej wewnetrznej scianie. To daje
        // wrazenie, ze szlam jest PONIZEJ poziomu gruntu (dol/basen).
        const dx = 7, dy = 9; // offset cienia (glebokosc sciany)
        // warstwa 1 — szeroki miekki cien
        g.beginFill(0x000000, 0.42);
        this.buildShapePath(g, 1.0, 1.0);                 // kontur zewnetrzny
        this.buildShapePathOffset(g, 0.99, 0.99, dx, dy); // kontur wewnetrzny (dziura) — evenodd
        g.endFill();
        // warstwa 2 — ciemniejszy waski rdzen cienia tuz przy krawedzi (ostrzejszy urwisty brzeg)
        g.beginFill(0x000000, 0.4);
        this.buildShapePath(g, 1.0, 1.0);
        this.buildShapePathOffset(g, 0.995, 0.995, dx * 0.5, dy * 0.5);
        g.endFill();
    }

    // v0.59.0 AAA #3 — licznik klatek do throttlowania spawnu wakes (NIE random,
    // zeby spawn byl niezalezny od framerate 60/144Hz — wzorzec z sandKickFrameCounter).
    private wakeFrameCounter: number = 0;

    /**
     * Per-frame update. Sygnatura rozszerzona o pozycje gracza (v0.59.0 AAA #3 wakes):
     * gdy gracz jedzie przez basen, spawnujemy fluid wakes z jego gasienic.
     * Parametry opcjonalne — wakes po prostu nie powstaja gdy nie podane (back-compat).
     */
    public update(playerX?: number, playerY?: number, isPlayerMoving?: boolean): void {
        this.animTime += 0.016;

        // v0.59.0 AAA #3 — spawn fluid wake co N klatek gdy gracz jedzie w kwasie.
        this.wakeFrameCounter++;
        if (
            playerX !== undefined && playerY !== undefined && isPlayerMoving &&
            this.isPointInside(playerX, playerY)
        ) {
            if (this.wakeFrameCounter >= 5) { // co ~5 klatek = rownomiernie niezaleznie od FPS
                this.wakeFrameCounter = 0;
                this.wakes.push({
                    x: playerX - this.x, // local coords wzgledem container
                    y: playerY - this.y,
                    age: 0,
                    maxAge: 40, // dluzsze zycie = gesta ciecz
                });
            }
        }

        this.drawSurface();
        this.drawWakes();   // v0.59.0 AAA #3 (rysuje na gfxSurface po smugach)
        this.drawDebris();  // v0.59.0 AAA #2
        this.drawBubbles();
        this.drawRim();
    }

    /**
     * Powierzchnia: specular highlights (jasna zielona warstwa odbijajaca swiatlo
     * z gory) + pelzajace smugi. Wnetrze ksztaltu, lekko mniejsze niz dno.
     */
    private drawSurface(): void {
        const g = this.gfxSurface;
        g.clear();

        // Jasniejsza warstwa powierzchni (przesunieta lekko ku gornej-lewej = light dir)
        g.beginFill(PALETTE.sludgeBright, 0.12);
        this.buildShapePath(g, 0.9, 0.9);
        g.endFill();

        // Glossy band — szeroki specular highlight u gory powierzchni
        const bandY = -this.halfH * 0.35 + Math.sin(this.animTime * 0.8) * 4;
        g.beginFill(PALETTE.bubbleHi, 0.10);
        g.drawEllipse(-this.halfW * 0.12, bandY, this.halfW * 0.62, this.halfH * 0.22);
        g.endFill();

        // Pelzajace smugi (slow drift po powierzchni)
        for (const s of this.streaks) {
            s.relX += Math.cos(s.angle) * s.speed * 0.01;
            s.relY += Math.sin(s.angle) * s.speed * 0.01;
            // wrap w obrebie [-0.85, 0.85]
            if (s.relX > 0.85) s.relX = -0.85;
            if (s.relX < -0.85) s.relX = 0.85;
            if (s.relY > 0.85) s.relY = -0.85;
            if (s.relY < -0.85) s.relY = 0.85;

            const sx = s.relX * this.halfW;
            const sy = s.relY * this.halfH;
            const alpha = 0.10 + 0.06 * Math.sin(this.animTime * 1.5 + s.phase);
            const dx = Math.cos(s.angle) * s.len * 0.5;
            const dy = Math.sin(s.angle) * s.len * 0.5;
            g.lineStyle(2.5, PALETTE.sludgeBright, alpha);
            g.moveTo(sx - dx, sy - dy);
            g.lineTo(sx + dx, sy + dy);
        }
        g.lineStyle(0);
    }

    /**
     * v0.59.0 AAA #3 — fluid wakes (slad gasienic). Rozszerzajaca sie + gasnaca elipsa
     * (skala X > Y = fake 2.5D). Rysowane na gfxSurface PO smugach (ten sam clear w drawSurface,
     * wiec wakes musza isc tu, nie wczesniej). Ciemny zarys (wglebienie) + jasny (wierzcholek).
     */
    private drawWakes(): void {
        const g = this.gfxSurface; // wspolna warstwa z drawSurface (juz wyczyszczona tam)
        for (let i = this.wakes.length - 1; i >= 0; i--) {
            const w = this.wakes[i];
            w.age++;
            if (w.age >= w.maxAge) { this.wakes.splice(i, 1); continue; }
            const t = w.age / w.maxAge;
            const radiusX = 8 + t * 25; // szeroko
            const radiusY = 5 + t * 15; // owal = fake perspektywa 2.5D
            const alpha = (1 - t) * 0.4;
            g.lineStyle(3, PALETTE.sludgeDeep, alpha);              // ciemny zarys (wglebienie fali)
            g.drawEllipse(w.x, w.y, radiusX, radiusY);
            g.lineStyle(1.5, PALETTE.sludgeBright, alpha * 0.85);   // jasny wierzcholek (odblask)
            g.drawEllipse(w.x, w.y, radiusX - 2, radiusY - 1);
        }
        g.lineStyle(0);
    }

    /**
     * v0.59.0 AAA #2 — pol-zatopiony rozpuszczajacy sie zlom. Leniwe dryfowanie gora-dol
     * + delikatne bujanie rotacji (gesty osrodek). Reczna rotacja poligonu (bez zmiany
     * matrycy Graphics = wydajnie). Dwa typy: 'beam' (cyber-belka) i 'barrel' (beczka).
     * Gorna krawedz dostaje kwasowy zielony osad.
     */
    private drawDebris(): void {
        const g = this.gfxDebris;
        g.clear();

        for (const d of this.debris) {
            const oscY = Math.sin(this.animTime * 0.8 + d.phase) * 4;     // ociezale gora-dol
            const oscRot = Math.cos(this.animTime * 0.5 + d.phase) * 0.08; // bujanie
            const bx = d.relX * this.halfW;
            const by = d.relY * this.halfH + oscY;
            const rot = d.angle + oscRot;
            const cosA = Math.cos(rot);
            const sinA = Math.sin(rot);

            if (d.kind === 'beam') {
                // cyber-belka (wydluzony prostokat)
                const w = 18 * d.size;
                const h = 6 * d.size;
                const pts = [
                    bx + (-w) * cosA - (-h) * sinA, by + (-w) * sinA + (-h) * cosA,
                    bx + (w) * cosA - (-h) * sinA, by + (w) * sinA + (-h) * cosA,
                    bx + (w) * cosA - (h) * sinA, by + (w) * sinA + (h) * cosA,
                    bx + (-w) * cosA - (h) * sinA, by + (-w) * sinA + (h) * cosA,
                ];
                g.beginFill(0x2a1608, 0.7); // ciemna rdza (przytlumiona przez szlam)
                g.drawPolygon(pts);
                g.endFill();
                // kwasowy osad na gornej krawedzi
                g.lineStyle(1.5, PALETTE.sludgeBright, 0.4);
                g.moveTo(pts[0], pts[1]);
                g.lineTo(pts[2], pts[3]);
                g.lineStyle(0);
            } else {
                // beczka (zaokraglony korpus + obrecze) — rysowana jako elipsa pod katem
                const rw = 9 * d.size;
                const rh = 12 * d.size;
                // korpus (przyciemniony zatopiony)
                g.beginFill(0x3a2410, 0.7);
                // aproksymacja obroconej elipsy przez poligon 10-punktowy
                const bp: number[] = [];
                for (let k = 0; k < 10; k++) {
                    const a = (k / 10) * Math.PI * 2;
                    const ex = Math.cos(a) * rw;
                    const ey = Math.sin(a) * rh;
                    bp.push(bx + ex * cosA - ey * sinA, by + ex * sinA + ey * cosA);
                }
                g.drawPolygon(bp);
                g.endFill();
                // obrecz (kwasowy osad) w poprzek
                g.lineStyle(1.5, PALETTE.sludgeBright, 0.35);
                const r1x = bx + (-rw) * cosA, r1y = by + (-rw) * sinA;
                const r2x = bx + (rw) * cosA, r2y = by + (rw) * sinA;
                g.moveTo(r1x, r1y);
                g.lineTo(r2x, r2y);
                g.lineStyle(0);
            }
        }
    }

    /**
     * Bulgoczace pecherze — 2 warstwy (bg dim glebia, fg vibrant + bialy hot-spot).
     * Pop rings gdy fg pecherz osiaga peak (sinusoid top) — analog SludgeReactor.
     */
    private drawBubbles(): void {
        const g = this.gfxBubbles;
        g.clear();

        // --- BG (dim, glebia) ---
        for (const b of this.bubbles) {
            if (b.depth !== 'bg') continue;
            const osc = Math.sin(this.animTime * b.speed + b.phase);
            const bx = b.relX * this.halfW;
            const by = b.relY * this.halfH + osc * 5;
            g.beginFill(PALETTE.sludgeBright, 0.22);
            g.drawCircle(bx, by, b.radius);
            g.endFill();
        }

        // --- FG (vibrant + pop) ---
        for (const b of this.bubbles) {
            if (b.depth !== 'fg') continue;
            const osc = Math.sin(this.animTime * b.speed + b.phase);
            const bx = b.relX * this.halfW;
            const by = b.relY * this.halfH + osc * 7;

            // pop trigger: osiagniecie peak (osc blisko max = pecherz "wybija" na powierzchnie)
            const nearPop = osc > 0.92;
            if (nearPop && !b.wasNearPop) {
                this.popRings.push({
                    x: bx, y: by,
                    age: 0, maxAge: 16,
                    initialRadius: b.radius * 0.9,
                });
            }
            b.wasNearPop = nearPop;

            // outer bright
            g.beginFill(PALETTE.sludgeBright, 0.9);
            g.drawCircle(bx, by, b.radius);
            g.endFill();
            // inner highlight upper-left (specular)
            g.beginFill(PALETTE.bubbleHi, 0.7);
            g.drawCircle(bx - b.radius * 0.32, by - b.radius * 0.32, b.radius * 0.42);
            g.endFill();
            // white hot-spot (wet look)
            g.beginFill(0xffffff, 0.85);
            g.drawCircle(bx - b.radius * 0.42, by - b.radius * 0.42, b.radius * 0.16);
            g.endFill();
        }

        // --- Pop rings (rozprzestrzeniaja sie + fade) ---
        for (let i = this.popRings.length - 1; i >= 0; i--) {
            const r = this.popRings[i];
            r.age++;
            if (r.age >= r.maxAge) { this.popRings.splice(i, 1); continue; }
            const t = r.age / r.maxAge;
            const radius = r.initialRadius + t * 9;
            const alpha = (1 - t) * 0.8;
            g.lineStyle(1.5, PALETTE.bubbleHi, alpha);
            g.drawCircle(r.x, r.y, radius);
            if (t < 0.5) {
                g.lineStyle(0.8, 0xffffff, alpha * 0.7);
                g.drawCircle(r.x, r.y, radius * 0.65);
            }
        }
        g.lineStyle(0);
    }

    /**
     * Emisyjna poswiata krawedzi — pulsujaca zielona obwodka (toksyczny glow).
     * 2 warstwy (szeroka dim + waska bright) dla soft neon edge.
     */
    private drawRim(): void {
        const g = this.gfxRim;
        g.clear();
        const pulse = 0.45 + 0.25 * Math.sin(this.animTime * 1.8 + this.seed);

        // szeroka poswiata (poza krawedzia)
        g.lineStyle(5, PALETTE.rim, pulse * 0.35);
        this.buildShapePath(g, 1.02, 1.03);
        // waska jasna linia na samej krawedzi
        g.lineStyle(2, PALETTE.rim, pulse);
        this.buildShapePath(g, 1.0, 1.0);

        // v0.59.0 AAA #4 — GLASSY MENISCUS (napiecie powierzchniowe / mokra krawedz).
        // Cienka biala linia tuz przy wewnetrznym skraju (skala 0.98) — fake specular
        // "wspinajacego sie" kwasu na sciankach. Reaguje z pulsem zeby zyla. Klasyczny
        // trik 2D dajacy materialowi mokry wyglad.
        g.lineStyle(1.2, 0xffffff, 0.15 + pulse * 0.2);
        this.buildShapePath(g, 0.98, 0.98);
        g.lineStyle(0);
    }

    /** Cleanup — wolane gdy mapa niszczona (worldContainer.removeChildren). */
    public destroy(): void {
        this.container.destroy({ children: true });
    }
}