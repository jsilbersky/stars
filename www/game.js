(() => {
  'use strict';

  // ===== Rewarded Ads (stub – jen bonus do další hry) =====
  const REWARDED = {
    enabled: true,
    provider: 'stub',
    minShowMs: 1200,
  };

  // ===== Konfigurace =====
  const CONFIG = {
    // režimy
    arcadeDuration: 30_000,
    survivalLives: 3,

    // LOCK mechanika
    lockMsBase: 800,            // kolik ms čisté "Green" trvá 100% LOCK
    lockMsStep: 50,             // delší lock po každých pár trefách (lehké škálování)
    lockMsMax: 1200,

    tolGreenStart: 0.10,        // ±10 % na začátku
    tolGreenMin: 0.03,          // min ±3 %
    tolGoldRatio: 0.5,          // Gold = polovina Green
    tolPerfRatio: 0.33,         // Perfect = třetina Green

    tightenEvery: 3,            // po kolika trefách se přitáhne tolerance + prodlouží lock
    tightenFactor: 0.96,        // násobení tolerance

    // růst a zmenšování hráčovy hvězdy
    growPerSec: 0.60,
    shrinkPerSec: 0.42,

    // progress mimo pásmo pomalu klesá
    lockDrainFactor: 0.35,      // poměr vůči base lock rate

    // body a bonusy při dokončení locku
    pointsGreen: 1,
    pointsGold: 2,
    pointsPerf: 3,

    // combo
    comboEvery: 5,
    comboTimeBonusMs: 5000,     // +5s v Arcade

    // další-run rewarded bonusy
    bonusArcadeMs: 15_000,      // Play Again +15s
    bonusSurvivalLives: 2,      // Play Again +2 lives

    // cíle (měřítko)
    minScale: 0.55,
    maxScale: 1.15,

    // pohyb cílů
    targetBaseSpeed: 0.05,      // px/ms (škálované DPR)
    targetSpeedPerLevel: 0.003,

    // pozadí (starfield)
    starsNear: 200,
    starsFar: 150,
    warpBase: 0.009,
    warpPerLevel: 0.0008,
    streakChancePerSec: 0.10,
    streakLifeMs: 1500,

    // „vesmírná“ životnost
    flashEveryMinMs: 8200,
    flashEveryMaxMs: 9600,

    // grafika outline
    outlineWidth: 5,
  };

  // ===== Stav =====
  const S = {
    mode: 'arcade',
    running: false,

    level: 1,
    score: 0,
    bestArcade: Number(localStorage.getItem('bestArcade') || 0),
    bestSurvival: Number(localStorage.getItem('bestSurvival') || 0),
    lives: CONFIG.survivalLives,

    // combo a progrese
    combo: 0,
    successes: 0,              // kolik tref za run
    decoyCount: 1,             // 1..5 (roste po 3 trefách)

    // časování Arcade
    startTime: 0,
    remaining: CONFIG.arcadeDuration,
    runDurationArcade: CONFIG.arcadeDuration,

    // zóna/target
    baseAngle: 0,
    targetScale: 1,

    // hráčova hvězda
    playerScale: 0,
    playerVisible: false,
    holding: false,

    // LOCK
    lockProgress: 0,           // 0..1
    lockMsCurrent: CONFIG.lockMsBase,
    tolGreen: CONFIG.tolGreenStart,

    // aktivní cíl a pozice
    activeIndex: 0,
    center: { x: 0, y: 0 },    // fokus pozadí

    // jednorázové bonusy do další hry
    nextRunBonusTimeMs: 0,
    nextRunBonusLives: 0,
  };

  // ===== DOM prvky =====
  const $ = s => document.querySelector(s);
  const menuEl = $('#menu'), gameEl = $('#game'), overEl = $('#gameover');
  const space = $('#space'), play = $('#gameplay');
  const ctxSpace = space.getContext('2d'), ctxPlay = play.getContext('2d');

  const scoreEl = $('#score'), levelEl = $('#level'), livesEl = $('#lives');
  const timerEl = $('#timer'), ringFg = document.querySelector('.ring .fg');
  const thrustBtn = $('#thrustBtn'), toastEl = $('#readyGo'), modeTagEl = $('#modeTag');
  const finalScoreEl = $('#finalScore'), finalBestEl = $('#finalBest');

  // Game over & ads
  const bonusBtn = $('#bonusBtn');
  const againNoBonusBtn = $('#againNoBonusBtn');
  const menuBtn = $('#menuBtn');

  const adOverlay = $('#adOverlay');
  const adStatus  = $('#adStatus');
  const adClose   = $('#adClose');
  if (adOverlay) adOverlay.hidden = true;
  if (adClose) { adClose.disabled = true; adClose.textContent = 'Play'; } // jistota „Play“

  // audio
  const sfxExplosion = $('#sfxExplosion'), sfxFail = $('#sfxFail'), sfxHold = $('#sfxHold'), bgAmbient = $('#bgAmbient');
  sfxHold.loop = true; sfxHold.volume = 0.45; bgAmbient.volume = 0.28;

  // ===== Canvas / rozměry =====
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
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
    const marginTop = 10 * DPR;
    const cockpitH  = 150 * DPR;
    bounds.top = marginTop;
    bounds.bottom = h - cockpitH;
    bounds.left = 20 * DPR;
    bounds.right = w - 20 * DPR;
    bounds.panelTop = bounds.bottom;

    S.center.x = w/2;
    S.center.y = h/2 - 90*DPR;
  }
  resize();
  window.addEventListener('resize', resize);

  // ===== Starfield (plynulejší) =====
  let starsNear = [], starsFar = [];
  const makeStar = (speedMul=1) => {
    const a = Math.random()*Math.PI*2, r = Math.random()*1;
    const speed = (CONFIG.warpBase + (S.level-1)*CONFIG.warpPerLevel) * speedMul;
    return { x: Math.cos(a)*(0.2+r), y: Math.sin(a)*(0.2+r), z: Math.random()*1+0.1, px:0, py:0, speed };
  };
  function initStarfield(){
    starsNear = Array.from({length: CONFIG.starsNear}, () => makeStar(1.2));
    starsFar  = Array.from({length: CONFIG.starsFar }, () => makeStar(0.6));
  }

  const streaks = [];
  function spawnStreak(){
    const angle = Math.random()*Math.PI*2;
    const z0 = 0.9, zVel = (CONFIG.warpBase + (S.level-1)*CONFIG.warpPerLevel) * 1.8;
    streaks.push({ a: angle, z: z0, zv: zVel, px:0, py:0, age:0, life: CONFIG.streakLifeMs });
  }

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

    // jemná mlhovina
    const t = now * 0.00006;
    const g = ctxSpace.createRadialGradient(
      w*.5 + Math.cos(t)*120*DPR, h*.28 + Math.sin(t*1.35)*90*DPR, 160*DPR,
      w*.5, h*.5, Math.max(w,h)*0.9
    );
    g.addColorStop(0,'rgba(112,163,255,.06)');
    g.addColorStop(.5,'rgba(84,224,255,.05)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctxSpace.fillStyle = g; ctxSpace.fillRect(0,0,w,h);

    // hvězdy – dvě vrstvy
    ctxSpace.save(); ctxSpace.translate(S.center.x, S.center.y);

    const drawLayer = (arr, thickness=1.3, isNear=false) => {
      for (let star of arr){
        star.z -= star.speed * (dt/16.67);
        if (star.z <= 0.05){
          Object.assign(star, makeStar(isNear ? 1.2 : 0.6));
          continue;
        }
        const f = 1/star.z;
        const x = star.x * f * h * .38;
        const y = star.y * f * h * .38;

        ctxSpace.beginPath();
        ctxSpace.strokeStyle = `hsla(${190+(1-star.z)*80},100%,70%,${0.26+(1-star.z)*0.48})`;
        ctxSpace.lineWidth = Math.min(2.2*DPR, (thickness + (1 - star.z)*1.2) * DPR);
        ctxSpace.moveTo(star.px || x, star.py || y);
        ctxSpace.lineTo(x,y);
        ctxSpace.stroke();

        star.px = x; star.py = y;
      }
    };
    drawLayer(starsFar, 1.0, false);
    drawLayer(starsNear, 1.6, true);

    // jemné „streaky“
    if (Math.random() < CONFIG.streakChancePerSec * (dt/1000) && streaks.length < 3) spawnStreak();
    for (let i = streaks.length - 1; i >= 0; i--){
      const s = streaks[i];
      s.age += dt; s.z -= s.zv * (dt/16.67);
      if (s.z <= 0.05 || s.age > s.life){ streaks.splice(i,1); continue; }

      const f = 1/s.z, x = Math.cos(s.a) * f * h * .38, y = Math.sin(s.a) * f * h * .38;

      ctxSpace.beginPath();
      ctxSpace.strokeStyle = 'rgba(160,205,255,0.85)';
      ctxSpace.lineCap = 'round';
      ctxSpace.lineWidth = 2.6 * DPR;
      ctxSpace.moveTo(s.px || x, s.py || y);
      ctxSpace.lineTo(x,y);
      ctxSpace.stroke();

      const head = ctxSpace.createRadialGradient(x,y,0,x,y,7*DPR);
      head.addColorStop(0,'rgba(255,255,255,.95)');
      head.addColorStop(1,'rgba(84,224,255,0)');
      ctxSpace.fillStyle = head;
      ctxSpace.beginPath(); ctxSpace.arc(x,y,7*DPR,0,Math.PI*2); ctxSpace.fill();

      s.px = x; s.py = y;
    }
    ctxSpace.restore();

    // twinkles
    if (Math.random() < 0.08 * (dt/1000)) spawnTwinkle();
    for (let i=twinkles.length-1; i>=0; i--){
      const tw = twinkles[i];
      tw.age += dt;
      const p = tw.age / tw.life;
      if (p >= 1){ twinkles.splice(i,1); continue; }
      const pulse = 1 - Math.abs(2*p - 1);
      const r = (3 + 6*pulse) * DPR;
      const alpha = 0.25 + 0.45*pulse;
      const g2 = ctxSpace.createRadialGradient(tw.x,tw.y,0,tw.x,tw.y,r);
      g2.addColorStop(0,`rgba(160,205,255,${alpha})`);
      g2.addColorStop(1,'rgba(160,205,255,0)');
      ctxSpace.fillStyle = g2;
      ctxSpace.beginPath(); ctxSpace.arc(tw.x, tw.y, r, 0, Math.PI*2); ctxSpace.fill();
    }

    if (now >= nextFlashAt){ screenFlash(0.14); shake(); scheduleFlash(now); }
  }

  // ===== Geometrie hvězdy =====
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

  // ===== Targets (decoys) =====
  const targets = []; // {x,y,vx,vy}
  function currentTargetRadius(){
    const wh = Math.min(play.width, play.height);
    return wh*0.13*S.targetScale;
  }

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

    S.activeIndex = Math.floor(Math.random()*targets.length);
    S.center.x = targets[S.activeIndex].x;
    S.center.y = targets[S.activeIndex].y;
  }

  function newTarget(){
    S.baseAngle = Math.random()*360;
    S.targetScale = CONFIG.minScale + Math.random()*(CONFIG.maxScale-CONFIG.minScale);
    S.playerVisible = false;
    S.playerScale = 0;
    S.lockProgress = 0;
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

  // ===== Fyzika cílů =====
  function physicsTargets(dt){
    const r = currentTargetRadius();
    for(const t of targets){
      t.x += t.vx*dt; t.y += t.vy*dt;
      if (t.x < bounds.left + r){ t.x = bounds.left + r; t.vx = Math.abs(t.vx); }
      if (t.x > bounds.right - r){ t.x = bounds.right - r; t.vx = -Math.abs(t.vx); }
      if (t.y < bounds.top + r){ t.y = bounds.top + r; t.vy = Math.abs(t.vy); }
      if (t.y > bounds.bottom - r){ t.y = bounds.bottom - r; t.vy = -Math.abs(t.vy); }
    }
    // kolize (jednoduchá separace + výměna normálové složky)
    for(let i=0;i<targets.length;i++){
      for(let j=i+1;j<targets.length;j++){
        const a = targets[i], b = targets[j];
        const dx = b.x-a.x, dy=b.y-a.y;
        const dist = Math.hypot(dx,dy);
        const minD = 2*r;
        if (dist > 0 && dist < minD){
          const overlap = (minD - dist)/2;
          const nx = dx/dist, ny = dy/dist;
          a.x -= nx*overlap; a.y -= ny*overlap;
          b.x += nx*overlap; b.y += ny*overlap;
          const avn = a.vx*nx + a.vy*ny;
          const bvn = b.vx*nx + b.vy*ny;
          const diff = bvn - avn;
          a.vx += diff*nx; a.vy += diff*ny;
          b.vx -= diff*nx; b.vy -= diff*ny;
        }
      }
    }

    const act = targets[S.activeIndex];
    if (act){
      S.center.x += (act.x - S.center.x) * 0.05;
      S.center.y += (act.y - S.center.y) * 0.05;
    }
  }

  // ===== LOCK logika =====
  function zoneAndDelta(){
    // relativní odchylka měřítka
    const delta = (S.playerScale - S.targetScale) / S.targetScale;  // např. +0.04 = +4 %
    const ad = Math.abs(delta);

    const tolG = S.tolGreen;
    const tolGold = tolG * CONFIG.tolGoldRatio;
    const tolPerf = tolG * CONFIG.tolPerfRatio;

    if (ad <= tolPerf) return { zone:'perfect', delta };
    if (ad <= tolGold) return { zone:'gold', delta };
    if (ad <= tolG)    return { zone:'green', delta };
    return { zone:'out', delta };
  }

  function lockTick(dt){
    const { zone } = zoneAndDelta();
    const rateBase = 1 / S.lockMsCurrent; // za ms v "green" přidat 1/lockMs

    if (zone === 'perfect')      S.lockProgress += dt * rateBase * 3; // 3× rychleji
    else if (zone === 'gold')    S.lockProgress += dt * rateBase * 2;
    else if (zone === 'green')   S.lockProgress += dt * rateBase * 1;
    else                         S.lockProgress -= dt * rateBase * CONFIG.lockDrainFactor;

    S.lockProgress = clamp(S.lockProgress, 0, 1);

    if (S.lockProgress >= 1){
      // dokončeno — vyhodnoť zónu pro odměnu
      const { zone: finZone } = zoneAndDelta();
      const mult = (finZone==='perfect') ? CONFIG.pointsPerf
                 : (finZone==='gold')    ? CONFIG.pointsGold
                 : CONFIG.pointsGreen;

      addScore(mult);
      if (S.mode==='arcade'){
        S.combo++;
        if (S.combo && S.combo % CONFIG.comboEvery === 0){
          S.runDurationArcade += CONFIG.comboTimeBonusMs;
          toast('+5s Combo');
        }
      }

      // zrychlení obtížnosti (pozvolna)
      S.successes++;
      if (S.successes % CONFIG.tightenEvery === 0){
        S.tolGreen = clamp(S.tolGreen * CONFIG.tightenFactor, CONFIG.tolGreenMin, CONFIG.tolGreenStart);
        S.lockMsCurrent = Math.min(CONFIG.lockMsMax, S.lockMsCurrent + CONFIG.lockMsStep);
      }

      // přidávej decoy hvězdy
      const wanted = Math.min(5, 1 + Math.floor(S.successes/3));
      if (wanted !== S.decoyCount) S.decoyCount = wanted;

      flash(true); safePlay(sfxExplosion); explode();
      S.level++; levelEl.textContent = String(S.level);

      // nový cíl
      newTarget();
    }
  }

  // ===== Hlavní smyčka =====
  let lastT = performance.now(), rafId = 0, smoothedDt = 16.67;

  function loop(now){
    let raw = Math.min(50, now - lastT); lastT = now;
    smoothedDt += (raw - smoothedDt) * 0.25; // vyhlazení dt
    const dt = smoothedDt;

    physicsTargets(dt);
    drawWarpAndLife(dt, now);

    if(S.mode==='arcade' && S.running){
      const elapsed = now - S.startTime;
      S.remaining = Math.max(0, S.runDurationArcade - elapsed);
      setRing(S.remaining / S.runDurationArcade);
      if(S.remaining<=0){ endGame(); return; }
    }

    // růst/zmenšování hráče
    if (S.holding){
      S.playerVisible = true;
      S.playerScale += CONFIG.growPerSec * (dt/1000);
      thrustBtn.classList.add('holding');
      safePlay(sfxHold);
    } else {
      S.playerScale = Math.max(0, S.playerScale - CONFIG.shrinkPerSec * (dt/1000));
      thrustBtn.classList.remove('holding');
      sfxHold.pause(); sfxHold.currentTime = 0;
    }

    // LOCK
    if (S.playerVisible) lockTick(dt);

    // mírná rotace
    S.baseAngle = (S.baseAngle + 40*(dt/1000)) % 360;

    render();
    rafId = requestAnimationFrame(loop);
  }

  // ===== Render =====
  function render(){
    const w = play.width, h = play.height; ctxPlay.clearRect(0,0,w,h);
    const lw = CONFIG.outlineWidth * DPR;
    ctxPlay.lineJoin = 'round'; ctxPlay.lineCap = 'round';

    const rOuter = currentTargetRadius();
    const rInner = rOuter*0.48;

    // všechny cíle (stejné, jen jedna je aktivní)
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

    // aktivní target: lock ring + delta
    const act = targets[S.activeIndex];
    if (act){
      // ring progress kolem cíle
      const ringR = rOuter + 14*DPR;
      ctxPlay.save();
      ctxPlay.translate(act.x, act.y);
      ctxPlay.beginPath();
      ctxPlay.lineWidth = 3*DPR;
      ctxPlay.strokeStyle = 'rgba(112,163,255,0.45)';
      ctxPlay.arc(0,0, ringR, 0, Math.PI*2);
      ctxPlay.stroke();

      // vyplnění podle S.lockProgress
      ctxPlay.beginPath();
      ctxPlay.strokeStyle = 'rgba(112,163,255,0.95)';
      ctxPlay.lineWidth = 4*DPR;
      ctxPlay.arc(0,0, ringR, -Math.PI/2, -Math.PI/2 + S.lockProgress*2*Math.PI);
      ctxPlay.stroke();

      // text „LOCK xx%“ nad hvězdou
      ctxPlay.font = `${12*DPR}px Oxanium, sans-serif`;
      ctxPlay.textAlign = 'center';
      ctxPlay.textBaseline = 'bottom';
      ctxPlay.fillStyle = 'rgba(232,241,255,0.92)';
      ctxPlay.fillText(`LOCK ${Math.round(S.lockProgress*100)}%`, 0, -(ringR + 8*DPR));

      // delta pod hvězdou
      const { delta, zone } = zoneAndDelta();
      const dAbs = Math.abs(delta)*100;
      const zTxt = zone==='perfect'?'PERFECT':zone==='gold'?'GOLD':zone==='green'?'GREEN':'OUT';
      ctxPlay.textBaseline = 'top';
      ctxPlay.fillStyle = zone==='out' ? 'rgba(255,75,110,0.95)'
                          : zone==='perfect' ? 'rgba(58,245,155,0.95)'
                          : 'rgba(200,220,255,0.92)';
      ctxPlay.fillText(`${zTxt}  Δ ${delta>=0?'+':'-'}${dAbs.toFixed(1)}%`, 0, (ringR + 8*DPR));
      ctxPlay.restore();
    }

    // hráčova hvězda (jen na aktivním cíli a jen při viditelnosti)
    if (S.playerVisible && act){
      ctxPlay.save();
      ctxPlay.translate(act.x, act.y);
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

  // ===== Interakce =====
  function onDown(e){
    e.preventDefault();
    if(!S.running) return;
    S.holding = true;
    S.playerVisible = true;
    safePlay(bgAmbient);
  }

  function onUp(e){
    e.preventDefault();
    if(!S.running || !S.holding) return;
    S.holding = false;

    const { zone } = zoneAndDelta();
    if (zone === 'out'){
      flash(false); safePlay(sfxFail); S.combo = 0; shake(1);
      if (S.mode==='survival'){
        S.lives = Math.max(0, S.lives-1); updateLives();
        if (S.lives===0){ endGame(); return; }
      }
      // po chybě: hráčova hvězda schovat
      S.playerVisible = false;
      S.playerScale = 0;
    }
    // pokud byl v pásmu, nic neresetujeme – pokračuje k 100% locku
  }

  function addScore(n){ S.score += n; scoreEl.textContent = String(S.score); }
  function updateLives(){ livesEl.textContent = '♥'.repeat(S.lives); }
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

    // CTA text dle módu (bonus JEN pro příští run)
    if (bonusBtn) bonusBtn.textContent = (S.mode==='arcade') ? 'Play Again + 15 Seconds' : 'Play Again + 2 Lives';

    show('gameover');
  }

  function show(name){
    [menuEl, gameEl, overEl].forEach(el => el.classList.remove('active'));
    if(name==='menu') menuEl.classList.add('active');
    if(name==='game') gameEl.classList.add('active');
    if(name==='gameover') overEl.classList.add('active');

    if (adOverlay) adOverlay.hidden = true;
    if (adClose) adClose.disabled = true;
  }

  function start(mode, opts = {}){
    S.mode = mode; modeTagEl.textContent = mode.toUpperCase();
    S.level=1; S.score=0; S.combo=0; S.successes=0;
    S.decoyCount = 1;
    S.holding=false; S.playerVisible=false; S.playerScale=0;

    // LOCK reset
    S.tolGreen = CONFIG.tolGreenStart;
    S.lockMsCurrent = CONFIG.lockMsBase;
    S.lockProgress = 0;

    // one-run bonusy
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

  // ===== FX =====
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

    screenFlash(0.30);

    const parts=[]; const N=60;
    for(let i=0;i<N;i++){
      parts.push({
        x:cx,y:cy,
        vx:Math.cos(i/N*Math.PI*2)*(1.6+Math.random()*2.2)*DPR,
        vy:Math.sin(i/N*Math.PI*2)*(1.6+Math.random()*2.2)*DPR,
        life:480+Math.random()*320, age:0, len: 4 + Math.random()*14
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

  function screenFlash(power=0.22){
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

  // ===== Rewarded Ads – jen bonus do příští hry =====
  const adDomReady = () => !!(adOverlay && adStatus && adClose);
  async function showRewardedAd(){
    if (!adDomReady()) return true;
    adStatus.textContent = 'Loading…';
    adClose.disabled = true;
    adOverlay.hidden = false;

    setTimeout(()=>{
      adStatus.textContent = 'Bonus unlocked — Tap Play';
      adClose.disabled = false;
    }, Math.max(900, REWARDED.minShowMs));

    return new Promise(resolve=>{
      function ok(){
        adClose.removeEventListener('click', ok);
        adOverlay.hidden = true;
        resolve(true);
      }
      adClose.addEventListener('click', ok, { once: true });
    });
  }

  // ===== Události =====
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

  // HOLD – větší hit-zóna
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
