/* CookiList voice-add prototype — UI integration contract (no browser).
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * Locks the rebased (#11 onto current main) integration shape: mic
 * trigger (SVG, no system emoji), review mount points, hooks wired by
 * app.js, styles, and offline precache of the voice helper.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "css", "app.css"), "utf8");
const appJs = readFileSync(join(root, "js", "app.js"), "utf8");
const swJs = readFileSync(join(root, "sw.js"), "utf8");

test("voice-ui: mic trigger is an SVG icon button, hidden until supported", () => {
  const btn = html.match(/<button[^>]*id="shopping-voice"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(btn, "#shopping-voice present in index.html");
  assert.ok(btn[0].includes('aria-label="Dicter des articles"'), "accessible name kept");
  assert.ok(/(^|\s)hidden(\s|>)/.test(btn[0]), "hidden by default (shown only when SR exists)");
  assert.ok(btn[1].includes("<svg"), "inline SVG icon, no system emoji");
  assert.ok(!btn[1].includes("🎙"), "no microphone emoji");
});

test("voice-ui: review mount points exist with mandatory preview actions", () => {
  for (const id of ["voice-review", "voice-transcript", "voice-chips", "voice-confirm", "voice-cancel"]) {
    assert.ok(html.includes(`id="${id}"`), `mount #${id} present`);
  }
  assert.ok(html.includes("Ajouter tout"), "explicit confirm-all action");
  assert.ok(html.includes("Annuler"), "simple cancel action");
});

test("voice-ui: app.js wires current store/catalog APIs only", () => {
  assert.ok(appJs.includes('from "./voice.js"'), "parser module imported");
  assert.ok(appJs.includes("els.voice = "), "mic element resolved at boot");
  assert.ok(appJs.includes("wireVoice();"), "wiring called at boot");
  assert.ok(appJs.includes("recognition.lang = \"fr-FR\""), "French recognition");
  assert.ok(!appJs.includes("filterCandidates"), "no stale staples API reintroduced");
});

test("voice-ui: mic and review styles present", () => {
  for (const selector of ["\\.voice-trigger", "\\.voice-mic-icon", "\\.voice-review", "\\.voice-chips", "\\.voice-chip", "\\.voice-confirm"]) {
    assert.ok(new RegExp(`${selector}\\s*\\{`).test(css), `règle ${selector} présente`);
  }
  assert.ok(/\.voice-trigger\.is-listening\s*\{/.test(css), "listening state styled");
});

test("voice-ui: voice helper precached for offline shell", () => {
  assert.ok(swJs.includes("./js/voice.js"), "js/voice.js in SW precache");
});
