#!/usr/bin/env node
/**
 * SigmaTester S4 — raport dzienny z persona ("marudny 10-latek") wg sekcji O checklisty
 * (docs/sigma-tester/ORACLES.md: O1 naglowek, O2 bugi+RICE, O3 balans, O4 glos persony, O5 dostawa).
 *
 * Wejscie: reports/<dzien>/NNN-*.json (per mecz z run.mjs) + PNG. Wyjscie: reports/<dzien>/DAILY.md,
 * aggregate.json (czysta agregacja, zero LLM), prompt.md + llm-output.md (audyt), notion-comment.md.
 *
 * Uzycie:
 *   npm run sigma:report                       # najnowszy dzien w reports/, backend auto
 *   npm run sigma:report -- --day 2026-09-15 --dry-run        # bez LLM (zero kosztu, CI)
 *   npm run sigma:report -- --backend cli --model opus         # claude -p (subskrypcja Max, lokalnie)
 *   npm run sigma:report -- --backend sdk                      # @anthropic-ai/sdk + ANTHROPIC_API_KEY (.env.local)
 *   opcje: --day --out --backend auto|cli|sdk --model --dry-run --max-shots 8 --notion
 *
 * Backendy LLM:
 *   cli — `claude -p --output-format text --allowedTools Read` (stdin = prompt; zrzuty czyta narzedziem Read).
 *         Zero dodatkowego kosztu (limit Maxa). Dziala tylko tam, gdzie jest zalogowany Claude Code.
 *   sdk — @anthropic-ai/sdk (dynamic import, NIE jest w package.json — `npm i -D @anthropic-ai/sdk`),
 *         klucz z ANTHROPIC_API_KEY (report.mjs doczyta .env.local, jesli brak w env). Obrazy jako base64.
 * auto = sdk gdy jest klucz, inaczej cli.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true'] : []).filter(Boolean));
const OUT_ROOT = path.resolve(REPO, args.out ?? 'reports');
const DRY = args['dry-run'] === 'true';
const MAX_SHOTS = Number(args['max-shots'] ?? 8);

// ── 1. wejscie ───────────────────────────────────────────────────────────
function latestDay() {
    const days = fs.existsSync(OUT_ROOT) ? fs.readdirSync(OUT_ROOT).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
    if (!days.length) throw new Error(`brak katalogow dziennych w ${OUT_ROOT} — odpal najpierw npm run sigma`);
    return days[days.length - 1];
}
const DAY = args.day ?? latestDay();
const DIR = path.join(OUT_ROOT, DAY);
if (!fs.existsSync(DIR)) throw new Error(`brak katalogu ${DIR}`);

const runs = fs.readdirSync(DIR).filter(f => /^\d{3}-.*\.json$/.test(f)).sort().map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); }
    catch (err) { console.error(`[report] zly JSON ${f}: ${err.stack}`); return null; }
}).filter(Boolean);
if (!runs.length) throw new Error(`brak przebiegow NNN-*.json w ${DIR}`);

// ── 2. agregacja (czysty JS) ─────────────────────────────────────────────
const median = (xs) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const fmt = (v, d = 0) => v === null || v === undefined || Number.isNaN(v) ? 'n/d' : Number(v).toFixed(d);
const pct = (n, d) => d ? `${Math.round(100 * n / d)}%` : 'n/d';
const countBy = (xs, key) => xs.reduce((a, x) => { const k = String(key(x)); a[k] = (a[k] ?? 0) + 1; return a; }, {});
const table = (head, rows) => rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(c => String(c ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`)].join('\n') : '_brak danych_';

const ok = runs.filter(r => r.outcome !== 'runner-error');
const runnerErrors = runs.filter(r => r.outcome === 'runner-error');

// O1
const o1 = {
    day: DAY, matches: runs.length, runnerErrors: runnerErrors.length,
    builds: [...new Set(runs.map(r => r.build).filter(Boolean))],
    perScenario: countBy(runs, r => r.scenario), perMap: countBy(runs, r => r.map), perBrawler: countBy(runs, r => r.brawler),
    perDiff: countBy(runs, r => r.diff), perMode: countBy(runs, r => `${r.mode}${r.mobile ? '+mobile' : ''}`),
    seeds: runs.map(r => r.seed), totalMatchSec: ok.reduce((a, r) => a + (r.matchSec ?? 0), 0),
    consoleErrors: runs.reduce((a, r) => a + (r.consoleErrors?.length ?? 0), 0),
};

// O2: klastry (dedup id|scenariusz|mapa — 1:1 z summarize() w run.mjs) + zrzuty meczu
const clusters = {};
for (const r of runs) for (const v of r.violations ?? []) {
    const k = `${v.id}|${r.scenario}|${r.map}`;
    const c = (clusters[k] ??= { id: v.id, severity: v.severity, scenario: r.scenario, map: r.map, n: 0, seeds: new Set(), runs: new Set(), sample: v.msg, frame: v.frame, shots: new Set() });
    c.n++; c.seeds.add(r.seed); c.runs.add(r.runId);
    if (v.severity < c.severity) c.severity = v.severity; // 'P0' < 'P1' leksykalnie
    for (const s of r.screenshots ?? []) c.shots.add(s);
}
const o2 = Object.values(clusters).map(c => ({ ...c, seeds: [...c.seeds], runs: [...c.runs], shots: [...c.shots] })).sort((a, b) => a.severity.localeCompare(b.severity) || b.n - a.n);

// O3: balans per scenariusz i per brawler (bot gra przewidywalnie => dolna granica trudnosci, nie prawda o graczu)
const bySc = {};
for (const r of ok) {
    const b = (bySc[r.scenario] ??= { n: 0, deaths: 0, wins: 0, timeouts: 0, ttd: [], kills: 0, sec: 0, boss: 0, bossKnown: false, heapStart: [], heapEnd: [], score: [] });
    b.n++; b.kills += r.kills ?? 0; b.sec += r.matchSec ?? 0; b.score.push(r.score ?? 0);
    if (r.outcome === 'victory') b.wins++; if (r.outcome === 'timeout') b.timeouts++;
    if (r.playerDied) { b.deaths++; b.ttd.push(r.deathAtSec ?? r.matchSec); }
    if (typeof r.bossKills === 'number') { b.bossKnown = true; b.boss += r.bossKills; }
    const tl = r.timeline ?? []; if (tl.length) { b.heapStart.push(tl[0].heap); b.heapEnd.push(tl[tl.length - 1].heap); }
}
const o3 = Object.entries(bySc).map(([sc, b]) => ({
    scenario: sc, n: b.n, deaths: b.deaths, winRate: pct(b.wins, b.n), timeouts: b.timeouts, ttdMedian: median(b.ttd),
    killsPerMin: b.sec ? b.kills / (b.sec / 60) : null, scoreMedian: median(b.score),
    bossKills: b.bossKnown ? b.boss : null, heapStart: median(b.heapStart), heapEnd: median(b.heapEnd),
}));
const byBrawler = {};
for (const r of ok) { const b = (byBrawler[r.brawler] ??= { n: 0, ttd: [], wins: 0, kills: 0, sec: 0 }); b.n++; b.kills += r.kills ?? 0; b.sec += r.matchSec ?? 0; if (r.outcome === 'victory') b.wins++; if (r.playerDied) b.ttd.push(r.deathAtSec ?? r.matchSec); }
const o3b = Object.entries(byBrawler).map(([br, b]) => ({ brawler: br, n: b.n, ttdMedian: median(b.ttd), winRate: pct(b.wins, b.n), killsPerMin: b.sec ? b.kills / (b.sec / 60) : null }));

// K3: nuda (>= 20 s bez zmiany wyniku za zycia), szybka smierc (< 15 s), heatmapa smierci = seed+scenariusz
const k3 = { boredom: [], earlyDeaths: [], deaths: [] };
for (const r of ok) {
    const tl = r.timeline ?? [];
    let runStart = -1, lastScore = null;
    for (let i = 0; i < tl.length; i++) {
        const t = tl[i]; if (t.hp !== null && t.hp <= 0) break;
        if (t.score === lastScore) { if (runStart < 0) runStart = i - 1; }
        else { if (runStart >= 0 && i - runStart >= 20) k3.boredom.push({ runId: r.runId, fromSec: runStart, seconds: i - runStart }); runStart = -1; }
        lastScore = t.score;
    }
    if (runStart >= 0 && tl.length - runStart >= 20) k3.boredom.push({ runId: r.runId, fromSec: runStart, seconds: tl.length - runStart });
    if (r.playerDied) { const at = r.deathAtSec ?? r.matchSec; k3.deaths.push({ runId: r.runId, scenario: r.scenario, seed: r.seed, atSec: at }); if (at < 15) k3.earlyDeaths.push({ runId: r.runId, scenario: r.scenario, seed: r.seed, atSec: at }); }
}

// checklista: id z kontraktu vs zaimplementowane vs naruszone
const contractPath = path.join(REPO, 'docs', 'sigma-tester', 'ORACLES.md');
// sekcja O = schemat raportu (realizuje ten plik), nie oracle — poza checklista
const contractIds = fs.existsSync(contractPath) ? [...fs.readFileSync(contractPath, 'utf8').matchAll(/^- \[ \] \*\*([A-Z]\d+)[^*]*\*\*/gm)].map(m => m[1]).filter(id => !id.startsWith('O')) : [];
const implemented = new Set(runs.flatMap(r => (r.oracleIds ?? []).map(o => o.id)));
const violated = new Set(o2.map(c => c.id));
const checklist = contractIds.map(id => ({ id, status: violated.has(id) ? '❌' : implemented.has(id) ? '✅' : '⏭' }));

// zrzuty dla LLM: mecze z naruszeniami > smierci > timeouty > starty; mobile zawsze
function pickShots() {
    const score = (r, s) => (r.violations?.length ? 40 : 0) + (r.mobile ? 30 : 0) + (/-hud\.png$/.test(s) ? 25 : /-death\.png$/.test(s) ? 20 : /-end\.png$/.test(s) ? 15 : /-(timeout|error|portrait)\.png$/.test(s) ? 10 : 2);
    const all = runs.flatMap(r => (r.screenshots ?? []).map(s => ({ run: r, file: s, score: score(r, s) })));
    const seen = new Set();
    return all.filter(x => fs.existsSync(path.join(DIR, x.file))).sort((a, b) => b.score - a.score)
        .filter(x => { const k = x.run.runId + x.file.replace(/.*-(\w+)\.png$/, '$1'); if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, MAX_SHOTS).map(x => ({ file: x.file, abs: path.join(DIR, x.file), runId: x.run.runId, scenario: x.run.scenario, map: x.run.map, seed: x.run.seed, outcome: x.run.outcome, matchSec: x.run.matchSec, violations: x.run.violations?.length ?? 0, mobile: !!x.run.mobile, tag: x.file.replace(/.*-(\w+)\.png$/, '$1') }));
}
const shots = pickShots();

const aggregate = { day: DAY, o1, o2, o3, o3b, k3, checklist, shots, runs: runs.map(r => ({ runId: r.runId, build: r.build, scenario: r.scenario, map: r.map, brawler: r.brawler, diff: r.diff, seed: r.seed, mode: r.mode, mobile: r.mobile, outcome: r.outcome, matchSec: r.matchSec, score: r.score, kills: r.kills, playerDied: r.playerDied, deathAtSec: r.deathAtSec, bossKills: r.bossKills, powersUsed: r.powersUsed, maxWave: r.maxWave, violations: (r.violations ?? []).length, consoleErrors: (r.consoleErrors ?? []).length, error: r.error ? String(r.error).slice(0, 300) : undefined })) };
fs.writeFileSync(path.join(DIR, 'aggregate.json'), JSON.stringify(aggregate, null, 1));

// ── 3. sekcje z agregacji (markdown) ─────────────────────────────────────
const kv = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ') || 'brak';
const mdO1 = [
    `- **Mecze:** ${o1.matches} (${Math.round(o1.totalMatchSec / 60)} min gry botem)${o1.runnerErrors ? `, **bledy runnera: ${o1.runnerErrors}**` : ''}, bledy konsoli/HTTP: ${o1.consoleErrors}`,
    `- **Build:** ${o1.builds.join(', ') || '?'} · **seedy:** ${o1.seeds.join(', ')}`,
    `- **Scenariusze:** ${kv(o1.perScenario)} · **mapy:** ${kv(o1.perMap)}`,
    `- **Brawlerzy:** ${kv(o1.perBrawler)} · **trudnosc:** ${kv(o1.perDiff)} · **tryby bota:** ${kv(o1.perMode)}`,
].join('\n');
const mdRuns = table(['run', 'wynik', 's', 'kille', 'zgon @s', 'boss', 'moce', 'fala', 'viol.', 'err'], aggregate.runs.map(r => [r.runId, r.outcome, r.matchSec ?? '-', r.kills ?? '-', r.playerDied ? fmt(r.deathAtSec ?? r.matchSec) : '-', r.bossKills ?? 'n/d', r.powersUsed ?? 'n/d', r.maxWave ?? '-', r.violations, r.consoleErrors]));
// S5a: log fal Zamku (co 5 s) — rozstrzyga "brak postepu fali": bot nie jedzie do wrogow czy fala stoi
const mdWaves = runs.filter(r => r.scenario === 'castle' && r.timeline?.length).map(r => `- **${r.runId}:** ` + r.timeline.filter((t, i) => i % 5 === 0).map((t, i) => `${i * 5}s F${t.wave ?? '?'}/${t.ea ?? '?'}w`).join(' · ')).join('\n') || '_brak meczow Zamku_';
const mdO2 = table(['sev', 'id', 'scenariusz', 'mapa', 'ile', 'seedy (repro)', 'klatka', 'przyklad', 'zrzuty'], o2.map(c => [c.severity, c.id, c.scenario, c.map, c.n, c.seeds.join(','), c.frame, c.sample.slice(0, 140), c.shots.slice(0, 3).join(' ')]));
const mdO3 = table(['scenariusz', 'mecze', 'zgony', 'win-rate', 'timeouty', 'mediana czasu do smierci [s]', 'kille/min', 'mediana pkt', 'bossy', 'heap MB start→koniec'], o3.map(b => [b.scenario, b.n, b.deaths, b.winRate, b.timeouts, fmt(b.ttdMedian), fmt(b.killsPerMin, 1), fmt(b.scoreMedian), b.bossKills ?? 'n/d', `${fmt(b.heapStart)}→${fmt(b.heapEnd)}`]));
const mdO3b = table(['brawler', 'mecze', 'mediana czasu do smierci [s]', 'win-rate', 'kille/min'], o3b.map(b => [b.brawler, b.n, fmt(b.ttdMedian), b.winRate, fmt(b.killsPerMin, 1)]));
const mdK3 = [
    `- **Szybkie zgony (< 15 s):** ${k3.earlyDeaths.length ? k3.earlyDeaths.map(d => `${d.scenario} seed ${d.seed} @${fmt(d.atSec)} s`).join('; ') : 'brak'}`,
    `- **Nuda (>= 20 s bez zmiany wyniku za zycia):** ${k3.boredom.length ? k3.boredom.map(b => `${b.runId} od ${b.fromSec} s przez ${b.seconds} s`).join('; ') : 'brak'}`,
    `- **Zgony ogolem:** ${k3.deaths.length}/${ok.length} meczow`,
].join('\n');
const mdChecklist = checklist.length ? checklist.map(c => `${c.status} ${c.id}`).join(' · ') + '\n\n(✅ oracle dziala, 0 naruszen · ❌ naruszenia · ⏭ jeszcze niezaimplementowany)' : '_brak kontraktu docs/sigma-tester/ORACLES.md_';
const mdShots = table(['zrzut', 'mecz', 'moment', 'wynik', 's', 'naruszen'], shots.map(s => [s.file, `${s.scenario}/${s.map} seed ${s.seed}${s.mobile ? ' (mobile 667×375)' : ''}`, s.tag, s.outcome, s.matchSec ?? '-', s.violations]));

// ── 4. LLM (persona) ─────────────────────────────────────────────────────
const SYSTEM = `Jestes SigmaTester — tester gry Brawl Tanks (przegladarkowy top-down czolgowy brawler dla dzieci 9–12 lat).
Mowisz glosem marudnego, ale konkretnego 10-latka: krotko, szczerze, bez lania wody, po polsku z polskimi znakami.
Zasady twarde:
1. Kazda uwaga ma DOWOD z danych: nazwa meczu (runId) albo seed + scenariusz, klatka/sekunda albo nazwa zrzutu. Bez dowodu = nie piszesz.
2. NIE wymyslasz bugow, ktorych nie ma w danych ani na zrzutach. Jesli danych brakuje, piszesz wprost, czego brakuje.
3. Rozrozniasz: bug gry vs slabosc bota (bot gra heurystycznie i ginie szybko — to NIE jest bug gry, chyba ze dane pokazuja smierc "znikad").
4. Priorytety projektu: czytelnosc > sensoryka > flex. Oceniasz zrzuty pod katem: kolizje/nachodzenie HUD, czytelnosc czolgow i tekstu, czy wiadomo skad przyszlo trafienie, czy ekran koncowy jest jasny.
5. Znane i ZAAKCEPTOWANE (nie zglaszaj jako bug, nie dawaj RICE): A1 P3 guard CTF na legacy-kolizji (jedno zdanie);
   w URATUJ KROLOWA ekran "PORWANA!" przy smierci gracza jest ZAMIERZONY (zasada 1 zycia, decyzja projektanta);
   mnoznik predkosci mobile Pancernego 0.95 i zoom mobile 0.6 sa zamierzone;
   w OBRON ZAMEK przerwa ~10–15 s bez wrogow miedzy falami jest zamierzona (nie nuda do zgloszenia).
   Juz w backlogu (wspomnij tylko, jesli wciaz widac, bez RICE): znaczniki celow poza ekranem zaslaniaja HUD/przyciski
   mocy (CTF i Zamek); duzy boss rysowany na czolgu gracza.
Format odpowiedzi — DOKLADNIE te naglowki markdown, nic przed pierwszym:
## Komentarz testera do bugow
(2–6 zdan: co jest naprawde grozne, co kosmetyka, co to slabosc bota)
## Glos persony
(3–5 punktow "- ", kazdy 1–2 zdania + dowod w nawiasie)
## Propozycje RICE
(tabela | # | Nazwa | Reach | Impact | Conf | Effort | RICE | Kat. | — tylko dla realnych znalezisk; skala jak w backlogu projektu: Reach 0–100 = % graczy/meczow dotknietych (NIGDY wiecej niz 100), Impact 3/2/1, Conf 100/80/50%, Effort w osobo-tygodniach (0.1–4); RICE=(Reach×Impact×Conf)/Effort, typowo 5–200; brak znalezisk = jedno zdanie)
6. Zrzut "death" to plansza w klatce zgonu z ukryta nakladka ekranu koncowego — NIE oceniaj na nim ekranu koncowego ani przyciskow; ekran koncowy oceniasz tylko na zrzutach "end".
## Czego brakuje w danych
(1–3 punkty: jakie hooki/oracle by pomogly)
Limit: ~500 slow. Zadnych wstepow typu "Oto raport".`;

function buildUserPrompt(withPaths) {
    const shotLines = shots.map((s, i) => `${i + 1}. ${withPaths ? s.abs : s.file} — ${s.scenario}/${s.map}, seed ${s.seed}, moment: ${s.tag}, wynik ${s.outcome} po ${s.matchSec ?? '?'} s, naruszen ${s.violations}${s.mobile ? ', MOBILE 667×375' : ''}`);
    return [
        `# Dane z dnia ${DAY} (${o1.matches} meczow, build ${o1.builds.join(', ')})`,
        '', '## O1 Naglowek', mdO1, '', '## Przebiegi', mdRuns,
        '', '## O2 Klastry naruszen oracle (P0 crash/zawis, P1 zla regula gry, P2 AI/UX, P3 kosmetyka)', mdO2,
        '', '## O3 Balans per scenariusz (bot = dolna granica trudnosci)', mdO3, '', '## O3 per brawler', mdO3b,
        '', '## K3 heurystyki fairness/nuda', mdK3,
        '', '## Log fal Zamku (co 5 s: F<fala>/<zywi wrogowie>w)', mdWaves,
        '', '## Checklista oracle (co bot w ogole sprawdza)', mdChecklist,
        '', `## Zrzuty ekranu (${shots.length})${withPaths ? ' — KAZDY przeczytaj narzedziem Read i ocen wizualnie' : ''}`, ...shotLines,
        '', 'Napisz raport wg formatu z instrukcji systemowej.',
    ].join('\n');
}

function stripClaudeEnv() { const env = { ...process.env }; for (const k of Object.keys(env)) if (/^CLAUDE(CODE|_CODE_|_PID|_EFFORT)/.test(k)) delete env[k]; return env; }

function loadEnvLocal() {
    if (process.env.ANTHROPIC_API_KEY) return;
    for (const f of ['.env.local', '.env']) {
        const p = path.join(REPO, f); if (!fs.existsSync(p)) continue;
        for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^\s*ANTHROPIC_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/.exec(line); if (m) { process.env.ANTHROPIC_API_KEY = m[1]; return; } }
    }
}

function runCli(model) {
    const prompt = `${SYSTEM}\n\n---\n\n${buildUserPrompt(true)}`;
    fs.writeFileSync(path.join(DIR, 'prompt.md'), prompt);
    const cliArgs = ['-p', '--output-format', 'text', '--allowedTools', 'Read'];
    if (model) cliArgs.push('--model', model);
    const t0 = Date.now();
    const out = execFileSync('claude', cliArgs, { input: prompt, env: stripClaudeEnv(), cwd: REPO, encoding: 'utf8', timeout: 15 * 60_000, windowsHide: true, maxBuffer: 20 << 20 });
    return { text: out.trim(), meta: `backend cli (claude -p${model ? ' --model ' + model : ''}), ${Math.round((Date.now() - t0) / 1000)} s` };
}

async function runSdk(model) {
    loadEnvLocal();
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('backend sdk: brak ANTHROPIC_API_KEY (env albo .env.local) — uzyj --backend cli albo dodaj klucz');
    let Anthropic;
    try { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); }
    catch { throw new Error('backend sdk: brak pakietu @anthropic-ai/sdk — `npm i -D @anthropic-ai/sdk` (celowo nie w package.json, dopoki nie ma klucza)'); }
    const client = new Anthropic();
    const content = [];
    for (const s of shots) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: fs.readFileSync(s.abs).toString('base64') } });
    content.push({ type: 'text', text: buildUserPrompt(false) });
    fs.writeFileSync(path.join(DIR, 'prompt.md'), `${SYSTEM}\n\n---\n\n${buildUserPrompt(false)}`);
    const mdl = model ?? 'claude-fable-5-1';
    const t0 = Date.now();
    // Fable 5.1: thinking zawsze wlaczone (nie podajemy `thinking`), glebokosc przez effort; fallback na refusal.
    const res = await client.beta.messages.create({
        model: mdl, max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content }],
        output_config: { effort: 'medium' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal') throw new Error(`backend sdk: refusal (${res.stop_details?.category ?? '?'}) — ${res.stop_details?.explanation ?? ''}`);
    if (res.stop_reason === 'max_tokens') console.warn('[report] UWAGA: odpowiedz ucieta (max_tokens)');
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return { text, meta: `backend sdk (${res.model}), ${Math.round((Date.now() - t0) / 1000)} s, tokeny in ${res.usage.input_tokens} / out ${res.usage.output_tokens}` };
}

// ── 5. zlozenie DAILY.md + notion-comment.md ─────────────────────────────
function section(text, heading) {
    const re = new RegExp(`^## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm');
    const m = re.exec(text); return m ? m[1].trim() : null;
}

(async () => {
    let llm = null, llmMeta = DRY ? 'dry-run (bez LLM)' : '';
    if (!DRY) {
        loadEnvLocal();
        const backend = args.backend && args.backend !== 'auto' ? args.backend : (process.env.ANTHROPIC_API_KEY ? 'sdk' : 'cli');
        console.log(`[report] ${DAY}: ${runs.length} meczow, ${o2.length} klastrow, ${shots.length} zrzutow -> LLM przez ${backend}${args.model ? ' (' + args.model + ')' : ''} ...`);
        try {
            const r = backend === 'sdk' ? await runSdk(args.model) : runCli(args.model);
            llm = r.text; llmMeta = r.meta;
            fs.writeFileSync(path.join(DIR, 'llm-output.md'), llm);
        } catch (err) {
            console.error(`[report] LLM padl (${backend}): ${err.stack ?? err}\n${String(err.stderr ?? '').slice(0, 1000)}`);
            llmMeta = `LLM niedostepny (${backend}): ${String(err.message).slice(0, 200)} — sekcje persony pominiete`;
        }
    }
    const pick = (h, fallback) => (llm && section(llm, h)) ?? fallback;
    const md = [
        `# SigmaTester — raport dzienny ${DAY}`, '',
        `> Build ${o1.builds.join(', ') || '?'} · ${o1.matches} meczow · ${llmMeta} · wygenerowano ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        `> Bot gra heurystycznie: jego wyniki to dolna granica trudnosci, nie prawda o graczu. **Bot NIE zastepuje gate'u A54 Michala.**`, '',
        '## O1 Naglowek', mdO1, '', '### Przebiegi', mdRuns, '',
        '## O2 Bugi (klastry naruszen oracle, dedup id+scenariusz+mapa)', mdO2, '',
        '### Komentarz testera', pick('Komentarz testera do bugow', DRY ? '_dry-run: bez komentarza LLM_' : '_brak (LLM niedostepny)_'), '',
        '## O3 Balans', mdO3, '', '### Per brawler', mdO3b, '', '### K3 fairness / nuda (heurystyki)', mdK3, '', '### Log fal Zamku (co 5 s: fala / zywi wrogowie)', mdWaves, '',
        '## O4 Glos persony (marudny 10-latek)', pick('Glos persony', DRY ? '_dry-run: bez persony_' : '_brak (LLM niedostepny)_'), '',
        '### Propozycje RICE', pick('Propozycje RICE', '_brak_'), '',
        '### Czego brakuje w danych', pick('Czego brakuje w danych', '_brak_'), '',
        '## Checklista oracle (kontrakt docs/sigma-tester/ORACLES.md)', mdChecklist, '',
        '## Zrzuty uzyte w ocenie', mdShots, '',
        `## O5 Dostawa`, `Komentarz na Progress log (Notion) gotowy w \`${path.relative(REPO, path.join(DIR, 'notion-comment.md'))}\` — wkleja sesja Claude Code (MCP), bez tokenu w repo. JSON/PNG/aggregate: \`${path.relative(REPO, DIR)}\`.`,
    ].join('\n');
    fs.writeFileSync(path.join(DIR, 'DAILY.md'), md);

    const top = o2.slice(0, 3).map(c => `${c.severity} ${c.id} ${c.scenario}/${c.map} ×${c.n} (seed ${c.seeds.join(',')})`).join('; ') || 'brak naruszen';
    const persona = pick('Glos persony', '') || '';
    const firstRemark = persona.split('\n').find(l => l.trim().startsWith('-'))?.replace(/^-\s*/, '') ?? '';
    const notion = [
        `🤖 SigmaTester ${DAY} — ${o1.matches} meczow (${kv(o1.perScenario)}), build ${o1.builds.join(', ')}, seedy ${o1.seeds.join(',')}.`,
        `Naruszenia: ${top}. Bledy konsoli/HTTP: ${o1.consoleErrors}${o1.runnerErrors ? `, bledy runnera ${o1.runnerErrors}` : ''}.`,
        `Balans: ${o3.map(b => `${b.scenario} zgony ${b.deaths}/${b.n}, mediana smierci ${fmt(b.ttdMedian)} s`).join('; ')}.`,
        firstRemark ? `Persona: ${firstRemark}` : '',
        `Pelny raport: ${path.relative(REPO, path.join(DIR, 'DAILY.md'))}. Bot nie zastepuje gate'u A54.`,
    ].filter(Boolean).join(' ').slice(0, 2000);
    fs.writeFileSync(path.join(DIR, 'notion-comment.md'), notion);

    console.log(`[report] OK -> ${path.join(DIR, 'DAILY.md')} (${llmMeta})`);
    if (args.notion === 'true') console.log('\n' + notion);
})().catch((e) => { console.error('[report] FATAL', e.stack ?? e); process.exit(1); });
