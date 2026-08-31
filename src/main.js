import { loadAssets } from "./assets.js";
import { AntiCampManager } from "./antiCamp.js";
import { createBackgroundMusicController } from "./audio.js";
import { CONFIG, VERSION } from "./config.js";
import { createDiagnosticsSink } from "./diagnostics.js";
import { createEncounterManager } from "./encounterRegistry.js";
import { Input } from "./input.js";
import { ObstacleManager } from "./obstacles.js";
import { rectsOverlap } from "./collision.js";
import { calculateScore, formatTime, loadRecords, saveRecords } from "./scoring.js";
import { Surfer } from "./surfer.js";
import { obstacleRows, obstacleRowSpacing } from "./rowGeometry.js";

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
const diagnostics = createDiagnosticsSink();
const obstacles = new ObstacleManager({ diagnostics });
const encounters = createEncounterManager({ diagnostics });
const antiCamp = new AntiCampManager({ diagnostics });
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

setupDiagnosticsControl();
setupDiagnosticsLifecycleHooks();

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
    const runDt = dt * CONFIG.DEBUG_REDUCED_SPEED_MULTIPLIER;
    survivalTime += runDt;
    surfer.update(runDt, input);
    const gameState = buildEncounterGameState();
    encounters.update(runDt, gameState);
    const normalSpawnsPaused = encounters.shouldPauseNormalSpawns();
    headsDodged += obstacles.update(runDt, survivalTime, surfer.y, {
      pauseSpawns: normalSpawnsPaused,
      difficultyStage: encounters.difficultyStage,
      pauseOwner: diagnostics.enabled && encounters.activeEncounter ? diagnostics.occurrenceId(encounters.activeEncounter) : null,
      onNormalEventCompleted: () => {
        if (!normalSpawnsPaused && encounters.activeEncounter === null) {
          antiCamp.recordNormalObstaclePass(surfer, survivalTime);
        }
      }
    });
    antiCamp.update(runDt, survivalTime, surfer, {
      suspended: normalSpawnsPaused || encounters.activeEncounter !== null
    });
    checkCollision();
  } else if (state === GameState.CRASHED) {
    surfer.updateCrash(dt);
  }
}

function startRun() {
  const restarting = state === GameState.CRASHED;
  if (restarting) {
    diagnostics.restart({
      elapsedSeconds: survivalTime,
      previousRunOpenObjects: obstacles.encounterObstacles.length + obstacles.activeEvents.flatMap((event) => event.heads).length
    });
  }
  diagnostics.startRun({
    elapsedSeconds: 0,
    config: CONFIG,
    deterministicSeed: null
  });
  state = GameState.RUNNING;
  survivalTime = 0;
  headsDodged = 0;
  finalScore = 0;
  input.reset();
  surfer.reset();
  obstacles.reset();
  encounters.reset();
  antiCamp.reset(surfer, { elapsedSeconds: 0, reason: "start" });
  backgroundMusic.start();
}

function crash() {
  state = GameState.CRASHED;
  finalScore = calculateScore(survivalTime, headsDodged);
  records = saveRecords({ survivalTime, headsDodged, score: finalScore, nonScoring: encounters.nonScoringDebugRun });
  obstacles.markCollided(survivalTime);
  antiCamp.markCollided(survivalTime);
  antiCamp.reset(surfer, { elapsedSeconds: survivalTime, reason: "crash" });
  encounters.cleanupActive(buildEncounterGameState());
  diagnostics.endRun({
    elapsedSeconds: survivalTime,
    finalScore,
    headsDodged,
    survivalTime
  });
}

function checkCollision() {
  const surferBox = surfer.hitbox(assets);
  const hazardBoxes = [...obstacles.hitboxes(), ...encounters.hitboxes(), ...antiCamp.hitboxes()];
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
  antiCamp.draw(ctx, assets);
  encounters.render(ctx, buildEncounterGameState());
  surfer.draw(ctx, assets, state === GameState.CRASHED);

  if (CONFIG.DEBUG || CONFIG.DEBUG_OBSTACLE_ROWS) {
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
    music: backgroundMusic,
    difficultyStage: encounters.difficultyStage,
    diagnostics,
    occurrenceId: diagnostics.enabled && encounters.activeEncounter ? diagnostics.occurrenceId(encounters.activeEncounter) : null
  };
}

function setupDiagnosticsControl() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "diagnostics-open";
  button.textContent = "Open Run Diagnostics";
  button.addEventListener("click", () => {
    try {
      window.open("diagnostics.html", "surf-run-diagnostics", "popup,width=1040,height=760");
    } catch {
      // Opening is user-initiated; if the browser blocks it, gameplay continues.
    }
    diagnostics.enable(survivalTime);
  });
  document.body.appendChild(button);
}

function setupDiagnosticsLifecycleHooks() {
  window.addEventListener("error", (event) => {
    diagnostics.emit("diagnostics.error", {
      elapsedSeconds: survivalTime,
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    diagnostics.emit("diagnostics.error", {
      elapsedSeconds: survivalTime,
      message: event.reason?.message ?? String(event.reason)
    });
  });
  window.addEventListener("beforeunload", () => {
    diagnostics.teardown({ elapsedSeconds: survivalTime });
  });
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

  if (CONFIG.DEBUG_OBSTACLE_ROWS) {
    drawDebugRows();
  }

  ctx.strokeStyle = "#ff4f8b";
  const surferBox = surfer.hitbox(assets);
  ctx.strokeRect(surferBox.x, surferBox.y, surferBox.width, surferBox.height);
  drawDebugCenter(surfer.x, surfer.y, "#ff4f8b");

  if (CONFIG.DEBUG_OBSTACLE_ROWS) {
    const footprint = obstacleRowSpacing() * 2;
    ctx.strokeStyle = "rgba(255, 79, 139, 0.55)";
    ctx.strokeRect(bounds.left, surfer.y - footprint / 2, bounds.right - bounds.left, footprint);
  }

  ctx.strokeStyle = "#3f1cff";
  for (const box of obstacles.hitboxes()) {
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  }
  for (const center of obstacles.centers()) {
    drawDebugCenter(center.x, center.y, "#3f1cff");
    if (CONFIG.DEBUG_OBSTACLE_ROWS && Number.isInteger(center.row)) {
      ctx.fillStyle = "#3f1cff";
      ctx.font = "14px 'Courier New', monospace";
      ctx.fillText(`r${center.row} ${center.patternId ?? ""}`, center.x + 8, center.y - 18);
    }
  }
  drawDebugSubmergeMarkers();
  ctx.restore();
}

function drawDebugRows() {
  ctx.save();
  ctx.font = "15px 'Courier New', monospace";
  ctx.textBaseline = "middle";
  for (const { row, centerY } of obstacleRows()) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.62)";
    ctx.beginPath();
    ctx.moveTo(CONFIG.SURF_BOUNDS.left, centerY);
    ctx.lineTo(CONFIG.SURF_BOUNDS.right, centerY);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${row}`, CONFIG.SURF_BOUNDS.left - 22, centerY);
  }
  const activeId = obstacles.activeEvent?.patternId ?? "none";
  const nextId = obstacles.scheduler?.peekPattern(encounters.difficultyStage)?.id ?? "none";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`stage ${encounters.difficultyStage} active ${activeId} next ${nextId}`, CONFIG.SURF_BOUNDS.left, CONFIG.SURF_BOUNDS.top - 18);
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
  return ((CONFIG.WAVE_FRAME_MS_MIN + CONFIG.WAVE_FRAME_MS_MAX) / 2) / 1000;
}
