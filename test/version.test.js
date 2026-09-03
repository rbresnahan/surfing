import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CONFIG, VERSION } from "../src/config.js";

test("active version references agree on v0.11.2", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.equal(VERSION, "v0.11.2");
  assert.equal(packageJson.version, "0.11.2");
  assert.equal(CONFIG.STORAGE_KEY, "surf-game-v0.11.2-records");
  assert.match(html, /<title>Surf Game v0\.11\.2<\/title>/);
  assert.match(html, /aria-label="Surf Game v0\.11\.2"/);
  assert.doesNotMatch(html, /v0\.[34]\./);
});

test("production config defaults developer controls off", () => {
  assert.equal(CONFIG.DEVELOPER_CONTROLS, false);
});
