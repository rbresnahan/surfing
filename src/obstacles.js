import { CONFIG } from "./config.js";
import { centeredRect, rectsOverlap } from "./collision.js";
import { DODGE_OBSTACLE_TYPES, getDodgeObstacleType, selectDodgeObstacleType } from "./dodgeObstacles.js";
import { obstacleRowCenter, isValidObstacleRow, nearestObstacleRow } from "./rowGeometry.js";
import { instantiatePattern, PATTERN_BY_ID } from "./obstaclePatterns.js";
import { validateObstacleTimeline } from "./patternValidator.js";
import { PATTERN_SCHEDULE, stageTuning } from "./obstacleTuning.js";

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

export function spawnDelayForTime(seconds, random = () => 0.5) {
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
  random = () => 0,
  validator = isEventFair,
  pattern = null,
  difficultyStage = 0
}) {
  const baseSpeed = stageTuning(difficultyStage).speed;
  const spawnX = CONFIG.WIDTH + CONFIG.SPAWN_X_PADDING;

  for (let attempt = 0; attempt < CONFIG.HEAD_SPAWN_PLACEMENT_RETRIES; attempt += 1) {
    const template = pattern ?? PATTERN_BY_ID[stageTuning(difficultyStage).schedule[attempt % stageTuning(difficultyStage).schedule.length]];
    const instance = instantiatePattern(template);
    const speed = baseSpeed * instance.speedMultiplier;
    const candidate = createPatternEvent(instance, spawnX, speed);

    if (validator(candidate, surferY, speed, activeHeads) && isEventPlacementClear(candidate, activeHeads)) {
      return { ...candidate, attemptCount: attempt + 1 };
    }
    if (pattern) break;
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
  constructor({ diagnostics = null } = {}) {
    this.diagnostics = diagnostics;
    this.reset();
  }

  reset() {
    this.activeEvents = [];
    this.encounterObstacles = [];
    this.spawnTimer = 0.55;
    this.scheduler = new DeterministicObstacleScheduler();
    this.lastPauseSpawns = false;
  }

  get activeEvent() {
    return this.activeEvents[0] ?? null;
  }

  set activeEvent(event) {
    this.activeEvents = event ? [event] : [];
  }

  update(dt, elapsed, surferY, options = {}) {
    const pauseSpawns = options.pauseSpawns === true;
    const difficultyStage = options.difficultyStage ?? 0;
    this.recordSpawnSuppression(pauseSpawns, elapsed, options.pauseOwner ?? null);
    const encounterDodged = this.updateEncounterObstacles(dt, elapsed);
    const normalEventCountAtStart = this.activeEvents.length;
    const hadNormalEventsAtStart = this.activeEvents.length > 0;

    let normalDodged = 0;
    let completedNormalEvent = false;
    for (const event of this.activeEvents) {
      updateObstacles(event.heads, dt, event.speed);
      const newlyDodgedHeads = event.heads.filter((head) => head.resolved && !head.counted);
      event.heads.forEach((head) => {
        if (!head.resolved) return;
        if (!head.counted && !event.collided) {
          this.recordObjectEvent("object.dodge_awarded", head, elapsed, {
            objectType: "normal-obstacle",
            reason: "dodged"
          });
          this.recordObjectEvent("object.removed", head, elapsed, {
            objectType: "normal-obstacle",
            reason: "dodged"
          });
        }
        head.counted = true;
      });
      normalDodged += event.collided ? 0 : newlyDodgedHeads.length;
      updateEventThreat(event);
    }

    const completedNormalEvents = hadNormalEventsAtStart
      ? this.activeEvents.filter((event) => event.heads.every((head) => head.resolved))
      : [];
    completedNormalEvent = completedNormalEvents.length > 0;
    this.activeEvents = this.activeEvents.filter((event) => event.heads.some((head) => !head.resolved));
    if (completedNormalEvent) {
      this.spawnTimer = stageTuning(difficultyStage).spawnDelaySeconds;
      for (const event of completedNormalEvents) {
        if (!event.collided) {
          options.onNormalEventCompleted?.(event);
        }
      }
    }

    if (!pauseSpawns) {
      this.spawnTimer -= dt;
    }

    if (!pauseSpawns && !hadNormalEventsAtStart && this.spawnTimer <= 0) {
      const event = this.scheduler.nextEvent({
        difficultyStage,
        surferY,
        activeHeads: options.activeHeads ?? this.activeHeads()
      });
      if (event) {
        this.activeEvents.push(event);
        this.recordNormalEventCreated(event, elapsed);
        this.spawnTimer = stageTuning(difficultyStage).spawnDelaySeconds;
      } else {
        this.spawnTimer = 0.08;
      }
    }

    if (pauseSpawns && this.activeEvents.length > normalEventCountAtStart) {
      this.diagnostics?.emit("normal_spawn.violation", {
        elapsedSeconds: elapsed,
        owner: options.pauseOwner ?? null,
        spawnTimer: this.spawnTimer
      });
    }

    return normalDodged + encounterDodged;
  }

  updateEncounterObstacles(dt, elapsed = 0) {
    updateObstacles(this.encounterObstacles, dt);

    const newlyDodgedObstacles = this.encounterObstacles.filter((obstacle) => obstacle.resolved && !obstacle.counted);
    this.encounterObstacles.forEach((obstacle) => {
      if (!obstacle.resolved) return;
      if (!obstacle.counted) {
        this.recordObjectEvent("object.dodge_awarded", obstacle, elapsed, {
          objectType: "encounter-obstacle",
          reason: "dodged"
        });
        this.recordObjectEvent("object.removed", obstacle, elapsed, {
          objectType: "encounter-obstacle",
          owner: obstacle.diagnosticsOwner ?? obstacle.source ?? null,
          reason: "dodged"
        });
      }
      obstacle.counted = true;
    });
    this.encounterObstacles = this.encounterObstacles.filter((obstacle) => !obstacle.resolved);

    return newlyDodgedObstacles.length;
  }

  addObstacle(obstacle) {
    const row = isValidObstacleRow(obstacle.row) ? obstacle.row : nearestObstacleRow(obstacle.y);
    const created = {
      type: "encounter",
      source: obstacle.source ?? null,
      diagnosticsOwner: obstacle.diagnosticsOwner ?? null,
      diagnosticsObjectId: obstacle.diagnosticsObjectId ?? null,
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
      bobOffset: obstacle.bobOffset ?? deterministicBobOffset(obstacle),
      resolved: false,
      counted: false
    };
    this.encounterObstacles.push(created);
    const objectId = obstacle.diagnosticsObjectId ?? this.diagnostics?.objectId(created, "encounter-object");
    if (!this.diagnostics?.markObjectCreated?.(objectId)) return;
    this.diagnostics?.emit("object.created", {
      elapsedSeconds: obstacle.elapsedSeconds ?? 0,
      occurrenceId: obstacle.occurrenceId ?? null,
      encounterType: obstacle.source ?? null,
      objectId,
      objectType: "encounter-obstacle",
      owner: obstacle.diagnosticsOwner ?? obstacle.occurrenceId ?? obstacle.source ?? null,
      source: obstacle.source ?? null,
      assetKey: obstacle.assetKey,
      row,
      y: created.y,
      patternId: obstacle.patternId ?? null
    });
  }

  draw(ctx, assets) {
    for (const event of this.activeEvents) {
      for (const head of event.heads) {
        drawObstacle(ctx, obstacleImage(assets, head), head);
      }
    }

    for (const obstacle of this.encounterObstacles) {
      drawObstacle(ctx, obstacleImage(assets, obstacle), obstacle);
    }
  }

  hitboxes() {
    const headHitboxes = this.activeEvents
      .flatMap((event) => event.heads
        .filter((head) => !head.resolved && obstacleOpacityForX(head.x) > 0)
        .map((head) =>
          centeredRect(
            head.x,
            head.y,
            head.collisionWidth * head.hitboxScaleX,
            head.collisionHeight * head.hitboxScaleY
          )
        ));

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
    const headCenters = this.activeEvents
      .flatMap((event) => event.heads.filter((head) => !head.resolved).map((head) => ({
        x: head.x,
        y: head.y,
        row: head.row,
        patternId: head.patternId ?? event.patternId,
        routeProgress: obstacleRouteProgress(head)
      })));
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
    return this.activeEvents.flatMap((event) => event.heads.filter(isHeadVisiblyPresent));
  }

  markCollided(elapsed = 0) {
    for (const event of this.activeEvents) {
      event.collided = true;
      for (const head of event.heads) {
        if (head.resolved) continue;
        this.recordObjectEvent("object.collision", head, elapsed, {
          objectType: "normal-obstacle",
          reason: "collision"
        });
      }
    }
  }

  clearEncounterObstaclesBySource(source) {
    const removed = this.encounterObstacles.filter((obstacle) => obstacle.source === source);
    for (const obstacle of removed) {
      this.recordObjectEvent("object.removed", obstacle, 0, {
        objectType: "encounter-obstacle",
        owner: obstacle.diagnosticsOwner ?? obstacle.source ?? null,
        reason: "cleanup"
      });
    }
    this.encounterObstacles = this.encounterObstacles.filter((obstacle) => obstacle.source !== source);
  }

  countEncounterObstaclesBySource(source) {
    return this.encounterObstacles.filter((obstacle) => obstacle.source === source).length;
  }

  recordSpawnSuppression(pauseSpawns, elapsed, owner) {
    if (!this.diagnostics?.enabled || pauseSpawns === this.lastPauseSpawns) return;
    this.diagnostics.emit(pauseSpawns ? "normal_spawn.suppressed" : "normal_spawn.restored", {
      elapsedSeconds: elapsed,
      owner
    });
    this.lastPauseSpawns = pauseSpawns;
  }

  recordNormalEventCreated(event, elapsed) {
    if (!this.diagnostics?.enabled) return;
    for (const head of event.heads) {
      const objectId = this.diagnostics.objectId(head, "normal-object");
      this.diagnostics.emit("object.created", {
        elapsedSeconds: elapsed,
        objectId,
        objectType: "normal-obstacle",
        owner: "normal-spawn",
        source: "normal-spawn",
        assetKey: head.assetKey,
        row: head.row,
        y: head.y,
        patternId: head.patternId ?? event.patternId
      });
    }
  }

  recordObjectEvent(type, object, elapsed, payload = {}) {
    if (!this.diagnostics?.enabled) return;
    const objectId = object.diagnosticsObjectId ?? this.diagnostics.objectId(object, payload.objectType === "normal-obstacle" ? "normal-object" : "encounter-object");
    this.diagnostics.emit(type, {
      elapsedSeconds: elapsed,
      objectId,
      objectType: payload.objectType ?? object.type ?? null,
      owner: payload.owner ?? object.diagnosticsOwner ?? object.source ?? null,
      row: object.row,
      source: object.source ?? null,
      assetKey: object.assetKey ?? null,
      reason: payload.reason ?? null
    });
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

export function createPatternEvent(pattern, spawnX, speed, random = () => 0) {
  return {
    type: pattern.obstacles.length === 1 ? "single" : "pattern",
    patternId: pattern.id,
    speed,
    threatening: true,
    collided: false,
    validationDuration: (spawnX - CONFIG.OBSTACLE_SUBMERGE_END_X) / Math.max(1, speed) +
      Math.max(0, ...pattern.obstacles.map((obstacle) => obstacle.timeOffset)) + 0.25,
    heads: pattern.obstacles.map((obstacle) => {
      const type = getDodgeObstacleType(obstacle.typeId) ?? selectDodgeObstacleType(() => 0);
      return createDodgeObstacle(
        spawnX + obstacle.timeOffset * speed,
        obstacleRowCenter(obstacle.row),
        random,
        type,
        { row: obstacle.row, patternId: pattern.id, timeOffset: obstacle.timeOffset }
      );
    })
  };
}

export function createDodgeObstacle(x, y, random = () => 0, type = selectDodgeObstacleType(random), options = {}) {
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
    routeStartX: options.routeStartX ?? x,
    routeEndX: CONFIG.OBSTACLE_SUBMERGE_END_X,
    resolved: false,
    counted: false
  };
}

export function obstacleRouteProgress(obstacle) {
  const start = obstacle.routeStartX ?? CONFIG.WIDTH + CONFIG.SPAWN_X_PADDING;
  const end = obstacle.routeEndX ?? CONFIG.OBSTACLE_SUBMERGE_END_X;
  const distance = Math.max(1, start - end);
  return Math.max(0, Math.min(1, (start - obstacle.x) / distance));
}

export function rowIsReleased(row, activeHeads, stageConfig = stageTuning(0)) {
  const rowHeads = activeHeads.filter((head) => head.row === row && !head.resolved);
  if (!rowHeads.length) return true;
  if (stageConfig.rowRelease === "fade") {
    return rowHeads.every((head) => head.x <= CONFIG.OBSTACLE_SUBMERGE_START_X);
  }
  if (rowHeads.length >= stageConfig.maxActivePerRow) return false;
  return rowHeads.every((head) => obstacleRouteProgress(head) >= stageConfig.releaseProgress);
}

export class DeterministicObstacleScheduler {
  constructor() {
    this.reset();
  }

  reset() {
    this.indices = new Map();
  }

  nextPattern(stage) {
    const config = stageTuning(stage);
    const index = this.indices.get(config.id) ?? 0;
    const patternId = config.schedule[index % config.schedule.length];
    this.indices.set(config.id, index + 1);
    return PATTERN_BY_ID[patternId];
  }

  peekPattern(stage) {
    const config = stageTuning(stage);
    const index = this.indices.get(config.id) ?? 0;
    return PATTERN_BY_ID[config.schedule[index % config.schedule.length]];
  }

  nextEvent({ difficultyStage, surferY, activeHeads }) {
    const config = stageTuning(difficultyStage);
    const attempts = config.schedule.length;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const pattern = this.nextPattern(difficultyStage);
      if (!pattern || !patternRowsAvailable(pattern, activeHeads, config)) continue;
      const event = createObstacleEvent({
        surferY,
        activeHeads,
        pattern,
        difficultyStage
      });
      if (event) return event;
    }
    return null;
  }
}

function patternRowsAvailable(pattern, activeHeads, stageConfig) {
  const rows = [...new Set(pattern.obstacles.map((obstacle) => obstacle.row))];
  return rows.every((row) => rowIsReleased(row, activeHeads, stageConfig));
}

function updateEventThreat(event) {
  const unresolvedHeads = event.heads.filter((head) => !head.resolved);
  const eventRight = unresolvedHeads.length
    ? Math.max(...unresolvedHeads.map((head) => head.x + head.width / 2))
    : -Infinity;
  event.threatening = unresolvedHeads.length > 0 && eventRight > CONFIG.SURF_BOUNDS.left - CONFIG.EVENT_CLEAR_X;
}

function deterministicBobOffset(obstacle) {
  const text = `${obstacle.source ?? obstacle.assetKey ?? ""}:${obstacle.row ?? ""}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 997;
  }
  return (hash / 997) * Math.PI * 2;
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
