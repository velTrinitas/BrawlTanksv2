import * as PIXI from 'pixi.js';
import { JUNKYARD_LAYOUT } from '../JunkyardMap';
import { ambientRng } from '../../systems/Rng';
import { simNowMs } from '../../systems/SimClock';
import { isPointInView } from '../cullGate';
import { bakeCanvas, css } from './junkyardBake';
import type { AudioSys } from '../../audio/AudioSys';

/**
 * JunkyardAmbient — life of the yard (ZLOMOWISKO J6b, class A ambient, ZERO sim impact, `ambientRng`):
 *  - 4 PIGEONS circling over the NE wreck stacks (2 baked flap frames, elliptical orbit, ground shadows) — crow pattern;
 *  - SRUBEK the yard dog: 6 baked poses (stand, 4-frame trot, bark), wanders the lot N of the office, FLEES from any tank
 *    within fleeR (nobody runs over the dog — Czytelnosc), barks when the player gets close (cooldown, bark pose);
 *  - a CAT on a container roof: patrols the roof (4-frame walk cycle, head bob, tail sway), sits (tail flick),
 *    curls up to sleep (breathing), stretches on waking. State machine on ambientRng, side-view 3/4 sprite like the dog.
 * Everything is sprite swaps + positions; outside the camera: no work.
 */
const DOG_POSES = ['stand', 'walk0', 'walk1', 'walk2', 'walk3', 'bark'] as const;
type DogPose = typeof DOG_POSES[number];
const CAT_POSES = ['walk0', 'walk1', 'walk2', 'walk3', 'sit0', 'sit1', 'sleep0', 'sleep1', 'stretch'] as const;
type CatPose = typeof CAT_POSES[number];
const DOG_AREA = { x: 560, y: 2190, w: 400, h: 140 }; // N of the office, clear of pads / stacks (power1 ends at 520)
const DOG_FLEE_R = 110;

export class JunkyardAmbient {
    private pigeons: PIXI.Sprite[] = [];
    private pigeonShadows: PIXI.Graphics;
    private pigeonFrames: [PIXI.Texture, PIXI.Texture];
    private pigeonCx: number; private pigeonCy: number;
    private dog: PIXI.Sprite;
    private dogFrames: Record<DogPose, PIXI.Texture>;
    private barkPose = 0;
    private dogX: number; private dogY: number;
    private dogTx: number; private dogTy: number;
    private dogWait = 0;
    private dogStep = 0;
    private lastBarkAt = 0;
    private cat: PIXI.Sprite;
    private catFrames: Record<CatPose, PIXI.Texture>;
    private catX: number; private catY: number;
    private catTx: number;
    private catRoof: { x0: number; x1: number; y0: number; y1: number };
    private catState: 'walk' | 'sit' | 'sleep' | 'stretch' = 'sit';
    private catTimer = 90;
    private catStep = 0;
    private catDir = 1;

    constructor(private world: PIXI.Container, private audio: AudioSys) {
        const L = JUNKYARD_LAYOUT;
        // ── pigeons over the NE inner stack ──
        const st = L.stacks[1];
        this.pigeonCx = st.x + 100; this.pigeonCy = st.y + 70;
        const tmp = new PIXI.Container(); world.addChild(tmp);
        this.pigeonFrames = [0, 1].map(f => { const s = bakeCanvas(tmp, `amb_pigeon_${f}`, 0, 0, { l: 16, t: 12, r: 16, b: 12 }, c => JunkyardAmbient.drawPigeon(c, f)); const tex = s.texture; tmp.removeChild(s); return tex; }) as [PIXI.Texture, PIXI.Texture];
        this.pigeonShadows = new PIXI.Graphics(); this.pigeonShadows.zIndex = 6; world.addChild(this.pigeonShadows);
        for (let i = 0; i < 4; i++) { const s = new PIXI.Sprite(this.pigeonFrames[0]); s.anchor.set(0.5); s.zIndex = 9600; world.addChild(s); this.pigeons.push(s); }
        // ── dog ──
        this.dogFrames = {} as Record<DogPose, PIXI.Texture>;
        for (const pose of DOG_POSES) { const s = bakeCanvas(tmp, `amb_dog_${pose}`, 0, 0, { l: 28, t: 30, r: 30, b: 14 }, c => JunkyardAmbient.drawDog(c, pose)); this.dogFrames[pose] = s.texture; tmp.removeChild(s); }
        this.dog = new PIXI.Sprite(this.dogFrames.stand); this.dog.anchor.set(0.5, 0.75); this.dog.scale.set(1.3); world.addChild(this.dog);
        this.dogX = DOG_AREA.x + DOG_AREA.w / 2; this.dogY = DOG_AREA.y + DOG_AREA.h / 2; this.dogTx = this.dogX; this.dogTy = this.dogY;
        // ── cat on the first container's roof ──
        const ct = L.containers[0];
        this.catRoof = { x0: ct.x + 24, x1: ct.x + ct.w - 24, y0: ct.y + 22, y1: ct.y + 44 };
        this.catX = ct.x + ct.w * 0.62; this.catY = ct.y + 32; this.catTx = this.catX;
        this.catFrames = {} as Record<CatPose, PIXI.Texture>;
        for (const pose of CAT_POSES) { const s = bakeCanvas(tmp, `amb_cat_${pose}`, 0, 0, { l: 26, t: 24, r: 24, b: 12 }, c => JunkyardAmbient.drawCat(c, pose)); this.catFrames[pose] = s.texture; tmp.removeChild(s); }
        this.cat = new PIXI.Sprite(this.catFrames.sit0); this.cat.anchor.set(0.5, 0.7); this.cat.scale.set(1.25); this.cat.position.set(this.catX, this.catY); this.cat.zIndex = ct.y + ct.h + 60; world.addChild(this.cat);
        world.removeChild(tmp); tmp.destroy();
    }

    /** VIEW loop (per frame). threats = tank positions (players + enemies) for the dog's flee. */
    public update(camX: number, camY: number, viewW: number, viewH: number, threats: ReadonlyArray<{ x: number; y: number }>, playerPos: { x: number; y: number } | null): void {
        const now = simNowMs();
        const tsec = now / 1000;
        // pigeons
        const pv = isPointInView(this.pigeonCx, this.pigeonCy, camX, camY, viewW, viewH, 260);
        this.pigeonShadows.renderable = pv;
        for (let i = 0; i < this.pigeons.length; i++) {
            const s = this.pigeons[i]; s.renderable = pv;
            if (!pv) continue;
            const a = tsec * (0.5 + i * 0.06) + i * 1.6;
            const rx = 110 + i * 22, ry = rx * 0.6;
            s.x = this.pigeonCx + Math.cos(a) * rx; s.y = this.pigeonCy - 90 + Math.sin(a) * ry;
            s.rotation = a + Math.PI / 2;
            s.texture = this.pigeonFrames[Math.floor(tsec * 7 + i) % 2];
            s.scale.set(0.85 + i * 0.07);
        }
        if (pv) {
            this.pigeonShadows.clear(); this.pigeonShadows.beginFill(0x000000, 0.12);
            for (const s of this.pigeons) this.pigeonShadows.drawEllipse(s.x + 20, s.y + 110, 7, 2.5);
            this.pigeonShadows.endFill();
        }
        // dog
        const dv = isPointInView(this.dogX, this.dogY, camX, camY, viewW, viewH, 120);
        this.dog.renderable = dv;
        let fleeing = false;
        for (const th of threats) {
            const dx = this.dogX - th.x, dy = this.dogY - th.y, d = Math.hypot(dx, dy);
            if (d < DOG_FLEE_R && d > 0.1) { this.dogTx = this.clampX(this.dogX + dx / d * 140); this.dogTy = this.clampY(this.dogY + dy / d * 140); fleeing = true; break; }
        }
        const ddx = this.dogTx - this.dogX, ddy = this.dogTy - this.dogY, dd = Math.hypot(ddx, ddy);
        if (dd > 2) {
            const sp = fleeing ? 2.6 : 0.75;
            this.dogX += ddx / dd * Math.min(sp, dd); this.dogY += ddy / dd * Math.min(sp, dd);
            this.dogStep += fleeing ? 0.45 : 0.18;
            this.dog.texture = this.dogFrames[('walk' + (Math.floor(this.dogStep) % 4)) as DogPose];
            this.dog.scale.x = ddx < 0 ? -1.3 : 1.3;
            this.dog.y = this.dogY - Math.abs(Math.sin(this.dogStep * Math.PI)) * (fleeing ? 3 : 1.2);
        } else {
            this.dog.texture = this.barkPose > 0 ? this.dogFrames.bark : this.dogFrames.stand;
            if (this.barkPose > 0) this.barkPose--;
            if (this.dogWait <= 0) { this.dogWait = 60 + ambientRng.int(180); this.dogTx = DOG_AREA.x + 20 + ambientRng.next() * (DOG_AREA.w - 40); this.dogTy = DOG_AREA.y + 20 + ambientRng.next() * (DOG_AREA.h - 40); }
            else this.dogWait--;
        }
        this.dog.x = this.dogX; if (dd <= 2) this.dog.y = this.dogY; this.dog.zIndex = this.dogY + 8;
        if (playerPos && dv && now - this.lastBarkAt > 6000 && Math.hypot(playerPos.x - this.dogX, playerPos.y - this.dogY) < 170) {
            this.lastBarkAt = now; this.barkPose = 40; this.audio.playDogBark();
            this.dog.scale.x = playerPos.x < this.dogX ? -1.3 : 1.3; // face the tank while barking
        }
        // cat: roof patrol state machine (walk -> sit -> walk ... -> sleep -> stretch -> walk)
        const cv = isPointInView(this.catX, this.catY, camX, camY, viewW, viewH, 80);
        this.cat.renderable = cv;
        if (cv) this.updateCat(tsec);
    }

    private updateCat(tsec: number): void {
        const R = this.catRoof;
        const f = this.catFrames;
        let sx = 1.25, sy = 1.25, bob = 0;
        switch (this.catState) {
            case 'walk': {
                const dx = this.catTx - this.catX;
                if (Math.abs(dx) < 1.5) { this.catState = ambientRng.next() < 0.3 ? 'sleep' : 'sit'; this.catTimer = this.catState === 'sleep' ? 480 + ambientRng.int(600) : 120 + ambientRng.int(240); break; }
                this.catDir = dx < 0 ? -1 : 1;
                this.catX += this.catDir * 0.9;
                this.catStep += 0.14;
                const k = Math.floor(this.catStep) % 4;
                this.cat.texture = f[('walk' + k) as CatPose];
                bob = -Math.abs(Math.sin(this.catStep * Math.PI)) * 1.2; // body rises on each stride
                break;
            }
            case 'sit':
                this.cat.texture = f[(Math.floor(tsec * 1.6) % 2) ? 'sit1' : 'sit0'];
                if (--this.catTimer <= 0) { this.catState = 'walk'; this.catTx = R.x0 + ambientRng.next() * (R.x1 - R.x0); this.catY = R.y0 + ambientRng.next() * (R.y1 - R.y0); }
                break;
            case 'sleep': {
                this.cat.texture = f[(Math.floor(tsec * 0.9) % 2) ? 'sleep1' : 'sleep0'];
                const br = Math.sin(tsec * 2.2) * 0.04; sx = 1.25 * (1 + br); sy = 1.25 * (1 - br); // breathing
                if (--this.catTimer <= 0) { this.catState = 'stretch'; this.catTimer = 70; }
                break;
            }
            case 'stretch': {
                this.cat.texture = f.stretch;
                const p = 1 - this.catTimer / 70, st = Math.sin(p * Math.PI);
                sx = 1.25 * (1 + st * 0.16); sy = 1.25 * (1 - st * 0.06);
                if (--this.catTimer <= 0) { this.catState = 'walk'; this.catTx = R.x0 + ambientRng.next() * (R.x1 - R.x0); }
                break;
            }
        }
        this.cat.scale.set(sx * this.catDir, sy);
        this.cat.position.set(this.catX, this.catY + bob);
    }

    private clampX(x: number): number { return Math.max(DOG_AREA.x + 10, Math.min(DOG_AREA.x + DOG_AREA.w - 10, x)); }
    private clampY(y: number): number { return Math.max(DOG_AREA.y + 10, Math.min(DOG_AREA.y + DOG_AREA.h - 10, y)); }

    public destroy(): void {
        for (const s of this.pigeons) s.destroy();
        this.pigeonShadows.destroy(); this.dog.destroy(); this.cat.destroy();
        void this.world;
    }

    // ── art (baked once; local (0,0) = sprite centre) ──
    private static drawPigeon(c: CanvasRenderingContext2D, frame: number): void {
        const up = frame === 0 ? -7 : 5;
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(1, 3, 4.5, 3, 0, 0, Math.PI * 2); c.fill();
        const wg = c.createLinearGradient(0, up, 0, 4); wg.addColorStop(0, '#9aa0a6'); wg.addColorStop(1, '#5e656d');
        c.fillStyle = wg;
        c.beginPath(); c.moveTo(-14, up); c.quadraticCurveTo(-5, -2, 0, 0); c.quadraticCurveTo(5, -2, 14, up); c.quadraticCurveTo(6, 2, 0, 4); c.quadraticCurveTo(-6, 2, -14, up); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.stroke();
        const bg = c.createRadialGradient(-1, -1, 1, 0, 1, 5); bg.addColorStop(0, '#dfe4e8'); bg.addColorStop(1, '#6e757e');
        c.fillStyle = bg; c.beginPath(); c.ellipse(0, 1, 4.5, 3, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#4a7c59'; c.beginPath(); c.arc(0, -2, 1.6, 0, Math.PI * 2); c.fill(); // iridescent neck
        c.fillStyle = '#f2c230'; c.beginPath(); c.moveTo(0, -4); c.lineTo(-1, -6); c.lineTo(1, -6); c.closePath(); c.fill();
    }

    private static drawDog(c: CanvasRenderingContext2D, pose: DogPose): void {
        // scruffy ginger yard mutt, 3/4 side view facing +x (mirrored by scale.x); local (0,0) = body centre
        const fur = '#c4873f', furL = '#e8b874', furD = '#7a4a1c', ink = 'rgba(0,0,0,0.5)', white = '#f6ead6';
        const outline = () => { c.strokeStyle = ink; c.lineWidth = 1.3; c.stroke(); };
        const k = pose.startsWith('walk') ? Number(pose.slice(4)) : -1;
        const ph = k >= 0 ? k / 4 * Math.PI * 2 : 0;
        const sw = k >= 0 ? Math.sin(ph) * 4.5 : 0, lift = k >= 0 ? Math.max(0, Math.cos(ph)) * 2 : 0;
        const bark = pose === 'bark';
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(2, 12, 20, 6, 0, 0, Math.PI * 2); c.fill();
        // far legs (darker), body, near legs with white socks
        c.fillStyle = furD;
        c.fillRect(-13 - sw, 4, 4.5, 10 - lift); c.fillRect(9 + sw, 4, 4.5, 10 - lift);
        const bg = c.createLinearGradient(0, -11, 0, 10); bg.addColorStop(0, furL); bg.addColorStop(0.5, fur); bg.addColorStop(1, furD);
        c.fillStyle = bg; c.beginPath(); c.moveTo(-18, -2); c.quadraticCurveTo(-16, -11, -4, -10); c.lineTo(10, -9); c.quadraticCurveTo(18, -8, 17, 2); c.quadraticCurveTo(14, 9, 0, 9); c.quadraticCurveTo(-16, 9, -18, -2); c.closePath(); c.fill(); outline();
        c.fillStyle = white; c.beginPath(); c.ellipse(2, 5, 11, 3.5, 0, 0, Math.PI * 2); c.fill(); // belly
        // scruffy fur tufts along the back
        c.fillStyle = fur; for (let x = -14; x <= 6; x += 5) { c.beginPath(); c.moveTo(x, -8); c.lineTo(x + 2, -13); c.lineTo(x + 5, -8); c.closePath(); c.fill(); }
        c.fillStyle = 'rgba(90,50,15,0.35)'; c.beginPath(); c.ellipse(-8, -3, 6, 4, 0.3, 0, Math.PI * 2); c.fill(); // darker patch
        c.fillStyle = fur;
        for (const lx of [-10 + sw, 12 - sw]) { c.fillRect(lx, 5, 5, 11 - lift); c.strokeStyle = ink; c.lineWidth = 1; c.strokeRect(lx, 5, 5, 11 - lift); c.fillStyle = white; c.beginPath(); c.ellipse(lx + 2.5, 16 - lift, 3.2, 1.8, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = fur; }
        // tail: up and wagging (frame-dependent), bushy tip
        const tx = k >= 0 ? Math.sin(ph) * 4 : (bark ? 3 : 0);
        c.strokeStyle = ink; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-17, -4); c.quadraticCurveTo(-24 + tx, -12, -21 + tx, -20); c.stroke();
        c.strokeStyle = fur; c.lineWidth = 4; c.stroke();
        c.fillStyle = furL; c.beginPath(); c.arc(-21 + tx, -20, 3.2, 0, Math.PI * 2); c.fill();
        // head: ears behind, skull, snout, nose, eyes, tongue / open mouth when barking
        const hx = 14, hy = -8 + (k >= 0 ? Math.sin(ph * 2) : 0) * 1.2 + (bark ? -2 : 0);
        c.fillStyle = furD; c.beginPath(); c.ellipse(hx - 4, hy - 7, 3.5, 6, -0.5 + (bark ? -0.4 : 0), 0, Math.PI * 2); c.fill(); outline(); // floppy ear
        const hg = c.createRadialGradient(hx + 1, hy - 3, 1, hx + 2, hy - 1, 10); hg.addColorStop(0, furL); hg.addColorStop(0.7, fur); hg.addColorStop(1, furD);
        c.fillStyle = hg; c.beginPath(); c.ellipse(hx + 1, hy, 9, 8, 0, 0, Math.PI * 2); c.fill(); outline();
        c.fillStyle = furD; c.beginPath(); c.ellipse(hx + 5, hy - 8, 3.5, 5.5, 0.4, 0, Math.PI * 2); c.fill(); outline(); // near ear (perked)
        c.fillStyle = white; c.beginPath(); c.ellipse(hx + 8, hy + 2, 6, 4.2, 0, 0, Math.PI * 2); c.fill(); outline(); // snout
        c.fillStyle = '#1a1a1a'; c.beginPath(); c.ellipse(hx + 13, hy + 0.5, 2.4, 1.8, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(hx + 12.3, hy - 0.2, 0.7, 0, Math.PI * 2); c.fill(); // nose
        if (bark) {
            c.fillStyle = '#5a1a1a'; c.beginPath(); c.moveTo(hx + 4, hy + 4); c.lineTo(hx + 13, hy + 4); c.lineTo(hx + 9, hy + 10); c.closePath(); c.fill();
            c.fillStyle = '#ff7f95'; c.beginPath(); c.ellipse(hx + 8, hy + 7, 2.2, 3, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = white; c.fillRect(hx + 5, hy + 4, 1.5, 2); c.fillRect(hx + 10.5, hy + 4, 1.5, 2);
        } else {
            c.strokeStyle = '#3a1e08'; c.lineWidth = 1; c.beginPath(); c.moveTo(hx + 9, hy + 4.5); c.quadraticCurveTo(hx + 11, hy + 6.5, hx + 13, hy + 4.5); c.stroke();
            if (k >= 0) { c.fillStyle = '#ff7f95'; c.beginPath(); c.ellipse(hx + 11, hy + 7, 1.8, 2.6, 0.2, 0, Math.PI * 2); c.fill(); } // tongue out when trotting
        }
        // eyes: big with highlight; one eyebrow raised for character
        c.fillStyle = white; c.beginPath(); c.arc(hx + 4, hy - 2, 2.6, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(hx + 4.6, hy - 1.8, 1.6, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(hx + 5.2, hy - 2.4, 0.6, 0, Math.PI * 2); c.fill();
        c.strokeStyle = furD; c.lineWidth = 1.2; c.beginPath(); c.moveTo(hx + 1.5, hy - 6); c.lineTo(hx + 6.5, hy - 5.5 + (bark ? -1.5 : 0)); c.stroke();
        // red collar with a brass tag
        c.fillStyle = '#e63b2e'; c.beginPath(); c.ellipse(hx - 3, hy + 5, 6, 2.6, 0.3, 0, Math.PI * 2); c.fill(); c.strokeStyle = ink; c.lineWidth = 1; c.stroke();
        c.fillStyle = '#f2c230'; c.beginPath(); c.arc(hx - 2, hy + 9, 2, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.4)'; c.stroke();
    }

    private static drawCat(c: CanvasRenderingContext2D, pose: CatPose): void {
        // orange tabby, 3/4 side view facing +x (sprite is mirrored by scale.x for -x)
        const fur = '#e08a3c', furL = '#f5b86c', furD = '#8f4e14', stripe = 'rgba(110,50,10,0.55)', white = '#fbf1e2', ink = 'rgba(0,0,0,0.5)';
        const outline = () => { c.strokeStyle = ink; c.lineWidth = 1.2; c.stroke(); };
        const eyes = (hx: number, hy: number, open: boolean) => {
            if (!open) { c.strokeStyle = '#5a2e08'; c.lineWidth = 1.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(hx + 1, hy - 1); c.lineTo(hx + 3.5, hy - 1); c.moveTo(hx + 5.5, hy - 1); c.lineTo(hx + 8, hy - 1); c.stroke(); return; }
            c.fillStyle = '#9ae63a'; c.beginPath(); c.ellipse(hx + 2.3, hy - 1, 1.7, 1.4, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(hx + 6.7, hy - 1, 1.7, 1.4, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#101010'; c.fillRect(hx + 2, hy - 2.2, 0.8, 2.4); c.fillRect(hx + 6.4, hy - 2.2, 0.8, 2.4); // slit pupils
        };
        const head = (hx: number, hy: number, open: boolean) => {
            // ears first (behind the head), then head disc, muzzle, nose, whiskers
            c.fillStyle = fur; c.beginPath(); c.moveTo(hx - 1, hy - 4); c.lineTo(hx - 1, hy - 12); c.lineTo(hx + 4, hy - 6); c.closePath(); c.fill(); outline();
            c.beginPath(); c.moveTo(hx + 6, hy - 6); c.lineTo(hx + 10, hy - 12); c.lineTo(hx + 10, hy - 4); c.closePath(); c.fill(); outline();
            c.fillStyle = '#f0a0a8'; c.beginPath(); c.moveTo(hx, hy - 5.5); c.lineTo(hx + 0.3, hy - 9.5); c.lineTo(hx + 3, hy - 6); c.closePath(); c.fill(); c.beginPath(); c.moveTo(hx + 9, hy - 5.5); c.lineTo(hx + 8.8, hy - 9.5); c.lineTo(hx + 6.5, hy - 6); c.closePath(); c.fill();
            const hg = c.createRadialGradient(hx + 3, hy - 4, 1, hx + 4.5, hy - 2, 8); hg.addColorStop(0, furL); hg.addColorStop(0.7, fur); hg.addColorStop(1, furD);
            c.fillStyle = hg; c.beginPath(); c.ellipse(hx + 4.5, hy - 2, 7, 6.2, 0, 0, Math.PI * 2); c.fill(); outline();
            c.strokeStyle = stripe; c.lineWidth = 1.2; c.beginPath(); c.moveTo(hx + 3, hy - 7.5); c.lineTo(hx + 3.5, hy - 4.5); c.moveTo(hx + 6, hy - 7.5); c.lineTo(hx + 5.5, hy - 4.5); c.stroke(); // forehead M
            c.fillStyle = white; c.beginPath(); c.ellipse(hx + 7, hy + 1, 3.6, 2.6, 0, 0, Math.PI * 2); c.fill(); // muzzle
            c.fillStyle = '#e8707a'; c.beginPath(); c.moveTo(hx + 6, hy); c.lineTo(hx + 8, hy); c.lineTo(hx + 7, hy + 1.3); c.closePath(); c.fill(); // nose
            c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.8; c.beginPath(); for (const wy of [-0.5, 1, 2.5]) { c.moveTo(hx + 8.5, hy + 0.5); c.lineTo(hx + 15, hy + wy); } c.stroke(); // whiskers
            eyes(hx, hy, open);
        };
        const tail = (pts: number[][]) => { c.strokeStyle = ink; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); c.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]); c.stroke(); c.strokeStyle = fur; c.lineWidth = 3.4; c.stroke(); c.strokeStyle = stripe; c.lineWidth = 1; c.setLineDash([2, 3]); c.stroke(); c.setLineDash([]); };
        const shadow = (rx: number, ry: number, y: number) => { c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(1, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); };

        if (pose === 'sleep0' || pose === 'sleep1') {
            // curled crescent: body ring, head tucked, tail wrapping over the paws
            shadow(15, 7, 5);
            const bg = c.createRadialGradient(-2, -5, 2, 0, 0, 15); bg.addColorStop(0, furL); bg.addColorStop(0.65, fur); bg.addColorStop(1, furD);
            c.fillStyle = bg; c.beginPath(); c.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2); c.fill(); outline();
            c.strokeStyle = stripe; c.lineWidth = 1.6; for (let k = -8; k <= 4; k += 4) { c.beginPath(); c.moveTo(k, -8); c.quadraticCurveTo(k + 2, -3, k - 1, 2); c.stroke(); }
            tail(pose === 'sleep1' ? [[-11, 3], [-6, 12], [8, 12], [14, 6]] : [[-11, 3], [-6, 12], [8, 13], [12, 9]]);
            head(5, 0, false);
            return;
        }
        if (pose === 'stretch') {
            // long low stretch: front legs forward, rump up, tail straight up
            shadow(20, 5, 9);
            c.fillStyle = furD; c.fillRect(-13, 2, 4, 8); c.fillRect(-9, 3, 4, 7); c.fillRect(10, 5, 10, 3.5); c.fillRect(13, 7.5, 9, 3);
            const bg = c.createLinearGradient(0, -12, 0, 8); bg.addColorStop(0, furL); bg.addColorStop(0.5, fur); bg.addColorStop(1, furD);
            c.fillStyle = bg; c.beginPath(); c.moveTo(-14, -2); c.quadraticCurveTo(-12, -12, -4, -8); c.quadraticCurveTo(8, 0, 18, 6); c.lineTo(16, 10); c.quadraticCurveTo(0, 10, -14, 6); c.closePath(); c.fill(); outline();
            c.strokeStyle = stripe; c.lineWidth = 1.6; for (let k = -10; k <= 4; k += 4) { c.beginPath(); c.moveTo(k, -9 + (k + 10) * 0.5); c.lineTo(k - 1, -2 + (k + 10) * 0.5); c.stroke(); }
            tail([[-13, -4], [-16, -16], [-10, -22], [-8, -26]]);
            head(14, 5, true);
            return;
        }
        if (pose === 'sit0' || pose === 'sit1') {
            // sitting upright: pear body, front legs straight, tail curled round the paws (sit1 = tip flicks)
            shadow(12, 5, 11);
            const bg = c.createLinearGradient(0, -14, 0, 12); bg.addColorStop(0, furL); bg.addColorStop(0.5, fur); bg.addColorStop(1, furD);
            c.fillStyle = bg; c.beginPath(); c.moveTo(-10, 10); c.quadraticCurveTo(-13, -4, -2, -10); c.quadraticCurveTo(7, -12, 8, 0); c.lineTo(8, 10); c.closePath(); c.fill(); outline();
            c.fillStyle = white; c.beginPath(); c.ellipse(4, 2, 3.5, 7, 0, 0, Math.PI * 2); c.fill(); // chest bib
            c.strokeStyle = stripe; c.lineWidth = 1.6; for (let k = -8; k <= 0; k += 4) { c.beginPath(); c.moveTo(k, -7); c.quadraticCurveTo(k + 1, -2, k - 1, 4); c.stroke(); }
            c.fillStyle = fur; c.fillRect(1, 4, 3.5, 8); c.fillRect(5, 4, 3.5, 8); c.strokeStyle = ink; c.lineWidth = 1; c.strokeRect(1, 4, 3.5, 8); c.strokeRect(5, 4, 3.5, 8); // front legs
            c.fillStyle = white; c.beginPath(); c.ellipse(2.7, 12, 2.3, 1.4, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(6.7, 12, 2.3, 1.4, 0, 0, Math.PI * 2); c.fill(); // white socks
            tail(pose === 'sit1' ? [[-9, 8], [-16, 14], [-2, 16], [12, 12]] : [[-9, 8], [-16, 14], [-2, 16], [10, 15]]);
            head(0, -8, true);
            return;
        }
        // walk0..3: 4-frame cycle, diagonal leg pairs, head bobs, tail sways
        const k = Number(pose.slice(4));
        const ph = k / 4 * Math.PI * 2, sw = Math.sin(ph) * 3.2, lift = Math.max(0, Math.cos(ph)) * 1.5;
        shadow(16, 5, 9);
        // far legs first (darker), then body, then near legs
        c.fillStyle = furD;
        c.fillRect(-10 - sw, 3, 3.5, 8 - lift); c.fillRect(8 + sw, 3, 3.5, 8 - lift);
        const bg = c.createLinearGradient(0, -8, 0, 8); bg.addColorStop(0, furL); bg.addColorStop(0.45, fur); bg.addColorStop(1, furD);
        c.fillStyle = bg; c.beginPath(); c.ellipse(0, 0, 15, 7, 0, 0, Math.PI * 2); c.fill(); outline();
        c.strokeStyle = stripe; c.lineWidth = 1.6; for (let x = -9; x <= 6; x += 4) { c.beginPath(); c.moveTo(x, -6.5); c.quadraticCurveTo(x + 1.5, -2, x, 2); c.stroke(); } // tabby stripes
        c.fillStyle = white; c.beginPath(); c.ellipse(0, 4.5, 9, 2.4, 0, 0, Math.PI * 2); c.fill(); // belly
        c.fillStyle = fur;
        const near: Array<[number, number]> = [[-7 + sw, lift], [11 - sw, lift]];
        for (const [lx, ly] of near) { c.fillRect(lx, 4, 4, 8 - ly); c.strokeStyle = ink; c.lineWidth = 1; c.strokeRect(lx, 4, 4, 8 - ly); c.fillStyle = white; c.beginPath(); c.ellipse(lx + 2, 12 - ly, 2.5, 1.5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = fur; }
        tail([[-14, -2], [-20, -8 + Math.cos(ph) * 3], [-24, -14], [-20 + Math.sin(ph) * 3, -20]]);
        head(11, -5 + Math.sin(ph * 2) * 0.8, true);
        void css;
    }
}
