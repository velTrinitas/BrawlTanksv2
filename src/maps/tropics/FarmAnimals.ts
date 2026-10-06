import * as PIXI from 'pixi.js';
import { ambientRng } from '../../systems/Rng';
import { drawHorseV2, HORSE_WALK_FRAMES } from './HorseArt';
import { drawCowV2, drawPigV2 } from './LivestockArt';

/**
 * TROPICS ART v2 / T4 — ZWIERZETA FARMY 3/4 z gory, PIECZONE (decyzja Mariusza 2026-10-03).
 *
 * Stare konie byly rysowane Z BOKU w grze widzianej z gory (prostokatny tulow, kloce nog) — stad
 * "kwadratowe". Tu kazde zwierze to oble bryly z gradientem swiatla z NW, grzbiet widoczny z gory,
 * cien na ziemi. Klatki pieczone RAZ na typ (stoi / krok A / krok B / pasie sie), w meczu tylko
 * podmiana tekstury + odbicie lustrzane wg kierunku + podskok kroku. Zero redraw.
 *
 * Zachowanie (TYLKO wizual, poza symulacja, `ambientRng`): spacer po swoim terenie, pasienie,
 * UCIECZKA przed czolgiem (nikt nie przejedzie zwierzecia — Czytelnosc), poza kadrem bez animacji.
 */
export type AnimalKind = 'horse_chestnut' | 'horse_gray' | 'horse_black' | 'cow' | 'pig' | 'hen' | 'hen_brown' | 'rooster' | 'bull';
type Pose = 'stand' | 'walkA' | 'walkB' | 'graze';
const POSES: Pose[] = ['stand', 'walkA', 'walkB', 'graze'];
const S = 2;

interface Spec { w: number; h: number; speed: number; flee: number; fleeR: number; scale?: number; }
const SPEC: Record<AnimalKind, Spec> = {
    horse_chestnut: { w: 78, h: 62, speed: 0.55, flee: 2.2, fleeR: 120, scale: 1.35 },
    horse_gray:     { w: 78, h: 62, speed: 0.55, flee: 2.2, fleeR: 120, scale: 1.35 },
    horse_black:    { w: 78, h: 62, speed: 0.55, flee: 2.2, fleeR: 120, scale: 1.35 },
    cow:            { w: 76, h: 58, speed: 0.35, flee: 1.3, fleeR: 110, scale: 1.3 },
    bull:           { w: 84, h: 64, speed: 0.4, flee: 0, fleeR: 0, scale: 1.45 }, // T6.2: tylko zdarzenie Szarzy Byka
    pig:            { w: 50, h: 38, speed: 0.45, flee: 1.8, fleeR: 100, scale: 1.3 },
    hen:            { w: 26, h: 26, speed: 0.6,  flee: 2.6, fleeR: 90, scale: 1.45 },
    hen_brown:      { w: 26, h: 26, speed: 0.6,  flee: 2.6, fleeR: 90, scale: 1.45 },
    rooster:        { w: 30, h: 32, speed: 0.55, flee: 2.4, fleeR: 90, scale: 1.45 },
};

const _tex = new Map<string, PIXI.Texture>();
const _shadow: { t: PIXI.Texture | null } = { t: null };

function shadowTex(): PIXI.Texture {
    if (_shadow.t) return _shadow.t;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(32, 16, 2, 32, 16, 30);
    g.addColorStop(0, 'rgba(15,30,8,0.5)'); g.addColorStop(1, 'rgba(15,30,8,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(32, 16, 30, 14, 0, 0, Math.PI * 2); c.fill();
    _shadow.t = PIXI.Texture.from(cv);
    return _shadow.t;
}

/** Oble wypelnienie gradientem swiatla z NW (jasny grzbiet, ciemny spod). */
function body(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, light: string, mid: string, dark: string): void {
    const g = c.createRadialGradient(x - rx * 0.35, y - ry * 0.5, 1, x, y, Math.max(rx, ry) * 1.15);
    g.addColorStop(0, light); g.addColorStop(0.55, mid); g.addColorStop(1, dark);
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
    // T6 (Mariusz: "plaskie"): ciemny spod (okluzja) + polysk na grzbiecie = wyrazna bryla 3D
    c.save(); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.clip();
    const u = c.createLinearGradient(0, y - ry * 0.1, 0, y + ry);
    u.addColorStop(0, 'rgba(0,0,0,0)'); u.addColorStop(1, 'rgba(0,0,0,0.42)');
    c.fillStyle = u; c.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.42)'; c.beginPath(); c.ellipse(x - rx * 0.28, y - ry * 0.5, rx * 0.42, ry * 0.2, -0.15, 0, Math.PI * 2); c.fill();
    // kontur — Czytelnosc przy zoomie 0.6 (zwierze nie zlewa sie z trawa/blotem)
    c.strokeStyle = 'rgba(28,18,10,0.85)'; c.lineWidth = 1.4; c.stroke();
}
function legs(c: CanvasRenderingContext2D, xs: number[], top: number, len: number, w: number, col: string, far: string, pose: Pose, hoof?: string): void {
    xs.forEach((x, i) => {
        const swing = pose === 'walkA' ? (i % 2 ? 4 : -4) : pose === 'walkB' ? (i % 2 ? -4 : 4) : 0;
        const isFar = i >= xs.length / 2;
        c.strokeStyle = isFar ? far : col; c.lineWidth = w; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, top); c.lineTo(x + swing, top + len); c.stroke();
        if (hoof) { c.fillStyle = hoof; c.beginPath(); c.ellipse(x + swing, top + len, w * 0.55, w * 0.35, 0, 0, Math.PI * 2); c.fill(); }
    });
}


/** T6.2 BYK: ciemny, masywny, wielkie rogi, kolczyk, czerwone oczy (czytelnie GROZNY, inny niz krowa). */
function drawBull(c: CanvasRenderingContext2D, pose: Pose): void {
    const charge = pose === 'graze'; // "graze" = glowa nisko do szarzy
    legs(c, [26, 52, 31, 57], 36, 13, 7, '#3a2214', '#00000055', pose, '#120a06');
    c.strokeStyle = '#3a2214'; c.lineWidth = 3; c.beginPath(); c.moveTo(14, 28); c.quadraticCurveTo(6, 36, 9, 44); c.stroke();
    body(c, 41, 30, 29, 16, '#8a5432', '#5e3418', '#2a160a');
    c.fillStyle = 'rgba(255,220,180,0.16)'; c.beginPath(); c.ellipse(36, 22, 19, 5, 0, 0, Math.PI * 2); c.fill();
    body(c, 58, 24, 10, 11, '#7a4a2a', '#4a2a14', '#24120a'); // garb
    const hx = charge ? 74 : 71, hy = charge ? 36 : 22;
    body(c, hx, hy, 10, 9, '#7a4a2a', '#4a2a14', '#24120a');
    c.fillStyle = '#c98a6a'; c.beginPath(); c.ellipse(hx + 7, hy + 4, 5, 4, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#e8c040'; c.lineWidth = 1.6; c.beginPath(); c.arc(hx + 9, hy + 7, 2.4, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#ff3020'; c.beginPath(); c.arc(hx, hy - 2, 1.8, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#f2ead8'; c.lineWidth = 3.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(hx - 4, hy - 6); c.quadraticCurveTo(hx - 14, hy - 10, hx - 10, hy - 18);
    c.moveTo(hx + 3, hy - 7); c.quadraticCurveTo(hx + 12, hy - 12, hx + 8, hy - 20); c.stroke();
}


function drawHen(c: CanvasRenderingContext2D, pose: Pose, kind: AnimalKind): void {
    const graze = pose === 'graze';
    const rooster = kind === 'rooster', brown = kind === 'hen_brown';
    c.strokeStyle = '#e8a030'; c.lineWidth = 1.6;
    const sw = pose === 'walkA' ? 2 : pose === 'walkB' ? -2 : 0;
    c.beginPath(); c.moveTo(12, 18); c.lineTo(11 + sw, 23); c.moveTo(15, 18); c.lineTo(16 - sw, 23); c.stroke();
    if (rooster) {
        for (const [col, a] of [['#1f6a3a', -0.9], ['#3a2a8a', -0.5], ['#c0392b', -0.2]] as const) {
            c.strokeStyle = col; c.lineWidth = 3; c.lineCap = 'round';
            c.beginPath(); c.moveTo(8, 14); c.quadraticCurveTo(2, 6 + a * 4, 4, 2 + a * 3); c.stroke();
        }
    } else {
        c.fillStyle = brown ? '#8a4a1e' : '#e8e8e8'; c.beginPath(); c.moveTo(7, 14); c.lineTo(3, 8); c.lineTo(9, 11); c.fill();
    }
    body(c, 13, 14, 7.5, 5.5, brown ? '#d8935a' : '#ffffff', brown ? '#b8682e' : '#efefef', brown ? '#7a3e14' : '#b9b9b9');
    const hx = graze ? 20 : 19, hy = graze ? 16 : 7;
    body(c, hx, hy, 3.6, 3.4, brown ? '#d8935a' : '#ffffff', brown ? '#b8682e' : '#f2f2f2', brown ? '#7a3e14' : '#c2c2c2');
    c.fillStyle = '#e04030'; c.beginPath(); c.ellipse(hx - 0.5, hy - 3.5, rooster ? 3 : 1.8, rooster ? 2.2 : 1.3, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f2b030'; c.beginPath(); c.moveTo(hx + 3, hy - 0.5); c.lineTo(hx + 6, hy + 0.5); c.lineTo(hx + 3, hy + 1.5); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(hx + 1, hy - 0.5, 0.8, 0, Math.PI * 2); c.fill();
    if (rooster) { c.fillStyle = '#e04030'; c.beginPath(); c.ellipse(hx + 2, hy + 3, 1.3, 1.8, 0, 0, Math.PI * 2); c.fill(); }
}

const HORSE_PAL: Record<string, [string, string, string, string]> = {
    horse_chestnut: ['#d98a52', '#b5622c', '#6e3412', '#4a2410'],
    horse_gray:     ['#f2f2f2', '#cfd3d6', '#868c91', '#9aa0a5'],
    horse_black:    ['#5a5a66', '#2c2c34', '#101014', '#0a0a0c'],
};

/** Kon: 8 klatek stepa (HorseArt) — pieczone raz na masc. */
function horseWalkTex(kind: AnimalKind, frame: number): PIXI.Texture {
    const key = kind + ':w' + frame;
    const hit = _tex.get(key); if (hit) return hit;
    const sp = SPEC[kind];
    const cv = document.createElement('canvas'); cv.width = sp.w * S; cv.height = sp.h * S;
    const c = cv.getContext('2d')!; c.scale(S, S);
    if (kind === 'cow') drawCowV2(c, frame);
    else if (kind === 'pig') drawPigV2(c, frame);
    else drawHorseV2(c, HORSE_PAL[kind], frame);
    const t = PIXI.Texture.from(cv, { resolution: S } as PIXI.IBaseTextureOptions);
    _tex.set(key, t);
    return t;
}

function getTex(kind: AnimalKind, pose: Pose): PIXI.Texture {
    const key = kind + ':' + pose;
    const hit = _tex.get(key); if (hit) return hit;
    const sp = SPEC[kind];
    const cv = document.createElement('canvas'); cv.width = sp.w * S; cv.height = sp.h * S;
    const c = cv.getContext('2d')!; c.scale(S, S);
    if (kind.startsWith('horse')) drawHorseV2(c, HORSE_PAL[kind], pose === 'graze' ? 'graze' : pose === 'walkA' ? 0 : pose === 'walkB' ? 4 : 'stand');
    else if (kind === 'cow') drawCowV2(c, pose === 'graze' ? 'graze' : pose === 'walkA' ? 0 : pose === 'walkB' ? 4 : 'stand');
    else if (kind === 'bull') drawBull(c, pose);
    else if (kind === 'pig') drawPigV2(c, pose === 'graze' ? 'graze' : pose === 'walkA' ? 0 : pose === 'walkB' ? 4 : 'stand');
    else drawHen(c, pose, kind);
    const t = PIXI.Texture.from(cv, { resolution: S } as PIXI.IBaseTextureOptions);
    _tex.set(key, t);
    return t;
}

/** zMin: minimalny zIndex (konie w zagrodzie musza lezec NAD jej warstwa z blotem i plotem). */
interface Area { x: number; y: number; w: number; h: number; zMin?: number; }

class FarmAnimal {
    private readonly sprite: PIXI.Sprite;
    private readonly shadow: PIXI.Sprite;
    private tx: number; private ty: number;
    private wait = 0;
    private grazing = false;
    private stepT = 0;
    private facing = 1;

    constructor(private readonly kind: AnimalKind, public x: number, public y: number, private readonly area: Area, world: PIXI.Container) {
        const sp = SPEC[kind];
        this.shadow = new PIXI.Sprite(shadowTex());
        this.shadow.anchor.set(0.5); this.shadow.width = sp.w * 0.9 * (sp.scale ?? 1); this.shadow.height = sp.h * 0.35 * (sp.scale ?? 1);
        this.shadow.zIndex = -80;
        this.sprite = new PIXI.Sprite(getTex(kind, 'stand'));
        this.sprite.anchor.set(0.5, 0.85);
        world.addChild(this.shadow); world.addChild(this.sprite);
        this.tx = x; this.ty = y;
        this.wait = ambientRng.next() * 120;
    }

    update(delta: number, threats: ReadonlyArray<{ x: number; y: number }>, visible: boolean): void {
        const sp = SPEC[this.kind];
        // ucieczka przed czolgiem (najblizszym w promieniu)
        let fx = 0, fy = 0;
        for (const t of threats) {
            const dx = this.x - t.x, dy = this.y - t.y, d2 = dx * dx + dy * dy;
            if (d2 < sp.fleeR * sp.fleeR && d2 > 1) { const d = Math.sqrt(d2); fx += dx / d; fy += dy / d; }
        }
        let vx = 0, vy = 0, fleeing = false;
        if (fx !== 0 || fy !== 0) {
            const n = Math.hypot(fx, fy); vx = (fx / n) * sp.flee; vy = (fy / n) * sp.flee; fleeing = true;
            this.grazing = false; this.wait = 30;
        } else if (this.wait > 0) {
            this.wait -= delta;
        } else {
            const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
            if (d < 4) {
                this.grazing = ambientRng.next() < 0.55;
                this.wait = 90 + ambientRng.next() * 240;
                this.tx = this.area.x + ambientRng.next() * this.area.w;
                this.ty = this.area.y + ambientRng.next() * this.area.h;
            } else { vx = (dx / d) * sp.speed; vy = (dy / d) * sp.speed; this.grazing = false; }
        }
        this.x = Math.max(this.area.x, Math.min(this.area.x + this.area.w, this.x + vx * delta));
        this.y = Math.max(this.area.y, Math.min(this.area.y + this.area.h, this.y + vy * delta));
        if (!visible) return; // poza kadrem: ruch tak, wizual nie
        const moving = vx !== 0 || vy !== 0;
        if (Math.abs(vx) > 0.05) this.facing = vx > 0 ? 1 : -1;
        let pose: Pose = 'stand';
        if (moving) {
            this.stepT += delta * (fleeing ? 0.35 : 0.18);
            pose = Math.floor(this.stepT) % 2 === 0 ? 'walkA' : 'walkB';
        } else if (this.grazing) pose = 'graze';
        const horse = this.kind.startsWith('horse') || this.kind === 'cow' || this.kind === 'pig'; // 8 klatek chodu
        this.sprite.texture = horse && moving
            ? horseWalkTex(this.kind, Math.floor(((this.stepT / 2) % 1) * HORSE_WALK_FRAMES) % HORSE_WALK_FRAMES)
            : getTex(this.kind, pose);
        // kon: chod jest w klatkach (bez podskoku sprite'a); reszta zwierzat — podskok kroku
        const hop = moving && !horse ? Math.abs(Math.sin(this.stepT * Math.PI)) * (fleeing ? 3 : 1.5) : 0;
        this.sprite.x = this.x; this.sprite.y = this.y - hop;
        const k = sp.scale ?? 1;
        this.sprite.scale.set(this.facing * k, k);
        this.sprite.zIndex = Math.max(Math.floor(this.y), this.area.zMin ?? 0);
        this.shadow.x = this.x + 3; this.shadow.y = this.y + 2;
    }
}

/** Stado farmy: spawn wg obszarow, update z cullingiem kadru. */
export class FarmAnimals {
    private readonly list: FarmAnimal[] = [];

    constructor(world: PIXI.Container, groups: Array<{ kinds: AnimalKind[]; area: Area }>) {
        for (const g of groups) {
            for (const k of g.kinds) {
                const x = g.area.x + ambientRng.next() * g.area.w, y = g.area.y + ambientRng.next() * g.area.h;
                this.list.push(new FarmAnimal(k, x, y, g.area, world));
            }
        }
        // rozgrzanie tekstur (pieczenie przy starcie meczu, nie w trakcie)
        for (const g of groups) for (const k of g.kinds) {
            for (const p of POSES) getTex(k, p);
            if (k.startsWith('horse') || k === 'cow' || k === 'pig') for (let f = 0; f < HORSE_WALK_FRAMES; f++) horseWalkTex(k, f);
        }
    }

    update(delta: number, threats: ReadonlyArray<{ x: number; y: number }>, camX: number, camY: number, viewW: number, viewH: number): void {
        const M = 80;
        for (const a of this.list) {
            const vis = a.x > camX - M && a.x < camX + viewW + M && a.y > camY - M && a.y < camY + viewH + M;
            a.update(delta, threats, vis);
        }
    }
}

/** T6: dostep do pieczonych tekstur zwierzat (kury zdarzenia uzywaja tych samych klatek). */
export function animalTexture(kind: AnimalKind, pose: 'stand' | 'walkA' | 'walkB' | 'graze'): PIXI.Texture { return getTex(kind, pose); }

/** T6: cien na ziemi dla zwierzat zdarzen (kury stada, byk) — ten sam co u stada ozdobnego. */
export function makeAnimalShadow(w: number, h: number): PIXI.Sprite {
    const s = new PIXI.Sprite(shadowTex()); s.anchor.set(0.5); s.width = w; s.height = h; s.zIndex = -80; return s;
}
