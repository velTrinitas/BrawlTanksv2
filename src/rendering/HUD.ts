import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { SpawnSystem } from '../systems/Spawn';
import type { PowerSystem } from '../systems/PowerSystem';
import { SPAWN_CONFIG } from '../config/enemies';
import { POWERS, CHARGE_CONFIG, type PowerId } from '../config/powers';

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
    public megaBossAlertTimer: number = 0;
    
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
    
    triggerMegaBossAlert(): void {
        this.megaBossAlertTimer = 180;
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
    
    private drawGemPill(spawnSystem: SpawnSystem, px: number, py: number, PW: number, PH: number, r: number): void {
        const c = this.ctx;
        
        c.fillStyle = 'rgba(8,8,18,0.75)';
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.fill();
        c.strokeStyle = 'rgba(46,204,113,0.4)';
        c.lineWidth = 1;
        c.stroke();
        
        const gemCx = px + 22, gemCy = py + PH / 2;
        const gemR = 11;
        c.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            const x = gemCx + gemR * Math.cos(angle);
            const y = gemCy + gemR * Math.sin(angle);
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
        }
        c.closePath();
        c.fillStyle = '#2ecc71';
        c.fill();
        c.strokeStyle = '#0d4d28';
        c.lineWidth = 1.5;
        c.stroke();
        
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.beginPath();
        c.ellipse(gemCx - 2, gemCy - 5, 2.5, 1.2, 0, 0, Math.PI * 2);
        c.fill();
        
        c.font = `28px "Lilita One",cursive`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = 4;
        c.strokeText(String(spawnSystem.gemsCollected), px + 42, py + PH / 2);
        c.fillStyle = '#2ecc71';
        c.fillText(String(spawnSystem.gemsCollected), px + 42, py + PH / 2);
    }
    
    private drawKillsPill(spawnSystem: SpawnSystem, px: number, py: number, PW: number, PH: number, r: number): void {
        const c = this.ctx;
        const totalKills = spawnSystem.totalKills;
        const regularKills = spawnSystem.regularKills;
        
        c.fillStyle = 'rgba(8,8,18,0.75)';
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.fill();
        
        c.fillStyle = '#e8dcc8';
        c.font = `26px "Lilita One",cursive`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText('💀', px + 14, py + PH / 2);
        
        c.font = `32px "Lilita One",cursive`;
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = 4;
        c.strokeText(String(totalKills), px + 56, py + PH / 2);
        c.fillStyle = '#e8dcc8';
        c.fillText(String(totalKills), px + 56, py + PH / 2);
        
        const BAR_H = 5;
        const BAR_X = px + 14;
        const BAR_W = PW - 28;
        const BAR_Y = py + PH - BAR_H - 4;
        
        const progress = Math.min(1, regularKills / SPAWN_CONFIG.megaBossKillThreshold);
        
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.beginPath();
        c.roundRect(BAR_X, BAR_Y, BAR_W, BAR_H, BAR_H / 2);
        c.fill();
        c.fillStyle = progress >= 1 ? '#ffdd00' : '#ff8866';
        c.beginPath();
        c.roundRect(BAR_X, BAR_Y, BAR_W * progress, BAR_H, BAR_H / 2);
        c.fill();
        
        if (regularKills >= SPAWN_CONFIG.megaBossKillThreshold && !spawnSystem.megaBossSpawned) {
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
    
    private drawSuperPowerBar(powerSystem: PowerSystem): void {
        const c = this.ctx;
        const cx = this.screenW / 2;
        
        const ICON_SIZE = 72;
        const ICON_GAP = 14;
        const PILL_H = 40;
        const PILL_W = 300;
        const BOTTOM_MARGIN = 30;
        
        const pillY = this.screenH - BOTTOM_MARGIN - PILL_H;
        const iconsBaseY = pillY - 12 - ICON_SIZE;
        const hintY = iconsBaseY - 18;
        
        const totalW = ICON_SIZE * 3 + ICON_GAP * 2;
        const startX = cx - totalW / 2;
        
        const powerOrder: PowerId[] = ['aura', 'megaBomb', 'freeze'];
        powerOrder.forEach((id, i) => {
            const power = POWERS[id];
            const ix = startX + i * (ICON_SIZE + ICON_GAP);
            const iy = iconsBaseY;
            const isSelected = powerSystem.selectedPowerId === id;
            const isDisabled = !power.implemented;
            
            if (isDisabled) {
                c.fillStyle = 'rgba(8,8,18,0.55)';
            } else if (isSelected) {
                c.fillStyle = 'rgba(40,30,8,0.85)';
            } else {
                c.fillStyle = 'rgba(8,8,18,0.75)';
            }
            c.beginPath();
            c.roundRect(ix, iy, ICON_SIZE, ICON_SIZE, 12);
            c.fill();
            
            if (isSelected && !isDisabled) {
                const pulse = 0.7 + Math.sin(Date.now() / 150) * 0.3;
                c.strokeStyle = `rgba(255,221,0,${pulse})`;
                c.lineWidth = 3.5;
                c.stroke();
            } else if (isDisabled) {
                c.strokeStyle = 'rgba(80,80,80,0.4)';
                c.lineWidth = 2;
                c.stroke();
            } else {
                c.strokeStyle = 'rgba(255,221,0,0.3)';
                c.lineWidth = 1.5;
                c.stroke();
            }
            
            c.font = `42px "Lilita One",cursive`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.globalAlpha = isDisabled ? 0.30 : 1.0;
            c.fillText(power.emoji, ix + ICON_SIZE / 2, iy + ICON_SIZE / 2 - 6);
            c.globalAlpha = 1.0;
            
            c.font = `bold 11px "Lilita One",cursive`;
            c.fillStyle = isDisabled ? 'rgba(160,160,160,0.5)' : (isSelected ? '#ffdd00' : 'rgba(255,255,255,0.85)');
            c.fillText(power.name.toUpperCase(), ix + ICON_SIZE / 2, iy + ICON_SIZE - 10);
            
            if (isSelected && !isDisabled) {
                c.fillStyle = '#ffdd00';
                c.beginPath();
                c.moveTo(ix + ICON_SIZE / 2 - 7, iy + ICON_SIZE + 4);
                c.lineTo(ix + ICON_SIZE / 2 + 7, iy + ICON_SIZE + 4);
                c.lineTo(ix + ICON_SIZE / 2, iy + ICON_SIZE + 14);
                c.closePath();
                c.fill();
            }
            
            if (isDisabled) {
                c.save();
                c.fillStyle = 'rgba(120,120,120,0.85)';
                c.font = `bold 8px "Lilita One",cursive`;
                c.textAlign = 'center';
                c.fillText('WKRÓTCE', ix + ICON_SIZE / 2, iy + 12);
                c.restore();
            }
        });
        
        const pillX = cx - PILL_W / 2;
        
        c.fillStyle = 'rgba(8,8,18,0.88)';
        c.beginPath();
        c.roundRect(pillX, pillY, PILL_W, PILL_H, 14);
        c.fill();
        c.strokeStyle = 'rgba(46,204,113,0.5)';
        c.lineWidth = 1.5;
        c.stroke();
        
        const gemCx = pillX + 26, gemCy = pillY + PILL_H / 2;
        const gemR = 12;
        c.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            const x = gemCx + gemR * Math.cos(angle);
            const y = gemCy + gemR * Math.sin(angle);
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
        }
        c.closePath();
        c.fillStyle = '#2ecc71';
        c.fill();
        c.strokeStyle = '#0d4d28';
        c.lineWidth = 1.5;
        c.stroke();
        
        c.font = `bold 19px "Lilita One",cursive`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillStyle = '#ffdd00';
        c.strokeStyle = 'rgba(0,0,0,0.8)';
        c.lineWidth = 3;
        
        const text = powerSystem.charges > 0
            ? `${powerSystem.gemsSinceLastCharge}/${CHARGE_CONFIG.gemsPerChargeTrigger} · ⚡x${powerSystem.charges}`
            : `${powerSystem.gemsSinceLastCharge}/${CHARGE_CONFIG.gemsPerChargeTrigger} do Super`;
        c.strokeText(text, pillX + 48, pillY + PILL_H / 2);
        c.fillText(text, pillX + 48, pillY + PILL_H / 2);
        
        const BAR_X = pillX + 48;
        const BAR_Y = pillY + PILL_H - 6;
        const BAR_W = PILL_W - 60;
        const BAR_H = 3;
        c.fillStyle = 'rgba(255,255,255,0.1)';
        c.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H);
        c.fillStyle = '#2ecc71';
        c.fillRect(BAR_X, BAR_Y, BAR_W * powerSystem.getGemProgress(), BAR_H);
        
        c.font = `12px "Lilita One",cursive`;
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.textAlign = 'center';
        c.fillText('scroll = wybierz   ·   PPM/SPACE = użyj', cx, hintY);
        
        // v0.4d: Aura countdown + time bar
        if (powerSystem.isActive) {
            const pulse = 0.7 + Math.sin(Date.now() / 100) * 0.3;
            const power = POWERS[powerSystem.selectedPowerId];
            const secondsLeft = (powerSystem.framesLeft / 60).toFixed(1);
            const activeText = `☄️ AURA AKTYWNA — ${secondsLeft}s ☄️`;
            
            c.save();
            c.globalAlpha = pulse;
            c.font = `bold 24px "Lilita One",cursive`;
            c.textAlign = 'center';
            c.strokeStyle = '#000';
            c.lineWidth = 5;
            c.strokeText(activeText, cx, hintY - 38);
            c.fillStyle = '#ffdd00';
            c.fillText(activeText, cx, hintY - 38);
            c.restore();
            
            // Time bar (żółty → pomarańczowy przy końcu)
            const TIME_BAR_W = 200;
            const TIME_BAR_H = 6;
            const tbX = cx - TIME_BAR_W / 2;
            const tbY = hintY - 22;
            
            c.save();
            c.fillStyle = 'rgba(0,0,0,0.7)';
            c.beginPath();
            c.roundRect(tbX - 2, tbY - 2, TIME_BAR_W + 4, TIME_BAR_H + 4, 4);
            c.fill();
            
            const timeProgress = powerSystem.framesLeft / power.durationFrames;
            const barColor = timeProgress > 0.3 ? '#ffdd00' : '#ff6600';
            c.fillStyle = barColor;
            c.beginPath();
            c.roundRect(tbX, tbY, TIME_BAR_W * timeProgress, TIME_BAR_H, 3);
            c.fill();
            c.restore();
        }
    }
    
    private drawMagnetStatus(powerSystem: PowerSystem): void {
        if (!powerSystem.magnetActive) return;
        const c = this.ctx;
        const remaining = Math.max(0, (powerSystem.magnetEndTime - Date.now()) / 1000);
        
        const px = this.screenW - 14 - 200;
        const py = 80;
        
        const pulse = 0.85 + Math.sin(Date.now() / 100) * 0.15;
        c.save();
        c.globalAlpha = pulse;
        c.fillStyle = 'rgba(231,76,60,0.85)';
        c.beginPath();
        c.roundRect(px, py, 200, 32, 10);
        c.fill();
        c.font = `bold 16px "Lilita One",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#fff';
        c.strokeStyle = '#000';
        c.lineWidth = 3;
        c.strokeText(`🧲 MAGNET ${remaining.toFixed(1)}s`, px + 100, py + 16);
        c.fillText(`🧲 MAGNET ${remaining.toFixed(1)}s`, px + 100, py + 16);
        c.restore();
    }
    
    private drawTurboStatus(player: Player): void {
        if (!player.hasSpeedBoost) return;
        const c = this.ctx;
        const remaining = Math.max(0, (player.speedBoostEnd - Date.now()) / 1000);
        
        const px = this.screenW - 14 - 200;
        const py = 118;
        
        const pulse = 0.85 + Math.sin(Date.now() / 80) * 0.15;
        c.save();
        c.globalAlpha = pulse;
        c.fillStyle = 'rgba(255,102,0,0.85)';
        c.beginPath();
        c.roundRect(px, py, 200, 32, 10);
        c.fill();
        c.font = `bold 16px "Lilita One",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#fff';
        c.strokeStyle = '#000';
        c.lineWidth = 3;
        c.strokeText(`⚡ TURBO ×2 ${remaining.toFixed(1)}s`, px + 100, py + 16);
        c.fillText(`⚡ TURBO ×2 ${remaining.toFixed(1)}s`, px + 100, py + 16);
        c.restore();
    }
    
    private drawMegaBossBar(megaBoss: Enemy): void {
        const c = this.ctx;
        const BW = 500, BH = 26;
        const bx = (this.screenW - BW) / 2;
        const by = 78;
        
        c.fillStyle = 'rgba(0,0,0,0.7)';
        c.beginPath();
        c.roundRect(bx - 4, by - 4, BW + 8, BH + 8, 10);
        c.fill();
        
        c.fillStyle = 'rgba(60,40,0,0.5)';
        c.beginPath();
        c.roundRect(bx, by, BW, BH, 6);
        c.fill();
        
        const hpPct = Math.max(0, megaBoss.hp / megaBoss.maxHp);
        c.fillStyle = '#ffdd00';
        c.beginPath();
        c.roundRect(bx, by, BW * hpPct, BH, 6);
        c.fill();
        
        c.fillStyle = 'rgba(255,255,255,0.2)';
        c.beginPath();
        c.roundRect(bx, by, BW * hpPct, BH / 2, 6);
        c.fill();
        
        c.font = `bold 18px "Lilita One",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.strokeStyle = '#000';
        c.lineWidth = 4;
        const phase = megaBoss.getMegaPhase();
        const phaseTxt = phase === 'rush' ? 'SZARŻA' : phase === 'strafe' ? 'OKRĄŻA' : 'WŚCIEKŁY';
        const label = `👑 MEGA BOSS — ${phaseTxt}`;
        c.strokeText(label, this.screenW / 2, by + BH / 2);
        c.fillStyle = '#fff';
        c.fillText(label, this.screenW / 2, by + BH / 2);
    }
    
    private drawMegaBossAlert(): void {
        if (this.megaBossAlertTimer <= 0) return;
        const c = this.ctx;
        const t = this.megaBossAlertTimer;
        this.megaBossAlertTimer--;
        
        const alpha = t > 150 ? (180 - t) / 30 : t < 30 ? t / 30 : 1;
        
        c.save();
        c.globalAlpha = alpha;
        c.translate(this.screenW / 2, this.screenH / 2 - 50);
        const pulse = 1 + Math.sin(Date.now() / 100) * 0.05;
        c.scale(pulse, pulse);
        
        c.fillStyle = 'rgba(0,0,0,0.85)';
        c.beginPath();
        c.roundRect(-340, -50, 680, 100, 16);
        c.fill();
        c.strokeStyle = '#ffdd00';
        c.lineWidth = 4;
        c.stroke();
        
        c.font = `bold 52px "Lilita One",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.strokeStyle = '#000';
        c.lineWidth = 6;
        c.strokeText('⚠️ MEGA BOSS NADCHODZI!', 0, 0);
        c.fillStyle = '#ffdd00';
        c.fillText('⚠️ MEGA BOSS NADCHODZI!', 0, 0);
        
        c.restore();
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
    
    render(
        player: Player,
        score: number,
        _killsLegacy: number,
        mouse: MouseState,
        spawnSystem: SpawnSystem,
        megaBoss: Enemy | null,
        powerSystem: PowerSystem
    ): void {
        const c = this.ctx;
        c.clearRect(0, 0, this.screenW, this.screenH);
        
        // === TOP ROW ===
        this.drawHPPill(player, 14, 8, 200, 54, 16);
        
        // Score pill (środek)
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
        
        // Kill counter (prawy)
        const kx = this.screenW - 14 - 200;
        this.drawKillsPill(spawnSystem, kx, 8, 200, 54, 16);
        
        // === SECOND ROW ===
        // Gem counter POD HP (lewy, rząd 2)
        this.drawGemPill(spawnSystem, 14, 70, 140, 44, 14);
        
        this.drawNotifs();
        
        this.drawMagnetStatus(powerSystem);
        this.drawTurboStatus(player);
        
        this.drawSuperPowerBar(powerSystem);
        
        if (megaBoss && megaBoss.active) {
            this.drawMegaBossBar(megaBoss);
        }
        
        this.drawCrosshair(mouse);
        
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
        
        this.drawMegaBossAlert();
    }
    
    clear(): void {
        this.ctx.clearRect(0, 0, this.screenW, this.screenH);
    }
}