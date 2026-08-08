# Wieża MG (super moc) — kod wyglądu do upgrade'u przez AD

Stan: v0.105.0 · źródło: `src/systems/PowerSystem.ts` (sekcja F7b-2) · silnik: **PixiJS v7.4.3**

## Co to jest

Rozstawiana super moc: wieżyczka MG stawiana w miejscu gracza, żyje 8 s, sama celuje
i strzela (10 strz./s). Spada z nieba (0,18 s), ląduje z przysiadem + kurzem + wstrząsem,
w ostatnich 1,5 s mruga (telegraf zniknięcia). Referencja feelingu: prototyp
`docs/prototypes/BT_SuperPowers_Sim_v6.html` (funkcja `drawTower`, kolor mocy #4dd7c8).

## Twarde ograniczenia (nienegocjowalne)

1. **All-programmatic art** — wyłącznie `PIXI.Graphics` (zero PNG/SVG; wyjątek w całej grze: gem.png).
2. **Rysowane RAZ przy spawnie, potem TYLKO transformy** (rotation/x/y/alpha/scale).
   Zero `clear()`+redraw per klatka — to zabija mobile (lekcja F4.1).
3. **Zero screen-blend, god-rays, wielkich glow / gradientów alpha** — fill-rate na
   Androidzie (A54) to ship-blocker. Cień = zwykła elipsa z alpha.
4. **Kotwica bryły = punkt gruntu (0,0)**, bryła rośnie w −y. To kontrakt: animacja
   zrzutu, przysiad (scale od gruntu) i Y-sort (`zIndex = y`) na tym stoją.
5. **`TOWER_TOP_LIFT` (wysokość platformy lufy) jest używany przez CELOWANIE** —
   pociski startują z pivotu lufy (y − 36). Można zmienić wartość, ale musi zostać
   jedną stałą, z której korzysta i rysunek, i logika.
6. Lufa siedzi w kontenerze `wrap` ze `scale.y = 0.8` — obrót dziecka zatacza elipsę
   (tania perspektywa 2,5D). Pełny angle-bake (jak czołgi, `TankSpriteBaker`) to
   dozwolony kierunek upgrade'u, ale wtedy trzeba zachować ten sam pivot i odrzut.
7. Czytelność @375 px przy zoom 0.6–0.7: detale muszą przetrwać pomniejszenie.
   Kolor-sygnatura mocy: **teal 0x4dd7c8** (przycisk, tracery, LED).

## Kierunki upgrade'u z backlogu (wpis Notion „Dopracować wygląd Wieży MG")

nity/antena/obrotowy radar-blip · łuski przy ogniu (sim je miał) · pulsujący glow LED
(mały!) · pełny angle-bake lufy · dramatyczniejszy zrzut. Do tego wszystko, co AD uzna —
w ramach ograniczeń wyżej.

---

## Kod 1:1 z gry

### Stałe wizualne (`PowerSystem.ts`, góra pliku)

```ts
const TOWER_TOP_LIFT = 36;      // px — wysokosc platformy lufy nad gruntem (2.5D bryla)
const TOWER_TILT_Y = 0.8;       // scale.y wrapa lufy — obrot zatacza elipse (perspektywa)
const TOWER_DROP_FRAMES = 11;   // ~0.18s spadania (sync z whoosh w super_tower.wav)
const TOWER_DROP_HEIGHT = 110;  // px — z jakiej wysokosci bryla spada
const TOWER_SQUASH_FRAMES = 6;  // przysiad po ladowaniu (squash & stretch)
```

### Rysowanie (raz, przy spawnie) — cień, bryła, lufa

```ts
// CIEN — elipsa na gruncie; zostaje na ziemi gdy bryla spada (rosnie/ciemnieje).
const shadow = new PIXI.Graphics();
shadow.beginFill(0x000000, 0.30);
shadow.drawEllipse(0, 4, 26, 11);
shadow.endFill();

// BRYLA — cokol + kolumna 2.5D (jasny front / ciemny prawy bok = kierunek
// swiatla jak budynki) + blue-camo z sim + tealowy pasek LED (kolor mocy).
const body = new PIXI.Graphics();
// cokol (szeroki, niski)
body.beginFill(0x2b333b);
body.drawRoundedRect(-21, -4, 42, 18, 5);
body.endFill();
body.beginFill(0x39434d);
body.drawRoundedRect(-21, -8, 42, 8, 3);   // gorna plyta cokolu
body.endFill();
// kolumna — front
body.beginFill(0x39434d);
body.drawRect(-14, -TOWER_TOP_LIFT, 24, TOWER_TOP_LIFT - 6);
body.endFill();
// kolumna — prawy bok (ciemniejszy = bryla, nie plaska naklejka)
body.beginFill(0x252d34);
body.drawRect(10, -TOWER_TOP_LIFT, 5, TOWER_TOP_LIFT - 6);
body.endFill();
// linie paneli (czytaja sie jako segmenty konstrukcji)
body.beginFill(0x2b333b);
body.drawRect(-14, -TOWER_TOP_LIFT + 9, 29, 1.5);
body.drawRect(-14, -TOWER_TOP_LIFT + 19, 29, 1.5);
body.endFill();
// blue-camo na kolumnie (paleta 1:1 z sim)
body.beginFill(0x2980b9);
body.drawCircle(-6, -TOWER_TOP_LIFT + 13, 5);
body.endFill();
body.beginFill(0x1a5276);
body.drawCircle(4, -TOWER_TOP_LIFT + 22, 4);
body.endFill();
body.beginFill(0x5dade2);
body.drawCircle(-2, -TOWER_TOP_LIFT + 27, 3);
body.endFill();
// tealowy pasek LED — sygnatura mocy (kolor 0x4dd7c8 jak przycisk/tracery)
body.beginFill(0x4dd7c8, 0.9);
body.drawRect(-14, -TOWER_TOP_LIFT + 4, 24, 2);
body.endFill();
// platforma szczytowa (podstawa lufy)
body.beginFill(0x454f5a);
body.drawRoundedRect(-17, -TOWER_TOP_LIFT - 7, 34, 10, 4);
body.endFill();
body.beginFill(0x556270);
body.drawRoundedRect(-17, -TOWER_TOP_LIFT - 9, 34, 5, 3);  // rant platformy
body.endFill();

// WRAP lufy — scale.y=TILT: obrot dziecka zatacza ELIPSE = tania perspektywa
// (pelny angle-bake jak czolgi to opcja polish; elipsa czyta sie dobrze).
const wrap = new PIXI.Container();
wrap.scale.y = TOWER_TILT_Y;
const turret = new PIXI.Graphics();
turret.beginFill(0x1a5276);
turret.drawRect(8, -6, 26, 4.5);   // podwojna lufa MG (1:1 sim)
turret.drawRect(8, 1.5, 26, 4.5);
turret.endFill();
turret.beginFill(0x2980b9);
turret.drawCircle(0, 0, 11);
turret.endFill();
turret.lineStyle(3, 0x12405e);
turret.drawCircle(0, 0, 11);
turret.lineStyle(0);
turret.beginFill(0x5dade2, 0.8);   // blik na kopule
turret.drawCircle(-3, -3, 3);
turret.endFill();
wrap.addChild(turret);
```

Pozycjonowanie: `shadow` na (x, y) z `zIndex = y - 1`; `body` na x z `zIndex = y`;
`wrap` na x z `zIndex = y + 2`; wysokości (`body.y`, `wrap.y`) ustawia animacja zrzutu.

### Animacja zrzutu (per klatka, tylko transformy)

```ts
const p = 1 - this.towerDropLeft / TOWER_DROP_FRAMES;      // 0 start -> 1 ziemia
const offset = -TOWER_DROP_HEIGHT * (1 - p) * (1 - p);     // kwadratowo = przyspiesza
body.y = this.towerY + offset;
wrap.y = this.towerY - TOWER_TOP_LIFT + offset;
shadow.scale.set(0.55 + 0.45 * p);                          // cien rosnie pod spadajaca bryla
shadow.alpha = 0.35 + 0.65 * p;
```

Lądowanie: przysiad `body.scale.set(1 + 0.12*q, 1 - 0.15*q)` (q: 1→0 przez 6 klatek),
kurz `effects.spawnTowerDeployDust(x, y)`, wstrząs `effects.shake(6, 8)`.

### Transformy w locie (per klatka)

```ts
// obrot + odrzut wzdluz -lufy (lokalnie w wrapie, TILT robi wrap) + mruganie przed koncem
turret.rotation = this.towerAngle;
const rec = this.towerHeat * 2.5;                 // heat: 1 po strzale, gasnie ~0.13/klatke
turret.x = -Math.cos(this.towerAngle) * rec;
turret.y = -Math.sin(this.towerAngle) * rec;
const alpha = this.towerFramesLeft < 90           // ostatnie 1.5s
    ? 0.35 + 0.55 * Math.abs(Math.sin(Date.now() / 90))
    : 1;
body.alpha = alpha; wrap.alpha = alpha; shadow.alpha = alpha;
```

Muzzle flash przy strzale: `effects.spawnMuzzleFlash(mx, my, angle)` z puli cząstek
(wylot = pivot + `barrelLen 34` wzdłuż kąta).

## Jak oddać upgrade

Najwygodniej: podmieniony blok rysowania (cień/bryła/lufa) + ewentualnie nowe stałe.
Jeśli dojdą nowe animowane elementy — każdy jako osobny obiekt animowany transformami,
z zaznaczeniem, co ma się dziać per klatka. Integrację do `PowerSystem.ts` robi Claude.
