import { defineConfig } from 'vite';

export default defineConfig({
    // base: ścieżka dla GitHub Pages (repo: BrawlTanksv2)
    // → https://veltrinitas.github.io/BrawlTanksv2/
    base: '/BrawlTanksv2/',

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