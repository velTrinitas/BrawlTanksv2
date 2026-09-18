/**
 * DamageSmoke — v0.188.0 (FAZA 2, iteracja 3).
 *
 * DLACZEGO OSOBNY MODUL, a nie `Effects.spawnRocketSmoke` z puli czasteczek:
 * Mariusz nie widzial dymu uszkodzenia na tablecie ANI na telefonie, mimo ze w poprzedniej iteracji
 * zostal zageszczony. Audyt wykazal TRZY niezalezne przyczyny, z ktorych kazda sama wystarcza:
 *
 *  1. WARSTWA — `particleContainer.zIndex` to stale 500, a czolg ma `zIndex = y + 40` przy
 *     `WORLD_H = 3000`. Dla kazdego czolgu ponizej y = 460, czyli na ~85% mapy, czasteczki rysuja sie
 *     POD czolgiem. Dym spawnowal sie w obrysie kadluba, wiec byl po prostu zaslaniany.
 *  2. RECYKLING — pula ma cap 200, a przy pelnej puli nowa czasteczka NADPISUJE zywa (round-robin).
 *     W walce (eksplozja 28 czastek, iskry 11, muzzle flash 6 na strzal) wskaznik obiega pule w kilka
 *     klatek, wiec dym o zyciu 18 klatek znikal po kilku.
 *  3. SAMA CZASTKA — 24 px swiata to 14 px na ekranie przy zoomie 0.6, kolor jasnoszary na piasku,
 *     staly promien, bez dryfu, alpha do zera w 0.3 s.
 *
 * ROZWIAZANIE: kopiujemy technike, ktora w tej grze JUZ dziala i jest widoczna — dym wiezy Krolowej
 * (`DungeonTower`, `fx.zIndex = 15000`): wlasna `PIXI.Graphics`, wlasna tablica z capem, promien
 * ROSNIE, klab dryfuje w gore, dwie warstwy (ciemny korpus + jasny rant) dla kontrastu na kazdym tle.
 *
 * Koszt: jedna Graphics przerysowywana co klatke przy <= MAX_PUFFS klebow — tyle samo, co wieza
 * Krolowej, ktora dziala na produkcji. Zero nowych tekstur, zero wplywu na pule czasteczek.
 */

import * as PIXI from 'pixi.js';

interface Puff { x: number; y: number; r: number; age: number; life: number; drift: number }

/** Twardy sufit klebow. Fill-rate to ship-blocker na mobile — plynnosc wywalczona w v0.187.0. */
const MAX_PUFFS = 18;
/** Warstwa: nad czolgami (te maja y + 40, max ~3040), pod tekstem obrazen (20000). */
const Z_INDEX = 15000;

export class DamageSmoke {
    private gfx: PIXI.Graphics;
    private puffs: Puff[] = [];

    constructor(worldContainer: PIXI.Container) {
        this.gfx = new PIXI.Graphics();
        this.gfx.zIndex = Z_INDEX;
        worldContainer.addChild(this.gfx);
    }

    /** Nowy kleb dymu. Ignorowany po cichu, gdy sufit osiagniety — dym jest ozdoba, nie mechanika. */
    spawn(x: number, y: number): void {
        if (this.puffs.length >= MAX_PUFFS) return;
        this.puffs.push({
            x: x + (Math.random() - 0.5) * 18,
            y: y + (Math.random() - 0.5) * 10,
            r: 7 + Math.random() * 3,
            age: 0,
            life: 620 + Math.random() * 220,
            drift: 0.4 + Math.random() * 0.5, // lekki dryf w bok, zeby slup nie byl idealnie pionowy
        });
    }

    /** @param dtMs czas klatki w ms (delta * 16.67) */
    update(dtMs: number): void {
        const g = this.gfx;
        g.clear();
        for (let i = this.puffs.length - 1; i >= 0; i--) {
            const p = this.puffs[i];
            p.age += dtMs;
            if (p.age >= p.life) { this.puffs.splice(i, 1); continue; }
            // Rosnacy promien + dryf w gore — to wlasnie czyni dym widocznym przy zoomie 0.6.
            p.r += 0.035 * dtMs;
            p.y -= 0.022 * dtMs;
            p.x += p.drift * (dtMs / 1000) * 12;
            const k = 1 - p.age / p.life;
            const a = 0.5 * k;
            // Ciemny korpus czyta sie na jasnych mapach (pustynia, arktyka), jasny rant na ciemnych
            // (dungeon, miasto noca). Dwie warstwy = kontrast niezalezny od tla.
            g.beginFill(0x2b2b30, a);
            g.drawCircle(p.x, p.y, p.r);
            g.endFill();
            g.beginFill(0xd8d8e0, a * 0.30);
            g.drawCircle(p.x + p.r * 0.22, p.y - p.r * 0.26, p.r * 0.52);
            g.endFill();
        }
    }

    /** Gasi dym bez niszczenia obiektu (np. gdy gracz wyszedl ze stanu krytycznego). */
    clear(): void {
        this.puffs.length = 0;
        this.gfx.clear();
    }

    destroy(): void {
        this.puffs.length = 0;
        this.gfx.destroy();
    }
}
