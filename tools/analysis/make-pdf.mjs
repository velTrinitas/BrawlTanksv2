/**
 * make-pdf.mjs — HTML raportu -> PDF przez Chromium z Playwrighta.
 *
 * Playwright jest juz w devDependencies (wzorzec `tools/sigma-tester/run.mjs`),
 * wiec PDF nie dokłada ani jednej zaleznosci. `printBackground: true` jest
 * konieczne — bez niego znikaja kafle, wyroznienia i WSZYSTKIE slupki wykresow.
 */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(REPO, 'docs', 'reports');
const SRC = path.join(OUT, 'WYNIKI_TESTOW_2026-09-01_23.html');
const PDF = path.join(OUT, 'WYNIKI_TESTOW_2026-09-01_23.pdf');

/**
 * Uzywamy SYSTEMOWEGO Chrome (`channel: 'chrome'`), a nie Chromium pobieranego przez
 * Playwrighta. Powod: `npx playwright install` sciaga ~150 MB, a do wydrukowania
 * statycznego HTML-a wystarczy przegladarka, ktora jest juz na maszynie. Fallback na
 * pobrany Chromium zostaje na wypadek maszyny bez Chrome (np. CI).
 */
let browser;
try {
    browser = await chromium.launch({ channel: 'chrome' });
} catch (e) {
    console.warn(`[make-pdf] Systemowy Chrome niedostepny (${e.message.split('\n')[0]}), probuje Chromium Playwrighta.`);
    browser = await chromium.launch();
}
try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(SRC).href, { waitUntil: 'load' });
    // Marginesy sa w @page, ale Chromium honoruje je tylko gdy `preferCSSPageSize`.
    await page.pdf({
        path: PDF,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
            '<div style="width:100%;font:7pt \'Segoe UI\',sans-serif;color:#8a8880;padding:0 13mm;'
            + 'display:flex;justify-content:space-between">'
            + '<span>Sigma Tanks &middot; Wyniki testow 01-23.09.2026</span>'
            + '<span class="pageNumber"></span>/<span class="totalPages"></span></div>',
    });
    console.log(`-> ${path.relative(REPO, PDF)}`);
} finally {
    await browser.close();
}
