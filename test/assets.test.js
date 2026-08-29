import test from "node:test";
import assert from "node:assert/strict";
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

    assert.ok(assets.dodgeObstacles["dodge-head"]);
    assert.ok(assets.dodgeObstacles["dodge-tube"]);
    assert.ok(loadedSources.includes("assets/dodge-head.png"));
    assert.ok(loadedSources.includes("assets/dodge-tube.png"));
    assert.equal(loadedSources.includes("assets/" + "head.png"), false);
  } finally {
    globalThis.Image = originalImage;
    globalThis.Audio = originalAudio;
  }
});
