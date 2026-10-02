import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { allEntries, clearCatalogCache, loadCatalog } from "../js/catalog.js";
import { buildIngredientIndex, buildSuggestions, searchIngredients } from "../js/search.js";
import { resolveItemMeta } from "../js/list.js";
import { addItem, configureStore, getItems, removeItem, STORE_KEYS } from "../js/store.js";
import { fixtureFetch, makeMemoryStorage } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (name) =>
  JSON.parse(await readFile(join(root, "data", name), "utf8"));

let catalog;
let index;
beforeEach(async () => {
  clearCatalogCache();
  const [snapshot, dict, variants, aisleMap] = await Promise.all([
    readJson("cookigram-catalog.json"),
    readJson("shopping-dict.json"),
    readJson("product-variants.json"),
    readJson("aisles.json"),
  ]);
  catalog = await loadCatalog({
    fetchImpl: fixtureFetch({
      "cookigram-catalog.json": snapshot,
      "shopping-dict.json": dict,
      "product-variants.json": variants,
      "aisles.json": aisleMap,
    }),
  });
  index = buildIngredientIndex(allEntries(catalog));
  configureStore({ storage: makeMemoryStorage() });
});

const itemRows = (query) => searchIngredients(index, query)
  .map((result) => result.indexed.entry)
  .filter((entry) => entry.variantId);

test("eggs and Greek yogurt search return their package variants on the canonical products", () => {
  assert.deepEqual(
    itemRows("oeufs").filter((entry) => entry.canonicalSlug === "oeuf").map((entry) => entry.variantId).sort(),
    ["box-12", "box-6"],
  );
  assert.deepEqual(
    itemRows("yaourt grec").filter((entry) => entry.canonicalSlug === "yaourt-grec").map((entry) => entry.variantId).sort(),
    ["pack-4", "pot-1kg"],
  );
  assert.equal(catalog.snapshot.ingredients.filter((entry) => entry.slug === "oeuf").length, 1);
  assert.equal(catalog.snapshot.ingredients.filter((entry) => entry.slug === "yaourt-grec").length, 1);
});

test("cola and iced-tea aliases resolve to their own bottle variants", () => {
  const cola = itemRows("coca zero").find((entry) => entry.canonicalSlug === "coca-zero");
  const tea = itemRows("the glace").find((entry) => entry.canonicalSlug === "the-glace");
  assert.equal(cola?.variantId, "bottle");
  assert.equal(cola?.icon, "cola-zero-bottle.svg");
  assert.equal(tea?.variantId, "bottle");
  assert.equal(tea?.icon, "iced-tea-bottle.svg");
  assert.equal(itemRows("cola zero").some((entry) => entry.canonicalSlug === "coca-zero"), true);
  assert.equal(itemRows("soda zero").some((entry) => entry.canonicalSlug === "coca-zero"), true);
  assert.equal(itemRows("iced tea").some((entry) => entry.canonicalSlug === "the-glace"), true);
});

test("suggestions show concise package labels and keep unique option identities", () => {
  const rows = buildSuggestions(index, "oeufs", { includeFreeAdd: false });
  const eggRows = rows.filter((row) => row.entry?.canonicalSlug === "oeuf");
  assert.deepEqual(eggRows.map((row) => row.label).sort(), ["Œufs · boîte de 12", "Œufs · boîte de 6"]);
  assert.deepEqual(eggRows.map((row) => row.slug), ["oeuf", "oeuf"]);
  assert.deepEqual(eggRows.map((row) => row.variantId).sort(), ["box-12", "box-6"]);
});

test("selected variant persists across reload and is removable", () => {
  const storage = makeMemoryStorage();
  configureStore({ storage });
  const suggestion = buildSuggestions(index, "yaourt grec", { includeFreeAdd: false })
    .find((row) => row.variantId === "pot-1kg");
  const item = addItem({
    name: suggestion.entry.name,
    slug: suggestion.slug,
    variantId: suggestion.variantId,
    provenance: { source: suggestion.entryKind === "culinary" ? "cookigram" : "dict" },
  });
  assert.equal(item.slug, "yaourt-grec");
  assert.equal(item.variantId, "pot-1kg");
  assert.equal(item.name, "Yaourt grec nature · pot 1 kg");
  configureStore({ storage }); // fresh read over the same localStorage payload
  const reloaded = getItems()[0];
  assert.equal(reloaded.variantId, "pot-1kg");
  assert.equal(resolveItemMeta(reloaded, catalog).icon, "greek-yogurt-1kg.svg");
  assert.equal(removeItem(reloaded.id), true);
  assert.deepEqual(getItems(), []);
  assert.ok(storage.getItem(STORE_KEYS.items));
});

test("products without variants keep their existing single search row and item shape", () => {
  assert.equal(searchIngredients(index, "ail").filter((result) => result.indexed.slug === "ail").length, 1);
  const item = addItem({ name: "Ail", slug: "ail", provenance: { source: "cookigram" } });
  assert.equal(item.variantId, undefined);
  assert.equal(item.name, "Ail");
});

test("variant icons and data are local and included in the offline precache", async () => {
  const sw = await readFile(join(root, "sw.js"), "utf8");
  const expected = [
    "eggs-6.svg", "eggs-12.svg", "cola-zero-bottle.svg", "iced-tea-bottle.svg",
    "greek-yogurt-4pack.svg", "greek-yogurt-1kg.svg",
  ];
  assert.match(sw, /\.\/data\/product-variants\.json/);
  for (const icon of expected) {
    const path = join(root, "assets", "icons", icon);
    const svg = await readFile(path, "utf8");
    assert.match(svg, /<svg[^>]+viewBox=/);
    assert.ok(sw.includes(`./assets/icons/${icon}`), `${icon} missing from precache`);
  }
});
