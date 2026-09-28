import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import { isBoxInView } from '../cullGate';
import { bakeToSprite } from '../propBaker';

type Pt = { x: number; y: number };

/**
 * Pyramid — True 2.5D Parallax (dynamic apex calculation + 12-step stepped pyramid).
 * 
 * v0.14.2 fixy:
 *   - HITBOX FIX: x/y to top-left corner hitboxu (zgodne z CyberBuilding convention)
 *     Wcześniej x/y były center → collision tylko od S. Teraz visualX/visualY trzymają
 *     center dla apex calc, this.x/this.y dla checkRectCollision (top-left).
 *   - USUNIĘTE: wejście do grobowca, pochodnia, glow sprite, hieroglify
 *     (apex przy HEIGHT_FACTOR=0.25 powodował "ucieczkę" wejścia na piramidach
 *     daleko od centrum kamery — wygląd nienaturalny + user feedback "nic nie wnoszą")
 * 
 * Mechanika 2.5D: apex (szczyt) jest DYNAMICZNIE LICZONY z pozycji kamery.
 * Gdy gracz porusza się, szczyt "ucieka" w stronę kamery → iluzja wysokiej piramidy.
 */

const PALETTE = {
    sandSunlit:       0xefd29d,
    sandMid1:         0xd4ac6e,
    sandMid2:         0xaa7a3e,
    sandShadow:       0x66421a,
    stepShadow:       0x000000,
    pyramidionGold:   0xffd700,
    pyramidionShadow: 0xb8860b,
    baseShadow:       0x000000,
};

export class Pyramid implements ICollidable {
    // ICollidable — top-left corner of hitbox (zgodne z konwencją CyberBuilding)
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    
    // Visual center (różny od this.x/this.y) — używany do parallax calc + container pos
    private visualX: number;
    private visualY: number;
    
    private container: PIXI.Container;
    private gfxStatic: PIXI.Graphics;
    private gfxDynamic: PIXI.Graphics;
    /**
     * v0.132.0 — MIGOTANIE NA OSOBNEJ WARSTWIE. Do v0.131.0 refleks na czubku byl
     * rysowany w `gfxDynamic` razem z cala bryla, wiec dwa kolka migoczace w rytmie
     * `sin(time)` wymuszaly pelny redraw 4 scian + 12 schodkow + 4 krawedzi + pyramidionu
     * w KAZDEJ klatce. Bryla zalezy wylacznie od kamery, migotanie wylacznie od czasu —
     * rozdzielenie ich pozwala przerysowywac bryle tylko wtedy, gdy kamera realnie sie
     * ruszyla.
     */
    private gfxSparkle: PIXI.Graphics;
    /** Ostatnia pozycja kamery, dla ktorej przeliczono bryle (-1 = jeszcze nigdy). */
    private lastCamCX = Number.NaN;
    private lastCamCY = Number.NaN;
    /** Apex z ostatniego przeliczenia — migotanie musi wiedziec, gdzie jest czubek. */
    private apexX = 0;
    private apexY = 0;
    /** Bramka cullingu: czy w poprzedniej klatce prop byl poza kadrem. */
    private culled = false;

    private size: number;
    private seed: number;
    
    private static readonly HEIGHT_FACTOR = 0.25;
    private static readonly STEPS_COUNT = 12;
    
    /** DESERT ART v2 — nowa bryla (casing, erozja, AO, rysy). Legacy sciezka nietknieta. */
    private artV2: boolean;
    /** DESERT ART v2 / E4 — stan uszkodzen 0..3 (rysy na scianach), pod klatwe piramidy. */
    private damageStage = 0;
    /** E4 — zielona poswiata klatwy (telegraf), na wierzchu bryly. */
    private gfxCurse: PIXI.Graphics;

    /**
     * E4 — duck-typing trafien (Bullet / EnemyBullet). Ustawiane WYLACZNIE przez
     * `enableHitHooks()` (klatwa v2), wiec legacy piramida zachowuje sie jak sciana.
     */
    public takeDamage?: (dmg: number, hitX: number, hitY: number, heavy?: boolean) => void;
    public takeEnemyDamage?: (dmg: number, hitX: number, hitY: number) => void;

    constructor(x: number, y: number, size: number, seed: number, worldContainer: PIXI.Container, hitboxPad: number = 100, artV2: boolean = false) {
        this.artV2 = artV2;
        // Visual center
        this.visualX = x;
        this.visualY = y;
        this.size = size;
        this.seed = seed;
        
        // v0.14.4 FIX: hitbox = visual size + 100px padding (50px each side).
        // Padding kompensuje visual tank size (~100px long-axis po TANK_CANVAS_SCALE 1.75) vs player
        // collision radius (20px w checkRectCollision). Bez padding-u tank wjeżdżał ~30px wizualnie
        // w piramidę zanim collision react. +100 padding daje ~20px gap od visual brzegu piramidy
        // ze WSZYSTKICH 4 stron — user wymóg "większe marginesy".
        // DESERT ART v2: hitboxPad 30 (hitbox ~ bryla), legacy 100
        const hitboxSize = size + hitboxPad;
        this.x = x - hitboxSize / 2;
        this.y = y - hitboxSize / 2;
        this.w = hitboxSize;
        this.h = hitboxSize;
        
        this.container = new PIXI.Container();
        this.container.x = x;   // visual center
        this.container.y = y;
        this.container.zIndex = y + 10;  // v0.14.3 FIX: piramida ABOVE track markers/wrecks o tej samej y
        worldContainer.addChild(this.container);
        
        this.gfxStatic = new PIXI.Graphics();
        this.gfxDynamic = new PIXI.Graphics();
        this.gfxSparkle = new PIXI.Graphics();
        this.container.addChild(this.gfxStatic);
        this.container.addChild(this.gfxDynamic);
        this.container.addChild(this.gfxSparkle);   // NAD bryla — refleks jest na czubku
        this.gfxCurse = new PIXI.Graphics();
        this.container.addChild(this.gfxCurse);
        
        if (this.artV2) this.drawStaticBaseV2();
        else this.drawStaticBase();
    }

    /** Deterministyczny szum 0..1 z indeksu + seeda (zamiast Math.random). */
    private hash(i: number): number {
        const s = Math.sin(i * 12.9898 + this.seed * 78.233) * 43758.5453;
        return s - Math.floor(s);
    }

    /** E4 — srodek i rozmiar bryly (dla PyramidCurse). */
    public getVisual(): { x: number; y: number; size: number } {
        return { x: this.visualX, y: this.visualY, size: this.size };
    }

    /** E4 — wlacza trafienia: gracz liczy sie do klatwy, wrog daje tylko iskre. */
    public enableHitHooks(
        onPlayer: (dmg: number, x: number, y: number) => void,
        onEnemy: (x: number, y: number) => void,
    ): void {
        this.takeDamage = (dmg, x, y) => onPlayer(dmg, x, y);
        this.takeEnemyDamage = (_dmg, x, y) => onEnemy(x, y);
    }

    /**
     * E4 — telegraf klatwy: `k` 0..1 = drzenie bryly + zielona poswiata u podstawy.
     * `phase` = licznik krokow (deterministyczny rytm, bez zegara systemowego).
     */
    public setCurseTelegraph(k: number, phase: number): void {
        const g = this.gfxCurse;
        g.clear();
        if (k <= 0) {
            this.container.x = this.visualX;
            this.container.y = this.visualY;
            return;
        }
        const amp = 1 + k * 3;
        this.container.x = this.visualX + Math.sin(phase * 1.9) * amp;
        this.container.y = this.visualY + Math.cos(phase * 2.3) * amp * 0.5;
        const hs = this.size / 2;
        const pulse = 0.5 + Math.sin(phase * 0.25) * 0.5;
        // Poswiata z wejscia grobowca u podstawy sciany N (patrz drawBodyV2)
        g.beginFill(0x7dff6a, (0.12 + 0.22 * k) * (0.6 + pulse * 0.4));
        g.drawEllipse(0, -hs - 6, hs * 0.5, hs * 0.16);
        g.endFill();
        g.beginFill(0x9dff7a, 0.55 * k * pulse);
        g.drawRoundedRect(-hs * 0.1, -hs - 2, hs * 0.2, 8, 3);
        g.endFill();
    }

    /** E5 — flex po zdjeciu klatwy: rozblysk pyramidionu (krokow) + kartusz z nickiem. */
    private flashLeft = 0;
    private cartouche: PIXI.Container | null = null;

    public flashPyramidion(steps: number): void {
        this.flashLeft = steps;
    }

    /** Kartusz (owal z liną) z imieniem gracza na scianie N — zostaje do konca meczu. */
    public showCartouche(name: string): void {
        if (this.cartouche || !name) return;
        const hs = this.size / 2;
        const box = new PIXI.Container();
        const txt = new PIXI.Text(name.slice(0, 12), {
            fontFamily: 'Titan One', fontSize: 13, fill: 0x5a2e08, align: 'center',
        });
        txt.anchor.set(0.5);
        const w = Math.max(46, txt.width + 18), h = 22;
        const g = new PIXI.Graphics();
        g.beginFill(0x000000, 0.25);
        g.drawRoundedRect(-w / 2 + 2, -h / 2 + 2, w, h, h / 2);
        g.endFill();
        g.beginFill(0xffd84a);
        g.drawRoundedRect(-w / 2, -h / 2, w, h, h / 2);
        g.endFill();
        g.lineStyle(2, 0x8a5e08, 1);
        g.drawRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, (h - 6) / 2);
        g.moveTo(w / 2 - 2, -h / 2 + 4); g.lineTo(w / 2 - 2, h / 2 - 4);   // wezel liny kartusza
        box.addChild(g, txt);
        box.y = -hs * 0.5;
        this.container.addChild(box);
        this.cartouche = box;
    }

    /** E4 hook: ustawia stan rys (0..3) i wymusza przerysowanie bryly. */
    public setDamageStage(stage: number): void {
        const s = Math.max(0, Math.min(3, Math.floor(stage)));
        if (s === this.damageStage) return;
        this.damageStage = s;
        this.lastCamCX = Number.NaN;
    }

    /**
     * DESERT ART v2 — statyczna podstawa: miekki cien SE (slonce z NW, wspolne dla mapy),
     * AO przy podstawie, zaspy piasku przy krawedziach i gruz z oblicowki. Pieczone raz.
     */
    private drawStaticBaseV2(): void {
        const g = new PIXI.Graphics();
        const hs = this.size / 2;

        // Cien rzucany na SE — dwie warstwy = miekka krawedz
        g.beginFill(PALETTE.baseShadow, 0.13);
        g.drawPolygon([hs, -hs * 0.75, hs * 2.0, hs * 1.05, hs * 1.05, hs * 2.0, -hs * 0.75, hs]);
        g.endFill();
        g.beginFill(PALETTE.baseShadow, 0.14);
        g.drawPolygon([hs, -hs * 0.5, hs * 1.7, hs * 0.95, hs * 0.95, hs * 1.7, -hs * 0.5, hs]);
        g.endFill();

        // AO pod podstawa
        g.beginFill(PALETTE.baseShadow, 0.22);
        g.drawRoundedRect(-hs - 8, -hs - 8, this.size + 16, this.size + 16, 12);
        g.endFill();

        // Zaspy piasku nawiane na krawedzie (jasne od NW, ciemniejsze od SE)
        for (let i = 0; i < 10; i++) {
            const side = i % 4;
            const u = (this.hash(i) - 0.5) * 1.6 * hs;
            const r = hs * (0.12 + this.hash(i + 40) * 0.1);
            const px = side === 0 ? u : side === 1 ? hs + 2 : side === 2 ? u : -hs - 2;
            const py = side === 0 ? -hs - 2 : side === 1 ? u : side === 2 ? hs + 2 : u;
            const col = side === 0 || side === 3 ? 0xf0d49c : 0xc9a060;
            g.beginFill(col, 0.75);
            g.drawEllipse(px, py, side % 2 === 0 ? r * 1.8 : r * 0.7, side % 2 === 0 ? r * 0.7 : r * 1.8);
            g.endFill();
        }

        // Gruz oblicowki — male bloczki z cieniem (bez polysku: zero false affordance)
        for (let i = 0; i < 14; i++) {
            const a = this.hash(i + 100) * Math.PI * 2;
            const d = hs * (1.08 + this.hash(i + 200) * 0.3);
            const bx = Math.cos(a) * d;
            const by = Math.sin(a) * d;
            const bw = 5 + this.hash(i + 300) * 7;
            const bh = bw * (0.6 + this.hash(i + 400) * 0.3);
            g.beginFill(0x000000, 0.22);
            g.drawRect(bx - bw / 2 + 2, by - bh / 2 + 2, bw, bh);
            g.endFill();
            g.beginFill(0xc9a068);
            g.drawRect(bx - bw / 2, by - bh / 2, bw, bh);
            g.endFill();
            g.beginFill(0xf2dbad, 0.8);
            g.drawRect(bx - bw / 2, by - bh / 2, bw, 1.5);
            g.endFill();
        }

        const baked = bakeToSprite(g, `pyr_v2_base:${Math.round(this.size)}:${this.seed}`);
        if (baked) {
            this.gfxStatic.addChild(baked);
            g.destroy();
        } else {
            this.gfxStatic.addChild(g);
        }
    }

    /**
     * DESERT ART v2 — bryla. Apex dalej liczony z kamery (tozsamosc 2.5D mapy), ale:
     * cieniowanie per sciana z AO przy ziemi, 10 warstw blokow z krawedzia swiatla,
     * wykruszone bloki, gladka oblicowka przy szczycie (jak Chefren), grzbiety swiatlo/cien,
     * zloty pyramidion z blikiem i rysy wg `damageStage` (E4).
     */
    private drawBodyV2(g: PIXI.Graphics, tl: Pt, tr: Pt, br: Pt, bl: Pt, apex: Pt): void {
        const P = (a: Pt, b: Pt, u: number, t: number): [number, number] => {
            const bx = a.x + (b.x - a.x) * u;
            const by = a.y + (b.y - a.y) * u;
            return [bx + (apex.x - bx) * t, by + (apex.y - by) * t];
        };
        const quad = (a: Pt, b: Pt, u0: number, u1: number, t0: number, t1: number): number[] => [
            ...P(a, b, u0, t0), ...P(a, b, u1, t0), ...P(a, b, u1, t1), ...P(a, b, u0, t1),
        ];
        // [a, b, kolor, czy sloneczna]
        const faces: [Pt, Pt, number, boolean][] = [
            [tl, tr, 0xf4dcaa, true],   // N
            [bl, tl, 0xe2bd82, true],   // W
            [tr, br, 0xb98848, false],  // E
            [br, bl, 0x8a5a2a, false],  // S
        ];

        g.lineStyle(0);
        for (let fi = 0; fi < faces.length; fi++) {
            const [a, b, col, lit] = faces[fi];
            g.beginFill(col);
            g.drawPolygon([a.x, a.y, b.x, b.y, apex.x, apex.y]);
            g.endFill();
            // AO przy ziemi
            g.beginFill(0x000000, lit ? 0.10 : 0.16);
            g.drawPolygon(quad(a, b, 0, 1, 0, 0.16));
            g.endFill();
            // Gladka oblicowka przy szczycie
            g.beginFill(0xffffff, lit ? 0.18 : 0.07);
            g.drawPolygon(quad(a, b, 0, 1, 0.76, 0.9));
            g.endFill();
            // Wykruszone bloki
            for (let k = 0; k < 7; k++) {
                const u = 0.12 + this.hash(fi * 50 + k) * 0.76;
                const t = 0.05 + this.hash(fi * 50 + k + 20) * 0.6;
                const du = 0.025 + this.hash(fi * 50 + k + 30) * 0.03;
                g.beginFill(0x000000, lit ? 0.14 : 0.2);
                g.drawPolygon(quad(a, b, u, u + du, t, t + 0.05));
                g.endFill();
            }
            // Warstwy blokow: cien pod krawedzia + swiatlo nad nia
            const COURSES = 10;
            for (let i = 1; i <= COURSES; i++) {
                const t = (i / (COURSES + 1)) * 0.76;
                const [x0, y0] = P(a, b, 0, t);
                const [x1, y1] = P(a, b, 1, t);
                g.lineStyle(1.5, 0x000000, lit ? 0.2 : 0.28);
                g.moveTo(x0, y0); g.lineTo(x1, y1);
                const [x2, y2] = P(a, b, 0, t + 0.012);
                const [x3, y3] = P(a, b, 1, t + 0.012);
                g.lineStyle(1, 0xffffff, lit ? 0.28 : 0.08);
                g.moveTo(x2, y2); g.lineTo(x3, y3);
            }
            g.lineStyle(0);
        }

        // Wejscie do grobowca u podstawy sciany N (E4: stad wychodzi klatwa)
        {
            const [a, b] = [tl, tr];
            g.beginFill(0x6a4a24, 0.9);          // obramienie z kamienia
            g.drawPolygon(quad(a, b, 0.42, 0.58, 0, 0.13));
            g.endFill();
            g.beginFill(0x120a04);               // ciemny otwor
            g.drawPolygon(quad(a, b, 0.45, 0.55, 0, 0.1));
            g.endFill();
            g.lineStyle(2, 0xfff0cc, 0.55);      // nadproze w sloncu
            g.moveTo(...P(a, b, 0.42, 0.13)); g.lineTo(...P(a, b, 0.58, 0.13));
            g.lineStyle(0);
        }

        // Rysy (E4) — tylko sciany E i S, zeby czytaly sie z kazdej strony kamery
        if (this.damageStage > 0) {
            g.lineStyle(2, 0x2a1808, 0.75);
            for (let c = 0; c < this.damageStage * 2; c++) {
                const [a, b] = c % 2 === 0 ? [tr, br] : [br, bl];
                let u = 0.2 + this.hash(c + 700) * 0.6;
                let t = 0.05;
                g.moveTo(...P(a, b, u, t));
                for (let s = 0; s < 4; s++) {
                    u += (this.hash(c * 10 + s + 800) - 0.5) * 0.12;
                    t += 0.1 + this.hash(c * 10 + s + 900) * 0.08;
                    g.lineTo(...P(a, b, u, t));
                }
            }
            g.lineStyle(0);
        }

        // Grzbiety: NW swiatlo, SE cien
        g.lineStyle(2.5, 0xfff4d8, 0.6);
        g.moveTo(tl.x, tl.y); g.lineTo(apex.x, apex.y);
        g.lineStyle(1.5, 0xfff0d0, 0.3);
        g.moveTo(tr.x, tr.y); g.lineTo(apex.x, apex.y);
        g.moveTo(bl.x, bl.y); g.lineTo(apex.x, apex.y);
        g.lineStyle(2, 0x3a2008, 0.45);
        g.moveTo(br.x, br.y); g.lineTo(apex.x, apex.y);
        // Obrys podstawy
        g.lineStyle(2, 0x4a2e10, 0.35);
        g.moveTo(tl.x, tl.y); g.lineTo(tr.x, tr.y); g.lineTo(br.x, br.y); g.lineTo(bl.x, bl.y); g.lineTo(tl.x, tl.y);
        g.lineStyle(0);

        // Pyramidion
        const pyrT = 0.9;
        const pTL = P(tl, tr, 0, pyrT);
        const pTR = P(tl, tr, 1, pyrT);
        const pBR = P(br, bl, 0, pyrT);
        const pBL = P(br, bl, 1, pyrT);
        g.beginFill(0xffe24a);
        g.drawPolygon([...pTL, ...pTR, apex.x, apex.y]);
        g.endFill();
        g.beginFill(0xf5c518);
        g.drawPolygon([...pTL, ...pBL, apex.x, apex.y]);
        g.endFill();
        g.beginFill(0xc08a10);
        g.drawPolygon([...pTR, ...pBR, apex.x, apex.y]);
        g.endFill();
        g.beginFill(0x8a5e08);
        g.drawPolygon([...pBL, ...pBR, apex.x, apex.y]);
        g.endFill();
        g.lineStyle(1.5, 0xffffff, 0.8);
        g.moveTo(pTL[0], pTL[1]); g.lineTo(apex.x, apex.y);
        g.lineStyle(0);
    }

    /**
     * Statyczna warstwa: cień rzucany na piasek + sand ring + noise.
     */
    private drawStaticBase(): void {
        const g = this.gfxStatic;
        const hs = this.size / 2;
        
        // Długi cień rzucany na piasek (sun from NW)
        g.beginFill(PALETTE.baseShadow, 0.4);
        g.drawPolygon([
            -hs * 0.8, hs * 0.8,
            hs, -hs * 0.8,
            hs * 1.8, hs * 1.6,
            hs * 0.2, hs * 1.8,
        ]);
        g.endFill();
        
        // Ambient Occlusion pod bazą
        g.beginFill(PALETTE.baseShadow, 0.3);
        g.drawRect(-hs - 5, -hs - 5, this.size + 10, this.size + 10);
        g.endFill();
        
        // Sand ring (subtle outline)
        g.lineStyle(2, 0xdcb878, 0.4);
        g.drawEllipse(0, 0, hs * 1.2, hs * 1.1);
        
        // Noise na krawędziach (drobne kropki piasku)
        g.lineStyle(0);
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 2 + this.seed;
            const dist = hs * (1.0 + Math.random() * 0.3);
            g.beginFill(0x8a5e2a, 0.3 + Math.random() * 0.3);
            g.drawCircle(Math.cos(angle) * dist, Math.sin(angle) * dist, 1 + Math.random() * 2);
            g.endFill();
        }
    }
    
    /**
     * Main 2.5D parallax render. Wywoływane per frame.
     * Zgodne z ICollidable.update sygnaturą (4 args).
     */
    update(camX: number, camY: number, screenW: number, screenH: number): void {
        // v0.132.0 — VIEWPORT CULLING. Piramida przerysowywala cala bryle co klatke
        // niezaleznie od tego, gdzie jest gracz; na mapie 3000x3000 przy zoomie 0.7
        // widac ~7% powierzchni. Bramka po AABB hitboxu (this.x/y/w/h), nie po srodku,
        // bo piramida ma realna rozpietosc i musi zaczac sie rysowac, zanim jej srodek
        // wjedzie w kadr.
        const visible = isBoxInView(this.x, this.y, this.w, this.h, camX, camY, screenW, screenH);
        if (!visible) {
            if (!this.culled) {                 // toggle TYLKO przy zmianie, nie co klatke
                this.culled = true;
                this.gfxDynamic.renderable = false;
                this.gfxSparkle.renderable = false;
            }
            return;
        }
        if (this.culled) {
            this.culled = false;
            this.gfxDynamic.renderable = true;
            this.gfxSparkle.renderable = true;
            this.lastCamCX = Number.NaN;        // wymus redraw bryly po powrocie w kadr
        }

        const time = Date.now();
        const hs = this.size / 2;
        const cameraCenterX = camX + screenW / 2;
        const cameraCenterY = camY + screenH / 2;

        // MIGOTANIE osobno od bryly — patrz komentarz przy `gfxSparkle`.
        // Bryla zalezy WYLACZNIE od kamery, wiec przy nieruchomej kamerze (gracz stoi,
        // celuje, czyta HUD) nie ma czego przeliczac.
        if (cameraCenterX === this.lastCamCX && cameraCenterY === this.lastCamCY) {
            this.drawSparkle(time);
            return;
        }
        this.lastCamCX = cameraCenterX;
        this.lastCamCY = cameraCenterY;

        const g = this.gfxDynamic;
        g.clear();

        // 2.5D APEX — przesunięcie szczytu względem kamery (used visualX/Y, NIE this.x/y które są top-left hitboxu)
        const apexX = (this.visualX - cameraCenterX) * Pyramid.HEIGHT_FACTOR;
        const apexY = (this.visualY - cameraCenterY) * Pyramid.HEIGHT_FACTOR;
        this.apexX = apexX;
        this.apexY = apexY;

        const tl = { x: -hs, y: -hs };
        const tr = { x: hs,  y: -hs };
        const br = { x: hs,  y: hs };
        const bl = { x: -hs, y: hs };
        const apex = { x: apexX, y: apexY };

        if (this.artV2) {
            this.drawBodyV2(g, tl, tr, br, bl, apex);
            this.drawSparkle(time);
            return;
        }

        // 1. ŚCIANY GŁÓWNE (4 trapezoidy zbiegające się w apex)
        g.beginFill(PALETTE.sandSunlit);
        g.drawPolygon([tl.x, tl.y, tr.x, tr.y, apex.x, apex.y]);
        g.endFill();
        g.beginFill(PALETTE.sandMid1);
        g.drawPolygon([tl.x, tl.y, bl.x, bl.y, apex.x, apex.y]);
        g.endFill();
        g.beginFill(PALETTE.sandMid2);
        g.drawPolygon([tr.x, tr.y, br.x, br.y, apex.x, apex.y]);
        g.endFill();
        g.beginFill(PALETTE.sandShadow);
        g.drawPolygon([bl.x, bl.y, br.x, br.y, apex.x, apex.y]);
        g.endFill();
        
        // 2. 12 SCHODKÓW (koncentryczne prostokąty kurczące się do apex)
        for (let i = 1; i <= Pyramid.STEPS_COUNT; i++) {
            const t = i / (Pyramid.STEPS_COUNT + 1);
            const pTL = { x: tl.x + (apex.x - tl.x) * t, y: tl.y + (apex.y - tl.y) * t };
            const pTR = { x: tr.x + (apex.x - tr.x) * t, y: tr.y + (apex.y - tr.y) * t };
            const pBR = { x: br.x + (apex.x - br.x) * t, y: br.y + (apex.y - br.y) * t };
            const pBL = { x: bl.x + (apex.x - bl.x) * t, y: bl.y + (apex.y - bl.y) * t };
            
            g.lineStyle(1.5, PALETTE.stepShadow, 0.25 - (t * 0.1));
            g.moveTo(pTL.x, pTL.y); g.lineTo(pTR.x, pTR.y);
            g.lineTo(pBR.x, pBR.y); g.lineTo(pBL.x, pBL.y);
            g.lineTo(pTL.x, pTL.y);
            
            g.lineStyle(1, 0xffffff, 0.15 - (t * 0.1));
            g.moveTo(pBL.x, pBL.y); g.lineTo(pTL.x, pTL.y); g.lineTo(pTR.x, pTR.y);
        }
        
        // 3. KRAWĘDZIE WIREFRAME (4 linie base → apex)
        g.lineStyle(2, PALETTE.stepShadow, 0.4);
        g.moveTo(tl.x, tl.y); g.lineTo(apex.x, apex.y);
        g.moveTo(tr.x, tr.y); g.lineTo(apex.x, apex.y);
        g.moveTo(bl.x, bl.y); g.lineTo(apex.x, apex.y);
        g.moveTo(br.x, br.y); g.lineTo(apex.x, apex.y);
        
        // 4. PYRAMIDION (mała piramidka złota na samym czubku, 4 ściany)
        const pyrT = 0.90;
        const pTL = { x: tl.x + (apex.x - tl.x) * pyrT, y: tl.y + (apex.y - tl.y) * pyrT };
        const pTR = { x: tr.x + (apex.x - tr.x) * pyrT, y: tr.y + (apex.y - tr.y) * pyrT };
        const pBR = { x: br.x + (apex.x - br.x) * pyrT, y: br.y + (apex.y - br.y) * pyrT };
        const pBL = { x: bl.x + (apex.x - bl.x) * pyrT, y: bl.y + (apex.y - bl.y) * pyrT };
        
        g.lineStyle(0);
        g.beginFill(PALETTE.pyramidionGold);
        g.drawPolygon([pTL.x, pTL.y, pTR.x, pTR.y, apex.x, apex.y]); // N (sunlit)
        g.drawPolygon([pTL.x, pTL.y, pBL.x, pBL.y, apex.x, apex.y]); // W (sunlit)
        g.endFill();
        
        g.beginFill(PALETTE.pyramidionShadow);
        g.drawPolygon([pTR.x, pTR.y, pBR.x, pBR.y, apex.x, apex.y]); // E (shadow)
        g.drawPolygon([pBL.x, pBL.y, pBR.x, pBR.y, apex.x, apex.y]); // S (shadow)
        g.endFill();
        
        // 5. MAGICZNY REFLEKS NA CZUBKU — rysowany osobno (patrz `drawSparkle`).
        this.drawSparkle(time);
    }

    /**
     * Migotanie na czubku: dwa kolka w rytmie `sin(time)`. Wydzielone z `update()`,
     * zeby samo migotanie nie ciagnelo za soba pelnego redrawu bryly — to byl caly
     * powod, dla ktorego piramida przeliczala 12 schodkow w kazdej klatce.
     */
    private drawSparkle(time: number): void {
        const s = this.gfxSparkle;
        s.clear();
        const sparkle = 0.7 + Math.sin(time / 100 + this.seed) * 0.3;
        s.beginFill(0xffffff, 0.85 * sparkle);
        s.drawCircle(this.apexX - 1, this.apexY - 1, 2.5);
        s.endFill();

        // Subtle aureola wokół refleksu
        s.beginFill(0xfff4a0, 0.25 * sparkle);
        s.drawCircle(this.apexX, this.apexY, 6);
        s.endFill();

        // E5 flex: rozblysk pyramidionu po zdjeciu klatwy (zloty pierscien + promienie)
        if (this.flashLeft > 0) {
            this.flashLeft--;
            const k = Math.min(1, this.flashLeft / 40);
            s.beginFill(0xffd84a, 0.45 * k);
            s.drawCircle(this.apexX, this.apexY, 14 + (1 - k) * 18);
            s.endFill();
            s.lineStyle(3, 0xfff4b0, 0.8 * k);
            for (let r = 0; r < 8; r++) {
                const a = (r / 8) * Math.PI * 2 + this.flashLeft * 0.05;
                s.moveTo(this.apexX + Math.cos(a) * 8, this.apexY + Math.sin(a) * 8);
                s.lineTo(this.apexX + Math.cos(a) * (26 + (1 - k) * 14), this.apexY + Math.sin(a) * (26 + (1 - k) * 14));
            }
            s.lineStyle(0);
        }
    }
}