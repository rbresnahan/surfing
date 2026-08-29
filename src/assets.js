import { DODGE_OBSTACLE_TYPES } from "./dodgeObstacles.js";

const ASSET_BASE = "assets/";
const AUDIO_BASE = `${ASSET_BASE}audio/`;

const SURFER_FILES = {
  idle: "surfer-idle.png",
  right: "surfer.png",
  up: "surfer-up.png",
  down: "surfer-down.png",
  left: "surfer-jump.png",
  fall: "surfer-falling.png"
};

export const FISHERMAN_FILES = {
  angryFisherman: "angry-fisherman.png",
  angryFishermanToss: "angry-fisherman-toss.png",
  angryFishermanLoss: "angry-fisherman-loss.png"
};

export const THROWABLE_FILES = {
  bottle: "item-bottle.png",
  bottleWater: "item-bottle-water.png",
  can: "item-beer-can.png",
  canWater: "item-beer-can-water.png",
  lifeVest: "item-life-jacket.png",
  lifeVestWater: "item-life-jacket-water.png",
  lifeRing: "item-life-preserver.png",
  lifeRingWater: "item-life-preserver-water.png",
  sandwich: "item-sandwich.png",
  sandwichWater: "item-sandwich-water.png",
  wallet: "item-wallet.png",
  walletWater: "item-wallet-water.png"
};

export const AUDIO_FILES = {
  backgroundMusic: "sunset-circuit.mp3"
};

export async function loadAssets() {
  const [
    dodgeObstacles,
    surferStates,
    angryFisherman,
    angryFishermanToss,
    angryFishermanLoss,
    throwables,
    backgroundMusic
  ] = await Promise.all([
    loadDodgeObstacles(),
    loadSurferStates(),
    loadRequiredImage(`${ASSET_BASE}${FISHERMAN_FILES.angryFisherman}`),
    loadRequiredImage(`${ASSET_BASE}${FISHERMAN_FILES.angryFishermanToss}`),
    loadRequiredImage(`${ASSET_BASE}${FISHERMAN_FILES.angryFishermanLoss}`),
    loadThrowables(),
    loadAudio(`${AUDIO_BASE}${AUDIO_FILES.backgroundMusic}`)
  ]);

  const waveFrames = [];
  for (let i = 1; i <= 4; i += 1) {
    const image = await loadOptionalImage(`${ASSET_BASE}wave-${String(i).padStart(2, "0")}.png`);
    if (image) waveFrames.push(image);
  }

  return {
    surfer: surferStates.right,
    surferFrame: surferStates.right,
    dodgeObstacles,
    angryFisherman,
    angryFishermanToss,
    angryFishermanLoss,
    throwables,
    backgroundMusic,
    surferStates,
    waveFrames,
    hasFallSprite: true
  };
}

async function loadDodgeObstacles() {
  const entries = await Promise.all(
    DODGE_OBSTACLE_TYPES.map(async (type) => [
      type.assetKey,
      await loadRequiredImage(`${ASSET_BASE}${type.file}`)
    ])
  );

  return Object.fromEntries(entries);
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

function loadAudio(src) {
  if (typeof Audio !== "function") return null;

  const audio = new Audio(src);
  audio.preload = "auto";
  return audio;
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
