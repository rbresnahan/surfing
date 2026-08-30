import { CONFIG } from "./config.js";
import { centeredRect } from "./collision.js";
import {
  THROWABLES,
  WALLET_THROWABLE_ID,
  airborneRenderSize,
  waterRenderSize
} from "./angryFishermanEncounter.js";

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
  GAP_LINE: "gap-line",
  SCATTER: "scatter"
};

export const COOLER_THROWABLES = THROWABLES.filter((item) => item.id !== WALLET_THROWABLE_ID);

const WAVE_COUNT = 3;
const COOLER_OPENING_OFFSET_X = -80;

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
    this.y = CONFIG.FISHERMAN_THROW_LANES[1] ?? midpoint(CONFIG.SURF_BOUNDS.top, CONFIG.SURF_BOUNDS.bottom);
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
      this.moveTowardTargetY(dt);
      this.releaseTimer -= dt;
      if (this.releaseTimer <= 0 && this.releaseIndex < this.activeWave.items.length) {
        this.releasePlannedItem(this.activeWave.items[this.releaseIndex]);
        this.releaseIndex += 1;
        this.releaseTimer = CONFIG.COOLER_ITEM_RELEASE_INTERVAL_SECONDS;
      }

      if (this.releaseIndex >= this.activeWave.items.length && this.drops.length === 0) {
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
    this.phase = COOLER_PHASES.DUMPING_WAVE;
  }

  releasePlannedItem(planItem) {
    const item = planItem.item;
    const startX = this.x + COOLER_OPENING_OFFSET_X;
    const startY = planItem.y - CONFIG.COOLER_DROP_DISTANCE_Y;
    const landingX = startX - CONFIG.COOLER_DROP_DISTANCE_X;
    const landingY = planItem.y;

    this.drops.push({
      item,
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
        gameState?.obstacles?.addObstacle?.(createWaterObstacle(drop.item, drop.landingX, drop.landingY));
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
    this.releaseIndex = 0;
    this.waveIndex = 0;
    this.completedWaves = 0;
    this.firstSide = null;
    this.waveSides = [];
    this.wavePlans = [];
    this.activeWave = null;
    this.lastReleasedItems = [];
    this.drops = [];
    this.started = false;
    this.lastGameState = null;
    this.boatWidth = CONFIG.FISHERMAN_DISPLAY_WIDTH;
  }
}

export function createCoolerWavePlan({ side, waveIndex = 0, previousPattern = null, random = Math.random }) {
  const pattern = choosePattern(previousPattern, waveIndex, random);
  const gap = chooseProtectedGap(random);
  const items = pattern === COOLER_WAVE_PATTERNS.GAP_LINE
    ? createGapLineItems(gap, random)
    : createScatterItems(gap, side, random);
  const plan = { waveNumber: waveIndex + 1, side, pattern, gap, items };

  if (!validateCoolerWavePlan(plan)) {
    return createFallbackGapLinePlan({ side, waveIndex, gap, random });
  }

  return plan;
}

export function validateCoolerWavePlan(plan) {
  if (!plan.items.length) return false;
  if (plan.items.some(({ item }) => item.id === WALLET_THROWABLE_ID)) return false;

  const gap = plan.gap;
  if (gap.bottom - gap.top < CONFIG.COOLER_PROTECTED_GAP_SIZE) return false;

  for (const planItem of plan.items) {
    const half = (planItem.item.collisionHeight * planItem.item.collisionScale) / 2;
    const blockedTop = planItem.y - half - surferHalfHeight() - safeGapMargin();
    const blockedBottom = planItem.y + half + surferHalfHeight() + safeGapMargin();
    if (blockedTop < gap.bottom && blockedBottom > gap.top) {
      return false;
    }
  }

  return hasNavigableGap(plan.items, gap);
}

export function createWaterObstacle(item, x, y) {
  const { width, height } = waterRenderSize(item);
  return {
    source: "angry-fisherman-cooler",
    assetKey: item.waterAssetKey,
    x,
    y,
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

function createGapLineItems(gap, random) {
  const laneCount = CONFIG.COOLER_ITEMS_PER_WAVE;
  const top = CONFIG.SURF_BOUNDS.top + 18;
  const bottom = CONFIG.SURF_BOUNDS.bottom - 18;
  const step = (bottom - top) / (laneCount - 1);
  const items = [];

  for (let i = 0; i < laneCount; i += 1) {
    const y = top + step * i;
    const item = randomCoolerThrowable(random);
    if (!isYAllowedByProtectedGap(item, y, gap)) continue;
    items.push({ item, y });
  }

  return items;
}

function createScatterItems(gap, side, random) {
  const items = [];
  const top = CONFIG.SURF_BOUNDS.top + 24;
  const bottom = CONFIG.SURF_BOUNDS.bottom - 24;
  const direction = side === "top" ? 1 : -1;

  for (let i = 0; i < CONFIG.COOLER_ITEMS_PER_WAVE; i += 1) {
    const sweep = i / Math.max(1, CONFIG.COOLER_ITEMS_PER_WAVE - 1);
    const baseY = direction === 1
      ? lerp(top, bottom, sweep)
      : lerp(bottom, top, sweep);
    const y = clamp(baseY + (random() - 0.5) * 74, top, bottom);
    const item = randomCoolerThrowable(random);
    if (!isYAllowedByProtectedGap(item, y, gap)) continue;
    items.push({ item, y });
  }

  return items;
}

function isYAllowedByProtectedGap(item, y, gap) {
  const half = (item.collisionHeight * item.collisionScale) / 2;
  const blockedTop = y - half - surferHalfHeight() - safeGapMargin();
  const blockedBottom = y + half + surferHalfHeight() + safeGapMargin();
  return blockedTop >= gap.bottom || blockedBottom <= gap.top;
}

function createFallbackGapLinePlan({ side, waveIndex, gap, random }) {
  return {
    waveNumber: waveIndex + 1,
    side,
    pattern: COOLER_WAVE_PATTERNS.GAP_LINE,
    gap,
    items: createGapLineItems(gap, random)
  };
}

function choosePattern(previousPattern, waveIndex, random) {
  if (waveIndex === 2 && previousPattern) return oppositePattern(previousPattern);
  return random() < 0.5 ? COOLER_WAVE_PATTERNS.GAP_LINE : COOLER_WAVE_PATTERNS.SCATTER;
}

function chooseProtectedGap(random) {
  const margin = CONFIG.COOLER_PROTECTED_GAP_SIZE / 2;
  const center = lerp(CONFIG.SURF_BOUNDS.top + margin, CONFIG.SURF_BOUNDS.bottom - margin, random());
  return {
    top: center - margin,
    bottom: center + margin
  };
}

function hasNavigableGap(items, gap) {
  const surferHalf = surferHalfHeight();
  const center = midpoint(gap.top, gap.bottom);
  const surferBox = centeredRect(CONFIG.SURF_BOUNDS.left + 20, center, 1, surferHalf * 2);
  return items.every(({ item, y }) => {
    const itemBox = centeredRect(
      CONFIG.SURF_BOUNDS.left + 20,
      y,
      1,
      item.collisionHeight * item.collisionScale + safeGapMargin() * 2
    );
    return !rectsOverlapY(surferBox, itemBox);
  });
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

function surferHalfHeight() {
  return (CONFIG.SURFER_DISPLAY_HEIGHT * CONFIG.SURFER_HITBOX_SCALE_Y) / 2;
}

function safeGapMargin() {
  return (CONFIG.COOLER_PROTECTED_GAP_SIZE - CONFIG.SURFER_DISPLAY_HEIGHT * CONFIG.SURFER_HITBOX_SCALE_Y) / 2;
}

function rectsOverlapY(a, b) {
  return a.y < b.y + b.height && a.y + a.height > b.y;
}

function midpoint(a, b) {
  return a + (b - a) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
