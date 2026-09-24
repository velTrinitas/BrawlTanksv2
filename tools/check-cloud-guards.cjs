/**
 * check-cloud-guards.cjs — pilnuje, ze KAZDE wyjscie sieciowe do Supabase siedzi za
 * `isCloudEnabled()`.
 *
 * PO CO: flaga CLOUD_LIVE jest warta tyle, ile jej najslabsze ogniwo. Jedna nowa metoda
 * z `getSupabase()` bez straznika i obietnica „zero zadan do supabase.co" przestaje byc
 * prawdziwa — a dowiedzielibysmy sie o tym dopiero przy odrzuceniu paczki przez Poki.
 * Ten skrypt zamienia to z pytania „czy ktos pamietal?" na sprawdzenie w 200 ms.
 *
 * ZASADA: dla kazdego `getSupabase()` w `src/services/` szukamy w GORE najblizszej
 * sygnatury metody/funkcji i sprawdzamy, czy miedzy nia a wywolaniem stoi straznik.
 *
 * Uruchomienie: node tools/check-cloud-guards.cjs   (exit 1 = jest dziura)
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'src', 'services');
// SupabaseClient.ts to sam bootstrap klienta — ma wlasny straznik w ensureAnonSession(),
// a `getSupabase()` samo w sobie nie wysyla zadnego zadania (tworzy tylko obiekt).
const SKIP = new Set(['SupabaseClient.ts']);

const files = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts') && !SKIP.has(e.name)) files.push(p);
    }
})(DIR);

const SIG = /^\s*(?:export\s+)?(?:private\s+|public\s+)?(?:async\s+)?(?:function\s+)?([A-Za-z_][\w]*)\s*\(/;
let holes = 0, checked = 0;

for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
        if (!/getSupabase\(\)/.test(line)) return;
        checked++;
        let guarded = false;
        for (let j = i; j >= 0; j--) {
            if (/isCloudEnabled\(\)/.test(lines[j])) { guarded = true; break; }
            if (j < i && SIG.test(lines[j]) && !/if|for|while|catch|switch/.test(lines[j])) break;
        }
        if (!guarded) {
            holes++;
            console.error(`BRAK STRAZNIKA: ${path.relative(path.join(__dirname, '..'), f)}:${i + 1}`);
            console.error(`  ${line.trim()}`);
        }
    });
}

console.log(`\nsprawdzonych wyjsc sieciowych: ${checked}, bez straznika: ${holes}`);
if (holes) {
    console.error('\nKazde wyjscie do Supabase musi byc poprzedzone `if (!isCloudEnabled()) return ...;`');
    console.error('w tej samej metodzie. Patrz src/config/cloud.ts.');
    process.exit(1);
}
console.log('OK — cala lacznosc z Supabase jest za flaga CLOUD_LIVE.');
