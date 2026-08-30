import test from "node:test";
import assert from "node:assert/strict";
import { DODGE_OBSTACLE_TYPES } from "../src/dodgeObstacles.js";
import { loadAssets } from "../src/assets.js";

test("asset loader loads registered dodge obstacles", async () => {
  const originalImage = globalThis.Image;
  const originalAudio = globalThis.Audio;
  const loadedSources = [];

  globalThis.Image = class MockImage {
    set src(value) {
      loadedSources.push(value);
      queueMicrotask(() => this.onload?.());
    }
  };
  globalThis.Audio = undefined;

  try {
    const assets = await loadAssets();

    for (const type of DODGE_OBSTACLE_TYPES) {
      assert.ok(assets.dodgeObstacles[type.assetKey]);
      assert.ok(loadedSources.includes(`assets/${type.file}`));
    }
    assert.equal(loadedSources.includes(["assets/", "head", ".png"].join("")), false);
    assert.equal(loadedSources.includes(["assets/", "dodge", "-tube", ".png"].join("")), false);
  } finally {
    globalThis.Image = originalImage;
    globalThis.Audio = originalAudio;
  }
});

test("asset loader preloads both music tracks", async () => {
  const originalImage = globalThis.Image;
  const originalAudio = globalThis.Audio;
  const loadedAudioSources = [];

  globalThis.Image = class MockImage {
    set src(value) {
      queueMicrotask(() => this.onload?.());
    }
  };
  globalThis.Audio = class MockAudio {
    constructor(src) {
      this.src = src;
      this.preload = "";
      loadedAudioSources.push(src);
    }
  };

  try {
    const assets = await loadAssets();

    assert.ok(assets.backgroundMusic);
    assert.ok(assets.rowboatFinaleMusic);
    assert.deepEqual(loadedAudioSources, [
      "assets/audio/sunset-circuit.mp3",
      "assets/audio/cartridge-drift.mp3"
    ]);
    assert.equal(assets.backgroundMusic.preload, "auto");
    assert.equal(assets.rowboatFinaleMusic.preload, "auto");
  } finally {
    globalThis.Image = originalImage;
    globalThis.Audio = originalAudio;
  }
});
