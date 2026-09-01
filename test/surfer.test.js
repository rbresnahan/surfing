import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import {
  clampSurferCenterToPlayfield,
  getSurferBoundaryYAtX,
  isSurferPositionValid,
  surferMovementFootprint,
  surferMovementFootprintAt,
  surferPlayfieldPolygon,
  Surfer
} from "../src/surfer.js";

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

test("repeated left movement keeps the surfer movement footprint inside the playable boundary", () => {
  const surfer = new Surfer();

  moveRepeatedly(surfer, -1, 0);

  assertMovementFootprintInsideSurferPlayfield(surfer.x, surfer.y);
  assert.ok(Math.min(...surferMovementFootprintAt(surfer.x, surfer.y).map((point) => point.x)) > CONFIG.SURFER_PLAYFIELD_BOUNDARY[0].x);
});

test("repeated right movement keeps the surfer movement footprint inside the playable boundary", () => {
  const surfer = new Surfer();

  moveRepeatedly(surfer, 1, 0);

  const maxX = Math.max(...surferMovementFootprintAt(surfer.x, surfer.y).map((point) => point.x));
  assert.equal(maxX, CONFIG.SURF_BOUNDS.right);
});

test("repeated upward movement keeps the surfer movement footprint inside the playable boundary", () => {
  const surfer = new Surfer();
  const rightFootprintX = Math.max(...surferMovementFootprint().map((point) => point.x));
  surfer.x = CONFIG.SURF_BOUNDS.right - rightFootprintX;

  moveRepeatedly(surfer, 0, -1);

  const footprint = surferMovementFootprintAt(surfer.x, surfer.y);
  assertMovementFootprintInsideSurferPlayfield(surfer.x, surfer.y);
  assert.equal(Math.max(...footprint.map((point) => point.x)), CONFIG.SURF_BOUNDS.right);
  assert.ok(Math.min(...footprint.map((point) => point.y)) > CONFIG.SURFER_PLAYFIELD_BOUNDARY.at(-1).y);
});

test("repeated downward movement keeps the surfer movement footprint inside the playable boundary", () => {
  const surfer = new Surfer();

  moveRepeatedly(surfer, 0, 1);

  const maxY = Math.max(...surferMovementFootprintAt(surfer.x, surfer.y).map((point) => point.y));
  assert.equal(maxY, CONFIG.SURF_BOUNDS.bottom);
});

test("diagonal movement into a corner clamps the surfer movement footprint on both axes", () => {
  const surfer = new Surfer();

  moveRepeatedly(surfer, -1, -1);

  assertMovementFootprintInsideSurferPlayfield(surfer.x, surfer.y);
  assert.equal(minSurferPlayfieldMargin(surfer.x, surfer.y) < 0.001, true);
});

test("surfer playfield uses the configured upper-left boundary anchors", () => {
  assert.equal(CONFIG.SURFER_TOP_BOUNDARY, undefined);
  assert.deepEqual(CONFIG.SURFER_PLAYFIELD_BOUNDARY, [
    { x: 160, y: 500 },
    { x: 180, y: 295 },
    { x: 292, y: 205 },
    { x: 401, y: 116 },
    { x: 588, y: 116 },
    { x: 650, y: 104 },
    { x: 710, y: 104 }
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
  assert.equal(getSurferBoundaryYAtX(midpoint(401, 588)), 116);
});

test("surfer boundary rises slightly at the right edge", () => {
  assert.equal(getSurferBoundaryYAtX(650), 104);
});

test("surfer cannot cross the diagonal top boundary", () => {
  const surfer = new Surfer();
  const boundary = CONFIG.SURFER_PLAYFIELD_BOUNDARY;
  const leftFootprintX = Math.min(...surferMovementFootprint().map((point) => point.x));
  const footprintLeftX = midpoint(boundary[2].x, boundary[3].x);
  surfer.x = footprintLeftX - leftFootprintX;

  moveRepeatedly(surfer, 0, -1);

  assert.ok(Math.min(...surferMovementFootprintAt(surfer.x, surfer.y).map((point) => point.x)) > footprintLeftX);
  assertMovementFootprintInsideSurferPlayfield(surfer.x, surfer.y);
});

test("surfer cannot enter the whitecap-side area above the upper boundary", () => {
  const surfer = new Surfer();
  const leftFootprintX = Math.min(...surferMovementFootprint().map((point) => point.x));
  surfer.x = 500 - leftFootprintX;

  moveRepeatedly(surfer, 0, -1);

  assert.ok(Math.min(...surferMovementFootprintAt(surfer.x, surfer.y).map((point) => point.y)) > 116);
  assertMovementFootprintInsideSurferPlayfield(surfer.x, surfer.y);
});

test("surfer movement footprint is used when clamping against the near-vertical left boundary", () => {
  const boundary = CONFIG.SURFER_PLAYFIELD_BOUNDARY;
  const leftFootprintX = Math.min(...surferMovementFootprint().map((point) => point.x));
  const topFootprintY = Math.min(...surferMovementFootprint().map((point) => point.y));
  const clamped = clampSurferCenterToPlayfield(boundary[0].x - leftFootprintX, boundary[0].y - topFootprintY);

  assertMovementFootprintInsideSurferPlayfield(clamped.x, clamped.y);
  assert.ok(Math.min(...surferMovementFootprintAt(clamped.x, clamped.y).map((point) => point.x)) > boundary[0].x);
});

test("surfer boundary is continuous where the diagonal meets the horizontal", () => {
  const boundary = CONFIG.SURFER_PLAYFIELD_BOUNDARY;
  const justBeforeEndpoint = getSurferBoundaryYAtX(boundary[3].x - 0.0001);

  assert.equal(justBeforeEndpoint < boundary[2].y, true);
  assert.ok(Math.abs(justBeforeEndpoint - getSurferBoundaryYAtX(boundary[3].x)) < 0.001);
});

test("clamping projects an invalid center back into the polygonal playfield", () => {
  const clamped = clampSurferCenterToPlayfield(120, 250);

  assertMovementFootprintInsideSurferPlayfield(clamped.x, clamped.y);
});

test("movement footprint is authored independently from render and collision geometry", () => {
  const footprint = surferMovementFootprint();
  const displayBoxArea = CONFIG.SURFER_DISPLAY_WIDTH * CONFIG.SURFER_DISPLAY_HEIGHT;

  assert.equal(footprint.length, 10);
  assert.notEqual(footprint.some((point) => Math.abs(point.x) === CONFIG.SURFER_DISPLAY_WIDTH / 2), true);
  assert.ok(polygonArea(footprint) < displayBoxArea);
  assert.equal(isConvexPolygon(footprint), true);
});

test("movement footprint validity is pose independent", () => {
  const surfer = new Surfer();
  const clampedPositions = [];

  for (const state of ["idle", "right", "up", "down", "left"]) {
    surfer.state = state;
    surfer.x = 120;
    surfer.y = 250;
    surfer.clamp();
    assert.equal(isSurferPositionValid(surfer.x, surfer.y), true);
    clampedPositions.push({ x: surfer.x, y: surfer.y });
  }

  assert.equal(new Set(clampedPositions.map(({ x, y }) => `${x},${y}`)).size, 1);
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

function assertMovementFootprintInsideSurferPlayfield(centerX, centerY) {
  const margins = surferPlayfieldMargins(centerX, centerY);
  assert.equal(margins.every((margin) => margin >= -0.001), true);
}

function minSurferPlayfieldMargin(centerX, centerY) {
  return Math.min(...surferPlayfieldMargins(centerX, centerY));
}

function surferPlayfieldMargins(centerX, centerY) {
  const polygon = surferPlayfieldPolygon();
  const footprint = surferMovementFootprintAt(centerX, centerY);
  const margins = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const normalLength = Math.hypot(edgeX, edgeY);
    for (const point of footprint) {
      margins.push((edgeX * (point.y - a.y) - edgeY * (point.x - a.x)) / normalLength);
    }
  }

  return margins;
}

function isConvexPolygon(points) {
  const signs = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const after = points[(index + 2) % points.length];
    return (next.x - point.x) * (after.y - point.y) - (next.y - point.y) * (after.x - point.x);
  });
  return signs.every((sign) => sign > 0) || signs.every((sign) => sign < 0);
}

function polygonArea(points) {
  const twiceArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  return Math.abs(twiceArea) / 2;
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
