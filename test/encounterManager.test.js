import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import { EncounterManager } from "../src/encounterManager.js";

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
  const fisherman = fakeEncounter({ id: "angry-fisherman", canStart: () => true, completeAfterUpdate: true });
  const cooler = fakeEncounter({
    id: "angry-fisherman-cooler",
    type: "scripted",
    canStart: () => true,
    completeAfterUpdate: true
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

function fakeEncounter(options = {}) {
  return {
    id: options.id ?? "fake",
    type: options.type ?? "major",
    exclusive: true,
    pauseNormalSpawns: options.pauseNormalSpawns ?? false,
    postEncounterGraceSeconds: options.postEncounterGraceSeconds ?? 0,
    started: 0,
    updated: 0,
    cleaned: 0,
    complete: false,
    canStart: options.canStart ?? (() => false),
    start() {
      this.started += 1;
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
      this.cleaned += 1;
    }
  };
}

function gameStateAt(elapsedMs) {
  return { elapsedMs, elapsedSeconds: elapsedMs / 1000 };
}
