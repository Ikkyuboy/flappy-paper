// ============================================================
// 紙ヒコーキ (Kami Hikouki) - Paper Airplane Chase
// ============================================================

// === CONSTANTS ===
const GRAVITY = 0.12;
const HORIZONTAL_SPEED = 3.5;
const LIFT = -0.08;
const MAX_FALL_SPEED = 4.5;
const HORIZONTAL_DRAG = 0.12;
const WALL_THICKNESS = 30;
const PLATFORM_HEIGHT = 10;
const PLATFORM_MIN_WIDTH = 50;
const PLATFORM_MAX_WIDTH = 120;
const OBSTACLE_MIN_GAP = 140;
const OBSTACLE_MAX_GAP = 220;
const SPAWN_AHEAD = 800;
const CLEANUP_BEHIND = 400;
const PLAYER_WIDTH = 28;
const PLAYER_HEIGHT = 8;
const GAME_OVER_DELAY = 800; // ms before restart allowed

// Colors
const COLOR_BG = "#F5F0E8";
const COLOR_GRID = "#E8E3DB";
const COLOR_WALL = "#D4CFC5";
const COLOR_WALL_EDGE = "#B0A898";
const COLOR_PLATFORM = "#C4A882";
const COLOR_PLATFORM_SHADOW = "rgba(0,0,0,0.1)";
const COLOR_PLANE_BODY = "#FFFFFF";
const COLOR_PLANE_STROKE = "#8899AA";
const COLOR_PLANE_FOLD = "#C0C8D0";
const COLOR_HUD_BG = "rgba(0,0,0,0.15)";
const COLOR_HUD_TEXT = "#554433";
const COLOR_TITLE_TEXT = "#443322";
const COLOR_SUBTITLE = "#887766";

// === CANVAS SETUP ===
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let canvasWidth, canvasHeight, towerWidth, towerLeft, dpr;

function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  const maxW = 420;
  const w = Math.min(window.innerWidth, maxW);
  const h = window.innerHeight;

  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  canvasWidth = w;
  canvasHeight = h;
  towerWidth = canvasWidth - WALL_THICKNESS * 2;
  towerLeft = WALL_THICKNESS;

  // Regenerate grid pattern
  createGridPattern();
}

// Offscreen grid pattern
let gridPattern = null;
function createGridPattern() {
  const size = 24;
  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const octx = offscreen.getContext("2d");
  octx.fillStyle = COLOR_BG;
  octx.fillRect(0, 0, size, size);
  octx.strokeStyle = COLOR_GRID;
  octx.lineWidth = 0.5;
  octx.beginPath();
  octx.moveTo(size, 0);
  octx.lineTo(size, size);
  octx.moveTo(0, size);
  octx.lineTo(size, size);
  octx.stroke();
  gridPattern = ctx.createPattern(offscreen, "repeat");
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// === STATE ===
let gameState = "TITLE";
let score = 0;
let highScore = parseInt(localStorage.getItem("kamiHikouki_highScore")) || 0;
let gameOverTime = 0;
let titleAnimTime = 0;

// === PLAYER ===
let player = {
  x: 0, y: 0,
  vx: 0, vy: 0,
  angle: 0,
  dead: false,
  deathScale: 1,
  deathAngle: 0
};

function resetPlayer() {
  player.x = towerWidth / 2;
  player.y = 0;
  player.vx = 0;
  player.vy = 0;
  player.angle = 0;
  player.dead = false;
  player.deathScale = 1;
  player.deathAngle = 0;
}

// === CAMERA ===
let camera = { y: 0 };

// === OBSTACLES ===
let obstacles = [];
let lastObstacleY = 0;
let lastSide = "left";

function resetObstacles() {
  obstacles = [];
  lastObstacleY = 200; // first obstacle starts a bit below
  lastSide = Math.random() < 0.5 ? "left" : "right";
}

function getDifficulty() {
  // Ramps from 0 to 1 over 5000 distance units
  return Math.min(player.y / 5000, 1.0);
}

function generateObstacles() {
  const generateTo = camera.y + canvasHeight + SPAWN_AHEAD;
  const diff = getDifficulty();

  while (lastObstacleY < generateTo) {
    const minGap = OBSTACLE_MIN_GAP - diff * 30;
    const maxGap = OBSTACLE_MAX_GAP - diff * 60;
    const gap = minGap + Math.random() * (maxGap - minGap);
    lastObstacleY += gap;

    // Switch sides with weighted randomness
    if (Math.random() < 0.6) {
      lastSide = lastSide === "left" ? "right" : "left";
    }

    const minW = PLATFORM_MIN_WIDTH + diff * 30;
    const maxW = PLATFORM_MAX_WIDTH + diff * 40;
    const platWidth = minW + Math.random() * (maxW - minW);

    // Ensure platform doesn't block more than 60% of tower width
    const clampedWidth = Math.min(platWidth, towerWidth * 0.6);

    obstacles.push({
      x: lastSide === "left" ? 0 : towerWidth - clampedWidth,
      y: lastObstacleY,
      width: clampedWidth,
      height: PLATFORM_HEIGHT,
      side: lastSide
    });
  }
}

function cleanupObstacles() {
  obstacles = obstacles.filter(o => o.y > camera.y - CLEANUP_BEHIND);
}

// === INPUT ===
const input = { left: false, right: false, anyPress: false };

function handleKeyDown(e) {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") input.left = true;
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") input.right = true;
  input.anyPress = true;
  e.preventDefault();
}

function handleKeyUp(e) {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") input.left = false;
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") input.right = false;
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);

// Touch handling
function getTouchSide(x) {
  return x < canvasWidth / 2 ? "left" : "right";
}

const activeTouches = new Map();

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    const rect = canvas.getBoundingClientRect();
    const side = getTouchSide(touch.clientX - rect.left);
    activeTouches.set(touch.identifier, side);
  }
  updateTouchInput();
  input.anyPress = true;
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    activeTouches.delete(touch.identifier);
  }
  updateTouchInput();
}, { passive: false });

canvas.addEventListener("touchcancel", (e) => {
  for (const touch of e.changedTouches) {
    activeTouches.delete(touch.identifier);
  }
  updateTouchInput();
});

function updateTouchInput() {
  let l = false, r = false;
  for (const side of activeTouches.values()) {
    if (side === "left") l = true;
    if (side === "right") r = true;
  }
  input.left = l;
  input.right = r;
}

// Mouse (for desktop testing)
canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const side = getTouchSide(e.clientX - rect.left);
  if (side === "left") input.left = true;
  else input.right = true;
  input.anyPress = true;
});

canvas.addEventListener("mouseup", () => {
  input.left = false;
  input.right = false;
});

// === COLLISION ===
function checkCollision() {
  const px = player.x;
  const py = player.y;
  const hw = PLAYER_WIDTH / 2;
  const hh = PLAYER_HEIGHT / 2;

  // Wall collision
  if (px - hw < 0 || px + hw > towerWidth) {
    return true;
  }

  // Platform collision
  for (const o of obstacles) {
    if (px + hw > o.x && px - hw < o.x + o.width &&
        py + hh > o.y && py - hh < o.y + o.height) {
      return true;
    }
  }

  return false;
}

// === PARTICLES ===
let particles = [];

function spawnDeathParticles() {
  for (let i = 0; i < 12; i++) {
    particles.push({
      x: player.x,
      y: player.y,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4 - 1,
      life: 1.0,
      size: 2 + Math.random() * 4,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.3
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.05 * dt;
    p.rotation += p.rotSpeed * dt;
    p.life -= 0.015 * dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// === LERP UTILITY ===
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// === GAME LOGIC ===
function startGame() {
  gameState = "PLAYING";
  score = 0;
  resetPlayer();
  resetObstacles();
  particles = [];
  camera.y = player.y - canvasHeight * 0.33;
  generateObstacles();
}

function updatePlaying(dt) {
  // Physics
  player.vy += GRAVITY * dt;
  if (player.vy > MAX_FALL_SPEED) player.vy = MAX_FALL_SPEED;

  if (input.left) {
    player.vx = lerp(player.vx, -HORIZONTAL_SPEED, HORIZONTAL_DRAG * dt);
    player.vy += LIFT * dt;
  } else if (input.right) {
    player.vx = lerp(player.vx, HORIZONTAL_SPEED, HORIZONTAL_DRAG * dt);
    player.vy += LIFT * dt;
  } else {
    player.vx = lerp(player.vx, 0, 0.08 * dt);
  }

  // Prevent going upward (minimum fall speed)
  if (player.vy < 0.3) player.vy = 0.3;

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Visual angle
  const targetAngle = player.vx * 0.12 + player.vy * 0.02;
  player.angle = lerp(player.angle, targetAngle, 0.1 * dt);

  // Camera
  const targetCamY = player.y - canvasHeight * 0.33;
  camera.y = lerp(camera.y, targetCamY, 0.06 * dt);

  // Score
  score = Math.floor(player.y / 10);

  // Generate & cleanup
  generateObstacles();
  cleanupObstacles();

  // Collision
  if (checkCollision()) {
    gameState = "GAME_OVER";
    gameOverTime = performance.now();
    player.dead = true;
    spawnDeathParticles();
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("kamiHikouki_highScore", highScore);
    }
  }
}

function updateGameOver(dt) {
  // Crumple animation
  if (player.deathScale > 0.1) {
    player.deathScale = lerp(player.deathScale, 0, 0.04 * dt);
    player.deathAngle += 0.15 * dt;
  }
  updateParticles(dt);

  // Allow restart after delay
  if (input.anyPress && performance.now() - gameOverTime > GAME_OVER_DELAY) {
    gameState = "TITLE";
    input.anyPress = false;
  }
}

function updateTitle(dt) {
  titleAnimTime += dt * 0.02;
  if (input.anyPress) {
    startGame();
    input.anyPress = false;
  }
}

// === RENDERING ===
function drawBackground() {
  // Grid pattern background for tower area
  ctx.save();
  ctx.translate(towerLeft, -camera.y % 24);
  ctx.fillStyle = gridPattern;
  ctx.fillRect(0, -(24), towerWidth, canvasHeight + 48);
  ctx.restore();

  // Fill non-tower areas
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(0, 0, towerLeft, canvasHeight);
  ctx.fillRect(towerLeft + towerWidth, 0, WALL_THICKNESS, canvasHeight);
}

function drawWalls() {
  // Left wall
  ctx.fillStyle = COLOR_WALL;
  ctx.fillRect(0, 0, towerLeft, canvasHeight);

  // Right wall
  ctx.fillRect(towerLeft + towerWidth, 0, WALL_THICKNESS, canvasHeight);

  // Inner edges
  ctx.fillStyle = COLOR_WALL_EDGE;
  ctx.fillRect(towerLeft - 2, 0, 2, canvasHeight);
  ctx.fillRect(towerLeft + towerWidth, 0, 2, canvasHeight);
}

function drawPlatforms() {
  ctx.save();
  ctx.translate(towerLeft, 0);

  for (const o of obstacles) {
    const screenY = o.y - camera.y;
    if (screenY > canvasHeight + 20 || screenY + o.height < -20) continue;

    // Shadow
    ctx.fillStyle = COLOR_PLATFORM_SHADOW;
    ctx.fillRect(o.x + 2, screenY + 2, o.width, o.height);

    // Platform body
    ctx.fillStyle = COLOR_PLATFORM;
    ctx.beginPath();
    roundRect(ctx, o.x, screenY, o.width, o.height, 3);
    ctx.fill();

    // Highlight on top edge
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(o.x + 1, screenY, o.width - 2, 2);
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawPlane() {
  const screenX = towerLeft + player.x;
  const screenY = player.y - camera.y;

  ctx.save();
  ctx.translate(screenX, screenY);

  if (player.dead) {
    ctx.rotate(player.deathAngle);
    ctx.scale(player.deathScale, player.deathScale);
  } else {
    ctx.rotate(player.angle);
  }

  // Paper airplane shape
  const s = 1.0;
  ctx.beginPath();
  ctx.moveTo(16 * s, 0);        // nose
  ctx.lineTo(-12 * s, -7 * s);  // top wing tip
  ctx.lineTo(-6 * s, 0);        // body notch
  ctx.lineTo(-12 * s, 7 * s);   // bottom wing tip
  ctx.closePath();

  // Fill
  ctx.fillStyle = COLOR_PLANE_BODY;
  ctx.fill();
  ctx.strokeStyle = COLOR_PLANE_STROKE;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Center fold line
  ctx.beginPath();
  ctx.moveTo(16 * s, 0);
  ctx.lineTo(-6 * s, 0);
  ctx.strokeStyle = COLOR_PLANE_FOLD;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    const screenX = towerLeft + p.x;
    const screenY = p.y - camera.y;
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = p.life;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.strokeStyle = COLOR_PLANE_STROKE;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  const text = score.toString();
  ctx.font = "bold 24px 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";

  // Background pill
  const metrics = ctx.measureText(text);
  const pw = metrics.width + 24;
  const ph = 34;
  const px = canvasWidth / 2 - pw / 2;
  const py = 16;

  ctx.fillStyle = COLOR_HUD_BG;
  ctx.beginPath();
  roundRect(ctx, px, py, pw, ph, 17);
  ctx.fill();

  // Score text
  ctx.fillStyle = COLOR_HUD_TEXT;
  ctx.fillText(text, canvasWidth / 2, py + 24);
}

function drawTitleScreen() {
  // Background
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw subtle grid
  ctx.save();
  ctx.fillStyle = gridPattern;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();

  // Floating airplane animation
  const floatY = Math.sin(titleAnimTime * 2) * 15;
  const floatX = Math.sin(titleAnimTime * 1.3) * 20;
  const floatAngle = Math.sin(titleAnimTime * 1.3) * 0.3;

  ctx.save();
  ctx.translate(canvasWidth / 2 + floatX, canvasHeight * 0.32 + floatY);
  ctx.rotate(floatAngle);
  ctx.scale(2.5, 2.5);

  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-12, -7);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-12, 7);
  ctx.closePath();
  ctx.fillStyle = COLOR_PLANE_BODY;
  ctx.fill();
  ctx.strokeStyle = COLOR_PLANE_STROKE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-6, 0);
  ctx.strokeStyle = COLOR_PLANE_FOLD;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  ctx.restore();

  // Title
  ctx.textAlign = "center";
  ctx.fillStyle = COLOR_TITLE_TEXT;
  ctx.font = "bold 36px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillText("紙ヒコーキ", canvasWidth / 2, canvasHeight * 0.52);

  ctx.font = "16px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillStyle = COLOR_SUBTITLE;
  ctx.fillText("Paper Airplane Chase", canvasWidth / 2, canvasHeight * 0.58);

  // Start prompt (blinking)
  const blink = Math.sin(performance.now() / 500) > 0;
  if (blink) {
    ctx.font = "14px 'Helvetica Neue', Arial, sans-serif";
    ctx.fillStyle = COLOR_SUBTITLE;
    ctx.fillText("TAP or PRESS ANY KEY", canvasWidth / 2, canvasHeight * 0.72);
  }

  // High score
  if (highScore > 0) {
    ctx.font = "14px 'Helvetica Neue', Arial, sans-serif";
    ctx.fillStyle = COLOR_SUBTITLE;
    ctx.fillText("BEST: " + highScore, canvasWidth / 2, canvasHeight * 0.80);
  }
}

function drawGameOverScreen() {
  // Dim overlay
  ctx.fillStyle = "rgba(245, 240, 232, 0.6)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.textAlign = "center";

  // Game Over text
  ctx.font = "bold 32px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillStyle = COLOR_TITLE_TEXT;
  ctx.fillText("Game Over", canvasWidth / 2, canvasHeight * 0.35);

  // Score
  ctx.font = "bold 48px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillStyle = COLOR_TITLE_TEXT;
  ctx.fillText(score.toString(), canvasWidth / 2, canvasHeight * 0.48);

  ctx.font = "14px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillStyle = COLOR_SUBTITLE;
  ctx.fillText("SCORE", canvasWidth / 2, canvasHeight * 0.40);

  // High score
  ctx.font = "16px 'Helvetica Neue', Arial, sans-serif";
  ctx.fillStyle = COLOR_SUBTITLE;
  ctx.fillText("BEST: " + highScore, canvasWidth / 2, canvasHeight * 0.56);

  // New high score indicator
  if (score >= highScore && score > 0) {
    ctx.font = "bold 14px 'Helvetica Neue', Arial, sans-serif";
    ctx.fillStyle = "#CC8844";
    ctx.fillText("NEW RECORD!", canvasWidth / 2, canvasHeight * 0.61);
  }

  // Restart prompt
  const canRestart = performance.now() - gameOverTime > GAME_OVER_DELAY;
  if (canRestart) {
    const blink = Math.sin(performance.now() / 500) > 0;
    if (blink) {
      ctx.font = "14px 'Helvetica Neue', Arial, sans-serif";
      ctx.fillStyle = COLOR_SUBTITLE;
      ctx.fillText("TAP or PRESS ANY KEY", canvasWidth / 2, canvasHeight * 0.74);
    }
  }
}

function renderPlaying() {
  drawBackground();
  drawPlatforms();
  drawParticles();
  if (!player.dead || player.deathScale > 0.15) {
    drawPlane();
  }
  drawWalls();
  drawHUD();
}

function renderGameOver() {
  renderPlaying();
  drawGameOverScreen();
}

// === GAME LOOP ===
let lastTime = 0;

function gameLoop(timestamp) {
  const rawDt = (timestamp - lastTime) / 16.667;
  const dt = Math.min(rawDt, 3);
  lastTime = timestamp;

  // Clear
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  switch (gameState) {
    case "TITLE":
      updateTitle(dt);
      drawTitleScreen();
      break;
    case "PLAYING":
      updatePlaying(dt);
      renderPlaying();
      break;
    case "GAME_OVER":
      updateGameOver(dt);
      renderGameOver();
      break;
  }

  // Reset per-frame input
  input.anyPress = false;

  requestAnimationFrame(gameLoop);
}

// === INIT ===
requestAnimationFrame((ts) => {
  lastTime = ts;
  gameLoop(ts);
});
