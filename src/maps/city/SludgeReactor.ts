import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { Bullet } from '../../entities/Bullet';
import { t } from '../../i18n/i18n';

/**
 * v0.52.0 phase 2 — SludgeReactor (Reaktor Fluorescencyjnego Szlamu).
 *
 * Industrialny cylindryczny zbiornik z pancernego szkla wypelniony toksycznym
 * neonowo-rozowym szlamem. Pozostalosc po fabryce chemicznej, pulsuje wlasnym
 * swiatlem i bulgocze. 100% niezniszczalny (twarda kolizja jak CyberBuilding).
 *
 * Architektura zgodna z Crate.ts (analog niezniszczalny):
 *   - Constructor(x, y, parent) — dodaje siebie do worldContainer
 *   - Implements ICollidable (x, y, w, h, update) — push do buildings/solidBuildings
 *   - update(camX, camY, viewW, viewH, bullets) — modified signature przyjmuje bullets[]
 *     dla wewnetrznego hit detection (analog Crate); zwykly ICollidable.update sygnatura
 *     jest tez supported (no-op gdy brak bullets)
 *
 * Stany animacji:
 *   - IDLE (default): bubble passive (3 blobs sin), glow pulse 2 Hz
 *   - EXCITED (gracz <200 px): bubble speed x2, glow intensywniejszy
 *   - HIT (bullet collision, 600ms timer): glass flash white, steam burst, holo warning
 *
 * Visual layers (zIndex stack):
 *   -1: glowHalo (pod obiektem, radial gradient pink)
 *    0: tankBase (cylinder bottom + bolts)
 *    1: glassCylinder (pancerne szklo z highlight + reinforcement rings)
 *    2: sludgeLiquid (wnetrze z bubble blobs procedural — animowane)
 *    3: topCap (metalowa pokrywa + 2 rury zardzewiale)
 *  +200: holoWarning (PIXI.Text reactor.pressureSpike, widoczny tylko podczas HIT state)
 *
 * v0.52.x i18n: warning label przeniesiony do i18n (klucz 'reactor.pressureSpike').
 * UWAGA: tekst budowany jest raz w konstruktorze, wiec lapie biezacy jezyk w momencie
 * utworzenia reaktora (= przy load mapy). Zmiana jezyka MID-MATCH nie odswiezy juz
 * istniejacych reaktorow. W praktyce jezyk ustawiany jest w menu przed gra, wiec OK.
 *
 * MVP scope: brak audio (dodane w polish phase v0.52.x). Brak chromatic aberration
 * na holo text — sam tint magenta wystarcza dla MVP.
 */

const COLOR_SLUDGE_BRIGHT = 0xff3399; // jasny neonowy roz (sludge core)
const COLOR_SLUDGE_DARK = 0xaa1166;   // ciemniejszy roz (sludge depth)
const COLOR_GLASS_TINT = 0x88ccdd;    // cyan-ish tint szkla
const COLOR_METAL_DARK = 0x2a2a35;    // ciemny metal (base + cap)
const COLOR_METAL_RUST = 0x6b3a1f;    // zardzewialy metal (rury)
const COLOR_BOLT = 0x4a4a55;          // bolty mocujace
const COLOR_HALO = 0xff44aa;          // halo glow color (matches sludge)
const COLOR_WARNING = 0xff2266;       // tekst warning (holo)

const HIT_FLASH_DURATION = 36;        // frames (~600 ms @ 60 fps)
const PROXIMITY_RADIUS = 200;         // px — gracz w tym zasiegu = EXCITED state
const PROXIMITY_RADIUS_SQ = PROXIMITY_RADIUS * PROXIMITY_RADIUS;

interface SludgeBubble {
    relX: number;        // pozycja w cylindrze (-1 to 1 horizontal)
    baseY: number;       // base y position
    radius: number;      // rozmiar bubble
    phase: number;       // sin phase offset
    speed: number;       // sin frequency multiplier
    depth: 'bg' | 'fg';  // bg = mniejsze, ciemniejsze (w głębi cylindra), fg = jasne, blizej "przedu"
    // v0.52.0 polish #4 (pop effect): tracking surface contact state.
    // Gdy FG bubble osiąga peak top of sinusoid (touches sludge surface),
    // spawn ephemeral pop ring w surfaceRings array. wasNearSurface zapobiega multi-trigger.
    wasNearSurface: boolean;
}

interface SurfacePopRing {
    x: number;           // pozycja x na sludge surface (relative to container)
    age: number;         // frames od spawnu
    maxAge: number;      // total lifetime
    initialRadius: number;
}

interface SteamParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    maxAge: number;
    size: number;
}

export class SludgeReactor implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    private container: PIXI.Container;
    private haloGfx: PIXI.Graphics;
    private baseGfx: PIXI.Graphics;       // static — drawn once (cast shadow + back of base)
    private glassGfx: PIXI.Graphics;      // animated (flash on hit)
    private sludgeGfx: PIXI.Graphics;     // animated (bubbles per-frame)
    private baseFrontGfx: PIXI.Graphics;  // static front-lip of base (zIndex 4, OVER glass+sludge)
    private capGfx: PIXI.Graphics;        // static — drawn once
    private steamGfx: PIXI.Graphics;      // animated (steam particles)
    private warningText: PIXI.Text;

    private bubbles: SludgeBubble[] = [];
    private steamParticles: SteamParticle[] = [];
    private surfacePopRings: SurfacePopRing[] = []; // v0.52.0 polish #4
    private animTime: number = 0;
    private hitFlashTimer: number = 0;     // frames remaining of HIT state
    private isPlayerNear: boolean = false; // EXCITED state flag

    // v0.52.0 polish #6: passive ambient steam — wisps unoszące się stale z cap (top of reactor).
    // Cooldown frames do nastepnego spawnu. Krótszy w EXCITED state (więcej steam = bulgotanie).
    private passiveSteamCooldown: number = 0;

    // Ostatni hit position (do steam burst origin)
    private lastHitX: number = 0;
    private lastHitY: number = 0;

    // Tracking bullets already counted as hit (zeby nie multi-trigger gdy bullet ginie w tym samym tick)
    private hitBulletIds: WeakSet<Bullet> = new WeakSet();

    constructor(x: number, y: number, parent: PIXI.Container) {
        // Footprint reaktora: 80 wide × 120 tall (cylinder pionowo). x,y = top-left corner.
        this.x = x;
        this.y = y;
        this.w = 80;
        this.h = 120;

        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        // zIndex base = y + h (matches CyberBuilding wzorzec dla pseudo-3D depth sorting)
        this.container.zIndex = y + this.h;
        this.container.sortableChildren = true;
        parent.addChild(this.container);

        this.haloGfx = new PIXI.Graphics();
        this.haloGfx.zIndex = -1;
        this.baseGfx = new PIXI.Graphics();
        this.baseGfx.zIndex = 0;
        this.glassGfx = new PIXI.Graphics();
        this.glassGfx.zIndex = 1;
        this.sludgeGfx = new PIXI.Graphics();
        this.sludgeGfx.zIndex = 2;
        // v0.52.0 polish #1: baseFrontGfx zIndex 4 — przykrywa płaski dół glass+sludge
        // "przednia warga" base z curve. Bez tego glass.drawRect(W, glassH) ucina elipsę
        // dolnej bazy w idealnej poziomej linii = niszczy iluzję 2.5D.
        this.baseFrontGfx = new PIXI.Graphics();
        this.baseFrontGfx.zIndex = 4;
        this.capGfx = new PIXI.Graphics();
        this.capGfx.zIndex = 3;
        this.steamGfx = new PIXI.Graphics();
        this.steamGfx.zIndex = 250; // nad budynkami, pod HUD
        this.container.addChild(this.haloGfx);
        this.container.addChild(this.baseGfx);
        this.container.addChild(this.glassGfx);
        this.container.addChild(this.sludgeGfx);
        this.container.addChild(this.capGfx);
        this.container.addChild(this.baseFrontGfx);
        this.container.addChild(this.steamGfx);

        // Holo warning text (hidden by default, visible only podczas HIT state).
        // v0.52.x i18n: label z 'reactor.pressureSpike' (PL/EN w src/i18n/translations).
        this.warningText = new PIXI.Text(t('reactor.pressureSpike'), {
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 'bold',
            fill: COLOR_WARNING,
            stroke: 0x000000,
            strokeThickness: 2,
            letterSpacing: 1,
        });
        this.warningText.anchor.set(0.5, 1.0);
        this.warningText.x = this.w / 2;
        this.warningText.y = -8;
        this.warningText.zIndex = 300;
        this.warningText.alpha = 0;
        this.container.addChild(this.warningText);

        this.initBubbles();
        this.drawStaticLayers();
    }

    private initBubbles(): void {
        // v0.52.0 2.5D fix: TWA warstwy bubble dla depth illusion w cylindrze:
        // BG (background) = mniejsze, ciemniejsze, "głębiej" w cylindrze (alpha ~0.5).
        // FG (foreground) = większe, jasne, bliżej "przedu" szkła (alpha 0.9).
        // Dwie warstwy stwarzają iluzję 3D objętości zamiast płaskiego paska.
        const bgDefs: Array<[number, number, number, number]> = [
            // relX (-1 to 1), baseY (% h), radius, speed
            [-0.5, 0.35, 2.5, 0.7],
            [0.45, 0.62, 3.0, 0.85],
            [-0.1, 0.80, 2.0, 1.1],
            [0.2, 0.48, 2.6, 0.95],
        ];
        const fgDefs: Array<[number, number, number, number]> = [
            [-0.3, 0.42, 5.0, 1.0],
            [0.25, 0.55, 5.5, 0.85],
            [-0.15, 0.75, 4.0, 1.2],
            [0.35, 0.30, 4.5, 0.95],
        ];
        for (const [rx, by, r, s] of bgDefs) {
            this.bubbles.push({
                relX: rx, baseY: by * this.h, radius: r,
                phase: Math.random() * Math.PI * 2, speed: s, depth: 'bg',
                wasNearSurface: false,
            });
        }
        for (const [rx, by, r, s] of fgDefs) {
            this.bubbles.push({
                relX: rx, baseY: by * this.h, radius: r,
                phase: Math.random() * Math.PI * 2, speed: s, depth: 'fg',
                wasNearSurface: false,
            });
        }
    }

    /**
     * Static art baked into baseGfx + capGfx + haloGfx — drawn once w constructor.
     *
     * v0.52.0 2.5D depth overhaul: zamiast płaskich prostokątów uzywamy elliptical
     * perspective (top ellipse + side curves + cast shadow elliptical) zeby cylinder
     * wyglądał jak 3D obiekt widziany z lekko góry (top-down 2.5D), nie jak placek.
     */
    private drawStaticLayers(): void {
        const W = this.w;
        const H = this.h;
        const cx = W / 2;
        const capH = 14;
        const baseH = 18;
        const topEllipseRy = 7; // perspective compression: top ellipse ma height 14px (rY=7)
        const botEllipseRy = 8;

        // ============ HALO (elliptical, kompresowany dla top-down view) ============
        // Halo jest częściowo statyczne (radial gradient pozycja) ale alpha pulsuje w update.
        // Ellipsa kompresowana na Y dla iluzji top-down perspective (krąg na ziemi z góry = ellipsa).
        // v0.52.0 polish #5: centrum halo na geometric center cylindra (H*0.50).
        // v0.52.x perceptual tune: H*0.42 (~10px w górę). Matematycznie H*0.50 to dokladny
        // geometric center, ALE wizualnie dolne halo widac w pelni (nic go nie zaslania),
        // a gorne jest "schowane" za cylinder body (halo ma zIndex -1). Przesuniecie centrum
        // wyzej percepcyjnie zrownuje glow gora vs dol = wyglada jak neon emanujacy z reaktora,
        // nie "cylinder w gornej czesci owalu".
        const haloCenterY = H * 1;
        this.haloGfx.beginFill(COLOR_HALO, 0.32);
        this.haloGfx.drawEllipse(cx, haloCenterY, W * 1.5, W * 1.15);
        this.haloGfx.endFill();
        this.haloGfx.beginFill(COLOR_HALO, 0.20);
        this.haloGfx.drawEllipse(cx, haloCenterY, W * 1.1, W * 0.85);
        this.haloGfx.endFill();
        this.haloGfx.beginFill(COLOR_HALO, 0.14);
        this.haloGfx.drawEllipse(cx, haloCenterY, W * 0.75, W * 0.58);
        this.haloGfx.endFill();

        // ============ CAST SHADOW (eliptyczny, offset right-down dla light upper-left) ============
        // Shadow rzucany przez cylinder na ziemi. Offset (+4, +H+8) dla light direction upper-left.
        // 2 warstwy alpha = soft edge cienia.
        // RYSOWANE w baseGfx (zIndex 0) — pod glass.
        this.baseGfx.beginFill(0x000000, 0.45);
        this.baseGfx.drawEllipse(cx + 5, H + 6, W * 0.62, 11);
        this.baseGfx.endFill();
        this.baseGfx.beginFill(0x000000, 0.25);
        this.baseGfx.drawEllipse(cx + 7, H + 7, W * 0.78, 14);
        this.baseGfx.endFill();

        // ============ TANK BASE BACK (cylindryczny dół widoczny ZA glass) ============
        // v0.52.0 polish #1: SPLIT base na 2 layery:
        //   - baseGfx (zIndex 0) — TYLNA ściana base + cast shadow (POD glass+sludge)
        //   - baseFrontGfx (zIndex 4) — PRZEDNIA warga base z curve + bolts (NAD glass+sludge)
        // Bez tego splita prostokątne dno szkła (glass.drawRect) ucinało elipsę bazy w prostą
        // poziomą linię = niszczyło iluzję 2.5D. Teraz front-lip przykrywa płaski dół szkła.
        const baseY = H - baseH;
        // Tylko TYLNA górna część base (back wall, widoczna przez przezroczyste szkło u dołu)
        // Side gradient lighting: 3 stripes dla cylindryczności
        this.baseGfx.beginFill(0x3a3a47, 1); // lewy (jasniejszy) = upper-left light
        this.baseGfx.drawRect(-4, baseY, W * 0.35 + 4, baseH * 0.55);
        this.baseGfx.endFill();
        this.baseGfx.beginFill(COLOR_METAL_DARK, 1); // środek
        this.baseGfx.drawRect(W * 0.35 - 4, baseY, W * 0.35 + 8, baseH * 0.55);
        this.baseGfx.endFill();
        this.baseGfx.beginFill(0x1c1c25, 1); // prawy (ciemniejszy) = away from light
        this.baseGfx.drawRect(W * 0.70, baseY, W * 0.30 + 4, baseH * 0.55);
        this.baseGfx.endFill();

        // ============ TANK BASE FRONT (przednia warga z curve - NAD glass+sludge) ============
        // Ten gfx ma zIndex 4 — przykrywa płaski dolny rectangle glass+sludge swoja curve.
        // Iluzja: cylinder ma realny dół zaokrąglony przez perspective.
        const frontTopY = baseY + baseH * 0.55; // gdzie zaczyna się przednia warga
        const frontH = baseH * 0.45 + 4; // overlap +4 dla bezpieczeństwa
        // Front body (3 stripes gradient identyczny z back)
        this.baseFrontGfx.beginFill(0x3a3a47, 1);
        this.baseFrontGfx.drawRect(-4, frontTopY, W * 0.35 + 4, frontH);
        this.baseFrontGfx.endFill();
        this.baseFrontGfx.beginFill(COLOR_METAL_DARK, 1);
        this.baseFrontGfx.drawRect(W * 0.35 - 4, frontTopY, W * 0.35 + 8, frontH);
        this.baseFrontGfx.endFill();
        this.baseFrontGfx.beginFill(0x1c1c25, 1);
        this.baseFrontGfx.drawRect(W * 0.70, frontTopY, W * 0.30 + 4, frontH);
        this.baseFrontGfx.endFill();
        // Top edge HIGHLIGHT — gdzie metal spotyka glass (visual seam, eye-catching curve)
        // To jest KLUCZOWY element — light catches the edge of cylindrical front-lip
        this.baseFrontGfx.lineStyle(1.5, 0x7a7a88, 0.95);
        this.baseFrontGfx.moveTo(-4, frontTopY);
        this.baseFrontGfx.lineTo(W + 4, frontTopY);
        this.baseFrontGfx.lineStyle(0);
        // Subtle inner shadow line (just below highlight) — depth detail
        this.baseFrontGfx.lineStyle(1, 0x0a0a14, 0.6);
        this.baseFrontGfx.moveTo(-4, frontTopY + 1.5);
        this.baseFrontGfx.lineTo(W + 4, frontTopY + 1.5);
        this.baseFrontGfx.lineStyle(0);
        // Bottom ellipse (front-visible part, na samym dole bazy)
        this.baseFrontGfx.beginFill(0x1a1a23, 1);
        this.baseFrontGfx.drawEllipse(cx, H, W / 2 + 4, botEllipseRy);
        this.baseFrontGfx.endFill();
        // Bolts z 3D shading (highlight upper-left, shadow lower-right per bolt)
        // Bolty są na PRZEDNIM front-lipie — visible nad glass.
        const baseBolts = [10, 28, 52, 70];
        const boltY = frontTopY + 5;
        for (const bx of baseBolts) {
            // Bolt shadow lower-right
            this.baseFrontGfx.beginFill(0x1a1a22, 0.85);
            this.baseFrontGfx.drawCircle(bx + 0.6, boltY + 0.6, 2.4);
            this.baseFrontGfx.endFill();
            // Bolt body
            this.baseFrontGfx.beginFill(0x5a5a68, 1);
            this.baseFrontGfx.drawCircle(bx, boltY, 2.0);
            this.baseFrontGfx.endFill();
            // Bolt highlight upper-left
            this.baseFrontGfx.beginFill(0x9a9aae, 1);
            this.baseFrontGfx.drawCircle(bx - 0.6, boltY - 0.6, 0.9);
            this.baseFrontGfx.endFill();
        }

        // ============ TOP CAP z 2.5D perspective ============
        // Cap = visible-from-above metal cylinder top. Składa się z:
        //   1) Side wall ring (rectangle z gradient curve lighting)
        //   2) Top ellipse (powierzchnia widziana z lekko góry = ellipsa)
        //   3) Inner rim highlight (krawędź gdzie cap dotyka glass)
        //   4) Bolts z 3D shading + dioda

        // Pipes drawn FIRST (under cap edge) — żeby flansze były widoczne za cylinder side
        this.drawPipeWithDepth(-26, 18, 26, 8, true);   // lewa rura (z flansza na lewym końcu)
        this.drawPipeWithDepth(W, 22, 26, 8, false);    // prawa rura

        // Side wall of cap — 3 stripes gradient (cylindryczne shading)
        this.capGfx.beginFill(0x3a3a47, 1); // lewy jasniejszy
        this.capGfx.drawRect(-3, topEllipseRy, W * 0.35 + 3, capH - topEllipseRy);
        this.capGfx.endFill();
        this.capGfx.beginFill(COLOR_METAL_DARK, 1); // środek
        this.capGfx.drawRect(W * 0.35 - 3, topEllipseRy, W * 0.35 + 6, capH - topEllipseRy);
        this.capGfx.endFill();
        this.capGfx.beginFill(0x1c1c25, 1); // prawy ciemniejszy
        this.capGfx.drawRect(W * 0.70, topEllipseRy, W * 0.30 + 3, capH - topEllipseRy);
        this.capGfx.endFill();

        // TOP ELLIPSE — top cap surface widziany z góry-skośnie
        // To jest KLUCZOWY element dla iluzji 2.5D — bez tego cylinder wygląda jak prostokąt
        this.capGfx.beginFill(0x2a2a35, 1);
        this.capGfx.drawEllipse(cx, topEllipseRy, W / 2 + 3, topEllipseRy);
        this.capGfx.endFill();
        // Top ellipse inner (jasniejsza) — symuluje "okrągłą metalową powierzchnię" odbijającą światło
        this.capGfx.beginFill(0x4a4a58, 1);
        this.capGfx.drawEllipse(cx, topEllipseRy, W / 2, topEllipseRy - 1);
        this.capGfx.endFill();
        // Top ellipse highlight (jeszcze jaśniejszy, mniejszy, offset upper-left = light direction)
        this.capGfx.beginFill(0x6a6a7a, 0.9);
        this.capGfx.drawEllipse(cx - 4, topEllipseRy - 1, W / 2 - 6, topEllipseRy - 3);
        this.capGfx.endFill();

        // Inner rim — krawędź gdzie cap spotyka glass (dark line for separation)
        this.capGfx.lineStyle(1.5, 0x0a0a12, 0.95);
        this.capGfx.drawEllipse(cx, capH, W / 2 + 3, topEllipseRy * 0.85);
        this.capGfx.lineStyle(0);

        // Bolts on top cap (z 3D shading like base bolts)
        const capBolts = [
            { x: 14, y: 4 }, { x: 30, y: 5 }, { x: 50, y: 5 }, { x: 66, y: 4 },
        ];
        for (const b of capBolts) {
            this.capGfx.beginFill(0x1a1a22, 0.85);
            this.capGfx.drawCircle(b.x + 0.5, b.y + 0.6, 2.2);
            this.capGfx.endFill();
            this.capGfx.beginFill(0x5a5a68, 1);
            this.capGfx.drawCircle(b.x, b.y, 1.8);
            this.capGfx.endFill();
            this.capGfx.beginFill(0x9a9aae, 1);
            this.capGfx.drawCircle(b.x - 0.5, b.y - 0.5, 0.8);
            this.capGfx.endFill();
        }

        // Czerwona dioda (status light) — pulsuje delikatnie ale to przez halo intensity zarazem
        this.capGfx.beginFill(0x661122, 1); // dark base ring
        this.capGfx.drawCircle(cx, 2, 2.8);
        this.capGfx.endFill();
        this.capGfx.beginFill(0xff2244, 1);
        this.capGfx.drawCircle(cx, 2, 2);
        this.capGfx.endFill();
        this.capGfx.beginFill(0xffffff, 0.8);
        this.capGfx.drawCircle(cx - 0.5, 1.5, 0.9);
        this.capGfx.endFill();
    }

    /**
     * Helper: rysuje zardzewiałą rurę z cylindrycznym gradient (top highlight, bottom shadow)
     * + flansza końcowa. Para czterolatek paramów określa: startX, startY, length, pipeHeight,
     * isLeftSide (czy flansza jest po lewej końcu czy prawym).
     */
    private drawPipeWithDepth(startX: number, startY: number, length: number, pipeH: number, isLeftSide: boolean): void {
        const g = this.capGfx;
        // Pipe body — 3 stripe gradient (top highlight, middle base, bottom shadow)
        // Pipe widziany z boku = cylinder horizontal, więc top jest jaśniejszy.
        const topStripeH = Math.max(2, pipeH * 0.3);
        const botStripeH = Math.max(2, pipeH * 0.3);
        // Bottom shadow (deepest)
        g.beginFill(0x2a1a0e, 1);
        g.drawRect(startX, startY + pipeH - botStripeH, length, botStripeH);
        g.endFill();
        // Mid (base rust color)
        g.beginFill(COLOR_METAL_RUST, 1);
        g.drawRect(startX, startY + topStripeH, length, pipeH - topStripeH - botStripeH);
        g.endFill();
        // Top highlight (jasniejszy rdza)
        g.beginFill(0x9c5a2e, 1);
        g.drawRect(startX, startY, length, topStripeH);
        g.endFill();

        // Rust spots — losowe ciemne plamy na środku rury
        g.beginFill(0x3a1f0e, 0.7);
        g.drawCircle(startX + length * 0.4, startY + pipeH * 0.55, 1.8);
        g.drawCircle(startX + length * 0.7, startY + pipeH * 0.45, 1.5);
        g.endFill();

        // Flansza (większy końcowy element rury - prostokąt + screws)
        const flangeX = isLeftSide ? startX - 4 : startX + length - 2;
        const flangeW = 6;
        const flangeY = startY - 2;
        const flangeH = pipeH + 4;
        // Flansza body z gradient
        g.beginFill(0x1a0e05, 1);
        g.drawRect(flangeX, flangeY + flangeH * 0.6, flangeW, flangeH * 0.4);
        g.endFill();
        g.beginFill(0x6b3a1f, 1);
        g.drawRect(flangeX, flangeY, flangeW, flangeH * 0.6);
        g.endFill();
        // 2 maly bolty na flange
        g.beginFill(0x2a1505, 1);
        g.drawCircle(flangeX + flangeW / 2, flangeY + 3, 1.2);
        g.drawCircle(flangeX + flangeW / 2, flangeY + flangeH - 3, 1.2);
        g.endFill();
        g.beginFill(0x8c5a2e, 1);
        g.drawCircle(flangeX + flangeW / 2 - 0.3, flangeY + 2.7, 0.5);
        g.drawCircle(flangeX + flangeW / 2 - 0.3, flangeY + flangeH - 3.3, 0.5);
        g.endFill();
    }

    /**
     * Animated glass + sludge layers — wolane per-frame z update().
     *
     * v0.52.0 2.5D depth overhaul:
     *   - Glass body: 3-stripe gradient (lewa jasna / środek base / prawa ciemna) symuluje cylindryczną krzywiznę
     *   - Sludge surface: top ellipse (powierzchnia szlamu widziana z lekko góry)
     *   - Reinforcement rings: elliptical łuki zamiast prostych linii — KLUCZOWY element dla iluzji 2.5D
     *   - Bubbles: 2 warstwy (bg dim + fg vibrant) dla głębi cylindra
     *   - Glass left rim highlight (curve): pionowy jasny pas po lewej krawędzi
     */
    private drawAnimatedLayers(): void {
        const W = this.w;
        const H = this.h;
        const cx = W / 2;
        const capH = 14;
        const baseH = 18;
        const glassTop = capH;
        const glassBottom = H - baseH;
        const glassH = glassBottom - glassTop;
        const sludgeRingRy = 4; // perspective compression dla sludge surface ellipse

        // ============ SLUDGE INTERIOR (gradient background + 2-layer bubbles) ============
        this.sludgeGfx.clear();

        // Sludge background — 3 stripes (lewy jasniejszy, środek base, prawy ciemniejszy)
        // Stwarza iluzję cylindrycznej krzywizny (light from upper-left)
        const sludgeBodyTop = glassTop + 5;
        const sludgeBodyH = glassH - 8;
        this.sludgeGfx.beginFill(0xcc1a77, 0.95); // lewy jasniejszy róż
        this.sludgeGfx.drawRect(4, sludgeBodyTop, W * 0.35, sludgeBodyH);
        this.sludgeGfx.endFill();
        this.sludgeGfx.beginFill(COLOR_SLUDGE_DARK, 0.95); // środek
        this.sludgeGfx.drawRect(4 + W * 0.35, sludgeBodyTop, W * 0.30, sludgeBodyH);
        this.sludgeGfx.endFill();
        this.sludgeGfx.beginFill(0x6a0e44, 0.95); // prawy ciemniejszy (deeper shadow)
        this.sludgeGfx.drawRect(4 + W * 0.65, sludgeBodyTop, W * 0.35 - 8, sludgeBodyH);
        this.sludgeGfx.endFill();

        // BG bubbles layer (dim, smaller, "głębiej") — rysowane PRZED fg dla z-order
        const speedMult = this.isPlayerNear ? 2.0 : 1.0;
        for (const b of this.bubbles) {
            if (b.depth !== 'bg') continue;
            const yOsc = Math.sin(this.animTime * b.speed * speedMult + b.phase) * 11;
            const bx = cx + b.relX * (W * 0.32);
            const by = glassTop + b.baseY * (glassH / H) * 0.85 + yOsc;
            // Dim outer
            this.sludgeGfx.beginFill(COLOR_SLUDGE_BRIGHT, 0.45);
            this.sludgeGfx.drawCircle(bx, by, b.radius);
            this.sludgeGfx.endFill();
            // Dim highlight upper-left
            this.sludgeGfx.beginFill(0xffaadd, 0.30);
            this.sludgeGfx.drawCircle(bx - b.radius * 0.3, by - b.radius * 0.3, b.radius * 0.4);
            this.sludgeGfx.endFill();
        }

        // FG bubbles layer (vibrant, larger, "blizej" gracza)
        // v0.52.0 polish #4: pop effect — detect gdy FG bubble osiąga peak top of sinusoid
        // (czyli "uderza" w powierzchnię szlamu). Spawn ephemeral pop ring na sludge surface.
        // wasNearSurface flag zapobiega multi-trigger gdy bubble jest w peak zone przez kilka klatek.
        const POP_TRIGGER_YOSC = -12; // yOsc poniżej tego = blisko surface (sinusoid peak top)
        const sludgeSurfaceY = glassTop + 4; // gdzie rysujemy surface ellipse
        for (const b of this.bubbles) {
            if (b.depth !== 'fg') continue;
            const yOsc = Math.sin(this.animTime * b.speed * speedMult + b.phase) * 14;
            const bx = cx + b.relX * (W * 0.32);
            const by = glassTop + b.baseY * (glassH / H) * 0.85 + yOsc;
            // Pop trigger: bubble osiągnął peak top (yOsc near minimum = top of sinusoid)
            const nearSurface = yOsc < POP_TRIGGER_YOSC;
            if (nearSurface && !b.wasNearSurface) {
                // Spawn ephemeral pop ring na surface w pozycji bubble.x
                this.surfacePopRings.push({
                    x: bx,
                    age: 0,
                    maxAge: 18, // ~0.3s @ 60fps
                    initialRadius: b.radius * 0.9,
                });
            }
            b.wasNearSurface = nearSurface;

            // Outer bright rim
            this.sludgeGfx.beginFill(COLOR_SLUDGE_BRIGHT, 0.95);
            this.sludgeGfx.drawCircle(bx, by, b.radius);
            this.sludgeGfx.endFill();
            // Inner highlight upper-left (specular)
            this.sludgeGfx.beginFill(0xffffff, 0.65);
            this.sludgeGfx.drawCircle(bx - b.radius * 0.35, by - b.radius * 0.35, b.radius * 0.42);
            this.sludgeGfx.endFill();
            // Mini secondary highlight (mniejszy, jaśniejszy = "wet" look)
            this.sludgeGfx.beginFill(0xffffff, 0.9);
            this.sludgeGfx.drawCircle(bx - b.radius * 0.45, by - b.radius * 0.45, b.radius * 0.18);
            this.sludgeGfx.endFill();
        }

        // SLUDGE TOP SURFACE — eliptyczna powierzchnia szlamu (KLUCZOWY element 2.5D)
        // v0.52.0 polish #3 (kinetic juice): podczas HIT state surface trzęsie się
        // od shock wave pocisku. Losowy jitter ±1.5px na Y axis przez czas trwania flash.
        const hitJitter = this.hitFlashTimer > 0 ? (Math.random() - 0.5) * 3 : 0;
        const rippleOscY = Math.sin(this.animTime * 3) * 0.6;
        const surfaceY = sludgeSurfaceY + rippleOscY + hitJitter;
        // Dark base ellipse (tlo powierzchni)
        this.sludgeGfx.beginFill(COLOR_SLUDGE_DARK, 1);
        this.sludgeGfx.drawEllipse(cx, surfaceY, W / 2 - 3, sludgeRingRy);
        this.sludgeGfx.endFill();
        // Bright top (powierzchnia odbija swiatlo z gory)
        this.sludgeGfx.beginFill(COLOR_SLUDGE_BRIGHT, 0.85);
        this.sludgeGfx.drawEllipse(cx, surfaceY, W / 2 - 4, sludgeRingRy - 1);
        this.sludgeGfx.endFill();
        // Glossy specular highlight (left-shifted, smaller)
        this.sludgeGfx.beginFill(0xffccee, 0.65);
        this.sludgeGfx.drawEllipse(cx - 6, surfaceY - 1, W / 3, sludgeRingRy - 2);
        this.sludgeGfx.endFill();
        // Ripple rings (animowane subtle waves na powierzchni)
        const rippleAlpha = 0.35 + 0.15 * Math.sin(this.animTime * 4);
        this.sludgeGfx.lineStyle(1, 0xffaadd, rippleAlpha);
        this.sludgeGfx.drawEllipse(cx, surfaceY, W / 2 - 6, sludgeRingRy - 1.5);
        this.sludgeGfx.lineStyle(0);

        // v0.52.0 polish #4: render aktywne pop rings na sludge surface
        // Każdy ring rozprzestrzenia się i fade out przez maxAge frames.
        for (let i = this.surfacePopRings.length - 1; i >= 0; i--) {
            const ring = this.surfacePopRings[i];
            ring.age++;
            if (ring.age >= ring.maxAge) {
                this.surfacePopRings.splice(i, 1);
                continue;
            }
            const t = ring.age / ring.maxAge; // 0 → 1
            const ringRadiusX = ring.initialRadius + t * 8; // grows from initialRadius to +8
            const ringRadiusY = (sludgeRingRy * 0.6) + t * 2;
            const alpha = (1 - t) * 0.85; // fade out
            this.sludgeGfx.lineStyle(1.5, 0xffeefa, alpha);
            this.sludgeGfx.drawEllipse(ring.x, surfaceY, ringRadiusX, ringRadiusY);
            // Drugi pierscien jasniejszy (specular peak)
            if (t < 0.5) {
                this.sludgeGfx.lineStyle(0.8, 0xffffff, alpha * 0.7);
                this.sludgeGfx.drawEllipse(ring.x, surfaceY, ringRadiusX * 0.7, ringRadiusY * 0.6);
            }
        }
        this.sludgeGfx.lineStyle(0);

        // ============ GLASS CYLINDER z 2.5D depth ============
        this.glassGfx.clear();
        const glassAlpha = this.hitFlashTimer > 0 ? 0.55 : 0.18;
        const glassFillColor = this.hitFlashTimer > 24 ? 0xffffff : COLOR_GLASS_TINT;

        // Glass body — 3 vertical stripes z różnym alpha (cylindryczne shading)
        // Lewa: jasniejsza (light upper-left odbija się od curve)
        // Środek: minimalna alpha (najwięcej widać sludge przez glass)
        // Prawa: ciemniejsza (deeper glass, away from light)
        this.glassGfx.beginFill(glassFillColor, glassAlpha + 0.10);
        this.glassGfx.drawRect(0, glassTop, W * 0.20, glassH);
        this.glassGfx.endFill();
        this.glassGfx.beginFill(glassFillColor, glassAlpha);
        this.glassGfx.drawRect(W * 0.20, glassTop, W * 0.60, glassH);
        this.glassGfx.endFill();
        this.glassGfx.beginFill(0x0a1a2a, glassAlpha + 0.20);
        this.glassGfx.drawRect(W * 0.80, glassTop, W * 0.20, glassH);
        this.glassGfx.endFill();

        // LEFT RIM HIGHLIGHT (bright vertical curve)
        // To jest największy wkład do iluzji "curve" — jasny pionowy pas na lewej krawędzi
        // sugeruje że szkło zakrzywia się (light reflection on curved glass surface).
        this.glassGfx.beginFill(0xffffff, 0.45);
        this.glassGfx.drawRect(1, glassTop + 4, 3, glassH - 8);
        this.glassGfx.endFill();
        this.glassGfx.beginFill(0xffffff, 0.75);
        this.glassGfx.drawRect(2, glassTop + 8, 1.5, glassH - 16);
        this.glassGfx.endFill();

        // RIGHT RIM DARK (deeper shadow on glass right side, suggests curve away)
        this.glassGfx.beginFill(0x000000, 0.30);
        this.glassGfx.drawRect(W - 4, glassTop + 4, 3, glassH - 8);
        this.glassGfx.endFill();

        // REINFORCEMENT RINGS — eliptyczne łuki (KLUCZOWE dla 2.5D iluzji)
        // 4 ringi rozłożone na wysokości cylindra. Każdy = ellipse z wypukłością do dołu
        // (jak płaska elipsa widziana z lekkiej góry — ring obejmuje cylinder po obwodzie).
        const ringYs = [0.20, 0.42, 0.65, 0.88];
        for (const ry of ringYs) {
            const y = glassTop + glassH * ry;
            // Ring shadow (darker underneath)
            this.glassGfx.lineStyle(3, 0x0a0a14, 0.95);
            this.glassGfx.drawEllipse(cx, y + 1.5, W / 2 + 1, 3);
            // Ring body (metal dark)
            this.glassGfx.lineStyle(2.5, COLOR_METAL_DARK, 1);
            this.glassGfx.drawEllipse(cx, y, W / 2 + 1, 3);
            // Ring highlight (top of ring, gdzie light hits)
            this.glassGfx.lineStyle(0.8, 0x6a6a78, 1);
            this.glassGfx.drawEllipse(cx, y - 0.5, W / 2 - 1, 2.5);
        }
        this.glassGfx.lineStyle(0);

        // Glass outer border (heavy frame around cylinder — wysokość = glass height)
        this.glassGfx.lineStyle(1.8, COLOR_METAL_DARK, 1);
        this.glassGfx.drawRect(0, glassTop, W, glassH);
        this.glassGfx.lineStyle(0);
    }

    /**
     * Halo glow pulse + alpha animation. Wolane per-frame.
     * Pulse 2 Hz w idle, 3.5 Hz w excited state.
     */
    private updateHaloPulse(): void {
        const baseFreq = this.isPlayerNear ? 3.5 : 2.0;
        const pulse = 0.7 + 0.3 * Math.sin(this.animTime * baseFreq);
        // Excited state = jasniejsze halo overall
        const intensity = this.isPlayerNear ? 1.15 : 0.85;
        this.haloGfx.alpha = pulse * intensity;
    }

    /**
     * Spawn 8-10 steam particles z miejsca uderzenia. Each particle
     * leci w gore z malym horizontal jitter, fade out przez ~1s.
     */
    private spawnSteamBurst(originX: number, originY: number): void {
        const count = 8 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2; // mostly up, jitter ±35°
            const speed = 0.6 + Math.random() * 0.8;
            this.steamParticles.push({
                x: originX + (Math.random() - 0.5) * 8,
                y: originY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                age: 0,
                maxAge: 50 + Math.random() * 20, // ~0.8-1.2s
                size: 3 + Math.random() * 3,
            });
        }
    }

    /**
     * v0.52.0 polish #6: passive ambient steam wisp — pojedyncza cząsteczka unoszącej się
     * pary z top cap reaktora. Mniejsza i delikatniejsza niż hit burst:
     *   - size 1.8-3.0 (vs hit 3-6)
     *   - vy slower (-0.3 do -0.6 vs hit -0.6 do -1.4)
     *   - maxAge dłuższy (~1.5-2.5s vs hit ~0.8-1.2s, "leniwa" para)
     *   - spawn point: 3 lokalizacje na top cap (lewa krawędź, środek przy diodzie, prawa krawędź)
     *
     * Steam color logic w updateSteam() działa identycznie — wisps chwytają neon halo
     * w hot phase, stygną do szarości. Dla passive to wyglada jak "ciągły dym znad
     * pulsującego źródła ciepła".
     */
    private spawnPassiveSteamWisp(): void {
        const W = this.w;
        // 3 możliwe spawn points na top cap (z lekkim jitter):
        //   - lewa krawędź (przy lewej rurze)
        //   - środek (przy czerwonej diodzie)
        //   - prawa krawędź (przy prawej rurze)
        const spawnPoints = [
            { x: W * 0.18, y: 2 },  // lewa
            { x: W * 0.50, y: 0 },  // środek (diodzie)
            { x: W * 0.82, y: 2 },  // prawa
        ];
        const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5; // mostly up, narrow jitter ±15°
        const speed = 0.3 + Math.random() * 0.3; // wolniejszy niż hit burst
        this.steamParticles.push({
            x: sp.x + (Math.random() - 0.5) * 3,
            y: sp.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            age: 0,
            maxAge: 90 + Math.random() * 60, // ~1.5-2.5s (leniwa, dłużej się unosi)
            size: 1.8 + Math.random() * 1.2, // mniejsze (1.8-3.0)
        });
    }

    /**
     * Update + render steam particles. Particles outside lifetime removed.
     *
     * v0.52.0 polish #2 (ambient light pickup): para chwyta neon halo color w hot phase
     * (pierwsze ~40% życia), potem stygnie i przechodzi w szarość. Symuluje color bleeding
     * z różowego pulsującego reaktora — para nad cyberpunk environment musi chwytać
     * neon ambient, nie być sztywno szara.
     */
    private updateSteam(delta: number): void {
        this.steamGfx.clear();
        for (let i = this.steamParticles.length - 1; i >= 0; i--) {
            const p = this.steamParticles[i];
            p.age += delta;
            if (p.age >= p.maxAge) {
                this.steamParticles.splice(i, 1);
                continue;
            }
            // Movement
            p.x += p.vx * delta;
            p.y += p.vy * delta;
            // Drift expansion + slow down
            p.vy *= 0.985;
            p.vx *= 0.97;
            // Size grows slightly as it rises
            const lifeT = p.age / p.maxAge;
            const currentSize = p.size * (1 + lifeT * 0.8);
            const alpha = (1 - lifeT) * 0.78;
            // Color: hot phase (pierwsze 40% życia) chwyta neon halo color (różowy)
            // Cool phase (60%+) stygnie do szarości. Smooth transition w środku.
            let color: number;
            if (lifeT < 0.25) {
                color = COLOR_HALO; // peak hot — wściekle różowy
            } else if (lifeT < 0.55) {
                // Interpolacja różowy → szary (manual lerp na RGB channels)
                const t = (lifeT - 0.25) / 0.30;
                // COLOR_HALO = 0xff44aa → szary 0xcccccc
                const r = Math.round(0xff * (1 - t) + 0xcc * t);
                const g = Math.round(0x44 * (1 - t) + 0xcc * t);
                const b = Math.round(0xaa * (1 - t) + 0xcc * t);
                color = (r << 16) | (g << 8) | b;
            } else {
                color = 0xcccccc; // cooled — szara para
            }
            this.steamGfx.beginFill(color, alpha);
            this.steamGfx.drawCircle(p.x, p.y, currentSize);
            this.steamGfx.endFill();
        }
    }

    /**
     * Hit detection — sprawdza bullets w proximity i triggeruje HIT state.
     * Per-frame check ~5 bullets × 1 reactor = znikomy koszt.
     */
    private checkBulletHits(bullets: Bullet[]): void {
        // World coordinates reactora (container.x = this.x, footprint w lokalnym 0,0 → W,H)
        const worldL = this.x;
        const worldR = this.x + this.w;
        const worldT = this.y;
        const worldB = this.y + this.h;
        for (const b of bullets) {
            if (!b.active) continue;
            if (this.hitBulletIds.has(b)) continue;
            // AABB check (bullet point-ish, użyć radius opcjonalnie)
            const br = b.radius ?? 4;
            if (b.x + br < worldL || b.x - br > worldR) continue;
            if (b.y + br < worldT || b.y - br > worldB) continue;
            // HIT
            this.hitBulletIds.add(b);
            this.triggerHit(b.x - this.x, b.y - this.y);
        }
    }

    /**
     * Trigger HIT state: timer reset, steam burst, holo warning visible.
     * localHitX/Y są w local container coords (0,0 = top-left reaktora).
     */
    private triggerHit(localHitX: number, localHitY: number): void {
        this.hitFlashTimer = HIT_FLASH_DURATION;
        this.lastHitX = localHitX;
        this.lastHitY = localHitY;
        this.spawnSteamBurst(localHitX, localHitY);
    }

    /**
     * Update warning text visibility/animation based on hitFlashTimer state.
     */
    private updateWarningText(): void {
        if (this.hitFlashTimer > 0) {
            // Fade in szybko (first 6 frames), trzymaj, fade out (last 12 frames)
            const t = this.hitFlashTimer / HIT_FLASH_DURATION;
            let alpha: number;
            if (t > 0.83) {        // first frames: fade in
                alpha = (1 - t) / 0.17;
            } else if (t > 0.33) { // middle: full visible
                alpha = 1;
            } else {                // last frames: fade out
                alpha = t / 0.33;
            }
            this.warningText.alpha = alpha;
            // Flicker effect — co 3 frame przyciemnij
            if (this.hitFlashTimer % 3 === 0) {
                this.warningText.alpha *= 0.6;
            }
            // Float up effect — tekst delikatnie unosi sie
            this.warningText.y = -8 - (1 - t) * 6;
        } else {
            this.warningText.alpha = 0;
        }
    }

    /**
     * Public update — ICollidable signature + opcjonalny bullets array dla hit detection.
     * Wolane z main.ts ticker: reactor.update(camera.x, camera.y, viewW, viewH, bullets).
     *
     * Note: ICollidable.update signature to (camX, camY, viewW, viewH). Bullets to extra
     * parametr opcjonalny — jezeli main.ts wola standardowo z buildings.forEach(b => b.update(...)),
     * hit detection nie zadziala (bullets undefined). Trzeba wolac osobnym loopem (analog crates).
     */
    update(_camX: number, _camY: number, _viewW: number, _viewH: number, bullets?: Bullet[]): void {
        this.animTime += 0.016; // ~60fps assumption

        // Tick down hit timer
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer--;
        }

        // v0.52.0 polish #6: passive ambient steam — spawn wisps periodically.
        // EXCITED state = krótszy cooldown (gracz blisko → "bulgotanie intensywniejsze").
        // IDLE = wolniejsze. Random jitter na cooldown żeby nie wyglądało metronomicznie.
        this.passiveSteamCooldown--;
        if (this.passiveSteamCooldown <= 0) {
            this.spawnPassiveSteamWisp();
            // Cooldown reset: EXCITED 18-32 frames, IDLE 40-70 frames
            if (this.isPlayerNear) {
                this.passiveSteamCooldown = 18 + Math.floor(Math.random() * 14);
            } else {
                this.passiveSteamCooldown = 40 + Math.floor(Math.random() * 30);
            }
        }

        // Bullet hit detection (jezeli przekazane)
        if (bullets) {
            this.checkBulletHits(bullets);
        }

        // Re-render animated layers
        this.drawAnimatedLayers();
        this.updateHaloPulse();
        this.updateWarningText();
        this.updateSteam(1.0); // delta normalized to 1 (60fps assumption — matches animTime increment)
    }

    /**
     * Public API — wolane z main.ts gdy gracz jest w sasiedztwie. Zmienia animacje
     * na EXCITED tempo. Sprawdzane raz na frame w main.ts (1 reactor × 1 player check).
     */
    setPlayerNear(playerX: number, playerY: number): void {
        // Center reaktora w world coords
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;
        const dx = playerX - cx;
        const dy = playerY - cy;
        this.isPlayerNear = (dx * dx + dy * dy) < PROXIMITY_RADIUS_SQ;
    }

    /**
     * Cleanup — wolane gdy mapa jest niszczona (worldContainer.removeChildren).
     */
    destroy(): void {
        this.container.destroy({ children: true });
    }
}