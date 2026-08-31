/**
 * crosshairs.ts — SHOP-2 (v0.138.0). Rejestr wygladow celownika.
 *
 * ZRODLO KANONICZNE: `docs/prototypes/BT_Crosshairs_v1.html`. Geometria kazdego
 * `draw()` przeniesiona 1:1 — prototyp jest specem WYGLADU (nie architektury), wiec
 * przepisywanie liczb "po swojemu" byloby bledem, a nie ulepszeniem.
 *
 * REJESTR, NIE IF-CHAIN (ta sama zasada co przy mocach, `.claude/rules/super-powers.md`):
 * HUD wykonuje definicje, nie rozpoznaje id. Nowy celownik = jeden wpis tutaj + jeden
 * wiersz w `COSMETICS` — zero dotykania renderu.
 *
 * ── BUDZET MOBILNY, KLASA S (kontrakt ze specu §3, egzekwowany gremem) ──────────
 *   - ZERO `shadowBlur` (zabojca fill-rate na A54)
 *   - ZERO gradientow tworzonych per-frame
 *   - ZERO `Math.random()` w rysowaniu (celownik ma byc przewidywalny, nie zywy)
 *   - DOKLADNIE JEDEN animowany element w calym zestawie: `ch_sigma`, jeden
 *     `ctx.rotate` 12 stopni/s. Kazde kolejne `rotate` w tym pliku to regresja budzetu.
 *   - kazdy wariant <= ~20 operacji sciezki na klatke, czyli tyle co stary krzyz
 *
 * ── KONTRAKT CZYTELNOSCI (spec §3 — Czytelnosc jest wartoscia #1) ──────────────
 *   1. dwa przebiegi: ciemny kontur #111 POD kolorem (jedyne, co daje kontrast
 *      i na piasku Pustyni, i na sniegu Arktyki, i na neonach City)
 *   2. wolna przerwa w srodku — cel NIGDY nie zakryty
 *   3. koperta <= 20*s promienia; warianty roznia sie sylwetka i kolorem, NIE wielkoscia
 *   4. kropka celu obecna ZAWSZE — punkt trafienia musi byc jednoznaczny
 *   5. lineCap/lineJoin 'round'
 * Bramka to kolumna s=1.5 (mobile, zoom 0.7), nie desktop.
 */

/** Id wygladu. `ch_default` NIE jest kosmetykiem — patrz komentarz przy rejestrze. */
export type CrosshairId =
    | 'ch_default'
    | 'ch_sniper' | 'ch_brackets' | 'ch_ring' | 'ch_fangs' | 'ch_laser' | 'ch_sigma';

export interface CrosshairStyle {
    readonly color: string;
    /**
     * @param c   kontekst 2D HUD-a (lub mini-canvasu podgladu w hubie)
     * @param x,y srodek celownika w pikselach EKRANU
     * @param s   skala (HUD: `crosshairScale` — 1.0 desktop / 1.5 dotyk)
     * @param t   czas w SEKUNDACH; uzywa go wylacznie `ch_sigma`
     */
    draw(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void;
}

/** Wyglad, gdy gracz nie ma nic zalozonego. Nie do kupienia, nie do zdjecia. */
export const DEFAULT_CROSSHAIR: CrosshairId = 'ch_default';

// ── helpery (idiom starego HUD.drawCrosshair, przeniesione z prototypu) ─────────

/**
 * Dwa przebiegi tej samej sciezki: najpierw grubszy ciemny kontur, potem kolor.
 * `path` jest wolane DWA razy — musi byc czyste (zero efektow ubocznych).
 */
function twoPass(
    c: CanvasRenderingContext2D,
    color: string,
    outerW: number,
    innerW: number,
    path: (cc: CanvasRenderingContext2D) => void,
): void {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = '#111';
    c.lineWidth = outerW;
    c.beginPath();
    path(c);
    c.stroke();
    c.strokeStyle = color;
    c.lineWidth = innerW;
    c.beginPath();
    path(c);
    c.stroke();
}

/** Kropka celu w obwodce — punkt trafienia czytelny na kazdym tle. */
function centerDot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    c.fillStyle = '#111';
    c.beginPath();
    c.arc(x, y, r + 1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
}

/** Zlota kropka Sigmy — jedyny wariant, w ktorym kropka ma inny kolor niz sylwetka. */
const SIGMA_ACCENT = '#f1c40f';

/**
 * REJESTR.
 *
 * `ch_default` to dzisiejszy czerwony krzyz, wyjety z `HUD.drawCrosshair` bez zmiany
 * ani jednej liczby. Zyje TYLKO tutaj — nie ma go w `COSMETICS`, wiec nie jest ani
 * pozycja w sklepie, ani kafelkiem w kolekcji. Dzieki temu gracz bez zakupu nie traci
 * niczego, a zdjecie kupionego celownika (equipCosmetic to toggle po typie) wraca
 * do niego samo, bez zadnej dodatkowej logiki.
 */
export const CROSSHAIR_STYLES: Record<CrosshairId, CrosshairStyle> = {
    ch_default: {
        color: '#e74c3c',
        draw(c, x, y, s) {
            const L = 16 * s, G = 5 * s;
            twoPass(c, this.color, 3.5 * s, 2 * s, cc => {
                cc.moveTo(x - L, y); cc.lineTo(x - G, y);
                cc.moveTo(x + G, y); cc.lineTo(x + L, y);
                cc.moveTo(x, y - L); cc.lineTo(x, y - G);
                cc.moveTo(x, y + G); cc.lineTo(x, y + L);
            });
            centerDot(c, x, y, 2.5 * s, this.color);
        },
    },

    ch_sniper: {
        color: '#eaf2f8',
        draw(c, x, y, s) {
            const L = 20 * s, G = 8 * s;
            twoPass(c, this.color, 3 * s, 1.4 * s, cc => {
                cc.moveTo(x - L, y); cc.lineTo(x - G, y);
                cc.moveTo(x + G, y); cc.lineTo(x + L, y);
                cc.moveTo(x, y - L); cc.lineTo(x, y - G);
                cc.moveTo(x, y + G); cc.lineTo(x, y + L);
            });
            centerDot(c, x, y, 1.4 * s, this.color);
        },
    },

    ch_brackets: {
        color: '#f1c40f',
        draw(c, x, y, s) {
            const R = 12 * s, A = 7 * s;
            twoPass(c, this.color, 4 * s, 2.2 * s, cc => {
                for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                    cc.moveTo(x + sx * R, y + sy * (R - A));
                    cc.lineTo(x + sx * R, y + sy * R);
                    cc.lineTo(x + sx * (R - A), y + sy * R);
                }
            });
            centerDot(c, x, y, 2 * s, this.color);
        },
    },

    ch_ring: {
        color: '#3aa0e0',
        draw(c, x, y, s) {
            twoPass(c, this.color, 3.5 * s, 2 * s, cc => {
                cc.moveTo(x + 10 * s, y); cc.arc(x, y, 10 * s, 0, Math.PI * 2);
                for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                    cc.moveTo(x + dx * 13 * s, y + dy * 13 * s);
                    cc.lineTo(x + dx * 17 * s, y + dy * 17 * s);
                }
            });
            centerDot(c, x, y, 2 * s, this.color);
        },
    },

    ch_fangs: {
        color: '#ff6b35',
        draw(c, x, y, s) {
            const TIP = 8 * s, ARM = 7.5 * s, SPREAD = 0.62; // rad od osi radialnej
            twoPass(c, this.color, 4 * s, 2.2 * s, cc => {
                for (let k = 0; k < 4; k++) {
                    const a = Math.PI / 4 + k * Math.PI / 2;   // 45, 135, 225, 315 stopni
                    const tx = x + Math.cos(a) * TIP, ty = y + Math.sin(a) * TIP;
                    const a1 = a + SPREAD, a2 = a - SPREAD;
                    cc.moveTo(tx + Math.cos(a1) * ARM, ty + Math.sin(a1) * ARM);
                    cc.lineTo(tx, ty);
                    cc.lineTo(tx + Math.cos(a2) * ARM, ty + Math.sin(a2) * ARM);
                }
            });
            centerDot(c, x, y, 1.8 * s, this.color);
        },
    },

    ch_laser: {
        color: '#ff2d2d',
        draw(c, x, y, s) {
            twoPass(c, this.color, 3.2 * s, 1.5 * s, cc => {
                cc.moveTo(x + 5.5 * s, y); cc.arc(x, y, 5.5 * s, 0, Math.PI * 2);
                cc.moveTo(x - 20 * s, y); cc.lineTo(x - 15 * s, y);
                cc.moveTo(x + 15 * s, y); cc.lineTo(x + 20 * s, y);
            });
            // save/restore, bo `setLineDash` jest stanem kontekstu — bez tego przerywana
            // linia wyciekalaby na WSZYSTKO, co HUD narysuje po celowniku.
            c.save();
            c.setLineDash([4 * s, 5 * s]);
            twoPass(c, this.color, 3 * s, 1.4 * s, cc => {
                cc.moveTo(x + 13 * s, y); cc.arc(x, y, 13 * s, 0, Math.PI * 2);
            });
            c.restore();
            centerDot(c, x, y, 2.6 * s, this.color);
        },
    },

    ch_sigma: {
        color: '#b07ef7',
        draw(c, x, y, s, t) {
            // Statyczny mikro-krzyz — zostaje nieruchomy, zeby oko mialo staly punkt
            // odniesienia mimo obracajacego sie ringu (Czytelnosc przed efektem).
            twoPass(c, this.color, 3.4 * s, 1.9 * s, cc => {
                for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                    cc.moveTo(x + dx * 5 * s, y + dy * 5 * s);
                    cc.lineTo(x + dx * 8.5 * s, y + dy * 8.5 * s);
                }
            });
            c.save();
            c.translate(x, y);
            c.rotate((t * 12 * Math.PI) / 180);   // 12 stopni/s — JEDYNA animacja w pliku
            twoPass(c, this.color, 4 * s, 2.2 * s, cc => {
                const R = 13 * s;
                for (let k = 0; k < 3; k++) {
                    const a = -Math.PI / 2 + k * (2 * Math.PI / 3);
                    const px = Math.cos(a) * R, py = Math.sin(a) * R;
                    if (k === 0) cc.moveTo(px, py); else cc.lineTo(px, py);
                }
                cc.closePath();
            });
            c.restore();
            centerDot(c, x, y, 2.2 * s, SIGMA_ACCENT);
        },
    },
};

/** Bezpieczny odczyt: nieznane id (np. z chmury po rollbacku) spada na domyslny. */
export function crosshairStyle(id: string | undefined): CrosshairStyle {
    return CROSSHAIR_STYLES[id as CrosshairId] ?? CROSSHAIR_STYLES[DEFAULT_CROSSHAIR];
}
