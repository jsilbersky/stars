const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let centerX, centerY;
let stars = [];


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
  const options = ["star4", "star5", "star6", "star7", "star8", "star9"];
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




const matchLabel = document.getElementById("matchLabel");

const allStarShapes = ["star4", "star5", "star6", "star7", "star8", "star9", "star10", "star11", "star12"];

const levels = [
  { lineWidth: 8, rotationSpeed: 0, rotationCheck: false },
  { lineWidth: 4, rotationSpeed: 0, rotationCheck: false },
  { lineWidth: 8, rotationSpeed: 0.01, rotationCheck: true },
  { lineWidth: 4, rotationSpeed: 0.01, rotationCheck: true },
  { lineWidth: 4, rotationSpeed: 0.01, rotationCheck: true, move: true, bounce: true },
  { lineWidth: 4, rotationSpeed: 0.02, rotationCheck: true, move: true, bounce: true },
  { lineWidth: 3, rotationSpeed: 0.02, rotationCheck: true, move: true, bounce: true, pulse: true, rainbow: true },
  { lineWidth: 2, rotationSpeed: 0.04, rotationCheck: true, move: true, bounce: true, pulse: true, rainbow: true, chaosColor: true }
];

let lives = 5;

function updateLivesDisplay() {
  const hearts = document.querySelectorAll(".heart");
  hearts.forEach((heart, index) => {
    heart.classList.toggle("lost", index >= lives);
  });
}

function updateLevelDisplay() {
  const levelDisplay = document.getElementById("levelLabel");
  if (levelDisplay) {
    levelDisplay.textContent = `LEVEL ${level}`;
  }
}

function startLevel() {
  const settings = levels[Math.min(level - 1, levels.length - 1)];
  lineWidth = settings.lineWidth;
  rotationSpeed = settings.rotationSpeed;
  needsRotationCheck = settings.rotationCheck;
  enableMove = settings.move || false;
  enableBounce = settings.bounce || false;

  remainingShapes = [...allStarShapes].sort(() => Math.random() - 0.5);
  shapeX = centerX;
  shapeY = centerY;
  shapeVX = (Math.random() - 0.5) * 4;
  shapeVY = (Math.random() - 0.5) * 4;
  nextShape();
  updateLivesDisplay();
  updateLevelDisplay();
  updateMatchLabel(0);
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
  currentColorShift = Math.random() * 360;

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

function drawStarShape(shape, r) {
  ctx.beginPath();
  const spikes = {
    star4: 4, star5: 5, star6: 6, star7: 7, star8: 8,
    star9: 9, star10: 10, star11: 11, star12: 12
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

  ctx.shadowBlur = 5;
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

    shapeX += shapeVX;
    shapeY += shapeVY;
  }

  ctx.save();
  ctx.strokeStyle = `hsl(${hue}, 100%, 70%)`;
  ctx.lineWidth = lineWidth;
  drawShape(currentShape, shapeX, shapeY, targetRadius, rotation, currentColorShift + hue, lineWidth);
  ctx.restore();

  if (isHolding && radius < targetRadius + 600) radius += 1;

  if (isHolding) {
  // Jemná výplň
  ctx.save();
  ctx.translate(shapeX, shapeY);
  ctx.rotate(0);
  drawStarShape(currentShape, radius);
  ctx.fill();
  ctx.restore();

  // Obrys
  drawShape(currentShape, shapeX, shapeY, radius, 0, holdHue + hue, 5);
}


  rotation += rotationSpeed;
  hue = (hue + 1) % 360;
  requestAnimationFrame(draw);
}


function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  centerX = canvas.width / 2;
  centerY = canvas.height / 2;
  generateStars();
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function updateMatchLabel(percentage) {
  matchLabel.textContent = `MATCH: ${percentage}%`;
  matchLabel.style.color = percentage >= 80 ? "lime" : "red";
}

function handleRelease() {
  isHolding = false;

  // Přísnost se přizpůsobí podle pohybu
  const isMoving = enableMove;

  const maxSizeDiff = isMoving ? 40 : 30;
  const baseAngleTolerance = Math.PI / 6;

  const spikes = {
    star4: 4, star5: 5, star6: 6, star7: 7, star8: 8,
    star9: 9, star10: 10, star11: 11, star12: 12
  }[currentShape] || 5;

  const snapAngle = (2 * Math.PI) / spikes;
  const maxAngleDiff = isMoving ? baseAngleTolerance + snapAngle * 0.3 : baseAngleTolerance;

  const sizeDiff = Math.abs(radius - targetRadius);

  let sizeRatio = radius > targetRadius + maxSizeDiff
    ? 0
    : 1 - sizeDiff / maxSizeDiff;

  const angleOffset = rotation % snapAngle;
  const angleDiff = Math.min(angleOffset, snapAngle - angleOffset);
  const angleRatio = Math.max(0, 1 - angleDiff / maxAngleDiff);

  const match = Math.round(Math.max(0, sizeRatio * angleRatio * 100));

  // ✅ Zobrazení aktuálního match vždy
  updateMatchLabel(match);

  if (match >= 80) {
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
      // ✅ Oddálení alertu kvůli vykreslení
      setTimeout(() => {
        alert("Game Over!");
        lives = 5;
        level = 1;
        startLevel();
      }, 100);
    }
  }
}


const holdButton = document.getElementById("holdButton");

holdButton.addEventListener("touchstart", (e) => {
  e.preventDefault();
  isHolding = true;
  radius = 0;
  holdStartTime = performance.now();
  holdHue = Math.random() * 360;
});
holdButton.addEventListener("touchend", (e) => {
  e.preventDefault();
  handleRelease();
});
holdButton.addEventListener("mousedown", (e) => {
  e.preventDefault();
  isHolding = true;
  radius = 0;
  holdStartTime = performance.now();
  holdHue = Math.random() * 360;
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



holdButton.addEventListener('touchstart', () => {
  holdButton.classList.add('active');
});

holdButton.addEventListener('touchend', () => {
  holdButton.classList.remove('active');
});


startLevel();
draw();