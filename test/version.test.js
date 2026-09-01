import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CONFIG, VERSION } from "../src/config.js";

test("active version references agree on v0.5.1", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.equal(VERSION, "v0.5.1");
  assert.equal(packageJson.version, "0.5.1");
  assert.equal(CONFIG.STORAGE_KEY, "surf-game-v0.5.1-records");
  assert.match(html, /<title>Surf Game v0\.5\.1<\/title>/);
  assert.match(html, /aria-label="Surf Game v0\.5\.1"/);
  assert.doesNotMatch(html, /v0\.[34]\./);
});
