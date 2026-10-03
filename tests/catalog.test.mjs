/* Shopping List v0 — Lane H: catalog mapping unit tests.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  normalizeKey,
  loadCatalog,
  clearCatalogCache,
  getIngredient,
  getDictEntry,
  findEntry,
  allEntries,
  catalogAisleOrder,
  aisleRank,
  catalogVersion,
  catalogSources,
  catalogCategories,
  catalogTags,
  entriesByTag,
  defaultAisleForCategory,
} from "../js/catalog.js";
import { fixtureFetch } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");

beforeEach(() => {
  clearCatalogCache();
});

test("normalizeKey: NFD strip → lowercase → collapse", () => {
  assert.equal(normalizeKey("Gousse   d'Ail"), "gousse d'ail");
  assert.equal(normalizeKey("Crème"), "creme");
  assert.equal(normalizeKey(null), "");
  assert.equal(normalizeKey(undefined), "");
});

test("loadCatalog: assembles order + alias maps, caches", async () => {
  const catalog = await loadCatalog({ fetchImpl: fixtureFetch() });
  assert.deepEqual(catalog.order, [
    "Fruits & légumes",
    "Épicerie",
    "Maison & entretien",
    "À vérifier",
  ]);
  // Cached: second call returns the same object without refetch.
  let calls = 0;
  const counting = async (url) => {
    calls += 1;
    return fixtureFetch()(url);
  };
  const again = await loadCatalog({ fetchImpl: counting });
  assert.equal(again, catalog);
  assert.equal(calls, 0);
  clearCatalogCache();
  const fresh = await loadCatalog({ fetchImpl: counting });
  assert.notEqual(fresh, catalog);
  assert.ok(calls >= 3);
});

test("loadCatalog: throws on HTTP error", async () => {
  await assert.rejects(
    () => loadCatalog({ fetchImpl: fixtureFetch({ "aisles.json": { __httpError: 404 } }) }),
    /HTTP 404/,
  );
});

test("lookups: slug, alias, normalized; culinary-first; undefined on miss", async () => {
  const catalog = await loadCatalog({ fetchImpl: fixtureFetch() });
  assert.equal(getIngredient(catalog, "ail").name, "Ail");
  assert.equal(getIngredient(catalog, "gousse d'ail").slug, "ail");
  assert.equal(getIngredient(catalog, "GOUSSE D'AIL").slug, "ail");
  assert.equal(getIngredient(catalog, "lessive"), undefined);
  assert.equal(getDictEntry(catalog, "lessive").name, "Lessive");
  assert.equal(getDictEntry(catalog, "lessive liquide").slug, "lessive");
  assert.equal(getDictEntry(catalog, "ail"), undefined);
  assert.deepEqual(findEntry(catalog, "ail").kind, "culinary");
  assert.deepEqual(findEntry(catalog, "lessive").kind, "household");
  assert.equal(findEntry(catalog, "nope"), undefined);
});

test("allEntries: flat [{kind, entry}] culinary then household", async () => {
  const catalog = await loadCatalog({ fetchImpl: fixtureFetch() });
  const all = allEntries(catalog);
  assert.equal(all.length, 5);
  assert.deepEqual(all.map((e) => e.kind), ["culinary", "culinary", "culinary", "household", "household"]);
});

test("aisle order/rank: copy, unknown sorts last", async () => {
  const catalog = await loadCatalog({ fetchImpl: fixtureFetch() });
  const order = catalogAisleOrder(catalog);
  const orderLen = order.length;
  order.push("MUT");
  assert.ok(!catalogAisleOrder(catalog).includes("MUT"));
  assert.equal(aisleRank(catalog, "Épicerie"), 1);
  assert.equal(aisleRank(catalog, "Nope"), orderLen);
});

test("version/sources passthrough", async () => {
  const catalog = await loadCatalog({ fetchImpl: fixtureFetch() });
  const version = catalogVersion(catalog);
  assert.equal(version.ref, "f".repeat(40));
  assert.equal(version.fetched_at, "2026-10-02T00:00:00Z");
  const sources = catalogSources(catalog);
  assert.equal(sources.cookigram.ref, "f".repeat(40));
  assert.equal(sources.dict.schema, 1);
});

test("categories/tags/entriesByTag", async () => {
  const catalog = await loadCatalog({ fetchImpl: fixtureFetch() });
  const cats = catalogCategories(catalog);
  assert.deepEqual(cats.culinary, ["Épicerie salée", "Légumes et aromates", "Produits laitiers"]);
  assert.deepEqual(cats.household, ["Linge", "Vaisselle"]);
  assert.deepEqual(catalogTags(catalog), ["cuisine", "linge", "vaisselle"]);
  assert.deepEqual(entriesByTag(catalog, "linge").map((e) => e.slug), ["lessive"]);
  assert.deepEqual(entriesByTag(catalog, "nope"), []);
});

test("defaultAisleForCategory: exact → casefolded → household scan → fallback", async () => {
  const catalog = await loadCatalog({ fetchImpl: fixtureFetch() });
  assert.equal(defaultAisleForCategory(catalog, "Légumes et aromates"), "Fruits & légumes");
  assert.equal(defaultAisleForCategory(catalog, "LÉGUMES ET AROMATES"), "Fruits & légumes");
  assert.equal(defaultAisleForCategory(catalog, "Linge"), "Maison & entretien");
  assert.equal(defaultAisleForCategory(catalog, "linge"), "Maison & entretien");
  assert.equal(defaultAisleForCategory(catalog, "Some Future Category"), "À vérifier");
  assert.equal(defaultAisleForCategory(catalog, ""), "À vérifier");
  assert.equal(defaultAisleForCategory(catalog, null), "À vérifier");
});

test("shipped snapshot: counts, bySlug coverage, required keys, aisle membership", async () => {
  const [snapshot, dict, aisleMap] = await Promise.all([
    readFile(join(dataDir, "cookigram-catalog.json"), "utf8").then(JSON.parse),
    readFile(join(dataDir, "shopping-dict.json"), "utf8").then(JSON.parse),
    readFile(join(dataDir, "aisles.json"), "utf8").then(JSON.parse),
  ]);
  // Pinned-seed expectations (fail loudly on sync drift, per contract).
  assert.equal(snapshot.ingredients.length, 379);
  assert.equal(dict.entries.length, 50);
  assert.equal(snapshot.ingredients.filter((e) => e.staple === true).length, 23);
  assert.equal(Object.keys(snapshot.bySlug).length, 379);
  assert.equal(Object.keys(dict.bySlug).length, 50);
  for (const [index, entry] of snapshot.ingredients.entries()) {
    assert.ok(entry.slug, `missing slug at ${index}`);
    assert.ok(entry.name, `missing name at ${entry.slug}`);
    assert.ok(Array.isArray(entry.aliases) && entry.aliases.length > 0, `aliases at ${entry.slug}`);
    assert.equal(snapshot.bySlug[entry.slug], index);
    assert.ok(snapshot.aisles.includes(entry.aisle), `aisle ${entry.aisle} at ${entry.slug}`);
  }
  for (const [index, entry] of dict.entries.entries()) {
    assert.ok(entry.slug);
    assert.ok(entry.name);
    assert.equal(dict.bySlug[entry.slug], index);
    assert.ok(dict.aisles.includes(entry.aisle), `dict aisle ${entry.aisle}`);
  }
  // Known upstream exceptions survive the sync.
  const vinBlanc = snapshot.ingredients[snapshot.bySlug["vin-blanc"]];
  assert.equal(vinBlanc.category, "");
  assert.equal(vinBlanc.aisle, "À vérifier");
  assert.ok(snapshot.bySlug["sirop-d-erable"] !== undefined);
  assert.ok(aisleMap.fallback === "À vérifier");
});
