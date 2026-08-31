import { CONFIG } from "./config.js";
import { centeredRect } from "./collision.js";
import { nearestObstacleRow, obstacleRowCenter } from "./rowGeometry.js";
import {
  obstacleOpacityForX,
  obstacleSinkForX,
  obstacleSubmergeProgressForX
} from "./obstacles.js";

export const ANTI_CAMP_FISH_ASSET_KEYS = {
  water: "attackFishOrangeWater",
  airborneA: "attackFishOrangeA",
  airborneB: "attackFishOrangeB"
};

const PHASE = {
  IDLE: "idle",
  TELEGRAPH: "telegraph",
  AIRBORNE: "airborne",
  LANDED: "landed"
};

export class AntiCampManager {
  constructor({ diagnostics = null } = {}) {
    this.diagnostics = diagnostics;
    this.reset();
  }

  reset(surfer = null, { elapsedSeconds = 0, reason = "reset" } = {}) {
    this.passivePassCount = 0;
    this.lastPassPosition = surfer ? surferPosition(surfer) : null;
    this.cooldown = 0;
    this.fish = null;
    this.record("anti_camp.reset", { elapsedSeconds, reason });
  }

  update(dt, elapsedSeconds, surfer, { suspended = false } = {}) {
    if (suspended) {
      if (this.fish || this.passivePassCount > 0) {
        this.reset(surfer, { elapsedSeconds, reason: "suspended" });
      } else {
        this.lastPassPosition = surferPosition(surfer);
      }
      return;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.fish) return;

    this.fish.age += dt;
    if (this.fish.phase === PHASE.TELEGRAPH && this.fish.age >= CONFIG.ANTI_CAMP_TELEGRAPH_SECONDS) {
      this.transitionFish(PHASE.AIRBORNE, elapsedSeconds);
      return;
    }

    if (this.fish.phase === PHASE.AIRBORNE) {
      this.updateAirborneFish(dt, elapsedSeconds);
    } else if (this.fish.phase === PHASE.LANDED) {
      this.updateLandedFish(dt, elapsedSeconds);
    }
  }

  recordNormalObstaclePass(surfer, elapsedSeconds = 0) {
    if (this.fish || this.cooldown > 0) {
      this.lastPassPosition = surferPosition(surfer);
      return;
    }

    const position = surferPosition(surfer);
    const distance = this.lastPassPosition ? distanceBetween(position, this.lastPassPosition) : Infinity;
    if (distance < CONFIG.ANTI_CAMP_MOVEMENT_THRESHOLD) {
      this.passivePassCount += 1;
      this.record("anti_camp.passive_count", {
        elapsedSeconds,
        passivePassCount: this.passivePassCount,
        movementDistance: distance
      });
    } else {
      this.passivePassCount = 0;
      this.record("anti_camp.passive_count", {
        elapsedSeconds,
        passivePassCount: this.passivePassCount,
        movementDistance: distance
      });
    }

    this.lastPassPosition = position;
    if (this.passivePassCount >= CONFIG.ANTI_CAMP_PASSIVE_PASS_THRESHOLD) {
      this.triggerFish(position, elapsedSeconds);
    }
  }

  draw(ctx, assets) {
    if (!this.fish) return;
    const image = fishImage(assets, this.fish);
    if (!image) return;
    const opacity = this.fish.phase === PHASE.LANDED ? obstacleOpacityForX(this.fish.x) : 1;
    if (opacity <= 0) return;
    const sink = this.fish.phase === PHASE.LANDED ? obstacleSinkForX(this.fish.x) : 0;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(
      image,
      this.fish.x - this.fish.width / 2,
      this.fish.y + sink - this.fish.height / 2,
      this.fish.width,
      this.fish.height
    );
    ctx.restore();
  }

  hitboxes() {
    if (!this.fish || this.fish.resolved) return [];
    if (this.fish.phase === PHASE.TELEGRAPH) return [];
    if (this.fish.phase === PHASE.LANDED && obstacleOpacityForX(this.fish.x) <= 0) return [];

    return [
      centeredRect(
        this.fish.x,
        this.fish.y,
        this.fish.collisionWidth,
        this.fish.collisionHeight
      )
    ];
  }

  markCollided(elapsedSeconds = 0) {
    if (!this.fish || this.fish.resolved) return;
    this.record("anti_camp.fish_collision", {
      elapsedSeconds,
      phase: this.fish.phase,
      row: this.fish.row
    });
    this.fish.resolved = true;
  }

  triggerFish(position, elapsedSeconds) {
    const row = nearestObstacleRow(position.y);
    const targetY = obstacleRowCenter(row);
    const startX = position.x + CONFIG.ANTI_CAMP_LAUNCH_OFFSET_X;
    const endX = position.x - CONFIG.ANTI_CAMP_LANDING_OFFSET_X;
    const width = CONFIG.ANTI_CAMP_DISPLAY_WIDTH;
    const height = width;

    this.fish = {
      phase: PHASE.TELEGRAPH,
      age: 0,
      x: startX,
      y: targetY,
      row,
      targetX: position.x,
      targetY,
      startX,
      endX,
      width,
      height,
      collisionWidth: width * CONFIG.ANTI_CAMP_HITBOX_SCALE_X,
      collisionHeight: height * CONFIG.ANTI_CAMP_HITBOX_SCALE_Y,
      resolved: false
    };
    this.passivePassCount = 0;
    this.cooldown = CONFIG.ANTI_CAMP_RETRIGGER_COOLDOWN_SECONDS;
    this.record("anti_camp.trigger", {
      elapsedSeconds,
      targetX: position.x,
      targetY,
      row
    });
    this.record("anti_camp.fish_spawn", {
      elapsedSeconds,
      phase: this.fish.phase,
      x: this.fish.x,
      y: this.fish.y,
      row
    });
  }

  transitionFish(phase, elapsedSeconds) {
    const from = this.fish.phase;
    this.fish.phase = phase;
    this.fish.age = 0;
    this.record("anti_camp.fish_phase", {
      elapsedSeconds,
      from,
      to: phase,
      row: this.fish.row
    });
  }

  updateAirborneFish(dt, elapsedSeconds) {
    const fish = this.fish;
    fish.x -= CONFIG.ANTI_CAMP_AIRBORNE_SPEED * dt;
    const travel = Math.max(1, fish.startX - fish.endX);
    const progress = Math.max(0, Math.min(1, (fish.startX - fish.x) / travel));
    fish.y = fish.targetY - Math.sin(progress * Math.PI) * CONFIG.ANTI_CAMP_ARC_HEIGHT;

    if (fish.x <= fish.endX) {
      fish.x = fish.endX;
      fish.y = fish.targetY;
      this.transitionFish(PHASE.LANDED, elapsedSeconds);
    }
  }

  updateLandedFish(dt, elapsedSeconds) {
    const fish = this.fish;
    fish.x -= CONFIG.ANTI_CAMP_WATER_SPEED * dt;
    if (obstacleSubmergeProgressForX(fish.x) >= 1) {
      fish.resolved = true;
      this.record("anti_camp.fish_removed", {
        elapsedSeconds,
        reason: "submerged",
        row: fish.row
      });
      this.fish = null;
      this.cooldown = CONFIG.ANTI_CAMP_RETRIGGER_COOLDOWN_SECONDS;
    }
  }

  record(type, payload = {}) {
    this.diagnostics?.emit(type, payload);
  }
}

function surferPosition(surfer) {
  return { x: surfer.x, y: surfer.y };
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fishImage(assets, fish) {
  const attackFish = assets?.attackFish ?? {};
  if (fish.phase === PHASE.AIRBORNE) {
    const frame = Math.floor(fish.age / CONFIG.ANTI_CAMP_AIRBORNE_FRAME_SECONDS) % 2;
    return frame === 0
      ? attackFish[ANTI_CAMP_FISH_ASSET_KEYS.airborneA]
      : attackFish[ANTI_CAMP_FISH_ASSET_KEYS.airborneB];
  }
  return attackFish[ANTI_CAMP_FISH_ASSET_KEYS.water];
}
