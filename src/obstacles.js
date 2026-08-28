import { CONFIG } from "./config.js";
import { centeredRect } from "./collision.js";

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

export function createObstacleEvent({ surferY, elapsed, random = Math.random, validator = isEventFair }) {
  const speed = obstacleSpeedForTime(elapsed);
  const weights = eventWeightsForTime(elapsed);
  const type = random() < weights.single ? "single" : "double";
  const spawnX = CONFIG.WIDTH + CONFIG.SPAWN_X_PADDING;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = type === "single"
      ? createSingle(spawnX, speed, random)
      : createDouble(spawnX, speed, random);

    if (validator(candidate, surferY, speed)) {
      return { ...candidate, attemptCount: attempt + 1 };
    }
  }

  return createSafeFallback(spawnX, speed, surferY);
}

export function canSpawnNextEvent(activeEvent) {
  if (!activeEvent) return true;
  return !activeEvent.threatening;
}

export function isEventFair(event, surferY, speed) {
  if (!event.heads.every(isHeadInsidePlayableY)) return false;

  const playerX = CONFIG.SURF_BOUNDS.left + (CONFIG.SURF_BOUNDS.right - CONFIG.SURF_BOUNDS.left) * 0.35;
  const nearestX = Math.min(...event.heads.map((head) => head.x));
  const horizontalDistance = Math.max(1, nearestX - playerX);
  const timeToReachPlayer = horizontalDistance / speed;
  const verticalReach = CONFIG.SURFER_SPEED * timeToReachPlayer;
  const reachableTop = Math.max(CONFIG.SURF_BOUNDS.top, surferY - verticalReach);
  const reachableBottom = Math.min(CONFIG.SURF_BOUNDS.bottom, surferY + verticalReach);
  const surferHalf = (CONFIG.SURFER_DISPLAY_HEIGHT * CONFIG.SURFER_HITBOX_SCALE_Y) / 2;
  const safeIntervals = buildSafeIntervals(event.heads, surferHalf);

  return safeIntervals.some(([top, bottom]) => bottom >= reachableTop && top <= reachableBottom);
}

export class ObstacleManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.activeEvent = null;
    this.spawnTimer = 0.55;
  }

  update(dt, elapsed, surferY) {
    if (this.activeEvent) {
      this.activeEvent.heads.forEach((head) => {
        if (head.resolved) return;
        head.x -= this.activeEvent.speed * dt;
        if (head.x <= CONFIG.OBSTACLE_SUBMERGE_END_X) {
          head.resolved = true;
        }
      });

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
        return dodged;
      }

      return this.activeEvent.collided ? 0 : newlyDodged;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && canSpawnNextEvent(this.activeEvent)) {
      this.activeEvent = createObstacleEvent({ surferY, elapsed });
    }

    return 0;
  }

  draw(ctx, assets) {
    if (!this.activeEvent) return;

    for (const head of this.activeEvent.heads) {
      const opacity = obstacleOpacityForX(head.x);
      if (opacity <= 0) continue;

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.drawImage(
        assets.head,
        head.x - head.width / 2,
        head.y - head.height / 2 + obstacleSinkForX(head.x),
        head.width,
        head.height
      );
      ctx.restore();
    }
  }

  hitboxes() {
    if (!this.activeEvent) return [];
    return this.activeEvent.heads
      .filter((head) => !head.resolved && obstacleOpacityForX(head.x) > 0)
      .map((head) =>
        centeredRect(head.x, head.y, head.width * CONFIG.HEAD_HITBOX_SCALE_X, head.height * CONFIG.HEAD_HITBOX_SCALE_Y)
      );
  }

  centers() {
    if (!this.activeEvent) return [];
    return this.activeEvent.heads.filter((head) => !head.resolved).map((head) => ({ x: head.x, y: head.y }));
  }

  markCollided() {
    if (this.activeEvent) this.activeEvent.collided = true;
  }
}

function createSingle(spawnX, speed, random) {
  return {
    type: "single",
    speed,
    threatening: true,
    collided: false,
    heads: [createHead(spawnX, randomY(random))]
  };
}

function createDouble(spawnX, speed, random) {
  const closePair = random() < 0.45;
  const yA = randomY(random);
  const gap = closePair ? randomBetween(42, 74, random) : randomBetween(120, 190, random);
  const direction = random() < 0.5 ? -1 : 1;
  const yB = clampY(yA + gap * direction);
  const offset = randomBetween(-24, 38, random);

  return {
    type: "double",
    speed,
    threatening: true,
    collided: false,
    heads: [
      createHead(spawnX, yA),
      createHead(spawnX + offset, yB)
    ]
  };
}

function createSafeFallback(spawnX, speed, surferY) {
  const targetY = surferY > (CONFIG.SURF_BOUNDS.top + CONFIG.SURF_BOUNDS.bottom) / 2
    ? CONFIG.SURF_BOUNDS.top + CONFIG.HEAD_DISPLAY_HEIGHT * 0.65
    : CONFIG.SURF_BOUNDS.bottom - CONFIG.HEAD_DISPLAY_HEIGHT * 0.65;

  return {
    type: "single",
    speed,
    threatening: true,
    collided: false,
    attemptCount: 31,
    fallback: true,
    heads: [createHead(spawnX, targetY)]
  };
}

function createHead(x, y) {
  return {
    x,
    y,
    width: CONFIG.HEAD_DISPLAY_WIDTH,
    height: CONFIG.HEAD_DISPLAY_HEIGHT,
    resolved: false,
    counted: false
  };
}

function randomY(random) {
  return randomBetween(
    CONFIG.SURF_BOUNDS.top + CONFIG.HEAD_DISPLAY_HEIGHT / 2,
    CONFIG.SURF_BOUNDS.bottom - CONFIG.HEAD_DISPLAY_HEIGHT / 2,
    random
  );
}

function isHeadInsidePlayableY(head) {
  return (
    head.y - head.height / 2 >= CONFIG.SURF_BOUNDS.top &&
    head.y + head.height / 2 <= CONFIG.SURF_BOUNDS.bottom
  );
}

function buildSafeIntervals(heads, surferHalf) {
  const blocked = heads
    .map((head) => {
      const obstacleHalf = (head.height * CONFIG.HEAD_HITBOX_SCALE_Y) / 2;
      return [head.y - obstacleHalf - surferHalf, head.y + obstacleHalf + surferHalf];
    })
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const interval of blocked) {
    const last = merged[merged.length - 1];
    if (!last || interval[0] > last[1]) {
      merged.push([...interval]);
    } else {
      last[1] = Math.max(last[1], interval[1]);
    }
  }

  const safe = [];
  let cursor = CONFIG.SURF_BOUNDS.top;
  for (const [top, bottom] of merged) {
    if (top > cursor) safe.push([cursor, top]);
    cursor = Math.max(cursor, bottom);
  }
  if (cursor < CONFIG.SURF_BOUNDS.bottom) safe.push([cursor, CONFIG.SURF_BOUNDS.bottom]);
  return safe.filter(([top, bottom]) => bottom - top >= surferHalf);
}

function clampY(y) {
  return Math.max(
    CONFIG.SURF_BOUNDS.top + CONFIG.HEAD_DISPLAY_HEIGHT / 2,
    Math.min(CONFIG.SURF_BOUNDS.bottom - CONFIG.HEAD_DISPLAY_HEIGHT / 2, y)
  );
}

function randomBetween(min, max, random) {
  return min + (max - min) * random();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
