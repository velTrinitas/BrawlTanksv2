/**
 * check-cloud-offline.mjs — EMPIRYCZNY dowod, ze `?cloud=0` odcina Supabase.
 *
 * PO CO OSOBNO OD `check-cloud-guards.cjs`: tamten sprawdza STATYCZNIE, czy kazde
 * wywolanie ma straznik. Ten sprawdza to, co naprawde decyduje przy rozmowie z Poki —
 * czy z przegladarki WYCHODZI choc jedno zadanie do `*.supabase.co`. Analiza kodu moze
 * przeoczyc sciezke, ktorej nie przewidzielismy (np. auto-refresh tokenu w tle albo
 * biblioteke wolajaca sama z siebie); zakladka Network nie przeoczy niczego.
 *
 * Uruchomienie (dev-server musi chodzic):  node tools/check-cloud-offline.mjs
 * Exit 1 = przeciek.
 */
import { chromium } from 'playwright';

const BASE = process.env.BT_URL || 'http://localhost:5173/BrawlTanksv2/';

/** Odpala gre, klika przez splash, gra chwile i zwraca liste zadan do Supabase. */
async function run(browser, query, label) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();

    const hits = [];
    // `request` (a nie `response`): lapiemy PROBE wyjscia, nawet gdy nikt nie odpowie.
    page.on('request', (r) => {
        const u = r.url();
        if (/supabase\.co/i.test(u)) hits.push(`${r.method()} ${u.replace(/\?.*$/, '')}`);
    });

    // ZASIEW PROFILU: bez aktywnego profilu gra staje na ekranie tozsamosci i NIC nie
    // synchronizuje — wtedy „0 zadan" nie znaczy „odcielismy chmure", tylko „nie bylo
    // czego wyslac". Profil uruchamia `syncActiveProfileToCloud()` przy boocie, czyli
    // realny ruch do Supabase. Ksztalt wprost z `ProfileService.isValidProfileEntry`
    // (daty to LICZBY, pole `totalGamesPlayed`) — inaczej profil jest po cichu dropowany.
    const now = Date.now();
    const profile = {
        id: '11111111-2222-3333-4444-555555555555', nickname: 'TestCloud',
        avatarId: 'ash', flagId: 'pl', language: 'pl',
        createdAt: now - 86400000, lastPlayedAt: now, totalGamesPlayed: 5,
    };
    await page.goto(BASE, { waitUntil: 'load' });
    await page.evaluate(([p]) => {
        localStorage.setItem('bt2:profiles', JSON.stringify([p]));
        localStorage.setItem('bt2:activeProfileId', p.id);
    }, [profile]);

    // Licznik zerujemy PO zasiewie — interesuje nas tylko ruch z wlasciwego przebiegu.
    hits.length = 0;
    await page.goto(BASE + query, { waitUntil: 'load' });
    await page.waitForTimeout(3000);

    const start = page.locator('button.bt-intro-start');
    if (await start.count()) { await start.click(); await page.waitForTimeout(4000); }
    await page.waitForTimeout(2000);

    await ctx.close();
    const uniq = [...new Set(hits)];
    console.log(`\n[${label}] zadan do supabase.co: ${hits.length} (unikalnych sciezek: ${uniq.length})`);
    for (const u of uniq.slice(0, 8)) console.log('   ' + u);
    return hits.length;
}

const browser = await chromium.launch({ channel: 'chrome' });
let on = 0, off = 0;
try {
    // Najpierw wariant WLACZONY — bez niego test niczego nie dowodzi. Gdyby gra i tak
    // nie odpytywala Supabase (np. zle .env), "0 zadan" przy ?cloud=0 byloby falszywym
    // sukcesem. Dopiero para (dziala / nie dziala) jest dowodem.
    on = await run(browser, '', 'CLOUD_LIVE=true (kontrola)');
    off = await run(browser, '?cloud=0', '?cloud=0');
} finally {
    await browser.close();
}

console.log('\n' + '='.repeat(62));
if (on === 0) {
    console.error('TEST NIEROZSTRZYGAJACY: przy wlaczonej chmurze tez bylo 0 zadan.');
    console.error('Sprawdz .env (VITE_SUPABASE_URL) — bez ruchu kontrolnego wynik nic nie znaczy.');
    process.exit(1);
}
if (off > 0) {
    console.error(`PRZECIEK: przy ?cloud=0 wyszlo ${off} zadan do supabase.co.`);
    process.exit(1);
}
console.log(`OK — kontrola ${on} zadan, ?cloud=0 => ZERO. Flaga CLOUD_LIVE odcina zaplecze.`);
