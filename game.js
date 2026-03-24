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
const OBSTACLE_MIN_GAP = 130;
const OBSTACLE_MAX_GAP = 190;
const SPAWN_AHEAD = 800;
const CLEANUP_BEHIND = 400;
const PLAYER_WIDTH = 22;
const PLAYER_HEIGHT = 14;
const GAME_OVER_DELAY = 800;
const WINDOW_INTERVAL = 400;
const WINDOW_WIDTH = 160;
const WINDOW_HEIGHT = 120;
const POINTS_PER_THEME = 20;

// === COLOR THEMES ===
const THEMES = [
  { brick: "#7B5B4C", brickLight: "#8E6E5E", mortar: "#4A3530", window: "#4488CC" },
  { brick: "#8B3030", brickLight: "#A04040", mortar: "#4A1515", window: "#CC4444" },
  { brick: "#3B6B3B", brickLight: "#4A8A4A", mortar: "#1A3A1A", window: "#44CC66" },
  { brick: "#3B4B8B", brickLight: "#4A5AA0", mortar: "#1A2550", window: "#4488FF" },
  { brick: "#6B3B7B", brickLight: "#8A4A9A", mortar: "#3A1A4A", window: "#AA44CC" },
  { brick: "#8B7B30", brickLight: "#A09040", mortar: "#4A4015", window: "#CCCC44" },
];

function getCurrentTheme() {
  return THEMES[Math.floor(score / POINTS_PER_THEME) % THEMES.length];
}

// === FACE IMAGES ===
const FACE_COUNT = 5;
const FACE_SCORE_INTERVAL = 21;
const faceImages = [];
let facesLoaded = false;

(function loadFaces() {
  let loaded = 0;
  for (let i = 1; i <= FACE_COUNT; i++) {
    const img = new Image();
    img.src = `faces/${i}.jpg`;
    img.onload = () => { loaded++; if (loaded === FACE_COUNT) facesLoaded = true; };
    faceImages.push(img);
  }
})();

// Face display state
let nextFaceScore = FACE_SCORE_INTERVAL;
let activeFaceRow = -1;
let activeFaceIdx = -1;
let lastFaceIdx = -1;

function triggerFaceDisplay() {
  let idx;
  if (FACE_COUNT <= 1) {
    idx = 0;
  } else {
    do {
      idx = Math.floor(Math.random() * FACE_COUNT);
    } while (idx === lastFaceIdx);
  }
  lastFaceIdx = idx;
  activeFaceIdx = idx;
  activeFaceRow = Math.floor(player.y / WINDOW_INTERVAL) + 2;
}

function resetFaceState() {
  nextFaceScore = FACE_SCORE_INTERVAL;
  activeFaceRow = -1;
  activeFaceIdx = -1;
  lastFaceIdx = -1;
}

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

  createBrickPattern();
}

// === BRICK PATTERN ===
let brickPattern = null;
let brickPatternThemeIndex = -1;

function createBrickPattern() {
  const theme = getCurrentTheme();
  const themeIdx = Math.floor(score / POINTS_PER_THEME) % THEMES.length;
  brickPatternThemeIndex = themeIdx;

  const brickW = 28;
  const brickH = 14;
  const mortarW = 2;
  const patW = brickW + mortarW;
  const patH = (brickH + mortarW) * 2;

  const offscreen = document.createElement("canvas");
  offscreen.width = patW;
  offscreen.height = patH;
  const octx = offscreen.getContext("2d");

  // Mortar background
  octx.fillStyle = theme.mortar;
  octx.fillRect(0, 0, patW, patH);

  // Row 1 (full brick)
  octx.fillStyle = theme.brick;
  octx.fillRect(0, 0, brickW, brickH);
  // Subtle brick shading
  octx.fillStyle = theme.brickLight;
  octx.fillRect(1, 1, brickW - 2, 3);

  // Row 2 (offset by half)
  const offset = Math.floor(patW / 2);
  octx.fillStyle = theme.brick;
  octx.fillRect(-offset, brickH + mortarW, brickW, brickH);
  octx.fillRect(-offset + patW, brickH + mortarW, brickW, brickH);
  // Shading for offset row
  octx.fillStyle = theme.brickLight;
  octx.fillRect(-offset + 1, brickH + mortarW + 1, brickW - 2, 3);
  octx.fillRect(-offset + patW + 1, brickH + mortarW + 1, brickW - 2, 3);

  brickPattern = ctx.createPattern(offscreen, "repeat");
}

// === STATE (declared before resizeCanvas which needs score) ===
let gameState = "TITLE";
let score = 0;
let highScore = parseInt(localStorage.getItem("kamiHikouki_highScore")) || 0;
let gameOverTime = 0;
let titleAnimTime = 0;

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

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
  lastObstacleY = 250;
  lastSide = Math.random() < 0.5 ? "left" : "right";
}

function generateObstacles() {
  const generateTo = camera.y + canvasHeight + SPAWN_AHEAD;

  while (lastObstacleY < generateTo) {
    const gap = OBSTACLE_MIN_GAP + Math.random() * (OBSTACLE_MAX_GAP - OBSTACLE_MIN_GAP);
    lastObstacleY += gap;

    // Alternate sides with weighted randomness
    if (Math.random() < 0.65) {
      lastSide = lastSide === "left" ? "right" : "left";
    }

    // Platforms are long: 65-80% of tower width
    const platRatio = 0.65 + Math.random() * 0.15;
    const platWidth = towerWidth * platRatio;

    obstacles.push({
      x: lastSide === "left" ? 0 : towerWidth - platWidth,
      y: lastObstacleY,
      width: platWidth,
      height: PLATFORM_HEIGHT,
      side: lastSide,
      passed: false
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

function padScore(n, len) {
  return String(n).padStart(len, "0");
}

// === GAME LOGIC ===
function startGame() {
  gameState = "PLAYING";
  score = 0;
  resetPlayer();
  resetObstacles();
  particles = [];
  camera.y = player.y - canvasHeight * 0.33;
  resetFaceState();
  createBrickPattern();
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

  // Minimum fall speed
  if (player.vy < 0.3) player.vy = 0.3;

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Visual angle
  const targetAngle = player.vx * 0.12;
  player.angle = lerp(player.angle, targetAngle, 0.1 * dt);

  // Camera
  const targetCamY = player.y - canvasHeight * 0.33;
  camera.y = lerp(camera.y, targetCamY, 0.06 * dt);

  // Score: count obstacles passed
  const prevScore = score;
  for (const o of obstacles) {
    if (!o.passed && player.y > o.y + o.height) {
      o.passed = true;
      score++;
    }
  }

  // Trigger face display at every FACE_SCORE_INTERVAL points
  if (score >= nextFaceScore && facesLoaded) {
    triggerFaceDisplay();
    nextFaceScore += FACE_SCORE_INTERVAL;
  }

  // Regenerate brick pattern if theme changed
  const newThemeIdx = Math.floor(score / POINTS_PER_THEME) % THEMES.length;
  if (newThemeIdx !== brickPatternThemeIndex) {
    createBrickPattern();
  }

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
  if (player.deathScale > 0.1) {
    player.deathScale = lerp(player.deathScale, 0, 0.04 * dt);
    player.deathAngle += 0.15 * dt;
  }
  updateParticles(dt);

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
  // Brick pattern in tower area
  ctx.save();
  ctx.beginPath();
  ctx.rect(towerLeft, 0, towerWidth, canvasHeight);
  ctx.clip();
  ctx.translate(towerLeft, -(camera.y % 32));
  ctx.fillStyle = brickPattern;
  ctx.fillRect(0, -32, towerWidth, canvasHeight + 64);
  ctx.restore();
}

function drawWalls() {
  // Left wall - metallic gray gradient
  const lgrd = ctx.createLinearGradient(0, 0, towerLeft, 0);
  lgrd.addColorStop(0, "#606060");
  lgrd.addColorStop(0.3, "#909090");
  lgrd.addColorStop(0.5, "#A8A8A8");
  lgrd.addColorStop(0.7, "#909090");
  lgrd.addColorStop(1, "#686868");
  ctx.fillStyle = lgrd;
  ctx.fillRect(0, 0, towerLeft, canvasHeight);

  // Right wall
  const rgrd = ctx.createLinearGradient(towerLeft + towerWidth, 0, canvasWidth, 0);
  rgrd.addColorStop(0, "#686868");
  rgrd.addColorStop(0.3, "#909090");
  rgrd.addColorStop(0.5, "#A8A8A8");
  rgrd.addColorStop(0.7, "#909090");
  rgrd.addColorStop(1, "#606060");
  ctx.fillStyle = rgrd;
  ctx.fillRect(towerLeft + towerWidth, 0, WALL_THICKNESS, canvasHeight);

  // Highlight lines
  ctx.fillStyle = "#BBBBBB";
  ctx.fillRect(towerLeft - 1, 0, 1, canvasHeight);
  ctx.fillRect(towerLeft + towerWidth, 0, 1, canvasHeight);

  // Shadow lines
  ctx.fillStyle = "#444444";
  ctx.fillRect(0, 0, 1, canvasHeight);
  ctx.fillRect(canvasWidth - 1, 0, 1, canvasHeight);
}

function drawWindows() {
  const theme = getCurrentTheme();
  // Window positions at regular intervals
  const startY = Math.floor((camera.y - WINDOW_HEIGHT) / WINDOW_INTERVAL) * WINDOW_INTERVAL;

  for (let wy = startY; wy < camera.y + canvasHeight + WINDOW_HEIGHT; wy += WINDOW_INTERVAL) {
    const screenY = wy - camera.y;

    // Determine window x position based on row - alternate sides or center
    const row = Math.floor(wy / WINDOW_INTERVAL);
    let windowPositions;
    if (row % 3 === 0) {
      windowPositions = [towerLeft + towerWidth * 0.15 - WINDOW_WIDTH / 2];
    } else if (row % 3 === 1) {
      windowPositions = [towerLeft + towerWidth * 0.85 - WINDOW_WIDTH / 2];
    } else {
      windowPositions = [towerLeft + towerWidth * 0.5 - WINDOW_WIDTH / 2];
    }

    for (const wx of windowPositions) {
      // Window frame (dark)
      ctx.fillStyle = theme.mortar;
      ctx.fillRect(wx - 2, screenY - 2, WINDOW_WIDTH + 4, WINDOW_HEIGHT + 4);

      // Window glass
      const wgrd = ctx.createLinearGradient(wx, screenY, wx, screenY + WINDOW_HEIGHT);
      wgrd.addColorStop(0, theme.window);
      wgrd.addColorStop(0.3, lightenColor(theme.window, 40));
      wgrd.addColorStop(1, theme.window);
      ctx.fillStyle = wgrd;
      ctx.fillRect(wx, screenY, WINDOW_WIDTH, WINDOW_HEIGHT);

      // Face peeking from window (one at a time, every 21 points)
      if (row === activeFaceRow && activeFaceIdx >= 0 && activeFaceIdx < faceImages.length) {
        const img = faceImages[activeFaceIdx];
        if (img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(wx, screenY, WINDOW_WIDTH, WINDOW_HEIGHT);
          ctx.clip();
          const imgAspect = img.naturalWidth / img.naturalHeight;
          let drawH = WINDOW_HEIGHT;
          let drawW = drawH * imgAspect;
          if (drawW < WINDOW_WIDTH) { drawW = WINDOW_WIDTH; drawH = drawW / imgAspect; }
          const drawX = wx + (WINDOW_WIDTH - drawW) / 2;
          const drawY = screenY + (WINDOW_HEIGHT - drawH) / 2;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          ctx.restore();
        }
      }

      // Window shine
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(wx + 3, screenY + 3, WINDOW_WIDTH * 0.4, WINDOW_HEIGHT * 0.3);
    }
  }
}

function lightenColor(hex, amount) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r},${g},${b})`;
}

function drawPlatforms() {
  ctx.save();
  ctx.translate(towerLeft, 0);

  for (const o of obstacles) {
    const screenY = o.y - camera.y;
    if (screenY > canvasHeight + 20 || screenY + o.height < -20) continue;

    // Platform shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(o.x + 2, screenY + 2, o.width, o.height);

    // Platform body - white/light gray bar
    ctx.fillStyle = "#E8E0D8";
    ctx.fillRect(o.x, screenY, o.width, o.height);

    // Highlight on top
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(o.x, screenY, o.width, 2);

    // Dark outline
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(o.x, screenY, o.width, o.height);

    // Inner line for depth
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.fillRect(o.x, screenY + o.height - 2, o.width, 2);
  }

  ctx.restore();
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

  // V-shaped / chevron airplane (pointing downward, like original)
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(-10, -8);   // left wing tip
  ctx.lineTo(0, 4);      // bottom center (nose)
  ctx.lineTo(10, -8);    // right wing tip
  ctx.stroke();

  // Slight fill for visibility
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.lineTo(0, 4);
  ctx.lineTo(10, -8);
  ctx.closePath();
  ctx.fill();

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
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  ctx.save();
  // Score - center top
  ctx.font = "bold 20px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText(padScore(score, 3), canvasWidth / 2 + 1, 29);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(padScore(score, 3), canvasWidth / 2, 28);

  // High score - right top
  ctx.font = "bold 12px 'Courier New', monospace";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText("HIGH SCORE " + padScore(highScore, 3), canvasWidth - 9, 17);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("HIGH SCORE " + padScore(highScore, 3), canvasWidth - 10, 16);
  ctx.restore();
}

function drawTitleScreen() {
  // Use brown theme for title
  const titleTheme = THEMES[0];

  // Brick background (full screen)
  ctx.save();
  ctx.fillStyle = brickPattern;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();

  // Dim overlay for readability
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Floating airplane animation
  const floatY = Math.sin(titleAnimTime * 2) * 15;
  const floatAngle = Math.sin(titleAnimTime * 1.3) * 0.3;

  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight * 0.30 + floatY);
  ctx.rotate(floatAngle);
  ctx.scale(3, 3);

  // V-shape
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.lineTo(0, 4);
  ctx.lineTo(10, -8);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.lineTo(0, 4);
  ctx.lineTo(10, -8);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Title
  ctx.textAlign = "center";
  ctx.font = "bold 36px 'Courier New', monospace";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText("紙ヒコーキ", canvasWidth / 2 + 2, canvasHeight * 0.50 + 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("紙ヒコーキ", canvasWidth / 2, canvasHeight * 0.50);

  ctx.font = "14px 'Courier New', monospace";
  ctx.fillStyle = "#CCBBAA";
  ctx.fillText("PAPER AIRPLANE CHASE", canvasWidth / 2, canvasHeight * 0.56);

  // Start prompt (blinking)
  const blink = Math.sin(performance.now() / 500) > 0;
  if (blink) {
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("TAP or PRESS ANY KEY", canvasWidth / 2, canvasHeight * 0.72);
  }

  // High score
  if (highScore > 0) {
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.fillStyle = "#CCBBAA";
    ctx.fillText("HIGH SCORE " + padScore(highScore, 3), canvasWidth / 2, canvasHeight * 0.80);
  }
}

function drawGameOverScreen() {
  // Dim overlay
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.textAlign = "center";

  // Game Over
  ctx.font = "bold 32px 'Courier New', monospace";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText("GAME OVER", canvasWidth / 2 + 2, canvasHeight * 0.35 + 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("GAME OVER", canvasWidth / 2, canvasHeight * 0.35);

  // Score label
  ctx.font = "14px 'Courier New', monospace";
  ctx.fillStyle = "#CCBBAA";
  ctx.fillText("SCORE", canvasWidth / 2, canvasHeight * 0.42);

  // Score value
  ctx.font = "bold 48px 'Courier New', monospace";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(padScore(score, 3), canvasWidth / 2, canvasHeight * 0.52);

  // High score
  ctx.font = "bold 16px 'Courier New', monospace";
  ctx.fillStyle = "#CCBBAA";
  ctx.fillText("HIGH SCORE " + padScore(highScore, 3), canvasWidth / 2, canvasHeight * 0.60);

  // New record
  if (score >= highScore && score > 0) {
    ctx.font = "bold 16px 'Courier New', monospace";
    ctx.fillStyle = "#FFCC44";
    ctx.fillText("NEW RECORD!", canvasWidth / 2, canvasHeight * 0.66);
  }

  // Restart prompt
  const canRestart = performance.now() - gameOverTime > GAME_OVER_DELAY;
  if (canRestart) {
    const blink = Math.sin(performance.now() / 500) > 0;
    if (blink) {
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText("TAP or PRESS ANY KEY", canvasWidth / 2, canvasHeight * 0.76);
    }
  }
}

function renderPlaying() {
  drawBackground();
  drawWindows();
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

  input.anyPress = false;
  requestAnimationFrame(gameLoop);
}

// === INIT ===
requestAnimationFrame((ts) => {
  lastTime = ts;
  gameLoop(ts);
});
