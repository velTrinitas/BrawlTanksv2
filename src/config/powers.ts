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

export type PowerId =
    | 'aura' | 'megaBomb' | 'freeze' | 'repair' | 'tower' | 'rockets' | 'ghost' | 'mines' | 'build'
    | 'strike' | 'hole' | 'laser'                               // TIER 2 premium (v0.111.0)
    | 'pong' | 'duck' | 'locker' | 'disco' | 'granny' | 'burp'; // TIER 3 / FUN (v0.112.0; pong od v0.119.0)

/**
 * Loadout gracza: 3 sloty (GARAZ, v0.114.0 — bylo 2). null = pusty slot (nie powinno
 * sie zdarzyc po normalizacji). Przy wlaczonych Szalonych Mocach slot 3 jest w MECZU
 * podmieniany na kostke 🎲 (wybor gracza w slocie 3 zostaje w stanie, wraca po OFF).
 */
export type LoadoutTriple = readonly [PowerId | null, PowerId | null, PowerId | null];

/** Domyslny loadout = trojka legacy (kazdy gracz ma je od startu, unlockAtTrophies=0). */
export const DEFAULT_LOADOUT: LoadoutTriple = ['aura', 'megaBomb', 'freeze'];

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
        /** Nowe id w unii TYLKO gdy plik super_*.wav ISTNIEJE (generowane/assety). */
        playSuperActivate(powerId: 'aura' | 'megaBomb' | 'freeze' | 'tower' | 'ghost' | 'mines' | 'build' | 'strike' | 'hole' | 'laser' | 'pong' | 'duck' | 'locker' | 'disco' | 'granny' | 'burp'): void;
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

// ── F7b-5: MINY (spec: sim v6 143-145/276-289/539-543 — "MINY! (jedz!)") ──
export const MINES_CONFIG = {
    windowFrames: 420,      // 7s okna zostawiania (sim 1:1) — "moc jazdy", nie instant
    dropEveryPx: 75,        // mina co 75px przejechanej drogi (sim 1:1)
    dropBehindPx: 24,       // mina laduje ZA czolgiem (sim 1:1) — nie pod lufa
    // v0.146.0 (playtest): 300 -> 150. Zgloszenie brzmialo „musisz postawic WSZYSTKIE
    // miny, dopiero wtedy wybuchaja" — technicznie nieprawda, bo kazda ma wlasny zapalnik
    // od chwili zrzutu. Winna byla arytmetyka: set 14 min schodzi co 75 px DROGI, czyli
    // 3,5 s (Twardy, speed 5) do 4,4 s (Pancerny, speed 4), a zapalnik mial 5,0 s —
    // pierwszy wybuch padal PO ostatnim zrzucie. Przy 2,5 s pierwsze miny detonuja
    // w polowie stawiania setu i robi sie kaskada, o ktora chodzilo.
    fuseFrames: 150,        // zegar 2.5s per mina (BEZ proximity — czysty timer)
    explosionRadius: 110,   // sim 1:1 ("swietna eksplozja", wiekszy niz rakieta r60)
    explosionDmg: 500,      // flat x100 — 1-shot zwykly wrog, powazny kes bossa
    // JEDEN set na aktywacje (fix z playtestu: cap ROWNOCZESNY + odometr rosnacy w tle
    // wysypywal DRUGI set, gdy pierwsze miny wybuchly i zwolnily sloty). Budzet LACZNY:
    maxPerActivation: 14,   // 12+2 (decyzja Mariusza) — po wyczerpaniu okno sie zamyka
    // Skalowane razem z zapalnikiem: przy 90 na zapalniku 150 „szybkie miganie" objelo by
    // 60% zycia miny i przestaloby cokolwiek zapowiadac.
    blinkFastFuseFrames: 45, // ostatnie 0.75s: dioda miga szybko
};

// ── F7b-6: BUILDER (spec: sim v6 146-148/291-299/527-536 — "zapora", mur z workow) ──
export const BUILDER_CONFIG = {
    windowFrames: 240,      // 4s okna budowania (sim 1:1) — najkrotsza "moc jazdy"
    dropEveryPx: 30,        // segment co 30px drogi (sim 1:1) — mur CIAGLY, nie kropki
    dropBehindPx: 45,       // za czolgiem; sim mial 30, ale nasz collider jest REALNY:
                            // promien czolgu ~22 + pol segmentu 15 => 30 nakladaloby mur
                            // NA gracza (blokada ruchu na 8s). 45 = czysty przeswit.
    segmentSize: 30,        // AABB 30x30 = wizual 1:1 (Czytelnosc: hitbox zgodny z rysunkiem)
    lifeFrames: 480,        // 8s zycia segmentu (sim 1:1), potem znika z puffem
    fadeFrames: 60,         // ostatnia 1s: alpha fade = telegraf zniknieciu (sim 1:1)
    maxPerActivation: 20,   // budzet LACZNY (lekcja min: zero "drugiego setu") = mur ~600px
    growFrames: 12,         // scale-in narodzin segmentu (sim: sc=age*5 => pelny w 0.2s)
};

// ═══ TIER 2 PREMIUM (v0.111.0, spec: sim v6 153-172/206-208/334-356/436-451) ═══
// Progi trofeow PROWIZORYCZNE (poza Szlakiem, ktory konczy sie na 1500) — docelowe
// wejscie Tier 2 = transze sezonowe (decyzja przy planie S2). Testy: ?powersdev=1.

// ── NALOT 🛸 — eskadra bombowcow wzdluz linii celowania (v2: MASAKRA) ──
export const STRIKE_CONFIG = {
    planeCount: 5,          // v2 (Mariusz): 5 maszyn (sim mial 3)
    planeScale: 1.5,        // v2: sylwetki +50%
    planeSpeed: 15,         // px/klatka (sim 900 px/s)
    planeLifeFrames: 84,    // ~1.4s przelotu
    planeSpreadPx: 62,      // rozstaw eskadry w poprzek linii (5 maszyn = gestszy szyk)
    bombCount: 12,          // v2: dywan 12 bomb (bylo 8) — masakra
    bombStartDist: 120,     // pierwsza bomba (sim 1:1)
    bombStepDist: 55,       // kolejne co 55px => dywan ~725px
    bombSpreadPx: 30,       // v2: losowy rozrzut w poprzek linii (organiczny dywan)
    bombStaggerFrames: 4,   // detonacje ida FALA po linii (rytm, sensoryka)
    bombRadius: 80,         // AoE per bomba (sim ring r80)
    bombDmg: 400,           // miedzy rakieta (300) a mina (500)
    craterFrames: 600,      // v2: chwilowe DZIURY w podlodze (decal 1:1 z BossBomb CTF), fade 10s
};

// ── CZARNA DZIURA 🕳️ — wir zasysajacy wrogow ──
export const HOLE_CONFIG = {
    spawnDist: 200,         // przed lufa (sim 1:1)
    durationFrames: 300,    // 5s (feedback Mariusza: +2s vs sim 3s)
    pullRadius: 420,        // +20% (feedback: szerszy pierscien; sim 350)
    pullPerFrame: 4.4,      // sila przy srodku, gasnie liniowo do 0 na krawedzi (sim 260 px/s)
    bossPullMult: 0.35,     // boss/mega opiera sie wirowi (inaczej trywializuje bossfighty)
    crushRadius: 28,        // rdzen (sim 1:1)
    crushDmg: 800,          // grunt ginie, boss dostaje powazny kes (sim insta-killowal)
    crushEveryFrames: 12,   // tick miazdzenia (nie co klatke — 0.2s)
};

// ── LASER ORBITALNY 🔦 — v2 (Mariusz): SAMONAPROWADZAJACY, dluzszy, szerszy ──
export const LASER_CONFIG = {
    durationFrames: 450,    // 7.5s (v2: +4s vs sim 3.5s)
    huntLerpPerFrame: 0.05, // v2: plamka SAMA GONI najblizszego wroga (nie gracza)
    beamRadius: 64,         // v2: szerszy (bylo 48, sim 1:1)
    tickEveryFrames: 6,     // tick obrazen co 0.1s
    tickDmg: 60,            // 600 dmg/s — topi grunt w ~sekunde, boss musi uciekac
};

// ── PING-PONG 🏓 — wirujace paletki odbijajace pociski wroga ──
export const PONG_CONFIG = {
    durationFrames: 480,    // v0.148.0: 5 s -> 8 s (playtest Mariusza; sim mial 5 s)
    deflectRadius: 70,      // zasieg odbicia wokol gracza (sim 1:1)
    reflectDmg: 250,        // dmg odbitego pocisku (flat x100; sim: 50% HP wroga)
    reflectSpeedMult: 1.8,  // odbity pocisk przyspiesza (sim 1:1)
    // v0.146.1 — TELEGRAF KONCA. Zgloszenie Mariusza: „nie wiemy, kiedy sie aktywuje,
    // a szczegolnie kiedy konczy". Ostatnia sekunda miga (wzorzec: TOWER_CONFIG.blinkFrames).
    blinkFrames: 60,
    color: 0xff7a1a,        // POMARANCZ pileczki — celowo daleko od zlota Aury (0xffdd00)
    colorLight: 0xffd9a0,
};

// ═══ TIER 3 SZALONE (v0.112.0, spec: sim v6 177-208/358-392/412-417) ═══
// Docelowo pula slotu 🎲 (mechanika TBD z Mariuszem); progi PROWIZORYCZNE 6000+,
// testy ?powersdev=1. Art: pieczone tekstury Canvas 2D z gradientami (Tier3Baker).

export const DUCK_CONFIG = {
    lifeFrames: 420,        // 7s (v2 Mariusz: +100% vs sim 3.5s)
    speedX: 4.73,           // v0.146.0: +10% (bylo 4.3) — prosba z playtestu
    speedY: 3.63,           // v0.146.0: +10% (bylo 3.3)
    edgeMargin: 60,         // odbicia od granic planszy (safety)
    turnEveryFrames: 120,   // v3 (Mariusz): SKRET 90 stopni co 2s — kaczka zygzakuje po mapie
    /**
     * v0.146.0 — KACZKA NAMIERZA (prosba z playtestu). Do v0.145.0 lot byl CALKOWICIE
     * losowy: skret 90 stopni co `turnEveryFrames` + odbicia od krawedzi, zero celowania.
     *
     * Naprowadzanie przez `lerpAngle` — ten sam helper co rakiety (ROCKETS_CONFIG
     * .steerLerpPerFrame 0.09), ale CELOWO DWA RAZY WOLNIEJ. Kaczka ma `crushDmg: 9999`
     * i kasuje wszystko, czego dotknie; dzis ratuje wrogow tylko to, ze lata na oslep.
     * Przy szybkim naprowadzaniu 7 s lotu zamienia sie w kasowanie mapy. Ta stala jest
     * jedynym pokretlem, gdyby playtest pokazal, ze dalej za mocna.
     */
    steerLerpPerFrame: 0.045,
    /** Poza tym dystansem kaczka nie szuka celu i leci jak dotad (zygzak + odbicia). */
    seekRange: 900,
    crushRadius: 55,        // kontakt = miazga (sim 1:1)
    crushDmg: 9999,         // insta (sim killEnemy) — boss tez oberwie konkretnie? NIE: patrz mult
    bossDmgMult: 0.1,       // boss dostaje 999/kontakt (nie insta — bossfight zostaje)
    wobbleRate: 0.15,       // machanie (sim wob 9/s)
    quackEveryFrames: 50,   // v2: KWACZE CALY CZAS (~co 0.83s), nie tylko przy odbiciach
};

export const LOCKER_CONFIG = {
    spawnDist: 120,         // przed lufa (sim 1:1)
    durationFrames: 600,    // v2 (Mariusz): 10s (+2s) dostaw
    fireEveryFrames: 33,    // v2: co 0.55s (+25% paczek/s; sim 0.7s)
    range: 460,             // zasieg mozdzierza (sim 1:1)
    parcelFlightFrames: 43, // v2: lot 20% szybszy (sim 0.9s -> ~0.72s)
    arcHeight: 120,         // wysokosc luku (px) — 2.5D: cien zostaje na ziemi
    blastRadius: 70,        // AoE ladowania (sim 1:1)
    blastDmg: 450,          // solidna paczka
};

export const DISCO_CONFIG = {
    durationFrames: 360,    // v2 (Mariusz): 6s imprezy (+2s vs sim 4s)
    spinPerFrame: 0.13,     // wirowanie wrogow (sim 8 rad/s)
    noteEveryFrames: 20,    // ♪ nad losowym tancerzem (PIXI.Text drogi — throttle!)
    danceDmgMult: 0.8,      // v2: kto tanczyl, bije 20% slabiej DO KONCA MECZU (zmeczony!)
};

export const GRANNY_CONFIG = {
    durationFrames: 300,    // 5s opieki (sim 1:1)
    followLerpPerFrame: 0.05, // babcia drepcze za graczem (sim 3/s)
    sideOffset: 44,         // trzyma sie boku czolgu (sim 1:1)
    healPerSecPct: 0.05,    // 5% maxHp/s (sim: 5hp/s przy 100hp)
    fearRadius: 460,        // v0.146.0: 360 -> 460 (prosba o wiekszy efekt razenia)
    fearBoostPerFrame: 4.0, // v0.146.0: 3.2 -> 4.0. Dodatkowy odrzut uciekajacych (musza byc SZYBSI od gracza —
                            //     inaczej taran w plecy = niechciana strata HP)
    fearFadeFrames: 120,    // v3 (Mariusz): strach GASNIE 2s po odejsciu babci — bez tego
                            //     wrogowie w te pedy zawracaja na gracza i karza go za moc
    sayEveryFrames: 72,     // "A SIO!"/"ZUPA!" co 1.2s (sim 1:1)
};

export const BURP_CONFIG = {
    knockRadius: 320,       // zasieg fali (sim 1:1)
    knockBase: 3,           // px/klatka bazowego odrzutu (sim 180 px/s)...
    knockScale: 8.7,        //   + skladnik rosnacy ku srodkowi (sim 520 px/s)
    knockDecay: 0.92,       // tlumienie odrzutu per klatka (sim -5x/s)
    stunMs: 1000,           // 1s ogluszenia (reuse enemy.freeze — mechanicznie identyczne)
    ringRadii: [90, 160, 240, 320] as readonly number[], // 4 fale (sim 1:1)
    /**
     * v0.146.0 — BEK ZADAJE OBRAZENIA (prosba z playtestu; do v0.145.0 byl czystym
     * odrzutem + ogluszeniem).
     *
     * DLACZEGO 250, A NIE 500 JAK MINA: mina ma promien 110 px i jednym trafieniem
     * kasuje zwyklego wroga. Bek ma 320 px, czyli obszar prawie DZIEWIEC RAZY wiekszy —
     * ta sama wartosc zamienilaby go w kasowanie calego ekranu jednym przyciskiem.
     * 250 zmieksza tlum i dobija rannych, a robote nadal robi odrzut i strach.
     */
    blastDmg: 250,
    /** Strach po becie — wrogowie odjezdzaja i przez ten czas nie wracaja. */
    fearMs: 2000,
    /**
     * Chmura „nieswiezego oddechu".
     *
     * v0.146.2 (Mariusz): chmura ma byc INTENSYWNIEJSZA i zyc DLUZEJ. Cykl jest teraz
     * trzyczesciowy, zamiast jednego zaniku rozciagnietego na cale zycie:
     *   0,0-1,6 s  `cloudExpandMs`  — kleby wychodza ze srodka i pecznieja,
     *   do 5,0 s   `cloudMs`        — chmura STOI w pelnej sile,
     *   ostatnie 3,0 s `cloudFadeMs` — stopniowe rozwianie (nachodzi na faze stania).
     * Czyli: pelna sila przez 2 s, potem 3 s gasniecia; lacznie 5 s widocznosci.
     */
    cloudMs: 5000,
    cloudFadeMs: 3000,
    cloudExpandMs: 1600,
    /** Parametr ROZRZUTU klebow, nie widoczna krawedz (v0.146.3: 320 -> 400 = +25%). */
    cloudRadius: 400,
    /** v0.146.2: bylo 0x9ae66e (blada zielen) — teraz nasycony, „chemiczny" odcien. */
    cloudColor: 0x74e03c,
    /** Krycie pojedynczego kleba u szczytu (v0.146.2: bylo 0.52). */
    cloudAlpha: 0.72,

    /*
     * v0.146.3 — CHMURA ZADAJE OBRAZENIA (prosba Mariusza: „powoduje obrazenia, jak
     * wrog tam wjedzie"). Tylko WROGOWIE — gracz nie obrywa od wlasnego beku.
     *
     * STREFA JEST ELIPSA, NIE KOLEM. Kleby maja splaszczenie 0.78 i dryfuja w pionie
     * tylko na 0.72 dystansu (widok z gory), wiec narysowana chmura jest szersza niz
     * wyzsza. Ponizsze polosie ZMIERZYLEM z faktycznego artu (prog alpha 0.10, wiek
     * 1,6-2,5 s): poziomo ~215 px, pionowo ~150 px przy cloudRadius 400. Kolo bylo by
     * klamstwem w jedna albo w druga strone — a Czytelnosc mowi: hitbox = wizual.
     */
    cloudHitX: 215,
    cloudHitY: 150,
    /** Tick co 0,5 s — chmura to teren skazony, nie druga eksplozja. */
    cloudTickFrames: 30,
    /**
     * 60 dmg/tick = 120 dmg/s. Zwykly wrog (300 HP) ginie po ~2,5 s stania w srodku;
     * boss (3000 HP) zbiera przez cale zycie chmury ~500, czyli chip, nie egzekucja.
     * UWAGA BALANS: sam wybuch daje juz 250, wiec zwykly wrog, ktory zostanie w srodku,
     * dobija sie pierwszym tickiem. Ratuje go odrzut — fala wyrzuca go na 320 px, czyli
     * POZA elipse chmury. Karane jest wracanie, nie samo oberwanie bekiem.
     */
    cloudTickDmg: 60,
    /**
     * Ponizej tego krycia chmura przestaje razic. Bez tego wrogowie ginelyby od gazu,
     * ktorego juz praktycznie nie widac — a to jest dokladnie ten rodzaj „zginal
     * z niczego", ktory ta gra ma zakazany.
     */
    cloudDmgMinAlpha: 0.2,
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
        // v0.137.0: 480 (8s) -> 360 (6s). Playtest Michala: przy 8 s nietykalnosci
        // tarcza przestawala byc ratunkiem, a stawala sie darmowym oknem na TARANOWANIE
        // (kolizja z wrogiem to trade HP <-> score, a tarcza kasowala koszt tego trade'u).
        // UWAGA przy kolejnym tuningu: liczba sekund siedzi TAKZE w `power.aura.desc`
        // (pl.ts + en.ts) — zmiana tylko tutaj zostawia klamstwo na karcie mocy.
        durationFrames: 360,     // 6s
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
    // ── F7b-5: MINY — "moc jazdy" (sim: MINY! jedz!): przez 7s czolg zostawia miny
    //    co 75px drogi; kazda z zegarem 5s. Fire-and-forget (okno + miny = wlasny stan). ──
    mines: {
        id: 'mines',
        name: 'Miny',
        labelKey: 'power.mines',
        emoji: '💥',
        color: 0xff5252,
        cooldownMs: 30000,       // sim 14s = demo; okno 7s + zegary 5s = dluga wartosc pola
        durationFrames: 0,       // instant activation — okno zyje wlasnym timerem w systemie
        unlockAtTrophies: 560,   // Akt I (Tier 1 = 9 mocy, decyzja Mariusza 2026-08-07);
                                 // milestone 560 nosi marchewke road.unlock.mines
        onActivate: (ctx) => {
            ctx.system.minesActivate(ctx.player);
            ctx.hud.addNotif(t('hud.minesStart'), '#ff5252');
            ctx.audio.playSuperActivate('mines');
            return { activated: true, powerId: 'mines' };
        },
    },
    // ── F7b-6: BUILDER — druga "moc jazdy" (sim: BUILDER! jedz!): przez 4s czolg
    //    zostawia za soba segmenty MURU (worki) co 30px; kazdy segment to PELNOPRAWNY
    //    collider (gracz+wrogowie+pociski obu stron) zyjacy 8s. Jedyna moc dotykajaca
    //    fizyki swiata — collidery wstawia/usuwa main.ts przez wallSpawner (konstruktor). ──
    build: {
        id: 'build',
        name: 'Mur',
        labelKey: 'power.build',
        emoji: '🧱',
        color: 0xe6b566,
        cooldownMs: 30000,       // sim 14s = demo; zapora 8s zycia = duza wartosc obronna
        durationFrames: 0,       // instant activation — okno zyje wlasnym timerem w systemie
        unlockAtTrophies: 1000,  // Akt II (Tier 1 = 9 mocy); milestone 1000 nosi marchewke
        onActivate: (ctx) => {
            ctx.system.buildActivate(ctx.player);
            ctx.hud.addNotif(t('hud.buildStart'), '#e6b566');
            ctx.audio.playSuperActivate('build');
            return { activated: true, powerId: 'build' };
        },
    },
    // ═══ TIER 2 PREMIUM (v0.111.0) — wszystkie fire-and-forget (wlasne timery) ═══
    strike: {
        id: 'strike',
        name: 'Nalot',
        labelKey: 'power.strike',
        emoji: '🛸',
        color: 0x9fd0ff,
        cooldownMs: 30000,       // sim 16s = demo
        durationFrames: 0,
        unlockAtTrophies: 2500,  // PROWIZORYCZNE — Tier 2 wchodzi transzami sezonowymi
        onActivate: (ctx) => {
            ctx.system.strikeLaunch(ctx.player.x, ctx.player.y, ctx.player.turretAngle);
            ctx.hud.addNotif(t('hud.strikeStart'), '#9fd0ff');
            ctx.audio.playSuperActivate('strike');
            return { activated: true, powerId: 'strike' };
        },
    },
    hole: {
        id: 'hole',
        name: 'Dziura',
        labelKey: 'power.hole',
        emoji: '🕳️',
        color: 0xa78bfa,
        cooldownMs: 30000,       // sim 16s = demo
        durationFrames: 0,
        unlockAtTrophies: 3000,  // PROWIZORYCZNE
        onActivate: (ctx) => {
            ctx.system.holeSpawn(ctx.player.x, ctx.player.y, ctx.player.turretAngle);
            ctx.hud.addNotif(t('hud.holeStart'), '#a78bfa');
            ctx.audio.playSuperActivate('hole');
            return { activated: true, powerId: 'hole' };
        },
    },
    laser: {
        id: 'laser',
        name: 'Laser',
        labelKey: 'power.laser',
        emoji: '🔦',
        color: 0xff6bcb,
        cooldownMs: 30000,       // sim 16s = demo
        durationFrames: 0,
        unlockAtTrophies: 3500,  // PROWIZORYCZNE
        onActivate: (ctx) => {
            ctx.system.laserActivate(ctx.player.x, ctx.player.y);
            ctx.hud.addNotif(t('hud.laserStart'), '#ff6bcb');
            ctx.audio.playSuperActivate('laser');
            return { activated: true, powerId: 'laser' };
        },
    },
    // ═══ TIER 3 / FUN (v0.112.0) — pula slotu 🎲, art z Tier3Baker (gradienty) ═══
    // v0.119.0 (decyzja Mariusza): PONG przeniesiony z Tier 2 do puli FUN —
    // dostep WYLACZNIE przez kostke; unlockAtTrophies bez znaczenia dla kostki.
    pong: {
        id: 'pong',
        name: 'Ping-Pong',
        labelKey: 'power.pong',
        emoji: '🏓',
        // v0.146.1: bylo 0xffe066 — 4 stopnie hue od Aury (0xffdd00). Dwa zlote pierscienie
        // na czolgu to jedna moc dla oka gracza. Pomarancz pileczki rozdziela je od razu.
        color: PONG_CONFIG.color,
        cooldownMs: 30000,       // sim 14s = demo
        durationFrames: 0,
        unlockAtTrophies: 8500,  // PROWIZORYCZNE — docelowo slot 🎲
        onActivate: (ctx) => {
            ctx.system.pongActivate();
            ctx.hud.addNotif(t('hud.pongStart'), '#ff7a1a');
            ctx.audio.playSuperActivate('pong');
            // v0.146.1 — SERW: fala + wstrzas. Aura ma sam wstrzas, wiec rozchodzacy sie
            // pierscien jest tym, co odroznia start Ping-Ponga juz w pierwszej klatce.
            ctx.effects.spawnShockwaveRing(ctx.player.x, ctx.player.y, PONG_CONFIG.deflectRadius * 2.4, PONG_CONFIG.color);
            ctx.effects.shake(5, 7);
            return { activated: true, powerId: 'pong' };
        },
    },
    duck: {
        id: 'duck',
        name: 'Kaczka',
        labelKey: 'power.duck',
        emoji: '🦆',
        color: 0xffd93b,
        cooldownMs: 30000,       // sim 18s = demo
        durationFrames: 0,
        unlockAtTrophies: 6000,  // PROWIZORYCZNE — docelowo slot 🎲
        onActivate: (ctx) => {
            ctx.system.duckLaunch(ctx.player.x, ctx.player.y);
            ctx.hud.addNotif(t('hud.duckStart'), '#ffd93b');
            ctx.audio.playSuperActivate('duck');
            return { activated: true, powerId: 'duck' };
        },
    },
    locker: {
        id: 'locker',
        name: 'Paczkomat',
        labelKey: 'power.locker',
        emoji: '📦',
        color: 0xf2b705,
        cooldownMs: 30000,       // sim 18s = demo
        durationFrames: 0,
        unlockAtTrophies: 6500,  // PROWIZORYCZNE
        onActivate: (ctx) => {
            ctx.system.lockerSpawn(ctx.player.x, ctx.player.y, ctx.player.turretAngle);
            ctx.hud.addNotif(t('hud.lockerStart'), '#f2b705');
            ctx.audio.playSuperActivate('locker');
            return { activated: true, powerId: 'locker' };
        },
    },
    disco: {
        id: 'disco',
        name: 'Disco',
        labelKey: 'power.disco',
        emoji: '🪩',
        color: 0xff7ce0,
        cooldownMs: 30000,       // sim 16s = demo
        durationFrames: 0,
        unlockAtTrophies: 7000,  // PROWIZORYCZNE
        onActivate: (ctx) => {
            ctx.system.discoActivate();
            ctx.hud.addNotif(t('hud.discoStart'), '#ff7ce0');
            ctx.audio.playSuperActivate('disco');
            return { activated: true, powerId: 'disco' };
        },
    },
    granny: {
        id: 'granny',
        name: 'Babcia',
        labelKey: 'power.granny',
        emoji: '👵',
        color: 0xe8a0bf,
        cooldownMs: 30000,       // sim 18s = demo
        durationFrames: 0,
        unlockAtTrophies: 7500,  // PROWIZORYCZNE
        onActivate: (ctx) => {
            ctx.system.grannySpawn(ctx.player);
            ctx.hud.addNotif(t('hud.grannyStart'), '#e8a0bf');
            ctx.audio.playSuperActivate('granny');
            return { activated: true, powerId: 'granny' };
        },
    },
    burp: {
        id: 'burp',
        name: 'Mega Beka',
        labelKey: 'power.burp',
        emoji: '📢',
        color: 0x9ae66e,
        cooldownMs: 30000,       // sim 14s = demo
        durationFrames: 0,
        unlockAtTrophies: 8000,  // PROWIZORYCZNE
        onActivate: (ctx) => {
            ctx.system.burpBlast(ctx.player.x, ctx.player.y, ctx.enemies);
            // 4 rozchodzace sie fale (sim 1:1) — sensoryka MEGA beki
            // v0.146.0: kolor podany JAWNIE. `spawnShockwaveRing` ma domyslny fiolet
            // (0x9b59d0), wiec fale beku byly fioletowe mimo zielonego koloru mocy —
            // gracz nie mial jak powiazac efektu z ikona.
            for (const r of BURP_CONFIG.ringRadii) {
                ctx.effects.spawnShockwaveRing(ctx.player.x, ctx.player.y, r, BURP_CONFIG.cloudColor);
            }
            ctx.hud.addNotif(t('hud.burpStart'), '#9ae66e');
            ctx.audio.playSuperActivate('burp');
            ctx.effects.shake(12, 12);
            return { activated: true, powerId: 'burp' };
        },
    },
};

/**
 * Tier 3 szalone — pula slotu 🎲 (v0.114.0). JEDNO zrodlo prawdy: POWER_ORDER
 * bierze tail przez spread, a roll kostki losuje z tej listy (ignoruje progi
 * trofeow T3 — slot 🎲 JEST mechanizmem dostepu; progi 6000+ to placeholdery).
 * UWAGA: gdyby ALLOWED_POWERS kiedys zawezil scenariusz, pule kostki trzeba
 * przeciac z macierza (dzis wszystko null = pelna pula).
 */
// v0.119.0: +pong (z Tier 2) => 6 fun mocy; pong "najmniej szalony" otwiera pule.
export const TIER3_POWERS: readonly PowerId[] = ['pong', 'duck', 'locker', 'disco', 'granny', 'burp'];

/** Cooldown slotu 🎲 — rowny cooldownowi kazdej mocy T3 (wszystkie 30000ms). */
export const DICE_COOLDOWN_MS = 30000;

/** Animacja rolla kostki (~1.3s @60fps): ikony mocy migaja, po niej moc odpala SAMA. */
export const DICE_ROLL_FRAMES = 78;

export const DICE_EMOJI = '🎲';

/** Kolejnosc wyswietlania (GARAZ picker) + inicjalizacja cooldownow. */
export const POWER_ORDER: readonly PowerId[] = [
    'aura', 'megaBomb', 'freeze', 'rockets', 'mines', 'repair', 'build', 'tower', 'ghost',
    'strike', 'hole', 'laser',         // Tier 2 premium (pong -> FUN w v0.119.0)
    ...TIER3_POWERS,                   // Tier 3 / FUN (pula 🎲, w tym pong)
];

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
    loadout: LoadoutTriple,
    scenario: ScenarioId,
    owned: readonly PowerId[],
    remapped?: { value: boolean },
): [PowerId, PowerId, PowerId] {
    const allowed = ALLOWED_POWERS[scenario] ?? null;
    // v0.114.0: Tier 3 (szalone) NIE wchodza do loadoutu — dostep do nich MA TYLKO
    // kostka 🎲 (decyzja Mariusza: rownoczesnie w slocie i w puli = bez sensu).
    const pool = (allowed ?? POWER_ORDER).filter(id =>
        !!getPowerDef(id) && owned.includes(id) && !TIER3_POWERS.includes(id));
    // Awaryjnie (uszkodzony stan: owned puste) — trojka bazowa, zeby mecz ZAWSZE mial moce.
    const safePool: readonly PowerId[] = pool.length > 0 ? pool : ['aura', 'megaBomb', 'freeze'];
    const taken = new Set<PowerId>();
    const out: PowerId[] = [];
    // Przebieg 1: zaakceptuj poprawne, niepowtarzajace sie wybory gracza.
    for (let i = 0; i < 3; i++) {
        const id = loadout[i];
        out[i] = (!!id && safePool.includes(id) && !taken.has(id)) ? id : (null as unknown as PowerId);
        if (out[i]) taken.add(out[i]);
    }
    // Przebieg 2: dopelnij dziury pierwsza wolna moca z puli (gracz NIGDY nie wchodzi
    // w mecz z pustym przyciskiem). Pula moze byc mniejsza niz 3 => dopuszczamy powtorke
    // dopiero gdy brak unikatow (skrajny uszkodzony stan).
    for (let i = 0; i < 3; i++) {
        if (out[i]) continue;
        const fill = safePool.find(id => !taken.has(id)) ?? safePool[i % safePool.length];
        out[i] = fill;
        taken.add(fill);
    }
    if (remapped && (out[0] !== loadout[0] || out[1] !== loadout[1] || out[2] !== loadout[2])) {
        remapped.value = true;
    }
    return [out[0], out[1], out[2]];
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
