import { defineConfig } from 'vite';

export default defineConfig({
    // base: ścieżka dla GitHub Pages. Repo nazywa się BrawlTanksv2 → live URL będzie:
    // https://veltrinitas.github.io/BrawlTanksv2/
    base: '/BrawlTanksv2/',
    
    server: {
        // localhost:5173 — domyślne, ale jawnie żeby było wiadomo
        port: 5173,
        open: true, // automatycznie otwiera przeglądarkę przy `npm run dev`
    },
    
    build: {
        outDir: 'dist',
        target: 'es2022',
        // sourcemap dla łatwiejszego debugowania na produkcji (zostaw na razie)
        sourcemap: true,
    },
});