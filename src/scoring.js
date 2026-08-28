import { CONFIG } from "./config.js";

export function calculateScore(survivalTime, headsDodged) {
  return Math.floor(survivalTime * CONFIG.SCORE_TIME_MULTIPLIER) + headsDodged * CONFIG.SCORE_DODGE_VALUE;
}

export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remaining.toFixed(1).padStart(4, "0")}`;
}

export function loadRecords(storage = globalThis.localStorage) {
  const fallback = { bestTime: 0, bestDodged: 0, highScore: 0 };
  if (!storage) return fallback;

  try {
    return { ...fallback, ...JSON.parse(storage.getItem(CONFIG.STORAGE_KEY)) };
  } catch {
    return fallback;
  }
}

export function saveRecords(run, storage = globalThis.localStorage) {
  const current = loadRecords(storage);
  const next = {
    bestTime: Math.max(current.bestTime, run.survivalTime),
    bestDodged: Math.max(current.bestDodged, run.headsDodged),
    highScore: Math.max(current.highScore, run.score)
  };

  if (storage) {
    storage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(next));
  }

  return next;
}
