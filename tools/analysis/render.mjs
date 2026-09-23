/**
 * render.mjs — report-data.json -> HTML pod druk A4 (zrodlo PDF-a).
 *
 * Zero CDN-a, zero JS w wyjsciu: raport ma sie otworzyc i wydrukowac wszedzie.
 * Wykresy to inline SVG z `svg.mjs`; kazdy slupek ma etykiete liczbowa, wiec
 * dokument pozostaje czytelny na wydruku czarno-bialym.
 *
 * TEKST: polski z diakrytykami (to dokument dla czlowieka, nie kod).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, barsH, medianRange, timeBars, funnel } from './svg.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(REPO, 'docs', 'reports');
const R = JSON.parse(fs.readFileSync(path.join(OUT, 'report-data.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pl = (n) => (n === null || n === undefined ? '—' : String(n).replace('.', ','));
/** Sekundy -> "2 min 14 s" — minuty czyta sie szybciej niz 134. */
const mmss = (s) => (s === null || s === undefined ? '—' : s < 90 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`);

const NAMES = {
    ktb: 'Zabij Mega Bossa', ctf: 'Zdobądź flagę', castle: 'Obroń Zamek', save_queen: 'Uratuj Królową',
    desert: 'Pustynia', city: 'Miasto', arctic: 'Arktyka', tropics: 'Tropiki', mars: 'Mars',
    fortified_ruins: 'Ruiny (CTF)', castle_grounds: 'Zamek', dungeon: 'Lochy (Królowa)',
    easy: 'Łatwy', normal: 'Normalny', hard: 'Trudny', nightmare: 'Koszmar',
    pyro: 'Pyro', twardy: 'Twardy', king: 'Król', heavy: 'Ciężki', sniper: 'Snajper',
    shadow: 'Cień', scout: 'Zwiadowca', plasma: 'Plazma',
};
const nm = (k) => NAMES[k] || k;

const badge = (ok, yes = 'PRZECHODZI', no = 'NIE PRZECHODZI') =>
    `<span class="badge ${ok ? 'ok' : 'bad'}">${ok ? yes : no}</span>`;

/** Karta z jedną liczbą — gdy liczba JEST wnioskiem i wykres tylko by ją rozwodnił. */
const tile = (value, label, note = '') =>
    `<div class="tile"><div class="tile-v">${value}</div><div class="tile-l">${label}</div>`
    + (note ? `<div class="tile-n">${note}</div>` : '') + `</div>`;

const table = (head, rows) =>
    `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

// ── dane do wykresów ──────────────────────────────────────────────────────────
const f = R.funnel.window;
const funnelSteps = [
    { label: 'Założone profile', value: f.profiles },
    { label: 'Uruchomiły grę', value: f.withSession },
    { label: 'Zapisały postęp', value: f.withProgression },
    { label: 'Zagrały ≥ 1 mecz', value: f.withScore },
    { label: 'Wróciły innego dnia', value: f.returnedOnAnotherDay },
];

const dayBars = R.play.days.map(d => ({ label: d.key.slice(8), value: d.n }));
/**
 * Swiadomie NIE zestawiamy telemetrii i `scores` jako dwoch serii na jednej osi:
 * telemetria to probka meczow, `scores` to komplet wynikow, wiec slupki obok siebie
 * sugerowalyby proporcje, ktorej nie ma. Pokazujemy JEDNA serie — ile meczow zagrano —
 * i oznaczamy, ktore scenariusze nie zostawiaja po sobie zadnego wyniku.
 */
const gapRows = R.scenarioGap.rows.map(r => ({
    label: nm(r.scenario), value: r.playedMatches, visible: r.visibleInLeaderboard,
}));
const mapPlay = R.play.map.map(m => ({ label: nm(m.key), value: m.n }));
const stutter = R.perf.byMapAndroid.map(m => ({
    label: `${nm(m.key)} (n=${m.n})`, value: m.stutterPct, reliable: m.n >= 5,
}));
const balanceRows = R.balance.map(b => ({
    label: nm(b.brawler), median: b.killsPerMin, p25: b.kpmP25, p75: b.kpmP75, reliable: b.reliable,
}));
const survivalRows = R.balance.map(b => ({
    label: nm(b.brawler), median: b.medianSeconds, p25: b.secP25, p75: b.secP75, reliable: b.reliable,
}));

const html = `<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8">
<title>Wyniki testów Sigma Tanks · 01–23.09.2026</title>
<style>
  @page { size: A4; margin: 14mm 13mm 16mm; }
  :root {
    --ink:${C.ink}; --ink2:${C.ink2}; --muted:${C.muted};
    --grid:${C.grid}; --surface:${C.surface}; --s1:${C.s1}; --s2:${C.s2};
    --good:${C.good}; --bad:${C.bad};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--surface); color: var(--ink);
    font: 10.2pt/1.5 "Segoe UI", -apple-system, system-ui, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { max-width: 186mm; margin: 0 auto; padding: 0 0 6mm; }

  h1 { font-size: 22pt; line-height: 1.15; margin: 0 0 2mm; letter-spacing: -.4pt; }
  h2 {
    font-size: 13pt; margin: 9mm 0 3mm; padding-bottom: 1.6mm;
    border-bottom: 2px solid var(--ink); letter-spacing: -.2pt;
  }
  h3 { font-size: 11pt; margin: 6mm 0 2mm; }
  p { margin: 0 0 2.6mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 5mm; }
  li { margin-bottom: 1.4mm; }
  strong { font-weight: 650; }
  .lead { font-size: 11pt; color: var(--ink2); }
  .muted { color: var(--muted); }

  /* Naglowek dokumentu */
  .head { border-bottom: 3px solid var(--ink); padding-bottom: 4mm; margin-bottom: 5mm; }
  .kicker {
    font-size: 8.4pt; letter-spacing: 1.4pt; text-transform: uppercase;
    color: var(--s1); font-weight: 700; margin-bottom: 1.5mm;
  }
  .meta { font-size: 8.6pt; color: var(--muted); margin-top: 2mm; }

  /* Kafle liczbowe */
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 4mm 0 5mm; }
  .tiles.three { grid-template-columns: repeat(3, 1fr); }
  .tile { border: 1px solid var(--grid); border-left: 3px solid var(--s1); padding: 2.6mm 3mm; }
  .tile-v { font-size: 17pt; font-weight: 700; line-height: 1.1; letter-spacing: -.5pt; }
  .tile-l { font-size: 8.4pt; color: var(--ink2); margin-top: .8mm; line-height: 1.35; }
  .tile-n { font-size: 7.8pt; color: var(--muted); margin-top: .8mm; }

  /* Wyroznienia */
  .callout { border-left: 3px solid var(--s2); background: #fdf4ef; padding: 3mm 3.5mm; margin: 3mm 0 4mm; }
  .callout.blue { border-left-color: var(--s1); background: #eff5fd; }
  .callout.crit { border-left-color: var(--bad); background: #fdf0f0; }
  .callout h4 { margin: 0 0 1.5mm; font-size: 10.4pt; }
  .callout p:last-child { margin-bottom: 0; }

  .badge {
    display: inline-block; font-size: 8pt; font-weight: 700; letter-spacing: .4pt;
    padding: .6mm 2mm; border-radius: 2px; color: #fff; vertical-align: 1px;
  }
  .badge.ok { background: var(--good); } .badge.bad { background: var(--bad); }

  /* Tabele */
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9pt; }
  th, td { text-align: left; padding: 1.5mm 2mm; border-bottom: 1px solid var(--grid); }
  th { font-size: 8.2pt; text-transform: uppercase; letter-spacing: .5pt; color: var(--ink2); border-bottom: 1.5px solid var(--ink2); }
  td.num, th:not(:first-child) { text-align: right; }
  tbody tr:last-child td { border-bottom: none; }

  /* Wykresy */
  .chart { display: block; margin: 1mm 0 3mm; overflow: visible; }
  .chart .lbl { font: 8.6pt "Segoe UI", sans-serif; fill: var(--ink); }
  .chart .lbl.weak { fill: var(--muted); }
  .chart .val { font: 8.4pt "Segoe UI", sans-serif; fill: var(--ink2); }
  .chart .val .big { font-size: 10pt; font-weight: 700; fill: var(--ink); }
  .chart .val .muted, .chart .muted { fill: var(--muted); }
  .chart .tick { font: 7.6pt "Segoe UI", sans-serif; fill: var(--muted); }
  .legend { font-size: 8.4pt; color: var(--ink2); margin: 1mm 0 1.5mm; }
  .legend .key { margin-right: 5mm; }
  .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 1.6mm; vertical-align: -1px; }
  .cap { font-size: 8.2pt; color: var(--muted); margin: -1mm 0 4mm; }

  /* Lamanie stron: zaden blok nie ma sie rozjechac na dwie strony */
  section, figure, table, .callout, .tiles { break-inside: avoid; page-break-inside: avoid; }
  h2 { break-after: avoid; page-break-after: avoid; }
  .pb { break-before: page; page-break-before: always; }
  figure { margin: 0; }
</style></head>
<body><div class="page">

<header class="head">
  <div class="kicker">Sigma Tanks · Sezon 2 · raport zamknięcia testów</div>
  <h1>Wyniki testów<br>1–23 września 2026</h1>
  <div class="meta">
    Źródła: Supabase (<code>scores</code> ${R.sources.scores.rows}, <code>profiles</code> ${R.sources.profiles.rows},
    <code>telemetry</code> ${R.sources.telemetry.rows}, <code>progression</code> ${R.sources.progression.rows} wierszy)
    · Cloudflare Workers Metrics · wygenerowano ${new Date(R.generatedAt).toLocaleString('pl-PL')}
  </div>
</header>

<section>
<h2>1. Streszczenie</h2>

<p class="lead">Testy zadziałały: <strong>${R.play.n} meczów</strong> od <strong>${R.play.players} graczy</strong>,
zero błędów 5xx, gra nie wywróciła się ani razu. Ale dane odsłoniły trzy rzeczy, których nie było widać z fotela:
<strong>połowa rozgrywki nie trafia do bazy</strong>, <strong>mecz trwa medianowo ${R.play.matchSeconds.median} sekund</strong>,
a <strong>poziom „Łatwy" nie robi nic</strong>.</p>

<div class="tiles">
  ${tile(R.play.n, 'meczów zapisanych w bazie', `${R.play.players} graczy · mediana ${R.play.matchesPerPlayer.median} meczów na gracza`)}
  ${tile(`${pl(R.scenarioGap.lostPct)}%`, 'rozgrywki NIE dociera do rankingu', `${R.scenarioGap.lostMatches} meczów Zamku i Królowej`)}
  ${tile(`${R.play.matchSeconds.median} s`, 'mediana długości meczu', `${pl(R.play.veryShortPct)}% meczów trwa ≤ 15 s`)}
  ${tile(`${pl(R.perf.stutterAndroidPct)}%`, 'meczów na Androidzie z zacięciem', 'spadek poniżej 45 fps')}
</div>

<h3>Dwie decyzje — formalne wyjście KROKU 1</h3>

<div class="callout blue">
  <h4>Decyzja 1 · SMOOTH domyślnie włączony — ${badge(R.decisions.smooth.pass, 'TAK', 'NIE')}</h4>
  <p>Bramka Z0.6 brzmi <strong>p50 ≥ 55 fps</strong> i przechodzi na każdym urządzeniu o sensownej próbie:
  desktop 59 (n=165), Android A54 <strong>57</strong> (n=79). Rekomendacja: <strong>włączyć</strong>, ale
  z rollbackiem <code>?smooth=0</code> i pomiarem p05 po tygodniu.</p>
  <p><strong>Zastrzeżenie, które musi paść:</strong> SMOOTH nie naprawi zacięć. Bramka pyta o średnią płynność,
  a gracz czuje <em>p05</em> — a ten na A54 wynosi 46 fps i ${pl(R.perf.stutterAndroidPct)}% meczów ma spadek poniżej 45.
  To osobny problem (frame pacing) i nie wolno go uznać za zamknięty, bo bramka przeszła.</p>
</div>

<div class="callout crit">
  <h4>Decyzja 2 · Start ETAPU 1 (COOP) — <span class="badge bad">JESZCZE NIE</span></h4>
  <p>Telemetria <em>dopuszcza</em> start, ale rekomendacja jest przeciwna i wynika wprost z liczby:
  <strong>${pl(R.scenarioGap.lostPct)}% rozgrywki nie dociera dziś do bazy</strong>. Budowanie kooperacji na zapleczu,
  które gubi połowę meczów i ma otwartą dziurę RLS na <code>profiles</code> (Z0.10b), to budowanie na piasku.</p>
  <p>Kolejność z planu — <strong>KROK 2 (redeploy zaplecza) → KROK 3 (balans) → dopiero KROK 4 (COOP)</strong> —
  jest potwierdzona danymi. Bramka „przegląd planu innym modelem" pozostaje otwarta niezależnie.</p>
</div>
</section>

<section class="pb">
<h2>2. Zasięg i kompletność danych</h2>

<p>Eksport jest kompletny i zweryfikowany krzyżowo: surowa tabela <code>telemetry</code> ma
<strong>${R.telemetryCheck.got}</strong> wierszy, a niezależny widok agregujący <code>telemetry_by_device</code>
liczy <strong>${R.telemetryCheck.expected}</strong> meczów. Zgodność co do wiersza ⇒ nic nie zostało ucięte.</p>

${table(['Źródło', 'Wiersze', 'Zakres dat', 'Stan'], [
    ['<code>scores</code>', R.sources.scores.rows, `${R.sources.scores.from?.slice(0, 10)} → ${R.sources.scores.to?.slice(0, 10)}`, 'komplet'],
    ['<code>profiles</code>', R.sources.profiles.rows, `${R.sources.profiles.from?.slice(0, 10)} → ${R.sources.profiles.to?.slice(0, 10)}`, 'komplet'],
    ['<code>telemetry</code>', R.sources.telemetry.rows, `${R.sources.telemetry.from?.slice(0, 10)} → ${R.sources.telemetry.to?.slice(0, 10)}`, 'komplet, zweryfikowany'],
    ['<code>progression</code>', R.sources.progression.rows, `${R.sources.progression.from?.slice(0, 10)} → ${R.sources.progression.to?.slice(0, 10)}`, 'komplet'],
    ['<code>sessions</code>', '0', '—', '<strong>tabela pusta — patrz §8</strong>'],
])}

<div class="callout">
  <h4>Czego w tych danych NIE ma i już nie będzie</h4>
  <p><strong>Cloudflare Web Analytics nigdy nie zostało włączone</strong> — panel pokazuje kreator „Get started".
  Oznacza to, że <strong>górny lejek jest bezpowrotnie utracony</strong>: nie dowiemy się, ilu ludzi w ogóle
  otworzyło adres, z jakich krajów ani ilu odbiło się od ekranu startowego. Wszystko poniżej opisuje więc
  ludzi, którzy <em>już założyli profil</em>.</p>
  <p>To nie jest strata krytyczna dla decyzji technicznych — urządzenia i wydajność mamy z własnej telemetrii,
  która jest <em>dokładniejsza</em> niż cokolwiek, co dałby Cloudflare. Ale porównanie „ilu weszło vs ilu zagrało"
  przy następnych testach wymaga włączenia Web Analytics <strong>przed</strong> startem. To jedno pole i pięć minut.</p>
</div>

<h3>Ruch — Cloudflare Workers Metrics</h3>
${table(['Metryka', 'Wartość'], [
    ['Żądania assetów (okres testów)', pl(R.cloudflare.assetRequests30d)],
    ['Trafienia w cache', `${pl(R.cloudflare.cacheHitRate)}%`],
    ['Odpowiedzi 4xx', pl(R.cloudflare.responses4xx)],
    ['Odpowiedzi 5xx', `<strong>${pl(R.cloudflare.responses5xx)}</strong>`],
    ['Żądania 23.09 (ostatnia doba)', pl(R.cloudflare.last24hRequests)],
])}
<p><strong>Zero błędów 5xx przez cały okres</strong> — paczka testowa na Workers nie wywróciła się ani razu.
Kształt ruchu jest za to jednoznaczny: ${esc(R.cloudflare.shape)} W ostatniej dobie padło
<strong>${R.cloudflare.last24hRequests} żądań</strong>. <strong>Testy to był jeden start, nie trzy tygodnie grania</strong> —
i tak też trzeba czytać wszystkie liczby retencji poniżej.</p>
</section>

<section>
<h2>3. Aktywność w czasie</h2>
<figure>
${timeBars(dayBars, { title: 'Mecze zapisane dziennie, wrzesień 2026', labelEvery: 1 })}
<figcaption class="cap">Mecze zapisane w <code>scores</code> per dzień (oś: dzień września).
Dzień 20.09 zawiera ruch z maszyny deweloperskiej i jest wyłączony z lejka w §4, ale zostaje tutaj i w §6–7.</figcaption>
</figure>
<p>Pierwsze trzy dni to <strong>${R.play.days.slice(0, 3).reduce((a, d) => a + d.n, 0)} z ${R.play.n} meczów</strong>.
Potem aktywność praktycznie zamiera, z jednym odbiciem w połowie miesiąca. Wniosek na następny test:
<strong>okno trzech tygodni nie dało trzech tygodni danych</strong> — dało dane z weekendu startowego.
Krótszy, ale skoordynowany test (jeden konkretny dzień, wszyscy naraz) dałby ten sam materiał przy mniejszym koszcie.</p>
</section>

<section>
<h2>4. Lejek gracza</h2>
<figure>
${funnel(funnelSteps)}
<figcaption class="cap">Profile założone 1–23.09, <strong>bez 20.09</strong> (ruch z maszyny deweloperskiej — 37 profili
z generatora nicków v0.203.0, którego nie ma w paczce testowej). Surowo byłoby ${R.funnel.windowRaw.profiles} profili
i ${R.funnel.windowRaw.withScore} grających — te liczby byłyby nieprawdziwe.</figcaption>
</figure>

<p>Czyta się to tak: z <strong>${f.profiles} założonych profili</strong> aż <strong>${f.withScore}
(${Math.round(f.withScore / f.profiles * 100)}%) zagrało co najmniej jeden mecz</strong>. To jest dobry wynik —
próg wejścia nie jest tu problemem. Problem jest dalej: <strong>tylko ${f.returnedOnAnotherDay} profile
(${Math.round(f.returnedOnAnotherDay / f.profiles * 100)}%) wróciły innego dnia</strong>.</p>

<div class="tiles three">
  ${tile(`${Math.round(f.withScore / f.profiles * 100)}%`, 'założonych profili zagrało mecz', `${f.withScore} z ${f.profiles}`)}
  ${tile(`${Math.round(f.returnedOnAnotherDay / f.profiles * 100)}%`, 'wróciło kolejnego dnia', `${f.returnedOnAnotherDay} z ${f.profiles}`)}
  ${tile(`${f.profiles - f.withScore}`, 'profili bez ani jednego meczu', 'założyli konto i zniknęli')}
</div>

<p><strong>Gra przekonuje do pierwszego meczu, ale nie przekonuje do powrotu.</strong> Przy grze dla 9–12-latków
to jest najważniejsza liczba w całym raporcie — i §5–7 pokazują trzy konkretne, naprawialne powody.</p>

<h3>Sesje — odtworzone, bo tabela <code>sessions</code> jest pusta</h3>
<p class="muted">Metoda: sesja = ciąg meczów jednego gracza z przerwą krótszą niż 30 minut. To <strong>dolna granica</strong> — nie obejmuje czasu spędzonego w menu, garażu ani sklepie.</p>
${table(['Metryka', 'Wartość'], [
    ['Sesji w oknie testów', pl(R.sessions.derived.n)],
    ['Mediana długości sesji', `<strong>${mmss(R.sessions.derived.seconds.median)}</strong>`],
    ['Mediana meczów w sesji', pl(R.sessions.derived.matches.median)],
    ['Sesje jednomeczowe', `<strong>${pl(R.sessions.derived.singleMatchPct)}%</strong>`],
    ['Najdłuższa sesja', mmss(R.sessions.derived.seconds.max)],
])}
<p>Mediana sesji to <strong>${mmss(R.sessions.derived.seconds.median)}</strong>, a
<strong>${pl(R.sessions.derived.singleMatchPct)}% sesji kończy się po jednym meczu</strong>.
Skoro mecz trwa medianowo ${R.play.matchSeconds.median} s, to znaczy, że co trzeci gracz włącza grę,
przegrywa raz i wychodzi. To nie jest problem treści — to problem <em>pierwszej porażki</em>.</p>
</section>

<section class="pb">
<h2>5. Dziura w rankingu — połowa rozgrywki jest niewidoczna</h2>

<p>To najmocniejsze znalezisko całych testów, widoczne tylko dlatego, że mamy <em>dwa niezależne</em> źródła:
telemetria leci z <strong>każdego</strong> meczu, a <code>scores</code> zapisuje tylko te, które przepuści Edge Function.</p>

<figure>
${barsH(gapRows, {
    title: 'Mecze faktycznie zagrane per scenariusz (telemetria)',
    labelW: 160, valueW: 210,
    colorFn: (i) => (i.visible ? C.s1 : C.s2),
    valueFn: (i) => `${i.value}${i.visible ? '' : '  ·  0 wyników w rankingu'}`,
})}
<figcaption class="cap">Liczba meczów zmierzona telemetrią, 1–23.09 (telemetria leci z każdego meczu, niezależnie
od tego, czy wynik zostanie przyjęty). <strong>Pomarańczowe słupki to scenariusze, z których do bazy nie trafił
ani jeden wynik.</strong></figcaption>
</figure>

<div class="callout crit">
  <h4>Zamek i Królowa: ${R.scenarioGap.lostMatches} zagranych meczów, ${0} zapisanych wyników</h4>
  <p>Gracze zagrali <strong>${R.scenarioGap.rows.find(r => r.scenario === 'save_queen')?.playedMatches ?? 0} meczów
  „Uratuj Królową"</strong> i <strong>${R.scenarioGap.rows.find(r => r.scenario === 'castle')?.playedMatches ?? 0} meczów
  „Obroń Zamek"</strong> — razem <strong>${pl(R.scenarioGap.lostPct)}% całej rozgrywki</strong>. Do bazy nie trafił
  <em>ani jeden</em> wynik z tych dwóch scenariuszy.</p>
  <p>Przyczyna jest znana i zaplanowana (pozycje 3 i 4 z <code>PLAN_PO_TESTACH.md</code>): whitelist w Edge
  <code>submit-score</code> nie zna <code>castle_grounds</code> ani <code>dungeon</code>, a klient w konsekwencji
  w ogóle nie wysyła tych wyników. <strong>Nowa jest skala.</strong> To nie jest odłożony drobiazg — to znaczy,
  że dwa najnowsze scenariusze, w które gracze grali najchętniej, <em>nie istnieją w rankingu</em>:
  dziecko gra pół godziny i nie widzi po sobie śladu.</p>
</div>

<p>Do tego dochodzi liczba, która to podkreśla: <strong>mediana meczu na mapie Zamku to
${R.perf.byMap.find(m => m.key === 'castle_grounds')?.seconds ?? '—'} sekund</strong>, przy
${R.perf.byMap.find(m => m.key === 'desert')?.seconds ?? '—'} s na Pustyni. Zamek trzyma gracza kilka razy dłużej
niż cokolwiek innego — i jest jedynym scenariuszem, który nic za to nie daje.</p>
</section>

<section>
<h2>6. Rozgrywka — co i jak grali</h2>

<div class="tiles">
  ${tile(`${R.play.matchSeconds.median} s`, 'mediana długości meczu', `ćwiartki: ${R.play.matchSeconds.p25}–${R.play.matchSeconds.p75} s`)}
  ${tile(R.play.score.median, 'mediana wyniku', `najlepszy: ${R.play.score.max}`)}
  ${tile(`${pl(R.play.accuracy.median)}%`, 'mediana celności', `n=${R.play.accuracy.n}`)}
  ${tile(`${pl(R.play.funMode.find(x => x.key === 'true')?.pct ?? 0)}%`, 'meczów ze slotem 🎲', 'Szalone Moce')}
</div>

<h3>Poziom trudności nie działa</h3>
${table(['Poziom', 'Meczów', 'Mediana czasu', 'Mediana zabić', 'Mecze ≤ 15 s'], [
    ['<strong>Łatwy</strong>', '238', '<strong>36 s</strong>', '7', '12%'],
    ['<strong>Normalny</strong>', '254', '<strong>38 s</strong>', '7', '10%'],
    ['Koszmar', '44', '18 s', '2', '41%'],
])}

<div class="callout">
  <h4>„Łatwy" i „Normalny" dają identyczny wynik</h4>
  <p>Mediana czasu 36 s vs 38 s, mediana zabić 7 vs 7, odsetek natychmiastowych porażek 12% vs 10%.
  <strong>Wybór „Łatwy" nie pomaga graczowi w niczym mierzalnym.</strong> Dla 9-latka, który właśnie przegrał
  i świadomie sięgnął po łatwiejszy poziom, żeby mu poszło lepiej — a poszło tak samo — to jest dokładnie to
  poczucie niesprawiedliwości, które reguła czytelności każe eliminować.</p>
  <p>To zarazem <strong>najtańsza duża poprawa w całym raporcie</strong>: „Łatwy" musi realnie chronić
  (mniej wrogów naraz, niższe obrażenia, więcej czasu na reakcję), a nie tylko nazywać się łatwym.</p>
</div>

<h3>Mapy: gracze grają w jedną</h3>
<figure>
${barsH(mapPlay, { title: 'Mecze per mapa', valueFn: (i) => `${i.value}` })}
<figcaption class="cap">Wyniki zapisane w <code>scores</code>, 1–23.09. Zamek i Lochy nie mogą się tu pojawić — patrz §5.</figcaption>
</figure>
<p><strong>Pustynia to ${pl(R.play.map[0].pct)}% wszystkich meczów.</strong> Tropiki — mapa z pełnym zestawem
farmerskich propsów — zebrały ${pl(R.play.map.find(m => m.key === 'tropics')?.pct ?? 0)}%. Pięć zbudowanych map,
a rozgrywka skupia się na jednej. <strong>I to nie przypadek:</strong> Pustynia jest mapą domyślną —
<code>AVAILABLE_MAPS[0]</code> w <code>BattleSection.ts:98</code>. Gracze w większości nie wybierają mapy,
tylko akceptują tę, która jest ustawiona. Zmiana kolejności albo losowanie startowej mapy rozkłada ruch
po całej zawartości <em>bez tworzenia czegokolwiek nowego</em>.</p>
</section>

<section class="pb">
<h2>7. Wydajność</h2>

<p>Mierzone od <strong>${R.perf.recentFrom}</strong> (n=${R.perf.recentRows}), czyli po naprawie białego ekranu
i VRAM-u z v0.187.0. <strong>To rozróżnienie jest konieczne:</strong> na całym zbiorze Mars wygląda na zepsuty
(p50 = 39), ale wszystkie złe pomiary pochodzą z v0.155.2 — po fixie Mars daje na A54 59/48 i jest sprawny.</p>

${table(['Urządzenie', 'Meczów', 'p50 (mediana fps)', 'p05 (najgorsze 5%)', 'Bramka p50 ≥ 55'], R.perf.gate.perDevice.map(d => [
    `<code>${esc(d.device)}</code>`, pl(d.matches), `<strong>${pl(d.p50)}</strong>`, pl(d.p05), badge(d.pass, 'TAK', 'NIE'),
]))}
<p class="cap">Urządzenie <code>K</code> to Samsung A54 (Chrome na Androidzie redukuje model w User-Agencie do „K").
Próba iPhone’a to jeden mecz — nie decyduje o niczym.</p>

<div class="callout">
  <h4>Bramka przechodzi, ale mierzy nie to, co gracz czuje</h4>
  <p>p50 na A54 to 57 fps — <strong>bramka Z0.6 przechodzi</strong>. Tyle że p05 wynosi 46, a
  <strong>${pl(R.perf.stutterAndroidPct)}% meczów na Androidzie ma spadek poniżej 45 fps</strong>. Czyli mniej więcej
  <strong>co trzeci mecz się zacina</strong>, mimo że „średnio jest 57 klatek”.</p>
  <p>Rekomendacja: przy następnym pomiarze <strong>promować p05 do roli głównej metryki</strong>.
  Średnia płynność jest już rozwiązana; ogon nie jest.</p>
</div>

<figure>
${barsH(stutter, {
    title: 'Odsetek meczów z zacięciem, Android',
    color: C.s2, max: 100, labelW: 170,
    valueFn: (i) => `${pl(i.value)}%`,
    colorFn: (i) => (i.reliable ? C.s2 : '#f0b79b'),
})}
<figcaption class="cap">Udział meczów z p05 &lt; 45 fps, Android, od ${R.perf.recentFrom}, <strong>posortowane wg wielkości próby</strong>, nie wg wyniku. Jaśniejsze słupki mają
próbę poniżej 5 meczów — <strong>Miasto i Tropiki są na granicy anegdoty</strong> i wymagają playtestu na A54,
a nie decyzji z tej tabeli. Kierunek jest jednak spójny z ich budową (ciężkie propsy).</figcaption>
</figure>

<h3>Sprzęt w próbce</h3>
${table(['Konfiguracja', 'Meczów', 'Udział'], R.perf.hardware.map(h => [`<code>${esc(h.key)}</code>`, pl(h.n), `${pl(h.pct)}%`]))}
<p>Realnie testowaliśmy na <strong>jednym telefonie z Androidem</strong> (${R.perf.hardware.find(h => h.key.startsWith('K/'))?.n ?? 0} meczów)
i jednym iPhonie (1 mecz). Wszystkie wnioski mobilne opierają się więc na A54 — <strong>to za wąsko jak na produkt
komercyjny</strong> i jest to najważniejsza luka sprzętowa do zamknięcia przed Poki.</p>
</section>

<section class="pb">
<h2>8. Balans rosteru</h2>

<div class="callout blue">
  <h4>Jak czytać tę sekcję</h4>
  <p>To są dane z dzikiej gry — <strong>bez kontroli ziarna i bez kontroli umiejętności gracza</strong>.
  Nadają się na <em>sygnał</em> (co gracze wybierają i jak długo żyją), <strong>nie na strojenie liczb</strong>.
  Od strojenia jest STRZELNICA z KROKU 3. Dlatego każdy wiersz pokazuje rozstęp ćwiartkowy, nie samą medianę,
  a czołgi z próbą poniżej 15 meczów są wyszarzone.</p>
</div>

<figure>
${barsH(R.balance.map(b => ({ label: nm(b.brawler), value: b.n })), { title: 'Popularność czołgów', valueFn: (i) => `${i.value}` })}
<figcaption class="cap">Liczba meczów per czołg, 1–23.09.</figcaption>
</figure>

<figure>
${medianRange(balanceRows, { title: 'Zabicia na minutę — mediana i rozstęp ćwiartkowy', unit: '', fmtNum: pl })}
<figcaption class="cap">Mediana z pasmem p25–p75. Szerokie pasmo = duży rozrzut między meczami.</figcaption>
</figure>

<figure>
${medianRange(survivalRows, { title: 'Przeżywalność — mediana czasu meczu', unit: ' s', fmtNum: pl })}
<figcaption class="cap">Mediana długości meczu z pasmem p25–p75.</figcaption>
</figure>

${table(['Czołg', 'Meczów', 'Graczy', 'Mediana czasu', 'Zabicia/min', 'Mediana wyniku'], R.balance.map(b => [
    `${b.reliable ? '' : '<span class="muted">'}${nm(b.brawler)}${b.reliable ? '' : ' <em>(n&lt;15)</em></span>'}`,
    pl(b.n), pl(b.players), `${pl(b.medianSeconds)} s`, `<strong>${pl(b.killsPerMin)}</strong>`, pl(b.medianScore),
]))}

<div class="callout">
  <h4>Dwie skrajności widać gołym okiem</h4>
  <p><strong>Pyro</strong> to ${Math.round(R.balance[0].n / R.play.n * 100)}% wszystkich meczów,
  ${pl(R.balance[0].killsPerMin)} zabić na minutę i mediana wyniku ${pl(R.balance[0].medianScore)} —
  przy drugim w kolejności wyniku ${pl(R.balance.find(b => b.brawler === 'king')?.killsPerMin)} zabić/min.
  Gracze go wybierają, bo <em>działa</em>.</p>
  <p><strong>Twardy</strong> jest drugi pod względem liczby meczów (${R.balance.find(b => b.brawler === 'twardy')?.n}),
  a ma najgorsze wszystko: ${pl(R.balance.find(b => b.brawler === 'twardy')?.medianSeconds)} s życia,
  ${pl(R.balance.find(b => b.brawler === 'twardy')?.killsPerMin)} zabić/min i medianę wyniku
  ${pl(R.balance.find(b => b.brawler === 'twardy')?.medianScore)} — <strong>dziesięciokrotnie niższą niż Pyro</strong>.
  <strong>I to on jest czołgiem domyślnym</strong> — <code>BRAWLERS[0]</code> w <code>src/config/brawlers.ts:14</code>,
  a <code>HubShell.ts:81</code> ustawia go każdemu nowemu graczowi. Widać to nawet w liczbie graczy:
  Twardym grało 20 osób, Pyro 18 — <em>Twardego dotyka każdy, bo dostaje go bez wyboru</em>.
  Czyli <em>pierwsze wrażenie z gry robi najsłabszy czołg w stawce</em>.
  To wprost tłumaczy medianę meczu 36 s i sesje jednomeczowe z §4.</p>
</div>
</section>

<section class="pb">
<h2>9. Co wdrożyć, żeby graczom grało się lepiej</h2>
<p>Kolejność wynika z danych z tego raportu, nie z przepisania backlogu. Przy każdej pozycji podany dowód.</p>

<ol>
  <li><strong>Odblokować ranking Zamku i Królowej.</strong> <em>Dowód:</em> ${pl(R.scenarioGap.lostPct)}% rozgrywki
  (${R.scenarioGap.lostMatches} meczów) nie zostawia w bazie śladu. To jest KROK 2 planu i po tych liczbach
  przestaje być higieną, a staje się pozycją numer jeden.</li>

  <li><strong>Naprawić poziom „Łatwy”.</strong> <em>Dowód:</em> 36 s vs 38 s, 7 vs 7 zabić — brak różnicy wobec
  „Normalnego”. Najtańsza duża poprawa odczucia z gry dla najsłabszych graczy.</li>

  <li><strong>Zmienić czołg domyślny albo podnieść Twardego.</strong> <em>Dowód:</em> Twardy jest
  <code>BRAWLERS[0]</code>, czyli dostaje go każdy nowy gracz, i ma najgorsze wyniki w stawce —
  ${pl(R.balance.find(b => b.brawler === 'twardy')?.killsPerMin)} zabić/min i mediana wyniku
  ${pl(R.balance.find(b => b.brawler === 'twardy')?.medianScore)} przy Pyro ${pl(R.balance[0].killsPerMin)} i
  ${pl(R.balance[0].medianScore)}. Pierwsze 60 sekund z grą decydują o powrocie, a dziś rozgrywa je najsłabszy czołg.</li>

  <li><strong>Zająć się ogonem klatek (p05), nie średnią.</strong> <em>Dowód:</em> p50 = 57 przechodzi bramkę,
  ale ${pl(R.perf.stutterAndroidPct)}% meczów na Androidzie ma spadek poniżej 45 fps.</li>

  <li><strong>Zweryfikować Miasto i Tropiki na A54 playtestem.</strong> <em>Dowód:</em> 100% meczów z zacięciem
  w obu — ale przy n=2 i n=1. Za mało na decyzję, za dużo na zignorowanie.</li>

  <li><strong>Rozłożyć ruch po mapach.</strong> <em>Dowód:</em> Pustynia ${pl(R.play.map[0].pct)}%, Tropiki
  ${pl(R.play.map.find(m => m.key === 'tropics')?.pct ?? 0)}% — a Pustynia jest mapą domyślną
  (<code>AVAILABLE_MAPS[0]</code>). Poprawka jest jednolinijkowa i uwalnia cztery gotowe mapy.</li>

  <li><strong>Podłączyć tabelę <code>sessions</code> i wypełnić <code>match_id</code>.</strong> <em>Dowód:</em>
  0 wierszy w <code>sessions</code> i ${R.hygiene.emptyMatchId} z ${R.sources.scores.rows} wyników bez
  <code>match_id</code>. Dziś długość sesji musimy zgadywać z odstępów między meczami.</li>

  <li><strong>Wdrożyć generator nicków (v0.203.0).</strong> <em>Dowód:</em> ${f.profiles - f.withScore} z ${f.profiles}
  profili nie zagrało ani jednego meczu. Generator nie jest udowodnioną przyczyną, ale usuwa jedną z niewielu
  rzeczy, które mogą zniechęcić <em>przed</em> pierwszym meczem — komunikat „Pseudonim zajęty” jako pierwszą
  interakcję z grą.</li>

  <li><strong>Włączyć Cloudflare Web Analytics przed następnym testem.</strong> <em>Dowód:</em> górnego lejka
  z tych testów nie da się już odzyskać. Koszt: jedno pole w panelu.</li>
</ol>
</section>

<section>
<h2>10. Higiena danych i znaleziska techniczne</h2>

${table(['Znalezisko', 'Skala', 'Znaczenie'], [
    ['Tabela <code>sessions</code> pusta', '0 wierszy', 'Brak zapisu w kodzie — patrz niżej'],
    ['<code>match_id</code> nigdy niewypełniane', `${R.hygiene.emptyMatchId} / ${R.sources.scores.rows}`, 'Kolumna z Z0.7a istnieje, klient jej nie pisze'],
    ['Wyniki z <code>game_seconds = 0</code>', pl(R.hygiene.zeroSecondScores), 'Wiersze historyczne (score_version 1–2), poza oknem testów'],
    ['Profile bez wiersza progresji', `${R.hygiene.profilesWithoutProgression} / ${R.sources.profiles.rows}`, 'Profil założony, progresja nigdy niezsynchronizowana'],
    ['Profile deweloperskie', pl(R.hygiene.devProfiles.length), 'Odfiltrowane z lejka (<code>Bot…</code>, <code>T2</code>)'],
    ['Rozkład <code>score_version</code>', R.hygiene.scoreVersionAll.map(v => `v${v.key}: ${v.n}`).join(' · '), 'Bump 4→5 ukryje 651 wierszy w rankingu'],
])}

<div class="callout crit">
  <h4>Diagnoza: dlaczego <code>sessions</code> jest pusta</h4>
  <p><strong>Nic w kodzie nigdy do niej nie pisało.</strong> W całym <code>src/</code> i we wszystkich Edge
  Functions nie ma ani jednego zapisu do tej tabeli. Mylące jest nazewnictwo:
  <code>SessionService.ts</code> mimo nazwy obsługuje wyłącznie <code>localStorage</code> dla skrótu „Kontynuuj”
  w hubie i nie ma nic wspólnego z Supabase.</p>
  <p>Tabela powstała w <code>supabase/schema.sql:115</code> z komentarzem „analytics, opcjonalne” i nigdy nie
  została podłączona. <code>scores.session_id</code> jest wypełniany UUID-em z <code>GameConfig</code>, ale
  odpowiadający wiersz w <code>sessions</code> nie powstaje — to sierota.</p>
  <p><strong>Skutek dla tego raportu:</strong> długość sesji i odsetek porzuconych meczów musiałem odtworzyć
  z odstępów między wynikami (§4). To działa, ale jest dolną granicą — nie widzimy czasu w menu, garażu ani sklepie.</p>
</div>
</section>

<section>
<h2>11. Metodologia i ograniczenia</h2>
<ul>
  <li><strong>Okno:</strong> 1–23.09.2026 włącznie, czas UTC (tak trzyma je baza).</li>
  <li><strong>Percentyle:</strong> metodą „nearest-rank”, bez interpolacji — każda podana wartość jest
  rzeczywistą obserwacją z danych, nie liczbą wyliczoną pomiędzy.</li>
  <li><strong>Dzień 20.09</strong> wyłączony z lejka i retencji jako ruch deweloperski (potwierdzone),
  ale <em>zostawiony</em> w wydajności i balansie — tam mecz jest meczem niezależnie od tego, kto grał.</li>
  <li><strong>Wydajność liczona od v0.186.0.</strong> Wcześniejsze pomiary są sprzed naprawy VRAM-u i dawałyby
  fałszywy obraz (przypadek Marsa opisany w §7).</li>
  <li><strong>Wysokie p50 na desktopie</strong> (83–156 fps w niektórych wersjach) to monitory 120/144 Hz po
  zdjęciu własnego limitera klatek, nie błąd pomiaru. Dlatego bramka opiera się na medianie, nie na średniej.</li>
  <li><strong>Próg wiarygodności:</strong> n &lt; 15 dla czołgów i n &lt; 5 dla map oznaczone wizualnie.
  Liczby poniżej tych progów są orientacyjne i nie powinny same uzasadniać zmiany.</li>
  <li><strong>Czego te dane nie mówią:</strong> ilu ludzi otworzyło grę i nie założyło profilu (brak Web Analytics),
  ile czasu gracz spędził poza meczem (martwa tabela <code>sessions</code>), oraz jak grało się w Zamek i Królową
  pod względem wyników (§5).</li>
  <li><strong>Dane balansowe nie służą do strojenia liczb</strong> — brak kontroli ziarna i umiejętności gracza.
  Do tego jest STRZELNICA z KROKU 3 planu.</li>
</ul>
<p class="muted" style="margin-top:5mm">Wygenerowano automatycznie z <code>tools/analysis/</code> ·
dane źródłowe: <code>docs/reports/report-data.json</code> · raport odtwarzalny komendą <code>npm run analysis</code>.</p>
</section>

</div></body></html>`;

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'WYNIKI_TESTOW_2026-09-01_23.html');
fs.writeFileSync(file, html, 'utf8');
console.log(`-> ${path.relative(REPO, file)} (${Math.round(html.length / 1024)} kB)`);
