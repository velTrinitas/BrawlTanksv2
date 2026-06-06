import * as PIXI from 'pixi.js';
import type { RiverPathPoint, BridgeLayout } from './RiverNile';

/**
 * WaterLife — FAZA 3b: życie wokół rzeki Nil (v0.17.1).
 * 
 * Komponenty:
 *   - WaterFlora: lotusy (kolorowe kwiaty na powierzchni rzeki) + papirus (wysokie trzciny na brzegach)
 *   - Fish: 5-7 ryb pływających wzdłuż rzeki z occasional flash przy powierzchni
 *   - Bird: 2-3 ptaki V-shaped silhouettes lecące wysoko nad mapą (slow drift)
 * 
 * Wszystkie elementy dziedziczą z RiverPathPoint[] dla pozycjonowania,
 * z opcjonalnym omijaniem mostów (lotusy/ryby nie pojawiają się pod mostami).
 */

const PALETTE = {
    // Lotus colors
    lotusPink:      0xff7eb6,
    lotusPinkDark:  0xc05080,
    lotusWhite:     0xfff5ee,
    lotusWhiteDark: 0xd8c8b8,
    lotusYellow:    0xffd866,
    lotusYellowDark:0xc09838,
    lotusCenter:    0xffe860,   // żółte serca kwiatów
    leafGreen:      0x3a7d3a,
    leafGreenDark:  0x1e4a1e,
    
    // Papirus (reeds)
    reedStem:       0x6a9a3a,
    reedStemDark:   0x405a20,
    reedTuft:       0xc8e068,   // jasna kępa na szczycie
    reedTuftDark:   0x8aa848,
    
    // Fish
    fishBlue:       0x4080a0,
    fishBlueDark:   0x204060,
    fishBelly:      0x80c0d0,
    fishFlash:      0xfff8e0,   // żółtawy reflex łuski
    
    // Bird
    birdSilhouette: 0x2a2a2a,
    birdShadow:     0x000000,
};

// ============================================
// LOTUS — kwiat wodny
// ============================================

interface LotusInstance {
    container: PIXI.Container;
    baseScale: number;
    bobPhase: number;
    bobSpeed: number;
}

// ============================================
// PAPIRUS — wysoka trzcina na brzegu
// ============================================

interface ReedInstance {
    container: PIXI.Container;
    swayPhase: number;
    swayAmount: number;  // 0.02-0.06 radians
}

// ============================================
// FISH — ryba pływająca wzdłuż rzeki
// ============================================

interface FishInstance {
    gfx: PIXI.Graphics;
    t: number;              // position along river [0, 1]
    speed: number;          // delta-t per frame
    direction: 1 | -1;      // 1 = downstream, -1 = upstream
    flashPhase: number;     // for occasional surface flash
    color: number;
    colorDark: number;
    size: number;
}

// ============================================
// BIRD — V-shaped sylwetka ptaka
// ============================================

interface BirdInstance {
    container: PIXI.Container;
    bodyGfx: PIXI.Graphics;
    wingPhase: number;
    speedX: number;
    speedY: number;
    boundsX: { min: number; max: number };
    boundsY: { min: number; max: number };
}

export class WaterLife {
    private path: RiverPathPoint[];
    private riverWidth: number;
    private pathLength: number;
    
    private container: PIXI.Container;
    private florasContainer: PIXI.Container;  // lotusy + papirus (zIndex 55, above water below player)
    private fishContainer: PIXI.Container;    // ryby (zIndex 52, in water)
    private birdsContainer: PIXI.Container;   // ptaki (zIndex 200, above everything)
    
    private lotuses: LotusInstance[];
    private reeds: ReedInstance[];
    private fish: FishInstance[];
    private birds: BirdInstance[];
    
    constructor(
        path: RiverPathPoint[],
        riverWidth: number,
        bridges: BridgeLayout[],
        worldContainer: PIXI.Container,
    ) {
        this.path = path;
        this.riverWidth = riverWidth;
        this.pathLength = this.computePathLength();
        
        this.container = new PIXI.Container();
        worldContainer.addChild(this.container);
        
        // Fish (under water surface highlights)
        this.fishContainer = new PIXI.Container();
        this.fishContainer.zIndex = 52;
        worldContainer.addChild(this.fishContainer);
        
        // Florals (lotusy na powierzchni, papirus na brzegach)
        this.florasContainer = new PIXI.Container();
        this.florasContainer.zIndex = 55;
        worldContainer.addChild(this.florasContainer);
        
        // Birds (above everything — high altitude)
        this.birdsContainer = new PIXI.Container();
        this.birdsContainer.zIndex = 200;
        worldContainer.addChild(this.birdsContainer);
        
        this.lotuses = [];
        this.reeds = [];
        this.fish = [];
        this.birds = [];
        
        // Spawn order: papirus na brzegach → lotusy na wodzie → ryby → ptaki
        this.spawnReeds();
        this.spawnLotuses(bridges);
        this.spawnFish();
        this.spawnBirds();
    }
    
    private computePathLength(): number {
        let length = 0;
        for (let i = 0; i < this.path.length - 1; i++) {
            const dx = this.path[i + 1].x - this.path[i].x;
            const dy = this.path[i + 1].y - this.path[i].y;
            length += Math.sqrt(dx * dx + dy * dy);
        }
        return length;
    }
    
    private getPointAt(t: number): RiverPathPoint {
        const targetDist = this.pathLength * Math.max(0, Math.min(1, t));
        let accDist = 0;
        for (let i = 0; i < this.path.length - 1; i++) {
            const p1 = this.path[i];
            const p2 = this.path[i + 1];
            const segDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
            if (accDist + segDist >= targetDist) {
                const localT = (targetDist - accDist) / segDist;
                return {
                    x: p1.x + (p2.x - p1.x) * localT,
                    y: p1.y + (p2.y - p1.y) * localT,
                };
            }
            accDist += segDist;
        }
        return this.path[this.path.length - 1];
    }
    
    private getTangentAt(t: number): { x: number; y: number } {
        const targetDist = this.pathLength * Math.max(0, Math.min(1, t));
        let accDist = 0;
        for (let i = 0; i < this.path.length - 1; i++) {
            const p1 = this.path[i];
            const p2 = this.path[i + 1];
            const segDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
            if (accDist + segDist >= targetDist) {
                return { x: (p2.x - p1.x) / segDist, y: (p2.y - p1.y) / segDist };
            }
            accDist += segDist;
        }
        const last = this.path[this.path.length - 1];
        const prev = this.path[this.path.length - 2];
        const dx = last.x - prev.x;
        const dy = last.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        return { x: dx / len, y: dy / len };
    }
    
    private isNearBridge(x: number, y: number, bridges: BridgeLayout[], radius: number): boolean {
        return bridges.some(b => {
            const dx = b.x - x;
            const dy = b.y - y;
            return dx * dx + dy * dy < radius * radius;
        });
    }
    
    // ============================================
    // PAPIRUS spawn — trzciny na brzegach rzeki
    // ============================================
    
    private spawnReeds(): void {
        const reedCount = 50;
        for (let i = 0; i < reedCount; i++) {
            const t = i / reedCount;
            const pt = this.getPointAt(t);
            const tangent = this.getTangentAt(t);
            // Perpendicular to flow direction
            const perpX = -tangent.y;
            const perpY = tangent.x;
            
            // Random side (left or right of river)
            const side = Math.random() < 0.5 ? 1 : -1;
            // Distance from center: between riverWidth/2 + 5 (right at edge) and riverWidth/2 + 30 (further on sand)
            const distFromCenter = (this.riverWidth / 2) + 5 + Math.random() * 25;
            
            const x = pt.x + perpX * distFromCenter * side;
            const y = pt.y + perpY * distFromCenter * side;
            
            // Random jitter dla naturalności
            const jitterX = (Math.random() - 0.5) * 12;
            const jitterY = (Math.random() - 0.5) * 12;
            
            this.createReed(x + jitterX, y + jitterY);
        }
    }
    
    private createReed(x: number, y: number): void {
        const container = new PIXI.Container();
        container.x = x;
        container.y = y;
        container.zIndex = y + 3;  // above water, below tank
        this.florasContainer.addChild(container);
        
        const g = new PIXI.Graphics();
        container.addChild(g);
        
        const height = 18 + Math.random() * 14;  // 18-32px tall reed
        const stemThickness = 1.5 + Math.random() * 0.8;
        
        // Cień u podstawy
        g.beginFill(0x000000, 0.3);
        g.drawEllipse(0, 1, 3.5, 1.5);
        g.endFill();
        
        // Łodyga (stem) — pionowa linia z gradient
        g.lineStyle(stemThickness + 1, PALETTE.reedStemDark, 1);
        g.moveTo(0, 0);
        g.lineTo(0, -height);
        g.lineStyle(stemThickness, PALETTE.reedStem, 1);
        g.moveTo(0, 0);
        g.lineTo(0, -height);
        
        // Kępa szczytowa (papyrus tuft) — radialne pióropusze
        g.lineStyle(0);
        const tuftCount = 8 + Math.floor(Math.random() * 4);
        for (let i = 0; i < tuftCount; i++) {
            const angle = -Math.PI / 2 + (i / tuftCount - 0.5) * Math.PI * 1.1;
            const tuftLen = 5 + Math.random() * 3.5;
            
            // Cień tuft
            g.lineStyle(1.8, PALETTE.reedTuftDark, 1);
            g.moveTo(0, -height);
            g.lineTo(
                Math.cos(angle) * tuftLen,
                -height + Math.sin(angle) * tuftLen,
            );
            // Jasna kreska na top
            g.lineStyle(1, PALETTE.reedTuft, 1);
            g.moveTo(0, -height);
            g.lineTo(
                Math.cos(angle) * tuftLen,
                -height + Math.sin(angle) * tuftLen,
            );
        }
        g.lineStyle(0);
        
        // Małe kropki na szczycie (seed pods)
        for (let i = 0; i < 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 2 + Math.random() * 3;
            g.beginFill(PALETTE.reedTuftDark);
            g.drawCircle(Math.cos(angle) * dist, -height + Math.sin(angle) * dist, 0.7);
            g.endFill();
        }
        
        this.reeds.push({
            container,
            swayPhase: Math.random() * Math.PI * 2,
            swayAmount: 0.025 + Math.random() * 0.04,  // delikatne kołysanie
        });
    }
    
    // ============================================
    // LOTUS spawn — kwiaty wodne (na powierzchni)
    // ============================================
    
    private spawnLotuses(bridges: BridgeLayout[]): void {
        const lotusCount = 18;
        let placed = 0;
        let attempts = 0;
        
        while (placed < lotusCount && attempts < 60) {
            attempts++;
            const t = Math.random();
            const pt = this.getPointAt(t);
            const tangent = this.getTangentAt(t);
            const perpX = -tangent.y;
            const perpY = tangent.x;
            
            // Position w paśmie ~70% river width (nie na samym brzegu)
            const offsetDist = (Math.random() - 0.5) * (this.riverWidth * 0.7);
            const x = pt.x + perpX * offsetDist;
            const y = pt.y + perpY * offsetDist;
            
            // Skip jeśli pod mostem
            if (this.isNearBridge(x, y, bridges, 100)) continue;
            
            this.createLotus(x, y);
            placed++;
        }
    }
    
    private createLotus(x: number, y: number): void {
        const container = new PIXI.Container();
        container.x = x;
        container.y = y;
        container.zIndex = 56;  // above water
        this.florasContainer.addChild(container);
        
        const g = new PIXI.Graphics();
        container.addChild(g);
        
        // Wybór koloru (rotacja: pink/white/yellow)
        const colorRoll = Math.random();
        let petalColor: number, petalDark: number;
        if (colorRoll < 0.45) {
            petalColor = PALETTE.lotusPink;
            petalDark = PALETTE.lotusPinkDark;
        } else if (colorRoll < 0.80) {
            petalColor = PALETTE.lotusWhite;
            petalDark = PALETTE.lotusWhiteDark;
        } else {
            petalColor = PALETTE.lotusYellow;
            petalDark = PALETTE.lotusYellowDark;
        }
        
        const baseScale = 0.7 + Math.random() * 0.6;
        
        // Lily pad (płaski liść — pod kwiatem)
        g.beginFill(PALETTE.leafGreenDark);
        g.drawEllipse(2, 3, 14 * baseScale, 9 * baseScale);
        g.endFill();
        g.beginFill(PALETTE.leafGreen);
        g.drawEllipse(0, 0, 14 * baseScale, 9 * baseScale);
        g.endFill();
        // Notch w liściu (charakterystyczny dla lily pad)
        g.beginFill(0x0d3344, 0.7);
        g.drawPolygon([
            -2, 0,
            -14 * baseScale, 0,
            -8 * baseScale, 3 * baseScale,
        ]);
        g.endFill();
        
        // Kwiat — 5 płatków zewnętrznych
        const petalCount = 5;
        const petalRadius = 5.5 * baseScale;
        const petalWidth = 3 * baseScale;
        
        // Cienie płatków
        g.beginFill(petalDark);
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2 + Math.random() * 0.1;
            const px = Math.cos(angle) * 2.5 + 1;
            const py = Math.sin(angle) * 2.5 + 1;
            g.drawEllipse(px, py, petalWidth, petalRadius);
        }
        g.endFill();
        
        // Płatki główne
        g.beginFill(petalColor);
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            const px = Math.cos(angle) * 2.5;
            const py = Math.sin(angle) * 2.5;
            g.drawEllipse(px, py, petalWidth, petalRadius);
        }
        g.endFill();
        
        // 5 płatków wewnętrznych (mniejsze, obrócone o pół segmentu)
        g.beginFill(petalColor, 0.85);
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2 + Math.PI / petalCount;
            const px = Math.cos(angle) * 1.5;
            const py = Math.sin(angle) * 1.5;
            g.drawEllipse(px, py, petalWidth * 0.7, petalRadius * 0.7);
        }
        g.endFill();
        
        // Żółte serce kwiatu
        g.beginFill(PALETTE.lotusCenter);
        g.drawCircle(0, 0, 2 * baseScale);
        g.endFill();
        // Subtle highlight
        g.beginFill(0xffffff, 0.5);
        g.drawCircle(-0.5 * baseScale, -0.5 * baseScale, 0.8 * baseScale);
        g.endFill();
        
        this.lotuses.push({
            container,
            baseScale,
            bobPhase: Math.random() * Math.PI * 2,
            bobSpeed: 0.0008 + Math.random() * 0.0006,
        });
    }
    
    // ============================================
    // FISH spawn — ryby
    // ============================================
    
    private spawnFish(): void {
        const fishCount = 6;
        for (let i = 0; i < fishCount; i++) {
            const t = i / fishCount + Math.random() * 0.1;
            const direction = Math.random() < 0.6 ? -1 : 1;  // 60% upstream (against flow)
            this.createFish(t, direction);
        }
    }
    
    private createFish(initialT: number, direction: 1 | -1): void {
        const gfx = new PIXI.Graphics();
        this.fishContainer.addChild(gfx);
        
        const size = 3.5 + Math.random() * 2.5;  // 3.5-6px length
        const isAlt = Math.random() < 0.3;  // 30% are darker
        const color = isAlt ? PALETTE.fishBlueDark : PALETTE.fishBlue;
        const colorDark = isAlt ? 0x102030 : PALETTE.fishBlueDark;
        
        this.fish.push({
            gfx,
            t: initialT % 1,
            speed: (0.00010 + Math.random() * 0.00010) * direction,  // very slow drift
            direction,
            flashPhase: Math.random() * Math.PI * 2,
            color,
            colorDark,
            size,
        });
    }
    
    private drawFish(fish: FishInstance, time: number): void {
        const g = fish.gfx;
        g.clear();
        
        // Position along river z lateral offset (wandering)
        const pt = this.getPointAt(fish.t);
        const tangent = this.getTangentAt(fish.t);
        const perpX = -tangent.y;
        const perpY = tangent.x;
        
        // Lateral sin wave (wandering side to side)
        const wander = Math.sin(time / 1500 + fish.flashPhase) * this.riverWidth * 0.25;
        const fx = pt.x + perpX * wander;
        const fy = pt.y + perpY * wander;
        
        // Direction tangent for rendering rotation
        const dirAngle = Math.atan2(tangent.y * fish.direction, tangent.x * fish.direction);
        
        g.x = fx;
        g.y = fy;
        g.rotation = dirAngle;
        
        const s = fish.size;
        
        // Flash co kilka sekund (subtle scale boost + brighter color)
        const flashCycle = (time / 2500 + fish.flashPhase) % 1;
        const isFlashing = flashCycle < 0.08;
        const scaleBoost = isFlashing ? 1.3 : 1.0;
        
        // Body (oval)
        g.beginFill(fish.colorDark);
        g.drawEllipse(0.5, 0.5, s * scaleBoost, s * 0.5 * scaleBoost);
        g.endFill();
        g.beginFill(fish.color);
        g.drawEllipse(0, 0, s * scaleBoost, s * 0.5 * scaleBoost);
        g.endFill();
        
        // Brzuszek (lighter belly)
        g.beginFill(PALETTE.fishBelly, 0.7);
        g.drawEllipse(0, s * 0.15, s * 0.7 * scaleBoost, s * 0.25 * scaleBoost);
        g.endFill();
        
        // Tail (V-shape z tyłu)
        g.beginFill(fish.colorDark);
        g.drawPolygon([
            -s, 0,
            -s * 1.7, -s * 0.5,
            -s * 1.5, 0,
            -s * 1.7, s * 0.5,
        ]);
        g.endFill();
        
        // Flash highlight (occasional)
        if (isFlashing) {
            g.beginFill(PALETTE.fishFlash, 0.9);
            g.drawEllipse(s * 0.2, -s * 0.1, s * 0.4, s * 0.15);
            g.endFill();
        }
        
        // Subtle eye
        g.beginFill(0x000000, 0.8);
        g.drawCircle(s * 0.5, -s * 0.1, 0.5);
        g.endFill();
    }
    
    // ============================================
    // BIRD spawn — V-shaped ptaki wysoko
    // ============================================
    
    private spawnBirds(): void {
        const birdCount = 3;
        // Boundary całej mapy — ptaki latają wszędzie nad mapą, nie tylko przy rzece
        const minX = this.path[0].x - 500;
        const maxX = this.path[this.path.length - 1].x + 500;
        const minY = 0;
        const maxY = Math.max(this.path[0].y, this.path[this.path.length - 1].y);
        
        for (let i = 0; i < birdCount; i++) {
            this.createBird(
                minX + Math.random() * (maxX - minX),
                minY + Math.random() * (maxY - minY),
                { min: minX, max: maxX },
                { min: minY, max: maxY },
            );
        }
    }
    
    private createBird(
        x: number,
        y: number,
        boundsX: { min: number; max: number },
        boundsY: { min: number; max: number },
    ): void {
        const container = new PIXI.Container();
        container.x = x;
        container.y = y;
        this.birdsContainer.addChild(container);
        
        const bodyGfx = new PIXI.Graphics();
        container.addChild(bodyGfx);
        
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 0.4;
        
        this.birds.push({
            container,
            bodyGfx,
            wingPhase: Math.random() * Math.PI * 2,
            speedX: Math.cos(angle) * speed,
            speedY: Math.sin(angle) * speed,
            boundsX,
            boundsY,
        });
    }
    
    private drawBird(bird: BirdInstance, time: number): void {
        const g = bird.bodyGfx;
        g.clear();
        
        // V-shape z animowanym wingbeat
        const wingbeat = Math.sin(time / 200 + bird.wingPhase);
        const wingY = wingbeat * 1.2;
        
        // Cień (przesunięty SE, symuluje cień na ziemi)
        g.beginFill(PALETTE.birdShadow, 0.25);
        const shadowOffset = 18;
        g.moveTo(-7 + shadowOffset, wingY * 0.5 + shadowOffset);
        g.lineTo(0 + shadowOffset, -1 + shadowOffset);
        g.lineTo(7 + shadowOffset, wingY * 0.5 + shadowOffset);
        g.endFill();
        
        // Body V
        g.lineStyle(2.2, PALETTE.birdSilhouette, 1);
        g.moveTo(-7, wingY);
        g.lineTo(0, -1);
        g.lineTo(7, wingY);
        g.lineStyle(0);
    }
    
    private updateBird(bird: BirdInstance): void {
        bird.container.x += bird.speedX;
        bird.container.y += bird.speedY;
        
        // Wrap around bounds (smooth — ptak znika z jednej strony, pojawia się z drugiej)
        const padding = 30;
        if (bird.container.x < bird.boundsX.min - padding) bird.container.x = bird.boundsX.max + padding;
        if (bird.container.x > bird.boundsX.max + padding) bird.container.x = bird.boundsX.min - padding;
        if (bird.container.y < bird.boundsY.min - padding) bird.container.y = bird.boundsY.max + padding;
        if (bird.container.y > bird.boundsY.max + padding) bird.container.y = bird.boundsY.min - padding;
        
        // Bird rotation matches flight direction
        bird.container.rotation = Math.atan2(bird.speedY, bird.speedX) + Math.PI / 2;
    }
    
    // ============================================
    // UPDATE — per frame animacje
    // ============================================
    
    public update(): void {
        const time = Date.now();
        
        // Papirus sway (delikatne kołysanie)
        for (const reed of this.reeds) {
            reed.container.rotation = Math.sin(time / 800 + reed.swayPhase) * reed.swayAmount;
        }
        
        // Lotus bob (subtle bob + pulse)
        for (const lotus of this.lotuses) {
            const bob = Math.sin(time * lotus.bobSpeed + lotus.bobPhase);
            const scale = lotus.baseScale * (1 + bob * 0.04);
            lotus.container.scale.set(scale);
        }
        
        // Fish swim
        for (const f of this.fish) {
            f.t += f.speed;
            if (f.t > 1) f.t -= 1;
            if (f.t < 0) f.t += 1;
            this.drawFish(f, time);
        }
        
        // Birds fly
        for (const bird of this.birds) {
            this.updateBird(bird);
            this.drawBird(bird, time);
        }
    }
}