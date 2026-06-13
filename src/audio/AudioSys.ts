import { Howl, Howler } from 'howler';
import type { MapId } from '../types/MapType';

/**
 * AudioSys — singleton wrapper na Howler.js.
 *
 * v0.13.0 update (Desert Map FAZA 1):
 * - Per-map music pools (city vs desert) z smart random within pool
 * - Latwa rozbudowa dla nowych map (arktyka, tropiki, etc.)
 *
 * v0.24.0 FAZA 8a update (Settings UI):
 * - setMusicVolume(v) / setSfxVolume(v) — 0..1 multipliers per channel
 * - localStorage persistence: bt2:audio:musicVol / bt2:audio:sfxVol (per-device)
 * - Decyzja E2: audio per-device (environment preference, nie character preference)
 * - Decyzja B1: linear 0-100% scaling (no logarithmic taper — prostota dla 9-12)
 * - Decyzja C1: slider na 0 = mute (no separate mute button, M-key zachowany jako global toggle)
 *
 * GENTLE FAILURE: brakujace pliki audio NIE crashuja gry.
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

/** Volume per layer — BASELINE values. Multipliers (musicVolMult/sfxVolMult) apply on top. */
const VOLUMES = {
    music: 0.25,
    shoot: 0.4,
    hit: 0.5,
    explosion: 0.7,
    pickup: 0.5,
    superActivate: 0.8,
    endgame: 0.7,
};

/** v0.24.0 FAZA 8a: localStorage keys dla per-device volume persistence */
const MUSIC_VOL_KEY = 'bt2:audio:musicVol';
const SFX_VOL_KEY = 'bt2:audio:sfxVol';

/**
 * Music tracks per map. Kazda mapa ma swoja pule utworow (smart random within pool).
 * Tracki musza byc w public/sfx/ folderze.
 */
const MUSIC_TRACKS_PER_MAP: Record<MapId, string[]> = {
    city:   ['music_main1.ogg', 'music_main2.mp3'],
    desert: ['pustynia.mp3'],
};

interface SoundDef {
    key: string;
    file: string;
    volume: number;
}

const SOUND_LIST: SoundDef[] = [
    { key: 'shoot_standard', file: 'shoot_standard.mp3', volume: VOLUMES.shoot },
    { key: 'shoot_heavy',    file: 'shoot_heavy.mp3',    volume: VOLUMES.shoot * 1.1 },
    { key: 'shoot_sniper',   file: 'shoot_sniper.mp3',   volume: VOLUMES.shoot * 0.9 },
    { key: 'shoot_plasma',   file: 'shoot_plasma.mp3',   volume: VOLUMES.shoot },

    { key: 'hit_enemy',  file: 'hit_enemy.mp3',  volume: VOLUMES.hit },
    { key: 'hit_wall',   file: 'hit_wall.mp3',   volume: VOLUMES.hit * 0.7 },
    { key: 'hit_player', file: 'hit_player.mp3', volume: VOLUMES.hit * 1.1 },

    { key: 'explosion', file: 'explosion.mp3', volume: VOLUMES.explosion },

    { key: 'pickup_gem',    file: 'pickup_gem.mp3',    volume: VOLUMES.pickup * 0.6 },
    { key: 'pickup_heart',  file: 'pickup_heart.mp3',  volume: VOLUMES.pickup },
    { key: 'pickup_magnet', file: 'pickup_magnet.mp3', volume: VOLUMES.pickup },

    { key: 'super_aura',   file: 'super_aura.mp3',   volume: VOLUMES.superActivate },
    { key: 'super_bomb',   file: 'super_bomb.mp3',   volume: VOLUMES.superActivate * 1.1 },
    { key: 'super_freeze', file: 'super_freeze.mp3', volume: VOLUMES.superActivate },
    { key: 'super_shot',   file: 'super_shot.mp3',   volume: VOLUMES.superActivate * 0.9 },

    { key: 'victory',  file: 'victory.mp3',  volume: VOLUMES.endgame },
    { key: 'gameover', file: 'gameover.mp3', volume: VOLUMES.endgame },

    // UI feedback (FAZA 6d)
    { key: 'menu_click', file: 'menu_click.mp3', volume: 0.35 },
];

export class AudioSys {
    private static _instance: AudioSys | null = null;

    private sounds: Map<string, Howl> = new Map();

    // Music: per-map pool z Howl instancjami
    private musicHowlsPerMap: Record<MapId, Howl[]> = { city: [], desert: [] };
    private currentMusicTrack: Howl | null = null;
    private lastTrackIdxPerMap: Record<MapId, number> = { city: -1, desert: -1 };

    private muted: boolean = false;
    private gemPickupTimer: number = 0;

    // v0.24.0 FAZA 8a: volume multipliers per channel (0..1)
    private musicVolMult: number = 1.0;
    private sfxVolMult: number = 1.0;

    private constructor() {
        // Load persisted volumes BEFORE preloading (so Howl instances created z correct volumes)
        this.loadVolumes();

        this.preloadAll();
        this.initMusic();
    }

    static getInstance(): AudioSys {
        if (!this._instance) this._instance = new AudioSys();
        return this._instance;
    }

    /**
     * v0.24.0: Load persisted volume settings z localStorage.
     * Called raz w constructor. Defaults to 1.0 (full volume) gdy brak entries.
     */
    private loadVolumes(): void {
        try {
            const m = localStorage.getItem(MUSIC_VOL_KEY);
            if (m !== null) {
                const v = parseFloat(m);
                if (!isNaN(v)) this.musicVolMult = Math.max(0, Math.min(1, v));
            }
            const s = localStorage.getItem(SFX_VOL_KEY);
            if (s !== null) {
                const v = parseFloat(s);
                if (!isNaN(v)) this.sfxVolMult = Math.max(0, Math.min(1, v));
            }
        } catch {
            // localStorage blocked — use defaults (1.0/1.0)
        }
    }

    private preloadAll(): void {
        for (const def of SOUND_LIST) {
            try {
                const howl = new Howl({
                    src: [BASE + 'sfx/' + def.file],
                    // v0.24.0: apply sfxVolMult przy creation
                    volume: def.volume * this.sfxVolMult,
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

    /**
     * Inicjalizuje music tracki per mapa. Howler automatycznie wykrywa format z rozszerzenia.
     */
    private initMusic(): void {
        const mapIds = Object.keys(MUSIC_TRACKS_PER_MAP) as MapId[];
        for (const mapId of mapIds) {
            const files = MUSIC_TRACKS_PER_MAP[mapId];
            for (const file of files) {
                try {
                    const howl = new Howl({
                        src: [BASE + 'sfx/' + file],
                        loop: true,
                        // v0.24.0: apply musicVolMult przy creation
                        volume: VOLUMES.music * this.musicVolMult,
                        preload: true,
                        onloaderror: (_id, err) => {
                            console.warn(`[AudioSys] Brak music ${mapId}: ${file}`, err);
                        },
                    });
                    this.musicHowlsPerMap[mapId].push(howl);
                } catch (e) {
                    console.warn(`[AudioSys] Music init failed for ${file}`, e);
                }
            }
        }
    }

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
    // v0.24.0 FAZA 8a: Volume control API
    // ==========================================

    /**
     * Set music volume (0..1, clamped). Applies do wszystkich music tracks w real-time.
     * Persists do localStorage (bt2:audio:musicVol).
     */
    setMusicVolume(v: number): void {
        this.musicVolMult = Math.max(0, Math.min(1, v));
        try {
            localStorage.setItem(MUSIC_VOL_KEY, String(this.musicVolMult));
        } catch {
            // localStorage blocked — runtime change still works, persists ginie
        }

        // Apply do wszystkich music howls (per-map pool)
        const effectiveVol = VOLUMES.music * this.musicVolMult;
        for (const mapId of Object.keys(this.musicHowlsPerMap) as MapId[]) {
            for (const howl of this.musicHowlsPerMap[mapId]) {
                try {
                    howl.volume(effectiveVol);
                } catch {
                    // Howl may be in invalid state — silent fail
                }
            }
        }
    }

    /**
     * Set SFX volume (0..1, clamped). Applies do wszystkich sound effects w real-time.
     * Persists do localStorage (bt2:audio:sfxVol).
     */
    setSfxVolume(v: number): void {
        this.sfxVolMult = Math.max(0, Math.min(1, v));
        try {
            localStorage.setItem(SFX_VOL_KEY, String(this.sfxVolMult));
        } catch {
            // localStorage blocked — runtime change still works
        }

        // Apply do wszystkich SFX howls — kazdy ma original baseline volume × multiplier
        for (const [key, howl] of this.sounds) {
            const def = SOUND_LIST.find(d => d.key === key);
            if (def) {
                try {
                    howl.volume(def.volume * this.sfxVolMult);
                } catch {
                    // Silent fail
                }
            }
        }
    }

    /** Get current music volume multiplier (0..1). */
    getMusicVolume(): number {
        return this.musicVolMult;
    }

    /** Get current SFX volume multiplier (0..1). */
    getSfxVolume(): number {
        return this.sfxVolMult;
    }

    // ==========================================
    // PUBLIC API — SFX playback (unchanged)
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

    /**
     * UI menu click feedback (FAZA 6d).
     * Throttle 60ms — anty-spam przy szybkich klikach.
     */
    private menuClickTimer: number = 0;
    playMenuClick(): void {
        const now = Date.now();
        if (now - this.menuClickTimer < 60) return;
        this.menuClickTimer = now;
        this.safePlay('menu_click');
    }

    /**
     * Start music dla wybranej mapy. Smart random within map pool.
     */
    startMusic(mapId: MapId = 'city'): void {
        const tracks = this.musicHowlsPerMap[mapId];
        if (!tracks || tracks.length === 0) {
            console.warn(`[AudioSys] No music tracks for map ${mapId}`);
            return;
        }

        if (this.currentMusicTrack && this.currentMusicTrack.playing()) {
            this.currentMusicTrack.stop();
        }

        let idx: number;
        const lastIdx = this.lastTrackIdxPerMap[mapId];
        if (tracks.length === 1) {
            idx = 0;
        } else {
            do {
                idx = Math.floor(Math.random() * tracks.length);
            } while (idx === lastIdx);
        }
        this.lastTrackIdxPerMap[mapId] = idx;
        this.currentMusicTrack = tracks[idx];

        try {
            if (!this.currentMusicTrack.playing()) {
                this.currentMusicTrack.play();
            }
            const fileName = MUSIC_TRACKS_PER_MAP[mapId][idx];
            console.log(`[AudioSys] Playing ${mapId} music track ${idx + 1}/${tracks.length}: ${fileName}`);
        } catch (e) {
            console.warn('[AudioSys] Music play failed', e);
        }
    }

    stopMusic(): void {
        if (!this.currentMusicTrack) return;
        try {
            this.currentMusicTrack.stop();
        } catch (e) {
            console.warn('[AudioSys] Music stop failed', e);
        }
    }

    /**
     * Global mute toggle (M-key hotkey legacy). Niezalezne od volume sliders —
     * mute ON robi wszystko cicho, niezaleznie od slider values. Mute OFF wraca
     * do wartosci ustawionych w Settings.
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