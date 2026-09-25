/**
 * range.mjs — STRZELNICA: pomiar 8 czolgow x {v1, v2} x N ziaren przez SigmaTester (v0.209.0).
 *
 * WHY: baseline.mjs (KTB, 2 min) daje 22-82 zabic tym samym czolgiem — szum wiekszy niz strojone
 * roznice. Strzelnica = stale stanowiska, zero losowych spawnow, czas w krokach logiki, wiec
 * ten sam czolg na tym samym ziarnie daje TEN SAM wynik, a rozne ziarna roznia sie tylko
 * predkoscia wrogow (worldRng). Porownanie v1 vs v2 idzie PARAMI na tych samych ziarnach.
 *
 * USAGE (dev-server musi chodzic):
 *   node tools/balance/range.mjs [--seeds 3] [--url http://localhost:5173/BrawlTanksv2/]
 *                                [--brawlers twardy,heavy] [--rulesets 0,1] [--out tools/balance/range-YYYY-MM-DD]
 *
 * WYJSCIE: <out>.json (surowe raporty per run) + <out>.md (tabele parami + histogram dystansow).
 * Kryterium NARZEDZIA: rozrzut TTC miedzy ziarnami tego samego czolgu < 10% — jesli wiecej,
 * to narzedzie jest do poprawy, nie roster.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };

const BRAWLERS = (arg('brawlers', 'twardy,heavy,scout,sniper,plasma,pyro,shadow,king')).split(',');
const RULESETS = (arg('rulesets', '0,1')).split(',').map(Number); // 0 = v1 (prod), 1 = v2 (?bal=1)
const SEEDS = Number(arg('seeds', 3));
const BASE_URL = arg('url', 'http://localhost:5173/BrawlTanksv2/');
const day = new Date().toISOString().slice(0, 10);
const OUT = arg('out', `tools/balance/range-${day}`);
const reportDir = join('reports', day);

// smooth=1 = staly krok logiki (delta=1). Bez tego wygladzanie delty w pierwszych klatkach po
// starcie dawalo 429 vs 436 krokow na S1 przy tym samym ziarnie (S2/S3 juz identyczne).
const urlFor = (bal) => BASE_URL + (BASE_URL.includes('?') ? '&' : '?') + 'bal=' + bal + '&smooth=1';

const rows = [];
let n = 0;
const total = BRAWLERS.length * RULESETS.length * SEEDS;
for (const bal of RULESETS) {
    for (const brawler of BRAWLERS) {
        for (let s = 0; s < SEEDS; s++) {
            const seed = 7100 + s; // staly blok ziaren: te same predkosci wrogow dla v1 i v2
            n++;
            process.stdout.write(`[${n}/${total}] v${bal + 1} ${brawler} seed=${seed} ... `);
            const r = spawnSync(process.execPath, [
                'tools/sigma-tester/run.mjs', '--url', urlFor(bal),
                '--scenario', 'range', '--map', 'arctic', '--brawler', brawler,
                '--diff', 'normal', '--seed', String(seed), '--minutes', '4', '--mode', 'range',
            ], { encoding: 'utf8' });
            if (r.status !== 0) { console.log('BLAD'); console.log((r.stderr || '').slice(0, 400)); continue; }
            // Runner numeruje od 001 per wywolanie i nadpisuje — dopasuj po brawler+seed+mode, najswiezszy.
            const file = readdirSync(reportDir)
                .filter(f => f.endsWith('.json') && f.includes(`-range-`) && f.includes(`-${brawler}-`) && f.includes(`s${seed}.json`))
                .map(f => ({ f, t: statSync(join(reportDir, f)).mtimeMs }))
                .sort((a, b) => b.t - a.t)[0]?.f;
            if (!file) { console.log('brak raportu'); continue; }
            const j = JSON.parse(readFileSync(join(reportDir, file), 'utf8'));
            const rep = j.range;
            if (!rep || !rep.stations?.length) { console.log('brak raportu strzelnicy w JSON'); continue; }
            const row = { brawler, ruleset: bal ? 'v2' : 'v1', seed, outcome: j.outcome, layout: rep.layout, done: rep.done, totalSteps: rep.totalSteps, stations: rep.stations, file };
            rows.push(row);
            console.log(rep.stations.map(st => `${st.id}=${st.seconds}s${st.timedOut ? '(T)' : ''}`).join(' ') + ` acc=${rep.stations.map(st => st.accuracy ?? '-').join('/')}`);
        }
    }
}

// ── agregacja ────────────────────────────────────────────────────────────────
const STATIONS = ['targets', 'assault', 'boss'];
const med = a => { const b = a.filter(x => x != null && Number.isFinite(x)).slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const mean = a => { const b = a.filter(x => x != null && Number.isFinite(x)); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : null; };
const fmt = (x, d = 1) => x == null ? '-' : Number(x).toFixed(d);
const stat = (row, id) => row.stations.find(s => s.id === id);

const agg = {}; // agg[ruleset][brawler] = { ttc: {station: median sec}, spreadPct, acc, dps, dmgTaken, timeouts }
for (const rs of ['v1', 'v2']) {
    agg[rs] = {};
    for (const b of BRAWLERS) {
        const mine = rows.filter(r => r.brawler === b && r.ruleset === rs);
        if (!mine.length) continue;
        const ttc = {}, spread = {};
        for (const id of STATIONS) {
            const secs = mine.map(r => stat(r, id)?.seconds ?? null);
            ttc[id] = med(secs);
            const ok = secs.filter(x => x != null);
            spread[id] = ok.length > 1 && Math.min(...ok) > 0 ? ((Math.max(...ok) - Math.min(...ok)) / Math.min(...ok)) * 100 : 0;
        }
        const total = mine.map(r => r.totalSteps / 60);
        agg[rs][b] = {
            runs: mine.length,
            ttc, spread,
            totalSec: med(total),
            acc: med(mine.flatMap(r => r.stations.map(s => s.accuracy))),
            dpsTargets: med(mine.map(r => stat(r, 'targets')?.dps)),
            dpsBoss: med(mine.map(r => stat(r, 'boss')?.dps)),
            dmgTakenAssault: med(mine.map(r => stat(r, 'assault')?.dmgTaken)),
            rescues: mine.reduce((sum, r) => sum + r.stations.reduce((x, st) => x + (st.rescues ?? 0), 0), 0),
            timeouts: mine.reduce((s, r) => s + r.stations.filter(x => x.timedOut).length, 0),
            deaths: mine.filter(r => r.outcome === 'gameover').length,
        };
    }
}

// histogram dystansow zabic (S2 natarcie) per ruleset, kubelki 100 px
const hist = {};
for (const rs of ['v1', 'v2']) {
    const d = rows.filter(r => r.ruleset === rs).flatMap(r => stat(r, 'assault')?.killDistances ?? []);
    const buckets = {};
    for (const x of d) { const k = Math.floor(x / 100) * 100; buckets[k] = (buckets[k] || 0) + 1; }
    hist[rs] = { n: d.length, median: med(d), mean: mean(d), buckets };
}

// ── markdown ─────────────────────────────────────────────────────────────────
let md = `# STRZELNICA — ${day} · layout ${rows[0]?.layout ?? '?'} · ziarna ${SEEDS} · ${rows.length} runow\n\n`;
md += `Czas = mediana sekund do wyczyszczenia stanowiska (60 Hz kroki logiki). (T) = timeouty w runach. Rozrzut = (max−min)/min miedzy ziarnami.\n\n`;
md += `## Czas wyczyszczenia (s) — v1 vs v2 parami\n\n| czolg | S1 tarcze v1 | v2 | S2 natarcie v1 | v2 | S3 boss v1 | v2 | suma v1 | v2 | rozrzut max % |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
for (const b of BRAWLERS) {
    const a1 = agg.v1[b], a2 = agg.v2[b];
    const c = (a, id) => a ? `${fmt(a.ttc[id])}${a.timeouts ? '' : ''}` : '-';
    const sp = Math.max(...[a1, a2].filter(Boolean).flatMap(a => Object.values(a.spread)));
    md += `| ${b} | ${c(a1, 'targets')} | ${c(a2, 'targets')} | ${c(a1, 'assault')} | ${c(a2, 'assault')} | ${c(a1, 'boss')} | ${c(a2, 'boss')} | ${fmt(a1?.totalSec)} | ${fmt(a2?.totalSec)} | ${fmt(sp, 0)} |\n`;
}
md += `\n## Celnosc, DPS, presja\n\n| czolg | acc v1 | v2 | DPS tarcze v1 | v2 | DPS boss v1 | v2 | dmg otrzymane S2 v1 | v2 | ratunki v1/v2 | timeouty v1/v2 | zgony v1/v2 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
for (const b of BRAWLERS) {
    const a1 = agg.v1[b], a2 = agg.v2[b];
    md += `| ${b} | ${fmt(a1?.acc)} | ${fmt(a2?.acc)} | ${fmt(a1?.dpsTargets, 0)} | ${fmt(a2?.dpsTargets, 0)} | ${fmt(a1?.dpsBoss, 0)} | ${fmt(a2?.dpsBoss, 0)} | ${fmt(a1?.dmgTakenAssault, 0)} | ${fmt(a2?.dmgTakenAssault, 0)} | ${a1?.rescues ?? '-'}/${a2?.rescues ?? '-'} | ${a1?.timeouts ?? '-'}/${a2?.timeouts ?? '-'} | ${a1?.deaths ?? '-'}/${a2?.deaths ?? '-'} |\n`;
}
for (const rs of ['v1', 'v2']) {
    const h = hist[rs];
    if (!h.n) continue;
    md += `\n## Dystans zabic S2 (bot, ${rs}) — n=${h.n}, mediana ${fmt(h.median, 0)} px, srednia ${fmt(h.mean, 0)} px\n\n| kubelek | n | |\n|---|---:|---|\n`;
    const keys = Object.keys(h.buckets).map(Number).sort((a, b) => a - b);
    for (const k of keys) md += `| ${k}–${k + 99} | ${h.buckets[k]} | ${'█'.repeat(Math.min(40, h.buckets[k]))} |\n`;
}
md += `\n> Sanity: Snajper powinien byc najlepszy na 450 px (S1), Ogniarz (v2, zasieg 350) najgorszy tam. Jesli nie — blad pomiaru, nie balansu.\n`;
md += `> Rozrzut miedzy ziarnami > 10% = narzedzie do poprawy. Dystanse BOTA nie kalibruja wag modelu — do tego sluza runy CZLOWIEKA (?range=1&seed=7).\n`;

writeFileSync(OUT + '.json', JSON.stringify({ when: new Date().toISOString(), url: BASE_URL, seeds: SEEDS, rulesets: RULESETS, rows, agg, hist }, null, 1));
writeFileSync(OUT + '.md', md);
console.log('\n' + md);
console.log('zapisano: ' + OUT + '.json / .md');
