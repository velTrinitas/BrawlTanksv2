import * as PIXI from 'pixi.js';

/**
 * v0.60.0 — NEON-OASIS: Automatyczna Stacja Chlodzenia Plazmy (cyberpunk stealth zone).
 *
 * KONCEPT: zautomatyzowana kriogeniczna myjnia dla mechow. Gdy czolg wjezdza, stacja
 * wykrywa "przegrzany silnik" i odpala awaryjne chlodzenie — z kratek bucha gesta
 * blekitno-fioletowa mgla kriogeniczna, z gory opadaja holograficzne kurtyny
 * diagnostyczne. Czolg staje sie niewyrazna sylwetka w neonowym dymie = STEALTH.
 *
 * API STEALTH (1:1 z CornField — tropiki): konstruktor(x,y,w,h,seed,worldContainer),
 *   isPointInside(px,py) rectangle test, update(), onTankEnter(tankX,tankY).
 *   main.ts: nowa tablica neonStations[] + flaga playerInNeonStation -> playerInAnyStealth.
 *   Stealth flaga konsumowana przez Enemy.playerStealthed (jak oasis/corn).
 *
 * RENDER (warstwy PIXI.Graphics jak SludgePool/OldFactory — NIE sprite-stamping, bo brak
 *   powtarzalnego elementu jak kukurydza). Warstwy:
 *     gfxGround (zIndex -78): asfalt, plama oleju (teczowy benzynowy gradient), holo linie parkingu
 *     gfxProps  (zIndex = y-sort): dystrybutory plazmy (lewitujace rdzenie, jeden iskrzy + wyciek)
 *     gfxRoof   (zIndex high): heksagonalny szklany dach + LED krawedzie + parallax
 *     gfxFog    (zIndex very high): mgla kriogeniczna (czastki) + wakes z gasienic
 *
 * TIER 1+2 (ten deliverable): mgla, holo-dach, dystrybutory, plama oleju, holo linie, wakes.
 * TIER 3 (po tescie): hologram hot-doga reagujacy na pocisk, automat + tocząca sie puszka,
 *   dron-maskotka. Nie ma ich tutaj.
 *
 * NIEKOLIZYJNY (passable): pociski przelatuja, czolg gladko wjezdza. NIE w buildings.
 * Czolg gracza pozostaje czytelna sylwetka (mgla nie zakrywa go calkowicie — gameplay 9-12).
 *
 * Static-baked art NIE odswieza sie przez Vite HMR — wymaga re-entry mapy (znany pattern).
 */

const PAL = {
    // asfalt
    asphalt: 0x1c1f26,
    asphaltLight: 0x262a33,
    // mgla kriogeniczna (blekitno-fioletowa)
    fogCyan: 0x6ad8ff,
    fogBlue: 0x4a8fff,
    fogPurple: 0x9a6aff,
    fogPale: 0xcfeaff,
    // holo (kurtyny diagnostyczne + linie parkingu + LED dachu)
    holoCyan: 0x33ffe0,
    holoBlue: 0x3a8cff,
    holoErr: 0xff3a5a,        // glitch ERR_ALIGNMENT
    // dach szklany
    glassTint: 0x2a3a5a,
    glassEdge: 0x55ddff,
    // dystrybutory plazmy
    coreMetal: 0x3a4250,
    coreMetalLight: 0x55606e,
    plasmaGreen: 0x39ff8a,    // neonowy plyn (spojnie z toksycznym motywem mapy)
    cableRust: 0x5a3320,
    spark: 0xfff0a0,
    // plama oleju (benzynowy teczowy)
    oilBase: 0x14121a,
};

// heksagonalny dach — promien + parallax
// v0.60.0 #3: mini-parallax (0.015) — iluzja unoszenia zachowana, ale rozjazd gora-slupa
// vs rog-dachu podpikselowy, wiec statyczne slupy nosne zgadzaja sie wizualnie.
const ROOF_PARALLAX = 0.015;

interface FogParticle {
    gfx: PIXI.Graphics;
    baseX: number;
    baseY: number;
    x: number;
    y: number;
    phase: number;
    driftAmp: number;
    size: number;
    hue: number; // 0=cyan 1=blue 2=purple
    vx: number;  // wake push (rozgarnianie gasienicami)
    vy: number;
}

interface DripParticle {
    x: number;
    y: number;
    vy: number;
    age: number;
    maxAge: number;
}

/** v0.60.0 #2 — rozchodzaca sie fala w kaluzy oleju (gdy kropla plynu uderza w plame). */
interface RippleRing {
    x: number;
    y: number;
    age: number;
    maxAge: number;
}

/** v0.60.0 TIER 3 — puszka "Nuka-Kwanta" wypadajaca z automatu, toczy sie po ziemi. */
interface SodaCan {
    x: number;
    y: number;
    vx: number;
    vy: number;
    roll: number;     // kat obrotu (toczenie)
    rollSpeed: number;
    age: number;
    crushed: boolean; // zgnieciona przez czolg
    settleTimer: number; // gdy sie zatrzyma, lezy chwile zanim zniknie
}

/** v0.60.0 TIER 3 — stan drona-czyscioch (maszyna stanow). */
type DroneState = 'idle' | 'approach' | 'wash' | 'flee';

export class NeonOasisStation {
    public readonly x: number;       // top-left
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private worldContainer: PIXI.Container;
    private gfxGround: PIXI.Graphics;
    private gfxGroundFx: PIXI.Graphics;  // v0.60.0 #2 — animowane fale w kaluzy (na ziemi, pod tankami)
    private gfxProps: PIXI.Graphics;
    private gfxRoof: PIXI.Container;   // container (dla parallax offsetu)
    private gfxRoofGlass: PIXI.Graphics;
    private gfxPillars: PIXI.Graphics; // v0.60.0 #3 — slupy nosne (przed tankami)
    private gfxFog: PIXI.Graphics;     // holo kurtyny + dystrybutor anim (per-frame)
    private fogParticles: FogParticle[] = [];
    private drips: DripParticle[] = []; // krople neonowego plynu z uszkodzonego dystrybutora
    private ripples: RippleRing[] = []; // v0.60.0 #2 — fale w kaluzy oleju

    private time: number = 0;
    private sparkCooldown: number = 0;
    private lastTankContact: number = -99; // v0.60.0 #4 — czas ostatniego wjazdu czolgu (scan flash)
    private cx: number;  // center X
    private cy: number;  // center Y

    // ── v0.60.0 TIER 3 — warstwy interaktywne ──
    private gfxHotdog: PIXI.Container | null = null;   // hologram hot-doga (nad dachem)
    private gfxHotdogGfx: PIXI.Graphics | null = null;
    private gfxVending: PIXI.Graphics | null = null;   // automat (baked) + puszka (anim)
    private gfxDrone: PIXI.Container | null = null;     // dron-maskotka
    private gfxDroneGfx: PIXI.Graphics | null = null;

    // hot-dog glitch
    private hotdogGlitch: number = 0;        // >0 = glitch aktywny (zanika)
    private hotdogGlitchKind: number = 0;    // 0=czaszka 1=troll
    private hotdogSpin: number = 0;

    // automat + puszka
    private vendX: number = 0; private vendY: number = 0;
    private can: SodaCan | null = null;
    private canSpawnCooldown: number = 0;    // zeby nie spawnowac puszki co klatke
    private playerWasNearVend: boolean = false;

    // dron-maskotka
    private droneState: DroneState = 'idle';
    private droneX: number = 0; private droneY: number = 0;
    private droneHomeX: number = 0; private droneHomeY: number = 0;
    private droneBob: number = 0;
    private droneFleeTimer: number = 0;
    private droneBrushAngle: number = 0;

    /** TIER 3 callbacki (audio/iskry zyja w main.ts — jak Enemy.onCubeStolen). */
    public onCanCrushed: ((x: number, y: number) => void) | null = null;

    constructor(
        x: number, y: number,
        w: number, h: number,
        seed: number,
        worldContainer: PIXI.Container,
    ) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.cx = x + w / 2;
        this.cy = y + h / 2;
        this.worldContainer = worldContainer;

        const rng = makeRng(seed);

        // ── GROUND (asfalt + plama oleju + holo linie parkingu) ──
        this.gfxGround = new PIXI.Graphics();
        this.gfxGround.zIndex = -78; // nad bazowa tekstura mapy, pod tankami
        worldContainer.addChild(this.gfxGround);
        this.drawGround(rng);

        // v0.60.0 #2 — animowane fale w kaluzy (osobna warstwa nad asfaltem, pod tankami)
        this.gfxGroundFx = new PIXI.Graphics();
        this.gfxGroundFx.zIndex = -77;
        worldContainer.addChild(this.gfxGroundFx);

        // ── PROPS (dystrybutory plazmy — baked static, iskry/krople animowane na gfxFog) ──
        this.gfxProps = new PIXI.Graphics();
        this.gfxProps.zIndex = this.y + this.h - 40; // y-sort z tankami (lekko z tylu)
        worldContainer.addChild(this.gfxProps);
        this.drawDistributors(rng);

        // ── ROOF (heksagonalny szklany dach + LED — parallax container) ──
        this.gfxRoof = new PIXI.Container();
        this.gfxRoof.zIndex = 99000; // nad tankami (dach unosi sie wysoko)
        this.gfxRoofGlass = new PIXI.Graphics();
        this.gfxRoof.addChild(this.gfxRoofGlass);
        worldContainer.addChild(this.gfxRoof);
        this.drawRoof(rng);

        // v0.60.0 #3 — slupy nosne (prawdziwa wysokosc 2.5D): rysowane na osobnej warstwie
        // z wysokim zIndex (przed czolgiem), zeby mialy "mase" i czolg wjezdzal MIEDZY nie.
        this.gfxPillars = new PIXI.Graphics();
        this.gfxPillars.zIndex = 98500; // przed tankami, pod dachem
        worldContainer.addChild(this.gfxPillars);
        this.drawPillars();

        // ── FOG (mgla kriogeniczna — czastki + holo kurtyny animowane) ──
        this.gfxFog = new PIXI.Graphics();
        this.gfxFog.zIndex = 98000; // pod dachem, nad tankami (czolg jako sylwetka w mgle)
        this.gfxFog.blendMode = PIXI.BLEND_MODES.ADD; // swiecaca mgla
        worldContainer.addChild(this.gfxFog);
        this.spawnFogParticles(rng);

        this.initTier3(rng);
    }

    /**
     * v0.60.0 TIER 3 — interaktywne smaczki: hologram hot-doga (reaguje na pocisk),
     * automat z toczaca sie puszka, dron-maskotka (maszyna stanow). Warstwy + pozycje.
     */
    private initTier3(_rng: () => number): void {
        // --- HOT-DOG HOLOGRAM (kreci sie nad dachem, glitch na pocisk) ---
        this.gfxHotdog = new PIXI.Container();
        this.gfxHotdog.zIndex = 99500; // nad dachem (unosi sie najwyzej)
        this.gfxHotdog.x = this.cx;
        this.gfxHotdog.y = this.y + this.h * 0.06; // nad gornym brzegiem stacji
        this.gfxHotdogGfx = new PIXI.Graphics();
        this.gfxHotdog.addChild(this.gfxHotdogGfx);
        this.worldContainer.addChild(this.gfxHotdog);

        // --- AUTOMAT (vending) — prawy-gorny rog terenu, baked na gfxVending ---
        this.gfxVending = new PIXI.Graphics();
        this.gfxVending.zIndex = this.y + this.h - 30; // y-sort
        this.worldContainer.addChild(this.gfxVending);
        this.vendX = this.x + this.w * 0.86;
        this.vendY = this.y + this.h * 0.30;
        this.drawVendingMachine();

        // --- DRON-MASKOTKA — startuje w rogu (home), unosi sie ---
        this.gfxDrone = new PIXI.Container();
        this.gfxDrone.zIndex = 99700; // nad wszystkim (lata wysoko)
        this.gfxDroneGfx = new PIXI.Graphics();
        this.gfxDrone.addChild(this.gfxDroneGfx);
        this.worldContainer.addChild(this.gfxDrone);
        this.droneHomeX = this.x + this.w * 0.14;
        this.droneHomeY = this.y + this.h * 0.22;
        this.droneX = this.droneHomeX;
        this.droneY = this.droneHomeY;
        this.drawDrone(false);
    }

    private rand(n: number): number {
        const s = Math.sin(n * 12.9898 + 7.131) * 43758.5453;
        return s - Math.floor(s);
    }

    // ════════════════════════════════════════════════════════════
    // GROUND — asfalt, plama oleju (teczowy benzynowy), holo linie parkingu
    // ════════════════════════════════════════════════════════════
    private drawGround(rng: () => number): void {
        const g = this.gfxGround;
        const RADIUS = 22;

        // cien pod stacja (osadzenie)
        g.beginFill(0x000000, 0.22);
        g.drawRoundedRect(this.x + 6, this.y + 10, this.w, this.h, RADIUS);
        g.endFill();

        // plyta asfaltu (ciemniejsza od mapy = wydzielony teren serwisowy)
        g.beginFill(PAL.asphalt, 0.92);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, RADIUS);
        g.endFill();
        // subtelna wariacja tekstury
        g.beginFill(PAL.asphaltLight, 0.30);
        for (let i = 0; i < 40; i++) {
            g.drawCircle(this.x + rng() * this.w, this.y + rng() * this.h, 1 + rng() * 2.5);
        }
        g.endFill();

        // --- PLAMA OLEJU (teczowy benzynowy gradient) — pod uszkodzonym dystrybutorem ---
        // Pozycja: lewy-dolny obszar (gdzie iskrzacy dystrybutor wyleje plyn).
        const oilX = this.x + this.w * 0.30;
        const oilY = this.y + this.h * 0.66;
        // ciemna baza plamy
        g.beginFill(PAL.oilBase, 0.85);
        g.drawEllipse(oilX, oilY, 54, 30);
        g.endFill();
        // teczowe warstwy (benzynowy refleks) — koncentryczne elipsy roznych barw, niska alpha
        const sheen = [0x39ff8a, 0x33d0ff, 0x9a6aff, 0xff5ad0, 0xffe04a];
        for (let i = 0; i < sheen.length; i++) {
            const t = i / sheen.length;
            g.beginFill(sheen[i], 0.10 + (1 - t) * 0.06);
            g.drawEllipse(oilX + (rng() - 0.5) * 10, oilY + (rng() - 0.5) * 6, 48 - i * 8, 26 - i * 4);
            g.endFill();
        }
        // glossy highlight (mokry polysk)
        g.beginFill(0xffffff, 0.10);
        g.drawEllipse(oilX - 14, oilY - 8, 14, 6);
        g.endFill();

        // --- HOLO LINIE PARKINGU (wirtualne, mrugaja z bledem ERR — anim na gfxFog) ---
        // Tu rysujemy tylko statyczne PRZYGASZONE linie (baza); jasny mrugajacy layer na gfxFog.
        g.lineStyle(2, PAL.holoBlue, 0.25);
        const slotW = this.w * 0.26;
        const slotH = this.h * 0.42;
        const slotY = this.y + this.h * 0.20;
        for (let s = 0; s < 3; s++) {
            const sx = this.x + this.w * 0.13 + s * slotW * 0.92;
            g.drawRect(sx, slotY, slotW * 0.8, slotH);
        }
        g.lineStyle(0);

        // v0.60.0 #1: cien dachu — PRZYKLEJONY do asfaltu (dach plywa parallaxem, cien NIE).
        const shrx = this.w * 0.52, shry = this.h * 0.46;
        const shPts: number[] = [];
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            shPts.push(this.cx + 10 + Math.cos(a) * shrx, this.cy + 16 + Math.sin(a) * shry);
        }
        g.beginFill(0x000000, 0.18);
        g.drawPolygon(shPts);
        g.endFill();

        // cartoon outline terenu
        g.lineStyle(2, 0x0a0c10, 0.55);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, RADIUS);
        g.lineStyle(0);
    }

    // ════════════════════════════════════════════════════════════
    // DISTRIBUTORS — lewitujace magnetyczne rdzenie plazmy (jeden uszkodzony)
    // ════════════════════════════════════════════════════════════
    private drawDistributors(rng: () => number): void {
        const g = this.gfxProps;
        // 2 dystrybutory: lewy (sprawny), prawy-dol (uszkodzony — iskrzy + wyciek na gfxFog)
        const positions = [
            { x: this.x + this.w * 0.22, y: this.y + this.h * 0.40, broken: false },
            { x: this.x + this.w * 0.74, y: this.y + this.h * 0.58, broken: true },
        ];
        for (const p of positions) {
            // cien (lewitacja — owal ponizej)
            g.beginFill(0x000000, 0.28);
            g.drawEllipse(p.x, p.y + 30, 22, 7);
            g.endFill();
            // kable zwisajace (grube, zardzewiale)
            g.lineStyle(3.5, PAL.cableRust, 0.9);
            g.moveTo(p.x - 8, p.y + 6);
            g.bezierCurveTo(p.x - 16, p.y + 22, p.x - 10, p.y + 30, p.x - 14, p.y + 40);
            g.moveTo(p.x + 8, p.y + 6);
            g.bezierCurveTo(p.x + 16, p.y + 20, p.x + 12, p.y + 32, p.x + 16, p.y + 42);
            g.lineStyle(0);
            // rdzen (lodowka — zaokraglony prostokat metalowy)
            g.beginFill(PAL.coreMetal, 1);
            g.drawRoundedRect(p.x - 16, p.y - 22, 32, 40, 6);
            g.endFill();
            // highlight (lewa krawedz, swiatlo z gory-lewej)
            g.beginFill(PAL.coreMetalLight, 0.9);
            g.drawRoundedRect(p.x - 16, p.y - 22, 6, 40, 4);
            g.endFill();
            // panel plazmy (okno z neonowym plynem)
            g.beginFill(p.broken ? 0x1a1410 : PAL.plasmaGreen, p.broken ? 1 : 0.85);
            g.drawRoundedRect(p.x - 9, p.y - 14, 18, 22, 3);
            g.endFill();
            if (!p.broken) {
                // poziom plynu (jasniejszy pasek)
                g.beginFill(0xbfffd6, 0.7);
                g.drawRect(p.x - 9, p.y - 2, 18, 3);
                g.endFill();
            } else {
                // pekniecie na panelu (uszkodzony)
                g.lineStyle(1.2, 0x000000, 0.8);
                g.moveTo(p.x - 6, p.y - 12); g.lineTo(p.x + 1, p.y - 4);
                g.lineTo(p.x - 3, p.y + 2); g.lineTo(p.x + 4, p.y + 7);
                g.lineStyle(0);
            }
            // dyspenser (gorna kopulka magnetyczna)
            g.beginFill(PAL.coreMetalLight, 1);
            g.drawRoundedRect(p.x - 10, p.y - 28, 20, 8, 3);
            g.endFill();
            // status LED
            g.beginFill(p.broken ? PAL.holoErr : PAL.plasmaGreen, 0.95);
            g.drawCircle(p.x + 10, p.y - 24, 2);
            g.endFill();
        }
        // zapamietaj pozycje uszkodzonego dla iskier/kropli (local przeliczane w update)
        this._brokenX = positions[1].x;
        this._brokenY = positions[1].y;
        this._oilX = this.x + this.w * 0.30;
        this._oilY = this.y + this.h * 0.66;
    }
    private _brokenX = 0; private _brokenY = 0; private _oilX = 0; private _oilY = 0;

    // ════════════════════════════════════════════════════════════
    // ROOF — heksagonalny szklany dach z LED krawedziami (parallax)
    // ════════════════════════════════════════════════════════════
    private drawRoof(_rng: () => number): void {
        const g = this.gfxRoofGlass;
        // heksagon wpisany w footprint, lekko wiekszy (zadaszenie wystaje)
        const rx = this.w * 0.52;
        const ry = this.h * 0.46;
        const pts: number[] = [];
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            pts.push(this.cx + Math.cos(a) * rx, this.cy + Math.sin(a) * ry);
        }
        // v0.60.0 #1: cien dachu PRZENIESIONY do drawGround (gfxGround) — musi byc
        // przyklejony do asfaltu, bo dach plywa z parallaxem. Tu rysujemy tylko tafle.
        // tafla szkla (70% przezroczysta, niebieski tint)
        g.beginFill(PAL.glassTint, 0.42);
        g.drawPolygon(pts);
        g.endFill();
        // refrakcja (jasniejszy gradient-prostokat w srodku, imituje zaglebienie)
        g.beginFill(0x6a90c0, 0.12);
        g.drawPolygon(pts.map((v, i) => i % 2 === 0 ? this.cx + (v - this.cx) * 0.6 : this.cy + (v - this.cy) * 0.6));
        g.endFill();
        // segmenty szkla (linie z centrum do wierzcholkow)
        g.lineStyle(1, PAL.glassEdge, 0.25);
        for (let i = 0; i < 6; i++) {
            g.moveTo(this.cx, this.cy);
            g.lineTo(pts[i * 2], pts[i * 2 + 1]);
        }
        g.lineStyle(0);
        // LED krawedzie (jasny obrys heksagonu)
        g.lineStyle(2.5, PAL.glassEdge, 0.55);
        g.drawPolygon(pts);
        g.lineStyle(0);
        // v0.60.0 #3: slupy nosne PRZENIESIONE do drawPillars (rysowane na ziemi z pelna wysokoscia).
    }

    /**
     * v0.60.0 #3 — slupy nosne z prawdziwa wysokoscia 2.5D. Idą od rogu footprintu (ziemia,
     * dol) az do szacowanej krawedzi dachu (gora), z gradientem cylindrycznym (ciemny->jasny
     * ->ciemny = objetosc). Beton + opaski + LED. Wysoki zIndex (przed czolgiem) = czolg
     * wjezdza MIEDZY filary, ktore maja "mase". Statyczne (mini-parallax dachu = rozjazd
     * podpikselowy, niezauwazalny).
     */
    private drawPillars(): void {
        const g = this.gfxPillars;
        // 4 filary: 2 z przodu (dol footprintu), 2 z tylu (gora). Gora slupa = poziom dachu.
        const roofTopY = this.cy - this.h * 0.46; // szczyt heksagonu (gora dachu)
        const pillars = [
            { gx: this.x + 30, gyBottom: this.y + this.h - 14 },              // przod-lewy
            { gx: this.x + this.w - 30, gyBottom: this.y + this.h - 14 },     // przod-prawy
            { gx: this.x + 52, gyBottom: this.y + this.h * 0.42 },            // tyl-lewy (krotszy, glebiej)
            { gx: this.x + this.w - 52, gyBottom: this.y + this.h * 0.42 },   // tyl-prawy
        ];
        const PW = 11; // szerokosc filara
        for (const p of pillars) {
            const topY = roofTopY + 6;
            const botY = p.gyBottom;
            const hgt = botY - topY;
            if (hgt <= 0) continue;
            // cien filara na ziemi (owal u podstawy)
            g.beginFill(0x000000, 0.28);
            g.drawEllipse(p.gx, botY, PW * 0.9, 4);
            g.endFill();
            // trzon — gradient cylindryczny (3 pionowe pasy: ciemny | jasny | ciemny)
            g.beginFill(0x222831, 1);
            g.drawRect(p.gx - PW / 2, topY, PW, hgt);
            g.endFill();
            g.beginFill(0x3a4250, 1); // srodek jasniejszy (cylindrycznosc)
            g.drawRect(p.gx - PW / 2 + 2, topY, PW * 0.36, hgt);
            g.endFill();
            g.beginFill(0x55606e, 0.8); // hot highlight (lewa krawedz, swiatlo z lewej-gory)
            g.drawRect(p.gx - PW / 2 + 1.5, topY, 2, hgt);
            g.endFill();
            // opaski metalowe (co ~ 1/3 wysokosci)
            g.beginFill(0x1a1e26, 0.9);
            for (let b = 1; b <= 2; b++) {
                g.drawRect(p.gx - PW / 2 - 1, topY + (hgt * b) / 3, PW + 2, 3);
            }
            g.endFill();
            // LED pasek na froncie filara (cyberpunk akcent)
            g.beginFill(PAL.glassEdge, 0.5);
            g.drawRect(p.gx + PW / 2 - 2, topY + 4, 1.5, hgt - 8);
            g.endFill();
            // kapitel (laczenie z dachem) — jasniejszy blok u gory
            g.beginFill(0x4a5562, 1);
            g.drawRect(p.gx - PW / 2 - 2, topY - 3, PW + 4, 6);
            g.endFill();
        }
    }

    // ════════════════════════════════════════════════════════════
    // TIER 3 — STATIC DRAWS (vending machine baked) + DYNAMIC (drone, hotdog)
    // ════════════════════════════════════════════════════════════
    /** v0.60.0 TIER 3 — automat "Nuka-Kwanta" (baked static, na gfxVending). */
    private drawVendingMachine(): void {
        const g = this.gfxVending!;
        const vx = this.vendX, vy = this.vendY;
        const W = 34, H = 56;
        // cien
        g.beginFill(0x000000, 0.30);
        g.drawEllipse(vx, vy + H / 2 + 4, W * 0.6, 6);
        g.endFill();
        // korpus (zaokraglony, ciemny metal z neonowa ramka)
        g.beginFill(0x232a36, 1);
        g.drawRoundedRect(vx - W / 2, vy - H / 2, W, H, 5);
        g.endFill();
        g.lineStyle(2, 0xff2299, 0.7); // magenta neon ramka
        g.drawRoundedRect(vx - W / 2, vy - H / 2, W, H, 5);
        g.lineStyle(0);
        // szyba witryny (z produktami — male kolorowe puszki)
        g.beginFill(0x0e1620, 0.9);
        g.drawRoundedRect(vx - W / 2 + 4, vy - H / 2 + 5, W - 14, H - 22, 3);
        g.endFill();
        const cans = [0x39ff8a, 0x33d0ff, 0xff5ad0, 0xffe04a];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 2; c++) {
                g.beginFill(cans[(r * 2 + c) % cans.length], 0.8);
                g.drawRoundedRect(vx - W / 2 + 6 + c * 8, vy - H / 2 + 8 + r * 11, 6, 9, 2);
                g.endFill();
            }
        }
        // panel boczny (przyciski + otwor na puszke)
        g.beginFill(0x1a1f28, 1);
        g.drawRoundedRect(vx + W / 2 - 9, vy - H / 2 + 5, 7, H - 22, 2);
        g.endFill();
        g.beginFill(0x39ff8a, 0.8); g.drawCircle(vx + W / 2 - 5.5, vy - H / 2 + 10, 1.5); g.endFill();
        g.beginFill(0xff2299, 0.8); g.drawCircle(vx + W / 2 - 5.5, vy - H / 2 + 15, 1.5); g.endFill();
        // otwor wydawczy (dolny)
        g.beginFill(0x05080c, 1);
        g.drawRoundedRect(vx - W / 2 + 5, vy + H / 2 - 13, W - 10, 8, 2);
        g.endFill();
        // szyld neon na gorze
        g.beginFill(0x33d0ff, 0.85);
        g.drawRoundedRect(vx - W / 2 + 3, vy - H / 2 - 6, W - 6, 6, 2);
        g.endFill();
    }

    /** v0.60.0 TIER 3 — dron-maskotka (rysowany per-frame, washing=true gdy myje lufe). */
    private drawDrone(washing: boolean): void {
        const g = this.gfxDroneGfx!;
        g.clear();
        // cien (lewitacja)
        g.beginFill(0x000000, 0.22);
        g.drawEllipse(0, 16, 11, 3);
        g.endFill();
        // korpus (grubiutki, okragly — przyjazny dla dzieci)
        g.beginFill(0x3a8cff, 1);
        g.drawCircle(0, 0, 11);
        g.endFill();
        g.beginFill(0x66b0ff, 0.9); // highlight
        g.drawCircle(-3, -3, 5);
        g.endFill();
        // czapka pracownika stacji (daszek)
        g.beginFill(0xff2299, 1);
        g.drawRoundedRect(-9, -14, 18, 6, 2);
        g.endFill();
        g.beginFill(0xff2299, 1);
        g.drawRoundedRect(-4, -10, 12, 3, 1); // daszek
        g.endFill();
        // oko (duze, jedno — kawaii)
        g.beginFill(0xffffff, 1); g.drawCircle(1, -1, 5); g.endFill();
        const lookX = washing ? 2 : 1;
        g.beginFill(0x101820, 1); g.drawCircle(lookX, -1, 2.4); g.endFill();
        g.beginFill(0xffffff, 0.9); g.drawCircle(lookX - 0.8, -1.8, 0.9); g.endFill();
        // mini-rotory (4 boczne) — kreski migajace
        g.lineStyle(2, 0x88c0ff, 0.6);
        g.moveTo(-11, 0); g.lineTo(-15, 0);
        g.moveTo(11, 0); g.lineTo(15, 0);
        g.lineStyle(0);
        // ramie ze szczotka (wysuwa sie gdy washing)
        const armLen = washing ? 16 : 8;
        const aAng = this.droneBrushAngle;
        const ax = Math.cos(aAng) * armLen;
        const ay = 10 + Math.sin(aAng) * 3;
        g.lineStyle(2.5, 0x55606e, 1);
        g.moveTo(0, 8); g.lineTo(ax, ay);
        g.lineStyle(0);
        // szczotka (zolte wlosie)
        g.beginFill(0xffe04a, 1);
        g.drawRoundedRect(ax - 3, ay - 2, 6, 5, 1);
        g.endFill();
        if (washing) {
            // bryzgi mycia (male biale kropki)
            for (let i = 0; i < 3; i++) {
                const sa = this.time * 6 + i * 2;
                g.beginFill(0xcfeaff, 0.7);
                g.drawCircle(ax + Math.cos(sa) * 4, ay + Math.sin(sa) * 4, 1);
                g.endFill();
            }
        }
        // status LED (czubek)
        const blink = Math.sin(this.time * 8) > 0 ? 0x39ff8a : 0x1a3a20;
        g.beginFill(blink, 1); g.drawCircle(0, -16, 1.5); g.endFill();
    }

    /** v0.60.0 TIER 3 — hologram hot-doga (per-frame; glitch=true rysuje czaszke/trolla). */
    private drawHotdog(): void {
        const g = this.gfxHotdogGfx!;
        g.clear();
        const glitching = this.hotdogGlitch > 0;
        // poswiata holo (pod spodem)
        const baseColor = glitching ? (this.hotdogGlitchKind === 0 ? 0xff3a3a : 0xffaa22) : 0xffcc44;
        g.beginFill(baseColor, 0.12 + (glitching ? 0.15 : 0));
        g.drawEllipse(0, 0, 30, 16);
        g.endFill();
        // skan-linie holo (poziome paski przez cala ikone)
        g.lineStyle(0);

        if (glitching) {
            // GLITCH: czaszka (kind 0) lub troll-emotka (kind 1)
            if (this.hotdogGlitchKind === 0) {
                // czaszka ostrzegawcza
                g.beginFill(0xff3a3a, 0.9);
                g.drawCircle(0, -2, 11);
                g.drawRoundedRect(-7, 6, 14, 7, 2);
                g.endFill();
                g.beginFill(0x200008, 1); // oczodoly
                g.drawCircle(-4, -3, 3); g.drawCircle(4, -3, 3);
                g.drawRect(-1.5, 1, 3, 4); // nos
                g.endFill();
                g.lineStyle(1.5, 0x200008, 1); // zeby
                for (let t = -5; t <= 5; t += 2.5) { g.moveTo(t, 6); g.lineTo(t, 12); }
                g.lineStyle(0);
            } else {
                // troll-emotka (zolta, szeroki usmiech)
                g.beginFill(0xffd24a, 0.95);
                g.drawCircle(0, 0, 12);
                g.endFill();
                g.beginFill(0x6a4a00, 1);
                g.drawEllipse(-5, -3, 2.5, 3.5); g.drawEllipse(5, -3, 2.5, 3.5); // oczy
                g.endFill();
                g.lineStyle(2, 0x6a4a00, 1); // szeroki troll-usmiech
                g.moveTo(-8, 3); g.bezierCurveTo(-4, 10, 4, 10, 8, 3);
                g.lineStyle(0);
            }
        } else {
            // NORMALNY hot-dog (bulka + parowka + musztarda)
            // bulka dolna
            g.beginFill(0xe0a040, 1);
            g.drawRoundedRect(-20, 2, 40, 9, 5);
            g.endFill();
            // parowka
            g.beginFill(0xc0392b, 1);
            g.drawRoundedRect(-22, -3, 44, 9, 5);
            g.endFill();
            g.beginFill(0xe05a4a, 0.7); // highlight parowki
            g.drawRoundedRect(-20, -3, 40, 3, 2);
            g.endFill();
            // bulka gorna
            g.beginFill(0xf0b860, 1);
            g.drawRoundedRect(-20, -10, 40, 9, 5);
            g.endFill();
            // musztarda (zygzak)
            g.lineStyle(2, 0xffe04a, 1);
            g.moveTo(-16, -1);
            for (let zx = -16; zx <= 16; zx += 8) {
                g.lineTo(zx + 4, -4); g.lineTo(zx + 8, -1);
            }
            g.lineStyle(0);
        }
        // skan-linie (holo flicker — poziome przezroczyste paski)
        g.beginFill(0x000000, 0.12);
        for (let sy = -14; sy < 14; sy += 4) {
            g.drawRect(-24, sy + (this.time * 20 % 4), 48, 1);
        }
        g.endFill();
    }

    // ════════════════════════════════════════════════════════════
    // FOG PARTICLES — mgla kriogeniczna (czastki unoszace sie)
    // ════════════════════════════════════════════════════════════
    private spawnFogParticles(rng: () => number): void {
        const COUNT = Math.max(14, Math.floor((this.w * this.h) / 2600));
        for (let i = 0; i < COUNT; i++) {
            const bx = this.x + 20 + rng() * (this.w - 40);
            const by = this.y + 20 + rng() * (this.h - 40);
            this.fogParticles.push({
                gfx: new PIXI.Graphics(), // nieuzywane (rysujemy na wspolnym gfxFog) — placeholder
                baseX: bx, baseY: by, x: bx, y: by,
                phase: rng() * Math.PI * 2,
                driftAmp: 8 + rng() * 14,
                size: 14 + rng() * 22,
                hue: Math.floor(rng() * 3),
                vx: 0, vy: 0,
            });
        }
    }

    // ════════════════════════════════════════════════════════════
    // UPDATE — fog drift + roof parallax + holo curtains + sparks/drips + TIER 3
    // sygnatura: update(camX, camY, playerX?, playerY?, didShoot?, bullets?)
    //   camX/camY — parallax dachu; playerX/Y — automat/puszka/dron tracking;
    //   didShoot — czolg strzelil w tej klatce (dron flee + nic dla hot-doga);
    //   bullets — do glitchu hot-doga (pocisk w strefie -> czaszka/troll), jak iskry fabryki.
    // ════════════════════════════════════════════════════════════
    public update(
        camX: number = 0, camY: number = 0,
        playerX?: number, playerY?: number,
        didShoot: boolean = false,
        bullets?: Array<{ x: number; y: number; active: boolean }>,
    ): void {
        this.time += 1 / 60;
        const g = this.gfxFog;
        g.clear();

        // --- ROOF PARALLAX (delikatne unoszenie wzgledem kamery) ---
        // dach przesuwa sie lekko przeciwnie do kamery = wrazenie ze unosi sie wyzej.
        this.gfxRoof.x = -(this.cx - camX) * ROOF_PARALLAX;
        this.gfxRoof.y = -(this.cy - camY) * ROOF_PARALLAX - 6;

        // --- MGLA KRIOGENICZNA (czastki) ---
        for (const p of this.fogParticles) {
            // wake decay (rozgarniecie gasienicami wraca do bazy)
            p.vx *= 0.90; p.vy *= 0.90;
            // dryf wlasny (powolne unoszenie + boczne kolysanie)
            const drift = Math.sin(this.time * 0.6 + p.phase) * p.driftAmp;
            const rise = ((this.time * 6 + p.phase * 10) % 40) - 20; // powolny cykl pionowy
            p.x = p.baseX + drift * 0.5 + p.vx;
            p.y = p.baseY - Math.abs(rise) * 0.2 + p.vy;
            // utrzymaj w granicach strefy (miekko)
            p.baseX += p.vx * 0.04; p.baseY += p.vy * 0.04;
            if (p.baseX < this.x + 10) p.baseX = this.x + 10;
            if (p.baseX > this.x + this.w - 10) p.baseX = this.x + this.w - 10;
            if (p.baseY < this.y + 10) p.baseY = this.y + 10;
            if (p.baseY > this.y + this.h - 10) p.baseY = this.y + this.h - 10;

            const color = p.hue === 0 ? PAL.fogCyan : p.hue === 1 ? PAL.fogBlue : PAL.fogPurple;
            let pulse = 0.10 + 0.05 * Math.sin(this.time * 1.2 + p.phase);
            // v0.60.0 #1 fog ceiling — przy gornej krawedzi strefy (pod szklem dachu) mgla
            // "zderza sie" z sufitem: sciskamy alfe, zeby nie uciekala w gore w kosmos.
            const ceilDist = p.y - this.y; // odleglosc od gory strefy
            if (ceilDist < 40) pulse *= Math.max(0.2, ceilDist / 40);
            // klab mgly (2 warstwy dla objetosci)
            g.beginFill(color, pulse);
            g.drawCircle(p.x, p.y, p.size);
            g.endFill();
            g.beginFill(PAL.fogPale, pulse * 0.5);
            g.drawCircle(p.x - p.size * 0.15, p.y - p.size * 0.15, p.size * 0.55);
            g.endFill();
        }

        // --- HOLO KURTYNY DIAGNOSTYCZNE (opadajace pionowe pasy swiatla) ---
        // v0.60.0 #4 scan flash: po wjezdzie czolgu (lastTankContact) kurtyny "wzdrygaja sie"
        // agresywnym magenta przez 0.2s = wykrycie sylwetki. Inaczej spokojny cyan.
        const recentScan = (this.time - this.lastTankContact) < 0.2;
        const scannerColor = recentScan ? 0xff44aa : PAL.holoCyan;
        const scanBoost = recentScan ? 2.2 : 1.0; // jasniejsze przy wykryciu
        const curtainCount = 4;
        for (let i = 0; i < curtainCount; i++) {
            const cxp = this.x + this.w * (0.2 + i * 0.2);
            const scan = ((this.time * 40 + i * 50) % (this.h * 0.7));
            const top = this.y + this.h * 0.12;
            // pas
            g.beginFill(scannerColor, 0.05 * scanBoost);
            g.drawRect(cxp - 14, top, 28, this.h * 0.7);
            g.endFill();
            // linia skanujaca (jasniejsza, opada)
            g.beginFill(scannerColor, 0.30 * scanBoost);
            g.drawRect(cxp - 14, top + scan, 28, 3);
            g.endFill();
        }

        // --- HOLO LINIE PARKINGU (mrugaja, czasem glitch ERR czerwony) ---
        const glitch = Math.sin(this.time * 3.0) > 0.7; // sporadyczny blad
        const lineColor = glitch ? PAL.holoErr : PAL.holoBlue;
        const lineAlpha = (glitch ? 0.5 : 0.3) * (0.6 + 0.4 * Math.sin(this.time * 5));
        g.lineStyle(2, lineColor, lineAlpha);
        const slotW = this.w * 0.26;
        const slotH = this.h * 0.42;
        const slotY = this.y + this.h * 0.20;
        for (let s = 0; s < 3; s++) {
            const sx = this.x + this.w * 0.13 + s * slotW * 0.92;
            g.drawRect(sx, slotY, slotW * 0.8, slotH);
        }
        g.lineStyle(0);

        // --- DYSTRYBUTOR USZKODZONY: iskry + krople neonowego plynu ---
        this.sparkCooldown--;
        if (this.sparkCooldown <= 0) {
            this.sparkCooldown = 8 + Math.floor(this.rand(this.time * 2.1) * 10);
            // burst iskier
            const sn = 3 + Math.floor(this.rand(this.time * 5.3) * 4);
            for (let i = 0; i < sn; i++) {
                const a = -Math.PI / 2 + (this.rand(this.time + i) - 0.5) * 2.2;
                const sp = 1 + this.rand(this.time * 1.3 + i) * 2;
                this.drips.push({
                    x: this._brokenX, y: this._brokenY - 6,
                    vy: Math.sin(a) * sp, age: 0, maxAge: 14 + this.rand(i) * 10,
                });
                // iskra rysowana od razu jako krotki blysk
            }
            // kropla plynu (spada do plamy oleju)
            this.drips.push({
                x: this._brokenX + (this.rand(this.time * 7) - 0.5) * 6,
                y: this._brokenY + 8, vy: 1.2 + this.rand(this.time) * 0.8,
                age: 0, maxAge: 40,
            });
        }
        for (let i = this.drips.length - 1; i >= 0; i--) {
            const d = this.drips[i];
            d.age++;
            const isSpark = d.maxAge < 30;
            // v0.60.0 #2: kropla plynu (NIE iskra) ktora dotarla do plamy oleju -> fala (ripple)
            if (!isSpark && d.y >= this._oilY) {
                this.ripples.push({ x: d.x, y: this._oilY, age: 0, maxAge: 32 });
                this.drips.splice(i, 1);
                continue;
            }
            if (d.age >= d.maxAge) { this.drips.splice(i, 1); continue; }
            d.vy += 0.18; // grawitacja
            d.y += d.vy;
            const lifeT = d.age / d.maxAge;
            // iskra/kropla — kolor zalezny od predkosci (szybkie=iskra zolta, wolne=plyn zielony)
            const color = isSpark ? PAL.spark : PAL.plasmaGreen;
            g.beginFill(color, (1 - lifeT) * 0.9);
            g.drawCircle(d.x, d.y, isSpark ? 1.5 : 2.2);
            g.endFill();
            if (isSpark) {
                // smuga iskry
                g.lineStyle(1, color, (1 - lifeT) * 0.5);
                g.moveTo(d.x, d.y); g.lineTo(d.x, d.y - d.vy * 1.5);
                g.lineStyle(0);
            }
        }

        // v0.60.0 #2 — fale w kaluzy oleju (rosnaca elipsa, alpha -> 0). Rysowane na gfxGroundFx
        // (warstwa ziemi pod tankami, NIE additive — to mokra fala, nie swiatlo).
        const fg = this.gfxGroundFx;
        fg.clear();
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i];
            r.age++;
            if (r.age >= r.maxAge) { this.ripples.splice(i, 1); continue; }
            const t = r.age / r.maxAge;
            const rad = 4 + t * 26;
            // teczowy benzynowy refleks na fali (cienki obwod)
            fg.lineStyle(1.6, PAL.plasmaGreen, (1 - t) * 0.5);
            fg.drawEllipse(r.x, r.y, rad, rad * 0.55);
            fg.lineStyle(1, 0x33d0ff, (1 - t) * 0.3);
            fg.drawEllipse(r.x, r.y, rad * 0.7, rad * 0.7 * 0.55);
            fg.lineStyle(0);
        }

        // ════════ TIER 3 ════════
        this.updateHotdog(bullets);
        this.updateVendingAndCan(playerX, playerY);
        this.updateDrone(playerX, playerY, didShoot);
    }

    /** v0.60.0 TIER 3 — hot-dog: obrot + glitch na czaszke/trolla gdy pocisk w strefie. */
    private updateHotdog(bullets?: Array<{ x: number; y: number; active: boolean }>): void {
        if (!this.gfxHotdog) return;
        // obrot (kolysanie boczne — holo "kreci sie")
        this.hotdogSpin += 0.03;
        this.gfxHotdog.scale.x = Math.cos(this.hotdogSpin) * 0.9 + 0.1; // fake 3D spin (flip X)
        // glitch trigger: pocisk przelatuje przez strefe
        if (bullets && this.hotdogGlitch <= 0) {
            for (const b of bullets) {
                if (!b.active) continue;
                if (this.isPointInside(b.x, b.y)) {
                    this.hotdogGlitch = 0.35; // ~21 klatek
                    this.hotdogGlitchKind = Math.random() < 0.5 ? 0 : 1;
                    break;
                }
            }
        }
        if (this.hotdogGlitch > 0) this.hotdogGlitch -= 1 / 60;
        this.drawHotdog();
    }

    /** v0.60.0 TIER 3 — automat: gdy gracz przejedzie -> wypada puszka; puszka toczy sie. */
    private updateVendingAndCan(playerX?: number, playerY?: number): void {
        if (!this.gfxVending) return;
        if (this.canSpawnCooldown > 0) this.canSpawnCooldown--;

        // spawn puszki gdy gracz przejedzie blisko automatu (raz na cooldown)
        if (playerX !== undefined && playerY !== undefined) {
            const dx = playerX - this.vendX, dy = playerY - this.vendY;
            const near = dx * dx + dy * dy < 70 * 70;
            if (near && !this.playerWasNearVend && !this.can && this.canSpawnCooldown <= 0) {
                // wypada z otworu wydawczego, toczy sie w losowa strone (przewaga w dol/bok)
                const dir = Math.random() < 0.5 ? -1 : 1;
                this.can = {
                    x: this.vendX, y: this.vendY + 22,
                    vx: dir * (1.2 + Math.random() * 1.0), vy: 0.4 + Math.random() * 0.6,
                    roll: 0, rollSpeed: dir * 0.25,
                    age: 0, crushed: false, settleTimer: 0,
                };
                this.canSpawnCooldown = 240; // ~4s zanim moze wypasc kolejna
            }
            this.playerWasNearVend = near;
        }

        // render automatu juz baked; tu tylko puszka na gfxFog (NIE — gfxFog czyszczone; uzyj gfxGroundFx)
        const c = this.can;
        if (!c) return;
        const fg = this.gfxGroundFx; // puszka na ziemi (gfxGroundFx nie jest additive)
        c.age++;
        if (!c.crushed) {
            // toczenie z tarciem
            c.vx *= 0.96; c.vy *= 0.96;
            c.x += c.vx; c.y += c.vy;
            c.roll += c.rollSpeed * (Math.abs(c.vx) + Math.abs(c.vy)) * 0.3;
            // utrzymaj w granicach strefy
            if (c.x < this.x + 12 || c.x > this.x + this.w - 12) c.vx *= -0.5;
            if (c.y < this.y + 12 || c.y > this.y + this.h - 12) c.vy *= -0.5;
            // zatrzymanie
            if (Math.abs(c.vx) < 0.1 && Math.abs(c.vy) < 0.1) {
                c.settleTimer++;
                if (c.settleTimer > 300) { this.can = null; return; } // lezy 5s -> znika
            }
            // zgniecenie przez czolg (touch)
            if (playerX !== undefined && playerY !== undefined) {
                const dx = playerX - c.x, dy = playerY - c.y;
                if (dx * dx + dy * dy < 26 * 26) {
                    c.crushed = true;
                    c.age = 0;
                    this.onCanCrushed?.(c.x, c.y); // main.ts: dzwiek + iskry
                }
            }
        } else {
            // zgnieciona — splaszczona, znika po chwili
            if (c.age > 40) { this.can = null; return; }
        }
        // rysuj puszke
        this.drawCan(fg, c);
    }

    /** Rysuje puszke (toczaca sie cylinder lub zgnieciona). Na podanej warstwie (gfxGroundFx). */
    private drawCan(fg: PIXI.Graphics, c: SodaCan): void {
        if (c.crushed) {
            // splaszczona blacha
            fg.beginFill(0x39ff8a, 0.8);
            fg.drawEllipse(c.x, c.y, 9, 3);
            fg.endFill();
            fg.beginFill(0x888888, 0.6);
            fg.drawEllipse(c.x, c.y, 6, 2);
            fg.endFill();
            return;
        }
        // cylinder (z obrotem — paski etykiety obracaja sie z roll)
        fg.beginFill(0x000000, 0.2);
        fg.drawEllipse(c.x, c.y + 5, 7, 2);
        fg.endFill();
        fg.beginFill(0xcfeaff, 0.95); // korpus aluminiowy
        fg.drawRoundedRect(c.x - 6, c.y - 4, 12, 9, 2);
        fg.endFill();
        // etykieta (zielony pasek "Nuka-Kwanta", przesuwa sie z obrotem)
        const labelShift = Math.sin(c.roll) * 4;
        fg.beginFill(0x39ff8a, 0.9);
        fg.drawRect(c.x - 6 + labelShift * 0.3, c.y - 2, 5, 5);
        fg.endFill();
        fg.lineStyle(1, 0x888888, 0.7);
        fg.drawRoundedRect(c.x - 6, c.y - 4, 12, 9, 2);
        fg.lineStyle(0);
    }

    /** v0.60.0 TIER 3 — dron-maskotka: maszyna stanow idle/approach/wash/flee. */
    private updateDrone(playerX?: number, playerY?: number, didShoot: boolean = false): void {
        if (!this.gfxDrone) return;
        this.droneBob += 0.08;
        this.droneBrushAngle += 0.2;

        const playerInside = playerX !== undefined && playerY !== undefined
            && this.isPointInside(playerX, playerY);

        // STRZAL -> dron panikuje (flee) niezaleznie od stanu
        if (didShoot && (this.droneState === 'approach' || this.droneState === 'wash')) {
            this.droneState = 'flee';
            this.droneFleeTimer = 90; // ~1.5s ucieczki
        }

        switch (this.droneState) {
            case 'idle':
                // unosi sie w home, lekko dryfuje
                this.droneX += (this.droneHomeX - this.droneX) * 0.05;
                this.droneY += (this.droneHomeY - this.droneY) * 0.05;
                if (playerInside) this.droneState = 'approach';
                break;
            case 'approach':
                if (!playerInside) { this.droneState = 'idle'; break; }
                if (playerX !== undefined && playerY !== undefined) {
                    // podlatuje do czolgu (zatrzymuje sie obok lufy)
                    const tx = playerX + 28, ty = playerY - 20;
                    this.droneX += (tx - this.droneX) * 0.06;
                    this.droneY += (ty - this.droneY) * 0.06;
                    const dx = this.droneX - playerX, dy = this.droneY - playerY;
                    if (dx * dx + dy * dy < 42 * 42) this.droneState = 'wash';
                }
                break;
            case 'wash':
                if (!playerInside) { this.droneState = 'flee'; this.droneFleeTimer = 60; break; }
                if (playerX !== undefined && playerY !== undefined) {
                    // trzyma sie przy lufie, "myje"
                    const tx = playerX + 26, ty = playerY - 18;
                    this.droneX += (tx - this.droneX) * 0.12;
                    this.droneY += (ty - this.droneY) * 0.12;
                }
                break;
            case 'flee':
                // ucieka do home w panice
                this.droneX += (this.droneHomeX - this.droneX) * 0.10;
                this.droneY += (this.droneHomeY - this.droneY) * 0.10;
                this.droneFleeTimer--;
                if (this.droneFleeTimer <= 0) this.droneState = 'idle';
                break;
        }

        // pozycja + bob (unoszenie)
        this.gfxDrone.x = this.droneX;
        this.gfxDrone.y = this.droneY + Math.sin(this.droneBob) * 3;
        // przechyl przy ucieczce (panika)
        this.gfxDrone.rotation = this.droneState === 'flee' ? Math.sin(this.time * 20) * 0.2 : 0;
        this.drawDrone(this.droneState === 'wash');
    }

    // ════════════════════════════════════════════════════════════
    // STEALTH CHECK — rectangle containment (1:1 z CornField)
    // ════════════════════════════════════════════════════════════
    public isPointInside(px: number, py: number): boolean {
        return px >= this.x && px <= this.x + this.w
            && py >= this.y && py <= this.y + this.h;
    }

    // ════════════════════════════════════════════════════════════
    // TANK INTERACTION — gasienice rozgarniaja mgle (fog wakes)
    // ════════════════════════════════════════════════════════════
    /**
     * Wolane co frame przez main.ts gdy czolg w poblizu strefy. Czastki mgly w promieniu
     * sa odpychane OD czolga (wake). Intensywnosc falloff od dystansu. vx/vy lerpuja do 0
     * w update() (0.90 damping) = mgla wraca do bazy po przejezdzie.
     */
    public onTankEnter(tankX: number, tankY: number): void {
        const MARGIN = 50;
        if (tankX < this.x - MARGIN || tankX > this.x + this.w + MARGIN
            || tankY < this.y - MARGIN || tankY > this.y + this.h + MARGIN) {
            return;
        }
        // v0.60.0 #4 — zarejestruj kontakt (scan flash w holo kurtynach przez 0.2s)
        this.lastTankContact = this.time;
        const PUSH_RADIUS = 70;
        const PUSH_FORCE = 2.4;
        for (const p of this.fogParticles) {
            const dx = p.x - tankX;
            const dy = p.y - tankY;
            const distSq = dx * dx + dy * dy;
            if (distSq > PUSH_RADIUS * PUSH_RADIUS || distSq < 0.01) continue;
            const dist = Math.sqrt(distSq);
            const intensity = 1.0 - dist / PUSH_RADIUS;
            p.vx += (dx / dist) * PUSH_FORCE * intensity;
            p.vy += (dy / dist) * PUSH_FORCE * intensity;
        }
    }

    /** Cleanup — wolane gdy mapa niszczona. */
    public destroy(): void {
        this.gfxGround.destroy();
        this.gfxGroundFx.destroy(); // v0.60.0 #2
        this.gfxProps.destroy();
        this.gfxPillars.destroy();  // v0.60.0 #3
        this.gfxRoof.destroy({ children: true });
        this.gfxFog.destroy();
        this.gfxHotdog?.destroy({ children: true }); // v0.60.0 TIER 3
        this.gfxVending?.destroy();
        this.gfxDrone?.destroy({ children: true });
        this.fogParticles = [];
        this.drips = [];
        this.ripples = []; // v0.60.0 #2
        this.can = null;
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