/* Shopping List — empty-state illustré + Récents en chips directes.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * Ces tests épinglent sans navigateur : empty-state = illustration
 * légère + une ligne minimale (pas de pédagogie), Récents = un
 * bouton autonome par produit (pas de couple ligne + "+ Ajouter"),
 * hooks métier conservés, illustration précachée hors ligne.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "css", "app.css"), "utf8");
const componentsJs = readFileSync(join(root, "js", "components.js"), "utf8");
const appJs = readFileSync(join(root, "js", "app.js"), "utf8");
const swJs = readFileSync(join(root, "sw.js"), "utf8");

test("Empty/Récents: l'empty-state affiche une illustration légère + un message minimal", () => {
  const fallback = html.match(/<div class="empty-state"[\s\S]*?<\/div>/);
  assert.ok(fallback, "fallback empty-state présent dans index.html");
  assert.ok(
    /<img[^>]*empty-basket\.svg[^>]*alt="[^"]+"/.test(fallback[0]),
    "le fallback embarque l'illustration avec un alt",
  );
  assert.ok(fallback[0].includes("Votre liste est vide."), "message minimal conservé");
  assert.strictEqual(
    [...fallback[0].matchAll(/<p[\s>]/g)].length,
    1,
    "un seul paragraphe, pas de pédagogie",
  );
  const fn = componentsJs.match(/export function emptyState[\s\S]*?\n\}/);
  assert.ok(fn, "emptyState existe dans components.js");
  assert.ok(fn[0].includes("empty-basket.svg"), "emptyState() rend la même illustration");
  assert.ok(fn[0].includes("Votre liste est vide."), "emptyState() garde le message minimal");
});

test("Empty/Récents: l'illustration est intégrée proprement au repo", () => {
  const rel = "assets/illustrations/empty-basket.svg";
  const svg = readFileSync(join(root, rel), "utf8");
  assert.ok(svg.includes("<svg"), "fichier SVG valide");
  assert.ok(svg.length < 10 * 1024, `illustration légère (${svg.length} octets < 10 Ko)`);
  assert.ok(swJs.includes(rel), "illustration précachée par le service worker (hors ligne)");
});

test("Empty/Récents: chaque récent est un bouton autonome cliquable", () => {
  const fn = componentsJs.match(/export function historyRow[\s\S]*?\n\}/);
  assert.ok(fn, "historyRow existe dans components.js");
  assert.ok(!fn[0].includes("+ Ajouter"), 'plus de CTA "+ Ajouter" séparé');
  assert.ok(fn[0].includes('"chip"'), "le récent réutilise le style chip");
  assert.ok(fn[0].includes("data-history-readd"), "le hook data-history-readd est conservé");
  assert.ok(fn[0].includes("data-history-item"), "le hook data-history-item est conservé");
  assert.ok(
    /readd\.textContent\s*=\s*name/.test(fn[0]),
    "le bouton porte directement le nom du produit",
  );
  assert.ok(
    /aria-label.*Ajouter/.test(fn[0]),
    "le bouton garde un nom accessible d'ajout",
  );
  assert.ok(
    appJs.includes('[data-history-readd]'),
    "le câblage app.js sur data-history-readd est inchangé",
  );
});

test("Empty/Récents: la liste Récents s'enroule en chips lisibles", () => {
  const list = css.match(/\.history-list\s*\{([^}]*)\}/);
  assert.ok(list, "règle .history-list présente");
  assert.ok(/display\s*:\s*flex/.test(list[1]), ".history-list en flex");
  assert.ok(/flex-wrap\s*:\s*wrap/.test(list[1]), ".history-list s'enroule (360px safe)");
  assert.ok(!/\.history-readd\s*\{/.test(css), "aucun style résiduel .history-readd");
});

test("Empty/Récents: aucune pédagogie Essentiels réintroduite", () => {
  for (const [name, src] of [["components.js", componentsJs], ["index.html", html]]) {
    assert.ok(!src.includes("retrouver à chaque nouvelle liste"), `pas de hint Essentiels (${name})`);
    assert.ok(!src.includes("touchez un essentiel"), `pas de pédagogie empty-state (${name})`);
  }
});
