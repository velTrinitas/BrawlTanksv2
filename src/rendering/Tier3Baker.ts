import * as PIXI from 'pixi.js';

/**
 * Tier3Baker — pieczony art szalonych mocy (Tier 3, v0.112.0).
 *
 * ZASADA (feedback Mariusza: "fantastycznie pod katem grafiki, 2.5D, tanie na
 * mobile, gradienty, pelna profeska"): kazdy sprite rysowany RAZ w Canvas 2D
 * (pelne gradienty + AA, ktorego mobile renderer nie ma) -> PIXI.Texture ->
 * w meczu TYLKO transformy. Wzorzec mobile-crisp (pady/pingwiny v0.90.1).
 *
 * Cache per-sesja (modul) — tekstury wspoldzielone, nigdy nie niszczone
 * (destroy zabilby cache; koszt: ~5 malych tekstur na caly czas zycia gry).
 */

const cache = new Map<string, PIXI.Texture>();

function baked(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): PIXI.Texture {
    const hit = cache.get(key);
    if (hit) return hit;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    if (!c) return PIXI.Texture.WHITE; // defensywnie — nie powinno sie zdarzyc
    draw(c);
    const tex = PIXI.Texture.from(cv);
    cache.set(key, tex);
    return tex;
}

/** Miekki cien-elipsa na grunt (wspolny dla kaczki/paczek — 2.5D kotwica wysokosci). */
export function bakeSoftShadow(): PIXI.Texture {
    return baked('t3shadow', 96, 48, (c) => {
        const g = c.createRadialGradient(48, 24, 4, 48, 24, 44);
        g.addColorStop(0, 'rgba(0,0,0,0.42)');
        g.addColorStop(0.7, 'rgba(0,0,0,0.20)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.save();
        c.translate(48, 24);
        c.scale(1, 0.5);
        c.beginPath();
        c.arc(0, 0, 44, 0, Math.PI * 2);
        c.fill();
        c.restore();
    });
}

/** GIGA KACZKA — gumowa kaczka premium (profil w prawo; lot robi scale.x flip). */
export function bakeDuck(): PIXI.Texture {
    return baked('t3duck', 150, 128, (c) => {
        c.save();
        c.translate(72, 70);
        // KORPUS — soczysty zolty z radialnym swiatlem (gumowa kaczka!)
        let g = c.createRadialGradient(-12, -18, 8, 0, 0, 58);
        g.addColorStop(0, '#fff3a8');
        g.addColorStop(0.45, '#ffd93b');
        g.addColorStop(0.85, '#f2b705');
        g.addColorStop(1, '#d99a04');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(0, 6, 52, 40, 0, 0, Math.PI * 2);
        c.fill();
        // OGON — zadarty kuperek
        c.beginPath();
        c.moveTo(-46, 0);
        c.quadraticCurveTo(-70, -14, -58, -30);
        c.quadraticCurveTo(-50, -12, -38, -14);
        c.closePath();
        c.fill();
        // SKRZYDLO — cieplejszy gradient + kontur (czytelny detal przy zoom 0.6)
        g = c.createLinearGradient(-30, -16, 10, 22);
        g.addColorStop(0, '#ffca1a');
        g.addColorStop(1, '#e0a303');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(-8, 6, 26, 17, -0.28, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(160,110,0,0.55)';
        c.lineWidth = 2.5;
        c.stroke();
        // GLOWA
        g = c.createRadialGradient(28, -46, 6, 34, -40, 30);
        g.addColorStop(0, '#fff3a8');
        g.addColorStop(0.6, '#ffd93b');
        g.addColorStop(1, '#e8ad06');
        c.fillStyle = g;
        c.beginPath();
        c.arc(34, -40, 27, 0, Math.PI * 2);
        c.fill();
        // DZIOB — pomaranczowy gradient, dwie wargi (kwakanie!)
        g = c.createLinearGradient(52, -44, 76, -32);
        g.addColorStop(0, '#ff9f43');
        g.addColorStop(1, '#e67e22');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(64, -38, 15, 8, 0.08, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.ellipse(62, -30, 11, 5, 0.15, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(150,60,0,0.4)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(51, -36);
        c.lineTo(75, -35);
        c.stroke();
        // OKO — biel + zrenica + podwojny blik (zycie!)
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(40, -46, 8.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#1a1a1a';
        c.beginPath();
        c.arc(42.5, -45, 5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(44, -47, 2, 0, Math.PI * 2);
        c.arc(41, -43.5, 1, 0, Math.PI * 2);
        c.fill();
        // POLYSK gumy na grzbiecie
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.beginPath();
        c.ellipse(-6, -22, 24, 8, -0.15, 0, Math.PI * 2);
        c.fill();
        c.restore();
    });
}

/** PACZKOMAT — metaliczna szafa ze skrytkami (pas LED = osobna tekstura, blink tintem). */
export function bakeLocker(): PIXI.Texture {
    return baked('t3locker', 92, 124, (c) => {
        c.save();
        c.translate(46, 62);
        // BRYLA 2.5D: prawy bok ciemniejszy (kierunek swiatla jak budynki)
        let g = c.createLinearGradient(-40, 0, 40, 0);
        g.addColorStop(0, '#7c8794');
        g.addColorStop(0.55, '#5b6672');
        g.addColorStop(1, '#3f4954');
        c.fillStyle = g;
        roundRect(c, -40, -56, 80, 108, 8);
        c.fill();
        // DASZEK
        g = c.createLinearGradient(0, -62, 0, -50);
        g.addColorStop(0, '#8b95a1');
        g.addColorStop(1, '#5b6672');
        c.fillStyle = g;
        roundRect(c, -43, -62, 86, 12, 5);
        c.fill();
        // SKRYTKI 3x2 — kazda z wlasnym gradientem + uchwyt
        for (let r = 0; r < 3; r++) {
            for (let col = 0; col < 2; col++) {
                const x = -34 + col * 37, y = -48 + r * 30;
                g = c.createLinearGradient(x, y, x + 31, y + 24);
                g.addColorStop(0, '#4d5762');
                g.addColorStop(1, '#39424c');
                c.fillStyle = g;
                roundRect(c, x, y, 31, 24, 4);
                c.fill();
                c.strokeStyle = 'rgba(20,26,32,0.6)';
                c.lineWidth = 1.5;
                c.stroke();
                c.fillStyle = '#f2b705';
                c.beginPath();
                c.arc(x + 26, y + 12, 2.2, 0, Math.PI * 2);
                c.fill();
            }
        }
        // WYLOT MOZDZIERZA na dachu (skad strzelaja paczki!)
        g = c.createRadialGradient(0, -66, 2, 0, -66, 12);
        g.addColorStop(0, '#1a2027');
        g.addColorStop(0.7, '#39424c');
        g.addColorStop(1, '#5b6672');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(0, -64, 13, 7, 0, 0, Math.PI * 2);
        c.fill();
        // obrys calosci
        c.strokeStyle = '#242b32';
        c.lineWidth = 2.5;
        roundRect(c, -40, -56, 80, 108, 8);
        c.stroke();
        c.restore();
    });
}

/** Pas LED paczkomatu (blink alpha w locie — osobny sprite nad szafa). */
export function bakeLockerLed(): PIXI.Texture {
    return baked('t3lockerled', 72, 12, (c) => {
        const g = c.createLinearGradient(0, 0, 72, 0);
        g.addColorStop(0, 'rgba(242,183,5,0.15)');
        g.addColorStop(0.5, '#ffd93b');
        g.addColorStop(1, 'rgba(242,183,5,0.15)');
        c.fillStyle = g;
        roundRect(c, 0, 0, 72, 12, 5);
        c.fill();
    });
}

/** PACZKA — kartonowy szescian 2.5D z tasma (leci lukiem z mozdzierza). */
export function bakeParcel(): PIXI.Texture {
    return baked('t3parcel', 44, 40, (c) => {
        c.save();
        c.translate(22, 22);
        // bryla: gora jasna / front sredni / bok ciemny (izometryczny karton)
        c.fillStyle = '#dcb27a';
        c.beginPath();
        c.moveTo(0, -16); c.lineTo(16, -8); c.lineTo(0, 0); c.lineTo(-16, -8);
        c.closePath();
        c.fill();
        let g = c.createLinearGradient(-16, 0, 0, 14);
        g.addColorStop(0, '#c9a36a');
        g.addColorStop(1, '#b58d55');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(-16, -8); c.lineTo(0, 0); c.lineTo(0, 16); c.lineTo(-16, 8);
        c.closePath();
        c.fill();
        g = c.createLinearGradient(0, 0, 16, 12);
        g.addColorStop(0, '#a8814c');
        g.addColorStop(1, '#8f6c3e');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(16, -8); c.lineTo(0, 0); c.lineTo(0, 16); c.lineTo(16, 8);
        c.closePath();
        c.fill();
        // tasma pakowa (zolta) przez gore i front
        c.strokeStyle = 'rgba(242,183,5,0.9)';
        c.lineWidth = 3.5;
        c.beginPath();
        c.moveTo(-16, -8); c.lineTo(0, -16); c.lineTo(16, -8);
        c.moveTo(0, 0); c.lineTo(0, 16);
        c.stroke();
        c.strokeStyle = 'rgba(90,60,20,0.5)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(0, -16); c.lineTo(16, -8); c.lineTo(16, 8); c.lineTo(0, 16);
        c.lineTo(-16, 8); c.lineTo(-16, -8); c.closePath();
        c.stroke();
        c.restore();
    });
}

/** BABCIA — dzielna seniorka z walkiem (bob transformem; serduszka robi Effects). */
export function bakeGranny(): PIXI.Texture {
    return baked('t3granny', 84, 116, (c) => {
        c.save();
        c.translate(42, 62);
        // SUKNIA — rozowy gradient dzwon
        let g = c.createLinearGradient(0, -10, 0, 48);
        g.addColorStop(0, '#f0b7d0');
        g.addColorStop(0.6, '#e8a0bf');
        g.addColorStop(1, '#c97b9d');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(-13, -12);
        c.quadraticCurveTo(-30, 30, -26, 46);
        c.lineTo(26, 46);
        c.quadraticCurveTo(30, 30, 13, -12);
        c.closePath();
        c.fill();
        // FARTUSZEK w grochy
        g = c.createLinearGradient(0, 4, 0, 42);
        g.addColorStop(0, '#fdf3f8');
        g.addColorStop(1, '#e8d5df');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(-12, 4);
        c.quadraticCurveTo(-16, 30, -14, 42);
        c.lineTo(14, 42);
        c.quadraticCurveTo(16, 30, 12, 4);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(200,123,157,0.5)';
        for (const [px, py] of [[-6, 14], [5, 22], [-3, 32], [7, 36]] as const) {
            c.beginPath();
            c.arc(px, py, 2.2, 0, Math.PI * 2);
            c.fill();
        }
        // GLOWA
        g = c.createRadialGradient(-4, -30, 4, 0, -26, 18);
        g.addColorStop(0, '#ffe4cf');
        g.addColorStop(1, '#f2c9a8');
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, -26, 16, 0, Math.PI * 2);
        c.fill();
        // KOK — srebrny gradient + nitki
        g = c.createRadialGradient(-2, -46, 2, 0, -44, 12);
        g.addColorStop(0, '#f2f2f5');
        g.addColorStop(1, '#c3c7ce');
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, -44, 10, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(140,145,155,0.7)';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(0, -44, 6, 0.4, 2.6);
        c.arc(0, -44, 3, 3.6, 5.8);
        c.stroke();
        // OKULARY — babcine polokragle + blik
        c.strokeStyle = '#4a4f57';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(-6, -25, 5, 0, Math.PI * 2);
        c.moveTo(11, -25);
        c.arc(6, -25, 5, 0, Math.PI * 2);
        c.moveTo(-1, -25);
        c.lineTo(1, -25);
        c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.beginPath();
        c.arc(-7, -26.5, 1.8, 0, Math.PI * 2);
        c.arc(5, -26.5, 1.8, 0, Math.PI * 2);
        c.fill();
        // usmiech + rumience
        c.strokeStyle = '#b06a52';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(0, -20, 5, 0.35, Math.PI - 0.35);
        c.stroke();
        c.fillStyle = 'rgba(240,140,140,0.4)';
        c.beginPath();
        c.arc(-10, -20, 3, 0, Math.PI * 2);
        c.arc(10, -20, 3, 0, Math.PI * 2);
        c.fill();
        // WALEK do ciasta (grozny!) — drewniany gradient, uniesiony
        c.save();
        c.translate(22, -8);
        c.rotate(-0.7);
        g = c.createLinearGradient(-4, 0, 4, 0);
        g.addColorStop(0, '#c9955c');
        g.addColorStop(0.5, '#a8783f');
        g.addColorStop(1, '#8f6230');
        c.fillStyle = g;
        roundRect(c, -4, -22, 8, 34, 4);
        c.fill();
        c.fillStyle = '#8f6230';
        roundRect(c, -2.5, -30, 5, 8, 2.5);
        c.fill();
        roundRect(c, -2.5, 12, 5, 8, 2.5);
        c.fill();
        c.restore();
        c.restore();
    });
}

/** KULA DISCO — lustrzana kula z fasetami (wisi nad graczem, rotacja transformem). */
export function bakeDiscoBall(): PIXI.Texture {
    return baked('t3disco', 72, 72, (c) => {
        c.save();
        c.translate(36, 36);
        let g = c.createRadialGradient(-10, -12, 4, 0, 0, 32);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, '#dfe6f2');
        g.addColorStop(0.75, '#9aa8c4');
        g.addColorStop(1, '#5d6a86');
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, 31, 0, Math.PI * 2);
        c.fill();
        // fasety — siatka poludnikow/rownoleznikow (elipsy = zludzenie kuli)
        c.strokeStyle = 'rgba(70,80,105,0.45)';
        c.lineWidth = 1.2;
        for (const rx of [10, 20, 28]) {
            c.beginPath();
            c.ellipse(0, 0, rx, 31, 0, 0, Math.PI * 2);
            c.stroke();
        }
        for (const ry of [10, 20, 28]) {
            c.beginPath();
            c.ellipse(0, 0, 31, ry, 0, 0, Math.PI * 2);
            c.stroke();
        }
        // rozblyski faset (kolorowe iskierki na kuli!)
        for (const [px, py, col] of [[-14, -8, '#ff7ce0'], [8, -16, '#7ef0f7'], [16, 6, '#ffe066'], [-4, 14, '#b39dff']] as const) {
            c.fillStyle = col;
            c.globalAlpha = 0.85;
            c.fillRect(px - 2.5, py - 2.5, 5, 5);
        }
        c.globalAlpha = 1;
        // zawieszka
        c.strokeStyle = '#8a93a5';
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(0, -31);
        c.lineTo(0, -36);
        c.stroke();
        c.restore();
    });
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}
