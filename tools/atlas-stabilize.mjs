// atlas-stabilize.mjs — GARAZ-3 (v0.158.0). Post-processing atlasu obrotnicy 3/4.
//
// Co robi (kolejnosc wypracowana na pilocie KROLA — pelna historia w
// docs/garage-tank-pipeline.md):
//  1. DESPILL zielonej poswiaty: kolor schodzi, ALPHA ZOSTAJE (kasowanie
//     pikseli krawedzi = strzepy — lekcja z pilota; pelne zielone bloby out),
//  2. miekki cien/podloga pod czolgiem: ponizej "twardego" dolu sylwetki
//     schodzi tylko polprzezroczystosc + odseparowane wyspy (ZERO ciecia po
//     kolumnach — to wlasnie robilo strzepy),
//  3. STABILIZACJA OSI: rejestracja klatka-do-klatki (argmin roznicy masek
//     alfa, jak stabilizator wideo) + domkniecie petli 360 + globalna kotwica
//     na srodku kafla (mediana midpointow pasa gasienic),
//  4. kotwica dolu (0.85*FS) — czolg "stoi" na stalym gruncie,
//  5. wygladzenie alfy TYLKO w strefie krawedzi (3x3 gauss).
// Czysta TRANSLACJA (int) — zero resamplingu, zero utraty ostrosci.
//
// Uzycie (wymaga sharp, NIE zapisujemy go w package.json):
//   npm i --no-save sharp
//   node tools/atlas-stabilize.mjs <brawlerId> [--key=green]
// Domyslnie BEZ czyszczenia koloru tla (--key=none): kolory czolgu 1:1
// z filmem (lekcja z TWARDEGO — globalny despill przeklamywal zielony
// kamuflaz). --key=green wlacza czyszczenie resztek zieleni TYLKO dla
// czolgow bez zielonego artu (np. king).
//
// Wejscie/wyjscie: public/assets/tanks/turn/<id>/atlas.webp (in-place).
// Backup: atlas.orig.webp obok (USUN po akceptacji, NIE commitowac).
// Podglad: atlas.preview.png obok (tez do skasowania po ogledzinach).

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
let sharp;
try { sharp = require('sharp'); }
catch {
    console.error('BRAK sharp. Zainstaluj (bez zapisu do package.json):\n  npm i --no-save sharp');
    process.exit(1);
}

const id = process.argv[2];
if (!id) { console.error('Uzycie: node tools/atlas-stabilize.mjs <brawlerId>  (np. king)'); process.exit(1); }
const DIR = path.join(ROOT, 'public', 'assets', 'tanks', 'turn', id);
const ATLAS = path.join(DIR, 'atlas.webp');
const META = path.join(DIR, 'meta.json');
if (!existsSync(ATLAS) || !existsSync(META)) {
    console.error(`Brak ${ATLAS} lub meta.json — najpierw eksport z tools/turntable-cutter.html`);
    process.exit(1);
}
const meta = JSON.parse(readFileSync(META, 'utf8'));
const FS = meta.frameSize, COLS = meta.cols, N = meta.frames;
console.log(`[${id}] ${N} klatek @ ${FS}px (grid ${COLS}x${Math.ceil(N / COLS)})`);

copyFileSync(ATLAS, path.join(DIR, 'atlas.orig.webp'));
const { data, info } = await sharp(ATLAS).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const idx = (x, y) => (y * W + x) * 4;

// ── 1. (OPCJONALNE, --key=green) despill + kill zielonych blobow ──
// Domyslnie POMIJANE: kolory czolgu maja byc 1:1 z filmem. Wlaczac tylko
// dla czolgow BEZ zielonego artu, gdy z cuttera zostaly zielone resztki.
const keyMode = (process.argv.find(a => a.startsWith('--key=')) ?? '--key=none').slice(6);
if (keyMode === 'green') {
    let despilled = 0, killedGreen = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (g > r + 30 && g > b + 10 && data[i + 3] >= 200) { data[i + 3] = 0; killedGreen++; }
        else if (g > r + 6 && g > b) { data[i + 1] = Math.min(g, Math.round((r + b) / 2) + 8); despilled++; }
    }
    console.log('despill px:', despilled, '| zielone bloby:', killedGreen);
} else {
    console.log('key-cleanup: pominiete (kolory 1:1 z filmem; wlacz --key=green gdy trzeba)');
}

// ── 2. miekki cien + dol sylwetki per klatka ──
const bots = [], lefts = [], rights = [];
let shadow = 0;
for (let f = 0; f < N; f++) {
    const ox = (f % COLS) * FS, oy = Math.floor(f / COLS) * FS;
    const rows = new Array(FS).fill(0);
    for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++)
        if (data[idx(ox + x, oy + y) + 3] >= 200) rows[y]++;
    const rT = Math.max(...rows) * 0.12;
    let bot = FS - 1; while (bot > 0 && rows[bot] < rT) bot--;
    bots.push(bot);
    for (let y = bot + 1; y < FS; y++) for (let x = 0; x < FS; x++) {
        const i = idx(ox + x, oy + y);
        if (data[i + 3] === 0) continue;
        if (data[i + 3] < 140 || y > bot + 6) { data[i + 3] = 0; shadow++; }
    }
    // skrajnie pasa gasienic (sztywny fragment — bez plomienia/anteny/dymu)
    const strip = Math.round(FS * 0.14);
    const cols = new Array(FS).fill(0);
    for (let y = Math.max(0, bot - strip); y <= bot; y++) for (let x = 0; x < FS; x++)
        if (data[idx(ox + x, oy + y) + 3] >= 200) cols[x]++;
    const cT = Math.max(...cols) * 0.2;
    let left = 0, right = FS - 1;
    while (left < FS && cols[left] < cT) left++;
    while (right > left && cols[right] < cT) right--;
    lefts.push(left); rights.push(right);
}
console.log('cien px:', shadow);

// ── 3. rejestracja klatka-do-klatki (maski alfa @2x, argmin XOR) ──
const HS = Math.floor(FS / 2);
function maskOf(f) {
    const ox = (f % COLS) * FS, oy = Math.floor(f / COLS) * FS;
    const m = new Uint8Array(HS * HS);
    for (let y = 0; y < HS; y++) for (let x = 0; x < HS; x++) {
        let v = 0;
        for (let dy = 0; dy < 2 && !v; dy++) for (let dx = 0; dx < 2; dx++)
            if (data[idx(ox + x * 2 + dx, oy + y * 2 + dy) + 3] > 128) { v = 1; break; }
        m[y * HS + x] = v;
    }
    return m;
}
const masks = [];
for (let f = 0; f < N; f++) masks.push(maskOf(f));
const MAXS = 16;
function bestShift(mA, mB) {
    let best = 0, bestCost = Infinity;
    for (let s = -MAXS; s <= MAXS; s++) {
        let cost = 0;
        const x0 = Math.max(0, -s), x1 = Math.min(HS, HS - s);
        for (let y = 0; y < HS; y++) {
            const row = y * HS;
            for (let x = x0; x < x1; x++) cost += mA[row + x] ^ mB[row + x + s];
        }
        if (cost < bestCost) { bestCost = cost; best = s; }
    }
    return -best;
}
const rel = [];
for (let f = 0; f < N; f++) rel.push(bestShift(masks[f], masks[(f + 1) % N]) * 2);
const off = [0];
for (let f = 0; f < N - 1; f++) off.push(off[f] + rel[f]);
const closure = off[N - 1] + rel[N - 1];
console.log('domkniecie petli:', closure, 'px (blisko 0 = spojna rejestracja)');
for (let f = 0; f < N; f++) off[f] -= Math.round((closure * f) / N);
const mean = off.reduce((a, v) => a + v, 0) / N;
const anchors = [];
for (let f = 0; f < N; f++) anchors.push((lefts[f] + rights[f] + 1) / 2 + (off[f] - mean));
anchors.sort((a, b) => a - b);
const globalShift = Math.round(FS / 2 - anchors[N >> 1]);
const shifts = off.map(o => Math.round(o - mean) + globalShift);
console.log('przesuniecia per klatka:', shifts.join(','));

// ── 4. translacja (int) + kotwica dolu ──
const out = Buffer.alloc(data.length);
const targetBot = Math.round(FS * 0.85);
for (let f = 0; f < N; f++) {
    const ox = (f % COLS) * FS, oy = Math.floor(f / COLS) * FS;
    const sX = shifts[f];
    const dY = targetBot - (bots[f] + 1);
    for (let y = 0; y < FS; y++) {
        const sy = y - dY;
        if (sy < 0 || sy >= FS) continue;
        for (let x = 0; x < FS; x++) {
            const sx = x - sX;
            if (sx < 0 || sx >= FS) continue;
            const si = idx(ox + sx, oy + sy), di = idx(ox + x, oy + y);
            out[di] = data[si]; out[di + 1] = data[si + 1];
            out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
        }
    }
}

// ── 5. wygladzenie alfy w strefie krawedzi ──
const alphaCopy = Buffer.alloc(W * W);
for (let p = 0; p < W * W; p++) alphaCopy[p] = out[p * 4 + 3];
const K = [1, 2, 1, 2, 4, 2, 1, 2, 1];
for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
    let has0 = false, hasS = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const v = alphaCopy[(y + dy) * W + x + dx];
        if (v === 0) has0 = true; else if (v > 128) hasS = true;
    }
    if (!has0 || !hasS) continue;
    let acc = 0, k = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const w = K[(dy + 1) * 3 + dx + 1];
        acc += alphaCopy[(y + dy) * W + x + dx] * w; k += w;
    }
    out[(y * W + x) * 4 + 3] = Math.round(acc / k);
}

const outBuf = await sharp(out, { raw: { width: W, height: W, channels: 4 } })
    .webp({ quality: 92, alphaQuality: 95 }).toBuffer();
// zapis przez WRITE (nie unlink+rename — vite watchuje plik i blokuje unlink)
writeFileSync(ATLAS, outBuf);
await sharp(outBuf).resize(1020, 1020).png().toFile(path.join(DIR, 'atlas.preview.png'));
console.log(`OK: ${ATLAS} (${outBuf.length} B). Obejrzyj atlas.preview.png,`
    + ' potem USUN atlas.orig.webp i atlas.preview.png (nie commitowac).');
