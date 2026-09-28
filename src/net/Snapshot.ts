/**
 * Snapshot.ts — COOP LAN-3a: migawka swiata hosta (binarnie, kanal 'fast', ~20 Hz).
 *
 * Tylko to, co gosc musi NARYSOWAC: gracze, wrogowie, pociski obu stron. Wszystkie decyzje
 * (trafienia, zgony, spawny) zapadaja u hosta — gosc interpoluje miedzy migawkami (GuestWorld).
 * Pikselowa precyzja pozycji (int16, swiat 3000 px), katy w 256 krokach (u8, ~1.4°).
 *
 * Uklad (little endian):
 *   u8 MSG_SNAP | u32 tick | u32 score | u8 nPl | u16 nEn | u16 nPb | u16 nEb
 *   gracz  (15 B): u8 idx | i16 x | i16 y | u8 moveA | u8 turA | u16 hp | u16 maxHp | u8 flags | u8 brawlerIdx
 *   wrog   (14 B): u16 netId | u8 kind | u8 flags | i16 x | i16 y | u8 ang | u16 hp | u16 maxHp | u8 _
 *   pocisk gracza (9 B): u16 netId | i16 x | i16 y | u8 ang | u8 flags | u8 brawlerIdx
 *   pocisk wroga (12 B): u16 netId | i16 x | i16 y | u8 ang | u8 type | u8 r | u8 g | u8 b | u8 _
 * Bij NET_PROTOCOL_VERSION przy kazdej zmianie ukladu.
 */
import type { EnemyBulletType } from '../rendering/EnemyBulletSpriteBaker';

export const MSG_SNAP = 1;

export enum EnemyKind { Normal = 0, Boss = 1, Mega = 2, Pursuit = 3 }

export interface SnapPlayer { idx: number; x: number; y: number; moveA: number; turA: number; hp: number; maxHp: number; moving: boolean; superShot: boolean; turbo: boolean; brawlerIdx: number }
export interface SnapEnemy { id: number; kind: EnemyKind; frozen: boolean; x: number; y: number; a: number; hp: number; maxHp: number }
export interface SnapPBullet { id: number; x: number; y: number; a: number; superShot: boolean; tower: boolean; brawlerIdx: number }
export interface SnapEBullet { id: number; x: number; y: number; a: number; type: EnemyBulletType | null; color: number }
export interface Snapshot { tick: number; score: number; players: SnapPlayer[]; enemies: SnapEnemy[]; pbullets: SnapPBullet[]; ebullets: SnapEBullet[] }

const TYPES: (EnemyBulletType | null)[] = [null, 'enemy_basic', 'boss_shell', 'mega_shell'];
const TAU = Math.PI * 2;
const encA = (a: number): number => Math.round((((a % TAU) + TAU) % TAU) / TAU * 256) & 255;
const decA = (b: number): number => (b / 256) * TAU;
const clampI16 = (v: number): number => Math.max(-32768, Math.min(32767, Math.round(v)));
const clampU16 = (v: number): number => Math.max(0, Math.min(65535, Math.round(v)));

export function encodeSnapshot(s: Snapshot): ArrayBuffer {
    const size = 1 + 4 + 4 + 1 + 2 + 2 + 2
        + s.players.length * 15 + s.enemies.length * 14 + s.pbullets.length * 9 + s.ebullets.length * 12;
    const buf = new ArrayBuffer(size);
    const v = new DataView(buf);
    let o = 0;
    v.setUint8(o, MSG_SNAP); o += 1;
    v.setUint32(o, s.tick >>> 0, true); o += 4;
    v.setUint32(o, Math.max(0, Math.round(s.score)) >>> 0, true); o += 4;
    v.setUint8(o, s.players.length); o += 1;
    v.setUint16(o, s.enemies.length, true); o += 2;
    v.setUint16(o, s.pbullets.length, true); o += 2;
    v.setUint16(o, s.ebullets.length, true); o += 2;
    for (const p of s.players) {
        v.setUint8(o, p.idx); v.setInt16(o + 1, clampI16(p.x), true); v.setInt16(o + 3, clampI16(p.y), true);
        v.setUint8(o + 5, encA(p.moveA)); v.setUint8(o + 6, encA(p.turA));
        v.setUint16(o + 7, clampU16(p.hp), true); v.setUint16(o + 9, clampU16(p.maxHp), true);
        v.setUint8(o + 11, (p.moving ? 1 : 0) | (p.superShot ? 2 : 0) | (p.turbo ? 4 : 0));
        v.setUint8(o + 12, p.brawlerIdx & 255);
        o += 15;
    }
    for (const e of s.enemies) {
        v.setUint16(o, e.id & 0xffff, true); v.setUint8(o + 2, e.kind); v.setUint8(o + 3, e.frozen ? 1 : 0);
        v.setInt16(o + 4, clampI16(e.x), true); v.setInt16(o + 6, clampI16(e.y), true);
        v.setUint8(o + 8, encA(e.a)); v.setUint16(o + 9, clampU16(e.hp), true); v.setUint16(o + 11, clampU16(e.maxHp), true);
        o += 14;
    }
    for (const b of s.pbullets) {
        v.setUint16(o, b.id & 0xffff, true); v.setInt16(o + 2, clampI16(b.x), true); v.setInt16(o + 4, clampI16(b.y), true);
        v.setUint8(o + 6, encA(b.a)); v.setUint8(o + 7, (b.superShot ? 1 : 0) | (b.tower ? 2 : 0)); v.setUint8(o + 8, b.brawlerIdx & 255);
        o += 9;
    }
    for (const b of s.ebullets) {
        v.setUint16(o, b.id & 0xffff, true); v.setInt16(o + 2, clampI16(b.x), true); v.setInt16(o + 4, clampI16(b.y), true);
        v.setUint8(o + 6, encA(b.a)); v.setUint8(o + 7, Math.max(0, TYPES.indexOf(b.type)));
        v.setUint8(o + 8, (b.color >> 16) & 255); v.setUint8(o + 9, (b.color >> 8) & 255); v.setUint8(o + 10, b.color & 255);
        o += 12;
    }
    return buf;
}

/** null = nie migawka / uszkodzona (dane z sieci sa niezaufane). */
export function decodeSnapshot(buf: ArrayBuffer): Snapshot | null {
    try {
        const v = new DataView(buf);
        if (v.byteLength < 16 || v.getUint8(0) !== MSG_SNAP) return null;
        let o = 1;
        const tick = v.getUint32(o, true); o += 4;
        const score = v.getUint32(o, true); o += 4;
        const nPl = v.getUint8(o); o += 1;
        const nEn = v.getUint16(o, true); o += 2;
        const nPb = v.getUint16(o, true); o += 2;
        const nEb = v.getUint16(o, true); o += 2;
        if (v.byteLength !== o + nPl * 15 + nEn * 14 + nPb * 9 + nEb * 12) return null;
        const players: SnapPlayer[] = [];
        for (let i = 0; i < nPl; i++, o += 15) {
            const f = v.getUint8(o + 11);
            players.push({ idx: v.getUint8(o), x: v.getInt16(o + 1, true), y: v.getInt16(o + 3, true),
                moveA: decA(v.getUint8(o + 5)), turA: decA(v.getUint8(o + 6)),
                hp: v.getUint16(o + 7, true), maxHp: v.getUint16(o + 9, true),
                moving: (f & 1) !== 0, superShot: (f & 2) !== 0, turbo: (f & 4) !== 0, brawlerIdx: v.getUint8(o + 12) });
        }
        const enemies: SnapEnemy[] = [];
        for (let i = 0; i < nEn; i++, o += 14) {
            enemies.push({ id: v.getUint16(o, true), kind: v.getUint8(o + 2) as EnemyKind, frozen: (v.getUint8(o + 3) & 1) !== 0,
                x: v.getInt16(o + 4, true), y: v.getInt16(o + 6, true), a: decA(v.getUint8(o + 8)),
                hp: v.getUint16(o + 9, true), maxHp: v.getUint16(o + 11, true) });
        }
        const pbullets: SnapPBullet[] = [];
        for (let i = 0; i < nPb; i++, o += 9) {
            const f = v.getUint8(o + 7);
            pbullets.push({ id: v.getUint16(o, true), x: v.getInt16(o + 2, true), y: v.getInt16(o + 4, true),
                a: decA(v.getUint8(o + 6)), superShot: (f & 1) !== 0, tower: (f & 2) !== 0, brawlerIdx: v.getUint8(o + 8) });
        }
        const ebullets: SnapEBullet[] = [];
        for (let i = 0; i < nEb; i++, o += 12) {
            ebullets.push({ id: v.getUint16(o, true), x: v.getInt16(o + 2, true), y: v.getInt16(o + 4, true),
                a: decA(v.getUint8(o + 6)), type: TYPES[v.getUint8(o + 7)] ?? null,
                color: (v.getUint8(o + 8) << 16) | (v.getUint8(o + 9) << 8) | v.getUint8(o + 10) });
        }
        return { tick, score, players, enemies, pbullets, ebullets };
    } catch (err) {
        console.warn('[Snapshot] decode failed', (err as Error).stack);
        return null;
    }
}
