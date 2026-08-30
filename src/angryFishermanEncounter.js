import { CONFIG, encounterConfig } from "./config.js";
import { centeredRect } from "./collision.js";
import { nearestObstacleRow, obstacleRowCenter } from "./rowGeometry.js";

export const FISHERMAN_STATES = {
  INACTIVE: "INACTIVE",
  ENTERING: "ENTERING",
  MOVING_TO_LANE: "MOVING_TO_LANE",
  WINDUP: "WINDUP",
  THROWING: "THROWING",
  WALLET_AIRBORNE: "WALLET_AIRBORNE",
  COOLDOWN: "COOLDOWN",
  EXITING: "EXITING",
  WALLET_LOSS_PAUSE: "WALLET_LOSS_PAUSE",
  WALLET_LOSS_EXIT: "WALLET_LOSS_EXIT",
  COMPLETE: "COMPLETE"
};

export const THROWABLES = [
  createThrowable({
    id: "bottle",
    airborneAssetKey: "bottle",
    waterAssetKey: "bottleWater",
    airborneTargetWidth: 62,
    airborneVisualAspectRatio: 1220 / 1138,
    collisionSize: { width: 62, height: 30 },
    waterTargetWidth: 92,
    waterVisualAspectRatio: 1240 / 1251,
    collisionScale: 0.68,
    speedMultiplier: 1.03,
    bobAmount: 2
  }),
  createThrowable({
    id: "can",
    airborneAssetKey: "can",
    waterAssetKey: "canWater",
    airborneTargetWidth: 42,
    airborneVisualAspectRatio: 1066 / 994,
    collisionSize: { width: 42, height: 32 },
    waterTargetWidth: 72,
    waterVisualAspectRatio: 1239 / 1167,
    collisionScale: 0.7,
    speedMultiplier: 1.08,
    bobAmount: 2
  }),
  createThrowable({
    id: "life-vest",
    airborneAssetKey: "lifeVest",
    waterAssetKey: "lifeVestWater",
    airborneTargetWidth: 72,
    airborneVisualAspectRatio: 1343 / 1140,
    collisionSize: { width: 72, height: 54 },
    waterTargetWidth: 104,
    waterVisualAspectRatio: 1516 / 975,
    collisionScale: 0.72,
    speedMultiplier: 0.92,
    bobAmount: 3
  }),
  createThrowable({
    id: "life-ring",
    airborneAssetKey: "lifeRing",
    waterAssetKey: "lifeRingWater",
    airborneTargetWidth: 76,
    airborneVisualAspectRatio: 1031 / 1192,
    collisionSize: { width: 76, height: 58 },
    waterTargetWidth: 108,
    waterVisualAspectRatio: 1471 / 1011,
    collisionScale: 0.72,
    speedMultiplier: 0.9,
    bobAmount: 3
  }),
  createThrowable({
    id: "sandwich",
    airborneAssetKey: "sandwich",
    waterAssetKey: "sandwichWater",
    airborneTargetWidth: 54,
    airborneVisualAspectRatio: 1090 / 1087,
    collisionSize: { width: 54, height: 38 },
    waterTargetWidth: 84,
    waterVisualAspectRatio: 1254 / 1226,
    collisionScale: 0.7,
    speedMultiplier: 1,
    bobAmount: 2
  }),
  createThrowable({
    id: "wallet",
    airborneAssetKey: "wallet",
    waterAssetKey: "walletWater",
    airborneTargetWidth: 58,
    airborneVisualAspectRatio: 891 / 709,
    collisionSize: { width: 58, height: 46 },
    waterTargetWidth: 88,
    waterVisualAspectRatio: 1391 / 1009,
    collisionScale: 0.7,
    speedMultiplier: CONFIG.FISHERMAN_WALLET_SPEED_MULTIPLIER,
    bobAmount: 2
  })
];

export const WALLET_THROWABLE_ID = "wallet";
export const ORDINARY_THROW_SEQUENCE = ["bottle", "can", "sandwich", "life-ring", "bottle", "life-vest"];
export const FISHERMAN_THROW_ROWS = [1, 4, 2, 5, 0, 3, 2];

const WalletState = {
  WAITING: "WAITING",
  AIRBORNE: "AIRBORNE",
  LANDED: "LANDED"
};

export class AngryFishermanEncounter {
  constructor(random = () => 0) {
    this.id = "angry-fisherman";
    const config = encounterConfig(this.id);
    this.type = "major";
    this.exclusive = true;
    this.pauseNormalSpawns = true;
    this.startTimeMs = config?.startTimeMs ?? CONFIG.FIRST_ENCOUNTER_TIME_MS;
    this.difficultyStageOnComplete = config?.difficultyStageOnComplete ?? null;
    this.random = random;
    this.resetInternal();
  }

  canStart(gameState) {
    return gameState.elapsedMs >= this.startTimeMs;
  }

  start(gameState = null) {
    this.resetInternal();
    this.lastGameState = gameState;
    this.throwOrder = createThrowOrder(this.random);
    this.throwRows = [...FISHERMAN_THROW_ROWS];
    this.state = FISHERMAN_STATES.ENTERING;
    this.x = CONFIG.WIDTH + this.boatWidth / 2 + 20;
    this.y = boatYForTargetRow(this.throwRows[0]);
  }

  update(dt, gameState) {
    this.lastGameState = gameState;
    this.projectiles = this.projectiles.filter((projectile) => updateProjectile(projectile, dt, gameState));

    if (this.state === FISHERMAN_STATES.ENTERING) {
      this.x = Math.max(CONFIG.FISHERMAN_STOP_X, this.x - CONFIG.FISHERMAN_ENTRY_SPEED * dt);
      if (this.x === CONFIG.FISHERMAN_STOP_X) {
        this.chooseNextLane();
      }
      return;
    }

    if (this.state === FISHERMAN_STATES.MOVING_TO_LANE) {
      this.moveTowardTargetLane(dt);
      return;
    }

    if (this.state === FISHERMAN_STATES.WINDUP) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.throwNextItem(gameState);
      }
      return;
    }

    if (this.state === FISHERMAN_STATES.THROWING) {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.ammoIndex >= this.throwOrder.length) {
          this.state = this.walletState === WalletState.AIRBORNE
            ? FISHERMAN_STATES.WALLET_AIRBORNE
            : FISHERMAN_STATES.EXITING;
        } else {
          this.timer = randomThrowIntervalSeconds();
          this.state = FISHERMAN_STATES.COOLDOWN;
        }
      }
      return;
    }

    if (this.state === FISHERMAN_STATES.WALLET_AIRBORNE) {
      return;
    }

    if (this.state === FISHERMAN_STATES.COOLDOWN) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.chooseNextLane();
      }
      return;
    }

    if (this.state === FISHERMAN_STATES.WALLET_LOSS_PAUSE) {
      if (this.walletLandedThisFrame) {
        this.walletLandedThisFrame = false;
        return;
      }

      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this.state = FISHERMAN_STATES.WALLET_LOSS_EXIT;
      }
      return;
    }

    if (this.state === FISHERMAN_STATES.EXITING || this.state === FISHERMAN_STATES.WALLET_LOSS_EXIT) {
      const exitSpeed = this.state === FISHERMAN_STATES.WALLET_LOSS_EXIT
        ? CONFIG.FISHERMAN_WALLET_LOSS_EXIT_SPEED
        : CONFIG.FISHERMAN_EXIT_SPEED;
      this.x += exitSpeed * dt;
      if (this.x - this.boatWidth / 2 > CONFIG.WIDTH && this.projectiles.length === 0) {
        this.state = FISHERMAN_STATES.COMPLETE;
      }
    }
  }

  render(ctx, gameState) {
    if (this.state === FISHERMAN_STATES.INACTIVE || this.state === FISHERMAN_STATES.COMPLETE) return;

    for (const projectile of this.projectiles) {
      drawProjectile(ctx, projectile, gameState.assets);
    }

    const image = this.lossSpriteActive
      ? gameState.assets.angryFishermanLoss
      : this.state === FISHERMAN_STATES.THROWING || this.state === FISHERMAN_STATES.WALLET_AIRBORNE
        ? gameState.assets.angryFishermanToss
        : gameState.assets.angryFisherman;
    if (!image) return;

    const boundsImage = gameState.assets.angryFisherman ?? image;
    const height = boundsImage.height * (this.boatWidth / boundsImage.width);
    ctx.save();
    ctx.drawImage(image, this.x - this.boatWidth / 2, this.y - height / 2, this.boatWidth, height);
    ctx.restore();
  }

  isComplete() {
    return this.state === FISHERMAN_STATES.COMPLETE;
  }

  cleanup(gameState = null) {
    const cleanupState = gameState ?? this.lastGameState;
    cleanupState?.obstacles?.clearEncounterObstaclesBySource?.(this.id);
    this.resetInternal();
  }

  projectileHitboxes() {
    return this.projectiles.map(projectileHitbox);
  }

  resetInternal() {
    this.state = FISHERMAN_STATES.INACTIVE;
    this.x = CONFIG.WIDTH;
    this.y = CONFIG.SURF_BOUNDS.top;
    this.targetLane = this.y;
    this.lastLane = null;
    this.timer = 0;
    this.ammoIndex = 0;
    this.throwOrder = [];
    this.throwRows = [];
    this.walletState = WalletState.WAITING;
    this.walletLandingHandled = false;
    this.walletLandedThisFrame = false;
    this.lossSpriteActive = false;
    this.projectiles = [];
    this.lastGameState = null;
    this.boatWidth = CONFIG.FISHERMAN_DISPLAY_WIDTH;
  }

  chooseNextLane() {
    const targetRow = this.throwRows[this.ammoIndex] ?? nearestObstacleRow(this.y + 26);
    const lane = boatYForTargetRow(targetRow);
    this.lastLane = lane;
    this.targetRow = targetRow;
    this.targetLane = lane;
    this.state = FISHERMAN_STATES.MOVING_TO_LANE;
  }

  moveTowardTargetLane(dt) {
    const delta = this.targetLane - this.y;
    const step = CONFIG.FISHERMAN_LANE_SPEED * dt;
    if (Math.abs(delta) <= Math.max(step, CONFIG.FISHERMAN_LANE_SNAP_DISTANCE)) {
      this.y = this.targetLane;
      this.timer = CONFIG.FISHERMAN_THROW_WINDUP_MS / 1000;
      this.state = FISHERMAN_STATES.WINDUP;
      return;
    }

    this.y += Math.sign(delta) * step;
  }

  throwNextItem(gameState = null) {
    const item = throwableById(this.throwOrder[this.ammoIndex]);
    const row = this.throwRows[this.ammoIndex] ?? nearestObstacleRow(this.y + 26);
    this.ammoIndex += 1;
    const projectile = createProjectile(item, this.x, this.y, {
      row,
      patternId: "angry-fisherman-throw",
      onLanded: item.id === WALLET_THROWABLE_ID ? () => this.handleWalletLanded() : null
    });
    if (item.id === WALLET_THROWABLE_ID) {
      this.walletState = WalletState.AIRBORNE;
      gameState?.music?.transitionToRowboatFinale?.();
    }
    this.projectiles.push(projectile);
    this.timer = CONFIG.FISHERMAN_POST_THROW_DELAY_MS / 1000;
    this.state = FISHERMAN_STATES.THROWING;
  }

  handleWalletLanded() {
    if (this.walletLandingHandled) return;
    this.walletLandingHandled = true;
    this.walletState = WalletState.LANDED;
    this.walletLandedThisFrame = true;
    this.lossSpriteActive = true;
    this.timer = CONFIG.FISHERMAN_WALLET_LOSS_PAUSE_SECONDS;
    this.state = FISHERMAN_STATES.WALLET_LOSS_PAUSE;
  }
}

export function createThrowOrder(random = () => 0) {
  return [...ORDINARY_THROW_SEQUENCE, WALLET_THROWABLE_ID];
}

export function createProjectile(item, boatX, boatY, options = {}) {
  const startX = boatX - 90;
  const startY = boatY - 32;
  const landingX = CONFIG.OBSTACLE_SUBMERGE_START_X + 290;
  const row = options.row ?? nearestObstacleRow(boatY + 26);
  const landingY = obstacleRowCenter(row);

  return {
    item,
    row,
    patternId: options.patternId ?? null,
    age: 0,
    duration: projectileDurationSeconds(item),
    startX,
    startY,
    landingX,
    landingY,
    impacted: false,
    onLanded: options.onLanded ?? null
  };
}

export function updateProjectile(projectile, dt, gameState) {
  if (projectile.impacted) return false;

  projectile.age += dt;
  const progress = Math.min(1, projectile.age / projectile.duration);

  if (progress < 1) return true;

  const { width, height } = waterRenderSize(projectile.item);

  projectile.impacted = true;
  gameState.obstacles.addObstacle({
    source: "angry-fisherman",
    assetKey: projectile.item.waterAssetKey,
    x: projectile.landingX,
    y: projectile.landingY,
    row: projectile.row,
    patternId: projectile.patternId,
    width,
    height,
    collisionWidth: projectile.item.collisionWidth,
    collisionHeight: projectile.item.collisionHeight,
    renderAnchor: projectile.item.waterAnchor,
    renderOffsetX: projectile.item.impactOffset.x,
    renderOffsetY: projectile.item.impactOffset.y,
    speed: CONFIG.FISHERMAN_THROWABLE_SPEED * projectile.item.speedMultiplier,
    collisionScale: projectile.item.collisionScale,
    bobAmount: projectile.item.bobAmount
  });
  projectile.onLanded?.(projectile);
  return false;
}

export function projectileHitbox(projectile) {
  const progress = Math.min(1, projectile.age / projectile.duration);
  const { x, y } = projectilePosition(projectile, progress);
  return centeredRect(
    x,
    y,
    projectile.item.collisionWidth * projectile.item.collisionScale,
    projectile.item.collisionHeight * projectile.item.collisionScale
  );
}

export function drawProjectile(ctx, projectile, assets) {
  const image = assets.throwables?.[projectile.item.airborneAssetKey];
  if (!image) return;

  const progress = Math.min(1, projectile.age / projectile.duration);
  const { x, y } = projectilePosition(projectile, progress);
  const { width, height } = airborneRenderSize(projectile.item);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5 + progress * 1.3);
  ctx.drawImage(
    image,
    -width * projectile.item.airborneAnchor.x,
    -height * projectile.item.airborneAnchor.y,
    width,
    height
  );
  ctx.restore();
}

export function airborneRenderSize(item) {
  return {
    width: item.airborneTargetWidth,
    height: item.airborneTargetWidth * item.airborneVisualAspectRatio
  };
}

export function waterRenderSize(item) {
  return {
    width: item.waterTargetWidth,
    height: item.waterTargetWidth / item.waterVisualAspectRatio
  };
}

export function projectilePosition(projectile, progress) {
  const x = lerp(projectile.startX, projectile.landingX, progress);
  const y = lerp(projectile.startY, projectile.landingY, progress) -
    Math.sin(progress * Math.PI) * CONFIG.FISHERMAN_PROJECTILE_ARC_HEIGHT;

  return { x, y };
}

export function projectileDurationSeconds(item) {
  const normalDuration = CONFIG.FISHERMAN_PROJECTILE_DURATION_MS / 1000;
  return item.id === WALLET_THROWABLE_ID ? normalDuration / item.speedMultiplier : normalDuration;
}

function chooseLane(lanes, previousLane) {
  const options = lanes.filter((lane) => lane !== previousLane);
  const pool = options.length ? options : lanes;
  return pool[0];
}

function boatYForTargetRow(row) {
  return obstacleRowCenter(row) - 26;
}

export function throwableById(id) {
  return THROWABLES.find((item) => item.id === id) ?? THROWABLES[0];
}

function createThrowable({
  id,
  airborneAssetKey,
  waterAssetKey,
  airborneTargetWidth,
  airborneVisualAspectRatio,
  collisionSize,
  waterTargetWidth,
  waterVisualAspectRatio,
  collisionScale,
  speedMultiplier,
  bobAmount,
  airborneAnchor = { x: 0.5, y: 0.5 },
  waterAnchor = { x: 0.5, y: 0.56 },
  impactOffset = { x: 0, y: 0 }
}) {
  return {
    id,
    airborneAssetKey,
    waterAssetKey,
    airborneTargetWidth,
    airborneVisualAspectRatio,
    waterTargetWidth,
    waterVisualAspectRatio,
    collisionWidth: collisionSize.width,
    collisionHeight: collisionSize.height,
    airborneAnchor,
    waterAnchor,
    impactOffset,
    collisionScale,
    speedMultiplier,
    bobAmount
  };
}

function randomThrowIntervalSeconds() {
  return ((CONFIG.FISHERMAN_THROW_INTERVAL_MIN_MS + CONFIG.FISHERMAN_THROW_INTERVAL_MAX_MS) / 2) / 1000;
}

function midpoint(a, b) {
  return a + (b - a) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
