import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG, encounterConfig } from "../src/config.js";
import { DiagnosticsSink, createDiagnosticsReport } from "../src/diagnostics.js";
import { EncounterManager } from "../src/encounterManager.js";
import { ObstacleManager } from "../src/obstacles.js";
import { createEncounterById, encounterCatalog, registerConfiguredEncounters } from "../src/encounterRegistry.js";
import { RunController } from "../src/runController.js";

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

test("encounter completion notifies the run owner without directly advancing swimmer difficulty", () => {
  const completed = [];
  const manager = new EncounterManager({
    onEncounterCompleted: (encounter) => completed.push(encounter.id)
  });
  const fisherman = fakeEncounter({
    id: "angry-fisherman",
    canStart: () => true,
    completeAfterUpdate: true,
    difficultyStageOnComplete: 1
  });

  assert.equal(manager.difficultyStage, 0);
  manager.register(fisherman);
  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS));
  assert.equal(manager.difficultyStage, 0);
  manager.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS + 16));

  assert.deepEqual(completed, ["angry-fisherman"]);
  assert.equal(manager.difficultyStage, 0);
});

test("run controller advances the compatibility swimmer tier after encounter completion", () => {
  const manager = new EncounterManager();
  const runController = new RunController({ encounterManager: manager });
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
  runController.reset();

  assert.equal(manager.difficultyStage, 0);
  runController.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS));
  assert.equal(manager.difficultyStage, 0);
  runController.update(0.016, gameStateAt(CONFIG.FIRST_ENCOUNTER_TIME_MS + 16));
  assert.equal(manager.difficultyStage, 1);

  runController.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS));
  runController.update(0.016, gameStateAt(CONFIG.COOLER_ENCOUNTER_TIME_MS + 16));
  assert.equal(manager.difficultyStage, 2);
  assert.equal(runController.activeSwimmerSection.tierId, 3);
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
  assert.equal(manager.difficultyStage, 0);
});

test("configured encounter sequence contains the cooler toss schedule", () => {
  assert.deepEqual(CONFIG.ENCOUNTER_SEQUENCE.map((entry) => entry.id), [
    "angry-fisherman",
    "angry-fisherman-cooler",
    "angry-fisherman-cooler",
    "angry-fisherman-cooler-toss"
  ]);
  assert.deepEqual(CONFIG.ENCOUNTER_SEQUENCE.map((entry) => entry.startTimeMs ?? null), [
    45000,
    105000,
    138000,
    null
  ]);
  assert.deepEqual(CONFIG.ENCOUNTER_SEQUENCE.map((entry) => entry.difficultyStageOnComplete ?? null), [
    1,
    2,
    2,
    2
  ]);
  assert.equal(CONFIG.ENCOUNTER_SEQUENCE[1].postEncounterGraceSeconds, CONFIG.COOLER_POST_ENCOUNTER_GRACE_SECONDS);
  assert.equal(CONFIG.ENCOUNTER_SEQUENCE[2].handoffToNext, true);
  assert.equal(CONFIG.ENCOUNTER_SEQUENCE[2].immediateSuccessorId, "angry-fisherman-cooler-toss");
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

test("configured duplicate cooler occurrences keep their own start times", () => {
  const created = [];
  const manager = registerConfiguredEncounters(new EncounterManager(), {
    "angry-fisherman-cooler": (entry) => {
      const encounter = fakeEncounter({
        id: entry.id,
        type: "scripted",
        startTimeMs: entry.startTimeMs,
        canStart(state) {
          return state.elapsedMs >= this.startTimeMs;
        }
      });
      created.push(encounter);
      return encounter;
    }
  }, [
    { id: "angry-fisherman-cooler", startTimeMs: 105000 },
    { id: "angry-fisherman-cooler", startTimeMs: 138000 }
  ]);

  assert.deepEqual(created.map((encounter) => encounter.startTimeMs), [105000, 138000]);

  manager.update(0.016, gameStateAt(105000));

  assert.equal(manager.activeEncounter, created[0]);
});

test("configured encounter catalog exposes one developer trigger per encounter type", () => {
  const factories = {
    "repeat": () => fakeEncounter({ id: "repeat" }),
    "other": () => fakeEncounter({ id: "other" })
  };

  assert.deepEqual(encounterCatalog(factories, [
    { id: "repeat", startTimeMs: 10 },
    { id: "repeat", startTimeMs: 20 },
    { id: "other", startTimeMs: 30 }
  ]), [
    { id: "repeat", label: "Repeat" },
    { id: "other", label: "Other" }
  ]);
});

test("manager immediately activates a configured handoff successor without grace", () => {
  const manager = new EncounterManager();
  const first = fakeEncounter({
    id: "first",
    type: "scripted",
    canStart: () => true,
    completeAfterUpdate: true,
    postEncounterGraceSeconds: 1,
    createHandoffState: () => ({
      targetEncounterId: "second",
      boat: { x: 810, y: 320, width: 210 }
    })
  });
  const second = fakeEncounter({
    id: "second",
    type: "scripted",
    canStart: () => false,
    canStartWithHandoff: (handoff) => handoff.targetEncounterId === "second"
  });
  manager.register(first);
  manager.register(second);

  manager.update(0.016, gameStateAt(10));
  manager.update(0.016, gameStateAt(26));

  assert.equal(first.cleaned, 1);
  assert.equal(second.started, 1);
  assert.equal(second.receivedHandoff.boat.x, 810);
  assert.equal(manager.activeEncounter, second);
  assert.equal(manager.postEncounterGraceTimer, 0);
  assert.equal(manager.shouldPauseNormalSpawns(), false);
});

test("manager waits for final cooler dump obstacles to resolve before cooler toss handoff", () => {
  const diagnostics = enabledDiagnostics();
  diagnostics.startRun();
  const obstacles = new ObstacleManager({ diagnostics });
  const manager = registerConfiguredEncounters(new EncounterManager({ diagnostics }), undefined, [
    {
      id: "angry-fisherman-cooler",
      startTimeMs: 0,
      difficultyStageOnComplete: 2,
      handoffToNext: true,
      immediateSuccessorId: "angry-fisherman-cooler-toss"
    },
    {
      id: "angry-fisherman-cooler-toss",
      difficultyStageOnComplete: 2
    }
  ]);
  let elapsedMs = 0;
  let finalDumpCount = 0;

  for (let frame = 0; frame < 900; frame += 1) {
    const state = gameStateAt(elapsedMs);
    state.obstacles = obstacles;
    manager.update(0.05, state);
    obstacles.update(0.05, elapsedMs / 1000, 300, {
      pauseSpawns: manager.shouldPauseNormalSpawns(),
      pauseOwner: diagnostics.occurrenceId(manager.activeEncounter)
    });
    elapsedMs += 50;
    if (
      manager.activeEncounter?.id === "angry-fisherman-cooler" &&
      manager.activeEncounter.completedWaves === 3 &&
      manager.activeEncounter.phase === "between-waves" &&
      obstacles.countEncounterObstaclesBySource("angry-fisherman-cooler") > 0
    ) {
      finalDumpCount = obstacles.countEncounterObstaclesBySource("angry-fisherman-cooler");
      break;
    }
  }

  assert.equal(manager.activeEncounter?.id, "angry-fisherman-cooler");
  assert.equal(manager.activeEncounter?.phase, "between-waves");
  assert.equal(manager.activeEncounter?.isComplete(), false);
  assert.equal(finalDumpCount > 0, true);
  assert.equal(obstacles.activeEvents.length, 0);

  const handoffX = manager.activeEncounter.x;
  const handoffY = manager.activeEncounter.y;
  while (obstacles.countEncounterObstaclesBySource("angry-fisherman-cooler") > 0) {
    const state = gameStateAt(elapsedMs);
    state.obstacles = obstacles;
    manager.update(0.05, state);
    assert.equal(manager.activeEncounter?.id, "angry-fisherman-cooler");
    obstacles.update(0.05, elapsedMs / 1000, 300, {
      pauseSpawns: manager.shouldPauseNormalSpawns(),
      pauseOwner: diagnostics.occurrenceId(manager.activeEncounter)
    });
    elapsedMs += 50;
  }

  const state = gameStateAt(elapsedMs);
  state.obstacles = obstacles;
  manager.update(0.05, state);

  assert.equal(manager.activeEncounter?.id, "angry-fisherman-cooler-toss");
  assert.equal(manager.activeEncounter?.phase, "holding");
  assert.equal(manager.activeEncounter?.x, handoffX);
  assert.equal(manager.activeEncounter?.y, handoffY);
  assert.equal(obstacles.countEncounterObstaclesBySource("angry-fisherman-cooler"), 0);
  assert.equal(obstacles.activeEvents.length, 0);
  assert.equal(diagnostics.events.filter((event) => event.type === "normal_spawn.violation").length, 0);
  assert.equal(createDiagnosticsReport([...diagnostics.events, gameOverEvent(diagnostics)]).summary.maxActiveEncounters, 1);

  const outgoingRemovals = diagnostics.events.filter((event) =>
    event.type === "object.removed" &&
    event.payload.source === "angry-fisherman-cooler"
  );
  assert.equal(outgoingRemovals.length >= finalDumpCount, true);
  assert.equal(outgoingRemovals.every((event) => event.payload.reason === "dodged"), true);
  assert.equal(outgoingRemovals.some((event) => event.payload.reason === "cleanup"), false);

  const dodgeCounts = new Map();
  for (const event of diagnostics.events.filter((event) => event.type === "object.dodge_awarded")) {
    dodgeCounts.set(event.objectId, (dodgeCounts.get(event.objectId) ?? 0) + 1);
  }
  assert.equal([...dodgeCounts.values()].every((count) => count <= 1), true);
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

test("developer trigger disabled rejects without changing normal scheduling", () => {
  const scheduled = fakeEncounter({
    id: "scheduled",
    canStart: (state) => state.elapsedMs >= 10
  });
  const manager = new EncounterManager({
    debugEncounterFactory: () => fakeEncounter({ id: "debug", canStart: () => true })
  });
  manager.register(scheduled);

  const result = manager.triggerDebugEncounter("debug", gameStateAt(0), {
    developerControlsEnabled: false,
    gameRunning: true
  });

  assert.deepEqual(result, { ok: false, reason: "developer-controls-disabled" });
  assert.equal(manager.activeEncounter, null);
  assert.equal(manager.completedEncounterIds.size, 0);

  manager.update(0.016, gameStateAt(10));

  assert.equal(scheduled.started, 1);
  assert.equal(manager.activeEncounter, scheduled);
});

test("developer trigger activates a registered encounter through the lifecycle path", () => {
  const diagnostics = enabledDiagnostics();
  diagnostics.startRun();
  const debugEncounter = fakeEncounter({
    id: "debug",
    pauseNormalSpawns: true
  });
  const manager = new EncounterManager({
    diagnostics,
    debugEncounterFactory: (id) => id === "debug" ? debugEncounter : null
  });

  const result = manager.triggerDebugEncounter("debug", gameStateAt(1000), {
    developerControlsEnabled: true,
    gameRunning: true
  });

  assert.deepEqual(result, { ok: true, reason: "accepted", encounterId: "debug" });
  assert.equal(debugEncounter.started, 1);
  assert.equal(manager.activeEncounter, debugEncounter);
  assert.equal(manager.shouldPauseNormalSpawns(), true);
  assert.equal(diagnostics.events.some((event) => event.type === "encounter.debug_trigger_accepted"), true);
  assert.equal(diagnostics.events.find((event) => event.type === "encounter.activated").payload.source, "debug");
});

test("developer trigger safely rejects unknown encounter ids", () => {
  const manager = new EncounterManager({ debugEncounterFactory: () => null });

  const result = manager.triggerDebugEncounter("missing", gameStateAt(1000), {
    developerControlsEnabled: true,
    gameRunning: true
  });

  assert.deepEqual(result, { ok: false, reason: "unknown-encounter" });
  assert.equal(manager.activeEncounter, null);
  assert.equal(manager.nonScoringDebugRun, false);
});

test("developer trigger rejects while another encounter is active", () => {
  const first = fakeEncounter({ id: "first", canStart: () => true });
  const manager = new EncounterManager({
    debugEncounterFactory: () => fakeEncounter({ id: "second" })
  });
  manager.register(first);
  manager.update(0.016, gameStateAt(10));

  const result = manager.triggerDebugEncounter("second", gameStateAt(20), {
    developerControlsEnabled: true,
    gameRunning: true
  });

  assert.deepEqual(result, { ok: false, reason: "active-encounter" });
  assert.equal(manager.activeEncounter, first);
});

test("developer trigger can repeat the same encounter without scheduled bookkeeping leakage", () => {
  const instances = [];
  const scheduled = fakeEncounter({
    id: "repeat",
    canStart: (state) => state.elapsedMs >= 1000
  });
  const manager = new EncounterManager({
    debugEncounterFactory: (id) => {
      const encounter = fakeEncounter({
        id,
        completeAfterUpdate: true,
        pauseNormalSpawns: true,
        postEncounterGraceSeconds: 0.05,
        difficultyStageOnComplete: 1
      });
      instances.push(encounter);
      return encounter;
    }
  });
  manager.register(scheduled);

  assert.equal(manager.triggerDebugEncounter("repeat", gameStateAt(10), {
    developerControlsEnabled: true,
    gameRunning: true
  }).ok, true);
  manager.update(0.016, gameStateAt(26));
  assert.equal(manager.activeEncounter, null);
  assert.equal(manager.completedEncounterIds.size, 0);
  assert.equal(manager.startedMajorEncounter, false);
  assert.equal(manager.shouldPauseNormalSpawns(), true);

  assert.equal(manager.triggerDebugEncounter("repeat", gameStateAt(30), {
    developerControlsEnabled: true,
    gameRunning: true
  }).ok, true);

  assert.equal(instances.length, 2);
  assert.notEqual(instances[0], instances[1]);
  assert.equal(instances[1].started, 1);
  assert.equal(manager.postEncounterGraceTimer, 0);
  assert.equal(manager.completedEncounterIds.size, 0);

  manager.update(0.016, gameStateAt(46));
  manager.update(0.05, gameStateAt(96));
  manager.update(0.016, gameStateAt(1000));
  assert.equal(scheduled.started, 1);
  assert.equal(manager.completedEncounterIds.size, 0);
});

test("developer trigger rejects when no game is running", () => {
  const manager = new EncounterManager({
    debugEncounterFactory: () => fakeEncounter({ id: "debug" })
  });

  const result = manager.triggerDebugEncounter("debug", gameStateAt(0), {
    developerControlsEnabled: true,
    gameRunning: false
  });

  assert.deepEqual(result, { ok: false, reason: "no-running-game" });
  assert.equal(manager.activeEncounter, null);
});

test("developer trigger marks the run non-scoring while normal runs remain eligible", () => {
  const manager = new EncounterManager({
    debugEncounterFactory: () => fakeEncounter({ id: "debug" })
  });

  assert.equal(manager.nonScoringDebugRun, false);
  manager.triggerDebugEncounter("debug", gameStateAt(0), {
    developerControlsEnabled: true,
    gameRunning: true
  });
  assert.equal(manager.nonScoringDebugRun, true);

  const normalManager = new EncounterManager();
  normalManager.update(0.016, gameStateAt(0));
  assert.equal(normalManager.nonScoringDebugRun, false);
});

test("registered encounter catalog and factory are registry driven", () => {
  const factories = {
    "mock-third": () => fakeEncounter({ id: "mock-third" })
  };
  const sequence = [{ id: "mock-third", startTimeMs: 120000 }];

  assert.deepEqual(encounterCatalog(factories, sequence), [
    { id: "mock-third", label: "Mock Third" }
  ]);
  assert.equal(createEncounterById("mock-third", factories).id, "mock-third");
  assert.equal(createEncounterById("unknown", factories), null);
});

function enabledDiagnostics() {
  const diagnostics = new DiagnosticsSink({
    channelFactory: () => ({ postMessage() {} })
  });
  diagnostics.enable();
  return diagnostics;
}

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
    receivedHandoff: null,
    complete: false,
    canStart: options.canStart ?? (() => false),
    canStartWithHandoff: options.canStartWithHandoff,
    createHandoffState: options.createHandoffState,
    start(gameState = {}) {
      this.started += 1;
      this.receivedHandoff = gameState.encounterHandoff ?? null;
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

function gameOverEvent(diagnostics) {
  return {
    schemaVersion: "surf-run-diagnostics-v1",
    gameVersion: "v0.10.0",
    runId: diagnostics.runId,
    sequence: diagnostics.sequence + 1,
    elapsedSeconds: 1,
    type: "game.over",
    occurrenceId: null,
    encounterType: null,
    objectId: null,
    objectType: null,
    owner: null,
    payload: { finalScore: 500, headsDodged: 1, survivalTime: 1 }
  };
}
