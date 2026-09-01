import { CONFIG } from "./config.js";
import { centeredRect, rectsOverlap } from "./collision.js";
import { materializeDodgeObstacleGeometry } from "./dodgeObstacles.js";
import { obstacleRowCenter } from "./rowGeometry.js";
import { patternHorizontalDuration } from "./obstaclePatterns.js";
import { clampSurferCenterToPlayfield, isSurferPositionValid } from "./surferGeometry.js";

const validationCache = new Map();

export function validatePatternSequence(patterns, options = {}) {
  const config = options.config ?? CONFIG;
  const speed = options.speed ?? config.OBSTACLE_START_SPEED;
  const surferY = options.surferY ?? midpoint(config.SURF_BOUNDS.top, config.SURF_BOUNDS.bottom);
  const playerX = options.playerX ?? defaultPlayerX(config);
  const key = cacheKey(patterns, speed, surferY, playerX, config);
  if (validationCache.has(key)) return validationCache.get(key);

  const obstacles = flattenPatterns(patterns, speed, config);
  const result = validateObstacleTimeline(obstacles, { ...options, speed, surferY, playerX, config });
  validationCache.set(key, result);
  return result;
}

export function validateObstacleTimeline(obstacles, options = {}) {
  const config = options.config ?? CONFIG;
  const speed = options.speed ?? config.OBSTACLE_START_SPEED;
  const timestep = options.timestep ?? config.PATTERN_VALIDATION_TIMESTEP_SECONDS;
  const yStep = options.yStep ?? config.PATTERN_VALIDATION_Y_STEP;
  const padding = options.padding ?? config.PATTERN_VALIDATION_PADDING;
  const reaction = options.reactionSeconds ?? config.PATTERN_VALIDATION_REACTION_SECONDS;
  const surferHalfHeight = options.surferHalfHeight ?? (config.SURFER_DISPLAY_HEIGHT * config.SURFER_HITBOX_SCALE_Y) / 2;
  const surferWidth = options.surferWidth ?? config.SURFER_DISPLAY_WIDTH * config.SURFER_HITBOX_SCALE_X;
  const playerX = options.playerX ?? defaultPlayerX(config);
  const rawInitialY = options.surferY ?? midpoint(config.SURF_BOUNDS.top, config.SURF_BOUNDS.bottom);
  const initialY = clampSurferCenterToPlayfield(playerX, rawInitialY, config).y;
  const duration = options.duration ?? timelineDuration(obstacles, speed, config);
  const ySamples = buildYSamples(config, yStep, playerX, initialY);
  if (!ySamples.length) return { valid: false, reason: "no-legal-positions", safeRoute: [] };
  if (!obstacles.length) return { valid: false, safeRoute: ySamples };

  let reachable = new Set(
    ySamples.filter((y) =>
      Math.abs(y - initialY) <= Math.max(0, config.SURFER_SPEED * reaction) &&
      isYAvailable(y, 0, obstacles, { config, speed, padding, surferHalfHeight, surferWidth, playerX })
    )
  );

  if (!reachable.size) {
    return { valid: false, reason: "no-reachable-start", safeRoute: [] };
  }

  const route = [];
  for (let t = timestep; t <= duration + timestep / 2; t += timestep) {
    const nextReachable = new Set();
    const safeAtT = ySamples.filter((y) =>
      isYAvailable(y, t, obstacles, { config, speed, padding, surferHalfHeight, surferWidth, playerX })
    );

    for (const candidateY of safeAtT) {
      for (const previousY of reachable) {
        if (Math.abs(candidateY - previousY) <= config.SURFER_SPEED * timestep + 0.001) {
          if (transitionIsClear(previousY, candidateY, t - timestep, t, obstacles, {
            config,
            speed,
            padding,
            surferHalfHeight,
            surferWidth,
            playerX
          })) {
            nextReachable.add(candidateY);
            break;
          }
        }
      }
    }

    if (!nextReachable.size) {
      return { valid: false, reason: "route-blocked", blockedAt: t, safeRoute: route };
    }

    route.push({ t, ys: [...nextReachable] });
    reachable = nextReachable;
  }

  return { valid: true, safeRoute: route };
}

export function flattenPatterns(patterns, speed, config = CONFIG) {
  return patterns.flatMap(({ pattern, startTime = 0 }) =>
    pattern.obstacles.map((obstacle) => materializePatternObstacle(obstacle, pattern, startTime, speed, config))
  );
}

function materializePatternObstacle(obstacle, pattern, startTime, speed, config) {
  const geometry = materializeDodgeObstacleGeometry(obstacle.typeId) ?? {};
  return {
    ...geometry,
    ...obstacle,
    obstacleTypeId: geometry.obstacleTypeId ?? obstacle.typeId ?? null,
    y: obstacle.y ?? obstacleRowCenter(obstacle.row, config),
    x: obstacle.x ?? config.WIDTH + config.SPAWN_X_PADDING + (startTime + obstacle.timeOffset) * speed,
    speed: speed * (pattern.speedMultiplier ?? 1),
    timeOffset: startTime + obstacle.timeOffset
  };
}

function timelineDuration(obstacles, speed, config) {
  const lastOffset = Math.max(0, ...obstacles.map((obstacle) => obstacle.timeOffset ?? 0));
  const travel = (config.WIDTH + config.SPAWN_X_PADDING - config.OBSTACLE_SUBMERGE_END_X) / Math.max(1, speed);
  return lastOffset + travel + 0.25;
}

function isYAvailable(y, t, obstacles, shared) {
  const surferBox = centeredRect(shared.playerX, y, shared.surferWidth, shared.surferHalfHeight * 2);
  return obstacles.every((obstacle) => {
    const obstacleBox = obstacleRectAtTime(obstacle, t, shared);
    if (!obstacleBox) return true;
    return !rectsOverlap(surferBox, obstacleBox);
  });
}

function transitionIsClear(fromY, toY, fromT, toT, obstacles, shared) {
  const checks = 3;
  for (let i = 0; i <= checks; i += 1) {
    const progress = i / checks;
    const y = fromY + (toY - fromY) * progress;
    const t = fromT + (toT - fromT) * progress;
    if (!isYAvailable(y, t, obstacles, shared)) return false;
  }
  return true;
}

function obstacleRectAtTime(obstacle, t, { config, padding }) {
  const obstacleSpeed = obstacle.speed ?? config.OBSTACLE_START_SPEED;
  const x = obstacle.x - obstacleSpeed * t;
  const collisionWidth = obstacle.collisionWidth ?? obstacle.width;
  const collisionHeight = obstacle.collisionHeight ?? obstacle.height;
  if (!Number.isFinite(collisionWidth) || !Number.isFinite(collisionHeight)) return null;
  const halfWidth = (collisionWidth * (obstacle.hitboxScaleX ?? obstacle.collisionScale ?? config.HEAD_HITBOX_SCALE_X)) / 2 + padding;
  const halfHeight = (collisionHeight * (obstacle.hitboxScaleY ?? obstacle.collisionScale ?? config.HEAD_HITBOX_SCALE_Y)) / 2 + padding;
  if (x + halfWidth < config.SURF_BOUNDS.left - 140 || x - halfWidth > config.WIDTH + config.SPAWN_X_PADDING + 160) {
    return null;
  }
  return centeredRect(x, obstacle.y, halfWidth * 2, halfHeight * 2);
}

function buildYSamples(config, yStep, playerX, initialY) {
  const top = config.SURF_BOUNDS.top - config.SURFER_DISPLAY_HEIGHT;
  const bottom = config.SURF_BOUNDS.bottom + config.SURFER_DISPLAY_HEIGHT;
  const samples = [];
  for (let y = top; y <= bottom + 0.001; y += yStep) {
    if (isSurferPositionValid(playerX, y, config)) samples.push(y);
  }
  if (!samples.includes(initialY) && isSurferPositionValid(playerX, initialY, config)) {
    samples.push(initialY);
    samples.sort((a, b) => a - b);
  }
  return samples;
}

function cacheKey(patterns, speed, surferY, playerX, config) {
  return JSON.stringify({
    ids: patterns.map(({ pattern, startTime = 0 }) => [pattern.id, pattern.mirrored, startTime]),
    types: patterns.map(({ pattern }) => pattern.obstacles.map((obstacle) => obstacle.typeId ?? null)),
    speed: Math.round(speed),
    surferY: Math.round(surferY),
    playerX: Math.round(playerX * 1000) / 1000,
    bounds: config.SURF_BOUNDS,
    surferBoundary: config.SURFER_PLAYFIELD_BOUNDARY,
    surferMovementFootprint: config.SURFER_MOVEMENT_FOOTPRINT,
    rows: config.OBSTACLE_ROW_COUNT
  });
}

function defaultPlayerX(config) {
  return config.SURF_BOUNDS.left + (config.SURF_BOUNDS.right - config.SURF_BOUNDS.left) * 0.35;
}

function midpoint(a, b) {
  return a + (b - a) / 2;
}
