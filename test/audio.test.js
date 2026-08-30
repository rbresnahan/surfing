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

test("rowboat finale music is preloaded and looped with the background track", () => {
  const audio = fakeAudio();
  const rowboatFinaleAudio = fakeAudio();

  createBackgroundMusicController(audio, { rowboatFinaleAudio });

  assert.equal(audio.loop, true);
  assert.equal(rowboatFinaleAudio.loop, true);
  assert.equal(audio.preload, "auto");
  assert.equal(rowboatFinaleAudio.preload, "auto");
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

test("wallet-triggered finale transition fades out, resets, starts, and fades in", () => {
  const audio = fakeAudio({ volume: 0.4, muted: true });
  const rowboatFinaleAudio = fakeAudio({ volume: 1 });
  const scheduler = fakeScheduler();
  const music = createBackgroundMusicController(audio, {
    rowboatFinaleAudio,
    fadeDurationMs: 1000,
    ...scheduler.controls
  });

  music.start();
  audio.currentTime = 31;
  music.transitionToRowboatFinale();

  scheduler.advance(500);
  assert.equal(audio.volume, 0.2);
  assert.equal(rowboatFinaleAudio.playCount, 0);

  scheduler.advance(500);
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.volume, 0.4);
  assert.equal(rowboatFinaleAudio.currentTime, 0);
  assert.equal(rowboatFinaleAudio.volume, 0);
  assert.equal(rowboatFinaleAudio.muted, true);
  assert.equal(rowboatFinaleAudio.playCount, 1);

  scheduler.advance(500);
  assert.equal(rowboatFinaleAudio.volume, 0.2);

  scheduler.advance(500);
  assert.equal(rowboatFinaleAudio.volume, 0.4);
  assert.equal(rowboatFinaleAudio.pauseCount, 2);
});

test("rowboat finale transition is idempotent and does not restart the finale track", () => {
  const audio = fakeAudio({ volume: 0.5 });
  const rowboatFinaleAudio = fakeAudio();
  const scheduler = fakeScheduler();
  const music = createBackgroundMusicController(audio, {
    rowboatFinaleAudio,
    fadeDurationMs: 1000,
    ...scheduler.controls
  });

  music.start();
  music.transitionToRowboatFinale();
  music.transitionToRowboatFinale();
  scheduler.advance(1000);
  scheduler.advance(1000);

  rowboatFinaleAudio.currentTime = 42;
  music.transitionToRowboatFinale();
  scheduler.advance(1000);

  assert.equal(rowboatFinaleAudio.playCount, 1);
  assert.equal(rowboatFinaleAudio.currentTime, 42);
  assert.equal(rowboatFinaleAudio.volume, 0.5);
});

test("restart cancels an in-flight rowboat music fade and resets both tracks", () => {
  const audio = fakeAudio({ volume: 0.6 });
  const rowboatFinaleAudio = fakeAudio();
  const scheduler = fakeScheduler();
  const music = createBackgroundMusicController(audio, {
    rowboatFinaleAudio,
    fadeDurationMs: 1000,
    ...scheduler.controls
  });

  music.start();
  music.transitionToRowboatFinale();
  scheduler.advance(250);
  music.start();
  scheduler.advance(1000);

  assert.equal(audio.volume, 0.6);
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.playCount, 2);
  assert.equal(rowboatFinaleAudio.playCount, 0);
  assert.equal(rowboatFinaleAudio.currentTime, 0);
  assert.equal(scheduler.pendingFrameCount(), 0);
});

function fakeAudio(options = {}) {
  return {
    currentTime: 17,
    loop: false,
    muted: options.muted ?? false,
    preload: "",
    volume: options.volume ?? 1,
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

function fakeScheduler() {
  let now = 0;
  let nextId = 1;
  const frames = new Map();

  return {
    controls: {
      now: () => now,
      requestFrame(callback) {
        const id = nextId;
        nextId += 1;
        frames.set(id, callback);
        return id;
      },
      cancelFrame(id) {
        frames.delete(id);
      }
    },
    advance(ms) {
      now += ms;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) {
        callback(now);
      }
    },
    pendingFrameCount() {
      return frames.size;
    }
  };
}
