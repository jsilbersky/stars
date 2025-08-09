const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// <<< NOVÉ: reference na HUD a panel + přesné měření a nastavení canvasu
const hudTop = document.getElementById("hudTop");
const controlPanel = document.getElementById("controlPanel");

function sizeGameCanvas() {
  const vpH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const vpW = window.visualViewport ? window.visualViewport.width  : window.innerWidth;

  const hudH = hudTop ? hudTop.offsetHeight : 0;
  const panelH = controlPanel ? controlPanel.offsetHeight : 0;

  const availH = Math.max(100, Math.floor(vpH - hudH - panelH));
  const availW = Math.floor(vpW);

  // reálné pixelové rozměry (důležité pro fyziku a kreslení)
  canvas.width  = availW;
  canvas.height = availH;

  // umístění mezi HUD a panel (jen vizuální styl)
  canvas.style.position = "absolute";
  canvas.style.top = hudH + "px";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = availH + "px";

  centerX = canvas.width / 2;
  centerY = canvas.height / 2;

  generateStars();
}

// přepočítávání při změně velikosti / orientace
window.addEventListener("resize", sizeGameCanvas);
window.addEventListener("orientationchange", sizeGameCanvas);
if (window.visualViewport) window.visualViewport.addEventListener("resize", sizeGameCanvas);

// ===== HUD prvky, čas a skóre =====
let centerX, centerY;
let stars = [];

const timerWrap = document.getElementById("timerWrap");
const timerBar  = document.getElementById("timerBar");
const scoreLabel = document.getElementById("scoreLabel");

const TIMER_MAX = 90;
let timeRemaining = TIMER_MAX;
let lastTimeStamp = performance.now();
let score = 0;
let isGameOver = false;

function updateScoreUI() {
  if (scoreLabel) scoreLabel.textContent = `SCORE: ${score}`;
}
function pulseScore() {
  if (!scoreLabel) return;
  scoreLabel.classList.remove('score-pulse');
  void scoreLabel.offsetWidth;
  scoreLabel.classList.add('score-pulse');
}
function blinkTimer() {
  if (!timerWrap) return;
  timerWrap.classList.remove('timer-blink');
  void timerWrap.offsetWidth;
  timerWrap.classList.add('timer-blink');
  setTimeout(() => timerWrap.classList.remove('timer-blink'), 320);
}
function updateTimerUI() {
  const ratio = Math.max(0, Math.min(1, timeRemaining / TIMER_MAX));
  if (timerBar) timerBar.style.width = `${ratio * 100}%`;
}
let lastTick = performance.now();
function tickTimer(now) {
  if (!lastTick) lastTick = now;
  const delta = (now - lastTick) / 1000;
  lastTick = now;

  timeRemaining -= delta;
  if (timeRemaining <= 0) {
    timeRemaining = 0;
    endGame();
    return;
  }

  if (timeRemaining < TIMER_MAX && timeBank > 0) {
    const give = Math.min(TIMER_MAX - timeRemaining, timeBank);
    timeRemaining += give;
    timeBank -= give;
    blinkTimer();
  }

  updateTimerUI();
}

function triggerGameOver() {
  if (isGameOver) return;
  isGameOver = true;
  const popup = document.getElementById("gameOverPopup");
  if (popup) popup.classList.remove("hidden");
}

// ===== Plovoucí text =====
let floaters = [];
function addFloater(text, x, y, color = '#00ffff', duration = 1500) {
  floaters.push({ text, x, y, color, start: performance.now(), duration, vy: -0.4, alphaFrom: 1, alphaTo: 0 });
}
function drawFloaters(now) {
  const kept = [];
  for (const f of floaters) {
    const t = (now - f.start) / f.duration;
    if (t >= 1) continue;
    const ease = t < 0.7 ? (t / 0.7) : 1;
    const alpha = f.alphaFrom + (f.alphaTo - f.alphaFrom) * t;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = f.color;
    ctx.font = 'bold 22px Audiowide, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 18;
    ctx.fillText(f.text, f.x, f.y + f.vy * (ease * 120));
    ctx.restore();

    kept.push(f);
  }
  floaters = kept;
}

// ===== Hvězdné pozadí =====
function generateStars(count = 100) {
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 1.5 + 0.5,
    speed: Math.random() * 0.5 + 0.2,
    offset: Math.random() * 1000,
    shape: getRandomStarShape()
  }));
}
function getRandomStarShape() {
  const options = ["star5", "star6", "star7", "star8", "star9"];
  return options[Math.floor(Math.random() * options.length)];
}

let isHolding = false;
let radius = 0;
let hue = 0;
let rotation = 0;
let rotationSpeed = 0.01;
let lineWidth = 4;
let needsRotationCheck = false;

let level = 1;
let currentShape = "star5";
let remainingShapes = [];
let targetRadius = 80;
let currentColorShift = 0;

let showWrong = false;
let showExplosion = false;
let effectTimer = 0;

let shards = [];
let flashAlpha = 0;

let shapeX = 0;
let shapeY = 0;
let shapeVX = 0;
let shapeVY = 0;
let enableMove = false;
let holdStartTime = 0;
let enableBounce = false;

let holdHueShift = 0;
let holdHue = 200; 
let fragments = [];
let firstStart = true;
let holdGrowth = 1;

let timeBank = 0;

const matchLabel = document.getElementById("matchLabel");
const allStarShapes = ["star5", "star6", "star7", "star8", "star9"];

const levels = [
  { lineWidth: 8, rotationSpeed: 0, rotationCheck: false, holdGrowth: 1.00 },
  { lineWidth: 4, rotationSpeed: 0, rotationCheck: false, holdGrowth: 1.1 },
  { lineWidth: 8, rotationSpeed: 0, rotationCheck: false, oscillate: true, scaleMin: 0.92, scaleMax: 1.08, scaleSpeed: 0.045, holdGrowth: 1.18 },
  { lineWidth: 4, rotationSpeed: 0, rotationCheck: false, oscillate: true, scaleMin: 0.86, scaleMax: 1.14, scaleSpeed: 0.060, holdGrowth: 1.25 },
  { lineWidth: 8, rotationSpeed: 0, rotationCheck: false, move: true, bounce: true, speed: 3.0, holdGrowth: 1.30 },
  { lineWidth: 4, rotationSpeed: 0, rotationCheck: false, move: true, bounce: true, speed: 3.8, holdGrowth: 1.36 },
  { lineWidth: 8, move: true, bounce: true, oscillate: true, scaleMin: 0.85, scaleMax: 1.15, scaleSpeed: 0.075, speed: 4.4, holdGrowth: 1.42 },
  { lineWidth: 4, move: true, bounce: true, oscillate: true, scaleMin: 0.84, scaleMax: 1.16, scaleSpeed: 0.080, speed: 4.9, holdGrowth: 1.50 }
];

// ❤️ životy
let lives = 5;
function updateLivesDisplay() {
  const hearts = document.querySelectorAll(".heart");
  hearts.forEach((heart, index) => heart.classList.toggle("lost", index >= lives));
}
function updateLevelDisplay() {
  const levelDisplay = document.getElementById("levelLabel");
  if (levelDisplay) levelDisplay.textContent = `LEVEL ${level}`;
}

function createFragments(shape, x, y) {
  const count = Math.floor(Math.random() * 30) + 90;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 3 + 1;
    const size = Math.random() * 15 + 10;

    fragments.push({
      shape, x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      size,
      alpha: 1
    });
  }
  if (fragments.length > 500) fragments.splice(0, fragments.length - 500);
}

/* OSCILACE */
let oscillate = false;
let scaleMin = 1;
let scaleMax = 1;
let scaleSpeed = 0;
let scalePhase = 0;
let baseTargetRadius = 80;

function startLevel() {
  document.getElementById("gameOverPopup").classList.add("hidden");
  const settings = levels[Math.min(level - 1, levels.length - 1)];
  lineWidth = settings.lineWidth;
  rotationSpeed = settings.rotationSpeed ?? 0;
  needsRotationCheck = settings.rotationCheck;
  enableMove = settings.move || false;
  enableBounce = settings.bounce || false;

  holdGrowth = settings.holdGrowth ?? 1;
  if (settings.speed) {
    const spd = settings.speed;
    shapeVX = (Math.random() - 0.5) * spd;
    shapeVY = (Math.random() - 0.5) * spd;
  }

  oscillate = settings.oscillate || false;
  scaleMin  = settings.scaleMin ?? 1;
  scaleMax  = settings.scaleMax ?? 1;
  scaleSpeed = settings.scaleSpeed ?? 0;
  scalePhase = 0;

  remainingShapes = [...allStarShapes].sort(() => Math.random() - 0.5);
  shapeX = centerX;
  shapeY = centerY;
  shapeVX = (Math.random() - 0.5) * 4;
  shapeVY = (Math.random() - 0.5) * 4;

  if (firstStart) {
    updateMatchLabel(0);
    firstStart = false;
  }

  nextShape();
  updateLivesDisplay();
  updateLevelDisplay();
}

function nextShape() {
  if (remainingShapes.length === 0) {
    level++;
    startLevel();
    return;
  }
  currentShape = remainingShapes.pop();
  rotation = 0;
  radius = 0;

  baseTargetRadius = Math.random() * 50 + 50;
  targetRadius = baseTargetRadius;
  currentColorShift = Math.random() * 360;
}

function createShards(x, y, count = 20) {
  shards = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 2 + 1;
    const size = Math.random() * 8 + 4;
    shards.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + 1,
      size,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      alpha: 1
    });
  }
}

function drawStarShape(shape, r) {
  ctx.beginPath();
  const spikes = { star4: 4, star5: 5, star6: 6, star7: 7, star8: 8, star9: 9, star10: 10, star11: 11, star12: 12 }[shape] || 5;
  const step = Math.PI / spikes;
  for (let i = 0; i < 2 * spikes; i++) {
    const radiusMod = i % 2 === 0 ? r : r * 0.5;
    const angle = i * step;
    const x = radiusMod * Math.cos(angle);
    const y = radiusMod * Math.sin(angle);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawShape(shape, x, y, r, rotation, baseHue = 0, width = 4) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const gradient = ctx.createLinearGradient(-r, -r, r, r);
  gradient.addColorStop(0, `hsl(${(baseHue + 0) % 360}, 100%, 60%)`);
  gradient.addColorStop(0.5, `hsl(${(baseHue + 60) % 360}, 100%, 60%)`);
  gradient.addColorStop(1, `hsl(${(baseHue + 120) % 360}, 100%, 60%)`);

  ctx.strokeStyle = gradient;
  ctx.lineWidth = width;

  ctx.shadowBlur = 0;
  ctx.shadowColor = `hsl(${(baseHue + 60) % 360}, 100%, 80%)`;

  drawStarShape(shape, r);
  ctx.stroke();
  ctx.restore();
}

function drawStars() {
  stars.forEach(star => {
    const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 2);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size * 2, 0, Math.PI * 2);
    ctx.fill();

    star.y += star.speed;
    if (star.y > canvas.height) {
      star.y = 0;
      star.x = Math.random() * canvas.width;
    }
  });
}

function draw() {
  const now = performance.now();
  tickTimer(now);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawStars();

  shards.forEach(shard => {
    ctx.save();
    ctx.translate(shard.x, shard.y);
    ctx.rotate(shard.rotation);
    ctx.globalAlpha = shard.alpha;
    ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
    ctx.fillRect(-shard.size / 2, -shard.size / 2, shard.size, shard.size);
    ctx.restore();

    shard.x += shard.vx;
    shard.y += shard.vy;
    shard.rotation += shard.rotationSpeed;
    shard.alpha -= 0.02;
  });
  shards = shards.filter(s => s.alpha > 0);

  if (showWrong) {
    ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 120px Arial";
    ctx.fillStyle = "red";
    ctx.textAlign = "center";
    ctx.fillText("✖", centerX, canvas.height * 0.25);
    effectTimer--;
    if (effectTimer <= 0) showWrong = false;
  }

  if (showExplosion) {
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const dist = Math.random() * 60;
      const x = shapeX + Math.cos(angle) * dist;
      const y = shapeY + Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = `hsl(${hue}, 100%, ${Math.random() * 30 + 50}%)`;
      ctx.fill();
    }
    effectTimer--;
    if (effectTimer <= 0) {
      showExplosion = false;
      nextShape();
    }
  }

  if (enableMove) {
    if (enableBounce) {
      if (shapeX - targetRadius <= 0 && shapeVX < 0) { shapeVX *= -1; shapeX = targetRadius; }
      else if (shapeX + targetRadius >= canvas.width && shapeVX > 0) { shapeVX *= -1; shapeX = canvas.width - targetRadius; }
      if (shapeY - targetRadius <= 0 && shapeVY < 0) { shapeVY *= -1; shapeY = targetRadius; }
      else if (shapeY + targetRadius >= canvas.height && shapeVY > 0) { shapeVY *= -1; shapeY = canvas.height - targetRadius; }
    }
    shapeX += shapeVX;
    shapeY += shapeVY;
  }

  if (oscillate) {
    scalePhase += scaleSpeed;
    const t = (Math.sin(scalePhase) + 1) / 2;
    const ratio = scaleMin + (scaleMax - scaleMin) * t;
    targetRadius = baseTargetRadius * ratio;
  } else {
    targetRadius = baseTargetRadius;
  }

  ctx.save();
  ctx.strokeStyle = `hsl(${hue}, 100%, 70%)`;
  ctx.lineWidth = lineWidth;
  drawShape(currentShape, shapeX, shapeY, targetRadius, rotation, currentColorShift + hue, lineWidth);
  ctx.restore();

  drawFloaters(now);

  fragments.forEach(frag => {
    ctx.save();
    ctx.translate(frag.x, frag.y);
    ctx.rotate(frag.rotation);
    ctx.globalAlpha = frag.alpha;

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, frag.size);
    gradient.addColorStop(0, `hsla(${hue}, 100%, 70%, ${frag.alpha})`);
    gradient.addColorStop(1, `hsla(${hue}, 100%, 70%, 0)`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, frag.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    frag.x += frag.vx;
    frag.y += frag.vy;
    frag.rotation += frag.rotationSpeed;
    frag.size += 0.1;
    frag.alpha -= 0.004;
  });
  fragments = fragments.filter(f => f.alpha > 0);

  if (isHolding && radius < targetRadius + 1000) radius += holdGrowth;

  if (isHolding) {
    ctx.save();
    ctx.translate(shapeX, shapeY);
    ctx.rotate(0);
    drawStarShape(currentShape, radius);
    ctx.fill();
    ctx.restore();

    drawShape(currentShape, shapeX, shapeY, radius, 0, holdHue + hue, 5);
  }

  rotation += rotationSpeed;
  hue = (hue + 1) % 360;
  requestAnimationFrame(draw);
}

// <<< PŮVODNÍ resizeCanvas NAHRAZEN >>>
sizeGameCanvas(); // nastavit plátno hned po startu

function updateMatchLabel(percentage) {
  matchLabel.textContent = `MATCH: ${percentage}%`;
  matchLabel.style.color = percentage >= 80 ? "lime" : "red";
  matchLabel.classList.remove("pulse");
  void matchLabel.offsetWidth;
  matchLabel.classList.add("pulse");
}

function handleRelease() {
  if (isGameOver) return;
  isHolding = false;

  const isMoving = enableMove;
  const maxSizeDiff = isMoving ? 40 : 30;
  const baseAngleTolerance = Math.PI / 6;

  const spikes = { star4: 4, star5: 5, star6: 6, star7: 7, star8: 8, star9: 9, star10: 10, star11: 11, star12: 12 }[currentShape] || 5;

  const snapAngle = (2 * Math.PI) / spikes;
  const maxAngleDiff = isMoving ? baseAngleTolerance + snapAngle * 0.3 : baseAngleTolerance;

  const sizeDiff = Math.abs(radius - targetRadius);
  let sizeRatio = radius > targetRadius + maxSizeDiff ? 0 : 1 - sizeDiff / maxSizeDiff;

  const angleOffset = rotation % snapAngle;
  const angleDiff = Math.min(angleOffset, snapAngle - angleOffset);
  const angleRatio = Math.max(0, 1 - angleDiff / maxAngleDiff);

  const match = Math.round(Math.max(0, sizeRatio * angleRatio * 100));
  updateMatchLabel(match);

  if (match >= 80) {
    let add = 0;
    let infoText = '';
    let color = '#9cd6ff';
    if (match >= 95) { add = 3; infoText = '+3 ★  +TIME'; color = '#00ffff'; }
    else if (match >= 90) { add = 2; infoText = '+2 ★'; color = '#00ffff'; }
    else { add = 1; infoText = '+1 ★'; }

    score += add;
    updateScoreUI();
    pulseScore();

    if (match >= 95) {
      if (timeRemaining < TIMER_MAX) {
        timeRemaining = Math.min(TIMER_MAX, timeRemaining + 3);
      } else {
        timeBank += 3;
      }
      updateTimerUI();
      blinkTimer();
    }

    addFloater(infoText, shapeX, Math.max(20, shapeY - (targetRadius + 24)), color, 1100);

    createFragments(currentShape, shapeX, shapeY);
    showExplosion = true;
    effectTimer = 30;
    createShards(shapeX, shapeY);
    flashAlpha = 0.6;

    explosionSound.currentTime = 0;
    explosionSound.play();
  } else {
    showWrong = true;
    effectTimer = 30;
    lives--;
    updateLivesDisplay();

    failSound.currentTime = 0;
    failSound.play();

    if (lives <= 0) {
      setTimeout(() => { triggerGameOver(); }, 500);
    }
  }
}

window.startNewGame = function () {
  document.getElementById("gameOverPopup").classList.add("hidden");
  lives = 5;
  level = 1;
  firstStart = true;

  timeRemaining = TIMER_MAX;
  timeBank = 0;
  lastTimeStamp = performance.now();
  isGameOver = false;
  score = 0;
  updateScoreUI();
  updateTimerUI();

  startLevel();
  updateMatchLabel(0);
};

const holdButton = document.getElementById("holdButton");
const holdSound = new Audio('sounds/hold.mp3'); holdSound.preload = 'auto'; holdSound.volume = 1.0;
const explosionSound = new Audio('sounds/explosion.mp3'); explosionSound.preload = 'auto'; explosionSound.volume = 1.0;
const failSound = new Audio('sounds/fail.mp3'); failSound.preload = 'auto'; failSound.volume = 1.0;

function startHold() {
  if (isGameOver) return;
  isHolding = true;
  radius = 0;
  holdStartTime = performance.now();
  holdHue = Math.random() * 360;
  holdButton.classList.add('active');
  holdSound.currentTime = 0.5;
  holdSound.play();
}
function endHold() {
  if (isGameOver) return;
  isHolding = false;
  handleRelease();
  holdButton.classList.remove('active');
}

// Dotyk / myš
holdButton.addEventListener("touchstart", (e) => { e.preventDefault(); startHold(); });
holdButton.addEventListener("touchend",   (e) => { e.preventDefault(); endHold(); });
holdButton.addEventListener("mousedown",  (e) => { e.preventDefault(); startHold(); });
holdButton.addEventListener("mouseup",    (e) => { e.preventDefault(); endHold(); });
// Klávesa L
window.addEventListener("keydown", (e) => { if (e.key === "L") { level++; startLevel(); } });

holdButton.addEventListener('touchstart', () => { holdButton.classList.add('active'); });
holdButton.addEventListener('touchend',   () => { holdButton.classList.remove('active'); });

// Inicializace
updateScoreUI();
updateTimerUI();

// start hry po nastavení plátna
function drawInit() {
  sizeGameCanvas();
  startLevel();
  draw();
}
drawInit();
