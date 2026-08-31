/**
 * cullGate.ts — v0.132.0. Jedno zrodlo matematyki viewport-cullingu propow.
 *
 * POWOD. Bramka cullingu istniala juz w Tropikach (`CornField`/`LettuceField`/
 * `PastureField`, v0.68.0), ale jako SKOPIOWANY blok w kazdym polu. Pustynia
 * potrzebuje jej w dziesieciu miejscach naraz — dziesiata kopia tej samej nierownosci
 * to gwarancja, ze przy pierwszej korekcie marginesu polowa propow zostanie ze starym.
 *
 * KONTRAKT WYWOLANIA. Parametry kamery sa OPCJONALNE w kazdym propie, ktory z tego
 * korzysta: brak argumentow = zachowanie sprzed cullingu (wszystko sie animuje).
 * Dzieki temu prop dziala tak samo, gdy zawola go stara sciezka bez kamery, i nie
 * trzeba przepisywac wszystkich wywolan naraz.
 *
 * MARGINES. Liczony w jednostkach SWIATA, nie ekranu. Przy zoomie 0.7 na telefonie
 * `viewW = screenW / 0.7`, czyli 667 px ekranu to ~953 px swiata. Domyslne 300 px
 * zapasu z kazdej strony daje ~1/3 szerokosci kadru na wjechanie w animacje, zanim
 * gracz ja zobaczy — przy najszybszym czolgu (Zwiad 7.5) to ponad pol sekundy.
 * Tropiki uzywaly 140 px, ale tam bramkowane byly DUZE pola (AABB liczony z ich
 * wlasnej szerokosci), a tutaj czesto bramkujemy POJEDYNCZE punkty.
 */

/** Domyslny zapas poza kadrem (jednostki swiata). */
export const CULL_MARGIN = 300;

/**
 * Czy PUNKT jest w kadrze (z marginesem). Dla propow, ktore maja jedna pozycje —
 * quicksand, oaza, pojedyncza trzcina, ryba.
 *
 * `radius` dokladamy do marginesu dla obiektow, ktore rysuja sie WOKOL swojego
 * punktu (np. oaza o promieniu 200 px musi zostac widoczna, gdy jej srodek jest juz
 * za krawiedzia, ale sadzawka nadal wchodzi w kadr).
 */
export function isPointInView(
    x: number, y: number,
    camX: number, camY: number, viewW: number, viewH: number,
    radius = 0, margin = CULL_MARGIN,
): boolean {
    const m = margin + radius;
    return x >= camX - m && x <= camX + viewW + m
        && y >= camY - m && y <= camY + viewH + m;
}

/**
 * Czy PROSTOKAT przecina kadr (z marginesem). Dla propow o realnej rozpietosci —
 * piramida, sfinks, skala, krawedz bordera.
 */
export function isBoxInView(
    x: number, y: number, w: number, h: number,
    camX: number, camY: number, viewW: number, viewH: number,
    margin = CULL_MARGIN,
): boolean {
    return !(x + w < camX - margin || x > camX + viewW + margin
          || y + h < camY - margin || y > camY + viewH + margin);
}
