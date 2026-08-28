import * as PIXI from 'pixi.js';
import type { SeasonContentDef, SeasonItemDef } from '../../config/seasonContent';

/**
 * SeasonPickup — sezonowa znajdzka (Season Kit, warstwa 1).
 *
 * Kontrakt zachowania 1:1 z `Gem`, bo main.ts obsluguje pickupy jedna petla:
 * `active`, `update(delta, playerX, playerY)`, `radius`, pooling przez `reset()`.
 * Roznice wobec gema sa CELOWE i wynikaja z roli:
 *  - znajdzka NIE jest przyciagana magnesem — magnes to narzedzie do zbierania
 *    zasobu, a to jest nagroda za pojscie w konkretne miejsce (gdyby leciala do
 *    gracza, znikalaby decyzja "wchodze czy nie", czyli caly sens trzech rzadkosci);
 *  - ma wlasny licznik zycia: po TTL_MS znika i wraca gdzie indziej, zeby mapa nie
 *    zamienila sie w magazyn nieodebranych ksiazek.
 *
 * BUDOWA: kontener z trzema warstwami — cien (na ziemi, NIE buja sie), poswiata
 * w kolorze rzadkosci (pulsuje) i sama ksiazka (lewituje). Rozdzielenie cienia od
 * ksiazki jest calym trikiem lewitacji: gdyby cien bujal sie razem z nia, przedmiot
 * czytalby sie jako lezacy i drgajacy, a nie unoszacy.
 *
 * ART: PNG zamiast wektorow — wyjatek od Konstytucji §10, uzasadniony w
 * docs/season-kit/contracts/s3.md (wektory byly za malo czytelne na mapie).
 * Poswiata i cien sa proceduralne: dwie wspoldzielone tekstury (biale, tintowane
 * per rzadkosc), wiec caly zestaw to 3 PNG + 2 male tekstury na cala mape.
 */

const FLOAT_AMP = 2.6;          // amplituda lewitacji (px)
const ROT_SPEED = 0.004;
/** Znajdzka lezy do 25 s, potem znika i respawnuje sie gdzie indziej. */
const TTL_MS = 25_000;
/** Ostatnie 4 s miga, zeby znikniecie nie bylo "oszustwem" (Czytelnosc). */
const BLINK_MS = 4_000;
/**
 * Zrodlowe PNG maja 100x100 (kontrakt s3). Uzywamy STALEJ, a nie
 * `texture.width` — patrz applySize().
 */
const SRC_PX = 100;
/**
 * Cien wzgledem szerokosci ksiazki. Stale, bo te same liczby sa uzywane w dwoch
 * miejscach (applyDef ustawia rozmiar bazowy, update go oddycha) — rozjechanie
 * ich dawaloby skok rozmiaru w pierwszej klatce po spawnie.
 * Powiekszony na prosbe Mariusza (26.08): przy 0.92 czytal sie jak plamka, a nie
 * jak cien rzucany przez unoszacy sie przedmiot.
 */
const SHADOW_W = 1.40;
const SHADOW_H = 0.64;
const SHADOW_Y = 0.50;
/** Krycie cienia u samej ziemi. Podbite z 0.42 (Mariusz: "bardziej wyrazisty cien"). */
const SHADOW_ALPHA = 0.55;
/** Poswiata wzgledem szerokosci ksiazki. Podbita z 1.9 o 10% na prosbe Mariusza. */
const GLOW_SCALE = 2.1;

const TEX_CACHE = new Map<number, PIXI.Texture>();
let glowTex: PIXI.Texture | null = null;
let shadowTex: PIXI.Texture | null = null;

function getTexture(def: SeasonItemDef): PIXI.Texture {
    const hit = TEX_CACHE.get(def.value);
    if (hit) return hit;
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    const tex = PIXI.Texture.from(`${base}${def.asset}`);
    TEX_CACHE.set(def.value, tex);
    return tex;
}

/** Miekka poswiata: biale kolo z gradientem do zera, tintowane kolorem rzadkosci. */
function getGlowTexture(): PIXI.Texture {
    if (glowTex) return glowTex;
    const R = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = R * 2;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(R, R, 0, R, R, R);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(R, R, R, 0, Math.PI * 2); c.fill();
    glowTex = PIXI.Texture.from(cv);
    return glowTex;
}

/** Cien kontaktowy: rozmyta elipsa. Tintowana na ciemno przez sprite. */
function getShadowTexture(): PIXI.Texture {
    if (shadowTex) return shadowTex;
    const W = 96, H = 48;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.save(); c.translate(W / 2, H / 2); c.scale(1, H / W);
    c.beginPath(); c.arc(0, 0, W / 2, 0, Math.PI * 2); c.fill();
    c.restore();
    shadowTex = PIXI.Texture.from(cv);
    return shadowTex;
}

export class SeasonPickup {
    public x: number;
    public y: number;
    public active: boolean = true;
    public radius: number;
    /** Wartosc 1..6 = punkty za sztuke = numer przedmiotu w regulach. */
    public value: number;

    private container: PIXI.Container;
    private book: PIXI.Sprite;
    private glow: PIXI.Sprite;
    private shadow: PIXI.Sprite;

    private bornAt: number;
    private phase: number;
    private size: number;

    constructor(x: number, y: number, item: SeasonItemDef, content: SeasonContentDef, worldContainer: PIXI.Container) {
        this.x = x;
        this.y = y;
        this.radius = content.radius;
        this.value = item.value;
        this.size = content.size;
        this.bornAt = Date.now();
        this.phase = Math.random() * Math.PI * 2;

        // WSZYSTKIE obiekty wyswietlane w PIERWSZYM bloku konstruktora (E1)
        this.container = new PIXI.Container();
        this.shadow = new PIXI.Sprite(getShadowTexture());
        this.glow = new PIXI.Sprite(getGlowTexture());
        this.book = new PIXI.Sprite(getTexture(item));

        this.shadow.anchor.set(0.5);
        this.shadow.tint = 0x1b1208;
        this.glow.anchor.set(0.5);
        this.glow.blendMode = PIXI.BLEND_MODES.NORMAL;   // bez screen/add — regula fill-rate
        this.book.anchor.set(0.5);

        this.container.addChild(this.shadow);
        this.container.addChild(this.glow);
        this.container.addChild(this.book);
        worldContainer.addChild(this.container);

        this.applyDef(item, content);
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + 3;
    }

    /**
     * Rozmiary warstw. Skala ksiazki liczona ze STALEJ SRC_PX, nie z
     * `texture.width` — i to jest tu najwazniejsza linijka.
     *
     * `PIXI.Texture.from(url)` zwraca teksture NIEZALADOWANA o szerokosci 1 px.
     * Liczenie `def.size / texture.width` dawalo wtedy skale 34, a gdy prawdziwe
     * 100x100 doczytalo sie z sieci, sprite renderowal sie jako 3400 px i zaslanial
     * pol ekranu (zgloszenie Mariusza 26.08 + zrzuty). Fallback `|| 100` nie ratowal,
     * bo 1 jest wartoscia prawdziwa. Stala z kontraktu jest odporna na wyscig
     * z siecia; gdyby ktos podmienil plik na inna rozdzielczosc, bramka G3 i tak
     * pilnuje kontraktu, a tu zmienia sie jedna stala.
     */
    private applyDef(item: SeasonItemDef, content: SeasonContentDef): void {
        this.size = content.size;
        this.radius = content.radius;
        this.book.texture = getTexture(item);
        this.book.scale.set(content.size / SRC_PX);

        // poswiata ~1.9x ksiazki: widoczna, ale wciaz maly sprite (fill-rate)
        const glowPx = content.size * GLOW_SCALE;
        this.glow.width = glowPx;
        this.glow.height = glowPx;
        this.glow.tint = item.glow;

        // cien na ziemi, lekko ponizej srodka i splaszczony
        this.shadow.width = content.size * SHADOW_W;
        this.shadow.height = content.size * SHADOW_H;
        this.shadow.y = content.size * SHADOW_Y;
    }

    /** Pooling (wzorzec Gem): obiekt wraca do puli i jest wznawiany w nowym miejscu. */
    public reset(x: number, y: number, item: SeasonItemDef, content: SeasonContentDef): void {
        this.x = x; this.y = y;
        this.value = item.value;
        this.bornAt = Date.now();
        this.phase = Math.random() * Math.PI * 2;
        this.active = true;
        this.applyDef(item, content);
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y + 3;
        this.container.alpha = 1;
        this.container.visible = true;
    }

    /**
     * Sygnatura jak w Gem, zeby main.ts trzymal jedna petle pickupow.
     * playerX/playerY sa nieuzywane CELOWO: znajdzka nie leci do gracza
     * (patrz naglowek klasy) — parametry zostaja dla zgodnosci kontraktu.
     */
    public update(delta: number, _playerX: number, _playerY: number): void {
        if (!this.active) return;

        const age = Date.now() - this.bornAt;
        if (age >= TTL_MS) { this.despawn(); return; }

        const t = Date.now() / 260;
        const bob = Math.sin(t + this.phase);

        // KSIAZKA sie unosi, CIEN zostaje na ziemi — to jest cala lewitacja.
        // Cien dodatkowo kurczy sie i jasnieje, gdy przedmiot jest wyzej.
        this.book.y = bob * FLOAT_AMP;
        this.book.rotation += ROT_SPEED * delta;
        const lift = (bob + 1) * 0.5;                    // 0..1
        const shrink = 1 - lift * 0.16;
        this.shadow.width = this.size * SHADOW_W * shrink;
        this.shadow.height = this.size * SHADOW_H * shrink;
        this.shadow.alpha = SHADOW_ALPHA - lift * 0.12;

        // poswiata oddycha nieznacznie w kontrze do lewitacji
        this.glow.alpha = 0.30 + 0.12 * (1 - lift);
        this.glow.y = this.book.y * 0.6;

        // ostatnie sekundy: miganie. Bez tego znajdzka znikalaby "bez powodu",
        // a to jest dokladnie ten rodzaj niesprawiedliwosci, ktorego zabrania F1.
        const left = TTL_MS - age;
        this.container.alpha = left < BLINK_MS
            ? 0.35 + 0.65 * Math.abs(Math.sin(left / 90))
            : 1;
    }

    /** Zebrana albo wygasla — main.ts zwraca ja do puli. */
    public despawn(): void {
        this.active = false;
        this.container.visible = false;
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
