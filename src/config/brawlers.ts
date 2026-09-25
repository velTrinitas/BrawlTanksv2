import type { Brawler } from '../types/Brawler';
import { isBalanceV2Enabled } from './balanceFlag';     // BALANCE_V2 (v0.200.0)
import { BALANCE_V2_STATS } from './balanceRules';

    const BASE = import.meta.env.BASE_URL;

    // v0.46.0 HP/DMG Scale x100: hp + dmg pomnozone x100 (Brawl Stars-like number feel).
    // speed/reload NIETKNIETE (to nie skala HP/DMG). Wartosci bazowe = realne z v0.45.0.
    /**
     * v1 = roster produkcyjny (nietkniety). BALANCE_V2 (v0.200.0) NIE edytuje tych liczb —
     * nadpisuje je przy budowie `BRAWLERS`, zeby `?bal=0` zawsze mial do czego wrocic.
     */
    export const BRAWLERS_V1: Brawler[] = [
        { id: 'twardy',  emoji: '🪖', icon: BASE + 'assets/tanks/twardy.jpg',    name: 'Twardy',   colorMain: '#27ae60', hp: 400, speed: 5,   dmg: 100, reload: 400,  type: 'standard', flag: 'PL' },
        { id: 'heavy',   emoji: '🛡️', icon: BASE + 'assets/tanks/pancerny.jpg',  name: 'Pancerny', colorMain: '#8e44ad', hp: 700, speed: 4, dmg: 150, reload: 700,  type: 'standard', flag: 'PL' },
        { id: 'scout',   emoji: '🔍', icon: BASE + 'assets/tanks/zwiadowca.jpg', name: 'Zwiad',    colorMain: '#f1c40f', hp: 200, speed: 7.5, dmg: 80,  reload: 250,  type: 'standard', flag: 'PL' },
        { id: 'sniper',  emoji: '🎯', icon: BASE + 'assets/tanks/snajper.jpg',   name: 'Snajper',  colorMain: '#3498db', hp: 300, speed: 4.5, dmg: 300, reload: 1000, type: 'fast',     flag: 'PL' },
        { id: 'plasma',  emoji: '💻', icon: BASE + 'assets/tanks/tech.jpg',      name: 'Tech',     colorMain: '#71B7F2', hp: 400, speed: 5,   dmg: 120, reload: 500,  type: 'plasma',   flag: 'PL' },
        { id: 'pyro',    emoji: '🔥', icon: BASE + 'assets/tanks/ogniarz.jpg',   name: 'Ogniarz',  colorMain: '#b04a35', hp: 500, speed: 4.8, dmg: 50,  reload: 210,  type: 'spread',   flag: 'PL' },
        { id: 'shadow',  emoji: '🌑', icon: BASE + 'assets/tanks/shadow.jpg',    name: 'Shadow',   colorMain: '#5E587A', hp: 300, speed: 6.5, dmg: 150, reload: 600,  type: 'standard', flag: 'PL' },
        { id: 'king',    emoji: '👑', icon: BASE + 'assets/tanks/krol.jpg',      name: 'King',     colorMain: '#E02948', hp: 500, speed: 5.5, dmg: 200, reload: 500,  type: 'standard', flag: 'PL' },
    ];

    /**
     * BALANCE_V2 (v0.200.0) — roster AKTYWNY w tej sesji.
     *
     * Liczony RAZ przy starcie modulu, bo flaga zalezy od stalej + parametru URL, a te nie zmieniaja
     * sie w trakcie zycia karty. Dzieki temu wszystkie 8 miejsc importujacych `BRAWLERS` (gra, hub,
     * garaz, przymierzalnia, wrogowie) dostaje spojne wartosci BEZ zmiany ani jednej linii u siebie —
     * i UI nigdy nie pokaze innych statow, niz liczy symulacja.
     *
     * Nadpisywane sa WYLACZNIE pola z rulesetu; `id/emoji/icon/name/colorMain/type/flag` zostaja.
     */
    function buildRoster(): Brawler[] {
        if (!isBalanceV2Enabled()) return BRAWLERS_V1;
        return BRAWLERS_V1.map(b => {
            const s = BALANCE_V2_STATS[b.id];
            if (!s) return b;   // nieznany czolg = zostaje na v1 (nigdy nie gubimy brawlera przez balans)
            return {
                ...b,
                hp: s.hp, dmg: s.dmg, reload: s.reload, speed: s.speed,
                maxDist: s.maxDist, bulletRadius: s.bulletRadius,
                volley: s.volley ? { count: s.volley.count, spread: s.volley.spread } : undefined,
                pierce: s.pierce, dash: s.dash,
                pierceDmgAfter: s.pierceDmgAfter, cubeDmgMult: s.cubeDmgMult, // v0.211.0
            };
        });
    }

    export const BRAWLERS: Brawler[] = buildRoster();