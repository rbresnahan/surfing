import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { CONFIG } from "../src/config.js";
import { AUDIO_FILES, FISHERMAN_FILES, THROWABLE_FILES } from "../src/assets.js";
import { rectsOverlap } from "../src/collision.js";
import {
  AngryFishermanEncounter,
  FISHERMAN_STATES,
  ORDINARY_THROW_SEQUENCE,
  THROWABLES,
  WALLET_THROWABLE_ID,
  airborneRenderSize,
  createThrowOrder,
  createProjectile,
  drawProjectile,
  projectileDurationSeconds,
  projectileHitbox,
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
  sandwich: ["item-sandwich.png", "item-sandwich-water.png"],
  wallet: ["item-wallet.png", "item-wallet-water.png"]
};

const EXPECTED_WATER_ASPECT_RATIOS = {
  bottle: 1240 / 1251,
  can: 1239 / 1167,
  "life-vest": 1516 / 975,
  "life-ring": 1471 / 1011,
  sandwich: 1254 / 1226,
  wallet: 1391 / 1009
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

test("background music asset is available in the audio asset directory", async () => {
  assert.equal(AUDIO_FILES.backgroundMusic, "sunset-circuit.mp3");
  assert.equal(AUDIO_FILES.rowboatFinaleMusic, "cartridge-drift.mp3");
  await access(new URL(`../assets/audio/${AUDIO_FILES.backgroundMusic}`, import.meta.url));
  await access(new URL(`../assets/audio/${AUDIO_FILES.rowboatFinaleMusic}`, import.meta.url));
});

test("angry fisherman finale assets are available under their final names", async () => {
  assert.equal(FISHERMAN_FILES.angryFisherman, "angry-fisherman.png");
  assert.equal(FISHERMAN_FILES.angryFishermanToss, "angry-fisherman-toss.png");
  assert.equal(FISHERMAN_FILES.angryFishermanLoss, "angry-fisherman-loss.png");
  assert.equal(FISHERMAN_FILES.angryFishermanCooler, "angry-fisherman-cooler.png");
  assert.equal(FISHERMAN_FILES.angryFishermanCoolerDump, "angry-fisherman-cooler-dump.png");

  for (const file of Object.values(FISHERMAN_FILES)) {
    await access(new URL(`../assets/${file}`, import.meta.url));
  }
});

test("ordinary throwable items can be randomized while wallet remains final", () => {
  const first = createThrowOrder(fixedRandom([0, 0, 0, 0, 0]));
  const second = createThrowOrder(fixedRandom([0.99, 0.99, 0.99, 0.99, 0.99]));

  assert.notDeepEqual(first.slice(0, -1), second.slice(0, -1));
  assert.equal(first.at(-1), WALLET_THROWABLE_ID);
  assert.equal(second.at(-1), WALLET_THROWABLE_ID);
  assert.deepEqual([...first.slice(0, -1)].sort(), [...ORDINARY_THROW_SEQUENCE].sort());
  assert.deepEqual([...second.slice(0, -1)].sort(), [...ORDINARY_THROW_SEQUENCE].sort());
});

test("wallet appears exactly once per encounter throw order", () => {
  for (let i = 0; i < 12; i += 1) {
    const order = createThrowOrder(() => i / 12);

    assert.equal(order.filter((id) => id === WALLET_THROWABLE_ID).length, 1);
    assert.equal(order.at(-1), WALLET_THROWABLE_ID);
    assert.equal(order.slice(0, -1).includes(WALLET_THROWABLE_ID), false);
  }
});

test("one shared wallet speed multiplier controls airborne and waterborne wallet movement", () => {
  const wallet = throwableById("wallet");

  assert.equal(CONFIG.FISHERMAN_WALLET_SPEED_MULTIPLIER, 0.8);
  assert.equal(wallet.speedMultiplier, CONFIG.FISHERMAN_WALLET_SPEED_MULTIPLIER);
  assert.equal(projectileDurationSeconds(wallet), normalProjectileDurationSeconds() / CONFIG.FISHERMAN_WALLET_SPEED_MULTIPLIER);
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

test("wallet uses its airborne asset during the projectile arc", () => {
  const item = throwableById("wallet");
  const projectile = createProjectile(item, 810, 300);
  projectile.age = projectile.duration * 0.5;
  const ctx = createMockContext();

  drawProjectile(ctx, projectile, createAssets());

  assert.deepEqual(ctx.drawnImages(), ["wallet"]);
});

test("wallet airborne duration is 1.25x normal duration without changing endpoints or arc", () => {
  const wallet = throwableById("wallet");
  const ordinary = throwableById("sandwich");
  const walletProjectile = createProjectile(wallet, 810, 300);
  const ordinaryProjectile = createProjectile(ordinary, 810, 300);

  assert.equal(walletProjectile.duration, normalProjectileDurationSeconds() / CONFIG.FISHERMAN_WALLET_SPEED_MULTIPLIER);
  assert.equal(walletProjectile.duration / ordinaryProjectile.duration, 1.25);
  assert.equal(walletProjectile.startX, ordinaryProjectile.startX);
  assert.equal(walletProjectile.startY, ordinaryProjectile.startY);
  assert.equal(walletProjectile.landingX, ordinaryProjectile.landingX);
  assert.equal(walletProjectile.landingY, ordinaryProjectile.landingY);
  assert.deepEqual(projectilePosition(walletProjectile, 0.5), projectilePosition(ordinaryProjectile, 0.5));
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

test("wallet landing creates the waterborne wallet obstacle", () => {
  const item = throwableById("wallet");
  const projectile = createProjectile(item, 810, 300);
  const manager = new ObstacleManager();

  updateProjectile(projectile, projectile.duration, { obstacles: manager });

  assert.equal(manager.encounterObstacles.length, 1);
  assert.equal(manager.encounterObstacles[0].assetKey, "walletWater");
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

test("wallet waterborne speed is 80 percent of normal waterborne item speed", () => {
  const wallet = throwableById("wallet");
  const projectile = createProjectile(wallet, 810, 300);
  const manager = new ObstacleManager();

  updateProjectile(projectile, projectile.duration, { obstacles: manager });
  const [obstacle] = manager.encounterObstacles;

  assert.equal(obstacle.speed, CONFIG.FISHERMAN_THROWABLE_SPEED * CONFIG.FISHERMAN_WALLET_SPEED_MULTIPLIER);
});

test("ordinary airborne projectile timing and waterborne speed remain unchanged", () => {
  const bottle = throwableById("bottle");
  const projectile = createProjectile(bottle, 810, 300);
  const manager = new ObstacleManager();

  assert.equal(projectile.duration, normalProjectileDurationSeconds());

  updateProjectile(projectile, projectile.duration, { obstacles: manager });

  assert.equal(manager.encounterObstacles[0].speed, CONFIG.FISHERMAN_THROWABLE_SPEED * bottle.speedMultiplier);
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

test("airborne and waterborne wallet hazards expose normal collision hitboxes", () => {
  const item = throwableById("wallet");
  const projectile = createProjectile(item, 810, 300);
  projectile.age = projectile.duration * 0.5;
  const airBox = projectileHitbox(projectile);
  const manager = new ObstacleManager();

  updateProjectile(projectile, projectile.duration, { obstacles: manager });
  const [waterBox] = manager.hitboxes();

  assert.equal(airBox.width, item.collisionWidth * item.collisionScale);
  assert.equal(airBox.height, item.collisionHeight * item.collisionScale);
  assert.equal(waterBox.width, item.collisionWidth * item.collisionScale);
  assert.equal(waterBox.height, item.collisionHeight * item.collisionScale);
});

test("wallet slower speed preserves proportions and collision sizing", () => {
  const wallet = throwableById("wallet");
  const projectile = createProjectile(wallet, 810, 300);
  projectile.age = projectile.duration * 0.5;
  const airSize = airborneRenderSize(wallet);
  const airBox = projectileHitbox(projectile);
  const manager = new ObstacleManager();

  updateProjectile(projectile, projectile.duration, { obstacles: manager });
  const [obstacle] = manager.encounterObstacles;
  const [waterBox] = manager.hitboxes();

  assert.equal(airSize.width, wallet.airborneTargetWidth);
  assert.equal(airSize.height, wallet.airborneTargetWidth * wallet.airborneVisualAspectRatio);
  assert.equal(obstacle.width, waterRenderSize(wallet).width);
  assert.equal(obstacle.height, waterRenderSize(wallet).height);
  assert.equal(airBox.width, wallet.collisionWidth * wallet.collisionScale);
  assert.equal(waterBox.width, wallet.collisionWidth * wallet.collisionScale);
});

test("wallet is configured only as a hazardous throwable", () => {
  const wallet = throwableById("wallet");

  assert.equal(wallet.id, "wallet");
  assert.equal("scoreValue" in wallet, false);
  assert.equal("collectible" in wallet, false);
  assert.equal("reward" in wallet, false);
});

test("fisherman begins the final sequence with the normal sprite", () => {
  const encounter = new AngryFishermanEncounter(() => 0);
  const ctx = createMockContext();
  encounter.start();
  encounter.x = CONFIG.FISHERMAN_STOP_X;
  encounter.state = FISHERMAN_STATES.WINDUP;
  encounter.throwOrder = ["wallet"];

  encounter.render(ctx, createGameState());

  assert.deepEqual(ctx.drawnImages(), ["angryFisherman"]);
});

test("toss sprite is used while throwing the wallet", () => {
  const encounter = new AngryFishermanEncounter(() => 0);
  const ctx = createMockContext();
  encounter.start();
  encounter.x = CONFIG.FISHERMAN_STOP_X;
  encounter.throwOrder = ["wallet"];

  encounter.throwNextItem();
  encounter.render(ctx, createGameState());

  assert.deepEqual(ctx.drawnImages(), ["wallet", "angryFishermanToss"]);
});

test("loss sprite does not appear when the wallet is released", () => {
  const encounter = new AngryFishermanEncounter(() => 0);
  encounter.start();
  encounter.throwOrder = ["wallet"];

  encounter.throwNextItem();

  assert.equal(encounter.walletState, "AIRBORNE");
  assert.equal(encounter.lossSpriteActive, false);
  assert.equal(encounter.state, FISHERMAN_STATES.THROWING);
});

test("wallet release triggers the rowboat music transition exactly once", () => {
  const encounter = new AngryFishermanEncounter(() => 0);
  const gameState = createGameState();
  let transitionCount = 0;
  gameState.music = {
    transitionToRowboatFinale() {
      transitionCount += 1;
    }
  };
  encounter.start();
  encounter.x = CONFIG.FISHERMAN_STOP_X;
  encounter.throwOrder = ["wallet"];

  encounter.throwNextItem(gameState);
  encounter.update(0.01, gameState);

  assert.equal(transitionCount, 1);
  assert.equal(encounter.walletState, "AIRBORNE");
  assert.equal(encounter.state, FISHERMAN_STATES.THROWING);
});

test("ordinary thrown items do not trigger the rowboat music transition", () => {
  const encounter = new AngryFishermanEncounter(() => 0);
  const gameState = createGameState();
  let transitionCount = 0;
  gameState.music = {
    transitionToRowboatFinale() {
      transitionCount += 1;
    }
  };
  encounter.start();
  encounter.throwOrder = ["bottle"];

  encounter.throwNextItem(gameState);

  assert.equal(transitionCount, 0);
});

test("wallet landing creates water wallet and switches to loss sprite in the same transition", () => {
  const { encounter, gameState } = createWalletFinaleEncounter();
  const ctx = createMockContext();

  encounter.update(encounter.projectiles[0].duration, gameState);
  encounter.render(ctx, gameState);

  assert.equal(encounter.walletState, "LANDED");
  assert.equal(encounter.lossSpriteActive, true);
  assert.equal(encounter.state, FISHERMAN_STATES.WALLET_LOSS_PAUSE);
  assert.equal(gameState.obstacles.encounterObstacles.length, 1);
  assert.equal(gameState.obstacles.encounterObstacles[0].assetKey, "walletWater");
  assert.deepEqual(ctx.drawnImages(), ["angryFishermanLoss"]);
});

test("two-second dramatic pause starts at the slower wallet landing", () => {
  const { encounter, gameState } = createWalletFinaleEncounter();
  const startX = encounter.x;

  assert.equal(CONFIG.FISHERMAN_WALLET_LOSS_PAUSE_SECONDS, 2);

  encounter.update(normalProjectileDurationSeconds(), gameState);

  assert.equal(encounter.state, FISHERMAN_STATES.WALLET_AIRBORNE);
  assert.equal(encounter.lossSpriteActive, false);
  assert.equal(gameState.obstacles.encounterObstacles.length, 0);

  encounter.update(encounter.projectiles[0].duration - normalProjectileDurationSeconds(), gameState);

  assert.equal(encounter.state, FISHERMAN_STATES.WALLET_LOSS_PAUSE);
  assert.equal(encounter.timer, CONFIG.FISHERMAN_WALLET_LOSS_PAUSE_SECONDS);
  assert.equal(encounter.x, startX);
  assert.equal(gameState.obstacles.encounterObstacles[0].assetKey, "walletWater");
});

test("loss sprite remains active while the boat exits", () => {
  const encounter = new AngryFishermanEncounter(() => 0);
  const ctx = createMockContext();
  encounter.start();
  encounter.projectiles = [];
  encounter.state = FISHERMAN_STATES.WALLET_LOSS_EXIT;
  encounter.lossSpriteActive = true;

  encounter.render(ctx, createGameState());

  assert.deepEqual(ctx.drawnImages(), ["angryFishermanLoss"]);
});

test("wallet landing transition and waterborne spawn happen only once", () => {
  const encounter = new AngryFishermanEncounter(() => 0);
  const manager = new ObstacleManager();
  encounter.start();
  encounter.throwOrder = ["wallet"];
  encounter.throwNextItem();
  const [projectile] = encounter.projectiles;

  assert.equal(updateProjectile(projectile, projectile.duration, { obstacles: manager }), false);
  assert.equal(updateProjectile(projectile, projectile.duration, { obstacles: manager }), false);

  assert.equal(manager.encounterObstacles.length, 1);
  assert.equal(encounter.walletLandingHandled, true);
  assert.equal(encounter.lossSpriteActive, true);
});

test("boat is stationary before the two-second loss pause completes", () => {
  const { encounter, gameState } = createLandedWalletFinale();
  const startX = encounter.x;

  encounter.update(1.99, gameState);

  assert.equal(encounter.x, startX);
  assert.equal(encounter.state, FISHERMAN_STATES.WALLET_LOSS_PAUSE);
});

test("at 1.99 seconds the boat has not begun exiting", () => {
  const { encounter, gameState } = createLandedWalletFinale();
  const startX = encounter.x;

  encounter.update(1.99, gameState);

  assert.equal(encounter.x, startX);
  assert.equal(encounter.timer > 0, true);
  assert.equal(encounter.state, FISHERMAN_STATES.WALLET_LOSS_PAUSE);
});

test("at two seconds the encounter enters the slow-exit state without moving that frame", () => {
  const { encounter, gameState } = createLandedWalletFinale();
  const startX = encounter.x;

  encounter.update(CONFIG.FISHERMAN_WALLET_LOSS_PAUSE_SECONDS, gameState);

  assert.equal(encounter.x, startX);
  assert.equal(encounter.timer, 0);
  assert.equal(encounter.state, FISHERMAN_STATES.WALLET_LOSS_EXIT);
});

test("immediately after two seconds the boat begins its existing slow exit", () => {
  const { encounter, gameState } = createLandedWalletFinale();
  encounter.update(CONFIG.FISHERMAN_WALLET_LOSS_PAUSE_SECONDS, gameState);
  const startX = encounter.x;

  encounter.update(0.01, gameState);

  assert.equal(encounter.state, FISHERMAN_STATES.WALLET_LOSS_EXIT);
  assert.equal(encounter.x, startX + CONFIG.FISHERMAN_WALLET_LOSS_EXIT_SPEED * 0.01);
});

test("slow finale exit speed comes from config and is slower than default exit", () => {
  const { encounter, gameState } = createLandedWalletFinale();
  assert.equal(CONFIG.FISHERMAN_WALLET_LOSS_EXIT_SPEED, 80);

  encounter.update(CONFIG.FISHERMAN_WALLET_LOSS_PAUSE_SECONDS, gameState);
  const startX = encounter.x;

  encounter.update(1, gameState);

  assert.equal(encounter.x, startX + CONFIG.FISHERMAN_WALLET_LOSS_EXIT_SPEED);
  assert.ok(CONFIG.FISHERMAN_WALLET_LOSS_EXIT_SPEED < CONFIG.FISHERMAN_EXIT_SPEED);
});

test("loss sprite remains active throughout the pause and exit", () => {
  const { encounter, gameState } = createLandedWalletFinale();
  const pauseCtx = createMockContext();
  encounter.render(pauseCtx, gameState);

  encounter.update(CONFIG.FISHERMAN_WALLET_LOSS_PAUSE_SECONDS, gameState);
  const exitCtx = createMockContext();
  encounter.render(exitCtx, gameState);

  assert.deepEqual(pauseCtx.drawnImages(), ["angryFishermanLoss"]);
  assert.deepEqual(exitCtx.drawnImages(), ["angryFishermanLoss"]);
});

test("slow finale exit eventually leaves the screen and completes", () => {
  const { encounter, gameState } = createLandedWalletFinale();
  encounter.update(CONFIG.FISHERMAN_WALLET_LOSS_PAUSE_SECONDS, gameState);

  encounter.update(10, gameState);

  assert.equal(encounter.state, FISHERMAN_STATES.COMPLETE);
  assert.equal(encounter.isComplete(), true);
});

test("rowboat finale music is not stopped when the encounter completes", () => {
  const encounter = new AngryFishermanEncounter(() => 0);
  const gameState = createGameState();
  let transitionCount = 0;
  let stopCount = 0;
  gameState.music = {
    transitionToRowboatFinale() {
      transitionCount += 1;
    },
    stop() {
      stopCount += 1;
    }
  };
  encounter.start();
  encounter.x = CONFIG.FISHERMAN_STOP_X;
  encounter.throwOrder = ["wallet"];
  encounter.throwNextItem(gameState);
  encounter.update(encounter.projectiles[0].duration, gameState);
  encounter.update(CONFIG.FISHERMAN_WALLET_LOSS_PAUSE_SECONDS, gameState);
  encounter.update(10, gameState);

  assert.equal(encounter.isComplete(), true);
  assert.equal(transitionCount, 1);
  assert.equal(stopCount, 0);
});

test("restart cleanup resets encounter wallet finale state", () => {
  const { encounter } = createLandedWalletFinale();

  encounter.cleanup();

  assert.equal(encounter.walletState, "WAITING");
  assert.equal(encounter.walletLandingHandled, false);
  assert.equal(encounter.lossSpriteActive, false);
  assert.equal(encounter.timer, 0);
  assert.equal(encounter.state, FISHERMAN_STATES.INACTIVE);
  assert.deepEqual(encounter.projectiles, []);
});

test("airborne and waterborne wallet collisions still overlap surfer crash hazards", () => {
  const item = throwableById("wallet");
  const projectile = createProjectile(item, 810, 300);
  projectile.age = projectile.duration * 0.5;
  const airBox = projectileHitbox(projectile);
  const surferBox = { ...airBox };
  const manager = new ObstacleManager();

  updateProjectile(projectile, projectile.duration, { obstacles: manager });
  const [waterBox] = manager.hitboxes();

  assert.equal(rectsOverlap(surferBox, airBox), true);
  assert.equal(rectsOverlap({ ...waterBox }, waterBox), true);
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

test("waterborne wallet fading, sinking, collision, and cleanup still work while slower", () => {
  const wallet = throwableById("wallet");
  const projectile = createProjectile(wallet, 810, 300);
  const manager = new ObstacleManager();

  updateProjectile(projectile, projectile.duration, { obstacles: manager });
  const startX = manager.encounterObstacles[0].x;

  assert.equal(manager.update(0.5, 10, 300), 0);
  assert.equal(manager.encounterObstacles[0].x, startX - CONFIG.FISHERMAN_THROWABLE_SPEED * CONFIG.FISHERMAN_WALLET_SPEED_MULTIPLIER * 0.5);
  assert.equal(manager.hitboxes().length, 1);

  manager.encounterObstacles[0].x = CONFIG.OBSTACLE_SUBMERGE_START_X - 20;
  const ctx = createMockContext();
  manager.draw(ctx, createAssets());

  assert.ok(ctx.draws[0].args[1] < CONFIG.OBSTACLE_SUBMERGE_START_X);
  assert.ok(ctx.globalAlpha >= 0);

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
    angryFisherman: image("angryFisherman"),
    angryFishermanToss: image("angryFishermanToss"),
    angryFishermanLoss: image("angryFishermanLoss"),
    throwables: Object.fromEntries(
      Object.values(THROWABLES).flatMap((item) => [
        [item.airborneAssetKey, image(item.airborneAssetKey)],
        [item.waterAssetKey, image(item.waterAssetKey)]
      ])
    )
  };
}

function createGameState() {
  return {
    assets: createAssets(),
    obstacles: new ObstacleManager()
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

function throwableById(id) {
  return THROWABLES.find((item) => item.id === id);
}

function normalProjectileDurationSeconds() {
  return CONFIG.FISHERMAN_PROJECTILE_DURATION_MS / 1000;
}

function createWalletFinaleEncounter() {
  const encounter = new AngryFishermanEncounter(() => 0);
  const gameState = createGameState();
  encounter.start();
  encounter.x = CONFIG.FISHERMAN_STOP_X;
  encounter.throwOrder = ["wallet"];
  encounter.throwNextItem();
  return { encounter, gameState };
}

function createLandedWalletFinale() {
  const setup = createWalletFinaleEncounter();
  setup.encounter.update(setup.encounter.projectiles[0].duration, setup.gameState);
  return setup;
}

function fixedRandom(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}
