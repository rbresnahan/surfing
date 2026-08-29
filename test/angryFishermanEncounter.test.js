import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { CONFIG } from "../src/config.js";
import { THROWABLE_FILES } from "../src/assets.js";
import {
  THROWABLES,
  airborneRenderSize,
  createProjectile,
  drawProjectile,
  projectilePosition,
  updateProjectile,
  waterRenderSize
} from "../src/angryFishermanEncounter.js";
import { ObstacleManager } from "../src/obstacles.js";

const EXPECTED_MAPPINGS = {
  can: ["item-beer-can.png", "item-beer-can-water.png"],
  bottle: ["item-bottle.png", "item-bottle-water.png"],
  "life-vest": ["item-life-jacket.png", "item-life-jacket-water.png"],
  "life-ring": ["item-life-preserver.png", "item-life-preserver-water.png"],
  sandwich: ["item-sandwich.png", "item-sandwich-water.png"]
};

const EXPECTED_WATER_ASPECT_RATIOS = {
  bottle: 1240 / 1251,
  can: 1239 / 1167,
  "life-vest": 1516 / 975,
  "life-ring": 1471 / 1011,
  sandwich: 1254 / 1226
};

test("every throwable has a valid airborne and water asset mapping", async () => {
  for (const item of THROWABLES) {
    const [airFile, waterFile] = EXPECTED_MAPPINGS[item.id];

    assert.equal(THROWABLE_FILES[item.airborneAssetKey], airFile);
    assert.equal(THROWABLE_FILES[item.waterAssetKey], waterFile);

    await access(new URL(`../assets/${airFile}`, import.meta.url));
    await access(new URL(`../assets/${waterFile}`, import.meta.url));
  }
});

test("projectiles draw the airborne sprite before water impact", () => {
  const item = THROWABLES[0];
  const projectile = createProjectile(item, 810, 300);
  projectile.age = projectile.duration - 0.001;
  const ctx = createMockContext();
  const renderSize = airborneRenderSize(item);

  drawProjectile(ctx, projectile, createAssets());

  assert.deepEqual(ctx.drawnImages(), [item.airborneAssetKey]);
  assert.deepEqual(ctx.draws[0].args.slice(1), [
    -renderSize.width * item.airborneAnchor.x,
    -renderSize.height * item.airborneAnchor.y,
    renderSize.width,
    renderSize.height
  ]);
});

test("airborne projectile rendering preserves visual aspect ratio with one constant scale", () => {
  for (const item of THROWABLES) {
    const renderSize = airborneRenderSize(item);

    assert.equal(renderSize.width, item.airborneTargetWidth);
    assert.equal(renderSize.height, item.airborneTargetWidth * item.airborneVisualAspectRatio);
    assert.notEqual(renderSize.height, item.collisionHeight);

    for (const progress of [0, 0.35, 0.9]) {
      const projectile = createProjectile(item, 810, 300);
      projectile.age = projectile.duration * progress;
      const ctx = createMockContext();

      drawProjectile(ctx, projectile, createAssets());

      assert.equal(ctx.scales.length, 0);
      assert.equal(ctx.draws[0].args[3], renderSize.width);
      assert.equal(ctx.draws[0].args[4], renderSize.height);
    }
  }
});

test("impact frame swaps to the water sprite with no projectile overlap or blank frame", () => {
  const item = THROWABLES[1];
  const projectile = createProjectile(item, 810, 300);
  const manager = new ObstacleManager();
  const alive = updateProjectile(projectile, projectile.duration, { obstacles: manager });

  assert.equal(alive, false);
  assert.equal(projectile.impacted, true);
  assert.equal(manager.encounterObstacles.length, 1);

  const projectileCtx = createMockContext();
  if (alive) drawProjectile(projectileCtx, projectile, createAssets());
  assert.deepEqual(projectileCtx.drawnImages(), []);

  const waterCtx = createMockContext();
  manager.draw(waterCtx, createAssets());
  assert.deepEqual(waterCtx.drawnImages(), [item.waterAssetKey]);
});

test("waterborne projectile rendering preserves water sprite aspect ratio with one constant scale", () => {
  for (const item of THROWABLES) {
    const projectile = createProjectile(item, 810, 300);
    const manager = new ObstacleManager();
    const renderSize = waterRenderSize(item);

    updateProjectile(projectile, projectile.duration, { obstacles: manager });

    const [obstacle] = manager.encounterObstacles;
    assert.equal(item.waterVisualAspectRatio, EXPECTED_WATER_ASPECT_RATIOS[item.id]);
    assert.notEqual(item.waterVisualAspectRatio, item.airborneVisualAspectRatio);
    assert.equal(obstacle.width, renderSize.width);
    assert.equal(obstacle.height, renderSize.height);
    assert.equal(renderSize.width, item.waterTargetWidth);
    assert.equal(renderSize.height, item.waterTargetWidth / item.waterVisualAspectRatio);
    assert.notEqual(renderSize.height, item.collisionHeight);

    for (const x of [obstacle.x, CONFIG.OBSTACLE_SUBMERGE_START_X - 20]) {
      obstacle.x = x;
      const ctx = createMockContext();

      manager.draw(ctx, createAssets());

      assert.equal(ctx.scales.length, 0);
      assert.equal(ctx.draws[0].args[3], renderSize.width);
      assert.equal(ctx.draws[0].args[4], renderSize.height);
    }
  }
});

test("impact preserves logical position and respects waterline offsets", () => {
  for (const item of THROWABLES) {
    const projectile = createProjectile(item, 820, 310);
    const manager = new ObstacleManager();

    updateProjectile(projectile, projectile.duration, { obstacles: manager });

    const [obstacle] = manager.encounterObstacles;
    assert.equal(obstacle.x, projectile.landingX);
    assert.equal(obstacle.y, projectile.landingY);
    assert.deepEqual(obstacle.renderAnchor, item.waterAnchor);
    assert.equal(obstacle.renderOffsetX, item.impactOffset.x);
    assert.equal(obstacle.renderOffsetY, item.impactOffset.y);
  }
});

test("each projectile enters the shared obstacle system exactly once", () => {
  const projectile = createProjectile(THROWABLES[2], 810, 300);
  const manager = new ObstacleManager();

  assert.equal(updateProjectile(projectile, projectile.duration, { obstacles: manager }), false);
  assert.equal(updateProjectile(projectile, projectile.duration, { obstacles: manager }), false);

  assert.equal(manager.encounterObstacles.length, 1);
});

test("water ripple render bounds do not enlarge collision hitboxes", () => {
  const item = THROWABLES.find((throwable) => throwable.id === "life-ring");
  const projectile = createProjectile(item, 810, 300);
  const manager = new ObstacleManager();

  updateProjectile(projectile, projectile.duration, { obstacles: manager });

  const [hitbox] = manager.hitboxes();
  assert.equal(hitbox.width, item.collisionWidth * item.collisionScale);
  assert.equal(hitbox.height, item.collisionHeight * item.collisionScale);
  assert.ok(hitbox.width < waterRenderSize(item).width);
  assert.ok(hitbox.height < waterRenderSize(item).height);
});

test("waterborne thrown items use normal obstacle movement and cleanup", () => {
  const item = THROWABLES[0];
  const projectile = createProjectile(item, 810, 300);
  const manager = new ObstacleManager();

  updateProjectile(projectile, projectile.duration, { obstacles: manager });
  const startX = manager.encounterObstacles[0].x;

  assert.equal(manager.update(0.5, 10, 300), 0);
  assert.equal(manager.encounterObstacles[0].x, startX - CONFIG.FISHERMAN_THROWABLE_SPEED * item.speedMultiplier * 0.5);

  manager.encounterObstacles[0].x = CONFIG.OBSTACLE_SUBMERGE_END_X + 1;
  assert.equal(manager.update(0.1, 10, 300), 1);
  assert.equal(manager.encounterObstacles.length, 0);
});

test("fisherman projectile physics and timing remain unchanged", () => {
  const projectile = createProjectile(THROWABLES[0], 810, 300);
  assert.equal(projectile.duration, CONFIG.FISHERMAN_PROJECTILE_DURATION_MS / 1000);
  assert.equal(projectile.startX, 720);
  assert.equal(projectile.startY, 268);
  assert.equal(projectile.landingX, CONFIG.OBSTACLE_SUBMERGE_START_X + 290);
  assert.equal(projectile.landingY, 326);

  const mid = projectilePosition(projectile, 0.5);
  assert.equal(mid.x, 700);
  assert.equal(mid.y, 297 - CONFIG.FISHERMAN_PROJECTILE_ARC_HEIGHT);
});

function createAssets() {
  return {
    head: image("head"),
    throwables: Object.fromEntries(
      Object.values(THROWABLES).flatMap((item) => [
        [item.airborneAssetKey, image(item.airborneAssetKey)],
        [item.waterAssetKey, image(item.waterAssetKey)]
      ])
    )
  };
}

function createMockContext() {
  return {
    draws: [],
    globalAlpha: 1,
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale(x, y) {
      this.scales.push([x, y]);
    },
    scales: [],
    drawImage(...args) {
      this.draws.push({ image: args[0], args });
    },
    drawnImages() {
      return this.draws.map((draw) => draw.image.key);
    }
  };
}

function image(key) {
  return { key, width: 100, height: 100 };
}
