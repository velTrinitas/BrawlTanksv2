import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { SpawnSystem } from '../systems/Spawn';
import type { PowerSystem } from '../systems/PowerSystem';
import { SPAWN_CONFIG } from '../config/enemies';
import { POWERS, type PowerId } from '../config/powers';
import { t as tr } from '../i18n/i18n';

const GEMS_PER_SUPER_CHARGE_TRIGGER = 10;
const SUPER_TINT_HEX = '#c850ff';

/**
 * Globalna stala fontu dla wszystkich canvas-rendered HUD elements.
 * v0.27.0: Lilita One → Titan One (z polskim Latin Extended supportem).
 * Zmiana fontu w przyszlosci = 1 linia tutaj.
 */
const FONT_FAMILY = 'Titan One';

/**
 * v0.46.0 HUD typography pass: jednolity rozmiar labeli pilli (HP/WYNIK/ZABICI/SUPER).
 * Bez bolda — Titan One to font jednowagowy, `bold` wymuszal faux-bold (chunky, niespojny
 * z naturalna waga liczb). Wszystkie labele = ten sam rozmiar/waga = spojny HUD.
 */
const HUD_LABEL_PX = 26;

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

    // === v0.23.1: Mobile UI scaling + visibility flags ===
    /** Skala glownych pill HUD'a (gem, score, kills, HP). 0.7 = mobile, 1.0 = desktop. */
    public uiScale: number = 1.0;
    /** Czy rysowac crosshair (mouse cursor reticle). Set per-frame by main.ts:
     *  - Desktop: zawsze true
     *  - Mobile: true gdy aim joystick aktywny (palec na prawym sticku), false gdy puszczony
     */
    public showCrosshair: boolean = true;
    /** v0.23.1 hotfix: skala crosshair (1.5 na mobile dla lepszej czytelnosci). */
    public crosshairScale: number = 1.0;
    /** Czy rysowac dolny SuperPowerBar (centered 3-icon bar). False na mobile (SuperButton zastepuje). */
    public showPowerBar: boolean = true;

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
        c.font = `15px "${FONT_FAMILY}",cursive`;
        this.hudNotifs.forEach((n, i) => {
            if (n.timer <= 0) return;
            n.timer--;
            const alpha = Math.min(1, n.timer / 30) * Math.min(1, (n.maxTimer - n.timer + 20) / 20);
            const pw = c.measureText(n.text).width + 16;
            // v0.46.0: px 222 → 252 (HP pill poszerzony do 230, notify nie moga nachodzic)
            const ph = 24, pr = 12, px = 252, py = 8 + i * 28;
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
        
        c.fillStyle = 'rgba(8,8,18,0.75)';
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.fill();
        c.strokeStyle = `rgba(${rv},${gv},${bv},0.38)`;
        c.lineWidth = 0.8;
        c.stroke();
        
        const PAD = 14, GAP = 10, cy = py + PH / 2;
        // v0.46.0: label HP — HUD_LABEL_PX bez bolda (spojny z liczba, koniec faux-bold)
        const hpLabel = tr('hud.hp');
        c.fillStyle = '#ffffff';
        c.font = `${HUD_LABEL_PX}px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = 3;
        c.strokeText(hpLabel, px + PAD, cy);
        c.fillText(hpLabel, px + PAD, cy);
        
        const lblW = c.measureText(hpLabel).width;
        const numStr = `${Math.ceil(curHP)}/${Math.ceil(maxHP)}`;
        // v0.46.0 HP/DMG x100: liczba 26px (3-cyfrowe "700/700" mieszcza sie w 230px pill)
        c.font = `26px "${FONT_FAMILY}",cursive`;
        const numW = c.measureText(numStr).width;
        const numX = px + PW - PAD - numW;
        c.strokeStyle = 'rgba(0,0,0,0.85)';
        c.lineWidth = 4;
        c.strokeText(numStr, numX, cy + 1);
        c.fillStyle = '#ffffff';
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
     * v0.46.0 — SCALONY SUPER PILL (zastapil drawGemPill + drawSuperShotPill).
     *
     * Decyzja projektowa (FAZA v0.46 HUD redesign): surowa liczba gemow byla niskowartosciowa
     * (redundancja ze score — gem = +1 pkt; gracz nie dziala na liczbie). Jedyna actionable
     * info to "ile mam superow + jak blisko nastepnego". Wzorzec Brawl Stars: charge = wizualny
     * miernik, nie licznik.
     *
     * Layout:
     * - ⚡ ikona + label "SUPER" (gora)
     * - 6-segmentowy miernik ladunkow: zapalone segmenty = player.superCharges (banked),
     *   bez liczby (decyzja Mariusza: czysto wizualnie). Batche +3 zapalaja 3 segmenty.
     * - cienki pasek ladowania (dol): gemsToNext/10 = postep do nastepnego batcha +3.
     * - gdy superCharges > 0 lub aktywny: pill swieci fioletowo (sygnal "mozesz strzelic").
     * - gdy aktywny (isSuperShotActive): pulsujace fioletowe tlo.
     *
     * gemsCollected dalej trackowany wewnetrznie w SpawnSystem (matematyka batchy) — tylko
     * DISPLAY licznika usuniety.
     */
    private drawSuperPill(player: Player, spawnSystem: SpawnSystem, px: number, py: number, PW: number, PH: number, r: number): void {
        const c = this.ctx;
        const charges = player.superCharges;
        const isActive = player.isSuperShotActive;
        const ready = charges > 0 || isActive;
        const MAX_PIPS = 6;
        const PAD = 12;

        // Tlo — pulsujace fioletowe gdy aktywny, ciemne gdy nie
        if (isActive) {
            const pulse = 0.85 + Math.sin(Date.now() / 80) * 0.15;
            c.save();
            c.globalAlpha = pulse;
            c.fillStyle = 'rgba(200,80,255,0.55)';
            c.beginPath();
            c.roundRect(px, py, PW, PH, r);
            c.fill();
            c.restore();
        } else {
            c.fillStyle = 'rgba(8,8,18,0.75)';
            c.beginPath();
            c.roundRect(px, py, PW, PH, r);
            c.fill();
        }

        // Border — swieci gdy gotowy do strzalu
        if (ready) {
            const pulse = 0.7 + Math.sin(Date.now() / 150) * 0.3;
            c.strokeStyle = `rgba(200,80,255,${pulse})`;
            c.lineWidth = 2.5;
        } else {
            c.strokeStyle = 'rgba(200,80,255,0.3)';
            c.lineWidth = 1;
        }
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.stroke();

        // Label "SUPER SHOT" + blyskawica na KONCU (v0.46.0).
        // Mniejszy font niz HUD_LABEL_PX bo 2-wyrazowy label nie zmiesci sie w 26px.
        const superLabel = tr('hud.superShot');
        const SUPER_LABEL_PX = 19;
        c.font = `${SUPER_LABEL_PX}px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.85)';
        c.lineWidth = 3;
        c.strokeText(superLabel, px + PAD, py + 17);
        c.fillStyle = ready ? '#d8a8ff' : 'rgba(255,255,255,0.7)';
        c.fillText(superLabel, px + PAD, py + 17);

        // Blyskawica ⚡ na koncu labela
        const superLblW = c.measureText(superLabel).width;
        c.font = `${SUPER_LABEL_PX + 2}px "${FONT_FAMILY}",cursive`;
        c.globalAlpha = ready ? 1 : 0.5;
        c.fillStyle = '#fff';
        c.fillText('⚡', px + PAD + superLblW + 5, py + 17);
        c.globalAlpha = 1;

        // 6-segmentowy miernik ladunkow (banked charges, bez liczby)
        const pipCount = Math.min(charges, MAX_PIPS);
        const PIP_W = 14, PIP_H = 8, PIP_GAP = 4;
        const pipsY = py + 30;
        let pipX = px + PAD;
        for (let i = 0; i < MAX_PIPS; i++) {
            const lit = i < pipCount;
            c.beginPath();
            c.roundRect(pipX, pipsY, PIP_W, PIP_H, 3);
            if (lit) {
                c.fillStyle = SUPER_TINT_HEX;
                c.fill();
                // subtelny highlight na zapalonym
                c.fillStyle = 'rgba(255,255,255,0.25)';
                c.beginPath();
                c.roundRect(pipX, pipsY, PIP_W, PIP_H / 2, [3, 3, 0, 0]);
                c.fill();
            } else {
                c.fillStyle = 'rgba(255,255,255,0.12)';
                c.fill();
            }
            pipX += PIP_W + PIP_GAP;
        }

        // Cienki pasek ladowania do nastepnego batcha (+3)
        const gemsToNext = spawnSystem.gemsCollected % GEMS_PER_SUPER_CHARGE_TRIGGER;
        const chargeProgress = gemsToNext / GEMS_PER_SUPER_CHARGE_TRIGGER;
        const BAR_X = px + PAD, BAR_W = PW - PAD * 2, BAR_Y = py + PH - 7, BAR_H = 3;
        c.fillStyle = 'rgba(255,255,255,0.1)';
        c.beginPath();
        c.roundRect(BAR_X, BAR_Y, BAR_W, BAR_H, BAR_H / 2);
        c.fill();
        if (chargeProgress > 0) {
            c.fillStyle = SUPER_TINT_HEX;
            c.beginPath();
            c.roundRect(BAR_X, BAR_Y, BAR_W * chargeProgress, BAR_H, BAR_H / 2);
            c.fill();
        }
    }
    
    private drawKillsPill(spawnSystem: SpawnSystem, px: number, py: number, PW: number, PH: number, r: number): void {
        const c = this.ctx;
        const totalKills = spawnSystem.totalKills;
        const regularKills = spawnSystem.regularKills;
        
        c.fillStyle = 'rgba(8,8,18,0.75)';
        c.beginPath();
        c.roundRect(px, py, PW, PH, r);
        c.fill();
        
        const cyMid = py + PH / 2 - 3;  // lekko w gore — miejsce na dolny pasek megabossa

        // Label "KILLS" — lewo, wycentrowane pionowo (spojny wzorzec z SCORE/HP: label lewo, wartosc prawo)
        c.font = `${HUD_LABEL_PX}px "${FONT_FAMILY}",cursive`;
        c.fillStyle = '#ffffff';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.9)';
        c.lineWidth = 4;
        const killsLabel = tr('hud.kills');
        c.strokeText(killsLabel, px + 14, cyMid);
        c.fillText(killsLabel, px + 14, cyMid);

        // Wartosc "💀 N" — prawo, wycentrowane pionowo (ta sama os co label)
        const numStr = String(totalKills);
        c.font = `32px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        const numX = px + PW - 14;
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = 4;
        c.strokeText(numStr, numX, cyMid);
        c.fillStyle = '#e8dcc8';
        c.fillText(numStr, numX, cyMid);
        // Skull tuz przed liczba (right-aligned w jego pozycji)
        const numW = c.measureText(numStr).width;
        c.font = `22px "${FONT_FAMILY}",cursive`;
        c.fillText('💀', numX - numW - 8, cyMid);
        
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
            c.font = `13px "${FONT_FAMILY}",cursive`;
            c.textAlign = 'right';
            c.fillText(tr('hud.killProgressTaunt'), px + PW - 4, py + PH + 18);
            c.restore();
        }
    }
    
    /**
     * Bottom-center super power bar — 3 icons (aura/megaBomb/freeze) z cooldown overlays.
     * v0.23.1: hidden on mobile via this.showPowerBar = false (zastepuje SuperButton).
     */
    private drawSuperPowerBar(powerSystem: PowerSystem): void {
        const c = this.ctx;
        const cx = this.screenW / 2;
        
        const ICON_SIZE = 72;
        const ICON_GAP = 14;
        const BOTTOM_MARGIN = 40;
        
        const iconsBaseY = this.screenH - BOTTOM_MARGIN - ICON_SIZE;
        const hintY = iconsBaseY - 18;
        
        const totalW = ICON_SIZE * 3 + ICON_GAP * 2;
        const startX = cx - totalW / 2;
        
        const powerOrder: PowerId[] = ['aura', 'megaBomb', 'freeze'];
        powerOrder.forEach((id, i) => {
            const power = POWERS[id];
            const ix = startX + i * (ICON_SIZE + ICON_GAP);
            const iy = iconsBaseY;
            const isSelected = powerSystem.selectedPowerId === id;
            const isActive = powerSystem.activePowerId === id;
            const cooldownProgress = powerSystem.getCooldownProgress(id);
            const onCooldown = cooldownProgress > 0;
            
            if (isActive) {
                c.fillStyle = 'rgba(60,40,0,0.95)';
            } else if (onCooldown) {
                c.fillStyle = 'rgba(8,8,18,0.7)';
            } else if (isSelected) {
                c.fillStyle = 'rgba(40,30,8,0.85)';
            } else {
                c.fillStyle = 'rgba(8,8,18,0.75)';
            }
            c.beginPath();
            c.roundRect(ix, iy, ICON_SIZE, ICON_SIZE, 12);
            c.fill();
            
            if (isActive) {
                const pulse = 0.8 + Math.sin(Date.now() / 100) * 0.2;
                c.strokeStyle = `rgba(255,221,0,${pulse})`;
                c.lineWidth = 4;
                c.stroke();
            } else if (isSelected && !onCooldown) {
                const pulse = 0.7 + Math.sin(Date.now() / 150) * 0.3;
                c.strokeStyle = `rgba(255,221,0,${pulse})`;
                c.lineWidth = 3.5;
                c.stroke();
            } else if (onCooldown) {
                c.strokeStyle = 'rgba(120,120,120,0.5)';
                c.lineWidth = 2;
                c.stroke();
            } else {
                c.strokeStyle = 'rgba(255,221,0,0.3)';
                c.lineWidth = 1.5;
                c.stroke();
            }
            
            c.font = `42px "${FONT_FAMILY}",cursive`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.globalAlpha = onCooldown ? 0.4 : 1.0;
            c.fillText(power.emoji, ix + ICON_SIZE / 2, iy + ICON_SIZE / 2 - 6);
            c.globalAlpha = 1.0;
            
            if (onCooldown) {
                const secsLeft = powerSystem.getCooldownSecondsLeft(id);
                
                c.save();
                c.beginPath();
                c.moveTo(ix + ICON_SIZE / 2, iy + ICON_SIZE / 2);
                c.arc(
                    ix + ICON_SIZE / 2, iy + ICON_SIZE / 2,
                    ICON_SIZE / 2 - 4,
                    -Math.PI / 2,
                    -Math.PI / 2 + Math.PI * 2 * cooldownProgress,
                    false
                );
                c.closePath();
                c.fillStyle = 'rgba(0,0,0,0.6)';
                c.fill();
                c.restore();
                
                c.font = `22px "${FONT_FAMILY}",cursive`;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.strokeStyle = '#000';
                c.lineWidth = 4;
                c.strokeText(secsLeft.toFixed(0), ix + ICON_SIZE / 2, iy + ICON_SIZE / 2);
                c.fillStyle = '#ffaa00';
                c.fillText(secsLeft.toFixed(0), ix + ICON_SIZE / 2, iy + ICON_SIZE / 2);
            }
            
            // v0.27.0 FAZA F-fix2: 11px za maly dla Titan One → 13px + dark stroke dla kontrastu
            c.font = `13px "${FONT_FAMILY}",cursive`;
            c.strokeStyle = 'rgba(0,0,0,0.85)';
            c.lineWidth = 3;
            c.strokeText(power.name.toUpperCase(), ix + ICON_SIZE / 2, iy + ICON_SIZE - 10);
            c.fillStyle = onCooldown ? 'rgba(140,140,140,0.7)' : (isSelected ? '#ffdd00' : '#ffffff');
            c.fillText(power.name.toUpperCase(), ix + ICON_SIZE / 2, iy + ICON_SIZE - 10);
            
            if (isSelected && !isActive) {
                c.fillStyle = '#ffdd00';
                c.beginPath();
                c.moveTo(ix + ICON_SIZE / 2 - 7, iy + ICON_SIZE + 4);
                c.lineTo(ix + ICON_SIZE / 2 + 7, iy + ICON_SIZE + 4);
                c.lineTo(ix + ICON_SIZE / 2, iy + ICON_SIZE + 14);
                c.closePath();
                c.fill();
            }
        });
        
        c.font = `12px "${FONT_FAMILY}",cursive`;
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.textAlign = 'center';
        c.fillText(tr('hud.powerHint'), cx, hintY);
        
        if (powerSystem.activePowerId !== null) {
            const power = POWERS[powerSystem.activePowerId];
            const secsLeft = powerSystem.getActiveSecondsLeft();
            
            const pulse = 0.7 + Math.sin(Date.now() / 100) * 0.3;
            const activeText = power.id === 'aura'
                ? tr('hud.auraActive', { sec: secsLeft.toFixed(1) })
                : tr('hud.freezeActiveStatus', { sec: secsLeft.toFixed(1) });
            
            c.save();
            c.globalAlpha = pulse;
            c.font = `24px "${FONT_FAMILY}",cursive`;
            c.textAlign = 'center';
            c.strokeStyle = '#000';
            c.lineWidth = 5;
            c.strokeText(activeText, cx, hintY - 38);
            c.fillStyle = power.id === 'aura' ? '#ffdd00' : '#66ddff';
            c.fillText(activeText, cx, hintY - 38);
            c.restore();
            
            const TIME_BAR_W = 200;
            const TIME_BAR_H = 6;
            const tbX = cx - TIME_BAR_W / 2;
            const tbY = hintY - 22;
            
            c.fillStyle = 'rgba(0,0,0,0.7)';
            c.beginPath();
            c.roundRect(tbX - 2, tbY - 2, TIME_BAR_W + 4, TIME_BAR_H + 4, 4);
            c.fill();
            
            const timeProgress = powerSystem.framesLeft / power.durationFrames;
            const barColor = timeProgress > 0.3 ? (power.id === 'aura' ? '#ffdd00' : '#66ddff') : '#ff6600';
            c.fillStyle = barColor;
            c.beginPath();
            c.roundRect(tbX, tbY, TIME_BAR_W * timeProgress, TIME_BAR_H, 3);
            c.fill();
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
        c.font = `16px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#fff';
        c.strokeStyle = '#000';
        c.lineWidth = 3;
        const magnetTxt = tr('hud.magnetStatus', { sec: remaining.toFixed(1) });
        c.strokeText(magnetTxt, px + 100, py + 16);
        c.fillText(magnetTxt, px + 100, py + 16);
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
        c.font = `16px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#fff';
        c.strokeStyle = '#000';
        c.lineWidth = 3;
        const turboTxt = tr('hud.turboStatus', { sec: remaining.toFixed(1) });
        c.strokeText(turboTxt, px + 100, py + 16);
        c.fillText(turboTxt, px + 100, py + 16);
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
        
        c.font = `18px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.strokeStyle = '#000';
        c.lineWidth = 4;
        const phase = megaBoss.getMegaPhase();
        const phaseTxt = phase === 'rush'
            ? tr('hud.megaBossPhaseRush')
            : phase === 'strafe'
                ? tr('hud.megaBossPhaseStrafe')
                : tr('hud.megaBossPhaseEnraged');
        const label = tr('hud.megaBossLabel', { phase: phaseTxt });
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
        
        c.font = `52px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.strokeStyle = '#000';
        c.lineWidth = 6;
        const incomingTxt = tr('hud.megaBossIncoming');
        c.strokeText(incomingTxt, 0, 0);
        c.fillStyle = '#ffdd00';
        c.fillText(incomingTxt, 0, 0);
        
        c.restore();
    }
    
    private drawCrosshair(mouse: MouseState): void {
        const c = this.ctx;
        // v0.23.1 hotfix: scale crosshair (mobile dostaje 1.5x dla lepszej widocznosci)
        const s = this.crosshairScale;
        const _mx = mouse.screenX, _my = mouse.screenY;
        const _cl = 16 * s;   // total arm length
        const _cg = 5 * s;    // center gap
        const _dot = 2.5 * s; // center dot radius
        const outerW = 3.5 * s;
        const innerW = 2 * s;
        c.strokeStyle = '#111';
        c.lineWidth = outerW;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(_mx - _cl, _my); c.lineTo(_mx - _cg, _my);
        c.moveTo(_mx + _cg, _my); c.lineTo(_mx + _cl, _my);
        c.moveTo(_mx, _my - _cl); c.lineTo(_mx, _my - _cg);
        c.moveTo(_mx, _my + _cg); c.lineTo(_mx, _my + _cl);
        c.stroke();
        c.strokeStyle = '#e74c3c';
        c.lineWidth = innerW;
        c.beginPath();
        c.moveTo(_mx - _cl, _my); c.lineTo(_mx - _cg, _my);
        c.moveTo(_mx + _cg, _my); c.lineTo(_mx + _cl, _my);
        c.moveTo(_mx, _my - _cl); c.lineTo(_mx, _my - _cg);
        c.moveTo(_mx, _my + _cg); c.lineTo(_mx, _my + _cl);
        c.stroke();
        c.fillStyle = '#e74c3c';
        c.beginPath();
        c.arc(_mx, _my, _dot, 0, Math.PI * 2);
        c.fill();
    }
    
    /**
     * v0.23.1: render() teraz wrappuje HUD pill rendering w c.scale(uiScale).
     * Crosshair + powerbar are conditional na flags (mobile hides them).
     * MegaBossAlert zostaje unscaled (centralna pozycja — wyglada lepiej w full size).
     *
     * v0.46.0 HUD redesign:
     * - HP pill 230px (3-cyfrowe HP)
     * - SCORE pill: label WYNIK (gora-lewo) → duza zlota liczba (34px, hero leaderboard metric)
     * - SUPER pill (scalony gem+supershot) zastapil dwa osobne pille w lewej kolumnie
     */
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

        // v0.23.1: scale HUD pills (top + corners) — mobile dostaje uiScale=0.7
        c.save();
        c.scale(this.uiScale, this.uiScale);

        // HP pill 230px (3-cyfrowe "700/700" sie miesci)
        this.drawHPPill(player, 14, 8, 230, 54, 16);

        // === Centralny SCORE pill (hero leaderboard metric — zloty, prominentny) ===
        const SW = 230;
        const gx2 = Math.round((this.screenW / this.uiScale) / 2 - SW / 2);
        c.fillStyle = 'rgba(8,8,18,0.78)';
        c.beginPath();
        c.roundRect(gx2, 8, SW, 54, 16);
        c.fill();
        // zlotawy border — sygnalizuje "to sie liczy"
        c.strokeStyle = 'rgba(241,196,15,0.4)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.roundRect(gx2, 8, SW, 54, 16);
        c.stroke();

        // Label "SCORE" — lewo, wycentrowane pionowo (ta sama os co liczba = wyjustowane), zlote
        // v0.46.0: label tej samej wielkosci co WARTOSC (34px) — req Mariusz
        const scoreLabel = tr('hud.score');
        const scoreCy = 8 + 54 / 2;
        c.font = `34px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.9)';
        c.lineWidth = 4;
        c.strokeText(scoreLabel, gx2 + 14, scoreCy);
        c.fillStyle = '#f1c40f';
        c.fillText(scoreLabel, gx2 + 14, scoreCy);

        // Liczba — duza zlota (34px, hero leaderboard metric), prawo, wycentrowane pionowo
        c.font = `34px "${FONT_FAMILY}",cursive`;
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.strokeStyle = 'rgba(0,0,0,0.8)';
        c.lineWidth = 5;
        c.strokeText(String(score), gx2 + SW - 14, scoreCy + 1);
        c.fillStyle = '#f1c40f';
        c.fillText(String(score), gx2 + SW - 14, scoreCy + 1);

        const kx = (this.screenW / this.uiScale) - 14 - 230;
        this.drawKillsPill(spawnSystem, kx, 8, 230, 54, 16);

        // === SUPER pill (scalony gem-charge + super charges) — lewa kolumna, drugi rzad ===
        this.drawSuperPill(player, spawnSystem, 14, 70, 172, 54, 14);

        this.drawNotifs();

        // Magnet + turbo status — right-aligned tu tez sa scaled
        this.drawMagnetStatus(powerSystem);
        this.drawTurboStatus(player);

        // SuperPowerBar (bottom-center) — hidden on mobile (zastepuje SuperButton)
        if (this.showPowerBar) {
            this.drawSuperPowerBar(powerSystem);
        }

        if (megaBoss && megaBoss.active) {
            this.drawMegaBossBar(megaBoss);
        }

        c.restore();

        // === Unscaled overlays (full screen size, niezależne od uiScale) ===

        // Crosshair — hidden on mobile (no mouse, joystick zastepuje)
        if (this.showCrosshair) {
            this.drawCrosshair(mouse);
        }

        if (this.comboTextTimer > 0) {
            c.save();
            c.translate(this.screenW / 2, this.screenH / 2 - 120);
            // v0.46.0: 22px bold (faux-bold mushy) → 30px bez bolda + grubszy obrys (czytelnosc + hype)
            c.font = `30px "${FONT_FAMILY}", cursive`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.strokeStyle = '#000';
            c.lineWidth = 7;
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