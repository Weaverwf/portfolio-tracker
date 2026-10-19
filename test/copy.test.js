import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const FILES = [
  "index.html",
  "styles.css",
  "app.js",
  "calc.js",
  "quotes.js",
  "sample.js",
  "storage.js",
  "sw.js",
  "server.js",
  "manifest.webmanifest",
  "README.md",
  "package.json",
];

test("the app does not use order language", () => {
  const banned = /\b(buy|sell|buying|selling|purchase|shares to)\b/i;
  for (const file of FILES) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(banned.test(text), false, `${file} has order language`);
  }
});
