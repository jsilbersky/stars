// --- načtení módu z menu ---
const mode = localStorage.getItem("mode") || "challenge"; 

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

  centerX = availW / 2;
  centerY = availH / 2;

  generateStars();

  // Při změně velikosti plátna přepočti multi-stars pozice
if (multiStarMode && currentLevelSettings) {
  spawnMultiStars(currentLevelSettings);
}

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

const TIMER_MAX = 60;
let timeRemaining = TIMER_MAX;
let score = 0;
// 🎯 Statistika času a nejlepšího skóre
let gameStartTime = 0;
// 🎯 Rekordy podle módu (arcade / survival / challenge)
function getBestScoreKey() {
  return "bestScore_" + mode; // např. bestScore_arcade
}
let bestScore = parseInt(localStorage.getItem(getBestScoreKey())) || 0;

let isGameOver = false;

// FIX: blokuj časovač už od začátku (pomáhá, když je otevřený help popup)
let isCountdown = true; // FIX

function runCountdown(thenStartFn) {
  const overlay = document.getElementById('countdownOverlay');
  const numEl   = document.getElementById('countdownNum');
  if (!overlay || !numEl) { thenStartFn?.(); return; }

  isCountdown = true;
  overlay.classList.remove('hidden');

  // nahoře spolu s ostatními zvuky
const countdownSound = new Audio('sounds/countdown.mp3');
countdownSound.preload = 'auto';
countdownSound.volume = 0.8; 

// 🔊 Spusť celý zvuk rovnou na startu
countdownSound.currentTime = 0;
countdownSound.play();

  let n = 3;
  numEl.textContent = n;

  const tick = () => {
    n--;
    if (n >= 1) {
      numEl.textContent = n;
      setTimeout(tick, 1000);
    } else {
      numEl.textContent = 'GO';

  setTimeout(() => {
  overlay.classList.add('hidden');
  isCountdown = false;
  lastTick = performance.now();

  // 1) spusť hru
  thenStartFn?.();

  // --- 2) Rozblikání panelu a tlačítka (jen 2 sekundy) ---
  const panel = document.getElementById('panelBg');
  const holdBtn = document.getElementById('holdButton');

  if (holdBtn) {
    holdBtn.classList.add('pulse-start');
    setTimeout(() => holdBtn.classList.remove('pulse-start'), 2000);
  }
  if (panel) {
    panel.classList.add('pulse-start');
    setTimeout(() => panel.classList.remove('pulse-start'), 2000);
  }

  // Zvuk
  const afterStartSound = new Audio('sounds/after_start.mp3');
  afterStartSound.preload = 'auto';
  afterStartSound.volume = 0.3;
  afterStartSound.currentTime = 0;
  afterStartSound.play();

  // 3) Po GO ukaž ruku (jen na 2 s)
  requestAnimationFrame(() => {
    const hand = showHandCueAtElement(document.getElementById('holdButton'), '🤚');
    if (hand) setTimeout(() => hand.remove(), 2000);
  });

}, 600);

}
};
setTimeout(tick, 1000);
}


// <<< NOVÉ STATISTIKY >>>
let attempts = 0;              // počet pokusů (release)
let successfulMatches = 0;     // počet úspěšných matchů (>= 80 %)
let sumAccuracy = 0;           // součet procent (pro průměr)

function averageAccuracy() {
  return attempts > 0 ? Math.round(sumAccuracy / attempts) : 0;
}

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

function updateTimerPulseLast10s() {
  if (!timerWrap) return;
  const last10 = timeRemaining > 0 && timeRemaining <= 10;
  timerWrap.classList.toggle('timer-blink-10s', last10);
}


let lastTick = performance.now();
function tickTimer(now) {
  if (mode === "survival") {
    // ⏳ V survivalu čas neubývá, jen zobrazujeme full bar
    timeRemaining = TIMER_MAX;
    updateTimerUI();
    return;
  }
  if (!lastTick) lastTick = now;
  const delta = (now - lastTick) / 1000;
  lastTick = now;

  timeRemaining -= delta;
  if (timeRemaining <= 0) {
    timeRemaining = 0;
    lockGame();
    triggerGameOver();   // ukaž popup hned
    return;
  }

  if (timeRemaining < TIMER_MAX && timeBank > 0) {
    const give = Math.min(TIMER_MAX - timeRemaining, timeBank);
    timeRemaining += give;
    timeBank -= give;
    blinkTimer();
  }

  updateTimerUI();
  updateTimerPulseLast10s();
}

/* === Hand cue (naváděcí ruka po GO) ==================================== */
let showHandCueNextStart = false; // nastaví se při START z help okna

function showHandCueAtElement(el, emoji = '🤚') {
  if (!el) return;
  const rect = el.getBoundingClientRect();

    // Pozice ruky: LEVÝ spodní kvadrant tlačítka
  const px = rect.left + rect.width * 0.25;
  const py = rect.top  + rect.height * 0.85;


  const cue = document.createElement('div');
  cue.id = 'handCue';
  cue.textContent = emoji; 
  cue.style.left = `${px}px`;
  cue.style.top  = `${py}px`;
  document.body.appendChild(cue);

  setTimeout(() => cue.remove(), 3000);
}

function showHandCueIfNeeded() {
  if (!showHandCueNextStart) return;
  const holdBtn = document.getElementById('holdButton');
  showHandCueAtElement(holdBtn, '🤚');
  showHandCueNextStart = false;
}


function beginNewGameFlow(fromHelp = false) {
  // schovej pop-upy
  const help = document.getElementById('helpPopup');
  const over = document.getElementById('gameOverPopup');

  if (fromHelp && help) help.style.display = 'none';
  if (over) over.classList.add('hidden');

  // spusť 3-2-1 a teprve POTOM reset + start
  runCountdown(() => {
    startNewGame();     // reset + startLevel()
  });
}

// FIX: registraci NEW GAME uděláme JEDNOU mimo flow
const newGameBtn = document.getElementById('newGameButton'); // FIX
if (newGameBtn) {
  newGameBtn.addEventListener('click', () => beginNewGameFlow(false)); // FIX
}
const menuBtn = document.getElementById("menuButton");
if (menuBtn) {
  menuBtn.addEventListener("click", () => {
    window.location.href = "index.html"; // návrat na hlavní menu
  });
}


function triggerGameOver() {
  if (gameOverShown) return;
  gameOverShown = true;

  const popup = document.getElementById("gameOverPopup");
  if (!popup) return;

  const content = popup.querySelector(".popup-content");
  const btn = document.getElementById("newGameButton");

  // 🆕 Přidáme nadpis s názvem módu
  let modeTitle = document.getElementById("gameOverMode");
  if (!modeTitle) {
    modeTitle = document.createElement("h2");
    modeTitle.id = "gameOverMode";
    modeTitle.style.marginBottom = "8px";
    modeTitle.style.fontSize = "20px";
    modeTitle.style.color = "#00ffff";
    modeTitle.style.textAlign = "center";
    content.insertBefore(modeTitle, content.firstChild);
  }

  // Překlad názvu módu
  const modeName = 
    mode === "arcade" ? "Arcade" :
    mode === "survival" ? "Survival" :
    "Challenge";

  modeTitle.textContent = `${modeName}`;

  let statsEl = document.getElementById("gameOverStats");
  if (!statsEl) {
    statsEl = document.createElement("ul");
    statsEl.id = "gameOverStats";
    content.insertBefore(statsEl, btn);
  }

  // Výpočet délky hry
const elapsedSec = Math.floor((performance.now() - gameStartTime) / 1000);
const mins = Math.floor(elapsedSec / 60);
const secs = elapsedSec % 60;
const gameTimeStr = `${mins} m ${secs} s`;

// Aktualizace nejlepšího skóre pro aktuální mód
const bestKey = getBestScoreKey();
let savedBest = parseInt(localStorage.getItem(bestKey)) || 0;
if (score > savedBest) {
  savedBest = score;
  localStorage.setItem(bestKey, savedBest);
}
bestScore = savedBest;


statsEl.innerHTML = `
  <li><strong>Score:</strong><span style="color:white; font-weight:bold;">${score}</span></li>
  <li><strong>High Score:</strong><span style="color:white; font-weight:bold;">${bestScore}</span></li>
  <hr style="border:1px solid rgba(0,255,255,0.15); margin:6px 0;">
  <li><strong>Stars hit:</strong><span style="color:white; font-weight:bold;">${successfulMatches}</span></li>
  <li><strong>Average accuracy:</strong><span style="color:white; font-weight:bold;">${averageAccuracy()} %</span></li>
  <li><strong>Game time:</strong><span style="color:white; font-weight:bold;">${gameTimeStr}</span></li>
`;

  popup.classList.remove("hidden");
}


// START z How to play → ukaž ruku po GO
document.getElementById('startGameBtn')?.addEventListener('click', () => {
  // nastavíme flag, že se má ruka ukázat
  showHandCueNextStart = true;

  // zavři okno How to play (pomocí style.display = "none")
  const help = document.getElementById('helpPopup');
  if (help) help.style.display = 'none';

  // spusť odpočet nebo hru
  if (typeof startCountdown === 'function') {
    startCountdown(); // pokud používáš 3-2-1-GO
  } else if (typeof startLevel === 'function') {
    startLevel();     // pokud jdeš rovnou do levelu
  }
});


// <<< Pomocná obálka pro konec na čas >>>
function endGame() {
  triggerGameOver();
}

// ===== Plovoucí text =====
let floaters = [];
function addFloater(text, x, y, color = '#00ffff', duration = 1700) {
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
    ctx.font = 'bold 22px Oxanium, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 5;
    ctx.fillText(f.text, f.x, f.y + f.vy * (ease * 65));
    ctx.restore();

    kept.push(f);
  }
  floaters = kept;
}

// ===== Hvězdné pozadí – 3D průlet k hráči (subtle warp) =====
let _bgLastTs = performance.now();

function generateStars(count = 200) {
  // 3D prostor kolem středu (-0.9..0.9), z = hloubka
  const Z_NEAR = 0.22;
  const Z_FAR  = 1.6;

  stars = Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 1.8,               // -0.9..0.9 (později škálujeme F/z)
    y: (Math.random() - 0.5) * 1.8,
    z: Math.random() * (Z_FAR - Z_NEAR) + Z_NEAR, // hloubka
    v: 0.14 * (0.85 + Math.random() * 0.30),      // rychlost k hráči (jemná variace)
    r: 0.3 + Math.random() * 0.7,                  // základní poloměr
    px: null, py: null                             // pro krátkou „střelku“
  }));

  _bgLastTs = performance.now(); // reset času (důležité po resize)
}

function drawStars() {
  const now = performance.now();
  const dt  = Math.min(0.05, (now - _bgLastTs) / 1000); // ochrana proti lagům
  _bgLastTs = now;

  // Projekční „ohnisko“ → určuje sílu perspektivy
  const F = Math.min(canvas.width, canvas.height) * 0.36;

  const Z_NEAR = 0.22;
  const Z_FAR  = 1.6;

  for (const s of stars) {
    // posun k hráči
    s.z -= s.v * dt;

    // když proletí kolem kamery → respawn vzadu
    if (s.z <= Z_NEAR) {
      s.x = (Math.random() - 0.5) * 1.8;
      s.y = (Math.random() - 0.5) * 1.8;
      s.z = Z_FAR;
      s.px = s.py = null;
    }

    // 3D → 2D projekce kolem centerX/centerY (ty už máš spočítané)
    const k  = F / s.z;
    const sx = centerX + s.x * k;
    const sy = centerY + s.y * k;

    // velikost + průhlednost dle hloubky (nerušivé)
    const radius = Math.max(0.4, s.r * (2.0 - s.z));   // větší hvězdy
    const alpha  = Math.min(0.6, 0.20 + (1.7 - s.z) * 0.28); // jasnější


    // krátká „střelka“ (trail) – nenápadná
    if (s.px != null && s.py != null) {
      ctx.globalAlpha = Math.min(0.35, alpha * 0.5);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(s.px, s.py);
      ctx.lineTo(sx, sy);
      ctx.strokeStyle = 'white';
      ctx.stroke();
    }

    // měkká tečka (radial gradient)
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 2, 0, Math.PI * 2);
    ctx.fill();

    // uložit předchozí 2D pozici
    s.px = sx; s.py = sy;
  }

  ctx.globalAlpha = 1;
}

function getRandomStarShape() {
  const options = ["star5", "star6", "star7", "star8"];
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
let effectTimer = 0;

let flashAlpha = 0;

let shapeX = 0;
let shapeY = 0;
let shapeVX = 0;
let shapeVY = 0;
let enableMove = false;
let enableBounce = false;

let holdHue = 200; 
let fragments = [];
let firstStart = true;
let holdGrowth = 1;

let actualHoldGrowth = 0; 
const RANDOM_BASE_SPEED = 60; // px/s


let timeBank = 0;

let blinkActive = false;
// === Multi-star config ===
const MS_MAX_STARS = 5;     // tvrdý strop počtu hvězd
const MS_MARGIN = 16;       // bezpečný okraj (zvednuto)
const MS_PACKING_SCALE = 1.10; // +12 % rezerva pro ostré špičky

let multiStarMode = false;
let msStars = [];            // hvězdy na scéně (decoy + aktivní)
let msActiveIndex = null;    // index hvězdy, která se po HOLD rozpíná
const MS_SIZE_POOL = [0.84, 0.92, 1.00, 1.08, 1.16]; // 5 velikostí jako ve výchozím stavu
let currentLevelSettings = null; // abychom mohli po hitu znovu naspawnovat stejné chování



let loopRunning = false;

let gameOverShown = false; // zda už byl zobrazen popup

let lastReleaseTs = 0;

const matchLabel = document.getElementById("matchLabel");
const allStarShapes = ["star5", "star6", "star7", "star8"];

const levels = [
  // === 1 hvězda ===
  { lineWidth: 6, holdGrowth: 1.00 }, // statická
  { lineWidth: 6, oscillate: true, scaleMin: 0.95, scaleMax: 1.05, scaleSpeed: 0.060, holdGrowth: 1.12 }, // jemná pulzace (±5 %)
  { lineWidth: 6, rotationSpeed: 0.010, rotationCheck: true, holdGrowth: 1.16 }, // rotující (rychlejší)
  { lineWidth: 6, move: true, bounce: true, rotationSpeed: 0.008, rotationCheck: true, speed: 2.6, holdGrowth: 1.20, noOverlap: true }, 
  { lineWidth: 6, rotationSpeed: 0.010, rotationCheck: true, move: true, bounce: true, oscillate: true, scaleMin: 0.93, scaleMax: 1.07, scaleSpeed: 0.075, speed: 2.9, holdGrowth: 1.26, noOverlap: true }, // finále (±7 % pulzace)

  // === 2 hvězdy ===
  { lineWidth: 6, multiStars: true, starsCount: 2, holdGrowth: 1.30 }, 
  { lineWidth: 6, multiStars: true, starsCount: 2, oscillate: true, scaleMin: 0.92, scaleMax: 1.08, scaleSpeed: 0.080, holdGrowth: 1.34 }, // mírně větší pulzace (±8 %)
  { lineWidth: 6, multiStars: true, starsCount: 2, rotationSpeed: 0.012, rotationCheck: true, holdGrowth: 1.36 }, // rychlejší rotace
  { lineWidth: 6, multiStars: true, starsCount: 2, move: true, bounce: true, rotationSpeed: 0.009, rotationCheck: true, speed: 3.0, holdGrowth: 1.38, noOverlap: true }, 
  { lineWidth: 6, multiStars: true, starsCount: 2, rotationSpeed: 0.012, rotationCheck: true, move: true, bounce: true, oscillate: true, scaleMin: 0.91, scaleMax: 1.09, scaleSpeed: 0.090, speed: 3.3, holdGrowth: 1.42, noOverlap: true }, // finále (±9 % pulzace)

  // === 3 hvězdy ===
  { lineWidth: 6, multiStars: true, starsCount: 3, holdGrowth: 1.48 }, 
  { lineWidth: 6, multiStars: true, starsCount: 3, oscillate: true, scaleMin: 0.91, scaleMax: 1.09, scaleSpeed: 0.090, holdGrowth: 1.52 }, // silnější pulzace (±9 %)
  { lineWidth: 6, multiStars: true, starsCount: 3, rotationSpeed: 0.014, rotationCheck: true, holdGrowth: 1.54 }, // ještě rychlejší rotace
  { lineWidth: 6, multiStars: true, starsCount: 3, move: true, bounce: true, rotationSpeed: 0.011, rotationCheck: true, speed: 3.4, holdGrowth: 1.56, noOverlap: true }, 
  { lineWidth: 6, multiStars: true, starsCount: 3, rotationSpeed: 0.012, rotationCheck: true, move: true, bounce: true, oscillate: true, scaleMin: 0.90, scaleMax: 1.10, scaleSpeed: 0.100, speed: 3.7, holdGrowth: 1.60, noOverlap: true }, // finále (±10 % pulzace, rotace nechána)
];


// ❤️ životy
let lives = 5;

// DOPLNĚNÉ: strop a checkpoint levely
const MAX_LIVES = 5;
const CHECKPOINT_LEVELS = new Set([10, 12, 14]);

function updateLivesDisplay() {
  const hearts = document.querySelectorAll(".heart");
  hearts.forEach((heart, index) => heart.classList.toggle("lost", index >= lives));
}
function updateLevelDisplay() {
  const levelDisplay = document.getElementById("levelLabel");
  if (levelDisplay) levelDisplay.textContent = `LEVEL ${level}`;
}

function createFragments(shape, x, y) {
  const count = Math.floor(Math.random() * 40) + 50; // 50–90 částic
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 3.5 + 1.5; // svižnější odlet
    const size = Math.random() * 12 + 8;      // větší částice (8–20 px)

    fragments.push({
      shape, x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.07,
      size,
      alpha: 1.0,
      hue: holdHue + hue   // neon barva hvězdy
    });
  }

  if (fragments.length > 600) fragments.splice(0, fragments.length - 600);
}



/* OSCILACE */
let oscillate = false;
let scaleMin = 1;
let scaleMax = 1;
let scaleSpeed = 0;
let scalePhase = 0;
let baseTargetRadius = 80;



// === Helpers pro MULTI-STARS ===
function msShuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function msRand(min, max){ return Math.random()*(max-min)+min; }
function msDistance(ax,ay,bx,by){ return Math.hypot(ax-bx, ay-by); }

// Dynamický základní poloměr pro multi-stars (menší na užších displejích)
function msBaseRadius(){
  const u = Math.min(canvas.width, canvas.height);
  return Math.max(54, Math.floor(u * 0.20)); 
}

// Umístění jedné hvězdy bez překryvu, s efektivním poloměrem (včetně pulzu + tloušťky)
function msPlaceNonOverlappingStar(effR, list){
  // effR = efektivní (největší) poloměr hvězdy včetně pulzu, čáry a marginu
  for (let tries = 0; tries < 300; tries++){
    const x = msRand(effR, canvas.width  - effR);
    const y = msRand(effR, canvas.height - effR);
    let ok = true;
    for (const o of list){
      if (msDistance(x, y, o.x, o.y) < (effR + o.effR)) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  return null; // nešlo umístit bez kolize
}


// Vygeneruje sadu hvězd; pokud se nevejdou, zmenšuje je, dokud se nevejdou.
function spawnMultiStars(settings){
  msStars = [];
  msActiveIndex = null;

  // pevný limit počtu hvězd
  const N = Math.min(settings.starsCount ?? 3, 4); // max 4 hvězdy


  const isPulsing = !!settings.oscillate;
  const sMin = isPulsing ? (settings.scaleMin ?? 1) : 1;
  const sMax = isPulsing ? (settings.scaleMax ?? 1) : 1;

  // pool velikostí přesně pro N
  // pro 5 hvězd použij „větší“ sadu multiplikátorů
const sizePool5 = [0.95, 1.00, 1.05, 1.12, 1.20];
const poolBase = (N >= 5) ? sizePool5 : MS_SIZE_POOL;
const pool = msShuffle([...poolBase]).slice(0, N);


  // víc „vzduchu“ u hustších levelů
  const packing = (N >= 5) ? Math.max(MS_PACKING_SCALE, 1.18) : MS_PACKING_SCALE;

  // 1) zkus náhodné rozmístění s adaptivním zmenšováním
  let base = msBaseRadius();
  // N=5 → přidej 25 % velikosti (jen pro multi-stars s 5 kusy)
if (N >= 5) base = Math.floor(base * 1.25);

  if (N >= 5) base = Math.floor(base * 1.10); // 5 hvězd → +10 % velikost
  for (let attempt = 0; attempt < 6; attempt++){
    const tmp = [];
    let ok = true;

    for (let i = 0; i < N; i++){
      const mul   = pool[i % pool.length];
      const baseR = base * mul;

      const maxStroke = Math.max(1, lineWidth) * 0.5;
      const effR      = baseR * sMax * packing + maxStroke + MS_MARGIN;

      const pos = msPlaceNonOverlappingStar(effR, tmp);
      if (!pos){ ok = false; break; }

      tmp.push({
        x: pos.x, y: pos.y,
        baseR, effR,
        curR: baseR,
        scaleMin: sMin, scaleMax: sMax,
        scaleSpeed: isPulsing ? ((settings.scaleSpeed ?? 0) * 60) : 0,
        scalePhase: Math.random() * Math.PI * 2,
        pulsing: isPulsing,
        growRadius: 0,
        growthSpeed: 0,
        vx: (Math.random() - 0.5) * (settings.speed ?? 2.5) * 60,
        vy: (Math.random() - 0.5) * (settings.speed ?? 2.5) * 60
      });
    }

    if (ok){ msStars = tmp; return; }
    base = Math.floor(base * 0.9); // zmenši a zkus znovu
  }

  // 2) GRID fallback – vždy bez kolize
    // 2) HEX/STAGGER fallback – pestřejší rozložení bez kolizí
  // z dostupných (cols, rows) vyber vyvážené rozdělení a trochu ho náhodně obměň
  const options = [];
  for (let c = 1; c <= N; c++){
    const r = Math.ceil(N / c);
    options.push([c, r]);
  }
  options.sort((a,b)=>Math.abs(a[0]-a[1]) - Math.abs(b[0]-b[1]));
  let [cols, rows] = options[Math.min(Math.floor(Math.random()*2), options.length-1)];
  if (Math.random() < 0.5) [cols, rows] = [rows, cols]; // občas prohoď osy

  const cellW = canvas.width  / cols;
  const cellH = canvas.height / rows;

  const maxStroke = Math.max(1, lineWidth) * 0.5;

  const cellScale = (N >= 5) ? 0.48 : 0.42; // pro 5 hvězd větší buňky
const cellR = Math.max(24, Math.floor(Math.min(cellW, cellH) * cellScale));

  const baseFromCell = (cellR - maxStroke - MS_MARGIN) / (sMax * packing);

  const JITTER = Math.min(cellW, cellH) * 0.14;              // lehké rozházení
  const rowOffsetSign = Math.random() < 0.5 ? 1 : -1;        // směr stagger posunu

  msStars = [];
  const poolShuffled = msShuffle([...pool]);                 // aby se nevytvářel stejný vzor

  for (let i = 0; i < N; i++){
    const r = Math.floor(i / cols);
    const c = i % cols;

    // střed buňky
    let cx = (c + 0.5) * cellW;
    let cy = (r + 0.5) * cellH;

    // „hex“ stagger: každý lichý řádek posuň o půl buňky
    if (r % 2 === 1){
      cx += rowOffsetSign * 0.5 * cellW;
    }

    // omez do canvasu, kdyby posun vyjel ven
    cx = Math.max(cellR, Math.min(canvas.width  - cellR, cx));
    cy = Math.max(cellR, Math.min(canvas.height - cellR, cy));

    // náhodné rozházení v rámci buňky
    cx += msRand(-JITTER, JITTER);
    cy += msRand(-JITTER, JITTER);

    const mul   = poolShuffled[i % poolShuffled.length];
    const baseR = Math.max(20, baseFromCell * mul);
    const effR  = baseR * sMax * packing + maxStroke + MS_MARGIN;

    const x = Math.max(effR, Math.min(canvas.width  - effR, cx));
    const y = Math.max(effR, Math.min(canvas.height - effR, cy));

    msStars.push({
      x, y,
      baseR, effR,
      curR: baseR,
      scaleMin: sMin, scaleMax: sMax,
      scaleSpeed: isPulsing ? (settings.scaleSpeed ?? 0) : 0,
      scalePhase: Math.random() * Math.PI * 2,
      pulsing: isPulsing,
      growRadius: 0,
      growthSpeed: 0
    });
  }

  // náhodné zrcadlení rozložení, ať se neokouká
  if (Math.random() < 0.5){ for (const s of msStars) s.x = canvas.width  - s.x; }
  if (Math.random() < 0.5){ for (const s of msStars) s.y = canvas.height - s.y; }
}

// === /Helpers pro MULTI-STARS ===

// updater a renderer pro multi-stars (MIMO startLevel, na top-levelu)
function updateMultiStars(dt){
  for (const s of msStars){
    // pulzace
    if (s.pulsing){
      s.scalePhase += s.scaleSpeed * dt;
      const t = (Math.sin(s.scalePhase) + 1) / 2;
      const ratio = s.scaleMin + (s.scaleMax - s.scaleMin) * t;
      s.curR = s.baseR * ratio;
    } else {
      s.curR = s.baseR;
    }

    // pohyb + odrazy od stěn
    if (currentLevelSettings.move && currentLevelSettings.bounce){
      s.x += s.vx * dt;
      s.y += s.vy * dt;


      if (s.x - s.curR <= 0 && s.vx < 0) { s.vx *= -1; s.x = s.curR; }
      if (s.x + s.curR >= canvas.width && s.vx > 0) { s.vx *= -1; s.x = canvas.width - s.curR; }
      if (s.y - s.curR <= 0 && s.vy < 0) { s.vy *= -1; s.y = s.curR; }
      if (s.y + s.curR >= canvas.height && s.vy > 0) { s.vy *= -1; s.y = canvas.height - s.curR; }
    }
  }

  // jednoduchá kolize hvězda–hvězda (repel + prohození rychlostí)
  for (let i=0;i<msStars.length;i++){
    for (let j=i+1;j<msStars.length;j++){
      const a = msStars[i], b = msStars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx,dy);
      const minDist = a.curR + b.curR + 4;
      if (dist < minDist && dist > 0){
        const push = (minDist - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        // fake bounce: prohoď rychlosti
        [a.vx, b.vx] = [b.vx, a.vx];
        [a.vy, b.vy] = [b.vy, a.vy];
      }
    }
  }
}


function drawMultiStars(){
  // decoy hvězdy
  for (let i = 0; i < msStars.length; i++){
    const s = msStars[i];
    drawShape(
      currentShape,
      s.x,
      s.y,
      s.curR,
      currentLevelSettings.rotationCheck ? rotation : 0,  // pokud je rotující level, toč i decoy
      currentColorShift + hue,
      lineWidth
    );
  }
  // aktivní rozpínaná hvězda navrch (pokud existuje)
  if (msActiveIndex != null){
    const s = msStars[msActiveIndex];
    drawShape(
      currentShape,
      s.x,
      s.y,
      s.growRadius,
      currentLevelSettings.rotationCheck ? rotation : 0,  // hráčova taky synchronní
      holdHue + hue,
      Math.max(5, lineWidth)
    );
  }
}


// === LEVEL ANNOUNCE (canvas overlay) ===
const levelAnnounce = { active:false, text:'', start:0, dur:1400 };

function triggerLevelAnnounce(n, ms = 1400, extra = "") {
  levelAnnounce.active = true;
  levelAnnounce.text = `LEVEL ${n}`;
  levelAnnounce.extra = extra;   // nový řádek
  levelAnnounce.start = performance.now();
  levelAnnounce.dur   = ms;
}


function drawLevelAnnounce(now){
  if (!levelAnnounce.active) return;
  const t = (now - levelAnnounce.start) / levelAnnounce.dur;
  if (t >= 1){ levelAnnounce.active = false; return; }

  // fade-in/out
  const fade = 0.15;
  let alpha;
  if (t < fade) alpha = t / fade;
  else if (t > 1 - fade) alpha = (1 - t) / fade;
  else alpha = 1;

  // parametry hlavního nápisu
  const SCALE_AMP = 0.02;
  const MAX_ALPHA = 0.80;

  const fs = Math.round(Math.min(32, Math.max(18, canvas.width * 0.065)));
  const posY = Math.max(24, canvas.height * 0.12);

  const scale = 0.98 + SCALE_AMP * Math.sin(Math.min(1, t) * Math.PI);

  // === Hlavní "LEVEL X" (může se lehce škálovat) ===
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha) * MAX_ALPHA;
  ctx.translate(canvas.width / 2, posY);
  ctx.scale(scale, scale);

  ctx.font = `bold ${fs}px Oxanium, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur  = 5;
  ctx.lineWidth   = 1;
  ctx.strokeStyle = 'rgba(0,0,0,.5)';
  ctx.fillStyle   = 'rgba(0,255,255,.85)';

  ctx.strokeText(levelAnnounce.text, 0, 0);
  ctx.fillText(levelAnnounce.text, 0, 0);
  ctx.restore();

  // === EXTRA řádek pod LEVEL (statický, bez škálování/posuvu) ===
  if (levelAnnounce.extra){
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha) * 0.95; // může být klidně o chlup výraznější
    ctx.translate(canvas.width / 2, posY + fs * 0.95); // pevně pod LEVEL (cca 1 řádek)

    // volitelný "pill" podklad pro čitelnost
    const extraText = levelAnnounce.extra;
    ctx.font = `bold ${Math.round(fs * 0.78)}px Oxanium, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // podklad (tmavý průsvitný obdélník se zakulacením)
    const metrics = ctx.measureText(extraText);
    const txtW = metrics.width;
    const padX = Math.round(fs * 0.40);
    const padY = Math.round(fs * 0.28);
    const pillW = txtW + padX * 2;
    const pillH = Math.round(fs * 0.95);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const rx = pillW / 2, ry = pillH / 2, r = Math.min(12, fs * 0.4);
    ctx.beginPath();
    ctx.moveTo(-rx + r, -ry);
    ctx.lineTo(rx - r, -ry);
    ctx.quadraticCurveTo(rx, -ry, rx, -ry + r);
    ctx.lineTo(rx, ry - r);
    ctx.quadraticCurveTo(rx, ry, rx - r, ry);
    ctx.lineTo(-rx + r, ry);
    ctx.quadraticCurveTo(-rx, ry, -rx, ry - r);
    ctx.lineTo(-rx, -ry + r);
    ctx.quadraticCurveTo(-rx, -ry, -rx + r, -ry);
    ctx.closePath();
    ctx.fill();

    // samotný text
    ctx.fillStyle = '#ffea00';
    ctx.shadowColor = '#ffea00';
    ctx.shadowBlur  = 10;
    ctx.fillText(extraText, 0, 0);

    ctx.restore();
  }
}




function startLevel() {
  document.getElementById("gameOverPopup").classList.add("hidden");
    // Nikdy nepřekroč level 15 (kvůli zobrazování LEVEL 15+)
  if (level > 15) level = 15;


  // 1) Nastavení levelu
  const settings = levels[Math.min(level - 1, levels.length - 1)];
  currentLevelSettings = settings;
  if (settings.multiStars) {
    settings.starsCount = Math.min(settings.starsCount ?? 3, MS_MAX_STARS);
  }

  // 2) Základní parametry (single-target default)
  lineWidth = settings.lineWidth;
  rotationSpeed = (settings.rotationSpeed ?? 0) * 60; // rad/s
  needsRotationCheck = settings.rotationCheck;
  enableMove = settings.move || false;
  enableBounce = settings.bounce || false;

  holdGrowth = (settings.holdGrowth ?? 1) * 60; // px/s
  // 🎯 Fix: náhodná rychlost s minimem
function randVelComp(spd, minFrac = 0.5) {
  const min = spd * minFrac;
  let v = (Math.random() - 0.5) * spd;
  if (Math.abs(v) < min) {
    v = Math.sign(v || 1) * min;
  }
  return v * 60; // px/s
}


if (settings.speed) {
  const spd = settings.speed;
  shapeVX = randVelComp(spd, 0.3);
  shapeVY = randVelComp(spd, 0.3);
}

oscillate   = settings.oscillate || false;
scaleMin    = settings.scaleMin ?? 1;
scaleMax    = settings.scaleMax ?? 1;
scaleSpeed  = (settings.scaleSpeed ?? 0) * 60; // "fázová" rychlost za sekundu
scalePhase  = 0;

 // ★ CHECKPOINT LIFE – na začátku vybraných levelů doplň +1 (max 5)
//    + zároveň si připravíme text pro banner (vedle "LEVEL X")
let bannerExtra = "";
if (CHECKPOINT_LEVELS.has(level)) {
  const before = lives;
  if (before < MAX_LIVES) {
    lives = Math.min(MAX_LIVES, lives + 1);
    updateLivesDisplay && updateLivesDisplay();
    if (lives > before) bannerExtra = "+1 LIFE"; // zobraz jen, když se skutečně přidalo
  }
}


  // 3) Multi-stars režim?
  multiStarMode = !!settings.multiStars;

  if (multiStarMode) {
    // Multi-stars: bez pohybu/odrazu
    enableMove = false;
    enableBounce = false;

    remainingShapes = [...allStarShapes].sort(() => Math.random() - 0.5);

    if (firstStart) {
      updateMatchLabel(0);
      firstStart = false;
    }

    // Vyber tvar a spawn
    nextShape();
    spawnMultiStars(settings);

    updateLivesDisplay();
    updateLevelDisplay();

    // ✅ OZNÁMENÍ LEVELU V CANVASU (jen od 2. levelu výš)
    if (level > 1) {
  triggerLevelAnnounce(level, 1500, bannerExtra);
}



    return; // konec větve multi-stars
  }

  // 4) Single-target (levely 1–8)
  remainingShapes = [...allStarShapes].sort(() => Math.random() - 0.5);
  shapeX = centerX;
  shapeY = centerY;
  shapeVX = (Math.random() - 0.5) * 4 * 60;
  shapeVY = (Math.random() - 0.5) * 4 * 60;

  if (firstStart) {
    updateMatchLabel(0);
    firstStart = false;
  }

  nextShape();
  updateLivesDisplay();
  updateLevelDisplay();

  // ✅ OZNÁMENÍ LEVELU V CANVASU (jen od 2. levelu výš)
  if (level > 1) triggerLevelAnnounce(level, 1500, bannerExtra);
}


function nextShape() {
  // Když dojdou tvary v levelu…
  if (remainingShapes.length === 0) {
    if (level < 15) {
      // …do levelu 17 přecházíme normálně do dalšího levelu
      level++;
      startLevel();
      return;
    } else {
      // ★ Jsme v posledním levelu (15): NEZVYŠUJ level,
      // jen znovu naplň sadu tvarů a pokračuj dál bez změny obtížnosti.
      remainingShapes = [...allStarShapes].sort(() => Math.random() - 0.5);
      // nevoláme startLevel(), zůstáváme v 18 a jedeme dál
    }
  }

  // standardní přidělení dalšího tvaru
  currentShape = remainingShapes.pop();
  rotation = 0;
  radius = 0;

  baseTargetRadius = Math.random() * 50 + 50;
  targetRadius = baseTargetRadius;
  currentColorShift = Math.random() * 360;
}


function drawStarShape(shape, r) {
  ctx.beginPath();
  const spikes = { star5: 5, star6: 6, star7: 7, star8: 8 }[shape] || 5;
  const step = Math.PI / spikes;
  const innerR = r * 0.5;

  for (let i = 0; i < 2 * spikes; i++) {
    const radiusMod = i % 2 === 0 ? r : innerR;
    const angle = i * step - Math.PI / 2;
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

  // Neonový radiální gradient – všechno plně neprůhledné
  const gradient = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
  gradient.addColorStop(0, `hsl(${baseHue % 360}, 100%, 70%)`);
  gradient.addColorStop(0.5, `hsl(${(baseHue + 40) % 360}, 100%, 65%)`);
  gradient.addColorStop(1, `hsl(${(baseHue + 80) % 360}, 100%, 60%)`);

  ctx.strokeStyle = gradient;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";  
  ctx.lineCap = "round";
  ctx.shadowColor = `hsl(${(baseHue + 60) % 360}, 100%, 70%)`;
  ctx.shadowBlur = 5;

  drawStarShape(shape, r);
  ctx.stroke();

  ctx.restore();
}


// === GOLD RENDERING FOR BONUS STAR ===
function drawGoldStar(x, y, r, rotation = 0, width = 6) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // Jemný zlatý halo
  const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.4);
  halo.addColorStop(0, 'rgba(255, 230, 120, 0.35)');
  halo.addColorStop(1, 'rgba(255, 230, 120, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
  ctx.fill();

  // Zlatý stroke (lesklý přechod)
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0.00, '#FFE07A'); // světle zlatá
  g.addColorStop(0.45, '#FFC93C'); // sytější zlatá
  g.addColorStop(0.55, '#FFD66E'); // highlight
  g.addColorStop(1.00, '#E3A500'); // tmavší zlatá
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(3, width);

  // 🔑 Stejné zakulacení rohů jako ostatní hvězdy
  ctx.lineJoin = "round";
  ctx.lineCap  = "round";

  ctx.shadowColor = '#FFD45A';
  ctx.shadowBlur = Math.max(8, r * 0.25);

  drawStarShape(currentShape, r);
  ctx.stroke();
  ctx.restore();
}


// Jedna zlatá jiskra (pro trail)
function drawGoldSparkle(s) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, s.a);
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);

  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s.size);
  grad.addColorStop(0, 'rgba(255, 240, 180, 0.95)');
  grad.addColorStop(0.4, 'rgba(255, 208, 90, 0.85)');
  grad.addColorStop(1, 'rgba(255, 208, 90, 0)');
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.arc(0, 0, s.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


/* ======================= BONUS STAR (náhodná bonusová hvězda, single-focus) ======================= */
// <<< BONUS: modul pro bonusovou hvězdu – čistá scéna, přebere HOLD >>>
const bonus = {
  active: false,
  type: null,            // 'points' | 'seconds' | 'x2'
  hue: 50,
  x: 0,
  y: -60,
  vy: 120,               // zpomalený pád (férový hit)
  baseR: 56,
  pulseAmp: 0.10,
  pulseHz: 1.8,
  curR: 56,
  hitWinR: 26,           // tolerance rozdílu poloměrů pro zásah
  lastSpawnSec: 0,
  spawnCooldownSec: 10,
  captureHold: false,    // když true, HOLD rozpíná bonus.holdRadius
  holdRadius: 0,
  pauseMainScene: false, // čisté plátno pro bonus
  announceEl: null,      // ⬅️ chyběla čárka!

  // --- VIZUÁLNÍ ODLÍŠENÍ (always gold) ---
  alwaysGold: true,      // ⬅️ správná kapitalizace „G“
  sparkles: [],          // zlatý prach
  emitAccumulator: 0,    // akumulátor pro emisi jisker (podle rychlosti pádu)
  prevX: 0,
  prevY: -60
};
let bonusPrevTs = performance.now();

// Bonus oznámení – už jen do canvasu
function bonusInitDOM() {
  // prázdné – dřív se tady připravoval DOM, teď už ne
}

function bonusAnnounce(txt) {
  const color = '#00ffff';
  addFloater(txt, bonus.x, Math.max(20, bonus.y - (bonus.curR * 0.5 + 12)), color, 3000);
}


function bonusPickType(){
  const r = Math.random();
  if (r < 0.34) return 'points';
  if (r < 0.67) return 'seconds';
  return 'x2';
}
function bonusPrepareCleanScene(){
  // vyčisti efekty hlavní scény
  showWrong = false;
  effectTimer = 0;
  floaters = [];
  flashAlpha = 0;

  bonus.pauseMainScene = true;
}
function bonusSpawn(){
  const nowSec = performance.now()/1000;
  if (bonus.active) return false;
  if (nowSec - bonus.lastSpawnSec < bonus.spawnCooldownSec) return false;
  

  bonusPrepareCleanScene();

  bonus.type = bonusPickType();
  bonus.hue  = bonus.type==='points' ? 48 : (bonus.type==='seconds' ? 200 : 0);

// přehraj zvuk objevení bonusu
bonusAppearSound.currentTime = 0;
bonusAppearSound.play();


  // padá středem obrazovky
  bonus.x = centerX;
  bonus.y = -60;
  bonus.vy = Math.max(95, Math.min(140, canvas.height*0.22 + Math.random()*30));
  bonus.baseR = 54 + Math.random()*8;
  bonus.pulseAmp = 0.10;
  bonus.pulseHz  = 1.8;
  bonus.curR = bonus.baseR;

  bonus.captureHold = true;
  bonus.holdRadius = 0;

  bonus.active = true;
  bonus.lastSpawnSec = nowSec;
  return true;

  bonus.prevX = bonus.x;
  bonus.prevY = bonus.y;
  bonus.sparkles.length = 0;
  bonus.emitAccumulator = 0;

}
function bonusUpdateAndDraw(now, dt){
  if (!bonus.active) return;

  // pohyb a pulz
  bonus.y += bonus.vy * dt;
  const t = (now/1000);
  const scale = 1 + Math.sin(t * Math.PI*2 * bonus.pulseHz) * bonus.pulseAmp;
  bonus.curR = bonus.baseR * scale;

  // === EMIT ZLATÝCH JISKER (trail) podél dráhy ===
  // emise úměrná rychlosti pádu, hladká přes akumulátor
  const emitRate = Math.max(12, Math.min(60, bonus.vy * 0.35)); // j/s
  bonus.emitAccumulator += emitRate * dt;

  while (bonus.emitAccumulator >= 1) {
    bonus.emitAccumulator -= 1;

    const ang = Math.PI + (Math.random() * 0.6 - 0.3); // většinou "dozadu"
    const spd = 25 + Math.random() * 50;
    const offR = bonus.curR * (0.15 + Math.random() * 0.25);

    bonus.sparkles.push({
      x: bonus.x + (Math.random() * 2 - 1) * offR,
      y: bonus.y + (Math.random() * 2 - 1) * offR,
      vx: Math.cos(ang) * spd * 0.6,
      vy: Math.sin(ang) * spd * 0.6 + 20,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.6,
      size: 2 + Math.random() * 4,
      a: 0.95,
      fa: 0.015 + Math.random() * 0.02 // rychlost blednutí
    });
  }

  // update + draw sparkles (ZA hvězdou, proto dřív než hvězdu)
  const kept = [];
  for (const s of bonus.sparkles) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.rot += s.vr * dt;
    s.a -= s.fa;
    if (s.a > 0 && s.size > 0.3) {
      drawGoldSparkle(s);
      kept.push(s);
    }
  }
  bonus.sparkles = kept;

  // === BONUS HVĚZDA: vždy zlatá ===
  ctx.save();
  ctx.globalAlpha = 0.98;

  if (bonus.alwaysGold) {
    // silnější “additive” look
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    drawGoldStar(bonus.x, bonus.y, bonus.curR, 0, 6);
    ctx.globalCompositeOperation = prevOp;
  } else {
    // fallback (kdybys někdy chtěl vrátit barvy dle typu)
    drawShape(currentShape, bonus.x, bonus.y, bonus.curR, 0, bonus.hue, 6);
  }
  ctx.restore();

  // Hráčova hvězda (držení) – zůstává původní, ale kreslíme ji NAVRCHU
  if (bonus.captureHold && isHolding){
    ctx.save();
    drawShape(currentShape, bonus.x, bonus.y, bonus.holdRadius, 0, holdHue + hue, 5);
    ctx.restore();
  }

  // zmizel pod panelem? návrat do hry
  if (bonus.y - bonus.curR > canvas.height){
    bonus.active = false;
    bonus.captureHold = false;
    bonus.pauseMainScene = false;
    bonus.sparkles.length = 0; // uklid
  }
}

function bonusTryHitOnRelease(){
  if (!bonus.active) return false;

  const maxSizeDiff = 30;
  const sizeDiff = Math.abs(bonus.holdRadius - bonus.curR);
  const sizeRatio = bonus.holdRadius > bonus.curR + maxSizeDiff ? 0 : (1 - sizeDiff / maxSizeDiff);
  const match = Math.round(Math.max(0, sizeRatio * 100));

  updateMatchLabel(match);

  let success = false;
  if (match >= 80) {
    if (bonus.type === 'points') {
      score += 10; 
      updateScoreUI(); 
      pulseScore();
      bonusAnnounce("+10 POINTS");
    } else if (bonus.type === 'seconds') {
      if (mode === "challenge") {
        if (timeRemaining < TIMER_MAX) timeRemaining = Math.min(TIMER_MAX, timeRemaining + 10);
        else timeBank += 10;
        updateTimerUI(); 
        blinkTimer();
        bonusAnnounce("+10 SECONDS");
      } else if (mode === "arcade") {
        score += 10; 
        updateScoreUI(); 
        pulseScore();
        bonusAnnounce("+10 SCORE");
      }
    } else if (bonus.type === 'x2') {
      score = Math.floor(score * 2); 
      updateScoreUI(); 
      pulseScore();
      bonusAnnounce("SCORE ×2");
    }

    createFragments(currentShape, bonus.x, bonus.y);
    explosionSound.currentTime = 0; 
    explosionSound.play();
    success = true;

  } else {
    showWrong = true; effectTimer = 30;
    failSound.currentTime = 0; failSound.play();
    addFloater('NO LIFE LOST', bonus.x, Math.max(20, bonus.y - (bonus.curR + 18)), '#FFD45A', 1700);
  }

  bonus.active = false;
  bonus.captureHold = false;
  bonus.pauseMainScene = false;
  return success;
}


function bonusMaybeSpawnAfterRelease(){
  if (bonus.active) return;
  const nowSec = performance.now()/1000;
  if (nowSec - bonus.lastSpawnSec < bonus.spawnCooldownSec) return;
  if (Math.random() < 0.30){
    setTimeout(() => { bonusSpawn(); }, 200);
  }
}
// <<< /BONUS modul >>>

function draw() {
  const now = performance.now();
  const dtFrame = Math.min(0.05, (now - bonusPrevTs) / 1000);
  bonusPrevTs = now;

  // Při bonusu roste "bonus.holdRadius" místo běžného radiusu
  if (bonus.captureHold && isHolding){
  bonus.holdRadius += actualHoldGrowth * dtFrame;
}

  // FIX: timer jen když neběží odpočet a hra není u konce
  if (!isCountdown && !isGameOver) tickTimer(now); // FIX

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawStars();

  // BONUS: posun + kresba bonusové hvězdy
  bonusUpdateAndDraw(now, dtFrame);

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

  if (enableMove) {
    if (enableBounce) {
      if (shapeX - targetRadius <= 0 && shapeVX < 0) { shapeVX *= -1; shapeX = targetRadius; }
      else if (shapeX + targetRadius >= canvas.width && shapeVX > 0) { shapeVX *= -1; shapeX = canvas.width - targetRadius; }
      if (shapeY - targetRadius <= 0 && shapeVY < 0) { shapeVY *= -1; shapeY = targetRadius; }
      else if (shapeY + targetRadius >= canvas.height && shapeVY > 0) { shapeVY *= -1; shapeY = canvas.height - targetRadius; }
    }
    shapeX += shapeVX * dtFrame;
    shapeY += shapeVY * dtFrame;
  }

  if (oscillate) {
    scalePhase += scaleSpeed * dtFrame;
    const t = (Math.sin(scalePhase) + 1) / 2;
    const ratio = scaleMin + (scaleMax - scaleMin) * t;
    targetRadius = baseTargetRadius * ratio;
  } else {
    targetRadius = baseTargetRadius;
  }

 // --- Hlavní scéna jen když není bonus v single-focus režimu ---
if (!bonus.pauseMainScene) {

  if (multiStarMode){
  if (typeof updateMultiStars === 'function') {
    updateMultiStars(dtFrame);
  }

  if (isHolding){
    if (msActiveIndex == null && msStars.length > 0){
      msActiveIndex = Math.floor(Math.random() * msStars.length);
      msStars[msActiveIndex].growRadius = 0;
    }
    if (msActiveIndex != null){
  const s = msStars[msActiveIndex];
  // menší hvězda → pomalejší růst, větší hvězda → o trochu rychlejší
  const sizeFactor = Math.max(0.65, Math.min(1.15, s.curR / 90));
  const speedScale = 0.80; // globální zpomalení multi-stars
  const gSpeed = s.growthSpeed || actualHoldGrowth;
  s.growRadius += gSpeed * speedScale * sizeFactor * dtFrame;
}

  }

  if (typeof drawMultiStars === 'function') {
    drawMultiStars();
  }
} else {
  // původní single-target větev (tu nech tak, jak ji máš)
  ctx.save();
  ctx.strokeStyle = `hsl(${hue}, 100%, 70%)`;
  ctx.lineWidth = lineWidth;
  drawShape(currentShape, shapeX, shapeY, targetRadius, rotation, currentColorShift + hue, lineWidth);
  ctx.restore();

  if (isHolding && radius < targetRadius + 1000) radius += actualHoldGrowth * dtFrame;

  if (isHolding) {
  ctx.save();
  ctx.translate(shapeX, shapeY);
  ctx.rotate(rotation);
  drawStarShape(currentShape, radius);
  ctx.fill();
  ctx.restore();

  drawShape(currentShape, shapeX, shapeY, radius, rotation, holdHue + hue, 5);
}
}
}

  // --- konec gate ---

  drawFloaters(now);

for (let frag of fragments) {
  ctx.save();
  ctx.globalAlpha = frag.alpha;

  if (frag.type === "shockwave") {
    ctx.strokeStyle = `hsla(${frag.hue % 360}, 100%, 60%, ${frag.alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(frag.x, frag.y, frag.size, 0, Math.PI * 2);
    ctx.stroke();
    frag.size += 2.2;
    frag.alpha -= 0.03;
  } else {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, frag.size);
    grad.addColorStop(0, `hsla(${frag.hue % 360}, 100%, 70%, 1)`);
    grad.addColorStop(1, `hsla(${frag.hue % 360}, 100%, 70%, 0)`);

    ctx.fillStyle = grad;
    ctx.translate(frag.x, frag.y);
    ctx.rotate(frag.rotation);
    ctx.beginPath();
    ctx.arc(0, 0, frag.size, 0, Math.PI * 2);
    ctx.fill();

    frag.x += frag.vx;
    frag.y += frag.vy;
    frag.rotation += frag.rotationSpeed;
    frag.size *= 1.01;
    frag.alpha -= 0.008;
  }
  ctx.restore();
}
fragments = fragments.filter(f => f.alpha > 0);


   drawLevelAnnounce(now);


  rotation += rotationSpeed * dtFrame;
  hue = (hue + 1) % 360;

  if (!isGameOver) {
    loopRunning = true;
    requestAnimationFrame(draw);
  } else {
    loopRunning = false; // smyčka zastavena
  }
}

// <<< PŮVODNÍ resizeCanvas NAHRAZEN >>>
sizeGameCanvas(); // nastavit plátno hned po startu
// <<< BONUS: init announcer >>>
bonusInitDOM();

function updateMatchLabel(percentage) {
  matchLabel.textContent = `MATCH: ${percentage}%`;
  matchLabel.style.color = percentage >= 80 ? "lime" : "red";
  matchLabel.classList.remove("pulse");
  void matchLabel.offsetWidth;
  matchLabel.classList.add("pulse");
}

function handleRelease() {
  if (isGameOver || lives <= 0 || timeRemaining <= 0) return;
  isHolding = false;

  // --- Multi-star MODE ---
  if (multiStarMode) {
    if (msActiveIndex == null && msStars.length > 0) {
      msActiveIndex = Math.floor(Math.random() * msStars.length);
    }
    if (msActiveIndex == null) return;

    const s = msStars[msActiveIndex];
    const maxSizeDiff = 30;
    const sizeDiff = Math.abs(s.growRadius - s.curR);
    const sizeRatio = s.growRadius > s.curR + maxSizeDiff ? 0 : 1 - sizeDiff / maxSizeDiff;
    const match = Math.round(Math.max(0, sizeRatio * 100));
    updateMatchLabel(match);

    attempts++;
    sumAccuracy += match;
    if (match >= 80) successfulMatches++;

    if (match >= 80) {
      let add = 0; let infoText=''; let color='#9cd6ff';
      if (match >= 96) {
  add = 3;
  if (mode === "challenge" || mode === "arcade") {
    infoText = '+3 ★  +TIME';
    color = '#00ffff';
    if (timeRemaining < TIMER_MAX) timeRemaining = Math.min(TIMER_MAX, timeRemaining + 3);
    else timeBank += 3;
    updateTimerUI(); blinkTimer();
  } else { // survival
    infoText = '+3 ★';
    color = '#00ffff';
  }
}

 else if (match >= 90) { add = 2; infoText = '+2 ★'; color = '#00ffff'; }
      else { add = 1; infoText = '+1 ★'; }

      score += add; updateScoreUI(); pulseScore();
      addFloater(infoText, s.x, Math.max(20, s.y - (s.curR + 18)), color, 1100);

      createFragments(currentShape, s.x, s.y);
      explosionSound.currentTime = 0; explosionSound.play();
      nextShape();
      spawnMultiStars(currentLevelSettings);
    } else {
      showWrong = true; effectTimer = 30;
      if (mode !== "arcade") {   // Arcade = neodečítá životy
        lives--;
        updateLivesDisplay();
      }
      failSound.currentTime = 0; failSound.play();
      if (lives <= 0) { lockGame(); triggerGameOver(); return; }
      msActiveIndex = null;
    }

    bonusMaybeSpawnAfterRelease();
    return;
  }

  // --- Single-star ---
  const isMoving = enableMove;
  const maxSizeDiff = isMoving ? 40 : 30;
  const spikes = { star5: 5, star6: 6, star7: 7, star8: 8 }[currentShape] || 5;
  const sizeDiff = Math.abs(radius - targetRadius);
  let sizeRatio = radius > targetRadius + maxSizeDiff ? 0 : 1 - sizeDiff / maxSizeDiff;

  let angleRatio = 1;
  if (!needsRotationCheck) {
    const snapAngle = (2 * Math.PI) / spikes;
    const maxAngleDiff = Math.PI / 6 + (isMoving ? snapAngle * 0.3 : 0);
    const angleOffset = rotation % snapAngle;
    const angleDiff = Math.min(angleOffset, snapAngle - angleOffset);
    angleRatio = Math.max(0, 1 - angleDiff / maxAngleDiff);
  }

  const match = Math.round(Math.max(0, sizeRatio * angleRatio * 100));
  updateMatchLabel(match);
  bonusTryHitOnRelease();

  attempts++;
  sumAccuracy += match;
  if (match >= 80) successfulMatches++;
  if (match >= 80) {
    let add = 0, infoText = '', color = '#9cd6ff';
  if (match >= 96) {
  add = 3;
  if (mode === "challenge" || mode === "arcade") {
    infoText = '+3 ★  +TIME';
    color = '#00ffff';
    if (timeRemaining < TIMER_MAX) timeRemaining = Math.min(TIMER_MAX, timeRemaining + 3);
    else timeBank += 3;
    updateTimerUI(); blinkTimer();
  } else { // survival
    infoText = '+3 ★';
    color = '#00ffff';
  }
}


    else if (match >= 90) { add = 2; infoText = '+2 ★'; color = '#00ffff'; }
    else { add = 1; infoText = '+1 ★'; }

    score += add; updateScoreUI(); pulseScore();

    addFloater(infoText, shapeX, Math.max(20, shapeY - (targetRadius + 18)), color, 1100);
    createFragments(currentShape, shapeX, shapeY);
    explosionSound.currentTime = 0; explosionSound.play();
    nextShape();
  } else {
    showWrong = true; effectTimer = 30;
    if (mode !== "arcade") {
      lives--;
      updateLivesDisplay();
    }
    failSound.currentTime = 0; failSound.play();
    if (lives <= 0) { lockGame(); triggerGameOver(); return; }
  }
  bonusMaybeSpawnAfterRelease();
}


window.startNewGame = function () {
    gameStartTime = performance.now(); // ulož čas začátku hry
  document.getElementById("gameOverPopup").classList.add("hidden");

  bonus.active = false;
  bonus.captureHold = false;
  bonus.pauseMainScene = false;
  bonus.lastSpawnSec = performance.now()/1000;
  gameOverShown = false;

  showWrong = false; effectTimer = 0;
  floaters = []; fragments = []; flashAlpha = 0;

  level = 1; firstStart = true; isGameOver = false; isHolding = false;
  score = 0; attempts = 0; successfulMatches = 0; sumAccuracy = 0;

  timerBar.classList.remove('timer-blink');
  if (holdButton) { holdButton.disabled = false; holdButton.classList.remove('active'); }
  if (timerWrap) timerWrap.classList.remove('timer-blink-10s');

  // 🎮 Režimy
  if (mode === "arcade") {
    lives = MAX_LIVES;
    timeRemaining = TIMER_MAX;
    timeBank = 0;
  } else if (mode === "survival") {
    lives = MAX_LIVES;
    timeRemaining = TIMER_MAX; // bar zůstane plný, ale neubývá
    timeBank = 0;
  } else { // challenge
    lives = MAX_LIVES;
    timeRemaining = TIMER_MAX;
    timeBank = 0;
  }

  updateScoreUI(); updateTimerUI();
  startLevel(); updateMatchLabel(0);

  if (!loopRunning) requestAnimationFrame(draw);
};



const holdButton = document.getElementById("holdButton");
holdButton.style.touchAction = 'none';
// Blokace označení textu a kontextového menu
holdButton.style.userSelect = 'none';
holdButton.style.webkitUserSelect = 'none';    // Safari, iOS
holdButton.style.webkitTouchCallout = 'none';  // zruší kopírovací menu na iOS

holdButton.addEventListener('selectstart', e => e.preventDefault());
holdButton.addEventListener('contextmenu', e => e.preventDefault());

const holdSound = new Audio('sounds/hold.mp3');
holdSound.preload = 'auto';
holdSound.volume = 0.4;

const explosionSound = new Audio('sounds/explosion.mp3'); explosionSound.preload = 'auto'; explosionSound.volume = 0.6;
const failSound = new Audio('sounds/fail.mp3'); failSound.preload = 'auto'; failSound.volume = 1.0;
const bonusAppearSound = new Audio('sounds/bonus.mp3'); bonusAppearSound.preload = 'auto'; bonusAppearSound.volume = 0.9; 


// (první definice – ponechána kvůli kompatibilitě; přepis bude níž)
function startHold() {
  if (isGameOver || isCountdown) return;  // ⬅ blok během countdownu
  isHolding = true;
  radius = 0;
  holdStartTime = performance.now();
  holdHue = Math.random() * 360;
  holdSound.currentTime = 0;
  holdSound.play();
}
function endHold() {
  // Debounce: ignoruj rychle po sobě jdoucí duplicitní "release"
  const now = performance.now();
  if (now - lastReleaseTs < 150) return;
  lastReleaseTs = now;

  if (isGameOver || isCountdown) return;
  isHolding = false;
  holdSound.pause();
  holdSound.currentTime = 0; // reset, aby příště začal od začátku

  handleRelease();
}


function lockGame() {
  if (isGameOver) return;
  isGameOver = true;
  isHolding = false;

  // Uklid všech efektů/floaterů v momentě Game Over
  showWrong = false;
  effectTimer = 0;
  floaters = [];
  fragments = [];
  flashAlpha = 0;

  if (holdButton) {
    holdButton.disabled = true;
    holdButton.classList.remove('active');
  }
}

// Zabránění kontextovému menu
holdButton.addEventListener('contextmenu', (e) => e.preventDefault());

// <<< BONUS: **přepis** startHold/endHold, aby HOLD fungoval i v bonusu >>>
function startHold() {
  if (isGameOver || isCountdown) return;
  isHolding = true; // držíme

  if (bonus.captureHold) {
    bonus.holdRadius = 0;      
  } else {
    radius = 0;                
  }

// 🌟 Nastavení rychlosti rozpínání
if (level === 1) {
  // Level 1: vždy fixní rychlost
  actualHoldGrowth = holdGrowth;
} else if (multiStarMode) {
  // Multi-star: při startu HOLD vyber aktivní hvězdu a nastav jí náhodnou rychlost
  if (msActiveIndex == null && msStars.length > 0) {
    msActiveIndex = Math.floor(Math.random() * msStars.length);
    msStars[msActiveIndex].growRadius = 0;
  }
  if (msActiveIndex != null) {
    msStars[msActiveIndex].growthSpeed = RANDOM_BASE_SPEED * (1.1 + Math.random() * 0.4);
  }
} else {
  // Single-star: náhodná rychlost pro každý nový HOLD
  actualHoldGrowth = RANDOM_BASE_SPEED * (1.1 + Math.random() * 0.4);
}



  // Multi-star: při prvním HOLD zvol náhodnou hvězdu
  if (multiStarMode){
    if (msActiveIndex == null && msStars.length > 0){
      msActiveIndex = Math.floor(Math.random() * msStars.length);
      msStars[msActiveIndex].growRadius = 0;
    }
  }

  holdStartTime = performance.now();
  holdHue = Math.random() * 360;
  holdSound.currentTime = 0;
  holdSound.play();
}


function endHold() {
  const now = performance.now();
  if (now - lastReleaseTs < 150) return;
  lastReleaseTs = now;

  if (isGameOver || isCountdown) return;
  if (!isHolding) return;
  isHolding = false;
  holdSound.pause();
  holdSound.currentTime = 0; // reset, aby příště začal od začátku


  // když běží bonus, řešíme jen bonus a NEvoláme handleRelease()
  if (bonus.captureHold) {
    bonusTryHitOnRelease();
    return;
  }

  handleRelease(); // tvoje herní logika při puštění
}
// <<< /BONUS přepis >>>

// TOUCH
holdButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  holdButton.classList.add('active');
  startHold();
}, { passive: false });

holdButton.addEventListener('touchend', (e) => {
  e.preventDefault();
  holdButton.classList.remove('active');
  endHold();
}, { passive: false });

holdButton.addEventListener('touchcancel', (e) => {
  e.preventDefault();
  holdButton.classList.remove('active');
  endHold();
}, { passive: false });

// MOUSE
holdButton.addEventListener('mousedown', (e) => {
  e.preventDefault();
  if (e.button !== 0) return; // jen levé tlačítko
  holdButton.classList.add('active');
  startHold();
});

holdButton.addEventListener('mouseup', (e) => {
  e.preventDefault();
  holdButton.classList.remove('active');
  endHold();
});

// Pojistky – myš mimo tlačítko, puštění mimo, skrytí okna
holdButton.addEventListener('mouseleave', () => {
  if (isHolding) {
    holdButton.classList.remove('active');
    endHold();
  }
});
window.addEventListener('mouseup', () => {
  if (isHolding) {
    holdButton.classList.remove('active');
    endHold();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isHolding) {
    holdButton.classList.remove('active');
    endHold();
  }
});

// Klávesa L (bonus level skip)
window.addEventListener("keydown", (e) => { 
  if (e.key === "L") {
    level = Math.min(15, level + 1); // ★ strop
    startLevel();
  }
});


// Inicializace
bonusInitDOM();
updateScoreUI();
updateTimerUI();

// start hry po nastavení plátna
function drawInit() {
  sizeGameCanvas();
  startLevel(); // necháme běžet scénu v pozadí; čas se stejně neodečítá díky isCountdown
  draw();
}
drawInit();

// === HELP POPUP + CANVAS DEMO (aligned to START, big 👆 from below) ===
(function(){
  const popup  = document.getElementById('helpPopup');
  const start  = document.getElementById('startGameBtn');
  const canvas = document.getElementById('helpDemo');
  if (!popup || !canvas || !start) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  popup.style.display = 'flex';

  // FIX: START → countdown → startNewGame
  start.addEventListener('click', () => {
    beginNewGameFlow(true);
  });

  // canvas size je fixní, vše na střed
  let W = canvas.width, H = canvas.height;
  const LIFT = 20;
  let cx = W/2, cy = Math.round(H * 0.47) - LIFT;

  const COLOR_TARGET = '#00ffff';
  const COLOR_PLAYER = '#bdd104ff';
  const LW_TARGET = 3;
  const LW_PLAYER = 3.5;

  const target = { points: 5, scale: 48, angle: -Math.PI / 2 };
  let star   = { scale: 10, angle: -Math.PI / 2 };

  const btn = { x: cx, y: H - 40 - LIFT, r: 30 };

  let pressed = false;
  let pressRipple = 0;

  function drawHand(){
    const baseGap = pressed ? 4 : 14;
    const lift = pressed ? 0 : Math.sin(performance.now()/300) * 1.2;
    ctx.save();
    ctx.translate(btn.x, btn.y + btn.r + baseGap + lift);
    ctx.font = '28px system-ui, Apple Color Emoji, Segoe UI Emoji';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🤚', 0, 0);
    ctx.restore();
  }

  function syncAnchors(){
    const canvasBB = canvas.getBoundingClientRect();
    const startBB  = start.getBoundingClientRect();
    const startCenterX = startBB.left + startBB.width/2 - canvasBB.left;
    cx = Math.max(0, Math.min(W, startCenterX));
    btn.x = cx;
  }
  window.addEventListener('resize', syncAnchors);
  setTimeout(syncAnchors, 0);
  setTimeout(syncAnchors, 100);

  const P = { PRESS_GOOD:0, HOLD_GOOD:1, RELEASE_GOOD:2, PRESS_BAD:3, HOLD_BAD:4, RELEASE_BAD:5 };
  let phase = P.PRESS_GOOD, t = 0;

  const TAU = Math.PI*2;
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const shortestDelta=(from,to)=>(((to-from+Math.PI)%TAU)-Math.PI);
  const angleAbsDiff=(a,b)=>Math.abs(shortestDelta(a,b));
  function approachLinear(cur, trg, rate, dt){
    const d = trg - cur, step = rate*dt;
    if (Math.abs(d) <= step) return trg;
    return cur + Math.sign(d)*step;
  }

  function drawStarOutline(x,y,points,outerR,innerR,rot,stroke,lw=2,alpha=1){
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x,y); ctx.rotate(rot);
    ctx.beginPath();
    for (let i=0;i<points*2;i++){
      const ang = i*Math.PI/points;
      const r = (i%2===0)?outerR:innerR;
      const px=Math.cos(ang)*r, py=Math.sin(ang)*r;
      i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
    }
    ctx.closePath(); ctx.lineWidth = lw; ctx.strokeStyle=stroke; ctx.stroke(); ctx.restore();
  }
  function drawBadge(text, ok){
    ctx.save();
    ctx.font = 'bold 16px Oxanium, system-ui, sans-serif';
    ctx.textAlign='center'; ctx.fillStyle = ok ? '#00ff9d' : '#ff3b3b';
    const yTop = cy - (target.scale + 28);
    ctx.fillText(text, cx, yTop);
    ctx.restore();
  }

  function drawButton(){
  ctx.save();
  ctx.translate(btn.x, btn.y);

  // pokud je tlačítko stisknuté → cyan stín
  if (pressed) {
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 15;
  }

  // černý základ tlačítka
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(0, 0, btn.r, 0, TAU);
  ctx.fill();

  // cyan obvod
  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, btn.r, 0, TAU);
  ctx.stroke();

  // text HOLD uprostřed
  ctx.fillStyle = '#00ffff';
  ctx.font = 'bold 13px Oxanium, system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('POWER', 0, 0);

  ctx.restore();
}


  function render(){
    ctx.clearRect(0,0,W,H);

    drawStarOutline(cx, cy, target.points, target.scale, target.scale*0.46, target.angle, COLOR_TARGET, LW_TARGET, 0.95);
    drawStarOutline(cx, cy, target.points, star.scale, star.scale*0.46, star.angle, COLOR_PLAYER, LW_PLAYER, 1);

    if (phase===P.RELEASE_GOOD) drawBadge('✅ Good match', true);
    if (phase===P.RELEASE_BAD ) drawBadge('❌ Bad match', false);

    drawButton();
    drawHand();
  }

  function update(dt){
  t += dt; 
  pressRipple = Math.max(0, pressRipple - dt*1.2);

  switch (phase){
    case P.PRESS_GOOD:
      pressed = true; 
      pressRipple = 1; 
      t = 0; 
      phase = P.HOLD_GOOD;
      break;

    case P.HOLD_GOOD:
      // jen rozpínání (žádná rotace)
      star.scale = approachLinear(star.scale, target.scale, 32, dt);
      star.angle = target.angle; // držíme zamknuté na target

      if (Math.abs(star.scale - target.scale) < 0.9){
        star.scale = target.scale; 
        star.angle = target.angle;
        pressed = false; 
        t = 0; 
        phase = P.RELEASE_GOOD;
      }
      break;

    case P.RELEASE_GOOD:
      if (t > 1.2){ 
        star.scale = 10; 
        star.angle = target.angle; // reset bez rotace
        pressed = true; 
        pressRipple = 1; 
        t = 0; 
        phase = P.PRESS_BAD; 
      }
      break;

    case P.PRESS_BAD:
      if (t > 0.2){ 
        t = 0; 
        phase = P.HOLD_BAD; 
      }
      break;

    case P.HOLD_BAD:
      // i u "špatného" držení jen růst, bez rotace
      star.scale += 35 * dt;
      star.angle = target.angle;

      if (star.scale > target.scale * 1.4){ 
        pressed = false; 
        t = 0; 
        phase = P.RELEASE_BAD; 
      }
      break;

    case P.RELEASE_BAD:
      if (t > 1.2){ 
        star.scale = 10; 
        star.angle = target.angle; // reset bez rotace
        pressed = true; 
        pressRipple = 1; 
        t = 0; 
        phase = P.PRESS_GOOD; 
      }
      break;
  }
}

  let last = performance.now();
  let anchorT = 0;

  function loop(now){
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    anchorT += dt;
    if (anchorT > 0.25) { 
      syncAnchors(); 
      anchorT = 0; 
    }

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  syncAnchors();
  requestAnimationFrame(loop);
})();