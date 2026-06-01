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
 */

interface Particle {
    sprite: PIXI.Sprite;
    vx: number;
    vy: number;
    life: number;          // 1.0 → 0.0
    decay: number;         // ile traci na klatkę
    scaleDecay: number;    // shrink per klatkę
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
    timer: number;         // pozostałe klatki życia (3s = 180 klatek przy 60FPS)
    x: number;
    y: number;
}

/**
 * Pre-renderowana tekstura cząsteczki (biała kropka 8x8).
 * Tintujemy w runtime na potrzebny kolor — jedna tekstura starczy na wszystko.
 */
let _particleTexture: PIXI.Texture | null = null;
function getParticleTexture(): PIXI.Texture {
    if (_particleTexture) return _particleTexture;
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 8;
    const ctx = cv.getContext('2d')!;
    // Soft white circle z subtle gradient (gives nice "spark" look)
    const grad = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 8, 8);
    _particleTexture = PIXI.Texture.from(cv);
    return _particleTexture;
}

/**
 * Tekstura śladu gąsienicy — wąski ciemny prostokąt.
 */
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

/**
 * Tekstura wraku — szary spalony prostokąt.
 */
let _wreckTexture: PIXI.Texture | null = null;
function getWreckTexture(): PIXI.Texture {
    if (_wreckTexture) return _wreckTexture;
    const cv = document.createElement('canvas');
    cv.width = 80; cv.height = 50;
    const ctx = cv.getContext('2d')!;
    // Spalony korpus
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(8, 8, 64, 34);
    // Ciemniejsze plamy (smudge)
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(15, 12, 18, 12);
    ctx.fillRect(40, 22, 20, 14);
    ctx.fillRect(55, 14, 12, 8);
    // Krawędzie poszarpane
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
        // ParticleContainer: 1000 max particles, jeden draw call
        // OPT: właściwości które ParticleContainer śledzi (musimy je określić jawnie)
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
        this.trackContainer.zIndex = -50; // pod wszystkim ale nad city
        
        // Dodaj w odpowiedniej kolejności do worldContainer
        worldContainer.addChild(this.trackContainer);   // najniżej
        worldContainer.addChild(this.wreckContainer);    // wraki nad śladami
        worldContainer.addChild(this.particleContainer); // particles na wierzchu
    }
    
    /**
     * Wewnętrzny helper — wyciąga lub tworzy nowy Particle.
     */
    private getParticle(): Particle {
        for (const p of this.particles) {
            if (!p.active) {
                p.active = true;
                p.sprite.visible = true;
                return p;
            }
        }
        // Pool full or empty — create new
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
    
    /**
     * Spawnuje N cząsteczek w punkcie (x, y), w random kierunkach.
     * Hex color (0xRRGGBB) determines particle tint.
     */
    private spawnParticles(x: number, y: number, color: number, count: number, opts: {
        speed?: number;
        size?: number;
        decay?: number;
        scaleDecay?: number;
        spread?: number; // 1.0 = full circle (default), 0.3 = narrow cone
        baseAngle?: number; // jeśli spread < 1, kierunek głównej osi
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
    
    /**
     * Błysk z lufy przy strzale.
     * x, y = pozycja końca lufy. angle = kierunek strzału.
     */
    spawnMuzzleFlash(x: number, y: number, angle: number): void {
        // 5 jasnych żółtych cząsteczek w kierunku strzału (wąski cone)
        this.spawnParticles(x, y, 0xffee44, 5, {
            speed: 6, size: 3, decay: 0.12,
            spread: 0.08, baseAngle: angle,
        });
        // 1 duża centralna kropka
        const p = this.getParticle();
        p.sprite.x = x;
        p.sprite.y = y;
        p.sprite.tint = 0xffffff;
        p.sprite.scale.set(4);
        p.sprite.alpha = 1.0;
        p.vx = Math.cos(angle) * 2;
        p.vy = Math.sin(angle) * 2;
        p.life = 1.0;
        p.decay = 0.20; // szybko znika
        p.scaleDecay = 0.15;
    }
    
    /**
     * Odłamki gdy pocisk trafia w przeciwnika.
     * color = kolor wroga (tint hex jako number).
     */
    spawnEnemyHitSparks(x: number, y: number, color: number): void {
        // 8 cząsteczek w kolorze wroga
        this.spawnParticles(x, y, color, 8, {
            speed: 5, size: 2, decay: 0.08,
        });
        // + 3 białe iskry dla kontrastu
        this.spawnParticles(x, y, 0xffffff, 3, {
            speed: 7, size: 1.5, decay: 0.15,
        });
    }
    
    /**
     * Odłamki gdy pocisk uderza w ścianę.
     * Szare, mniej dynamiczne.
     */
    spawnWallImpact(x: number, y: number): void {
        // 6 szarych odłamków
        this.spawnParticles(x, y, 0x888888, 6, {
            speed: 3.5, size: 2, decay: 0.06,
            scaleDecay: 0.02,
        });
        // 2 ciemniejsze (dym)
        this.spawnParticles(x, y, 0x444444, 2, {
            speed: 1.5, size: 4, decay: 0.03,
        });
    }
    
    /**
     * Wybuch + spawn wraku przy zabiciu wroga.
     * color = tint wroga.
     */
    spawnExplosionAndWreck(x: number, y: number, color: number): void {
        // Pomarańczowy wybuch (15 dużych)
        this.spawnParticles(x, y, 0xff8800, 15, {
            speed: 6, size: 4, decay: 0.05,
            scaleDecay: 0.03,
        });
        // Czerwone iskry (8)
        this.spawnParticles(x, y, 0xff3300, 8, {
            speed: 8, size: 2.5, decay: 0.07,
        });
        // Cząsteczki w kolorze wroga (5)
        this.spawnParticles(x, y, color, 5, {
            speed: 5, size: 3, decay: 0.06,
        });
        // Żółty błysk centralny (1 duża)
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
        
        // Spawn wraku (zostaje 3s = 180 klatek)
        this.spawnWreck(x, y);
        
        // Screen shake
        this.shake(8, 12);
    }
    
    /**
     * Wewnętrzny — spawnuje wrak (spalony kadłub + 2 płomyki przez 3s).
     */
    private spawnWreck(x: number, y: number): void {
        const sprite = new PIXI.Sprite(getWreckTexture());
        sprite.anchor.set(0.5);
        sprite.x = x;
        sprite.y = y;
        sprite.rotation = Math.random() * Math.PI * 2;
        sprite.zIndex = y + 5; // pod żywymi czołgami
        this.wreckContainer.addChild(sprite);
        
        // 2 małe płomyki animowane (jako sprite particles na ParticleContainer)
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
            timer: 180, // 3 sekundy
            x, y,
        });
    }
    
    /**
     * Pojedynczy ślad gąsienicy.
     */
    spawnTrackMark(x: number, y: number, angle: number): void {
        // Spróbuj recyklować nieaktywny track
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
    
    /**
     * Wyzwala screen shake.
     * intensity = max offset (pixele), duration = klatki.
     */
    shake(intensity: number, duration: number): void {
        if (intensity > this.shakeIntensity) {
            this.shakeIntensity = intensity;
            this.shakeDuration = duration;
        }
    }
    
    /**
     * Update wszystkich efektów. Wywoływane co klatkę w gameLoop.
     */
    update(delta: number): void {
        // === Particles ===
        for (const p of this.particles) {
            if (!p.active) continue;
            p.sprite.x += p.vx * delta;
            p.sprite.y += p.vy * delta;
            p.vx *= 0.92; // drag
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
        // OPT (lesson Season 1): 0.005 per klatka, nie 0.0006 (memory leak prevention)
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
            
            // Płomyki migoczą
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
                // Fade out w ostatnich 0.5s
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
            this.shakeIntensity *= 0.88; // fade
            if (this.shakeDuration <= 0) {
                this.shakeOffsetX = 0;
                this.shakeOffsetY = 0;
                this.shakeIntensity = 0;
            }
        }
    }
}