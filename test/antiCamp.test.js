import test from "node:test";
import assert from "node:assert/strict";
import { AntiCampManager } from "../src/antiCamp.js";
import { CONFIG } from "../src/config.js";

test("passive count increments only when surfer movement is below threshold", () => {
  const surfer = surferAt(320, 300);
  const manager = new AntiCampManager();
  manager.reset(surfer);

  manager.recordNormalObstaclePass(surferAt(320 + CONFIG.ANTI_CAMP_MOVEMENT_THRESHOLD - 1, 300), 1);

  assert.equal(manager.passivePassCount, 1);
  assert.equal(manager.fish, null);
});

test("meaningful movement resets passive count", () => {
  const manager = new AntiCampManager();
  manager.reset(surferAt(320, 300));

  manager.recordNormalObstaclePass(surferAt(321, 300), 1);
  manager.recordNormalObstaclePass(surferAt(321 + CONFIG.ANTI_CAMP_MOVEMENT_THRESHOLD + 1, 300), 2);

  assert.equal(manager.passivePassCount, 0);
  assert.equal(manager.fish, null);
});

test("fish attack triggers after exactly two passive normal obstacle passes", () => {
  const manager = new AntiCampManager();
  const surfer = surferAt(320, 300);
  manager.reset(surfer);

  manager.recordNormalObstaclePass(surferAt(321, 300), 1);
  assert.equal(manager.fish, null);

  manager.recordNormalObstaclePass(surferAt(322, 300), 2);

  assert.ok(manager.fish);
  assert.equal(manager.passivePassCount, 0);
  assert.equal(manager.fish.targetX, 322);
});

test("anti-camp state resets during encounter spawn suppression", () => {
  const manager = new AntiCampManager();
  const surfer = surferAt(320, 300);
  manager.reset(surfer);
  manager.recordNormalObstaclePass(surfer, 1);
  manager.recordNormalObstaclePass(surfer, 2);

  assert.ok(manager.fish);

  manager.update(0.016, 2.1, surfer, { suspended: true });

  assert.equal(manager.fish, null);
  assert.equal(manager.passivePassCount, 0);
  assert.deepEqual(manager.lastPassPosition, surfer);
});

test("fish telegraphs, becomes collidable airborne, then lands as water obstacle", () => {
  const manager = triggeredManager();

  assert.equal(manager.hitboxes().length, 0);

  manager.update(CONFIG.ANTI_CAMP_TELEGRAPH_SECONDS, 3, surferAt(320, 300));

  assert.equal(manager.fish.phase, "airborne");
  assert.equal(manager.hitboxes().length, 1);

  for (let i = 0; i < 30 && manager.fish?.phase !== "landed"; i += 1) {
    manager.update(0.05, 3 + i * 0.05, surferAt(320, 300));
  }

  assert.equal(manager.fish.phase, "landed");
  assert.equal(manager.fish.y, manager.fish.targetY);
});

test("landed fish becomes non-collidable and removable after fade/submerge", () => {
  const manager = triggeredManager();
  manager.update(CONFIG.ANTI_CAMP_TELEGRAPH_SECONDS, 3, surferAt(320, 300));
  while (manager.fish?.phase !== "landed") {
    manager.update(0.05, 3, surferAt(320, 300));
  }

  while (manager.fish) {
    manager.update(0.05, 4, surferAt(320, 300));
  }

  assert.equal(manager.fish, null);
  assert.equal(manager.hitboxes().length, 0);
});

test("fish collision marks active fish resolved without leaking state after reset", () => {
  const manager = triggeredManager();
  manager.update(CONFIG.ANTI_CAMP_TELEGRAPH_SECONDS, 3, surferAt(320, 300));

  manager.markCollided(3.1);

  assert.equal(manager.fish.resolved, true);

  manager.reset(surferAt(360, 320), { reason: "crash" });

  assert.equal(manager.fish, null);
  assert.equal(manager.passivePassCount, 0);
  assert.deepEqual(manager.lastPassPosition, surferAt(360, 320));
});

function triggeredManager() {
  const manager = new AntiCampManager();
  const surfer = surferAt(320, 300);
  manager.reset(surfer);
  manager.recordNormalObstaclePass(surfer, 1);
  manager.recordNormalObstaclePass(surfer, 2);
  return manager;
}

function surferAt(x, y) {
  return { x, y };
}
