export function createBackgroundMusicController(audio) {
  if (audio) {
    audio.loop = true;
    audio.preload = "auto";
  }

  return {
    start() {
      if (!audio) return;

      resetAudio(audio);
      const playResult = audio.play?.();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {});
      }
    },
    stop() {
      if (!audio) return;
      resetAudio(audio);
    },
    get audio() {
      return audio;
    }
  };
}

function resetAudio(audio) {
  audio.pause?.();
  audio.currentTime = 0;
}
