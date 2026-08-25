# BRIEF DLA ART DIRECTORA — `UfoAbductor.ts` (Brawl Tanks S2, mapa MARS)

## Kontekst w 5 zdaniach
Top-down arena shooter dla graczy **9-12 lat**, komercyjny (Steam + App Store + Google Play
przez Capacitor/PWA). Silnik: **PixiJS v7.4.3 + TypeScript strict**, render 2.5D (rzut
izometryczny "z gory pod katem"). UFO to **gwiazda mapy Mars**: krazy po niebie, namierza
wroga/skrzynie, telegrafuje, spuszcza traktor-beam, porywa i upuszcza. **Gracz NIGDY nie jest
celem** — UFO to chaotyczna pomoc, nie zagrozenie. Ma HP 10 000 (praktycznie pomnik), a po 5
trafieniach eskaluje i zaczyna odpowiadac ogniem. Po 3 "posilkach" ladujue przy stacji paliw,
wychodzi z niego ufoludek-pilot, tankuje ~10 s i odlatuje.

**Zadanie: podkrecic juiciness wygladu UFO, ufoludka, beamu, cienia i swiatel — bez lamania
zasad nizej.**

---

## 1. ZERO ZEWNETRZNYCH ASSETOW (twarde)
Caly art w grze jest **proceduralny**: `PIXI.Graphics` + Canvas 2D. Zero PNG/SVG/spritesheetow,
zero nowych zaleznosci (bundle musi zostac maly pod Capacitor/PWA). Jesli chcesz teksture
(szum, gradient, scratche na kadlubie) — **wygeneruj ja w kodzie** do offscreen canvas /
`RenderTexture` i uzyj jako sprite. Nie dolaczaj plikow graficznych.

## 2. BAKE > PER-FRAME (najwazniejsza zasada wydajnosci)
Regula: **wszystko co sie nie zmienia — pieczemy RAZ**; per-frame zostaje tylko to, co
naprawde animowane.

- Statyczna geometria (kadlub, kopula, panele, nity, korpus ufoludka) → narysowac raz w
  konstruktorze / w bakerze i trzymac jako **sprite z `RenderTexture`**, potem tylko
  `rotation` / `scale` / `alpha` / `tint`.
- Obecny stan pliku: `drawBody()` jest juz pieczony raz (konstruktor). Per-frame lecą
  `drawShadow / drawLights / drawBeam / drawAlien / drawShield` — kazdy z `clear()` i pelnym
  przerysowaniem. **To jest budzet, ktory juz wydalismy.** Nie dokladaj kolejnych per-frame
  `clear()+redraw`. Jesli chcesz bogatszego ufoludka albo bogatszy kadlub — zrob **klatki
  pieczone** (np. 6-12 klatek animacji jako tekstury) i przelaczaj `sprite.texture`, zamiast
  rysowac wektory co klatke.
- 2.5D: obiekty obracane w poziomie pieczemy **w N katach** (jak czolgi: `ENEMY_BAKE_ANGLES`
  36/24) i wybieramy klatke. Nie licz obrotu wektorowo per-frame.
- Jesli obracasz kontener z przesunieta zawartoscia — uzyj `pivot.set()` + `position.set()` z
  **tym samym offsetem**, inaczej art "odkleja sie" od korpusu.

## 3. MOBILE-FIRST — fill-rate zabija, nie liczba obiektow
Gra realnie chodzi na Androidzie (target: Samsung A54) i **nie wolno tego zregresowac**.

- **Zakazane:** god rays, wielkie glow, `screen`/`add` blend na duzych powierzchniach,
  pelnoekranowe gradienty alpha, ciezkie filtry (`BlurFilter`, `GlowFilter`) na duzych
  obiektach. Beam swietlny robimy **geometria + alpha**, nie blurem.
- Kazdy nowy ciezki efekt musi miec **wariant tanszy / prog jakosci**, zeby dalo sie go zbic
  na slabszym sprzecie bez psucia calosci.
- Particles: **twardy limit** liczby (podaj liczbe w komentarzu). Pooling, nie `new` co klatke.
- Widok mobilny to **zoom 0.7** i ekran **375 px** — wszystko musi byc czytelne pomniejszone.
  Detal ponizej ~2 px w tym zoomie to zmarnowany budzet.
- Przy kazdej propozycji **napisz koszt mobilny** (S/A/B/C albo jednym zdaniem: ile draw calls,
  ile particli, czy dochodzi per-frame redraw).

## 4. HIERARCHIA WARTOSCI: CZYTELNOSC > SENSORYKA > FLEX
1. **Czytelnosc** — gracz nigdy nie moze poczuc sie oszukany. Musi byc oczywiste: co jest
   grozne, co bezpieczne, skad przyszedl strzal. **Hitbox = to co narysowane.** Jesli
   powiekszysz kadlub wizualnie, hitbox sie NIE zmienia sam — zglos to.
   - Telegraf jest swiety: pierscien na ziemi przed beamem, eskalacja koloru
     zolty→bursztyn→pomaranczowy→czerwony (5 poziomow, stale `THREAT_COLORS`), finalny blysk
     przed pierwszym strzalem. **Mozesz to wzmocnic, nie wolno tego osłabic ani skrocic.**
   - Uwaga na **falszywy afordans**: iskierki/blyski przy krawedziach czytaja sie u 9-latka
     jako "pickup, podejdz". Nie dawaj "chodz tu" sygnalow na rzeczach nieinteraktywnych.
2. **Sensoryka** — wszystko ma chrupac, blyskac, reagowac. Animacje **DRAMATYCZNE**, nie
   subtelne (nie +/-5% skali i +/-3 px bujania — przyciśnij mocniej). Brak reakcji na
   interakcje = bug.
3. **Flex** — epicki moment (porwanie, zestrzelenie UFO, drop 60 gemow) ma byc glosno
   potwierdzony.

## 5. CIENIE I WARSTWY (2.5D)
- Cien jest **osobnym obiektem na ziemi** (`gfxShadow`), nie czescia kadluba — leci pod UFO i
  **skaluje sie z wysokoscia** (`altitude`): wysoko = maly, ciemniejszy rdzen mniejszy,
  bardziej rozmyty krawedziowo; nisko = wiekszy i mocniejszy. To glowny czytelny sygnal
  "gdzie ono jest" — nie zabijaj go, mozesz go wzbogacic (miekka penumbra rysowana
  koncentrycznymi elipsami o malejacej alfie, TANIE; blur filter — NIE).
- Kolejnosc rysowania: **`container.zIndex = y + offset`** (Y-sorting). Obiekty latajace
  (UFO, hologramy) ida na osobny kontener zawsze-na-wierzchu; cien zostaje w warstwie ziemi.
  Jesli dokladasz nowy element — powiedz, do ktorej warstwy nalezy.
- Swiatlo w scenie pada z gory-lewej; highlighty i cienie na kadlubie maja byc spojne z
  reszta mapy Mars (rdzawe, zimny kontrast metalu na cieplym pyle).

## 6. STYL
Cartoon **high-detail**, nie photoreal. Grube, czytelne sylwetki; mocne kontury; kolor niesie
informacje (grozny = ciepla czerwien, spokojny = chlodny cyjan/zielen). Klimat mapy musi
zostac spojny — Mars: rdza, pyl, sci-fi retro; zadnych anachronizmow.

## 7. TWARDE ZASADY KODU (zeby plik wrocil dzialajacy)
- **TypeScript strict.** Wszystkie pola `PIXI.Graphics` / `Sprite` **zainicjalizowane w
  PIERWSZYM bloku konstruktora**, przed jakimkolwiek `drawX()`. TS nie zlapie
  "typed-but-uninitialized" — to bedzie crash w runtime.
- **NIE ruszaj publicznego kontraktu klasy** — `update(delta, enemies, cargo, playerX, playerY)`,
  `isAbducted(enemy)`, `UfoTick / UfoAbductEvent`, maszyna stanow
  `cruise | lock | devour | toStation | grounded | takeoff`. `main.ts` na tym stoi.
  Zmiany czysto wizualne: nowe metody `drawX`, nowe stale kolorow, nowe pola prywatne — OK.
- **Nie zmieniaj balansu bez zapowiedzi**: `UFO_HP`, `PROVOKE_HITS`, `GEM_DROP`, `RESPAWN_MS`,
  `PLASMA_DMG`, interwaly strzalow. Jesli uwazasz, ze wizual wymaga innego timingu — napisz to
  w komentarzu, nie zmieniaj po cichu.
- **Kod i komentarze po angielsku, bez polskich znakow.** Stringi widoczne dla gracza tylko
  przez `t('klucz')` z literalnym kluczem (dynamiczne `t(zmienna)` sie nie kompiluje).
- `try/catch` moze byc, ale **zawsze loguj `error.stack` + kontekst** — zero cichego polykania
  bledow.
- Przed oddaniem: `tsc --noEmit` musi przejsc.

## 8. FORMAT ZWROTKI
- **Caly plik `UfoAbductor.ts`** (kompletny replacement), nie diff w kawalkach.
- Do tego krotka notka: (a) co zmieniles wizualnie, (b) **koszt mobilny** kazdej zmiany,
  (c) co ewentualnie wymaga zmiany w `main.ts` lub w hitboxie, (d) czego celowo NIE zrobiles i
  dlaczego.
- Jesli cos jest ryzykowne dla FPS — **daj flage / prog jakosci**, zeby dalo sie wylaczyc bez
  ruszania reszty.

## 9. CZEGO NIE ROBIMY
Nie dodajemy bibliotek. Nie dodajemy assetow. Nie skracamy telegrafow. Nie robimy gracza celem
UFO. Nie zamieniamy pieczonego artu na per-frame wektory. Nie ratujemy "ladniej" kosztem
czytelnosci na 375 px.
