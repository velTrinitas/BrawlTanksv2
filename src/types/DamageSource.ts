/**
 * DamageSource.ts — Z0.5 (COOP ETAP 0, v0.152.0): zrodlo obrazen w kolizjach.
 *
 * Kazde wywolanie Player.takeDamage / Enemy.takeDamage niesie zrodlo (parametr
 * OBOWIAZKOWY — kompilator wymusza komplet, nie konwencja). To pre-task zapisany
 * w .claude/rules/super-powers.md: miny/taran/questy potrzebuja wiedziec "kto
 * zadal obrazenia"; w koopie (ETAP 2) `playerIndex` rozstrzygnie kill/asyste.
 *
 * Zakres SWIADOMIE ograniczony do encji z gameplayowym HP (Player, Enemy).
 * Propsy mapowe (skrzynki, lod, reaktory, cargo) maja wlasne duck-typowane
 * takeDamage(d,x,y) w dziesiatkach plikow — to srodowisko bez atrybucji,
 * zmiana ich sygnatur = duza powierzchnia regresji przy zerowej wartosci.
 *
 * Z0.5 NIE dodaje zadnego konsumenta zrodla — zero zmian zachowania/balansu.
 * Konsumenci przyjda pozniej: koop (score per gracz), moce (Widmo/Babcia),
 * questy per-zrodlo. `lastDamageSource` na encji jest gotowym punktem odczytu.
 */

export type DamageSourceKind =
    // -> gracz
    | 'enemy_bullet'   // pocisk wroga (attackerRef: EnemyBullet)
    | 'enemy_ram'      // taran / kolizja z wrogiem (attackerRef: Enemy)
    | 'snowball'       // sniezka yeti (Arktyka)
    | 'boss_bomb'      // bomba bossa CTF
    | 'catapult'       // glaz katapulty/trebucheta (OBRON ZAMEK)
    | 'lava'           // lawa (SAVE THE QUEEN Q4) — DoT, gracz I wrogowie
    | 'geyser'         // erupcja gejzeru (SAVE THE QUEEN Q4) — gracz I wrogowie
    | 'dynamite'       // wybuch dynamitu w murze (SAVE THE QUEEN Q4) — gracz I wrogowie
    | 'tower'          // kula Zlowrogiej Wiezy (SAVE THE QUEEN Q4.5) -> gracz
    | 'ra_fire'        // ognista kula Zemsty Ra (DESERT ART v2 / E7), z telegrafem na ziemi
    | 'curse_fog'      // zielona mgla klatwy piramidy (DESERT ART v2 / E4): wyziew przy przebudzeniu i chmurka po smierci mumii
    // -> wrogowie
    | 'player_bullet'  // pocisk gracza (takze super shot)
    | 'power'          // super moc (mega bomba, miny, rakiety, Dziura, Laser, wieza...)
    | 'shockwave'      // shockwave-on-hit Pancernego (perk brawlera, nie moc)
    | 'chicken_peck'   // TROPICS v2 / T6: dzioby Szalonych Kurczakow (zdarzenie farmy) -> wrogowie
    | 'bull_charge'    // TROPICS v2 / T6.2: szarza byka -> wrogowie I gracz (z telegrafem)
    | 'reaper'         // TROPICS v2 / T6.3: Zniwiarka-Potwor -> wrogowie I gracz (z telegrafem)
    | 'press'          // ZLOMOWISKO J3: Wielka Prasa -> wrogowie (zmiazdzeni), boss (15% + stun) I gracz (45% + odrzut)
    | 'crane_drop'     // ZLOMOWISKO J4: wrak zrzucony dzwigiem (AoE r=100) -> wrogowie I gracz
    | 'crusher'        // ZLOMOWISKO J5: Kruszarka na koncu tasmociagu -> wrogowie (pozarci) I gracz (25% + wypluty)
    | 'hubcap';        // ZLOMOWISKO J6a: Lawina kolpakow -> wrogowie I gracz (40 dmg, jedno odbicie)

export interface DamageSource {
    readonly kind: DamageSourceKind;
    /** Ktora moc (dla kind 'power') — do nawleczenia gdy questy tego zazadaja. */
    readonly powerId?: string;
    /** Indeks gracza-sprawcy (koop ETAP 2); dzis zawsze 0. */
    readonly playerIndex?: number;
    /** Referencja sprawcy (Enemy przy taranie, EnemyBullet przy pocisku). */
    readonly attackerRef?: object;
}

// Zamrozone stale wspoldzielone dla zrodel bez referencji — zero churnu GC
// przy wielu trafieniach na sekunde. Zrodla Z referencja buduje sie literalem.
export const SRC_SNOWBALL: DamageSource = Object.freeze({ kind: 'snowball' as const });
export const SRC_BOSS_BOMB: DamageSource = Object.freeze({ kind: 'boss_bomb' as const });
export const SRC_CATAPULT: DamageSource = Object.freeze({ kind: 'catapult' as const }); // OBRON ZAMEK F4
export const SRC_LAVA: DamageSource = Object.freeze({ kind: 'lava' as const }); // SAVE THE QUEEN Q4
export const SRC_GEYSER: DamageSource = Object.freeze({ kind: 'geyser' as const }); // SAVE THE QUEEN Q4
export const SRC_DYNAMITE: DamageSource = Object.freeze({ kind: 'dynamite' as const }); // SAVE THE QUEEN Q4
export const SRC_TOWER: DamageSource = Object.freeze({ kind: 'tower' as const }); // SAVE THE QUEEN Q4.5
export const SRC_CURSE_FOG: DamageSource = Object.freeze({ kind: 'curse_fog' as const }); // DESERT ART v2 / E4
export const SRC_RA_FIRE: DamageSource = Object.freeze({ kind: 'ra_fire' as const }); // DESERT ART v2 / E7
export const SRC_PLAYER_BULLET: DamageSource = Object.freeze({ kind: 'player_bullet' as const, playerIndex: 0 });
export const SRC_POWER: DamageSource = Object.freeze({ kind: 'power' as const, playerIndex: 0 });
export const SRC_SHOCKWAVE: DamageSource = Object.freeze({ kind: 'shockwave' as const, playerIndex: 0 });
export const SRC_REAPER: DamageSource = Object.freeze({ kind: 'reaper' as const }); // TROPICS v2 / T6.3
export const SRC_PRESS: DamageSource = Object.freeze({ kind: 'press' as const }); // ZLOMOWISKO J3
export const SRC_CRANE_DROP: DamageSource = Object.freeze({ kind: 'crane_drop' as const }); // ZLOMOWISKO J4
export const SRC_CRUSHER: DamageSource = Object.freeze({ kind: 'crusher' as const }); // ZLOMOWISKO J5
export const SRC_HUBCAP: DamageSource = Object.freeze({ kind: 'hubcap' as const }); // ZLOMOWISKO J6a
export const SRC_BULL_CHARGE: DamageSource = Object.freeze({ kind: 'bull_charge' as const }); // TROPICS v2 / T6.2
export const SRC_CHICKEN_PECK: DamageSource = Object.freeze({ kind: 'chicken_peck' as const, playerIndex: 0 }); // TROPICS v2 / T6
export const SRC_POWER_MEGA_BOMB: DamageSource = Object.freeze({ kind: 'power' as const, powerId: 'megaBomb', playerIndex: 0 });

// COOP S5b: zrodla z indeksem gracza (koop). Cache per indeks => zero alokacji w petli kolizji.
// Stale SRC_* wyzej = aliasy dla gracza 0 (solo / gracz lokalny hosta).
const _srcCache = new Map<string, DamageSource>();
function cachedSrc(key: string, make: () => DamageSource): DamageSource {
    let s = _srcCache.get(key);
    if (!s) { s = Object.freeze(make()); _srcCache.set(key, s); }
    return s;
}
export function srcPlayerBullet(i: number): DamageSource { return i === 0 ? SRC_PLAYER_BULLET : cachedSrc('pb' + i, () => ({ kind: 'player_bullet', playerIndex: i })); }
export function srcPower(i: number): DamageSource { return i === 0 ? SRC_POWER : cachedSrc('pw' + i, () => ({ kind: 'power', playerIndex: i })); }
export function srcShockwave(i: number): DamageSource { return i === 0 ? SRC_SHOCKWAVE : cachedSrc('sw' + i, () => ({ kind: 'shockwave', playerIndex: i })); }
export function srcMegaBomb(i: number): DamageSource { return i === 0 ? SRC_POWER_MEGA_BOMB : cachedSrc('mb' + i, () => ({ kind: 'power', powerId: 'megaBomb', playerIndex: i })); }
