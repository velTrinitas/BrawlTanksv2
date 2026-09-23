/**
 * nickGenerator.ts — DOMYSLNY PSEUDONIM przy pierwszym uruchomieniu gry (v0.203.0).
 *
 * PO CO: do v0.202.0 pole nicku bylo puste, a jedyna podpowiedz to imie wybranego
 * awatara — 9 wartosci na cala baze graczy, czyli kolizja gwarantowana. Dziecko
 * dostawalo „Pseudonim zajety" jako PIERWSZA interakcje z gra. Generator zdejmuje
 * z gracza obowiazek wymyslania czegokolwiek: pole jest wypelnione od wejscia,
 * a skasowanie go wraca do recznego wpisywania.
 *
 * TWARDE OGRANICZENIE (src/types/Profile.ts): nick to WYLACZNIE [a-zA-Z0-9], 2-16
 * znakow. Bez spacji, bez myslnikow, BEZ POLSKICH DIAKRYTYKOW. Dlatego polskie slowa
 * sa tu zapisane bez ogonkow („Jez", nie „Jez" z kropka) — to nie niechlujstwo, tylko
 * jedyny ksztalt, ktory przechodzi `isValidNickname`. Tego predykatu NIE WOLNO
 * rozluzniac: `ProfileService.loadProfiles()` DROPUJE profile, ktore go nie przechodza.
 *
 * FILTR WULGARYZMOW: `isCleanNickname` blokuje m.in. `jeb`, `pierd`, `ass` jako
 * PODCIAG w dowolnym miejscu. Zlozenie dwoch niewinnych slow potrafi wiec trafic na
 * blokade (klasyk: cokolwiek + „Klassa"). Dlatego kazdy kandydat idzie przez oba
 * predykaty, a nie „bo przeciez slowa sa grzeczne".
 *
 * LOSOWOSC: `Math.random()` jest tu POPRAWNY. To kosmetyka menu, nie symulacja —
 * patrz kontrakt strumieni w `src/systems/Rng.ts` (worldRng/ambientRng dotycza
 * wylacznie rozgrywki). Nick nie wchodzi do `runLogicStep` i nie ma prawa zjadac
 * losowan ze strumienia swiata.
 */

import { isValidNickname, NICKNAME_MAX_LENGTH, type LanguageId } from '../types/Profile';
import { isCleanNickname } from './nickFilter';

/**
 * Ton: smiesznie i cieplo, poziom 9-latka — „Turbo Jez", nie „Mroczny Zabojca".
 * Kazde slowo zaczyna sie wielka litera, bo skladamy je w CamelCase (jedyny sposob
 * na czytelna granice slow bez spacji i podkreslen).
 *
 * Dlugosci sa celowo krotkie: para musi zmiescic sie w 16 znakach RAZEM z opcjonalna
 * liczba, inaczej kandydat wypada i marnujemy probe.
 */
const PL_ADJ = [
    'Turbo', 'Dzielny', 'Szybki', 'Gruby', 'Maly', 'Wielki', 'Zloty', 'Srebrny',
    'Dziki', 'Sprytny', 'Wesoly', 'Glodny', 'Spiacy', 'Kosmiczny', 'Ognisty', 'Lodowy',
    'Chrupki', 'Pyszny', 'Mokry', 'Puszysty', 'Skaczacy', 'Krecony', 'Zwinny', 'Twardy',
    'Nocny', 'Burzowy', 'Gorski', 'Lesny', 'Stalowy', 'Betonowy', 'Gumowy', 'Neonowy',
    'Pikselowy', 'Rakietowy', 'Atomowy', 'Magnetyczny', 'Dymny', 'Iskrzacy', 'Grzmiacy', 'Pedzacy',
] as const;

const PL_NOUN = [
    'Jez', 'Borsuk', 'Bobr', 'Lis', 'Ryjowka', 'Chomik', 'Kret', 'Wydra',
    'Gofr', 'Nalesnik', 'Pierog', 'Burak', 'Ogorek', 'Rzodkiewka', 'Kalafior', 'Ziemniak',
    'Czajnik', 'Guzik', 'Sprezyna', 'Trybik', 'Magnes', 'Sruba', 'Mlotek', 'Kompas',
    'Czolg', 'Traktor', 'Kombajn', 'Wozek', 'Balon', 'Latawiec', 'Bumerang', 'Perkusja',
    'Komandor', 'Kapitan', 'Zwiadowca', 'Mechanik', 'Kucharz', 'Listonosz', 'Pilot', 'Nurek',
] as const;

const EN_ADJ = [
    'Turbo', 'Brave', 'Speedy', 'Chunky', 'Tiny', 'Giant', 'Golden', 'Silver',
    'Wild', 'Clever', 'Happy', 'Hungry', 'Sleepy', 'Cosmic', 'Fiery', 'Frosty',
    'Crispy', 'Tasty', 'Soggy', 'Fluffy', 'Bouncy', 'Curly', 'Nimble', 'Sturdy',
    'Nightly', 'Stormy', 'Rocky', 'Foggy', 'Steely', 'Rubber', 'Neon', 'Pixel',
    'Rocket', 'Atomic', 'Magnetic', 'Smoky', 'Sparky', 'Thunder', 'Zooming', 'Jumbo',
] as const;

const EN_NOUN = [
    'Hedgehog', 'Badger', 'Beaver', 'Fox', 'Hamster', 'Mole', 'Otter', 'Puffin',
    'Waffle', 'Pancake', 'Dumpling', 'Beetroot', 'Pickle', 'Radish', 'Muffin', 'Potato',
    'Kettle', 'Button', 'Spring', 'Cogwheel', 'Magnet', 'Bolt', 'Hammer', 'Compass',
    'Tank', 'Tractor', 'Harvester', 'Trolley', 'Balloon', 'Kite', 'Boomerang', 'Drummer',
    'Commander', 'Captain', 'Scout', 'Mechanic', 'Chef', 'Postman', 'Pilot', 'Diver',
] as const;

function pick<T>(list: readonly T[]): T {
    return list[Math.floor(Math.random() * list.length)]!;
}

/**
 * Fallback, gdy 20 prob nie dalo czystego kandydata (w praktyce nieosiagalne przy
 * 1600 kombinacjach na jezyk, ale pole nicku NIE MOZE zostac puste — to jedyny
 * ekran, z ktorego gracz nie wyjdzie bez poprawnej wartosci).
 */
function fallbackNickname(): string {
    return `Gracz${100 + Math.floor(Math.random() * 900)}`;
}

/**
 * Zlozenie pojedynczego kandydata. Liczba na koncu (2-99) wchodzi w ~60% przypadkow:
 * bez niej kolizje przy 1600 kombinacjach pojawilyby sie juz przy kilkuset graczach,
 * z nia przestrzen rosnie do ~150 tys. Dolaczamy ja TYLKO, gdy miesci sie w limicie —
 * skracanie nicku, zeby wcisnac cyfry, dalo by ucięte slowo i brzydki wynik.
 */
function buildCandidate(adj: readonly string[], noun: readonly string[]): string {
    const base = `${pick(adj)}${pick(noun)}`;
    // Para dluzsza niz limit jest ODRZUCANA, nie obcinana. Obcinanie dawalo „kikuty"
    // w rodzaju „NeonowyRzodkiewk" / „PikselowyMechani" — nick ma byc smieszny,
    // a nie wygladac na blad zapisu. Petla w generateNickname po prostu losuje dalej.
    if (base.length > NICKNAME_MAX_LENGTH) return '';
    if (Math.random() < 0.6) {
        const suffix = String(2 + Math.floor(Math.random() * 98));
        if (base.length + suffix.length <= NICKNAME_MAX_LENGTH) return base + suffix;
    }
    return base;
}

/**
 * Losuje pseudonim w jezyku gracza. Wynik ZAWSZE przechodzi `isValidNickname`
 * i `isCleanNickname` — wolajacy nie musi nic walidowac.
 */
export function generateNickname(lang: LanguageId): string {
    const adj = lang === 'en' ? EN_ADJ : PL_ADJ;
    const noun = lang === 'en' ? EN_NOUN : PL_NOUN;
    for (let i = 0; i < 20; i++) {
        const candidate = buildCandidate(adj, noun);
        if (isValidNickname(candidate) && isCleanNickname(candidate)) return candidate;
    }
    return fallbackNickname();
}

/**
 * `count` ROZNYCH propozycji — uzywane po bledzie „pseudonim zajety", zeby gracz
 * wychodzil z bledu tapem, a nie wymyslaniem. Limit petli chroni przed zakleszczeniem,
 * gdyby pula kiedys zmalala ponizej `count`.
 */
export function generateNicknames(lang: LanguageId, count: number): string[] {
    const out = new Set<string>();
    for (let i = 0; i < count * 20 && out.size < count; i++) out.add(generateNickname(lang));
    return [...out];
}
