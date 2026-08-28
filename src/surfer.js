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
    this.x = Math.max(bounds.left, Math.min(bounds.right, this.x));
    this.y = Math.max(bounds.top, Math.min(bounds.bottom, this.y));
  }

  draw(ctx, assets, crashed = false) {
    const image = crashed ? assets.surferStates.fall : assets.surferStates[this.state];
    const height = CONFIG.SURFER_DISPLAY_HEIGHT;
    const width = image.width * (height / image.height);
    const progress = crashed ? this.crashTime / CONFIG.WIPEOUT_SECONDS : 0;

    ctx.save();
    ctx.translate(this.x + progress * 26, this.y + progress * 18);

    if (crashed && !assets.hasFallSprite) {
      ctx.rotate(progress * Math.PI * 0.72);
      ctx.globalAlpha = Math.max(0.25, 1 - progress * 0.65);
    }

    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  hitbox(assets) {
    const image = assets.surferStates[this.state] ?? assets.surfer;
    const height = CONFIG.SURFER_DISPLAY_HEIGHT;
    const width = image.width * (height / image.height);
    return centeredRect(
      this.x,
      this.y,
      width * CONFIG.SURFER_HITBOX_SCALE_X,
      height * CONFIG.SURFER_HITBOX_SCALE_Y
    );
  }
}
