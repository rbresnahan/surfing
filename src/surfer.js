import { CONFIG } from "./config.js";
import { centeredRect } from "./collision.js";

export class Surfer {
  constructor() {
    this.reset();
  }

  reset() {
    const bounds = CONFIG.SURF_BOUNDS;
    this.x = bounds.left + (bounds.right - bounds.left) * 0.35;
    this.y = bounds.top + (bounds.bottom - bounds.top) * 0.5;
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
    this.y = Math.max(bounds.top + halfHeight, Math.min(bounds.bottom - halfHeight, this.y));
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
