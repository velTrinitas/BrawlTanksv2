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
 * v0.18.5 FAZA 5a: dodane spawnSandKick dla pustyni (cząstki piasku za gąsienicami).
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

// v0.18.5 FAZA 5a — Sand particle color palette (piaskowe odcienie z desert texture)
const SAND_KICK_COLORS = [0xd4ab6e, 0xc8a870, 0xb88858, 0xe5b878, 0xa87848, 0xeecf90];

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
        this.worldContainer = worldContainer;
        
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

    /** v0.34.0 T7: Wood splinters dla crate hits + destruction */
    spawnWoodSplinters(x: number, y: number, count: number = 14): void {
        // Light pine surface chips (~40%)
        this.spawnParticles(x, y, 0xd4a878, Math.max(1, Math.floor(count * 0.4)), {
            speed: 5, size: 2, decay: 0.05, scaleDecay: 0.015, spread: 1.0,
        });
        // Medium wood tone splinters (~35%)
        this.spawnParticles(x, y, 0xa07840, Math.max(1, Math.floor(count * 0.35)), {
            speed: 6, size: 1.7, decay: 0.06, scaleDecay: 0.02, spread: 1.0,
        });
        // Dark wood deep splinters (~25%)
        this.spawnParticles(x, y, 0x6e4a20, Math.max(1, Math.floor(count * 0.25)), {
            speed: 7, size: 1.3, decay: 0.07, scaleDecay: 0.025, spread: 1.0,
        });
        // Dust puff (white-ish, small subtle haze)
        this.spawnParticles(x, y, 0xefe8d0, Math.max(1, Math.floor(count * 0.15)), {
            speed: 2.5, size: 3, decay: 0.04, scaleDecay: 0.03,
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
    
    spawnMegaBomb(x: number, y: number): void {
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
        
        const ring = new PIXI.Graphics();
        ring.x = x;
        ring.y = y;
        ring.zIndex = 499;
        this.worldContainer.addChild(ring);
        
        this.spawnParticles(x, y, 0xff4400, 20, {
            speed: 7, size: 4, decay: 0.05,
            scaleDecay: 0.02,
        });
        this.spawnParticles(x, y, 0xffaa00, 20, {
            speed: 5, size: 3, decay: 0.07,
            scaleDecay: 0.03,
        });
        
        this.shake(15, 25);
        
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
    
    spawnFreezeOverlay(durationFrames: number): void {
        const overlay = new PIXI.Graphics();
        overlay.beginFill(0x66ddff, 0.18);
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
            const t = frame / durationFrames;
            const pulse = 0.85 + Math.sin(frame / 10) * 0.15;
            const fadeOut = t > 0.7 ? 1 - ((t - 0.7) / 0.3) : 1;
            overlay.alpha = 0.18 * pulse * fadeOut;
            requestAnimationFrame(animate);
        };
        animate();
    }
    
    // ==========================================
    // v0.18.5 FAZA 5a — SAND KICK PARTICLES (DESERT MAP)
    // ==========================================
    
    /**
     * Cząstki piasku rozlatujące się za gąsienicami czołgu podczas jazdy po pustyni.
     * 
     * @param x — Player.x (center czołgu)
     * @param y — Player.y
     * @param tankAngle — Player.hull.rotation (kierunek jazdy, +X = right)
     * @param intensity — multiplier (1.0 normal, 1.6 turbo boost) — wpływa na count + speed
     * 
     * Implementacja:
     * - 2 spawn point'y za tankiem (lewa + prawa gąsienica), offset 28px wstecz + ±10px sideways
     * - 2-3 cząstki per gąsienica (× intensity) = 4-6 (normal) lub 6-10 (turbo) total
     * - Velocity outward "do tyłu" względem kierunku jazdy + lekki spread sideways
     * - Random tint z piaskowej palety (6 odcieni)
     * - Drag system (vx*=0.92 per frame) → naturalne wytracanie pędu
     * - decay 0.04 → ~25 frame lifetime
     * - scaleDecay 0.04 → cząstki kurczą się wraz z fade
     */
    spawnSandKick(x: number, y: number, tankAngle: number, intensity: number = 1.0): void {
        // Kierunek "do tyłu" (przeciwnie do kierunku jazdy)
        const rearDirX = -Math.cos(tankAngle);
        const rearDirY = -Math.sin(tankAngle);
        // Prostopadle do kierunku (dla left/right track separation)
        const perpX = -Math.sin(tankAngle);
        const perpY = Math.cos(tankAngle);
        
        const REAR_OFFSET = 28;      // ile px za centrum tankiem
        const TRACK_SEPARATION = 10; // ile px sideways między lewym a prawym track
        
        // Velocity points "do tyłu" względem ruchu (~PI radians od tankAngle)
        const baseRearAngle = tankAngle + Math.PI;
        
        // Per-track spawn: 2 cząstki normal, 3 cząstki w turbo (per track)
        const particlesPerTrack = intensity > 1.2 ? 3 : 2;
        
        for (const trackSide of [-1, 1]) {
            const spawnX = x + rearDirX * REAR_OFFSET + perpX * trackSide * TRACK_SEPARATION;
            const spawnY = y + rearDirY * REAR_OFFSET + perpY * trackSide * TRACK_SEPARATION;
            
            for (let i = 0; i < particlesPerTrack; i++) {
                const p = this.getParticle();
                
                // Random color z palette
                const color = SAND_KICK_COLORS[Math.floor(Math.random() * SAND_KICK_COLORS.length)];
                
                // Velocity: kierunek "do tyłu" + spread ±0.5 rad (~30°)
                // + side bias: cząstki z lewego tracku lecą lekko bardziej w lewo, prawego — w prawo
                const sideBias = trackSide * 0.3;
                const angle = baseRearAngle + (Math.random() - 0.5) * 1.0 + sideBias;
                const speed = (2.0 + Math.random() * 2.0) * intensity;
                
                // Random initial position jitter (±3px wokół spawn point — symuluje "kop" całej gąsienicy nie pojedynczego punktu)
                const jitterX = (Math.random() - 0.5) * 6;
                const jitterY = (Math.random() - 0.5) * 6;
                
                p.sprite.x = spawnX + jitterX;
                p.sprite.y = spawnY + jitterY;
                p.sprite.tint = color;
                p.sprite.scale.set(1.5 + Math.random() * 1.0);  // 1.5-2.5
                p.sprite.alpha = 0.85 + Math.random() * 0.15;
                p.vx = Math.cos(angle) * speed;
                p.vy = Math.sin(angle) * speed;
                p.life = 1.0;
                p.decay = 0.04;       // ~25 frames lifetime
                p.scaleDecay = 0.04;  // kurczy się
            }
        }
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