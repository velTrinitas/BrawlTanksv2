/**
 * pack-test.mjs — TEST-1 (v0.142.0). Higiena paczki TESTOWEJ.
 *
 * Run: node tools/pack-test.mjs   (odpalane przez `npm run build:test`, PO `vite build`)
 * Exit 0 = OK, exit 1 = paczka NIE nadaje sie do wyslania.
 *
 * Operuje WYLACZNIE na `dist/`. Nie dotyka ani jednego pliku zrodlowego — dzieki temu
 * `npm run build` (produkcja) jest z definicji nietkniety: on tego skryptu nie wola.
 *
 * Wzorzec: tools/season_check.mjs — zero zaleznosci, ponumerowane kroki, twardy FAIL
 * zamiast cichego przejscia. Roznica: tamten tylko WERYFIKUJE, ten MODYFIKUJE `dist/`.
 *
 * TRZY RZECZY, KTORE ROBI I DLACZEGO:
 *  1. `noindex,nofollow` + `robots.txt` — adres testowy nie ma wisiec w Google. To nie
 *     jest zabezpieczenie (nazwa hosta i tak trafi do logow Certificate Transparency),
 *     tylko higiena: link ma zyc trzy tygodnie i zniknac, a nie zostac w wynikach
 *     wyszukiwania na lata.
 *  2. kasowanie `lab.html` — laboratorium 2.5D to warsztat, nie tresc dla testera.
 *     `lab.html` jest DRUGIM ENTRY POINTEM buildu (rollupOptions w vite.config), wiec
 *     po jego skasowaniu zostaje w `dist/assets` osierocony chunk. ZMIERZONE: 4,9 KB,
 *     reszta wspoldzielona z gra. Swiadomie NIE komplikujemy vite.config warunkiem env
 *     dla pieciu kilobajtow — bez `lab.html` i tak nikt tego chunku nie uruchomi.
 *  3. RAPORT na koniec — wypisuje, jaka baze i jaka date paczka FAKTYCZNIE ma wpieczona,
 *     odczytane z gotowych plikow, a nie ze zmiennych srodowiskowych. Jedno spojrzenie
 *     zamiast zgadywania, czy `$env:` zlapalo. To jest najwazniejsza funkcja tego pliku:
 *     paczka bez daty wyglada dokladnie tak samo jak paczka z data.
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const INDEX = join(DIST, 'index.html');

const errors = [];
const done = [];

if (!existsSync(INDEX)) {
    console.error('[pack-test] BLAD: brak dist/index.html — najpierw `vite build`.');
    process.exit(1);
}

let html = readFileSync(INDEX, 'utf8');

// ── 1. noindex ───────────────────────────────────────────────────────────────
if (html.includes('name="robots"')) {
    done.push('noindex juz byl (pomijam)');
} else if (html.includes('<head>')) {
    html = html.replace('<head>', '<head>\n    <meta name="robots" content="noindex,nofollow">');
    done.push('noindex wstrzykniety do <head>');
} else {
    errors.push('nie znalazlem <head> w dist/index.html — noindex NIE wstrzykniety');
}

// ── 2. robots.txt ────────────────────────────────────────────────────────────
writeFileSync(join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
done.push('dist/robots.txt zapisany (Disallow: /)');

// ── 3. lab.html precz ────────────────────────────────────────────────────────
const lab = join(DIST, 'lab.html');
if (existsSync(lab)) {
    rmSync(lab);
    done.push('dist/lab.html skasowany');
} else {
    done.push('dist/lab.html nie istnial (pomijam)');
}

writeFileSync(INDEX, html, 'utf8');

// ── 4. RAPORT: co paczka FAKTYCZNIE ma w srodku ──────────────────────────────
// Baza czytana ze SCIEZEK w gotowym HTML, nie z process.env — interesuje nas, co
// wylądowalo w pliku, a nie co mielismy zamiar ustawic.
const relative = /(?:src|href)="\.\//.test(html);
const ghPages = html.includes('/BrawlTanksv2/');
const base = relative && !ghPages ? './  (root domeny — OK dla Cloudflare)'
    : ghPages ? '/BrawlTanksv2/  (GitHub Pages)'
    : '(nierozpoznana)';

// Data: OCZEKIWANIE bierzemy z env, ale POTWIERDZENIE z gotowego bundla — sprawdzamy,
// czy vite faktycznie wpiekl DOKLADNIE te wartosc.
//
// DWIE POMYLKI, KTORE TU JUZ BYLY — obie zlapane na pierwszym uruchomieniu:
//  1. szukanie dowolnego literalu `"20\d\d-\d\d-\d\d"` meldowalo „2024-01-01", date
//     z jakiejs biblioteki w bundlu. Raport majacy chronic przed pomylka sam sklamal.
//     Stad porownanie z KONKRETNA wartoscia zamiast lapania czegokolwiek podobnego.
//  2. szukanie `"${wanted}"` (w cudzyslowach) nie znajdowalo nic, bo minifikator
//     zapisuje literal w BACKTICKACH: ST_EXPIRES:`2026-09-23`. Nie zakladamy wiec
//     zadnej formy cytowania — szukamy samej wartosci.
const wanted = (process.env.VITE_TEST_EXPIRES ?? '').trim();
let expires = null;
if (wanted) {
    try {
        const { readdirSync } = await import('node:fs');
        const assets = join(DIST, 'assets');
        const baked = readdirSync(assets)
            .filter(f => f.endsWith('.js'))
            .some(f => readFileSync(join(assets, f), 'utf8').includes(wanted));
        if (baked) expires = wanted;
        else errors.push(`VITE_TEST_EXPIRES='${wanted}' podane, ale NIE MA go w bundlu`
            + ' — sprawdz, czy zmienna byla widoczna dla vite');
    } catch { /* brak assets = zglosi to blad wyzej */ }
}

console.log('\n─── PACZKA TESTOWA ─────────────────────────────────');
for (const d of done) console.log('  ✓ ' + d);
console.log('  ── co jest wpieczone ──');
console.log('  baza assetow : ' + base);
console.log('  data waznosci: ' + (expires
    ? expires + '  (ostatni dzien grania; blokada nastepnego dnia o 00:00)'
    : 'BRAK — ta paczka NIGDY nie wygasnie'));
console.log('────────────────────────────────────────────────────\n');

if (errors.length) {
    console.error('[pack-test] BLEDY:\n  - ' + errors.join('\n  - '));
    process.exit(1);
}

// Twardy FAIL, gdy paczka testowa nie ma daty. To najgrozniejsza pomylka tej fazy:
// wyslany testerom build bez daty waznosci dziala wiecznie i nikt tego nie zauwazy,
// bo wyglada identycznie jak poprawny.
if (!expires) {
    console.error('[pack-test] BLAD: paczka NIE MA daty waznosci. Zbuduj z ustawionym'
        + ' VITE_TEST_EXPIRES (np. $env:VITE_TEST_EXPIRES=\'2026-09-23\').');
    process.exit(1);
}
