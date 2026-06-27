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
 * v0.42.0 FAZA 8a hub-music expansion:
 * - intro.mp3 (IntroScreen) + hub.ogg (MainHub + pickers + Settings) jako 2 nowe tracks
 * - startIntroMusic() / startHubMusic() — separate API od per-map music
 * - Decyzja: hub.ogg gra przez wszystkie menu screens (MainHub + ScenarioPicker +
 *   BrawlerPicker + Settings) — single coherent menu music session
 * - Autoplay policy fallback: jeśli initial play() rejected przez browser
 *   (pierwsza wizyta, brak user gesture), one-shot listener na pointerdown/keydown
 *   startuje music przy pierwszym dotknięciu strony (transparent dla użytkownika)
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
    city:    ['music_main1.ogg', 'music_main2.mp3'],
    desert:  ['pustynia.mp3'],
    tropics: ['tropiki.mp3'],
    arctic:  ['arktyka1.ogg', 'arktyka2.mp3'],  // FAZA A — 2-track pool (smart-random). Gentle-fail jesli plikow brak.
};

/**
 * v0.42.0: Menu music tracks (separate od per-map gameplay music).
 * intro.mp3 = IntroScreen splash autoplay
 * hub.ogg   = MainHub + pickers + Settings (single coherent menu session)
 */
const MENU_TRACKS = {
    intro: 'intro.mp3',
    hub:   'hub.ogg',
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

/** Tracks autoplay-pending state — jeśli initial play() rejected, restart przy first gesture. */
type PendingPlay = { howl: Howl; label: string };

export class AudioSys {
    private static _instance: AudioSys | null = null;

    private sounds: Map<string, Howl> = new Map();

    // Music: per-map pool z Howl instancjami
    private musicHowlsPerMap: Record<MapId, Howl[]> = { city: [], desert: [], tropics: [], arctic: [] };
    private currentMusicTrack: Howl | null = null;
    private lastTrackIdxPerMap: Record<MapId, number> = { city: -1, desert: -1, tropics: -1, arctic: -1 };

    // v0.42.0: Menu music howls (intro + hub)
    private introMusic: Howl | null = null;
    private hubMusic: Howl | null = null;

    private muted: boolean = false;
    private gemPickupTimer: number = 0;

    // v0.24.0 FAZA 8a: volume multipliers per channel (0..1)
    private musicVolMult: number = 1.0;
    private sfxVolMult: number = 1.0;

    // v0.42.0: autoplay-policy fallback
    private pendingPlay: PendingPlay | null = null;
    private gestureListenerInstalled: boolean = false;

    private constructor() {
        // Load persisted volumes BEFORE preloading (so Howl instances created z correct volumes)
        this.loadVolumes();

        this.preloadAll();
        this.initMusic();
        this.initMenuMusic();
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

    /**
     * v0.42.0: Inicjalizuje intro + hub music howls.
     * Same volume baseline jak gameplay music (decyzja A — konsystencja).
     * Both loop:true (defensive — jeśli pliki mają audible cut to UX issue, nie code issue).
     */
    private initMenuMusic(): void {
        try {
            this.introMusic = new Howl({
                src: [BASE + 'sfx/' + MENU_TRACKS.intro],
                loop: true,
                volume: VOLUMES.music * this.musicVolMult,
                preload: true,
                onloaderror: (_id, err) => {
                    console.warn(`[AudioSys] Brak intro music: ${MENU_TRACKS.intro}`, err);
                },
            });
        } catch (e) {
            console.warn('[AudioSys] Intro music init failed', e);
        }

        try {
            this.hubMusic = new Howl({
                src: [BASE + 'sfx/' + MENU_TRACKS.hub],
                loop: true,
                volume: VOLUMES.music * this.musicVolMult,
                preload: true,
                onloaderror: (_id, err) => {
                    console.warn(`[AudioSys] Brak hub music: ${MENU_TRACKS.hub}`, err);
                },
            });
        } catch (e) {
            console.warn('[AudioSys] Hub music init failed', e);
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

    /**
     * v0.42.0: Attempt to play music howl. Jeśli browser blokuje (autoplay policy),
     * zapisuje do pendingPlay i instaluje one-shot gesture listener.
     * Pierwsze pointerdown/keydown na document re-tryguje play.
     *
     * Howler's play() zwraca soundId (number) lub null (jeśli not ready). Promise rejection
     * pochodzi z underlying HTMLAudioElement — wykrywamy przez Howler events lub
     * suspended AudioContext state.
     */
    private playMusicWithGestureFallback(howl: Howl, label: string): void {
        try {
            howl.play();

            // Jeśli Howler.ctx jest suspended (autoplay policy), zaplanuj resume na first gesture.
            // To pokrywa większość real-world autoplay-block scenarios.
            const ctx = Howler.ctx;
            if (ctx && ctx.state === 'suspended') {
                this.pendingPlay = { howl, label };
                this.installGestureListener();
                console.log(`[AudioSys] ${label} music pending — AudioContext suspended, waiting for first gesture`);
            }
        } catch (e) {
            console.warn(`[AudioSys] ${label} music play failed, scheduling for first gesture`, e);
            this.pendingPlay = { howl, label };
            this.installGestureListener();
        }
    }

    private installGestureListener(): void {
        if (this.gestureListenerInstalled) return;
        this.gestureListenerInstalled = true;

        const trigger = () => {
            // Resume AudioContext jeśli suspended
            const ctx = Howler.ctx;
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }

            // Retry pending play
            if (this.pendingPlay) {
                try {
                    if (!this.pendingPlay.howl.playing()) {
                        this.pendingPlay.howl.play();
                    }
                    console.log(`[AudioSys] ${this.pendingPlay.label} music started after first user gesture`);
                } catch (e) {
                    console.warn('[AudioSys] Pending music play still failed', e);
                }
                this.pendingPlay = null;
            }

            // Cleanup — one-shot only
            document.removeEventListener('pointerdown', trigger);
            document.removeEventListener('keydown', trigger);
            this.gestureListenerInstalled = false;
        };

        document.addEventListener('pointerdown', trigger, { once: true, passive: true });
        document.addEventListener('keydown', trigger, { once: true, passive: true });
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

        // v0.42.0: also apply do menu music (intro + hub)
        for (const menuHowl of [this.introMusic, this.hubMusic]) {
            if (!menuHowl) continue;
            try {
                menuHowl.volume(effectiveVol);
            } catch {
                // Silent fail
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

    /**
     * v0.34.0 T7: Procedural crate break sound.
     */
    playCrateBreak(): void {
        if (this.muted) return;
        const ctx = Howler.ctx;
        if (!ctx) return;
        const t = ctx.currentTime;

        // ── Layer 1: low thud (wood structure break) ──
        const oscThud = ctx.createOscillator();
        const gainThud = ctx.createGain();
        oscThud.type = 'sawtooth';
        oscThud.frequency.setValueAtTime(150, t);
        oscThud.frequency.exponentialRampToValueAtTime(40, t + 0.14);
        gainThud.gain.setValueAtTime(0.30, t);
        gainThud.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        oscThud.connect(gainThud).connect(ctx.destination);
        oscThud.start(t);
        oscThud.stop(t + 0.16);

        // ── Layer 2: high splinter crack (filtered white noise) ──
        const bufferSize = Math.floor(ctx.sampleRate * 0.18);
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.22));
        }
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(2200, t);
        noiseFilter.frequency.exponentialRampToValueAtTime(1200, t + 0.14);
        noiseFilter.Q.value = 1.8;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.28, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

        noiseSource.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
        noiseSource.start(t);

        // ── Layer 3: subtle subbass thump ──
        const oscBass = ctx.createOscillator();
        const gainBass = ctx.createGain();
        oscBass.type = 'sine';
        oscBass.frequency.setValueAtTime(80, t);
        oscBass.frequency.exponentialRampToValueAtTime(35, t + 0.08);
        gainBass.gain.setValueAtTime(0.18, t);
        gainBass.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
        oscBass.connect(gainBass).connect(ctx.destination);
        oscBass.start(t);
        oscBass.stop(t + 0.10);
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

    // ==========================================
    // v0.42.0 FAZA 8a: Menu music API (intro + hub)
    // ==========================================

    /**
     * Start intro music (IntroScreen splash).
     * Idempotent — wywołanie gdy już gra nic nie zmienia.
     * Autoplay-policy fallback: jeśli rejected, retry na first gesture.
     *
     * Stops gameplay music + hub music first (jeden track music na raz).
     */
    startIntroMusic(): void {
        if (!this.introMusic) {
            console.warn('[AudioSys] Intro music not loaded');
            return;
        }
        if (this.introMusic.playing()) return; // idempotent

        // Stop other music tracks
        this.stopMusic();
        if (this.hubMusic && this.hubMusic.playing()) {
            try { this.hubMusic.stop(); } catch { /* silent */ }
        }

        this.playMusicWithGestureFallback(this.introMusic, 'Intro');
    }

    /**
     * Start hub music (MainHub + pickers + Settings — wszystkie menu screens).
     * Idempotent — wywołanie gdy już gra nic nie zmienia.
     * Wywoływane przy:
     *  - klik START w IntroScreen (po stopIntroMusic)
     *  - return z endgame (Victory/GameOver → returnToMenuFromEnd)
     *
     * Stops intro music + gameplay music first.
     */
    startHubMusic(): void {
        if (!this.hubMusic) {
            console.warn('[AudioSys] Hub music not loaded');
            return;
        }
        if (this.hubMusic.playing()) return; // idempotent

        // Stop other music tracks
        this.stopMusic();
        if (this.introMusic && this.introMusic.playing()) {
            try { this.introMusic.stop(); } catch { /* silent */ }
        }

        this.playMusicWithGestureFallback(this.hubMusic, 'Hub');
    }

    /**
     * Stop intro music explicitly (np. przy klik START gdy chcemy instant cut przed startHubMusic).
     * Idempotent.
     */
    stopIntroMusic(): void {
        if (!this.introMusic) return;
        try {
            if (this.introMusic.playing()) {
                this.introMusic.stop();
            }
        } catch { /* silent */ }
    }

    /**
     * Stop hub music explicitly (np. przy startGame, choć startMusic(map) i tak to robi via stopMusic).
     * Idempotent.
     */
    stopHubMusic(): void {
        if (!this.hubMusic) return;
        try {
            if (this.hubMusic.playing()) {
                this.hubMusic.stop();
            }
        } catch { /* silent */ }
    }

    /**
     * Start music dla wybranej mapy. Smart random within map pool.
     * v0.42.0: Stops intro + hub music first (jeden music track w danym momencie).
     */
    startMusic(mapId: MapId = 'city'): void {
        const tracks = this.musicHowlsPerMap[mapId];
        if (!tracks || tracks.length === 0) {
            console.warn(`[AudioSys] No music tracks for map ${mapId}`);
            return;
        }

        // v0.42.0: stop menu music przed startem gameplay music
        this.stopIntroMusic();
        this.stopHubMusic();

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