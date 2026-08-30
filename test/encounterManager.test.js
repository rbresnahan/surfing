import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG, encounterConfig } from "../src/config.js";
import { EncounterManager } from "../src/encounterManager.js";
import { registerConfiguredEncounters } from "../src/encounterRegistry.js";

test("manager starts an eligible encounter through the lifecycle contract", () => {
  const manager = new EncounterManager();
  const encounter = fakeEncounter({ canStart: () => true });
  manager.register(encounter);

  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS));

  assert.equal(encounter.started, 1);
  assert.equal(encounter.updated, 0);
  assert.equal(manager.activeEncounter, encounter);
});

test("manager updates and cleans up a completed encounter", () => {
  const manager = new EncounterManager();
  const encounter = fakeEncounter({ canStart: () => true, completeAfterUpdate: true });
  manager.register(encounter);

  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS));
  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS + 16));

  assert.equal(encounter.updated, 1);
  assert.equal(encounter.cleaned, 1);
  assert.equal(manager.activeEncounter, null);
});

test("difficulty advances only after successful encounter completion", () => {
  const manager = new EncounterManager();
  const fisherman = fakeEncounter({
    id: "angry-fisherman",
    canStart: () => true,
    completeAfterUpdate: true,
    difficultyStageOnComplete: 1
  });
  const cooler = fakeEncounter({
    id: "angry-fisherman-cooler",
    type: "scripted",
    canStart: () => true,
    completeAfterUpdate: true,
    difficultyStageOnComplete: 2
  });
  manager.register(fisherman);
  manager.register(cooler);

  assert.equal(manager.difficultyStage, 0);
  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS));
  assert.equal(manager.difficultyStage, 0);
  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS + 16));
  assert.equal(manager.difficultyStage, 1);

  manager.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS));
  manager.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS + 16));
  assert.equal(manager.difficultyStage, 2);
});

test("configured rowboat encounters activate in their configured order", () => {
  const manager = new EncounterManager();
  const started = [];
  const first = fakeEncounter({
    id: "angry-fisherman",
    startTimeMs: encounterConfig("angry-fisherman").startTimeMs,
    difficultyStageOnComplete: 1,
    canStart(state) {
      return state.elapsedMs >= this.startTimeMs;
    },
    completeAfterUpdate: true,
    onStart: (encounter) => started.push(encounter.id)
  });
  const second = fakeEncounter({
    id: "angry-fisherman-cooler",
    type: "scripted",
    startTimeMs: encounterConfig("angry-fisherman-cooler").startTimeMs,
    difficultyStageOnComplete: 2,
    canStart(state) {
      return state.elapsedMs >= this.startTimeMs;
    },
    onStart: (encounter) => started.push(encounter.id)
  });
  manager.register(first);
  manager.register(second);

  manager.update(0.016, gameStateAt(first.startTimeMs));
  manager.update(0.016, gameStateAt(first.startTimeMs + 16));
  manager.update(0.016, gameStateAt(second.startTimeMs));

  assert.deepEqual(started, ["angry-fisherman", "angry-fisherman-cooler"]);
  assert.equal(manager.activeEncounter, second);
  assert.equal(manager.difficultyStage, 1);
});

test("restart resets run-scoped difficulty and encounter state", () => {
  const manager = new EncounterManager();
  manager.difficultyStage = 2;
  manager.completedEncounterIds.add("angry-fisherman");

  manager.reset();

  assert.equal(manager.difficultyStage, 0);
  assert.equal(manager.completedEncounterIds.size, 0);
  assert.equal(manager.activeEncounter, null);
});

test("only one major encounter can start per run", () => {
  const manager = new EncounterManager();
  const first = fakeEncounter({ id: "first", canStart: () => true, completeAfterUpdate: true });
  const second = fakeEncounter({ id: "second", canStart: () => true });
  manager.register(first);
  manager.register(second);

  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS));
  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS + 16));
  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS + 32));

  assert.equal(first.started, 1);
  assert.equal(second.started, 0);
  assert.equal(manager.activeEncounter, null);
});

test("a later scripted encounter can start after the first major encounter completes", () => {
  const manager = new EncounterManager();
  const first = fakeEncounter({ id: "first", canStart: () => true, completeAfterUpdate: true });
  const second = fakeEncounter({ id: "second", type: "scripted", canStart: (state) => state.elapsedMs >= CONFIG.COOLER_ENCOUNTER_TIME_MS });
  manager.register(first);
  manager.register(second);

  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS));
  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS + 16));
  manager.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS));

  assert.equal(first.started, 1);
  assert.equal(second.started, 1);
  assert.equal(manager.activeEncounter, second);
});

test("normal spawns are paused only when the active encounter requests it", () => {
  const manager = new EncounterManager();
  const encounter = fakeEncounter({ canStart: () => true, pauseNormalSpawns: true });
  manager.register(encounter);

  assert.equal(manager.shouldPauseNormalSpawns(), false);
  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS));
  assert.equal(manager.shouldPauseNormalSpawns(), true);
});

test("an encounter cannot start while another encounter is active", () => {
  const manager = new EncounterManager();
  const first = fakeEncounter({ id: "first", type: "scripted", canStart: () => true });
  const second = fakeEncounter({ id: "second", type: "scripted", canStart: () => true });
  manager.register(first);
  manager.register(second);

  manager.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS));
  manager.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS + 16));

  assert.equal(first.started, 1);
  assert.equal(first.updated, 1);
  assert.equal(second.started, 0);
  assert.equal(manager.activeEncounter, first);
});

test("normal obstacle spawning pauses during either configured rowboat encounter", () => {
  const manager = new EncounterManager();
  const first = fakeEncounter({
    id: "angry-fisherman",
    canStart: () => true,
    pauseNormalSpawns: true,
    completeAfterUpdate: true
  });
  const second = fakeEncounter({
    id: "angry-fisherman-cooler",
    type: "scripted",
    canStart: () => true,
    pauseNormalSpawns: true
  });
  manager.register(first);
  manager.register(second);

  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS));
  assert.equal(manager.shouldPauseNormalSpawns(), true);

  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS + 16));
  manager.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS));
  assert.equal(manager.activeEncounter, second);
  assert.equal(manager.shouldPauseNormalSpawns(), true);
});

test("normal spawns remain paused during a completed encounter's grace period", () => {
  const manager = new EncounterManager();
  const encounter = fakeEncounter({
    canStart: () => true,
    completeAfterUpdate: true,
    pauseNormalSpawns: true,
    postEncounterGraceSeconds: 0.9
  });
  manager.register(encounter);

  manager.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS));
  manager.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS + 16));

  assert.equal(manager.activeEncounter, null);
  assert.equal(manager.shouldPauseNormalSpawns(), true);

  manager.update(0.4, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS + 416));
  assert.equal(manager.shouldPauseNormalSpawns(), true);

  manager.update(0.5, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS + 916));
  assert.equal(manager.shouldPauseNormalSpawns(), false);
});

test("shared post-encounter grace works after either encounter", () => {
  for (const id of ["angry-fisherman", "angry-fisherman-cooler"]) {
    const manager = new EncounterManager();
    const encounter = fakeEncounter({
      id,
      type: "scripted",
      canStart: () => true,
      completeAfterUpdate: true,
      pauseNormalSpawns: true,
      postEncounterGraceSeconds: 0.25
    });
    manager.register(encounter);

    manager.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS));
    manager.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS + 16));
    assert.equal(manager.shouldPauseNormalSpawns(), true);

    manager.update(0.25, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS + 266));
    assert.equal(manager.shouldPauseNormalSpawns(), false);
  }
});

test("reset cleans every encounter and restores the configured ordering", () => {
  const started = [];
  const manager = new EncounterManager();
  const first = fakeEncounter({
    id: "angry-fisherman",
    canStart: () => true,
    completeAfterUpdate: true,
    onStart: (encounter) => started.push(encounter.id)
  });
  const second = fakeEncounter({
    id: "angry-fisherman-cooler",
    type: "scripted",
    canStart: () => true,
    onStart: (encounter) => started.push(encounter.id)
  });
  manager.register(first);
  manager.register(second);

  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS));
  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS + 16));
  manager.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS));
  manager.reset();
  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS));

  assert.deepEqual(started, ["angry-fisherman", "angry-fisherman-cooler", "angry-fisherman"]);
  assert.equal(first.cleaned >= 2, true);
  assert.equal(second.cleaned >= 1, true);
  assert.equal(manager.completedEncounterIds.size, 0);
});

test("completed encounter cleanup removes encounter-owned collision objects", () => {
  const obstacles = {
    encounterObstacles: [{ source: "mock-third" }, { source: "other" }],
    clearEncounterObstaclesBySource(source) {
      this.encounterObstacles = this.encounterObstacles.filter((obstacle) => obstacle.source !== source);
    }
  };
  const manager = new EncounterManager();
  const encounter = fakeEncounter({
    id: "mock-third",
    type: "scripted",
    canStart: () => true,
    completeAfterUpdate: true,
    cleanup(gameState) {
      this.cleaned += 1;
      gameState.obstacles.clearEncounterObstaclesBySource(this.id);
    }
  });
  manager.register(encounter);

  manager.update(0.016, { ...gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS), obstacles });
  manager.update(0.016, { ...gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS + 16), obstacles });

  assert.deepEqual(obstacles.encounterObstacles, [{ source: "other" }]);
});

test("registered encounter factories support a minimal third encounter without main.js branches", () => {
  const manager = new EncounterManager();
  const mockThird = fakeEncounter({
    id: "mock-third",
    type: "scripted",
    canStart: (state) => state.elapsedMs >= 120000
  });

  registerConfiguredEncounters(manager, {
    "mock-third": () => mockThird
  }, [
    { id: "mock-third", startTimeMs: 120000 }
  ]);

  manager.update(0.016, gameStateAt(120000));

  assert.equal(mockThird.started, 1);
  assert.equal(manager.activeEncounter, mockThird);
});

test("same inputs produce the same encounter sequence", () => {
  function runSequence() {
    const manager = new EncounterManager();
    const started = [];
    manager.register(fakeEncounter({
      id: "first",
      canStart: (state) => state.elapsedMs >= 10,
      completeAfterUpdate: true,
      onStart: (encounter) => started.push(encounter.id)
    }));
    manager.register(fakeEncounter({
      id: "second",
      type: "scripted",
      canStart: (state) => state.elapsedMs >= 20,
      completeAfterUpdate: true,
      onStart: (encounter) => started.push(encounter.id)
    }));
    for (const elapsedMs of [0, 10, 11, 20, 21, 30]) {
      manager.update(0.016, gameStateAt(elapsedMs));
    }
    return started;
  }

  assert.deepEqual(runSequence(), runSequence());
});

function fakeEncounter(options = {}) {
  return {
    id: options.id ?? "fake",
    type: options.type ?? "major",
    exclusive: true,
    pauseNormalSpawns: options.pauseNormalSpawns ?? false,
    postEncounterGraceSeconds: options.postEncounterGraceSeconds ?? 0,
    difficultyStageOnComplete: options.difficultyStageOnComplete ?? null,
    startTimeMs: options.startTimeMs ?? null,
    started: 0,
    updated: 0,
    cleaned: 0,
    complete: false,
    canStart: options.canStart ?? (() => false),
    start() {
      this.started += 1;
      options.onStart?.(this);
    },
    update() {
      this.updated += 1;
      if (options.completeAfterUpdate) this.complete = true;
    },
    render() {},
    isComplete() {
      return this.complete;
    },
    cleanup() {
      if (options.cleanup) {
        return options.cleanup.apply(this, arguments);
      }
      this.cleaned += 1;
      this.complete = false;
    }
  };
}

function gameStateAt(elapsedMs) {
  return { elapsedMs, elapsedSeconds: elapsedMs / 1000 };
}
