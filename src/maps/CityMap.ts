import * as PIXI from 'pixi.js';
import { WORLD_W, WORLD_H } from '../config/constants';

/**
 * Statyczna tekstura miasta — bake'owana raz z Canvas 2D.
 * Zawiera: asfalt, intersekcje, pasy drogowe, oznaczenia pasów pieszych.
 * Kopia z v4.48 buildCityOffscreenTexture.
 */
export function buildCityTexture(): PIXI.Texture {
    const cv = document.createElement('canvas');
    cv.width = WORLD_W;
    cv.height = WORLD_H;
    const c = cv.getContext('2d')!;
    
    // Tło ciemne
    c.fillStyle = '#14141e';
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    
    // Asfalt — krzyżujące się drogi
    // v0.52.0 fix #21: dodana V3 (x=1667-1767, center 1717) jako trzecia pionowa ulica
    // po prawej stronie mapy. Odstep od prawej krawedzi: 233 px (przestrzen na border).
    c.fillStyle = '#09090f';
    c.fillRect(0, 617, WORLD_W, 100);
    c.fillRect(0, 1283, WORLD_W, 100);
    c.fillRect(617, 0, 100, WORLD_H);
    c.fillRect(1283, 0, 100, WORLD_H);
    c.fillRect(1667, 0, 100, WORLD_H);  // V3 — fix #21
    
    // Krawężniki
    c.fillStyle = '#1c1c2a';
    [617, 1283].forEach(y => {
        c.fillRect(0, y - 18, WORLD_W, 18);
        c.fillRect(0, y + 100, WORLD_W, 18);
    });
    [617, 1283, 1667].forEach(x => {  // V3 added — fix #21
        c.fillRect(x - 18, 0, 18, WORLD_H);
        c.fillRect(x + 100, 0, 18, WORLD_H);
    });
    
    // Linie graniczne dróg
    c.strokeStyle = '#282840';
    c.lineWidth = 2;
    [617, 717, 1283, 1383].forEach(y => {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(WORLD_W, y);
        c.stroke();
    });
    [617, 717, 1283, 1383, 1667, 1767].forEach(x => {  // V3 added — fix #21
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, WORLD_H);
        c.stroke();
    });
    
    // Żółte przerywane pasy środkowe (V3 dash at x=1717 — fix #21)
    c.strokeStyle = '#f1c40f';
    c.lineWidth = 3;
    c.setLineDash([35, 22]);
    [[0, 667, WORLD_W, 667], [0, 1333, WORLD_W, 1333], [667, 0, 667, WORLD_H], [1333, 0, 1333, WORLD_H], [1717, 0, 1717, WORLD_H]].forEach(([x1, y1, x2, y2]) => {
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
    });
    c.setLineDash([]);
    
    // Pasy pieszych (zebry) na skrzyżowaniach (V3 zebras — fix #21)
    c.fillStyle = 'rgba(255,255,255,0.20)';
    [[617, 617], [617, 1283], [1283, 617], [1283, 1283], [1667, 617], [1667, 1283]].forEach(([ix, iy]) => {
        for (let t = iy; t < iy + 100; t += 14) {
            c.fillRect(ix, t, 100, 8);
        }
    });
    
    // ============================================================
    // v0.55.0 — Air Taxi / Police hub (prawy-gorny rog): chodniki + parkingi
    // Niekolizyjne, malowane w teksturze (jak drogi/zebry). Hub: x[1790,1940] y[320,520].
    // ============================================================
    // Chodnik L-ksztaltny: od V3 (x1767) i H1 do hubu
    // v0.55.0 — Air Taxi / Police hub (prawy-gorny rog WORLD 3000): chodniki + parkingi
    // ============================================================
    // v0.56.0 — Air Taxi / Police hub: chodnik (odwrocone L) + 2 rzedy parkingow
    // Hub: AirTaxi [2680,230], Police [2680,350], prawa sciana x=2830. WORLD 3000.
    // Chodnik: od prawej sciany hubu w PRAWO, potem w DOL do glownej drogi.
    // ============================================================
    const SW = '#1a1d26';        // sidewalk fill
    const SW_EDGE = '#2a2f3c';   // sidewalk edge
    // Poziomy odcinek: prawa sciana hubu -> w prawo
    c.fillStyle = SW;
    c.fillRect(2830, 300, 70, 26);       // poziom: od x2830 do x2900 (na wysokosci miedzy taxi a police)
    // Pionowy odcinek: w dol do drogi (dlugi pas po prawej)
    c.fillRect(2874, 300, 26, 296);      // pion: x2874, schodzi do y660 (do glownej drogi pozio.)
    // Krawedzie
    c.strokeStyle = SW_EDGE; c.lineWidth = 2;
    c.strokeRect(2830, 300, 70, 26);
    c.strokeRect(2874, 300, 26, 296);

    // --- Parkingi: 2 rzedy ponizej hubu. Kolumny: TAXI (zolte+czerwone) lewo | POLICJA (niebieskie) prawo ---
    const drawSlot = (px: number, py: number, color: string) => {
        c.strokeStyle = color; c.lineWidth = 2; c.setLineDash([6, 4]);
        c.strokeRect(px, py, 30, 44); c.setLineDash([]);
    };
    const COL_Y = 'rgba(255,210,30,0.55)';   // zolty taxi
    const COL_R = 'rgba(255,46,77,0.55)';     // czerwony taxi
    const COL_B = 'rgba(46,155,255,0.6)';     // niebieski policja
    // Rzad 1 (y=448): taxi zolty, taxi czerwony | policja, policja
    drawSlot(2664, 448, COL_Y);
    drawSlot(2698, 448, COL_R);
    drawSlot(2760, 448, COL_B);
    drawSlot(2794, 448, COL_B);
    // Rzad 2 (y=500): jw.
    drawSlot(2664, 500, COL_Y);
    drawSlot(2698, 500, COL_R);
    drawSlot(2760, 500, COL_B);
    drawSlot(2794, 500, COL_B);

    return PIXI.Texture.from(cv);
}

/**
 * Layout 24 budynków cyberpunk.
 * Format: [x, y, width, height, parallaxFactor, type]
 *
 * v0.52.0 fix #15: Globalna unifikacja hF per klaster.
 * Originally kazdy budynek w klastrze mial roznе hF (np. MR: 0.22/0.18/0.15).
 * Przy ruchu kamery dachy budynkow z roznymi hF rozjezdzaly sie wizualnie
 * w roznych kierunkach (parallax mismatch artifact). Mariusz widzial to jako
 * "zachodzace na siebie budynki". Fix: kazdy klaster ma jeden master hF
 * (z hosta billboardu lub mediany dla klastrow bez billboardu). Wszystkie
 * budynki w klastrze sync = roof shift identyczny = brak rozjezdzania.
 * Trade-off: mniej variation depth wewnatrz klastra, ale solid look.
 *
 * v0.52.0 fix #16: Relokacja 3 budynkow.
 *   - B0 [80, 80, 180, 120] (TL narozny) → [430, 440, 170, 160] (TL bottom-right
 *     przy V1/H1 intersection, lepszy spot przy drodze). TL billboard tez przeniesiony.
 *   - B9 [55, 785, 115, 160] (ML lewa krawedz mapy) → [490, 1010, 115, 160] (ML
 *     right side przy V1 road, w wolnej dolnej polowie klastra).
 *   - B17 [80, 1688, 195, 118] (BL lewa krawedz mapy) → [440, 1700, 165, 100]
 *     (BL right side przy V1 road, w wolnej prawej polowie klastra).
 *
 * Master hF per klaster:
 *   TL=0.20, TM=0.20, TR=0.25, ML=0.18, MR=0.22, BL=0.20, BM=0.22, BR=0.20
 */
export const CITY_BUILDINGS_LAYOUT: number[][] = [
    // ===== TL cluster (master hF=0.20) =====
    [430, 440, 170, 160, 0.20, 2],  // RELOCATED from [80, 80, 180, 120] (TL narozny)
    [310, 60, 100, 180, 0.20, 1],   // was hF=0.22 (unified)
    [80, 290, 240, 95, 0.20, 4],    // was hF=0.12 (unified)
    [550, 80, 58, 58, 0.20, 5],     // RELOCATED from TM [825, 55] (fix #18 mala wiezyczka, TL right side near V1)
    // ===== TM cluster (master hF=0.20) — after fix #18 B3 moved to TL, B5 pushed south =====
    [930, 100, 155, 115, 0.20, 2],  // host CYBER RAMEN 4U (hF unchanged)
    [805, 350, 115, 140, 0.20, 1],  // SHIFTED south +125y from [805, 225] (fix #18, eliminate visual wall overlap with B4)
    // ===== TR cluster (master hF=0.25) =====
    [1455, 80, 190, 160, 0.25, 3],  // host MEGA BOSS BEWARE (fix #21: w 200→190, V3 clearance)
    [1805, 60, 85, 180, 0.25, 1],   // SHIFTED +100px x total from [1705, 60] (fix #17 +50, fix #19 +50)
    [1455, 300, 145, 100, 0.25, 4], // was hF=0.10 (unified)
    // ===== ML cluster (master hF=0.18) =====
    [490, 1010, 115, 160, 0.18, 1], // RELOCATED from [55, 785, 115, 160] (ML lewa krawedz)
    [225, 805, 195, 120, 0.18, 2],  // host NEON CITY 2099 (hF unchanged)
    [485, 910, 58, 58, 0.18, 5],    // was hF=0.30 (mala wiezyczka, unified)
    // ===== MR cluster (master hF=0.22) =====
    [1445, 800, 195, 140, 0.22, 2], // host (hF unchanged)
    [1795, 785, 98, 160, 0.22, 1],  // SHIFTED +40px x from [1755, 785] (fix #21 MR cyan tall za V3 po prawej)
    [1445, 1005, 180, 100, 0.22, 3],// was hF=0.15 (unified)
    // ===== BL cluster (master hF=0.20) =====
    [490, 1450, 110, 175, 0.20, 1], // RELOCATED from [80, 1440, 125, 178] (BL lewa krawedz, fix #17)
    [265, 1445, 58, 58, 0.20, 5],   // was hF=0.28 (mala wiezyczka, unified)
    [440, 1700, 165, 100, 0.20, 2], // RELOCATED from [80, 1688, 195, 118] (BL lewa krawedz)
    // ===== BM cluster (master hF=0.22) =====
    [748, 1440, 195, 78, 0.22, 4],  // was hF=0.10 (unified)
    [925, 1565, 175, 130, 0.22, 3], // host (hF unchanged)
    [758, 1762, 108, 148, 0.22, 1], // was hF=0.18 (unified)
    // ===== BR cluster (master hF=0.20) =====
    [1445, 1445, 195, 148, 0.20, 2],// host (fix #21: w 220→195, V3 left curb clearance)
    [1795, 1452, 140, 78, 0.20, 4], // SHIFTED +73px x i w 158→140 (fix #21: BR mid za V3 po prawej)
    [1855, 1602, 58, 58, 0.20, 5],  // SHIFTED -27px x (fix #21: BR small odsuniety od prawej krawedzi pod border)
];

/**
 * Klasa budynku z parallax effect. Rysuje 3 powierzchnie 3D (roof + 2 facing walls).
 *
 * v0.52.0 fix #10 — ROLLBACK fix #4 (tier separation) + fix #5 (ALL 4 walls).
 *
 * Po probach dwoch refactorow (drawPolygon, tier separation, ALL-4-walls), N/S walls
 * pozostawaly puste. 5 Why v3 zdiagnozowalo root cause: kombinacja fix #4 + #5 zniszczyla
 * atomic single-gfx-per-building pattern ktory dzialal w oryginale v4.48. PIXI 7 graphics
 * batcher gubil polygons w 8+ state transitions sekwencji (4 walls + accent + roof w 2 gfx).
 *
 * Rollback:
 *   - Single this.gfx (zamiast wallsGfx + roofGfx)
 *   - if/else conditional walls (rysuj 2 facing walls + roof = 3 powierzchnie atomic)
 *
 * Co zachowane:
 *   - fix #6 brightened palette (wD/wL +0x18 each channel) — visual independent
 *   - fix #9 neon accent base-edge lines — visual independent
 *
 * Co tracimy:
 *   - fix #4 ochrone billboardu od overlap closer-building's wall (akceptowalny compromise)
 */
export class CyberBuilding {
    public x: number; public y: number; public w: number; public h: number; public hF: number;
    public gfx: PIXI.Graphics;
    private C: { rf: number; wD: number; wL: number; n1: number };

    constructor(x: number, y: number, w: number, d: number, hF: number, type: number, container: PIXI.Container) {
        this.x = x; this.y = y; this.w = w; this.h = d; this.hF = hF;

        // Single gfx atomic per-building — pattern z v4.48 ktory dzialal poprawnie.
        // Tie-breaker x*1e-4 dla initial zIndex (constructor) — patrz fix #13 w update().
        this.gfx = new PIXI.Graphics();
        this.gfx.zIndex = y + d + x * 1e-4;
        container.addChild(this.gfx);

        // fix #6 brightened palette (zachowane)
        const P = [
            null,
            { rf: 0x1a1a2d, wD: 0x282838, wL: 0x383850, n1: 0x00ffff }, // type 1 cyan
            { rf: 0x1e2230, wD: 0x2c3440, wL: 0x3c4458, n1: 0xaaddff }, // type 2 jasnoniebieski
            { rf: 0x222635, wD: 0x303848, wL: 0x404858, n1: 0xf1c40f }, // type 3 zolty
            { rf: 0x1a1a1e, wD: 0x2a2a32, wL: 0x383840, n1: 0xff3300 }, // type 4 red
            { rf: 0x12121a, wD: 0x222232, wL: 0x303040, n1: 0xcc00ff }, // type 5 purple
            { rf: 0x2c2422, wD: 0x3c3430, wL: 0x4c4438, n1: 0xff6600 }, // type 6 orange
            { rf: 0x1f2421, wD: 0x2f3631, wL: 0x3d443a, n1: 0x00ff44 }, // type 7 green
            { rf: 0x1d222b, wD: 0x2d343a, wL: 0x3a4450, n1: 0x00ccff }, // type 8 light cyan
        ];
        this.C = P[type] || P[1]!;
    }

    update(camX: number, camY: number, screenW: number, screenH: number): void {
        const ox = (this.x + this.w / 2 - (camX + screenW / 2)) * this.hF;
        const oy = (this.y + this.h / 2 - (camY + screenH / 2)) * this.hF;

        // Single gfx zIndex (rollback fix #4 tier separation). Wall+roof tego samego
        // budynku ZAWSZE renderowane razem jako atomic block. PIXI sort dziala miedzy
        // budynkami przez y+oy+h (depth ordering po world position).
        //
        // v0.52.0 fix #13: Deterministic z-tie-breaker. PIXI sortableChildren uzywa
        // unstable sort dla rownych zIndex — kolejnosc miedzy budynkami o identycznym
        // y+oy+h moze drgac frame-to-frame (re-sort kazdej klatki), powodujac wizualne
        // "wystajace" kawalki tla budynkow. Sekundarny offset = this.x * 1e-4 daje
        // monotonic deterministic ordering oparty na pozycji horizontal:
        //   - Dla x w [0, 2000] offset jest w [0, 0.2]
        //   - Primary delta miedzy budynkami w pixelach > 1 (zawsze >> 0.2)
        //   - Zerwie wszystkie z-ties, nie wplywa na primary depth correctness
        //   - Floating point precision OK (1e-4 to nie poziom subnormal numbers)
        this.gfx.zIndex = this.y + oy + this.h + this.x * 1e-4;

        // === Render walls do single gfx (przed roof — kolejnosc rysowania = depth) ===
        // v0.52.0 #5 fix: rysuj WSZYSTKIE 4 walls zawsze (top + bottom + left + right).
        // Wczesniej `if (oy > 0) else if (oy < 0)` rysowal TYLKO 1 z 2 vertical walls,
        // i podobnie dla horizontal. W rezultacie max 2 walls + roof = 3 faces visible,
        // i w niektorych konfiguracjach kamery brakowalo widocznej sciany (player below
        // building + duzy parallax => bottom wall widoczna, ale top hidden by roof OK,
        // jednak LEFT/RIGHT zalezne od ox sign — gracz w pewnych pozycjach widzial tylko
        // 1 side wall zamiast bonus widocznosc obu corners).
        //
        // Rysunek wszystkich 4 walls: te ktore sa GEOMETRYCZNIE hidden by roof
        // (wewnatrz roof rectangle) i tak nie sa visible (PIXI culling), wiec zero
        // visual artefactow. Te ktore powinny byc visible (poza roof) ZAWSZE sa.
        // Daje konsystentny "full 3D wireframe" look ze wszystkich katow kamery.
        const wg = this.gfx;
        wg.clear();

        // v0.52.0 fix #11 HYBRID (5-Why v3 + insight kolegi): walls puste byly
        // spowodowane DWOMA niezaleznymi problemami:
        //
        // 1) WebGL anti-aliasing gaps: czarny lineStyle(1, 0x000000, 1) wokol kazdej
        //    sciany + 1-2px subpixel gaps miedzy poligonami o roznych kolorach (wD vs wL)
        //    tworzyly wizualne "dziury" / efekt "pustki" na granicach scian. Mariusz
        //    widzial te dziury jako "scian nie ma". Same-color thin outline (0.5px tym
        //    samym kolorem co fill) uszczelnia te gaps — sciana wyglada jak monolit.
        //
        // 2) Drawing ALL 4 walls zawsze (fix #5) dodawalo 2 niepotrzebne polygons (back
        //    walls, hidden przez roof i tak). To zwiekszylo state transitions w PIXI
        //    graphics state machine i powodowalo subtle batch rendering issues dla
        //    HORIZONTAL polygons (TOP/BOTTOM). Original v4.48 mial conditional 2 walls
        //    (komentarz linia 93: "Rysuje 3 sciany 3D" = roof + 2 facing walls).
        //
        // FIX: (a) lineStyle same-color 0.5px seal zamiast czarnego 1px, (b) selective
        // rendering 2 walls (TOP lub BOTTOM based on oy, LEFT lub RIGHT based on ox).
        const drawWall = (x1: number, y1: number, x2: number, y2: number, rx1: number, ry1: number, rx2: number, ry2: number, col: number) => {
            wg.beginFill(col);
            wg.lineStyle(0.5, col, 1);
            wg.drawPolygon([x1, y1, x2, y2, rx2, ry2, rx1, ry1]);
            wg.endFill();
        };

        // Os Y: rysuj tylko sciane facing camera (skip jesli oy===0 — wall height = 0)
        if (oy > 0) {
            // Player NORTH of building (oy>0): widzi TOP/north face
            drawWall(this.x, this.y, this.x + this.w, this.y,
                     this.x + ox, this.y + oy, this.x + this.w + ox, this.y + oy, this.C.wD);
        } else if (oy < 0) {
            // Player SOUTH of building (oy<0): widzi BOTTOM/south face
            drawWall(this.x, this.y + this.h, this.x + this.w, this.y + this.h,
                     this.x + ox, this.y + this.h + oy, this.x + this.w + ox, this.y + this.h + oy, this.C.wL);
        }

        // Os X: rysuj tylko sciane facing camera (skip jesli ox===0 — wall width = 0)
        if (ox > 0) {
            // Player WEST of building (ox>0): widzi LEFT/west face
            drawWall(this.x, this.y, this.x, this.y + this.h,
                     this.x + ox, this.y + oy, this.x + ox, this.y + this.h + oy, this.C.wL);
        } else if (ox < 0) {
            // Player EAST of building (ox<0): widzi RIGHT/east face
            drawWall(this.x + this.w, this.y, this.x + this.w, this.y + this.h,
                     this.x + this.w + ox, this.y + oy, this.x + this.w + ox, this.y + this.h + oy, this.C.wD);
        }

        // v0.52.0 fix #14: Selective edge rendering — eliminacja efektu "szyby".
        // Poprzednio fix #12 rysowal WSZYSTKIE 4 corner edges zawsze. Walls
        // rysujemy selektywnie (fix #11): tylko 2 facing kamere. Edges miedzy
        // 2 non-drawn walls (back corners) lecialy przez pusta przestrzen nad
        // asfaltem — wygladaly jak back edges szklanej bryly = budynek
        // wygladal transparentny.
        //
        // Logika: kazda corner edge jest na styku 2 sasiednich walls. Edge jest
        // visible iff przynajmniej jedna z tych 2 walls jest drawn:
        //   NW edge = styk TOP + LEFT
        //   NE edge = styk TOP + RIGHT
        //   SE edge = styk BOTTOM + RIGHT
        //   SW edge = styk BOTTOM + LEFT
        //
        // Walls drawn:  TOP iff oy>0, BOTTOM iff oy<0, LEFT iff ox>0, RIGHT iff ox<0
        wg.lineStyle(1.5, this.C.n1, 0.5);

        if (oy > 0 || ox > 0) {
            // NW edge (TOP|LEFT visible): base TL -> roof TL
            wg.moveTo(this.x, this.y);
            wg.lineTo(this.x + ox, this.y + oy);
        }
        if (oy > 0 || ox < 0) {
            // NE edge (TOP|RIGHT visible): base TR -> roof TR
            wg.moveTo(this.x + this.w, this.y);
            wg.lineTo(this.x + this.w + ox, this.y + oy);
        }
        if (oy < 0 || ox < 0) {
            // SE edge (BOTTOM|RIGHT visible): base BR -> roof BR
            wg.moveTo(this.x + this.w, this.y + this.h);
            wg.lineTo(this.x + this.w + ox, this.y + this.h + oy);
        }
        if (oy < 0 || ox > 0) {
            // SW edge (BOTTOM|LEFT visible): base BL -> roof BL
            wg.moveTo(this.x, this.y + this.h);
            wg.lineTo(this.x + ox, this.y + this.h + oy);
        }

        // === Render roof do tego samego gfx (po walls) — atomic block ===
        // BEZ clear() — walls juz narysowane w wg = this.gfx, clear by je usunal.
        // Roof drawn AFTER walls = wizualnie ABOVE walls (draw order w single gfx
        // determines visual order). Roof ZAWSZE zaslania back-facing walls.
        const rg = this.gfx;

        rg.beginFill(this.C.rf);
        rg.lineStyle(2, 0, 1);
        rg.drawRect(this.x + ox, this.y + oy, this.w, this.h);
        rg.endFill();

        rg.lineStyle(3, this.C.n1, 0.8);
        rg.drawRect(this.x + ox + 8, this.y + oy + 8, this.w - 16, this.h - 16);
    }
}
/**
 * Pozycje MediPadów (HoverRepairPad) na CityMap — zgodnie z v4.48.
 */
export const MEDI_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    { x: 617, y: 200 },    // V1 street, północ
    { x: 1283, y: 850 },   // V2 street, środek
    { x: 1717, y: 1450 },  // V3 street, południe (fix #21 RELOCATED from V1 [617, 1450])
];

/**
 * Pozycje PowerPadów (PowerHoverPad) na CityMap — zgodnie z v4.48.
 */
export const POWER_PAD_POSITIONS: Array<{ x: number, y: number }> = [
    { x: 617, y: 900 },    // V1 street, środek
    { x: 1283, y: 400 },   // V2 street, północ
];

// ============================================================
// v0.52.0 — Cyberpunk Map Visual Upgrade #1: Neon Billboards
// ============================================================
/**
 * 7 neonowych billboardow na dachach duzych wiezowcow.
 * Po jednym per klaster 3x3 (top-left, top-mid, top-right, mid-left, mid-right,
 * bottom-mid, bottom-right). Klaster bottom-left zostawiony pusty wizualnie —
 * tam stoja same wysokie waskie budynki + wiezyczki, billboard wygladalby
 * jak naklejka na patyku. Empty space jest celowy.
 *
 * Pozycjonowanie: kazdy billboard rysowany NA dachu duzego budynku, z 18px
 * marginesem od krawedzi budynku. Wymiary: ~80% szerokosci budynku, ~50%
 * wysokosci. Anchor billboardu (x,y) = lewy gorny rog jego prostokata.
 *
 * Seedy = liczby pierwsze (0,1,2,3,4,5,7) — kazdy daje inny startowy wariant
 * contentu (seed % 6 = [0,1,2,3,4,5,1]) i inny offset rotacji (seed * 1373 % 8000),
 * dzieki czemu billboardy NIE rotuja sie synchronicznie.
 *
 * Glow color distribution: BILLBOARD_CONTENTS[0..5] daje magenta/cyan/red-orange/
 * pink/green/purple. Mapa ma neonowe akcenty na budynkach (n1 z palety w
 * CyberBuilding), wiec billboardy dodaja kolejna warstwe "miasto-zyje".
 */
export const CITY_BILLBOARDS_LAYOUT: Array<{
    x: number; y: number; w: number; h: number; seed: number; parallax: number;
}> = [
    // Top-Left cluster — wiezowiec [430, 440, 170, 160] (type 2 jasnoniebieski, parallax 0.20)
    // RELOCATED razem z hostem B0 (fix #16). Zachowany 18px margines od base corner hosta.
    { x: 448,  y: 458,  w: 144, h: 60, seed: 0, parallax: 0.20 },

    // Top-Mid cluster — wiezowiec [930, 100, 155, 115] (type 2, parallax 0.20)
    { x: 948,  y: 118,  w: 119, h: 58, seed: 1, parallax: 0.20 },

    // Top-Right cluster — gigant [1455, 80, 200, 160] (type 3 yellow, parallax 0.25)
    { x: 1473, y: 98,   w: 164, h: 80, seed: 2, parallax: 0.25 },

    // Mid-Left cluster — szeroki [225, 805, 195, 120] (type 2, parallax 0.18)
    { x: 243,  y: 823,  w: 159, h: 60, seed: 3, parallax: 0.18 },

    // Mid-Right cluster — szeroki [1445, 800, 195, 140] (type 2, parallax 0.22)
    { x: 1463, y: 818,  w: 159, h: 70, seed: 4, parallax: 0.22 },

    // Bottom-Mid cluster — wiezowiec [925, 1565, 175, 130] (type 3 yellow, parallax 0.22)
    { x: 943,  y: 1583, w: 139, h: 65, seed: 5, parallax: 0.22 },

    // Bottom-Right cluster — gigant [1445, 1445, 195, 148] (type 2, parallax 0.20, after fix #21 shrunk)
    { x: 1463, y: 1463, w: 170, h: 74, seed: 7, parallax: 0.20 },
];