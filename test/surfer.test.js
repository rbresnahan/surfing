import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import { Surfer } from "../src/surfer.js";

test("surfer begins with the idle sprite state", () => {
  const surfer = new Surfer();

  assert.equal(surfer.state, "idle");
});

test("surfer reset returns displayed state to idle", () => {
  const surfer = new Surfer();
  surfer.state = "left";

  surfer.reset();

  assert.equal(surfer.state, "idle");
});

test("directional update selects the input visible state", () => {
  const surfer = new Surfer();
  const input = {
    movementVector: () => ({ x: 0, y: 0 }),
    visibleState: () => "up"
  };

  surfer.update(0.016, input);

  assert.equal(surfer.state, "up");
});

test("head collision draw uses the falling sprite", () => {
  const surfer = new Surfer();
  surfer.state = "right";
  const ctx = new FakeContext();
  const assets = createAssets();

  surfer.draw(ctx, assets, true);

  assert.equal(ctx.drawnImage, assets.surferStates.fall);
});

test("directional state cannot override falling sprite while crashed", () => {
  const surfer = new Surfer();
  surfer.state = "down";
  const ctx = new FakeContext();
  const assets = createAssets();

  surfer.draw(ctx, assets, true);

  assert.equal(ctx.drawnImage, assets.surferStates.fall);
});

test("pose source dimensions do not change the gameplay hitbox", () => {
  const surfer = new Surfer();
  const assets = createAssets();

  surfer.state = "right";
  const rightBox = surfer.hitbox(assets);
  surfer.state = "up";
  const upBox = surfer.hitbox(assets);

  assert.deepEqual(upBox, rightBox);
});

test("pose rendering is contained in the fixed surfer gameplay box without distortion", () => {
  const surfer = new Surfer();
  const ctx = new FakeContext();
  const assets = createAssets();

  surfer.state = "up";
  surfer.draw(ctx, assets, false);

  assert.equal(ctx.drawnImage, assets.surferStates.up);
  assert.equal(ctx.drawnWidth, ctx.drawnHeight);
  assert.ok(ctx.drawnWidth <= CONFIG.SURFER_DISPLAY_HEIGHT);
  assert.ok(ctx.drawnHeight <= CONFIG.SURFER_DISPLAY_HEIGHT);
});

test("repeated left movement keeps the surfer footprint inside the playable boundary", () => {
  const surfer = new Surfer();

  moveRepeatedly(surfer, -1, 0);

  assert.equal(visibleBox(surfer).x, CONFIG.SURF_BOUNDS.left);
});

test("repeated right movement keeps the surfer footprint inside the playable boundary", () => {
  const surfer = new Surfer();

  moveRepeatedly(surfer, 1, 0);

  const box = visibleBox(surfer);
  assert.equal(box.x + box.width, CONFIG.SURF_BOUNDS.right);
});

test("repeated upward movement keeps the surfer footprint inside the playable boundary", () => {
  const surfer = new Surfer();

  moveRepeatedly(surfer, 0, -1);

  assert.equal(visibleBox(surfer).y, CONFIG.SURF_BOUNDS.top);
});

test("repeated downward movement keeps the surfer footprint inside the playable boundary", () => {
  const surfer = new Surfer();

  moveRepeatedly(surfer, 0, 1);

  const box = visibleBox(surfer);
  assert.equal(box.y + box.height, CONFIG.SURF_BOUNDS.bottom);
});

test("diagonal movement into a corner clamps the surfer footprint on both axes", () => {
  const surfer = new Surfer();

  moveRepeatedly(surfer, -1, -1);

  const box = visibleBox(surfer);
  assert.equal(box.x, CONFIG.SURF_BOUNDS.left);
  assert.equal(box.y, CONFIG.SURF_BOUNDS.top);
});

test("surfer movement away from boundaries is unchanged", () => {
  const surfer = new Surfer();
  surfer.x = midpoint(CONFIG.SURF_BOUNDS.left, CONFIG.SURF_BOUNDS.right);
  surfer.y = midpoint(CONFIG.SURF_BOUNDS.top, CONFIG.SURF_BOUNDS.bottom);
  const startX = surfer.x;
  const startY = surfer.y;

  surfer.update(0.1, movingInput(0.6, -0.8));

  assert.equal(surfer.x, startX + 0.6 * CONFIG.SURFER_SPEED * 0.1);
  assert.equal(surfer.y, startY - 0.8 * CONFIG.SURFER_SPEED * 0.1);
});

function createAssets() {
  const right = { width: 1205, height: 1305, name: "right" };
  return {
    surfer: right,
    surferFrame: right,
    surferStates: {
      idle: { width: 1205, height: 1305, name: "idle" },
      right,
      up: { width: 1254, height: 1254, name: "up" },
      down: { width: 1254, height: 1254, name: "down" },
      left: { width: 1230, height: 1278, name: "left" },
      fall: { width: 1224, height: 1285, name: "fall" }
    }
  };
}

function moveRepeatedly(surfer, x, y) {
  const input = movingInput(x, y);
  for (let i = 0; i < 100; i += 1) {
    surfer.update(0.1, input);
  }
}

function movingInput(x, y) {
  return {
    movementVector: () => ({ x, y }),
    visibleState: () => "idle"
  };
}

function visibleBox(surfer) {
  return {
    x: surfer.x - CONFIG.SURFER_DISPLAY_WIDTH / 2,
    y: surfer.y - CONFIG.SURFER_DISPLAY_HEIGHT / 2,
    width: CONFIG.SURFER_DISPLAY_WIDTH,
    height: CONFIG.SURFER_DISPLAY_HEIGHT
  };
}

function midpoint(a, b) {
  return a + (b - a) / 2;
}

class FakeContext {
  save() {}

  restore() {}

  translate() {}

  drawImage(image, x, y, width, height) {
    this.drawnImage = image;
    this.drawnX = x;
    this.drawnY = y;
    this.drawnWidth = width;
    this.drawnHeight = height;
  }
}
