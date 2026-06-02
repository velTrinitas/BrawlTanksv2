import { Howl, Howler } from 'howler';

/**
 * AudioSys — singleton wrapper na Howler.js (v0.7 Sesja 5).
 * Centralizuje wszystkie SFX i music dla Brawl Tanks.
 * 
 * GENTLE FAILURE: brakujące pliki audio NIE crashują gry.
 * Howler loguje warning i kontynuuje. Można wgrywać SFX stopniowo.
 */

const BASE = import.meta.env.BASE_URL;

/** Mapping brawler.id → shoot type (4 typy zamiast 8) */
const SHOOT_TYPE_MAP: Record<string, string> = {
    twardy: 'standard',
    scout:  'standard',
    shadow: 'standard',
    king:   'standard',
    heavy:  'heavy',
    sniper: 'sniper',
    plasma: 'plasma',
    pyro:   'plasma',
};

/** Volume per layer (sesja 5 design) */
const VOLUMES = {
    music: 0.25,
    shoot: 0.4,
    hit: 0.5,
    explosion: 0.7,
    pickup: 0.5,
    superActivate: 0.8,
    endgame: 0.7,
};

interface SoundDef {
    key: string;
    file: string;
    volume: number;
}

const SOUND_LIST: SoundDef[] = [
    // Shoot (4 typy)
    { key: 'shoot_standard', file: 'shoot_standard.mp3', volume: VOLUMES.shoot },
    { key: 'shoot_heavy',    file: 'shoot_heavy.mp3',    volume: VOLUMES.shoot * 1.1 },
    { key: 'shoot_sniper',   file: 'shoot_sniper.mp3',   volume: VOLUMES.shoot * 0.9 },
    { key: 'shoot_plasma',   file: 'shoot_plasma.mp3',   volume: VOLUMES.shoot },
    
    // Hit (3 typy)
    { key: 'hit_enemy',  file: 'hit_enemy.mp3',  volume: VOLUMES.hit },
    { key: 'hit_wall',   file: 'hit_wall.mp3',   volume: VOLUMES.hit * 0.7 },
    { key: 'hit_player', file: 'hit_player.mp3', volume: VOLUMES.hit * 1.1 },
    
    // Explosion
    { key: 'explosion', file: 'explosion.mp3', volume: VOLUMES.explosion },
    
    // Pickups (3 typy)
    { key: 'pickup_gem',    file: 'pickup_gem.mp3',    volume: VOLUMES.pickup * 0.6 },
    { key: 'pickup_heart',  file: 'pickup_heart.mp3',  volume: VOLUMES.pickup },
    { key: 'pickup_magnet', file: 'pickup_magnet.mp3', volume: VOLUMES.pickup },
    
    // Super powers (4 typy)
    { key: 'super_aura',   file: 'super_aura.mp3',   volume: VOLUMES.superActivate },
    { key: 'super_bomb',   file: 'super_bomb.mp3',   volume: VOLUMES.superActivate * 1.1 },
    { key: 'super_freeze', file: 'super_freeze.mp3', volume: VOLUMES.superActivate },
    { key: 'super_shot',   file: 'super_shot.mp3',   volume: VOLUMES.superActivate * 0.9 },
    
    // Endgame
    { key: 'victory',  file: 'victory.mp3',  volume: VOLUMES.endgame },
    { key: 'gameover', file: 'gameover.mp3', volume: VOLUMES.endgame },
];

export class AudioSys {
    private static _instance: AudioSys | null = null;
    
    private sounds: Map<string, Howl> = new Map();
    private music: Howl | null = null;
    private muted: boolean = false;
    private gemPickupTimer: number = 0; // anty-spam dla gem pickup
    
    private constructor() {
        this.preloadAll();
        this.initMusic();
    }
    
    static getInstance(): AudioSys {
        if (!this._instance) this._instance = new AudioSys();
        return this._instance;
    }
    
    private preloadAll(): void {
        for (const def of SOUND_LIST) {
            try {
                const howl = new Howl({
                    src: [BASE + 'sfx/' + def.file],
                    volume: def.volume,
                    preload: true,
                    onloaderror: (_id, err) => {
                        console.warn(`[AudioSys] Brak pliku: ${def.file}`, err);
                    },
                });
                this.sounds.set(def.key, howl);
            } catch (e) {
                console.warn(`[AudioSys] Howl init failed for ${def.file}`, e);
            }
        }
    }
    
    private initMusic(): void {
        try {
            this.music = new Howl({
                src: [BASE + 'sfx/music_main.mp3'],
                loop: true,
                volume: VOLUMES.music,
                preload: true,
                onloaderror: (_id, err) => {
                    console.warn('[AudioSys] Brak pliku music_main.mp3', err);
                },
            });
        } catch (e) {
            console.warn('[AudioSys] Music init failed', e);
        }
    }
    
    /**
     * Bezpieczne odtworzenie — nie crashuje gdy plik brakuje.
     */
    private safePlay(key: string): void {
        const sound = this.sounds.get(key);
        if (!sound) return;
        try {
            sound.play();
        } catch (e) {
            console.warn(`[AudioSys] Play failed for ${key}`, e);
        }
    }
    
    // ==========================================
    // PUBLIC API
    // ==========================================
    
    playShoot(brawlerId: string): void {
        const type = SHOOT_TYPE_MAP[brawlerId] ?? 'standard';
        this.safePlay(`shoot_${type}`);
    }
    
    playHit(type: 'enemy' | 'wall' | 'player'): void {
        this.safePlay(`hit_${type}`);
    }
    
    playExplosion(): void {
        this.safePlay('explosion');
    }
    
    /**
     * Gem pickup — z anti-spam (max 1 dźwięk na 50ms).
     * Pociski mogą drop'ować dużo gemów naraz → spam.
     */
    playGemPickup(): void {
        const now = Date.now();
        if (now - this.gemPickupTimer < 50) return;
        this.gemPickupTimer = now;
        this.safePlay('pickup_gem');
    }
    
    playHeartPickup(): void {
        this.safePlay('pickup_heart');
    }
    
    playMagnetPickup(): void {
        this.safePlay('pickup_magnet');
    }
    
    playSuperActivate(powerId: 'aura' | 'megaBomb' | 'freeze'): void {
        const key = powerId === 'megaBomb' ? 'super_bomb' : `super_${powerId}`;
        this.safePlay(key);
    }
    
    playSuperShotActivate(): void {
        this.safePlay('super_shot');
    }
    
    playVictory(): void {
        this.stopMusic();
        this.safePlay('victory');
    }
    
    playGameOver(): void {
        this.stopMusic();
        this.safePlay('gameover');
    }
    
    startMusic(): void {
        if (!this.music) return;
        try {
            if (!this.music.playing()) this.music.play();
        } catch (e) {
            console.warn('[AudioSys] Music play failed', e);
        }
    }
    
    stopMusic(): void {
        if (!this.music) return;
        try {
            this.music.stop();
        } catch (e) {
            console.warn('[AudioSys] Music stop failed', e);
        }
    }
    
    /**
     * Toggle mute — wycisza wszystko (SFX + music).
     * @returns true gdy teraz wyciszone, false gdy odgłośnione
     */
    toggleMute(): boolean {
        this.muted = !this.muted;
        Howler.mute(this.muted);
        return this.muted;
    }
    
    get isMuted(): boolean {
        return this.muted;
    }
}