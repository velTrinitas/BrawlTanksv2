/**
 * Super powers config — PROG-F7a: REGISTRY PATTERN (rule .claude/rules/super-powers.md §1).
 *
 * Kazda moc = PowerDef z pelna definicja zachowania (onActivate/onTick/onEnd).
 * PowerSystem WYKONUJE definicje — zero `if (id === 'aura')` w silniku. Dodanie mocy
 * w F7b = wpis w POWERS + i18n, NIE nowa galaz if w main.ts/PowerSystem.
 *
 * Podzial odpowiedzialnosci (swiadomy, zeby registry nie bylo wydmuszka):
 *  - onActivate(ctx) robi WSZYSTKO co moc robi sama: stan, efekty, notif, audio, freeze wrogow.
 *  - ActivationResult wraca do main.ts TYLKO z tym, co musi przejsc przez petle gry
 *    (cele mega bomby => kill-path z registerKill/drop/combo NALEZY do petli, nie do configu).
 *
 * Historia: v0.5 per-super cooldowns; v0.46.0 MEGA_BOMB damage x100; F7a registry + loadout.
 */

import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { EffectsManager } from '../rendering/Effects';
import type { PowerSystem } from '../systems/PowerSystem';
import type { TranslationKey } from '../i18n/i18n';
import type { ScenarioId } from '../types/Scenario';
import { t } from '../i18n/i18n';

export type PowerId = 'aura' | 'megaBomb' | 'freeze' | 'repair' | 'tower' | 'rockets' | 'ghost';

/** Loadout gracza: 2 sloty (GARAZ). null = pusty slot (nie powinno sie zdarzyc po normalizacji). */
export type LoadoutPair = readonly [PowerId | null, PowerId | null];

/** Domyslny loadout (legacy default = aura pierwsza; bomba jako druga — instant, czytelna). */
export const DEFAULT_LOADOUT: LoadoutPair = ['aura', 'megaBomb'];

/**
 * Kontekst wstrzykiwany do onActivate/onEnd — waskie typy strukturalne, zeby config
 * nie ciagnal runtime-owych zaleznosci (import type => zero cykli).
 */
export interface PowerActivationCtx {
    player: Player;
    enemies: Enemy[];
    effects: EffectsManager;
    /**
     * Waski typ strukturalny AudioSys. UWAGA (przeglad F7b): playSuperActivate buduje
     * klucz `super_${id}` — pliki istnieja TYLKO dla trojki legacy, a safePlay przy
     * braku klucza wychodzi PO CICHU. Nowe moce uzywaja jawnych metod reuse
     * (playHeartPickup/playShockwave), nie playSuperActivate z nowym id.
     */
    audio: {
        /** F7b-2/4: 'tower'/'ghost' w unii, bo pliki super_*.wav ISTNIEJA (generowane). */
        playSuperActivate(powerId: 'aura' | 'megaBomb' | 'freeze' | 'tower' | 'ghost'): void;
        playHeartPickup(): void;
        playShockwave(): void;
    };
    hud: { addNotif(text: string, color: string): void };
    /** System wykonujacy definicje — moc ustawia przez niego stan czasowy (beginTimedEffect). */
    system: PowerSystem;
}

/**
 * Result aktywacji — kontrakt zwrotny do main.ts. TYLKO to, co musi wrocic do petli gry.
 */
export interface ActivationResult {
    activated: boolean;
    powerId?: PowerId;
    /** Mega Bomb: cele do kill-path w main.ts (registerKill/score/drop/multi-kill/victory). */
    megaBombTargets?: Enemy[];
}

export interface PowerDef {
    id: PowerId;
    /** Legacy display name (canvas HUD desktop). DOM UI uzywa labelKey przez t(). */
    name: string;
    /** Etykieta i18n (typowana zmienna TranslationKey — kompiluje sie, wzorzec quests.ts). */
    labelKey: TranslationKey;
    emoji: string;
    color: number;
    cooldownMs: number;
    /** Czas trwania efektu w klatkach (0 = instant). */
    durationFrames: number;
    /**
     * Prog trofeow odblokowania na Szlaku. F7a: wszystkie 3 obecne moce = 0 (kazdy ma je
     * od startu — zablokowanie czegos, co gracze maja dzis, byloby regresja). Pierwsze
     * realne odblokowanie = pierwsza NOWA moc w F7b.
     */
    unlockAtTrophies: number;
    /**
     * Etykieta statusu aktywnego efektu w HUD (np. "TARCZA! {sec}s"). Wymagana dla
     * mocy czasowych (beginTimedEffect) — HUD renderuje ja generycznie z power.color,
     * zero if-chain po id (przeglad F7b: bez tego Naprawa pokazywalaby tekst mrozu).
     */
    activeLabelKey?: TranslationKey;
    /** Pelne zachowanie aktywacji (stan + efekty + audio + notif). */
    onActivate: (ctx: PowerActivationCtx) => ActivationResult;
    /**
     * Per-frame podczas trwania efektu. `delta` = przeskalowane klatki (60fps=1.0) —
     * OBOWIAZKOWA przy wszystkim, co narasta w czasie (heal), inaczej efekt zalezy od FPS.
     */
    onTick?: (system: PowerSystem, player: Player, delta: number, effects: EffectsManager) => void;
    /** Koniec efektu czasowego (sprzatanie + feedback). */
    onEnd?: (system: PowerSystem, player: Player, effects: EffectsManager) => void;
}

/**
 * Mega Bomb stats.
 * v0.46.0: damage x100 (8 -> 800). blastRadius to dystans, NIETKNIETY.
 */
export const MEGA_BOMB_CONFIG = {
    blastRadius: 250,
    damage: 800,
};

// ── F7b-1: NAPRAWA (kanal 3s, heal % maxHp — NIGDY flat, design §18.3) ──────
/** Ile maxHp odzyskuje pelny kanal Naprawy. Jedyna stala balansu tej mocy. */
export const REPAIR_HEAL_PCT = 0.35;

// ── F7b-2: WIEZA MG (spec feelingu: BT_SuperPowers_Sim_v6.html linie 131/317-332/492) ──
/** Wszystkie stale Wiezy w jednym miejscu = jeden tuning pass po playtescie. */
export const TOWER_CONFIG = {
    range: 420,             // px — zasieg skanu (sim 1:1)
    scanEveryFrames: 12,    // ~200ms miedzy wyborami celu (throttle jak w sim)
    fireEveryFrames: 6,     // 10 strzalow/s (sim 1:1)
    aimToleranceRad: 0.35,  // strzela dopiero gdy lufa ~w celu (zero tracerow w plecy)
    aimLerpPerFrame: 0.2,   // szybkosc obrotu lufy (sim: lerp 12/s przy 60fps)
    spreadRad: 0.06,        // lekki rozrzut MG
    barrelLen: 34,          // px od srodka do wylotu lufy (spawn pocisku + muzzle flash)
    bulletSpeed: 20,        // px/klatka — szybki tracer (miedzy scout 27 a heavy 13)
    bulletMaxDist: 460,     // nieco ponad range, zeby pocisk nie znikal tuz przed celem
    dmgMult: 0.5,           // % dmg brawlera per pocisk (sim 1:1) — skaluje sie z czolgiem
    blinkFrames: 90,        // ostatnie 1.5s: wieza mruga = telegraf wygasniecia (mobile bez HUD)
};

// ── F7b-3: SALWA RAKIET (spec: sim v6 linie 134-139/459-467 + design §18.2 #7) ──
// Decyzja Mariusza 2026-08-07: 8 rakiet (nie 6 z designu) + unlock w AKCIE I (330 🏆,
// zamiast ~2500 z §18.4 — Turbo wyciete, bo duplikowalo pady; Salwa lata luke onboardingu).
export const ROCKETS_CONFIG = {
    count: 8,               // decyzja Mariusza (design mial 6)
    launchEveryFrames: 5,   // ~80ms stagger — rytm tuk-tuk (sensoryka, design 1:1)
    spreadRad: 0.6,         // poczatkowy rozrzut wokol lufy gracza (sim: ±0.6) => luk lotu
    speed: 8,               // px/klatka (sim 330 px/s ≈ 5.5 — lekko szybciej, gra ma wiekszy swiat)
    steerLerpPerFrame: 0.09, // sterowanie proporcjonalne (sim: 5.5/s) — luk, nie snajperka
    lifeFrames: 144,        // 2.4s (sim 1:1) — po tym czasie rakieta wybucha w locie
    contactDist: 34,        // px do DOWOLNEGO wroga => detonacja (sim: e.r+6)
    explosionRadius: 60,    // AoE (sim 1:1, design "male eksplozje r~60")
    explosionDmg: 300,      // flat w skali x100 — 1-shot zwykly wrog, boss wymaga kilku
    smokeEveryFrames: 2,    // dymek co 2 klatki/rakiete (cap designu: max 3 particles/rakiete/klatke)
};

// ── F7b-4: CZOLG WIDMO (spec: sim v6 140-142/389-392/456/551-554 + design §18.2 #8) ──
export const GHOST_CONFIG = {
    durationFrames: 300,        // 5s (sim+design 1:1)
    tauntRadius: 500,           // design: wrogowie w tym promieniu od WABIKA atakuja wabik
    bossIgnoreAfterFrames: 120, // design: boss/mega boss ignoruje wabik po 2s (bossfighty!)
    absorbRadius: 24,           // sim: pociski wroga trafiajace wabik znikaja (fiolet puff)
    endExplosionRadius: 100,    // "znika z malym wybuchem" (sim+design 1:1)
    endExplosionDmg: 300,       // flat x100 — jak eksplozja rakiety (sim insta-killowal)
};

// ── REJESTR (F7a: trzy moce legacy 1:1; F7b: nowe moce = NOWE WPISY, zero if-chain) ──
export const POWERS: Record<PowerId, PowerDef> = {
    aura: {
        id: 'aura',
        name: 'Aura',
        labelKey: 'power.aura',
        emoji: '🛡️',
        color: 0xffdd00,
        cooldownMs: 30000,       // v4.48: 30s
        durationFrames: 480,     // 8s (v4.48 mialo 5s — zachowujemy buff)
        unlockAtTrophies: 0,
        activeLabelKey: 'hud.auraActive',
        onActivate: (ctx) => {
            ctx.system.beginTimedEffect('aura');
            ctx.hud.addNotif(t('hud.shieldActive'), '#ffdd00');
            ctx.effects.shake(4, 6);
            ctx.audio.playSuperActivate('aura');
            return { activated: true, powerId: 'aura' };
        },
        onTick: (system, player) => system.auraTick(player.x, player.y),
        onEnd: (system, player, effects) => {
            system.auraHide();
            effects.spawnEnemyHitSparks(player.x, player.y, 0xffdd00);
        },
    },
    megaBomb: {
        id: 'megaBomb',
        name: 'Bomba',
        labelKey: 'power.megaBomb',
        emoji: '💣',
        color: 0xff4400,
        cooldownMs: 20000,       // v4.48: 20s
        durationFrames: 0,       // instant
        unlockAtTrophies: 0,
        onActivate: (ctx) => {
            // Instant — znajdz wrogow w radiusie. Kill-path (damage/score/drop) robi main.ts.
            const blastR2 = MEGA_BOMB_CONFIG.blastRadius * MEGA_BOMB_CONFIG.blastRadius;
            const targets = ctx.enemies.filter(e => {
                if (!e.active) return false;
                const dx = e.x - ctx.player.x;
                const dy = e.y - ctx.player.y;
                return (dx * dx + dy * dy) < blastR2;
            });
            ctx.effects.spawnMegaBomb(ctx.player.x, ctx.player.y);
            ctx.hud.addNotif(t('hud.megaBombHit', { count: targets.length }), '#ff4400');
            ctx.audio.playSuperActivate('megaBomb');
            return { activated: true, powerId: 'megaBomb', megaBombTargets: targets };
        },
    },
    freeze: {
        id: 'freeze',
        name: 'Mróz',
        labelKey: 'power.freeze',
        emoji: '❄️',
        color: 0x66ddff,
        cooldownMs: 25000,       // v4.48: 25s
        durationFrames: 300,     // 5s
        unlockAtTrophies: 0,
        activeLabelKey: 'hud.freezeActiveStatus',
        onActivate: (ctx) => {
            ctx.system.beginTimedEffect('freeze');
            // freezeUntil PUBLICZNE na systemie — fix v0.87.1: wrogowie spawnowani PODCZAS
            // freeze sa mrozeni do tego samego czasu (main.ts czyta system.freezeUntil).
            const freezeUntil = Date.now() + (POWERS.freeze.durationFrames / 60) * 1000;
            ctx.system.freezeUntil = freezeUntil;
            for (const enemy of ctx.enemies) {
                if (enemy.active) enemy.freeze(freezeUntil);
            }
            ctx.effects.spawnFreezeOverlay(300);
            ctx.hud.addNotif(t('hud.freezeAll'), '#66ddff');
            ctx.effects.shake(3, 8);
            ctx.audio.playSuperActivate('freeze');
            return { activated: true, powerId: 'freeze' };
        },
    },
    // ── F7b-1: NAPRAWA — pierwsza NOWA moc. Caly wpis = dowod tezy registry:
    //    zero zmian w PowerSystem/main.ts poza generycznymi sciezkami. ──
    repair: {
        id: 'repair',
        name: 'Naprawa',
        labelKey: 'power.repair',
        emoji: '🔧',
        color: 0x2ecc71,
        cooldownMs: 30000,       // dlugie cd (§18.3: "ratunek, nie pasywny sustain")
        durationFrames: 180,     // kanal 3s
        unlockAtTrophies: 750,   // domkniecie Aktu I — milestone 750 nosi labelKey marchewki
        activeLabelKey: 'hud.repairActive',
        onActivate: (ctx) => {
            ctx.system.beginTimedEffect('repair');
            ctx.hud.addNotif(t('hud.repairStart'), '#2ecc71');
            ctx.audio.playHeartPickup(); // reuse — brak pliku super_repair (jawna decyzja, nie cisza)
            return { activated: true, powerId: 'repair' };
        },
        onTick: (system, player, delta, effects) => {
            // Heal % maxHp rozlozony na caly kanal, SKALOWANY DELTA (odporny na FPS).
            // UWAGA Perfect Run: markDamageTaken jest one-way — heal NIE przywraca Perfect
            // (stan raz utracony nie wraca, §18.3 "jawnie zakodowac").
            const healPerFrame = (player.maxHp * REPAIR_HEAL_PCT) / POWERS.repair.durationFrames;
            player.hp = Math.min(player.maxHp, player.hp + healPerFrame * delta);
            // Wskaznik kanalu na OBU platformach (mobile nie ma paska HUD!) — zielony
            // pulsujacy ring przy graczu, wzorzec aury (1 Graphics przez 3s kanalu).
            system.channelRingTick(player.x, player.y, 0x2ecc71);
            // Iskry z poola co ~20 klatek. ZERO spawnFloatingText w petli (rasteryzacja
            // PIXI.Text = najdrozsza operacja — uwaga z przegladu).
            if (system.framesLeft % 20 < delta) {
                effects.spawnEnemyHitSparks(player.x, player.y - 10, 0x2ecc71);
            }
        },
        onEnd: (system, player, effects) => {
            system.channelRingHide();
            effects.spawnEnemyHitSparks(player.x, player.y, 0x2ecc71);
        },
    },
    // ── F7b-2: WIEZA MG — FIRE-AND-FORGET (wzorzec magnesu: wlasny timer w PowerSystem,
    //    NIE beginTimedEffect). Decyzja z przegladu: zajecie activePowerId blokowaloby
    //    DRUGI slot przez 8s; w sim (spec feelingu) wieza nie blokuje innych mocy,
    //    a "nie moge sie leczyc bo wieza strzela" czyta sie jako oszustwo (Czytelnosc).
    //    Odwracalne 1 linia (beginTimedEffect('tower')), gdyby wieza+mroz byly za mocne. ──
    tower: {
        id: 'tower',
        name: 'Wieża',
        labelKey: 'power.tower',
        emoji: '🗼',
        color: 0x4dd7c8,
        cooldownMs: 30000,       // sim 14s = wartosc demo (regula: cd w sim SA SKROCONE);
                                 // 30s > 8s zycia => max 1 wieza naraz, bez dodatkowego stanu
        durationFrames: 480,     // 8s zycia wiezy (sim 1:1) — timer zyje w PowerSystem
        unlockAtTrophies: 1500,  // milestone Aktu II nosi labelKey road.unlock.tower
        onActivate: (ctx) => {
            ctx.system.towerSpawn(ctx.player.x, ctx.player.y);
            ctx.hud.addNotif(t('hud.towerStart'), '#4dd7c8');
            // Dzwiek ma wbudowany whoosh 0.18s PRZED thud-em — sync z animacja zrzutu
            // (~11 klatek spadania); shake robi PowerSystem w klatce LADOWANIA, nie tu.
            ctx.audio.playSuperActivate('tower');
            return { activated: true, powerId: 'tower' };
        },
    },
    // ── F7b-3: SALWA RAKIET — fire-and-forget (rakiety zyja w PowerSystem jak wieza).
    //    "Bomba = wszystko wokol MNIE, Salwa = precyzyjne uderzenie TAM" (design §18.2).
    //    Cele przydzielane przy AKTYWACJI (i-ty najblizszy, round-robin gdy wrogow <8);
    //    cel ginie w locie => dumb-fire prosto, ZERO retargetu (design: prostota). ──
    rockets: {
        id: 'rockets',
        name: 'Salwa',
        labelKey: 'power.rockets',
        emoji: '🚀',
        color: 0xff9f43,
        cooldownMs: 30000,       // sim 10s = demo; 8 rakiet x 300 dmg to powazny burst
        durationFrames: 0,       // instant activation — salwa odpala sie sama (stagger w systemie)
        unlockAtTrophies: 330,   // AKT I (decyzja Mariusza — luka onboardingu po wycieciu Turbo)
        onActivate: (ctx) => {
            ctx.system.rocketsLaunch(ctx.player.x, ctx.player.y, ctx.player.turretAngle, ctx.enemies);
            ctx.hud.addNotif(t('hud.rocketsStart'), '#ff9f43');
            // Dzwiek wystrzalu gra PowerSystem per rakieta (8x co ~80ms = rytm tuk-tuk);
            // tutaj zero dodatkowego audio — rytm JEST sygnatura tej mocy.
            return { activated: true, powerId: 'rockets' };
        },
    },
    // ── F7b-4: CZOLG WIDMO — jedyna moc "sprytu" (design: trik, nie sila; nauka
    //    pozycjonowania). Fire-and-forget; przekierowanie celu wrogow robi main.ts
    //    przez system.ghostTauntFor(enemy) — to jest ten "targetRef" z reguly,
    //    zrealizowany iniekcja wspolrzednych (Enemy.update juz bierze targetX/Y). ──
    ghost: {
        id: 'ghost',
        name: 'Widmo',
        labelKey: 'power.ghost',
        emoji: '👻',
        color: 0xb39ddb,
        cooldownMs: 30000,       // sim 12s = demo; wabik 5s + wybuch to duza wartosc obronna
        durationFrames: 0,       // instant activation — wabik zyje wlasnym timerem w systemie
        unlockAtTrophies: 5000,  // Akt III, moc-prestiz (design §18.4); marchewka na Szlaku
                                 // dojdzie z designem Aktu III (droga konczy sie dzis na 1500)
        onActivate: (ctx) => {
            ctx.system.ghostSpawn(ctx.player);
            ctx.hud.addNotif(t('hud.ghostStart'), '#b39ddb');
            ctx.audio.playSuperActivate('ghost');
            return { activated: true, powerId: 'ghost' };
        },
    },
};

/** Kolejnosc wyswietlania (GARAZ picker) + inicjalizacja cooldownow. */
export const POWER_ORDER: readonly PowerId[] = ['aura', 'megaBomb', 'freeze', 'rockets', 'repair', 'tower', 'ghost'];

export function getPowerDef(id: string): PowerDef | undefined {
    return (POWERS as Record<string, PowerDef>)[id];
}

/**
 * Macierz dozwolonych mocy per scenariusz (rule §ZALEZNOSCI). null = pelna pula.
 * F7a: WSZEDZIE pelna pula — dzis gracz ma w meczu dostep do wszystkich 3 mocy
 * (scroll/long-press cycle), wiec zawezenie TERAZ byloby regresja vs live. Mechanizm
 * jest gotowy; CTF zawęzimy gdy dojda moce, ktore lamia jego mete (F7b+).
 */
export const ALLOWED_POWERS: Record<ScenarioId, readonly PowerId[] | null> = {
    ktb: null,
    ctf: null,
    castle: null,
    save_king: null,
};

/**
 * Loadout przefiltrowany pod scenariusz + WLASNOSC + walidacja id. Niedozwolony /
 * nieznany / NIEPOSIADANY slot dostaje pierwsza dozwolona posiadana moc spoza drugiego
 * slotu (gracz NIGDY nie wchodzi w mecz z pustym przyciskiem). Czysta funkcja.
 *
 * FILTR PO `owned` = BRAMKA PROGOW (przeglad F7b): bez niego reczna edycja
 * localStorage/chmury (loadout jest LWW, nie walidowany serwerowo) dawalaby moc
 * zza progu trofeow na zawsze. setLoadoutSlot pilnuje UI, ta funkcja pilnuje MECZU.
 *
 * @param remapped opcjonalny out-param: true gdy ktorys slot zostal podmieniony
 *                 (main.ts pokazuje notif — cicha podmiana wyglada jak bug dla 9-latka).
 */
export function resolveLoadoutForMatch(
    loadout: LoadoutPair,
    scenario: ScenarioId,
    owned: readonly PowerId[],
    remapped?: { value: boolean },
): [PowerId, PowerId] {
    const allowed = ALLOWED_POWERS[scenario] ?? null;
    const pool = (allowed ?? POWER_ORDER).filter(id => !!getPowerDef(id) && owned.includes(id));
    // Awaryjnie (uszkodzony stan: owned puste) — trojka bazowa, zeby mecz ZAWSZE mial moce.
    const safePool: readonly PowerId[] = pool.length > 0 ? pool : ['aura', 'megaBomb', 'freeze'];
    const ok = (id: PowerId | null): id is PowerId => !!id && safePool.includes(id);

    let a = ok(loadout[0]) ? loadout[0] : null;
    let b = ok(loadout[1]) ? loadout[1] : null;
    if (a === b) b = null; // duplikat (zmajstrowany zapis) => drugi slot do uzupelnienia
    if (a === null) a = safePool.find(id => id !== b) ?? safePool[0];
    if (b === null) b = safePool.find(id => id !== a) ?? safePool[0];
    if (remapped && (a !== loadout[0] || b !== loadout[1])) remapped.value = true;
    return [a, b];
}

/**
 * Pickup config (gem, magnet).
 * UWAGA: gemValue zostaje, ale w Etapie 1 gemy NIE laduja super powers.
 * W Etapie 2 laduja super-shot broni.
 *
 * v0.46.0: gemValue NIETKNIETE (to score, nie HP/DMG).
 */
export const PICKUP_CONFIG = {
    gemValue: 1,
    gemLifetimeMs: 20000,
    gemAutoCollectRadius: 35,
    gemsPerNormalEnemy: 1,
    gemsPerBoss: 5,
    gemsPerMegaBoss: 20,

    magnetSpawnIntervalFrames: 900,
    magnetMaxOnMap: 1,
    magnetActiveDurationMs: 5000,
    magnetAttractSpeed: 6,
    magnetAttractRange: 400,
};
