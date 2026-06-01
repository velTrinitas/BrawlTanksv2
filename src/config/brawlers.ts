import type { Brawler } from '../types/Brawler';

/**
 * 8 czołgów grywalnych — kopia 1:1 z v4.48 final.
 * Asset path używa import.meta.env.BASE_URL — Vite podstawia automatycznie:
 *   - dev: '/'
 *   - prod (GH Pages): '/BrawlTanksv2/'
 */
const BASE = import.meta.env.BASE_URL;

export const BRAWLERS: Brawler[] = [
    { id: 'twardy',  emoji: '🪖', icon: BASE + 'assets/tanks/twardy.jpg',    name: 'Twardy',   colorMain: '#27ae60', hp: 4, speed: 5,   dmg: 1,   reload: 400,  type: 'standard' },
    { id: 'heavy',   emoji: '🛡️', icon: BASE + 'assets/tanks/pancerny.jpg',  name: 'Pancerny', colorMain: '#8e44ad', hp: 7, speed: 3.5, dmg: 1.5, reload: 700,  type: 'standard' },
    { id: 'scout',   emoji: '🔍', icon: BASE + 'assets/tanks/zwiadowca.jpg', name: 'Zwiad',    colorMain: '#f1c40f', hp: 2, speed: 7.5, dmg: 0.8, reload: 250,  type: 'standard' },
    { id: 'sniper',  emoji: '🎯', icon: BASE + 'assets/tanks/snajper.jpg',   name: 'Snajper',  colorMain: '#3498db', hp: 3, speed: 4.5, dmg: 3,   reload: 1000, type: 'fast' },
    { id: 'plasma',  emoji: '💻', icon: BASE + 'assets/tanks/tech.jpg',      name: 'Tech',     colorMain: '#00cec9', hp: 4, speed: 5,   dmg: 1.2, reload: 500,  type: 'plasma' },
    { id: 'pyro',    emoji: '🔥', icon: BASE + 'assets/tanks/ogniarz.jpg',   name: 'Ogniarz',  colorMain: '#e74c3c', hp: 5, speed: 4.8, dmg: 0.5, reload: 210,  type: 'spread' },
    { id: 'shadow',  emoji: '🌑', icon: BASE + 'assets/tanks/shadow.jpg',    name: 'Shadow',   colorMain: '#2c3e50', hp: 3, speed: 6.5, dmg: 1.5, reload: 600,  type: 'standard' },
    { id: 'king',    emoji: '👑', icon: BASE + 'assets/tanks/krol.jpg',      name: 'King',     colorMain: '#d35400', hp: 5, speed: 5.5, dmg: 2,   reload: 500,  type: 'standard' },
];