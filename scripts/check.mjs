import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const html = await readFile(path.join(root, "index.html"), "utf8");
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((v) => !v.startsWith("#") && !/^(?:https?:|mailto:)/.test(v));
const css = await readFile(path.join(root, "reference.css"), "utf8");
references.push(
  ...[...css.matchAll(/url\((assets\/[^)]+)\)/g)].map((m) => m[1]),
);
for (const filename of new Set(references))
  assert.ok((await stat(path.join(root, filename))).size > 0, filename);
const { teams, stories } = await import("../dist/data.js");
assert.equal(teams.length, 3);
assert.equal(stories.length, 5);
for (const story of stories)
  assert.ok((await stat(path.join(root, story.image))).size > 0);
assert.equal((html.match(/data-shader=/g) || []).length, 3);
assert.equal((html.match(/data-format-card=/g) || []).length, 24);
assert.equal((html.match(/data-faq=/g) || []).length, 6);
assert.ok(!html.includes('<script src="/_next/'));
assert.ok(!html.includes('src="https://'));
console.log(
  "Checks passed: local assets, shaders, 24 formats, 6 FAQ entries, 3 team states and 5 stories.",
);
