/**
 * seasonTank.ts — v0.250.0 SEZON v2: CZOLG SEZONU (nagroda za ostatni prog Szlaku Sezonu).
 *
 * Czolg sezonu to ZWYKLY wpis rosteru (BRAWLERS) oznaczony tutaj jako sezonowy — blokada jest
 * WYLACZNIE w UI wyboru (galeria, garaz, TRYB GRY). Roster i indeksy czolgow sa identyczne u wszystkich,
 * wiec koop (brawlerIdx u8) sie nie rozjezdza. Odblokowanie = klucz `tank:<id>` w `ownedCosmetics`
 * (UNION-sync z chmura, bez SQL).
 *
 * Produkcja: SEASON_TANKS pusty do fazy CZOLG SEZONU (wlasne id + art 2.5D).
 * Dev-symulacja: `?seasontank=enigma` = Enigma udaje czolg biezacego sezonu (tylko UI i odblokowanie).
 */
import { getCurrentSeason } from './season';

export interface SeasonTankDef {
    readonly brawlerId: string;
    readonly seasonId: string;
}

/** Produkcyjna lista czolgow sezonowych (pusta do fazy CZOLG SEZONU). */
const SEASON_TANKS: readonly SeasonTankDef[] = [];

function devSeasonTank(): SeasonTankDef | null {
    try {
        const id = new URLSearchParams(location.search).get('seasontank');
        return id ? { brawlerId: id, seasonId: getCurrentSeason().id } : null;
    } catch { return null; }
}

export function seasonTanks(): readonly SeasonTankDef[] {
    const dev = devSeasonTank();
    return dev ? [dev, ...SEASON_TANKS.filter(t => t.brawlerId !== dev.brawlerId)] : SEASON_TANKS;
}

/** Def czolgu sezonu po id czolgu (null = zwykly czolg). */
export function seasonTankOf(brawlerId: string): SeasonTankDef | null {
    return seasonTanks().find(t => t.brawlerId === brawlerId) ?? null;
}

/** Czolg sezonu przypisany do danego sezonu (nagroda progu `seasonTank`). */
export function seasonTankForSeason(seasonId: string): SeasonTankDef | null {
    return seasonTanks().find(t => t.seasonId === seasonId) ?? null;
}

/** Klucz odblokowania w ownedCosmetics. */
export function tankUnlockKey(brawlerId: string): string {
    return `tank:${brawlerId}`;
}
