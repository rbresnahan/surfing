import { loadAssets } from "./assets.js";
import { createBackgroundMusicController } from "./audio.js";
import { CONFIG, VERSION } from "./config.js";
import { AngryFishermanEncounter } from "./angryFishermanEncounter.js";
import { EncounterManager } from "./encounterManager.js";
import { Input } from "./input.js";
import { ObstacleManager } from "./obstacles.js";
import { rectsOverlap } from "./collision.js";
import { calculateScore, formatTime, loadRecords, saveRecords } from "./scoring.js";
import { Surfer } from "./surfer.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const GameState = {
  READY: "READY",
  RUNNING: "RUNNING",
  CRASHED: "CRASHED"
};

const input = new Input();
const surfer = new Surfer();
const obstacles = new ObstacleManager();
const encounters = new EncounterManager();
encounters.register(new AngryFishermanEncounter());
let assets = null;
let state = GameState.READY;
let lastTime = performance.now();
let survivalTime = 0;
let headsDodged = 0;
let finalScore = 0;
let records = loadRecords();
let waveFrameIndex = 0;
let waveTimer = 0;
let waveFrameSeconds = randomWaveFrameSeconds();
let backgroundMusic = createBackgroundMusicController(null);

loadAssets()
  .then((loaded) => {
    assets = loaded;
    backgroundMusic = createBackgroundMusicController(assets.backgroundMusic, {
      rowboatFinaleAudio: assets.rowboatFinaleMusic
    });
    requestAnimationFrame(loop);
  })
  .catch((error) => {
    drawLoadingError(error);
  });

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function update(dt) {
  if (input.consumeStart() && (state === GameState.READY || state === GameState.CRASHED)) {
    if (state === GameState.READY || surfer.crashTime >= CONFIG.WIPEOUT_SECONDS) {
      startRun();
    }
  }

  updateWave(dt);

  if (state === GameState.RUNNING) {
    survivalTime += dt;
    surfer.update(dt, input);
    const gameState = buildEncounterGameState();
    encounters.update(dt, gameState);
    headsDodged += obstacles.update(dt, survivalTime, surfer.y, {
      pauseSpawns: encounters.shouldPauseNormalSpawns()
    });
    checkCollision();
  } else if (state === GameState.CRASHED) {
    surfer.updateCrash(dt);
  }
}

function startRun() {
  state = GameState.RUNNING;
  survivalTime = 0;
  headsDodged = 0;
  finalScore = 0;
  input.reset();
  surfer.reset();
  obstacles.reset();
  encounters.reset();
  backgroundMusic.start();
}

function crash() {
  state = GameState.CRASHED;
  finalScore = calculateScore(survivalTime, headsDodged);
  records = saveRecords({ survivalTime, headsDodged, score: finalScore });
  obstacles.markCollided();
  encounters.cleanupActive(buildEncounterGameState());
}

function checkCollision() {
  const surferBox = surfer.hitbox(assets);
  const hazardBoxes = [...obstacles.hitboxes(), ...encounters.hitboxes()];
  if (hazardBoxes.some((box) => rectsOverlap(surferBox, box))) {
    crash();
  }
}

function updateWave(dt) {
  if (!assets?.waveFrames.length) return;

  waveTimer += dt;
  if (waveTimer >= waveFrameSeconds) {
    waveTimer = 0;
    waveFrameSeconds = randomWaveFrameSeconds();
    waveFrameIndex = (waveFrameIndex + 1) % assets.waveFrames.length;
  }
}

function draw() {
  ctx.imageSmoothingEnabled = false;
  drawBackground();
  obstacles.draw(ctx, assets);
  encounters.render(ctx, buildEncounterGameState());
  surfer.draw(ctx, assets, state === GameState.CRASHED);

  if (CONFIG.DEBUG) {
    drawDebug();
  }

  drawHud();

  if (state === GameState.READY) {
    drawCenteredText("PRESS SPACE TO SURF", CONFIG.HEIGHT * 0.47, 34);
    drawCenteredText(VERSION, CONFIG.HEIGHT * 0.55, 18);
  } else if (state === GameState.CRASHED) {
    drawCrashOverlay();
  }
}

function buildEncounterGameState() {
  return {
    elapsedSeconds: survivalTime,
    elapsedMs: survivalTime * 1000,
    surfer,
    obstacles,
    assets,
    music: backgroundMusic
  };
}

function drawBackground() {
  if (assets.waveFrames.length) {
    ctx.drawImage(assets.waveFrames[waveFrameIndex], 0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    return;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.HEIGHT);
  gradient.addColorStop(0, "#75d6e7");
  gradient.addColorStop(0.42, "#19a8c9");
  gradient.addColorStop(1, "#076b8d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let y = 90; y < CONFIG.HEIGHT; y += 74) {
    ctx.fillRect(0, y, CONFIG.WIDTH, 2);
  }
}

function drawHud() {
  const score = state === GameState.CRASHED ? finalScore : calculateScore(survivalTime, headsDodged);
  ctx.save();
  ctx.fillStyle = "rgba(4, 18, 26, 0.68)";
  ctx.fillRect(0, 0, CONFIG.WIDTH, 48);
  ctx.fillStyle = "#f6fbff";
  ctx.font = "24px 'Courier New', monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(`TIME ${formatTime(survivalTime)}`, 26, 25);
  ctx.fillText(`DODGED ${headsDodged}`, 306, 25);
  ctx.fillText(`SCORE ${score}`, 526, 25);
  ctx.textAlign = "right";
  ctx.fillText(VERSION, CONFIG.WIDTH - 26, 25);
  ctx.restore();
}

function drawCrashOverlay() {
  const ready = surfer.crashTime >= CONFIG.WIPEOUT_SECONDS;
  ctx.save();
  ctx.fillStyle = "rgba(2, 10, 16, 0.58)";
  ctx.fillRect(0, 80, CONFIG.WIDTH, 210);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "34px 'Courier New', monospace";
  ctx.fillText("WIPEOUT", CONFIG.WIDTH / 2, 116);
  ctx.font = "23px 'Courier New', monospace";
  ctx.fillText(`TIME ${formatTime(survivalTime)}   DODGED ${headsDodged}   SCORE ${finalScore}`, CONFIG.WIDTH / 2, 160);
  ctx.fillText(
    `BEST TIME ${formatTime(records.bestTime)}   BEST DODGED ${records.bestDodged}   HIGH SCORE ${records.highScore}`,
    CONFIG.WIDTH / 2,
    200
  );
  if (ready) {
    ctx.fillText("PRESS SPACE TO SURF AGAIN", CONFIG.WIDTH / 2, 246);
  }
  ctx.restore();
}

function drawDebug() {
  ctx.save();
  const bounds = CONFIG.SURF_BOUNDS;
  ctx.strokeStyle = "#fff04a";
  ctx.lineWidth = 2;
  ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);

  ctx.strokeStyle = "#ff4f8b";
  const surferBox = surfer.hitbox(assets);
  ctx.strokeRect(surferBox.x, surferBox.y, surferBox.width, surferBox.height);
  drawDebugCenter(surfer.x, surfer.y, "#ff4f8b");

  ctx.strokeStyle = "#3f1cff";
  for (const box of obstacles.hitboxes()) {
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  }
  for (const center of obstacles.centers()) {
    drawDebugCenter(center.x, center.y, "#3f1cff");
  }
  drawDebugSubmergeMarkers();
  ctx.restore();
}

function drawDebugCenter(x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(x - 3, y - 3, 6, 6);
  ctx.restore();
}

function drawDebugSubmergeMarkers() {
  drawDebugMarker(CONFIG.OBSTACLE_SUBMERGE_START_X, "SUBMERGE START", "#70ffcf");
  drawDebugMarker(CONFIG.OBSTACLE_SUBMERGE_END_X, "SUBMERGE END", "#ffdf70");
}

function drawDebugMarker(x, label, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, CONFIG.HEIGHT);
  ctx.stroke();
  ctx.font = "16px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(label, x + 6, 54);
  ctx.restore();
}

function drawCenteredText(text, y, size) {
  ctx.save();
  ctx.fillStyle = "rgba(2, 10, 16, 0.66)";
  ctx.fillRect(0, y - 42, CONFIG.WIDTH, 84);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${size}px 'Courier New', monospace`;
  ctx.fillText(text, CONFIG.WIDTH / 2, y);
  ctx.restore();
}

function drawLoadingError(error) {
  ctx.fillStyle = "#061820";
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  ctx.fillStyle = "#fff";
  ctx.font = "24px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText(error.message, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2);
}

function randomWaveFrameSeconds() {
  const ms = CONFIG.WAVE_FRAME_MS_MIN + Math.random() * (CONFIG.WAVE_FRAME_MS_MAX - CONFIG.WAVE_FRAME_MS_MIN);
  return ms / 1000;
}
