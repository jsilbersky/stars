const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let centerX, centerY;
let stars = [];
function generateStars(count = 100) {
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 1.5 + 0.5,
    speed: Math.random() * 0.5 + 0.2
  }));
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
let enableBounce = false;

const allStarShapes = ["star5", "star6", "star8", "spiked", "supernova", "spiralstar", "nebula", "star4", "star7"];

const levels = [
  { lineWidth: 8, rotationSpeed: 0, rotationCheck: false }, // Level 1
  { lineWidth: 4, rotationSpeed: 0, rotationCheck: false }, // Level 2
  { lineWidth: 8, rotationSpeed: 0.01, rotationCheck: true }, // Level 3
  { lineWidth: 4, rotationSpeed: 0.01, rotationCheck: true }, // Level 4
  { lineWidth: 4, rotationSpeed: 0.01, rotationCheck: true, move: true, bounce: true }, // Level 5 – pohyb
  { lineWidth: 4, rotationSpeed: 0.02, rotationCheck: true, move: true, bounce: true } // Level 6 – pohyb + odraz
];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  centerX = canvas.width / 2;
  centerY = canvas.height / 2;
  generateStars();
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function drawStars() {
  ctx.fillStyle = "white";
  stars.forEach(star => {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
    star.y += star.speed;
    if (star.y > canvas.height) {
      star.y = 0;
      star.x = Math.random() * canvas.width;
    }
  });
}

function drawStarShape(shape, r) {
  ctx.beginPath();
  const spikes = {
    star4: 4, star5: 5, star6: 6, star7: 7, star8: 8,
    spiked: 9, supernova: 10, spiralstar: 11, nebula: 12
  }[shape] || 5;

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

function drawShape(shape, x, y, r, rotation, color = "white", width = 4, shadow = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  drawStarShape(shape, r);
  ctx.stroke();
  ctx.restore();
}

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

let lives = 5;

function updateLivesDisplay() {
  const hearts = document.querySelectorAll(".heart");
  hearts.forEach((heart, index) => {
    heart.classList.toggle("lost", index >= lives);
  });
}


function startLevel() {
  const settings = levels[Math.min(level - 1, levels.length - 1)];
  lineWidth = settings.lineWidth;
  rotationSpeed = settings.rotationSpeed;
  needsRotationCheck = settings.rotationCheck;
  enableMove = settings.move || false;
  enableBounce = settings.bounce || false;

  remainingShapes = shuffle([...allStarShapes]);
  shapeX = centerX;
  shapeY = centerY;
  shapeVX = (Math.random() - 0.5) * 4;
  shapeVY = (Math.random() - 0.5) * 4;
  nextShape();
  updateLivesDisplay();
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
  targetRadius = Math.random() * 50 + 50;
}

function createShards(x, y, count = 20) {
  shards = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 2 + 1;
    const size = Math.random() * 8 + 4;
    shards.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + 1,
      size,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      alpha: 1
    });
  }
}

function draw() {
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
    if (effectTimer <= 0) {
      showWrong = false;
    }
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

  // aktualizace pozice cílového tvaru
  if (enableMove) {
  // Nejdřív otestuj odraz před posunem
  if (enableBounce) {
    if (shapeX - targetRadius <= 0 && shapeVX < 0) {
      shapeVX *= -1;
      shapeX = targetRadius;
    } else if (shapeX + targetRadius >= canvas.width && shapeVX > 0) {
      shapeVX *= -1;
      shapeX = canvas.width - targetRadius;
    }

    if (shapeY - targetRadius <= 0 && shapeVY < 0) {
      shapeVY *= -1;
      shapeY = targetRadius;
    } else if (shapeY + targetRadius >= canvas.height && shapeVY > 0) {
      shapeVY *= -1;
      shapeY = canvas.height - targetRadius;
    }
  }

  // Pak teprve posuň
  shapeX += shapeVX;
  shapeY += shapeVY;
}



  // vykresli cílový tvar
  ctx.save();
  ctx.strokeStyle = `hsl(${hue}, 100%, 70%)`;
  ctx.lineWidth = lineWidth;
  drawShape(currentShape, shapeX, shapeY, targetRadius, rotation, null, lineWidth, false);
  ctx.restore();

  if (isHolding && radius < targetRadius + 20) {
  radius += 1;
}
if (isHolding) {
  drawShape(
    currentShape,
    shapeX, 
    shapeY,
    radius,
    0,
    `hsl(${hue + 60}, 100%, 50%)`,
    5,
    false
  );
}


  rotation += rotationSpeed;
  hue = (hue + 1) % 360;
  requestAnimationFrame(draw);
}

function handleRelease() {
  isHolding = false;

  const diff = Math.abs(radius - targetRadius);
  const isSizeOk = diff < 8;

  const spikes = {
    star4: 4, star5: 5, star6: 6, star7: 7, star8: 8,
    spiked: 9, supernova: 10, spiralstar: 11, nebula: 12
  }[currentShape] || 5;
  const angleSnap = (2 * Math.PI) / spikes;
  const angleDiff = Math.min(Math.abs(rotation % angleSnap), Math.abs(angleSnap - (rotation % angleSnap)));
  const angleThreshold = 0.2;
  const isAngleOk = !needsRotationCheck || angleDiff < angleThreshold;

  if (isSizeOk && isAngleOk) {
    showExplosion = true;
    effectTimer = 30;
    createShards(shapeX, shapeY);
    flashAlpha = 0.6;
  } else {
    showWrong = true;
    effectTimer = 30;
    lives--;
updateLivesDisplay();

if (lives <= 0) {
  // Game over handling
  alert("Game Over!");
  lives = 5;
  updateLivesDisplay();
  level = 1;
  startLevel();
}

  }
}

const holdButton = document.getElementById("holdButton");

holdButton.addEventListener("touchstart", (e) => {
  e.preventDefault();
  isHolding = true;
  radius = 0;
});
holdButton.addEventListener("touchend", (e) => {
  e.preventDefault();
  handleRelease();
});
holdButton.addEventListener("mousedown", (e) => {
  e.preventDefault();
  isHolding = true;
  radius = 0;
});
holdButton.addEventListener("mouseup", (e) => {
  e.preventDefault();
  handleRelease();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "L") {
    level++;
    startLevel();
  }
});


startLevel();
draw();
