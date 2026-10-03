/* Shopping List v0 — Issue #30: aisle filter state + vocabulary tests.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * DOM-free: document is undefined here, so state/vocabulary paths run
 * and DOM builders must degrade to null (asserted, not assumed).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getActiveAisle,
  setActiveAisle,
  clearAisle,
  isAisleActive,
  aisleTerm,
  aisleChips,
  onAisleChange,
  ensureAisleBar,
  aisleChip,
  renderAisleBar,
  initAisleBar,
  aisleOption,
  renderAislePanel,
  renderAisleTrigger,
  initAisleFilter,
  AISLE_CHANGE_EVENT,
  AISLE_BAR_SELECTOR,
  AISLE_PANEL_SELECTOR,
  AISLE_TRIGGER_SELECTOR,
  ALL_AISLES_LABEL,
} from "../js/aisle-filter.js";
import {
  loadCatalog,
  allEntries,
  catalogAisleOrder,
  clearCatalogCache,
} from "../js/catalog.js";
import { searchEntries } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("issue #30: Tous actif par défaut, une seule catégorie à la fois", () => {
  clearAisle();
  assert.equal(getActiveAisle(), null);
  assert.equal(aisleTerm(), null);
  setActiveAisle("Fruits & légumes");
  assert.equal(getActiveAisle(), "Fruits & légumes");
  assert.ok(isAisleActive("fruits & legumes"));
  assert.ok(!isAisleActive("Épicerie"));
  setActiveAisle("Épicerie");
  assert.equal(getActiveAisle(), "Épicerie");
  assert.ok(!isAisleActive("Fruits & légumes"));
  clearAisle();
});

test("issue #30: reset via Tous (null/blank), idempotent sans dispatch", () => {
  setActiveAisle("Épicerie");
  assert.equal(setActiveAisle(null), null);
  assert.equal(setActiveAisle("   "), null);
  assert.equal(getActiveAisle(), null);
  assert.equal(clearAisle(), null);
  // Re-selecting the active value is a no-op returning current state.
  setActiveAisle("Épicerie");
  assert.equal(setActiveAisle("  épicerie "), "Épicerie");
  clearAisle();
});

test("issue #30: aisleTerm structuré pour search.js, null sur Tous", () => {
  clearAisle();
  assert.equal(aisleTerm(), null);
  setActiveAisle("Poissonnerie");
  assert.deepEqual(aisleTerm(), { label: "Poissonnerie", type: "aisle" });
  clearAisle();
});

test("issue #30: chips = ordre canonique restreint aux rayons présents", () => {
  const order = ["Épicerie", "Fruits & légumes", "Fond de placard", "Maison & entretien"];
  const chips = aisleChips({ order }, searchEntries());
  assert.deepEqual(chips, ["Épicerie", "Fruits & légumes", "Maison & entretien"]);
});

test("issue #30: chips réels — ordre canonique, pas de chip vide", async () => {
  // Intégration réelle : loadCatalog + allEntries + catalogAisleOrder,
  // pour ne jamais reconstruire assemble() à la main (la dédup de
  // l'ordre vit dans catalog.js depuis les variantes #34).
  const files = {
    "cookigram-catalog.json": "cookigram-catalog.json",
    "shopping-dict.json": "shopping-dict.json",
    "product-variants.json": "product-variants.json",
    "aisles.json": "aisles.json",
  };
  const fetchImpl = async (url) => ({
    ok: true,
    json: async () =>
      JSON.parse(
        readFileSync(join(root, "data", files[String(url).split("/").pop()]), "utf8"),
      ),
  });
  clearCatalogCache();
  const catalog = await loadCatalog({ fetchImpl, baseUrl: "https://test.invalid/data/" });
  const order = catalogAisleOrder(catalog);
  const chips = aisleChips(catalog, allEntries(catalog));
  assert.ok(chips.length > 0, "au moins un rayon présent");
  assert.ok(!chips.includes("Fond de placard"), "rayon vide exclu (0 ingrédient)");
  assert.ok(chips.includes("À vérifier"), "rayon non vide inclus");
  assert.deepEqual(
    chips,
    order.filter((a) => chips.includes(a)),
    "ordre canonique préservé",
  );
  assert.equal(ALL_AISLES_LABEL, "Tous");
});

test("issue #30: tassement/robustesse des entrées bizarres", () => {
  assert.deepEqual(aisleChips(null, null), []);
  assert.deepEqual(aisleChips([], [{ entry: {} }, null, "x"]), []);
  assert.deepEqual(
    aisleChips(["  Épicerie "], [{ entry: { aisle: "épicerie" } }]),
    ["Épicerie"],
  );
});

test("issue #30: sans DOM, les builders dégradent en null", () => {
  assert.equal(typeof document, "undefined");
  assert.equal(ensureAisleBar(), null);
  assert.equal(aisleChip(null, true), null);
  assert.equal(renderAisleBar(), null);
  assert.equal(initAisleBar({}), null);
  assert.equal(aisleOption(null, true), null);
  assert.equal(renderAislePanel({}), null);
  assert.equal(renderAisleTrigger(undefined, false), null);
  assert.equal(initAisleFilter({}), null);
  const off = onAisleChange(() => {});
  assert.equal(typeof off, "function");
  off();
  assert.equal(AISLE_CHANGE_EVENT, "shopping-list:aisle-change");
  assert.equal(AISLE_BAR_SELECTOR, "[data-aisle-filter]");
  assert.equal(AISLE_PANEL_SELECTOR, "[data-aisle-panel]");
  assert.equal(AISLE_TRIGGER_SELECTOR, "[data-aisle-trigger]");
});
