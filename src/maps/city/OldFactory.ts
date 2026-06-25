import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { Bullet } from '../../entities/Bullet'; // v0.59.0 — iskry przy trafieniu

/**
 * v0.59.0 — OldFactory (Stara Fabryka) na mapie cyberpunk.
 *
 * Post-industrialny landmark: zniszczona fabryka z charakterystycznym zabkowanym
 * dachem (north-light sawtooth roof — klasyczna sylwetka fabryki) + WYSOKI komin
 * (hero element) buchajacy para zmieszana z toksycznym zielonym dymem (spojnie z
 * SludgePool / SludgeReactor — to samo skazone srodowisko).
 *
 * Kolizja: JEDEN lity hitbox (footprint W x H), niezniszczalny (jak SludgeReactor /
 * CyberBuilding). Dodawany do buildings + solidBuildings w main.ts. Animacja (dym +
 * migajace neony/okna) napedzana przez standardowe buildings.forEach(b => b.update(...))
 * — brak dedykowanej petli (inaczej niz reaktor, ktory potrzebowal bullets dla hit-detekcji).
 *
 * Architektura zgodna z SludgeReactor.ts:
 *   - constructor(x, y, parent) — x,y = TOP-LEFT footprint, dodaje sie do worldContainer
 *   - implements ICollidable (x, y, w, h, update)
 *   - container.zIndex = y + h (pseudo-3D depth sort)
 *   - static art baked raz w konstruktorze; animowane warstwy redraw per-frame w update()
 *
 * 2.5D: cialo fabryki wypelnia footprint; komin RYSOWANY POWYZEJ footprintu (local y
 * ujemne — wystaje w gore jak wysoki komin), dym leci jeszcze wyzej. To wystajacy
 * wizual ponad hitbox (jak halo/para reaktora) — hitbox pozostaje czystym footprintem.
 *
 * Static-baked art NIE odswieza sie przez Vite HMR — wymaga re-entry mapy (znany pattern).
 */

const W = 360;
const H = 260;

const PAL = {
    concreteLight: 0x4a505c,  // sciana w swietle (gora-lewa)
    concreteMid: 0x3a3f4a,    // baza
    concreteDark: 0x2a2e36,   // sciana w cieniu (prawa)
    roof: 0x32363f,           // plyta dachu
    sawDark: 0x1a2630,        // ciemna szyba zabkowanego dachu
    sawTeal: 0x2a4a5a,        // teal tint szyby
    sawLit: 0x44ffcc,         // czasem podswietlona szyba (rzadko)
    winLitWarm: 0xffcc44,     // okno zapalone cieple
    winLitCyan: 0x44ddff,     // okno zapalone cyan
    winDark: 0x12161c,        // okno wybite/ciemne
    rust: 0x6b3a1f,
    rustLight: 0x9c5a2e,
    pipe: 0x4a4a55,
    neonSign: 0xff2299,       // magenta neon szyld (migajacy)
    edgeNeon: 0xff1a2e,       // v0.59.0 — czerwony neon obrysujacy krawedzie (cyberpunk)
    warnYellow: 0xf0c000,     // pasy ostrzegawcze na kominie
    warnDark: 0x1a1a1a,
    // toksyczny dym (spojnie z SludgePool)
    smokeToxic: 0x39ff6a,
    smokeToxicMid: 0x1faa3c,
    smokeSteam: 0xccffdd,
    smokeCool: 0x7d9a88,
};

// komin (hero) — pozycja bazy na dachu + wysokosc (local coords)
const CHIM_X = W * 0.74;
const CHIM_BASE_Y = H * 0.16;    // baza komina na plycie dachu
const CHIM_TOP_Y = -132;         // szczyt komina (powyzej footprintu = wystaje w gore)
const CHIM_W = 46;               // szerokosc komina

interface SmokeParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    maxAge: number;
    size: number;
    toxic: boolean; // true = zielony toksyczny, false = bialawa para
}

/**
 * v0.59.0 — iskra spawalnicza (welding spark) przy trafieniu pociskiem w fabryke.
 * Czysto wizualne (fabryka niezniszczalna). Grawitacja + smuga + stygniecie koloru.
 */
interface SparkParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    maxAge: number;
    size: number;
}

interface FlickerWindow {
    x: number;
    y: number;
    w: number;
    h: number;
    color: number;
    flickerPhase: number;
    flickerSpeed: number;
    broken: boolean; // wybite okna nie migaja (zostaja ciemne)
}

export class OldFactory implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;

    private container: PIXI.Container;
    private gfxStatic: PIXI.Graphics;   // baked: cien, cialo, dach, fasada, komin, rury
    private gfxRoof: PIXI.Graphics;     // v0.59.0 #4 — animowane wentylatory dachowe
    private gfxLight: PIXI.Graphics;    // v0.59.0 #3 — god rays (additive blend)
    private gfxFlicker: PIXI.Graphics;  // animowane: migajace okna + neon szyld
    private gfxSparks: PIXI.Graphics;   // v0.59.0 — iskry spawalnicze przy trafieniu (additive)
    private gfxSmoke: PIXI.Graphics;    // animowane: dym z komina (toksyczny + para)

    private smoke: SmokeParticle[] = [];
    private sparks: SparkParticle[] = [];                 // v0.59.0
    private hitBulletIds: WeakSet<Bullet> = new WeakSet(); // anti multi-hit w jednej klatce
    private windows: FlickerWindow[] = [];
    private smokeCooldown: number = 0;
    private animTime: number = 0;
    private fanAngle: number = 0;       // v0.59.0 #4 — kat obrotu wentylatorow
    private chimneyFlash: number = 0;   // v0.59.0 #2 — rozblysk rdzenia komina przy wyrzucie dymu

    constructor(x: number, y: number, parent: PIXI.Container) {
        this.x = x;
        this.y = y;
        this.w = W;
        this.h = H;

        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + H; // pseudo-3D depth (jak CyberBuilding / SludgeReactor)
        this.container.sortableChildren = true;
        parent.addChild(this.container);

        this.gfxStatic = new PIXI.Graphics();
        this.gfxStatic.zIndex = 0;
        this.gfxRoof = new PIXI.Graphics();   // v0.59.0 #4 — wentylatory nad dachem
        this.gfxRoof.zIndex = 1;
        this.gfxLight = new PIXI.Graphics();  // v0.59.0 #3 — god rays
        this.gfxLight.zIndex = 2;
        this.gfxLight.blendMode = PIXI.BLEND_MODES.ADD; // additive = swiatlo tnace mrok
        this.gfxFlicker = new PIXI.Graphics();
        this.gfxFlicker.zIndex = 3;
        this.gfxSparks = new PIXI.Graphics();   // v0.59.0 — iskry przy trafieniu
        this.gfxSparks.zIndex = 100;            // sypia sie "przed" budynkiem
        this.gfxSparks.blendMode = PIXI.BLEND_MODES.ADD; // jarzace sie iskry
        this.gfxSmoke = new PIXI.Graphics();
        this.gfxSmoke.zIndex = 250; // dym nad budynkiem (jak para reaktora)
        this.container.addChild(this.gfxStatic);
        this.container.addChild(this.gfxRoof);
        this.container.addChild(this.gfxLight);
        this.container.addChild(this.gfxFlicker);
        this.container.addChild(this.gfxSparks);
        this.container.addChild(this.gfxSmoke);

        this.initWindows();
        this.drawStaticLayers();
    }

    /** Pseudo-random deterministyczny (stabilny wyglad fabryki). */
    private rand(n: number): number {
        const s = Math.sin(n * 12.9898 + 7.131) * 43758.5453;
        return s - Math.floor(s);
    }

    // ICollidable + opcjonalne bullets (v0.59.0).
    //
    // GUARD podwojnego update: fabryka jest w buildings (buildings.forEach woła update
    // BEZ bullets) ORAZ ma dedykowana petle w main.ts (woła update Z bullets). Zeby animTime
    // nie rosl 2x/klatke (dym/wentylatory za szybko), animacje + hit-detekcje robimy TYLKO
    // gdy bullets jest przekazane (= wywolanie z dedykowanej petli). Wywolanie z forEach
    // (bullets === undefined) jest no-op. Animacja leci dokladnie RAZ na klatke.
    // WAZNE: fabryka MUSI miec dedykowana petle w main.ts (jak reaktor) — inaczej zamarznie.
    update(_camX: number, _camY: number, _viewW: number, _viewH: number, bullets?: Bullet[]): void {
        if (!bullets) return; // no-op dla buildings.forEach (bez bullets) — animacja w dedykowanej petli

        this.animTime += 0.016;
        // v0.59.0 #4 — obrot wentylatorow przez animTime (klatko-NIEzalezny: staly increment
        // animTime per ticker, wiec na 60 i 144Hz ta sama predkosc kątowa wizualnie).
        this.fanAngle = this.animTime * 2.2;
        // v0.59.0 #2 — wygaszanie rozblysku rdzenia komina (zapalany przy wyrzucie dymu)
        if (this.chimneyFlash > 0) this.chimneyFlash -= 0.05;

        // v0.59.0 — detekcja trafien (iskry)
        this.checkBulletHits(bullets);

        this.updateSmoke();
        this.drawFlicker(); // czysci gfxLight + rysuje okna/neon + rdzen komina
        this.drawEdgeNeon();  // v0.59.0 — czerwone neony na krawedziach (cyberpunk)
        this.drawRoofFans();
        this.updateSparks(); // v0.59.0 — fizyka iskier
    }

    // ============================================================
    // STATIC (baked once)
    // ============================================================
    private drawStaticLayers(): void {
        this.drawShadow();
        this.drawBody();
        this.drawSawtoothRoof();
        this.drawFacade();
        this.drawPipes();
        this.drawChimney();
        this.drawSignFrame();
    }

    private drawShadow(): void {
        const g = this.gfxStatic;
        g.beginFill(0x000000, 0.38);
        g.drawEllipse(W * 0.55, H + 8, W * 0.58, 26);
        g.endFill();
        g.beginFill(0x000000, 0.22);
        g.drawEllipse(W * 0.6, H + 12, W * 0.7, 34);
        g.endFill();
    }

    private drawBody(): void {
        const g = this.gfxStatic;
        const roofBottom = H * 0.42; // granica dach / fasada

        // --- Fasada (dolna czesc, twarz do widza) — 3 pionowe pasy gradientu (light L->R dark) ---
        g.beginFill(PAL.concreteLight, 1);
        g.drawRect(0, roofBottom, W * 0.36, H - roofBottom);
        g.endFill();
        g.beginFill(PAL.concreteMid, 1);
        g.drawRect(W * 0.36, roofBottom, W * 0.34, H - roofBottom);
        g.endFill();
        g.beginFill(PAL.concreteDark, 1);
        g.drawRect(W * 0.70, roofBottom, W * 0.30, H - roofBottom);
        g.endFill();

        // --- Plyta dachu (gorna czesc) ---
        g.beginFill(PAL.roof, 1);
        g.drawRect(0, 0, W, roofBottom);
        g.endFill();

        // v0.59.0 #1 — WZMOCNIONA GLEBIA (zgodnie z wzorcem SludgeReactor: cap/parapet +
        // AO przy ziemi + boczne sciany; BEZ DEPTH lamiacego hitbox).
        // 1) gruby parapet 3D na styku dach/fasada — jasna gorna tasma + ciemny podcien
        g.beginFill(0x5a6470, 1);
        g.drawRect(0, roofBottom - 3, W, 3);          // jasna krawedz (light from up)
        g.endFill();
        g.beginFill(0x6a7480, 1);
        g.drawRect(0, roofBottom - 3, W, 1);          // hot highlight
        g.endFill();
        g.beginFill(0x10141a, 0.85);
        g.drawRect(0, roofBottom, W, 4);              // ciemny podcien (rzucany przez parapet na fasade)
        g.endFill();
        // 2) lewa sciana boczna — pionowa jasna tasma (swiatlo z lewej-gory liznie sciane)
        g.beginFill(0xffffff, 0.07);
        g.drawRect(0, roofBottom, 5, H - roofBottom);
        g.endFill();
        // 3) prawa sciana boczna — ciemna tasma (sciana odwrocona od swiatla = glebia)
        g.beginFill(0x000000, 0.30);
        g.drawRect(W - 6, roofBottom, 6, H - roofBottom);
        g.endFill();
        // 4) Ambient Occlusion przy ziemi (dol fasady ciemnieje = osadzenie w gruncie)
        for (let k = 0; k < 6; k++) {
            const t = k / 5;
            g.beginFill(0x080a0e, 0.10 + t * 0.10);
            g.drawRect(0, H - 4 - k * 4, W, 4);
            g.endFill();
        }

        // obrys calej bryly
        g.lineStyle(2.5, 0x10141a, 0.9);
        g.drawRect(0, 0, W, H);
        g.lineStyle(0);

        // betonowe spekania / zacieki (subtelne ciemne smugi na fasadzie)
        for (let i = 0; i < 10; i++) {
            const sx = this.rand(i * 3.1) * W;
            const sy = roofBottom + this.rand(i * 5.7) * (H - roofBottom);
            g.beginFill(PAL.concreteDark, 0.3);
            g.drawRect(sx, sy, 1.5 + this.rand(i) * 2, 8 + this.rand(i * 2) * 18);
            g.endFill();
        }
    }

    private drawSawtoothRoof(): void {
        const g = this.gfxStatic;
        // v0.59.0 #2 — zabkowany dach WIDZIANY Z GORY (top-down), nie z boku.
        // Kazdy "zab" = poziomy pas: szeroki ciemny spadek blachy + waski jasny pas
        // szkla (teal) zwroconego ku niebu. To czyta sie jak fabryczny north-light roof
        // ogladany pod katem 3/4 z gory.
        const roofTop = 4;
        const roofH = H * 0.42 - 8; // strefa dachu (gorna czesc footprintu)
        const rows = 4;
        const rowH = roofH / rows;

        for (let i = 0; i < rows; i++) {
            const ry = roofTop + i * rowH;

            // spadek blachy (ciemny metal, gorne ~70% pasa)
            g.beginFill(0x2a2e36, 1);
            g.drawRect(0, ry, W, rowH * 0.7);
            g.endFill();
            // cien u dolu spadku (AO przed szyba)
            g.beginFill(0x161a20, 1);
            g.drawRect(0, ry + rowH * 0.52, W, rowH * 0.18);
            g.endFill();
            // krawedz blachy (highlight gora pasa — light from up)
            g.beginFill(0x3e4450, 0.9);
            g.drawRect(0, ry, W, 2);
            g.endFill();

            // pas szkla (teal, dolne ~30% pasa, zwrocony ku gorze = jasniejszy)
            const litRoll = this.rand(i * 9.3);
            const glassLit = litRoll > 0.72;
            g.beginFill(glassLit ? PAL.sawLit : PAL.sawTeal, glassLit ? 0.55 : 0.9);
            g.drawRect(0, ry + rowH * 0.7, W, rowH * 0.3);
            g.endFill();
            // refleks na szybie (jasniejsza linia u gory pasa szkla)
            g.beginFill(0xbfeaff, glassLit ? 0.4 : 0.22);
            g.drawRect(0, ry + rowH * 0.7, W, 2);
            g.endFill();
            // szprosy (pionowe ramy szyb co 40px)
            g.lineStyle(1.5, 0x10141a, 0.85);
            for (let sx = 0; sx <= W; sx += 40) {
                g.moveTo(sx, ry + rowH * 0.7);
                g.lineTo(sx, ry + rowH);
            }
            g.lineStyle(0);
        }
        // dolna listwa dachu (przejscie do parapetu)
        g.lineStyle(1.5, 0x10141a, 0.7);
        g.moveTo(0, roofTop + roofH);
        g.lineTo(W, roofTop + roofH);
        g.lineStyle(0);
    }

    private drawFacade(): void {
        const g = this.gfxStatic;
        const roofBottom = H * 0.42;

        // --- Wielka brama zaladunkowa (centralnie-dol) ---
        const doorW = W * 0.26;
        const doorH = (H - roofBottom) * 0.62;
        const doorX = W * 0.5 - doorW / 2;
        const doorY = H - doorH - 6;
        g.beginFill(0x15191f, 1);
        g.drawRect(doorX, doorY, doorW, doorH);
        g.endFill();
        // poziome zebra bramy garazowej
        g.lineStyle(1.5, 0x2a2f38, 0.9);
        for (let r = 1; r < 7; r++) {
            const ry = doorY + (doorH * r) / 7;
            g.moveTo(doorX, ry);
            g.lineTo(doorX + doorW, ry);
        }
        g.lineStyle(0);
        // rama bramy + pasy ostrzegawcze u dolu
        g.lineStyle(2.5, PAL.rust, 0.9);
        g.drawRect(doorX, doorY, doorW, doorH);
        g.lineStyle(0);
        for (let s = 0; s < 6; s++) {
            g.beginFill(s % 2 === 0 ? PAL.warnYellow : PAL.warnDark, 0.85);
            g.drawRect(doorX + (doorW / 6) * s, H - 8, doorW / 6, 5);
            g.endFill();
        }

        // --- Rust streaks (zacieki rdzy pod parapetem) ---
        for (let i = 0; i < 6; i++) {
            const rx = this.rand(i * 7.7) * W;
            g.beginFill(PAL.rust, 0.28);
            g.drawRect(rx, roofBottom + 2, 3 + this.rand(i) * 2, 14 + this.rand(i * 2) * 22);
            g.endFill();
        }

        // --- Graffiti (kilka kolorowych plam na fasadzie) ---
        const graf = [PAL.neonSign, PAL.winLitCyan, PAL.smokeToxic];
        for (let i = 0; i < 3; i++) {
            const gx = W * 0.12 + this.rand(i * 11.3) * W * 0.7;
            const gy = roofBottom + 20 + this.rand(i * 4.1) * (H - roofBottom - 50);
            g.beginFill(graf[i % graf.length], 0.16);
            g.drawCircle(gx, gy, 9 + this.rand(i) * 7);
            g.drawCircle(gx + 6, gy + 3, 5 + this.rand(i * 2) * 4);
            g.endFill();
        }

        // Uwaga: okna (migajace) inicjalizowane w initWindows() i rysowane w drawFlicker().
        // Tutaj rysujemy tylko statyczne RAMKI okien (ciemne wneki), zeby zawsze byly widoczne.
        for (const win of this.windows) {
            g.beginFill(0x0a0d12, 1);
            g.drawRect(win.x - 1.5, win.y - 1.5, win.w + 3, win.h + 3);
            g.endFill();
        }
    }

    private initWindows(): void {
        // v0.59.0 — PRZEMYSLOWE TASMY OKIENNE (industrial strip glazing): zamiast osobnych
        // okien-kwadratow z krzyzakiem (look domowy), dlugie poziome pasy szyb dzielone
        // tylko cienkimi pionowymi slupkami (mullionami). To autentyczny fabryczny look.
        // Pomijamy strefe pod neonem-szyldem (gorny rzad srodek) — neon tam swieci.
        const roofBottom = H * 0.42;
        const stripH = 26;
        const marginX = 18;
        const stripW = W - marginX * 2;
        const rows = 2;
        const gapY = 18;
        const startY = roofBottom + 16;

        // szyld neonu zajmuje gorny-srodkowy obszar — wytnij tam tasme (rzad 0)
        const signSX = W * 0.5 - (W * 0.30) / 2;
        const signEX = W * 0.5 + (W * 0.30) / 2;

        for (let r = 0; r < rows; r++) {
            const wy = startY + r * (stripH + gapY);
            // dolny rzad: brama posrodku -> tasma rozbita na lewa + prawa
            // gorny rzad: neon posrodku -> tasma rozbita na lewa + prawa
            const doorW = W * 0.26;
            const doorSX = W * 0.5 - doorW / 2;
            const doorEX = W * 0.5 + doorW / 2;

            const cutSX = r === 0 ? signSX : doorSX;
            const cutEX = r === 0 ? signEX : doorEX;

            // lewa tasma: od marginX do cutSX
            this.windows.push(this.makeStrip(marginX, wy, cutSX - 12 - marginX, stripH, r * 10 + 1));
            // prawa tasma: od cutEX do prawego marginesu
            const rightStart = cutEX + 12;
            this.windows.push(this.makeStrip(rightStart, wy, (W - marginX) - rightStart, stripH, r * 10 + 2));
        }
    }

    /** v0.59.0 — buduje jedna przemyslowa tasme okienna (FlickerWindow). */
    private makeStrip(x: number, y: number, w: number, h: number, seedN: number): FlickerWindow {
        const roll = this.rand(seedN * 13.1);
        const broken = roll > 0.72; // mniej wybitych (tasmy sa duze)
        const color = roll > 0.85 ? PAL.winLitCyan : PAL.winLitWarm;
        return {
            x, y, w: Math.max(20, w), h,
            color,
            flickerPhase: this.rand(seedN * 3.3) * Math.PI * 2,
            flickerSpeed: 1.5 + this.rand(seedN * 2.1) * 3,
            broken,
        };
    }

    private drawPipes(): void {
        const g = this.gfxStatic;
        const roofBottom = H * 0.42;
        // 2 pionowe rury wzdluz fasady (lewa i prawa krawedz)
        const pipeXs = [W * 0.06, W * 0.94];
        for (const px of pipeXs) {
            g.beginFill(PAL.pipe, 1);
            g.drawRect(px - 4, roofBottom + 4, 8, H - roofBottom - 10);
            g.endFill();
            // highlight + cien (cylindrycznosc)
            g.beginFill(0x6a6a78, 0.8);
            g.drawRect(px - 4, roofBottom + 4, 2.5, H - roofBottom - 10);
            g.endFill();
            g.beginFill(0x16181d, 0.8);
            g.drawRect(px + 1.5, roofBottom + 4, 2.5, H - roofBottom - 10);
            g.endFill();
            // obejmy
            for (let k = 0; k < 4; k++) {
                const ky = roofBottom + 20 + k * (H - roofBottom) * 0.22;
                g.beginFill(0x2a2a30, 1);
                g.drawRect(px - 6, ky, 12, 3);
                g.endFill();
            }
        }
    }

    private drawChimney(): void {
        const g = this.gfxStatic;
        const cx = CHIM_X;
        const halfW = CHIM_W / 2;
        const topY = CHIM_TOP_Y;
        const baseY = CHIM_BASE_Y;

        // cien komina rzucany na dach (skos)
        g.beginFill(0x000000, 0.25);
        g.drawPolygon([
            cx - halfW, baseY,
            cx + halfW + 30, baseY + 10,
            cx + halfW + 30, baseY + 22,
            cx - halfW, baseY + 14,
        ]);
        g.endFill();

        // trzon komina — 3 pasy gradientu (cylindrycznosc: lewa jasna, srodek, prawa ciemna)
        g.beginFill(0x4a4048, 1); // lewa jasniejsza
        g.drawRect(cx - halfW, topY, CHIM_W * 0.34, baseY - topY);
        g.endFill();
        g.beginFill(0x342c33, 1); // srodek
        g.drawRect(cx - halfW + CHIM_W * 0.34, topY, CHIM_W * 0.34, baseY - topY);
        g.endFill();
        g.beginFill(0x231d22, 1); // prawa ciemniejsza
        g.drawRect(cx - halfW + CHIM_W * 0.68, topY, CHIM_W * 0.32, baseY - topY);
        g.endFill();

        // pasy rdzy (poziome obreczy)
        for (let k = 0; k < 4; k++) {
            const ky = topY + 18 + k * (baseY - topY) * 0.24;
            g.beginFill(PAL.rust, 0.5);
            g.drawRect(cx - halfW, ky, CHIM_W, 4);
            g.endFill();
            g.beginFill(PAL.rustLight, 0.3);
            g.drawRect(cx - halfW, ky, CHIM_W, 1.5);
            g.endFill();
        }

        // pasy ostrzegawcze pod korona (zolto-czarne)
        for (let s = 0; s < 5; s++) {
            g.beginFill(s % 2 === 0 ? PAL.warnYellow : PAL.warnDark, 0.9);
            g.drawRect(cx - halfW + (CHIM_W / 5) * s, topY + 10, CHIM_W / 5, 8);
            g.endFill();
        }

        // korona komina (rozszerzony wylot + elipsa otworu — 2.5D top)
        g.beginFill(0x2a242a, 1);
        g.drawRect(cx - halfW - 4, topY - 6, CHIM_W + 8, 10);
        g.endFill();
        // otwor (ciemna elipsa = patrzymy lekko w dol do srodka komina)
        g.beginFill(0x0a0a0c, 1);
        g.drawEllipse(cx, topY - 1, halfW + 2, 5);
        g.endFill();
        // v0.59.0 #2: toksyczny rdzen (zielona poswiata) PRZENIESIONY do animowanej warstwy
        // (drawChimneyCore w gfxLight) — pulsuje + rozblyskuje przy wyrzucie dymu.
        // highlight korony (lewa krawedz)
        g.beginFill(0x6a5a66, 0.8);
        g.drawRect(cx - halfW - 4, topY - 6, 3, 10);
        g.endFill();

        // pionowy highlight trzonu (lewa krawedz — light upper-left)
        g.beginFill(0xffffff, 0.10);
        g.drawRect(cx - halfW + 1, topY + 2, 2.5, baseY - topY - 4);
        g.endFill();
    }

    private drawSignFrame(): void {
        const g = this.gfxStatic;
        const roofBottom = H * 0.42;
        // ciemna rama szyldu (zawartosc neonu rysowana w drawFlicker)
        const sw = W * 0.30, sh = 30;
        const sx = W * 0.5 - sw / 2;
        const sy = roofBottom + 6;
        g.beginFill(0x0c0e12, 0.85);
        g.drawRect(sx, sy, sw, sh);
        g.endFill();
        g.lineStyle(1.5, 0x2a2e36, 0.9);
        g.drawRect(sx, sy, sw, sh);
        g.lineStyle(0);
    }

    // ============================================================
    // ANIMATED (per-frame)
    // ============================================================
    private drawFlicker(): void {
        const g = this.gfxFlicker;
        g.clear();
        this.gfxLight.clear(); // v0.59.0 #3 — god rays warstwa (additive), rysowana per okno nizej
        const now = this.animTime;

        // --- Migajace tasmy okienne (industrial strip glazing) ---
        const MULLION = 28; // co ile px pionowy slupek dzielacy tasme
        for (const win of this.windows) {
            if (win.broken) {
                // wybita tasma — ciemna z pionowymi slupkami (bez krzyzaka)
                g.beginFill(PAL.winDark, 1);
                g.drawRect(win.x, win.y, win.w, win.h);
                g.endFill();
                g.lineStyle(2, 0x05070a, 0.85);
                for (let mx = win.x + MULLION; mx < win.x + win.w; mx += MULLION) {
                    g.moveTo(mx, win.y);
                    g.lineTo(mx, win.y + win.h);
                }
                g.lineStyle(0);
                continue;
            }
            // zapalona tasma — migotanie jako calosc (sin + sporadyczny dropout)
            const flick = 0.55 + 0.35 * Math.sin(now * win.flickerSpeed + win.flickerPhase);
            const dropout = Math.sin(now * 0.7 + win.flickerPhase) > 0.93 ? 0.2 : 1;
            const a = flick * dropout;

            // poswiata tasmy
            g.beginFill(win.color, a * 0.30);
            g.drawRect(win.x - 3, win.y - 3, win.w + 6, win.h + 6);
            g.endFill();
            // szyba (pelna tasma)
            g.beginFill(win.color, a);
            g.drawRect(win.x, win.y, win.w, win.h);
            g.endFill();
            // dolny pas cieplejszy (gradient — szyba odbija swiatlo wnetrza)
            g.beginFill(0xffffff, a * 0.25);
            g.drawRect(win.x, win.y, win.w, 3);
            g.endFill();
            // pionowe slupki (mulliony) — TYLKO pionowe, bez krzyzaka (industrial look)
            g.lineStyle(2, 0x0a0d12, 0.65);
            for (let mx = win.x + MULLION; mx < win.x + win.w; mx += MULLION) {
                g.moveTo(mx, win.y);
                g.lineTo(mx, win.y + win.h);
            }
            g.lineStyle(0);
            // rama tasmy (obrys)
            g.lineStyle(1.5, 0x10141a, 0.7);
            g.drawRect(win.x, win.y, win.w, win.h);
            g.lineStyle(0);
        }

        // --- Neon szyld: napis "FKB-7" (migajacy) ---
        const roofBottom = H * 0.42;
        const sw = W * 0.30, sh = 30;
        const sx = W * 0.5 - sw / 2;
        const sy = roofBottom + 6;
        const neonFlick = 0.5 + 0.4 * Math.sin(now * 6.0);
        const neonDrop = Math.sin(now * 1.3) > 0.88 ? 0.2 : 1; // glitch zanik
        const na = neonFlick * neonDrop;
        // poswiata szyldu
        g.beginFill(PAL.neonSign, na * 0.3);
        g.drawRect(sx - 4, sy - 4, sw + 8, sh + 8);
        g.endFill();
        // napis FKB-7 z rurek neonowych (programmatic, bez fontu), WYSRODKOWANY w szyldzie
        this.drawNeonText(g, sx + sw / 2, sy + 7, sh - 14, na);

        // v0.59.0 #2 — ANIMOWANY RDZEN KOMINA (na gfxLight, additive). Pulsuje stale +
        // ROZBLYSKUJE w momencie wyrzutu dymu (chimneyFlash zapalany w updateSmoke).
        const lg = this.gfxLight;
        const corePulse = 0.30 + 0.12 * Math.sin(now * 4) + this.chimneyFlash;
        const coreHalfW = CHIM_W / 2;
        lg.beginFill(PAL.smokeToxic, Math.min(0.9, corePulse));
        lg.drawEllipse(CHIM_X, CHIM_TOP_Y - 1, coreHalfW - 2, 3.5);
        lg.endFill();
        // poswiata buchajaca z wylotu gdy rozblysk silny
        if (this.chimneyFlash > 0.15) {
            lg.beginFill(PAL.smokeToxic, this.chimneyFlash * 0.4);
            lg.drawEllipse(CHIM_X, CHIM_TOP_Y - 4, coreHalfW + 6, 8);
            lg.endFill();
        }
    }

    /**
     * v0.59.0 #4 — wentylatory dachowe (ruch = zycie dla 9-12 lat). 3 duze obracajace
     * sie wiatraki przemyslowe na zabkowanym dachu. Lopatki jako sciesnione elipsy
     * (skala Y < X = widok z gory 2.5D). Obrot przez fanAngle (z animTime = klatko-niezalezny).
     * Os = czerwona pulsujaca kropka statusu.
     */
    private drawRoofFans(): void {
        const g = this.gfxRoof;
        g.clear();
        const fanR = 22;
        const roofZone = H * 0.42;
        // 3 wentylatory rozlozone w poziomie, w gornej strefie dachu
        const fans = [
            { x: W * 0.22, y: roofZone * 0.42 },
            { x: W * 0.50, y: roofZone * 0.30 },
            { x: W * 0.78, y: roofZone * 0.42 },
        ];
        for (const f of fans) {
            // szyb (ciemna dziura w dachu) + obudowa
            g.beginFill(0x10141a, 1);
            g.drawCircle(f.x, f.y, fanR + 3);
            g.endFill();
            g.beginFill(0x0a0d12, 1);
            g.drawCircle(f.x, f.y, fanR);
            g.endFill();
            // obudowa-pierscien (metal)
            g.lineStyle(2, 0x3a3f4a, 0.9);
            g.drawCircle(f.x, f.y, fanR + 1.5);
            g.lineStyle(0);

            // lopatki (4 elipsy sciesnione na Y)
            for (let i = 0; i < 4; i++) {
                const a = this.fanAngle + (i * Math.PI / 2);
                const bx = f.x + Math.cos(a) * fanR * 0.45;
                const by = f.y + Math.sin(a) * fanR * 0.45;
                const cosA = Math.cos(a), sinA = Math.sin(a);
                const lw = fanR * 0.42, lh = fanR * 0.15;
                // v0.59.0 #1 — drop shadow lopatki (czarny offset +2,+4) = lewitacja nad szybem
                const shPts: number[] = [];
                for (let k = 0; k < 8; k++) {
                    const e = (k / 8) * Math.PI * 2;
                    const ex = Math.cos(e) * lw, ey = Math.sin(e) * lh;
                    shPts.push(bx + 2 + ex * cosA - ey * sinA, by + 4 + ex * sinA + ey * cosA);
                }
                g.beginFill(0x000000, 0.4);
                g.drawPolygon(shPts);
                g.endFill();
                // lopatka wlasciwa
                const pts: number[] = [];
                for (let k = 0; k < 8; k++) {
                    const e = (k / 8) * Math.PI * 2;
                    const ex = Math.cos(e) * lw, ey = Math.sin(e) * lh;
                    pts.push(bx + ex * cosA - ey * sinA, by + ex * sinA + ey * cosA);
                }
                g.beginFill(0x4a505c, 0.92);
                g.drawPolygon(pts);
                g.endFill();
            }
            // motion blur (lekki obrot-smuga) — presults przez polprzezroczysty pierscien
            g.lineStyle(fanR * 0.28, 0x4a505c, 0.10);
            g.drawCircle(f.x, f.y, fanR * 0.5);
            g.lineStyle(0);

            // os obrotu — czerwona pulsujaca kropka statusu
            const pulse = 0.7 + 0.3 * Math.sin(this.animTime * 5 + f.x);
            g.beginFill(0xff2222, pulse);
            g.drawCircle(f.x, f.y, 3.5);
            g.endFill();
            g.beginFill(0xffffff, pulse * 0.7);
            g.drawCircle(f.x - 0.8, f.y - 0.8, 1.2);
            g.endFill();
        }
    }

    /**
     * v0.59.0 — napis "FKB-7" jako rurki neonowe (programmatic, bez fontu). Kazda litera
     * rysowana segmentami lineTo w prostokacie cellW x ch. Magenta glow + bialy rdzen gdy jasno.
     * x,y = lewy-gorny rog pierwszej litery; ch = wysokosc liter; a = alpha (miganie).
     */
    /**
     * v0.59.0 — czerwone neony obrysujace krawedzie fabryki (cyberpunk accent).
     * Rysowane na gfxLight (additive = jarzace sie rurki). Pulsuja (lekki sin). Obejmuja:
     * gzyms dachu (pozioma linia na styku dach/fasada), pionowe slupki w narozach fasady,
     * dolna listwe przy ziemi. Subtelne — to akcent, nie glowne zrodlo swiatla.
     */
    private drawEdgeNeon(): void {
        const lg = this.gfxLight;
        const roofBottom = H * 0.42;
        const pulse = 0.5 + 0.25 * Math.sin(this.animTime * 2.2);

        const stroke = (lw: number, alpha: number) => {
            lg.lineStyle(lw, PAL.edgeNeon, alpha);
            // gzyms (pozioma rurka tuz pod parapetem)
            lg.moveTo(6, roofBottom + 6);
            lg.lineTo(W - 6, roofBottom + 6);
            // pionowe rurki w narozach fasady
            lg.moveTo(6, roofBottom + 6);
            lg.lineTo(6, H - 6);
            lg.moveTo(W - 6, roofBottom + 6);
            lg.lineTo(W - 6, H - 6);
            // dolna listwa przy ziemi
            lg.moveTo(6, H - 6);
            lg.lineTo(W - 6, H - 6);
            lg.lineStyle(0);
        };
        // glow (gruby dim) + rurka (cienka jasniejsza) + rozblysk rogow
        stroke(5, pulse * 0.18);
        stroke(1.8, pulse * 0.6);
        // jasne "spawy" w narozach (rozblyski)
        const cornerPulse = 0.6 + 0.4 * Math.sin(this.animTime * 3.3);
        const corners: Array<[number, number]> = [
            [6, roofBottom + 6], [W - 6, roofBottom + 6], [6, H - 6], [W - 6, H - 6],
        ];
        for (const [cxp, cyp] of corners) {
            lg.beginFill(PAL.edgeNeon, cornerPulse * 0.7);
            lg.drawCircle(cxp, cyp, 2.5);
            lg.endFill();
            lg.beginFill(0xffffff, cornerPulse * 0.5);
            lg.drawCircle(cxp, cyp, 1.1);
            lg.endFill();
        }
    }

    // cx = SRODEK szyldu (X). Napis wycentrowany: start = cx - totalW/2.
    private drawNeonText(g: PIXI.Graphics, cx: number, y: number, ch: number, a: number): void {
        const cw = ch * 0.62;      // szerokosc litery
        const gap = ch * 0.28;     // odstep miedzy znakami
        const dashW = cw * 0.7;    // szerokosc myslnika
        // F,K,B = cw ; - = dashW ; 7 = cw ; + 4 gapy miedzy 5 znakami
        const totalW = cw * 4 + dashW + gap * 4;
        const x = cx - totalW / 2; // wycentrowanie wzgledem srodka szyldu
        const mid = y + ch / 2;
        const drawGlyphs = (lineW: number, color: number, alpha: number) => {
            g.lineStyle(lineW, color, alpha);
            let gx = x;
            // F
            g.moveTo(gx, y + ch); g.lineTo(gx, y); g.lineTo(gx + cw, y);     // pion + gora
            g.moveTo(gx, mid); g.lineTo(gx + cw * 0.8, mid);                 // srodek
            gx += cw + gap;
            // K
            g.moveTo(gx, y); g.lineTo(gx, y + ch);                           // pion
            g.moveTo(gx, mid); g.lineTo(gx + cw, y);                         // ukos gora
            g.moveTo(gx, mid); g.lineTo(gx + cw, y + ch);                    // ukos dol
            gx += cw + gap;
            // B
            g.moveTo(gx, y + ch); g.lineTo(gx, y);                           // pion
            g.lineTo(gx + cw * 0.82, y); g.lineTo(gx + cw, y + ch * 0.25);   // gorny lobik
            g.lineTo(gx + cw * 0.82, mid); g.lineTo(gx, mid);                // do srodka
            g.moveTo(gx + cw * 0.82, mid); g.lineTo(gx + cw, y + ch * 0.72); // dolny lobik
            g.lineTo(gx + cw * 0.82, y + ch); g.lineTo(gx, y + ch);
            gx += cw + gap;
            // - (myslnik)
            g.moveTo(gx, mid); g.lineTo(gx + dashW, mid);
            gx += dashW + gap;
            // 7
            g.moveTo(gx, y); g.lineTo(gx + cw, y); g.lineTo(gx + cw * 0.4, y + ch);
            g.lineStyle(0);
        };
        // glow (gruby, niska alpha) + rurka (sredni) + rdzen bialy (cienki, gdy jasno)
        drawGlyphs(5, PAL.neonSign, a * 0.25);
        drawGlyphs(2.5, PAL.neonSign, a);
        if (a > 0.6) drawGlyphs(1, 0xffffff, (a - 0.6) * 2);
    }

    private spawnSmoke(): void {
        // emisja z wylotu komina (lekki rozrzut)
        const toxic = this.rand(this.animTime * 13.7) > 0.45; // ~55% klebow toksycznych
        const ang = -Math.PI / 2 + (this.rand(this.animTime * 7.1) - 0.5) * 0.6; // glownie w gore
        const spd = 0.5 + this.rand(this.animTime * 3.3) * 0.7;
        this.smoke.push({
            x: CHIM_X + (this.rand(this.animTime * 5.9) - 0.5) * CHIM_W * 0.5,
            y: CHIM_TOP_Y - 2,
            vx: Math.cos(ang) * spd * 0.5,
            vy: Math.sin(ang) * spd,
            age: 0,
            maxAge: 70 + this.rand(this.animTime) * 40, // dlugie kleby
            size: 7 + this.rand(this.animTime * 2.2) * 7,
            toxic,
        });
    }

    private updateSmoke(): void {
        const g = this.gfxSmoke;
        g.clear();

        // spawn (co kilka klatek, throttle przez cooldown — niezalezne od FPS przez staly increment)
        this.smokeCooldown--;
        if (this.smokeCooldown <= 0) {
            this.spawnSmoke();
            this.smokeCooldown = 4 + Math.floor(this.rand(this.animTime * 1.7) * 4);
            this.chimneyFlash = 0.45; // v0.59.0 #2 — rozblysk rdzenia zsynchronizowany z wyrzutem
        }

        for (let i = this.smoke.length - 1; i >= 0; i--) {
            const p = this.smoke[i];
            p.age++;
            if (p.age >= p.maxAge) { this.smoke.splice(i, 1); continue; }
            // ruch + wznoszenie + drift, zwalnianie
            p.x += p.vx;
            p.y += p.vy;
            p.vy *= 0.985;
            p.vx += (this.rand((p.age + i) * 1.3) - 0.5) * 0.06; // turbulencja
            p.vx *= 0.98;

            const lifeT = p.age / p.maxAge;
            const size = p.size * (1 + lifeT * 1.6); // rozrasta sie unoszac
            const alpha = (1 - lifeT) * 0.5;

            // kolor: hot phase przy wylocie (jaskrawy), stygnie unoszac sie
            let color: number;
            if (p.toxic) {
                if (lifeT < 0.3) color = PAL.smokeToxic;        // jaskrawy toksyczny
                else if (lifeT < 0.65) color = PAL.smokeToxicMid;
                else color = PAL.smokeCool;                     // stygnie do szaro-zielonego
            } else {
                color = lifeT < 0.5 ? PAL.smokeSteam : PAL.smokeCool; // bialawa para -> chlodna
            }

            // kleb — miekkie kolo (2 warstwy dla objetosci)
            g.beginFill(color, alpha * 0.6);
            g.drawCircle(p.x, p.y, size);
            g.endFill();
            g.beginFill(color, alpha * 0.35);
            g.drawCircle(p.x - size * 0.2, p.y - size * 0.2, size * 0.7);
            g.endFill();
            // toksyczny rdzen (gdy mlody i toksyczny) — jaskrawy punkt
            if (p.toxic && lifeT < 0.4) {
                g.beginFill(PAL.smokeToxic, alpha * 0.5);
                g.drawCircle(p.x, p.y, size * 0.4);
                g.endFill();
            }
        }
    }

    /**
     * v0.59.0 — detekcja trafien pociskiem w footprint fabryki (AABB), spawn iskier.
     * WeakSet zapobiega multi-trigger gdy pocisk ginie w tej samej klatce. Wzorzec
     * 1:1 z SludgeReactor.checkBulletHits. Fabryka niezniszczalna — czysto wizualne.
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
            this.spawnSparks(b.x - this.x, b.y - this.y); // local coords
        }
    }

    private spawnSparks(localHitX: number, localHitY: number): void {
        const count = 12 + Math.floor(this.rand(this.animTime * 9.1) * 6);
        for (let i = 0; i < count; i++) {
            // wybuch we wszystkich kierunkach z przewaga do gory
            const angle = -Math.PI / 2 + (this.rand(this.animTime * 3.3 + i) - 0.5) * Math.PI * 1.5;
            const speed = 2 + this.rand(this.animTime * 1.7 + i) * 4;
            this.sparks.push({
                x: localHitX,
                y: localHitY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                age: 0,
                maxAge: 20 + this.rand(this.animTime * 2.1 + i) * 25,
                size: 1.5 + this.rand(this.animTime * 0.9 + i) * 2,
            });
        }
    }

    /**
     * v0.59.0 — fizyka + render iskier: grawitacja (opadanie) + tarcie boczne + smuga
     * + stygniecie koloru (bialy -> zolty -> czerwony). Rysowane na gfxSparks (additive).
     */
    private updateSparks(): void {
        const g = this.gfxSparks;
        g.clear();
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.age++;
            if (s.age >= s.maxAge) { this.sparks.splice(i, 1); continue; }
            s.vy += 0.25;   // grawitacja
            s.vx *= 0.92;   // tarcie
            s.x += s.vx;
            s.y += s.vy;
            const lifeT = s.age / s.maxAge;
            const alpha = Math.min(1, (1 - lifeT) * 1.2);
            const color = lifeT < 0.3 ? 0xffffff : (lifeT < 0.6 ? 0xffcc00 : 0xff4400);
            // smuga (kinetyka) — przeciwnie do wektora ruchu
            g.lineStyle(s.size * 0.8, color, alpha * 0.6);
            g.moveTo(s.x, s.y);
            g.lineTo(s.x - s.vx * 1.5, s.y - s.vy * 1.5);
            g.lineStyle(0);
            // glowka iskry
            g.beginFill(color, alpha);
            g.drawCircle(s.x, s.y, s.size * (1 - lifeT * 0.5));
            g.endFill();
        }
    }

    /** Cleanup — wolane gdy mapa niszczona. */
    destroy(): void {
        this.container.destroy({ children: true });
    }
}