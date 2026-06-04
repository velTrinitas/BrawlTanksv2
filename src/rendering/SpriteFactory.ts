import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';

// =============================================================================
// CONFIG (eksportowane dla Player.ts — pozycjonowanie animacji)
// =============================================================================

export const TANK_CANVAS_SCALE = 1.75;

export interface BrawlerProgrammaticConfig {
    HL: number;
    HW: number;
    TRK_H: number;
    EXHAUST_X: number;
    EXHAUST_Y: number;
    HAS_FLAME: boolean;
    FLAME_COLOR_OUTER?: number;
    FLAME_COLOR_INNER?: number;
    HAS_SMOKE: boolean;
    SMOKE_COLOR?: number;
    SMOKE_ALPHA?: number;
}

export const PROGRAMMATIC_BRAWLER_CONFIG: Record<string, BrawlerProgrammaticConfig> = {
    pyro: {
        HL: 62, HW: 30, TRK_H: 7,
        EXHAUST_X: -29, EXHAUST_Y: 9,
        HAS_FLAME: true, FLAME_COLOR_OUTER: 0xff7e2a, FLAME_COLOR_INNER: 0xffdc4a,
        HAS_SMOKE: true, SMOKE_COLOR: 0x4a4a4a, SMOKE_ALPHA: 0.45,
    },
    twardy: {
        HL: 56, HW: 28, TRK_H: 7,
        EXHAUST_X: -26, EXHAUST_Y: 8,
        HAS_FLAME: false,
        HAS_SMOKE: true, SMOKE_COLOR: 0x4a7a3a, SMOKE_ALPHA: 0.55,
    },
    heavy: {
        HL: 62, HW: 32, TRK_H: 8,
        EXHAUST_X: -29, EXHAUST_Y: 10,
        HAS_FLAME: false,
        HAS_SMOKE: true, SMOKE_COLOR: 0x1a1a1a, SMOKE_ALPHA: 0.7,
    },
    scout: {
        HL: 50, HW: 24, TRK_H: 5,
        EXHAUST_X: -23, EXHAUST_Y: 7,
        HAS_FLAME: false, HAS_SMOKE: false,
    },
    sniper: {
        HL: 54, HW: 26, TRK_H: 6,
        EXHAUST_X: -25, EXHAUST_Y: 7.5,
        HAS_FLAME: false, HAS_SMOKE: false,
    },
};

// =============================================================================
// HELPERS (shared dla programmatic brawlers)
// =============================================================================

function lerpHex(hex: string, amt: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
    return '#' + [c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function drawTrackBase(ctx: CanvasRenderingContext2D, hhl: number, hhw: number, TRK_H: number): void {
    ctx.fillStyle = '#2c2c2c';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-hhl, -hhw - TRK_H, hhl * 2, TRK_H, 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-hhl, hhw, hhl * 2, TRK_H, 2);
    ctx.fill();
    ctx.stroke();
}

function drawTrackDetails(ctx: CanvasRenderingContext2D, hhl: number, hhw: number, TRK_H: number, wheelCount: number, segCount: number): void {
    // Segments (poprzeczne paski "ogniwa")
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.8;
    const segSpacing = (hhl * 2) / segCount;
    for (let i = 0; i <= segCount; i++) {
        const x = -hhl + i * segSpacing;
        ctx.beginPath();
        ctx.moveTo(x, -hhw - TRK_H + 0.5);
        ctx.lineTo(x, -hhw - 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, hhw + 0.5);
        ctx.lineTo(x, hhw + TRK_H - 0.5);
        ctx.stroke();
    }
    
    // Road wheels (rolki)
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.8;
    const wheelSpacing = (hhl * 2) / (wheelCount + 1);
    const wheelR = Math.min(2.3, TRK_H * 0.35);
    for (let i = 0; i < wheelCount; i++) {
        const x = -hhl + wheelSpacing * (i + 1);
        ctx.beginPath();
        ctx.arc(x, -hhw - TRK_H / 2, wheelR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, hhw + TRK_H / 2, wheelR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

function drawEngineGrille(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, baseColor: string, slotColor: string): void {
    ctx.save();
    ctx.translate(cx, cy);
    
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 1);
    ctx.fill();
    ctx.stroke();
    
    ctx.strokeStyle = slotColor;
    ctx.lineWidth = 0.7;
    const slotCount = 5;
    for (let i = 0; i < slotCount; i++) {
        const y = -h / 2 + (i + 0.5) * (h / slotCount);
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 1.5, y);
        ctx.lineTo(w / 2 - 1.5, y);
        ctx.stroke();
    }
    
    ctx.restore();
}

function drawExhaustPipe(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#777';
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.3, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

function drawHatch(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, baseColor: string, goldTrim: boolean = false): void {
    ctx.save();
    ctx.translate(cx, cy);
    
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    if (goldTrim) {
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, 0);
    ctx.lineTo(r * 0.5, 0);
    ctx.stroke();
    ctx.lineCap = 'butt';
    
    ctx.fillStyle = '#000';
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

function drawGoldRivet(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.fillStyle = '#d4af37';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4d76a';
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
}

function drawWhiteStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const a1 = -Math.PI / 2 + i * Math.PI * 2 / 5;
        const a2 = a1 + Math.PI / 5;
        if (i === 0) ctx.moveTo(Math.cos(a1) * size, Math.sin(a1) * size);
        else ctx.lineTo(Math.cos(a1) * size, Math.sin(a1) * size);
        ctx.lineTo(Math.cos(a2) * size * 0.4, Math.sin(a2) * size * 0.4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function drawScopeAttachment(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    
    // Scope body
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 1);
    ctx.fill();
    ctx.stroke();
    
    // Lens (front, po prawej)
    ctx.fillStyle = '#2a4a8a';
    ctx.beginPath();
    ctx.arc(w / 2 - 1, 0, h * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    
    // Lens highlight
    ctx.fillStyle = '#7aa0d0';
    ctx.beginPath();
    ctx.arc(w / 2 - 1.5, -h * 0.1, h * 0.18, 0, Math.PI * 2);
    ctx.fill();
    
    // Bright reflex
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(w / 2 - 1.8, -h * 0.18, h * 0.08, 0, Math.PI * 2);
    ctx.fill();
    
    // Gold trim ring around lens
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(w / 2 - 1, 0, h * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
}

function drawCamoSpot(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, rotation: number = 0): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
    ctx.fill();
}

function drawBigVisor(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    
    // Outer rim
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 0, w + 0.7, h + 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Visor glass
    ctx.fillStyle = '#1a3a5e';
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Inner reflection
    ctx.fillStyle = '#4a7fa3';
    ctx.beginPath();
    ctx.ellipse(-w * 0.2, -h * 0.2, w * 0.55, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // White reflex
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-w * 0.35, -h * 0.4, w * 0.22, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Crosshair
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.85, 0);
    ctx.lineTo(w * 0.85, 0);
    ctx.moveTo(0, -h * 0.85);
    ctx.lineTo(0, h * 0.85);
    ctx.stroke();
    
    ctx.restore();
}

function drawActiveArmorBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, baseColor: string): void {
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 0.5);
    ctx.fill();
    ctx.stroke();
    
    // Highlight pasek
    ctx.fillStyle = lerpHex(baseColor, 40);
    ctx.fillRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, 0.8);
}

// =============================================================================
// PYRO (v2 — bez zmian, kopia z poprzedniej iteracji)
// =============================================================================

function drawPyroFlameDecal(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, flipY: boolean = false): void {
    ctx.save();
    ctx.translate(cx, cy);
    if (flipY) ctx.scale(1, -1);
    ctx.fillStyle = '#ff8c2a';
    ctx.strokeStyle = '#000';
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

function drawPyroVisor(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 0, w + 0.5, h + 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a3a5e';
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a7fa3';
    ctx.beginPath();
    ctx.ellipse(-w * 0.15, -h * 0.15, w * 0.6, h * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-w * 0.35, -h * 0.4, w * 0.25, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawPyroHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.pyro;
    const hhl = c.HL / 2;
    const hhw = c.HW / 2;
    
    drawTrackBase(ctx, hhl, hhw, c.TRK_H);
    drawTrackDetails(ctx, hhl, hhw, c.TRK_H, 5, 10);
    
    const drawShape = () => {
        ctx.beginPath();
        ctx.moveTo(-hhl, -hhw);
        ctx.lineTo(hhl - 5, -hhw);
        ctx.lineTo(hhl, -hhw * 0.4);
        ctx.lineTo(hhl, hhw * 0.4);
        ctx.lineTo(hhl - 5, hhw);
        ctx.lineTo(-hhl, hhw);
        ctx.closePath();
    };
    
    const grad = ctx.createLinearGradient(0, -hhw, 0, hhw);
    grad.addColorStop(0, '#ff8c4a');
    grad.addColorStop(0.5, '#9b1d12');
    grad.addColorStop(1, '#ff8c4a');
    ctx.fillStyle = grad;
    drawShape();
    ctx.fill();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawShape();
    ctx.stroke();
    
    ctx.strokeStyle = '#5a1a10';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-hhl + 4, 0);
    ctx.lineTo(hhl - 4, 0);
    ctx.stroke();
    
    drawPyroFlameDecal(ctx, -6, -hhw * 0.55, 6);
    drawPyroFlameDecal(ctx, -6, hhw * 0.55, 6, true);
    drawPyroVisor(ctx, hhl - 11, 0, 5, 3);
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 2.8);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 2.8);
    
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
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

function drawPyroTurret(ctx: CanvasRenderingContext2D): void {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    
    const mainLen = 26, mainW = 5.5, barrelStart = 4;
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.roundRect(barrelStart, -mainW / 2, mainLen, mainW, 1);
    ctx.fill();
    ctx.stroke();
    
    const sideLen = 21, sideW = 3.5, sideY = 8;
    ctx.beginPath();
    ctx.roundRect(barrelStart, -sideY - sideW / 2, sideLen, sideW, 1);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(barrelStart, sideY - sideW / 2, sideLen, sideW, 1);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(barrelStart + 2, -mainW / 2 + 0.5, mainLen - 4, 1);
    ctx.fillRect(barrelStart + 2, -sideY - sideW / 2 + 0.4, sideLen - 4, 0.7);
    ctx.fillRect(barrelStart + 2, sideY - sideW / 2 + 0.4, sideLen - 4, 0.7);
    
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(barrelStart + mainLen - 1.5, 0, mainW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(barrelStart + sideLen - 1.5, -sideY, sideW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(barrelStart + sideLen - 1.5, sideY, sideW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    const R = 15.6;
    const drawHex = () => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            if (i === 0) ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
            else ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        }
        ctx.closePath();
    };
    
    const g = ctx.createLinearGradient(0, -R, 0, R);
    g.addColorStop(0, '#ff8c4a');
    g.addColorStop(0.5, '#9b1d12');
    g.addColorStop(1, '#ff8c4a');
    ctx.fillStyle = g;
    drawHex();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawHex();
    ctx.stroke();
    
    drawHatch(ctx, 0, 0, R * 0.4, '#7a160c');
    drawPyroFlameDecal(ctx, -R * 0.55, -R * 0.55, 4);
}

// =============================================================================
// TWARDY — zielony moro, ucięty stożek turret, white star
// =============================================================================

function drawTwardyHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.twardy;
    const hhl = c.HL / 2;
    const hhw = c.HW / 2;
    
    drawTrackBase(ctx, hhl, hhw, c.TRK_H);
    drawTrackDetails(ctx, hhl, hhw, c.TRK_H, 5, 9);
    
    const drawShape = () => {
        ctx.beginPath();
        ctx.moveTo(-hhl, -hhw);
        ctx.lineTo(hhl - 4, -hhw);
        ctx.lineTo(hhl, -hhw * 0.4);
        ctx.lineTo(hhl, hhw * 0.4);
        ctx.lineTo(hhl - 4, hhw);
        ctx.lineTo(-hhl, hhw);
        ctx.closePath();
    };
    
    const grad = ctx.createLinearGradient(0, -hhw, 0, hhw);
    grad.addColorStop(0, '#8aae6a');
    grad.addColorStop(0.5, '#4a6a32');
    grad.addColorStop(1, '#8aae6a');
    ctx.fillStyle = grad;
    drawShape();
    ctx.fill();
    
    // Camo spots (deterministic — same na każdym bake)
    drawCamoSpot(ctx, -hhl + 9, -5, 5, 3, '#3d5a2d', 0.3);
    drawCamoSpot(ctx, -3, 6, 4.5, 3.5, '#1a2d12', -0.4);
    drawCamoSpot(ctx, 7, -7, 4, 2.5, '#3d5a2d', 0.5);
    drawCamoSpot(ctx, hhl - 13, 4, 3, 4, '#1a2d12', 0.2);
    drawCamoSpot(ctx, -hhl + 16, 8, 3, 2, '#3d5a2d', -0.3);
    drawCamoSpot(ctx, 0, -2, 3.5, 2, '#1a2d12', 0.6);
    
    // Engine grille z tyłu
    drawEngineGrille(ctx, -hhl + 8, 0, 7, 16, '#1a2d12', '#5a7a3a');
    
    // Exhausts
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 2.6);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 2.6);
    
    // Hull outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawShape();
    ctx.stroke();
    
    // White star na froncie
    drawWhiteStar(ctx, hhl - 11, 0, 4.5);
    
    // Center turret mount
    ctx.fillStyle = '#3d5a2d';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

function drawTwardyTurret(ctx: CanvasRenderingContext2D): void {
    // 1 barrel
    const barrelLen = 23, barrelW = 5, barrelStart = 4;
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(barrelStart, -barrelW / 2, barrelLen, barrelW, 1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(barrelStart + 2, -barrelW / 2 + 0.5, barrelLen - 4, 1);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(barrelStart + barrelLen - 1.5, 0, barrelW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // Truncated cone — outer ring (bottom of frustum)
    const outerR = 14.5;
    const innerR = 10;
    
    const g = ctx.createLinearGradient(0, -outerR, 0, outerR);
    g.addColorStop(0, '#8aae6a');
    g.addColorStop(0.5, '#4a6a32');
    g.addColorStop(1, '#8aae6a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, outerR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, outerR, 0, Math.PI * 2);
    ctx.stroke();
    
    // Inner ring (top of frustum — jaśniejszy)
    ctx.fillStyle = '#6b8e4a';
    ctx.beginPath();
    ctx.arc(0, 0, innerR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, innerR, 0, Math.PI * 2);
    ctx.stroke();
    
    // Slight shadow ring between inner and outer (cell shading depth)
    ctx.strokeStyle = '#3d5a2d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, (outerR + innerR) / 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Hatch w środku
    drawHatch(ctx, 0, 0, innerR * 0.5, '#3d5a2d');
    
    // White star na boku turret
    drawWhiteStar(ctx, -outerR * 0.55, -outerR * 0.55, 2.5);
}

// =============================================================================
// PANCERNY (HEAVY) — szary, 2 lufy, domek (pentagonal) turret
// =============================================================================

function drawHeavyHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.heavy;
    const hhl = c.HL / 2;
    const hhw = c.HW / 2;
    
    drawTrackBase(ctx, hhl, hhw, c.TRK_H);
    drawTrackDetails(ctx, hhl, hhw, c.TRK_H, 6, 11);
    
    const drawShape = () => {
        ctx.beginPath();
        ctx.moveTo(-hhl, -hhw);
        ctx.lineTo(hhl - 5, -hhw);
        ctx.lineTo(hhl, -hhw * 0.5);
        ctx.lineTo(hhl, hhw * 0.5);
        ctx.lineTo(hhl - 5, hhw);
        ctx.lineTo(-hhl, hhw);
        ctx.closePath();
    };
    
    const grad = ctx.createLinearGradient(0, -hhw, 0, hhw);
    grad.addColorStop(0, '#b8b8b8');
    grad.addColorStop(0.5, '#5a5a5a');
    grad.addColorStop(1, '#b8b8b8');
    ctx.fillStyle = grad;
    drawShape();
    ctx.fill();
    
    // Reactive armor panels po bokach (4 sztuki — 2 z każdej strony)
    drawActiveArmorBlock(ctx, -8, -hhw + 3, 8, 4, '#7a7a7a');
    drawActiveArmorBlock(ctx, 8, -hhw + 3, 8, 4, '#7a7a7a');
    drawActiveArmorBlock(ctx, -8, hhw - 3, 8, 4, '#7a7a7a');
    drawActiveArmorBlock(ctx, 8, hhw - 3, 8, 4, '#7a7a7a');
    
    // Engine grille (większa — masywny silnik)
    drawEngineGrille(ctx, -hhl + 9, 0, 9, 18, '#1a1a1a', '#888');
    
    // 2 exhausts (większe — heavy diesel)
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 3.2);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 3.2);
    
    // Hull outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawShape();
    ctx.stroke();
    
    // Panel seam line
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-hhl + 5, 0);
    ctx.lineTo(hhl - 5, 0);
    ctx.stroke();
    
    // Shield emblem na froncie (subtelny tarcza heraldyczna)
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(hhl - 11, -3);
    ctx.lineTo(hhl - 7, -3);
    ctx.lineTo(hhl - 7, 1);
    ctx.lineTo(hhl - 9, 4);
    ctx.lineTo(hhl - 11, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Center turret mount
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

function drawHeavyTurret(ctx: CanvasRenderingContext2D): void {
    // 2 lufy parallel
    const barrelLen = 24, barrelW = 4.5, barrelStart = 5, barrelGap = 5;
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    
    ctx.beginPath();
    ctx.roundRect(barrelStart, -barrelGap / 2 - barrelW, barrelLen, barrelW, 1);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(barrelStart, barrelGap / 2, barrelLen, barrelW, 1);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(barrelStart + 2, -barrelGap / 2 - barrelW + 0.5, barrelLen - 4, 0.9);
    ctx.fillRect(barrelStart + 2, barrelGap / 2 + 0.5, barrelLen - 4, 0.9);
    
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(barrelStart + barrelLen - 1.5, -barrelGap / 2 - barrelW / 2, barrelW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(barrelStart + barrelLen - 1.5, barrelGap / 2 + barrelW / 2, barrelW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // "Domek" pentagonal turret (rectangle + pointed front)
    const R = 14;
    const frontPoint = 5;
    const drawDomek = () => {
        ctx.beginPath();
        ctx.moveTo(-R, -R * 0.85);
        ctx.lineTo(R * 0.6, -R * 0.85);
        ctx.lineTo(R + frontPoint, 0);
        ctx.lineTo(R * 0.6, R * 0.85);
        ctx.lineTo(-R, R * 0.85);
        ctx.closePath();
    };
    
    const g = ctx.createLinearGradient(0, -R * 0.85, 0, R * 0.85);
    g.addColorStop(0, '#b8b8b8');
    g.addColorStop(0.5, '#5a5a5a');
    g.addColorStop(1, '#b8b8b8');
    ctx.fillStyle = g;
    drawDomek();
    ctx.fill();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawDomek();
    ctx.stroke();
    
    // Bolts na rogach turret
    ctx.fillStyle = '#000';
    [[-R + 2, -R * 0.75], [R * 0.55, -R * 0.75], [R * 0.55, R * 0.75], [-R + 2, R * 0.75]].forEach(([bx, by]) => {
        ctx.beginPath();
        ctx.arc(bx, by, 0.9, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Hatch
    drawHatch(ctx, -R * 0.3, 0, 4.5, '#3a3a3a');
    
    // Front detail (mała "twarz" domku)
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(R * 0.6, -R * 0.5);
    ctx.lineTo(R + frontPoint - 2, 0);
    ctx.lineTo(R * 0.6, R * 0.5);
    ctx.stroke();
}

// =============================================================================
// ZWIAD (SCOUT) — piaskowy kamuflaż, duży round turret z visor + ERA
// =============================================================================

function drawScoutHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.scout;
    const hhl = c.HL / 2;
    const hhw = c.HW / 2;
    
    drawTrackBase(ctx, hhl, hhw, c.TRK_H);
    drawTrackDetails(ctx, hhl, hhw, c.TRK_H, 4, 8);
    
    const drawShape = () => {
        ctx.beginPath();
        ctx.moveTo(-hhl, -hhw);
        ctx.lineTo(hhl - 6, -hhw);
        ctx.lineTo(hhl, -hhw * 0.3);
        ctx.lineTo(hhl, hhw * 0.3);
        ctx.lineTo(hhl - 6, hhw);
        ctx.lineTo(-hhl, hhw);
        ctx.closePath();
    };
    
    const grad = ctx.createLinearGradient(0, -hhw, 0, hhw);
    grad.addColorStop(0, '#e0c890');
    grad.addColorStop(0.5, '#8c6e3a');
    grad.addColorStop(1, '#e0c890');
    ctx.fillStyle = grad;
    drawShape();
    ctx.fill();
    
    // Desert camo spots
    drawCamoSpot(ctx, -hhl + 7, -4, 4, 2.5, '#6e5a30', 0.4);
    drawCamoSpot(ctx, -2, 5, 3.5, 3, '#3a2e1a', -0.3);
    drawCamoSpot(ctx, 7, -5, 3.5, 2, '#6e5a30', 0.5);
    drawCamoSpot(ctx, hhl - 12, 3, 2.5, 3, '#3a2e1a', 0.2);
    
    // Małe exhausts
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 2.2);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 2.2);
    
    // Hull outline (cienki — lekki tank)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.3;
    drawShape();
    ctx.stroke();
    
    // Mały magnifier emblem na froncie
    ctx.strokeStyle = '#3a2e1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hhl - 10, -1, 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hhl - 8.5, 0.8);
    ctx.lineTo(hhl - 7, 2.5);
    ctx.stroke();
    
    // Center turret mount
    ctx.fillStyle = '#6e5a30';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

function drawScoutTurret(ctx: CanvasRenderingContext2D): void {
    // Mała 1 lufa (Scout = niski dmg)
    const barrelLen = 19, barrelW = 4, barrelStart = 4;
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(barrelStart, -barrelW / 2, barrelLen, barrelW, 1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(barrelStart + 2, -barrelW / 2 + 0.5, barrelLen - 4, 0.8);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(barrelStart + barrelLen - 1.5, 0, barrelW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // Active armor blocks (3 sztuki na górze, 3 na dole — perpendykularnie do lufy)
    const armorR = 16.5;  // odległość od center
    for (let i = -1; i <= 1; i++) {
        drawActiveArmorBlock(ctx, i * 5.5, -armorR, 4.5, 4, '#a48a52');
        drawActiveArmorBlock(ctx, i * 5.5, armorR, 4.5, 4, '#a48a52');
    }
    
    // Duża okrągła wieża
    const R = 14.5;
    const g = ctx.createLinearGradient(0, -R, 0, R);
    g.addColorStop(0, '#e0c890');
    g.addColorStop(0.5, '#8c6e3a');
    g.addColorStop(1, '#e0c890');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();
    
    // DUŻY wizjer w środku turret
    drawBigVisor(ctx, -2, 0, R * 0.55, R * 0.4);
    
    // Mały magnifier symbol na boku
    ctx.strokeStyle = '#3a2e1a';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(-R * 0.65, -R * 0.65, 1.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-R * 0.55, -R * 0.55);
    ctx.lineTo(-R * 0.4, -R * 0.4);
    ctx.stroke();
}

// =============================================================================
// SNAJPER — granat + złote nity, długa gruba lufa, domek turret z scope
// =============================================================================

function drawSniperHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.sniper;
    const hhl = c.HL / 2;
    const hhw = c.HW / 2;
    
    drawTrackBase(ctx, hhl, hhw, c.TRK_H);
    drawTrackDetails(ctx, hhl, hhw, c.TRK_H, 5, 9);
    
    const drawShape = () => {
        ctx.beginPath();
        ctx.moveTo(-hhl, -hhw);
        ctx.lineTo(hhl - 4, -hhw);
        ctx.lineTo(hhl, -hhw * 0.4);
        ctx.lineTo(hhl, hhw * 0.4);
        ctx.lineTo(hhl - 4, hhw);
        ctx.lineTo(-hhl, hhw);
        ctx.closePath();
    };
    
    const grad = ctx.createLinearGradient(0, -hhw, 0, hhw);
    grad.addColorStop(0, '#2f4e8a');
    grad.addColorStop(0.5, '#0c1838');
    grad.addColorStop(1, '#2f4e8a');
    ctx.fillStyle = grad;
    drawShape();
    ctx.fill();
    
    // Gold accent stripes (subtelne — tylko 2 cienkie linie wzdłuż hull)
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-hhl + 5, -hhw + 3);
    ctx.lineTo(hhl - 5, -hhw + 3);
    ctx.moveTo(-hhl + 5, hhw - 3);
    ctx.lineTo(hhl - 5, hhw - 3);
    ctx.stroke();
    
    // Małe exhausts (Sniper bez animacji)
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 2.5);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 2.5);
    
    // Outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawShape();
    ctx.stroke();
    
    // 6 GOLD RIVETS w narożnikach + środkowych pozycjach
    drawGoldRivet(ctx, -hhl + 4, -hhw + 4, 1.5);
    drawGoldRivet(ctx, hhl - 6, -hhw + 4, 1.5);
    drawGoldRivet(ctx, -hhl + 4, hhw - 4, 1.5);
    drawGoldRivet(ctx, hhl - 6, hhw - 4, 1.5);
    drawGoldRivet(ctx, 0, -hhw + 4, 1.3);
    drawGoldRivet(ctx, 0, hhw - 4, 1.3);
    
    // Target/crosshair emblem na froncie
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hhl - 10, 0, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hhl - 13, 0);
    ctx.lineTo(hhl - 7, 0);
    ctx.moveTo(hhl - 10, -3);
    ctx.lineTo(hhl - 10, 3);
    ctx.stroke();
    
    // Center turret mount
    ctx.fillStyle = '#0c1838';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Gold ring around mount
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
}

function drawSniperTurret(ctx: CanvasRenderingContext2D): void {
    // DŁUGA GRUBA lufa
    const barrelLen = 30, barrelW = 6.5, barrelStart = 4;
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(barrelStart, -barrelW / 2, barrelLen, barrelW, 1.5);
    ctx.fill();
    ctx.stroke();
    
    // Gold trim na lufie (sniper accent)
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(barrelStart + 3, -barrelW / 2, 1.5, barrelW);
    ctx.fillRect(barrelStart + barrelLen - 5, -barrelW / 2, 1.5, barrelW);
    
    // Highlight na lufie
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(barrelStart + 2, -barrelW / 2 + 0.5, barrelLen - 4, 1.2);
    
    // Muzzle (gruby)
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(barrelStart + barrelLen - 2, 0, barrelW * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // "Domek" pentagonal turret
    const R = 14;
    const frontPoint = 4;
    const drawDomek = () => {
        ctx.beginPath();
        ctx.moveTo(-R, -R * 0.8);
        ctx.lineTo(R * 0.5, -R * 0.8);
        ctx.lineTo(R + frontPoint, 0);
        ctx.lineTo(R * 0.5, R * 0.8);
        ctx.lineTo(-R, R * 0.8);
        ctx.closePath();
    };
    
    const g = ctx.createLinearGradient(0, -R * 0.8, 0, R * 0.8);
    g.addColorStop(0, '#2f4e8a');
    g.addColorStop(0.5, '#0c1838');
    g.addColorStop(1, '#2f4e8a');
    ctx.fillStyle = g;
    drawDomek();
    ctx.fill();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawDomek();
    ctx.stroke();
    
    // SCOPE na top turret (powyżej hatch)
    drawScopeAttachment(ctx, -R * 0.15, -R * 0.45, 9, 4);
    
    // Range finder panel (subtelny prostokąt z gold trim)
    ctx.fillStyle = '#0c1838';
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.roundRect(-R * 0.7, R * 0.3, 6, 3.5, 0.5);
    ctx.fill();
    ctx.stroke();
    // 3 LED na panelu
    [0xff0000, 0x00ff00, 0xffd700].forEach((col, i) => {
        ctx.fillStyle = '#' + col.toString(16).padStart(6, '0');
        ctx.beginPath();
        ctx.arc(-R * 0.55 + i * 1.6, R * 0.475, 0.5, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Hatch z gold trim
    drawHatch(ctx, -R * 0.3, R * 0.15, 4, '#0c1838', true);
    
    // 6 GOLD RIVETS na turret
    [
        [-R * 0.9, -R * 0.7], [R * 0.35, -R * 0.7],
        [-R * 0.9, R * 0.7], [R * 0.35, R * 0.7],
        [R * 0.85, -R * 0.25], [R * 0.85, R * 0.25],
    ].forEach(([rx, ry]) => drawGoldRivet(ctx, rx, ry, 1.1));
}

// =============================================================================
// GENERIC FALLBACK (kopia v4.48)
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
            ctx.scale(TANK_CANVAS_SCALE, TANK_CANVAS_SCALE);
            drawFn(ctx);
            return PIXI.Texture.from(canvas);
        };
        
        let hullDraw: (ctx: CanvasRenderingContext2D) => void;
        let turretDraw: (ctx: CanvasRenderingContext2D) => void;
        
        switch (brawler.id) {
            case 'pyro':   hullDraw = drawPyroHull;   turretDraw = drawPyroTurret;   break;
            case 'twardy': hullDraw = drawTwardyHull; turretDraw = drawTwardyTurret; break;
            case 'heavy':  hullDraw = drawHeavyHull;  turretDraw = drawHeavyTurret;  break;
            case 'scout':  hullDraw = drawScoutHull;  turretDraw = drawScoutTurret;  break;
            case 'sniper': hullDraw = drawSniperHull; turretDraw = drawSniperTurret; break;
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