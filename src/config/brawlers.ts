import type { Brawler } from '../types/Brawler';

/**
 * 8 czołgów grywalnych.
 * v0.9 Sesja 7 final: 3 brawlery z AI sprites (King, Tech/plasma, Shadow).
 *                     Pyro przeszedł na PROGRAMMATIC (high cartoon art Canvas 2D).
 *                     Pozostałe 4 na generic bake.
 */
const BASE = import.meta.env.BASE_URL;

export const BRAWLERS: Brawler[] = [
    { id: 'twardy',  emoji: '🪖', icon: BASE + 'assets/tanks/twardy.jpg',    name: 'Twardy',   colorMain: '#27ae60', hp: 4, speed: 5,   dmg: 1,   reload: 400,  type: 'standard', flag: 'PL' },
    { id: 'heavy',   emoji: '🛡️', icon: BASE + 'assets/tanks/pancerny.jpg',  name: 'Pancerny', colorMain: '#8e44ad', hp: 7, speed: 3.5, dmg: 1.5, reload: 700,  type: 'standard', flag: 'PL' },
    { id: 'scout',   emoji: '🔍', icon: BASE + 'assets/tanks/zwiadowca.jpg', name: 'Zwiad',    colorMain: '#f1c40f', hp: 2, speed: 7.5, dmg: 0.8, reload: 250,  type: 'standard', flag: 'PL' },
    { id: 'sniper',  emoji: '🎯', icon: BASE + 'assets/tanks/snajper.jpg',   name: 'Snajper',  colorMain: '#3498db', hp: 3, speed: 4.5, dmg: 3,   reload: 1000, type: 'fast',     flag: 'PL' },
    { id: 'plasma',  emoji: '💻', icon: BASE + 'assets/tanks/tech.jpg',      name: 'Tech',     colorMain: '#00cec9', hp: 4, speed: 5,   dmg: 1.2, reload: 500,  type: 'plasma',   flag: 'PL', useExternalSprite: true },
    { id: 'pyro',    emoji: '🔥', icon: BASE + 'assets/tanks/ogniarz.jpg',   name: 'Ogniarz',  colorMain: '#e74c3c', hp: 5, speed: 4.8, dmg: 0.5, reload: 210,  type: 'spread',   flag: 'PL' },
    { id: 'shadow',  emoji: '🌑', icon: BASE + 'assets/tanks/shadow.jpg',    name: 'Shadow',   colorMain: '#2c3e50', hp: 3, speed: 6.5, dmg: 1.5, reload: 600,  type: 'standard', flag: 'PL', useExternalSprite: true },
    { id: 'king',    emoji: '👑', icon: BASE + 'assets/tanks/krol.jpg',      name: 'King',     colorMain: '#d35400', hp: 5, speed: 5.5, dmg: 2,   reload: 500,  type: 'standard', flag: 'PL', useExternalSprite: true },
];