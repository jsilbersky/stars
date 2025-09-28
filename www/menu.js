// === Canvas pro hvězdné pozadí ===
const canvas = document.getElementById("starCanvas");
const ctx = canvas.getContext("2d");
let stars = [];
let centerX, centerY;
let _bgLastTs = performance.now();

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  centerX = canvas.width / 2;
  centerY = canvas.height / 2;
  generateStars();
}
window.addEventListener("resize", resize);
resize();

function generateStars(count = 200) {
  stars = Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 1.8,
    y: (Math.random() - 0.5) * 1.8,
    z: Math.random() * (1.6 - 0.2) + 0.2,
    v: 0.20 * (0.9 + Math.random() * 0.5),
    r: 0.5 + Math.random() * 1.0
  }));
}

function drawStars() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - _bgLastTs) / 1000);
  _bgLastTs = now;
  const F = Math.min(canvas.width, canvas.height) * 0.36;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const s of stars) {
    s.z -= s.v * dt;
    if (s.z <= 0.2) {
      s.x = (Math.random() - 0.5) * 1.8;
      s.y = (Math.random() - 0.5) * 1.8;
      s.z = 1.6;
    }

    const k  = F / s.z;
    const sx = centerX + s.x * k;
    const sy = centerY + s.y * k;

    const radius = s.r * (2.0 - s.z);
    const alpha  = Math.min(0.8, 0.25 + (1.6 - s.z) * 0.35);

    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(0.5, radius), 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(drawStars);
}
drawStars();


// === AdMob Banner logika ===
let AdMob = null;
if (typeof Capacitor !== "undefined" && Capacitor.Plugins && Capacitor.Plugins.AdMob) {
  AdMob = Capacitor.Plugins.AdMob;

  AdMob.initialize();

  function showBanner() {
    AdMob.showBanner({
      adId: 'ca-app-pub-3940256099942544/6300978111', // testovací ID
      adSize: 'SMART_BANNER',
      position: 'BOTTOM_CENTER',
    }).catch(err => console.error("Chyba banneru:", err));
  }

  // Ukázat při startu menu
  setTimeout(showBanner, 2000);

  // Obnovit při návratu z pozadí
  document.addEventListener("resume", showBanner);

  // Schovat při uspání
  document.addEventListener("pause", () => {
    AdMob.hideBanner().catch(() => {});
  });
}


// === Přepnutí herního módu ===
function chooseMode(mode) {
  // Ulož mód
  localStorage.setItem("mode", mode);

  // Reklama jen pokud běžíme na mobilu
  if (AdMob) {
    try {
      AdMob.showInterstitial();
    } catch (e) {
      console.warn("AdMob error:", e);
    }
  } else {
    console.log("Web test – reklama se nespustí.");
  }

  // Přechod do hry
  window.location.href = "game.html";
}
