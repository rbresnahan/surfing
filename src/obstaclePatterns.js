import { PATTERN_SCHEDULE } from "./obstacleTuning.js";
import { obstacleRowCount, rowsForOpening } from "./rowGeometry.js";
import { CONFIG } from "./config.js";

export const PATTERN_TIERS = {
  INTRO: 0,
  EASY: 1,
  MEDIUM: 1,
  HARD: 2,
  FINALE: 2
};

export const OBSTACLE_PATTERNS = [
  pattern("opening-single-low", 0, [hit(4, 0, "head")], "single lower-row obstacle"),
  pattern("opening-single-high", 0, [hit(1, 0, "noodle-girl")], "single upper-row obstacle"),
  pattern("opening-single-center", 0, [hit(2, 0, "tube-girl")], "single center obstacle"),
  pattern("opening-pair-wide", 0, [hit(1, 0, "head"), hit(4, 0, "tube-woman")], "wide separated pair"),
  gate("opening-gate-top", 0, [1, 2], "generous high opening", ["head", "noodle-man", "tube-woman", "scuba-man"]),
  gate("opening-gate-bottom", 0, [4, 5], "generous low opening", ["tube-woman", "head", "noodle-girl", "scuba-man"]),
  pattern("single-low", 0, [hit(4, 0, "head")], "legacy single lower-row obstacle"),
  pattern("single-high", 0, [hit(1, 0, "noodle-girl")], "legacy single upper-row obstacle"),
  pattern("single-center", 0, [hit(2, 0, "tube-girl")], "legacy single center obstacle"),
  gate("two-row-gate-top", 0, [1, 2], "legacy high opening", ["head", "noodle-man", "tube-woman", "scuba-man"]),
  gate("two-row-gate-bottom", 0, [4, 5], "legacy low opening", ["tube-woman", "head", "noodle-girl", "scuba-man"]),
  gate("center-gate", 0, [2, 3], "legacy central opening", ["head", "noodle-man", "tube-woman", "scuba-man"]),

  pattern("stage1-alternating-openings", 1, [
    ...rowsForOpening([1, 2]).map((row, index) => hit(row, 0, typeAt(index))),
    ...rowsForOpening([3, 4]).map((row, index) => hit(row, 1.65, typeAt(index + 2)))
  ], "alternating two-row openings"),
  pattern("stage1-same-row-follow", 1, [
    hit(2, 0, "head"),
    hit(2, 1.45, "noodle-man"),
    hit(5, 0, "tube-girl")
  ], "controlled same-row overlap"),
  pattern("stage1-high-low", 1, [
    hit(1, 0, "noodle-girl"),
    hit(4, 1.45, "tube-woman")
  ], "high-to-low transition"),
  pattern("stage1-low-high", 1, [
    hit(4, 0, "tube-girl"),
    hit(1, 1.45, "scuba-man")
  ], "low-to-high transition"),
  pattern("stage1-diagonal", 1, [
    hit(5, 0, "head"),
    hit(3, 1.25, "noodle-man"),
    hit(1, 2.5, "tube-woman")
  ], "simple diagonal weaving"),
  pattern("alternating-gates", 1, [
    ...rowsForOpening([1, 2]).map((row, index) => hit(row, 0, typeAt(index))),
    ...rowsForOpening([3, 4]).map((row, index) => hit(row, 2.2, typeAt(index + 2)))
  ], "legacy alternating gates"),
  pattern("diagonal-weave", 1, [
    ...rowsForOpening([0, 1]).map((row, index) => hit(row, 0, typeAt(index))),
    ...rowsForOpening([1, 2]).map((row, index) => hit(row, 2, typeAt(index + 2))),
    ...rowsForOpening([2, 3]).map((row, index) => hit(row, 4, typeAt(index + 4)))
  ], "legacy diagonal route"),

  pattern("stage2-staggered-diagonal", 2, [
    hit(1, 0, "head"),
    hit(4, 0, "tube-woman")
  ], "wide separated stage-two pair"),
  pattern("stage2-sweeping-staircase", 2, [
    hit(3, 0, "noodle-man")
  ], "single noodle swimmer stage-two reset"),
  pattern("stage2-split-clusters", 2, [
    hit(1, 0, "noodle-girl"),
    hit(4, 1.45, "tube-woman")
  ], "high-to-low stage-two transition"),
  pattern("stage2-dense-gate", 2, [
    hit(4, 0, "tube-girl"),
    hit(1, 1.45, "scuba-man")
  ], "low-to-high stage-two transition"),
  pattern("stage2-long-weave", 2, [
    hit(2, 0, "scuba-man")
  ], "single scuba swimmer reset"),
  pattern("sweeping-staircase", 2, [
    hit(5, 0, "head"),
    hit(3, 1.5, "noodle-man"),
    hit(1, 3, "tube-woman")
  ], "legacy sweeping staircase"),
  pattern("split-clusters", 2, [
    hit(0, 0, "head"),
    hit(1, 0, "noodle-girl"),
    hit(4, 0, "tube-girl"),
    hit(5, 0, "tube-woman"),
    hit(2, 1.05, "scuba-man")
  ], "legacy split clusters"),
  pattern("dense-finale", 2, [
    hit(0, 0, "head"),
    hit(1, 0, "noodle-girl"),
    hit(4, 0, "tube-girl"),
    hit(5, 0, "tube-woman"),
    hit(2, 1.1, "scuba-man"),
    hit(3, 2.2, "head")
  ], "legacy dense gate", { allowOverlap: true })
];

export const PATTERN_BY_ID = Object.fromEntries(OBSTACLE_PATTERNS.map((template) => [template.id, template]));

export function difficultyTierForTime() {
  return PATTERN_TIERS.INTRO;
}

export function eligiblePatternsForStage(stage) {
  return OBSTACLE_PATTERNS.filter((template) => template.stage === stage);
}

export function eligiblePatternsForTime() {
  return eligiblePatternsForStage(0);
}

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
    if (!Number.isInteger(pattern.stage) || pattern.stage < 0) errors.push(`${pattern.id}: invalid stage`);
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

function gate(id, stage, openRows, safeRoute, typeIds) {
  return pattern(id, stage, rowsForOpening(openRows).map((row, index) => hit(row, 0, typeIds[index])), safeRoute);
}

function pattern(id, stage, obstacles, safeRoute, options = {}) {
  return {
    id,
    stage,
    tier: stage,
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

function typeAt(index) {
  return ["head", "noodle-girl", "noodle-man", "scuba-man", "tube-girl", "tube-woman"][index % 6];
}
