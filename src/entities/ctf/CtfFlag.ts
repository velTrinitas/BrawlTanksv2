import * as PIXI from 'pixi.js';

/**
 * CtfFlag — flaga scenariusza CTF (FAZA CTF F2).
 *
 * Port legacy class Flag (ctf.html 3869-3933), wartosci 1:1:
 *  - stany: IDLE | CARRIED | CAPTURED,
 *  - pulse += 0.055/klatke (bob = sin(pulse)*5),
 *  - CARRIED: follow 34 px ZA kadlubem gracza (D8: hullAngle + PI — legacy mial
 *    tu buga NaN i fallback "na graczu"; implementujemy zamierzone zachowanie),
 *  - IDLE po dropie: reset do pozycji startowej po 10 000 ms (dropTimer),
 *  - CAPTURED: niewidoczna (proporzec na maszcie w bazie = F4 flex).
 *
 * Render programmatic (PIXI.Graphics + PIXI.Text): plyta gruntu w kolorze flagi
 * (tylko IDLE), maszt z bobem, proporzec W KOLORZE FLAGI (odstepstwo od legacy,
 * gdzie kazdy proporzec byl czerwony — kolor per flaga > czytelnosc), kamienna
 * podstawa, label "FLAGA X" pod spodem (tylko IDLE).
 */

export type CtfFlagState = 'idle' | 'carried' | 'captured';

export class CtfFlag {
    public readonly id: number;          // 0=ALFA 1=BRAVO 2=CHARLIE
    public readonly name: string;
    public readonly color: number;
    public readonly startX: number;
    public readonly startY: number;

    public x: number;
    public y: number;
    public state: CtfFlagState = 'idle';
    /** Timestamp resetu do startu po dropie (0 = brak aktywnego timera). */
    public dropTimer: number = 0;

    private container: PIXI.Container;
    private gfxPlate: PIXI.Graphics;
    private gfxFlag: PIXI.Graphics;
    /** FAZA CTF F3 — smuga za niesiona flaga (world-space, ground decal). */
    private gfxTrail: PIXI.Graphics;
    private trailPoints: Array<{ x: number; y: number }> = [];
    private trailFrameCounter: number = 0;
    private label: PIXI.Text;
    private pulse: number;

    constructor(
        id: number,
        name: string,
        x: number,
        y: number,
        color: number,
        worldContainer: PIXI.Container,
    ) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.startX = x;
        this.startY = y;
        this.x = x;
        this.y = y;

        // PIXI.Graphics init w PIERWSZYM bloku konstruktora (konwencja repo)
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;
        this.container.zIndex = y;
        worldContainer.addChild(this.container);

        this.gfxPlate = new PIXI.Graphics();
        this.gfxFlag = new PIXI.Graphics();
        this.container.addChild(this.gfxPlate);
        this.container.addChild(this.gfxFlag);

        // Smuga w WORLD-space (osobny gfx na poziomie gruntu — container flagi
        // sie przemieszcza, smuga musi zostawac za nia).
        this.gfxTrail = new PIXI.Graphics();
        this.gfxTrail.zIndex = 9;
        worldContainer.addChild(this.gfxTrail);

        this.label = new PIXI.Text(`FLAGA ${name}`, {
            fontFamily: "'Titan One', cursive",
            fontSize: 13,
            fill: color,
            stroke: 0x000000,
            strokeThickness: 3,
        });
        this.label.anchor.set(0.5, 0);
        this.label.y = 30;
        this.container.addChild(this.label);

        this.pulse = Math.random() * Math.PI * 2;
        this.drawPlate();
    }

    /**
     * Update per klatke. playerHullAngle = kat kadluba (D8: flaga 34 px za rufa).
     */
    public update(delta: number, playerX: number, playerY: number, playerHullAngle: number): void {
        this.pulse += 0.055 * delta;

        if (this.state === 'carried') {
            const behind = playerHullAngle + Math.PI;
            this.x = playerX + Math.cos(behind) * 34;
            this.y = playerY + Math.sin(behind) * 34;
        }

        if (this.state === 'idle' && this.dropTimer > 0 && Date.now() > this.dropTimer) {
            this.x = this.startX;
            this.y = this.startY;
            this.dropTimer = 0;
        }

        // Widocznosc + elementy zalezne od stanu
        this.container.visible = this.state !== 'captured';
        this.gfxPlate.visible = this.state === 'idle';
        this.label.visible = this.state === 'idle';

        this.container.x = this.x;
        this.container.y = this.y;
        this.container.zIndex = this.y + 2;

        if (this.container.visible) {
            this.drawFlag();
        }

        this.updateTrail(delta);
    }

    /**
     * FAZA CTF F3 — smuga w kolorze flagi za niesiona flaga (carry telegraph, D8).
     * Historia ~14 punktow (co 3 klatki), fade-out po ogonie. Maly redraw
     * (14 kol na klatke TYLKO podczas niesienia) — mobile-safe.
     */
    private updateTrail(delta: number): void {
        if (this.state === 'carried') {
            this.trailFrameCounter += delta;
            if (this.trailFrameCounter >= 3) {
                this.trailFrameCounter = 0;
                this.trailPoints.push({ x: this.x, y: this.y });
                if (this.trailPoints.length > 14) this.trailPoints.shift();
            }
        } else if (this.trailPoints.length > 0) {
            // Po dropie/dostawie ogon znika stopniowo (naturalny fade)
            this.trailPoints.shift();
        }

        const g = this.gfxTrail;
        g.clear();
        const n = this.trailPoints.length;
        for (let i = 0; i < n; i++) {
            const p = this.trailPoints[i];
            const tFade = (i + 1) / n; // 0=ogon, 1=przy fladze
            g.beginFill(this.color, 0.32 * tFade);
            g.drawCircle(p.x, p.y, 3 + 5 * tFade);
            g.endFill();
        }
    }

    /** Kolorowa plyta gruntu kotwiczaca flage wizualnie (tylko IDLE). */
    private drawPlate(): void {
        const g = this.gfxPlate;
        g.clear();
        for (let i = 3; i >= 1; i--) {
            g.beginFill(this.color, 0.13 * i);
            g.drawEllipse(0, 8, (50 / 3) * (4 - i), (30 / 3) * (4 - i));
            g.endFill();
        }
    }

    /** Maszt + proporzec (bob + fala) — redraw per klatke (maly gfx, tani). */
    private drawFlag(): void {
        const g = this.gfxFlag;
        g.clear();
        const bob = Math.sin(this.pulse) * 5;
        const wave = Math.sin(this.pulse * 1.9) * 5 + Math.sin(this.pulse * 3.1) * 2;

        // Cien masztu
        g.lineStyle(4, 0x000000, 0.2);
        g.moveTo(2, bob + 24);
        g.lineTo(2, bob - 28);
        // Maszt
        g.lineStyle(4, 0xc8a86b, 1);
        g.moveTo(0, bob + 22);
        g.lineTo(0, bob - 28);
        g.lineStyle(0);

        // Proporzec w kolorze flagi (falujacy)
        g.beginFill(this.color);
        g.lineStyle(1.2, 0x000000, 0.35);
        g.drawPolygon([0, bob - 28, 35, bob - 14 + wave, 0, bob + 2]);
        g.endFill();
        g.lineStyle(0);
        // Highlight proporca
        g.beginFill(0xffffff, 0.28);
        g.drawPolygon([0, bob - 28, 17, bob - 22 + wave * 0.5, 0, bob - 20]);
        g.endFill();

        // Kamienna podstawa
        g.beginFill(0xb8956a);
        g.lineStyle(1, 0x8b6914, 1);
        g.drawRoundedRect(-8, bob + 18, 16, 8, 2);
        g.endFill();
        g.lineStyle(0);
    }

    public destroy(): void {
        if (this.container.parent) this.container.parent.removeChild(this.container);
        this.container.destroy({ children: true });
        if (this.gfxTrail.parent) this.gfxTrail.parent.removeChild(this.gfxTrail);
        this.gfxTrail.destroy();
    }
}
