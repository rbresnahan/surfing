import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import { clampSurferCenterToPlayfield, getSurferBoundaryYAtX, surferPlayfieldPolygon, Surfer } from "../src/surfer.js";

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

  assertVisibleBoxInsideSurferPlayfield(visibleBox(surfer));
  assert.ok(visibleBox(surfer).x > CONFIG.SURFER_PLAYFIELD_BOUNDARY[0].x);
});

test("repeated right movement keeps the surfer footprint inside the playable boundary", () => {
  const surfer = new Surfer();

  moveRepeatedly(surfer, 1, 0);

  const box = visibleBox(surfer);
  assert.equal(box.x + box.width, CONFIG.SURF_BOUNDS.right);
});

test("repeated upward movement keeps the surfer footprint inside the playable boundary", () => {
  const surfer = new Surfer();
  surfer.x = CONFIG.SURF_BOUNDS.right - CONFIG.SURFER_DISPLAY_WIDTH / 2;

  moveRepeatedly(surfer, 0, -1);

  const box = visibleBox(surfer);
  assertVisibleBoxInsideSurferPlayfield(box);
  assert.equal(box.x + box.width, CONFIG.SURF_BOUNDS.right);
  assert.ok(box.y > CONFIG.SURFER_PLAYFIELD_BOUNDARY.at(-1).y);
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
  assertVisibleBoxInsideSurferPlayfield(box);
  assert.equal(minSurferPlayfieldMargin(box) < 0.001, true);
});

test("surfer playfield uses the configured upper-left boundary anchors", () => {
  assert.equal(CONFIG.SURFER_TOP_BOUNDARY, undefined);
  assert.deepEqual(CONFIG.SURFER_PLAYFIELD_BOUNDARY, [
    { x: 160, y: 500 },
    { x: 180, y: 307 },
    { x: 292, y: 217 },
    { x: 401, y: 128 },
    { x: 588, y: 128 },
    { x: 650, y: 116 }
  ]);
});

test("surfer playfield polygon closes against the existing right and bottom limits", () => {
  const polygon = surferPlayfieldPolygon();

  assert.deepEqual(polygon[0], CONFIG.SURFER_PLAYFIELD_BOUNDARY[0]);
  assert.deepEqual(polygon.at(-1), { x: CONFIG.SURF_BOUNDS.right, y: CONFIG.SURF_BOUNDS.bottom });
});

test("surfer boundary interpolates along the main diagonal", () => {
  const start = CONFIG.SURFER_PLAYFIELD_BOUNDARY[2];
  const end = CONFIG.SURFER_PLAYFIELD_BOUNDARY[3];
  const midpointX = midpoint(start.x, end.x);
  const midpointY = midpoint(start.y, end.y);

  assert.equal(getSurferBoundaryYAtX(midpointX), midpointY);
});

test("surfer boundary keeps the authored horizontal section", () => {
  assert.equal(getSurferBoundaryYAtX(midpoint(401, 588)), 128);
});

test("surfer boundary rises slightly at the right edge", () => {
  assert.equal(getSurferBoundaryYAtX(650), 116);
});

test("surfer cannot cross the diagonal top boundary", () => {
  const surfer = new Surfer();
  const boundary = CONFIG.SURFER_PLAYFIELD_BOUNDARY;
  const halfWidth = CONFIG.SURFER_DISPLAY_WIDTH / 2;
  const footprintLeftX = midpoint(boundary[2].x, boundary[3].x);
  surfer.x = footprintLeftX + halfWidth;

  moveRepeatedly(surfer, 0, -1);

  assert.ok(visibleBox(surfer).x > footprintLeftX);
  assertVisibleBoxInsideSurferPlayfield(visibleBox(surfer));
});

test("surfer cannot enter the whitecap-side area above the upper boundary", () => {
  const surfer = new Surfer();
  surfer.x = 500 + CONFIG.SURFER_DISPLAY_WIDTH / 2;

  moveRepeatedly(surfer, 0, -1);

  assert.ok(visibleBox(surfer).y > 128);
  assertVisibleBoxInsideSurferPlayfield(visibleBox(surfer));
});

test("surfer footprint is used when clamping against the near-vertical left boundary", () => {
  const boundary = CONFIG.SURFER_PLAYFIELD_BOUNDARY;
  const halfHeight = CONFIG.SURFER_DISPLAY_HEIGHT / 2;
  const halfWidth = CONFIG.SURFER_DISPLAY_WIDTH / 2;
  const clamped = clampSurferCenterToPlayfield(boundary[0].x + halfWidth, boundary[0].y - halfHeight, {
    width: CONFIG.SURFER_DISPLAY_WIDTH,
    height: CONFIG.SURFER_DISPLAY_HEIGHT
  });
  const box = {
    x: clamped.x - halfWidth,
    y: clamped.y - halfHeight,
    width: CONFIG.SURFER_DISPLAY_WIDTH,
    height: CONFIG.SURFER_DISPLAY_HEIGHT
  };

  assertVisibleBoxInsideSurferPlayfield(box);
  assert.ok(box.x > boundary[0].x);
});

test("surfer boundary is continuous where the diagonal meets the horizontal", () => {
  const boundary = CONFIG.SURFER_PLAYFIELD_BOUNDARY;
  const justBeforeEndpoint = getSurferBoundaryYAtX(boundary[3].x - 0.0001);

  assert.equal(justBeforeEndpoint < boundary[2].y, true);
  assert.ok(Math.abs(justBeforeEndpoint - getSurferBoundaryYAtX(boundary[3].x)) < 0.001);
});

test("clamping projects an invalid center back into the polygonal playfield", () => {
  const clamped = clampSurferCenterToPlayfield(120, 250, {
    width: CONFIG.SURFER_DISPLAY_WIDTH,
    height: CONFIG.SURFER_DISPLAY_HEIGHT
  });

  assertVisibleBoxInsideSurferPlayfield({
    x: clamped.x - CONFIG.SURFER_DISPLAY_WIDTH / 2,
    y: clamped.y - CONFIG.SURFER_DISPLAY_HEIGHT / 2,
    width: CONFIG.SURFER_DISPLAY_WIDTH,
    height: CONFIG.SURFER_DISPLAY_HEIGHT
  });
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

function assertVisibleBoxInsideSurferPlayfield(box) {
  const margins = surferPlayfieldMargins(box);
  assert.equal(margins.every((margin) => margin >= -0.001), true);
}

function minSurferPlayfieldMargin(box) {
  return Math.min(...surferPlayfieldMargins(box));
}

function surferPlayfieldMargins(box) {
  const polygon = surferPlayfieldPolygon();
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height }
  ];
  const margins = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const normalLength = Math.hypot(edgeX, edgeY);
    for (const corner of corners) {
      margins.push((edgeX * (corner.y - a.y) - edgeY * (corner.x - a.x)) / normalLength);
    }
  }

  return margins;
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
