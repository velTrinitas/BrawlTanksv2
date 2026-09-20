/**
 * baseline.mjs - empirical roster measurement via SigmaTester.
 *
 * WHY: the solver is a HYPOTHESIS. It does not know enemy AI, scenarios, loadout powers or how a
 * human plays. The only way to tell whether "equal index" means "equally strong in the actual game"
 * is to run the bot on every brawler, before and after the change, and compare.
 *
 * RUN IT BEFORE TOUCHING GAMEPLAY CODE - without a baseline there is nothing to compare against.
 *
 * USAGE:
 *   node tools/balance/baseline.mjs --out tools/balance/baseline-v1.json [--seeds 5] [--minutes 2]
 *                                   [--url http://localhost:5173/BrawlTanksv2/] [--bal 1]
 *
 * `--bal 1` appends ?bal=1 to the game URL, i.e. measures the NEW ruleset (after BALANCE_V2 lands).
 * Same command otherwise, so before/after runs are directly comparable.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };

const BRAWLERS = ['twardy', 'heavy', 'scout', 'sniper', 'plasma', 'pyro', 'shadow', 'king'];
const SEEDS = Number(arg('seeds', 5));
const MINUTES = arg('minutes', '2');
const BAL = arg('bal', '');
const BASE_URL = arg('url', 'http://localhost:5173/BrawlTanksv2/');
const URL_WITH_FLAG = BAL ? BASE_URL + (BASE_URL.includes('?') ? '&' : '?') + 'bal=' + BAL : BASE_URL;
const OUT = arg('out', 'tools/balance/baseline-v1.json');

const day = new Date().toISOString().slice(0, 10);
const reportDir = join('reports', day);

const rows = [];
let n = 0;
const total = BRAWLERS.length * SEEDS;

for (const brawler of BRAWLERS) {
    for (let s = 0; s < SEEDS; s++) {
        const seed = 4100 + s;           // fixed seed block: the same fights before and after
        n++;
        process.stdout.write(`[${n}/${total}] ${brawler} seed=${seed} ... `);
        const r = spawnSync(process.execPath, [
            'tools/sigma-tester/run.mjs', '--url', URL_WITH_FLAG,
            '--scenario', 'ktb', '--map', 'city', '--brawler', brawler,
            '--diff', 'normal', '--seed', String(seed), '--minutes', MINUTES, '--mode', 'play',
        ], { encoding: 'utf8' });
        if (r.status !== 0) { console.log('BLAD'); console.log((r.stderr || '').slice(0, 400)); continue; }

        // Report file: the runner restarts numbering at 001 on EVERY invocation and overwrites,
        // so "newest file that did not exist before" is wrong - a same-named file from an earlier
        // run of the day is already in `seen` and the row gets silently dropped (that bug cost one
        // run per brawler in the first baseline). Match by brawler+seed and take the freshest.
        const file = readdirSync(reportDir)
            .filter(f => f.endsWith('.json') && f.includes(`-${brawler}-`) && f.includes(`s${seed}.json`))
            .map(f => ({ f, t: statSync(join(reportDir, f)).mtimeMs }))
            .sort((a, b2) => b2.t - a.t)[0]?.f;
        if (!file) { console.log('brak raportu'); continue; }
        const j = JSON.parse(readFileSync(join(reportDir, file), 'utf8'));
        const row = {
            brawler, seed,
            kills: j.kills ?? j.result?.kills ?? null,
            score: j.score ?? j.result?.score ?? null,
            seconds: j.seconds ?? j.result?.seconds ?? null,
            died: j.died ?? j.result?.died ?? null,
            deathAtSec: j.deathAtSec ?? j.result?.deathAtSec ?? null,
            bossKills: j.bossKills ?? j.result?.bossKills ?? null,
            file,
        };
        rows.push(row);
        console.log(`kille=${row.kills} wynik=${row.score} zgon=${row.died ? row.deathAtSec + 's' : 'nie'}`);
    }
}

// ── aggregate per brawler: median is the honest statistic here (one lucky run must not move it) ──
const med = a => { const b = a.filter(x => x != null).slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const perBrawler = {};
for (const b of BRAWLERS) {
    const mine = rows.filter(r => r.brawler === b);
    perBrawler[b] = {
        runs: mine.length,
        killsMed: med(mine.map(r => r.kills)),
        scoreMed: med(mine.map(r => r.score)),
        deaths: mine.filter(r => r.died).length,
        deathAtSecMed: med(mine.filter(r => r.died).map(r => r.deathAtSec)),
    };
}
const kills = Object.values(perBrawler).map(x => x.killsMed).filter(x => x != null);
const spread = kills.length ? (Math.max(...kills) / Math.max(1, Math.min(...kills)) - 1) * 100 : null;

writeFileSync(OUT, JSON.stringify({
    when: new Date().toISOString(), url: URL_WITH_FLAG, seeds: SEEDS, minutes: MINUTES,
    perBrawler, rows, killsSpreadPct: spread,
}, null, 2));

console.log('\nMEDIANY (kille / wynik / zgony):');
for (const b of BRAWLERS) {
    const x = perBrawler[b];
    console.log('  ' + b.padEnd(8) + String(x.killsMed).padStart(4) + String(x.scoreMed).padStart(8) + '   zgony ' + x.deaths + '/' + x.runs);
}
console.log('\nrozrzut median kill: ' + (spread == null ? '-' : spread.toFixed(1) + '%'));
console.log('zapisano: ' + OUT);
