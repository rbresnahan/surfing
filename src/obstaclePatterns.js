import { CONFIG } from "./config.js";
import { mirrorRow, obstacleRowCount, rowsForOpening } from "./rowGeometry.js";

export const PATTERN_TIERS = {
  INTRO: 0,
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
  FINALE: 4
};

export const OBSTACLE_PATTERNS = [
  pattern("single-low", PATTERN_TIERS.INTRO, [hit(4)], "single row, low opening pressure"),
  pattern("single-high", PATTERN_TIERS.INTRO, [hit(1)], "single row, high opening pressure"),
  pattern("single-center", PATTERN_TIERS.INTRO, [hit(2)], "single center obstacle"),
  pattern("separated-pair-wide", PATTERN_TIERS.EASY, [hit(1), hit(4)], "wide separated pair"),
  pattern("separated-pair-edge", PATTERN_TIERS.EASY, [hit(0), hit(5)], "edge pair with central room"),
  gate("two-row-gate-top", PATTERN_TIERS.EASY, [0, 1], "two-row opening near the top"),
  gate("two-row-gate-bottom", PATTERN_TIERS.EASY, [4, 5], "two-row opening near the bottom"),
  gate("center-gate", PATTERN_TIERS.MEDIUM, [2, 3], "central two-row opening"),
  pattern("alternating-gates", PATTERN_TIERS.MEDIUM, [
    ...rowsForOpening([1, 2]).map((row) => hit(row, 0)),
    ...rowsForOpening([3, 4]).map((row) => hit(row, 2.2))
  ], "two readable openings in sequence", { estimatedDuration: 1.25 }),
  pattern("diagonal-weave", PATTERN_TIERS.MEDIUM, [
    ...rowsForOpening([0, 1]).map((row) => hit(row, 0)),
    ...rowsForOpening([1, 2]).map((row) => hit(row, 2)),
    ...rowsForOpening([2, 3]).map((row) => hit(row, 4))
  ], "staggered diagonal route through neighboring rows", { estimatedDuration: 1.35 }),
  pattern("sweeping-staircase", PATTERN_TIERS.HARD, [
    hit(5, 0),
    hit(3, 1.5),
    hit(1, 3)
  ], "moving staircase with a shifting opening", { estimatedDuration: 1.45 }),
  pattern("split-clusters", PATTERN_TIERS.HARD, [
    hit(0, 0),
    hit(1, 0),
    hit(4, 0),
    hit(5, 0),
    hit(2, 1.05)
  ], "edge clusters and a delayed central blocker", { estimatedDuration: 1.4 }),
  pattern("delayed-blocker", PATTERN_TIERS.HARD, [
    ...rowsForOpening([2, 3]).map((row) => hit(row, 0)),
    hit(2, 1.12)
  ], "central gate that changes after a clear delay", { estimatedDuration: 1.55 }),
  pattern("dense-finale", PATTERN_TIERS.FINALE, [
    hit(0, 0),
    hit(1, 0),
    hit(4, 0),
    hit(5, 0),
    hit(2, 1.1),
    hit(3, 2.2)
  ], "dense gate into diagonal transition", { estimatedDuration: 1.8, allowOverlap: true })
];

export const PATTERN_BY_ID = Object.fromEntries(OBSTACLE_PATTERNS.map((template) => [template.id, template]));

export function difficultyTierForTime(seconds, config = CONFIG) {
  const progress = Math.max(0, Math.min(1, seconds / config.DIFFICULTY_RAMP_SECONDS));
  if (progress < 0.16) return PATTERN_TIERS.INTRO;
  if (progress < 0.36) return PATTERN_TIERS.EASY;
  if (progress < 0.62) return PATTERN_TIERS.MEDIUM;
  if (progress < config.PATTERN_OVERLAP_MIN_DIFFICULTY) return PATTERN_TIERS.HARD;
  return PATTERN_TIERS.FINALE;
}

export function eligiblePatternsForTime(seconds, { maxTier = difficultyTierForTime(seconds), includeIds = null } = {}) {
  const ids = includeIds ? new Set(includeIds) : null;
  return OBSTACLE_PATTERNS.filter((template) =>
    template.tier <= maxTier &&
    seconds >= template.minimumEntrySeconds &&
    (!ids || ids.has(template.id))
  );
}

export function selectPatternForTime(seconds, { random = Math.random, previousPatternId = null, includeIds = null } = {}) {
  const eligible = eligiblePatternsForTime(seconds, { includeIds });
  const alternatives = eligible.filter((template) => template.id !== previousPatternId);
  const pool = alternatives.length ? alternatives : eligible;
  return pool[Math.floor(random() * pool.length)] ?? PATTERN_BY_ID["single-center"];
}

export function instantiatePattern(template, { random = Math.random, mirror = null } = {}) {
  const shouldMirror = template.allowMirror && (mirror ?? random() < 0.5);
  return {
    ...template,
    mirrored: shouldMirror,
    obstacles: template.obstacles.map((obstacle) => ({
      ...obstacle,
      row: shouldMirror ? mirrorRow(obstacle.row) : obstacle.row
    }))
  };
}

export function patternHorizontalDuration(pattern, speed, config = CONFIG) {
  const lastOffset = Math.max(0, ...pattern.obstacles.map((obstacle) => obstacle.timeOffset));
  const travel = (config.WIDTH + config.SPAWN_X_PADDING - config.OBSTACLE_SUBMERGE_END_X) / Math.max(1, speed);
  return lastOffset + travel;
}

function gate(id, tier, openRows, safeRoute, options = {}) {
  return pattern(id, tier, rowsForOpening(openRows).map((row) => hit(row)), safeRoute, options);
}

function pattern(id, tier, obstacles, safeRoute, options = {}) {
  return {
    id,
    tier,
    obstacles,
    speedMultiplier: options.speedMultiplier ?? 1,
    estimatedDuration: options.estimatedDuration ?? 1,
    allowMirror: options.allowMirror ?? true,
    allowOverlap: options.allowOverlap ?? false,
    minimumEntrySeconds: options.minimumEntrySeconds ?? tier * 18,
    safeRoute
  };
}

function hit(row, timeOffset = 0, typeRestrictions = null) {
  return {
    row: Math.max(0, Math.min(obstacleRowCount() - 1, row)),
    timeOffset,
    typeRestrictions
  };
}
