import * as PIXI from 'pixi.js';
import type { Player } from '../../entities/Player';
import type { EffectsManager } from '../../rendering/Effects';
import { checkRectCollision } from '../Physics';
import { t } from '../../i18n/i18n';
import { AudioSys } from '../../audio/AudioSys'; // v0.196.0 — dzwiek wyrzutu

/**
 * GRUPA E — WYSKOK Z ZAMKU przez TRAMPOLINY (v0.194.0, decyzja Mariusza: skok ZAWSZE dostepny,
 * bez przycisku i bez klawisza — wjazd na trampoline = wyrzut).
 *
 * - 2 trampoliny w WEWNETRZNYCH naroznikach dziedzinca (NW i SE). Wyrzut po skosie NA ZEWNATRZ,
 *   nad narozna wieza i fosa, na droge pierscieniowa. Do srodka skoczyc sie nie da (trampoliny
 *   stoja tylko na dziedzincu) — mury i bramy nie traca sensu.
 * - Pozycje i ladowiska zweryfikowane AABB (skrypt Node, 58 solidow z layoutu + pady po -10%:
 *   0 kolizji). W grze ladowisko jest i tak sprawdzane z prawdziwa tablica `buildings`
 *   (maszyny, siano itd.); jak zajete — proba przesuniecia w poprzek lotu, a jak nic — komunikat.
 * - Odnowienie OSOBNE dla kazdej trampoliny (25 s; v0.194.0 decyzja Mariusza — wczesniej bylo
 *   wspolne). Trampolina w odnowieniu jest przygaszona + pierscien postepu + licznik;
 *   gotowa sprezynuje (Sensoryka).
 * - Po wyrzucie/blokadzie trampolina jest "rozbrojona", dopoki gracz z niej nie zjedzie —
 *   inaczej stanie na niej po odnowieniu wystrzeliloby gracza bez jego woli.
 * - W locie: zero sterowania i strzalu, gracz NIETYKALNY (main.ts: `isAirborne()`).
 * - Wizual lotu wg `SkyTraffic` ("decoupled shadow"): cien zostaje na ziemi i maleje.
 */

export const CASTLE_JUMP_CONFIG = {
    /** Odnowienie (ms), OSOBNE dla kazdej trampoliny (v0.194.0, decyzja Mariusza). */
    cooldownMs: 25000,
    /** Czas lotu w klatkach logiki (60/s). Dluzszy niz przy skoku od muru — lot ~393 px po skosie. */
    flightFrames: 54,
    /** Szczyt luku (px swiata). */
    peakLift: 100,
    /** Promien, w ktorym srodek czolgu "stoi na trampolinie". */
    triggerRadius: 26,
    /** Zjazd dalej niz tyle = trampolina znow uzbrojona. */
    rearmRadius: 52,
    /** Wizualny promien trampoliny (px swiata). */
    visualRadius: 32,
    /** Promien czolgu w kolizji (Player.ts: 20) + zapas. */
    landRadius: 26,
};

/**
 * Trampoliny: srodek + ladowisko. Wybor narozy NW/SE: pady (medi NW, power SE) zostaja na swoich
 * miejscach, trampoliny siedza w rogu miedzy padem a wieza (dystans do padu > zasiegu padu).
 * `dir` = kierunek strzalki (radiany, 0 = wschod).
 */
// v0.194.0 (Mariusz): +5 px od murow po przekatnej (bylo 1208/1792). Rog wiezy narozne
// (1182,1182) jest 43.8 px od srodka — dalej niz obrecz (R+2 = 34), wiec bez kolizji.
const TRAMPOLINES: ReadonlyArray<{ x: number; y: number; landX: number; landY: number; dir: number }> = [
    { x: 1213, y: 1213, landX: 930, landY: 930, dir: -3 * Math.PI / 4 },  // NW -> na zewnatrz NW
    { x: 1787, y: 1787, landX: 2070, landY: 2070, dir: Math.PI / 4 },     // SE -> na zewnatrz SE
];

const TEX_RES = 2;

let baseTex: PIXI.Texture | null = null;
let arrowTex: PIXI.Texture | null = null;

/**
 * Plyta trampoliny — pieczona raz (AA z Canvas 2D, 2x res).
 *
 * v0.194.0 (Mariusz: "plaskie jak nalesniki") — FAKE-3D: cien kontaktowy pod cala bryla,
 * nozki wystajace spod ramy, BOK ramy (grubosc, ciemny, przesuniety w dol), gorna obrecz
 * z gradientem NW->SE i blikiem, mata WKLESLA (ciemny srodek, jasny rant + wewnetrzny cien
 * od strony swiatla). Plotno wieksze o LEG_PAD na nozki i cien; srodek obreczy = srodek
 * plotna, wiec anchor 0.5 i animacja ugiecia dzialaja jak dotad.
 */
const RIM_T = 6;     // grubosc boku ramy (px swiata)
const LEG_PAD = 16;  // zapas plotna na nozki + cien
function getBaseTexture(): PIXI.Texture {
    if (baseTex) return baseTex;
    const R = CASTLE_JUMP_CONFIG.visualRadius;
    const S = (R + LEG_PAD) * 2;
    const cv = document.createElement('canvas');
    cv.width = S * TEX_RES; cv.height = S * TEX_RES;
    const c = cv.getContext('2d');
    if (!c) return PIXI.Texture.WHITE;
    c.scale(TEX_RES, TEX_RES);
    c.translate(S / 2, S / 2);
    const OUT = '#141a20';

    // CIEN KONTAKTOWY — miekka elipsa przesunieta SE (swiatlo NW)
    let g = c.createRadialGradient(4, 10, R * 0.4, 4, 10, R + 10);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(4, 10, R + 10, R + 6, 0, 0, Math.PI * 2); c.fill();

    // NOZKI — stalowe slupki spod ramy (widac tylko te "z przodu", od poludnia)
    for (const deg of [35, 90, 145]) {
        const a = deg * Math.PI / 180;
        const x = Math.cos(a) * (R - 3), y = Math.sin(a) * (R - 3);
        g = c.createLinearGradient(x - 3, 0, x + 3, 0);
        g.addColorStop(0, '#8c98a4'); g.addColorStop(1, '#3a444e');
        c.fillStyle = g;
        c.fillRect(x - 3, y, 6, RIM_T + 9);
        c.strokeStyle = OUT; c.lineWidth = 1.5;
        c.strokeRect(x - 3, y, 6, RIM_T + 9);
        c.fillStyle = '#20272e'; // stopka
        c.beginPath(); c.ellipse(x, y + RIM_T + 9, 4.5, 2, 0, 0, Math.PI * 2); c.fill();
    }

    // BOK RAMY — okrag przesuniety w dol o grubosc, ciemny: z tego czyta sie bryla
    g = c.createLinearGradient(-R, 0, R, 0);
    g.addColorStop(0, '#4a5560'); g.addColorStop(0.5, '#2c353e'); g.addColorStop(1, '#161c22');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, RIM_T, R + 2, 0, Math.PI * 2); c.fill();
    c.fillRect(-(R + 2), 0, (R + 2) * 2, RIM_T);
    c.strokeStyle = OUT; c.lineWidth = 2.5;
    c.beginPath(); c.arc(0, RIM_T, R + 2, 0, Math.PI); c.stroke();
    c.beginPath();
    c.moveTo(-(R + 2), 0); c.lineTo(-(R + 2), RIM_T);
    c.moveTo(R + 2, 0); c.lineTo(R + 2, RIM_T);
    c.stroke();

    // GORNA OBRECZ — stal, gradient NW (jasno) -> SE (ciemno)
    g = c.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, '#e2e9ef'); g.addColorStop(0.45, '#9aa7b3'); g.addColorStop(1, '#4b5763');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, R + 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 2.5; c.stroke();

    // MATA — WKLESLA: ciemny srodek, jasniejszy rant
    const mr = R - 8;
    g = c.createRadialGradient(1, 2, 1, 0, 0, mr);
    g.addColorStop(0, '#0c1a48'); g.addColorStop(0.6, '#1d3d98'); g.addColorStop(1, '#4a7de6');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, mr, 0, Math.PI * 2); c.fill();
    // wewnetrzny cien od strony swiatla (NW): rant rzuca cien w zaglebienie
    c.save();
    c.beginPath(); c.arc(0, 0, mr, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(0,0,0,0.38)';
    c.beginPath();
    c.arc(0, 0, mr + 1, 0, Math.PI * 2);
    c.arc(4, 5, mr, 0, Math.PI * 2, true);
    c.fill('evenodd');
    c.restore();
    c.strokeStyle = '#0a1636'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, mr, 0, Math.PI * 2); c.stroke();
    // SPREZYNY — zolte zygzaki miedzy mata a rama
    c.strokeStyle = '#ffd23f'; c.lineWidth = 1.8; c.lineCap = 'round';
    const N = 16;
    for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
        c.beginPath();
        for (let k = 0; k <= 4; k++) {
            const r = mr + (k / 4) * (R + 1 - mr);
            const off = (k % 2 === 0 ? 0 : (k === 1 ? 1.8 : -1.8));
            const x = ca * r + px * off, y = sa * r + py * off;
            if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
    }
    // ODBICIE swiatla na przeciwleglym (SE) zboczu zaglebienia maty
    c.fillStyle = 'rgba(160,200,255,0.22)';
    c.beginPath(); c.ellipse(7, 8, 10, 4.5, -0.7, 0, Math.PI * 2); c.fill();
    // BLIK na ramie (NW) — metal ma "blysnac"
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2.2;
    c.beginPath(); c.arc(0, 0, R, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
    baseTex = PIXI.Texture.from(cv);
    return baseTex;
}

/** Strzalka kierunku wyrzutu (czytelnosc: "ta rzecz wyrzuca TAM"). Rysowana w prawo, obracana. */
function getArrowTexture(): PIXI.Texture {
    if (arrowTex) return arrowTex;
    const W = 36, H = 30;
    const cv = document.createElement('canvas');
    cv.width = W * TEX_RES; cv.height = H * TEX_RES;
    const c = cv.getContext('2d');
    if (!c) return PIXI.Texture.WHITE;
    c.scale(TEX_RES, TEX_RES);
    c.translate(W / 2, H / 2);
    c.lineJoin = 'round';
    const chevron = (ox: number): void => {
        c.beginPath();
        c.moveTo(ox - 6, -10); c.lineTo(ox + 6, 0); c.lineTo(ox - 6, 10);
    };
    for (const ox of [-6, 7]) {
        chevron(ox);
        c.strokeStyle = '#1a1300'; c.lineWidth = 7; c.stroke();
        chevron(ox);
        c.strokeStyle = '#ffe14d'; c.lineWidth = 4; c.stroke();
    }
    arrowTex = PIXI.Texture.from(cv);
    return arrowTex;
}

interface TrampolineView {
    x: number; y: number; landX: number; landY: number; dir: number;
    root: PIXI.Container;
    base: PIXI.Sprite;
    arrow: PIXI.Sprite;
    ring: PIXI.Graphics;
    label: PIXI.Text;
    armed: boolean;
    squashT: number;     // >0 = animacja ugiecia po wyrzucie (klatki)
    lastLabel: string;
    readyAt: number;     // Date.now() gdy odnowienie TEJ trampoliny minie
}

export class CastleJump {
    private flightT = -1;          // -1 = na ziemi; 0..flightFrames = w locie
    private fromX = 0; private fromY = 0;
    private toX = 0; private toY = 0;
    private baseScaleX = 1; private baseScaleY = 1;
    private time = 0;
    private shadow: PIXI.Graphics;
    private tramps: TrampolineView[] = [];

    constructor(private worldContainer: PIXI.Container) {
        this.shadow = new PIXI.Graphics();
        this.shadow.beginFill(0x000000, 1);
        this.shadow.drawEllipse(0, 0, 30, 15);
        this.shadow.endFill();
        this.shadow.zIndex = 9; // warstwa gruntu (jak decale), pod wszystkim Y-sortowanym
        this.shadow.visible = false;
        worldContainer.addChild(this.shadow);

        for (const d of TRAMPOLINES) {
            const root = new PIXI.Container();
            root.x = d.x; root.y = d.y;
            root.zIndex = d.y; // jak pady (srodek) — czolg stojacy na niej (y+40) rysuje sie NAD nia
            const base = new PIXI.Sprite(getBaseTexture());
            base.anchor.set(0.5);
            base.scale.set(1 / TEX_RES);
            const arrow = new PIXI.Sprite(getArrowTexture());
            arrow.anchor.set(0.5);
            arrow.scale.set(1 / TEX_RES);
            arrow.rotation = d.dir;
            const ring = new PIXI.Graphics();
            const label = new PIXI.Text('', {
                fontFamily: 'Titan One, Arial', fontSize: 15,
                fill: 0xffffff, stroke: 0x000000, strokeThickness: 4,
            });
            label.anchor.set(0.5);
            label.visible = false;
            root.addChild(base, arrow, ring, label);
            worldContainer.addChild(root);
            this.tramps.push({ ...d, root, base, arrow, ring, label, armed: true, squashT: 0, lastLabel: '', readyAt: 0 });
        }
    }

    isAirborne(): boolean { return this.flightT >= 0; }

    private landingFor(tr: TrampolineView, buildings: ReadonlyArray<{ x: number; y: number; w: number; h: number }>): { x: number; y: number } | null {
        // Przesuniecia w POPRZEK lotu (prostopadle do kierunku wyrzutu).
        const px = -Math.sin(tr.dir), py = Math.cos(tr.dir);
        for (const shift of [0, 40, -40, 80, -80]) {
            const lx = tr.landX + px * shift, ly = tr.landY + py * shift;
            let free = true;
            for (const b of buildings) {
                if (checkRectCollision(b.x, b.y, b.w, b.h, lx, ly, CASTLE_JUMP_CONFIG.landRadius)) { free = false; break; }
            }
            if (free) return { x: lx, y: ly };
        }
        return null;
    }

    /**
     * Wolane w main.ts raz na krok logiki, PRZED ruchem gracza. Zwraca true, gdy gracz jest w locie
     * (main.ts pomija wtedy `localPlayer.update` i strzal).
     */
    update(delta: number, player: Player, buildings: ReadonlyArray<{ x: number; y: number; w: number; h: number }>,
           effects: EffectsManager, canAct: boolean, notify: (text: string, color: string) => void): boolean {
        const now = Date.now();
        this.time += delta;
        if (this.flightT < 0 && canAct) {
            const cfg = CASTLE_JUMP_CONFIG;
            for (const tr of this.tramps) {
                const d2 = (player.x - tr.x) ** 2 + (player.y - tr.y) ** 2;
                if (d2 > cfg.rearmRadius * cfg.rearmRadius) { tr.armed = true; continue; }
                if (!tr.armed || d2 > cfg.triggerRadius * cfg.triggerRadius || now < tr.readyAt) continue;
                tr.armed = false; // niezaleznie od wyniku: nastepna proba dopiero po zjechaniu
                const land = this.landingFor(tr, buildings);
                if (!land) { notify(t('castle.jump.blocked'), '#ffb347'); continue; }
                tr.squashT = 18;
                this.start(player, land, tr, effects, now);
                break;
            }
        }
        this.drawTrampolines(now, delta);
        if (this.flightT < 0) return false;

        this.flightT += delta;
        const F = CASTLE_JUMP_CONFIG.flightFrames;
        const k = Math.min(1, this.flightT / F);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
        const alt = Math.sin(Math.PI * k);                                  // 0 -> 1 -> 0
        player.x = this.fromX + (this.toX - this.fromX) * e;
        player.y = this.fromY + (this.toY - this.fromY) * e;
        const lift = alt * CASTLE_JUMP_CONFIG.peakLift;
        player.container.x = player.x;
        player.container.y = player.y - lift;
        player.container.scale.set(this.baseScaleX * (1 + alt * 0.25), this.baseScaleY * (1 + alt * 0.25));
        player.container.zIndex = 9000; // nad murami i wiezami w locie
        this.shadow.x = player.x + alt * 10; // swiatlo NW -> cien odsuwa sie SE
        this.shadow.y = player.y + 14 + alt * 12;
        this.shadow.scale.set(1 - alt * 0.45);
        // Mocniej niz SkyTraffic (0.34): cien pada tez na wode fosy, gdzie slaby cien znikal.
        this.shadow.alpha = 0.5 * (1 - alt * 0.4);
        if (k >= 1) this.land(player, effects);
        return true;
    }

    /** Gotowa: sprezynuje + strzalka pulsuje. Odnowienie: przygaszona + pierscien postepu + licznik. */
    private drawTrampolines(now: number, delta: number): void {
        const R = CASTLE_JUMP_CONFIG.visualRadius;
        for (const tr of this.tramps) {
            const cd = Math.max(0, tr.readyAt - now);
            const ready = cd <= 0;
            let sy = 1, sx = 1;
            if (tr.squashT > 0) {
                // UGIECIE po wyrzucie: mata zapada sie i odbija (tlumiony sinus)
                tr.squashT = Math.max(0, tr.squashT - delta);
                const p = 1 - tr.squashT / 18;
                const w = Math.sin(p * Math.PI * 3) * (1 - p);
                sy = 1 - 0.3 * w; sx = 1 + 0.15 * w;
            } else if (ready) {
                const b = Math.sin(this.time * 0.18);
                sy = 1 + 0.06 * b; sx = 1 - 0.03 * b;
            }
            tr.base.scale.set(sx / TEX_RES, sy / TEX_RES);
            tr.base.alpha = ready ? 1 : 0.55;
            tr.arrow.visible = ready;
            if (ready) {
                const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.18);
                tr.arrow.alpha = 0.75 + 0.25 * pulse;
                const s = (1 + 0.12 * pulse) / TEX_RES;
                tr.arrow.scale.set(s);
                tr.arrow.x = Math.cos(tr.dir) * 4 * pulse; // strzalka "pcha" w strone wyrzutu
                tr.arrow.y = Math.sin(tr.dir) * 4 * pulse;
            }
            if (!ready) {
                const frac = 1 - cd / CASTLE_JUMP_CONFIG.cooldownMs;
                tr.ring.clear();
                tr.ring.lineStyle(5, 0x000000, 0.45);
                tr.ring.drawCircle(0, 0, R + 5);
                tr.ring.lineStyle(4, 0xffd23f, 0.95);
                tr.ring.arc(0, 0, R + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
                const txt = `${Math.ceil(cd / 1000)}`;
                if (txt !== tr.lastLabel) { tr.label.text = txt; tr.lastLabel = txt; }
                tr.label.visible = true;
            } else if (tr.label.visible) {
                tr.ring.clear();
                tr.label.visible = false;
                tr.lastLabel = '';
            }
        }
    }

    private start(player: Player, land: { x: number; y: number }, tr: TrampolineView, effects: EffectsManager, now: number): void {
        this.fromX = player.x; this.fromY = player.y;
        this.toX = land.x; this.toY = land.y;
        this.baseScaleX = player.container.scale.x; this.baseScaleY = player.container.scale.y;
        this.flightT = 0;
        tr.readyAt = now + CASTLE_JUMP_CONFIG.cooldownMs;
        this.shadow.visible = true;
        player.firing = false;
        effects.spawnTowerDeployDust(tr.x, tr.y); // odbicie od maty
        AudioSys.getInstance().playCastleJump(); // v0.196.0 (asset Mariusza)
        effects.shake(8, 10);
    }

    private land(player: Player, effects: EffectsManager): void {
        this.flightT = -1;
        player.x = this.toX; player.y = this.toY;
        player.container.x = player.x; player.container.y = player.y;
        player.container.scale.set(this.baseScaleX, this.baseScaleY);
        player.container.zIndex = player.y + 40; // jak Player.update (i tak nadpisze w nastepnym kroku)
        this.shadow.visible = false;
        effects.spawnTowerDeployDust(player.x, player.y);
        effects.spawnTowerDeployDust(player.x + 18, player.y + 6);
        effects.shake(14, 18); // "ma byc soczyscie" — ladowanie czuc
    }

    /** Koniec meczu / wyjscie z mapy — cien i trampoliny sprzatane. Tekstury zostaja w cache. */
    destroy(): void {
        this.shadow.destroy();
        for (const tr of this.tramps) tr.root.destroy({ children: true });
        this.tramps = [];
    }
}
