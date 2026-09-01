import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CONFIG, VERSION } from "../src/config.js";

test("active version references agree on v0.8.0", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.equal(VERSION, "v0.8.0");
  assert.equal(packageJson.version, "0.8.0");
  assert.equal(CONFIG.STORAGE_KEY, "surf-game-v0.8.0-records");
  assert.match(html, /<title>Surf Game v0\.8\.0<\/title>/);
  assert.match(html, /aria-label="Surf Game v0\.8\.0"/);
  assert.doesNotMatch(html, /v0\.[34]\./);
});
