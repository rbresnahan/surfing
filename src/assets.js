const ASSET_BASE = "assets/";

const SURFER_FILES = {
  idle: "surfer-idle.png",
  right: "surfer.png",
  up: "surfer-up.png",
  down: "surfer-down.png",
  left: "surfer-jump.png",
  fall: "surfer-falling.png"
};

const THROWABLE_FILES = {
  bottle: "item-bottle.png",
  can: "item-beer-can.png",
  lifeVest: "item-life-jacket.png",
  lifeRing: "item-life-preserver.png",
  sandwich: "item-sandwich.png"
};

export async function loadAssets() {
  const [head, surferStates, fisherman, fishermanThrow, throwables] = await Promise.all([
    loadRequiredImage(`${ASSET_BASE}head.png`),
    loadSurferStates(),
    loadRequiredImage(`${ASSET_BASE}angry-fisherman.png`),
    loadRequiredImage(`${ASSET_BASE}angry-fisherman-toss.png`),
    loadThrowables()
  ]);

  const waveFrames = [];
  for (let i = 1; i <= 4; i += 1) {
    const image = await loadOptionalImage(`${ASSET_BASE}wave-${String(i).padStart(2, "0")}.png`);
    if (image) waveFrames.push(image);
  }

  return {
    surfer: surferStates.right,
    surferFrame: surferStates.right,
    head,
    fisherman,
    fishermanThrow,
    throwables,
    surferStates,
    waveFrames,
    hasFallSprite: true
  };
}

async function loadSurferStates() {
  const entries = await Promise.all(
    Object.entries(SURFER_FILES).map(async ([state, file]) => [
      state,
      await loadRequiredImage(`${ASSET_BASE}${file}`)
    ])
  );

  return Object.fromEntries(entries);
}

async function loadThrowables() {
  const entries = await Promise.all(
    Object.entries(THROWABLE_FILES).map(async ([key, file]) => [
      key,
      await loadRequiredImage(`${ASSET_BASE}${file}`)
    ])
  );

  return Object.fromEntries(entries);
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
