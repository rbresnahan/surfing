const ASSET_BASE = "assets/";

const SURFER_FILES = {
  idle: "surfer-idle.png",
  up: "surfer-up.png",
  down: "surfer-down.png",
  left: "surfer-left.png",
  right: "surfer-right.png",
  fall: "surfer-fall.png"
};

export async function loadAssets() {
  const surfer = await loadRequiredImage(`${ASSET_BASE}surfer.png`);
  const head = await loadRequiredImage(`${ASSET_BASE}head.png`);
  const surferStates = {};

  await Promise.all(
    Object.entries(SURFER_FILES).map(async ([state, file]) => {
      surferStates[state] = await loadOptionalImage(`${ASSET_BASE}${file}`, surfer);
    })
  );

  const waveFrames = [];
  for (let i = 1; i <= 4; i += 1) {
    const image = await loadOptionalImage(`${ASSET_BASE}wave-${String(i).padStart(2, "0")}.png`);
    if (image) waveFrames.push(image);
  }

  return {
    surfer,
    head,
    surferStates: {
      idle: surferStates.idle,
      up: surferStates.up,
      down: surferStates.down,
      left: surferStates.left,
      right: surferStates.right,
      fall: surferStates.fall
    },
    waveFrames,
    hasFallSprite: surferStates.fall !== surfer
  };
}

function loadRequiredImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Missing required asset: ${src}`));
    image.src = src;
  });
}

async function loadOptionalImage(src, fallback = null) {
  if (globalThis.location?.protocol?.startsWith("http")) {
    try {
      const response = await fetch(src, { method: "HEAD" });
      if (!response.ok) return fallback;
    } catch {
      return fallback;
    }
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(fallback);
    image.src = src;
  });
}
