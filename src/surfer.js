import { CONFIG } from "./config.js";
import { centeredRect } from "./collision.js";

export class Surfer {
  constructor() {
    this.reset();
  }

  reset() {
    const bounds = CONFIG.SURF_BOUNDS;
    this.x = bounds.left + (bounds.right - bounds.left) * 0.35;
    const halfWidth = CONFIG.SURFER_DISPLAY_WIDTH / 2;
    const halfHeight = CONFIG.SURFER_DISPLAY_HEIGHT / 2;
    const top = getSurferBoundaryYAtX(this.x - halfWidth) + halfHeight;
    this.y = top + (bounds.bottom - top) * 0.5;
    this.state = "idle";
    this.crashTime = 0;
    this.clamp();
  }

  update(dt, input) {
    const vector = input.movementVector();
    this.x += vector.x * CONFIG.SURFER_SPEED * dt;
    this.y += vector.y * CONFIG.SURFER_SPEED * dt;
    this.state = input.visibleState();
    this.clamp();
  }

  updateCrash(dt) {
    this.crashTime = Math.min(CONFIG.WIPEOUT_SECONDS, this.crashTime + dt);
  }

  clamp() {
    const clamped = clampSurferCenterToPlayfield(this.x, this.y, this.drawBox());
    this.x = clamped.x;
    this.y = clamped.y;
  }

  draw(ctx, assets, crashed = false) {
    const image = crashed ? assets.surferStates.fall : assets.surferStates[this.state];
    const box = this.drawBox(assets);
    const scale = Math.min(box.width / image.width, box.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const progress = crashed ? this.crashTime / CONFIG.WIPEOUT_SECONDS : 0;

    ctx.save();
    ctx.translate(this.x + progress * 26, this.y + progress * 18);

    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  hitbox(assets) {
    const { width, height } = this.drawBox(assets);
    return centeredRect(
      this.x,
      this.y,
      width * CONFIG.SURFER_HITBOX_SCALE_X,
      height * CONFIG.SURFER_HITBOX_SCALE_Y
    );
  }

  drawBox(assets) {
    return {
      width: CONFIG.SURFER_DISPLAY_WIDTH,
      height: CONFIG.SURFER_DISPLAY_HEIGHT
    };
  }
}

export function surferPlayfieldPolygon(config = CONFIG) {
  const boundary = config.SURFER_PLAYFIELD_BOUNDARY;
  const first = boundary[0];
  const last = boundary[boundary.length - 1];
  const polygon = [...boundary];

  if (last.x !== config.SURF_BOUNDS.right || last.y !== config.SURF_BOUNDS.bottom) {
    polygon.push({ x: config.SURF_BOUNDS.right, y: config.SURF_BOUNDS.bottom });
  }

  if (first.y !== config.SURF_BOUNDS.bottom) {
    polygon.push({ x: first.x, y: config.SURF_BOUNDS.bottom });
  }

  return polygon;
}

export function clampSurferCenterToPlayfield(centerX, centerY, box, config = CONFIG) {
  let x = centerX;
  let y = centerY;
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const polygon = surferPlayfieldPolygon(config);

  for (let pass = 0; pass < 8; pass += 1) {
    let adjusted = false;

    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const edgeX = b.x - a.x;
      const edgeY = b.y - a.y;
      const normalX = -edgeY;
      const normalY = edgeX;
      const normalLengthSquared = normalX * normalX + normalY * normalY;

      if (normalLengthSquared === 0) continue;

      const required = Math.abs(normalX) * halfWidth + Math.abs(normalY) * halfHeight;
      const actual = normalX * (x - a.x) + normalY * (y - a.y);
      if (actual >= required - 0.000001) continue;

      const correction = (required - actual) / normalLengthSquared;
      x += normalX * correction;
      y += normalY * correction;
      adjusted = true;
    }

    if (!adjusted) break;
  }

  return {
    x: normalizeZero(x),
    y: normalizeZero(y)
  };
}

export function getSurferBoundaryYAtX(x, config = CONFIG) {
  const boundary = config.SURFER_PLAYFIELD_BOUNDARY;
  for (let i = 0; i < boundary.length - 1; i += 1) {
    const a = boundary[i];
    const b = boundary[i + 1];
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (x < minX || x > maxX) continue;
    if (a.x === b.x) return Math.min(a.y, b.y);

    const progress = (x - a.x) / (b.x - a.x);
    return a.y + (b.y - a.y) * progress;
  }

  return boundary[boundary.length - 1].y;
}

function normalizeZero(value) {
  return Math.abs(value) < 0.000001 ? 0 : value;
}
