import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import { EncounterManager } from "../src/encounterManager.js";
import { ObstacleManager } from "../src/obstacles.js";
import {
  COOLER_PHASES,
  COOLER_THROWABLES,
  COOLER_WAVE_PATTERNS,
  CoolerFishermanEncounter,
  createCoolerWavePlan,
  coolerWaveValidationObstacles,
  validateCoolerWavePlan
} from "../src/coolerFishermanEncounter.js";
import { THROWABLES, waterRenderSize } from "../src/angryFishermanEncounter.js";
import { obstacleRowCenter, obstacleRowCenters } from "../src/rowGeometry.js";
import { validateObstacleTimeline } from "../src/patternValidator.js";
import { isSurferPositionValid } from "../src/surferGeometry.js";

const EXPECTED_COOLER_THROWABLE_DIMENSIONS = {
  bottle: { waterWidth: 92, collisionWidth: 62, collisionHeight: 30 },
  can: { waterWidth: 72, collisionWidth: 42, collisionHeight: 32 },
  "life-vest": { waterWidth: 104, collisionWidth: 72, collisionHeight: 54 },
  "life-ring": { waterWidth: 108, collisionWidth: 76, collisionHeight: 58 },
  sandwich: { waterWidth: 84, collisionWidth: 54, collisionHeight: 38 }
};
const PREVIOUS_COOLER_BOAT_VERTICAL_SPEED = 190;

test("cooler encounter begins at 105 seconds and not earlier", () => {
  const encounter = new CoolerFishermanEncounter(() => 0);

  assert.equal(CONFIG.COOLER_ENCOUNTER_TIME_MS, 105000);
  assert.equal(encounter.canStart(gameStateAt(104999)), false);
  assert.equal(encounter.canStart(gameStateAt(105000)), true);
});

test("cooler occurrence config overrides the generic id lookup", () => {
  const first = new CoolerFishermanEncounter(() => 0, {
    id: "angry-fisherman-cooler",
    startTimeMs: 105000,
    difficultyStageOnComplete: 2,
    postEncounterGraceSeconds: 0.9
  });
  const second = new CoolerFishermanEncounter(() => 0, {
    id: "angry-fisherman-cooler",
    startTimeMs: 138000,
    difficultyStageOnComplete: 2,
    handoffToNext: true,
    immediateSuccessorId: "angry-fisherman-cooler-toss"
  });

  assert.equal(first.startTimeMs, 105000);
  assert.equal(first.postEncounterGraceSeconds, CONFIG.COOLER_POST_ENCOUNTER_GRACE_SECONDS);
  assert.equal(first.handoffToNext, false);
  assert.equal(second.startTimeMs, 138000);
  assert.equal(second.postEncounterGraceSeconds, 0);
  assert.equal(second.handoffToNext, true);
});

test("cooler boat enters from the right and stops only after fully visible", () => {
  const encounter = new CoolerFishermanEncounter(() => 0);
  encounter.start();

  assert.ok(encounter.x - encounter.boatWidth / 2 > CONFIG.WIDTH);

  encounter.update(1, createGameState());
  assert.equal(encounter.phase, COOLER_PHASES.ENTERING);
  assert.ok(encounter.x + encounter.boatWidth / 2 > CONFIG.WIDTH);

  encounter.update(10, createGameState());
  assert.equal(encounter.x, CONFIG.FISHERMAN_STOP_X);
  assert.ok(encounter.x + encounter.boatWidth / 2 <= CONFIG.WIDTH);
  assert.equal(encounter.phase, COOLER_PHASES.POSITIONING);
});

test("cooler row-to-row release interval is longer from the traversal speed adjustment", () => {
  const rowInterval = obstacleRowCenter(1) - obstacleRowCenter(0);
  const previousInterval = rowInterval / PREVIOUS_COOLER_BOAT_VERTICAL_SPEED;
  const currentInterval = rowInterval / CONFIG.COOLER_BOAT_VERTICAL_SPEED;

  assert.equal(CONFIG.COOLER_BOAT_VERTICAL_SPEED, PREVIOUS_COOLER_BOAT_VERTICAL_SPEED * 0.9);
  assertAlmostEqual(currentInterval / previousInterval, 1 / 0.9);
});

test("first cooler attack side is deterministic and all waves alternate", () => {
  const topFirst = new CoolerFishermanEncounter(() => 0);
  const bottomFirst = new CoolerFishermanEncounter(() => 0.99);

  topFirst.start();
  bottomFirst.start();

  assert.equal(topFirst.firstSide, "top");
  assert.deepEqual(topFirst.waveSides, ["top", "bottom", "top"]);
  assert.equal(bottomFirst.firstSide, "top");
  assert.deepEqual(bottomFirst.waveSides, ["top", "bottom", "top"]);
});

test("same inputs produce the same cooler dumping pattern", () => {
  function dumpingPattern() {
    const encounter = new CoolerFishermanEncounter(fixedRandom([0, 0.2, 0.8, 0.35, 0.6]));
    const gameState = createGameState();
    const released = [];
    encounter.start();
    encounter.x = CONFIG.FISHERMAN_STOP_X;
    encounter.y = CONFIG.COOLER_ATTACK_POSITIONS.top;
    encounter.phase = COOLER_PHASES.PREPARING_WAVE;
    encounter.beginDumpingWave();

    for (let i = 0; i < 30; i += 1) {
      encounter.update(0.05, gameState);
      released.push(...encounter.drops.map((drop) => `${drop.item.id}:${drop.row}:${drop.startY}`));
      encounter.update(CONFIG.COOLER_DROP_DURATION_SECONDS, gameState);
    }

    return {
      waves: encounter.wavePlans.map((wave) => `${wave.pattern}:${wave.side}:${wave.items.map((item) => item.row).join(",")}`),
      released
    };
  }

  assert.deepEqual(dumpingPattern(), dumpingPattern());
});

test("cooler encounter runs exactly three dump waves and exits right after wave 3", () => {
  const encounter = new CoolerFishermanEncounter(fixedRandom([0, 0, 0.5, 0.2, 0.8, 0.35, 0.6]));
  const gameState = createGameState();
  const phasesSeen = new Set();

  encounter.start();
  runUntil(encounter, gameState, () => encounter.isComplete(), phasesSeen);

  assert.equal(encounter.completedWaves, 3);
  assert.equal(encounter.wavePlans.length, 3);
  assert.deepEqual(encounter.wavePlans.map((wave) => wave.waveNumber), [1, 2, 3]);
  assert.deepEqual(encounter.wavePlans.map((wave) => wave.side), ["top", "bottom", "top"]);
  assert.equal(phasesSeen.has(COOLER_PHASES.DUMPING_WAVE), true);
  assert.equal(encounter.phase, COOLER_PHASES.COMPLETE);
  assert.ok(encounter.x - encounter.boatWidth / 2 > CONFIG.WIDTH);
});

test("handoff cooler completes at the boat position instead of exiting right", () => {
  const encounter = new CoolerFishermanEncounter(() => 0, {
    id: "angry-fisherman-cooler",
    startTimeMs: 138000,
    handoffToNext: true,
    immediateSuccessorId: "angry-fisherman-cooler-toss"
  });
  const gameState = createGameState();

  encounter.start();
  runUntilWithObstacles(encounter, gameState, () => encounter.isComplete(), new Set());

  const handoff = encounter.createHandoffState();
  assert.equal(encounter.phase, COOLER_PHASES.COMPLETE);
  assert.equal(handoff.targetEncounterId, "angry-fisherman-cooler-toss");
  assert.equal(handoff.boat.x, encounter.x);
  assert.equal(handoff.boat.y, encounter.y);
  assert.ok(encounter.x - encounter.boatWidth / 2 <= CONFIG.WIDTH);
});

test("handoff cooler waits in final between-waves until dumped water obstacles resolve", () => {
  const encounter = new CoolerFishermanEncounter(() => 0, {
    id: "angry-fisherman-cooler",
    startTimeMs: 138000,
    handoffToNext: true,
    immediateSuccessorId: "angry-fisherman-cooler-toss"
  });
  const gameState = createGameState();
  const handoffX = CONFIG.FISHERMAN_STOP_X;
  const handoffY = CONFIG.COOLER_ATTACK_POSITIONS.top;
  gameState.obstacles.addObstacle(createWaterObstacleForTest("angry-fisherman-cooler"));
  encounter.start(gameState);
  encounter.x = handoffX;
  encounter.y = handoffY;
  encounter.phase = COOLER_PHASES.BETWEEN_WAVES;
  encounter.completedWaves = 3;
  encounter.timer = 0;

  encounter.update(0.05, gameState);

  assert.equal(encounter.phase, COOLER_PHASES.BETWEEN_WAVES);
  assert.equal(encounter.isComplete(), false);
  assert.equal(encounter.x, handoffX);
  assert.equal(encounter.y, handoffY);

  while (gameState.obstacles.countEncounterObstaclesBySource("angry-fisherman-cooler") > 0) {
    gameState.obstacles.update(0.25, gameState.elapsedSeconds, 300, { pauseSpawns: true });
  }
  encounter.update(0.05, gameState);

  assert.equal(encounter.phase, COOLER_PHASES.COMPLETE);
  assert.equal(encounter.isComplete(), true);
});

test("ordinary cooler still exits after the final between-waves pause", () => {
  const encounter = new CoolerFishermanEncounter(() => 0);
  const gameState = createGameState();
  gameState.obstacles.addObstacle(createWaterObstacleForTest("angry-fisherman-cooler"));
  encounter.start(gameState);
  encounter.phase = COOLER_PHASES.BETWEEN_WAVES;
  encounter.completedWaves = 3;
  encounter.timer = 0;

  encounter.update(0.05, gameState);

  assert.equal(encounter.phase, COOLER_PHASES.EXITING);
  assert.equal(encounter.isComplete(), false);
});

test("dump sprite is used only while releasing items and closed cooler sprite is used otherwise", () => {
  const encounter = new CoolerFishermanEncounter(() => 0);
  const gameState = createGameState();
  const travelCtx = createMockContext();
  const dumpCtx = createMockContext();
  const exitCtx = createMockContext();

  encounter.start();
  encounter.render(travelCtx, gameState);

  encounter.x = CONFIG.FISHERMAN_STOP_X;
  encounter.y = CONFIG.COOLER_ATTACK_POSITIONS.top;
  encounter.phase = COOLER_PHASES.PREPARING_WAVE;
  encounter.beginDumpingWave();
  encounter.render(dumpCtx, gameState);

  encounter.phase = COOLER_PHASES.EXITING;
  encounter.render(exitCtx, gameState);

  assert.deepEqual(travelCtx.drawnImages(), ["angryFishermanCooler"]);
  assert.deepEqual(dumpCtx.drawnImages(), ["angryFishermanCoolerDump"]);
  assert.deepEqual(exitCtx.drawnImages(), ["angryFishermanCooler"]);
});

test("cooler waves wait for existing ordinary obstacles to clear", () => {
  const encounter = new CoolerFishermanEncounter(() => 0);
  const gameState = createGameState();
  gameState.obstacles.activeEvent = { heads: [], threatening: true };

  encounter.start();
  encounter.x = CONFIG.FISHERMAN_STOP_X;
  encounter.y = CONFIG.COOLER_ATTACK_POSITIONS.top;
  encounter.phase = COOLER_PHASES.PREPARING_WAVE;
  encounter.timer = -1;

  encounter.update(0.1, gameState);
  assert.equal(encounter.phase, COOLER_PHASES.PREPARING_WAVE);
  assert.equal(encounter.activeWave, null);

  gameState.obstacles.activeEvent = null;
  encounter.update(0.1, gameState);
  assert.equal(encounter.phase, COOLER_PHASES.DUMPING_WAVE);
  assert.ok(encounter.activeWave);
});

test("cooler dumped items keep their configured water aspect ratios and never include the wallet", () => {
  assert.equal(COOLER_THROWABLES.some((item) => item.id === "wallet"), false);

  for (const item of COOLER_THROWABLES) {
    const original = THROWABLES.find((throwable) => throwable.id === item.id);
    const expected = EXPECTED_COOLER_THROWABLE_DIMENSIONS[item.id];
    const size = waterRenderSize(item);

    assert.equal(item.waterVisualAspectRatio, original.waterVisualAspectRatio);
    assert.equal(size.width, item.waterTargetWidth);
    assert.equal(size.height, item.waterTargetWidth / item.waterVisualAspectRatio);
    assert.equal(item.waterTargetWidth, expected.waterWidth);
    assert.equal(item.collisionWidth, expected.collisionWidth);
    assert.equal(item.collisionHeight, expected.collisionHeight);
  }
});

test("every generated cooler wave contains a validated surfer-sized safe gap", () => {
  for (let i = 0; i < 40; i += 1) {
    const plan = createCoolerWavePlan({
      side: i % 2 === 0 ? "top" : "bottom",
      waveIndex: i % 3,
      previousPattern: i % 3 === 2 ? COOLER_WAVE_PATTERNS.GAP_LINE : null,
      random: fixedRandom([i / 40, 0.2, 0.8, 0.35, 0.65, 0.1, 0.9])
    });

    assert.equal(validateCoolerWavePlan(plan), true);
    assert.ok(plan.gap.bottom > plan.gap.top);
    assert.equal(plan.items.some(({ item }) => item.id === "wallet"), false);
    assert.equal(plan.items.every(({ row, y }) => obstacleRowCenter(row) === y), true);
  }
});

test("current second cooler encounter waves have movement-legal navigable routes", () => {
  const encounter = new CoolerFishermanEncounter(fixedRandom([0, 0, 0.5, 0.2, 0.8, 0.35, 0.6]));
  const gameState = createGameState();

  encounter.start(gameState);
  runUntil(encounter, gameState, () => encounter.isComplete(), new Set());

  assert.equal(encounter.wavePlans.length, 3);
  for (const plan of encounter.wavePlans) {
    const result = validateObstacleTimeline(coolerWaveValidationObstacles(plan), {
      speed: CONFIG.FISHERMAN_THROWABLE_SPEED,
      surferY: midpoint(CONFIG.SURF_BOUNDS.top, CONFIG.SURF_BOUNDS.bottom)
    });

    assert.equal(result.valid, true, plan.pattern);
    assert.equal(validateCoolerWavePlan(plan), true, plan.pattern);
    assert.equal(result.safeRoute.every((step) =>
      step.ys.every((y) => isSurferPositionValid(CONFIG.SURF_BOUNDS.left + (CONFIG.SURF_BOUNDS.right - CONFIG.SURF_BOUNDS.left) * 0.35, y))
    ), true, plan.pattern);
  }
});

test("cooler safe-gap validation rejects an unavoidable full-height barrier", () => {
  const item = COOLER_THROWABLES[0];
  const plan = {
    waveNumber: 1,
    side: "top",
    pattern: COOLER_WAVE_PATTERNS.GAP_LINE,
    gap: { top: 280, bottom: 280 + CONFIG.COOLER_PROTECTED_GAP_SIZE },
    items: [
      { item, y: 230 },
      { item, y: 300 },
      { item, y: 365 },
      { item, y: 440 }
    ]
  };

  assert.equal(validateCoolerWavePlan(plan), false);
});

test("cooler release cadence follows row crossings without simultaneous dumping", () => {
  const encounter = new CoolerFishermanEncounter(() => 0);
  const gameState = createGameState();
  encounter.start();
  encounter.x = CONFIG.FISHERMAN_STOP_X;
  encounter.y = CONFIG.COOLER_ATTACK_POSITIONS.top;
  encounter.phase = COOLER_PHASES.PREPARING_WAVE;
  encounter.beginDumpingWave();

  encounter.update(0.01, gameState);

  assert.ok(encounter.lastReleasedItems.length <= 1);
  assert.equal(encounter.drops.every((drop) => obstacleRowCenters().includes(drop.landingY)), true);
  assert.equal(gameState.obstacles.encounterObstacles.length, 0);

  encounter.update(CONFIG.COOLER_DROP_DURATION_SECONDS, gameState);
  assert.equal(gameState.obstacles.encounterObstacles.length <= 1, true);
  assert.equal(gameState.obstacles.encounterObstacles.every((obstacle) => obstacleRowCenters().includes(obstacle.y)), true);
});

test("cooler items release only when the boat release point crosses their row", () => {
  const encounter = dumpingEncounter("top", [0]);
  const gameState = createGameState();
  const rowY = obstacleRowCenter(0);
  const dt = (rowY - encounter.releasePoint().y) / CONFIG.COOLER_BOAT_VERTICAL_SPEED + 0.001;

  encounter.update(dt, gameState);

  assert.equal(encounter.drops.length, 1);
  assert.equal(encounter.drops[0].row, 0);
  assert.equal(encounter.drops[0].startX, CONFIG.FISHERMAN_STOP_X - 80);
  assert.equal(encounter.drops[0].startY, rowY);
  assert.equal(encounter.drops[0].landingY, rowY);
  assert.equal(encounter.releasePoint().y >= rowY, true);
});

test("slower cooler traversal still releases at exact row alignment without an added delay", () => {
  const encounter = dumpingEncounter("top", [0, 1]);
  const gameState = createGameState();
  const firstRowY = obstacleRowCenter(0);
  const secondRowY = obstacleRowCenter(1);

  encounter.update(crossingDt(encounter, 0), gameState);
  assert.equal(encounter.drops.length, 1);
  assert.equal(encounter.drops[0].startY, firstRowY);
  assert.equal(encounter.releasePoint().y >= firstRowY, true);

  encounter.update(CONFIG.COOLER_DROP_DURATION_SECONDS, gameState);
  encounter.update(crossingDt(encounter, 1), gameState);

  assert.equal(encounter.drops.length, 1);
  assert.equal(encounter.drops[0].startY, secondRowY);
  assert.equal(encounter.releasePoint().y >= secondRowY, true);
});

test("cooler item water obstacles stay on existing row centers", () => {
  const encounter = dumpingEncounter("top", [0]);
  const gameState = createGameState();

  encounter.update(crossingDt(encounter, 0), gameState);
  encounter.update(CONFIG.COOLER_DROP_DURATION_SECONDS, gameState);

  assert.equal(gameState.obstacles.encounterObstacles.length, 1);
  assert.equal(gameState.obstacles.encounterObstacles[0].row, 0);
  assert.equal(gameState.obstacles.encounterObstacles[0].y, obstacleRowCenter(0));
});

test("empty planned rows do not release arbitrary nonaligned items", () => {
  const encounter = dumpingEncounter("top", [2]);
  const gameState = createGameState();

  encounter.update(crossingDt(encounter, 0), gameState);
  encounter.update(crossingDt(encounter, 1), gameState);

  assert.equal(encounter.drops.length, 0);
  assert.equal(encounter.lastReleasedItems.length, 0);

  encounter.update(crossingDt(encounter, 2), gameState);
  assert.equal(encounter.drops.length, 1);
  assert.equal(encounter.drops[0].row, 2);
});

test("repeated updates near the same cooler row do not duplicate a release", () => {
  const encounter = dumpingEncounter("top", [0]);
  const gameState = createGameState();

  encounter.update(crossingDt(encounter, 0), gameState);
  const releasedCount = encounter.lastReleasedItems.length;
  encounter.update(0.001, gameState);
  encounter.releaseCrossing(obstacleRowCenter(0), obstacleRowCenter(0) + 0.1);

  assert.equal(releasedCount, 1);
  assert.equal(encounter.lastReleasedItems.length, 1);
  assert.equal(encounter.drops.length, 1);
});

test("large cooler frame steps release only the current crossing and skip stale rows", () => {
  const encounter = dumpingEncounter("top", [0, 1, 2]);
  const gameState = createGameState();
  const dt = (obstacleRowCenter(2) - encounter.releasePoint().y) / CONFIG.COOLER_BOAT_VERTICAL_SPEED + 0.001;

  encounter.update(dt, gameState);

  assert.equal(encounter.drops.length, 1);
  assert.equal(encounter.drops[0].row, 2);
  assert.equal(encounter.releaseIndex, 3);
});

test("swept crossing detection catches normal frame-rate variations", () => {
  const encounter = dumpingEncounter("top", [1]);
  const gameState = createGameState();
  const targetY = obstacleRowCenter(1);

  while (encounter.releasePoint().y < targetY && encounter.lastReleasedItems.length === 0) {
    encounter.update(1 / 24, gameState);
  }

  assert.equal(encounter.lastReleasedItems.length, 1);
  assert.equal(encounter.drops[0].row, 1);
  assert.equal(encounter.drops[0].startY, targetY);
});

test("cooler boat keeps moving at configured speed while releasing", () => {
  const encounter = dumpingEncounter("top", [0]);
  const gameState = createGameState();
  const beforeY = encounter.y;
  const dt = 0.02;

  encounter.update(dt, gameState);

  assert.equal(encounter.y, beforeY + CONFIG.COOLER_BOAT_VERTICAL_SPEED * dt);
});

test("cooler release plans are ordered by boat travel direction", () => {
  const topPlan = createCoolerWavePlan({ side: "top", waveIndex: 0, random: () => 0 });
  const bottomPlan = createCoolerWavePlan({ side: "bottom", waveIndex: 0, random: () => 0 });

  assert.deepEqual(topPlan.items.map(({ row }) => row), [...topPlan.items.map(({ row }) => row)].sort((a, b) => a - b));
  assert.deepEqual(bottomPlan.items.map(({ row }) => row), [...bottomPlan.items.map(({ row }) => row)].sort((a, b) => b - a));
});

test("sequential cooler releases naturally form a diagonal as earlier items move left", () => {
  const encounter = dumpingEncounter("top", [0, 1]);
  const gameState = createGameState();

  encounter.update(crossingDt(encounter, 0), gameState);
  encounter.update(CONFIG.COOLER_DROP_DURATION_SECONDS, gameState);
  gameState.obstacles.update(0.05, 120, 300, { pauseSpawns: true });

  encounter.update(crossingDt(encounter, 1), gameState);
  encounter.update(CONFIG.COOLER_DROP_DURATION_SECONDS, gameState);

  const [earlier, later] = gameState.obstacles.encounterObstacles;
  assert.equal(earlier.row, 0);
  assert.equal(later.row, 1);
  assert.ok(earlier.x < later.x);
});

test("ordinary obstacle spawning is suspended during cooler encounter and grace period", () => {
  const manager = new EncounterManager();
  const encounter = new CoolerFishermanEncounter(() => 0);
  const obstacles = new ObstacleManager();
  manager.register(encounter);

  manager.update(0.016, { ...gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS), obstacles });
  assert.equal(manager.shouldPauseNormalSpawns(), true);

  encounter.phase = COOLER_PHASES.COMPLETE;
  manager.update(0.016, { ...gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS + 16), obstacles });
  assert.equal(manager.activeEncounter, null);
  assert.equal(manager.shouldPauseNormalSpawns(), true);

  manager.update(CONFIG.COOLER_POST_ENCOUNTER_GRACE_SECONDS, {
    ...gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS + 1000),
    obstacles
  });
  assert.equal(manager.shouldPauseNormalSpawns(), false);
});

test("restart and game-over cleanup clear every cooler timer and object", () => {
  const encounter = new CoolerFishermanEncounter(() => 0);
  const gameState = createGameState();
  encounter.start();
  encounter.x = CONFIG.FISHERMAN_STOP_X;
  encounter.y = CONFIG.COOLER_ATTACK_POSITIONS.top;
  encounter.phase = COOLER_PHASES.PREPARING_WAVE;
  encounter.beginDumpingWave();
  encounter.update(0.01, gameState);
  encounter.update(CONFIG.COOLER_DROP_DURATION_SECONDS * 0.6, gameState);

  assert.notEqual(encounter.phase, COOLER_PHASES.WAITING);
  assert.ok(encounter.drops.length > 0);
  assert.ok(encounter.activeWave);

  encounter.cleanup(gameState);

  assert.equal(encounter.phase, COOLER_PHASES.WAITING);
  assert.equal(encounter.timer, 0);
  assert.equal(encounter.releaseTimer, 0);
  assert.equal(encounter.waveIndex, 0);
  assert.equal(encounter.completedWaves, 0);
  assert.equal(encounter.activeWave, null);
  assert.deepEqual(encounter.wavePlans, []);
  assert.deepEqual(encounter.drops, []);
  assert.deepEqual(encounter.lastReleasedItems, []);
  assert.deepEqual(gameState.obstacles.encounterObstacles, []);
});

test("completed cooler cleanup removes dumped water obstacles by source", () => {
  const encounter = new CoolerFishermanEncounter(() => 0);
  const gameState = createGameState();
  gameState.obstacles.addObstacle(createWaterObstacleForTest("angry-fisherman-cooler"));
  gameState.obstacles.addObstacle(createWaterObstacleForTest("other"));
  encounter.phase = COOLER_PHASES.COMPLETE;

  encounter.cleanup(gameState);

  assert.deepEqual(gameState.obstacles.encounterObstacles.map((obstacle) => obstacle.source), ["other"]);
});

test("aborted handoff cooler cleanup still removes remaining dumped water obstacles", () => {
  const encounter = new CoolerFishermanEncounter(() => 0, {
    id: "angry-fisherman-cooler",
    startTimeMs: 138000,
    handoffToNext: true,
    immediateSuccessorId: "angry-fisherman-cooler-toss"
  });
  const gameState = createGameState();
  gameState.obstacles.addObstacle(createWaterObstacleForTest("angry-fisherman-cooler"));
  encounter.start(gameState);
  encounter.phase = COOLER_PHASES.BETWEEN_WAVES;
  encounter.completedWaves = 3;

  encounter.cleanup(gameState);

  assert.equal(gameState.obstacles.countEncounterObstaclesBySource("angry-fisherman-cooler"), 0);
  assert.equal(encounter.phase, COOLER_PHASES.WAITING);
});

test("cooler dumped items use curated shared-row pattern definitions", () => {
  const gate = createCoolerWavePlan({ side: "top", waveIndex: 0, random: () => 0 });
  const finale = createCoolerWavePlan({ side: "bottom", waveIndex: 2, previousPattern: gate.pattern, random: () => 0 });

  assert.equal([COOLER_WAVE_PATTERNS.GAP_LINE, COOLER_WAVE_PATTERNS.SCATTER].includes(gate.pattern), true);
  assert.equal(finale.pattern, COOLER_WAVE_PATTERNS.FINALE);
  assert.equal(gate.items.every(({ row }) => Number.isInteger(row)), true);
  assert.equal(finale.items.every(({ row, y }) => y === obstacleRowCenter(row)), true);
  assert.ok(finale.items.length >= gate.items.length);
});

function createGameState() {
  return {
    elapsedMs: CONFIG.COOLER_ENCOUNTER_TIME_MS,
    elapsedSeconds: CONFIG.COOLER_ENCOUNTER_TIME_MS / 1000,
    assets: createAssets(),
    obstacles: new ObstacleManager()
  };
}

function gameStateAt(elapsedMs) {
  return {
    elapsedMs,
    elapsedSeconds: elapsedMs / 1000,
    assets: createAssets(),
    obstacles: new ObstacleManager()
  };
}

function dumpingEncounter(side, rows) {
  const encounter = new CoolerFishermanEncounter(() => 0);
  encounter.x = CONFIG.FISHERMAN_STOP_X;
  encounter.y = CONFIG.COOLER_ATTACK_POSITIONS[side];
  encounter.targetY = CONFIG.COOLER_ATTACK_POSITIONS[side === "top" ? "bottom" : "top"];
  encounter.phase = COOLER_PHASES.DUMPING_WAVE;
  encounter.activeWave = {
    waveNumber: 1,
    side,
    pattern: "test-cooler-wave",
    gap: { top: obstacleRowCenter(3), bottom: obstacleRowCenter(4) },
    items: rows.map((row) => ({
      item: COOLER_THROWABLES[0],
      row,
      y: obstacleRowCenter(row)
    }))
  };
  encounter.releaseIndex = 0;
  encounter.processedRowCrossings = new Set();
  return encounter;
}

function crossingDt(encounter, row) {
  return Math.abs(obstacleRowCenter(row) - encounter.releasePoint().y) / CONFIG.COOLER_BOAT_VERTICAL_SPEED + 0.001;
}

function midpoint(a, b) {
  return a + (b - a) / 2;
}

function runUntil(encounter, gameState, done, phasesSeen) {
  for (let i = 0; i < 600 && !done(); i += 1) {
    phasesSeen.add(encounter.phase);
    encounter.update(0.05, gameState);
  }
}

function runUntilWithObstacles(encounter, gameState, done, phasesSeen) {
  for (let i = 0; i < 900 && !done(); i += 1) {
    phasesSeen.add(encounter.phase);
    encounter.update(0.05, gameState);
    gameState.obstacles.update(0.05, gameState.elapsedSeconds, 300, { pauseSpawns: true });
  }
}

function createAssets() {
  return {
    angryFishermanCooler: image("angryFishermanCooler"),
    angryFishermanCoolerDump: image("angryFishermanCoolerDump"),
    throwables: Object.fromEntries(
      COOLER_THROWABLES.flatMap((item) => [
        [item.airborneAssetKey, image(item.airborneAssetKey)],
        [item.waterAssetKey, image(item.waterAssetKey)]
      ])
    )
  };
}

function createWaterObstacleForTest(source) {
  return {
    source,
    assetKey: "bottleWater",
    x: 500,
    y: obstacleRowCenter(2),
    row: 2,
    width: 60,
    height: 30,
    speed: 100
  };
}

function createMockContext() {
  return {
    draws: [],
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    drawImage(...args) {
      this.draws.push({ image: args[0], args });
    },
    drawnImages() {
      return this.draws.map((draw) => draw.image.key);
    }
  };
}

function image(key) {
  return { key, width: 100, height: 100 };
}

function fixedRandom(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

function assertAlmostEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} did not equal ${expected}`);
}
