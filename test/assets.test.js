import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { access, readFile, readdir } from "node:fs/promises";
import { DODGE_OBSTACLE_TYPES } from "../src/dodgeObstacles.js";
import { ATTACK_FISH_FILES, COOLER_TOSS_FILES, FISHERMAN_FILES, loadAssets, THROWABLE_FILES, WAVE_FRAME_FILES } from "../src/assets.js";

test("noodle-man dodge asset resolves with exact filename and case", async () => {
  const assetDir = new URL("../assets/", import.meta.url);
  const entries = await readdir(assetDir);
  const noodleMan = DODGE_OBSTACLE_TYPES.find((type) => type.id === "noodle-man");

  assert.equal(noodleMan.assetKey, "dodge-noodle-man");
  assert.equal(noodleMan.file, "dodge-noodle-man.png");
  assert.equal(entries.includes("dodge-noodle-man.png"), true);
  assert.equal(entries.includes("Dodge-Noodle-Man.png"), false);
  await access(new URL("../assets/dodge-noodle-man.png", import.meta.url));
});

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
      DODGE_OBSTACLE_TYPES.flatMap((type) => type.assetFiles.map((entry) => entry.file)).sort(),
      [
        "dodge-head.png",
        "dodge-noodle-girl.png",
        "dodge-noodle-man.png",
        "dodge-scuba-man-riser.png",
        "dodge-scuba-man-water.png",
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

test("asset loader preloads both explicit scuba riser assets", async () => {
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

    assert.ok(assets.dodgeObstacles["dodge-scuba-man-riser"]);
    assert.ok(assets.dodgeObstacles["dodge-scuba-man-water"]);
    assert.equal(loadedSources.includes("assets/dodge-scuba-man-riser.png"), true);
    assert.equal(loadedSources.includes("assets/dodge-scuba-man-water.png"), true);
    assert.equal(loadedSources.includes("assets/dodge-scuba-man.png"), false);
  } finally {
    globalThis.Image = originalImage;
    globalThis.Audio = originalAudio;
  }
});

test("scuba riser source assets preserve transparent RGBA artwork", async () => {
  for (const file of ["dodge-scuba-man-riser.png", "dodge-scuba-man-water.png"]) {
    const png = await readRgbaPng(new URL(`../assets/${file}`, import.meta.url));

    assert.equal(png.width, 1536, file);
    assert.equal(png.height, 1024, file);
    for (const [x, y] of [
      [0, 0],
      [png.width - 1, 0],
      [0, png.height - 1],
      [png.width - 1, png.height - 1]
    ]) {
      assert.equal(alphaAt(png, x, y), 0, `${file} corner ${x},${y}`);
    }
    assert.ok(png.pixels.some((value, index) => index % 4 === 3 && value > 0), `${file} has visible alpha`);
    assert.ok(png.pixels.some((value, index) => index % 4 === 3 && value === 0), `${file} has transparent alpha`);
  }
});

test("asset loader preloads noodle-man from the dodge registry", async () => {
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

    assert.ok(assets.dodgeObstacles["dodge-noodle-man"]);
    assert.equal(loadedSources.filter((src) => src === "assets/dodge-noodle-man.png").length, 1);
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
    assert.ok(assets.angryFishermanCoolerToss);
    assert.equal(loadedSources.includes("assets/angry-fisherman-cooler.png"), true);
    assert.equal(loadedSources.includes("assets/angry-fisherman-cooler-dump.png"), true);
    assert.equal(loadedSources.includes("assets/angry-fisherman-cooler-toss.png"), true);
  } finally {
    globalThis.Image = originalImage;
    globalThis.Audio = originalAudio;
  }
});

test("asset loader preloads cooler toss attack artwork", async () => {
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

    assert.deepEqual(FISHERMAN_FILES.angryFishermanCoolerToss, "angry-fisherman-cooler-toss.png");
    assert.deepEqual(COOLER_TOSS_FILES, {
      attackCooler: "attack-cooler.png",
      attackCoolerWater: "attack-cooler-water.png"
    });
    assert.ok(assets.coolerToss.attackCooler);
    assert.ok(assets.coolerToss.attackCoolerWater);
    assert.equal(loadedSources.includes("assets/attack-cooler.png"), true);
    assert.equal(loadedSources.includes("assets/attack-cooler-water.png"), true);
  } finally {
    globalThis.Image = originalImage;
    globalThis.Audio = originalAudio;
  }
});

test("asset loader preloads anti-camp fish artwork", async () => {
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

    assert.deepEqual(ATTACK_FISH_FILES, {
      attackFishOrangeWater: "attack-fish-orange-water.png",
      attackFishOrangeA: "attack-fish-orange-a.png",
      attackFishOrangeB: "attack-fish-orange-b.png"
    });
    for (const [key, file] of Object.entries(ATTACK_FISH_FILES)) {
      assert.ok(assets.attackFish[key]);
      assert.equal(loadedSources.includes(`assets/${file}`), true);
    }
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

test("rowboat throwable assets do not use a normal dodge swimmer", () => {
  assert.equal(Object.values(THROWABLE_FILES).includes("dodge-noodle-man.png"), false);
  assert.equal(Object.keys(THROWABLE_FILES).includes("dodge-noodle-man"), false);
});

async function readRgbaPng(url) {
  const buffer = await readFile(url);
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "PNG bit depth");
      assert.equal(data[9], 6, "PNG color type");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let input = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[input];
    input += 1;
    for (let x = 0; x < stride; x += 1) {
      const current = raw[input + x];
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      pixels[y * stride + x] = unfilter(filter, current, left, up, upLeft);
    }
    input += stride;
  }

  return { width, height, pixels };
}

function unfilter(filter, current, left, up, upLeft) {
  if (filter === 0) return current;
  if (filter === 1) return (current + left) & 0xff;
  if (filter === 2) return (current + up) & 0xff;
  if (filter === 3) return (current + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (current + paeth(left, up, upLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter: ${filter}`);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function alphaAt(png, x, y) {
  return png.pixels[(y * png.width + x) * 4 + 3];
}
