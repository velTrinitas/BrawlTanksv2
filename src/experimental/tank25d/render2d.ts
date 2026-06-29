// @ts-nocheck
/* =====================================================================================
 * render2d.ts - 2.5D tank + bullet render, PORTED 1:1 z showcase (full_showcase_v11_premium).
 * Faza 0 / Warstwa 1 (lab). Czysty render: ZERO importow gry, ZERO DOM (poza guard-owanym
 * patchem prototypu ponizej). @ts-nocheck celowo - to zweryfikowany JS, typowany luzno,
 * by gwarantowac czysta kompilacje pod `tsc` (build = tsc && vite build); inaczej heterogeniczne
 * configi brawlerow sypia TS2339 "property does not exist".
 * Render zweryfikowany PNG: 8 brawlerow x 4 katy, barrelBehind + cieniowanie OK.
 * rumble (idle jitter) WYLACZONY (T.rumble=false) - wymog laba.
 * ===================================================================================== */

  function hexToRgb(h){return{r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)};}
  function rgbToHex(r,g,b){const c=v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');return'#'+c(r)+c(g)+c(b);}
  function darken(h,f){const{r,g,b}=hexToRgb(h);return rgbToHex(r*f,g*f,b*f);}
  function lighten(h,f){const{r,g,b}=hexToRgb(h);return rgbToHex(r+(255-r)*f,g+(255-g)*f,b+(255-b)*f);}
  function derive(m){return{main:m,light:lighten(m,0.35),bright:lighten(m,0.55),dark:darken(m,0.6),deep:darken(m,0.35),outline:darken(m,0.3)};}
  function lerpColor(c1,c2,t){const r1=hexToRgb(c1),r2=hexToRgb(c2);return rgbToHex(r1.r+(r2.r-r1.r)*t,r1.g+(r2.g-r1.g)*t,r1.b+(r2.b-r1.b)*t);}
  function flashColors(c, intensity) { return { main:lerpColor(c.main,'#ffffff',intensity), light:lerpColor(c.light,'#ffffff',intensity), bright:lerpColor(c.bright,'#ffffff',intensity), dark:lerpColor(c.dark,'#ffffff',intensity*0.85), deep:lerpColor(c.deep,'#ffffff',intensity*0.85), outline:lerpColor(c.outline,'#ffffff',intensity*0.7) }; }

  // ============ TOGGLES ============
  const T = { recoil:true, hitflash:true, shake:true, popoff:true, chunky:true, rumble:false, pitch:true, treadmark:true, glare:true, rivets:true, rim:true, asym:true, spriteStack:true };

  // ============ FLAGS ============
  const FLAGS = ['PL','UA','DE','JP','GB','US','FR','IT'];
  function drawFlag(ctx, fId, w=9, h=9) {
    const x=-w/2, y=-h/2;
    if (fId==='PL'){ctx.fillStyle='#f5f5f5';ctx.fillRect(x,y,w,h/2);ctx.fillStyle='#d4213d';ctx.fillRect(x,y+h/2,w,h/2);}
    else if (fId==='UA'){ctx.fillStyle='#0057b7';ctx.fillRect(x,y,w,h/2);ctx.fillStyle='#ffd700';ctx.fillRect(x,y+h/2,w,h/2);}
    else if (fId==='DE'){ctx.fillStyle='#1a1a1a';ctx.fillRect(x,y,w,h/3);ctx.fillStyle='#dd0000';ctx.fillRect(x,y+h/3,w,h/3);ctx.fillStyle='#ffce00';ctx.fillRect(x,y+2*h/3,w,h/3);}
    else if (fId==='JP'){ctx.fillStyle='#f5f5f5';ctx.fillRect(x,y,w,h);ctx.fillStyle='#bc002d';ctx.beginPath();ctx.arc(0,0,h*0.3,0,Math.PI*2);ctx.fill();}
    else if (fId==='GB'){ctx.fillStyle='#012169';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#f5f5f5';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+h);ctx.moveTo(x+w,y);ctx.lineTo(x,y+h);ctx.stroke();ctx.fillStyle='#f5f5f5';ctx.fillRect(x+w*0.4,y,w*0.2,h);ctx.fillRect(x,y+h*0.4,w,h*0.2);ctx.fillStyle='#c8102e';ctx.fillRect(x+w*0.45,y,w*0.1,h);ctx.fillRect(x,y+h*0.45,w,h*0.1);}
    else if (fId==='US'){ctx.fillStyle='#bf0a30';ctx.fillRect(x,y,w,h);ctx.fillStyle='#f5f5f5';for(let i=1;i<6;i+=2)ctx.fillRect(x,y+i*h/7,w,h/7);ctx.fillStyle='#002868';ctx.fillRect(x,y,w*0.45,h*0.5);}
    else if (fId==='FR'){ctx.fillStyle='#0055a4';ctx.fillRect(x,y,w/3,h);ctx.fillStyle='#f5f5f5';ctx.fillRect(x+w/3,y,w/3,h);ctx.fillStyle='#ef4135';ctx.fillRect(x+2*w/3,y,w/3,h);}
    else if (fId==='IT'){ctx.fillStyle='#008c45';ctx.fillRect(x,y,w/3,h);ctx.fillStyle='#f5f5f5';ctx.fillRect(x+w/3,y,w/3,h);ctx.fillStyle='#cd212a';ctx.fillRect(x+2*w/3,y,w/3,h);}
    ctx.strokeStyle='rgba(20,10,30,0.6)';ctx.lineWidth=0.7;ctx.strokeRect(x,y,w,h);
  }

  // ============ BRAWLERS (with asymmetry codes) ============
  const BRAWLERS = [
    { id:'twardy', name:'Twardy', color:'#27ae60', hp:4, speed:5.0, dmg:1.0, reload:400, size:1.0, hullW:80, hullH:44, hullShape:'standard', turretRadius:20, turretShape:'chamfered_cube', barrelLen:30, muzzleDist:51, barrelType:'standard', emblem:'helmet', flag:'PL', asym:'crack', bullet:{type:'tracer',size:6,speed:420}, super:{type:'triple_burst',name:'Triple Burst'}, mudguard:'spare_track', exhaust:{color:'#1a1a1a', size:9, rate:200, count:2, sideY:0.42}, camoSpots:true, twinVisors:true },
    { id:'heavy', name:'Pancerny', color:'#8e44ad', hp:7, speed:3.5, dmg:1.5, reload:700, size:1.0, hullW:92, hullH:54, hullShape:'armored', turretRadius:26, turretShape:'heavy_octagon', barrelLen:22, muzzleDist:46, barrelType:'stubby', emblem:'shield', flag:'PL', asym:'patch_x', bullet:{type:'shell',size:6,speed:340}, super:{type:'mega_shell',name:'Mega Shell'}, mudguard:'heavy_armor', exhaust:{color:'#0f0816', size:11, rate:230, count:4, sideY:0.40} },
    { id:'scout', name:'Zwiad', color:'#f1c40f', hp:2, speed:7.5, dmg:0.8, reload:250, size:1.0, hullW:64, hullH:36, hullShape:'slim', turretRadius:16, turretShape:'low_oval', barrelLen:24, muzzleDist:44, barrelType:'thin', emblem:'scope', flag:'PL', asym:'bent_plate', bullet:{type:'quick',size:10,speed:560}, super:{type:'machine_gun',name:'Machine Gun'}, mudguard:'fuel_cans', exhaust:{color:'#a8c4d8', size:5, rate:160, count:1, sideY:0.0, rear:true} },
    { id:'sniper', name:'Snajper', color:'#3498db', hp:3, speed:4.5, dmg:3.0, reload:1000, size:1.0, hullW:78, hullH:38, hullShape:'slim', turretRadius:18, turretShape:'tall_rect', barrelLen:42, muzzleDist:62, barrelType:'long', emblem:'crosshair', flag:'PL', asym:'ricochet_mark', bullet:{type:'laser',size:28,speed:700}, super:{type:'piercing_laser',name:'Piercing Laser'}, mudguard:'bipod_scope', exhaust:{color:'#5a5a6a', size:4, rate:400, count:1, sideY:0.0, rear:true, silent:true} },
    { id:'plasma', name:'Tech', color:'#71B7F2', hp:4, speed:5.0, dmg:1.2, reload:500, size:1.0, hullW:80, hullH:46, hullShape:'tech', turretRadius:22, turretShape:'chamfered_cube_tech', barrelLen:42, muzzleDist:65, barrelType:'plasma', emblem:'chip', flag:'PL', asym:'led_blink', bullet:{type:'plasma',size:6,speed:380}, super:{type:'triple_shot',name:'Triple Shot'}, mudguard:'solar_panel', exhaust:{color:'#71B7F2', size:7, rate:180, count:2, sideY:0.0, rear:true, isCyan:true}, neonPulse:true, dishAntenna:true, techBarrelColor:true },
    { id:'pyro', name:'Ogniarz', color:'#b04a35', hp:5, speed:4.8, dmg:0.5, reload:210, size:1.0, hullW:86, hullH:52, hullShape:'wide', turretRadius:22, turretShape:'wide_cylinder', barrelLen:20, muzzleDist:38, barrelType:'spread', emblem:'flame', flag:'PL', asym:'soot_stain', bullet:{type:'flame',size:5,speed:300}, super:{type:'flame_cone',name:'Flame Cone'}, mudguard:'fuel_tanks_hazard', exhaust:{color:'#3a1a0a', size:9, rate:160, count:2, sideY:0.42, hasFlame:true} },
    { id:'shadow', name:'Shadow', color:'#5E587A', hp:3, speed:6.5, dmg:1.5, reload:600, size:1.0, hullW:76, hullH:42, hullShape:'angular', turretRadius:19, turretShape:'faceted_hex', barrelLen:28, muzzleDist:50, barrelType:'angular', emblem:'moon', flag:'PL', asym:'cracked_paint', bullet:{type:'shadow_bullet',size:4,speed:480}, super:{type:'teleport_shots',name:'Teleport Shots'}, mudguard:'stealth_plates', exhaust:{color:'#1a1525', size:4, rate:500, count:1, sideY:0.0, rear:true, isStealth:true} },
    { id:'king', name:'King', color:'#E02948', hp:5, speed:5.5, dmg:2.0, reload:500, size:1.0, hullW:84, hullH:48, hullShape:'royal', turretRadius:24, turretShape:'crowned_cylinder', barrelLen:32, muzzleDist:54, barrelType:'royal', emblem:'crown', flag:'PL', asym:'gold_pennant', bullet:{type:'gold',size:7.5,speed:400}, super:{type:'royal_cross',name:'Royal Cross'}, mudguard:'royal_trim', exhaust:{color:'#d8d0c0', size:7, rate:200, count:2, sideY:0.42, hasGoldSparks:true} },
  ];
  BRAWLERS.forEach(b => { b.colors = derive(b.color); });

  const GRUNT = { id:'grunt', name:'Grunt', color:'#a82828', hp:3, dmg:0.8, size:1.0, hullW:78, hullH:44, hullShape:'standard', turretRadius:20, turretShape:'chamfered_cube', barrelLen:28, muzzleDist:50, barrelType:'standard', emblem:'none', flag:null, asym:null, bullet:{type:'enemy_basic',size:6,speed:280} };
  GRUNT.colors = derive(GRUNT.color);
  const REGULAR_BOSS = { id:'boss_reg', name:'Boss', color:'#6a3093', hp:25, dmg:2.5, size:1.35, hullW:90, hullH:54, hullShape:'armored', turretRadius:26, turretShape:'heavy_octagon', barrelLen:22, muzzleDist:48, barrelType:'stubby', emblem:'skull', hasAmmoMagazine:true, flag:null, asym:null, bullet:{type:'boss_shell',size:7,speed:320} };
  REGULAR_BOSS.colors = derive(REGULAR_BOSS.color);
  const MEGA_BOSS = { id:'boss_mega', name:'Mega Boss', color:'#f1c40f', hp:60, dmg:5.0, size:1.36, hullW:100, hullH:58, hullShape:'monster', turretRadius:30, turretShape:'chamfered_cube_tech', barrelLen:42, muzzleDist:65, barrelType:'twin', emblem:'skull', hasYellowReflections:true, flag:null, asym:null, bullet:{type:'mega_shell',size:8,speed:300} };
  MEGA_BOSS.colors = derive(MEGA_BOSS.color);

  const CAMERA_TILT_Y = 0.866; const Z_TO_SCREEN = 0.78;
  function applyTransform(ctx, x, y, zE, rot, sc, tiltMul=1) {
    ctx.translate(x, y - zE * Z_TO_SCREEN);
    ctx.scale(1, CAMERA_TILT_Y * tiltMul);
    if (rot !== null) ctx.rotate(rot);
    if (sc !== 1.0) ctx.scale(sc, sc);
  }

  // ============ FIX #1: CONSTANT SCREEN-SPACE STROKE WIDTH ============
  // Global ctx.stroke() override that compensates lineWidth based on current transform scale.
  // Without this, strokes get squashed by CAMERA_TILT_Y making horizontal edges thinner than vertical = ugly pulsing outline.
  // After fix: lineWidth value represents intended screen-space pixel width, regardless of transform.
  // FIX #1 jako globalny patch prototypu. W LABIE (osobna strona) bezpieczne - jedyne strokey
  // Canvas2D na stronie to ten render czolgu. WARSTWA 2 (brawler w grze, ta sama strona): ZESCOPE'UJ
  // przez ustawienie ctx._lwCompDisable=true na obcych kontekstach gry (np. HUD canvas), inaczej
  // patch tknie ich obrysy. Guard idempotentny ponizej.
  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype._btLwPatched) {
    const _originalStroke = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function(...args) {
      if (this._lwCompDisable) { _originalStroke.apply(this, args); return; }
      // _lwBase: skala bazowa "1 jednostki" w device px (domyslnie 1). Lab ustawia = DPR,
      // dzieki czemu obrysy maja stala grubosc w CSS px (jak zweryfikowany PNG) ORAZ sa ostre
      // na retinie. Gra/Warstwa 2 nie ustawiaja _lwBase -> base=1 -> identyczne stare zachowanie.
      const base = this._lwBase || 1;
      const m = this.getTransform();
      const sx = Math.sqrt(m.a * m.a + m.b * m.b);
      const sy = Math.sqrt(m.c * m.c + m.d * m.d);
      const avgScale = Math.sqrt(sx * sy);
      if (avgScale > 0.01 && Math.abs(avgScale - base) > 0.01) {
        const orig = this.lineWidth;
        this.lineWidth = orig * base / avgScale;
        _originalStroke.apply(this, args);
        this.lineWidth = orig;
      } else {
        _originalStroke.apply(this, args);
      }
    };
    CanvasRenderingContext2D.prototype._btLwPatched = true;
  }
  function getMuzzlePos(o, ang, ni=0) {
    const md=o.brawler.muzzleDist, sz=o.brawler.size;
    let pe=0;
    if (o.brawler.barrelType==='spread') pe=[-6,0,6][ni%3];
    else if (o.brawler.barrelType==='twin') pe=ni===0?-8:8;
    const pa=ang+Math.PI/2;
    const recoilOff = T.recoil ? (o.recoil||0) * 8 * sz : 0;
    return { x:o.x+(md*sz-recoilOff)*Math.cos(ang)+pe*sz*Math.cos(pa), y:o.y+((md*sz-recoilOff)*Math.sin(ang)+pe*sz*Math.sin(pa))*CAMERA_TILT_Y-14*Z_TO_SCREEN*sz };
  }

  // ============ EXTRUDED SOLID (art director's solution for "floating top") ============
  // Builds a solid 3D bryla from a 2D path by stacking layers vertically.
  // Must be called INSIDE an active applyTransform context.
  // pathFunc must use ctx.beginPath() internally OR rely on caller's beginPath.
  // opts: { skipTop: boolean, skipBottomStroke: boolean, skipTopStroke: boolean }
  function drawExtrudedSolid(ctx, pathFunc, tx, ty, baseZ, rot, sc, tiltMul, colorSide, colorTop, colorOutline, zHeight, opts) {
    opts = opts || {};
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // CRITICAL FIX (rotation-safe extrusion): each layer is positioned by its Z height via its OWN
    // applyTransform call, so layers stack in SCREEN-VERTICAL direction regardless of `rot`. The
    // rotation only rotates the SHAPE (pathFunc), not the stacking direction.
    // OLD BUG: caller applied rotate() once, then we translate(0,-i*step) inside that rotated frame,
    // so the whole stack sheared/displaced at any angle != 0 (only looked correct pointing right).
    const layers = Math.max(1, Math.ceil(zHeight));
    const zStep = zHeight / layers;  // Z per layer; top layer lands exactly at baseZ + zHeight
    const colorBottom = opts.colorDeep || colorSide;

    for (let i = 0; i <= layers; i++) {
      ctx.save();
      applyTransform(ctx, tx, ty, baseZ + i * zStep, rot, sc, tiltMul);  // Z = screen-vertical stack
      const t = layers > 0 ? i / layers : 1;  // 0 at bottom, 1 at top
      let fc;
      if (i === layers && !opts.skipTop) {
        fc = colorTop;  // bright lid (only if caller doesn't draw top separately)
      } else {
        fc = lerpColor(colorBottom, colorSide, t);  // wall gradient: dark bottom -> light top
      }
      ctx.fillStyle = fc;
      ctx.beginPath(); pathFunc(); ctx.fill();
      ctx.restore();
    }

    // Silhouette outlines (also positioned by Z so they don't shear)
    if (!opts.skipBottomStroke) {
      ctx.save();
      applyTransform(ctx, tx, ty, baseZ, rot, sc, tiltMul);
      ctx.strokeStyle = colorOutline; ctx.lineWidth = 1.5;
      ctx.beginPath(); pathFunc(); ctx.stroke();  // base edge on hull
      ctx.restore();
    }
    if (!opts.skipTopStroke && !opts.skipTop) {
      ctx.save();
      applyTransform(ctx, tx, ty, baseZ + zHeight, rot, sc, tiltMul);
      ctx.strokeStyle = colorOutline; ctx.lineWidth = 1.5;
      ctx.beginPath(); pathFunc(); ctx.stroke();  // top edge
      ctx.restore();
    }
  }

  // ============ MUZZLE CYLINDER (art director's solution for "flat barrels") ============
  // Draws a barrel as a thick line - preserves cylindrical volume at any angle, no shearing.
  // (startX, startY) -> (endX, endY) define barrel axis.
  function drawMuzzleCylinder(ctx, startX, startY, endX, endY, thickness, colorSide, colorTop, colorOutline, noHole) {
    // 1. Dark outline (thickest)
    ctx.strokeStyle = colorOutline;
    ctx.lineWidth = thickness + 3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();

    // 2. Side (main body color)
    ctx.strokeStyle = colorSide;
    ctx.lineWidth = thickness;
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();

    // 3. Top highlight (lighter color, shifted up slightly = light catches top of cylinder)
    ctx.strokeStyle = colorTop;
    ctx.lineWidth = Math.max(1, thickness - 4);
    ctx.beginPath(); ctx.moveTo(startX, startY - 1.5); ctx.lineTo(endX, endY - 1.5); ctx.stroke();

    // 4. Muzzle opening (dark hole at end) - skipped for mid-barrel segments (noHole)
    if (!noHole) {
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(endX, endY, thickness * 0.25, thickness * 0.4, 0, 0, Math.PI*2); ctx.fill();
    }
  }

  // ============ SCREEN SHAKE ============
  let shake = { time: 0, magnitude: 0 };
  function triggerScreenShake(duration, magnitude) {
    if (!T.shake) return;
    if (duration > shake.time) shake.time = duration;
    if (magnitude > shake.magnitude) shake.magnitude = magnitude;
  }

  // ============ DROP SHADOW ============
  function drawDropShadow(ctx, x, y, brawler, isSuperShot, hullAngle = 0) {
    const sz = brawler.size;
    if (isSuperShot) {
      ctx.save(); ctx.translate(x, y+8);
      ctx.scale(1, CAMERA_TILT_Y);
      ctx.fillStyle='rgba(217,70,239,0.35)';
      ctx.beginPath(); ctx.ellipse(0,0,70*sz,22*sz/CAMERA_TILT_Y,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    if (brawler.id==='boss_mega') {
      const p = 0.6+Math.sin(performance.now()*0.004)*0.4;
      ctx.save(); ctx.translate(x, y+8);
      ctx.scale(1, CAMERA_TILT_Y);
      ctx.fillStyle=`rgba(241,196,15,${0.25+p*0.15})`;
      ctx.beginPath(); ctx.ellipse(0,0,100*sz,32*sz/CAMERA_TILT_Y,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=`rgba(255,230,100,${0.1+p*0.1})`;
      ctx.beginPath(); ctx.ellipse(0,0,75*sz,24*sz/CAMERA_TILT_Y,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    // FIX #4: Shadow rotates WITH hullAngle (was static ellipse before)
    ctx.save();
    ctx.translate(x+5*sz, y+12*sz);
    ctx.scale(1, CAMERA_TILT_Y);   // camera tilt compression
    ctx.rotate(hullAngle);          // rotate with hull
    ctx.fillStyle='rgba(20,10,30,0.34)';
    // Use roundRect matching hull shape (rotated correctly now)
    const w = brawler.hullW * sz * 1.05;
    const h = brawler.hullH * sz * 1.1;
    ctx.beginPath();
    ctx.roundRect(-w/2, -h/2, w, h, Math.min(w, h) * 0.25);
    ctx.fill();
    ctx.restore();
  }

  function drawHullPath(ctx, shape, w, h) {
    const hx=w/2, hy=h/2;
    ctx.beginPath();
    // Bigger corner radii per art director (chunky toy aesthetic, no sharp 90° angles)
    if (shape==='angular') { const c=12; ctx.moveTo(-hx+c,-hy);ctx.lineTo(hx-c,-hy);ctx.quadraticCurveTo(hx,-hy,hx,-hy+c);ctx.lineTo(hx,hy-c);ctx.quadraticCurveTo(hx,hy,hx-c,hy);ctx.lineTo(-hx+c,hy);ctx.quadraticCurveTo(-hx,hy,-hx,hy-c);ctx.lineTo(-hx,-hy+c);ctx.quadraticCurveTo(-hx,-hy,-hx+c,-hy);ctx.closePath(); }
    else if (shape==='monster') { ctx.moveTo(-hx+8,-hy);ctx.lineTo(hx-5,-hy);ctx.quadraticCurveTo(hx,-hy,hx,-hy+8);ctx.lineTo(hx,hy-8);ctx.quadraticCurveTo(hx,hy,hx-5,hy);ctx.lineTo(-hx+8,hy);ctx.quadraticCurveTo(-hx-6,0,-hx+8,-hy);ctx.closePath(); }
    else { ctx.roundRect(-hx,-hy,w,h,13); }  // 7 -> 13 (chunky toy)
  }

  // ============ ENHANCED TREADS (with animated links + sprockets) ============
  function drawTreadsAndHullSide(ctx, brawler, isSuperShot, treadShift, colors) {
    const c = colors || brawler.colors;
    const w = brawler.hullW, h = brawler.hullH;
    const treadW = w + 10, treadOff = h/2 + 4, treadH = 14, innerTreadH = 11;
    const ts = treadShift || 0;
    for (const side of [-1, 1]) {
      const ty = side * treadOff;
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath(); ctx.roundRect(-treadW/2+1, ty-treadH/2+2, treadW, treadH, 4); ctx.fill();
      ctx.fillStyle = '#08040e';
      ctx.beginPath(); ctx.roundRect(-treadW/2, ty-treadH/2, treadW, treadH, 4); ctx.fill();
      ctx.fillStyle = '#1c1330';
      ctx.beginPath(); ctx.roundRect(-treadW/2+1.5, ty-innerTreadH/2, treadW-3, innerTreadH, 3); ctx.fill();
      const linkSpacing = 5, linkW = 3.2, linkH = innerTreadH - 2;
      const shift = ((-ts % linkSpacing) + linkSpacing) % linkSpacing;
      for (let x = -treadW/2+6+shift-linkSpacing; x < treadW/2-8; x += linkSpacing) {
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.roundRect(x+0.4, ty-linkH/2+0.4, linkW, linkH, 0.8); ctx.fill();
        ctx.fillStyle = '#3a2a4d';
        ctx.beginPath(); ctx.roundRect(x, ty-linkH/2, linkW, linkH, 0.8); ctx.fill();
        ctx.fillStyle = '#5a4a6d';
        ctx.beginPath(); ctx.roundRect(x, ty-linkH/2, linkW, 1.2, 0.4); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(150,120,180,0.28)';
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(-treadW/2+5, ty-treadH/2+1); ctx.lineTo(treadW/2-5, ty-treadH/2+1); ctx.stroke();
    }
    const sprocketX = treadW/2 - 4; const sprocketRot = ts * 0.18;
    for (const side of [-1, 1]) {
      const ty = side * treadOff;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(sprocketX+1, ty+1, 5.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#5a4a6c'; ctx.beginPath(); ctx.arc(sprocketX, ty, 5, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#08040e'; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.fillStyle = '#2a1f3d';
      for (let t=0; t<8; t++) {
        const a = (t/8)*Math.PI*2 + sprocketRot;
        const ttx = sprocketX + Math.cos(a)*5.8, tty = ty + Math.sin(a)*5.8;
        ctx.beginPath();
        ctx.moveTo(sprocketX + Math.cos(a)*4, ty + Math.sin(a)*4);
        ctx.lineTo(ttx + Math.cos(a+0.15)*0.6, tty + Math.sin(a+0.15)*0.6);
        ctx.lineTo(ttx + Math.cos(a-0.15)*0.6, tty + Math.sin(a-0.15)*0.6);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#7a6a8c'; ctx.beginPath(); ctx.arc(sprocketX, ty, 2.5, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#2a1f3d'; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.fillStyle = '#2a1f3d'; ctx.beginPath(); ctx.arc(sprocketX, ty, 0.9, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#2a1f3d'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(sprocketX+Math.cos(sprocketRot)*2.2, ty+Math.sin(sprocketRot)*2.2); ctx.lineTo(sprocketX-Math.cos(sprocketRot)*2.2, ty-Math.sin(sprocketRot)*2.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sprocketX+Math.cos(sprocketRot+Math.PI/2)*2.2, ty+Math.sin(sprocketRot+Math.PI/2)*2.2); ctx.lineTo(sprocketX-Math.cos(sprocketRot+Math.PI/2)*2.2, ty-Math.sin(sprocketRot+Math.PI/2)*2.2); ctx.stroke();
    }
    const idlerX = -treadW/2 + 4; const idlerRot = ts * 0.22;
    for (const side of [-1, 1]) {
      const ty = side * treadOff;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(idlerX+1, ty+1, 4.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#5a4a6c'; ctx.beginPath(); ctx.arc(idlerX, ty, 4.2, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#08040e'; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.fillStyle = '#3a2a4d'; ctx.beginPath(); ctx.arc(idlerX, ty, 3.2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#7a6a8c'; ctx.beginPath(); ctx.arc(idlerX, ty, 1.8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2a1f3d'; ctx.beginPath(); ctx.arc(idlerX, ty, 0.7, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#2a1f3d'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(idlerX+Math.cos(idlerRot)*2.8, ty+Math.sin(idlerRot)*2.8); ctx.lineTo(idlerX-Math.cos(idlerRot)*2.8, ty-Math.sin(idlerRot)*2.8); ctx.stroke();
    }
    ctx.fillStyle = isSuperShot ? lighten(c.dark, 0.2) : c.dark;
    drawHullPath(ctx, brawler.hullShape, w, h); ctx.fill();
    ctx.strokeStyle = c.outline; ctx.lineWidth = 1.5; ctx.stroke();

    // NEW: Mudguard equipment per brawler (drawn on top of treads, sits above tread, below hull top)
    drawMudguardEquipment(ctx, brawler, c);
  }

  // ============ MUDGUARD EQUIPMENT (per brawler unique gear on fenders) ============
  function drawMudguardEquipment(ctx, brawler, c) {
    if (!brawler.mudguard) return;
    const w = brawler.hullW, h = brawler.hullH;
    const hx = w/2;
    const fenderY = h/2 + 5; // slightly lower to be more visible
    const fenderH = 11;      // was 8 - taller fenders, more visible equipment surface
    const mg = brawler.mudguard;
    const FULL = w * 0.96;   // default full-length fender for all brawlers

    // Helper: draw a fender base plate on a side
    const fenderBase = (side, length, offsetX = 0) => {
      const ty = side * fenderY;
      ctx.fillStyle = c.deep;
      ctx.beginPath(); ctx.roundRect(-length/2 + offsetX, ty - fenderH/2, length, fenderH, 2); ctx.fill();
      ctx.strokeStyle = c.outline; ctx.lineWidth = 0.7; ctx.stroke();
      // Top edge highlight (catches light)
      ctx.fillStyle = c.dark;
      ctx.fillRect(-length/2 + offsetX + 1, ty - fenderH/2 + 0.5, length - 2, 1);
    };

    if (mg === 'spare_track') {
      // Twardy: spare track segment on right fender
      fenderBase(1, FULL, 0);
      // Track links rendering (compact)
      const startX = -w*0.05, endX = hx*0.55;
      ctx.fillStyle = '#1a1525';
      for (let x = startX; x < endX; x += 3.5) {
        ctx.beginPath(); ctx.roundRect(x, fenderY - 2.5, 3, 5, 0.6); ctx.fill();
      }
      ctx.strokeStyle = c.outline; ctx.lineWidth = 0.4;
      ctx.strokeRect(startX-0.5, fenderY - 3, endX-startX+1, 6);
      // Left fender: 3 ammo boxes
      fenderBase(-1, FULL, 0);
      ctx.fillStyle = '#2a3a1a';
      [-hx*0.35, -hx*0.1, hx*0.15].forEach(bx => {
        ctx.beginPath(); ctx.roundRect(bx-5, -fenderY-2.5, 9, 5, 0.8); ctx.fill();
        ctx.strokeStyle = '#1a2a0a'; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.fillStyle = '#1a2a0a'; ctx.fillRect(bx-4, -fenderY-1, 7, 0.8);
        ctx.fillStyle = '#2a3a1a';
      });
    }
    else if (mg === 'heavy_armor') {
      // Pancerny: thick segmented armor plates on both fenders
      for (const side of [-1, 1]) {
        const ty = side * fenderY;
        ctx.fillStyle = c.deep;
        ctx.beginPath(); ctx.roundRect(-hx + 3, ty - 5, w - 6, 10, 1.5); ctx.fill();
        ctx.strokeStyle = c.outline; ctx.lineWidth = 0.7; ctx.stroke();
        // Segment lines (3 thick segments)
        ctx.fillStyle = c.outline;
        [-hx*0.45, -hx*0.05, hx*0.35].forEach(sx => ctx.fillRect(sx-0.6, ty - 5, 1.2, 10));
        // Bolts on each segment
        ctx.fillStyle = '#1a0820';
        [-hx*0.7, -hx*0.25, hx*0.15, hx*0.55].forEach(bx => {
          ctx.beginPath(); ctx.arc(bx, ty - 2.5, 0.9, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(bx, ty + 2.5, 0.9, 0, Math.PI*2); ctx.fill();
        });
      }
    }
    else if (mg === 'fuel_cans') {
      // Zwiad: 2 small fuel canisters on right fender
      fenderBase(1, FULL, 0);
      for (let i=0;i<2;i++){
        const cx = hx*0.1 + i*9;
        ctx.fillStyle = '#c41818'; // red can
        ctx.beginPath(); ctx.roundRect(cx-3, fenderY-3, 6, 6, 0.6); ctx.fill();
        ctx.strokeStyle = '#5a0a0a'; ctx.lineWidth = 0.4; ctx.stroke();
        ctx.fillStyle = '#5a0a0a'; ctx.fillRect(cx-1, fenderY-3.6, 2, 1.2); // cap
      }
      // Left: rollcage tube (light scout look)
      fenderBase(-1, FULL, 0);
      ctx.strokeStyle = c.outline; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-hx*0.55, -fenderY); ctx.lineTo(hx*0.55, -fenderY); ctx.stroke();
      ctx.fillStyle = c.outline;
      [-hx*0.4, -hx*0.1, hx*0.2, hx*0.5].forEach(bx => { ctx.beginPath(); ctx.arc(bx, -fenderY, 1, 0, Math.PI*2); ctx.fill(); });
    }
    else if (mg === 'bipod_scope') {
      // Sniper: bipod folded + scope toolbox
      fenderBase(1, FULL, 0);
      // Bipod legs folded back
      ctx.strokeStyle = c.outline; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-hx*0.15, fenderY-1); ctx.lineTo(hx*0.35, fenderY-3.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-hx*0.15, fenderY+1); ctx.lineTo(hx*0.35, fenderY+3.5); ctx.stroke();
      // Hinge dot
      ctx.fillStyle = c.outline;
      ctx.beginPath(); ctx.arc(-hx*0.15, fenderY, 1.2, 0, Math.PI*2); ctx.fill();
      // Left: toolbox
      fenderBase(-1, FULL, 0);
      ctx.fillStyle = c.deep;
      ctx.beginPath(); ctx.roundRect(-hx*0.45, -fenderY-3, 14, 6, 1); ctx.fill();
      ctx.strokeStyle = c.outline; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.fillStyle = c.outline; ctx.fillRect(-hx*0.35, -fenderY-1.5, 4, 0.8); // hinges/latch
      ctx.fillRect(-hx*0.2, -fenderY-1.5, 4, 0.8);
    }
    else if (mg === 'solar_panel') {
      // Tech: solar panel grid on both fenders
      for (const side of [-1, 1]) {
        const ty = side * fenderY;
        ctx.fillStyle = '#1a3a5a';
        ctx.beginPath(); ctx.roundRect(-hx + 5, ty - 4, w - 10, 8, 1); ctx.fill();
        ctx.strokeStyle = '#0a1525'; ctx.lineWidth = 0.6; ctx.stroke();
        // Solar cell grid
        const cellW = (w - 10) / 6;
        for (let i = 0; i < 6; i++) {
          const cx = -hx + 5 + i * cellW;
          ctx.fillStyle = i % 2 === 0 ? '#2a5a8a' : '#3a7aaa';
          ctx.fillRect(cx + 0.5, ty - 3.5, cellW - 1, 7);
          // Center line
          ctx.fillStyle = '#0a1525';
          ctx.fillRect(cx + cellW/2 - 0.3, ty - 3.5, 0.6, 7);
        }
        // Cyan glow border (subtle, animated subtle)
        const techPulse = 0.5 + Math.sin(performance.now() * 0.005) * 0.5;
        ctx.strokeStyle = `rgba(0, 220, 255, ${0.3 + techPulse*0.3})`;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-hx + 5, ty - 4, w - 10, 8);
      }
    }
    else if (mg === 'fuel_tanks_hazard') {
      // Ogniarz: fuel tanks with hazard stripes on both fenders - full length
      for (const side of [-1, 1]) {
        const ty = side * fenderY;
        // Cylindrical tank (full length)
        ctx.fillStyle = '#2a1a0a';
        ctx.beginPath(); ctx.roundRect(-hx + 3, ty - 5, w - 6, 11, 4); ctx.fill();
        ctx.strokeStyle = '#1a0500'; ctx.lineWidth = 0.8; ctx.stroke();
        // Hazard stripes (yellow base + black diagonal slashes)
        ctx.fillStyle = '#f4c842';
        ctx.beginPath(); ctx.roundRect(-hx + 3, ty - 5, w - 6, 11, 4); ctx.fill();
        ctx.fillStyle = '#1a0500';
        for (let x = -hx + 3; x < hx - 3; x += 5) {
          ctx.beginPath();
          ctx.moveTo(x, ty - 5); ctx.lineTo(x + 2.5, ty - 5);
          ctx.lineTo(x + 5, ty + 6); ctx.lineTo(x + 2.5, ty + 6); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = '#1a0500'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.roundRect(-hx + 3, ty - 5, w - 6, 11, 4); ctx.stroke();
        // Two caps (front + rear)
        [-hx*0.65, hx*0.65].forEach(cx => {
          ctx.fillStyle = '#3a1a0a';
          ctx.beginPath(); ctx.arc(cx, ty, 2.6, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#1a0500'; ctx.beginPath(); ctx.arc(cx, ty, 0.8, 0, Math.PI*2); ctx.fill();
        });
      }
    }
    else if (mg === 'stealth_plates') {
      // Shadow: angular matte black stealth plates
      for (const side of [-1, 1]) {
        const ty = side * fenderY;
        ctx.fillStyle = '#15101e';
        ctx.beginPath();
        ctx.moveTo(-hx + 3, ty - 3);
        ctx.lineTo(-hx + 13, ty - 5);
        ctx.lineTo(hx - 13, ty - 5);
        ctx.lineTo(hx - 3, ty - 3);
        ctx.lineTo(hx - 3, ty + 3);
        ctx.lineTo(hx - 13, ty + 5);
        ctx.lineTo(-hx + 13, ty + 5);
        ctx.lineTo(-hx + 3, ty + 3);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#05000a'; ctx.lineWidth = 0.5; ctx.stroke();
        // Subtle matte highlight
        ctx.fillStyle = 'rgba(80, 70, 100, 0.25)';
        ctx.fillRect(-hx + 8, ty - 4, w - 16, 1.2);
      }
    }
    else if (mg === 'royal_trim') {
      // King: gold trim + pennants
      for (const side of [-1, 1]) {
        const ty = side * fenderY;
        ctx.fillStyle = c.deep;
        ctx.beginPath(); ctx.roundRect(-hx + 3, ty - 4, w - 6, 8, 1.5); ctx.fill();
        ctx.strokeStyle = c.outline; ctx.lineWidth = 0.6; ctx.stroke();
        // Gold trim along top edge
        ctx.fillStyle = '#f4c842';
        ctx.fillRect(-hx + 4, ty - 4, w - 8, 1.5);
        // Gold studs
        ctx.fillStyle = '#8b6914';
        [-hx*0.6, -hx*0.2, hx*0.2, hx*0.6].forEach(sx => {
          ctx.beginPath(); ctx.arc(sx, ty, 1.4, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#f4c842';
          ctx.beginPath(); ctx.arc(sx-0.3, ty-0.3, 0.7, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#8b6914';
        });
        // Bottom red bar (royal accent)
        ctx.fillStyle = '#d4213d';
        ctx.fillRect(-hx + 4, ty + 2.5, w - 8, 1.2);
      }
    }
  }

  // ============ EXHAUST PIPES (unique physical pipe shapes per brawler) ============
  function drawExhaustPipes(ctx, brawler, c) {
    const w = brawler.hullW, h = brawler.hullH;
    const hx = w/2, hy = h/2;
    const id = brawler.id;
    const now = performance.now();

    if (id === 'twardy') {
      // 2 short fat military cylindrical pipes near rear corners, side-mounted
      for (const side of [-1, 1]) {
        const ty = side * (hy + 1);
        const px = -hx + 9;
        // Bracket
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.roundRect(px - 7, ty - 4, 14, 8, 1); ctx.fill();
        ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 0.6; ctx.stroke();
        // Pipe body (cylinder)
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath(); ctx.ellipse(px - 9, ty, 5, 4, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 0.7; ctx.stroke();
        // Pipe opening (dark inner)
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(px - 9, ty, 3, 2.5, 0, 0, Math.PI*2); ctx.fill();
        // Rust spots
        ctx.fillStyle = 'rgba(120, 60, 20, 0.6)';
        ctx.beginPath(); ctx.arc(px - 3, ty - 1.5, 1.2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(px + 4, ty + 1, 0.8, 0, Math.PI*2); ctx.fill();
      }
    }
    else if (id === 'heavy') {
      // 4 thick vertical smokestacks at rear (heavy diesel)
      const stacksX = -hx + 6;
      [-hy*0.7, -hy*0.25, hy*0.25, hy*0.7].forEach(sy => {
        // Stack base (cylinder)
        ctx.fillStyle = '#1a1015';
        ctx.beginPath(); ctx.roundRect(stacksX - 4, sy - 3.5, 9, 7, 1.5); ctx.fill();
        ctx.strokeStyle = '#0a0510'; ctx.lineWidth = 0.6; ctx.stroke();
        // Stack opening
        ctx.fillStyle = '#0a0008';
        ctx.beginPath(); ctx.ellipse(stacksX - 4, sy, 1.5, 2.5, 0, 0, Math.PI*2); ctx.fill();
        // Ring/band
        ctx.strokeStyle = '#3a2a40'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(stacksX - 3, sy - 1); ctx.lineTo(stacksX + 4, sy - 1); ctx.stroke();
      });
    }
    else if (id === 'scout') {
      // 1 thin sport chrome exhaust pipe at rear center with muffler
      const ty = 0;
      const px = -hx;
      // Muffler can
      ctx.fillStyle = '#9aa5b8';
      ctx.beginPath(); ctx.roundRect(px + 1, ty - 3, 12, 6, 2.5); ctx.fill();
      ctx.strokeStyle = '#5a6578'; ctx.lineWidth = 0.7; ctx.stroke();
      // Chrome highlight
      ctx.fillStyle = '#d4dce8';
      ctx.fillRect(px + 2, ty - 2.5, 10, 1.5);
      // Pipe extension
      ctx.fillStyle = '#7a8598';
      ctx.beginPath(); ctx.ellipse(px - 3, ty, 4, 2.5, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#3a4558'; ctx.lineWidth = 0.6; ctx.stroke();
      // Hot blue tint at opening
      ctx.fillStyle = '#3a5878';
      ctx.beginPath(); ctx.ellipse(px - 3, ty, 2, 1.5, 0, 0, Math.PI*2); ctx.fill();
    }
    else if (id === 'sniper') {
      // 1 wide silent muffler/suppressor at rear (long cylinder with baffles)
      const ty = 0;
      const px = -hx;
      // Suppressor body
      ctx.fillStyle = '#3a4555';
      ctx.beginPath(); ctx.roundRect(px - 4, ty - 4, 18, 8, 3); ctx.fill();
      ctx.strokeStyle = '#1a2535'; ctx.lineWidth = 0.7; ctx.stroke();
      // Baffles (4 vertical lines)
      ctx.strokeStyle = '#1a2535'; ctx.lineWidth = 0.6;
      [px + 1, px + 4, px + 7, px + 10].forEach(bx => {
        ctx.beginPath(); ctx.moveTo(bx, ty - 3.5); ctx.lineTo(bx, ty + 3.5); ctx.stroke();
      });
      // Output opening (small)
      ctx.fillStyle = '#0a1525';
      ctx.beginPath(); ctx.ellipse(px - 3, ty, 1.4, 1.6, 0, 0, Math.PI*2); ctx.fill();
    }
    else if (id === 'plasma') {
      // 2 vertical cyan-glowing energy vents at rear
      const pulse = 0.55 + Math.sin(now * 0.006) * 0.45;
      for (const sy of [-hy*0.45, hy*0.45]) {
        const px = -hx + 4;
        // Housing
        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath(); ctx.roundRect(px - 4, sy - 5, 10, 10, 1); ctx.fill();
        ctx.strokeStyle = '#0a1525'; ctx.lineWidth = 0.6; ctx.stroke();
        // Inner glow
        ctx.shadowBlur = 6 * pulse;
        ctx.shadowColor = '#00d4ff';
        ctx.fillStyle = `rgba(0, 220, 255, ${0.5 + pulse*0.4})`;
        ctx.fillRect(px - 2.5, sy - 4, 7, 8);
        ctx.shadowBlur = 0;
        // Center bright slit
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.6 + pulse * 0.4;
        ctx.fillRect(px - 1, sy - 3.5, 4, 7);
        ctx.globalAlpha = 1;
        // Frame lines
        ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(px - 2.5, sy - 1); ctx.lineTo(px + 4.5, sy - 1);
        ctx.moveTo(px - 2.5, sy + 1); ctx.lineTo(px + 4.5, sy + 1);
        ctx.stroke();
      }
    }
    else if (id === 'pyro') {
      // 2 short fat angry pipes with afterburn glow ring (side-mounted)
      for (const side of [-1, 1]) {
        const ty = side * (hy + 1);
        const px = -hx + 7;
        // Heat shield bracket
        ctx.fillStyle = '#2a1510';
        ctx.beginPath(); ctx.roundRect(px - 8, ty - 5, 16, 10, 2); ctx.fill();
        ctx.strokeStyle = '#1a0808'; ctx.lineWidth = 0.7; ctx.stroke();
        // Pipe body
        ctx.fillStyle = '#3a2015';
        ctx.beginPath(); ctx.ellipse(px - 10, ty, 5.5, 4.5, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#1a0808'; ctx.lineWidth = 0.7; ctx.stroke();
        // Hot red glow ring (afterburn)
        const flamePulse = 0.7 + Math.sin(now * 0.012 + ty) * 0.3;
        ctx.shadowBlur = 5 * flamePulse;
        ctx.shadowColor = '#ff5520';
        ctx.fillStyle = `rgba(255, 100, 30, ${0.6 + flamePulse * 0.3})`;
        ctx.beginPath(); ctx.ellipse(px - 10, ty, 3.5, 2.8, 0, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        // Bright inner
        ctx.fillStyle = '#ffe070';
        ctx.beginPath(); ctx.ellipse(px - 10, ty, 1.5, 1.2, 0, 0, Math.PI*2); ctx.fill();
      }
    }
    else if (id === 'shadow') {
      // Hidden flush vent - subtle horizontal slit, barely visible (stealth)
      const ty = 0;
      const px = -hx;
      ctx.fillStyle = '#0a050f';
      ctx.beginPath(); ctx.roundRect(px - 1, ty - 1, 9, 2, 0.5); ctx.fill();
      // Second slit
      ctx.beginPath(); ctx.roundRect(px - 1, ty - 4, 9, 1.5, 0.5); ctx.fill();
      ctx.beginPath(); ctx.roundRect(px - 1, ty + 2.5, 9, 1.5, 0.5); ctx.fill();
      // Subtle violet outline glow
      ctx.strokeStyle = 'rgba(94, 88, 122, 0.35)';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.roundRect(px - 1, ty - 1, 9, 2, 0.5); ctx.stroke();
    }
    else if (id === 'king') {
      // 2 elegant chrome pipes with gold ring (royal style)
      for (const side of [-1, 1]) {
        const ty = side * (hy + 1);
        const px = -hx + 7;
        // Chrome pipe body
        ctx.fillStyle = '#b8c4d0';
        ctx.beginPath(); ctx.roundRect(px - 9, ty - 4, 16, 8, 3); ctx.fill();
        ctx.strokeStyle = '#5a6478'; ctx.lineWidth = 0.7; ctx.stroke();
        // Chrome highlight
        ctx.fillStyle = '#e8eef4';
        ctx.fillRect(px - 8, ty - 3.5, 14, 1.5);
        // Gold ring (base)
        ctx.fillStyle = '#f4c842';
        ctx.beginPath(); ctx.roundRect(px - 1, ty - 4.5, 3, 9, 1); ctx.fill();
        ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 0.5; ctx.stroke();
        // Pipe opening
        ctx.fillStyle = '#2a3545';
        ctx.beginPath(); ctx.ellipse(px - 9, ty, 2.5, 3, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#0a1525';
        ctx.beginPath(); ctx.ellipse(px - 9, ty, 1.4, 1.8, 0, 0, Math.PI*2); ctx.fill();
      }
    }
  }


  // ============ HULL CUSTOMIZATION (per-brawler unique hull features) ============
  function drawHullCustomization(ctx, brawler, c, isSuperShot) {
    const w = brawler.hullW, h = brawler.hullH;
    const hx = w/2, hy = h/2;
    const id = brawler.id;
    const now = performance.now();

    if (id === 'twardy') {
      // Twardy: chamfered front armor plates (V-shape angled plates)
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.moveTo(hx - 4, -hy + 2); ctx.lineTo(hx - 4, hy - 2);
      ctx.lineTo(hx - 14, hy - 6); ctx.lineTo(hx - 18, 0); ctx.lineTo(hx - 14, -hy + 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c.outline; ctx.lineWidth = 0.7; ctx.stroke();
      // Rivets along the V
      ctx.fillStyle = '#0a200a';
      [[hx - 14, -hy + 6], [hx - 18, 0], [hx - 14, hy - 6]].forEach(([rx, ry]) => {
        ctx.beginPath(); ctx.arc(rx, ry, 1.1, 0, Math.PI*2); ctx.fill();
      });
      // Front headlight (military lamp)
      ctx.fillStyle = '#e0d090';
      ctx.beginPath(); ctx.ellipse(hx - 6, 0, 1.8, 2.5, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#1a2a0a'; ctx.lineWidth = 0.5; ctx.stroke();
    }

    if (id === 'heavy') {
      // PANCERNY: front BULLDOZER PLATE (lemiesz) - massive ramming blade
      const bladeFront = hx + 4;
      const bladeMid = hx - 2;
      ctx.fillStyle = '#3a2540';
      ctx.beginPath();
      // Trapezoid: narrower at outer (front-most), wider at hull attachment
      ctx.moveTo(bladeFront, -hy * 0.65);
      ctx.lineTo(bladeMid, -hy * 0.95);
      ctx.lineTo(bladeMid, hy * 0.95);
      ctx.lineTo(bladeFront, hy * 0.65);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1a0a20'; ctx.lineWidth = 1; ctx.stroke();
      // Battle scratches and dents
      ctx.strokeStyle = '#1a0a20'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(bladeMid + 1, -hy * 0.5); ctx.lineTo(bladeFront - 1, -hy * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bladeMid + 1, hy * 0.4); ctx.lineTo(bladeFront - 1, hy * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bladeMid + 1.5, -hy * 0.1); ctx.lineTo(bladeFront - 1, hy * 0.05); ctx.stroke();
      // Heavy mounting bolts at attachment points
      ctx.fillStyle = '#1a0a20';
      [-hy * 0.75, -hy * 0.35, 0, hy * 0.35, hy * 0.75].forEach(by => {
        ctx.beginPath(); ctx.arc(bladeMid - 0.5, by, 1.4, 0, Math.PI*2); ctx.fill();
      });
      // Bottom edge sharpened look (light strip)
      ctx.fillStyle = c.light;
      ctx.beginPath();
      ctx.moveTo(bladeFront - 1, -hy * 0.6); ctx.lineTo(bladeFront, -hy * 0.65);
      ctx.lineTo(bladeFront, hy * 0.65); ctx.lineTo(bladeFront - 1, hy * 0.6);
      ctx.closePath(); ctx.fill();
    }

    if (id === 'scout') {
      // ZWIAD: arrow nose + racing stripes + hover canopy
      // Racing stripes (yellow on top of hull)
      ctx.fillStyle = '#1a1505';
      ctx.fillRect(-hx*0.7, -hy*0.35, w*0.85, 1.5);
      ctx.fillRect(-hx*0.7, hy*0.35 - 1.5, w*0.85, 1.5);
      // Pointed nose accent (arrow tip emphasis)
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.moveTo(hx - 3, -hy*0.4);
      ctx.lineTo(hx + 2, 0);
      ctx.lineTo(hx - 3, hy*0.4);
      ctx.lineTo(hx - 8, hy*0.25);
      ctx.lineTo(hx - 11, 0);
      ctx.lineTo(hx - 8, -hy*0.25);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c.outline; ctx.lineWidth = 0.6; ctx.stroke();
      // Hover indicator vents (3 small slots underside, visible from top edge)
      ctx.fillStyle = 'rgba(255, 200, 0, 0.6)';
      const hoverPulse = 0.6 + Math.sin(now * 0.008) * 0.4;
      ctx.shadowBlur = 3 * hoverPulse;
      ctx.shadowColor = '#ffe066';
      [-hx*0.4, 0, hx*0.4].forEach(vx => {
        ctx.fillRect(vx - 2, -hy + 1, 4, 1);
        ctx.fillRect(vx - 2, hy - 2, 4, 1);
      });
      ctx.shadowBlur = 0;
    }

    if (id === 'sniper') {
      // SNAJPER: stabilizer outriggers on the sides (deployed hydraulic legs)
      ctx.fillStyle = c.dark;
      for (const side of [-1, 1]) {
        const ty = side * hy;
        // Outrigger arm (extends slightly outward from hull)
        ctx.beginPath();
        ctx.moveTo(-hx + 8, ty);
        ctx.lineTo(-hx + 4, ty + side * 4);
        ctx.lineTo(-hx + 14, ty + side * 4);
        ctx.lineTo(-hx + 18, ty);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = c.outline; ctx.lineWidth = 0.7; ctx.stroke();
        // Hydraulic piston joint
        ctx.fillStyle = '#1a2535';
        ctx.beginPath(); ctx.arc(-hx + 11, ty + side * 3, 1.5, 0, Math.PI*2); ctx.fill();
        // Mid hull longitudinal "catamaran" line (twin hull suggestion)
        ctx.fillStyle = '#0a1525';
        ctx.fillRect(-hx*0.8, side*hy*0.3 - 0.5, w*0.85, 0.9);
        ctx.fillStyle = c.dark;
      }
      // Scope mount on top front
      ctx.fillStyle = '#1a2535';
      ctx.beginPath(); ctx.roundRect(hx - 16, -2, 5, 4, 0.5); ctx.fill();
      ctx.fillStyle = '#5a8aba';
      ctx.beginPath(); ctx.arc(hx - 12, 0, 1.2, 0, Math.PI*2); ctx.fill();
    }

    if (id === 'plasma') {
      // TECH: floating panel separation gaps + magnetic field arcs
      // Panel separation dark lines (suggest hull is segmented)
      ctx.strokeStyle = 'rgba(0, 0, 30, 0.65)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-hx*0.4, -hy + 4); ctx.lineTo(-hx*0.4, hy - 4);
      ctx.moveTo(hx*0.25, -hy + 4); ctx.lineTo(hx*0.25, hy - 4);
      ctx.stroke();
      // Magnetic field arc bridge between gaps (cyan electric)
      const arcPulse = Math.sin(now * 0.01) * 0.5 + 0.5;
      if (arcPulse > 0.55) {
        ctx.strokeStyle = `rgba(0, 220, 255, ${arcPulse})`;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 4; ctx.shadowColor = '#00d4ff';
        // Zigzag arc
        ctx.beginPath();
        ctx.moveTo(-hx*0.4, -2);
        ctx.lineTo(-hx*0.2, 1);
        ctx.lineTo(0, -1);
        ctx.lineTo(hx*0.1, 2);
        ctx.lineTo(hx*0.25, 0);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // Glowing circuit board detail (4 small nodes)
      ctx.fillStyle = '#00aaff';
      ctx.shadowBlur = 3; ctx.shadowColor = '#00d4ff';
      [[-hx*0.55, 0], [hx*0.55, 0], [0, -hy*0.45], [0, hy*0.45]].forEach(([nx, ny]) => {
        ctx.beginPath(); ctx.arc(nx, ny, 1.4, 0, Math.PI*2); ctx.fill();
      });
      ctx.shadowBlur = 0;
    }

    if (id === 'pyro') {
      // OGNIARZ: rear pressure tank bulges (cylindrical tank shape at rear)
      ctx.fillStyle = '#3a1a0a';
      // Two large cylinders at rear of hull
      for (const side of [-1, 1]) {
        const ty = side * hy * 0.45;
        ctx.beginPath(); ctx.roundRect(-hx + 4, ty - 4, 16, 8, 3); ctx.fill();
        ctx.strokeStyle = '#1a0500'; ctx.lineWidth = 0.7; ctx.stroke();
        // Tank end cap
        ctx.fillStyle = '#5a2a15';
        ctx.beginPath(); ctx.arc(-hx + 6, ty, 3.2, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#1a0500'; ctx.stroke();
        // Pressure valve
        ctx.fillStyle = '#f4c842';
        ctx.beginPath(); ctx.arc(-hx + 6, ty, 1, 0, Math.PI*2); ctx.fill();
        // Front armor plating shows
        ctx.fillStyle = '#3a1a0a';
      }
      // Heat ribs along front of hull
      ctx.strokeStyle = '#2a0f08'; ctx.lineWidth = 0.7;
      [hx*0.55, hx*0.65, hx*0.75].forEach(rx => {
        ctx.beginPath(); ctx.moveTo(rx, -hy*0.55); ctx.lineTo(rx, hy*0.55); ctx.stroke();
      });
      // Hot orange glow at rear (between tanks)
      const heatPulse = 0.5 + Math.sin(now * 0.005) * 0.3;
      ctx.fillStyle = `rgba(255, 100, 30, ${0.4 * heatPulse})`;
      ctx.shadowBlur = 4; ctx.shadowColor = '#ff5520';
      ctx.fillRect(-hx + 8, -2.5, 14, 5);
      ctx.shadowBlur = 0;
    }

    if (id === 'shadow') {
      // SHADOW: hexagonal stealth skirt panels covering tracks (visible from above as side patterns)
      ctx.fillStyle = '#15101e';
      for (const side of [-1, 1]) {
        const ty = side * hy;
        ctx.beginPath();
        // Multi-faceted skirt outline
        ctx.moveTo(-hx + 2, ty - side * 1);
        for (let i = 0; i < 5; i++) {
          const x1 = -hx + 2 + i * (w - 4) / 5;
          const x2 = -hx + 2 + (i + 0.5) * (w - 4) / 5;
          const x3 = -hx + 2 + (i + 1) * (w - 4) / 5;
          ctx.lineTo(x2, ty - side * 3);
          ctx.lineTo(x3, ty - side * 1);
        }
        ctx.lineTo(-hx + 2, ty - side * 1);
        ctx.closePath(); ctx.fill();
      }
      // Stealth pattern lines (hexagonal accent)
      ctx.strokeStyle = 'rgba(94, 88, 122, 0.4)'; ctx.lineWidth = 0.5;
      for (let i = 0; i < 3; i++) {
        const lx = -hx + 12 + i * 18;
        ctx.beginPath();
        ctx.moveTo(lx, -hy*0.4); ctx.lineTo(lx + 6, -hy*0.2);
        ctx.lineTo(lx + 6, hy*0.2); ctx.lineTo(lx, hy*0.4); ctx.stroke();
      }
    }

    if (id === 'king') {
      // KING: front crown silhouette etched + roman column hull sides
      // Crown silhouette etched into front armor
      ctx.fillStyle = '#5a0a18';
      ctx.beginPath();
      const cFront = hx - 5;
      ctx.moveTo(cFront, -hy*0.4);
      ctx.lineTo(cFront - 1, -hy*0.5);
      ctx.lineTo(cFront - 4, -hy*0.45);
      ctx.lineTo(cFront - 6, -hy*0.6);
      ctx.lineTo(cFront - 8, -hy*0.45);
      ctx.lineTo(cFront - 10, -hy*0.55);
      ctx.lineTo(cFront - 12, -hy*0.4);
      ctx.lineTo(cFront - 12, hy*0.4);
      ctx.lineTo(cFront - 10, hy*0.55);
      ctx.lineTo(cFront - 8, hy*0.45);
      ctx.lineTo(cFront - 6, hy*0.6);
      ctx.lineTo(cFront - 4, hy*0.45);
      ctx.lineTo(cFront - 1, hy*0.5);
      ctx.lineTo(cFront, hy*0.4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 0.7; ctx.stroke();
      // Gold gem at center of crown
      ctx.fillStyle = '#f4c842';
      ctx.beginPath(); ctx.arc(cFront - 6, 0, 1.6, 0, Math.PI*2); ctx.fill();
      // Roman column suspension indicators (vertical pillars on side)
      ctx.fillStyle = '#1a0a08';
      [-hx*0.4, 0, hx*0.2].forEach(px => {
        for (const side of [-1, 1]) {
          const ty = side * hy * 0.7;
          ctx.fillRect(px - 1, ty - 2, 2, 4);
          // Capital (top of column)
          ctx.fillStyle = '#f4c842';
          ctx.fillRect(px - 1.5, ty - 2.5, 3, 0.8);
          ctx.fillRect(px - 1.5, ty + 1.7, 3, 0.8);
          ctx.fillStyle = '#1a0a08';
        }
      });
      // Scarlet pulse aura underglow (visible at front and sides as red glow)
      const auraPulse = 0.5 + Math.sin(now * 0.004) * 0.5;
      ctx.fillStyle = `rgba(224, 41, 72, ${0.18 + auraPulse * 0.15})`;
      ctx.shadowBlur = 5; ctx.shadowColor = '#d4213d';
      ctx.fillRect(-hx + 3, -hy*0.18, w - 6, hy*0.36);
      ctx.shadowBlur = 0;
    }
  }


  function drawAnimeGlare(ctx, w, h) {
    if (!T.glare) return;
    // FIX #6: Compute glare in SCREEN SPACE (unscaled) then mask to hull shape.
    // Old behavior: glare drawn in scaled context = diagonal line bent by 0.866 Y compression.
    // New: clip to hull shape (in scaled space), then reset transform to identity for glare drawing.
    ctx.save();
    // First: clip to hull shape in current (scaled) transform
    ctx.beginPath(); drawHullPath(ctx, 'standard', w*0.96, h*0.96); ctx.clip();
    // Capture current transform so we can convert back to screen space
    const m = ctx.getTransform();
    // Reset to identity (screen space)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Compute glare in pure screen space - 45° diagonal stripe, large enough to cover entire scene
    // Center on transformed hull position (m.e, m.f are translation components)
    ctx.translate(m.e, m.f);
    ctx.rotate(-Math.PI/4);
    const len = Math.hypot(w, h) * Math.max(Math.abs(m.a), Math.abs(m.d)) * 1.5;
    const grad = ctx.createLinearGradient(-len/2, 0, len/2, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.42, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.58, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-len, -len, len*2, len*2);
    ctx.restore();
  }

  // ============ NEW: RIM LIGHTING ============
  function applyRimLighting(ctx, w, h, hullShape) {
    if (!T.rim) return;
    ctx.save();
    ctx.beginPath(); drawHullPath(ctx, hullShape, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    ctx.save(); ctx.translate(-1.2, -1.2);
    drawHullPath(ctx, hullShape, w, h); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
    ctx.save(); ctx.translate(1.2, 1.2);
    drawHullPath(ctx, hullShape, w, h); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  // ============ NEW: PER-BRAWLER ASYMMETRY/DAMAGE ============
  function drawAsymmetry(ctx, brawler) {
    if (!T.asym || !brawler.asym) return;
    const c = brawler.colors;
    const w = brawler.hullW, h = brawler.hullH;
    const hx = w/2, hy = h/2;
    switch (brawler.asym) {
      case 'crack': // Twardy - peknięcie pancerza po lewej
        ctx.strokeStyle = c.deep; ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(-hx+8, -hy+10);
        ctx.lineTo(-hx+14, -hy+18);
        ctx.lineTo(-hx+10, -hy+25);
        ctx.lineTo(-hx+16, hy-8);
        ctx.stroke();
        ctx.strokeStyle = '#2a1f3d'; ctx.lineWidth = 0.4;
        ctx.stroke();
        break;
      case 'patch_x': // Pancerny - latka X welded
        ctx.save(); ctx.translate(-hx+18, hy-14); ctx.rotate(-0.15);
        ctx.fillStyle = darken(c.main, 0.7);
        ctx.fillRect(-7, -7, 14, 14);
        ctx.strokeStyle = '#1a0a1f'; ctx.lineWidth = 0.8; ctx.strokeRect(-7, -7, 14, 14);
        ctx.strokeStyle = '#6a5a7c'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-5,-5); ctx.lineTo(5,5); ctx.moveTo(5,-5); ctx.lineTo(-5,5); ctx.stroke();
        // Weld points
        ctx.fillStyle = '#3a2a4d';
        [[-6,-6],[6,-6],[-6,6],[6,6]].forEach(([px,py]) => { ctx.beginPath(); ctx.arc(px,py,1,0,Math.PI*2); ctx.fill(); });
        ctx.restore();
        break;
      case 'bent_plate': // Zwiad - wygięcie blachy nad gąsienicą
        ctx.save(); ctx.translate(-hx+10, -hy-2);
        ctx.fillStyle = darken(c.main, 0.6);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(14, -3); ctx.lineTo(20, 1); ctx.lineTo(8, 4); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#3a2a1f'; ctx.lineWidth = 0.7; ctx.stroke();
        ctx.restore();
        break;
      case 'ricochet_mark': // Snajper - rikoszet na pancerzu
        ctx.fillStyle = '#e8e0d0';
        ctx.beginPath(); ctx.arc(hx-22, -hy+10, 2.2, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#5a4a3d'; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.fillStyle = '#1a0a0a';
        ctx.beginPath(); ctx.arc(hx-22, -hy+10, 0.8, 0, Math.PI*2); ctx.fill();
        // Streak from ricochet
        ctx.strokeStyle = 'rgba(232,224,208,0.5)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(hx-22, -hy+10); ctx.lineTo(hx-12, -hy+5); ctx.stroke();
        break;
      case 'led_blink': // Tech - mrugajaca dioda
        const blink = (Math.sin(performance.now() * 0.005) > 0.5) ? 1 : 0.3;
        ctx.fillStyle = `rgba(0,255,170,${0.9*blink})`;
        ctx.beginPath(); ctx.arc(hx-10, hy-8, 1.8, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${blink})`;
        ctx.beginPath(); ctx.arc(hx-10, hy-8, 0.8, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#1a0a1f'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(hx-10, hy-8, 2.2, 0, Math.PI*2); ctx.stroke();
        break;
      case 'soot_stain': // Ogniarz - smolowy slad
        ctx.fillStyle = 'rgba(20,10,5,0.6)';
        ctx.beginPath();
        ctx.ellipse(hx-15, 0, 12, 8, 0.2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(40,20,10,0.4)';
        ctx.beginPath();
        ctx.ellipse(hx-12, 4, 8, 5, -0.1, 0, Math.PI*2); ctx.fill();
        break;
      case 'cracked_paint': // Shadow - peknieta farba
        ctx.strokeStyle = darken(c.deep, 0.7); ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(-hx+12, hy-5); ctx.lineTo(-hx+22, hy-15); ctx.lineTo(-hx+18, hy-22); ctx.lineTo(-hx+28, hy-18);
        ctx.moveTo(-hx+22, hy-15); ctx.lineTo(-hx+30, hy-10);
        ctx.stroke();
        break;
      case 'gold_pennant': // King - zlota choragiewka
        ctx.save(); ctx.translate(-hx+8, -hy+4); ctx.rotate(-0.3);
        ctx.fillStyle = '#8b6914'; ctx.fillRect(0, 0, 0.8, 14);
        ctx.fillStyle = '#f4c842';
        ctx.beginPath(); ctx.moveTo(0.8, 0); ctx.lineTo(8, 2); ctx.lineTo(4, 5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.restore();
        break;
    }
  }

  // ============ NEW: RIVETS WITH CATCHLIGHT ============
  function drawRivet(ctx, x, y, c) {
    // Dark base
    ctx.fillStyle = c.outline;
    ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI*2); ctx.fill();
    // Catchlight half-moon (NEW)
    if (T.rivets) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(x, y - 0.3, 1.0, Math.PI * 1.15, Math.PI * 1.85);
      ctx.fill();
    }
  }

  function drawHullTop(ctx, brawler, isSuperShot, colors) {
    const c = colors || brawler.colors;
    const w = brawler.hullW, h = brawler.hullH;
    const hx = w/2, hy = h/2;
    const fillMain = isSuperShot ? c.bright : c.main;
    const fillHigh = isSuperShot ? '#ffffff' : c.light;
    ctx.fillStyle = fillMain;
    drawHullPath(ctx, brawler.hullShape, w, h); ctx.fill();
    ctx.strokeStyle = c.outline; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = fillHigh;
    ctx.beginPath(); ctx.roundRect(hx - 18, -hy + 2, 16, h - 4, 5); ctx.fill();
    ctx.strokeStyle = c.outline; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-15,-hy); ctx.lineTo(-15,hy); ctx.moveTo(10,-hy); ctx.lineTo(10,hy); ctx.stroke();
    ctx.fillStyle = c.outline; ctx.fillRect(-hx+6,-6,8,12);
    ctx.fillStyle = c.dark; ctx.fillRect(-hx+7,-5,2,10); ctx.fillRect(-hx+11,-5,2,10);

    if (brawler.hullShape === 'armored') {
      ctx.fillStyle = c.dark;
      [[-hx+4,-hy+4],[hx-12,-hy+4],[-hx+4,hy-12],[hx-12,hy-12]].forEach(([px,py]) => {
        ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+8,py); ctx.lineTo(px,py+8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = c.outline; ctx.lineWidth = 0.8; ctx.stroke();
      });
    }
    if (brawler.hullShape === 'tech') {
      ctx.fillStyle = c.bright; ctx.globalAlpha = 0.4;
      [[0,-10],[-5,0],[5,0],[0,10]].forEach(([hx2,hy2]) => {
        ctx.beginPath();
        for (let i=0;i<6;i++){const a=(i/6)*Math.PI*2;const px=hx2+Math.cos(a)*3,py=hy2+Math.sin(a)*3;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}
        ctx.closePath(); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    if (brawler.hullShape === 'royal') {
      ctx.strokeStyle = '#f4c842'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(-hx+2,-hy+2,w-4,h-4,6); ctx.stroke();
    }
    if (brawler.hullShape === 'wide') {
      ctx.fillStyle = '#777';
      ctx.fillRect(-hx+4,-hy+4,7,9); ctx.fillRect(-hx+4,hy-13,7,9);
      ctx.strokeStyle = c.outline; ctx.lineWidth = 0.7;
      ctx.strokeRect(-hx+4,-hy+4,7,9); ctx.strokeRect(-hx+4,hy-13,7,9);
      ctx.fillStyle = '#d4213d';
      ctx.fillRect(-hx+5,-hy+6,5,1); ctx.fillRect(-hx+5,hy-11,5,1);
    }
    if (brawler.hullShape === 'angular') {
      ctx.fillStyle = c.deep;
      ctx.beginPath(); ctx.moveTo(-hx+6,-hy+3); ctx.lineTo(-hx+14,-hy+8); ctx.lineTo(-hx+6,-hy+13); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx-6,hy-3); ctx.lineTo(hx-14,hy-8); ctx.lineTo(hx-6,hy-13); ctx.closePath(); ctx.fill();
    }
    if (brawler.hullShape === 'monster') {
      ctx.fillStyle = c.deep;
      [[-hx+8,-hy-2],[-hx+18,-hy-2],[hx-18,-hy-2],[hx-8,-hy-2],[-hx+8,hy+2],[-hx+18,hy+2],[hx-18,hy+2],[hx-8,hy+2]].forEach(([px,py]) => {
        ctx.beginPath();
        if (py < 0) { ctx.moveTo(px-3,py); ctx.lineTo(px,py-4); ctx.lineTo(px+3,py); }
        else { ctx.moveTo(px-3,py); ctx.lineTo(px,py+4); ctx.lineTo(px+3,py); }
        ctx.closePath(); ctx.fill();
      });
      if (brawler.hasYellowReflections) {
        ctx.fillStyle = '#fff200'; ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.ellipse(0,-hy*0.3,hx*0.4,hy*0.2,0,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fbe54d'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(-hx+3,-hy+3,w-6,h-6,5); ctx.stroke();
      }
    }
    // Twardy: CAMO MORO - darker green spots overlay
    if (brawler.camoSpots) {
      ctx.save();
      // Clip to hull shape so spots don't leak out
      ctx.beginPath(); drawHullPath(ctx, brawler.hullShape, w, h); ctx.clip();
      ctx.fillStyle = '#1a5f1a'; // darker green
      // Asymmetric organic spots (fixed positions for consistency)
      const spots = [
        [-hx*0.55, -hy*0.4, 7, 5, 0.4],
        [hx*0.15, -hy*0.6, 5, 8, -0.3],
        [-hx*0.2, hy*0.4, 9, 6, 0.6],
        [hx*0.6, hy*0.3, 6, 7, -0.5],
        [hx*0.35, -hy*0.15, 5, 4, 1.2],
        [-hx*0.7, hy*0.15, 4, 6, 0.8],
      ];
      spots.forEach(([sx,sy,sw,sh,rot]) => {
        ctx.save(); ctx.translate(sx,sy); ctx.rotate(rot);
        ctx.beginPath(); ctx.ellipse(0,0,sw,sh,0,0,Math.PI*2); ctx.fill();
        ctx.restore();
      });
      // Slightly lighter brown-green secondary spots
      ctx.fillStyle = 'rgba(60, 75, 30, 0.5)';
      const spots2 = [[-hx*0.3,-hy*0.2,4,5],[hx*0.4,hy*0.5,5,3],[-hx*0.45,hy*0.45,3,4]];
      spots2.forEach(([sx,sy,sw,sh]) => { ctx.beginPath(); ctx.ellipse(sx,sy,sw,sh,0.3,0,Math.PI*2); ctx.fill(); });
      ctx.restore();
    }

    // Tech: PULSING NEON STRIPE - pulses on hull
    if (brawler.neonPulse) {
      const pulse = 0.45 + Math.sin(performance.now() * 0.005) * 0.55;
      ctx.save();
      ctx.beginPath(); drawHullPath(ctx, brawler.hullShape, w, h); ctx.clip();
      // Two parallel cyan stripes along the longitudinal axis
      ctx.shadowBlur = 6 * pulse;
      ctx.shadowColor = '#00d4ff';
      ctx.fillStyle = `rgba(0, 220, 255, ${0.35 + pulse*0.5})`;
      ctx.fillRect(-hx*0.85, -hy*0.55, w*0.7, 1.6);
      ctx.fillRect(-hx*0.85, hy*0.55 - 1.6, w*0.7, 1.6);
      // Side stripes
      ctx.fillRect(-hx*0.85, -hy*0.2, w*0.7, 1.0);
      ctx.fillRect(-hx*0.85, hy*0.2 - 1.0, w*0.7, 1.0);
      // Glowing diamond core (front)
      ctx.shadowBlur = 8 * pulse;
      ctx.fillStyle = `rgba(120, 240, 255, ${0.7 + pulse*0.3})`;
      ctx.beginPath();
      ctx.moveTo(hx*0.4, 0); ctx.lineTo(hx*0.5, -3); ctx.lineTo(hx*0.6, 0); ctx.lineTo(hx*0.5, 3); ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // (Flag przeniesiona NIŻEJ — rysowana PO wydechu + hull customization, żeby ich nie
    //  zasłaniały. Patrz blok po drawExhaustPipes.)

    // NEW: Per-brawler hull customization (lemiesz Pancerny, arrow Zwiad, outriggers Snajper, crown King, etc.)
    drawHullCustomization(ctx, brawler, c, isSuperShot);

    // NEW: Unique exhaust pipes per brawler (visible physical pipes at rear)
    drawExhaustPipes(ctx, brawler, c);

    // Flag on rear hull — rysowana TUTAJ (po wydechu + hull customization) żeby rury/błotniki
    // jej NIE zasłaniały (feedback). Nadal zasłaniana przez WIEŻĘ (rysowaną później), gdy wieża
    // celuje do tyłu. Rozmiar +20% (14x10 -> 16.8x12).
    if (brawler.flag && brawler.id.indexOf('boss')===-1 && brawler.id!=='grunt') {
      const turretR = brawler.turretRadius;
      const slupX = -(turretR + 8); // just behind turret cylinder
      const flagW = 16.8, flagH = 12;
      ctx.save();
      ctx.translate(slupX, 0);
      // Flag pole (lekko wyższy maszt pod większą flagę)
      ctx.fillStyle = c.outline;
      ctx.fillRect(-0.8, -9, 1.6, 18);
      // Pole base mount on hull
      ctx.fillStyle = c.dark;
      ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI*2); ctx.fill();
      // Flag itself (16.8x12, centered)
      drawFlag(ctx, brawler.flag, flagW, flagH);
      ctx.restore();
    }

    // NEW: Rivets with catchlight
    [[-hx+6,-hy+6],[hx-6,-hy+6],[-hx+6,hy-6],[hx-6,hy-6],[0,-hy+6],[0,hy-6]].forEach(([rx,ry]) => drawRivet(ctx, rx, ry, c));

    // NEW: Asymmetry / damage detail (per brawler)
    drawAsymmetry(ctx, brawler);

    // NEW: Anime glare 45° on hull
    drawAnimeGlare(ctx, w, h);

    // NEW: Rim lighting (light top-left, dark bottom-right)
    applyRimLighting(ctx, w, h, brawler.hullShape);
  }

  function drawTurretShape(ctx, shape, r) {
    ctx.beginPath();
    if (shape==='hex') { for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2+Math.PI/6;const px=Math.cos(a)*r,py=Math.sin(a)*r;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);} ctx.closePath(); }
    else if (shape==='angular') { for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2+Math.PI/8;const px=Math.cos(a)*r,py=Math.sin(a)*r;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);} ctx.closePath(); }
    // NEW SHAPES
    else if (shape==='chamfered_cube' || shape==='chamfered_cube_tech') {
      // Rectangle with chamfered (cut) corners - modern angular cube
      const w = r * 1.05, h = r * 1.0, c = r * 0.28;
      ctx.moveTo(-w+c, -h); ctx.lineTo(w-c, -h); ctx.lineTo(w, -h+c);
      ctx.lineTo(w, h-c); ctx.lineTo(w-c, h); ctx.lineTo(-w+c, h);
      ctx.lineTo(-w, h-c); ctx.lineTo(-w, -h+c); ctx.closePath();
    }
    else if (shape==='heavy_octagon') {
      // Heavy 8-sided with reactive armor bumps look (slightly larger)
      const rr = r * 1.05;
      for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2;const px=Math.cos(a)*rr,py=Math.sin(a)*rr;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);} ctx.closePath();
    }
    else if (shape==='low_oval') {
      // Slim racer ellipse - wider than tall
      ctx.ellipse(0, 0, r * 1.15, r * 0.78, 0, 0, Math.PI*2);
    }
    else if (shape==='tall_rect') {
      // Narrow rectangular high-mount with rounded short ends
      const w = r * 0.78, h = r * 1.15, rad = r * 0.22;
      ctx.moveTo(-w+rad,-h); ctx.lineTo(w-rad,-h); ctx.quadraticCurveTo(w,-h,w,-h+rad);
      ctx.lineTo(w,h-rad); ctx.quadraticCurveTo(w,h,w-rad,h);
      ctx.lineTo(-w+rad,h); ctx.quadraticCurveTo(-w,h,-w,h-rad);
      ctx.lineTo(-w,-h+rad); ctx.quadraticCurveTo(-w,-h,-w+rad,-h); ctx.closePath();
    }
    else if (shape==='wide_cylinder') {
      // Short wide cylinder (flamethrower base) - oval wider than tall
      ctx.ellipse(0, 0, r * 1.25, r * 0.95, 0, 0, Math.PI*2);
    }
    else if (shape==='faceted_hex') {
      // Sharp angular hex (stealth) - rotated 30°
      for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;const px=Math.cos(a)*r,py=Math.sin(a)*r;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);} ctx.closePath();
    }
    else if (shape==='crowned_cylinder') {
      // Cylinder base (crown drawn separately in top features)
      ctx.arc(0,0,r,0,Math.PI*2);
    }
    else { ctx.arc(0,0,r,0,Math.PI*2); }
  }
  function drawTurretCylinder(ctx, brawler, colors) {
    const c = colors || brawler.colors;
    if (brawler.turretShape === 'truncated_cone') {
      ctx.fillStyle = c.deep;
      ctx.beginPath(); ctx.arc(0,0,brawler.turretBaseRadius,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = c.outline; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = c.dark;
      ctx.beginPath();
      ctx.arc(0,0,brawler.turretBaseRadius-1,0,Math.PI*2);
      ctx.arc(0,0,brawler.turretRadius+1,0,Math.PI*2,true);
      ctx.fill();
      return;
    }
    // FIX: Removed main fill+stroke (was duplicating extrusion top + adding ugly frame around turret).
    // Extrusion already provides solid bryla. Here we ONLY add side-relevant details.
    if (brawler.turretShape === 'armored' || brawler.turretShape === 'heavy_octagon') {
      ctx.fillStyle = c.deep; const r = brawler.turretRadius;
      ctx.beginPath(); ctx.ellipse(-r+4,0,5,r-4,0,0,Math.PI*2); ctx.fill();
      // Pancerny: reactive armor bumps along the octagon edges
      if (brawler.turretShape === 'heavy_octagon') {
        ctx.fillStyle = c.deep;
        for(let i=0;i<8;i++){
          const a=(i/8)*Math.PI*2; const bx=Math.cos(a)*r*0.78, by=Math.sin(a)*r*0.78;
          ctx.beginPath(); ctx.arc(bx,by,1.6,0,Math.PI*2); ctx.fill();
        }
      }
    }
    if (brawler.hasYellowReflections) {
      ctx.strokeStyle = '#fbe54d'; ctx.lineWidth = 2;
      drawTurretShape(ctx, brawler.turretShape, brawler.turretRadius - 2); ctx.stroke();
    }
  }
  function drawTurretTopBase(ctx, brawler, isSuperShot, colors) {
    const c = colors || brawler.colors; const r = brawler.turretRadius;
    ctx.fillStyle = isSuperShot ? c.bright : c.main;
    drawTurretShape(ctx, brawler.turretShape === 'truncated_cone' ? 'round' : brawler.turretShape, r); ctx.fill();
    ctx.strokeStyle = c.outline; ctx.lineWidth = 1.5; ctx.stroke();

    // INTERNAL LIGHT HIGHLIGHT (poduszka swiatla na top face - light coming from top-left)
    // Subtle lighter circle indented from upper-left = simulates light catching the top of solid 3D turret
    ctx.save();
    ctx.beginPath();
    drawTurretShape(ctx, brawler.turretShape === 'truncated_cone' ? 'round' : brawler.turretShape, r * 0.92);
    ctx.clip();
    ctx.fillStyle = isSuperShot ? '#ffffff' : c.light;
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.arc(-r*0.3, -r*0.3, r*0.55, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    if (brawler.turretShape === 'crowned' || brawler.turretShape === 'crowned_cylinder' || brawler.id === 'king') {
      ctx.strokeStyle = '#f4c842'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0,0,r-2,0,Math.PI*2); ctx.stroke();
      // King: extra gold crown teeth on the cylinder rim
      if (brawler.turretShape === 'crowned_cylinder') {
        ctx.fillStyle = '#f4c842';
        for (let i=0;i<8;i++){ const a=(i/8)*Math.PI*2; const tx=Math.cos(a)*(r-1), ty=Math.sin(a)*(r-1); ctx.beginPath(); ctx.arc(tx,ty,1.4,0,Math.PI*2); ctx.fill(); }
      }
    }
    if (brawler.turretShape === 'tall' || brawler.turretShape === 'tall_rect') {
      ctx.fillStyle = c.bright;
      ctx.beginPath(); ctx.arc(-3,-4,r*0.4,0,Math.PI*2); ctx.fill();
    }
    if (brawler.hasYellowReflections) {
      ctx.fillStyle = '#fff200'; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(-r*0.25,-r*0.25,r*0.45,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.arc(-r*0.35,-r*0.35,r*0.25,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#f4c842'; ctx.lineWidth = 1.8;
      drawTurretShape(ctx, brawler.turretShape, r-3); ctx.stroke();
    }
    // NEW: Anime glare on turret top
    if (T.glare && r > 14) {
      ctx.save();
      ctx.beginPath();
      drawTurretShape(ctx, brawler.turretShape === 'truncated_cone' ? 'round' : brawler.turretShape, r-1);
      ctx.clip();
      ctx.rotate(-Math.PI/4);
      const grad = ctx.createLinearGradient(-r, 0, r, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.42, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      grad.addColorStop(0.58, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-r*1.5, -r*1.5, r*3, r*3);
      ctx.restore();
    }
  }

  function drawEmblem(ctx, brawler) {
    const e=brawler.emblem; const c=brawler.colors;
    if (e==='shield'){ctx.fillStyle=c.light;ctx.strokeStyle=c.outline;ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(0,-4);ctx.lineTo(4,-2);ctx.lineTo(4,2);ctx.lineTo(0,5);ctx.lineTo(-4,2);ctx.lineTo(-4,-2);ctx.closePath();ctx.fill();ctx.stroke();}
    else if (e==='helmet'){ctx.fillStyle=c.deep;ctx.beginPath();ctx.arc(0,0,5,Math.PI,0);ctx.lineTo(4,2);ctx.lineTo(-4,2);ctx.closePath();ctx.fill();ctx.strokeStyle=c.outline;ctx.lineWidth=0.7;ctx.stroke();}
    else if (e==='scope'){ctx.strokeStyle=c.deep;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,4.5,0,Math.PI*2);ctx.stroke();ctx.fillStyle=c.deep;ctx.fillRect(-0.7,-4.5,1.4,9);ctx.fillRect(-4.5,-0.7,9,1.4);}
    else if (e==='crosshair'){ctx.strokeStyle=c.deep;ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(0,6);ctx.moveTo(-6,0);ctx.lineTo(6,0);ctx.stroke();}
    else if (e==='chip'){ctx.fillStyle=c.deep;ctx.fillRect(-4,-4,8,8);ctx.fillStyle=c.bright;ctx.fillRect(-3,-3,6,6);ctx.fillStyle=c.deep;[[-3,-1],[-3,1],[3,-1],[3,1],[-1,-3],[1,-3],[-1,3],[1,3]].forEach(([px,py])=>ctx.fillRect(px-0.5,py-0.5,1,1));}
    else if (e==='flame'){ctx.fillStyle='#f9aa1f';ctx.beginPath();ctx.moveTo(0,-5);ctx.quadraticCurveTo(4,-2,3,3);ctx.quadraticCurveTo(2,5,0,5);ctx.quadraticCurveTo(-2,5,-3,3);ctx.quadraticCurveTo(-4,-2,0,-5);ctx.fill();ctx.fillStyle='#ffe17a';ctx.beginPath();ctx.moveTo(0,-3);ctx.quadraticCurveTo(2,-1,1,2);ctx.quadraticCurveTo(0,3,-1,2);ctx.quadraticCurveTo(-2,-1,0,-3);ctx.fill();}
    else if (e==='moon'){ctx.fillStyle=c.light;ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();ctx.fillStyle=c.dark;ctx.beginPath();ctx.arc(1.5,-0.5,4.5,0,Math.PI*2);ctx.fill();}
    else if (e==='crown'){ctx.fillStyle='#f4c842';ctx.strokeStyle='#8b6914';ctx.lineWidth=0.7;ctx.beginPath();ctx.moveTo(-5,3);ctx.lineTo(-5,-1);ctx.lineTo(-3,-3);ctx.lineTo(-1,-1);ctx.lineTo(0,-4);ctx.lineTo(1,-1);ctx.lineTo(3,-3);ctx.lineTo(5,-1);ctx.lineTo(5,3);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#d4213d';ctx.beginPath();ctx.arc(0,1,1,0,Math.PI*2);ctx.fill();}
    else if (e==='skull'){ctx.fillStyle='#f5f5f5';ctx.beginPath();ctx.arc(0,-1,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#1a0a0a';ctx.beginPath();ctx.arc(-2.5,-2,1.8,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(2.5,-2,1.8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#1a0a0a';ctx.beginPath();ctx.moveTo(-3,4);ctx.lineTo(3,4);ctx.lineTo(2,6);ctx.lineTo(-2,6);ctx.closePath();ctx.fill();}
  }

  // White eagle silhouette (no crown) - drawn on side of Twardy turret
  function drawWhiteEagleSide(ctx, sz) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1a3a1a';
    ctx.lineWidth = 0.6;
    // Stylized eagle body
    ctx.beginPath();
    ctx.moveTo(0, -sz*0.55);                                // head top
    ctx.quadraticCurveTo(sz*0.18, -sz*0.45, sz*0.22, -sz*0.25); // head right (beak side)
    ctx.lineTo(sz*0.42, -sz*0.18);                          // beak tip
    ctx.lineTo(sz*0.22, -sz*0.1);                           // neck
    ctx.quadraticCurveTo(sz*0.55, 0, sz*0.45, sz*0.4);      // right wing
    ctx.lineTo(sz*0.18, sz*0.3);
    ctx.lineTo(sz*0.12, sz*0.55);                           // right tail
    ctx.lineTo(0, sz*0.4);
    ctx.lineTo(-sz*0.12, sz*0.55);                          // left tail
    ctx.lineTo(-sz*0.18, sz*0.3);
    ctx.quadraticCurveTo(-sz*0.55, 0, -sz*0.45, sz*0.4);    // left wing mirror
    ctx.quadraticCurveTo(-sz*0.55, 0, -sz*0.45, -sz*0.05);  // left back
    ctx.quadraticCurveTo(-sz*0.25, -sz*0.4, 0, -sz*0.55);   // back to head
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Eye dot
    ctx.fillStyle = '#1a3a1a';
    ctx.beginPath(); ctx.arc(sz*0.2, -sz*0.22, 0.6, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawAmmoMagazine(ctx, brawler) {
    const r = brawler.turretRadius;
    const mx = -r - 12, my = -10; const mw = 14, mh = 20;
    ctx.fillStyle = 'rgba(20,10,30,0.4)'; ctx.fillRect(mx+1, my+2, mw, mh);
    ctx.fillStyle = '#3a3340'; ctx.beginPath(); ctx.roundRect(mx,my,mw,mh,2); ctx.fill();
    ctx.strokeStyle = '#1a1520'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#5a5260'; ctx.beginPath(); ctx.roundRect(mx,my,mw,mh-4,2); ctx.fill();
    ctx.strokeStyle = '#1a1520'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.fillStyle = '#7a7280'; ctx.beginPath(); ctx.roundRect(mx+1,my+1,mw-2,4,1); ctx.fill();
    ctx.fillStyle = '#8b6914';
    for (let row=0;row<3;row++) for (let col=0;col<3;col++) { ctx.beginPath(); ctx.arc(mx+3+col*4, my+7+row*4, 1.3, 0, Math.PI*2); ctx.fill(); }
    ctx.fillStyle = '#f4c842';
    for (let row=0;row<3;row++) for (let col=0;col<3;col++) { ctx.beginPath(); ctx.arc(mx+3+col*4-0.4, my+7+row*4-0.4, 0.5, 0, Math.PI*2); ctx.fill(); }
    ctx.fillStyle = '#e8b820'; ctx.fillRect(mx,my+mh-6,mw,2);
    ctx.fillStyle = '#1a1520';
    for (let i=0;i<mw;i+=3) ctx.fillRect(mx+i,my+mh-6,1.5,2);
    ctx.fillStyle = '#1a1520'; ctx.fillRect(mx+mw-3,my+8,2,4);
  }

  function drawTurretTopFeatures(ctx, brawler, isSuperShot, colors) {
    const c = colors || brawler.colors; const r = brawler.turretRadius;

    // Rim catchlight (top-left bright spot, all brawlers)
    ctx.fillStyle = isSuperShot ? '#ffffff' : c.light;
    ctx.beginPath(); ctx.arc(-r*0.3,-r*0.3,r*0.6,0,Math.PI*2); ctx.fill();

    // Twardy: TWIN VISORS on front of turret (replaces single dark catchlight)
    if (brawler.twinVisors) {
      // Two horizontal visor slits at front of turret
      ctx.fillStyle = '#0a1a0a';
      ctx.beginPath(); ctx.roundRect(2, -6, 11, 3, 1); ctx.fill();
      ctx.beginPath(); ctx.roundRect(2, 3, 11, 3, 1); ctx.fill();
      // Reflection highlight in visors
      ctx.fillStyle = 'rgba(150, 220, 150, 0.6)';
      ctx.fillRect(3, -5.5, 9, 0.7);
      ctx.fillRect(3, 3.5, 9, 0.7);
    }
    // Tech: SATELLITE DISH + ANTENNA on top of turret
    else if (brawler.dishAntenna) {
      // Antenna pole (long, back-left)
      ctx.strokeStyle = '#1a2a3a'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-r*0.5, -r*0.4); ctx.lineTo(-r*0.85, -r*1.15); ctx.stroke();
      // Antenna tip ball + blinking led
      ctx.fillStyle = '#2a3a4a';
      ctx.beginPath(); ctx.arc(-r*0.85, -r*1.15, 1.6, 0, Math.PI*2); ctx.fill();
      const pulseA = 0.5 + Math.sin(performance.now()*0.008)*0.5;
      ctx.fillStyle = `rgba(0, 230, 255, ${0.6 + pulseA*0.4})`;
      ctx.beginPath(); ctx.arc(-r*0.85, -r*1.15, 0.9, 0, Math.PI*2); ctx.fill();
      // Satellite dish (right side back)
      ctx.fillStyle = '#5a7a9a';
      ctx.beginPath(); ctx.ellipse(-r*0.3, r*0.45, 4.5, 3.2, -0.3, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#2a3a4a'; ctx.lineWidth = 0.6; ctx.stroke();
      // Dish bowl (inner)
      ctx.fillStyle = '#cfdce8';
      ctx.beginPath(); ctx.ellipse(-r*0.3, r*0.45, 3.5, 2.5, -0.3, 0, Math.PI*2); ctx.fill();
      // Dish receiver dot
      ctx.fillStyle = '#1a2a3a';
      ctx.beginPath(); ctx.arc(-r*0.3, r*0.45, 0.8, 0, Math.PI*2); ctx.fill();
      // Tech vents (existing detail)
      ctx.strokeStyle = c.outline; ctx.lineWidth = 0.8;
      [-12,-8,-4].forEach(ay => { ctx.beginPath(); ctx.moveTo(-15,ay); ctx.lineTo(-18,ay-3); ctx.stroke(); });
    }
    // Default: single dark catchlight circle (other brawlers)
    else if (brawler.id !== 'boss_reg' && brawler.id !== 'boss_mega') {
      ctx.fillStyle = c.dark;
      ctx.beginPath(); ctx.arc(-3,-3,6,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = c.outline; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = c.outline; ctx.fillRect(-4,-5,4,1.5);
    }

    if (brawler.hasAmmoMagazine) drawAmmoMagazine(ctx, brawler);

    // Flag moved to drawHullTop (rendered on hull, behind turret, occluded by turret on rotation)

    // Emblem on turret top-front (small accent)
    if (brawler.emblem && brawler.emblem!=='none') {
      ctx.save(); ctx.translate(8, Math.min(11, r*0.55)); drawEmblem(ctx, brawler); ctx.restore();
    }

    // Eagle removed from Twardy per user request

    // Sniper scope detail
    if (brawler.id === 'sniper') {
      ctx.fillStyle = c.deep;
      ctx.beginPath(); ctx.roundRect(-2,-10,10,4,1); ctx.fill();
    }
  }

  function drawBarrel(ctx, brawler, isSuperShot, colors) {
    const c = colors || brawler.colors; const t=brawler.barrelType; const id=brawler.id;
    const base=isSuperShot?'#d946ef':c.deep; const side=isSuperShot?'#a020bf':c.dark; const ol=isSuperShot?'#7c0eaa':c.outline;
    const now = performance.now();

    // ============ TWARDY - classic medium caliber. FIX #2: Main barrel as THICK LINE with round caps (volumetric cylinder, no shearing) ============
    if (id === 'twardy') {
      // SIMPLE plain cylinder (enemy-style)
      drawMuzzleCylinder(ctx, 16, 0, 52, 0, 12, base, side, ol);
      ctx.lineCap = 'butt';
    }

    // ============ PANCERNY - DUAL massive thick stubby barrels with rectangular muzzle brakes + heavy ribbing ============
    else if (id === 'heavy') {
      // SIMPLE DWURURKA - two plain parallel cylinders (enemy-style)
      [-9, 9].forEach(yOff => {
        drawMuzzleCylinder(ctx, 16, yOff, 50, yOff, 12, base, side, ol);
      });
    }

    // ============ ZWIAD - GATLING short multi-barrel rotating with yellow glowing cooling jacket holes ============
    else if (id === 'scout') {
      // Rotation animation (constant slow spin, faster when firing recently)
      const fireRecent = (now - (brawler._lastFireT || 0)) < 200;
      const spinRate = fireRecent ? 0.04 : 0.012;
      const rot = (now * spinRate) % (Math.PI * 2);
      // 3D FAKE-DEPTH: cooling jacket as volumetric cylinder
      drawMuzzleCylinder(ctx, 16, 0, 38, 0, 14, base, side, ol, true);
      // Yellow glowing cooling holes (perforations)
      const heatPulse = fireRecent ? 0.9 : (0.4 + Math.sin(now * 0.008) * 0.3);
      ctx.shadowBlur = 4 * heatPulse; ctx.shadowColor = '#f1c40f';
      ctx.fillStyle = `rgba(241, 196, 15, ${heatPulse})`;
      for (let hx2 = 20; hx2 < 36; hx2 += 3.5) {
        [-4, 0, 4].forEach(hy2 => {
          ctx.beginPath(); ctx.arc(hx2, hy2, 0.9, 0, Math.PI*2); ctx.fill();
        });
      }
      ctx.shadowBlur = 0;
      // Front gatling barrel cluster (6 mini barrels in circle, rotated) - now on a 3D hub
      ctx.save();
      ctx.translate(42, 0);
      ctx.rotate(rot);
      // Outer hub (3D sphere look)
      ctx.fillStyle = ol; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = base; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = side; ctx.beginPath(); ctx.arc(-1.5, -1.5, 3.5, 0, Math.PI*2); ctx.fill();
      // 6 mini barrels (dark holes)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const bx = Math.cos(a) * 4.7, by = Math.sin(a) * 4.7;
        ctx.fillStyle = '#1a1208';
        ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(bx, by, 0.8, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
      // Vibration when firing
      if (fireRecent) {
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.4)';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(42, 0, 9.5, 0, Math.PI*2); ctx.stroke();
      }
    }

    // ============ SNAJPER - RAILGUN: 2 parallel rails with empty space, magnetic coils that light sequentially during reload ============
    else if (id === 'sniper') {
      const RAIL_LEN = 44;
      const RAIL_START = 16;
      // Coil reload animation: sequence runs over 1000ms reload time
      const reloadProgress = Math.min(1, (now - (brawler._lastFireT || 0)) / 1000);
      // Two parallel rails (top and bottom)
      for (const railY of [-4, 4]) {
        ctx.fillStyle = base;
        ctx.beginPath(); ctx.roundRect(RAIL_START, railY - 1.5, RAIL_LEN, 3, 0.5); ctx.fill();
        ctx.strokeStyle = ol; ctx.lineWidth = 0.8; ctx.stroke();
        // Rail metallic highlight
        ctx.fillStyle = side;
        ctx.fillRect(RAIL_START + 1, railY - 1.2, RAIL_LEN - 2, 0.8);
      }
      // Magnetic coils along the rails (6 coils, light up sequentially)
      const coilCount = 6;
      for (let i = 0; i < coilCount; i++) {
        const coilX = RAIL_START + 4 + i * 7;
        const coilLit = reloadProgress > (i / coilCount);
        const coilPulse = coilLit ? (0.7 + Math.sin(now * 0.015 + i) * 0.3) : 0.15;
        // Coil bracket
        ctx.fillStyle = '#1a2a3a';
        ctx.beginPath(); ctx.roundRect(coilX - 1.5, -6, 3, 12, 0.5); ctx.fill();
        ctx.strokeStyle = '#0a1525'; ctx.lineWidth = 0.5; ctx.stroke();
        // Glowing coil ring
        if (coilLit) {
          ctx.shadowBlur = 5 * coilPulse; ctx.shadowColor = '#3498db';
        }
        ctx.fillStyle = `rgba(52, 152, 219, ${coilPulse})`;
        ctx.fillRect(coilX - 1.5, -5.5, 3, 1.2);
        ctx.fillRect(coilX - 1.5, 4.3, 3, 1.2);
        ctx.shadowBlur = 0;
      }
      // Center empty space (with electric arc when fully charged)
      if (reloadProgress >= 1) {
        // Crackling arc
        const arcA = 0.6 + Math.sin(now * 0.05) * 0.4;
        ctx.strokeStyle = `rgba(120, 200, 255, ${arcA})`;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 4; ctx.shadowColor = '#3498db';
        ctx.beginPath();
        ctx.moveTo(RAIL_START + 5, 0);
        for (let x = RAIL_START + 5; x < RAIL_START + RAIL_LEN - 5; x += 4) {
          ctx.lineTo(x + 2, (Math.random() - 0.5) * 4);
        }
        ctx.lineTo(RAIL_START + RAIL_LEN - 5, 0);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // Muzzle (twin rail tip)
      ctx.fillStyle = base;
      ctx.beginPath(); ctx.roundRect(RAIL_START + RAIL_LEN - 4, -7, 8, 14, 1); ctx.fill();
      ctx.strokeStyle = ol; ctx.lineWidth = 1.1; ctx.stroke();
      // Twin opening (rail tips visible)
      ctx.fillStyle = '#3498db';
      ctx.fillRect(RAIL_START + RAIL_LEN - 2, -5, 2.5, 1.2);
      ctx.fillRect(RAIL_START + RAIL_LEN - 2, 3.8, 2.5, 1.2);
    }

    // ============ TECH - PLASMA EMITTER: asymmetric fork emitters with pulsing plasma ball ============
    else if (id === 'plasma') {
      const plasmaBase = brawler.colors.deep;
      const plasmaOL = brawler.colors.outline;
      // Charging state: plasma ball grows if recently fired
      const tSinceFire = (now - (brawler._lastFireT || 0));
      const chargeProg = Math.min(1, tSinceFire / 500);
      const ballSize = 4 + chargeProg * 2.5;
      const ballPulse = 0.7 + Math.sin(now * 0.012) * 0.3;
      const ballRot = now * 0.008;
      // Base mount (short hub)
      ctx.fillStyle = plasmaBase;
      ctx.beginPath(); ctx.roundRect(15, -8, 12, 16, 3); ctx.fill();
      ctx.strokeStyle = plasmaOL; ctx.lineWidth = 1.2; ctx.stroke();
      // Tech glowing detail on mount
      ctx.fillStyle = '#00d4ff';
      ctx.fillRect(17, -1, 8, 0.8); ctx.fillRect(17, 0.2, 8, 0.8);
      // Asymmetric fork prongs (top prong shorter than bottom, or angled)
      // Top prong
      ctx.fillStyle = plasmaBase;
      ctx.beginPath();
      ctx.moveTo(27, -8); ctx.lineTo(45, -10);
      ctx.lineTo(50, -7); ctx.lineTo(50, -3);
      ctx.lineTo(40, -3); ctx.lineTo(27, -2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = plasmaOL; ctx.lineWidth = 1.1; ctx.stroke();
      // Bottom prong (slightly longer/different angle - asymmetric)
      ctx.beginPath();
      ctx.moveTo(27, 8); ctx.lineTo(48, 11);
      ctx.lineTo(54, 8); ctx.lineTo(54, 4);
      ctx.lineTo(42, 3); ctx.lineTo(27, 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = plasmaOL; ctx.lineWidth = 1.1; ctx.stroke();
      // Prong tip emitter rings (cyan glow)
      ctx.shadowBlur = 5; ctx.shadowColor = '#00d4ff';
      ctx.fillStyle = `rgba(0, 220, 255, ${0.8 * ballPulse})`;
      ctx.beginPath(); ctx.arc(48, -7, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(52, 7, 2, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
      // Plasma ball between prongs (rotates and pulses)
      ctx.save();
      ctx.translate(45, 0);
      ctx.rotate(ballRot);
      ctx.shadowBlur = 8 * ballPulse;
      ctx.shadowColor = isSuperShot ? '#ff77ff' : '#00d4ff';
      // Outer glow
      ctx.fillStyle = isSuperShot ? `rgba(255, 119, 255, ${0.4 * ballPulse})` : `rgba(0, 220, 255, ${0.5 * ballPulse})`;
      ctx.beginPath(); ctx.arc(0, 0, ballSize * 1.4, 0, Math.PI*2); ctx.fill();
      // Ball core
      ctx.fillStyle = isSuperShot ? '#ff99ff' : '#80e5ff';
      ctx.beginPath(); ctx.arc(0, 0, ballSize, 0, Math.PI*2); ctx.fill();
      // Bright inner
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, ballSize * 0.5, 0, Math.PI*2); ctx.fill();
      // Lightning arcs around the ball
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.6;
      for (let arc = 0; arc < 3; arc++) {
        const a1 = (arc / 3) * Math.PI * 2 + ballRot * 2;
        const a2 = a1 + 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a1) * ballSize, Math.sin(a1) * ballSize);
        ctx.lineTo(Math.cos(a1 + 0.25) * (ballSize + 1), Math.sin(a1 + 0.25) * (ballSize + 1));
        ctx.lineTo(Math.cos(a2) * ballSize, Math.sin(a2) * ballSize);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // ============ OGNIARZ - TWIN FUNNEL FLAME NOZZLES with pilot sparks + red glowing interior + dripping flame ============
    else if (id === 'pyro') {
      // SIMPLE single plain cylinder (enemy-style), 1 lufa
      drawMuzzleCylinder(ctx, 16, 0, 48, 0, 12, base, side, ol);
      // Small ember glow at muzzle (keeps flamethrower identity)
      const fp = 0.6 + Math.sin(now * 0.02) * 0.4;
      ctx.shadowBlur = 5; ctx.shadowColor = '#ff5520';
      ctx.fillStyle = `rgba(255, 120, 40, ${fp})`;
      ctx.beginPath(); ctx.arc(48, 0, 2.2, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // ============ SHADOW - HEXAGONAL stealth barrel integrated with armor + integrated chamfered suppressor + NO muzzle flash ============
    else if (id === 'shadow') {
      // SIMPLE plain cylinder (enemy-style)
      drawMuzzleCylinder(ctx, 15, 0, 50, 0, 11, base, side, ol);
    }

    // ============ KING - REGAL COLUMN: wide at base, tapering, with engraved red-glowing patterns + crown-shaped muzzle brake ============
    else if (id === 'king') {
      // SIMPLE longer plain cylinder (enemy-style), plain ending, NO crown, NO gem
      drawMuzzleCylinder(ctx, 15, 0, 58, 0, 12, base, side, ol, true);
      // 2 lighter rings on the barrel
      ctx.strokeStyle = c.light; ctx.lineWidth = 2.5; ctx.lineCap = 'butt';
      [30, 42].forEach(rx => { ctx.beginPath(); ctx.moveTo(rx, -6); ctx.lineTo(rx, 6); ctx.stroke(); });
      // Plain muzzle opening
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(58, 0, 3, 4.5, 0, 0, Math.PI*2); ctx.fill();
    }

    // ============ BOSS/GRUNT GENERIC TYPES (twin, standard, plasma fallback) ============
    else if (t==='twin') {
      // ART DIRECTOR FIX: Use drawMuzzleCylinder for volumetric round barrels (no shearing at angles)
      [-8, 8].forEach(yOff => {
        drawMuzzleCylinder(ctx, 16, yOff, 52, yOff, 11, base, side, ol);
      });
      if (brawler.hasYellowReflections) {
        ctx.fillStyle='#fbe54d';
        [-8,8].forEach(yOff => ctx.fillRect(30, yOff - 1.2, 18, 1.2));
      }
    }
    else {
      // ART DIRECTOR FIX: Generic standard (grunt, regular boss) as thick line
      drawMuzzleCylinder(ctx, 16, 0, 50, 0, 13, base, side, ol);
    }

    // Anime glare on barrel (skip for Shadow stealth, Tech plasma, King engraved)
    if (T.glare && id !== 'shadow' && id !== 'plasma' && id !== 'king') {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(20, -1.5, 22, 1.2);
      ctx.restore();
    }
  }

  // ============ DRAW TANK (with ALL juice effects) ============
  function drawTank(ctx, t, isSuperShot=false) {
    const b = t.brawler; const sz = b.size;

    // ART DIRECTOR'S FIX: Global lineJoin='round' for chunky toy aesthetic (no sharp 90° corners on stroked shapes)
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // NEW: Engine rumble (idle jitter) - only if NOT moving
    let rumbleY = 0;
    if (T.rumble && t.isIdle) {
      rumbleY = Math.sin(performance.now() * 0.07) * 0.7;
    }

    // NEW: Suspension pitch (siadanie/nurkowanie)
    const pitch = T.pitch ? (t.pitch || 0) : 0;
    const pitchZOffset = pitch * 3 * sz;
    const pitchTiltMul = 1.0 + pitch * 0.015;

    // NEW: Hit flash colors override
    const flashing = T.hitflash && (t.hitFlashTimer || 0) > 0;
    const flashInt = flashing ? Math.min(1, t.hitFlashTimer * 14) : 0;
    const colors = flashing ? flashColors(b.colors, flashInt * 0.85) : b.colors;

    drawDropShadow(ctx, t.x, t.y, b, isSuperShot, t.hullAngle);

    // Effective Y with rumble and pitch
    const effX = t.x;
    const effY = t.y + rumbleY - pitchZOffset;

    // 1. Treads + hull side (Z=0)
    ctx.save(); applyTransform(ctx, effX, effY, 0, t.hullAngle, sz, pitchTiltMul);
    drawTreadsAndHullSide(ctx, b, isSuperShot, t.treadShift || 0, colors);
    ctx.restore();

    // FIX #3 v4: HULL EXTRUSION (art director's drawExtrudedSolid) - eliminates "floating top"
    // Hull 3D body. drawExtrudedSolid now does per-layer applyTransform internally (rotation-safe),
    // so we pass the transform params instead of pre-applying a single rotated transform.
    if (T.spriteStack) {
      drawExtrudedSolid(ctx,
        () => drawHullPath(ctx, b.hullShape, b.hullW * 0.985, b.hullH * 0.985),
        effX, effY, 0, t.hullAngle, sz, pitchTiltMul,  // transform: stack by Z, rotate shape only
        colors.dark,         // colorSide = top of wall (just under hull top)
        colors.dark,         // colorTop (unused, skipTop:true)
        colors.outline,
        8,                   // Z height matching hull top position
        { skipTop: true, skipBottomStroke: true, colorDeep: colors.deep }  // wall gradient deep(bottom)->dark(top)
      );
    }

    // 2. Hull top (Z=8)
    ctx.save(); applyTransform(ctx, effX, effY, 8, t.hullAngle, sz, pitchTiltMul);
    drawHullTop(ctx, b, isSuperShot, colors);
    ctx.restore();

    // CAST SHADOW REMOVED (definitively): even with rotation tracking, the shadow had a FIXED
    // bottom-right offset. When the turret pointed left/up-left, the shadow stayed bottom-right =
    // on the OPPOSITE side from the barrel, so it was exposed and grew noticeable ("intensifies
    // pointing left"). The turret extrusion side wall already provides depth, so no cast shadow.

    // VALIDATED v3 (rendered + verified E/W on cube/octagon/rect): solid VISIBLE 3D body.
    // History: dark->main once read as a shadow-band, but that was the CAST SHADOW combined with it.
    // With cast shadow gone, dark->main is the right call - it gives a clearly visible side wall
    // (reads as solid bryla, not flat sandwich). skipBottomStroke stays true (no "extra layer" ring).
    // mid->main (prev attempt) was too subtle => turret looked flat. 0.5r height = enough body.
    const turretZHeight = Math.round(b.turretRadius * 0.5);
    if (T.spriteStack) {
      drawExtrudedSolid(ctx,
        () => drawTurretShape(ctx, b.turretShape, b.turretRadius),
        effX, effY, 8, t.turretAngle, sz, 1.0,  // transform: stack by Z, rotate shape only (tiltMul=1.0 per FIX #5)
        colors.main,           // colorSide = TOP of wall (melts into top face)
        colors.main,           // colorTop (unused, skipTop:true)
        colors.outline,
        turretZHeight,
        {
          skipTop: true,             // top face drawn separately by drawTurretTopBase
          skipBottomStroke: true,    // NO base outline (would create "extra layer" ring)
          colorDeep: colors.dark     // VISIBLE wall: dark(bottom) -> main(top). Reads as solid 3D body.
        }
      );
    }

    // 5. Turret top + features + barrel (with recoil applied to barrel only)
    const barrelBehind = Math.sin(t.turretAngle) < 0;
    const topZ = 8 + turretZHeight; // top of turret = hull(8) + turret height
    const recoilOffset = T.recoil ? (t.recoil || 0) * 8 * sz : 0;
    const recoilX = -Math.cos(t.turretAngle) * recoilOffset;
    const recoilY = -Math.sin(t.turretAngle) * recoilOffset * CAMERA_TILT_Y;

    const rTop = () => {
      // CORRECT ORDER: topBase FIRST (main fill + stroke = jasny top face), THEN cylinder details, THEN features icons
      // FIX #5: turret top + features tiltMul=1.0 (no pitch deformation)
      // 1. Top face (jasny lid)
      ctx.save(); applyTransform(ctx, effX, effY, topZ, t.turretAngle, sz, 1.0); drawTurretTopBase(ctx, b, isSuperShot, colors); ctx.restore();
      // 2. Side details NA top face (armor bumps, ellipse highlight, yellow reflections)
      ctx.save(); applyTransform(ctx, effX, effY, topZ, t.turretAngle, sz, 1.0); drawTurretCylinder(ctx, b, colors); ctx.restore();
      // 3. Top features (emblems, icons)
      ctx.save(); applyTransform(ctx, effX, effY, topZ, t.turretAngle, sz, 1.0); drawTurretTopFeatures(ctx, b, isSuperShot, colors); ctx.restore();
    };
    const rB = () => {
      // Recoil offset applied to barrel position
      // Pass recoil amount to brawler for in-barrel visual effects (Pancerny crossfire glow)
      b._recoilVis = t.recoil || 0;
      // FIX #5: barrel tiltMul=1.0 (no pitch deformation)
      // Barrel exits from MIDDLE of turret (between hull top and turret top)
      const barrelZ = 8 + Math.floor(turretZHeight / 2);
      ctx.save(); applyTransform(ctx, effX + recoilX, effY + recoilY, barrelZ, t.turretAngle, sz, 1.0);
      drawBarrel(ctx, b, isSuperShot, colors); ctx.restore();
    };
    if (barrelBehind) { rB(); rTop(); } else { rTop(); rB(); }

    if (isSuperShot) {
      ctx.save(); ctx.translate(effX, effY - 10);
      const p = 0.5+Math.sin(performance.now()*0.012)*0.5;
      ctx.fillStyle = `rgba(217,70,239,${0.18*p})`;
      ctx.beginPath(); ctx.ellipse(0,0,70*sz,26*sz,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  // ============ NEW: WRECK + FLYING TURRET RENDERERS ============
  function drawWreck(ctx, e) {
    const t01 = e.life / e.maxLife;
    const sinkY = (1 - t01) * 3;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t01 * 1.5);
    // Dark sink ellipse under
    ctx.fillStyle = `rgba(10, 5, 0, ${0.5 * t01})`;
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 6, (e.brawler.hullW * 0.6) * e.brawler.size, (e.brawler.hullH * 0.45) * e.brawler.size, 0, 0, Math.PI*2); ctx.fill();
    // Charred hull
    const charredColors = { main:'#2a1a1a', light:'#3a2a2a', bright:'#4a3838', dark:'#1a0a0a', deep:'#0a0505', outline:'#000000' };
    ctx.save(); applyTransform(ctx, e.x, e.y + sinkY, 0, e.hullAngle, e.brawler.size);
    drawTreadsAndHullSide(ctx, e.brawler, false, 0, charredColors);
    ctx.restore();
    ctx.save(); applyTransform(ctx, e.x, e.y + sinkY, 8, e.hullAngle, e.brawler.size);
    // Just draw hull top, no rivets, no glare
    ctx.fillStyle = '#2a1a1a';
    drawHullPath(ctx, e.brawler.hullShape, e.brawler.hullW, e.brawler.hullH); ctx.fill();
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5; ctx.stroke();
    // Smoke holes
    ctx.fillStyle = '#000000';
    for (let i=0; i<3; i++) {
      const px = (Math.sin(i*1.7)) * (e.brawler.hullW * 0.3);
      const py = (Math.cos(i*2.3)) * (e.brawler.hullH * 0.25);
      ctx.beginPath(); ctx.arc(px, py, 3 + (i%2), 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
    // Ember glow (fading)
    if (t01 > 0.5) {
      const emberGlow = (t01 - 0.5) * 2;
      ctx.fillStyle = `rgba(255, 100, 30, ${emberGlow * 0.4})`;
      ctx.beginPath(); ctx.arc(e.x, e.y + sinkY, 8, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  function drawFlyingTurret(ctx, e) {
    const screenY = e.y - e.z * Z_TO_SCREEN;
    // Shadow on ground
    const shadowSize = Math.max(0.2, 1 - (-e.z) / 100);
    ctx.fillStyle = `rgba(10, 5, 20, ${0.4 * shadowSize})`;
    ctx.beginPath(); ctx.ellipse(e.x, e.y, 18 * e.brawler.size * shadowSize, 7 * e.brawler.size * shadowSize, 0, 0, Math.PI*2); ctx.fill();
    // Draw rotating turret + barrel at elevated screen position
    ctx.save();
    ctx.translate(e.x, screenY);
    ctx.scale(1, CAMERA_TILT_Y);
    ctx.rotate(e.rotation);
    ctx.scale(e.brawler.size, e.brawler.size);
    // Cylinder
    drawTurretCylinder(ctx, e.brawler);
    // Top
    drawTurretTopBase(ctx, e.brawler, false);
    // Features (with original turret angle relative)
    ctx.save();
    drawTurretTopFeatures(ctx, e.brawler, false);
    ctx.restore();
    // Barrel
    drawBarrel(ctx, e.brawler, false);
    ctx.restore();
  }

  function drawTreadMark(ctx, e) {
    if (!T.treadmark) return;
    const t01 = e.life / e.maxLife;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    ctx.fillStyle = `rgba(60, 40, 20, ${t01 * 0.32})`;
    ctx.fillRect(-e.w/2, -e.h/2, e.w, e.h);
    // Inner darker stroke for depth
    ctx.fillStyle = `rgba(40, 25, 10, ${t01 * 0.2})`;
    ctx.fillRect(-e.w/2 + 1, -e.h/2 + 0.5, e.w - 2, e.h - 1);
    ctx.restore();
  }

  // ============ BULLETS ============
  function bulletTrail(ctx, b, color, len, width) {
    const tx = b.x - b.vx*len, ty = b.y - b.vy*len;
    const g = ctx.createLinearGradient(b.x, b.y, tx, ty);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = g; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke();
  }
  function roundedPoly(ctx, pts, r) {
    const n = pts.length; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i-1+n)%n], p1 = pts[i], p2 = pts[(i+1)%n];
      const v1x = p0.x-p1.x, v1y = p0.y-p1.y, v2x = p2.x-p1.x, v2y = p2.y-p1.y;
      const l1 = Math.hypot(v1x,v1y), l2 = Math.hypot(v2x,v2y), rr = Math.min(r, l1/2, l2/2);
      const ax = p1.x+v1x/l1*rr, ay = p1.y+v1y/l1*rr, bx = p1.x+v2x/l2*rr, by = p1.y+v2y/l2*rr;
      if (i === 0) ctx.moveTo(ax,ay); else ctx.lineTo(ax,ay);
      ctx.quadraticCurveTo(p1.x, p1.y, bx, by);
    }
    ctx.closePath();
  }
  // Flame comet: fiery head + elongated tail + spark particles + smoke (Ogniarz)
  function drawFlameComet(ctx, b, big) {
    const s = b.size * (big ? 1.7 : 1.0);
    const NOW = performance.now();
    const fl = 0.7 + Math.sin(NOW * 0.03 + b.phaseOffset) * 0.3;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const bx = -b.vx / sp, by = -b.vy / sp;   // back direction
    const px = -by, py = bx;                  // perpendicular
    // smoke puffs (furthest back)
    for (let i = 3; i <= 4; i++) { const ox = b.x + bx * s * i * 1.3, oy = b.y + by * s * i * 1.3; ctx.fillStyle = `rgba(70,62,56,${0.16 - (i - 3) * 0.05})`; ctx.beginPath(); ctx.arc(ox, oy, s * (1.3 - (i - 3) * 0.25), 0, Math.PI * 2); ctx.fill(); }
    // fiery tail (head -> back)
    for (let i = 5; i >= 1; i--) { const ox = b.x + bx * s * i * 0.8, oy = b.y + by * s * i * 0.8; const a = (1 - i / 6); ctx.fillStyle = `rgba(255,${80 + i * 22},20,${a * 0.55 * fl})`; ctx.beginPath(); ctx.arc(ox, oy, s * (1.45 - i * 0.2), 0, Math.PI * 2); ctx.fill(); }
    // head: red -> orange -> yellow -> white core
    ctx.fillStyle = `rgba(255,70,20,${0.9 * fl})`; ctx.beginPath(); ctx.arc(b.x, b.y, s * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.arc(b.x, b.y, s * 0.82, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(b.x - bx * s * 0.12, b.y - by * s * 0.12, s * 0.48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3c8'; ctx.beginPath(); ctx.arc(b.x - bx * s * 0.18, b.y - by * s * 0.18, s * 0.24, 0, Math.PI * 2); ctx.fill();
    // spark particles streaming down the tail
    const nSp = big ? 5 : 3;
    for (let i = 0; i < nSp; i++) { const t2 = ((NOW * 0.012 + b.phaseOffset + i * 1.7) % 1); const off = Math.sin(NOW * 0.02 + i * 2.3) * s * 0.55; const ox = b.x + bx * s * 4.5 * t2 + px * off; const oy = b.y + by * s * 4.5 * t2 + py * off; ctx.fillStyle = `rgba(255,225,130,${(1 - t2) * 0.85})`; ctx.beginPath(); ctx.arc(ox, oy, s * 0.15, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawBullet(ctx, b) {
    const t = b.type;
    const NOW = performance.now();
    // TWARDY: arrowhead/grot + trail + 2.5D facet (breaks into shotgun frags after 200px - see update loop)
    if (t==='tracer'){const a=Math.atan2(b.vy,b.vx);const s=b.size*2.0;const col=b.isSuper?['#0d5226','#1a8f3a','#3fb85f']:['#1f7a47','#2ecc71','#7ef0a8'];bulletTrail(ctx,b,b.isSuper?'rgba(26,143,58,0.55)':'rgba(77,209,135,0.55)',0.06,s*1.08);ctx.save();ctx.translate(b.x,b.y);ctx.rotate(a);ctx.fillStyle=col[0];roundedPoly(ctx,[{x:s*1.4,y:0},{x:-s*0.7,y:s*0.85},{x:-s*0.7,y:-s*0.85}],s*0.52);ctx.fill();ctx.fillStyle=col[1];roundedPoly(ctx,[{x:s*1.15,y:0},{x:-s*0.5,y:s*0.6},{x:-s*0.5,y:-s*0.6}],s*0.44);ctx.fill();ctx.fillStyle=col[2];ctx.beginPath();ctx.moveTo(s*1.0,0);ctx.lineTo(-s*0.4,-s*0.5);ctx.lineTo(-s*0.1,-s*0.1);ctx.closePath();ctx.fill();ctx.restore();}
    // TWARDY shotgun fragments (smaller arrowheads)
    else if (t==='tracer_frag'){const a=Math.atan2(b.vy,b.vx);const s=b.size*1.6;const al=Math.min(1,b.life/0.5);ctx.globalAlpha=al;bulletTrail(ctx,b,'rgba(77,209,135,0.4)',0.05,s*0.8);ctx.save();ctx.translate(b.x,b.y);ctx.rotate(a);ctx.fillStyle='#1f7a47';ctx.beginPath();ctx.moveTo(s*1.4,0);ctx.lineTo(-s*0.6,s*0.8);ctx.lineTo(-s*0.6,-s*0.8);ctx.closePath();ctx.fill();ctx.fillStyle='#2ecc71';ctx.beginPath();ctx.moveTo(s*1.1,0);ctx.lineTo(-s*0.4,s*0.55);ctx.lineTo(-s*0.4,-s*0.55);ctx.closePath();ctx.fill();ctx.restore();ctx.globalAlpha=1;}
    // PANCERNY: purple crystal shard + glow + trail + 2.5D facets + bright core
    else if (t==='shell'){const a=Math.atan2(b.vy,b.vx);const s=b.size;const col=b.isSuper?['#a020bf','#7c0eaa','#ffccff']:['#9b30d0','#5e1a7a','#d89bf0'];ctx.fillStyle='rgba(155,48,208,0.3)';ctx.beginPath();ctx.arc(b.x,b.y,s*1.8,0,Math.PI*2);ctx.fill();bulletTrail(ctx,b,'rgba(155,48,208,0.5)',0.05,s*1.1);ctx.save();ctx.translate(b.x,b.y);ctx.rotate(a);ctx.fillStyle=col[1];ctx.beginPath();ctx.moveTo(s*1.7,0);ctx.lineTo(0,s*0.9);ctx.lineTo(-s*1.2,0);ctx.lineTo(0,-s*0.9);ctx.closePath();ctx.fill();ctx.fillStyle=col[0];ctx.beginPath();ctx.moveTo(s*1.5,0);ctx.lineTo(0,s*0.7);ctx.lineTo(-s*1.0,0);ctx.lineTo(0,-s*0.7);ctx.closePath();ctx.fill();ctx.fillStyle=col[2];ctx.beginPath();ctx.moveTo(s*1.5,0);ctx.lineTo(0,-s*0.7);ctx.lineTo(-s*1.0,0);ctx.closePath();ctx.fill();ctx.fillStyle='#ffffff';ctx.beginPath();ctx.ellipse(s*0.2,0,s*0.5,s*0.3,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    // ZWIAD: spinning boomerang (AAA) - bent V, 2.5D, trail
    else if (t==='quick'){const s=b.size;const spin=NOW*0.025+b.phaseOffset;bulletTrail(ctx,b,'rgba(220,150,20,0.5)',0.07,s*0.7);ctx.save();ctx.translate(b.x,b.y);ctx.rotate(spin);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#5a3d08';ctx.lineWidth=s*0.85;ctx.beginPath();ctx.moveTo(-s*0.9,s*0.5);ctx.lineTo(0,-s*0.6);ctx.lineTo(s*0.9,s*0.5);ctx.stroke();ctx.strokeStyle='#e8a91a';ctx.lineWidth=s*0.55;ctx.beginPath();ctx.moveTo(-s*0.9,s*0.5);ctx.lineTo(0,-s*0.6);ctx.lineTo(s*0.9,s*0.5);ctx.stroke();ctx.strokeStyle='#ffd860';ctx.lineWidth=s*0.22;ctx.beginPath();ctx.moveTo(-s*0.8,s*0.35);ctx.lineTo(0,-s*0.45);ctx.lineTo(s*0.8,s*0.35);ctx.stroke();ctx.restore();}
    // SNAJPER: bigger laser beam (wider +20%)
    else if (t==='laser'){const a=Math.atan2(b.vy,b.vx);const s=b.size;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(a);ctx.fillStyle='rgba(52,152,219,0.35)';ctx.beginPath();ctx.ellipse(0,0,s,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3498db';ctx.beginPath();ctx.ellipse(0,0,s*0.9,3,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff';ctx.beginPath();ctx.ellipse(0,0,s*0.7,1.2,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    // TECH: plasma + premium cyan trail + glow + BLUE ELECTRIC crackle arcs
    else if (t==='plasma'){const s=b.size;const pul=0.8+Math.sin(NOW*0.01)*0.2;bulletTrail(ctx,b,'rgba(0,212,255,0.6)',0.08,s*1.4);ctx.fillStyle='rgba(0,212,255,0.4)';ctx.beginPath();ctx.arc(b.x,b.y,s*2.0*pul,0,Math.PI*2);ctx.fill();ctx.fillStyle='#00d4ff';ctx.beginPath();ctx.arc(b.x,b.y,s,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(b.x-1,b.y-1,s*0.45,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(150,240,255,0.9)';ctx.lineWidth=1.3;ctx.lineCap='round';for(let k=0;k<3;k++){const baseAng=NOW*0.018+k*2.094+b.phaseOffset;ctx.beginPath();let r0=s*1.0,px=b.x+Math.cos(baseAng)*r0,py=b.y+Math.sin(baseAng)*r0;ctx.moveTo(px,py);for(let j=1;j<=3;j++){const r=r0+s*1.3*(j/3),a2=baseAng+Math.sin(NOW*0.04+k*3.7+j*5.5)*0.45;px=b.x+Math.cos(a2)*r;py=b.y+Math.sin(a2)*r;ctx.lineTo(px,py);}ctx.stroke();ctx.fillStyle='rgba(200,250,255,0.95)';ctx.beginPath();ctx.arc(px,py,1.2,0,Math.PI*2);ctx.fill();}}
    // OGNIARZ: AAA layered fire (red->orange->yellow->white core, flicker) + smoking cloud behind
    else if (t==='flame'){drawFlameComet(ctx,b,false);}
    // SHADOW: spinning silver triangle (+50% size) + trail + 2.5D facets
    else if (t==='shadow_bullet'){const s=b.size*2.4*1.25;const spin=NOW*0.02+b.phaseOffset;bulletTrail(ctx,b,'rgba(185,190,205,0.35)',0.05,s*0.5);ctx.save();ctx.translate(b.x,b.y);ctx.rotate(spin);const star4=(rO,rI)=>{ctx.beginPath();for(let i=0;i<8;i++){const ang=i/8*Math.PI*2;const r=(i%2===0)?rO:rI;const qx=Math.cos(ang)*r,qy=Math.sin(ang)*r;i===0?ctx.moveTo(qx,qy):ctx.lineTo(qx,qy);}ctx.closePath();};ctx.fillStyle='#33373f';star4(s,s*0.42);ctx.fill();ctx.fillStyle='#8f95a4';star4(s*0.9,s*0.4);ctx.fill();ctx.fillStyle='#c4cad6';star4(s*0.66,s*0.34);ctx.fill();ctx.fillStyle='#eef1f6';star4(s*0.4,s*0.24);ctx.fill();ctx.strokeStyle='#21242b';ctx.lineWidth=s*0.06;star4(s,s*0.42);ctx.stroke();ctx.fillStyle='#23262e';ctx.beginPath();ctx.arc(0,0,s*0.19,0,Math.PI*2);ctx.fill();ctx.fillStyle='#454a55';ctx.beginPath();ctx.arc(0,0,s*0.1,0,Math.PI*2);ctx.fill();ctx.restore();}
    // KING: orange-gold + orbiting mini energy wave (2 arcs) + 2.5D highlight
    else if (t==='gold'){const s=b.size;const orb=NOW*0.012+b.phaseOffset;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(orb);ctx.strokeStyle='rgba(255,180,40,0.85)';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(s*1.7,0,s*0.7,Math.PI*0.5,Math.PI*1.5);ctx.stroke();ctx.restore();ctx.save();ctx.translate(b.x,b.y);ctx.rotate(orb+Math.PI);ctx.strokeStyle='rgba(255,140,20,0.6)';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(s*1.7,0,s*0.6,Math.PI*0.5,Math.PI*1.5);ctx.stroke();ctx.restore();ctx.fillStyle='rgba(255,150,30,0.4)';ctx.beginPath();ctx.arc(b.x,b.y,s*1.6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff9c1a';ctx.beginPath();ctx.arc(b.x,b.y,s,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#9c5410';ctx.lineWidth=0.8;ctx.stroke();ctx.fillStyle='#ffe0a0';ctx.beginPath();ctx.arc(b.x-s*0.25,b.y-s*0.25,s*0.4,0,Math.PI*2);ctx.fill();}
    else if (t==='enemy_basic'){ctx.fillStyle='rgba(200,60,50,0.4)';ctx.beginPath();ctx.arc(b.x,b.y,b.size*1.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d4443d';ctx.strokeStyle='#5a1810';ctx.lineWidth=1;ctx.beginPath();ctx.arc(b.x,b.y,b.size,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#ff8866';ctx.beginPath();ctx.arc(b.x-1.5,b.y-1.5,b.size*0.4,0,Math.PI*2);ctx.fill();}
    else if (t==='boss_shell'){const a=Math.atan2(b.vy,b.vx);ctx.save();ctx.translate(b.x,b.y);ctx.rotate(a);ctx.fillStyle='#9b59b6';ctx.strokeStyle='#4a1f5e';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,b.size*1.4,b.size*0.85,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#bd84d4';ctx.beginPath();ctx.ellipse(0,-b.size*0.3,b.size,b.size*0.3,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    else if (t==='mega_shell'){const a=Math.atan2(b.vy,b.vx);ctx.save();ctx.translate(b.x,b.y);ctx.rotate(a);ctx.fillStyle='#f1c40f';ctx.strokeStyle='#7a5a05';ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(0,0,b.size*1.5,b.size,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff200';ctx.beginPath();ctx.ellipse(0,-b.size*0.3,b.size*1.2,b.size*0.4,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    else if (t==='super_mega_shell'){const a=Math.atan2(b.vy,b.vx);const pulse=0.5+Math.sin(performance.now()*0.015)*0.5;ctx.strokeStyle=`rgba(217,70,239,${0.4+pulse*0.3})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,b.size*2.5+pulse*4,0,Math.PI*2);ctx.stroke();ctx.save();ctx.translate(b.x,b.y);ctx.rotate(a);ctx.fillStyle='#d946ef';ctx.strokeStyle='#7c0eaa';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,b.size*1.8,b.size,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#ffaaff';ctx.beginPath();ctx.ellipse(0,-b.size*0.3,b.size*1.5,b.size*0.4,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    else if (t==='super_laser'){const a=Math.atan2(b.vy,b.vx);ctx.save();ctx.translate(b.x,b.y);ctx.rotate(a);ctx.fillStyle='rgba(217,70,239,0.24)';ctx.beginPath();ctx.ellipse(0,0,b.size*0.78,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(217,70,239,0.7)';ctx.beginPath();ctx.ellipse(0,0,b.size*0.9,4,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff';ctx.beginPath();ctx.ellipse(0,0,b.size*0.8,1.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    else if (t==='super_plasma_wave'){const t01=1-b.life/b.maxLife;const radius=t01*180;ctx.strokeStyle=`rgba(0,212,255,${1-t01})`;ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(b.x,b.y,radius,radius*0.7,0,0,Math.PI*2);ctx.stroke();}
    else if (t==='super_flame'){drawFlameComet(ctx,b,true);}
    else if (t==='super_shadow'){const phase=Math.sin(performance.now()*0.02+b.phaseOffset)*0.5+0.5;ctx.fillStyle=`rgba(60,50,100,${0.4+phase*0.5})`;ctx.beginPath();ctx.arc(b.x,b.y,b.size,0,Math.PI*2);ctx.fill();ctx.strokeStyle=`rgba(217,70,239,${phase})`;ctx.lineWidth=1.5;ctx.stroke();}
    else if (t==='super_gold'){ctx.fillStyle='rgba(244,200,66,0.5)';ctx.beginPath();ctx.arc(b.x,b.y,b.size*2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff200';ctx.beginPath();ctx.arc(b.x,b.y,b.size,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#8b6914';ctx.lineWidth=1;ctx.stroke();}
  }

  // ============ P1 SPRITE BAKER: rozdzielone warstwy (wyciete 1:1 z drawTank) ============
  // bakeHullLayer = drop shadow + treads/side + hull extrusion + hull top. BEZ turret.
  // Zalezy WYLACZNIE od t.hullAngle. Flaga wygaszana przez t.brawler.flag=null (caller).
  function bakeHullLayer(ctx, t, isSuperShot=false) {
    const b = t.brawler; const sz = b.size;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let rumbleY = 0;
    if (T.rumble && t.isIdle) {
      rumbleY = Math.sin(performance.now() * 0.07) * 0.7;
    }
    const pitch = T.pitch ? (t.pitch || 0) : 0;
    const pitchZOffset = pitch * 3 * sz;
    const pitchTiltMul = 1.0 + pitch * 0.015;
    const flashing = T.hitflash && (t.hitFlashTimer || 0) > 0;
    const flashInt = flashing ? Math.min(1, t.hitFlashTimer * 14) : 0;
    const colors = flashing ? flashColors(b.colors, flashInt * 0.85) : b.colors;

    drawDropShadow(ctx, t.x, t.y, b, isSuperShot, t.hullAngle);

    const effX = t.x;
    const effY = t.y + rumbleY - pitchZOffset;

    ctx.save(); applyTransform(ctx, effX, effY, 0, t.hullAngle, sz, pitchTiltMul);
    drawTreadsAndHullSide(ctx, b, isSuperShot, t.treadShift || 0, colors);
    ctx.restore();

    if (T.spriteStack) {
      drawExtrudedSolid(ctx,
        () => drawHullPath(ctx, b.hullShape, b.hullW * 0.985, b.hullH * 0.985),
        effX, effY, 0, t.hullAngle, sz, pitchTiltMul,
        colors.dark, colors.dark, colors.outline, 8,
        { skipTop: true, skipBottomStroke: true, colorDeep: colors.deep }
      );
    }

    ctx.save(); applyTransform(ctx, effX, effY, 8, t.hullAngle, sz, pitchTiltMul);
    drawHullTop(ctx, b, isSuperShot, colors);
    ctx.restore();
  }

  // bakeTurretLayer = turret extrusion + top + barrel (z barrelBehind). BEZ hulla/shadow.
  // Zalezy WYLACZNIE od t.turretAngle.
  function bakeTurretLayer(ctx, t, isSuperShot=false) {
    const b = t.brawler; const sz = b.size;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    let rumbleY = 0;
    if (T.rumble && t.isIdle) {
      rumbleY = Math.sin(performance.now() * 0.07) * 0.7;
    }
    const pitch = T.pitch ? (t.pitch || 0) : 0;
    const pitchZOffset = pitch * 3 * sz;
    const flashing = T.hitflash && (t.hitFlashTimer || 0) > 0;
    const flashInt = flashing ? Math.min(1, t.hitFlashTimer * 14) : 0;
    const colors = flashing ? flashColors(b.colors, flashInt * 0.85) : b.colors;

    const effX = t.x;
    const effY = t.y + rumbleY - pitchZOffset;

    const turretZHeight = Math.round(b.turretRadius * 0.5);
    if (T.spriteStack) {
      drawExtrudedSolid(ctx,
        () => drawTurretShape(ctx, b.turretShape, b.turretRadius),
        effX, effY, 8, t.turretAngle, sz, 1.0,
        colors.main, colors.main, colors.outline, turretZHeight,
        { skipTop: true, skipBottomStroke: true, colorDeep: colors.dark }
      );
    }

    const barrelBehind = Math.sin(t.turretAngle) < 0;
    const topZ = 8 + turretZHeight;
    const recoilOffset = T.recoil ? (t.recoil || 0) * 8 * sz : 0;
    const recoilX = -Math.cos(t.turretAngle) * recoilOffset;
    const recoilY = -Math.sin(t.turretAngle) * recoilOffset * CAMERA_TILT_Y;

    const rTop = () => {
      ctx.save(); applyTransform(ctx, effX, effY, topZ, t.turretAngle, sz, 1.0); drawTurretTopBase(ctx, b, isSuperShot, colors); ctx.restore();
      ctx.save(); applyTransform(ctx, effX, effY, topZ, t.turretAngle, sz, 1.0); drawTurretCylinder(ctx, b, colors); ctx.restore();
      ctx.save(); applyTransform(ctx, effX, effY, topZ, t.turretAngle, sz, 1.0); drawTurretTopFeatures(ctx, b, isSuperShot, colors); ctx.restore();
    };
    const rB = () => {
      b._recoilVis = t.recoil || 0;
      const barrelZ = 8 + Math.floor(turretZHeight / 2);
      ctx.save(); applyTransform(ctx, effX + recoilX, effY + recoilY, barrelZ, t.turretAngle, sz, 1.0);
      drawBarrel(ctx, b, isSuperShot, colors); ctx.restore();
    };
    if (barrelBehind) { rB(); rTop(); } else { rTop(); rB(); }
  }

// ---- ES exports (lab uzywa drawTank + drawBullet + configow + getMuzzlePos) ----
export {
  drawTank, bakeHullLayer, bakeTurretLayer, drawBullet, bulletTrail, roundedPoly,
  BRAWLERS, GRUNT, REGULAR_BOSS, MEGA_BOSS,
  derive, T, applyTransform, drawMuzzleCylinder, getMuzzlePos,
  CAMERA_TILT_Y, Z_TO_SCREEN, FLAGS, drawFlag,
};