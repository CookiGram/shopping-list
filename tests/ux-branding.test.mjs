/* CookiList — visible product branding (#27).
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * The visible product is CookiList (repo stays shopping-list):
 * document title, header brand, PWA manifest/install name, share
 * title, export header and filename. CookiGram stays only as the
 * catalog-data attribution in the footer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
const manifestRaw = readFileSync(join(root, "manifest.webmanifest"), "utf8");
const appJs = readFileSync(join(root, "js", "app.js"), "utf8");

test("Branding: document title and header show CookiList", () => {
  assert.ok(html.includes("<title>CookiList</title>"), "document title is CookiList");
  const brand = html.match(/<span class="brand">[\s\S]*?<\/span>/);
  assert.ok(brand, "header brand present");
  assert.ok(brand[0].includes("CookiList"), "header brand reads CookiList");
  assert.ok(!brand[0].includes("Courses"), "old product name gone from header");
});

test("Branding: PWA manifest installs as CookiList", () => {
  assert.equal(manifest.name, "CookiList", "install name");
  assert.equal(manifest.short_name, "CookiList", "launcher short name");
  assert.ok(
    manifest.description.startsWith("CookiList — "),
    "manifest description leads with CookiList",
  );
  assert.ok(!manifestRaw.includes("Courses"), "old product name gone from manifest");
});

test("Branding: share/export carry CookiList", () => {
  assert.ok(appJs.includes('title: "CookiList"'), "share title is CookiList");
  assert.ok(appJs.includes('"🛒 CookiList"'), "export header is CookiList");
  assert.ok(appJs.includes('"cookilist.txt"'), "export filename is cookilist.txt");
  assert.ok(!appJs.includes('"Courses"'), "old product name gone from app shares");
  assert.ok(!appJs.includes("courses.txt"), "old export filename gone");
});

test("Branding: catalog attribution still credits CookiGram data", () => {
  assert.ok(
    /Catalogue CookiGram/.test(appJs),
    "footer keeps crediting the CookiGram catalog source",
  );
});
