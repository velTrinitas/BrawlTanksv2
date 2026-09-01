/**
 * season_check.mjs — STRAZNIK SEZONU. Bramki G0-G7 dla Season Kitu.
 *
 * Run: node tools/season_check.mjs
 * Exit 0 = PASS, exit 1 = FAIL (nadaje sie do CI / pre-push).
 *
 * Po co (brief Mariusza, 2026-08-25): "czego nie chce, by to byla tylko zmiana
 * liczby z season 2 > 3 i grafiki - to ma byc cos ekstra". Ta zasada jest nie do
 * wyegzekwowania w code review po fakcie, wiec zostaje zamieniona w bramke G0,
 * ktora potrafi powiedziec NIE.
 *
 * Wzorzec: tools/mars_m1_layout.mjs — ponumerowane bramki, raport PASS/FAIL,
 * zero zaleznosci. Roznica: tamten GENERUJE dane, ten tylko WERYFIKUJE istniejace.
 *
 * DLACZEGO PARSOWANIE TEKSTU, A NIE IMPORT:
 * `season.ts` i pliki i18n to TypeScript — Node nie zaladuje ich bez loadera, a
 * dokladanie zaleznosci pod jeden skrypt kontrolny jest gorsze niz regex. Kazde
 * nieudane parsowanie konczy sie FAIL, NIGDY cichym przejsciem: gdyby ktos
 * przeformatowal `season.ts`, straznik ma krzyknac, a nie zamilknac.
 *
 * CZEGO TEN SKRYPT NIE SPRAWDZI (uczciwa granica):
 * kompletnosc, spojnosc i brak szkod w UI - tak. Czy sezon budzi zachwyt - NIE.
 * Tego nie da sie zmierzyc i lepiej tego nie udawac, bo dostaniemy sezony, ktore
 * przechodza wszystkie bramki i sa nudne.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = {
    season: join(ROOT, 'src/config/season.ts'),
    pl: join(ROOT, 'src/i18n/translations/pl.ts'),
    en: join(ROOT, 'src/i18n/translations/en.ts'),
    art: join(ROOT, 'public/seasons'),
    contracts: join(ROOT, 'docs/season-kit/contracts'),
};

const errors = [];
const warns = [];
const fail = (g, msg) => errors.push(`${g} ${msg}`);
const warn = (g, msg) => warns.push(`${g} ${msg}`);

// ── Kontrakt artu (zrodlo: docs/season-kit/SEASON_CONTRACT.md + public/seasons/README.md)
// DWA dozwolone formaty, bo hero renderuje sie w kolumnie obok tekstu:
//  - PION 9:16 (preferowany, np. s3 572x1024) — wypelnia kolumne bez przyciecia,
//  - PANORAMA ~2.2:1 (legacy, np. s2 1024x434) — przycinana do kolumny od gory.
// Kwadrat i posrednie proporcje sa ODRZUCANE: w waskiej kolumnie wygladaja jak blad,
// a nie jak decyzja. Wolna amerykanka w proporcjach = kazdy sezon inny popup.
const ART_SHAPES = [
    { name: 'pion 9:16', min: 0.50, max: 0.72 },
    { name: 'panorama', min: 2.00, max: 2.60 },
];
const ART_MAX_KB = 250;
const ART_MIN_LONG = 900;       // dluzszy bok; mniej = widoczna miekkosc na desktopie

// ── PACZKA SEZONU (SEASON_ENGINE.md §1) — public/seasons/<id>/
// Nowy sezon = katalog o tej samej strukturze, zero zmian w kodzie. Bramka ma zlapac
// niekompletna paczke ZANIM zrobi to gracz: brakujacy item = dziura w kolekcji,
// ktorej nie da sie ukonczyc, czyli zepsuty sezon.
const PACK_ITEMS = 6;
const PACK_ITEM_PX = 128;
const PACK_ITEM_MAX_KB = 30;

// ── Budzety tekstu. Zmierzone na obecnym rosterze (PL name max 28, bullet max 55)
// i podniesione o zapas. Pill pokazuje `id.toUpperCase()`, wiec ID tez ma budzet.
const NAME_MAX = 34;
const BULLET_MAX = 64;
const ID_MAX = 4;

// ── Waluty dozwolone w nagrodach progow (istniejaca ekonomia — zero nowej waluty)
const ALLOWED_REWARDS = new Set(['bolts', 'crates', 'threshold']);

/**
 * Od kiedy obowiazuje Season Kit. Sezony STARTUJACE wczesniej sa LEGACY: powstaly,
 * zanim istnial kontrakt i bramki, wiec nie wymagamy od nich kontraktu ani artu
 * (s2 „Arena" jedzie na fallbacku gradient+emoji i tak bylo zaprojektowane).
 * Bramki spojnosci (G1/G2/G4/G5/G6) obowiazuja JE TAK SAMO — bo dotycza danych,
 * ktore istnieja niezaleznie od kitu, i to wlasnie tam wydarzyl sie incydent z id.
 * Nie retro-fitujemy dokumentow; retro-fitujemy poprawnosc.
 */
const KIT_SINCE = new Date('2026-09-01T00:00:00');
const isLegacy = (s) => new Date(s.start) < KIT_SINCE;

// ══════════════════════════════════════════════════════════════════
// Parsowanie zrodel
// ══════════════════════════════════════════════════════════════════

function read(path, label) {
    if (!existsSync(path)) { fail('G-IO', `brak pliku ${label}: ${path}`); return null; }
    return readFileSync(path, 'utf8');
}

/** Wyciaga wpisy SEASONS. Kazdy wpis MUSI miec id/start/end — inaczej FAIL. */
function parseSeasons(src) {
    const block = src.match(/export const SEASONS[^=]*=\s*\[([\s\S]*?)\n\];/);
    if (!block) { fail('G-IO', 'nie moge sparsowac SEASONS z season.ts (zmiana formatu?)'); return []; }
    const out = [];
    const re = /\{\s*id:\s*'([^']+)'\s*,\s*nameKey:\s*'([^']+)'[\s\S]*?start:\s*'([^']+)'\s*,\s*end:\s*'([^']+)'[\s\S]*?bulletKeys:\s*\[([^\]]*)\]/g;
    let m;
    while ((m = re.exec(block[1])) !== null) {
        out.push({
            id: m[1], nameKey: m[2], start: m[3], end: m[4],
            bulletKeys: [...m[5].matchAll(/'([^']+)'/g)].map(x => x[1]),
        });
    }
    if (out.length === 0) fail('G-IO', 'SEASONS sparsowane jako PUSTE — format wpisu sie zmienil');
    return out;
}

function parseMilestones(src) {
    const block = src.match(/export const SEASON_MILESTONES[^=]*=\s*\[([\s\S]*?)\n\];/);
    if (!block) { fail('G-IO', 'nie moge sparsowac SEASON_MILESTONES'); return []; }
    return [...block[1].matchAll(/\{([^}]*)\}/g)].map(m => {
        const o = {};
        for (const kv of m[1].matchAll(/(\w+)\s*:\s*(\d+)/g)) o[kv[1]] = Number(kv[2]);
        return o;
    });
}

/** Mapa klucz -> wartosc z pliku tlumaczen (tylko klucze sezonowe). */
function parseI18n(src) {
    const map = new Map();
    for (const m of src.matchAll(/'(season\.[^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) map.set(m[1], m[2]);
    return map;
}

/** Wymiary PNG z naglowka IHDR (szerokosc @16, wysokosc @20, big-endian). */
function pngSize(path) {
    const b = readFileSync(path);
    if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

/** Wymiary JPEG z naglowka SOF — bez zaleznosci (ten sam trik co przy s3.jpg). */
function jpegSize(path) {
    const b = readFileSync(path);
    let i = 2;
    while (i < b.length) {
        if (b[i] !== 0xFF) { i++; continue; }
        const marker = b[i + 1];
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
            return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), bytes: b.length };
        }
        i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
}

const seasonSrc = read(P.season, 'season.ts');
const plSrc = read(P.pl, 'pl.ts');
const enSrc = read(P.en, 'en.ts');
if (!seasonSrc || !plSrc || !enSrc) {
    console.log('=== SEASON CHECK ===');
    console.log(`FAIL — ${errors.length} bledow:`);
    for (const e of errors) console.log('  ' + e);
    process.exit(1);
}

const SEASONS = parseSeasons(seasonSrc);
const MILESTONES = parseMilestones(seasonSrc);
const PL = parseI18n(plSrc);
const EN = parseI18n(enSrc);

// ══════════════════════════════════════════════════════════════════
// G0 — sezon deklaruje MECHANIKE, nie tylko art i numer
// ══════════════════════════════════════════════════════════════════
// Kontrakt musi istniec i miec wypelniona sekcje MECHANIKA. "Wypelniona" znaczy:
// istnieje naglowek, pod nim jest tresc, i NIE jest to placeholder z szablonu.
const PLACEHOLDER = /\[(DO UZUPELNIENIA|TODO|PROPOZYCJA — decyzja Mariusza)\]/i;

function contractPath(id) { return join(P.contracts, `${id}.md`); }

for (const s of SEASONS) {
    if (isLegacy(s)) continue;   // sprzed kitu — patrz KIT_SINCE
    const cp = contractPath(s.id);
    if (!existsSync(cp)) {
        // Sezony przyszle (jeszcze nieprojektowane) to OSTRZEZENIE, nie blad —
        // inaczej straznik krzyczalby o 2027 rok przy kazdym uruchomieniu.
        const startsSoon = new Date(s.start) - Date.now() < 1000 * 60 * 60 * 24 * 45;
        if (startsSoon) fail('G0', `${s.id}: brak kontraktu ${cp} — sezon startuje za <45 dni`);
        else warn('G0', `${s.id}: brak kontraktu (start ${s.start.slice(0, 10)}) — do napisania przed pracami`);
        continue;
    }
    const body = readFileSync(cp, 'utf8');
    const mech = body.match(/##\s*MECHANIKA([\s\S]*?)(?=\n##\s|\n#\s|$)/i);
    if (!mech) { fail('G0', `${s.id}: kontrakt nie ma sekcji "## MECHANIKA"`); continue; }
    const text = mech[1].replace(/\s+/g, ' ').trim();
    if (text.length < 80) {
        fail('G0', `${s.id}: sekcja MECHANIKA pusta lub szczatkowa (${text.length} znakow) — sezon = sama skorka`);
    } else if (PLACEHOLDER.test(mech[1])) {
        fail('G0', `${s.id}: sekcja MECHANIKA zawiera nierozstrzygniety placeholder`);
    }
}

// ══════════════════════════════════════════════════════════════════
// G1 — daty stykaja sie: bez dziury i bez nakladki
// ══════════════════════════════════════════════════════════════════
const sorted = [...SEASONS].sort((a, b) => new Date(a.start) - new Date(b.start));
for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (new Date(s.end) <= new Date(s.start)) fail('G1', `${s.id}: end <= start`);
    const n = sorted[i + 1];
    if (!n) continue;
    const gapMs = new Date(n.start) - new Date(s.end);
    // sezony stykaja sie datami: koniec 31.08 23:59:59 -> start 01.09 00:00:00 = 1 s
    if (gapMs < 0) fail('G1', `${s.id} -> ${n.id}: NAKLADKA (${Math.round(-gapMs / 3600000)} h)`);
    else if (gapMs > 2000) fail('G1', `${s.id} -> ${n.id}: DZIURA w kalendarzu (${Math.round(gapMs / 3600000)} h bez sezonu)`);
}
if (sorted.length) {
    const last = sorted[sorted.length - 1];
    const daysLeft = (new Date(last.end) - Date.now()) / 86400000;
    if (daysLeft < 90) warn('G1', `roadmapa konczy sie za ${Math.round(daysLeft)} dni (${last.id}) — czas ja przedluzyc`);
}

// ══════════════════════════════════════════════════════════════════
// G2 — id nigdy nieuzyty ponownie (regresja po incydencie 2026-08-25/26)
// ══════════════════════════════════════════════════════════════════
// Przekorzystanie zwolnionego id dla INNEGO sezonu powoduje, ze stary postep
// z chmury (kolumna seasonId) wlewa sie do nowego sezonu, a seasonClaimed idzie
// unia i oznacza progi jako odebrane bez zdobycia. Mina odpala w dniu startu.
const idSeen = new Map();
for (const s of SEASONS) {
    if (idSeen.has(s.id)) fail('G2', `id '${s.id}' uzyty DWA RAZY (${idSeen.get(s.id)} i ${s.nameKey})`);
    idSeen.set(s.id, s.nameKey);
    if (s.id.length > ID_MAX) fail('G2', `id '${s.id}' dluzsze niz ${ID_MAX} znakow — pill pokazuje je graczowi jako ${s.id.toUpperCase()}`);
    if (!/^s\d+$/.test(s.id)) fail('G2', `id '${s.id}' lamie konwencje s<liczba>`);
    // nameKey MUSI wskazywac na wlasne id — inaczej ktos przenumerowal polowicznie
    if (s.nameKey !== `season.${s.id}.name`) {
        fail('G2', `${s.id}: nameKey '${s.nameKey}' nie pasuje do id — slad po przenumerowaniu`);
    }
    for (const bk of s.bulletKeys) {
        if (!bk.startsWith(`season.${s.id}.`)) fail('G2', `${s.id}: bulletKey '${bk}' nie pasuje do id`);
    }
}

// ══════════════════════════════════════════════════════════════════
// G3 — art sezonu: istnienie, proporcja, waga
// ══════════════════════════════════════════════════════════════════
for (const s of SEASONS) {
    // ── Paczka sezonu (nowy format). Gdy katalog istnieje, obowiazuje KOMPLETNOSC:
    // polowiczna paczka jest gorsza niz jej brak, bo silnik podlaczy sezon z dziura.
    const packDir = join(P.art, s.id);
    if (existsSync(packDir)) {
        for (let i = 1; i <= PACK_ITEMS; i++) {
            const ip = join(packDir, `item${i}.png`);
            if (!existsSync(ip)) { fail('G3', `${s.id}: paczka bez item${i}.png (wymagane ${PACK_ITEMS})`); continue; }
            const d = pngSize(ip);
            if (!d) { fail('G3', `${s.id}/item${i}.png: nie jest poprawnym PNG`); continue; }
            if (d.w !== PACK_ITEM_PX || d.h !== PACK_ITEM_PX) {
                fail('G3', `${s.id}/item${i}.png: ${d.w}x${d.h}, wymagane ${PACK_ITEM_PX}x${PACK_ITEM_PX}`);
            }
            if (d.bytes / 1024 > PACK_ITEM_MAX_KB) {
                fail('G3', `${s.id}/item${i}.png: ${(d.bytes / 1024).toFixed(0)} KB > ${PACK_ITEM_MAX_KB} KB`);
            }
        }
        for (const req of ['hero.jpg', 'decor.jpg']) {
            if (!existsSync(join(packDir, req))) fail('G3', `${s.id}: paczka bez ${req}`);
        }
        continue;   // paczka zastepuje legacy <id>.jpg
    }

    const p = join(P.art, `${s.id}.jpg`);
    const started = new Date(s.start) <= Date.now();
    const startsSoon = new Date(s.start) - Date.now() < 1000 * 60 * 60 * 24 * 14;
    if (!existsSync(p)) {
        // brak artu = cichy fallback (gradient + emoji), wiec to nie jest awaria —
        // ale sezon KITOWY, ktory juz trwa albo startuje za <14 dni, powinien go miec
        if (isLegacy(s)) warn('G3', `${s.id}: brak artu (legacy, jedzie na fallbacku gradient+emoji)`);
        else if (started || startsSoon) fail('G3', `${s.id}: brak ${s.id}.jpg, a sezon trwa lub startuje za <14 dni`);
        continue;
    }
    const dim = jpegSize(p);
    if (!dim) { fail('G3', `${s.id}.jpg: nie moge odczytac wymiarow (uszkodzony JPEG?)`); continue; }
    const kb = dim.bytes / 1024;
    const ratio = dim.w / dim.h;
    const longSide = Math.max(dim.w, dim.h);
    if (kb > ART_MAX_KB) fail('G3', `${s.id}.jpg: ${kb.toFixed(0)} KB > ${ART_MAX_KB} KB`);
    if (longSide < ART_MIN_LONG) fail('G3', `${s.id}.jpg: dluzszy bok ${longSide} < ${ART_MIN_LONG}`);
    const shape = ART_SHAPES.find(sh => ratio >= sh.min && ratio <= sh.max);
    if (!shape) {
        fail('G3', `${s.id}.jpg: proporcja ${ratio.toFixed(2)}:1 to ani pion (0.50-0.72) ani panorama (2.00-2.60)`);
    }
}

// ══════════════════════════════════════════════════════════════════
// G4 — komplet kluczy i18n w OBU jezykach
// ══════════════════════════════════════════════════════════════════
for (const s of SEASONS) {
    const keys = [s.nameKey, ...s.bulletKeys];
    for (const k of keys) {
        if (!PL.has(k)) fail('G4', `${s.id}: brak klucza '${k}' w pl.ts`);
        if (!EN.has(k)) fail('G4', `${s.id}: brak klucza '${k}' w en.ts`);
    }
    // v0.139.0 — bylo "dokladnie 3 (popup ma staly slot)". Uzasadnienie sie
    // ZDEZAKTUALIZOWALO: popup skasowano w v0.129.0, dzis sezon renderuje sie na
    // PELNEJ STRONIE (SeasonSection), ktora stalego slotu nie ma. Zakres 3-4 zostaje
    // JAWNY, a nie zniesiony — jeden bullet to za malo, zeby opisac sezon, a piaty
    // zamienia liste w scianke tekstu. Realna ochrona 375px siedzi w G5 (BULLET_MAX).
    if (s.bulletKeys.length < 3 || s.bulletKeys.length > 4) {
        fail('G4', `${s.id}: ${s.bulletKeys.length} bulletow — dozwolone 3-4`);
    }
}

// ══════════════════════════════════════════════════════════════════
// G5 — budzety tekstu: sezon nie rozpycha UI
// ══════════════════════════════════════════════════════════════════
// Kontrakt slotow: sezon renderuje sie do miejsc o STALYM rozmiarze. Za dlugi
// tytul lamie sie w .so-title, za dlugi bullet rozpycha modal na 375px.
for (const s of SEASONS) {
    for (const [lang, map] of [['pl', PL], ['en', EN]]) {
        const name = map.get(s.nameKey);
        if (name && name.length > NAME_MAX) {
            fail('G5', `${s.id}/${lang}: nazwa ${name.length} zn. > ${NAME_MAX} ("${name}")`);
        }
        for (const bk of s.bulletKeys) {
            const b = map.get(bk);
            if (b && b.length > BULLET_MAX) {
                fail('G5', `${s.id}/${lang}: bullet ${b.length} zn. > ${BULLET_MAX} ("${b.slice(0, 40)}...")`);
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════════
// G6 — progi rosnace, nagrody w istniejacej ekonomii
// ══════════════════════════════════════════════════════════════════
let prev = 0;
for (const m of MILESTONES) {
    if (!('threshold' in m)) { fail('G6', 'milestone bez progu'); continue; }
    if (m.threshold <= prev) fail('G6', `progi nierosnace: ${prev} -> ${m.threshold}`);
    prev = m.threshold;
    for (const k of Object.keys(m)) {
        if (!ALLOWED_REWARDS.has(k)) fail('G6', `milestone ${m.threshold}: nagroda '${k}' poza istniejaca ekonomia (bolts/crates)`);
    }
}
if (MILESTONES.length === 0) fail('G6', 'SEASON_MILESTONES puste');

// ══════════════════════════════════════════════════════════════════
// G7 — nic trwalego w st.season
// ══════════════════════════════════════════════════════════════════
// ProgressionService.ensureSeason podmienia st.season W CALOSCI przy zmianie
// sezonu. Cokolwiek trwalego (gablota "swiadectw", lifetime licznik) tam wlozone
// znika bez sladu. Kontrakt musi to deklarowac swiadomie.
if (existsSync(P.contracts)) {
    for (const f of readdirSync(P.contracts).filter(f => f.endsWith('.md'))) {
        const body = readFileSync(join(P.contracts, f), 'utf8');
        const persistent = /trwal\w*|swiadectw|lifetime|nie kasuje|na zawsze/i.test(body);
        const declaresStore = /st\.season\b/.test(body);
        if (persistent && declaresStore && !/POZA\s+st\.season|osobn\w+\s+pod-dokument/i.test(body)) {
            fail('G7', `${f}: deklaruje trwaly stan i dotyka st.season, a ensureSeason go kasuje — wskaz osobny pod-dokument`);
        }
    }
}

// ══════════════════════════════════════════════════════════════════
// Raport
// ══════════════════════════════════════════════════════════════════
console.log('=== SEASON CHECK — bramki G0-G7 ===');
console.log(`Sezonow w roadmapie: ${SEASONS.length}  (${sorted[0]?.id} ... ${sorted[sorted.length - 1]?.id})`);
const now = SEASONS.find(s => new Date(s.start) <= Date.now() && Date.now() <= new Date(s.end));
console.log(`Biezacy sezon: ${now ? `${now.id} — ${PL.get(now.nameKey)}` : 'BRAK (dziura w kalendarzu)'}`);
console.log('');
console.log(errors.length === 0 ? 'PASS — 0 bledow' : `FAIL — ${errors.length} bledow:`);
for (const e of errors) console.log('  ' + e);
if (warns.length) {
    console.log(`\nOstrzezenia (${warns.length}, nie blokuja):`);
    for (const w of warns) console.log('  ' + w);
}
process.exit(errors.length === 0 ? 0 : 1);
