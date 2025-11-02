(() => {
  'use strict';

  // ===== Ads (safe stub with real test ID placeholder) =====
  const REWARDED = {
    enabled: true,
    provider: 'stub',
    testAdUnitId: 'ca-app-pub-3940256099942544/5224354917',
    minShowMs: 2000
  };

  // ===== Config =====
  const CONFIG = {
    arcadeDuration: 30_000,
    survivalLives: 3,

    // matching tolerance (scale only)
    targetToleranceScaleStart: 0.10,
    minToleranceScale: 0.035,
    tighten: 0.965,              // jemnější zpřesňování

    // growth
    growthPerSecond: 0.62,       // jemněji

    // visual spin (same for all outlines)
    spinDegPerSecond: 40,

    // warp/background
    starsCountNear: 300,
    starsCountFar: 240,
    warpBase: 0.014,
    warpPerLevel: 0.0012,

    // „komety“ = jasné streaky letící ze středu k hráči
    streakChancePerSec: 0.22,   // jak často startují (≈/s)
    streakLifeMs: 1800,         // život streaku v ms

    // targets motion
    targetBaseSpeed: 0.06,       // px/ms (scaled by DPR)
    targetSpeedPerLevel: 0.004,

    // random background life
    flashEveryMinMs: 4200,
    flashEveryMaxMs: 7600,
    cometChancePerSec: 0.38,

    // combo
    comboEvery: 5,
    comboPoints: 10,
    comboTimeBonusMs: 5000,      // +5s (Arcade only)

    // rewarded one-time bonuses for next run
    bonusArcadeMs: 15_000,
    bonusSurvivalLives: 2,

    // target scale range
    minScale: 0.55,
    maxScale: 1.15,

    // outline visuals
    outlineWidth: 6
  };

  // ===== State =====
  const S = {
    mode: 'arcade',
    running: false,
    level: 1,
    score: 0,
    bestArcade: Number(localStorage.getItem('bestArcade') || 0),
    bestSurvival: Number(localStorage.getItem('bestSurvival') || 0),
    lives: CONFIG.survivalLives,
    combo: 0,

    successes: 0,               // zásahy pro zvyšování počtu hvězd
    decoyCount: 1,              // 1..5

    startTime: 0,
    remaining: CONFIG.arcadeDuration,
    runDurationArcade: CONFIG.arcadeDuration,

    baseAngle: 0,
    targetScale: 1,

    // Player growth
    playerScale: 0,
    playerVisible: false,

    // active star index & its pos
    activeIndex: 0,

    // for warp & comets
    center: { x: 0, y: 0 },

    // tolerance
    tolScale: CONFIG.targetToleranceScaleStart,

    // one-time next-run bonuses
    nextRunBonusTimeMs: 0,
    nextRunBonusLives: 0,
  };

  // ===== Elements =====
  const $ = s => document.querySelector(s);
  const menuEl = $('#menu'), gameEl = $('#game'), overEl = $('#gameover');
  const space = $('#space'), play = $('#gameplay');
  const ctxSpace = space.getContext('2d'), ctxPlay = play.getContext('2d');
  const scoreEl = $('#score'), levelEl = $('#level'), livesEl = $('#lives');
  const timerEl = $('#timer'), ringFg = document.querySelector('.ring .fg');
  const thrustBtn = $('#thrustBtn'), toastEl = $('#readyGo'), modeTagEl = $('#modeTag');
  const finalScoreEl = $('#finalScore'), finalBestEl = $('#finalBest');
  const lerp = (a,b,t)=> a + (b-a)*t;


  const bonusBtn = $('#bonusBtn');
  const againNoBonusBtn = $('#againNoBonusBtn');
  const menuBtn = $('#menuBtn');

  // Ad overlay
  const adOverlay = $('#adOverlay');
  const adStatus  = $('#adStatus');
  const adClose   = $('#adClose');
  if (adOverlay) adOverlay.hidden = true;
  if (adClose) adClose.disabled = true;

  // audio
  const sfxExplosion = $('#sfxExplosion'), sfxFail = $('#sfxFail'), sfxHold = $('#sfxHold'), bgAmbient = $('#bgAmbient');
  sfxHold.loop = true; sfxHold.volume = 0.45; bgAmbient.volume = 0.28;

  // ===== Canvas sizing =====
  const DPR = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  const bounds = { w: 0, h: 0, top: 0, bottom: 0, left: 0, right: 0, panelTop: 0 };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));


  function resize(){
    const w = Math.floor(innerWidth * DPR);
    const h = Math.floor(innerHeight * DPR);

    [space, play].forEach(c => {
      c.width = w; c.height = h;
      c.style.width = innerWidth + 'px';
      c.style.height = innerHeight + 'px';
    });

    bounds.w = w; bounds.h = h;
    const marginTop = 10 * DPR;           // už skoro až k horní hraně telefonu
    const cockpitH = 150 * DPR;           // horní hrana kokpitu, do které se odrážíme
    bounds.top = marginTop;
    bounds.bottom = h - cockpitH;
    bounds.left = 20 * DPR;
    bounds.right = w - 20 * DPR;
    bounds.panelTop = bounds.bottom;      // pro odraz

    // přibližně střed obrazovky
    S.center.x = w/2;
    S.center.y = h/2 - 90*DPR;
  }
  resize();
  window.addEventListener('resize', resize);

  // ===== Warp & background life =====
let starsNear = [], starsFar = [];
const makeStar = (speedMul=1) => {
  const a = Math.random()*Math.PI*2, r = Math.random()*1;
  const speed = (CONFIG.warpBase + (S.level-1)*CONFIG.warpPerLevel) * speedMul;
  return { x: Math.cos(a)*(0.2+r), y: Math.sin(a)*(0.2+r), z: Math.random()*1+0.1, px:0, py:0, speed };
};
function initStarfield(){
  starsNear = Array.from({length: CONFIG.starsCountNear}, () => makeStar(1.2));
  starsFar  = Array.from({length: CONFIG.starsCountFar }, () => makeStar(0.6));
}

// === NOVÉ „STREAKY“ (jasné komety ze středu ven) ===
const streaks = [];
function spawnStreak(){
  const angle = Math.random()*Math.PI*2;
  const z0 = 0.9; // začíná „hlouběji“, ať má dlouhou stopu
  const zVel = (CONFIG.warpBase + (S.level-1)*CONFIG.warpPerLevel) * 1.8; // rychlejší než běžné hvězdy
  streaks.push({ a: angle, z: z0, zv: zVel, px:0, py:0, age:0, life: CONFIG.streakLifeMs });
}

// decentní „twinkle“ záblesky v dálce
const twinkles = [];
function spawnTwinkle(){
  const x = Math.random()*bounds.w;
  const y = bounds.top + Math.random()*(bounds.bottom - bounds.top);
  const life = 900 + Math.random()*1200;
  twinkles.push({ x, y, age: 0, life });
}


  let nextFlashAt = 0;
  function scheduleFlash(now){
    const delta = CONFIG.flashEveryMinMs + Math.random()*(CONFIG.flashEveryMaxMs - CONFIG.flashEveryMinMs);
    nextFlashAt = now + delta;
  }
  scheduleFlash(performance.now());

function drawWarpAndLife(dt, now){
  const w = space.width, h = space.height;
  ctxSpace.clearRect(0,0,w,h);

  // hlubší mlhovina (větší poloměr + výraznější parallax)
  const t = now * 0.00006;
  const g = ctxSpace.createRadialGradient(
    w*.5 + Math.cos(t)*120*DPR, h*.28 + Math.sin(t*1.35)*90*DPR, 160*DPR,
    w*.5, h*.5, Math.max(w,h)*0.9
  );
  g.addColorStop(0,'rgba(112,163,255,.06)');
  g.addColorStop(.5,'rgba(84,224,255,.05)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctxSpace.fillStyle = g; ctxSpace.fillRect(0,0,w,h);

  // hvězdné vrstvy (far + near) – warp čáry ze středu
  ctxSpace.save(); ctxSpace.translate(S.center.x, S.center.y);
  const drawLayer = (arr, thickness=1.3) => {
    for(let s of arr){
      s.z -= s.speed * (dt/16.67);
      if(s.z <= 0.05){ Object.assign(s, makeStar(s.speed>1 ? 1.2 : 0.6)); continue; }
      const f = 1/s.z, x = s.x*f*h*.42, y = s.y*f*h*.42;
      ctxSpace.beginPath();
      ctxSpace.strokeStyle = `hsla(${190+(1-s.z)*80},100%,70%,${0.28+(1-s.z)*0.50})`;
      ctxSpace.lineWidth = Math.min(3*DPR,(thickness+(1-s.z)*1.6)*DPR);
      ctxSpace.moveTo(s.px||x, s.py||y); ctxSpace.lineTo(x,y); ctxSpace.stroke();
      s.px=x; s.py=y;
    }
  };
  drawLayer(starsFar, 1.0);
  drawLayer(starsNear, 1.6);

  // === JASNÉ STREAKY (komety) – ze středu ven, stejné směrování jako hvězdy ===
  if (Math.random() < CONFIG.streakChancePerSec * (dt/1000)) spawnStreak();

  for (let i = streaks.length-1; i>=0; i--){
    const s = streaks[i];
    s.age += dt;
    s.z -= s.zv * (dt/16.67);
    if (s.z <= 0.05 || s.age > s.life){ streaks.splice(i,1); continue; }

    const f = 1/s.z;
    const x = Math.cos(s.a)*f*h*.42;
    const y = Math.sin(s.a)*f*h*.42;

    // trail
    ctxSpace.beginPath();
    ctxSpace.strokeStyle = `rgba(160,205,255,0.85)`;
    ctxSpace.lineCap = 'round';
    ctxSpace.lineWidth = 3.2*DPR;
    ctxSpace.moveTo(s.px||x, s.py||y);
    ctxSpace.lineTo(x,y);
    ctxSpace.stroke();

    // head glow
    const hx = x, hy = y;
    const head = ctxSpace.createRadialGradient(hx,hy,0,hx,hy,8*DPR);
    head.addColorStop(0,'rgba(255,255,255,.95)');
    head.addColorStop(1,'rgba(84,224,255,0)');
    ctxSpace.fillStyle = head;
    ctxSpace.beginPath(); ctxSpace.arc(hx,hy,7*DPR,0,Math.PI*2); ctxSpace.fill();

    s.px = x; s.py = y;
  }
  ctxSpace.restore();

  // jemné twinkles (živější prostor, ne jen černo)
  if (Math.random() < 0.12 * (dt/1000)) spawnTwinkle();
  for (let i=twinkles.length-1; i>=0; i--){
    const tnk = twinkles[i];
    tnk.age += dt;
    const p = tnk.age/tnk.life;
    if (p >= 1){ twinkles.splice(i,1); continue; }
    const pulse = 1 - Math.abs(2*p - 1); // nahoru-dolů
    const r = (3 + 6*pulse) * DPR;
    const alpha = 0.25 + 0.45*pulse;
    const g2 = ctxSpace.createRadialGradient(tnk.x,tnk.y,0,tnk.x,tnk.y,r);
    g2.addColorStop(0,`rgba(160,205,255,${alpha})`);
    g2.addColorStop(1,'rgba(160,205,255,0)');
    ctxSpace.fillStyle = g2;
    ctxSpace.beginPath(); ctxSpace.arc(tnk.x, tnk.y, r, 0, Math.PI*2); ctxSpace.fill();
  }

  // občasný jemný „screen flash“ jako dřív
  if (now >= nextFlashAt){ screenFlash(0.18); shake(); scheduleFlash(now); }
}


  // ===== Star geometry (sharp with rounded joins) =====
  function buildStarPath(ctx, points = 5, outerR, innerR, rotationRad = -Math.PI/2) {
    const step = Math.PI / points;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = (i % 2 === 0) ? outerR : innerR;
      const ang = rotationRad + i * step;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // ===== Targets (decoy stars) =====
  const targets = []; // {x,y,vx,vy}
  function placeTargets(count){
    targets.length = 0;
    const r = currentTargetRadius();
    const attemptsMax = 4000;

    for(let i=0;i<count;i++){
      let ok=false, attempts=0, x,y;
      while(!ok && attempts<attemptsMax){
        attempts++;
        x = bounds.left + r + Math.random()*(bounds.right - bounds.left - 2*r);
        y = bounds.top + r + Math.random()*(bounds.bottom - bounds.top - 2*r);
        ok = true;
        for(const t of targets){
          if (Math.hypot(x-t.x, y-t.y) < 2*r + 6*DPR){ ok=false; break; }
        }
      }
      const sp = (CONFIG.targetBaseSpeed + (S.level-1)*CONFIG.targetSpeedPerLevel) * (bounds.h/900);
      const a = Math.random()*Math.PI*2;
      targets.push({ x, y, vx: Math.cos(a)*sp*DPR, vy: Math.sin(a)*sp*DPR });
    }

    // choose active
    S.activeIndex = Math.floor(Math.random()*targets.length);
    S.center.x = targets[S.activeIndex].x;
    S.center.y = targets[S.activeIndex].y;
  }

  function currentTargetRadius(){
    const wh = Math.min(play.width, play.height);
    return wh*0.13*S.targetScale;
  }

  function newTarget(){
    S.baseAngle = Math.random()*360;
    S.targetScale = CONFIG.minScale + Math.random()*(CONFIG.maxScale-CONFIG.minScale);
    S.playerVisible = false;
    S.playerScale = 0;

    placeTargets(S.decoyCount);
  }

  // ===== Timer ring =====
  const R = 56, CIRC = 2*Math.PI*R;
  ringFg.style.strokeDasharray = CIRC.toFixed(2);
  const setRing = p => ringFg.style.strokeDashoffset = (CIRC*(1-p)).toFixed(2);
  function flash(ok){
    timerEl.classList.remove('ok','bad'); void timerEl.offsetWidth;
    timerEl.classList.add(ok?'ok':'bad'); setTimeout(()=>timerEl.classList.remove(ok?'ok':'bad'),180);
  }

  // ===== Physics (walls + collisions) =====
  function physicsTargets(dt){
    const r = currentTargetRadius();

    // move
    for(const t of targets){
      t.x += t.vx*dt; t.y += t.vy*dt;

      // walls — include top-of-phone and top edge of cockpit (panelTop)
      if (t.x < bounds.left + r){ t.x = bounds.left + r; t.vx = Math.abs(t.vx); }
      if (t.x > bounds.right - r){ t.x = bounds.right - r; t.vx = -Math.abs(t.vx); }
      if (t.y < bounds.top + r){ t.y = bounds.top + r; t.vy = Math.abs(t.vy); }
      if (t.y > bounds.bottom - r){ t.y = bounds.bottom - r; t.vy = -Math.abs(t.vy); }
    }

    // collisions (simple elastic)
    for(let i=0;i<targets.length;i++){
      for(let j=i+1;j<targets.length;j++){
        const a = targets[i], b = targets[j];
        const dx = b.x-a.x, dy=b.y-a.y;
        const dist = Math.hypot(dx,dy);
        const minD = 2*r;
        if (dist > 0 && dist < minD){
          // separate
          const overlap = (minD - dist)/2;
          const nx = dx/dist, ny = dy/dist;
          a.x -= nx*overlap; a.y -= ny*overlap;
          b.x += nx*overlap; b.y += ny*overlap;
          // swap velocity along normal
          const avn = a.vx*nx + a.vy*ny;
          const bvn = b.vx*nx + b.vy*ny;
          const diff = bvn - avn;
          a.vx += diff*nx; a.vy += diff*ny;
          b.vx -= diff*nx; b.vy -= diff*ny;
        }
      }
    }

    // update warp focus smoothly toward active
    const act = targets[S.activeIndex];
    if (act){
      S.center.x += (act.x - S.center.x)*0.08;
      S.center.y += (act.y - S.center.y)*0.08;
    }
  }

  // ===== Loop =====
  let lastT = performance.now(), rafId = 0;
  function loop(now){
    const dt = Math.min(40, now-lastT); lastT = now;

    physicsTargets(dt);
    drawWarpAndLife(dt, now);

    if(S.mode==='arcade' && S.running){
      const elapsed = now - S.startTime;
      S.remaining = Math.max(0, S.runDurationArcade - elapsed);
      setRing(S.remaining / S.runDurationArcade);
      if(S.remaining<=0){ endGame(); return; }
    }

    if(S.holding){ S.playerScale += CONFIG.growthPerSecond*(dt/1000); thrustBtn.classList.add('holding'); safePlay(sfxHold); }
    else{ thrustBtn.classList.remove('holding'); sfxHold.pause(); sfxHold.currentTime=0; }

    S.baseAngle = (S.baseAngle + CONFIG.spinDegPerSecond*(dt/1000))%360;

    render();
    rafId = requestAnimationFrame(loop);
  }

  function render(){
    const w = play.width, h = play.height; ctxPlay.clearRect(0,0,w,h);
    const lw = CONFIG.outlineWidth * DPR;
    ctxPlay.lineJoin = 'round'; ctxPlay.lineCap = 'round';

    const rOuter = currentTargetRadius();
    const rInner = rOuter*0.48;

    // draw all targets (identical)
    for(const t of targets){
      ctxPlay.save();
      ctxPlay.translate(t.x, t.y);
      ctxPlay.rotate(S.baseAngle*Math.PI/180);
      ctxPlay.lineWidth = lw;
      ctxPlay.strokeStyle = 'rgba(160,205,255,0.95)';
      buildStarPath(ctxPlay, 5, rOuter, rInner);
      ctxPlay.stroke();
      ctxPlay.restore();
    }

    // player overlay (only when holding)
    if (S.playerVisible && targets[S.activeIndex]){
      const p = targets[S.activeIndex];
      ctxPlay.save();
      ctxPlay.translate(p.x, p.y);
      ctxPlay.rotate(S.baseAngle*Math.PI/180);
      const rPlayerOuter = Math.min(w,h)*0.13*S.playerScale;
      const rPlayerInner = rPlayerOuter*0.48;
      ctxPlay.lineWidth = lw;
      ctxPlay.strokeStyle = 'rgba(112,163,255,0.95)';
      buildStarPath(ctxPlay, 5, rPlayerOuter, rPlayerInner);
      ctxPlay.stroke();
      ctxPlay.restore();
    }
  }

  // ===== Interactions =====
  function onDown(e){
    e.preventDefault();
    if(!S.running) return;
    S.holding = true;
    S.playerVisible = true;
    S.playerScale = 0;
    safePlay(bgAmbient);
  }

  function onUp(e){
    e.preventDefault();
    if(!S.running || !S.holding) return;
    S.holding = false;

    const ok = Math.abs(S.playerScale - S.targetScale) <= S.tolScale;

    if(ok){
      flash(true); safePlay(sfxExplosion); explode(); addScore(1);
      S.combo++; S.successes++;

      if(S.combo && S.combo%CONFIG.comboEvery===0){
        addScore(CONFIG.comboPoints);
        if (S.mode==='arcade'){
          S.runDurationArcade += CONFIG.comboTimeBonusMs;
          toast(`Combo +5 seconds`);
        } else {
          toast(`+${CONFIG.comboPoints} Combo`);
        }
      }

      // co 3 zásahy přidej decoy (max 5)
      const wanted = Math.min(5, 1 + Math.floor(S.successes/3));
      if (wanted !== S.decoyCount){ S.decoyCount = wanted; }

      S.level++;
      S.tolScale = Math.max(CONFIG.minToleranceScale, S.tolScale*CONFIG.tighten);
      levelEl.textContent = String(S.level);

      newTarget();
      updateBest(); shake(.5);
    }else{
      flash(false); safePlay(sfxFail); S.combo=0; shake(1);
      if(S.mode==='survival'){
        S.lives = Math.max(0, S.lives-1); updateLives();
        if(S.lives===0){ endGame(); return; }
      }
      S.playerVisible = false;
      S.playerScale = 0;
    }
  }

  function addScore(n){ S.score += n; scoreEl.textContent = String(S.score); }
  function updateLives(){ livesEl.textContent = '♥'.repeat(S.lives); }
  function updateBest(){
    const best = (S.mode==='arcade'?S.bestArcade:S.bestSurvival);
    // (volitelné: zobrazit někde)
    return best;
  }
  function toast(t){ toastEl.textContent=t; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),520); }

  function readyGo(cb){
    toastEl.textContent='READY'; toastEl.classList.add('show');
    setTimeout(()=>{ toastEl.textContent='GO!'; setTimeout(()=>{ toastEl.classList.remove('show'); cb&&cb(); },320); },320);
  }

  function endGame(){
    S.running=false; cancelAnimationFrame(rafId); sfxHold.pause(); bgAmbient.pause(); bgAmbient.currentTime=0;

    if(S.mode==='arcade'){
      if(S.score>S.bestArcade){ S.bestArcade=S.score; localStorage.setItem('bestArcade',S.bestArcade); }
      finalBestEl.textContent=String(S.bestArcade);
    } else {
      if(S.score>S.bestSurvival){ S.bestSurvival=S.score; localStorage.setItem('bestSurvival',S.bestSurvival); }
      finalBestEl.textContent=String(S.bestSurvival);
    }
    finalScoreEl.textContent=String(S.score);

    // CTA text by mode
    if (bonusBtn) bonusBtn.textContent = (S.mode==='arcade') ? 'Play Again + 15 Seconds' : 'Play Again + 2 Lives';

    show('gameover');
  }

  function show(name){
    [menuEl, gameEl, overEl].forEach(el => el.classList.remove('active'));
    if(name==='menu') menuEl.classList.add('active');
    if(name==='game') gameEl.classList.add('active');
    if(name==='gameover') overEl.classList.add('active');

    // hide ad overlay
    if (adOverlay) adOverlay.hidden = true;
    if (adClose) adClose.disabled = true;
  }

  function start(mode, opts = {}){
    S.mode = mode; modeTagEl.textContent = mode.toUpperCase();
    S.level=1; S.score=0; S.combo=0; S.successes=0;
    S.decoyCount = 1;
    S.tolScale=CONFIG.targetToleranceScaleStart;
    S.holding=false; S.playerVisible=false; S.playerScale=0;

    // bonuses
    let extraTime = 0, extraLives = 0;
    if (opts.applyNextRunBonus){
      extraTime = S.nextRunBonusTimeMs || 0;
      extraLives = S.nextRunBonusLives || 0;
      S.nextRunBonusTimeMs = 0;
      S.nextRunBonusLives = 0;
    }

    S.lives = CONFIG.survivalLives + (S.mode==='survival' ? extraLives : 0);
    updateLives();

    if(S.mode==='arcade'){
      S.runDurationArcade = CONFIG.arcadeDuration + extraTime;
      S.startTime=performance.now();
      S.remaining=S.runDurationArcade;
      setRing(1);
    } else {
      setRing(1);
    }

    scoreEl.textContent='0'; levelEl.textContent='1';

    initStarfield(); newTarget();
    show('game'); safePlay(bgAmbient);
    lastT=performance.now(); readyGo(()=>{ S.running=true; rafId=requestAnimationFrame(loop); });
  }

  // ===== FX (explosion) =====
  function explode(){
    const w=play.width,h=play.height;
    const act = targets[S.activeIndex] || {x:w/2,y:h/2};
    const cx=act.x, cy=act.y, ctx=ctxPlay;
    const start=performance.now();
    const ringLife=520;
    function ring(t){
      const prog = Math.min(1, (t-start)/ringLife);
      const r = prog * Math.max(w,h)*0.35;
      const alpha = 1 - prog;
      ctx.save(); ctx.globalCompositeOperation='screen';
      ctx.lineWidth = 4*DPR;
      ctx.strokeStyle = `rgba(112,163,255,${0.35*alpha})`;
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
      ctx.restore();
      if (prog<1) requestAnimationFrame(ring);
    }
    requestAnimationFrame(ring);

    screenFlash(0.35);

    const parts=[]; const N=64;
    for(let i=0;i<N;i++){
      parts.push({
        x:cx,y:cy,
        vx:Math.cos(i/N*Math.PI*2)*(1.6+Math.random()*2.2)*DPR,
        vy:Math.sin(i/N*Math.PI*2)*(1.6+Math.random()*2.2)*DPR,
        life:480+Math.random()*320, age:0,
        len: 4 + Math.random()*14
      });
    }
    function fx(t){
      const dt=t-(fx._last||t); fx._last=t;
      ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
      for(const p of parts){
        p.age += dt; if(p.age>p.life) continue;
        p.x += p.vx*(dt/16.67); p.y += p.vy*(dt/16.67);
        const a = 1 - (p.age/p.life);
        const rgrad = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,8*DPR);
        rgrad.addColorStop(0,`rgba(160,205,255,${0.9*a})`); rgrad.addColorStop(1,'rgba(84,224,255,0)');
        ctx.fillStyle=rgrad; ctx.beginPath(); ctx.arc(p.x,p.y,2*DPR,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = `rgba(84,224,255,${0.6*a})`; ctx.lineWidth = 2*DPR;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx*p.len, p.y - p.vy*p.len); ctx.stroke();
      }
      ctx.restore();
      if(parts.some(p=>p.age<p.life)) requestAnimationFrame(fx);
    }
    requestAnimationFrame(fx);
  }

  function screenFlash(power=0.25){
    const w=space.width, h=space.height;
    ctxSpace.save(); ctxSpace.globalCompositeOperation='screen';
    const g = ctxSpace.createRadialGradient(S.center.x,S.center.y,0,S.center.x,S.center.y,Math.max(w,h)*0.7);
    g.addColorStop(0,`rgba(255,255,255,${power})`);
    g.addColorStop(1,'rgba(255,255,255,0)');
    ctxSpace.fillStyle=g; ctxSpace.fillRect(0,0,w,h);
    ctxSpace.restore();
  }

  function shake(strength=0){
    const target = strength ? play : space;
    target.classList.add('shake');
    setTimeout(()=>target.classList.remove('shake'),160);
  }

  const safePlay = a => { if(!a) return; const p=a.play(); if(p && p.catch) p.catch(()=>{}); };

  // ===== Rewarded Ads logic =====
  const adDomReady = () => !!(adOverlay && adStatus && adClose);

  async function showRewardedAd(){
    if (!adDomReady()) return true;

    adStatus.textContent = 'Loading…';
    adClose.disabled = true;
    adOverlay.hidden = false;

    setTimeout(()=>{
      adStatus.textContent = 'Reward Unlocked — Tap Play';
      adClose.disabled = false;
    }, Math.max(900, REWARDED.minShowMs));

    return new Promise(resolve=>{
      function closeOk(){
        adClose.removeEventListener('click', closeOk);
        adOverlay.hidden = true;
        resolve(true);
      }
      adClose.addEventListener('click', closeOk, { once: true });
    });
  }

  // ===== Events =====
  document.querySelector('[data-mode="arcade"]').addEventListener('click', ()=>start('arcade'));
  document.querySelector('[data-mode="survival"]').addEventListener('click', ()=>start('survival'));

  bonusBtn.addEventListener('click', async ()=>{
    const ok = REWARDED.enabled ? await showRewardedAd() : true;
    if (!ok) return;

    if (S.mode==='arcade'){
      S.nextRunBonusTimeMs = CONFIG.bonusArcadeMs;
      S.nextRunBonusLives = 0;
    } else {
      S.nextRunBonusTimeMs = 0;
      S.nextRunBonusLives = CONFIG.bonusSurvivalLives;
    }
    start(S.mode, { applyNextRunBonus: true });
  });

  againNoBonusBtn.addEventListener('click', ()=>{
    S.nextRunBonusTimeMs = 0;
    S.nextRunBonusLives = 0;
    start(S.mode, { applyNextRunBonus: false });
  });

  menuBtn.addEventListener('click', ()=>{
    bgAmbient.pause(); bgAmbient.currentTime=0; show('menu');
  });

  // HOLD — větší hit-zóna
  ['touchstart','mousedown'].forEach(e=>{
    thrustBtn.addEventListener(e,onDown,{passive:false});
    timerEl.addEventListener(e,onDown,{passive:false});
  });
  ['touchend','mouseup','touchcancel','mouseleave'].forEach(e=>{
    thrustBtn.addEventListener(e,onUp,{passive:false});
    timerEl.addEventListener(e,onUp,{passive:false});
  });

  // ===== Boot =====
  resize(); initStarfield(); show('menu'); setRing(1);
  drawWarpAndLife(16.67, performance.now());
  (()=>{ S.center.x = space.width/2; S.center.y = space.height/2 - 70*DPR; })();
})();
