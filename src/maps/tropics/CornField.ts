import * as PIXI from 'pixi.js';

/**
 * v0.27.4 FAZA T2 — CORN FIELD (zastępca WheatField)
 *
 * Caribbean farmstead corn field — gęste, kwadratowe pole z rzędami kukurydzy.
 *
 * KLUCZOWE RÓŻNICE vs WheatField:
 *   1. Pole = PROSTOKĄT (w/h), nie elipsa
 *   2. Rośliny w GRID pattern (rzędy + kolumny, klasyczna farma)
 *   3. Każda roślina to indywidualny Sprite z zIndex = jej Y position
 *      → czołg WJEŻDŻA i rośliny które są niżej w 2D (przed nim) zasłaniają go
 *      = mechanika "schowania za kukurydzą" jak Brawl Stars bushes
 *   4. Żółta kolba kukurydzy = rozpoznawalność charakterystyki
 *   5. Wave wind sway (fala przechodzi przez pole)
 *
 * Mechanika gameplay:
 *   - Gracz w polu → stealth (10s, analog Oasis API)
 *   - isPointInside() → rectangle check (zamiast ellipse)
 *
 * Performance:
 *   - 3 współdzielone textury roślin (Sprite Stamping, generowane raz)
 *   - ~72 sprite'y per pole × 5 pól = ~360 sprite'ów total
 *   - Per-frame update: tylko skew (lekki) na sprite'ach + particles
 */

const COLORS = {
    // Łodyga
    stemDark:       0x1a3010,   // outline łodygi
    stemMid:        0x3a7028,   // główny kolor łodygi
    stemLight:      0x5fa83e,   // highlight łodygi
    // Liście
    leafDark:       0x2e5a20,   // ciemna zieleń liścia (outline)
    leafMid:        0x3a7028,   // główny kolor liścia
    leafLight:      0x5fa83e,   // highlight
    // Kolba (kluczowy element charakterystyki!)
    earOutline:     0x5a3a10,   // ciemny brązowy obrys kolby
    earYellow:      0xf4d460,   // główny żółty
    earLight:       0xfff5a0,   // jasne błysk
    earKernel:      0xa87810,   // ciemniejsze rządki ziaren
    silk:           0xc89858,   // włókna na czubku kolby
    // Gleba
    soilDark:       0x4a3010,   // ciemna zaorana ziemia
    soilMid:        0x6a4a20,   // zwykła gleba
    soilLight:      0x8a6830,   // jasniejsze grudki
    // Particles
    pollen:         0xfff5a0,   // żółty pyłek (klimat kukurydzy)
};

interface CornPlant {
    sprite: PIXI.Sprite;
    baseX: number;
    baseY: number;
    phaseOffset: number;        // dla fali wiatru (zależy od pozycji X+Y w polu)
    baseSwayAmp: number;        // amplitude WIATRU (subtle 0.04-0.08 rad)
    bendAmount: number;         // directional OFFSET od uderzenia czołgu (lerps to 0)
}

interface FloatParticle {
    gfx: PIXI.Graphics;
    baseX: number;
    baseY: number;
    phase: number;
    driftAmp: number;
}

export class CornField {
    public readonly x: number;          // top-left
    public readonly y: number;
    public readonly w: number;
    public readonly h: number;

    private groundContainer: PIXI.Container;
    private plants: CornPlant[] = [];
    private particles: FloatParticle[] = [];
    private time: number = 0;

    // Współdzielone textury — generowane raz (3 warianty roślin)
    private static plantTextures: PIXI.Texture[] = [];

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

        const rng = makeRng(seed);

        // Generate plant textures once
        if (CornField.plantTextures.length === 0) {
            CornField.plantTextures = generatePlantTextures();
        }

        // ── GROUND PATCH (ciemna gleba pod kukurydzą) ──
        this.groundContainer = new PIXI.Container();
        this.groundContainer.zIndex = -80;  // pod tankami i kukurydzą, nad bazową teksturą mapy
        worldContainer.addChild(this.groundContainer);
        this.drawGroundPatch(rng);

        // ── PLANTS w gridzie (każdy z zIndex = py dla Y-sortingu z tankami) ──
        this.spawnPlants(rng, worldContainer);

        // ── PARTICLES (żółty pyłek kukurydzy unosi się nad polem) ──
        this.spawnParticles(rng, worldContainer);
    }

    // ═══════════════════════════════════════════════════════════
    // GROUND PATCH — zaorana ziemia z rzędami
    // ═══════════════════════════════════════════════════════════
    private drawGroundPatch(rng: () => number): void {
        const g = new PIXI.Graphics();
        const RADIUS = 18;  // v0.27.7: zaokraglone rogi pola

        // Drop shadow pod polem (rounded corners, offset SE)
        g.beginFill(0x000000, 0.10);
        g.drawRoundedRect(this.x + 6, this.y + 8, this.w, this.h, RADIUS);
        g.endFill();

        // Główna gleba - jasniejszy odcień + niska alpha (rounded)
        g.beginFill(0x7a5a30, 0.45);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, RADIUS);
        g.endFill();

        // Subtle texture variation
        g.beginFill(COLORS.soilMid, 0.25);
        for (let i = 0; i < 50; i++) {
            const rx = this.x + rng() * this.w;
            const ry = this.y + rng() * this.h;
            g.drawCircle(rx, ry, 1 + rng() * 2);
        }
        g.endFill();

        // Rzędy zaorane (krótsze linie zeby nie wystawaly za rounded corners)
        g.lineStyle(1, COLORS.soilDark, 0.35);
        for (let yLine = this.y + 14; yLine < this.y + this.h - 6; yLine += 22) {
            // Skroc przy krawedziach zeby uniknac wyjscia poza rounded corners
            const inset = 14;
            g.moveTo(this.x + inset, yLine);
            g.lineTo(this.x + this.w - inset, yLine);
        }

        // v0.27.7: NOWE - male kępki trawy rozsiane po polu (~30-40 per pole)
        // Renderujemy PRZED outline zeby outline pokryl te przy krawedziach
        const TUFT_COUNT = Math.floor((this.w * this.h) / 1200);
        for (let i = 0; i < TUFT_COUNT; i++) {
            // Pozycja losowa z zachowaniem marginesu od krawedzi
            const margin = 14;
            const tx = this.x + margin + rng() * (this.w - margin * 2);
            const ty = this.y + margin + rng() * (this.h - margin * 2);

            // Drop shadow tiny (cieniutki owal pod kępka)
            g.beginFill(0x000000, 0.18);
            g.drawEllipse(tx, ty + 1, 4, 1.2);
            g.endFill();

            // 3-5 kreseczek trawy rozchodzacych sie z punktu
            const bladeCount = 3 + Math.floor(rng() * 3);
            for (let b = 0; b < bladeCount; b++) {
                const bx = tx + (rng() - 0.5) * 4;
                const h = 3 + rng() * 4;  // 3-7px wysokość
                const tilt = (rng() - 0.5) * 0.6;
                const col = rng() < 0.45 ? COLORS.leafLight : COLORS.leafMid;
                g.lineStyle(1.4, col, 0.92);
                g.moveTo(bx, ty);
                g.lineTo(bx + Math.sin(tilt) * h, ty - Math.cos(tilt) * h);
            }
        }

        // Cartoon outline pole (rounded)
        g.lineStyle(2, 0x4a2818, 0.55);
        g.drawRoundedRect(this.x, this.y, this.w, this.h, RADIUS);

        this.groundContainer.addChild(g);
    }

    // ═══════════════════════════════════════════════════════════
    // PLANTS — grid z zIndex = py (occlusion z tankami!)
    // ═══════════════════════════════════════════════════════════
    private spawnPlants(rng: () => number, worldContainer: PIXI.Container): void {
        // v0.27.7: zageszczenie 26→20 (-23%) i 22→18 (-18%) — gestsza kukurydza
        const SPACING_X = 20;
        const SPACING_Y = 18;
        const cols = Math.floor((this.w - 12) / SPACING_X);
        const rows = Math.floor((this.h - 12) / SPACING_Y);

        const startX = this.x + (this.w - cols * SPACING_X) / 2 + SPACING_X / 2;
        const startY = this.y + (this.h - rows * SPACING_Y) / 2 + SPACING_Y / 2;

        for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows; row++) {
                // Lekka pozycyjna wariancja żeby grid nie wyglądał za bardzo regularnie
                const jitterX = (rng() - 0.5) * 6;
                const jitterY = (rng() - 0.5) * 4;
                const px = startX + col * SPACING_X + jitterX;
                const py = startY + row * SPACING_Y + jitterY;

                // Wybierz losowo jedną z 3 textur
                const texIdx = Math.floor(rng() * CornField.plantTextures.length);
                const sprite = new PIXI.Sprite(CornField.plantTextures[texIdx]);

                // Anchor u dołu łodygi — sway "od korzenia"
                sprite.anchor.set(0.5, 0.92);
                sprite.x = px;
                sprite.y = py;

                // Random scale 0.85-1.10
                const scale = 0.85 + rng() * 0.25;
                sprite.scale.set(scale);

                // zIndex = py + duża baza, żeby kukurydza była nad tankami gdy są w polu
                // (tank zIndex = jego Y w worldContainer, a my dodajemy + 1000 do Y rośliny)
                // To zapewnia że roślina która jest niżej (większe Y) jest WIDOCZNIE
                // na pierwszym planie (zasłania tank od dołu) — Y-sort z tankami
                sprite.zIndex = Math.floor(py);

                worldContainer.addChild(sprite);

                // Wave wind: faza zależy od pozycji X (fala przechodzi od lewej do prawej)
                const phaseOffset = px * 0.012 + py * 0.005;
                const baseSwayAmp = 0.044 + rng() * 0.044;  // v0.27.6: +10% (0.044-0.088 rad)

                this.plants.push({
                    sprite,
                    baseX: px,
                    baseY: py,
                    phaseOffset,
                    baseSwayAmp,
                    bendAmount: 0,  // start neutral, build up on tank impact
                });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // PARTICLES — żółty pyłek kukurydzy
    // ═══════════════════════════════════════════════════════════
    private spawnParticles(rng: () => number, worldContainer: PIXI.Container): void {
        const PARTICLE_COUNT = Math.max(8, Math.floor((this.w * this.h) / 4000));

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const bx = this.x + rng() * this.w;
            const by = this.y + rng() * this.h;

            const gfx = new PIXI.Graphics();
            gfx.x = bx;
            gfx.y = by;
            gfx.zIndex = 99999;  // zawsze nad wszystkim

            // Tiny żółty pyłek
            gfx.beginFill(COLORS.pollen, 0.85);
            gfx.drawCircle(0, 0, 1.6);
            gfx.endFill();
            // Bright spot
            gfx.beginFill(0xffffff, 0.7);
            gfx.drawCircle(-0.4, -0.5, 0.5);
            gfx.endFill();

            worldContainer.addChild(gfx);
            this.particles.push({
                gfx,
                baseX: bx,
                baseY: by,
                phase: rng() * Math.PI * 2,
                driftAmp: 6 + rng() * 8,
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // UPDATE — wind sway + particles drift
    // ═══════════════════════════════════════════════════════════
    public update(): void {
        this.time += 1 / 60;

        // Wave wind sway (continuous) + bend lerp (impact recovery)
        for (const p of this.plants) {
            // Bend lerp toward 0 — 8% damping per frame = ~500ms full recovery
            p.bendAmount *= 0.92;
            if (Math.abs(p.bendAmount) < 0.005) p.bendAmount = 0;

            // Final skew = oscillating wave wind + directional bend offset
            const wave = Math.sin(this.time * 1.6 + p.phaseOffset) * p.baseSwayAmp;
            p.sprite.skew.x = wave + p.bendAmount;
        }

        // Particles float-up + lateral drift (cykl 4s)
        for (const p of this.particles) {
            const cyclePhase = ((this.time * 0.25) + p.phase / (Math.PI * 2)) % 1.0;
            p.gfx.y = p.baseY - cyclePhase * 25;
            p.gfx.x = p.baseX + Math.sin(cyclePhase * Math.PI * 2 + p.phase) * (p.driftAmp / 2);
            let alpha = 0.85;
            if (cyclePhase < 0.2) alpha = (cyclePhase / 0.2) * 0.85;
            else if (cyclePhase > 0.7) alpha = ((1.0 - cyclePhase) / 0.3) * 0.85;
            p.gfx.alpha = alpha;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // STEALTH CHECK — rectangle containment
    // ═══════════════════════════════════════════════════════════
    public isPointInside(px: number, py: number): boolean {
        return px >= this.x && px <= this.x + this.w
            && py >= this.y && py <= this.y + this.h;
    }

    // ═══════════════════════════════════════════════════════════
    // TANK INTERACTION — kukurydza rozchyla się przy przejeździe (Sok!)
    // ═══════════════════════════════════════════════════════════
    /**
     * Wywolywane co frame przez main loop — gdy czolg jest w poblizu pola,
     * rosliny w promieniu 50px rozchylaja sie W KIERUNKU OD czolga (dx>0 → wygiecie
     * w prawo, dx<0 → w lewo). Intensywnosc falloff od dystansu.
     *
     * Bend lerps to 0 w update() z 8% damping → ~500ms recovery time.
     */
    public onTankEnter(tankX: number, tankY: number): void {
        // Quick reject — czolg poza polem + margin nie wplywa
        const MARGIN = 60;
        if (tankX < this.x - MARGIN || tankX > this.x + this.w + MARGIN
            || tankY < this.y - MARGIN || tankY > this.y + this.h + MARGIN) {
            return;
        }

        const IMPACT_RADIUS = 50;
        const MAX_BEND = 0.55;  // ~31° max wychylenie

        for (const p of this.plants) {
            const dx = p.sprite.x - tankX;
            const dy = p.sprite.y - tankY;
            const distSq = dx * dx + dy * dy;
            const radiusSq = IMPACT_RADIUS * IMPACT_RADIUS;
            if (distSq > radiusSq) continue;

            const dist = Math.sqrt(distSq);
            const intensity = 1.0 - (dist / IMPACT_RADIUS);   // 0..1 falloff
            const direction = dx >= 0 ? 1 : -1;                // wygnij OD czolga
            const newBend = MAX_BEND * intensity * direction;

            // Nadpisuj tylko jesli silniejsze (nie cofaj juz aktywnego wygiecia)
            if (Math.abs(newBend) > Math.abs(p.bendAmount)) {
                p.bendAmount = newBend;
            }
        }
    }
}

// ───────────────────────────────────────────────────────────────
// PLANT TEXTURE GENERATION — 3 warianty (canvas → PIXI.Texture)
// ───────────────────────────────────────────────────────────────

function generatePlantTextures(): PIXI.Texture[] {
    const textures: PIXI.Texture[] = [];
    // v0.27.6: stalkH +20% (28→34, 32→38, 26→31). Plus canvas H zwiekszony zeby zmiescil silk.
    const variants = [
        { stalkH: 34, earOffset: 0,  scale: 1.0  },  // standardowa (+20%)
        { stalkH: 38, earOffset: -2, scale: 1.05 },  // wyższa (+20%)
        { stalkH: 31, earOffset: 2,  scale: 0.95 },  // niższa (+20%)
    ];

    for (const v of variants) {
        const W = 32;
        const H = 54;  // v0.27.6: zwiekszone z 44 dla wyzszych roslin (silk wystaje powyzej kolby)
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const c = cv.getContext('2d')!;
        const cx = W / 2;
        const baseY = H - 4;
        const topY = baseY - v.stalkH;

        // ── 1. Drop shadow (poziomy owal przy ziemi) ──
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.beginPath();
        c.ellipse(cx, baseY - 1, 7, 2.5, 0, 0, Math.PI * 2);
        c.fill();

        // ── 2. Łodyga: outline thick + inner ──
        c.strokeStyle = '#' + COLORS.stemDark.toString(16).padStart(6, '0');
        c.lineWidth = 5;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(cx, baseY);
        c.lineTo(cx, topY);
        c.stroke();
        c.strokeStyle = '#' + COLORS.stemMid.toString(16).padStart(6, '0');
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(cx, baseY);
        c.lineTo(cx, topY);
        c.stroke();
        // Highlight side (sunlit left)
        c.strokeStyle = '#' + COLORS.stemLight.toString(16).padStart(6, '0');
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(cx - 1, baseY);
        c.lineTo(cx - 1, topY);
        c.stroke();

        // ── 3. Liście (4-5 krzyżowych owali wokół środka łodygi) ──
        const leafY = baseY - v.stalkH * 0.55;
        const leaves = [
            { dx: -7, dy:  3, rx: 8,  ry: 3,   ang: -0.35 },  // dolny-lewy duży
            { dx:  7, dy:  3, rx: 8,  ry: 3,   ang:  0.35 },  // dolny-prawy duży
            { dx: -5, dy: -5, rx: 5.5, ry: 2.2, ang: -0.5 },  // górny-lewy mniejszy
            { dx:  5, dy: -5, rx: 5.5, ry: 2.2, ang:  0.5 },  // górny-prawy mniejszy
            { dx: -8, dy: -1, rx: 6,  ry: 2.5, ang: -0.15 },  // środkowy-lewy
        ];
        for (const lf of leaves) {
            // outline
            c.fillStyle = '#' + COLORS.leafDark.toString(16).padStart(6, '0');
            c.beginPath();
            c.ellipse(cx + lf.dx, leafY + lf.dy + 1, lf.rx + 0.8, lf.ry + 0.8, lf.ang, 0, Math.PI * 2);
            c.fill();
            // main green
            c.fillStyle = '#' + COLORS.leafMid.toString(16).padStart(6, '0');
            c.beginPath();
            c.ellipse(cx + lf.dx, leafY + lf.dy, lf.rx, lf.ry, lf.ang, 0, Math.PI * 2);
            c.fill();
            // sunlit highlight
            c.fillStyle = '#' + COLORS.leafLight.toString(16).padStart(6, '0');
            c.beginPath();
            c.ellipse(cx + lf.dx, leafY + lf.dy - 0.5, lf.rx * 0.7, lf.ry * 0.6, lf.ang, 0, Math.PI * 2);
            c.fill();
        }

        // ── 4. ŻÓŁTA KOLBA (kluczowy element — rozpoznawalność kukurydzy!) ──
        const earY = topY + 8 + v.earOffset;
        // Dark brown outline
        c.fillStyle = '#' + COLORS.earOutline.toString(16).padStart(6, '0');
        c.beginPath();
        c.ellipse(cx, earY, 5.5, 10, 0, 0, Math.PI * 2);
        c.fill();
        // Main yellow body
        c.fillStyle = '#' + COLORS.earYellow.toString(16).padStart(6, '0');
        c.beginPath();
        c.ellipse(cx, earY, 4.2, 8.8, 0, 0, Math.PI * 2);
        c.fill();
        // Bright highlight (sunlit side)
        c.fillStyle = '#' + COLORS.earLight.toString(16).padStart(6, '0');
        c.beginPath();
        c.ellipse(cx - 1.2, earY - 2, 1.6, 4.5, 0, 0, Math.PI * 2);
        c.fill();
        // Kernel rows (poziome paski ziaren — kluczowy detail!)
        c.strokeStyle = '#' + COLORS.earKernel.toString(16).padStart(6, '0');
        c.lineWidth = 0.7;
        for (let k = -6; k <= 6; k += 2.2) {
            c.beginPath();
            c.moveTo(cx - 3, earY + k);
            c.lineTo(cx + 3, earY + k);
            c.stroke();
        }
        // Pionowe linie kernel (dla efektu siatki ziaren)
        c.lineWidth = 0.5;
        for (let kx = -2; kx <= 2; kx += 2) {
            c.beginPath();
            c.moveTo(cx + kx, earY - 6);
            c.lineTo(cx + kx, earY + 6);
            c.stroke();
        }

        // ── 5. Silk włókna (jedwab kukurydzy na czubku) ──
        c.strokeStyle = '#' + COLORS.silk.toString(16).padStart(6, '0');
        c.lineWidth = 1;
        c.lineCap = 'round';
        for (let s = -2; s <= 2; s++) {
            c.beginPath();
            c.moveTo(cx + s * 0.8, earY - 9);
            c.quadraticCurveTo(cx + s * 1.5, earY - 13, cx + s * 2.5, earY - 16);
            c.stroke();
        }
        // Silk highlight
        c.strokeStyle = '#fff5d0';
        c.lineWidth = 0.5;
        for (let s = -1; s <= 1; s++) {
            c.beginPath();
            c.moveTo(cx + s * 1, earY - 10);
            c.lineTo(cx + s * 1.8, earY - 14);
            c.stroke();
        }

        textures.push(PIXI.Texture.from(cv));
    }

    return textures;
}

// ───────────────────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────────────────
function makeRng(seed: number): () => number {
    let state = (seed | 0) || 1;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}