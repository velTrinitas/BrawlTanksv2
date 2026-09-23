/**
 * check-s3-skin.mjs — weryfikacja kosmetyku `ps_s3_school` (v0.203.0) bez grania.
 *
 * PO CO: skin profilu z sezonu 3 jest do zdobycia przez sklep (2400 sigm) albo skrzynke,
 * wiec "sprawdzenie czy dziala" wymagaloby wygrania kilkudziesieciu meczow. Ten skrypt
 * wstrzykuje profil + progresje prosto do localStorage i robi zrzuty strony PROFILU
 * w dwoch szerokosciach (desktop + 375 px, twarda bramka mobile-first).
 *
 * URUCHOMIENIE: `npm run dev` musi chodzic, potem `node tools/check-s3-skin.mjs`.
 * Zrzuty ladują w `docs/reports/s3-skin-*.png`.
 *
 * To narzedzie dev — brak wplywu na symulacje.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'docs', 'reports');
const URL_BASE = process.argv[2] || 'http://localhost:5173/BrawlTanksv2/';
const SKIN = 'ps_s3_school';

const PROFILE_ID = '11111111-2222-3333-4444-555555555555';
const now = Date.now();

/**
 * KSZTALT WPROST Z `ProfileService.isValidProfileEntry` (ProfileService.ts:279) —
 * nie z pamieci. `createdAt` i `lastPlayedAt` to LICZBY (ms), nie ISO-stringi, a licznik
 * nazywa sie `totalGamesPlayed`. Kazde odstepstwo => profil jest po cichu DROPOWANY
 * przy wczytaniu i gra pokazuje ekran tozsamosci zamiast hubu.
 */
const profile = {
    id: PROFILE_ID, nickname: 'TestSezon3', avatarId: 'ash', flagId: 'pl',
    language: 'pl', createdAt: now - 86400000, lastPlayedAt: now, totalGamesPlayed: 37,
};

/**
 * Progresja z ZALOZONYM skinem. Dajemy tez sigmy i troche statystyk, zeby strona
 * profilu wyrenderowala sie w pelni (hero + rangi + zakladki), a nie w stanie pustym —
 * inaczej nie widac, czy welon gradientowy dobrze chroni czytelnosc nicku.
 */
const progression = {
    profileId: PROFILE_ID, trophies: 2600, bolts: 3000, boltsSpent: 2400,
    perMapBest: { desert: 420, city: 180 }, claimedMilestones: [], lastRunDayKey: null,
    totalRuns: 37, updatedAt: now,
    cratesEarned: 6, cratesOpened: 6, pityCounter: 0,
    ownedCosmetics: [SKIN],
    equipped: { profileSkin: SKIN },
    equippedAt: now,
    crateMilestonesCredited: [],
    ownedPowers: [], loadout: [null, null], loadoutAt: now,
    funModeOn: false, funModeAt: 0,
    lifetime: { kills: 640, gems: 210, seconds: 5400, shotsFired: 4200, shotsHit: 1500 },
    records: { maxKills: 54, maxGems: 31, maxSeconds: 420, bestAccuracy: 48, maxCombo: 12 },
};

const browser = await chromium.launch({ channel: 'chrome' });
const shots = [];
try {
    /**
     * Wariant mobilny jest POZIOMY. Gra ma landscape-lock i w pionie nakłada
     * `.bt-portrait-warning`, ktory przykrywa caly interfejs — pionowy zrzut nie
     * pokazalby niczego poza ostrzezeniem. "Bramka 375 px" z mobile-first dotyczy
     * KROTSZEGO boku, wiec 812x375 to ten sam test, tylko w prawidlowej orientacji
     * (A54 w poziomie to ~832x384 css px przy DPR 2.81).
     */
    for (const [name, viewport] of [
        ['desktop', { width: 1280, height: 900 }],
        ['mobile-375', { width: 812, height: 375 }],
    ]) {
        const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
        const page = await ctx.newPage();
        page.on('console', m => { if (m.type() === 'error') console.log(`  [console.error] ${m.text()}`); });
        page.on('requestfailed', r => console.log(`  [404?] ${r.url()}`));

        // Najpierw wejscie na strone (localStorage wymaga origin), potem wstrzykniecie stanu.
        await page.goto(URL_BASE, { waitUntil: 'load' });
        await page.evaluate(([p, prog, pid]) => {
            localStorage.setItem('bt2:profiles', JSON.stringify([p]));
            localStorage.setItem('bt2:activeProfileId', pid);
            localStorage.setItem('bt2:progression', JSON.stringify({ [pid]: prog }));
        }, [profile, progression, PROFILE_ID]);
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(3000);   // intro + splash

        /**
         * Splash czeka na dotkniecie — bez tego hub sie nie zamontuje. Klikamy KONKRETNY
         * ELEMENT (`button.bt-intro-start`), nie wspolrzedne: okno zmienia rozmiar miedzy
         * wariantami, wiec srodek ekranu raz trafia w przycisk, a raz w tapete.
         */
        const start = page.locator('button.bt-intro-start');
        await start.waitFor({ state: 'visible', timeout: 15000 });
        await start.click();
        await page.waitForTimeout(3000);

        // Jesli wstrzykniety profil zostal odczytany, gra POMIJA ekran tozsamosci.
        if (await page.locator('[data-action="nickname"]').count()) {
            console.log(`  [${name}] BLAD: gra pokazala ekran tozsamosci — profil z localStorage nie zostal wczytany.`);
        }

        // Profil to sekcja UKRYTA poza nawigacja — wejscie idzie przez chip gracza.
        const chip = page.locator('[data-action="profile"]').first();
        if (await chip.count()) {
            await chip.click();
            await page.waitForTimeout(1500);
        } else {
            console.log(`  [${name}] UWAGA: nie znalazlem chipu profilu — zrzut pokaze hub, nie profil.`);
        }

        const file = path.join(OUT, `s3-skin-${name}.png`);
        await page.screenshot({ path: file, fullPage: false });
        shots.push(file);

        /**
         * SEDNO SPRAWDZENIA: czy `decor.jpg` faktycznie siedzi w wyliczonym stylu hero.
         * Czytamy computed style, a NIE `performance.getEntriesByType('resource')` —
         * resource timing gubi tla CSS pobrane z cache i daje falszywe "nie wczytano"
         * przy obrazku, ktory widac na ekranie.
         */
        const applied = await page.evaluate(() => {
            const hit = [...document.querySelectorAll('*')].find(el =>
                getComputedStyle(el).backgroundImage.includes('seasons/s3/decor'));
            if (!hit) return null;
            const bi = getComputedStyle(hit).backgroundImage;
            return { el: `${hit.tagName}.${hit.className}`, url: (bi.match(/url\("([^"]*decor[^"]*)"\)/) || [])[1] };
        });
        console.log(applied
            ? `[${name}] OK — decor.jpg nalozony na ${applied.el}\n         ${applied.url}`
            : `[${name}] BLAD — zadnego elementu z tlem seasons/s3/decor`);

        // Zakladka KOLEKCJA — tam kosmetyk wystepuje jako kafel w gablocie.
        const collection = page.locator('button:has-text("Kolekcja")').first();
        if (await collection.count()) {
            await collection.click();
            await page.waitForTimeout(1200);
            const colFile = path.join(OUT, `s3-skin-${name}-kolekcja.png`);
            await page.screenshot({ path: colFile });
            shots.push(colFile);
        }
        await ctx.close();
    }
} finally {
    await browser.close();
}
console.log('\nZrzuty:\n' + shots.map(s => '  ' + path.relative(REPO, s)).join('\n'));
