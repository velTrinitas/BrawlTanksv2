import * as PIXI from 'pixi.js';
import {
    DESERT_CARAVAN_PATH,
    DESERT_CARAVAN_CAMEL_COUNT,
    DESERT_CARAVAN_SPEED,
    DESERT_CARAVAN_SPACING,
    DESERT_CARAVAN_DROP_INTERVAL_MS,
} from '../DesertMap';

export type CaravanDropType = 'gem' | 'heart' | 'magnet';

interface Camel {
    container: PIXI.Container;
    body: PIXI.Container;
    head: PIXI.Container;
    legFL: PIXI.Graphics;
    legFR: PIXI.Graphics;
    legBL: PIXI.Graphics;
    legBR: PIXI.Graphics;
    x: number;
    y: number;
    walkPhase: number;
    pathProgress: number;
}

/**
 * v0.18.4-fix2 FAZA 4d — KARAWANA WIELBŁĄDÓW (cartoon ¾ side view)
 * 
 * 5 wielbłądów porusza się linear ping-pong po DESERT_CARAVAN_PATH.
 * Drop co 15s: gem 60% / heart 30% / magnet 10%.
 * 
 * VISUAL (przebudowane vs fix1 — anatomia cartoon kamel'a, nie pony):
 *  - Smukły wydłużony tułów z bezier-shape (NIE okrągła elipsa)
 *    z węższą "talią", wyraźną klatką piersiową i biodrami
 *  - Wysoki 1-garb dome wyrastający z grzbietu
 *  - Czerwona MATA (derka) na garbie + opadająca po bokach,
 *    z cyjanowym borderem i 3 złotymi diamentami (dekoracja)
 *  - Długa zakrzywiona szyja wychodząca skośnie z przedniej części korpusu
 *  - Mała głowa z wydłużonym pyskiem, czarne oko z highlightem,
 *    2 sterczące uszy, mała czerwona uzda na nosie
 *  - 4 cienkie nogi 20% dłuższe niż w fix1 (13px wysokość), z kopytami
 *  - Animowany ogon (kreska + ciemny chwost)
 *  - Cień owalny pod całym wielbłądem
 * 
 * Wielbłąd faces right (+X) by default. Flip horizontal (scale.x = -1)
 * przy zawracaniu (path angle |a| > PI/2).
 */
export class Caravan {
    private camels: Camel[] = [];
    private lastDropTime: number = 0;
    
    private pathSegments: {
        startX: number; startY: number;
        endX: number; endY: number;
        length: number;
        cumulative: number;
    }[] = [];
    private totalPathLength: number = 0;
    
    constructor(worldContainer: PIXI.Container) {
        let cumulative = 0;
        for (let i = 0; i < DESERT_CARAVAN_PATH.length - 1; i++) {
            const start = DESERT_CARAVAN_PATH[i];
            const end = DESERT_CARAVAN_PATH[i + 1];
            const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
            this.pathSegments.push({
                startX: start.x, startY: start.y,
                endX: end.x, endY: end.y,
                length,
                cumulative,
            });
            cumulative += length;
        }
        this.totalPathLength = cumulative;
        
        for (let i = 0; i < DESERT_CARAVAN_CAMEL_COUNT; i++) {
            const camel = this.buildCamel(i);
            camel.pathProgress = -i * DESERT_CARAVAN_SPACING;
            this.camels.push(camel);
            worldContainer.addChild(camel.container);
        }
        
        this.updateCamelPositions();
        this.lastDropTime = Date.now();
    }
    
    private buildCamel(index: number): Camel {
        const container = new PIXI.Container();
        const body = new PIXI.Container();
        container.addChild(body);
        
        // === KOLORY (warm desert sand — lekko bardziej yellowish niż fix1) ===
        const SAND_LIGHT = 0xf2d098;
        const SAND = 0xe5b878;
        const SAND_DARK = 0xb08858;
        const OUTLINE = 0x4a2810;
        const MAT_RED = 0xd83838;
        const MAT_RED_DARK = 0x8e1010;
        const MAT_BORDER = 0x3aa8b8;     // cyjanowy border maty
        const MAT_DIAMOND = 0xffcc30;    // złoty wzór na macie
        const HOOF = 0x3a1d08;
        const BLACK = 0x111111;
        const TAIL = 0x2a1808;
        
        // === SHADOW (owalny, pod całym wielbłądem) ===
        const shadow = new PIXI.Graphics();
        shadow.beginFill(0x000000, 0.35);
        shadow.drawEllipse(0, 18, 28, 6);
        shadow.endFill();
        body.addChild(shadow);
        
        // === BACK LEGS (rysowane PRZED korpusem dla głębi) ===
        // Nogi 20% dłuższe niż fix1: 11px → 13px
        const legBL = this.buildLeg(SAND_DARK, HOOF, OUTLINE);
        legBL.x = -10;
        legBL.y = 4;
        body.addChild(legBL);
        
        const legBR = this.buildLeg(SAND_DARK, HOOF, OUTLINE);
        legBR.x = -6;
        legBR.y = 5;  // dalej noga, lekko niżej
        body.addChild(legBR);
        
        // === MAIN TORSO (smukły wydłużony kształt — NIE elipsa) ===
        // Geometria:
        //   - dolny brzuch płaski (od -14 do +13 w X)
        //   - tylne biodro zaokrąglone z lekkim "haunch" górkowaniem
        //   - przednia klatka piersiowa szersza i wyższa (potem łączy się z szyją)
        //   - grzbiet (top) PŁASKI w środkowej części żeby garb miał gdzie usiąść
        const torso = new PIXI.Graphics();
        torso.lineStyle(2.2, OUTLINE, 1);
        torso.beginFill(SAND);
        
        // Start: tylny dół (rear-bottom)
        torso.moveTo(-15, 4);
        // → tylne biodro w górę
        torso.bezierCurveTo(-19, 2, -19, -3, -15, -5);
        // → grzbiet (lekko falujący — wyższy nad biodrami, niższy w "talii", potem wyżej pod garbem)
        torso.bezierCurveTo(-11, -7, -7, -7, -3, -7);
        torso.lineTo(8, -7);
        // → góra klatki piersiowej (transition do szyi)
        torso.bezierCurveTo(12, -7, 14, -6, 15, -3);
        // → przednia klatka (chest, prawa krawędź)
        torso.lineTo(15, 1);
        // → dolna klatka (chest-belly junction)
        torso.bezierCurveTo(14, 4, 12, 5, 9, 5);
        // → brzuch (płaska linia)
        torso.lineTo(-10, 5);
        // → close (do startu)
        torso.bezierCurveTo(-13, 5, -15, 5, -15, 4);
        torso.closePath();
        torso.endFill();
        torso.lineStyle(0);
        
        // Highlight wzdłuż górnej części grzbietu (jaśniejszy pasek)
        torso.beginFill(SAND_LIGHT, 0.65);
        torso.moveTo(-12, -5);
        torso.lineTo(7, -5);
        torso.bezierCurveTo(11, -5, 13, -4, 13, -2);
        torso.lineTo(13, -1);
        torso.lineTo(-12, -1);
        torso.closePath();
        torso.endFill();
        
        // Shadow pod brzuchem
        torso.beginFill(SAND_DARK, 0.45);
        torso.moveTo(-12, 3);
        torso.lineTo(11, 3);
        torso.lineTo(11, 5);
        torso.lineTo(-12, 5);
        torso.closePath();
        torso.endFill();
        
        body.addChild(torso);
        
        // === TAIL (ogon z tyłu) ===
        const tail = new PIXI.Graphics();
        tail.lineStyle(2, OUTLINE, 1);
        tail.moveTo(-15, -2);
        tail.bezierCurveTo(-19, -1, -21, 2, -22, 5);
        // Chwost
        tail.lineStyle(0);
        tail.beginFill(TAIL);
        tail.drawEllipse(-22.5, 5.5, 2, 3);
        tail.endFill();
        body.addChild(tail);
        
        // === HUMP (1 wysoki garb na grzbiecie) ===
        const hump = new PIXI.Graphics();
        hump.lineStyle(2.2, OUTLINE, 1);
        hump.beginFill(SAND);
        // Wysoki garb — bezier dome
        hump.moveTo(-6, -7);
        hump.bezierCurveTo(-7, -16, 5, -17, 7, -7);
        hump.closePath();
        hump.endFill();
        // Highlight na garbie
        hump.lineStyle(0);
        hump.beginFill(SAND_LIGHT, 0.7);
        hump.drawEllipse(-1, -13, 3, 2);
        hump.endFill();
        body.addChild(hump);
        
        // === MATA (czerwona derka rozłożona na garbie + opadająca po bokach) ===
        const mat = new PIXI.Graphics();
        
        // Main mat shape: szerszy niż garb, opadający trapezoid
        // Top tight on hump (od -7 do +8 w X, na wysokości -8)
        // Bottom wystaje poza tułów (od -12 do +13 w X, na wysokości -1)
        mat.lineStyle(2, OUTLINE, 1);
        mat.beginFill(MAT_RED);
        mat.moveTo(-7, -10);
        mat.bezierCurveTo(-6, -16, 6, -16, 8, -10);  // top dopasowany do garba
        mat.lineTo(13, -3);                            // prawy bok opadający
        mat.lineTo(12, -1);                            // prawy dolny róg
        mat.lineTo(-11, -1);                           // dół maty (lekko niżej z lewej)
        mat.lineTo(-12, -3);                           // lewy dolny róg
        mat.closePath();
        mat.endFill();
        mat.lineStyle(0);
        
        // Mat highlight (jaśniejsza góra)
        mat.beginFill(0xff5858, 0.55);
        mat.moveTo(-5, -14);
        mat.bezierCurveTo(-4, -16, 4, -16, 5, -14);
        mat.lineTo(4, -12);
        mat.lineTo(-4, -12);
        mat.closePath();
        mat.endFill();
        
        // Mat shadow (ciemniejszy dolny brzeg)
        mat.beginFill(MAT_RED_DARK, 0.5);
        mat.moveTo(-11, -2.5);
        mat.lineTo(12, -2.5);
        mat.lineTo(12, -1);
        mat.lineTo(-11, -1);
        mat.closePath();
        mat.endFill();
        
        // Cyjanowy border wewnątrz maty (po obwodzie ozdobnego rectangle)
        mat.lineStyle(1.2, MAT_BORDER, 1);
        mat.drawRoundedRect(-9, -9, 18, 6.5, 1);
        
        // 3 złote diamenty wzdłuż centrum
        mat.lineStyle(0);
        mat.beginFill(MAT_DIAMOND);
        for (const dx of [-5, 0, 5]) {
            mat.moveTo(dx, -7.5);
            mat.lineTo(dx + 1.5, -6);
            mat.lineTo(dx, -4.5);
            mat.lineTo(dx - 1.5, -6);
            mat.closePath();
        }
        mat.endFill();
        
        // 4 frędzle wisząco na dolnym brzegu (krótkie pionowe kreski)
        mat.lineStyle(1.2, MAT_DIAMOND, 0.9);
        for (const fx of [-8, -3, 3, 8]) {
            mat.moveTo(fx, -1);
            mat.lineTo(fx, 1);
        }
        
        body.addChild(mat);
        
        // === NECK + HEAD CONTAINER (animowany niezależnie) ===
        // Head container pivot at base of neck (top of chest).
        const head = new PIXI.Container();
        head.x = 13;
        head.y = -5;
        body.addChild(head);
        
        // NECK — długa, zakrzywiona, idzie skośnie w górę-prawo
        const neck = new PIXI.Graphics();
        neck.lineStyle(2.2, OUTLINE, 1);
        neck.beginFill(SAND);
        // Bottom (przy klatce piersiowej) — szerszy
        neck.moveTo(-3, 2);
        neck.lineTo(4, 2);
        // Górą (pod głową) — węższy
        neck.bezierCurveTo(7, -3, 9, -8, 10, -13);
        neck.lineTo(5, -13);
        // Tył szyi (od pod głową w dół)
        neck.bezierCurveTo(4, -8, 0, -3, -3, 2);
        neck.closePath();
        neck.endFill();
        // Highlight z przedniej strony szyi
        neck.lineStyle(0);
        neck.beginFill(SAND_LIGHT, 0.55);
        neck.moveTo(1, 0);
        neck.lineTo(4, 0);
        neck.bezierCurveTo(6, -4, 8, -8, 8, -12);
        neck.lineTo(6, -12);
        neck.bezierCurveTo(5, -8, 3, -4, 1, 0);
        neck.closePath();
        neck.endFill();
        head.addChild(neck);
        
        // HEAD — mała, podłużna, z wystającym pyskiem
        const headGfx = new PIXI.Graphics();
        headGfx.lineStyle(2, OUTLINE, 1);
        headGfx.beginFill(SAND);
        // Główna głowa
        headGfx.drawRoundedRect(3, -19, 10, 8, 2.5);
        headGfx.endFill();
        // Pysk (wystający na prawo, lekko niżej)
        headGfx.beginFill(SAND);
        headGfx.drawRoundedRect(10, -16, 6, 5, 2);
        headGfx.endFill();
        headGfx.lineStyle(0);
        // Highlight na czole
        headGfx.beginFill(SAND_LIGHT, 0.65);
        headGfx.drawEllipse(7, -17, 3, 1.5);
        headGfx.endFill();
        // Nozdrze
        headGfx.beginFill(OUTLINE);
        headGfx.drawCircle(14.5, -13, 0.7);
        headGfx.endFill();
        // Linia ust
        headGfx.lineStyle(1, OUTLINE, 0.7);
        headGfx.moveTo(13, -12);
        headGfx.lineTo(15.5, -12);
        // CZARNE OKO + glint
        headGfx.lineStyle(0);
        headGfx.beginFill(BLACK);
        headGfx.drawCircle(9, -16, 1.3);
        headGfx.endFill();
        headGfx.beginFill(0xffffff, 0.95);
        headGfx.drawCircle(9.4, -16.4, 0.5);
        headGfx.endFill();
        // 2 uszy
        headGfx.lineStyle(1.3, OUTLINE, 1);
        headGfx.beginFill(SAND_DARK);
        // Lewe ucho
        headGfx.moveTo(5, -19);
        headGfx.lineTo(5.5, -22);
        headGfx.lineTo(7, -19);
        headGfx.closePath();
        // Prawe ucho
        headGfx.moveTo(9, -19);
        headGfx.lineTo(9.5, -22);
        headGfx.lineTo(11, -19);
        headGfx.closePath();
        headGfx.endFill();
        // UZDA (czerwona opaska na pysku, mała ozdoba karawany)
        headGfx.lineStyle(0);
        headGfx.beginFill(MAT_RED);
        headGfx.drawRoundedRect(10, -14.5, 5.5, 1.5, 0.5);
        headGfx.endFill();
        // Mały złoty dodatek na uzdzie
        headGfx.beginFill(MAT_DIAMOND);
        headGfx.drawCircle(13, -13.8, 0.7);
        headGfx.endFill();
        
        head.addChild(headGfx);
        
        // === FRONT LEGS (rysowane PO głowie żeby przykrywały dolną część szyi) ===
        const legFL = this.buildLeg(SAND, HOOF, OUTLINE);
        legFL.x = 10;
        legFL.y = 5;
        body.addChild(legFL);
        
        const legFR = this.buildLeg(SAND, HOOF, OUTLINE);
        legFR.x = 6;
        legFR.y = 4;
        body.addChild(legFR);
        
        return {
            container,
            body,
            head,
            legFL,
            legFR,
            legBL,
            legBR,
            x: 0,
            y: 0,
            walkPhase: index * 0.6,
            pathProgress: 0,
        };
    }
    
    /**
     * Noga: chudy beżowy prostokąt z ciemnym kopytkiem. WYSOKOŚĆ 13px (20% > fix1).
     */
    private buildLeg(legColor: number, hoofColor: number, outline: number): PIXI.Graphics {
        const leg = new PIXI.Graphics();
        leg.lineStyle(1.5, outline, 1);
        leg.beginFill(legColor);
        // Cieńsza i dłuższa niż fix1: 2.2 szer × 13 wys
        leg.drawRoundedRect(-1.1, 0, 2.2, 13, 1);
        leg.endFill();
        // Kopyto
        leg.lineStyle(0);
        leg.beginFill(hoofColor);
        leg.drawRoundedRect(-1.6, 11, 3.2, 2.5, 0.7);
        leg.endFill();
        return leg;
    }
    
    private getPathPosition(progress: number): { x: number, y: number, angle: number } {
        if (this.totalPathLength === 0) return { x: 0, y: 0, angle: 0 };
        
        const period = 2 * this.totalPathLength;
        let p = ((progress % period) + period) % period;
        
        const isReturning = p > this.totalPathLength;
        if (isReturning) p = period - p;
        
        for (const seg of this.pathSegments) {
            if (p <= seg.cumulative + seg.length) {
                const t = (p - seg.cumulative) / seg.length;
                const x = seg.startX + (seg.endX - seg.startX) * t;
                const y = seg.startY + (seg.endY - seg.startY) * t;
                
                let dx = seg.endX - seg.startX;
                let dy = seg.endY - seg.startY;
                if (isReturning) { dx = -dx; dy = -dy; }
                const angle = Math.atan2(dy, dx);
                
                return { x, y, angle };
            }
        }
        const last = DESERT_CARAVAN_PATH[DESERT_CARAVAN_PATH.length - 1];
        return { x: last.x, y: last.y, angle: 0 };
    }
    
    private updateCamelPositions(): void {
        for (const c of this.camels) {
            const pos = this.getPathPosition(c.pathProgress);
            c.x = pos.x;
            c.y = pos.y;
            c.container.x = c.x;
            c.container.y = c.y;
            
            // Flip horizontal zamiast pełnej rotacji (uniknięcie "do góry nogami")
            const facingLeft = Math.abs(pos.angle) > Math.PI / 2;
            c.body.scale.x = facingLeft ? -1 : 1;
            
            // Drobny vertical lean (max ±5°) dla "kroczącego" feelu
            const verticalLean = Math.sin(pos.angle) * 0.08;
            c.container.rotation = facingLeft ? -verticalLean : verticalLean;
            
            c.container.zIndex = c.y + 15;
        }
    }
    
    private animateCamels(delta: number): void {
        for (const c of this.camels) {
            c.walkPhase += 0.17 * delta;
            const phase = c.walkPhase;
            
            // LEG WALKING (cross-pattern, slightly larger amplitude bo nogi dłuższe)
            // Para 1: FL + BR in-sync
            const p1 = Math.sin(phase);
            c.legFL.rotation = p1 * 0.32;
            c.legFL.y = 5 - Math.max(0, p1) * 1.4;
            c.legBR.rotation = p1 * 0.27;
            c.legBR.y = 5 - Math.max(0, p1) * 1.2;
            
            // Para 2: FR + BL opposite phase
            const p2 = Math.sin(phase + Math.PI);
            c.legFR.rotation = p2 * 0.32;
            c.legFR.y = 4 - Math.max(0, p2) * 1.4;
            c.legBL.rotation = p2 * 0.27;
            c.legBL.y = 4 - Math.max(0, p2) * 1.2;
            
            // HEAD BOB (kiwa + skręca)
            c.head.y = -5 + Math.sin(phase * 0.5) * 0.9;
            c.head.rotation = Math.sin(phase * 0.5) * 0.07;
            
            // BODY BOUNCE (delikatne podskakiwanie)
            c.body.y = Math.abs(Math.sin(phase)) * 0.7;
        }
    }
    
    public update(delta: number): { type: CaravanDropType; x: number; y: number } | null {
        const speedThisFrame = DESERT_CARAVAN_SPEED * delta;
        for (const c of this.camels) {
            c.pathProgress += speedThisFrame;
        }
        
        this.updateCamelPositions();
        this.animateCamels(delta);
        
        const now = Date.now();
        if (now - this.lastDropTime >= DESERT_CARAVAN_DROP_INTERVAL_MS) {
            this.lastDropTime = now;
            
            const visibleCamels = this.camels.filter(c => c.pathProgress > 0);
            if (visibleCamels.length === 0) return null;
            
            const randomCamel = visibleCamels[Math.floor(Math.random() * visibleCamels.length)];
            
            const r = Math.random();
            let type: CaravanDropType;
            if (r < 0.60) type = 'gem';
            else if (r < 0.90) type = 'heart';
            else type = 'magnet';
            
            return { type, x: randomCamel.x, y: randomCamel.y };
        }
        
        return null;
    }
}