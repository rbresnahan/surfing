import test from "node:test";
import assert from "node:assert/strict";
import { createBackgroundMusicController } from "../src/audio.js";

test("music starts through the centralized lifecycle and loops", () => {
  const audio = fakeAudio();
  const music = createBackgroundMusicController(audio);

  music.start();

  assert.equal(audio.loop, true);
  assert.equal(audio.preload, "auto");
  assert.equal(audio.pauseCount, 1);
  assert.equal(audio.playCount, 1);
  assert.equal(audio.currentTime, 0);
});

test("restart resets music playback to the beginning without overlapping playbacks", () => {
  const audio = fakeAudio();
  const music = createBackgroundMusicController(audio);

  music.start();
  audio.currentTime = 42;
  music.start();

  assert.equal(audio.pauseCount, 2);
  assert.equal(audio.playCount, 2);
  assert.equal(audio.currentTime, 0);
});

test("rejected music playback promises do not break game start", () => {
  const audio = fakeAudio({ rejectPlay: true });
  const music = createBackgroundMusicController(audio);

  assert.doesNotThrow(() => music.start());
  assert.equal(audio.playCount, 1);
});

function fakeAudio(options = {}) {
  return {
    currentTime: 17,
    loop: false,
    preload: "",
    pauseCount: 0,
    playCount: 0,
    pause() {
      this.pauseCount += 1;
    },
    play() {
      this.playCount += 1;
      return options.rejectPlay ? Promise.reject(new Error("blocked")) : Promise.resolve();
    }
  };
}
