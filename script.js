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

const allStarShapes = ["star5", "star6", "star8", "spiked", "supernova", "spiralstar", "nebula", "star4", "star7"];

const levels = [
  { lineWidth: 8, rotationSpeed: 0, rotationCheck: false },
  { lineWidth: 4, rotationSpeed: 0, rotationCheck: false },
  { lineWidth: 8, rotationSpeed: 0.01, rotationCheck: true },
  { lineWidth: 4, rotationSpeed: 0.01, rotationCheck: true },
];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight * 0.8;
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

function drawShape(shape, x, y, r, rotation, color = "white", width = 4, shadow = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  if (shadow) {
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  drawStarShape(shape, r);
  ctx.stroke();
  ctx.restore();
}

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

function startLevel() {
  const settings = levels[Math.min(level - 1, levels.length - 1)];
  lineWidth = settings.lineWidth;
  rotationSpeed = settings.rotationSpeed;
  needsRotationCheck = settings.rotationCheck;

  remainingShapes = shuffle([...allStarShapes]);
  nextShape();
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

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawStars();

  // Target shape
  ctx.save();
  ctx.shadowBlur = 15;
  ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
  ctx.strokeStyle = `hsl(${hue}, 100%, 70%)`;
  ctx.lineWidth = lineWidth;
  drawShape(currentShape, centerX, centerY, targetRadius, rotation, null, lineWidth, true);
  ctx.restore();


  // Player shape (growing)
  if (isHolding && radius < targetRadius + 20) {
    radius += 1;
  }
  if (isHolding) {
    drawShape(
      currentShape,
      centerX,
      centerY,
      radius,
      0,
      `hsl(${hue + 60}, 100%, 50%)`,
      5,
      true
    );
  }

  rotation += rotationSpeed;
  hue = (hue + 1) % 360;
  requestAnimationFrame(draw);
}

const holdButton = document.getElementById("holdButton");

holdButton.addEventListener("touchstart", (e) => {
  e.preventDefault();
  isHolding = true;
  radius = 0;
});

holdButton.addEventListener("touchend", (e) => {
  e.preventDefault();
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
    nextShape();
  } else {
    alert("Vedle – zkus znovu.");
  }
});

startLevel();
draw();
