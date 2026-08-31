import { CONFIG } from "./config.js";
import { centeredRect } from "./collision.js";

export class Surfer {
  constructor() {
    this.reset();
  }

  reset() {
    const bounds = CONFIG.SURF_BOUNDS;
    this.x = bounds.left + (bounds.right - bounds.left) * 0.35;
    const top = surferTopCenterBoundary(this.x);
    this.y = top + (bounds.bottom - top) * 0.5;
    this.state = "idle";
    this.crashTime = 0;
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
    const bounds = CONFIG.SURF_BOUNDS;
    const halfWidth = CONFIG.SURFER_DISPLAY_WIDTH / 2;
    const halfHeight = CONFIG.SURFER_DISPLAY_HEIGHT / 2;

    this.x = Math.max(bounds.left + halfWidth, Math.min(bounds.right - halfWidth, this.x));
    this.y = Math.max(surferTopCenterBoundary(this.x), Math.min(bounds.bottom - halfHeight, this.y));
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

export function getSurferTopBoundaryAtX(x) {
  const boundary = CONFIG.SURFER_TOP_BOUNDARY;
  if (x <= boundary.diagonalStartX) return boundary.diagonalStartY;
  if (x >= boundary.diagonalEndX) return boundary.horizontalY;

  const progress = (x - boundary.diagonalStartX) / (boundary.diagonalEndX - boundary.diagonalStartX);
  return boundary.diagonalStartY + (boundary.horizontalY - boundary.diagonalStartY) * progress;
}

function surferTopCenterBoundary(centerX) {
  const halfWidth = CONFIG.SURFER_DISPLAY_WIDTH / 2;
  const halfHeight = CONFIG.SURFER_DISPLAY_HEIGHT / 2;
  return getSurferTopBoundaryAtX(centerX - halfWidth) + halfHeight;
}
