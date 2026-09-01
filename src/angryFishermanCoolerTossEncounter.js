import { CONFIG } from "./config.js";
import { centeredRect } from "./collision.js";
import { obstacleRowCenter } from "./rowGeometry.js";

export const COOLER_TOSS_PHASES = {
  WAITING: "waiting",
  ENTERING: "entering",
  HOLDING: "holding",
  WINDUP: "windup",
  THROWING: "throwing",
  POST_THROW: "post-throw",
  EXITING: "exiting",
  COMPLETE: "complete"
};

const ATTACK_COOLER = {
  id: "attack-cooler",
  airborneAssetKey: "attackCooler",
  waterAssetKey: "attackCoolerWater",
  airborneTargetWidth: CONFIG.COOLER_TOSS_ATTACK_COOLER_WIDTH,
  airborneVisualAspectRatio: 1109 / 1363,
  waterTargetWidth: CONFIG.COOLER_TOSS_WATER_COOLER_WIDTH,
  waterVisualAspectRatio: 1,
  collisionWidth: 84,
  collisionHeight: 62,
  collisionScale: 0.74,
  speedMultiplier: 0.86,
  bobAmount: 3,
  airborneAnchor: { x: 0.5, y: 0.5 },
  waterAnchor: { x: 0.5, y: 0.56 },
  impactOffset: { x: 0, y: 0 }
};

export class AngryFishermanCoolerTossEncounter {
  constructor(random = () => 0, occurrenceConfig = null) {
    this.id = "angry-fisherman-cooler-toss";
    const config = occurrenceConfig ?? {};
    this.type = "scripted";
    this.exclusive = true;
    this.pauseNormalSpawns = true;
    this.startTimeMs = config.startTimeMs ?? null;
    this.difficultyStageOnComplete = config.difficultyStageOnComplete ?? null;
    this.postEncounterGraceSeconds = config.postEncounterGraceSeconds ?? 0;
    this.random = random ?? (() => 0);
    this.resetInternal();
  }

  canStart(gameState) {
    return this.phase === COOLER_TOSS_PHASES.WAITING &&
      Number.isFinite(this.startTimeMs) &&
      gameState.elapsedMs >= this.startTimeMs;
  }

  canStartWithHandoff(handoff) {
    return handoff?.targetEncounterId === this.id && Number.isFinite(handoff?.boat?.x) && Number.isFinite(handoff?.boat?.y);
  }

  start(gameState = null) {
    this.resetInternal();
    this.lastGameState = gameState;
    this.occurrenceId = gameState?.occurrenceId ?? null;
    this.diagnostics = gameState?.diagnostics ?? null;
    const handoff = gameState?.encounterHandoff ?? null;

    if (this.canStartWithHandoff(handoff)) {
      this.x = handoff.boat.x;
      this.y = handoff.boat.y;
      this.boatWidth = handoff.boat.width ?? this.boatWidth;
      this.timer = CONFIG.COOLER_TOSS_HOLD_SECONDS;
      this.phase = COOLER_TOSS_PHASES.HOLDING;
      return;
    }

    this.x = CONFIG.WIDTH + this.boatWidth / 2 + 20;
    this.y = obstacleRowCenter(CONFIG.COOLER_TOSS_LANDING_ROW) - 26;
    this.phase = COOLER_TOSS_PHASES.ENTERING;
  }

  update(dt, gameState) {
    this.lastGameState = gameState;
    this.projectiles = this.projectiles.filter((projectile) => updateCoolerProjectile(projectile, dt, gameState));

    if (this.phase === COOLER_TOSS_PHASES.ENTERING) {
      this.x = Math.max(CONFIG.FISHERMAN_STOP_X, this.x - CONFIG.COOLER_BOAT_ENTRY_SPEED * dt);
      if (this.x === CONFIG.FISHERMAN_STOP_X) {
        this.timer = CONFIG.COOLER_TOSS_HOLD_SECONDS;
        this.phase = COOLER_TOSS_PHASES.HOLDING;
      }
      return;
    }

    if (this.phase === COOLER_TOSS_PHASES.HOLDING) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = CONFIG.COOLER_TOSS_WINDUP_SECONDS;
        this.phase = COOLER_TOSS_PHASES.WINDUP;
      }
      return;
    }

    if (this.phase === COOLER_TOSS_PHASES.WINDUP) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.throwCooler(gameState);
      }
      return;
    }

    if (this.phase === COOLER_TOSS_PHASES.THROWING) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = CONFIG.COOLER_TOSS_POST_THROW_SECONDS;
        this.phase = COOLER_TOSS_PHASES.POST_THROW;
      }
      return;
    }

    if (this.phase === COOLER_TOSS_PHASES.POST_THROW) {
      this.timer -= dt;
      if (this.timer <= 0 && this.projectiles.length === 0) {
        this.phase = COOLER_TOSS_PHASES.EXITING;
      }
      return;
    }

    if (this.phase === COOLER_TOSS_PHASES.EXITING) {
      this.x += CONFIG.COOLER_EXIT_SPEED * dt;
      if (this.x - this.boatWidth / 2 > CONFIG.WIDTH && this.projectiles.length === 0) {
        this.phase = COOLER_TOSS_PHASES.COMPLETE;
      }
    }
  }

  render(ctx, gameState) {
    if (this.phase === COOLER_TOSS_PHASES.WAITING || this.phase === COOLER_TOSS_PHASES.COMPLETE) return;

    for (const projectile of this.projectiles) {
      drawCoolerProjectile(ctx, projectile, gameState.assets);
    }

    const image = this.phase === COOLER_TOSS_PHASES.THROWING
      ? gameState.assets.angryFishermanCoolerToss
      : gameState.assets.angryFishermanCooler;
    if (!image) return;

    const boundsImage = gameState.assets.angryFishermanCooler ?? image;
    const height = boundsImage.height * (this.boatWidth / boundsImage.width);
    ctx.save();
    ctx.drawImage(image, this.x - this.boatWidth / 2, this.y - height / 2, this.boatWidth, height);
    ctx.restore();
  }

  isComplete() {
    return this.phase === COOLER_TOSS_PHASES.COMPLETE;
  }

  cleanup(gameState = null) {
    const cleanupState = gameState ?? this.lastGameState;
    cleanupState?.obstacles?.clearEncounterObstaclesBySource?.(this.id);
    this.resetInternal();
  }

  projectileHitboxes() {
    return this.projectiles.map(coolerProjectileHitbox);
  }

  throwCooler(gameState = null) {
    const row = CONFIG.COOLER_TOSS_LANDING_ROW;
    const projectile = createCoolerProjectile(this.x, this.y, {
      row,
      diagnosticsObjectId: this.diagnostics?.objectId({ item: ATTACK_COOLER, row }, "rowboat-object"),
      diagnosticsOwner: this.occurrenceId,
      occurrenceId: this.occurrenceId
    });

    if (this.diagnostics?.markObjectCreated?.(projectile.diagnosticsObjectId) !== false) {
      this.diagnostics?.emit("object.created", {
        elapsedSeconds: gameState?.elapsedSeconds ?? 0,
        occurrenceId: this.occurrenceId,
        encounterType: this.id,
        objectId: projectile.diagnosticsObjectId,
        objectType: "rowboat-item",
        owner: this.occurrenceId,
        source: this.id,
        row,
        y: projectile.landingY,
        itemId: ATTACK_COOLER.id,
        patternId: projectile.patternId
      });
    }
    this.diagnostics?.emit("object.rowboat_release", {
      elapsedSeconds: gameState?.elapsedSeconds ?? 0,
      occurrenceId: this.occurrenceId,
      encounterType: this.id,
      objectId: projectile.diagnosticsObjectId,
      objectType: "rowboat-item",
      owner: this.occurrenceId,
      rowboatRow: row,
      releasedItemRow: row,
      itemId: ATTACK_COOLER.id
    });

    this.projectiles.push(projectile);
    this.timer = CONFIG.FISHERMAN_POST_THROW_DELAY_MS / 1000;
    this.phase = COOLER_TOSS_PHASES.THROWING;
  }

  resetInternal() {
    this.phase = COOLER_TOSS_PHASES.WAITING;
    this.x = CONFIG.WIDTH;
    this.y = CONFIG.SURF_BOUNDS.top;
    this.timer = 0;
    this.projectiles = [];
    this.lastGameState = null;
    this.occurrenceId = null;
    this.diagnostics = null;
    this.boatWidth = CONFIG.FISHERMAN_DISPLAY_WIDTH;
  }
}

export function createCoolerProjectile(boatX, boatY, options = {}) {
  const row = options.row ?? CONFIG.COOLER_TOSS_LANDING_ROW;
  return {
    item: ATTACK_COOLER,
    row,
    patternId: "angry-fisherman-cooler-toss",
    diagnosticsObjectId: options.diagnosticsObjectId ?? null,
    diagnosticsOwner: options.diagnosticsOwner ?? null,
    occurrenceId: options.occurrenceId ?? null,
    age: 0,
    duration: CONFIG.COOLER_TOSS_PROJECTILE_DURATION_SECONDS,
    startX: boatX - 72,
    startY: boatY - 16,
    landingX: CONFIG.OBSTACLE_SUBMERGE_START_X + 245,
    landingY: obstacleRowCenter(row),
    impacted: false
  };
}

export function updateCoolerProjectile(projectile, dt, gameState) {
  if (projectile.impacted) return false;

  projectile.age += dt;
  const progress = Math.min(1, projectile.age / projectile.duration);
  if (progress < 1) return true;

  projectile.impacted = true;
  gameState?.obstacles?.addObstacle?.(createCoolerWaterObstacle(projectile, gameState));
  return false;
}

export function createCoolerWaterObstacle(projectile, gameState = null) {
  const { width, height } = coolerWaterRenderSize(projectile.item);
  return {
    source: "angry-fisherman-cooler-toss",
    diagnosticsOwner: projectile.diagnosticsOwner,
    diagnosticsObjectId: projectile.diagnosticsObjectId,
    occurrenceId: projectile.occurrenceId,
    elapsedSeconds: gameState?.elapsedSeconds ?? 0,
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
  };
}

export function coolerProjectilePosition(projectile, progress) {
  const x = lerp(projectile.startX, projectile.landingX, progress);
  const y = lerp(projectile.startY, projectile.landingY, progress) -
    Math.sin(progress * Math.PI) * CONFIG.COOLER_TOSS_ARC_HEIGHT;

  return { x, y };
}

function drawCoolerProjectile(ctx, projectile, assets) {
  const image = assets.coolerToss?.[projectile.item.airborneAssetKey];
  if (!image) return;

  const progress = Math.min(1, projectile.age / projectile.duration);
  const { x, y } = coolerProjectilePosition(projectile, progress);
  const { width, height } = coolerAirborneRenderSize(projectile.item);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35 + progress * 1.05);
  ctx.drawImage(
    image,
    -width * projectile.item.airborneAnchor.x,
    -height * projectile.item.airborneAnchor.y,
    width,
    height
  );
  ctx.restore();
}

function coolerProjectileHitbox(projectile) {
  const progress = Math.min(1, projectile.age / projectile.duration);
  const { x, y } = coolerProjectilePosition(projectile, progress);
  return centeredRect(
    x,
    y,
    projectile.item.collisionWidth * projectile.item.collisionScale,
    projectile.item.collisionHeight * projectile.item.collisionScale
  );
}

function coolerAirborneRenderSize(item) {
  return {
    width: item.airborneTargetWidth,
    height: item.airborneTargetWidth * item.airborneVisualAspectRatio
  };
}

function coolerWaterRenderSize(item) {
  return {
    width: item.waterTargetWidth,
    height: item.waterTargetWidth / item.waterVisualAspectRatio
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
