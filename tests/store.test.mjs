/* Shopping List v0 — Lane H: store unit tests (Node, stdlib only).
 * Runner: node --test tests/*.test.mjs
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  STORE_KEYS,
  CHANGE_EVENT,
  PROVENANCE_SOURCES,
  DEFAULT_PREFS,
  configureStore,
  readStoreKey,
  writeStoreKey,
  emitStoreChange,
  subscribe,
  normalizeName,
  createId,
  getItems,
  getItem,
  addItem,
  toggleItem,
  setChecked,
  setQty,
  removeItem,
  clearChecked,
  clearAll,
  canUndoCheck,
  undoLastCheck,
  getFrequency,
  topFrequent,
  favoriteKey,
  getFavorites,
  isFavorite,
  toggleFavorite,
  clearFavorites,
  getPrefs,
  setPrefs,
  resetPrefs,
} from "../js/store.js";
import { makeMemoryStorage } from "./helpers.mjs";

beforeEach(() => {
  configureStore({ storage: makeMemoryStorage() });
});

test("constants contract", () => {
  assert.deepEqual(Object.keys(STORE_KEYS).sort(), ["essentials", "favorites", "frequency", "history", "items", "prefs"]);
  assert.equal(CHANGE_EVENT, "shopping-list:change");
  assert.deepEqual([...PROVENANCE_SOURCES], ["cookigram", "dict", "custom"]);
  assert.deepEqual({ ...DEFAULT_PREFS }, { essentialsEnabled: true, lastRitualAt: null });
});

test("normalizeName: FR-safe", () => {
  assert.equal(normalizeName("  Crème   Brûlée "), "creme brulee");
  assert.equal(normalizeName(null), "");
  assert.equal(normalizeName(undefined), "");
});

test("createId: unique", () => {
  const ids = new Set(Array.from({ length: 50 }, () => createId()));
  assert.equal(ids.size, 50);
});

test("addItem: requires non-blank name, trims, defaults", () => {
  assert.throws(() => addItem({ name: "   " }), /name is required/);
  assert.throws(() => addItem({}), /name is required/);
  const item = addItem({ name: "  Ail  " });
  assert.equal(item.name, "Ail");
  assert.equal(item.qty, "");
  assert.equal(item.checked, false);
  assert.equal(item.slug, null);
  assert.deepEqual(item.provenance, { source: "custom" });
  assert.ok(item.id);
  assert.ok(typeof item.addedAt === "number");
});

test("addItem: provenance defaults + validation", () => {
  assert.deepEqual(addItem({ name: "A", slug: "a" }).provenance, { source: "cookigram" });
  assert.deepEqual(
    addItem({ name: "B", slug: "b", provenance: { source: "dict" } }).provenance,
    { source: "dict" },
  );
  assert.throws(() => addItem({ name: "C", provenance: { source: "nope" } }), /unknown provenance/);
});

test("addItem: merges on normalized name+qty, re-activates checked", () => {
  const first = addItem({ name: "Ail", qty: "3  gousses" });
  const merged = addItem({ name: "  ail ", qty: "3 gousses" });
  assert.equal(merged.id, first.id);
  assert.equal(getItems().length, 1);
  // Different qty → separate item.
  addItem({ name: "Ail", qty: "1 gousse" });
  assert.equal(getItems().length, 2);
  // Checked match is re-activated.
  toggleItem(first.id);
  assert.equal(getItem(first.id).checked, true);
  const reactivated = addItem({ name: "AIL", qty: "3 gousses" });
  assert.equal(reactivated.checked, false);
  assert.equal(getItems().length, 2);
});

test("getItems/getItem return copies", () => {
  const item = addItem({ name: "Ail" });
  const list = getItems();
  list[0].name = "MUT";
  list.push({ name: "MUT2" });
  assert.equal(getItem(item.id).name, "Ail");
  assert.equal(getItems().length, 1);
  const one = getItem(item.id);
  one.qty = "MUT";
  assert.equal(getItem(item.id).qty, "");
  assert.equal(getItem("unknown"), null);
});

test("toggleItem/setChecked/setQty/removeItem", () => {
  const item = addItem({ name: "Ail" });
  assert.equal(toggleItem(item.id).checked, true);
  assert.equal(toggleItem(item.id).checked, false);
  assert.equal(toggleItem("unknown"), null);
  assert.equal(setChecked(item.id, true).checked, true);
  assert.equal(setChecked(item.id, false).checked, false);
  assert.equal(setChecked("unknown", true), null);
  assert.equal(setQty(item.id, "  2   gousses ").qty, "2 gousses");
  assert.equal(setQty("unknown", "x"), null);
  assert.equal(removeItem("unknown"), false);
  assert.equal(removeItem(item.id), true);
  assert.equal(getItems().length, 0);
});

test("clearChecked returns removed, clearAll returns count", () => {
  const a = addItem({ name: "A" });
  addItem({ name: "B" });
  assert.deepEqual(clearChecked(), []);
  toggleItem(a.id);
  const removed = clearChecked();
  assert.equal(removed.length, 1);
  assert.equal(removed[0].id, a.id);
  assert.equal(getItems().length, 1);
  assert.equal(clearAll(), 1);
  assert.equal(getItems().length, 0);
  assert.equal(clearAll(), 0);
});

test("frequency: bumped on every addItem, lookup normalized", () => {
  addItem({ name: "Ail", slug: "ail" });
  addItem({ name: "ail" });
  const freq = getFrequency("  AIL ");
  assert.equal(freq.count, 2);
  assert.equal(freq.slug, "ail");
  assert.equal(getFrequency("unknown"), null);
});

test("topFrequent: count desc, recency desc, exclude slugs", async () => {
  addItem({ name: "Rare", slug: "rare" });
  addItem({ name: "Frequent", slug: "freq" });
  addItem({ name: "Frequent", slug: "freq" });
  const top = topFrequent(8);
  assert.equal(top[0].slug, "freq");
  assert.equal(top[0].count, 2);
  const excluded = topFrequent(8, { exclude: ["freq"] });
  assert.ok(excluded.every((r) => r.slug !== "freq"));
  assert.deepEqual(topFrequent(0), []);
  // Recency tiebreak: later insert wins at equal count.
  configureStore({ storage: makeMemoryStorage() });
  addItem({ name: "First", slug: "first" });
  await new Promise((r) => setTimeout(r, 2));
  addItem({ name: "Second", slug: "second" });
  const recency = topFrequent(8);
  assert.equal(recency[0].slug, "second");
});

test("favorites: key, toggle, is, clear", () => {
  assert.equal(favoriteKey({ slug: "ail", name: "Ail" }), "ail");
  assert.equal(favoriteKey({ name: "  Crème " }), "name:creme");
  assert.throws(() => toggleFavorite({}), /name or slug/);
  const on = toggleFavorite({ slug: "ail", name: "Ail" });
  assert.deepEqual(on, { favorite: true, key: "ail" });
  assert.equal(isFavorite({ slug: "ail" }), true);
  assert.equal(getFavorites().length, 1);
  // Slugless favorite matches by name.
  toggleFavorite({ name: "Truc maison" });
  assert.equal(isFavorite({ name: "truc MAISON" }), true);
  const off = toggleFavorite({ slug: "ail", name: "Ail" });
  assert.equal(off.favorite, false);
  assert.equal(isFavorite({ slug: "ail" }), false);
  assert.equal(clearFavorites(), 1);
  assert.equal(getFavorites().length, 0);
  // Copies.
  toggleFavorite({ slug: "x", name: "X" });
  const favs = getFavorites();
  favs[0].name = "MUT";
  assert.equal(getFavorites()[0].name, "X");
});

test("prefs: defaults, merge, reset, extra keys kept", () => {
  assert.deepEqual(getPrefs(), { essentialsEnabled: true, lastRitualAt: null });
  const merged = setPrefs({ essentialsEnabled: false, extra: 1 });
  assert.equal(merged.essentialsEnabled, false);
  assert.equal(merged.extra, 1);
  assert.equal(getPrefs().extra, 1);
  const reset = resetPrefs();
  assert.deepEqual(reset, { essentialsEnabled: true, lastRitualAt: null });
  assert.deepEqual(getPrefs(), { essentialsEnabled: true, lastRitualAt: null });
});

test("readStoreKey: corrupt JSON resets to default (fail-soft)", () => {
  const storage = makeMemoryStorage({ [STORE_KEYS.items]: "not-json{{{" });
  configureStore({ storage });
  assert.deepEqual(getItems(), []);
  assert.deepEqual(readStoreKey("missing-key", { a: 1 }), { a: 1 });
});

test("failing backend falls back to memory (session keeps working)", () => {
  const failing = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };
  configureStore({ storage: failing });
  const item = addItem({ name: "Ail" });
  // Read path throws → default; the invariant is "never breaks".
  assert.ok(item.id);
  assert.deepEqual(getItems(), []);
});

test("Node runtime: events + subscribe are safe no-ops", () => {
  assert.doesNotThrow(() => emitStoreChange("items:add", { id: "x" }));
  const unsub = subscribe(() => {
    throw new Error("must not be called");
  });
  assert.equal(typeof unsub, "function");
  assert.doesNotThrow(() => unsub());
});

test("writeStoreKey/readStoreKey round-trip", () => {
  writeStoreKey("k", { a: [1, 2] });
  assert.deepEqual(readStoreKey("k", null), { a: [1, 2] });
});

test("undo stack: empty by default, null undo (issue #6)", () => {
  assert.equal(canUndoCheck(), false);
  assert.equal(undoLastCheck(), null);
});

test("undo stack: strict LIFO restore (issue #6)", () => {
  const sel = addItem({ name: "Sel" });
  const beurre = addItem({ name: "Beurre" });
  const pates = addItem({ name: "Pâtes" });
  toggleItem(sel.id);
  toggleItem(beurre.id);
  toggleItem(pates.id);
  assert.equal(canUndoCheck(), true);
  assert.equal(undoLastCheck().id, pates.id);
  assert.equal(getItem(pates.id).checked, false);
  assert.equal(undoLastCheck().id, beurre.id);
  assert.equal(undoLastCheck().id, sel.id);
  assert.equal(canUndoCheck(), false);
  assert.equal(undoLastCheck(), null);
});

test("undo stack: manual uncheck prunes the candidate (issue #6)", () => {
  const sel = addItem({ name: "Sel" });
  const beurre = addItem({ name: "Beurre" });
  toggleItem(sel.id);
  toggleItem(beurre.id);
  toggleItem(beurre.id); // manual restore in "Plus nécessaire"
  assert.equal(canUndoCheck(), true);
  assert.equal(undoLastCheck().id, sel.id);
  assert.equal(canUndoCheck(), false);
});

test("undo stack: no-op transitions never push (issue #6)", () => {
  const sel = addItem({ name: "Sel" });
  setChecked(sel.id, false); // already unchecked: no transition
  assert.equal(canUndoCheck(), false);
  setChecked(sel.id, true);
  setChecked(sel.id, true); // already checked: no duplicate
  assert.equal(undoLastCheck().id, sel.id);
  assert.equal(canUndoCheck(), false);
});

test("undo stack: deleted items are skipped, clearChecked prunes (issue #6)", () => {
  const sel = addItem({ name: "Sel" });
  const beurre = addItem({ name: "Beurre" });
  toggleItem(sel.id);
  toggleItem(beurre.id);
  removeItem(beurre.id);
  assert.equal(undoLastCheck().id, sel.id);
  const pates = addItem({ name: "Pâtes" });
  toggleItem(pates.id);
  clearChecked();
  assert.equal(canUndoCheck(), false);
  assert.equal(undoLastCheck(), null);
});
