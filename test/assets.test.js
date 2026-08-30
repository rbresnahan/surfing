import test from "node:test";
import assert from "node:assert/strict";
import { DODGE_OBSTACLE_TYPES } from "../src/dodgeObstacles.js";
import { loadAssets, WAVE_FRAME_FILES } from "../src/assets.js";

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
    assert.deepEqual(
      DODGE_OBSTACLE_TYPES.map((type) => type.file).sort(),
      [
        "dodge-head.png",
        "dodge-noodle-girl.png",
        "dodge-noodle-man.png",
        "dodge-scuba-man.png",
        "dodge-tube-girl.png",
        "dodge-tube-woman.png"
      ]
    );
    assert.equal(loadedSources.includes(["assets/", "head", ".png"].join("")), false);
    assert.equal(loadedSources.includes(["assets/", "dodge", "-tube", ".png"].join("")), false);
    assert.equal(loadedSources.includes("assets/head-test.png"), false);
  } finally {
    globalThis.Image = originalImage;
    globalThis.Audio = originalAudio;
  }
});

test("asset loader preloads exactly the current wave animation frames", async () => {
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

    assert.deepEqual(WAVE_FRAME_FILES, [
      "wave-01.png",
      "wave-02.png",
      "wave-03.png",
      "wave-04.png"
    ]);
    assert.equal(assets.waveFrames.length, 4);
    assert.deepEqual(
      WAVE_FRAME_FILES.map((file) => `assets/${file}`),
      loadedSources.filter((src) => src.startsWith("assets/wave-"))
    );
  } finally {
    globalThis.Image = originalImage;
    globalThis.Audio = originalAudio;
  }
});

test("asset loader preloads cooler encounter artwork", async () => {
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

    assert.ok(assets.angryFishermanCooler);
    assert.ok(assets.angryFishermanCoolerDump);
    assert.equal(loadedSources.includes("assets/angry-fisherman-cooler.png"), true);
    assert.equal(loadedSources.includes("assets/angry-fisherman-cooler-dump.png"), true);
  } finally {
    globalThis.Image = originalImage;
    globalThis.Audio = originalAudio;
  }
});

test("asset loader does not preload archived artwork", async () => {
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
    await loadAssets();

    for (const file of [
      "assets/archive/fisherman-base.png",
      "assets/archive/head-test.png",
      "assets/archive/surfer-original-reference.png",
      "assets/archive/surfer-proto.png"
    ]) {
      assert.equal(loadedSources.includes(file), false);
    }
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
