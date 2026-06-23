import * as PIXI from 'pixi.js';

/**
 * Faza POLISH v2 — v0.52.0 — Cyberpunk Map Visual Upgrade — #1 of 3.
 *
 * NeonBillboard = duzy LED panel na fasadzie wiezowca, top-down view.
 * Renderowany jako PIXI.Container z 4 warstwami (sortableChildren):
 *   - groundTint  (zIndex -10): kolorowy radial pod billboardem (neon padajacy na ulice)
 *   - bgFrame     (zIndex   0): czarny LED panel + neonowa ramka + scanlines + zewn. halo
 *   - glowLayer   (zIndex   5): 3x text w glow color z grubym stroke (cheap bloom, BEZ filtra)
 *   - contentLayer(zIndex  10): 3x text w fill color (ostre litery na wierzchu)
 *
 * Trzy niezalezne animacje running concurrent (delta-based, nie Date.now()):
 *   1. Pulse alpha: sinus 0.88-1.0 z PULSE_PERIOD_MS (slow heartbeat)
 *   2. Content rotation: co CONTENT_ROTATION_MS fade-out -> swap -> fade-in (CONTENT_FADE_MS)
 *      - seed-based offset zapewnia ze rozne billboardy NIE rotuja w to samo
 *   3. Random flicker: szansa per frame, gasi container na FLICKER_FRAMES_DURATION (CRT vibe)
 *
 * Performance:
 *   - Zero PIXI.Filter (BlurFilter za drogi na mobile @ 6+ billboardow). Glow przez
 *     multi-layer text (jeden ostry, jeden gruby stroke + alpha — wyglada jak prawdziwy LED).
 *   - PIXI.Text x2 per linia x 3 linie = 6 textow per billboard. Statyczne fonty (Titan One).
 *   - groundTint i bgFrame to Graphics (one-shot render w konstruktorze + przy content swap).
 *   - sortableChildren=true na container (interna kolejnosc warstw, parent moze pomijac sort).
 *
 * Re-grywalnosc:
 *   - 6 wariantow BILLBOARD_CONTENTS losowanych przez seed % 6 startowo.
 *   - Rotation co 8s wybiera next index z offset `(current + 1 + seed%3)` -> kazdy billboard
 *     idzie wlasna sciezka przez warianty, ladne async vibe na ekranie.
 *   - Pozycje + rozmiary w CITY_BILLBOARDS_LAYOUT (CityMap.ts) — kotwiczone do fasad budynkow.
 *
 * Child-safety (9-12 lat):
 *   - Tylko pozytywne motywy: ramen 🍜, neko-cat, robo-mascot, Brawl Tanks self-promo, turbo chip.
 *   - Brak agresywnych hasel ("kill", "die", broni, alkoholu).
 *   - Flicker max 100ms (6 klatek @ 60fps). WCAG seizure threshold to 3 flashes/sec
 *     o duzym kontrascie — nasz flicker to 1 epizod na ~11s, znacznie ponizej progu.
 *
 * Integracja:
 *   - Spawn: w main.ts pod `config.map === 'city'`, po CITY_BUILDINGS_LAYOUT.forEach.
 *     `billboards = CITY_BILLBOARDS_LAYOUT.map(b => new NeonBillboard(...))`
 *   - Update: w tickerze `billboards.forEach(b => b.update(delta))`
 *   - Cleanup: w startGame() przy mapy switch `billboards.forEach(b => b.destroy())`
 *
 * v0.53 expansion hooks (do rozwazenia):
 *   - reactToMegaBoss(): po mega-boss spawnie wszystkie billboardy migaja red 2s (foreshadowing)
 *   - tank-shoot reaction: kula trafia billboard -> 0.5s glitch frame
 *   - mobile perf: jezeli FPS < 45, ograniczyc do 4 instancji + wylaczyc flicker
 */

const FONT_FAMILY = 'Titan One';

interface BillboardContent {
    readonly lines: readonly [string, string, string];
    readonly fillColors: readonly [number, number, number];
    readonly glowColor: number;
}

/**
 * 6 wariantow contentu. Kazdy z 3 liniami tekstu, 3 fill kolorami (per linia)
 * i 1 glow color (ramka + ground tint + tylna warstwa text).
 *
 * Konwencja kolorow: jaskrawe neony cyberpunkowe — magenta, cyan, electric pink,
 * neon green, electric yellow. Unikamy pure red (zbyt agresywny) i ciemnych odcieni
 * (zgina sie z czarnym BG panelu).
 */
const BILLBOARD_CONTENTS: readonly BillboardContent[] = [
    {
        lines: ['CYBER', 'RAMEN', '4 U 🍜'],
        fillColors: [0xff66ff, 0x66ffff, 0xffff66],
        glowColor: 0xff00ff,
    },
    {
        lines: ['BRAWL', 'TANKS', 'S2 🤖'],
        fillColors: [0x66ffff, 0xffff66, 0xff66ff],
        glowColor: 0x00ffff,
    },
    {
        lines: ['MEGA', 'BOSS!', 'BEWARE'],
        fillColors: [0xff8866, 0xff9966, 0xffcc66],
        glowColor: 0xff3300,
    },
    {
        lines: ['NEKO', 'POWER', '⚡ 99%'],
        fillColors: [0xff99cc, 0x99ffff, 0xffff99],
        glowColor: 0xff33aa,
    },
    {
        lines: ['TURBO', 'CHIP+', 'GO GO'],
        fillColors: [0x66ff66, 0x99ffcc, 0xffffff],
        glowColor: 0x00ff66,
    },
    {
        lines: ['NEON', 'CITY', '2099'],
        fillColors: [0xff66aa, 0xaa66ff, 0x66ffff],
        glowColor: 0xaa00ff,
    },
];

// === Tuning constants — single source of truth ===
const PULSE_PERIOD_MS = 1800;          // wolny puls neonu (~33 BPM, spokojny rytm)
const PULSE_MIN_ALPHA = 0.88;
const PULSE_MAX_ALPHA = 1.0;
const CONTENT_ROTATION_MS = 8000;      // zmiana contentu co 8s
const CONTENT_FADE_MS = 600;           // total fade (300ms out + 300ms in)
const FLICKER_CHANCE_PER_FRAME = 0.0015; // ~1 epizod na 11s @ 60fps
const FLICKER_FRAMES_DURATION = 6;     // ile klatek gaszone (~100ms)
const FLICKER_ALPHA = 0.25;
const GROUND_TINT_LAYERS = 5;
const GROUND_TINT_BASE_ALPHA = 0.14;
const GROUND_TINT_OFFSET_Y = 6;        // ile px ponizej dolnej krawedzi panelu

// PIXI ticker delta @ 60fps = 1.0 = 16.667ms
const MS_PER_FRAME_AT_60FPS = 16.667;

export class NeonBillboard {
    public container: PIXI.Container;
    private bgFrame: PIXI.Graphics;
    private groundTint: PIXI.Graphics;
    private contentLayer: PIXI.Container;
    private glowLayer: PIXI.Container;
    private texts: PIXI.Text[] = [];
    private glowTexts: PIXI.Text[] = [];

    private contentIndex: number;
    private elapsedMs: number = 0;
    private rotationTimerMs: number = 0;
    private fadeStateMs: number = 0;     // 0 = stable, >0 = mid-rotation
    private nextContentIndex: number = -1; // -1 = brak pending swap
    private contentSwappedThisFade: boolean = false;
    private flickerFramesLeft: number = 0;

    constructor(
        public readonly x: number,
        public readonly y: number,
        public readonly width: number,
        public readonly height: number,
        public readonly seed: number,
        public readonly parallaxFactor: number, // v0.52.0 fix: synchronizacja z dachem parent buildingu
        worldContainer: PIXI.Container,
    ) {
        this.contentIndex = seed % BILLBOARD_CONTENTS.length;
        // Stagger rotation timer — kazdy billboard zaczyna na innym etapie cyklu
        this.rotationTimerMs = (seed * 1373) % CONTENT_ROTATION_MS;

        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        // v0.52.0 fix #4: zIndex w roof tier (>5000) zeby billboard byl WYZEJ niz
        // wszystkie walls budynkow (ground tier <5000) ale w jednym poziomie z roofs.
        // CyberBuilding rozdzielilo walls/roof na osobne gfx (walls w [0,5000], roof
        // w [5000,10000]). Billboard musi byc w roof tier inaczej walls budynkow z
        // wiekszym y zaslaniaja billboard wizualnie ("dalszy ciemny" zaslania bliski
        // neonowy). Initial value tutaj = startowe przyblizenie, update() override.
        this.container.zIndex = 5000 + y + height + 100;
        this.container.sortableChildren = true;

        // 1. Ground tint (najnizej, pod fasada billboarda — kolorowe swiatlo na ulicy)
        this.groundTint = new PIXI.Graphics();
        this.groundTint.y = height + GROUND_TINT_OFFSET_Y;
        this.groundTint.zIndex = -10;
        this.renderGroundTint();
        this.container.addChild(this.groundTint);

        // 2. BG frame (czarny LED panel + neonowa ramka + scanlines + halo)
        this.bgFrame = new PIXI.Graphics();
        this.bgFrame.zIndex = 0;
        this.renderFrame();
        this.container.addChild(this.bgFrame);

        // 3. Glow layer (text w glow color, gruby stroke, semi-transparent — cheap bloom)
        this.glowLayer = new PIXI.Container();
        this.glowLayer.zIndex = 5;
        this.glowLayer.alpha = 0.55;
        this.container.addChild(this.glowLayer);

        // 4. Content layer (text w fill color, ostry — czytelnosc)
        this.contentLayer = new PIXI.Container();
        this.contentLayer.zIndex = 10;
        this.container.addChild(this.contentLayer);

        this.buildTextLayers();

        worldContainer.addChild(this.container);
    }

    private renderGroundTint(): void {
        const g = this.groundTint;
        g.clear();
        const c = BILLBOARD_CONTENTS[this.contentIndex].glowColor;
        // Squashed radial (top-down ground = elipsa szersza niz wyzsza)
        const centerX = this.width / 2;
        const baseRX = this.width * 0.75;
        const baseRY = 32;
        // Warstwy od najszerszej (najjasniejsza w centrum) do najmniejszej
        for (let i = GROUND_TINT_LAYERS - 1; i >= 0; i--) {
            const t = (i + 1) / GROUND_TINT_LAYERS;
            const alpha = GROUND_TINT_BASE_ALPHA * (1 - t * 0.82);
            g.beginFill(c, alpha);
            g.drawEllipse(centerX, 0, baseRX * t, baseRY * t);
            g.endFill();
        }
    }

    private renderFrame(): void {
        const g = this.bgFrame;
        g.clear();
        const glowColor = BILLBOARD_CONTENTS[this.contentIndex].glowColor;

        // Zewnetrzne halo (rozmyta otoczka 2px outside panelu)
        g.lineStyle(1, glowColor, 0.30);
        g.drawRoundedRect(-2, -2, this.width + 4, this.height + 4, 5);

        // Czarny LED panel (tlo)
        g.beginFill(0x0a0a14);
        g.lineStyle(0);
        g.drawRoundedRect(0, 0, this.width, this.height, 4);
        g.endFill();

        // Neonowa ramka (jasna, 2px)
        g.lineStyle(2, glowColor, 0.95);
        g.drawRoundedRect(0, 0, this.width, this.height, 4);

        // Scanlines (CRT effect, bardzo subtelnie)
        g.lineStyle(0.5, 0xffffff, 0.04);
        for (let yy = 4; yy < this.height - 2; yy += 3) {
            g.moveTo(3, yy);
            g.lineTo(this.width - 3, yy);
        }
    }

    private buildTextLayers(): void {
        // Cleanup poprzednich (przy content swap)
        for (const t of this.texts) t.destroy();
        for (const t of this.glowTexts) t.destroy();
        this.texts = [];
        this.glowTexts = [];
        this.contentLayer.removeChildren();
        this.glowLayer.removeChildren();

        const content = BILLBOARD_CONTENTS[this.contentIndex];
        const lineH = (this.height - 6) / 3;
        const fontSize = Math.max(10, Math.floor(lineH * 0.62));

        for (let i = 0; i < 3; i++) {
            const lineY = 3 + i * lineH + lineH / 2;

            // Glow text — gruby stroke w glow color, lekka transparentnosc (alpha layera = 0.55)
            const glowText = new PIXI.Text(content.lines[i], {
                fontFamily: FONT_FAMILY,
                fontSize: fontSize,
                fill: content.glowColor,
                stroke: content.glowColor,
                strokeThickness: 6,
                align: 'center',
            });
            glowText.anchor.set(0.5);
            glowText.x = this.width / 2;
            glowText.y = lineY;
            this.glowLayer.addChild(glowText);
            this.glowTexts.push(glowText);

            // Content text — ostry, fill color, czarny stroke dla kontrastu na LED panelu
            const text = new PIXI.Text(content.lines[i], {
                fontFamily: FONT_FAMILY,
                fontSize: fontSize,
                fill: content.fillColors[i],
                stroke: 0x000000,
                strokeThickness: 1.5,
                align: 'center',
            });
            text.anchor.set(0.5);
            text.x = this.width / 2;
            text.y = lineY;
            this.contentLayer.addChild(text);
            this.texts.push(text);
        }
    }

    /**
     * Update per-frame. delta = PIXI ticker delta (zwykle ~1.0 @ 60fps).
     *
     * v0.52.0 fix: Billboard musi dziedziczyc parallax od parent buildingu, bo
     * CyberBuilding.update() przesuwa dach budynku wzgledem kamery wzorem:
     *   ox = (x + w/2 - (camX + screenW/2)) * hF
     * Bez tego, billboard wisi w "rest position" (lewy gorny rog podstawy) a dach
     * plywa parallaxem na bok — billboard wyglada jakby byl POZA budynkiem.
     * Ten sam wzor parallax tutaj synchronizuje billboard z dachem.
     */
    update(delta: number, camX: number, camY: number, screenW: number, screenH: number): void {
        const deltaMs = delta * MS_PER_FRAME_AT_60FPS;
        this.elapsedMs += deltaMs;
        this.rotationTimerMs += deltaMs;

        // === Parallax — dziedziczone z parent buildingu, ten sam wzor co CyberBuilding ===
        const ox = (this.x + this.width / 2 - (camX + screenW / 2)) * this.parallaxFactor;
        const oy = (this.y + this.height / 2 - (camY + screenH / 2)) * this.parallaxFactor;
        this.container.x = this.x + ox;
        this.container.y = this.y + oy;
        // v0.52.0 fix #4: dynamic zIndex w roof tier 5000+ (parallax-aware).
        // Boost +100 = gwarancja na wierzchu host buildingu roof. Inne budynki blizsze
        // kamery (z wiekszym y_visual + 100) wciaz zaslania billboard intentionalnie.
        // Tier 5000+ zapewnia ze WALLS innych budynkow (tier <5000) nie zaslaniaja
        // billboardu.
        this.container.zIndex = 5000 + this.y + oy + this.height + 100;

        // === Animacja #1: Pulse alpha (sinusoidalnie) ===
        const pulsePhase = (this.elapsedMs % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
        const pulseAlpha = PULSE_MIN_ALPHA + (PULSE_MAX_ALPHA - PULSE_MIN_ALPHA)
            * (0.5 + 0.5 * Math.sin(pulsePhase * Math.PI * 2));

        // === Animacja #3: Random flicker (priorytet nad pulse) ===
        if (this.flickerFramesLeft > 0) {
            this.flickerFramesLeft--;
            this.container.alpha = FLICKER_ALPHA;
        } else if (this.fadeStateMs === 0 && Math.random() < FLICKER_CHANCE_PER_FRAME) {
            // Flicker tylko gdy NIE jestesmy w trakcie content rotation (dwa nakladajace
            // sie efekty = chaos wizualny)
            this.flickerFramesLeft = FLICKER_FRAMES_DURATION;
            this.container.alpha = FLICKER_ALPHA;
        } else {
            this.container.alpha = pulseAlpha;
        }

        // === Animacja #2: Content rotation (fade-out -> swap -> fade-in) ===
        if (this.fadeStateMs === 0 && this.rotationTimerMs >= CONTENT_ROTATION_MS) {
            // Trigger rotation start
            this.fadeStateMs = CONTENT_FADE_MS;
            this.contentSwappedThisFade = false;
            // Offset (seed % 3) + 1 zapewnia ze rozne billboardy nie zbiegaja sie
            // na tym samym contencie (kazdy ma wlasna sciezke przez 6 wariantow)
            this.nextContentIndex = (this.contentIndex + 1 + (this.seed % 3)) % BILLBOARD_CONTENTS.length;
            this.rotationTimerMs = 0;
        }

        if (this.fadeStateMs > 0) {
            this.fadeStateMs -= deltaMs;
            const halfFade = CONTENT_FADE_MS / 2;
            const remaining = Math.max(0, this.fadeStateMs);

            if (remaining > halfFade) {
                // Faza 1: fade-out (alpha 1 -> 0)
                const t = (remaining - halfFade) / halfFade;
                this.contentLayer.alpha = t;
                this.glowLayer.alpha = t * 0.55;
            } else {
                // Faza 2: swap content jezeli jeszcze nie + fade-in
                if (!this.contentSwappedThisFade && this.nextContentIndex !== -1) {
                    this.contentIndex = this.nextContentIndex;
                    this.nextContentIndex = -1;
                    this.contentSwappedThisFade = true;
                    this.renderFrame();
                    this.renderGroundTint();
                    this.buildTextLayers();
                }
                const t = 1 - remaining / halfFade;
                this.contentLayer.alpha = t;
                this.glowLayer.alpha = t * 0.55;
            }

            if (this.fadeStateMs <= 0) {
                this.fadeStateMs = 0;
                this.contentLayer.alpha = 1;
                this.glowLayer.alpha = 0.55;
            }
        }
    }

    destroy(): void {
        for (const t of this.texts) t.destroy();
        for (const t of this.glowTexts) t.destroy();
        this.texts = [];
        this.glowTexts = [];
        if (this.container.parent) {
            this.container.parent.removeChild(this.container);
        }
        this.container.destroy({ children: true });
    }
}