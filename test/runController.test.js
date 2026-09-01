import test from "node:test";
import assert from "node:assert/strict";
import { EncounterManager } from "../src/encounterManager.js";
import { ObstacleManager } from "../src/obstacles.js";
import { RunController } from "../src/runController.js";
import { CONFIG } from "../src/config.js";

test("run controller starts the first swimmer block and advances once after completion", () => {
  const manager = new EncounterManager();
  const controller = new RunController({
    encounterManager: manager,
    sequence: [
      { type: "swimmers", id: "first", tier: 1, completion: { type: "patterns", count: 1 } },
      { type: "swimmers", id: "second", tier: 2, completion: { type: "endless" } }
    ]
  });
  const obstacles = new ObstacleManager();

  assert.equal(controller.currentBlockIndex, 0);
  assert.equal(controller.activeSwimmerSection.id, "first");

  spawnAndResolve(obstacles, controller.activeSwimmerSection);
  controller.update(0.016, gameStateAt(1, obstacles));

  assert.equal(controller.currentBlockIndex, 1);
  assert.equal(controller.activeSwimmerSection.id, "second");
  assert.equal(controller.activeSwimmerSection.tierId, 2);
});

test("run controller never runs a swimmer section and encounter simultaneously", () => {
  const manager = new EncounterManager();
  const encounter = fakeEncounter({ id: "boat" });
  manager.register(encounter);
  const controller = new RunController({
    encounterManager: manager,
    sequence: [
      { type: "encounter", id: "boat" },
      { type: "swimmers", id: "after", tier: 1, completion: { type: "endless" } }
    ]
  });

  assert.equal(encounter.started, 1);
  assert.equal(controller.activeSwimmerSection, null);
  assert.equal(controller.shouldPauseNormalSpawns(), true);

  encounter.completeAfterUpdate = true;
  controller.update(0.016, gameStateAt(1));

  assert.equal(controller.currentBlockIndex, 1);
  assert.equal(controller.activeSwimmerSection.id, "after");
});

test("run controller handles swimmer to encounter to swimmer sequencing", () => {
  const manager = new EncounterManager();
  const encounter = fakeEncounter({ id: "boat", completeAfterUpdate: true });
  manager.register(encounter);
  const controller = new RunController({
    encounterManager: manager,
    sequence: [
      { type: "swimmers", id: "before", tier: 1, completion: { type: "patterns", count: 1 } },
      { type: "encounter", id: "boat" },
      { type: "swimmers", id: "after", tier: 3, completion: { type: "endless" } }
    ]
  });
  const obstacles = new ObstacleManager();

  spawnAndResolve(obstacles, controller.activeSwimmerSection);
  controller.update(0.016, gameStateAt(1, obstacles));
  assert.equal(manager.activeEncounter, encounter);
  assert.equal(controller.activeSwimmerSection, null);

  controller.update(0.016, gameStateAt(2, obstacles));
  assert.equal(controller.activeSwimmerSection.id, "after");
  assert.equal(controller.activeSwimmerSection.tierId, 3);
});

test("run controller supports encounter to encounter and consumes cooler-style handoff successors", () => {
  const manager = new EncounterManager();
  const first = fakeEncounter({
    id: "cooler",
    completeAfterUpdate: true,
    createHandoffState: () => ({
      targetEncounterId: "cooler-toss",
      boat: { x: 800, y: 320, width: 210 }
    })
  });
  const second = fakeEncounter({
    id: "cooler-toss",
    canStartWithHandoff: (handoff) => handoff.targetEncounterId === "cooler-toss"
  });
  manager.register(first);
  manager.register(second);
  const controller = new RunController({
    encounterManager: manager,
    sequence: [
      { type: "encounter", id: "cooler" },
      { type: "encounter", id: "cooler-toss" },
      { type: "swimmers", id: "after", tier: 3, completion: { type: "endless" } }
    ]
  });

  controller.update(0.016, gameStateAt(1));

  assert.equal(first.cleaned, 1);
  assert.equal(second.started, 1);
  assert.equal(second.receivedHandoff.boat.x, 800);
  assert.equal(controller.currentBlockIndex, 1);
  assert.equal(manager.activeEncounter, second);

  second.completeAfterUpdate = true;
  controller.update(0.016, gameStateAt(2));
  assert.equal(second.started, 1);
  assert.equal(controller.currentBlockIndex, 2);
  assert.equal(controller.activeSwimmerSection.id, "after");
});

test("reset returns controller to initial swimmer state", () => {
  const manager = new EncounterManager();
  const controller = new RunController({ encounterManager: manager });

  controller.setLegacyTier(3, 10);
  assert.equal(controller.activeSwimmerSection.tierId, 3);
  controller.reset(0);

  assert.equal(controller.currentBlockIndex, 0);
  assert.equal(controller.activeSwimmerSection.tierId, 1);
  assert.equal(manager.difficultyStage, 0);
});

test("legacy compatibility keeps live encounter cadence metadata out of normal scheduling", () => {
  const manager = new EncounterManager();
  const controller = new RunController({ encounterManager: manager });
  const encounter = fakeEncounter({
    id: "angry-fisherman",
    canStart: (state) => state.elapsedMs >= CONFIG.FIRST_ENCOUNTER_TIME_MS,
    completeAfterUpdate: true,
    difficultyStageOnComplete: 1
  });
  manager.register(encounter);
  controller.reset();

  controller.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS / 1000));
  controller.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS / 1000 + 0.016));

  assert.equal(controller.activeSwimmerSection.tierId, 2);
  assert.equal(controller.obstacleOptions().tierTuning.id, 2);
  assert.equal(manager.difficultyStage, 1);
});

test("legacy compatibility waits for normal swimmers to drain before starting an encounter", () => {
  const manager = new EncounterManager();
  const encounter = fakeEncounter({
    id: "scheduled",
    canStart: () => true
  });
  manager.register(encounter);
  const controller = new RunController({ encounterManager: manager });
  const obstacles = new ObstacleManager();
  obstacles.spawnTimer = 0;
  obstacles.update(0.01, 0, 300, controller.obstacleOptions());

  controller.update(0.016, gameStateAt(1, obstacles));
  assert.equal(encounter.started, 0);

  for (const head of obstacles.activeEvent.heads) {
    head.x = CONFIG.OBSTACLE_SUBMERGE_END_X + 1;
  }
  obstacles.update(0.1, 1.1, 300, controller.obstacleOptions());
  controller.update(0.016, gameStateAt(1.2, obstacles));

  assert.equal(encounter.started, 1);
});

function spawnAndResolve(obstacles, section) {
  obstacles.spawnTimer = 0;
  obstacles.update(0.01, 0, 300, section.obstacleOptions());
  for (const head of obstacles.activeEvent.heads) {
    head.x = CONFIG.OBSTACLE_SUBMERGE_END_X + 1;
  }
  obstacles.update(0.1, 0.1, 300, section.obstacleOptions());
}

function fakeEncounter(options = {}) {
  return {
    id: options.id ?? "fake",
    type: "scripted",
    exclusive: true,
    pauseNormalSpawns: true,
    postEncounterGraceSeconds: options.postEncounterGraceSeconds ?? 0,
    difficultyStageOnComplete: options.difficultyStageOnComplete ?? null,
    started: 0,
    updated: 0,
    cleaned: 0,
    completeAfterUpdate: options.completeAfterUpdate ?? false,
    complete: false,
    receivedHandoff: null,
    canStart: options.canStart ?? (() => false),
    canStartWithHandoff: options.canStartWithHandoff,
    createHandoffState: options.createHandoffState,
    start(gameState = {}) {
      this.started += 1;
      this.receivedHandoff = gameState.encounterHandoff ?? null;
    },
    update() {
      this.updated += 1;
      if (this.completeAfterUpdate) this.complete = true;
    },
    render() {},
    isComplete() {
      return this.complete;
    },
    cleanup() {
      this.cleaned += 1;
      this.complete = false;
    }
  };
}

function gameStateAt(elapsedSeconds, obstacles = null) {
  return {
    elapsedSeconds,
    elapsedMs: elapsedSeconds * 1000,
    obstacles: obstacles ?? {
      countEncounterObstaclesBySource: () => 0
    }
  };
}
