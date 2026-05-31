/**
 * Typ dla danych czołga (brawler). Pure type, no implementation.
 */

export type BrawlerType = 'standard' | 'fast' | 'plasma' | 'spread';

export interface Brawler {
    id: string;
    emoji: string;
    icon: string;        // ścieżka do JPG, np. 'assets/tanks/twardy.jpg'
    name: string;
    colorMain: string;   // hex color, np. '#27ae60'
    hp: number;
    speed: number;
    dmg: number;
    reload: number;      // ms między strzałami
    type: BrawlerType;
}