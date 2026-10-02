/* Shopping List v0 — Lane H: list grouping / item-meta unit tests.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * Covers the DOM-free exports of js/list.js (grouping is pure logic;
 * rendering needs a browser and stays manual — see docs/e2e-checklist.md).
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_AISLE,
  formatQty,
  resolveItemMeta,
  matchQuery,
  groupItemsByAisle,
} from "../js/list.js";
import { loadCatalog, clearCatalogCache } from "../js/catalog.js";
import { fixtureFetch } from "./helpers.mjs";

let catalog;
beforeEach(async () => {
  clearCatalogCache();
  catalog = await loadCatalog({ fetchImpl: fixtureFetch() });
});

test("formatQty: qty + unit combos, no duplication", () => {
  assert.equal(formatQty({ qty: "2", unit: "gousses" }), "2 gousses");
  assert.equal(formatQty({ qty: "2 gousses", unit: "gousses" }), "2 gousses");
  assert.equal(formatQty({ qty: "2 GOUSSES", unit: "gousses" }), "2 GOUSSES");
  assert.equal(formatQty({ qty: "3", unit: "" }), "3");
  assert.equal(formatQty({ qty: "", unit: "pièces" }), "pièces");
  assert.equal(formatQty({}), "");
  assert.equal(formatQty(null), "");
});

test("resolveItemMeta: explicit fields win over catalog", () => {
  const meta = resolveItemMeta({ slug: "ail", name: "Ail", aisle: "Mon rayon", tags: ["x"], icon: "i.svg", category: "C" }, catalog);
  assert.equal(meta.aisle, "Mon rayon");
  assert.deepEqual(meta.tags, ["x"]);
  assert.equal(meta.icon, "i.svg");
  assert.equal(meta.category, "C");
  assert.equal(meta.kind, "culinary");
});

test("resolveItemMeta: catalog fallback, then category default, then fallback", () => {
  const fromCatalog = resolveItemMeta({ slug: "ail", name: "Ail" }, catalog);
  assert.equal(fromCatalog.aisle, "Fruits & légumes");
  assert.equal(fromCatalog.kind, "culinary");
  assert.deepEqual(fromCatalog.aliases, ["ail", "gousse d'ail"]);
  const household = resolveItemMeta({ slug: "lessive", name: "Lessive" }, catalog);
  assert.equal(household.aisle, "Maison & entretien");
  assert.deepEqual(household.tags, ["linge"]);
  assert.equal(household.kind, "household");
  // Unknown item with mappable category → category default.
  const byCategory = resolveItemMeta({ name: "Truc", category: "Linge" }, catalog);
  assert.equal(byCategory.aisle, "Maison & entretien");
  assert.equal(byCategory.kind, null);
  // Unknown everything → fallback.
  const fallback = resolveItemMeta({ name: "Truc" }, catalog);
  assert.equal(fallback.aisle, "À vérifier");
  assert.equal(FALLBACK_AISLE, "À vérifier");
  // Null catalog → fallback without throwing.
  assert.equal(resolveItemMeta({ name: "Truc" }, null).aisle, "À vérifier");
});

test("matchQuery: blank matches, multi-token AND, FR-normalized", () => {
  const meta = { aisle: "Fruits & légumes", category: "Légumes et aromates", tags: ["frais"], aliases: ["gousse d'ail"] };
  assert.equal(matchQuery({ name: "Ail" }, meta, ""), true);
  assert.equal(matchQuery({ name: "Ail" }, meta, null), true);
  assert.equal(matchQuery({ name: "Ail", qty: "3 gousses" }, meta, "ail gousses"), true);
  assert.equal(matchQuery({ name: "Ail" }, meta, "ailzzz"), false);
  assert.equal(matchQuery({ name: "Crème" }, {}, "creme"), true);
  assert.equal(matchQuery({ name: "X" }, meta, "frais"), true); // tags searched
  assert.equal(matchQuery({ name: "X" }, meta, "fruits legumes"), true); // aisle searched
});

test("groupItemsByAisle: catalog order, FR name sort, addedAt tiebreak", () => {
  const items = [
    { id: "1", name: "Lessive", slug: "lessive", addedAt: 3 },
    { id: "2", name: "Farine", slug: "farine", addedAt: 2 },
    { id: "3", name: "Ail", slug: "ail", addedAt: 1 },
  ];
  const { groups, order } = groupItemsByAisle(items, catalog);
  assert.deepEqual(order, ["Fruits & légumes", "Épicerie", "Maison & entretien", "À vérifier"]);
  assert.deepEqual(groups.map(([aisle]) => aisle), ["Fruits & légumes", "Épicerie", "Maison & entretien"]);
  // FR sort within an aisle.
  const same = groupItemsByAisle(
    [
      { id: "a", name: "Éponge", slug: "eponge", addedAt: 2 },
      { id: "b", name: "Lessive", slug: "lessive", addedAt: 1 },
    ],
    catalog,
  );
  assert.deepEqual(same.groups[0][1].map((r) => r.item.name), ["Éponge", "Lessive"]);
  // addedAt tiebreak on identical names.
  const tie = groupItemsByAisle(
    [
      { id: "new", name: "Same", addedAt: 20 },
      { id: "old", name: "Same", addedAt: 10 },
    ],
    catalog,
  );
  assert.deepEqual(tie.groups[0][1].map((r) => r.item.id), ["old", "new"]);
});

test("groupItemsByAisle: checked rows stay in place; filters (predicate + query)", () => {
  const items = [
    { id: "1", name: "Ail", slug: "ail", checked: true },
    { id: "2", name: "Farine", slug: "farine", checked: false },
  ];
  const { groups } = groupItemsByAisle(items, catalog);
  assert.equal(groups.reduce((n, [, rows]) => n + rows.length, 0), 2);
  const pred = groupItemsByAisle(items, catalog, (item) => !item.checked);
  assert.equal(pred.groups.reduce((n, [, rows]) => n + rows.length, 0), 1);
  const query = groupItemsByAisle(items, catalog, "farine");
  assert.equal(query.groups.reduce((n, [, rows]) => n + rows.length, 0), 1);
});

test("groupItemsByAisle: null-safe (null catalog, null items)", () => {
  const { groups } = groupItemsByAisle(
    [{ id: "1", name: "Truc" }],
    null,
  );
  assert.deepEqual(groups.map(([aisle]) => aisle), ["À vérifier"]);
  assert.deepEqual(groupItemsByAisle(null, catalog).groups, []);
  assert.deepEqual(groupItemsByAisle(undefined, null).groups, []);
});
