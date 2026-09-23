/**
 * analyze.mjs — KROK 1 z docs/PLAN_PO_TESTACH.md: liczby z okna testow 01-23.09.2026.
 *
 * WEJSCIE: eksporty CSV z Supabase w katalogu --in (domyslnie C:\Users\user\Downloads).
 *   Preferowane `pelne_*.csv` (SQL Editor, bez limitu), fallback `*_rows.csv`
 *   (Table Editor — OBCIETE do 100 wierszy, skrypt to wykrywa i krzyczy).
 * WYJSCIE: docs/reports/report-data.json — wsad dla render.mjs i do wklejenia w Notion.
 *
 * ZASADA: skrypt NIGDY nie zgaduje. Brak pliku => sekcja dostaje `available:false`
 * i w PDF pojawia sie "brak danych", a nie liczba z sufitu. Kazda metryka niesie `n`.
 *
 * Brak wplywu na symulacje (multiplayer-ready.md, "Kiedy ta bramka NIE dotyczy").
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv } from './csv.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(REPO, 'docs', 'reports');

const arg = (name, def) => {
    const i = process.argv.indexOf(name);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const IN_DIR = arg('--in', 'C:\\Users\\user\\Downloads');

/** Okno testow. Gorna granica domknieta na koniec 23.09 — to byl ostatni dzien grania. */
const WIN_FROM = '2026-09-01';
const WIN_TO = '2026-09-23T23:59:59';
const inWindow = (ts) => !!ts && ts >= WIN_FROM && ts <= WIN_TO;

/**
 * DNI DEV — ruch z maszyny Mariusza, nie od testerow. 20.09 powstalo 37 profili
 * i 87 wynikow, w tym nicki z generatora v0.203.0 (`GlodnyJez60`, `PikselowyGofr16`),
 * ktory NIE jest w paczce testowej — tester nie mial jak takiego nicku dostac.
 * Potwierdzone przez Mariusza 23.09.2026.
 *
 * Wycinamy je z LEJKA i RETENCJI (tam licza sie ludzie), ale ZOSTAWIAMY w
 * wydajnosci i balansie — tam mecz jest meczem niezaleznie od tego, kto siedzial
 * przy klawiaturze, a wyrzucanie go tylko zmniejszyloby probe.
 */
const DEV_DAYS = new Set(['2026-09-20']);
const isDevDay = (ts) => DEV_DAYS.has(dayOf(ts));

/**
 * Wersja jako liczba — do odsiania pomiarow sprzed fixow wydajnosci.
 * Prog v0.186.0: v0.187.0 naprawilo bialy ekran/VRAM (grunt 3000x3000 budowany co mecz)
 * i zdjelo wlasny limiter klatek. Mieszanie pomiarow sprzed i po tym fixie daje
 * falszywy obraz — np. Mars wyglada na zepsuty wylacznie przez wiersze z v0.155.2.
 */
const RECENT_FROM = 186000;
const vnum = (v) => {
    const m = /v(\d+)\.(\d+)\.(\d+)/.exec(v || '');
    return m ? (+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3]) : 0;
};

// ── pomocnicze statystyki ─────────────────────────────────────────────────────
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const asc = (a, b) => a - b;

/** Percentyl metoda "nearest-rank" — bez interpolacji, zeby wynik byl realna obserwacja. */
function pct(sorted, p) {
    if (!sorted.length) return null;
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1));
    return sorted[i];
}
function stats(values) {
    const v = values.filter(x => x !== null && Number.isFinite(x)).sort(asc);
    if (!v.length) return { n: 0 };
    const sum = v.reduce((a, b) => a + b, 0);
    return {
        n: v.length, min: v[0], max: v[v.length - 1],
        p25: pct(v, 25), median: pct(v, 50), p75: pct(v, 75), p90: pct(v, 90),
        avg: Math.round(sum / v.length * 10) / 10,
    };
}
/** Zliczenie wystapien + udzial procentowy, posortowane malejaco. */
function tally(rows, key, mapFn) {
    const m = new Map();
    for (const r of rows) {
        const k = (mapFn ? mapFn(r) : r[key]) || '(puste)';
        m.set(k, (m.get(k) || 0) + 1);
    }
    const total = rows.length || 1;
    return [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([key, n]) => ({ key, n, pct: Math.round(n / total * 1000) / 10 }));
}
const dayOf = (ts) => (ts || '').slice(0, 10);

// ── wczytanie zrodel ──────────────────────────────────────────────────────────
/**
 * Kazde zrodlo ma dwie mozliwe nazwy. `*_rows.csv` z Table Editora jest OBCIETY do
 * 100 wierszy — to nie hipoteza, to zweryfikowane 23.09.2026 (scores konczyly sie na
 * uuid 1198e011..., czyli ~7% przestrzeni). Dlatego dokladnie 100 wierszy z pliku
 * `*_rows.csv` traktujemy jako podejrzenie obciecia i oznaczamy w raporcie.
 */
const SOURCES = {
    scores: ['pelne_scores.csv', 'scores_rows.csv'],
    profiles: ['pelne_profiles.csv', 'profiles_rows.csv'],
    telemetry: ['pelne_telemetry.csv', 'telemetry_rows.csv'],
    sessions: ['pelne_sessions.csv', 'sessions_rows.csv'],
    progression: ['pelne_progression.csv', 'progression_rows.csv'],
    byDevice: ['telemetry_by_device_rows.csv'],
};

const data = {}, sources = {};
for (const [name, candidates] of Object.entries(SOURCES)) {
    let loaded = null, usedFile = null;
    for (const c of candidates) {
        const rows = readCsv(path.join(IN_DIR, c));
        if (rows) { loaded = rows; usedFile = c; break; }
    }
    data[name] = loaded || [];
    const dateCol = name === 'sessions' ? 'started_at' : 'created_at';
    const dates = (loaded || []).map(r => r[dateCol]).filter(Boolean).sort();
    sources[name] = {
        available: !!loaded,
        file: usedFile,
        full: !!usedFile && usedFile.startsWith('pelne_'),
        rows: loaded ? loaded.length : 0,
        // Obciecie: plik z Table Editora o DOKLADNIE 100 wierszach.
        suspectTruncated: !!loaded && loaded.length === 100 && !usedFile.startsWith('pelne_'),
        from: dates[0] || null,
        to: dates[dates.length - 1] || null,
    };
}

// ── kontrola krzyzowa telemetrii (twarda bramka jakosci eksportu) ──────────────
const byDevice = data.byDevice.map(r => ({
    device: r.device_model, platform: r.platform,
    matches: num(r.matches), p50: num(r.med_fps_p50), p05: num(r.med_fps_p05),
    avgSeconds: num(r.avg_match_seconds), lastSeen: r.last_seen, newestVersion: r.newest_version,
}));
const expectedMatches = byDevice.reduce((a, d) => a + (d.matches || 0), 0);
const telemetryCheck = {
    expected: expectedMatches,          // z widoku agregujacego (kompletny)
    got: data.telemetry.length,         // z eksportu surowej tabeli
    ok: expectedMatches > 0 && data.telemetry.length >= expectedMatches,
};

// ── A. PROFILE / LEJEK ────────────────────────────────────────────────────────
/**
 * Profile "dev": nick `Bot#####` / `T1`,`T2` — w repo NIE MA generatora takich nickow
 * (SigmaTester nie tworzy profili, a w `?bot=1` gra w ogole nie wysyla wynikow), wiec
 * to recznie wpisane profile testowe z maszyny Mariusza. NIE kasujemy ich po cichu:
 * raportujemy osobno, zeby liczba testerow nie byla zawyzona ani zanizona w ciemno.
 */
const isDevProfile = (p) => /^(Bot\d+|T\d+|test\d*)$/i.test((p.nickname || '').trim());

const scoresByProfile = new Map();
for (const s of data.scores) {
    if (!scoresByProfile.has(s.profile_id)) scoresByProfile.set(s.profile_id, []);
    scoresByProfile.get(s.profile_id).push(s);
}
const progressionIds = new Set(data.progression.map(r => r.profile_id));
const profileIds = new Set(data.profiles.map(p => p.id));

// Lejek liczymy na profilach z okna Z POMINIECIEM dni dev (patrz DEV_DAYS).
const profilesWin = data.profiles.filter(p => inWindow(p.created_at) && !isDevDay(p.created_at));
const profilesWinRaw = data.profiles.filter(p => inWindow(p.created_at));
const funnelFor = (list) => ({
    profiles: list.length,
    dev: list.filter(isDevProfile).length,
    withSession: list.filter(p => num(p.session_count) > 0).length,
    withProgression: list.filter(p => progressionIds.has(p.id)).length,
    withScore: list.filter(p => (scoresByProfile.get(p.id) || []).length > 0).length,
    returnedOnAnotherDay: list.filter(p => {
        const days = new Set((scoresByProfile.get(p.id) || []).map(s => dayOf(s.created_at)));
        return days.size >= 2;
    }).length,
});

const funnel = {
    allTime: funnelFor(data.profiles),
    window: funnelFor(profilesWin),
    // Wariant surowy — do porownania, zeby bylo widac ILE odjelismy jako dev.
    windowRaw: funnelFor(profilesWinRaw),
    devDays: [...DEV_DAYS],
    languages: tally(data.profiles, 'language'),
    avatars: tally(data.profiles, 'avatar_id').slice(0, 10),
    flags: tally(data.profiles, 'flag_id').slice(0, 10),
    sessionCount: stats(data.profiles.map(p => num(p.session_count))),
    newProfilesPerDay: tally(profilesWinRaw, null, p => dayOf(p.created_at)).sort((a, b) => a.key.localeCompare(b.key)),
};

// ── B. WYDAJNOSC ──────────────────────────────────────────────────────────────
const telAll = data.telemetry.map(r => ({
    ts: r.created_at, version: r.game_version, device: r.device_model, browser: r.browser,
    platform: r.platform, isTouch: r.is_touch === 'true', dpr: num(r.dpr), renderRes: num(r.render_res),
    p50: num(r.fps_p50), p05: num(r.fps_p05), avg: num(r.fps_avg), seconds: num(r.match_seconds),
    map: r.map, scenario: r.scenario, difficulty: r.difficulty, result: r.result,
}));
const telWin = telAll.filter(t => inWindow(t.ts));
const telRecent = telWin.filter(t => vnum(t.version) >= RECENT_FROM);

/** Grupowanie telemetrii po dowolnym kluczu — n + mediany p50/p05 + odsetek zaciec. */
function fpsGroups(rows, keyFn, minN = 1) {
    const m = new Map();
    for (const t of rows) {
        const k = keyFn(t) || '(puste)';
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(t);
    }
    return [...m.entries()]
        .map(([key, list]) => ({
            key, n: list.length,
            p50: stats(list.map(x => x.p50)).median,
            p05: stats(list.map(x => x.p05)).median,
            // "Zaciecie" = mecz, w ktorym 5% najgorszych klatek spadlo ponizej 45 fps.
            stutterPct: Math.round(list.filter(x => (x.p05 ?? 99) < 45).length / list.length * 1000) / 10,
            seconds: stats(list.map(x => x.seconds)).median,
        }))
        .filter(g => g.n >= minN)
        .sort((a, b) => b.n - a.n);
}

const GATE_P50 = 55;   // bramka Z0.6 z PLAN_PO_TESTACH.md §2 poz. 9
const perf = {
    byDevice,
    gate: {
        threshold: GATE_P50,
        perDevice: byDevice.map(d => ({ device: d.device, matches: d.matches, p50: d.p50, p05: d.p05, pass: (d.p50 ?? 0) >= GATE_P50 })),
        // Bramka przechodzi tylko, gdy przechodzi kazde urzadzenie o sensownej probie.
        pass: byDevice.filter(d => (d.matches || 0) >= 10).every(d => (d.p50 ?? 0) >= GATE_P50),
        note: 'Urzadzenia z n < 10 nie decyduja o bramce (zbyt mala proba).',
    },
    byVersion: fpsGroups(telAll, t => t.version, 3),
    // WAZNE: mapy i scenariusze liczymy TYLKO na wersjach >= v0.186.0. Inaczej
    // pomiary sprzed fixa VRAM (v0.187.0) zatruwaja obraz — Mars wychodzil na
    // zepsuty (p50 39) wylacznie przez wiersze z v0.155.2; po odsianiu ma 58/41.
    byMap: fpsGroups(telRecent, t => t.map),
    byScenario: fpsGroups(telRecent, t => t.scenario),
    byMapAndroid: fpsGroups(telRecent.filter(t => t.platform === 'android'), t => t.map),
    byScenarioAndroid: fpsGroups(telRecent.filter(t => t.platform === 'android'), t => t.scenario),
    byPlatform: fpsGroups(telRecent, t => t.platform),
    hardware: tally(telAll, null, t => `${t.device}/${t.platform}/dotyk=${t.isTouch ? 'tak' : 'nie'}/dpr=${t.dpr}/res=${t.renderRes}`),
    // Odsetek meczow z p05 < 45 — "co ile meczow gracz czuje zaciecie".
    stutterAndroidPct: (() => {
        const a = telRecent.filter(t => t.platform === 'android');
        return a.length ? Math.round(a.filter(t => (t.p05 ?? 99) < 45).length / a.length * 1000) / 10 : null;
    })(),
    recentFrom: 'v0.186.0',
    recentRows: telRecent.length,
    windowRows: telWin.length,
    allRows: telAll.length,
};

// ── C. ROZGRYWKA ──────────────────────────────────────────────────────────────
const devProfileIds = new Set(data.profiles.filter(isDevProfile).map(p => p.id));
const scoresWin = data.scores.filter(s => inWindow(s.created_at) && !devProfileIds.has(s.profile_id));
const secs = scoresWin.map(s => num(s.game_seconds));
const accuracyRows = scoresWin.filter(s => num(s.shots_fired) > 0);

const play = {
    n: scoresWin.length,
    players: new Set(scoresWin.map(s => s.profile_id)).size,
    days: tally(scoresWin, null, s => dayOf(s.created_at)).sort((a, b) => a.key.localeCompare(b.key)),
    scenario: tally(scoresWin, 'scenario'),
    map: tally(scoresWin, 'map'),
    brawler: tally(scoresWin, 'brawler_id'),
    difficulty: tally(scoresWin, 'difficulty'),
    scoreVersion: tally(scoresWin, 'score_version'),
    funMode: tally(scoresWin, 'fun_mode'),
    matchSeconds: stats(secs),
    score: stats(scoresWin.map(s => num(s.score))),
    kills: stats(scoresWin.map(s => num(s.kills))),
    accuracy: stats(accuracyRows.map(s => Math.round(num(s.shots_hit) / num(s.shots_fired) * 1000) / 10)),
    megaBossDefeated: scoresWin.filter(s => s.mega_boss_defeated === 'true').length,
    // Mecze <= 15 s: dziecko wyszlo/zginelo natychmiast. Sygnal o progu wejscia.
    veryShortPct: secs.filter(Boolean).length ? Math.round(secs.filter(x => (x ?? 0) <= 15).length / secs.length * 1000) / 10 : null,
    // Ile meczow przypada na jednego gracza — miara "wciagniecia".
    matchesPerPlayer: (() => {
        const m = new Map();
        for (const s of scoresWin) m.set(s.profile_id, (m.get(s.profile_id) || 0) + 1);
        return stats([...m.values()]);
    })(),
};

// ── D. BALANS ROSTERU ─────────────────────────────────────────────────────────
/**
 * UWAGA METODOLOGICZNA (pamiec `balans-pomiar-vs-playtest`): to dane z dzikiej gry,
 * bez kontroli ziarna ani umiejetnosci gracza. Nadaja sie na SYGNAL (ktory czolg
 * gracze wybieraja i jak dlugo przezywaja), NIE na strojenie liczb. Od strojenia
 * jest STRZELNICA z KROKU 3. Dlatego kazdy wiersz niesie n, mediane i rozstep.
 */
const balance = [...new Set(scoresWin.map(s => s.brawler_id))].map(id => {
    const rows = scoresWin.filter(s => s.brawler_id === id);
    const sec = stats(rows.map(s => num(s.game_seconds)));
    const kills = stats(rows.map(s => num(s.kills)));
    const kpm = stats(rows.map(s => {
        const t = num(s.game_seconds), k = num(s.kills);
        return t && t > 5 ? Math.round(k / (t / 60) * 10) / 10 : null;
    }));
    return {
        brawler: id, n: rows.length,
        players: new Set(rows.map(s => s.profile_id)).size,
        medianSeconds: sec.median, secP25: sec.p25, secP75: sec.p75,
        medianKills: kills.median, killsP25: kills.p25, killsP75: kills.p75,
        medianScore: stats(rows.map(s => num(s.score))).median,
        killsPerMin: kpm.median, kpmP25: kpm.p25, kpmP75: kpm.p75,
        // Prog wiarygodnosci — ponizej 15 meczow liczba idzie do PDF jako orientacyjna.
        reliable: rows.length >= 15,
    };
}).sort((a, b) => b.n - a.n);

// ── E. SESJE ──────────────────────────────────────────────────────────────────
/**
 * ODTWORZENIE SESJI ZE `scores` — tabela `sessions` jest martwa.
 *
 * Zdiagnozowane 23.09.2026: w calym `src/` i w Edge Functions NIE MA ani jednego
 * zapisu do tabeli `sessions`. `SessionService.ts` mimo nazwy pisze wylacznie do
 * `localStorage` (skrot "Kontynuuj"), a tabela z `schema.sql:115` powstala jako
 * "analytics, opcjonalne" i nigdy nie zostala podlaczona. `scores.session_id` jest
 * wypelniany UUID-em z GameConfig, ale odpowiadajacy wiersz nie powstaje.
 *
 * Obejscie: sesja = ciag meczow jednego gracza z przerwa < 30 min. To NIE jest to
 * samo co czas spedzony w grze (nie widzimy menu, garazu ani sklepu), wiec liczba
 * jest DOLNA GRANICA dlugosci sesji. Tak tez opisana w PDF.
 */
const SESSION_GAP_MS = 30 * 60 * 1000;
const derivedSessions = (() => {
    const byPlayer = new Map();
    for (const s of scoresWin) {
        if (!byPlayer.has(s.profile_id)) byPlayer.set(s.profile_id, []);
        byPlayer.get(s.profile_id).push(Date.parse(s.created_at));
    }
    const out = [];
    for (const [, times] of byPlayer) {
        times.sort(asc);
        let start = times[0], prev = times[0], matches = 1;
        for (let i = 1; i < times.length; i++) {
            if (times[i] - prev > SESSION_GAP_MS) {
                out.push({ seconds: Math.round((prev - start) / 1000), matches });
                start = times[i]; matches = 0;
            }
            prev = times[i]; matches++;
        }
        out.push({ seconds: Math.round((prev - start) / 1000), matches });
    }
    return out;
})();

const sessionsWin = data.sessions.filter(s => inWindow(s.started_at));
const sessionDurations = sessionsWin
    .filter(s => s.ended_at)
    .map(s => Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000))
    .filter(d => d >= 0 && d < 6 * 3600);   // > 6 h = karta zostawiona otwarta, nie sesja gry
const sessions = {
    // Tabela istnieje i jest PUSTA — to nie brak eksportu, tylko martwy zapis.
    tableEmpty: sources.sessions.available && sessionsWin.length === 0,
    tableDiagnosis: 'Zero zapisow do tabeli `sessions` w calym `src/` i w Edge Functions. '
        + '`SessionService.ts` pisze tylko do localStorage (skrot "Kontynuuj"). '
        + 'Tabela z `schema.sql:115` nigdy nie zostala podlaczona.',
    derived: {
        n: derivedSessions.length,
        seconds: stats(derivedSessions.map(s => s.seconds)),
        matches: stats(derivedSessions.map(s => s.matches)),
        // Sesje jednomeczowe: wszedl, zagral raz, wyszedl. Najtwardszy sygnal o wciagnieciu.
        singleMatchPct: derivedSessions.length
            ? Math.round(derivedSessions.filter(s => s.matches === 1).length / derivedSessions.length * 1000) / 10 : null,
        method: 'Sesja = ciag meczow jednego gracza z przerwa < 30 min. Dolna granica — nie obejmuje czasu w menu/garazu.',
    },
    available: sources.sessions.available,
    n: sessionsWin.length,
    result: tally(sessionsWin, 'result'),
    // Brak `ended_at` = gra zamknieta bez domkniecia sesji (zamkniecie karty / crash).
    neverEndedPct: sessionsWin.length ? Math.round(sessionsWin.filter(s => !s.ended_at).length / sessionsWin.length * 1000) / 10 : null,
    durationSeconds: stats(sessionDurations),
};

// ── F. HIGIENA DANYCH ─────────────────────────────────────────────────────────
const hygiene = {
    zeroSecondScores: data.scores.filter(s => num(s.game_seconds) === 0).length,
    zeroShotScores: scoresWin.filter(s => num(s.shots_fired) === 0).length,
    emptyMatchId: data.scores.filter(s => !s.match_id).length,
    scoreVersionAll: tally(data.scores, 'score_version'),
    modeAll: tally(data.scores, 'mode'),
    devProfiles: data.profiles.filter(isDevProfile).map(p => p.nickname),
    profilesWithoutProgression: data.profiles.filter(p => !progressionIds.has(p.id)).length,
    // Sierota po FK: progresja bez profilu = profil skasowany, dane zostaly.
    progressionWithoutProfile: data.progression.filter(r => !profileIds.has(r.profile_id)).length,
    // Scenariusze/mapy obecne w danych — wsad do whitelisty Edge (KROK 2 poz. 2).
    scenariosSeen: tally(data.scores, 'scenario').map(x => x.key),
    mapsSeen: tally(data.scores, 'map').map(x => x.key),
};

/**
 * ── DZIURA W RANKINGU: co gracze GRALI vs co trafilo do `scores` ──────────────
 * Telemetria jest wysylana z kazdego meczu, `scores` tylko z tych, ktorych Edge
 * przyjmuje. Roznica miedzy tymi dwoma zbiorami to dokladnie skutek pkt 3+4 planu
 * (whitelist Edge bez `castle_grounds`/`dungeon`, klient nie wysyla Zamku/Krolowej).
 * Liczba z tej tabeli jest najmocniejszym argumentem za KROKIEM 2.
 */
const scenarioGap = (() => {
    const played = tally(telWin, 'scenario');
    const submittedKeys = new Set(tally(scoresWin, 'scenario').map(x => x.key));
    const submitted = new Map(tally(scoresWin, 'scenario').map(x => [x.key, x.n]));
    return {
        rows: played.map(p => ({
            scenario: p.key,
            playedMatches: p.n,
            playedPct: p.pct,
            submittedScores: submitted.get(p.key) ?? 0,
            visibleInLeaderboard: submittedKeys.has(p.key),
        })),
        lostMatches: played.filter(p => !submittedKeys.has(p.key)).reduce((a, p) => a + p.n, 0),
        lostPct: played.length
            ? Math.round(played.filter(p => !submittedKeys.has(p.key)).reduce((a, p) => a + p.n, 0) / telWin.length * 1000) / 10
            : null,
    };
})();

// ── G. RUCH Z CLOUDFLARE (wpisane recznie ze zrzutow — WA nigdy nie wlaczone) ──
const cloudflare = {
    source: 'Workers & Pages > sigmatanks-test > Metrics (zrzuty 20260923_cloudflare*.png)',
    webAnalyticsEnabled: false,
    note: 'Web Analytics nie zostalo skonfigurowane (panel pokazuje kreator "Get started"). '
        + 'Unikalni odwiedzajacy, kraje i retencja z Cloudflare sa NIEODZYSKIWALNE. '
        + 'Urzadzenia i wydajnosc mamy z wlasnej telemetrii, ktora jest dokladniejsza.',
    assetRequests30d: 6670,
    cacheHitRate: 95.22,
    responses4xx: 71,
    responses5xx: 0,
    hostnames: [
        { host: 'sigmatanks-test.sigmatanks-eu.workers.dev', requests: 6490 },
        { host: 'sigmatanks-test.mariusz-poparda.workers.dev', requests: 162 },
        { host: 'sigmatanks-test.sigmatanks-eu.workers.dev.', requests: 17 },
    ],
    last24hRequests: 10,
    shape: 'Jeden ostry szczyt 01-02.09 (~2 tys. zadan/dzien), potem cienkie slupki do 23.09.',
};

// ── H. DECYZJE ────────────────────────────────────────────────────────────────
const decisions = {
    smooth: {
        question: 'Wlaczyc SMOOTH (catch-up, runLogicStep) domyslnie?',
        gate: `p50 >= ${GATE_P50} na kazdym urzadzeniu z n >= 10`,
        evidence: perf.gate.perDevice,
        pass: perf.gate.pass,
    },
    stage1: {
        question: 'Startowac ETAP 1 (COOP)?',
        gates: [
            { name: 'Telemetria dopuszcza (bramka p50)', pass: perf.gate.pass },
            { name: 'Przeglad planu innym modelem PRZED wykonaniem', pass: null, note: 'Proces, nie dane — do zrobienia przed startem.' },
            { name: 'Redeploy zaplecza (KROK 2) zamkniety', pass: null, note: 'Z0.7b + Z0.10b + whitelist Edge — przed COOP.' },
        ],
    },
};

// ── zapis ─────────────────────────────────────────────────────────────────────
const report = {
    generatedAt: new Date().toISOString(),
    window: { from: WIN_FROM, to: '2026-09-23' },
    inputDir: IN_DIR,
    sources, telemetryCheck,
    cloudflare, funnel, perf, play, balance, sessions, hygiene, scenarioGap, decisions,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'report-data.json'), JSON.stringify(report, null, 2), 'utf8');

// ── sanity na konsole (punkt 1 i 2 weryfikacji z planu) ───────────────────────
console.log('\n=== ZRODLA ===');
for (const [k, s] of Object.entries(sources)) {
    const flag = !s.available ? 'BRAK PLIKU'
        : s.suspectTruncated ? '!! PODEJRZENIE OBCIECIA (100 wierszy z Table Editora)'
            : s.full ? 'pelny eksport' : 'ok';
    console.log(`  ${k.padEnd(12)} ${String(s.rows).padStart(6)} wierszy  ${(s.from || '?').slice(0, 10)} -> ${(s.to || '?').slice(0, 10)}  [${s.file || '-'}] ${flag}`);
}
console.log('\n=== KONTROLA KRZYZOWA TELEMETRII ===');
console.log(`  widok telemetry_by_device: ${telemetryCheck.expected} meczow`);
console.log(`  surowa tabela telemetry:   ${telemetryCheck.got} wierszy`);
console.log(`  ${telemetryCheck.ok ? 'OK — eksport kompletny' : '!! NIEZGODNOSC — eksport telemetrii obciety, nie raportuj z niego liczb'}`);
console.log('\n=== OKNO 01-23.09 ===');
console.log(`  wyniki: ${play.n} (gracze: ${play.players}) | telemetria: ${perf.windowRows} | sesje: ${sessions.n} | nowe profile: ${funnel.window.profiles}`);
console.log(`  profile dev odfiltrowane: ${hygiene.devProfiles.length ? hygiene.devProfiles.join(', ') : 'brak'}`);
console.log(`\n=== BRAMKA SMOOTH (p50 >= ${GATE_P50}) ===`);
for (const d of perf.gate.perDevice) {
    console.log(`  ${String(d.device).padEnd(10)} n=${String(d.matches).padStart(4)}  p50=${d.p50}  p05=${d.p05}  ${d.pass ? 'PASS' : 'FAIL'}`);
}
console.log(`  WYNIK: ${perf.gate.pass ? 'PRZECHODZI' : 'NIE PRZECHODZI'}`);
console.log(`\n-> ${path.relative(REPO, path.join(OUT, 'report-data.json'))}\n`);
