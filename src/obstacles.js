import { CONFIG } from "./config.js";
import { centeredRect, rectsOverlap } from "./collision.js";
import { DODGE_OBSTACLE_TYPES, selectDodgeObstacleType } from "./dodgeObstacles.js";
import { obstacleRowCenter, isValidObstacleRow, nearestObstacleRow } from "./rowGeometry.js";
import { instantiatePattern, selectPatternForTime } from "./obstaclePatterns.js";
import { validateObstacleTimeline } from "./patternValidator.js";

export function obstacleSpeedForTime(seconds) {
  const t = Math.max(0, Math.min(1, seconds / CONFIG.DIFFICULTY_RAMP_SECONDS));
  return CONFIG.OBSTACLE_START_SPEED + (CONFIG.OBSTACLE_MAX_SPEED - CONFIG.OBSTACLE_START_SPEED) * t;
}

export function eventWeightsForTime(seconds) {
  const t = Math.max(0, Math.min(1, seconds / CONFIG.DIFFICULTY_RAMP_SECONDS));
  const single = CONFIG.SINGLE_WEIGHT_START + (CONFIG.SINGLE_WEIGHT_END - CONFIG.SINGLE_WEIGHT_START) * t;
  return {
    single,
    double: Math.min(CONFIG.DOUBLE_WEIGHT_MAX, 1 - single)
  };
}

export function spawnDelayForTime(seconds, random = Math.random) {
  const t = Math.max(0, Math.min(1, seconds / CONFIG.DIFFICULTY_RAMP_SECONDS));
  const min = lerp(CONFIG.SPAWN_DELAY_START.min, CONFIG.SPAWN_DELAY_END.min, t);
  const max = lerp(CONFIG.SPAWN_DELAY_START.max, CONFIG.SPAWN_DELAY_END.max, t);
  return lerp(min, max, random());
}

export function obstacleSubmergeProgressForX(x) {
  const start = CONFIG.OBSTACLE_SUBMERGE_START_X;
  const end = CONFIG.OBSTACLE_SUBMERGE_END_X;
  const range = Math.max(1, start - end);
  return Math.max(0, Math.min(1, (start - x) / range));
}

export function obstacleOpacityForX(x) {
  return 1 - obstacleSubmergeProgressForX(x);
}

export function obstacleSinkForX(x) {
  return CONFIG.OBSTACLE_SUBMERGE_SINK_PX * obstacleSubmergeProgressForX(x);
}

export function createObstacleEvent({
  surferY,
  elapsed,
  activeHeads = [],
  random = Math.random,
  validator = isEventFair
}) {
  const baseSpeed = obstacleSpeedForTime(elapsed);
  const weights = eventWeightsForTime(elapsed);
  const spawnX = CONFIG.WIDTH + CONFIG.SPAWN_X_PADDING;
  let previousPatternId = null;

  for (let attempt = 0; attempt < CONFIG.HEAD_SPAWN_PLACEMENT_RETRIES; attempt += 1) {
    const includeIds = random() < weights.single
      ? ["single-low", "single-high", "single-center"]
      : null;
    const template = selectPatternForTime(elapsed, { random, previousPatternId, includeIds });
    const pattern = instantiatePattern(template, { random });
    const speed = baseSpeed * pattern.speedMultiplier;
    const candidate = createPatternEvent(pattern, spawnX, speed, random);

    if (validator(candidate, surferY, speed, activeHeads) && isEventPlacementClear(candidate, activeHeads)) {
      return { ...candidate, attemptCount: attempt + 1 };
    }
    previousPatternId = pattern.id;
  }

  return null;
}

export function canSpawnNextEvent(activeEvent) {
  if (!activeEvent) return true;
  return !activeEvent.threatening;
}

export function isEventFair(event, surferY, speed) {
  if (!event.heads.every(isHeadInsidePlayableY)) return false;
  return validateObstacleTimeline(event.heads, {
    speed,
    surferY,
    duration: event.validationDuration
  }).valid;
}

export function hasMinimumHeadSeparation(head, otherHead) {
  return !rectsOverlap(expandedRenderBounds(head), expandedRenderBounds(otherHead));
}

export function isEventPlacementClear(event, activeHeads = []) {
  const heads = event.heads;
  const visibleActiveHeads = activeHeads.filter(isHeadVisiblyPresent);

  for (let i = 0; i < heads.length; i += 1) {
    for (let j = i + 1; j < heads.length; j += 1) {
      if (!hasMinimumHeadSeparation(heads[i], heads[j])) return false;
    }

    if (visibleActiveHeads.some((head) => !hasMinimumHeadSeparation(heads[i], head))) {
      return false;
    }
  }

  return true;
}

export function isHeadVisiblyPresent(head) {
  return !(head.resolved === true && obstacleOpacityForX(head.x) <= 0);
}

export class ObstacleManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.activeEvent = null;
    this.encounterObstacles = [];
    this.spawnTimer = 0.55;
  }

  update(dt, elapsed, surferY, options = {}) {
    const pauseSpawns = options.pauseSpawns === true;
    const encounterDodged = this.updateEncounterObstacles(dt);

    if (this.activeEvent) {
      updateObstacles(this.activeEvent.heads, dt, this.activeEvent.speed);

      const newlyDodged = this.activeEvent.heads.filter((head) => head.resolved && !head.counted).length;
      this.activeEvent.heads.forEach((head) => {
        if (head.resolved) head.counted = true;
      });

      const unresolvedHeads = this.activeEvent.heads.filter((head) => !head.resolved);
      const eventRight = unresolvedHeads.length
        ? Math.max(...unresolvedHeads.map((head) => head.x + head.width / 2))
        : -Infinity;
      this.activeEvent.threatening = unresolvedHeads.length > 0 && eventRight > CONFIG.SURF_BOUNDS.left - CONFIG.EVENT_CLEAR_X;

      if (unresolvedHeads.length === 0) {
        const dodged = this.activeEvent.collided ? 0 : newlyDodged;
        this.activeEvent = null;
        this.spawnTimer = spawnDelayForTime(elapsed);
        return dodged + encounterDodged;
      }

      return (this.activeEvent.collided ? 0 : newlyDodged) + encounterDodged;
    }

    if (!pauseSpawns) {
      this.spawnTimer -= dt;
    }
    if (!pauseSpawns && this.spawnTimer <= 0 && canSpawnNextEvent(this.activeEvent)) {
      this.activeEvent = createObstacleEvent({
        surferY,
        elapsed,
        activeHeads: options.activeHeads ?? this.activeHeads(),
        random: options.random ?? Math.random
      });
      if (!this.activeEvent) {
        this.spawnTimer = spawnDelayForTime(elapsed);
      }
    }

    return encounterDodged;
  }

  updateEncounterObstacles(dt) {
    updateObstacles(this.encounterObstacles, dt);

    const newlyDodged = this.encounterObstacles.filter((obstacle) => obstacle.resolved && !obstacle.counted).length;
    this.encounterObstacles.forEach((obstacle) => {
      if (obstacle.resolved) obstacle.counted = true;
    });
    this.encounterObstacles = this.encounterObstacles.filter((obstacle) => !obstacle.resolved);

    return newlyDodged;
  }

  addObstacle(obstacle) {
    const row = isValidObstacleRow(obstacle.row) ? obstacle.row : nearestObstacleRow(obstacle.y);
    this.encounterObstacles.push({
      type: "encounter",
      source: obstacle.source ?? null,
      assetKey: obstacle.assetKey,
      x: obstacle.x,
      y: obstacle.y ?? obstacleRowCenter(row),
      row,
      patternId: obstacle.patternId ?? null,
      width: obstacle.width,
      height: obstacle.height,
      collisionWidth: obstacle.collisionWidth ?? obstacle.width,
      collisionHeight: obstacle.collisionHeight ?? obstacle.height,
      renderAnchor: obstacle.renderAnchor ?? { x: 0.5, y: 0.5 },
      renderOffsetX: obstacle.renderOffsetX ?? 0,
      renderOffsetY: obstacle.renderOffsetY ?? 0,
      speed: obstacle.speed,
      hitboxScaleX: obstacle.hitboxScaleX ?? obstacle.collisionScale ?? CONFIG.HEAD_HITBOX_SCALE_X,
      hitboxScaleY: obstacle.hitboxScaleY ?? obstacle.collisionScale ?? CONFIG.HEAD_HITBOX_SCALE_Y,
      bobAmount: obstacle.bobAmount ?? 0,
      bobSpeed: obstacle.bobSpeed ?? 5,
      bobOffset: obstacle.bobOffset ?? Math.random() * Math.PI * 2,
      resolved: false,
      counted: false
    });
  }

  draw(ctx, assets) {
    if (this.activeEvent) {
      for (const head of this.activeEvent.heads) {
        drawObstacle(ctx, obstacleImage(assets, head), head);
      }
    }

    for (const obstacle of this.encounterObstacles) {
      drawObstacle(ctx, obstacleImage(assets, obstacle), obstacle);
    }
  }

  hitboxes() {
    const headHitboxes = this.activeEvent
      ? this.activeEvent.heads
        .filter((head) => !head.resolved && obstacleOpacityForX(head.x) > 0)
        .map((head) =>
          centeredRect(
            head.x,
            head.y,
            head.collisionWidth * head.hitboxScaleX,
            head.collisionHeight * head.hitboxScaleY
          )
        )
      : [];

    const encounterHitboxes = this.encounterObstacles
      .filter((obstacle) => !obstacle.resolved && obstacleOpacityForX(obstacle.x) > 0)
      .map((obstacle) =>
        centeredRect(
          obstacle.x,
          obstacle.y,
          obstacle.collisionWidth * obstacle.hitboxScaleX,
          obstacle.collisionHeight * obstacle.hitboxScaleY
        )
      );

    return [...headHitboxes, ...encounterHitboxes];
  }

  centers() {
    const headCenters = this.activeEvent
      ? this.activeEvent.heads.filter((head) => !head.resolved).map((head) => ({
        x: head.x,
        y: head.y,
        row: head.row,
        patternId: head.patternId ?? this.activeEvent.patternId
      }))
      : [];
    const encounterCenters = this.encounterObstacles
      .filter((obstacle) => !obstacle.resolved)
      .map((obstacle) => ({
        x: obstacle.x,
        y: obstacle.y,
        row: obstacle.row,
        patternId: obstacle.patternId
      }));
    return [...headCenters, ...encounterCenters];
  }

  activeHeads() {
    return this.activeEvent ? this.activeEvent.heads.filter(isHeadVisiblyPresent) : [];
  }

  markCollided() {
    if (this.activeEvent) this.activeEvent.collided = true;
  }

  clearEncounterObstaclesBySource(source) {
    this.encounterObstacles = this.encounterObstacles.filter((obstacle) => obstacle.source !== source);
  }
}

function updateObstacles(obstacles, dt, eventSpeed = null) {
  obstacles.forEach((obstacle) => {
    if (obstacle.resolved) return;
    obstacle.x -= (eventSpeed ?? obstacle.speed) * dt;
    obstacle.age = (obstacle.age ?? 0) + dt;
    if (obstacle.x <= CONFIG.OBSTACLE_SUBMERGE_END_X) {
      obstacle.resolved = true;
    }
  });
}

function drawObstacle(ctx, image, obstacle) {
  const opacity = obstacleOpacityForX(obstacle.x);
  if (!image || opacity <= 0) return;
  const anchor = obstacle.renderAnchor ?? { x: 0.5, y: 0.5 };
  const offsetX = obstacle.renderOffsetX ?? 0;
  const offsetY = obstacle.renderOffsetY ?? 0;

  const bob = obstacle.bobAmount
    ? Math.sin((obstacle.age ?? 0) * obstacle.bobSpeed + obstacle.bobOffset) * obstacle.bobAmount
    : 0;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(
    image,
    obstacle.x + offsetX - obstacle.width * anchor.x,
    obstacle.y + offsetY - obstacle.height * anchor.y + obstacleSinkForX(obstacle.x) + bob,
    obstacle.width,
    obstacle.height
  );
  ctx.restore();
}

function obstacleImage(assets, obstacle) {
  const fallback = assets.dodgeObstacles?.[DODGE_OBSTACLE_TYPES[0].assetKey];
  if (!obstacle.assetKey) return fallback;
  return assets.dodgeObstacles?.[obstacle.assetKey] ?? assets.throwables?.[obstacle.assetKey] ?? assets[obstacle.assetKey] ?? fallback;
}

export function createPatternEvent(pattern, spawnX, speed, random = Math.random) {
  return {
    type: pattern.obstacles.length === 1 ? "single" : "pattern",
    patternId: pattern.id,
    speed,
    threatening: true,
    collided: false,
    validationDuration: (spawnX - CONFIG.OBSTACLE_SUBMERGE_END_X) / Math.max(1, speed) +
      Math.max(0, ...pattern.obstacles.map((obstacle) => obstacle.timeOffset)) + 0.25,
    heads: pattern.obstacles.map((obstacle) => {
      const typePool = obstacle.typeRestrictions
        ? DODGE_OBSTACLE_TYPES.filter((type) => obstacle.typeRestrictions.includes(type.id))
        : DODGE_OBSTACLE_TYPES;
      return createDodgeObstacle(
        spawnX + obstacle.timeOffset * speed,
        obstacleRowCenter(obstacle.row),
        random,
        selectDodgeObstacleType(random, typePool),
        { row: obstacle.row, patternId: pattern.id, timeOffset: obstacle.timeOffset }
      );
    })
  };
}

export function createDodgeObstacle(x, y, random = Math.random, type = selectDodgeObstacleType(random), options = {}) {
  const row = isValidObstacleRow(options.row) ? options.row : nearestObstacleRow(y);
  return {
    type: "dodge",
    obstacleTypeId: type.id,
    assetKey: type.assetKey,
    x,
    y: options.y ?? y,
    row,
    patternId: options.patternId ?? null,
    timeOffset: options.timeOffset ?? 0,
    width: type.render.width,
    height: type.render.height,
    collisionWidth: type.hitbox.width,
    collisionHeight: type.hitbox.height,
    hitboxScaleX: type.hitbox.scaleX,
    hitboxScaleY: type.hitbox.scaleY,
    visualGapX: type.visualGap.x,
    visualGapY: type.visualGap.y,
    renderAnchor: type.render.anchor,
    renderOffsetX: type.render.offsetX,
    renderOffsetY: type.render.offsetY,
    resolved: false,
    counted: false
  };
}

function expandedRenderBounds(head) {
  return centeredRect(
    head.x,
    head.y,
    head.width + (head.visualGapX ?? CONFIG.HEAD_MIN_VISUAL_GAP_X),
    head.height + (head.visualGapY ?? CONFIG.HEAD_MIN_VISUAL_GAP_Y)
  );
}

function isHeadInsidePlayableY(head) {
  return (
    head.y - head.height / 2 >= CONFIG.SURF_BOUNDS.top &&
    head.y + head.height / 2 <= CONFIG.SURF_BOUNDS.bottom
  );
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
