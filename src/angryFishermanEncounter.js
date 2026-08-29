import { CONFIG } from "./config.js";

const State = {
  INACTIVE: "INACTIVE",
  ENTERING: "ENTERING",
  MOVING_TO_LANE: "MOVING_TO_LANE",
  WINDUP: "WINDUP",
  THROWING: "THROWING",
  COOLDOWN: "COOLDOWN",
  EXITING: "EXITING",
  COMPLETE: "COMPLETE"
};

const THROWABLES = [
  { id: "bottle", assetKey: "bottle", width: 62, height: 30, collisionScale: 0.68, speedMultiplier: 1.03, bobAmount: 2 },
  { id: "can", assetKey: "can", width: 42, height: 32, collisionScale: 0.7, speedMultiplier: 1.08, bobAmount: 2 },
  { id: "life-vest", assetKey: "lifeVest", width: 72, height: 54, collisionScale: 0.72, speedMultiplier: 0.92, bobAmount: 3 },
  { id: "life-ring", assetKey: "lifeRing", width: 76, height: 58, collisionScale: 0.72, speedMultiplier: 0.9, bobAmount: 3 },
  { id: "sandwich", assetKey: "sandwich", width: 54, height: 38, collisionScale: 0.7, speedMultiplier: 1, bobAmount: 2 }
];

const AMMO_SEQUENCE = ["bottle", "can", "sandwich", "life-ring", "bottle", "life-vest"];

export class AngryFishermanEncounter {
  constructor() {
    this.id = "angry-fisherman";
    this.type = "major";
    this.exclusive = true;
    this.pauseNormalSpawns = true;
    this.resetInternal();
  }

  canStart(gameState) {
    return gameState.elapsedMs >= CONFIG.FIRST_ENCOUNTER_TIME_MS;
  }

  start() {
    this.resetInternal();
    this.state = State.ENTERING;
    this.x = CONFIG.WIDTH + this.boatWidth / 2 + 20;
    this.y = CONFIG.FISHERMAN_THROW_LANES[1] ?? midpoint(CONFIG.SURF_BOUNDS.top, CONFIG.SURF_BOUNDS.bottom);
  }

  update(dt, gameState) {
    this.projectiles = this.projectiles.filter((projectile) => updateProjectile(projectile, dt, gameState));

    if (this.state === State.ENTERING) {
      this.x = Math.max(CONFIG.FISHERMAN_STOP_X, this.x - CONFIG.FISHERMAN_ENTRY_SPEED * dt);
      if (this.x === CONFIG.FISHERMAN_STOP_X) {
        this.chooseNextLane();
      }
      return;
    }

    if (this.state === State.MOVING_TO_LANE) {
      this.moveTowardTargetLane(dt);
      return;
    }

    if (this.state === State.WINDUP) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.throwNextItem();
      }
      return;
    }

    if (this.state === State.THROWING) {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.ammoIndex >= AMMO_SEQUENCE.length) {
          this.state = State.EXITING;
        } else {
          this.timer = randomThrowIntervalSeconds();
          this.state = State.COOLDOWN;
        }
      }
      return;
    }

    if (this.state === State.COOLDOWN) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.chooseNextLane();
      }
      return;
    }

    if (this.state === State.EXITING) {
      this.x += CONFIG.FISHERMAN_EXIT_SPEED * dt;
      if (this.x - this.boatWidth / 2 > CONFIG.WIDTH && this.projectiles.length === 0) {
        this.state = State.COMPLETE;
      }
    }
  }

  render(ctx, gameState) {
    if (this.state === State.INACTIVE || this.state === State.COMPLETE) return;

    for (const projectile of this.projectiles) {
      drawProjectile(ctx, projectile, gameState.assets);
    }

    const image = this.state === State.THROWING ? gameState.assets.fishermanThrow : gameState.assets.fisherman;
    if (!image) return;

    const height = image.height * (this.boatWidth / image.width);
    ctx.save();
    ctx.drawImage(image, this.x - this.boatWidth / 2, this.y - height / 2, this.boatWidth, height);
    ctx.restore();
  }

  isComplete() {
    return this.state === State.COMPLETE;
  }

  cleanup() {
    this.resetInternal();
  }

  resetInternal() {
    this.state = State.INACTIVE;
    this.x = CONFIG.WIDTH;
    this.y = CONFIG.SURF_BOUNDS.top;
    this.targetLane = this.y;
    this.lastLane = null;
    this.timer = 0;
    this.ammoIndex = 0;
    this.projectiles = [];
    this.boatWidth = CONFIG.FISHERMAN_DISPLAY_WIDTH;
  }

  chooseNextLane() {
    const lane = chooseLane(CONFIG.FISHERMAN_THROW_LANES, this.lastLane);
    this.lastLane = lane;
    this.targetLane = lane;
    this.state = State.MOVING_TO_LANE;
  }

  moveTowardTargetLane(dt) {
    const delta = this.targetLane - this.y;
    const step = CONFIG.FISHERMAN_LANE_SPEED * dt;
    if (Math.abs(delta) <= Math.max(step, CONFIG.FISHERMAN_LANE_SNAP_DISTANCE)) {
      this.y = this.targetLane;
      this.timer = CONFIG.FISHERMAN_THROW_WINDUP_MS / 1000;
      this.state = State.WINDUP;
      return;
    }

    this.y += Math.sign(delta) * step;
  }

  throwNextItem() {
    const item = throwableById(AMMO_SEQUENCE[this.ammoIndex]);
    this.ammoIndex += 1;
    this.projectiles.push(createProjectile(item, this.x, this.y));
    this.timer = CONFIG.FISHERMAN_POST_THROW_DELAY_MS / 1000;
    this.state = State.THROWING;
  }
}

function createProjectile(item, boatX, boatY) {
  const startX = boatX - 90;
  const startY = boatY - 32;
  const landingX = CONFIG.OBSTACLE_SUBMERGE_START_X + 290;
  const landingY = boatY + 26;

  return {
    item,
    age: 0,
    duration: CONFIG.FISHERMAN_PROJECTILE_DURATION_MS / 1000,
    startX,
    startY,
    landingX,
    landingY
  };
}

function updateProjectile(projectile, dt, gameState) {
  projectile.age += dt;
  const progress = Math.min(1, projectile.age / projectile.duration);

  if (progress < 1) return true;

  gameState.obstacles.addObstacle({
    assetKey: projectile.item.assetKey,
    x: projectile.landingX,
    y: projectile.landingY,
    width: projectile.item.width,
    height: projectile.item.height,
    speed: CONFIG.FISHERMAN_THROWABLE_SPEED * projectile.item.speedMultiplier,
    collisionScale: projectile.item.collisionScale,
    bobAmount: projectile.item.bobAmount
  });
  return false;
}

function drawProjectile(ctx, projectile, assets) {
  const image = assets.throwables?.[projectile.item.assetKey];
  if (!image) return;

  const progress = Math.min(1, projectile.age / projectile.duration);
  const x = lerp(projectile.startX, projectile.landingX, progress);
  const y = lerp(projectile.startY, projectile.landingY, progress) - Math.sin(progress * Math.PI) * CONFIG.FISHERMAN_PROJECTILE_ARC_HEIGHT;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5 + progress * 1.3);
  ctx.drawImage(image, -projectile.item.width / 2, -projectile.item.height / 2, projectile.item.width, projectile.item.height);
  ctx.restore();
}

function chooseLane(lanes, previousLane) {
  const options = lanes.filter((lane) => lane !== previousLane);
  const pool = options.length ? options : lanes;
  return pool[Math.floor(Math.random() * pool.length)];
}

function throwableById(id) {
  return THROWABLES.find((item) => item.id === id) ?? THROWABLES[0];
}

function randomThrowIntervalSeconds() {
  return (
    CONFIG.FISHERMAN_THROW_INTERVAL_MIN_MS +
    Math.random() * (CONFIG.FISHERMAN_THROW_INTERVAL_MAX_MS - CONFIG.FISHERMAN_THROW_INTERVAL_MIN_MS)
  ) / 1000;
}

function midpoint(a, b) {
  return a + (b - a) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
