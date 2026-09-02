import { PATTERN_SCHEDULE } from "./obstacleTuning.js";
import { obstacleRowCount, rowsForOpening } from "./rowGeometry.js";
import { CONFIG } from "./config.js";

export const OBSTACLE_PATTERNS = [
  pattern("opening-single-low", 1, [hit(4, 0, "head")], "single lower-row obstacle"),
  pattern("opening-single-high", 1, [hit(1, 0, "noodle-girl")], "single upper-row obstacle"),
  pattern("opening-single-center", 1, [hit(2, 0, "tube-girl")], "single center obstacle"),
  pattern("opening-pair-wide", 1, [hit(1, 0, "head"), hit(4, 0, "tube-woman")], "wide separated pair"),
  gate("opening-gate-top", 1, [1, 2], "generous high opening", ["head", "noodle-man", "tube-woman", "scuba-man"]),
  gate("opening-gate-bottom", 1, [4, 5], "generous low opening", ["tube-woman", "head", "noodle-girl", "scuba-man"]),
  gate("center-gate", 2, [2, 3], "central two-row opening", ["head", "noodle-man", "tube-woman", "scuba-man"]),

  pattern("stage1-alternating-openings", 2, [
    ...cascadeRows(rowsForOpening([1, 2]), 0, 0.25, 0),
    ...cascadeRows(rowsForOpening([3, 4]), 1.65, 0.25, 2)
  ], "alternating two-row openings"),
  pattern("stage1-same-row-follow", 2, [
    hit(2, 0, "head"),
    hit(2, 1.45, "noodle-man"),
    hit(5, 0, "tube-girl")
  ], "controlled same-row overlap"),
  pattern("stage1-high-low", 2, [
    hit(1, 0, "noodle-girl"),
    hit(4, 1.45, "tube-woman")
  ], "high-to-low transition"),
  pattern("stage1-low-high", 2, [
    hit(4, 0, "tube-girl"),
    hit(1, 1.45, "scuba-man")
  ], "low-to-high transition"),
  pattern("stage1-diagonal", 2, [
    hit(5, 0, "head"),
    hit(3, 1.25, "noodle-man"),
    hit(1, 2.5, "tube-woman")
  ], "simple diagonal weaving"),

  pattern("stage2-staggered-diagonal", 3, [
    hit(1, 0, "head"),
    hit(4, 0, "tube-woman")
  ], "wide separated stage-two pair"),
  pattern("stage2-sweeping-staircase", 3, [
    hit(3, 0, "noodle-man")
  ], "single noodle swimmer stage-two reset"),
  pattern("stage2-split-clusters", 3, [
    hit(1, 0, "noodle-girl"),
    hit(4, 1.45, "tube-woman")
  ], "high-to-low stage-two transition"),
  pattern("stage2-dense-gate", 3, [
    hit(4, 0, "tube-girl"),
    hit(1, 1.45, "scuba-man")
  ], "low-to-high stage-two transition"),
  pattern("stage2-long-weave", 3, [
    hit(2, 0, "scuba-man")
  ], "single scuba swimmer reset"),
  pattern("sweeping-staircase", 3, [
    hit(5, 0, "head"),
    hit(3, 1.05, "noodle-man"),
    hit(1, 2.1, "tube-woman"),
    hit(2, 3.15, "tube-girl")
  ], "pressured sweeping staircase"),

  pattern("diagonal-weave", 4, [
    ...cascadeRows(rowsForOpening([1, 2]), 0, 0.38, 0),
    ...cascadeRows(rowsForOpening([2, 3]), 1.8, 0.38, 2),
    ...cascadeRows(rowsForOpening([3, 4]), 3.6, 0.38, 4),
    ...cascadeRows(rowsForOpening([4, 5]), 5.4, 0.38, 1)
  ], "advanced diagonal route migration"),
  pattern("split-clusters", 4, [
    hit(0, 0, "head"),
    hit(5, 0, "tube-woman"),
    hit(1, 1.25, "noodle-girl"),
    hit(4, 1.25, "tube-girl"),
    hit(0, 2.5, "noodle-man"),
    hit(5, 2.5, "head"),
    hit(1, 3.75, "tube-woman"),
    hit(4, 3.75, "noodle-girl")
  ], "advanced split upper/lower pressure"),
  pattern("advanced-pressure-release", 4, [
    hit(1, 0, "head"),
    hit(4, 0, "tube-woman"),
    hit(2, 1.15, "noodle-man"),
    hit(5, 1.15, "tube-girl"),
    hit(0, 2.45, "noodle-girl"),
    hit(3, 2.45, "head"),
    hit(4, 3.65, "tube-woman")
  ], "controlled pressure and release"),
  pattern("advanced-route-migration", 4, [
    ...cascadeRows(rowsForOpening([2, 3]), 0, 0.34, 1),
    ...cascadeRows(rowsForOpening([3, 4]), 1.65, 0.34, 3),
    ...cascadeRows(rowsForOpening([4, 5]), 3.3, 0.34, 0),
    ...cascadeRows(rowsForOpening([3, 4]), 4.95, 0.34, 2),
    ...cascadeRows(rowsForOpening([2, 3]), 6.6, 0.34, 4)
  ], "advanced sustained route migration"),

  pattern("dense-finale", 5, [
    ...cascadeRows(rowsForOpening([2, 3]), 0, 0.36, 0),
    hit(1, 1.55, "noodle-man"),
    hit(4, 1.55, "tube-woman"),
    ...cascadeRows(rowsForOpening([3, 4]), 3, 0.36, 2),
    hit(0, 4.55, "head"),
    hit(5, 4.55, "tube-girl"),
    ...cascadeRows(rowsForOpening([1, 2]), 6, 0.36, 4)
  ], "escalated dense swimmer finale"),
  pattern("escalated-cross-pressure", 5, [
    hit(0, 0, "head"),
    hit(1, 0.38, "noodle-girl"),
    hit(5, 1.35, "tube-woman"),
    hit(4, 1.73, "tube-girl"),
    hit(1, 2.7, "noodle-man"),
    hit(2, 3.08, "head"),
    hit(4, 4.05, "tube-woman"),
    hit(5, 4.43, "tube-girl")
  ], "escalated cross-playfield pressure"),
  pattern("escalated-endurance-weave", 5, [
    ...cascadeRows(rowsForOpening([2, 3]), 0, 0.42, 0),
    ...cascadeRows(rowsForOpening([3, 4]), 1.9, 0.42, 2),
    ...cascadeRows(rowsForOpening([4, 5]), 3.8, 0.42, 4),
    ...cascadeRows(rowsForOpening([3, 4]), 5.7, 0.42, 1),
    ...cascadeRows(rowsForOpening([2, 3]), 7.6, 0.42, 3)
  ], "escalated endurance weave")
];

export const PATTERN_BY_ID = Object.fromEntries(OBSTACLE_PATTERNS.map((template) => [template.id, template]));

export function selectPatternForTime() {
  return PATTERN_BY_ID[PATTERN_SCHEDULE[0].patternId];
}

export function instantiatePattern(template) {
  return {
    ...template,
    mirrored: false,
    obstacles: template.obstacles.map((obstacle) => ({ ...obstacle }))
  };
}

export function patternHorizontalDuration(pattern, speed, config = CONFIG) {
  const lastOffset = Math.max(0, ...pattern.obstacles.map((obstacle) => obstacle.timeOffset));
  const travel = (config.WIDTH + config.SPAWN_X_PADDING - config.OBSTACLE_SUBMERGE_END_X) / Math.max(1, speed);
  return lastOffset + travel;
}

export function validatePatternTuning() {
  const errors = [];
  const ids = new Set();
  const scheduledIds = new Set(PATTERN_SCHEDULE.map(({ patternId }) => patternId));

  for (const pattern of OBSTACLE_PATTERNS) {
    if (ids.has(pattern.id)) errors.push(`${pattern.id}: duplicate pattern id`);
    ids.add(pattern.id);
    if (!Number.isInteger(pattern.tier) || pattern.tier < 1) errors.push(`${pattern.id}: invalid tier`);
    for (const obstacle of pattern.obstacles) {
      if (!Number.isInteger(obstacle.row) || obstacle.row < 0 || obstacle.row >= obstacleRowCount()) {
        errors.push(`${pattern.id}: invalid row ${obstacle.row}`);
      }
      if (!obstacle.typeId) errors.push(`${pattern.id}: missing obstacle type`);
    }
  }

  for (const id of scheduledIds) {
    if (!PATTERN_BY_ID[id]) errors.push(`${id}: scheduled pattern is not defined`);
  }

  return { valid: errors.length === 0, errors };
}

function gate(id, tier, openRows, safeRoute, typeIds) {
  return pattern(id, tier, cascadeRows(rowsForOpening(openRows), 0, 0.25, 0, typeIds), safeRoute);
}

function pattern(id, tier, obstacles, safeRoute, options = {}) {
  return {
    id,
    tier,
    obstacles,
    speedMultiplier: options.speedMultiplier ?? 1,
    allowOverlap: options.allowOverlap ?? false,
    safeRoute
  };
}

function hit(row, timeOffset = 0, typeId = "head") {
  return {
    row: Math.max(0, Math.min(obstacleRowCount() - 1, row)),
    timeOffset,
    typeId
  };
}

function cascadeRows(rows, startOffset, stepSeconds, typeStartIndex = 0, typeIds = null) {
  return rows.map((row, index) =>
    hit(row, startOffset + index * stepSeconds, typeIds?.[index] ?? typeAt(typeStartIndex + index))
  );
}

function typeAt(index) {
  return ["head", "noodle-girl", "noodle-man", "scuba-man", "tube-girl", "tube-woman"][index % 6];
}
