import test from "node:test";
import assert from "node:assert/strict";
import { DiagnosticsSink } from "../src/diagnostics.js";
import { CONFIG } from "../src/config.js";
import { ObstacleManager } from "../src/obstacles.js";
import { DIFFICULTY_STAGES, SWIMMER_TIERS, stageTuning, swimmerTier } from "../src/obstacleTuning.js";
import {
  SwimmerSection,
  buildEffectiveTier,
  validateSwimmerSectionDefinition,
  validateSwimmerSections
} from "../src/swimmerSection.js";

test("legacy stages map exactly to swimmer tiers 1 through 3", () => {
  for (const stage of DIFFICULTY_STAGES) {
    const tier = swimmerTier(stage.tier);
    assert.equal(stage.id, tier.legacyStage);
    assert.equal(stage.speed, tier.speed);
    assert.equal(stage.spawnDelaySeconds, tier.spawnDelaySeconds);
    assert.equal(stage.rowRelease, tier.rowRelease);
    assert.equal(stage.releaseProgress, tier.releaseProgress);
    assert.equal(stage.maxActivePerRow, tier.maxActivePerRow);
    assert.deepEqual(stage.schedule, tier.schedule);
  }

  assert.deepEqual(Object.keys(SWIMMER_TIERS), ["1", "2", "3"]);
  assert.equal(stageTuning(0).tier, 1);
  assert.equal(stageTuning(1).tier, 2);
  assert.equal(stageTuning(2).tier, 3);
});

test("pattern-count sections count completed events once and drain before completing", () => {
  const diagnostics = enabledDiagnostics();
  const section = new SwimmerSection({
    id: "count-two",
    tier: 1,
    completion: { type: "patterns", count: 2 }
  }, { diagnostics });
  const obstacles = new ObstacleManager({ diagnostics });
  section.start(0);

  spawnOne(obstacles, section, 0);
  assert.equal(section.patternsSpawned, 1);
  assert.equal(section.patternsCompleted, 0);
  resolveActiveEvent(obstacles, 0);
  obstacles.update(0.1, 1, 300, section.obstacleOptions());
  assert.equal(section.patternsCompleted, 1);
  assert.equal(section.completed, false);

  obstacles.update(section.tier.spawnDelaySeconds, 2, 300, section.obstacleOptions());
  assert.equal(section.patternsSpawned, 2);
  assert.equal(section.draining, true);
  assert.equal(section.completed, false);
  resolveActiveEvent(obstacles, 0);
  obstacles.update(0.1, 3, 300, section.obstacleOptions());

  assert.equal(section.patternsCompleted, 2);
  assert.equal(section.completed, true);
  assert.equal(diagnostics.events.filter((event) => event.type === "swimmer_section.completed").length, 1);
});

test("individual swimmers do not increment the pattern completion counter", () => {
  const section = new SwimmerSection({
    id: "pair-section",
    tier: 1,
    patternIds: ["opening-pair-wide"],
    completion: { type: "patterns", count: 1 }
  });
  const obstacles = new ObstacleManager();
  section.start(0);
  spawnOne(obstacles, section, 0);

  resolveActiveEvent(obstacles, 1);
  obstacles.update(0.1, 1, 300, section.obstacleOptions());
  assert.equal(section.patternsCompleted, 0);
  assert.equal(section.completed, false);

  resolveActiveEvent(obstacles);
  obstacles.update(0.1, 2, 300, section.obstacleOptions());
  assert.equal(section.patternsCompleted, 1);
  assert.equal(section.completed, true);
});

test("active-duration sections start timing on first spawned event and complete after draining", () => {
  const section = new SwimmerSection({
    id: "duration-section",
    tier: 1,
    completion: { type: "activeDuration", seconds: 1 }
  });
  const obstacles = new ObstacleManager();
  section.start(0);

  section.update(0.5, 0.5, obstacles);
  assert.equal(section.activeSeconds, 0);
  assert.equal(section.activeGameplayStarted, false);

  spawnOne(obstacles, section, 1);
  assert.equal(section.activeGameplayStarted, true);
  assert.equal(section.activeSeconds, 0);

  section.update(0.6, 1.6, obstacles);
  assert.equal(section.draining, false);
  section.update(0.4, 2, obstacles);
  assert.equal(section.draining, true);
  assert.equal(section.completed, false);

  resolveActiveEvent(obstacles, 0);
  obstacles.update(0.1, 2.1, 300, section.obstacleOptions());
  assert.equal(section.completed, true);
});

test("same section and tier reset deterministic pattern order", () => {
  const first = firstPatternsForRepeatedSection();
  const second = firstPatternsForRepeatedSection();

  assert.equal(first.length, 2);
  assert.deepEqual(second, first);
});

test("section validation rejects invalid authoring clearly", () => {
  assert.throws(() => validateSwimmerSectionDefinition({
    id: "bad-tier",
    tier: 9,
    completion: { type: "endless" }
  }), /Unknown swimmer tier/);
  assert.throws(() => validateSwimmerSectionDefinition({
    id: "bad-completion",
    tier: 1,
    completion: { type: "later" }
  }), /invalid completion type/);
  assert.throws(() => validateSwimmerSectionDefinition({
    id: "bad-count",
    tier: 1,
    completion: { type: "patterns", count: 0 }
  }), /count must be > 0/);
  assert.throws(() => validateSwimmerSectionDefinition({
    id: "bad-duration",
    tier: 1,
    completion: { type: "activeDuration", seconds: 0 }
  }), /duration seconds must be > 0/);
  assert.throws(() => validateSwimmerSectionDefinition({
    id: "bad-pattern",
    tier: 1,
    patternIds: ["missing"],
    completion: { type: "endless" }
  }), /unknown pattern/);
  assert.throws(() => validateSwimmerSectionDefinition({
    id: "bad-tier-pattern",
    tier: 1,
    patternIds: ["stage1-diagonal"],
    completion: { type: "endless" }
  }), /outside tier/);
  assert.throws(() => validateSwimmerSectionDefinition({
    id: "bad-endless",
    tier: 1,
    completion: { type: "endless", count: 1 }
  }), /endless completion/);
  assert.throws(() => validateSwimmerSections([
    { id: "repeat", tier: 1, completion: { type: "endless" } },
    { id: "repeat", tier: 1, completion: { type: "endless" } }
  ]), /Duplicate swimmer section id/);
});

test("tuning overrides can soften but not exceed a tier envelope", () => {
  const softer = buildEffectiveTier({
    id: "soft-tier-three",
    tier: 3,
    tuning: {
      speed: 240,
      spawnDelaySeconds: 0.8,
      maxActivePerRow: 1,
      releaseProgress: 0.7
    },
    completion: { type: "endless" }
  });

  assert.equal(softer.speed, 240);
  assert.equal(softer.spawnDelaySeconds, 0.8);
  assert.throws(() => buildEffectiveTier({
    id: "too-fast",
    tier: 3,
    tuning: { speed: 300 },
    completion: { type: "endless" }
  }), /speed override exceeds/);
  assert.throws(() => buildEffectiveTier({
    id: "too-soon",
    tier: 3,
    tuning: { spawnDelaySeconds: 0.1 },
    completion: { type: "endless" }
  }), /spawn delay override exceeds/);
});

function enabledDiagnostics() {
  const diagnostics = new DiagnosticsSink({ channelFactory: () => ({ postMessage() {} }) });
  diagnostics.enable();
  diagnostics.startRun();
  return diagnostics;
}

function spawnOne(obstacles, section, elapsedSeconds) {
  obstacles.spawnTimer = 0;
  obstacles.update(0.01, elapsedSeconds, 300, section.obstacleOptions());
  assert.notEqual(obstacles.activeEvent, null);
}

function resolveActiveEvent(obstacles, limit) {
  for (const head of obstacles.activeEvent.heads.slice(0, limit || obstacles.activeEvent.heads.length)) {
    head.x = CONFIG.OBSTACLE_SUBMERGE_END_X + 1;
  }
}

function firstPatternsForRepeatedSection() {
  const section = new SwimmerSection({
    id: "repeat-tier-two",
    tier: 2,
    completion: { type: "patterns", count: 2 }
  });
  const obstacles = new ObstacleManager();
  const ids = [];
  section.start(0);
  for (let i = 0; i < 2; i += 1) {
    spawnOne(obstacles, section, i);
    ids.push(obstacles.activeEvent.patternId);
    resolveActiveEvent(obstacles);
    obstacles.update(0.1, i + 0.5, 300, section.obstacleOptions());
  }
  return ids;
}
