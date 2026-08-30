const DEFAULT_FADE_DURATION_MS = 1200;

export function createBackgroundMusicController(audio, options = {}) {
  const rowboatFinaleAudio = options.rowboatFinaleAudio ?? null;
  const fadeDurationMs = options.fadeDurationMs ?? DEFAULT_FADE_DURATION_MS;
  const scheduler = createScheduler(options);
  let fadeFrame = null;
  let transitionStarted = false;
  let activeFadeToken = 0;
  let normalVolume = getVolume(audio);

  for (const track of [audio, rowboatFinaleAudio]) {
    if (track) {
      track.loop = true;
      track.preload = "auto";
    }
  }

  return {
    start() {
      if (!audio) return;

      cancelFade();
      const restartVolume = transitionStarted ? normalVolume : getVolume(audio);
      transitionStarted = false;
      normalVolume = restartVolume;
      setVolume(audio, normalVolume);
      resetAudio(rowboatFinaleAudio);
      resetAudio(audio);
      const playResult = audio.play?.();
      ignorePlayRejection(playResult);
    },
    stop() {
      cancelFade();
      transitionStarted = false;
      resetAudio(audio);
      resetAudio(rowboatFinaleAudio);
    },
    transitionToRowboatFinale() {
      if (!audio || !rowboatFinaleAudio || transitionStarted) return;

      transitionStarted = true;
      normalVolume = getVolume(audio);
      syncMute(audio, rowboatFinaleAudio);
      fadeVolume(audio, normalVolume, 0, fadeDurationMs, () => {
        resetAudio(audio);
        setVolume(audio, normalVolume);
        syncMute(audio, rowboatFinaleAudio);
        resetAudio(rowboatFinaleAudio);
        setVolume(rowboatFinaleAudio, 0);
        const playResult = rowboatFinaleAudio.play?.();
        ignorePlayRejection(playResult);
        fadeVolume(rowboatFinaleAudio, 0, normalVolume, fadeDurationMs);
      });
    },
    get audio() {
      return audio;
    },
    get rowboatFinaleAudio() {
      return rowboatFinaleAudio;
    }
  };

  function fadeVolume(track, from, to, durationMs, onComplete = null) {
    const token = activeFadeToken + 1;
    activeFadeToken = token;
    const startedAt = scheduler.now();
    cancelScheduledFrame();

    const step = (now) => {
      if (token !== activeFadeToken) return;

      const progress = durationMs <= 0 ? 1 : Math.min(1, (now - startedAt) / durationMs);
      setVolume(track, from + (to - from) * progress);

      if (progress >= 1) {
        fadeFrame = null;
        onComplete?.();
        return;
      }

      fadeFrame = scheduler.requestFrame(step);
    };

    setVolume(track, from);
    fadeFrame = scheduler.requestFrame(step);
  }

  function cancelFade() {
    activeFadeToken += 1;
    cancelScheduledFrame();
  }

  function cancelScheduledFrame() {
    if (fadeFrame === null) return;
    scheduler.cancelFrame(fadeFrame);
    fadeFrame = null;
  }
}

function resetAudio(audio) {
  if (!audio) return;
  audio.pause?.();
  audio.currentTime = 0;
}

function getVolume(audio) {
  return typeof audio?.volume === "number" ? audio.volume : 1;
}

function setVolume(audio, volume) {
  if (!audio || typeof audio.volume !== "number") return;
  audio.volume = Math.max(0, Math.min(1, volume));
}

function syncMute(from, to) {
  if (!from || !to || typeof from.muted !== "boolean") return;
  to.muted = from.muted;
}

function ignorePlayRejection(playResult) {
  if (playResult && typeof playResult.catch === "function") {
    playResult.catch(() => {});
  }
}

function createScheduler(options) {
  return {
    now: options.now ?? (() => performance.now()),
    requestFrame: options.requestFrame ?? ((callback) => requestAnimationFrame(callback)),
    cancelFrame: options.cancelFrame ?? ((id) => cancelAnimationFrame(id))
  };
}
