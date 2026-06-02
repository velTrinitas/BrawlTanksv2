import * as PIXI from 'pixi.js';

/**
 * Effects Manager — centralny system dla wszystkich efektów wizualnych.
 * 
 * Architektura:
 * - particleContainer: PIXI.ParticleContainer (10× szybsze niż zwykły Container, 1 draw call)
 * - wreckContainer: PIXI.Container dla wraków (potrzebują indywidualnego z-index)
 * - trackContainer: PIXI.Container dla śladów gąsienic
 * 
 * Wszystkie particles używają jednego sprite z pre-renderowanej tekstury (cache).
 * Pool size: ~500 particles, ~100 track marks aktywnych jednocześnie.
 * 
 * v0.5 Etap 1: dodane spawnMegaBomb + spawnFreezeOverlay dla super powers.
 */

interface Particle {
    sprite: PIXI.Sprite;
    vx: number;
    vy: number;
    life: number;
    decay: number;
    scaleDecay: number;
    active: boolean;
}

interface TrackMark {
    sprite: PIXI.Sprite;
    alpha: number;
    active: boolean;
}

interface Wreck {
    sprite: PIXI.Sprite;
    flameSprites: PIXI.Sprite[];
    timer: number;
    x: number;
    y: number;
}

let _particleTexture: PIXI.Texture | null = null;
function getParticleTexture(): PIXI.Texture {
    if (_particleTexture) return _particleTexture;
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 8;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 8, 8);
    _particleTexture = PIXI.Texture.from(cv);
    return _particleTexture;
}

let _trackTexture: PIXI.Texture | null = null;
function getTrackTexture(): PIXI.Texture {
    if (_trackTexture) return _trackTexture;
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 6;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 1, 16, 4);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 2, 16, 2);
    _trackTexture = PIXI.Texture.from(cv);
    return _trackTexture;
}

let _wreckTexture: PIXI.Texture | null = null;
function getWreckTexture(): PIXI.Texture {
    if (_wreckTexture) return _wreckTexture;
    const cv = document.createElement('canvas');
    cv.width = 80; cv.height = 50;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(8, 8, 64, 34);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(15, 12, 18, 12);
    ctx.fillRect(40, 22, 20, 14);
    ctx.fillRect(55, 14, 12, 8);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(8, 8, 64, 2);
    ctx.fillRect(8, 40, 64, 2);
    _wreckTexture = PIXI.Texture.from(cv);
    return _wreckTexture;
}

export class EffectsManager {
    // Containers
    public particleContainer: PIXI.ParticleContainer;
    public wreckContainer: PIXI.Container;
    public trackContainer: PIXI.Container;
    
    /** v0.5 Etap 1: public access needed by spawnMegaBomb / spawnFreezeOverlay */
    public worldContainer: PIXI.Container;
    
    // Pools
    private particles: Particle[] = [];
    private trackMarks: TrackMark[] = [];
    private wrecks: Wreck[] = [];
    
    // Screen shake state
    private shakeIntensity: number = 0;
    private shakeDuration: number = 0;
    public shakeOffsetX: number = 0;
    public shakeOffsetY: number = 0;
    
    constructor(worldContainer: PIXI.Container) {
        this.worldContainer = worldContainer; // v0.5 Etap 1: zapisz dla mega bomb / freeze
        
        this.particleContainer = new PIXI.ParticleContainer(1000, {
            scale: true,
            position: true,
            rotation: false,
            uvs: false,
            alpha: true,
            tint: true,
        });
        this.particleContainer.zIndex = 500;
        
        this.wreckContainer = new PIXI.Container();
        this.wreckContainer.sortableChildren = true;
        
        this.trackContainer = new PIXI.Container();
        this.trackContainer.zIndex = -50;
        
        worldContainer.addChild(this.trackContainer);
        worldContainer.addChild(this.wreckContainer);
        worldContainer.addChild(this.particleContainer);
    }
    
    private getParticle(): Particle {
        for (const p of this.particles) {
            if (!p.active) {
                p.active = true;
                p.sprite.visible = true;
                return p;
            }
        }
        const sprite = new PIXI.Sprite(getParticleTexture());
        sprite.anchor.set(0.5);
        this.particleContainer.addChild(sprite);
        const p: Particle = {
            sprite,
            vx: 0, vy: 0,
            life: 1.0,
            decay: 0.05,
            scaleDecay: 0,
            active: true,
        };
        this.particles.push(p);
        return p;
    }
    
    private spawnParticles(x: number, y: number, color: number, count: number, opts: {
        speed?: number;
        size?: number;
        decay?: number;
        scaleDecay?: number;
        spread?: number;
        baseAngle?: number;
    } = {}): void {
        const speed = opts.speed ?? 4;
        const size = opts.size ?? 2.5;
        const decay = opts.decay ?? 0.04;
        const scaleDecay = opts.scaleDecay ?? 0;
        const spread = opts.spread ?? 1.0;
        const baseAngle = opts.baseAngle ?? 0;
        
        for (let i = 0; i < count; i++) {
            const p = this.getParticle();
            const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 2 * spread;
            const sp = speed * (0.5 + Math.random() * 0.5);
            p.sprite.x = x;
            p.sprite.y = y;
            p.sprite.tint = color;
            p.sprite.scale.set(size);
            p.sprite.alpha = 1.0;
            p.vx = Math.cos(angle) * sp;
            p.vy = Math.sin(angle) * sp;
            p.life = 1.0;
            p.decay = decay;
            p.scaleDecay = scaleDecay;
        }
    }
    
    // ==========================================
    // PUBLIC API — efekty z listy gracza
    // ==========================================
    
    spawnMuzzleFlash(x: number, y: number, angle: number): void {
        this.spawnParticles(x, y, 0xffee44, 5, {
            speed: 6, size: 3, decay: 0.12,
            spread: 0.08, baseAngle: angle,
        });
        const p = this.getParticle();
        p.sprite.x = x;
        p.sprite.y = y;
        p.sprite.tint = 0xffffff;
        p.sprite.scale.set(4);
        p.sprite.alpha = 1.0;
        p.vx = Math.cos(angle) * 2;
        p.vy = Math.sin(angle) * 2;
        p.life = 1.0;
        p.decay = 0.20;
        p.scaleDecay = 0.15;
    }
    
    spawnEnemyHitSparks(x: number, y: number, color: number): void {
        this.spawnParticles(x, y, color, 8, {
            speed: 5, size: 2, decay: 0.08,
        });
        this.spawnParticles(x, y, 0xffffff, 3, {
            speed: 7, size: 1.5, decay: 0.15,
        });
    }
    
    spawnWallImpact(x: number, y: number): void {
        this.spawnParticles(x, y, 0x888888, 6, {
            speed: 3.5, size: 2, decay: 0.06,
            scaleDecay: 0.02,
        });
        this.spawnParticles(x, y, 0x444444, 2, {
            speed: 1.5, size: 4, decay: 0.03,
        });
    }
    
    spawnExplosionAndWreck(x: number, y: number, color: number): void {
        this.spawnParticles(x, y, 0xff8800, 15, {
            speed: 6, size: 4, decay: 0.05,
            scaleDecay: 0.03,
        });
        this.spawnParticles(x, y, 0xff3300, 8, {
            speed: 8, size: 2.5, decay: 0.07,
        });
        this.spawnParticles(x, y, color, 5, {
            speed: 5, size: 3, decay: 0.06,
        });
        const flash = this.getParticle();
        flash.sprite.x = x;
        flash.sprite.y = y;
        flash.sprite.tint = 0xffffaa;
        flash.sprite.scale.set(8);
        flash.sprite.alpha = 1.0;
        flash.vx = 0;
        flash.vy = 0;
        flash.life = 1.0;
        flash.decay = 0.10;
        flash.scaleDecay = 0.30;
        
        this.spawnWreck(x, y);
        this.shake(8, 12);
    }
    
    private spawnWreck(x: number, y: number): void {
        const sprite = new PIXI.Sprite(getWreckTexture());
        sprite.anchor.set(0.5);
        sprite.x = x;
        sprite.y = y;
        sprite.rotation = Math.random() * Math.PI * 2;
        sprite.zIndex = y + 5;
        this.wreckContainer.addChild(sprite);
        
        const flames: PIXI.Sprite[] = [];
        for (let i = 0; i < 2; i++) {
            const flame = new PIXI.Sprite(getParticleTexture());
            flame.anchor.set(0.5);
            flame.tint = 0xff6600;
            flame.scale.set(3);
            flame.x = x + (Math.random() - 0.5) * 20;
            flame.y = y + (Math.random() - 0.5) * 14;
            flame.alpha = 0.9;
            this.particleContainer.addChild(flame);
            flames.push(flame);
        }
        
        this.wrecks.push({
            sprite,
            flameSprites: flames,
            timer: 180,
            x, y,
        });
    }
    
    spawnTrackMark(x: number, y: number, angle: number): void {
        let tm: TrackMark | null = null;
        for (const t of this.trackMarks) {
            if (!t.active) {
                tm = t;
                tm.active = true;
                tm.sprite.visible = true;
                break;
            }
        }
        if (!tm) {
            const sprite = new PIXI.Sprite(getTrackTexture());
            sprite.anchor.set(0.5);
            this.trackContainer.addChild(sprite);
            tm = { sprite, alpha: 0.7, active: true };
            this.trackMarks.push(tm);
        }
        tm.sprite.x = x;
        tm.sprite.y = y;
        tm.sprite.rotation = angle;
        tm.sprite.alpha = 0.7;
        tm.alpha = 0.7;
    }
    
    shake(intensity: number, duration: number): void {
        if (intensity > this.shakeIntensity) {
            this.shakeIntensity = intensity;
            this.shakeDuration = duration;
        }
    }
    
    // ==========================================
    // v0.5 Etap 1 — NOWE METODY (Super Powers)
    // ==========================================
    
    /**
     * Mega Bomb effect — expanding ring + flash + 40 particles + big screen shake.
     * Wykorzystuje istniejący pool particles (spawnParticles) + PIXI.Graphics dla ringa.
     */
    spawnMegaBomb(x: number, y: number): void {
        // 1) Flash central — wykorzystaj pool particle (efektywne)
        const flash = this.getParticle();
        flash.sprite.x = x;
        flash.sprite.y = y;
        flash.sprite.tint = 0xffffff;
        flash.sprite.scale.set(15);
        flash.sprite.alpha = 1.0;
        flash.vx = 0;
        flash.vy = 0;
        flash.life = 1.0;
        flash.decay = 0.06;
        flash.scaleDecay = 0.45;
        
        // 2) Expanding ring (Graphics nad worldContainer, animowany przez requestAnimationFrame)
        const ring = new PIXI.Graphics();
        ring.x = x;
        ring.y = y;
        ring.zIndex = 499;
        this.worldContainer.addChild(ring);
        
        // 3) 40 cząsteczek burstu (pomarańczowe + żółte) — pełen okrąg
        this.spawnParticles(x, y, 0xff4400, 20, {
            speed: 7, size: 4, decay: 0.05,
            scaleDecay: 0.02,
        });
        this.spawnParticles(x, y, 0xffaa00, 20, {
            speed: 5, size: 3, decay: 0.07,
            scaleDecay: 0.03,
        });
        
        // 4) Big screen shake
        this.shake(15, 25);
        
        // 5) Animacja expanding ring (30 frames = 0.5s)
        let frame = 0;
        const animate = () => {
            frame++;
            const t = frame / 30;
            
            if (t >= 1) {
                if (ring.parent) ring.parent.removeChild(ring);
                ring.destroy();
                return;
            }
            
            const radius = 50 + (200 * t);
            ring.clear();
            ring.lineStyle(8 - t * 6, 0xff4400, 1 - t);
            ring.drawCircle(0, 0, radius);
            ring.lineStyle(4 - t * 3, 0xffaa00, 1 - t);
            ring.drawCircle(0, 0, radius - 6);
            
            requestAnimationFrame(animate);
        };
        animate();
    }
    
    /**
     * Freeze overlay — globalny niebieski filtr screen-wide podczas Mroźnej Mocy.
     * @param durationFrames czas trwania w klatkach (60fps = 1s)
     */
    spawnFreezeOverlay(durationFrames: number): void {
        const overlay = new PIXI.Graphics();
        overlay.beginFill(0x66ddff, 0.18);
        // Pokrywa cały świat z dużym marginesem (bezpieczne dla każdej kamery)
        overlay.drawRect(-2000, -2000, 5000, 5000);
        overlay.endFill();
        overlay.zIndex = 9999;
        this.worldContainer.addChild(overlay);
        
        let frame = 0;
        const animate = () => {
            frame++;
            if (frame >= durationFrames || !overlay.parent) {
                if (overlay.parent) overlay.parent.removeChild(overlay);
                overlay.destroy();
                return;
            }
            // Pulsacja + fade out w ostatnich 30% czasu
            const t = frame / durationFrames;
            const pulse = 0.85 + Math.sin(frame / 10) * 0.15;
            const fadeOut = t > 0.7 ? 1 - ((t - 0.7) / 0.3) : 1;
            overlay.alpha = 0.18 * pulse * fadeOut;
            requestAnimationFrame(animate);
        };
        animate();
    }
    
    // ==========================================
    // UPDATE — wywoływane co klatkę w gameLoop
    // ==========================================
    
    update(delta: number): void {
        // === Particles ===
        for (const p of this.particles) {
            if (!p.active) continue;
            p.sprite.x += p.vx * delta;
            p.sprite.y += p.vy * delta;
            p.vx *= 0.92;
            p.vy *= 0.92;
            p.life -= p.decay * delta;
            if (p.scaleDecay > 0) {
                p.sprite.scale.x = Math.max(0.1, p.sprite.scale.x - p.scaleDecay * delta);
                p.sprite.scale.y = p.sprite.scale.x;
            }
            p.sprite.alpha = Math.max(0, p.life);
            if (p.life <= 0) {
                p.active = false;
                p.sprite.visible = false;
            }
        }
        
        // === Track marks (fade) ===
        for (const t of this.trackMarks) {
            if (!t.active) continue;
            t.alpha -= 0.005 * delta;
            t.sprite.alpha = t.alpha;
            if (t.alpha <= 0) {
                t.active = false;
                t.sprite.visible = false;
            }
        }
        
        // === Wrecks ===
        for (let i = this.wrecks.length - 1; i >= 0; i--) {
            const w = this.wrecks[i];
            w.timer -= delta;
            
            for (const flame of w.flameSprites) {
                flame.scale.set(2.5 + Math.random() * 1.5);
                flame.alpha = 0.6 + Math.random() * 0.4;
            }
            
            if (w.timer <= 0) {
                this.wreckContainer.removeChild(w.sprite);
                w.sprite.destroy();
                for (const flame of w.flameSprites) {
                    this.particleContainer.removeChild(flame);
                    flame.destroy();
                }
                this.wrecks.splice(i, 1);
            } else if (w.timer < 30) {
                w.sprite.alpha = w.timer / 30;
                for (const flame of w.flameSprites) {
                    flame.alpha *= (w.timer / 30);
                }
            }
        }
        
        // === Screen shake ===
        if (this.shakeDuration > 0) {
            this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity * 2;
            this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity * 2;
            this.shakeDuration -= delta;
            this.shakeIntensity *= 0.88;
            if (this.shakeDuration <= 0) {
                this.shakeOffsetX = 0;
                this.shakeOffsetY = 0;
                this.shakeIntensity = 0;
            }
        }
    }
}