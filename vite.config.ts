import { defineConfig } from 'vite';

// ── DEV-ONLY: most perf z telefonu -> log dev-servera (czyta go Claude Code). ──
// Aktywne tylko w `vite` (dev). Telefon POST-uje linijke perf na /perf-log,
// serwer wypisuje ja na stdout. Zero wplywu na prod (plugin nie rusza buildu).
// KASOWANIE: usun ten plugin z listy `plugins` ponizej.
const perfLogMiddleware = (req: any, res: any, next: any) => {
    if (req.method === 'POST' && req.url && req.url.includes('perf-log')) {
        let body = '';
        req.on('data', (c: any) => { body += c; });
        req.on('end', () => {
            // Jedna linia z prefixem, zeby latwo grepowac w logu.
            console.log('[PERF] ' + body.replace(/\n/g, ' | '));
            res.statusCode = 204;
            res.end();
        });
        return;
    }
    next();
};
const perfLogPlugin = {
    name: 'bt-perf-log',
    // Dev (vite) i preview (prod build via `vite preview`) — oba serwuja /perf-log.
    configureServer(server: any) { server.middlewares.use(perfLogMiddleware); },
    configurePreviewServer(server: any) { server.middlewares.use(perfLogMiddleware); },
};

export default defineConfig({
    // base: ścieżka dla GitHub Pages (repo: BrawlTanksv2)
    // → https://veltrinitas.github.io/BrawlTanksv2/
    base: '/BrawlTanksv2/',

    plugins: [perfLogPlugin],

    server: {
        port: 5173,
        open: true,
    },

    build: {
        outDir: 'dist',
        target: 'es2022',
        sourcemap: true,

        // ── WARSTWA 1 (lab 2.5D) ─────────────────────────────────────────────
        // Drugie wejście buildu. Gra (index.html / main.ts) POZOSTAJE NIETKNIĘTA.
        // Ścieżki względne są rozwiązywane przez Vite od katalogu root (= tu repo),
        // więc NIE potrzeba importu 'path' ani '__dirname' (a tym samym @types/node).
        // Dev:  http://localhost:5173/lab.html   (gra nadal na /)
        // Prod: Actions robi `vite build` → cały dist/ → dist/lab.html sam się deployuje.
        // KASOWANIE LABA = usuń ten blok rollupOptions + folder src/experimental/ + lab.html.
        rollupOptions: {
            input: {
                main: 'index.html',
                lab: 'lab.html',
            },
        },
    },
});