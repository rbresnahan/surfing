import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import { loadRecords, saveRecords } from "../src/scoring.js";

test("debug non-scoring runs cannot submit high scores", () => {
  const storage = new FakeStorage();
  storage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({ bestTime: 10, bestDodged: 2, highScore: 2000 }));

  const records = saveRecords({ survivalTime: 99, headsDodged: 99, score: 99999, nonScoring: true }, storage);

  assert.deepEqual(records, { bestTime: 10, bestDodged: 2, highScore: 2000 });
  assert.deepEqual(loadRecords(storage), { bestTime: 10, bestDodged: 2, highScore: 2000 });
});

class FakeStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}
