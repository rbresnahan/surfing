import { CONFIG } from "./config.js";
import { centeredRect } from "./collision.js";
import {
  THROWABLES,
  WALLET_THROWABLE_ID,
  airborneRenderSize,
  waterRenderSize
} from "./angryFishermanEncounter.js";
import { instantiatePattern, PATTERN_BY_ID } from "./obstaclePatterns.js";
import { obstacleRowCenter, rowsForOpening } from "./rowGeometry.js";
import { validateObstacleTimeline } from "./patternValidator.js";

export const COOLER_PHASES = {
  WAITING: "waiting",
  ENTERING: "entering",
  POSITIONING: "positioning",
  PREPARING_WAVE: "preparing-wave",
  DUMPING_WAVE: "dumping-wave",
  BETWEEN_WAVES: "between-waves",
  EXITING: "exiting",
  COMPLETE: "complete"
};

export const COOLER_WAVE_PATTERNS = {
  GAP_LINE: "cooler-row-gate",
  SCATTER: "cooler-stagger",
  FINALE: "cooler-finale"
};

export const COOLER_THROWABLES = THROWABLES.filter((item) => item.id !== WALLET_THROWABLE_ID);

const WAVE_COUNT = 3;
const COOLER_OPENING_OFFSET_X = -80;
const COOLER_RELEASE_POINT_OFFSET_Y = 0;

export class CoolerFishermanEncounter {
  constructor(random = Math.random) {
    this.id = "angry-fisherman-cooler";
    this.type = "scripted";
    this.exclusive = true;
    this.pauseNormalSpawns = true;
    this.postEncounterGraceSeconds = CONFIG.COOLER_POST_ENCOUNTER_GRACE_SECONDS;
    this.random = random;
    this.resetInternal();
  }

  canStart(gameState) {
    return this.phase === COOLER_PHASES.WAITING && gameState.elapsedMs >= CONFIG.COOLER_ENCOUNTER_TIME_MS;
  }

  start() {
    this.resetInternal();
    this.phase = COOLER_PHASES.ENTERING;
    this.started = true;
    this.x = CONFIG.WIDTH + this.boatWidth / 2 + 20;
    this.y = obstacleRowCenter(2) - 26;
    this.firstSide = this.random() < 0.5 ? "top" : "bottom";
    this.waveSides = Array.from({ length: WAVE_COUNT }, (_, index) =>
      index % 2 === 0 ? this.firstSide : oppositeSide(this.firstSide)
    );
    this.targetY = attackY(this.waveSides[0]);
  }

  update(dt, gameState) {
    this.lastGameState = gameState;
    this.updateDrops(dt, gameState);

    if (this.phase === COOLER_PHASES.ENTERING) {
      this.x = Math.max(CONFIG.FISHERMAN_STOP_X, this.x - CONFIG.COOLER_BOAT_ENTRY_SPEED * dt);
      if (this.x === CONFIG.FISHERMAN_STOP_X) {
        this.phase = COOLER_PHASES.POSITIONING;
      }
      return;
    }

    if (this.phase === COOLER_PHASES.POSITIONING) {
      if (this.moveTowardTargetY(dt)) {
        this.timer = 0.2;
        this.phase = COOLER_PHASES.PREPARING_WAVE;
      }
      return;
    }

    if (this.phase === COOLER_PHASES.PREPARING_WAVE) {
      if (gameState.obstacles?.activeEvent) return;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.beginDumpingWave();
      }
      return;
    }

    if (this.phase === COOLER_PHASES.DUMPING_WAVE) {
      const previousReleaseY = this.releasePoint().y;
      const reachedTarget = this.moveTowardTargetY(dt);
      const currentReleaseY = this.releasePoint().y;
      this.releaseTimer -= dt;
      this.dumpElapsed += dt;
      this.releaseCrossing(previousReleaseY, currentReleaseY);

      if (reachedTarget && this.releaseIndex >= this.activeWave.items.length && this.drops.length === 0) {
        this.completedWaves += 1;
        this.waveIndex += 1;
        this.activeWave = null;
        this.releaseTimer = 0;

        if (this.completedWaves >= WAVE_COUNT) {
          this.timer = CONFIG.COOLER_FINAL_PRE_EXIT_PAUSE_SECONDS;
          this.phase = COOLER_PHASES.BETWEEN_WAVES;
        } else {
          this.timer = CONFIG.COOLER_BETWEEN_WAVE_PAUSE_SECONDS;
          this.targetY = attackY(this.waveSides[this.waveIndex]);
          this.phase = COOLER_PHASES.BETWEEN_WAVES;
        }
      }
      return;
    }

    if (this.phase === COOLER_PHASES.BETWEEN_WAVES) {
      this.timer -= dt;
      if (this.timer > 0) return;

      if (this.completedWaves >= WAVE_COUNT) {
        this.phase = COOLER_PHASES.EXITING;
      } else {
        this.phase = COOLER_PHASES.POSITIONING;
      }
      return;
    }

    if (this.phase === COOLER_PHASES.EXITING) {
      this.x += CONFIG.COOLER_EXIT_SPEED * dt;
      if (this.x - this.boatWidth / 2 > CONFIG.WIDTH && this.drops.length === 0) {
        this.phase = COOLER_PHASES.COMPLETE;
      }
    }
  }

  render(ctx, gameState) {
    if (this.phase === COOLER_PHASES.WAITING || this.phase === COOLER_PHASES.COMPLETE) return;

    for (const drop of this.drops) {
      drawDrop(ctx, drop, gameState.assets);
    }

    const image = this.isDumping() ? gameState.assets.angryFishermanCoolerDump : gameState.assets.angryFishermanCooler;
    if (!image) return;

    const boundsImage = gameState.assets.angryFishermanCooler ?? image;
    const height = boundsImage.height * (this.boatWidth / boundsImage.width);
    ctx.save();
    ctx.drawImage(image, this.x - this.boatWidth / 2, this.y - height / 2, this.boatWidth, height);
    ctx.restore();
  }

  isComplete() {
    return this.phase === COOLER_PHASES.COMPLETE;
  }

  cleanup(gameState = null) {
    if (this.phase !== COOLER_PHASES.COMPLETE) {
      const cleanupState = gameState ?? this.lastGameState;
      cleanupState?.obstacles?.clearEncounterObstaclesBySource?.(this.id);
    }
    this.resetInternal();
  }

  projectileHitboxes() {
    return this.drops.map(dropHitbox);
  }

  isDumping() {
    return this.phase === COOLER_PHASES.DUMPING_WAVE;
  }

  beginDumpingWave() {
    const side = this.waveSides[this.waveIndex];
    const previousPattern = this.wavePlans.at(-1)?.pattern ?? null;
    this.activeWave = createCoolerWavePlan({
      side,
      waveIndex: this.waveIndex,
      previousPattern,
      random: this.random
    });
    this.wavePlans.push(this.activeWave);
    this.targetY = attackY(oppositeSide(side));
    this.releaseIndex = 0;
    this.releaseTimer = 0;
    this.dumpElapsed = 0;
    this.processedRowCrossings = new Set();
    this.phase = COOLER_PHASES.DUMPING_WAVE;
  }

  releaseCrossing(previousReleaseY, currentReleaseY) {
    if (!this.activeWave || this.releaseIndex >= this.activeWave.items.length) return;
    const direction = Math.sign(currentReleaseY - previousReleaseY);
    if (direction === 0) return;

    let selectedItem = null;
    let selectedIndex = -1;

    for (let index = this.releaseIndex; index < this.activeWave.items.length; index += 1) {
      const planItem = this.activeWave.items[index];
      const rowY = obstacleRowCenter(planItem.row);
      const crossed = direction > 0
        ? previousReleaseY <= rowY && currentReleaseY >= rowY
        : previousReleaseY >= rowY && currentReleaseY <= rowY;

      if (!crossed) {
        const stale = direction > 0 ? rowY < currentReleaseY : rowY > currentReleaseY;
        if (!stale) break;
        this.releaseIndex = index + 1;
        continue;
      }

      selectedItem = planItem;
      selectedIndex = index;
    }

    if (!selectedItem) return;

    this.releaseIndex = selectedIndex + 1;
    if (this.processedRowCrossings.has(selectedItem.row)) return;

    this.processedRowCrossings.add(selectedItem.row);
    this.releasePlannedItem(selectedItem);
  }

  releasePoint() {
    return {
      x: this.x + COOLER_OPENING_OFFSET_X,
      y: this.y + COOLER_RELEASE_POINT_OFFSET_Y
    };
  }

  releasePlannedItem(planItem) {
    const item = planItem.item;
    const releasePoint = this.releasePoint();
    const startX = releasePoint.x;
    const rowY = obstacleRowCenter(planItem.row);
    const startY = rowY;
    const landingX = startX - CONFIG.COOLER_DROP_DISTANCE_X;
    const landingY = rowY;

    this.drops.push({
      item,
      row: planItem.row,
      patternId: this.activeWave.pattern,
      age: 0,
      duration: CONFIG.COOLER_DROP_DURATION_SECONDS,
      startX,
      startY,
      landingX,
      landingY,
      impacted: false
    });

    this.lastReleasedItems.push(item.id);
  }

  updateDrops(dt, gameState) {
    this.drops = this.drops.filter((drop) => {
      drop.age += dt;
      if (drop.age < drop.duration) return true;

      if (!drop.impacted) {
        drop.impacted = true;
        gameState?.obstacles?.addObstacle?.(createWaterObstacle(drop.item, drop.landingX, drop.landingY, {
          row: drop.row,
          patternId: drop.patternId
        }));
      }
      return false;
    });
  }

  moveTowardTargetY(dt) {
    const delta = this.targetY - this.y;
    const step = CONFIG.COOLER_BOAT_VERTICAL_SPEED * dt;
    if (Math.abs(delta) <= step) {
      this.y = this.targetY;
      return true;
    }

    this.y += Math.sign(delta) * step;
    return false;
  }

  resetInternal() {
    this.phase = COOLER_PHASES.WAITING;
    this.x = CONFIG.WIDTH;
    this.y = CONFIG.SURF_BOUNDS.top;
    this.targetY = this.y;
    this.timer = 0;
    this.releaseTimer = 0;
    this.dumpElapsed = 0;
    this.releaseIndex = 0;
    this.waveIndex = 0;
    this.completedWaves = 0;
    this.firstSide = null;
    this.waveSides = [];
    this.wavePlans = [];
    this.activeWave = null;
    this.lastReleasedItems = [];
    this.drops = [];
    this.processedRowCrossings = new Set();
    this.started = false;
    this.lastGameState = null;
    this.boatWidth = CONFIG.FISHERMAN_DISPLAY_WIDTH;
  }
}

export function createCoolerWavePlan({ side, waveIndex = 0, previousPattern = null, random = Math.random }) {
  const pattern = createCoolerPattern(choosePattern(previousPattern, waveIndex, random), side, random);
  const items = createPatternItems(pattern, random);
  const plan = {
    waveNumber: waveIndex + 1,
    side,
    pattern: pattern.id,
    gap: openingForPattern(pattern),
    items
  };

  if (!validateCoolerWavePlan(plan)) {
    return createFallbackGapLinePlan({ side, waveIndex, gap: plan.gap, random });
  }

  return plan;
}

export function validateCoolerWavePlan(plan) {
  if (!plan.items.length) return false;
  if (plan.items.some(({ item }) => item.id === WALLET_THROWABLE_ID)) return false;
  if (plan.items.some(({ row }) => !Number.isInteger(row))) return false;

  return validateObstacleTimeline(plan.items.map((planItem) => ({
    row: planItem.row,
    y: planItem.y ?? obstacleRowCenter(planItem.row),
    x: CONFIG.FISHERMAN_STOP_X + COOLER_OPENING_OFFSET_X - CONFIG.COOLER_DROP_DISTANCE_X +
      releaseOffsetForRow(planItem.row, plan.side) * CONFIG.FISHERMAN_THROWABLE_SPEED,
    timeOffset: releaseOffsetForRow(planItem.row, plan.side),
    collisionWidth: planItem.item.collisionWidth,
    collisionHeight: planItem.item.collisionHeight,
    collisionScale: planItem.item.collisionScale,
    speed: CONFIG.FISHERMAN_THROWABLE_SPEED * planItem.item.speedMultiplier
  })), {
    speed: CONFIG.FISHERMAN_THROWABLE_SPEED,
    surferY: midpoint(CONFIG.SURF_BOUNDS.top, CONFIG.SURF_BOUNDS.bottom)
  }).valid;
}

export function createWaterObstacle(item, x, y, options = {}) {
  const { width, height } = waterRenderSize(item);
  return {
    source: "angry-fisherman-cooler",
    assetKey: item.waterAssetKey,
    x,
    y,
    row: options.row,
    patternId: options.patternId ?? null,
    width,
    height,
    collisionWidth: item.collisionWidth,
    collisionHeight: item.collisionHeight,
    renderAnchor: item.waterAnchor,
    renderOffsetX: item.impactOffset.x,
    renderOffsetY: item.impactOffset.y,
    speed: CONFIG.FISHERMAN_THROWABLE_SPEED * item.speedMultiplier,
    collisionScale: item.collisionScale,
    bobAmount: item.bobAmount
  };
}

export function coolerDropPosition(drop) {
  const progress = Math.min(1, drop.age / drop.duration);
  return {
    x: lerp(drop.startX, drop.landingX, progress),
    y: lerp(drop.startY, drop.landingY, progress)
  };
}

function drawDrop(ctx, drop, assets) {
  const image = assets.throwables?.[drop.item.airborneAssetKey];
  if (!image) return;

  const { x, y } = coolerDropPosition(drop);
  const { width, height } = airborneRenderSize(drop.item);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.2 + (drop.age / drop.duration) * 0.5);
  ctx.drawImage(
    image,
    -width * drop.item.airborneAnchor.x,
    -height * drop.item.airborneAnchor.y,
    width,
    height
  );
  ctx.restore();
}

function dropHitbox(drop) {
  const { x, y } = coolerDropPosition(drop);
  return centeredRect(
    x,
    y,
    drop.item.collisionWidth * drop.item.collisionScale,
    drop.item.collisionHeight * drop.item.collisionScale
  );
}

function createFallbackGapLinePlan({ side, waveIndex, gap, random }) {
  const pattern = createCoolerPattern(COOLER_WAVE_PATTERNS.GAP_LINE, side, random);
  return {
    waveNumber: waveIndex + 1,
    side,
    pattern: pattern.id,
    gap: gap ?? openingForPattern(pattern),
    items: createPatternItems(pattern, random)
  };
}

function choosePattern(previousPattern, waveIndex, random) {
  if (waveIndex === 2) return COOLER_WAVE_PATTERNS.FINALE;
  const selected = random() < 0.5 ? COOLER_WAVE_PATTERNS.GAP_LINE : COOLER_WAVE_PATTERNS.SCATTER;
  return selected === previousPattern ? oppositePattern(selected) : selected;
}

function createCoolerPattern(patternId, side, random) {
  const base = patternId === COOLER_WAVE_PATTERNS.GAP_LINE
    ? PATTERN_BY_ID["center-gate"]
    : patternId === COOLER_WAVE_PATTERNS.SCATTER
      ? PATTERN_BY_ID["sweeping-staircase"]
      : PATTERN_BY_ID["split-clusters"];
  const pattern = instantiatePattern(base, { random, mirror: side === "bottom" });
  return {
    ...pattern,
    id: patternId,
    side,
    obstacles: pattern.obstacles.map((obstacle) => ({
      ...obstacle,
      timeOffset: obstacle.timeOffset
    }))
  };
}

function createPatternItems(pattern, random) {
  const direction = releaseDirectionForSide(pattern.side);
  const plannedRows = new Set();
  return pattern.obstacles
    .filter((obstacle) => {
      if (plannedRows.has(obstacle.row)) return false;
      plannedRows.add(obstacle.row);
      return true;
    })
    .map((obstacle) => ({
      item: randomCoolerThrowable(random),
      row: obstacle.row,
      y: obstacleRowCenter(obstacle.row),
      releaseOffset: releaseOffsetForRow(obstacle.row, pattern.side)
    }))
    .sort((a, b) => direction * (a.row - b.row));
}

function openingForPattern(pattern) {
  const occupied = new Set(pattern.obstacles.filter((obstacle) => obstacle.timeOffset === 0).map((obstacle) => obstacle.row));
  const openRows = rowsForOpening([...occupied]);
  if (!openRows.length) {
    return {
      top: CONFIG.SURF_BOUNDS.top,
      bottom: CONFIG.SURF_BOUNDS.bottom
    };
  }
  return {
    top: obstacleRowCenter(Math.min(...openRows)) - CONFIG.COOLER_PROTECTED_GAP_SIZE / 2,
    bottom: obstacleRowCenter(Math.max(...openRows)) + CONFIG.COOLER_PROTECTED_GAP_SIZE / 2
  };
}

function randomCoolerThrowable(random) {
  return COOLER_THROWABLES[Math.floor(random() * COOLER_THROWABLES.length)];
}

function oppositeSide(side) {
  return side === "top" ? "bottom" : "top";
}

function oppositePattern(pattern) {
  return pattern === COOLER_WAVE_PATTERNS.GAP_LINE
    ? COOLER_WAVE_PATTERNS.SCATTER
    : COOLER_WAVE_PATTERNS.GAP_LINE;
}

function attackY(side) {
  return CONFIG.COOLER_ATTACK_POSITIONS[side];
}

function releaseDirectionForSide(side) {
  return side === "top" ? 1 : -1;
}

function releaseOffsetForRow(row, side) {
  const startY = attackY(side) + COOLER_RELEASE_POINT_OFFSET_Y;
  return Math.abs(obstacleRowCenter(row) - startY) / CONFIG.COOLER_BOAT_VERTICAL_SPEED;
}

function midpoint(a, b) {
  return a + (b - a) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
