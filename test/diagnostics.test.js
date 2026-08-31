import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import {
  DiagnosticsSink,
  createDiagnosticsReport
} from "../src/diagnostics.js";
import { EncounterManager } from "../src/encounterManager.js";
import { ObstacleManager } from "../src/obstacles.js";
import { CoolerFishermanEncounter } from "../src/coolerFishermanEncounter.js";
import { calculateScore } from "../src/scoring.js";

test("diagnostics disabled causes no observable obstacle gameplay changes", () => {
  const plain = new ObstacleManager();
  const observed = new ObstacleManager({ diagnostics: new DiagnosticsSink() });

  plain.spawnTimer = 0;
  observed.spawnTimer = 0;

  const plainDodged = plain.update(0.016, 0, 300, { difficultyStage: 0 });
  const observedDodged = observed.update(0.016, 0, 300, { difficultyStage: 0 });

  assert.equal(observed.diagnostics.events.length, 0);
  assert.equal(observedDodged, plainDodged);
  assert.deepEqual(snapshotObstacles(observed), snapshotObstacles(plain));
});

test("diagnostics operate safely when no diagnostics window is open", () => {
  const diagnostics = new DiagnosticsSink({
    channelFactory() {
      throw new Error("no window");
    }
  });

  diagnostics.enable();
  diagnostics.startRun();
  diagnostics.emit("diagnostics.warning", { message: "captured" });

  assert.equal(diagnostics.events.length, 3);
  assert.equal(diagnostics.events[2].payload.message, "captured");
});

test("diagnostic events have ordered monotonically increasing sequence IDs", () => {
  const diagnostics = enabledDiagnostics();
  diagnostics.startRun();
  diagnostics.emit("custom.one", { elapsedSeconds: 1 });
  diagnostics.emit("custom.two", { elapsedSeconds: 2 });

  assert.deepEqual(diagnostics.events.map((event) => event.sequence), [1, 2, 3, 4]);
  assert.equal(Object.isFrozen(diagnostics.events[0]), true);
});

test("restart creates separate diagnostic run IDs", () => {
  const diagnostics = enabledDiagnostics();
  const first = diagnostics.startRun();
  diagnostics.restart({ elapsedSeconds: 3 });
  const second = diagnostics.startRun();

  assert.notEqual(first, second);
  assert.equal(diagnostics.events[0].runId, second);
});

test("diagnostics enabled preserves deterministic gameplay outcomes", () => {
  const disabled = runDeterministicScenario(new DiagnosticsSink());
  const enabled = runDeterministicScenario(enabledDiagnostics());

  assert.deepEqual(enabled.gameplay, disabled.gameplay);
  assert.deepEqual(enabled.subsequentPatternIds, disabled.subsequentPatternIds);
  assert.equal(enabled.diagnosticEventCount > 0, true);
});

test("repeated encounter types receive separate occurrence IDs", () => {
  const diagnostics = enabledDiagnostics();
  diagnostics.startRun();
  const manager = new EncounterManager({ diagnostics });
  const first = fakeEncounter({ id: "repeat", canStart: () => true, completeAfterUpdate: true });
  const second = fakeEncounter({ id: "repeat", type: "scripted", canStart: () => true, completeAfterUpdate: true });
  manager.register(first);
  manager.register(second);
  manager.scheduleRegisteredEncounters();

  const scheduledIds = diagnostics.events
    .filter((event) => event.type === "encounter.scheduled" && event.encounterType === "repeat")
    .map((event) => event.occurrenceId);

  assert.equal(scheduledIds.length, 2);
  assert.notEqual(scheduledIds[0], scheduledIds[1]);
});

test("two back-to-back instances of the same encounter type can be reported distinctly", () => {
  const diagnostics = enabledDiagnostics();
  diagnostics.startRun();
  const manager = new EncounterManager({ diagnostics });
  manager.register(fakeEncounter({ id: "repeat", type: "scripted", canStart: (state) => state.elapsedMs >= 10, completeAfterUpdate: true }));
  manager.register(fakeEncounter({ id: "repeat", type: "scripted", canStart: (state) => state.elapsedMs >= 20, completeAfterUpdate: true }));
  manager.scheduleRegisteredEncounters();

  manager.update(0.016, gameStateAt(10));
  manager.update(0.016, gameStateAt(11));
  manager.update(0.016, gameStateAt(20));

  const activated = diagnostics.events.filter((event) => event.type === "encounter.activated");
  assert.equal(activated.length, 2);
  assert.notEqual(activated[0].occurrenceId, activated[1].occurrenceId);
});

test("back-to-back same-type encounters keep fresh state and correct ownership", () => {
  const diagnostics = enabledDiagnostics();
  diagnostics.startRun();
  const obstacles = new ObstacleManager({ diagnostics });
  const manager = new EncounterManager({ diagnostics });
  const first = objectEncounter("repeat", "first-object", { postEncounterGraceSeconds: 0.05 });
  const second = objectEncounter("repeat", "second-object");
  manager.register(first);
  manager.register(second);
  manager.scheduleRegisteredEncounters();

  manager.update(0.016, gameStateAt(10, obstacles));
  obstacles.update(0.016, 0.01, 300, { pauseSpawns: manager.shouldPauseNormalSpawns(), pauseOwner: diagnostics.occurrenceId(manager.activeEncounter) });
  manager.update(0.016, gameStateAt(11, obstacles));
  obstacles.update(0.016, 0.02, 300, { pauseSpawns: manager.shouldPauseNormalSpawns(), pauseOwner: null });
  manager.update(0.05, gameStateAt(61, obstacles));
  obstacles.update(0.016, 0.07, 300, { pauseSpawns: manager.shouldPauseNormalSpawns(), pauseOwner: null });
  manager.update(0.016, gameStateAt(70, obstacles));
  obstacles.update(0.016, 0.08, 300, { pauseSpawns: manager.shouldPauseNormalSpawns(), pauseOwner: diagnostics.occurrenceId(manager.activeEncounter) });
  manager.update(0.016, gameStateAt(71, obstacles));

  const activated = diagnostics.events.filter((event) => event.type === "encounter.activated");
  const completed = diagnostics.events.filter((event) => event.type === "encounter.completed");
  const cleanupFinished = diagnostics.events.filter((event) => event.type === "encounter.cleanup_finished");
  const objectOwners = diagnostics.events
    .filter((event) => event.type === "object.created")
    .map((event) => event.owner);

  assert.equal(first.starts, 1);
  assert.equal(first.completions, 1);
  assert.equal(first.cleanups, 1);
  assert.equal(second.starts, 1);
  assert.equal(second.completions, 1);
  assert.equal(obstacles.countEncounterObstaclesBySource("repeat"), 0);
  assert.equal(activated.length, 2);
  assert.equal(completed.length, 2);
  assert.equal(new Set(activated.map((event) => event.occurrenceId)).size, 2);
  assert.deepEqual(objectOwners, activated.map((event) => event.occurrenceId));
  assert.equal(cleanupFinished.every((event) => event.payload.remainingOwnedObjects === 0), true);
  assert.deepEqual(
    diagnostics.events.filter((event) => event.type.startsWith("normal_spawn.")).map((event) => event.type),
    ["normal_spawn.suppressed", "normal_spawn.restored", "normal_spawn.suppressed"]
  );
  assert.equal(createDiagnosticsReport([...diagnostics.events, gameOverEvent(diagnostics)]).summary.maxActiveEncounters, 1);
});

test("phase transitions are recorded", () => {
  const diagnostics = enabledDiagnostics();
  diagnostics.startRun();
  const manager = new EncounterManager({ diagnostics });
  manager.register(fakeEncounter({ canStart: () => true, phases: ["entering", "moving-to-lane"] }));
  manager.scheduleRegisteredEncounters();

  manager.update(0.016, gameStateAt(1000));
  manager.update(0.016, gameStateAt(1016));

  assert.deepEqual(
    diagnostics.events.filter((event) => event.type === "encounter.phase_transition").map((event) => event.payload.to),
    ["entering", "moving-to-lane"]
  );
});

test("one-active-encounter enforcement violations are reported as failures", () => {
  const diagnostics = enabledDiagnostics();
  diagnostics.startRun();
  diagnostics.emit("encounter.activated", { occurrenceId: "enc-1", encounterType: "first" });
  diagnostics.emit("encounter.activated", { occurrenceId: "enc-2", encounterType: "second" });

  const report = createDiagnosticsReport(diagnostics.events);

  assert.equal(report.summary.result, "FAIL");
  assert.equal(report.invariantResults.find((check) => check.name.startsWith("No more")).status, "fail");
});

test("normal-spawn suppression and restoration are reported", () => {
  const diagnostics = enabledDiagnostics();
  diagnostics.startRun();
  const obstacles = new ObstacleManager({ diagnostics });

  obstacles.update(0.016, 1, 300, { pauseSpawns: true, pauseOwner: "enc-1" });
  obstacles.update(0.016, 2, 300, { pauseSpawns: false });

  assert.deepEqual(
    diagnostics.events.filter((event) => event.type.startsWith("normal_spawn.")).map((event) => event.type),
    ["normal_spawn.suppressed", "normal_spawn.restored"]
  );
});

test("post-encounter grace start and end are reported", () => {
  const diagnostics = enabledDiagnostics();
  diagnostics.startRun();
  const manager = new EncounterManager({ diagnostics });
  manager.register(fakeEncounter({ canStart: () => true, completeAfterUpdate: true, postEncounterGraceSeconds: 0.25 }));
  manager.scheduleRegisteredEncounters();

  manager.update(0.016, gameStateAt(1000));
  manager.update(0.016, gameStateAt(1016));
  manager.update(0.25, gameStateAt(1266));

  assert.deepEqual(
    diagnostics.events.filter((event) => event.type.startsWith("encounter.grace_")).map((event) => event.type),
    ["encounter.grace_started", "encounter.grace_ended"]
  );
});

test("cooler rowboat item row matching is recorded", () => {
  const diagnostics = enabledDiagnostics();
  diagnostics.startRun();
  const encounter = new CoolerFishermanEncounter(() => 0);
  encounter.start({ diagnostics, occurrenceId: "enc-cooler", elapsedSeconds: 12 });
  encounter.activeWave = {
    pattern: "test-pattern",
    items: [{ item: { id: "bottle" }, row: 2 }]
  };

  encounter.releasePlannedItem({ item: encounter.activeWave.items[0].item, row: 2 });

  const release = diagnostics.events.find((event) => event.type === "object.rowboat_release");
  assert.equal(release.payload.rowboatRow, 2);
  assert.equal(release.payload.releasedItemRow, 2);
});

test("report returns PASS for a fully observed valid run", () => {
  const report = createDiagnosticsReport(validRunEvents());

  assert.equal(report.summary.result, "PASS");
  assert.equal(report.invariantResults.filter((check) => check.status === "fail").length, 0);
});

test("report returns INCOMPLETE when capture ends before game over", () => {
  const report = createDiagnosticsReport(validRunEvents().filter((event) => event.type !== "game.over"));

  assert.equal(report.summary.result, "INCOMPLETE");
});

test("report detects duplicate completion", () => {
  const events = validRunEvents();
  events.splice(-1, 0, diagnosticEvent(9, "encounter.completed", { occurrenceId: "enc-1", encounterType: "repeat", owner: "enc-1" }));

  const report = createDiagnosticsReport(events);

  assert.equal(report.summary.result, "FAIL");
  assert.equal(report.invariantResults.find((check) => check.name === "Each occurrence completes at most once").status, "fail");
});

test("report detects duplicate dodge scoring", () => {
  const events = validRunEvents();
  events.splice(-1, 0, diagnosticEvent(9, "object.dodge_awarded", { objectId: "obj-1", objectType: "rowboat-item", owner: "enc-1" }));

  const report = createDiagnosticsReport(events);

  assert.equal(report.summary.result, "FAIL");
  assert.equal(report.summary.duplicateScoringCount, 1);
});

test("report detects rowboat/item row mismatch", () => {
  const events = validRunEvents();
  events[3] = diagnosticEvent(4, "object.rowboat_release", {
    occurrenceId: "enc-1",
    encounterType: "repeat",
    objectId: "obj-1",
    objectType: "rowboat-item",
    owner: "enc-1",
    rowboatRow: 3,
    releasedItemRow: 2
  });

  const report = createDiagnosticsReport(events);

  assert.equal(report.summary.result, "FAIL");
  assert.equal(report.summary.rowMismatchCount, 1);
});

test("report detects normal-spawn suppression violation", () => {
  const events = validRunEvents();
  events.splice(-1, 0, diagnosticEvent(9, "normal_spawn.violation", { owner: "enc-1" }));

  const report = createDiagnosticsReport(events);

  assert.equal(report.summary.result, "FAIL");
  assert.equal(report.summary.normalSpawnViolationCount, 1);
});

test("report detects leaked owned objects", () => {
  const events = validRunEvents();
  events[9] = diagnosticEvent(10, "encounter.cleanup_finished", {
    occurrenceId: "enc-1",
    encounterType: "repeat",
    owner: "enc-1",
    remainingOwnedObjects: 1
  });

  const report = createDiagnosticsReport(events);

  assert.equal(report.summary.result, "FAIL");
  assert.equal(report.summary.leakedObjectCount, 1);
});

test("report exposes valid JSON shape and required readable text sections", () => {
  const report = createDiagnosticsReport(validRunEvents());
  const json = JSON.parse(JSON.stringify(report));

  assert.ok(json.metadata);
  assert.ok(json.config);
  assert.ok(json.summary);
  assert.ok(Array.isArray(json.invariantResults));
  assert.ok(Array.isArray(json.encounterRecords));
  assert.ok(Array.isArray(json.objectRecords));
  assert.ok(Array.isArray(json.events));
  for (const section of [
    "Game version:",
    "Schema version:",
    "Encounter timeline:",
    "Per-encounter object totals:",
    "Warnings and invariant violations:",
    "Checks not observed:",
    "Final result:"
  ]) {
    assert.match(report.text, new RegExp(section));
  }
});

test("unobservable cleanup details are reported as not observed", () => {
  const events = validRunEvents();
  events[9] = diagnosticEvent(10, "encounter.cleanup_finished", {
    occurrenceId: "enc-1",
    encounterType: "repeat",
    owner: "enc-1",
    remainingOwnedObjects: "not observed"
  });

  const report = createDiagnosticsReport(events);

  assert.equal(
    report.invariantResults.find((check) => check.name === "Cleanup leaves no owned gameplay objects behind").status,
    "not_observed"
  );
  assert.match(report.text, /not observed/);
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
    difficultyStageOnComplete: null,
    startTimeMs: null,
    phase: options.phases?.[0] ?? "entering",
    updated: 0,
    complete: false,
    canStart: options.canStart ?? (() => false),
    start() {
      this.phase = options.phases?.[0] ?? "entering";
      options.onStart?.(this);
    },
    update() {
      this.updated += 1;
      if (options.phases?.[this.updated]) this.phase = options.phases[this.updated];
      if (options.completeAfterUpdate) this.complete = true;
    },
    render() {},
    isComplete() {
      return this.complete;
    },
    cleanup() {
      this.complete = false;
    }
  };
}

function gameStateAt(elapsedMs, obstacles = null) {
  return {
    elapsedMs,
    elapsedSeconds: elapsedMs / 1000,
    obstacles: obstacles ?? {
      countEncounterObstaclesBySource: () => 0
    }
  };
}

function snapshotObstacles(manager) {
  return {
    activeEvents: manager.activeEvents.map((event) => ({
      type: event.type,
      patternId: event.patternId,
      heads: event.heads.map((head) => ({
        x: head.x,
        y: head.y,
        row: head.row,
        resolved: head.resolved,
        counted: head.counted
      }))
    })),
    encounterObstacles: manager.encounterObstacles,
    spawnTimer: manager.spawnTimer
  };
}

function runDeterministicScenario(diagnostics) {
  if (diagnostics.enabled) diagnostics.startRun();
  const obstacles = new ObstacleManager({ diagnostics });
  const manager = new EncounterManager({ diagnostics });
  const started = [];
  manager.register(fakeEncounter({
    id: "deterministic-first",
    canStart: (state) => state.elapsedMs >= 10,
    completeAfterUpdate: true,
    onStart: (encounter) => started.push(encounter.id)
  }));
  manager.register(fakeEncounter({
    id: "deterministic-second",
    type: "scripted",
    canStart: (state) => state.elapsedMs >= 30,
    completeAfterUpdate: true,
    onStart: (encounter) => started.push(encounter.id)
  }));
  manager.scheduleRegisteredEncounters();

  const ticks = [0, 10, 11, 20, 30, 31, 40, 600, 1200, 1800, 2400];
  let headsDodged = 0;
  const collisionOutcomes = [];
  const patternSelections = [];
  const spawnedObjects = [];
  for (const elapsedMs of ticks) {
    const gameState = gameStateAt(elapsedMs, obstacles);
    manager.update(0.05, gameState);
    patternSelections.push(obstacles.scheduler.peekPattern(manager.difficultyStage)?.id ?? null);
    headsDodged += obstacles.update(0.05, elapsedMs / 1000, 300, {
      pauseSpawns: manager.shouldPauseNormalSpawns(),
      difficultyStage: manager.difficultyStage,
      pauseOwner: diagnostics.enabled && manager.activeEncounter ? diagnostics.occurrenceId(manager.activeEncounter) : null
    });
    collisionOutcomes.push(false);
    spawnedObjects.push(snapshotObstacles(obstacles));
  }

  return {
    gameplay: {
      started,
      difficultyStage: manager.difficultyStage,
      completed: manager.completedEncounterIds.size,
      activeEncounter: manager.activeEncounter?.id ?? null,
      headsDodged,
      finalScore: calculateScore(ticks.at(-1) / 1000, headsDodged),
      patternSelections,
      spawnedObjects,
      collisionOutcomes
    },
    subsequentPatternIds: [
      obstacles.scheduler.nextPattern(manager.difficultyStage)?.id,
      obstacles.scheduler.nextPattern(manager.difficultyStage)?.id
    ],
    diagnosticEventCount: diagnostics.events.length
  };
}

function objectEncounter(id, assetKey, { postEncounterGraceSeconds = 0 } = {}) {
  return {
    id,
    type: "scripted",
    exclusive: true,
    pauseNormalSpawns: true,
    postEncounterGraceSeconds,
    difficultyStageOnComplete: null,
    startTimeMs: null,
    starts: 0,
    updates: 0,
    completions: 0,
    cleanups: 0,
    complete: false,
    occurrenceId: null,
    canStart: (state) => state.elapsedMs >= (assetKey === "first-object" ? 10 : 70),
    start(gameState) {
      this.starts += 1;
      this.updates = 0;
      this.complete = false;
      this.occurrenceId = gameState.occurrenceId;
      gameState.obstacles.addObstacle({
        source: this.id,
        diagnosticsOwner: this.occurrenceId,
        occurrenceId: this.occurrenceId,
        diagnosticsObjectId: `${this.occurrenceId}-${assetKey}`,
        elapsedSeconds: gameState.elapsedSeconds,
        assetKey,
        x: 260,
        y: 260,
        row: 1,
        width: 10,
        height: 10,
        speed: 1000
      });
    },
    update(dt, gameState) {
      this.updates += 1;
      gameState.obstacles.updateEncounterObstacles(1, gameState.elapsedSeconds);
      if (!this.complete) {
        this.completions += 1;
        this.complete = true;
      }
    },
    render() {},
    isComplete() {
      return this.complete;
    },
    cleanup(gameState) {
      this.cleanups += 1;
      gameState?.obstacles?.clearEncounterObstaclesBySource?.(this.id);
    }
  };
}

function validRunEvents() {
  return [
    diagnosticEvent(1, "game.start", {
      config: {
        encountersEnabled: true,
        encounterSequence: [{ id: "repeat" }]
      },
      encounterSequence: [{ id: "repeat" }],
      deterministicSeed: null
    }),
    diagnosticEvent(2, "encounter.scheduled", { occurrenceId: "enc-1", encounterType: "repeat", owner: "enc-1" }),
    diagnosticEvent(3, "encounter.activated", { occurrenceId: "enc-1", encounterType: "repeat", owner: "enc-1" }),
    diagnosticEvent(4, "encounter.phase_transition", { occurrenceId: "enc-1", encounterType: "repeat", owner: "enc-1", from: "inactive", to: "entering" }),
    diagnosticEvent(5, "object.created", { occurrenceId: "enc-1", encounterType: "repeat", objectId: "obj-1", objectType: "rowboat-item", owner: "enc-1", row: 2 }),
    diagnosticEvent(6, "object.rowboat_release", { occurrenceId: "enc-1", encounterType: "repeat", objectId: "obj-1", objectType: "rowboat-item", owner: "enc-1", rowboatRow: 2, releasedItemRow: 2 }),
    diagnosticEvent(7, "object.dodge_awarded", { objectId: "obj-1", objectType: "rowboat-item", owner: "enc-1" }),
    diagnosticEvent(8, "object.removed", { objectId: "obj-1", objectType: "rowboat-item", owner: "enc-1", reason: "dodged" }),
    diagnosticEvent(9, "encounter.completed", { occurrenceId: "enc-1", encounterType: "repeat", owner: "enc-1" }),
    diagnosticEvent(10, "encounter.cleanup_finished", { occurrenceId: "enc-1", encounterType: "repeat", owner: "enc-1", remainingOwnedObjects: 0 }),
    diagnosticEvent(11, "game.over", { finalScore: 500, headsDodged: 1, survivalTime: 5 })
  ];
}

function gameOverEvent(diagnostics) {
  return {
    schemaVersion: "surf-run-diagnostics-v1",
    gameVersion: "v0.4.1",
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

function diagnosticEvent(sequence, type, payload = {}) {
  return {
    schemaVersion: "surf-run-diagnostics-v1",
    gameVersion: "v0.4.1",
    runId: "run-test",
    sequence,
    elapsedSeconds: sequence / 10,
    type,
    occurrenceId: payload.occurrenceId ?? null,
    encounterType: payload.encounterType ?? null,
    objectId: payload.objectId ?? null,
    objectType: payload.objectType ?? null,
    owner: payload.owner ?? null,
    payload: stripEnvelope(payload)
  };
}

function stripEnvelope(payload) {
  const {
    occurrenceId,
    encounterType,
    objectId,
    objectType,
    owner,
    ...rest
  } = payload;
  return rest;
}
