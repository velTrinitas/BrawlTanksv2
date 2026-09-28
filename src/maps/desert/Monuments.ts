import * as PIXI from 'pixi.js';
import type { ICollidable } from '../../types/MapType';
import type { RiverNile } from './RiverNile';
import { bakeToSprite } from '../propBaker';
import { DesertJuice } from './DesertJuice';

/** HP zabytkow (Twardy 100/strzal): obelisk 12, kolos 20, wieza pylonu 24 strzaly. */
const HP = { obelisk: 1200, colossus: 2000, pylon: 2400 };

/**
 * Monuments — DESERT ART v2 / E6. Pomysly historyczne zatwierdzone 2026-09-28:
 *  - Obelisk z hieroglifami, cien jak wskazowka zegara slonecznego (obraca sie w meczu),
 *  - Brama pylonu swiatyni (dwie wieze, srodek wolny — przejazd),
 *  - Kolosy Memnona (2 siedzace posagi nad Nilem, duze oslony),
 *  - Szaduf (zuraw do wody) przy oazie — animowany,
 *  - Feluki na Nilu — plyna z pradem (ambient, bez kolizji).
 * (Kartusz z nickiem jest w Pyramid.showCartouche — E5.)
 *
 * KONWENCJE: ICollidable x/y = TOP-LEFT hitboxa; hitbox = PODSTAWA bryly (czytelnosc:
 * to, co stoi na ziemi, blokuje; to, co „wystaje w gore", jest tylko rysunkiem —
 * jak palmy). Rozmieszczenie math-verified skryptem (DesertMap.ts: DESERT_MONUMENTS_V2).
 * Art pieczony raz (propBaker), slonce NW wspolne dla mapy.
 *
 * COOP/MP: przeszkody statyczne (stan gry = tylko ich AABB, stale). Cien obelisku,
 * szaduf i feluki to lokalny wizual (licznik krokow, bez RNG).
 */

const STONE = { light: 0xf0d6a4, mid: 0xd4b07a, dark: 0x9a7444, deep: 0x5e4424 };

function baked(key: string, draw: (g: PIXI.Graphics) => void): PIXI.Sprite | null {
    const g = new PIXI.Graphics();
    draw(g);
    const s = bakeToSprite(g, key);
    g.destroy();
    return s;
}

/**
 * Wspolna baza przeszkody z pieczonym artem — ZNISZCZALNA (uwaga Mariusza 2026-09-28):
 * duzo HP (trzeba dluzej strzelac), efekty jak piaskowiec (odpryski z grawitacja, rozpad
 * na bryly + kupka gruzu), 3 stany uszkodzen (rysy + przyciemnienie), odrodzenie po 90 s.
 *
 * KOSZT MOBILE: trafienie = istniejace pule (DesertJuice: bryly max 36, czastki Effects);
 * rysy = jeden maly Graphics rysowany RAZ na stan (nie per klatke); zadnych nowych tekstur.
 * Czyli tyle, co piaskowiec — dlatego zniszczalnosc zostaje wlaczona.
 *
 * COOP/MP: HP i odrodzenie to stan gry — licza sie w `update()` wolanym z `buildings.forEach`
 * w runLogicStep (staly krok 1/60). Pociski gracza I wrogow (duck-typing takeDamage).
 */
abstract class StaticMonument implements ICollidable {
    public x: number;
    public y: number;
    public w: number;
    public h: number;
    public isDestroyed = false;
    protected container: PIXI.Container;
    private cracks: PIXI.Graphics;
    private readonly cx: number;
    private readonly cy: number;
    private readonly bw: number;
    private readonly bh: number;
    private readonly maxHp: number;
    private hp: number;
    private stage = 0;
    private respawn = 0;
    private static readonly RESPAWN_S = 90;

    constructor(cx: number, cy: number, w: number, h: number, worldContainer: PIXI.Container, maxHp: number) {
        this.cx = cx; this.cy = cy; this.bw = w; this.bh = h;
        this.w = w; this.h = h;
        this.x = cx - w / 2;
        this.y = cy - h / 2;
        this.maxHp = maxHp;
        this.hp = maxHp;
        this.container = new PIXI.Container();
        this.cracks = new PIXI.Graphics();
        this.container.x = cx;
        this.container.y = cy;
        this.container.zIndex = cy + h / 2;       // Y-sort po dolnej krawedzi podstawy
        worldContainer.addChild(this.container);
    }

    protected mount(spr: PIXI.Sprite | null, what: string): void {
        if (spr) this.container.addChild(spr);
        else console.error(`[Monuments] ${what}: brak renderera do pieczenia`, { x: this.x, y: this.y });
        this.container.addChild(this.cracks);    // rysy nad artem
    }

    /** Wysokosc bryly w gore ekranu (dla rys i punktu rozpadu). */
    protected abstract readonly artHeight: number;

    public takeDamage(dmg: number, hitX: number, hitY: number): void {
        if (this.isDestroyed) return;
        this.hp -= dmg;
        DesertJuice.active?.hitStone(hitX, hitY);
        if (this.hp <= 0) { this.crumble(); return; }
        const s = this.hp > this.maxHp * 0.66 ? 0 : this.hp > this.maxHp * 0.33 ? 1 : 2;
        if (s !== this.stage) { this.stage = s; this.drawCracks(); }
    }

    /** Rysy rosna ze stanem; rysowane RAZ przy zmianie stanu. Deterministyczne (bez RNG). */
    private drawCracks(): void {
        const g = this.cracks;
        g.clear();
        this.container.children.forEach(c => { if (c instanceof PIXI.Sprite) c.tint = this.stage === 2 ? 0xc8b8a0 : this.stage === 1 ? 0xe8dcc8 : 0xffffff; });
        if (this.stage === 0) return;
        const H = this.artHeight;
        g.lineStyle(1.8 + this.stage * 0.5, 0x2a1808, 0.8);
        const n = this.stage * 3;
        for (let c = 0; c < n; c++) {
            const hh = (k: number) => { const v = Math.sin((c * 7 + k) * 12.9898 + this.cx) * 43758.5453; return v - Math.floor(v); };
            let x = (hh(1) - 0.5) * this.bw * 0.7;
            let y = -hh(2) * H * 0.9;
            g.moveTo(x, y);
            for (let s = 0; s < 3; s++) {
                x += (hh(s + 3) - 0.5) * 16;
                y += 8 + hh(s + 6) * 12;
                g.lineTo(x, y);
            }
        }
        g.lineStyle(0);
    }

    private crumble(): void {
        this.isDestroyed = true;
        this.respawn = StaticMonument.RESPAWN_S;
        this.w = 0; this.h = 0;
        this.container.visible = false;
        DesertJuice.active?.bigCrumble(this.cx, this.cy - this.artHeight * 0.3, this.bw);
    }

    update(_camX?: number, _camY?: number, _w?: number, _h?: number): void {
        if (!this.isDestroyed) return;
        this.respawn -= 1 / 60;
        if (this.respawn > 0) return;
        this.isDestroyed = false;
        this.hp = this.maxHp;
        this.stage = 0;
        this.drawCracks();
        this.w = this.bw; this.h = this.bh;
        this.container.visible = true;
        DesertJuice.active?.hitStone(this.cx, this.cy);
    }
}

// =================================================================
// OBELISK — cien jak zegar sloneczny
// =================================================================

export class Obelisk extends StaticMonument {
    private shadow: PIXI.Sprite | null;
    private step = 0;
    private static readonly BASE = 28;
    private static readonly HEIGHT = 120;

    constructor(cx: number, cy: number, worldContainer: PIXI.Container) {
        super(cx, cy, Obelisk.BASE, Obelisk.BASE, worldContainer, HP.obelisk);
        const H = Obelisk.HEIGHT;
        // Cien: dlugi klin od podstawy; obracany wokol podstawy (wskazowka zegara)
        this.shadow = baked('mon_obelisk_shadow', g => {
            g.beginFill(0x000000, 0.001); g.drawRect(-10, -10, 20, 20); g.endFill();   // kotwica w podstawie
            g.beginFill(0x000000, 0.24);
            g.drawPolygon([-8, -3, H * 1.25, -1.5, H * 1.35, 0, H * 1.25, 1.5, -8, 3]);
            g.endFill();
        });
        if (this.shadow) {
            this.shadow.zIndex = -1;
            this.container.addChild(this.shadow);
        }
        this.mount(baked('mon_obelisk', g => {
            const B = Obelisk.BASE;
            // cokol
            g.beginFill(STONE.deep); g.drawRect(-B / 2 - 4 + 2, -8 + 2, B + 8, 14); g.endFill();
            g.beginFill(STONE.mid); g.drawRect(-B / 2 - 4, -8, B + 8, 14); g.endFill();
            g.beginFill(STONE.light); g.drawRect(-B / 2 - 4, -8, B + 8, 3); g.endFill();
            // trzon (zweza sie ku gorze): sciana jasna + ciemna
            const bw = 11, tw = 7;
            g.beginFill(0xc89a64);
            g.drawPolygon([-bw, -8, 0, -8, 0, -H, -tw, -H + 2]);
            g.endFill();
            g.beginFill(0x9a6e3e);
            g.drawPolygon([0, -8, bw, -8, tw, -H + 2, 0, -H]);
            g.endFill();
            g.lineStyle(1.2, 0xfff0cc, 0.5); g.moveTo(-bw, -8); g.lineTo(-tw, -H + 2); g.lineStyle(0);
            // hieroglify w kolumnie
            g.beginFill(0x5e3e1c, 0.75);
            for (let i = 0; i < 9; i++) {
                const y = -18 - i * 10;
                const k = i % 3;
                if (k === 0) g.drawEllipse(-4, y, 2.6, 1.4);
                else if (k === 1) g.drawRect(-6, y - 1, 5, 2);
                else g.drawPolygon([-7, y + 2, -4, y - 2, -2, y + 2]);
            }
            g.endFill();
            // zloty pyramidion
            g.beginFill(0xffe24a); g.drawPolygon([-tw, -H + 2, 0, -H - 12, 0, -H]); g.endFill();
            g.beginFill(0xc08a10); g.drawPolygon([0, -H, 0, -H - 12, tw, -H + 2]); g.endFill();
        }), 'obelisk');
    }

    /** Wskazowka zegara: cien obraca sie o ~70 stopni w ciagu 5 minut meczu (tylko wizual). */
    protected readonly artHeight = 130;

    override update(): void {
        super.update();
        this.step++;
        if (this.shadow) this.shadow.rotation = 0.25 + Math.min(1.25, this.step / 18000 * 1.25);
    }
}

// =================================================================
// PYLON — wieza bramy swiatyni (para = brama, srodek wolny)
// =================================================================

export class PylonTower extends StaticMonument {
    static readonly W = 90;
    static readonly D = 60;
    protected readonly artHeight = 110;

    constructor(cx: number, cy: number, mirror: boolean, worldContainer: PIXI.Container) {
        super(cx, cy, PylonTower.W, PylonTower.D, worldContainer, HP.pylon);
        const spr = baked('mon_pylon', g => {
            const W = PylonTower.W, D = PylonTower.D, H = 105;
            const hw = W / 2, hd = D / 2;
            // cien SE
            g.beginFill(0x000000, 0.2);
            g.drawPolygon([hw, -hd, hw + 50, -hd + 30, hw + 50, hd + 30, -hw + 20, hd + 18, -hw, hd]);
            g.endFill();
            // bok (grubosc) — widoczny od S
            g.beginFill(STONE.dark);
            g.drawPolygon([-hw, hd, hw, hd, hw - 10, hd - H * 0.25, -hw + 10, hd - H * 0.25]);
            g.endFill();
            // front (skarpa: pochylone sciany zwezajace sie ku gorze)
            g.beginFill(STONE.mid);
            g.drawPolygon([-hw, hd, hw, hd, hw - 12, hd - H, -hw + 12, hd - H]);
            g.endFill();
            g.beginFill(STONE.light, 0.7);
            g.drawPolygon([-hw, hd, -hw + 20, hd, -hw + 26, hd - H, -hw + 12, hd - H]);
            g.endFill();
            g.beginFill(0x000000, 0.18);
            g.drawPolygon([hw - 22, hd, hw, hd, hw - 12, hd - H, hw - 26, hd - H]);
            g.endFill();
            // warstwy blokow
            g.lineStyle(1, STONE.deep, 0.35);
            for (let i = 1; i < 9; i++) {
                const y = hd - (H * i) / 9;
                const inset = (12 * i) / 9;
                g.moveTo(-hw + inset, y); g.lineTo(hw - inset, y);
            }
            g.lineStyle(0);
            // relief faraona (sylwetka z uniesiona reka) + kartusze
            g.beginFill(0x6a4a24, 0.55);
            g.drawCircle(-6, hd - 70, 5);
            g.drawRect(-10, hd - 65, 9, 22);
            g.drawRect(-1, hd - 64, 14, 3);
            g.drawRect(-10, hd - 43, 3, 14); g.drawRect(-4, hd - 43, 3, 14);
            g.endFill();
            g.lineStyle(1.5, 0x6a4a24, 0.55);
            g.drawRoundedRect(14, hd - 72, 10, 22, 5);
            g.lineStyle(0);
            // gzyms (kornisz) z cieniem
            g.beginFill(STONE.deep); g.drawRect(-hw + 8, hd - H - 2, W - 16, 6); g.endFill();
            g.beginFill(STONE.light); g.drawRect(-hw + 6, hd - H - 8, W - 12, 7); g.endFill();
            // gniazda masztow z proporcami (ku bramie)
            g.beginFill(STONE.deep); g.drawRect(hw - 20, hd - H + 6, 5, H - 20); g.endFill();
        });
        if (spr && mirror) spr.scale.x = -1;       // proporce zawsze od strony przejazdu
        this.mount(spr, 'pylon');
    }
}

// =================================================================
// KOLOS MEMNONA — siedzacy faraon na tronie
// =================================================================

export class Colossus extends StaticMonument {
    static readonly W = 70;
    static readonly D = 80;
    protected readonly artHeight = 130;

    constructor(cx: number, cy: number, variant: number, worldContainer: PIXI.Container) {
        super(cx, cy, Colossus.W, Colossus.D, worldContainer, HP.colossus);
        this.mount(baked(`mon_colossus:${variant % 2}`, g => {
            const hw = Colossus.W / 2, hd = Colossus.D / 2;
            const worn = variant % 2 === 1;        // drugi kolos bardziej zerodowany (jak w Tebach)
            // cien SE
            g.beginFill(0x000000, 0.22);
            g.drawPolygon([hw, -hd, hw + 55, -hd + 35, hw + 50, hd + 30, -hw + 18, hd + 16, -hw, hd]);
            g.endFill();
            // cokol
            g.beginFill(STONE.deep); g.drawRect(-hw + 2, hd - 16 + 2, Colossus.W, 16); g.endFill();
            g.beginFill(STONE.dark); g.drawRect(-hw, hd - 16, Colossus.W, 16); g.endFill();
            g.beginFill(STONE.mid); g.drawRect(-hw, hd - 16, Colossus.W, 3); g.endFill();
            // tron (bok z reliefem)
            g.beginFill(0x8a6238); g.drawRect(-hw + 4, hd - 70, Colossus.W - 8, 54); g.endFill();
            g.beginFill(0xa87a48); g.drawRect(-hw + 4, hd - 70, 12, 54); g.endFill();
            // nogi (golenie) + stopy
            g.beginFill(STONE.mid); g.drawRect(-18, hd - 52, 14, 36); g.drawRect(4, hd - 52, 14, 36); g.endFill();
            g.beginFill(STONE.light, 0.7); g.drawRect(-18, hd - 52, 4, 36); g.drawRect(4, hd - 52, 4, 36); g.endFill();
            g.beginFill(STONE.dark); g.drawRect(-20, hd - 18, 17, 6); g.drawRect(3, hd - 18, 17, 6); g.endFill();
            // uda + tulow
            g.beginFill(STONE.mid); g.drawRoundedRect(-22, hd - 64, 44, 16, 5); g.endFill();
            g.beginFill(0xc89a64); g.drawRoundedRect(-17, hd - 108, 34, 46, 8); g.endFill();
            g.beginFill(STONE.light, 0.6); g.drawRoundedRect(-17, hd - 108, 10, 46, 5); g.endFill();
            g.beginFill(0x000000, 0.18); g.drawRoundedRect(8, hd - 108, 9, 46, 5); g.endFill();
            // dlonie na kolanach
            g.beginFill(STONE.light); g.drawEllipse(-11, hd - 60, 6, 4); g.drawEllipse(11, hd - 60, 6, 4); g.endFill();
            // glowa w nemes (zerodowana twarz)
            g.beginFill(STONE.dark); g.drawPolygon([-16, hd - 104, 16, hd - 104, 11, hd - 128, -11, hd - 128]); g.endFill();
            g.beginFill(STONE.mid); g.drawEllipse(0, hd - 118, 9, 11); g.endFill();
            g.beginFill(STONE.light, 0.6); g.drawEllipse(-3, hd - 121, 4, 6); g.endFill();
            g.beginFill(STONE.deep, worn ? 0.8 : 0.5);
            g.drawEllipse(1, hd - 116, worn ? 6 : 3, worn ? 7 : 3);  // odlupana twarz
            g.endFill();
            // pekniecia erozji
            g.lineStyle(1.4, STONE.deep, 0.6);
            g.moveTo(-8, hd - 100); g.lineTo(-3, hd - 88); g.lineTo(-6, hd - 76);
            if (worn) { g.moveTo(10, hd - 96); g.lineTo(5, hd - 82); g.lineTo(9, hd - 70); }
            g.lineStyle(0);
        }), 'colossus');
    }
}

// =================================================================
// SZADUF — zuraw do wody przy oazie (animowany, bez kolizji)
// =================================================================

export class Shaduf {
    private container: PIXI.Container;
    private beam: PIXI.Graphics;
    private step = 0;

    constructor(x: number, y: number, worldContainer: PIXI.Container) {
        this.container = new PIXI.Container();
        this.beam = new PIXI.Graphics();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y;
        const post = baked('mon_shaduf_post', g => {
            g.beginFill(0x000000, 0.2); g.drawEllipse(8, 2, 14, 4); g.endFill();
            g.beginFill(0x6a4424); g.drawRect(-3, -46, 6, 46); g.endFill();
            g.beginFill(0x9a6a3e); g.drawRect(-3, -46, 2, 46); g.endFill();
            g.beginFill(0x4a2c14); g.drawRect(-5, -48, 10, 4); g.endFill();
        });
        if (post) this.container.addChild(post);
        this.beam.y = -46;
        this.container.addChild(this.beam);
        worldContainer.addChild(this.container);
    }

    /** Belka waha sie: wiadro w dol do stawu, przeciwwaga (kamien z gliny) w gore. */
    update(): void {
        this.step++;
        const a = Math.sin(this.step * 0.02) * 0.35;
        const g = this.beam;
        g.clear();
        const L1 = 34, L2 = 20;                 // ramie z wiadrem (W) / z przeciwwaga (E)
        const bx = -Math.cos(a) * L1, by = -Math.sin(a) * L1 * 0.6;
        const cx = Math.cos(a) * L2, cy = Math.sin(a) * L2 * 0.6;
        g.lineStyle(3, 0x7a5030, 1); g.moveTo(bx, by); g.lineTo(cx, cy);
        g.lineStyle(1, 0x3a2410, 1); g.moveTo(bx, by); g.lineTo(bx, by + 22);
        g.lineStyle(0);
        g.beginFill(0x5a3a1c); g.drawRoundedRect(bx - 4, by + 20, 8, 7, 2); g.endFill();   // wiadro
        g.beginFill(0x8a6a4a); g.drawCircle(cx + 2, cy + 3, 5.5); g.endFill();          // przeciwwaga
        g.beginFill(0xb08a64); g.drawCircle(cx + 0.5, cy + 1.5, 2.5); g.endFill();
    }
}

// =================================================================
// FELUKI — lodzie z trojkatnym zaglem plynace z pradem (ambient)
// =================================================================

export class FeluccaFleet {
    private boats: { spr: PIXI.Sprite; t: number; speed: number }[] = [];
    private river: RiverNile;
    private len: number;

    constructor(river: RiverNile, count: number, worldContainer: PIXI.Container) {
        this.river = river;
        this.len = river.getLength();
        for (let i = 0; i < count; i++) {
            const spr = baked(`mon_felucca:${i % 2}`, g => {
                const sail = i % 2 === 0 ? 0xf6f0e0 : 0xe8d8b8;
                g.beginFill(0x000000, 0.22); g.drawEllipse(3, 3, 22, 7); g.endFill();
                // kadlub (dziob w +X)
                g.beginFill(0x5a3a1c); g.drawPolygon([-20, -5, 14, -5, 24, 0, 14, 5, -20, 5, -23, 0]); g.endFill();
                g.beginFill(0x8a5e32); g.drawPolygon([-18, -3.5, 13, -3.5, 20, 0, 13, 3.5, -18, 3.5]); g.endFill();
                g.lineStyle(1, 0xc89a60, 0.8); g.moveTo(-18, 0); g.lineTo(18, 0); g.lineStyle(0);
                // trojkatny zagiel lacinski (rzut z gory: klin z cieniem)
                g.beginFill(0x000000, 0.15); g.drawPolygon([-6, 2, 20, -22, 4, 6]); g.endFill();
                g.beginFill(sail); g.drawPolygon([-8, 0, 18, -24, 2, 3]); g.endFill();
                g.lineStyle(1.2, 0x6a4a24, 0.9); g.moveTo(-10, 2); g.lineTo(20, -26); g.lineStyle(0);
            });
            if (!spr) continue;
            spr.zIndex = 56;                          // nad woda, pod mostami (60) — przeplywa pod nimi
            worldContainer.addChild(spr);
            this.boats.push({ spr, t: (i + 0.3) / count, speed: 0.35 + i * 0.06 });
        }
    }

    update(): void {
        for (const b of this.boats) {
            b.t += b.speed / this.len;
            if (b.t > 0.97) b.t = 0.03;                 // wraca do zrodla (poza kadrem w rogu)
            const f = this.river.sampleFlow(b.t);
            b.spr.x = f.x + -f.dy * 14;                  // plynie przy jednym brzegu
            b.spr.y = f.y + f.dx * 14;
            b.spr.rotation = Math.atan2(f.dy, f.dx);
            b.spr.alpha = Math.min(1, (b.t - 0.03) / 0.03, (0.97 - b.t) / 0.03);
        }
    }
}
