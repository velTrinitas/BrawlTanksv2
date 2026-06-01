import type { Player } from '../entities/Player';
import type { SpawnSystem } from '../systems/Spawn';
import { SPAWN_CONFIG } from '../config/enemies';

interface HudNotif {
    text: string;
    color: string;
    timer: number;
    maxTimer: number;
}

export interface MouseState {
    screenX: number;
    screenY: number;
}

export class HUD {
    private ctx: CanvasRenderingContext2D;
    public canvas: HTMLCanvasElement;
    public screenW: number;
    public screenH: number;
    private hudNotifs: HudNotif[] = [];
    
    public comboText: string = '';
    public comboTextTimer: number = 0;
    
    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.screenW = window.innerWidth;
        this.screenH = window.innerHeight;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    
    private resize(): void {
        this.screenW = window.innerWidth;
        this.screenH = window.innerHeight;
        this.canvas.width = this.screenW;
        this.canvas.height = this.screenH;
    }
    
    addNotif(text: string, color: string): void {
        if (this.hudNotifs.length >= 3) this.hudNotifs.shift();
        this.hudNotifs.push({ text, color, timer: 200, maxTimer: 200 });
    }
    
    private drawNotifs(): void {
        if (this.hudNotifs.length === 0) return;
        const c = this.ctx;
        c.font = `bold 15px "Lilita One",cursive`;
        this.hudNotifs.forEach((n, i) => {
            if (n.timer <= 0) return;
            n.timer--;
            const alpha = Math.min(1, n.timer / 30) * Math.min(1, (n.maxTimer - n.timer + 20) / 20);
            const pw = c.measureText(n.text).width + 16;
            const ph = 24, pr = 12, px = 222, py = 8 + i * 28;
            c.save();
            c.globalAlpha = alpha;
            c.fillStyle = 'rgba(0,0,0,0.55)';
            c.beginPath();
            c.roundRect(px, py, pw, ph, pr);
            c.fill();
            c.fillStyle = n.color;
            c.beginPath();
            c.roundRect(px, py, 4, ph, [pr, 0, 0, pr]);
            c.fill();
            c.textAlign = 'left';
            c.textBaseline = 'middle';
            c.strokeStyle = 'rgba(0,0,0,0.7)';
            c.lineWidth = 3;
            c.strokeText(n.text, px + 10, py + ph / 2);
            c.fillStyle = n.color;
            c.fillText(n.text, px + 10, py + ph / 2);
            c.restore();
        });
        this.hudNotifs = this.hudNotifs.filter(n => n.timer > 0);
    }
    
    private drawHPPill(player: Player, px: number, py: number, PW: number, PH: number, r: number): void {
        const c = this.ctx;
        const curHP = player.hp, maxHP = player.maxHp;
        const t = maxHP > 0 ? Math.max(0, Math.min(1, curHP / maxHP)) : 0;
        const rv = t >= 0.5 ? Math.round(46 + (1 - t) * 2 * (255 - 46)) : Math.round(255 + (0.5 - t) * 2 * (231 - 255));
        const gv = t >= 0.5 ? Math.round(204 + (1 - t) * 2 * (165 - 204)) : Math.round(165 + (0.5 - t) * 2 * (76 - 165));
        const bv = t >= 0.5 ? Math.round(113 + (1 - t) * 2 * (0 - 113)) : Math.round((0.5 - t) * 2 * 60);
        const col = `rgb(${rv},${gv},${bv})`;
        
        c.fillStyle = 'rgba(8,8,18,0.75)';
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.fill();
        c.strokeStyle = `rgba(${rv},${gv},${bv},0.38)`;
        c.lineWidth = 0.8;
        c.stroke();
        
        const PAD = 14, GAP = 10, cy = py + PH / 2;
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.font = `bold 14px "Lilita One",cursive`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText('HP', px + PAD, cy);
        
        const lblW = c.measureText('HP').width;
        const numStr = `${Math.ceil(curHP)}/${Math.ceil(maxHP)}`;
        c.font = `32px "Lilita One",cursive`;
        const numW = c.measureText(numStr).width;
        const numX = px + PW - PAD - numW;
        c.strokeStyle = 'rgba(0,0,0,0.75)';
        c.lineWidth = 4;
        c.strokeText(numStr, numX, cy + 1);
        c.fillStyle = col;
        c.fillText(numStr, numX, cy + 1);
        
        const BH = 12, barX = px + PAD + lblW + GAP, barW = numX - barX - GAP, barY = cy - BH / 2;
        c.fillStyle = 'rgba(255,255,255,0.07)';
        c.beginPath();
        c.roundRect(barX, barY, barW, BH, BH / 2);
        c.fill();
        if (t > 0) {
            c.fillStyle = `rgba(${rv},${gv},${bv},0.85)`;
            c.beginPath();
            c.roundRect(barX, barY, barW * t, BH, BH / 2);
            c.fill();
        }
    }
    
    /**
     * Kill counter pill (top-right) z progress bar i alertem bossowym.
     */
    private drawKillsPill(spawnSystem: SpawnSystem, px: number, py: number, PW: number, PH: number, r: number): void {
        const c = this.ctx;
        const totalKills = spawnSystem.totalKills;
        const regularKills = spawnSystem.regularKills;
        
        c.fillStyle = 'rgba(8,8,18,0.75)';
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.fill();
        
        // Skull icon (left)
        c.fillStyle = '#e8dcc8';
        c.font = `26px "Lilita One",cursive`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText('💀', px + 14, py + PH / 2);
        
        // Kill count
        c.font = `32px "Lilita One",cursive`;
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = 4;
        c.strokeText(String(totalKills), px + 56, py + PH / 2);
        c.fillStyle = '#e8dcc8';
        c.fillText(String(totalKills), px + 56, py + PH / 2);
        
        // Progress bar do następnego bossa
        const BAR_H = 5;
        const BAR_X = px + 14;
        const BAR_W = PW - 28;
        const BAR_Y = py + PH - BAR_H - 4;
        
        const allBossesNeeded = SPAWN_CONFIG.megaBossKillThreshold; // 100
        const progress = Math.min(1, regularKills / allBossesNeeded);
        
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.beginPath();
        c.roundRect(BAR_X, BAR_Y, BAR_W, BAR_H, BAR_H / 2);
        c.fill();
        
        c.fillStyle = progress >= 1 ? '#ff3300' : '#ff8866';
        c.beginPath();
        c.roundRect(BAR_X, BAR_Y, BAR_W * progress, BAR_H, BAR_H / 2);
        c.fill();
        
        // Alert text gdy progress full + bossy żyją (3B handle mega boss)
        // Tu tylko prosty próg: gdy regularKills ≥ 100 (mega boss threshold) i pokazujemy alert "WALCZ Z BOSSAMI"
        if (regularKills >= SPAWN_CONFIG.megaBossKillThreshold) {
            // Pulsujący alert pod pillem
            const pulse = 0.7 + Math.sin(Date.now() / 200) * 0.3;
            c.save();
            c.globalAlpha = pulse;
            c.fillStyle = '#ff0033';
            c.font = `bold 13px "Lilita One",cursive`;
            c.textAlign = 'right';
            c.fillText('💀 ZNISZCZ BOSSÓW!', px + PW - 4, py + PH + 18);
            c.restore();
        }
    }
    
    private drawCrosshair(mouse: MouseState): void {
        const c = this.ctx;
        const _mx = mouse.screenX, _my = mouse.screenY, _cl = 16, _cg = 5;
        c.strokeStyle = '#111';
        c.lineWidth = 3.5;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(_mx - _cl, _my); c.lineTo(_mx - _cg, _my);
        c.moveTo(_mx + _cg, _my); c.lineTo(_mx + _cl, _my);
        c.moveTo(_mx, _my - _cl); c.lineTo(_mx, _my - _cg);
        c.moveTo(_mx, _my + _cg); c.lineTo(_mx, _my + _cl);
        c.stroke();
        c.strokeStyle = '#e74c3c';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(_mx - _cl, _my); c.lineTo(_mx - _cg, _my);
        c.moveTo(_mx + _cg, _my); c.lineTo(_mx + _cl, _my);
        c.moveTo(_mx, _my - _cl); c.lineTo(_mx, _my - _cg);
        c.moveTo(_mx, _my + _cg); c.lineTo(_mx, _my + _cl);
        c.stroke();
        c.fillStyle = '#e74c3c';
        c.beginPath();
        c.arc(_mx, _my, 2.5, 0, Math.PI * 2);
        c.fill();
    }
    
    render(player: Player, score: number, _killsLegacy: number, mouse: MouseState, spawnSystem: SpawnSystem): void {
        const c = this.ctx;
        c.clearRect(0, 0, this.screenW, this.screenH);
        
        // HP pill (left)
        this.drawHPPill(player, 14, 8, 200, 54, 16);
        this.drawNotifs();
        
        // Score pill (center)
        const gx2 = Math.round(this.screenW / 2 - 100);
        c.fillStyle = 'rgba(8,8,18,0.75)';
        c.beginPath();
        c.roundRect(gx2, 8, 200, 54, 16);
        c.fill();
        c.fillStyle = '#f1c40f';
        c.font = '32px "Lilita One",cursive';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = 4;
        c.strokeText(String(score), gx2 + 58, 35);
        c.fillText(String(score), gx2 + 58, 35);
        
        // Kills pill (right) — nowy z progress bar
        const kx = this.screenW - 14 - 200;
        this.drawKillsPill(spawnSystem, kx, 8, 200, 54, 16);
        
        // Crosshair
        this.drawCrosshair(mouse);
        
        // Combo text
        if (this.comboTextTimer > 0) {
            c.save();
            c.translate(this.screenW / 2, this.screenH / 2 - 120);
            c.font = `bold 22px "Lilita One", cursive`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.strokeStyle = '#000';
            c.lineWidth = 5;
            c.strokeText(this.comboText, 0, 0);
            c.fillStyle = '#e67e22';
            c.fillText(this.comboText, 0, 0);
            c.restore();
        }
    }
    
    clear(): void {
        this.ctx.clearRect(0, 0, this.screenW, this.screenH);
    }
}