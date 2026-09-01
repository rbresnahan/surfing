import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import { ObstacleManager } from "../src/obstacles.js";
import {
  COOLER_TOSS_PHASES,
  AngryFishermanCoolerTossEncounter,
  coolerProjectilePosition
} from "../src/angryFishermanCoolerTossEncounter.js";
import { obstacleRowCenter } from "../src/rowGeometry.js";

test("cooler toss starts directly from a valid cooler handoff", () => {
  const encounter = new AngryFishermanCoolerTossEncounter(() => 0);

  encounter.start({
    ...createGameState(),
    encounterHandoff: {
      targetEncounterId: "angry-fisherman-cooler-toss",
      boat: { x: 812, y: 304, width: 211 }
    }
  });

  assert.equal(encounter.phase, COOLER_TOSS_PHASES.HOLDING);
  assert.equal(encounter.x, 812);
  assert.equal(encounter.y, 304);
  assert.equal(encounter.boatWidth, 211);
});

test("cooler toss enters from the right when developer-triggered standalone", () => {
  const encounter = new AngryFishermanCoolerTossEncounter(() => 0);

  encounter.start(createGameState());

  assert.equal(encounter.phase, COOLER_TOSS_PHASES.ENTERING);
  assert.ok(encounter.x - encounter.boatWidth / 2 > CONFIG.WIDTH);

  encounter.update(10, createGameState());

  assert.equal(encounter.x, CONFIG.FISHERMAN_STOP_X);
  assert.equal(encounter.phase, COOLER_TOSS_PHASES.HOLDING);
});

test("cooler toss throws one cooler and exits after it lands", () => {
  const encounter = new AngryFishermanCoolerTossEncounter(() => 0);
  const gameState = createGameState();

  encounter.start({
    ...gameState,
    encounterHandoff: {
      targetEncounterId: "angry-fisherman-cooler-toss",
      boat: { x: CONFIG.FISHERMAN_STOP_X, y: 320, width: CONFIG.FISHERMAN_DISPLAY_WIDTH }
    }
  });
  runUntil(encounter, gameState, () => encounter.projectiles.length === 1);
  assert.equal(encounter.phase, COOLER_TOSS_PHASES.THROWING);

  const projectile = encounter.projectiles[0];
  const peak = coolerProjectilePosition(projectile, 0.5);
  assert.ok(peak.y < Math.min(projectile.startY, projectile.landingY));

  runUntil(encounter, gameState, () => gameState.obstacles.encounterObstacles.length === 1);
  assert.equal(gameState.obstacles.encounterObstacles[0].source, "angry-fisherman-cooler-toss");
  assert.equal(gameState.obstacles.encounterObstacles[0].assetKey, "attackCoolerWater");
  assert.equal(gameState.obstacles.encounterObstacles[0].row, CONFIG.COOLER_TOSS_LANDING_ROW);

  runUntil(encounter, gameState, () => encounter.isComplete());

  assert.equal(encounter.phase, COOLER_TOSS_PHASES.COMPLETE);
  assert.ok(encounter.x - encounter.boatWidth / 2 > CONFIG.WIDTH);
});

test("cooler toss cleanup removes only its own water obstacle state", () => {
  const encounter = new AngryFishermanCoolerTossEncounter(() => 0);
  const gameState = createGameState();
  gameState.obstacles.addObstacle(waterObstacle("angry-fisherman-cooler-toss"));
  gameState.obstacles.addObstacle(waterObstacle("other"));

  encounter.cleanup(gameState);

  assert.deepEqual(gameState.obstacles.encounterObstacles.map((obstacle) => obstacle.source), ["other"]);
  assert.equal(encounter.phase, COOLER_TOSS_PHASES.WAITING);
  assert.deepEqual(encounter.projectiles, []);
});

function createGameState() {
  return {
    elapsedMs: 138000,
    elapsedSeconds: 138,
    assets: createAssets(),
    obstacles: new ObstacleManager()
  };
}

function createAssets() {
  return {
    angryFishermanCooler: image("angryFishermanCooler"),
    angryFishermanCoolerToss: image("angryFishermanCoolerToss"),
    coolerToss: {
      attackCooler: image("attackCooler"),
      attackCoolerWater: image("attackCoolerWater")
    }
  };
}

function waterObstacle(source) {
  return {
    source,
    assetKey: "attackCoolerWater",
    x: 500,
    y: obstacleRowCenter(2),
    row: 2,
    width: 60,
    height: 60,
    speed: 100
  };
}

function runUntil(encounter, gameState, done) {
  for (let i = 0; i < 600 && !done(); i += 1) {
    encounter.update(0.05, gameState);
  }
}

function image(key) {
  return { key, width: 100, height: 100 };
}
