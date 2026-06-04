import * as PIXI from 'pixi.js';
import type { Brawler } from '../types/Brawler';

// =============================================================================
// CONFIG (eksportowane dla Player.ts)
// =============================================================================

export const TANK_CANVAS_SCALE = 1.75;

export interface BrawlerProgrammaticConfig {
    HL: number; HW: number; TRK_H: number;
    EXHAUST_X: number; EXHAUST_Y: number;
    HAS_FLAME: boolean;
    FLAME_COLOR_OUTER?: number; FLAME_COLOR_INNER?: number;
    HAS_SMOKE: boolean;
    SMOKE_COLOR?: number; SMOKE_ALPHA?: number;
    SMOKE_BOOST?: number; // 1.5 dla Twardy/Heavy (większy dym)
}

export const PROGRAMMATIC_BRAWLER_CONFIG: Record<string, BrawlerProgrammaticConfig> = {
    pyro:   { HL: 62, HW: 32, TRK_H: 8, EXHAUST_X: -29, EXHAUST_Y: 10, HAS_FLAME: true, FLAME_COLOR_OUTER: 0xff7e2a, FLAME_COLOR_INNER: 0xffdc4a, HAS_SMOKE: true, SMOKE_COLOR: 0x4a4a4a, SMOKE_ALPHA: 0.55 },
    twardy: { HL: 56, HW: 28, TRK_H: 7, EXHAUST_X: -26, EXHAUST_Y: 8,  HAS_FLAME: false, HAS_SMOKE: true, SMOKE_COLOR: 0x4a7a3a, SMOKE_ALPHA: 0.6, SMOKE_BOOST: 1.5 },
    heavy:  { HL: 62, HW: 32, TRK_H: 8, EXHAUST_X: -29, EXHAUST_Y: 10, HAS_FLAME: false, HAS_SMOKE: true, SMOKE_COLOR: 0x1a1a1a, SMOKE_ALPHA: 0.7, SMOKE_BOOST: 1.5 },
    scout:  { HL: 55, HW: 26, TRK_H: 5, EXHAUST_X: -25, EXHAUST_Y: 8,  HAS_FLAME: false, HAS_SMOKE: true, SMOKE_COLOR: 0xddaa00, SMOKE_ALPHA: 0.7, SMOKE_BOOST: 1.5 },
    sniper: { HL: 54, HW: 26, TRK_H: 6, EXHAUST_X: -25, EXHAUST_Y: 7.5, HAS_FLAME: false, HAS_SMOKE: true, SMOKE_COLOR: 0xddaa00, SMOKE_ALPHA: 0.65, SMOKE_BOOST: 1.5 },
    plasma: { HL: 60, HW: 30, TRK_H: 7, EXHAUST_X: -28, EXHAUST_Y: 9.5, HAS_FLAME: false, HAS_SMOKE: true, SMOKE_COLOR: 0xddaa00, SMOKE_ALPHA: 0.7, SMOKE_BOOST: 1.5 },
    shadow: { HL: 58, HW: 28, TRK_H: 7, EXHAUST_X: -27, EXHAUST_Y: 9,  HAS_FLAME: false, HAS_SMOKE: true, SMOKE_COLOR: 0x888888, SMOKE_ALPHA: 0.7, SMOKE_BOOST: 1.5 },
    king:   { HL: 64, HW: 32, TRK_H: 8, EXHAUST_X: -30, EXHAUST_Y: 10, HAS_FLAME: false, HAS_SMOKE: true, SMOKE_COLOR: 0xff8c2a, SMOKE_ALPHA: 0.7, SMOKE_BOOST: 1.5 },
};

// =============================================================================
// SHARED HELPERS
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
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.8;
    const segSpacing = (hhl * 2) / segCount;
    for (let i = 0; i <= segCount; i++) {
        const x = -hhl + i * segSpacing;
        ctx.beginPath(); ctx.moveTo(x, -hhw - TRK_H + 0.5); ctx.lineTo(x, -hhw - 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, hhw + 0.5); ctx.lineTo(x, hhw + TRK_H - 0.5); ctx.stroke();
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.8;
    const wheelSpacing = (hhl * 2) / (wheelCount + 1);
    const wheelR = Math.min(2.3, TRK_H * 0.35);
    for (let i = 0; i < wheelCount; i++) {
        const x = -hhl + wheelSpacing * (i + 1);
        ctx.beginPath(); ctx.arc(x, -hhw - TRK_H / 2, wheelR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, hhw + TRK_H / 2, wheelR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#777';
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function drawHatch(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, baseColor: string, goldTrim: boolean = false): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (goldTrim) {
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.stroke();
    } else {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.stroke();
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
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f4d76a';
    ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.4, 0, Math.PI * 2); ctx.fill();
}

function drawDarkRivet(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.fillStyle = '#2a2a2a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
}

function drawWhiteStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.6;
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
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 1);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a4a8a';
    ctx.beginPath(); ctx.arc(w / 2 - 1, 0, h * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.fillStyle = '#7aa0d0';
    ctx.beginPath(); ctx.arc(w / 2 - 1.5, -h * 0.1, h * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(w / 2 - 1.8, -h * 0.18, h * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(w / 2 - 1, 0, h * 0.4, 0, Math.PI * 2); ctx.stroke();
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
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 0, w + 0.7, h + 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a3a5e';
    ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a7fa3';
    ctx.beginPath(); ctx.ellipse(-w * 0.2, -h * 0.2, w * 0.55, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-w * 0.35, -h * 0.4, w * 0.22, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(-w * 0.85, 0); ctx.lineTo(w * 0.85, 0); ctx.moveTo(0, -h * 0.85); ctx.lineTo(0, h * 0.85); ctx.stroke();
    ctx.restore();
}

function drawActiveArmorBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, baseColor: string): void {
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 0.5);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = lerpHex(baseColor, 40);
    ctx.fillRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, 0.8);
}

function drawTankNumber(ctx: CanvasRenderingContext2D, num: string, cx: number, cy: number, fontSize: number, color: string): void {
    ctx.save();
    ctx.font = `900 ${fontSize}px Arial, "Helvetica Neue", sans-serif`;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(num, cx, cy);
    ctx.fillText(num, cx, cy);
    ctx.restore();
}

function drawFrontSpikes(ctx: CanvasRenderingContext2D, frontX: number, color: string, outline: string): void {
    // 3 ostre kolce z przodu hull (Tech/Shadow/King)
    ctx.fillStyle = color;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.8;
    const spikes = [
        { y: -5, len: 5 },
        { y: 0,  len: 7 },
        { y: 5,  len: 5 },
    ];
    for (const s of spikes) {
        ctx.beginPath();
        ctx.moveTo(frontX, s.y - 1.5);
        ctx.lineTo(frontX + s.len, s.y);
        ctx.lineTo(frontX, s.y + 1.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}

function drawLongBarrelWithTip(ctx: CanvasRenderingContext2D, barrelStart: number, barrelLen: number, barrelW: number, baseColor: string, tipColor: string): void {
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(barrelStart, -barrelW / 2, barrelLen, barrelW, 1.2);
    ctx.fill(); ctx.stroke();
    
    // Highlight band
    ctx.fillStyle = lerpHex(baseColor, 25);
    ctx.fillRect(barrelStart + 2, -barrelW / 2 + 0.5, barrelLen - 4, 1.1);
    
    // Tip (czerwony / zielony itd.)
    ctx.fillStyle = tipColor;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barrelStart + barrelLen - 4, -barrelW / 2 - 0.5, 4, barrelW + 1, 0.8);
    ctx.fill(); ctx.stroke();
    
    // Muzzle hole
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(barrelStart + barrelLen - 2, 0, barrelW * 0.35, 0, Math.PI * 2);
    ctx.fill();
}

// =============================================================================
// PYRO (Ogniarz) — ceglany moro, hatch przesunięty 20% do tyłu, wizjer, numer 09
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
    ctx.fill(); ctx.stroke();
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
    ctx.beginPath(); ctx.ellipse(0, 0, w + 0.5, h + 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a3a5e';
    ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a7fa3';
    ctx.beginPath(); ctx.ellipse(-w * 0.15, -h * 0.15, w * 0.6, h * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-w * 0.35, -h * 0.4, w * 0.25, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function drawPyroHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.pyro;
    const hhl = c.HL / 2, hhw = c.HW / 2;
    
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
    
    // Ceglany moro gradient: jasny ceglany → ciemny ceglany → jasny ceglany
    const grad = ctx.createLinearGradient(0, -hhw, 0, hhw);
    grad.addColorStop(0, '#c44d2f');
    grad.addColorStop(0.5, '#6b2818');
    grad.addColorStop(1, '#c44d2f');
    ctx.fillStyle = grad;
    drawShape();
    ctx.fill();
    
    // Camo spots (ciemniejszy ceglany)
    drawCamoSpot(ctx, -hhl + 9, -6, 5, 3, '#4b1810', 0.3);
    drawCamoSpot(ctx, -4, 7, 4.5, 3.5, '#3a120a', -0.4);
    drawCamoSpot(ctx, 8, -8, 4, 2.5, '#4b1810', 0.5);
    drawCamoSpot(ctx, hhl - 14, 5, 3, 4, '#3a120a', 0.2);
    
    // Engine grille z tyłu
    drawEngineGrille(ctx, -hhl + 8, 0, 7, 16, '#1a1a1a', '#7a3520');
    
    // Exhausts
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 2.8);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 2.8);
    
    // Outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawShape();
    ctx.stroke();
    
    // Panel seam
    ctx.strokeStyle = '#3a120a';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-hhl + 5, 0); ctx.lineTo(hhl - 5, 0);
    ctx.stroke();
    
    // Płomienie na bokach
    drawPyroFlameDecal(ctx, -6, -hhw * 0.6, 6);
    drawPyroFlameDecal(ctx, -6, hhw * 0.6, 6, true);
    
    // Wizjer na froncie hull (mały)
    drawPyroVisor(ctx, hhl - 11, 0, 4.5, 2.8);
    
    // Center turret mount
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#4b1810';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a120a';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
}

function drawPyroTurret(ctx: CanvasRenderingContext2D): void {
    // 3 lufy (Pyro = spread shot)
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    
    const mainLen = 26, mainW = 5.5, barrelStart = 4;
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath(); ctx.roundRect(barrelStart, -mainW / 2, mainLen, mainW, 1); ctx.fill(); ctx.stroke();
    
    const sideLen = 21, sideW = 3.5, sideY = 8;
    ctx.beginPath(); ctx.roundRect(barrelStart, -sideY - sideW / 2, sideLen, sideW, 1); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(barrelStart, sideY - sideW / 2, sideLen, sideW, 1); ctx.fill(); ctx.stroke();
    
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(barrelStart + 2, -mainW / 2 + 0.5, mainLen - 4, 1);
    ctx.fillRect(barrelStart + 2, -sideY - sideW / 2 + 0.4, sideLen - 4, 0.7);
    ctx.fillRect(barrelStart + 2, sideY - sideW / 2 + 0.4, sideLen - 4, 0.7);
    
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(barrelStart + mainLen - 1.5, 0, mainW * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(barrelStart + sideLen - 1.5, -sideY, sideW * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(barrelStart + sideLen - 1.5, sideY, sideW * 0.4, 0, Math.PI * 2); ctx.fill();
    
    // Hex turret base
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
    g.addColorStop(0, '#c44d2f');
    g.addColorStop(0.5, '#6b2818');
    g.addColorStop(1, '#c44d2f');
    ctx.fillStyle = g;
    drawHex();
    ctx.fill();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawHex();
    ctx.stroke();
    
    // Hatch przesunięty 20% do tyłu
    const hatchX = -R * 0.2;
    drawHatch(ctx, hatchX, 0, R * 0.35, '#4b1810');
    
    // Wizjer dodatkowy na turret (z przodu od hatch)
    drawPyroVisor(ctx, R * 0.45, 0, 3, 1.8);
    
    // Numer 09 nad włazem (-y od hatch)
    drawTankNumber(ctx, '09', hatchX, -R * 0.62, 5, '#ffd700');
    
    // Płomień na boku turret
    drawPyroFlameDecal(ctx, -R * 0.65, -R * 0.55, 3.5);
}

// =============================================================================
// TWARDY — zielony moro, ucięty stożek, star +50%, dłuższa lufa, numer 21
// =============================================================================

function drawTwardyHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.twardy;
    const hhl = c.HL / 2, hhw = c.HW / 2;
    
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
    
    drawCamoSpot(ctx, -hhl + 9, -5, 5, 3, '#3d5a2d', 0.3);
    drawCamoSpot(ctx, -3, 6, 4.5, 3.5, '#1a2d12', -0.4);
    drawCamoSpot(ctx, 7, -7, 4, 2.5, '#3d5a2d', 0.5);
    drawCamoSpot(ctx, hhl - 13, 4, 3, 4, '#1a2d12', 0.2);
    drawCamoSpot(ctx, -hhl + 16, 8, 3, 2, '#3d5a2d', -0.3);
    drawCamoSpot(ctx, 0, -2, 3.5, 2, '#1a2d12', 0.6);
    
    drawEngineGrille(ctx, -hhl + 8, 0, 7, 16, '#1a2d12', '#5a7a3a');
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 2.6);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 2.6);
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawShape();
    ctx.stroke();
    
    // Star powiększona 50% (z 4.5 → 6.75)
    drawWhiteStar(ctx, hhl - 11, 0, 6.75);
    
    ctx.fillStyle = '#3d5a2d';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawTwardyTurret(ctx: CanvasRenderingContext2D): void {
    // Lufa +20% dłuższa (23 → 27.6), kolor #4a6a32 (najciemniejszy), końcówka zielona
    const barrelLen = 27.6, barrelW = 5, barrelStart = 4;
    drawLongBarrelWithTip(ctx, barrelStart, barrelLen, barrelW, '#4a6a32', '#27ae60');
    
    // Ucięty stożek — 2 concentric circles
    const outerR = 14.5, innerR = 10;
    const g = ctx.createLinearGradient(0, -outerR, 0, outerR);
    g.addColorStop(0, '#8aae6a');
    g.addColorStop(0.5, '#4a6a32');
    g.addColorStop(1, '#8aae6a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, outerR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, outerR, 0, Math.PI * 2); ctx.stroke();
    
    ctx.fillStyle = '#6b8e4a';
    ctx.beginPath(); ctx.arc(0, 0, innerR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, innerR, 0, Math.PI * 2); ctx.stroke();
    
    ctx.strokeStyle = '#3d5a2d';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, (outerR + innerR) / 2, 0, Math.PI * 2); ctx.stroke();
    
    // Hatch
    drawHatch(ctx, 0, 0, innerR * 0.45, '#3d5a2d');
    
    // Numer 21 nad włazem - żółta czcionka
    drawTankNumber(ctx, '21', 0, -outerR * 0.62, 5, '#ffd700');
    
    // Star powiększona 50% na boku
    drawWhiteStar(ctx, -outerR * 0.6, -outerR * 0.6, 3.75);
}

// =============================================================================
// PANCERNY (Heavy) — szary, 2 lufy +20%, więcej nitów, kratka wentylacyjna z przodu, numer 44
// =============================================================================

function drawHeavyHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.heavy;
    const hhl = c.HL / 2, hhw = c.HW / 2;
    
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
    
    // 4 ERA armor panels
    drawActiveArmorBlock(ctx, -8, -hhw + 3, 8, 4, '#7a7a7a');
    drawActiveArmorBlock(ctx, 8, -hhw + 3, 8, 4, '#7a7a7a');
    drawActiveArmorBlock(ctx, -8, hhw - 3, 8, 4, '#7a7a7a');
    drawActiveArmorBlock(ctx, 8, hhw - 3, 8, 4, '#7a7a7a');
    
    // Engine grille z tyłu
    drawEngineGrille(ctx, -hhl + 9, 0, 9, 18, '#1a1a1a', '#888');
    
    // NOWA: kratka wentylacyjna z PRZODU (mniejsza)
    drawEngineGrille(ctx, hhl - 9, 0, 6, 12, '#1a1a1a', '#aaa');
    
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 3.2);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 3.2);
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawShape();
    ctx.stroke();
    
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-hhl + 5, 0); ctx.lineTo(hhl - 5, 0);
    ctx.stroke();
    
    // WIĘCEJ ciemno-szarych nitów na hull
    const hullRivets: [number, number][] = [
        [-hhl + 3, -hhw + 3], [hhl - 7, -hhw + 3], [-hhl + 3, hhw - 3], [hhl - 7, hhw - 3],
        [-hhl + 12, -hhw + 4], [-hhl + 12, hhw - 4],
        [hhl - 13, -hhw + 4], [hhl - 13, hhw - 4],
        [0, -hhw + 3], [0, hhw - 3],
        [-4, -hhw + 8], [4, -hhw + 8],
        [-4, hhw - 8], [4, hhw - 8],
    ];
    for (const [rx, ry] of hullRivets) drawDarkRivet(ctx, rx, ry, 1.1);
    
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawHeavyTurret(ctx: CanvasRenderingContext2D): void {
    // 2 lufy +20% dłuższe (24 → 28.8)
    const barrelLen = 28.8, barrelW = 4.5, barrelStart = 5, barrelGap = 5;
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(barrelStart, -barrelGap / 2 - barrelW, barrelLen, barrelW, 1); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(barrelStart, barrelGap / 2, barrelLen, barrelW, 1); ctx.fill(); ctx.stroke();
    
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(barrelStart + 2, -barrelGap / 2 - barrelW + 0.5, barrelLen - 4, 0.9);
    ctx.fillRect(barrelStart + 2, barrelGap / 2 + 0.5, barrelLen - 4, 0.9);
    
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(barrelStart + barrelLen - 1.5, -barrelGap / 2 - barrelW / 2, barrelW * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(barrelStart + barrelLen - 1.5, barrelGap / 2 + barrelW / 2, barrelW * 0.4, 0, Math.PI * 2); ctx.fill();
    
    // Domek pentagonal turret
    const R = 14, frontPoint = 5;
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
    
    // Nity na turret (więcej ciemno-szarych)
    const turretRivets: [number, number][] = [
        [-R + 2, -R * 0.75], [R * 0.55, -R * 0.75],
        [-R + 2, R * 0.75], [R * 0.55, R * 0.75],
        [-R + 2, 0], [R * 0.4, -R * 0.4], [R * 0.4, R * 0.4],
    ];
    for (const [rx, ry] of turretRivets) drawDarkRivet(ctx, rx, ry, 1.0);
    
    // Hatch
    drawHatch(ctx, -R * 0.3, 0, 4.5, '#3a3a3a');
    
    // Numer 44 - biała czcionka
    drawTankNumber(ctx, '44', -R * 0.3, -R * 0.55, 5, '#ffffff');
}

// =============================================================================
// SCOUT — piaskowy +10%, lufa +100%, przycięta wieża, numer 67, exhaust + dym żółty
// =============================================================================

function drawScoutHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.scout;
    const hhl = c.HL / 2, hhw = c.HW / 2;
    
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
    
    drawCamoSpot(ctx, -hhl + 7, -4, 4, 2.5, '#6e5a30', 0.4);
    drawCamoSpot(ctx, -2, 5, 3.5, 3, '#3a2e1a', -0.3);
    drawCamoSpot(ctx, 7, -5, 3.5, 2, '#6e5a30', 0.5);
    drawCamoSpot(ctx, hhl - 12, 3, 2.5, 3, '#3a2e1a', 0.2);
    
    drawEngineGrille(ctx, -hhl + 8, 0, 6, 14, '#3a2e1a', '#a48a52');
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 2.4);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 2.4);
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.3;
    drawShape();
    ctx.stroke();
    
    // Magnifier emblem na froncie
    ctx.strokeStyle = '#3a2e1a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hhl - 10, -1, 2.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hhl - 8.5, 0.8); ctx.lineTo(hhl - 7, 2.5); ctx.stroke();
    
    ctx.fillStyle = '#6e5a30';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawScoutTurret(ctx: CanvasRenderingContext2D): void {
    // Lufa +100% dłuższa (19 → 38)
    const barrelLen = 38, barrelW = 4, barrelStart = 4;
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.roundRect(barrelStart, -barrelW / 2, barrelLen, barrelW, 1); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(barrelStart + 2, -barrelW / 2 + 0.5, barrelLen - 4, 0.8);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(barrelStart + barrelLen - 1.5, 0, barrelW * 0.4, 0, Math.PI * 2); ctx.fill();
    
    // ERA armor blocks
    const armorR = 16.5;
    for (let i = -1; i <= 1; i++) {
        drawActiveArmorBlock(ctx, i * 5.5, -armorR, 4.5, 4, '#a48a52');
        drawActiveArmorBlock(ctx, i * 5.5, armorR, 4.5, 4, '#a48a52');
    }
    
    // PRZYCIĘTA wieżyczka — elliptical (boki cut off, prostokąt z zaokrąglonymi końcami)
    const Rx = 14.5; // szerszy w x
    const Ry = 10;   // węższy w y (boki cut)
    
    const g = ctx.createLinearGradient(0, -Ry, 0, Ry);
    g.addColorStop(0, '#e0c890');
    g.addColorStop(0.5, '#8c6e3a');
    g.addColorStop(1, '#e0c890');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, Rx, Ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, Rx, Ry, 0, 0, Math.PI * 2); ctx.stroke();
    
    // Duży wizjer w środku turret
    drawBigVisor(ctx, -2, 0, Rx * 0.55, Ry * 0.5);
    
    // Hatch z tyłu
    drawHatch(ctx, -Rx * 0.55, 0, Ry * 0.35, '#6e5a30');
    
    // Numer 67 nad hatch - biała czcionka
    drawTankNumber(ctx, '67', -Rx * 0.55, -Ry * 0.55, 4, '#ffffff');
}

// =============================================================================
// SNIPER — granat + złote nity, lufa +30%, numer 7 żółty, exhaust + dym żółty
// =============================================================================

function drawSniperHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.sniper;
    const hhl = c.HL / 2, hhw = c.HW / 2;
    
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
    
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-hhl + 5, -hhw + 3); ctx.lineTo(hhl - 5, -hhw + 3);
    ctx.moveTo(-hhl + 5, hhw - 3); ctx.lineTo(hhl - 5, hhw - 3);
    ctx.stroke();
    
    drawEngineGrille(ctx, -hhl + 8, 0, 7, 14, '#0c1838', '#3a5a8a');
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 2.5);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 2.5);
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawShape();
    ctx.stroke();
    
    // Gold rivets
    drawGoldRivet(ctx, -hhl + 4, -hhw + 4, 1.5);
    drawGoldRivet(ctx, hhl - 6, -hhw + 4, 1.5);
    drawGoldRivet(ctx, -hhl + 4, hhw - 4, 1.5);
    drawGoldRivet(ctx, hhl - 6, hhw - 4, 1.5);
    drawGoldRivet(ctx, 0, -hhw + 4, 1.3);
    drawGoldRivet(ctx, 0, hhw - 4, 1.3);
    
    // Crosshair na froncie
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hhl - 10, 0, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hhl - 13, 0); ctx.lineTo(hhl - 7, 0);
    ctx.moveTo(hhl - 10, -3); ctx.lineTo(hhl - 10, 3);
    ctx.stroke();
    
    ctx.fillStyle = '#0c1838';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
}

function drawSniperTurret(ctx: CanvasRenderingContext2D): void {
    // Lufa +30% dłuższa (30 → 39), gruba
    const barrelLen = 39, barrelW = 6.5, barrelStart = 4;
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(barrelStart, -barrelW / 2, barrelLen, barrelW, 1.5); ctx.fill(); ctx.stroke();
    
    // Gold trim na lufie (2 paski)
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(barrelStart + 4, -barrelW / 2, 1.5, barrelW);
    ctx.fillRect(barrelStart + barrelLen - 6, -barrelW / 2, 1.5, barrelW);
    
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(barrelStart + 2, -barrelW / 2 + 0.5, barrelLen - 4, 1.2);
    
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(barrelStart + barrelLen - 2, 0, barrelW * 0.4, 0, Math.PI * 2); ctx.fill();
    
    // Domek pentagonal turret
    const R = 14, frontPoint = 4;
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
    
    // Scope na top
    drawScopeAttachment(ctx, -R * 0.15, -R * 0.45, 9, 4);
    
    // Range finder panel
    ctx.fillStyle = '#0c1838';
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.roundRect(-R * 0.7, R * 0.3, 6, 3.5, 0.5);
    ctx.fill(); ctx.stroke();
    [0xff0000, 0x00ff00, 0xffd700].forEach((col, i) => {
        ctx.fillStyle = '#' + col.toString(16).padStart(6, '0');
        ctx.beginPath();
        ctx.arc(-R * 0.55 + i * 1.6, R * 0.475, 0.5, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Hatch z gold trim
    drawHatch(ctx, -R * 0.3, R * 0.15, 4, '#0c1838', true);
    
    // Numer 7 - żółta czcionka
    drawTankNumber(ctx, '7', -R * 0.3, -R * 0.3, 5, '#ffd700');
    
    // Gold rivets
    [[-R * 0.9, -R * 0.7], [R * 0.35, -R * 0.7], [-R * 0.9, R * 0.7], [R * 0.35, R * 0.7], [R * 0.85, -R * 0.25], [R * 0.85, R * 0.25]].forEach(([rx, ry]) => drawGoldRivet(ctx, rx, ry, 1.1));
}

// =============================================================================
// TECH (PLASMA) — #71B7F2 z PCB camo, kolce, domek turret z rounded rogami, długa lufa z red tip
// =============================================================================

function drawPCBPattern(ctx: CanvasRenderingContext2D, hhl: number, hhw: number, lineColor: string, dotColor: string): void {
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 0.5;
    
    // Linie PCB (połączenia)
    const lines = [
        [[-hhl + 6, -hhw + 5], [-hhl + 6, 0], [-5, 0]],
        [[-hhl + 12, hhw - 5], [-hhl + 12, hhw - 12], [0, hhw - 12]],
        [[hhl - 10, -hhw + 6], [hhl - 10, -3], [-3, -3]],
        [[hhl - 6, 5], [4, 5], [4, hhw - 5]],
        [[-3, -hhw + 4], [-3, -7]],
        [[6, -hhw + 8], [6, -3]],
    ];
    for (const path of lines) {
        ctx.beginPath();
        path.forEach(([x, y], i) => {
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }
    
    // Kółeczka (chip pads)
    ctx.fillStyle = dotColor;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 0.3;
    const dots: [number, number][] = [
        [-hhl + 6, -hhw + 5], [-hhl + 6, 0], [-5, 0],
        [-hhl + 12, hhw - 5], [-hhl + 12, hhw - 12], [0, hhw - 12],
        [hhl - 10, -hhw + 6], [hhl - 10, -3], [-3, -3],
        [hhl - 6, 5], [4, 5], [4, hhw - 5],
        [-3, -hhw + 4], [-3, -7], [6, -hhw + 8], [6, -3],
    ];
    for (const [dx, dy] of dots) {
        ctx.beginPath();
        ctx.arc(dx, dy, 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

function drawTechHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.plasma;
    const hhl = c.HL / 2, hhw = c.HW / 2;
    
    drawTrackBase(ctx, hhl, hhw, c.TRK_H);
    drawTrackDetails(ctx, hhl, hhw, c.TRK_H, 5, 10);
    
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
    
    // #71B7F2 błękit z gradientem
    const grad = ctx.createLinearGradient(0, -hhw, 0, hhw);
    grad.addColorStop(0, '#a8d4f8');
    grad.addColorStop(0.5, '#71B7F2');
    grad.addColorStop(1, '#3a6ea0');
    ctx.fillStyle = grad;
    drawShape();
    ctx.fill();
    
    // PCB camo pattern
    drawPCBPattern(ctx, hhl, hhw, '#1a3560', '#0a2548');
    
    // Okrągłe silniki wydechowe (na tyle, większe niż exhaust pipes)
    ctx.fillStyle = '#1a3560';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(-hhl + 5, -8, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-hhl + 5, 8, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Inner cyan glow
    ctx.fillStyle = '#71B7F2';
    ctx.beginPath(); ctx.arc(-hhl + 5, -8, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-hhl + 5, 8, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-hhl + 5, -8, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-hhl + 5, 8, 0.8, 0, Math.PI * 2); ctx.fill();
    
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 2.5);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 2.5);
    
    // Outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawShape();
    ctx.stroke();
    
    // KOLCE z przodu
    drawFrontSpikes(ctx, hhl, '#a8d4f8', '#000');
    
    // Center turret mount
    ctx.fillStyle = '#1a3560';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawTechTurret(ctx: CanvasRenderingContext2D): void {
    // Długa lufa z czerwoną końcówką (jak Snajper ~39)
    const barrelLen = 39, barrelW = 5;
    drawLongBarrelWithTip(ctx, 5, barrelLen, barrelW, '#3a3a3a', '#ff3a3a');
    
    // Domek turret z zaokrąglonymi rogami
    const R = 14, frontPoint = 5;
    const drawDomek = () => {
        ctx.beginPath();
        ctx.moveTo(-R + 2, -R * 0.85);
        ctx.quadraticCurveTo(-R, -R * 0.85, -R, -R * 0.85 + 2);
        ctx.lineTo(-R, R * 0.85 - 2);
        ctx.quadraticCurveTo(-R, R * 0.85, -R + 2, R * 0.85);
        ctx.lineTo(R * 0.5, R * 0.85);
        ctx.quadraticCurveTo(R * 0.7, R * 0.85, R + frontPoint - 2, R * 0.5);
        ctx.quadraticCurveTo(R + frontPoint, 0, R + frontPoint - 2, -R * 0.5);
        ctx.quadraticCurveTo(R * 0.7, -R * 0.85, R * 0.5, -R * 0.85);
        ctx.closePath();
    };
    
    const g = ctx.createLinearGradient(0, -R, 0, R);
    g.addColorStop(0, '#a8d4f8');
    g.addColorStop(0.5, '#71B7F2');
    g.addColorStop(1, '#3a6ea0');
    ctx.fillStyle = g;
    drawDomek();
    ctx.fill();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawDomek();
    ctx.stroke();
    
    // PCB lines na turret (mini)
    ctx.strokeStyle = '#1a3560';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-R + 4, -R * 0.6); ctx.lineTo(-R + 4, -2); ctx.lineTo(R * 0.3, -2);
    ctx.moveTo(-R + 8, R * 0.6); ctx.lineTo(-R + 8, 3); ctx.lineTo(R * 0.3, 3);
    ctx.stroke();
    
    ctx.fillStyle = '#0a2548';
    ctx.strokeStyle = '#1a3560';
    ctx.lineWidth = 0.3;
    [[-R + 4, -R * 0.6], [-R + 4, -2], [R * 0.3, -2], [-R + 8, R * 0.6], [-R + 8, 3], [R * 0.3, 3]].forEach(([x, y]) => {
        ctx.beginPath(); ctx.arc(x, y, 0.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    
    // Hatch
    drawHatch(ctx, -R * 0.3, 0, R * 0.35, '#1a3560');
    
    // Numer 49 - czarna czcionka
    drawTankNumber(ctx, '49', -R * 0.3, -R * 0.6, 5, '#000000');
}

// =============================================================================
// SHADOW — #5E587A / #2D123F fiolet, kolce, rectangle zwężający, pierścienie na lufie
// =============================================================================

function drawShadowHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.shadow;
    const hhl = c.HL / 2, hhw = c.HW / 2;
    
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
    
    // Fioletowy gradient
    const grad = ctx.createLinearGradient(0, -hhw, 0, hhw);
    grad.addColorStop(0, '#7a72a0');
    grad.addColorStop(0.5, '#2D123F');
    grad.addColorStop(1, '#7a72a0');
    ctx.fillStyle = grad;
    drawShape();
    ctx.fill();
    
    // Fioletowy kamuflaż - spots
    drawCamoSpot(ctx, -hhl + 8, -5, 4, 3, '#1a0828', 0.3);
    drawCamoSpot(ctx, -4, 6, 4, 3, '#3a1858', -0.4);
    drawCamoSpot(ctx, 6, -6, 3.5, 2.5, '#1a0828', 0.5);
    drawCamoSpot(ctx, hhl - 13, 4, 3, 3, '#3a1858', 0.2);
    drawCamoSpot(ctx, -hhl + 16, 7, 3, 2, '#1a0828', -0.3);
    
    drawEngineGrille(ctx, -hhl + 8, 0, 7, 14, '#1a0828', '#7a5a9a');
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 2.6);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 2.6);
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawShape();
    ctx.stroke();
    
    // KOLCE z przodu - fioletowe
    drawFrontSpikes(ctx, hhl, '#9b8ad0', '#000');
    
    // Center mount
    ctx.fillStyle = '#2D123F';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawShadowTurret(ctx: CanvasRenderingContext2D): void {
    // Długa lufa z czerwoną końcówką + PIERŚCIENIE na początku
    const barrelLen = 39, barrelW = 5, barrelStart = 5;
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(barrelStart, -barrelW / 2, barrelLen, barrelW, 1.2); ctx.fill(); ctx.stroke();
    
    // Pierścienie na początku lufy (cooling rings - 3 sztuki)
    ctx.fillStyle = '#5a5a5a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
        const rx = barrelStart + 3 + i * 3;
        ctx.beginPath(); ctx.roundRect(rx, -barrelW / 2 - 1, 1.5, barrelW + 2, 0.5); ctx.fill(); ctx.stroke();
    }
    
    // Highlight
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(barrelStart + 12, -barrelW / 2 + 0.5, barrelLen - 14, 1.1);
    
    // Red tip
    ctx.fillStyle = '#ff3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(barrelStart + barrelLen - 4, -barrelW / 2 - 0.5, 4, barrelW + 1, 0.8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(barrelStart + barrelLen - 2, 0, barrelW * 0.35, 0, Math.PI * 2); ctx.fill();
    
    // Rectangle turret zwężający się do lufy (z zaokrąglonymi rogami)
    // Tail: full width (hwBack), Front: narrow (hwFront)
    const hl = 13, hwBack = 12, hwFront = 5;
    const drawTaperedRect = () => {
        ctx.beginPath();
        ctx.moveTo(-hl + 2, -hwBack);
        ctx.quadraticCurveTo(-hl, -hwBack, -hl, -hwBack + 2);
        ctx.lineTo(-hl, hwBack - 2);
        ctx.quadraticCurveTo(-hl, hwBack, -hl + 2, hwBack);
        ctx.lineTo(hl - 2, hwFront);
        ctx.quadraticCurveTo(hl, hwFront, hl, hwFront - 1);
        ctx.lineTo(hl, -hwFront + 1);
        ctx.quadraticCurveTo(hl, -hwFront, hl - 2, -hwFront);
        ctx.closePath();
    };
    
    const g = ctx.createLinearGradient(0, -hwBack, 0, hwBack);
    g.addColorStop(0, '#7a72a0');
    g.addColorStop(0.5, '#2D123F');
    g.addColorStop(1, '#7a72a0');
    ctx.fillStyle = g;
    drawTaperedRect();
    ctx.fill();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawTaperedRect();
    ctx.stroke();
    
    // Hatch
    drawHatch(ctx, -hl * 0.45, 0, 4, '#2D123F');
    
    // Numer 03 - szara czcionka
    drawTankNumber(ctx, '03', -hl * 0.45, -hwBack * 0.55, 4.5, '#aaaaaa');
}

// =============================================================================
// KING — #E02948 czerwony + złote nity/spawy, ucięty stożek elipsoidalny, lufa ze szmaragdami, shine
// =============================================================================

function drawKingHull(ctx: CanvasRenderingContext2D): void {
    const c = PROGRAMMATIC_BRAWLER_CONFIG.king;
    const hhl = c.HL / 2, hhw = c.HW / 2;
    
    drawTrackBase(ctx, hhl, hhw, c.TRK_H);
    drawTrackDetails(ctx, hhl, hhw, c.TRK_H, 6, 11);
    
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
    
    // Czerwony kamuflaż gradient
    const grad = ctx.createLinearGradient(0, -hhw, 0, hhw);
    grad.addColorStop(0, '#ff6680');
    grad.addColorStop(0.5, '#7a0e1f');
    grad.addColorStop(1, '#ff6680');
    ctx.fillStyle = grad;
    drawShape();
    ctx.fill();
    
    // Camo spots (ciemnoczerwone)
    drawCamoSpot(ctx, -hhl + 10, -6, 5, 3.5, '#5a0815', 0.3);
    drawCamoSpot(ctx, -4, 7, 4.5, 3.5, '#3a0410', -0.4);
    drawCamoSpot(ctx, 8, -8, 4, 2.5, '#5a0815', 0.5);
    drawCamoSpot(ctx, hhl - 14, 5, 3.5, 4, '#3a0410', 0.2);
    
    // SHINE effect - jasna pozioma smuga
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffaabb';
    ctx.beginPath();
    ctx.roundRect(-hhl + 4, -hhw + 2, 2 * hhl - 8, 3, 1);
    ctx.fill();
    ctx.globalAlpha = 1;
    
    // Engine grille
    drawEngineGrille(ctx, -hhl + 9, 0, 8, 18, '#3a0410', '#d4af37');
    drawExhaustPipe(ctx, c.EXHAUST_X, -c.EXHAUST_Y, 3);
    drawExhaustPipe(ctx, c.EXHAUST_X, c.EXHAUST_Y, 3);
    
    // Outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    drawShape();
    ctx.stroke();
    
    // Gold seam line (spawy)
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-hhl + 5, 0); ctx.lineTo(hhl - 5, 0);
    ctx.stroke();
    
    // KOLCE z przodu - złote ostrza
    drawFrontSpikes(ctx, hhl, '#d4af37', '#000');
    
    // Gold rivets (dużo!)
    const rivets: [number, number][] = [
        [-hhl + 4, -hhw + 4], [hhl - 7, -hhw + 4], [-hhl + 4, hhw - 4], [hhl - 7, hhw - 4],
        [-hhl + 14, -hhw + 5], [-hhl + 14, hhw - 5],
        [0, -hhw + 4], [0, hhw - 4],
        [hhl - 14, -hhw + 5], [hhl - 14, hhw - 5],
    ];
    for (const [rx, ry] of rivets) drawGoldRivet(ctx, rx, ry, 1.4);
    
    // Center turret mount z gold ring
    ctx.fillStyle = '#3a0410';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
}

function drawKingTurret(ctx: CanvasRenderingContext2D): void {
    // Długa lufa ton ciemniejszy (ciemniejsza czerwień), dobiona szmaragdami
    const barrelLen = 39, barrelW = 6, barrelStart = 5;
    ctx.fillStyle = '#5a0815'; // ton ciemniejszy niż hull #7a0e1f
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(barrelStart, -barrelW / 2, barrelLen, barrelW, 1.5); ctx.fill(); ctx.stroke();
    
    // Highlight
    ctx.fillStyle = '#9a182a';
    ctx.fillRect(barrelStart + 2, -barrelW / 2 + 0.5, barrelLen - 4, 1.2);
    
    // Gold trim na lufie
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(barrelStart + 4, -barrelW / 2, 1.5, barrelW);
    ctx.fillRect(barrelStart + barrelLen - 6, -barrelW / 2, 1.5, barrelW);
    
    // SZMARAGDY na lufie (3 zielone gemy)
    ctx.fillStyle = '#27ae60';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
        const ex = barrelStart + 10 + i * 8;
        ctx.beginPath(); ctx.arc(ex, 0, 1.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Highlight gemu
        ctx.fillStyle = '#4ade80';
        ctx.beginPath(); ctx.arc(ex - 0.3, -0.3, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#27ae60';
    }
    
    // Red tip (mocny czerwony)
    ctx.fillStyle = '#ff3a3a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(barrelStart + barrelLen - 4, -barrelW / 2 - 0.5, 4, barrelW + 1, 0.8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(barrelStart + barrelLen - 2, 0, barrelW * 0.4, 0, Math.PI * 2); ctx.fill();
    
    // Ucięty stożek elipsoidalny (lekko szerszy w x)
    const outerRx = 16, outerRy = 14;
    const innerRx = 11, innerRy = 9.5;
    
    const g = ctx.createLinearGradient(0, -outerRy, 0, outerRy);
    g.addColorStop(0, '#ff6680');
    g.addColorStop(0.5, '#7a0e1f');
    g.addColorStop(1, '#ff6680');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, outerRx, outerRy, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, outerRx, outerRy, 0, 0, Math.PI * 2); ctx.stroke();
    
    // Inner ring (jasniejsza)
    ctx.fillStyle = '#ad1530';
    ctx.beginPath(); ctx.ellipse(0, 0, innerRx, innerRy, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, innerRx, innerRy, 0, 0, Math.PI * 2); ctx.stroke();
    
    // SHINE na turret
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#ffaabb';
    ctx.beginPath(); ctx.ellipse(-outerRx * 0.3, -outerRy * 0.4, outerRx * 0.4, outerRy * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    
    // Hatch z gold trim
    drawHatch(ctx, 0, 0, innerRy * 0.42, '#5a0815', true);
    
    // Numer 1 - szara czcionka
    drawTankNumber(ctx, '1', 0, -innerRy * 0.55, 5, '#aaaaaa');
    
    // Gold rivets na turret
    const turretRivets: [number, number][] = [
        [-outerRx * 0.6, -outerRy * 0.7],
        [outerRx * 0.6, -outerRy * 0.7],
        [-outerRx * 0.6, outerRy * 0.7],
        [outerRx * 0.6, outerRy * 0.7],
        [-outerRx * 0.85, 0],
    ];
    for (const [rx, ry] of turretRivets) drawGoldRivet(ctx, rx, ry, 1.2);
}

// =============================================================================
// GENERIC FALLBACK (Enemy tank — stare dimensions, kadłub overlap track)
// =============================================================================

function drawTankHull(ctx: CanvasRenderingContext2D, brawler: Brawler): void {
    const col = brawler.colorMain;
    const cL = lerpHex(col, 35);
    const cD = lerpHex(col, -25);
    const HL = 52, HW = 26, TRK = 5;
    const hhl = HL / 2, hhw = HW / 2;
    
    // Tracks (rendered first, pod hull)
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(-hhl + 1, -hhw - TRK + 0.5, HL - 2, TRK, 1.5); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-hhl + 1, hhw - 0.5, HL - 2, TRK, 1.5); ctx.fill(); ctx.stroke();
    
    // Track segments
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.5;
    const segCount = 8;
    for (let i = 1; i < segCount; i++) {
        const x = -hhl + 1 + (i / segCount) * (HL - 2);
        ctx.beginPath(); ctx.moveTo(x, -hhw - TRK + 1); ctx.lineTo(x, -hhw - 1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, hhw + 1); ctx.lineTo(x, hhw + TRK - 1); ctx.stroke();
    }
    
    // Hull — OVERLAP TRACKS by 1.5px each side
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    const grad = ctx.createLinearGradient(0, -hhw - 1.5, 0, hhw + 1.5);
    grad.addColorStop(0, cL);
    grad.addColorStop(0.5, col);
    grad.addColorStop(1, cD);
    ctx.fillStyle = grad;
    
    ctx.beginPath();
    ctx.moveTo(-hhl + 2, -hhw - 1.5);
    ctx.lineTo(hhl - 4, -hhw - 1.5);
    ctx.lineTo(hhl, -hhw * 0.3);
    ctx.lineTo(hhl, hhw * 0.3);
    ctx.lineTo(hhl - 4, hhw + 1.5);
    ctx.lineTo(-hhl + 2, hhw + 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawTankTurret(ctx: CanvasRenderingContext2D, brawler: Brawler): void {
    const col = brawler.colorMain;
    const cL = lerpHex(col, 25);
    const cD = lerpHex(col, -25);
    const tr = 12, bl = 20, bw = 5;
    const bstart = tr * 0.6;
    
    // Barrel
    ctx.fillStyle = '#484848';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bstart, -bw / 2, bl, bw, bw * 0.25);
    ctx.fill(); ctx.stroke();
    
    // Turret base (cell shaded)
    const g = ctx.createLinearGradient(0, -tr, 0, tr);
    g.addColorStop(0, cL);
    g.addColorStop(0.5, col);
    g.addColorStop(1, cD);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, tr + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

// =============================================================================
// TEXTURE CACHE & FACTORY
// =============================================================================

export interface BrawlerTextures { hull: PIXI.Texture; turret: PIXI.Texture; }

const BRAWLER_TEX_CACHE = new Map<string, BrawlerTextures>();

export function getBrawlerTextures(brawler: Brawler): BrawlerTextures {
    if (BRAWLER_TEX_CACHE.has(brawler.id)) return BRAWLER_TEX_CACHE.get(brawler.id)!;
    
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
            case 'plasma': hullDraw = drawTechHull;   turretDraw = drawTechTurret;   break;
            case 'shadow': hullDraw = drawShadowHull; turretDraw = drawShadowTurret; break;
            case 'king':   hullDraw = drawKingHull;   turretDraw = drawKingTurret;   break;
            default:
                hullDraw = ctx => drawTankHull(ctx, brawler);
                turretDraw = ctx => drawTankTurret(ctx, brawler);
        }
        
        textures = { hull: createTex(hullDraw), turret: createTex(turretDraw) };
    }
    
    BRAWLER_TEX_CACHE.set(brawler.id, textures);
    return textures;
}