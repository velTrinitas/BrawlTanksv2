/**
 * gameIcons.ts — v0.131.0. JEDNO zrodlo ikon, ktore maja odpowiednik w assetach gry.
 *
 * POWOD POWSTANIA (zgloszenie Mariusza: „adresujemy czytelnosc i spojnosc"). Hub
 * pokazywal emoji systemowe tam, gdzie gra ma wlasna grafike — gracz widzial inny
 * gem w rozkazach niz ten, ktory zbiera na mapie, i inna skrzynke niz ta, ktora
 * otwiera w Garazu. Do tego to samo emoji `📦` znaczylo DWIE ROZNE rzeczy naraz:
 * kostke mocy (quest `m_cube`) i skrzynke z lupem (nagroda za komplet). Emoji sa
 * dodatkowo bitmapowe, wiec przy powiekszeniu pikseluja.
 *
 * Kazda ikona jest tu RAZ. Wczesniej `ProfileSection` i `main.ts` mialy wlasne,
 * lokalne kopie tych samych <img> — i to jest dokladnie ta droga, na ktorej rozmiary
 * i sciezki sie rozjezdzaja.
 */

const BASE = import.meta.env.BASE_URL;

/** Wspolny renderer: kwadratowy <img> o zadanym boku, wyrownany do linii tekstu. */
function icon(src: string, px: number, extraClass = ''): string {
    return `<img class="bt-gameicon ${extraClass}" src="${BASE}${src}" alt="" draggable="false"
        style="width:${px}px;height:${px}px;">`;
}

/** Skrzynka z lupem — ten sam art, ktory spada i otwiera sie w CrateOverlay. */
export function crateIcon(px = 18): string {
    return icon('assets/items/crate_closed_512.png', px);
}

/**
 * Gem — ten sam, ktory gracz zbiera na mapie (nie emoji 💎, czyli niebieski brylant).
 *
 * Klasa `--gem` powieksza go transformem o 35%: plik ma szeroka POSWIATE, wiec sam
 * krysztal zajmuje ~55% kadru i obok emoji tej samej wysokosci czytal sie jak drobinka.
 * Transform, a NIE wieksze px — inaczej ikona rozpychalaby staly slot 28 px w karcie
 * rozkazu. Ten sam problem i to samo lekarstwo co w kaflu gemow w profilu.
 */
export function gemIcon(px = 22): string {
    return icon('assets/gem.png', px, 'bt-gameicon--gem');
}

/**
 * Kostka mocy. Quest liczy OBA typy (dmg + hp), a ikona musi byc jedna — bierzemy
 * dmg, bo czerwona kostka czyta sie mocniej na ciemnym tle niz niebieska.
 */
export function cubeIcon(px = 22): string {
    return icon('assets/items/powercube_dmg_100.png', px);
}

/**
 * BOSS — ten sam fioletowy czolg, ktorego gracz realnie ubija na mapie.
 *
 * v0.148.0 (zgloszenie Mariusza): rozkaz „Pokonaj bossow" mial emoji 👹 (ogr), ktore
 * na wiekszosci systemow renderuje sie jako fioletowy demon — czyli obiekt, ktory
 * w tej grze NIE ISTNIEJE. Endcard rozwiazal dokladnie ten sam problem juz w v0.125.0,
 * podmieniajac 👑 na ten plik; rozkazy zostaly z emoji przez przeoczenie.
 */
export function bossIcon(px = 22): string {
    return icon('assets/sprites/boss_100.png', px);
}

/** Sigma (waluta). Klasa `.bt-sigma` niesie juz rozmiar i cien — px sluzy nadpisaniu. */
export function sigmaIcon(px = 15): string {
    return icon('assets/sigma.png', px, 'bt-sigma');
}

/**
 * STOS SKRZYNEK dla kafla sklepu (zgloszenie Mariusza: „jak piszemy 3 crates, to zrob
 * obrazek z 3 crates"). Liczba skrzynek odpowiada zawartosci paczki, ale ZATRZYMUJE SIE
 * NA TRZECH: dziesiec skrzynek w kaflu ~110 px to plama, w ktorej nie policzysz zadnej.
 * Trzy czytaja sie jako „wiecej niz jedna", a dokladna liczba i tak stoi w nazwie
 * towaru — Czytelnosc wygrywa z doslownoscia.
 *
 * Uklad: skrzynki lekko przesuniete i pomniejszone w glab, wiec czytaja sie jak stos,
 * a nie jak trzy naklejki obok siebie.
 */
export function crateStack(count: number): string {
    const n = Math.max(1, Math.min(3, Math.floor(count)));
    // Pojedyncza skrzynka idzie na PELNYM rozmiarze — nie ma przed czym ustepowac.
    // Przy dwoch i trzech wszystkie maleja i ROZSUWAJA sie na boki. Pierwsza wersja
    // ustawiala je jedna za druga w glab i przednia zaslaniala reszte tak, ze paczka
    // po trzy wygladala na kaflu identycznie jak pojedyncza — czyli liczba, ktora
    // miala byc widoczna, nie byla widoczna wcale.
    const layouts: Record<number, Array<{ x: number; y: number; s: number; z: number }>> = {
        1: [{ x: 0, y: 0, s: 1, z: 3 }],
        2: [{ x: -20, y: -8, s: 0.7, z: 2 }, { x: 16, y: 10, s: 0.78, z: 3 }],
        3: [
            { x: -30, y: -12, s: 0.6, z: 1 },  // lewa w tyle
            { x: 30, y: -12, s: 0.6, z: 2 },   // prawa w tyle
            { x: 0, y: 14, s: 0.72, z: 3 },    // przednia, nizej i wieksza
        ],
    };
    const html = layouts[n].map(l => `
        <img class="bt-cratestack-i" src="${BASE}assets/items/crate_closed_512.png"
             alt="" draggable="false" loading="lazy"
             style="transform:translate(${l.x}%,${l.y}%) scale(${l.s});z-index:${l.z};">`).join('');
    return `<span class="bt-cratestack" aria-hidden="true">${html}</span>`;
}

/**
 * Token `img:<nazwa>` z configu -> HTML ikony. Config trzyma NAZWE, nie sciezke:
 * dzieki temu `quests.ts` nie wie nic o katalogach ani o rozmiarach, a podmiana
 * pliku jest zmiana w jednym miejscu tutaj.
 * Zwraca `null`, gdy token nieznany — wolajacy renderuje wtedy zwykle emoji.
 */
export function iconFromToken(token: string, px: number): string | null {
    if (!token.startsWith('img:')) return null;
    switch (token.slice(4)) {
        case 'gem': return gemIcon(px);
        case 'cube': return cubeIcon(px);
        case 'crate': return crateIcon(px);
        case 'boss': return bossIcon(px);
        default: return null;
    }
}
