import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';

// =============================================================================
// HELPERS
// =============================================================================

function lerpHex(hex: string, amt: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
    return '#' + [c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// =============================================================================
// GENERIC TANK DRAWING (kopia v4.48 — dla brawlerów bez unique art)
// =============================================================================

function drawTankHull(ctx: CanvasRenderingContext2D, brawler: Brawler): void {
    const col = brawler.colorMain;
    const cL = lerpHex(col, 45);
    const HL = 52, HW = 26, TRK = 5;
    const hhl = HL / 2, hhw = HW / 2;
    
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.roundRect(-hhl, -(hhw + TRK / 2 + 0.5) - TRK / 2, HL, TRK, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-hhl, (hhw + TRK / 2 + 0.5) - TRK / 2, HL, TRK, 2);
    ctx.fill();
    
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(-hhl, -hhw, HL, HW, 3);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = cL;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.roundRect(-hhl, -hhw, HL * 0.2, HW, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
}

function drawTankTurret(ctx: CanvasRenderingContext2D, brawler: Brawler): void {
    const col = brawler.colorMain;
    const tr = 12, bl = 20, bw = 5;
    const bstart = tr * 0.6;
    
    ctx.fillStyle = lerpHex(col, -18);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, tr + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#484848';
    ctx.beginPath();
    ctx.roundRect(bstart, -bw / 2, bl, bw, bw * 0.25);
    ctx.fill();
    ctx.stroke();
}

// =============================================================================
// PYRO — v2 PROGRAMMATIC (high cartoon, thin outline, gradient, hex turret)
// =============================================================================

// PYRO dimensions (exported jako constants — Player.ts potrzebuje do pozycjonowania efektów)
export const PYRO_HULL_HL = 62;       // hull length (+10% z 56)
export const PYRO_HULL_HW = 30;       // hull width
export const PYRO_HULL_TRK_H = 7;     // track height
export const PYRO_TURRET_R = 15.6;    // turret radius (+20% z 13)
export const PYRO_EXHAUST_LOCAL_X = -29;  // exhaust pozycja w hull local coords (lewa strona)
export const PYRO_EXHAUST_OFFSET_Y = 9;   // odległość exhaustów od center (top/bottom pair)
export const PYRO_CANVAS_SCALE = 1.75;    // bake canvas scale

/**
 * Pyro WIZJER — owalny ciemny element z białym refleksem (zastępuje czaszkę).
 */
function drawPyroVisor(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    
    // Outer rim (czarna obwódka)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(0, 0, w + 0.5, h + 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Visor glass (ciemno-niebieski)
    ctx.fillStyle = '#1a3a5e';
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner reflection (jaśniejsze niebieskie)
    ctx.fillStyle = '#4a7fa3';
    ctx.beginPath();
    ctx.ellipse(-w * 0.15, -h * 0.15, w * 0.6, h * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Bright reflex (mały biały highlight)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-w * 0.35, -h * 0.4, w * 0.25, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

/**
 * Pyro WŁAZ (hatch) na wieżyczce — okrągły z uchwytem.
 */
function drawPyroHatch(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    
    // Hatch base (ciemniejszy red)
    ctx.fillStyle = '#7a160c';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Hatch inner ring (highlight)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    
    // Hatch handle (poziomy uchwyt)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, 0);
    ctx.lineTo(r * 0.5, 0);
    ctx.stroke();
    ctx.lineCap = 'butt';
    
    // Bolts (4 sztuki na obwodzie hatch)
    ctx.fillStyle = '#000000';
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const bx = Math.cos(a) * r * 0.85;
        const by = Math.sin(a) * r * 0.85;
        ctx.beginPath();
        ctx.arc(bx, by, 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

/**
 * Pyro EXHAUST PIPE — widziana z góry (kółko z ciemnym otworem).
 * Dwie sztuki rysowane symetrycznie góra/dół na tyle hull.
 */
function drawPyroExhaustPipe(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    
    // Outer pipe (ciemno-szary metal)
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Inner ring (highlight metalu)
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    
    // Otwór (ciemny środek)
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    
    // Subtle highlight
    ctx.fillStyle = '#777777';
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.3, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

/**
 * Pyro FLAME DECAL — cartoon flame z gradientem orange-yellow (dla bocznych panelu).
 */
function drawPyroFlame(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, flipY: boolean = false): void {
    ctx.save();
    ctx.translate(cx, cy);
    if (flipY) ctx.scale(1, -1);
    
    ctx.fillStyle = '#ff8c2a';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-size, size * 0.2);
    ctx.quadraticCurveTo(-size * 0.6, -size * 0.4, -size * 0.35, -size * 0.2);
    ctx.quadraticCurveTo(-size * 0.15, -size * 0.85, 0, -size * 0.35);
    ctx.quadraticCurveTo(size * 0.15, -size * 1.0, size * 0.35, -size * 0.4);
    ctx.quadraticCurveTo(size * 0.6, -size * 0.5, size, size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#ffd33a';
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, size * 0.15);
    ctx.quadraticCurveTo(-size * 0.25, -size * 0.2, -size * 0.1, -size * 0.1);
    ctx.quadraticCurveTo(0, -size * 0.55, size * 0.1, -size * 0.15);
    ctx.quadraticCurveTo(size * 0.25, -size * 0.3, size * 0.5, size * 0.15);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
}

/**
 * PYRO HULL v2 — high cartoon, thin outlines, gradient kadłub, wizjer, 2 exhausty.
 */
function drawPyroHull(ctx: CanvasRenderingContext2D): void {
    const TRACK_DARK = '#2c2c2c';
    const TRACK_DARKER = '#1a1a1a';
    const OUTLINE = '#000000';
    
    const HL = PYRO_HULL_HL;
    const HW = PYRO_HULL_HW;
    const TRK_H = PYRO_HULL_TRK_H;
    const hhl = HL / 2;
    const hhw = HW / 2;
    const frontOffset = 5;
    
    // =====================================================================
    // GĄSIENICE (góra i dół, ze szczegółami)
    // =====================================================================
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = OUTLINE;
    
    // Track base TOP
    ctx.fillStyle = TRACK_DARK;
    ctx.beginPath();
    ctx.roundRect(-hhl, -hhw - TRK_H, HL, TRK_H, 2);
    ctx.fill();
    ctx.stroke();
    
    // Track base BOTTOM
    ctx.beginPath();
    ctx.roundRect(-hhl, hhw, HL, TRK_H, 2);
    ctx.fill();
    ctx.stroke();
    
    // Track segments (krótkie poprzeczne kreski jako "ogniwa" gąsienicy)
    ctx.strokeStyle = TRACK_DARKER;
    ctx.lineWidth = 0.8;
    const segCount = 10;
    const segSpacing = HL / segCount;
    for (let i = 0; i <= segCount; i++) {
        const x = -hhl + i * segSpacing;
        // Top track segments
        ctx.beginPath();
        ctx.moveTo(x, -hhw - TRK_H + 0.5);
        ctx.lineTo(x, -hhw - 0.5);
        ctx.stroke();
        // Bottom track segments
        ctx.beginPath();
        ctx.moveTo(x, hhw + 0.5);
        ctx.lineTo(x, hhw + TRK_H - 0.5);
        ctx.stroke();
    }
    
    // Road wheels (rolki — 5 sztuk na track)
    ctx.fillStyle = TRACK_DARKER;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.8;
    const wheelCount = 5;
    const wheelSpacing = HL / (wheelCount + 1);
    for (let i = 0; i < wheelCount; i++) {
        const x = -hhl + wheelSpacing * (i + 1);
        ctx.beginPath();
        ctx.arc(x, -hhw - TRK_H / 2, 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, hhw + TRK_H / 2, 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
    
    // =====================================================================
    // KADŁUB Z GRADIENTEM POMARAŃCZOWY-CZERWONY-POMARAŃCZOWY (góra-dół)
    // =====================================================================
    const drawHullShape = () => {
        ctx.beginPath();
        ctx.moveTo(-hhl, -hhw);
        ctx.lineTo(hhl - frontOffset, -hhw);
        ctx.lineTo(hhl, -hhw * 0.4);
        ctx.lineTo(hhl, hhw * 0.4);
        ctx.lineTo(hhl - frontOffset, hhw);
        ctx.lineTo(-hhl, hhw);
        ctx.closePath();
    };
    
    // Gradient pionowy: orange (top) → red (middle) → orange (bottom)
    const grad = ctx.createLinearGradient(0, -hhw, 0, hhw);
    grad.addColorStop(0, '#ff8c4a');   // jasny pomarańcz (top edge)
    grad.addColorStop(0.5, '#9b1d12'); // głęboki czerwony (środek)
    grad.addColorStop(1, '#ff8c4a');   // jasny pomarańcz (bottom edge)
    
    ctx.fillStyle = grad;
    drawHullShape();
    ctx.fill();
    
    // Cienki outline (high cartoon style, ale subtelniejszy)
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    drawHullShape();
    ctx.stroke();
    
    // Subtelna pozioma linia podziału kadłub (panel seam)
    ctx.strokeStyle = '#5a1a10';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-hhl + 4, 0);
    ctx.lineTo(hhl - 4, 0);
    ctx.stroke();
    
    // =====================================================================
    // PŁOMIENIE NA BOKACH (2 decals na panelach z gąsienicami)
    // =====================================================================
    drawPyroFlame(ctx, -6, -hhw * 0.55, 6);
    drawPyroFlame(ctx, -6, hhw * 0.55, 6, true);
    
    // =====================================================================
    // WIZJER NA FRONCIE (zastępuje czaszkę)
    // =====================================================================
    drawPyroVisor(ctx, hhl - 11, 0, 5, 3);
    
    // =====================================================================
    // 2 EXHAUST PIPES (rury wydechowe na tyle hull, lewa strona)
    // =====================================================================
    drawPyroExhaustPipe(ctx, PYRO_EXHAUST_LOCAL_X, -PYRO_EXHAUST_OFFSET_Y, 2.8);
    drawPyroExhaustPipe(ctx, PYRO_EXHAUST_LOCAL_X, PYRO_EXHAUST_OFFSET_Y, 2.8);
    
    // =====================================================================
    // CENTER TURRET MOUNT (ciemny pierścień)
    // =====================================================================
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = OUTLINE;
    ctx.fillStyle = '#7a160c';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#5a1108';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
}

/**
 * PYRO TURRET v2 — hexagonal +20%, hatch w środku, cienkie outlines.
 */
function drawPyroTurret(ctx: CanvasRenderingContext2D): void {
    const BARREL_GRAY = '#3a3a3a';
    const BARREL_LIGHT = '#6a6a6a';
    const OUTLINE = '#000000';
    
    // =====================================================================
    // 3 LUFY (rysujemy NAJPIERW, żeby turret base je zakrył od środka)
    // =====================================================================
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = OUTLINE;
    
    const mainBarrelLen = 26;
    const mainBarrelW = 5.5;
    const barrelStart = 4;
    
    ctx.fillStyle = BARREL_GRAY;
    ctx.beginPath();
    ctx.roundRect(barrelStart, -mainBarrelW / 2, mainBarrelLen, mainBarrelW, 1);
    ctx.fill();
    ctx.stroke();
    
    const sideBarrelLen = 21;
    const sideBarrelW = 3.5;
    const sideOffsetY = 8;
    
    ctx.beginPath();
    ctx.roundRect(barrelStart, -sideOffsetY - sideBarrelW / 2, sideBarrelLen, sideBarrelW, 1);
    ctx.fill();
    ctx.stroke();
    
    ctx.beginPath();
    ctx.roundRect(barrelStart, sideOffsetY - sideBarrelW / 2, sideBarrelLen, sideBarrelW, 1);
    ctx.fill();
    ctx.stroke();
    
    // Highlight na lufach
    ctx.fillStyle = BARREL_LIGHT;
    ctx.fillRect(barrelStart + 2, -mainBarrelW / 2 + 0.5, mainBarrelLen - 4, 1);
    ctx.fillRect(barrelStart + 2, -sideOffsetY - sideBarrelW / 2 + 0.4, sideBarrelLen - 4, 0.7);
    ctx.fillRect(barrelStart + 2, sideOffsetY - sideBarrelW / 2 + 0.4, sideBarrelLen - 4, 0.7);
    
    // Muzzle (czarne otwory)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(barrelStart + mainBarrelLen - 1.5, 0, mainBarrelW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(barrelStart + sideBarrelLen - 1.5, -sideOffsetY, sideBarrelW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(barrelStart + sideBarrelLen - 1.5, sideOffsetY, sideBarrelW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // =====================================================================
    // TURRET BASE — HEXAGONAL (6 sides, +20% rozmiar)
    // =====================================================================
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = OUTLINE;
    
    const turretR = PYRO_TURRET_R;
    const sides = 6;  // hexagonal
    
    const drawHexShape = () => {
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            const x = Math.cos(angle) * turretR;
            const y = Math.sin(angle) * turretR;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    };
    
    // Gradient na turret base (też orange-red-orange pionowy)
    const turretGrad = ctx.createLinearGradient(0, -turretR, 0, turretR);
    turretGrad.addColorStop(0, '#ff8c4a');
    turretGrad.addColorStop(0.5, '#9b1d12');
    turretGrad.addColorStop(1, '#ff8c4a');
    
    ctx.fillStyle = turretGrad;
    drawHexShape();
    ctx.fill();
    
    // Cienki outline
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    drawHexShape();
    ctx.stroke();
    
    // =====================================================================
    // WŁAZ NA WIEŻY (hatch w środku turret)
    // =====================================================================
    drawPyroHatch(ctx, 0, 0, turretR * 0.4);
    
    // =====================================================================
    // FLAME SYMBOL — mały na boku turret (przy włazie, nie na nim)
    // =====================================================================
    drawPyroFlame(ctx, -turretR * 0.55, -turretR * 0.55, 4);
}

// =============================================================================
// TEXTURE CACHE & FACTORY
// =============================================================================

export interface BrawlerTextures {
    hull: PIXI.Texture;
    turret: PIXI.Texture;
}

const BRAWLER_TEX_CACHE = new Map<string, BrawlerTextures>();

export function getBrawlerTextures(brawler: Brawler): BrawlerTextures {
    if (BRAWLER_TEX_CACHE.has(brawler.id)) {
        return BRAWLER_TEX_CACHE.get(brawler.id)!;
    }
    
    let textures: BrawlerTextures;
    
    if (brawler.useExternalSprite) {
        const BASE = import.meta.env.BASE_URL;
        textures = {
            hull: PIXI.Texture.from(BASE + 'assets/tanks/' + brawler.id + '_hull.png'),
            turret: PIXI.Texture.from(BASE + 'assets/tanks/' + brawler.id + '_turret.png'),
        };
    } else {
        const createTex = (drawFn: (ctx: CanvasRenderingContext2D) => void): PIXI.Texture => {
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 160;
            const ctx = canvas.getContext('2d')!;
            ctx.translate(80, 80);
            ctx.scale(PYRO_CANVAS_SCALE, PYRO_CANVAS_SCALE);
            drawFn(ctx);
            return PIXI.Texture.from(canvas);
        };
        
        let hullDraw: (ctx: CanvasRenderingContext2D) => void;
        let turretDraw: (ctx: CanvasRenderingContext2D) => void;
        
        switch (brawler.id) {
            case 'pyro':
                hullDraw = drawPyroHull;
                turretDraw = drawPyroTurret;
                break;
            default:
                hullDraw = ctx => drawTankHull(ctx, brawler);
                turretDraw = ctx => drawTankTurret(ctx, brawler);
        }
        
        textures = {
            hull: createTex(hullDraw),
            turret: createTex(turretDraw),
        };
    }
    
    BRAWLER_TEX_CACHE.set(brawler.id, textures);
    return textures;
}