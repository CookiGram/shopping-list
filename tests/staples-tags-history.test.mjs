/* Shopping List v0 — Lane H: staples ritual + tags + history unit tests.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRitual, filterCandidates, STAPLE_RITUAL_DECISIONS } from "../js/staples.js";
import {
  TAGS_CHANGE_EVENT,
  getActiveTags,
  isTagActive,
  activateTag,
  activateTagFromSuggestion,
  activateTagFromList,
  deactivateTag,
  toggleTag,
  clearTags,
  setActiveTags,
  onTagsChange,
} from "../js/tags.js";
import {
  MAX_SESSIONS,
  MAX_ITEMS_PER_SESSION,
  closeSession,
  getHistory,
  getHistoryEntry,
  clearHistory,
  recentItems,
} from "../js/history.js";
import { configureStore } from "../js/store.js";
import { makeMemoryStorage } from "./helpers.mjs";

beforeEach(() => {
  configureStore({ storage: makeMemoryStorage() });
  setActiveTags([]);
});

test("staples: decisions constant", () => {
  assert.deepEqual([...STAPLE_RITUAL_DECISIONS], ["added", "rejected", "ignored"]);
});

test("createRitual: dedup by key, drop empties, copies", () => {
  const ritual = createRitual([
    { slug: "farine", name: "Farine" },
    { slug: "farine", name: "Farine dup" },
    { slug: "", name: "Blank" }, // slugless: kept under its name: key
    { slug: "", name: "blank" }, // same key: deduped
    null,
    { name: "" }, // unkeyable: dropped
    { slug: "lait" }, // name defaults to slug
  ]);
  assert.equal(ritual.total, 3);
  assert.deepEqual(ritual.candidates(), [
    { key: "farine", slug: "farine", name: "Farine" },
    { key: "name:blank", slug: null, name: "Blank" },
    { key: "lait", slug: "lait", name: "lait" },
  ]);
  ritual.candidates()[0].name = "MUT";
  assert.equal(ritual.candidates()[0].name, "Farine");
  assert.equal(ritual.isDone(), false);
});

test("createRitual: validate/reject/ignoreRest/decisions/isDone", () => {
  const ritual = createRitual([
    { slug: "a", name: "A" },
    { slug: "b", name: "B" },
    { slug: "c", name: "C" },
  ]);
  assert.deepEqual(ritual.pending().map((c) => c.slug), ["a", "b", "c"]);
  assert.deepEqual(ritual.validate("a"), { key: "a", slug: "a", name: "A" });
  assert.equal(ritual.reject("b"), true);
  // Unknown / already-decided → null/false.
  assert.equal(ritual.validate("zzz"), null);
  assert.equal(ritual.validate("a"), null);
  assert.equal(ritual.reject("b"), false);
  assert.deepEqual(ritual.pending().map((c) => c.slug), ["c"]);
  const rest = ritual.ignoreRest();
  assert.deepEqual(rest, [{ key: "c", slug: "c", name: "C" }]);
  assert.equal(ritual.isDone(), true);
  assert.deepEqual(ritual.pending(), []);
  // Post-ignore calls are terminal.
  assert.equal(ritual.validate("c"), null);
  assert.equal(ritual.reject("c"), false);
  assert.deepEqual(ritual.decisions(), [
    { key: "a", slug: "a", name: "A", decision: "added" },
    { key: "b", slug: "b", name: "B", decision: "rejected" },
    { key: "c", slug: "c", name: "C", decision: "ignored" },
  ]);
});

test("createRitual: full decide without ignoreRest", () => {
  const ritual = createRitual([{ slug: "a", name: "A" }]);
  ritual.validate("a");
  assert.equal(ritual.isDone(), true);
  assert.deepEqual(ritual.decisions(), [{ key: "a", slug: "a", name: "A", decision: "added" }]);
});

test("filterCandidates: onList + rejected-cooldown suppressed; added/ignored re-proposed", () => {
  const now = 1_700_000_000_000;
  const day = 24 * 3600 * 1000;
  const candidates = [
    { slug: "on-list", name: "On list" },
    { slug: "fresh-reject", name: "Fresh" },
    { slug: "old-reject", name: "Old" },
    { slug: "added-before", name: "Added" },
    { slug: "ignored-before", name: "Ignored" },
    { slug: "new", name: "New" },
    { slug: "new", name: "New dup" },
    { slug: "", name: "Blank" },
  ];
  const out = filterCandidates(candidates, {
    onListSlugs: ["on-list"],
    recentDecisions: {
      "fresh-reject": { decision: "rejected", at: now - day },
      "old-reject": { decision: "rejected", at: now - 8 * day },
      "added-before": { decision: "added", at: now - day },
      "ignored-before": { decision: "ignored", at: now - day },
    },
    now,
  });
  assert.deepEqual(out.map((c) => c.slug), ["old-reject", "added-before", "ignored-before", "new"]);
  // Custom cooldown respected.
  const strict = filterCandidates([{ slug: "x", name: "X" }], {
    recentDecisions: { x: { decision: "rejected", at: now - 10 } },
    cooldownMs: 5,
    now,
  });
  assert.equal(strict.length, 1);
});

test("tags: single activation path (suggestion === list === base)", () => {
  assert.equal(TAGS_CHANGE_EVENT, "shopping-list:tags-change");
  assert.equal(activateTagFromSuggestion, activateTag);
  assert.equal(activateTagFromList, activateTag);
});

test("tags: activate/deactivate/toggle/clear/set (normalized, idempotent)", () => {
  assert.deepEqual(getActiveTags(), []);
  activateTag("  Linge ");
  assert.deepEqual(getActiveTags(), ["Linge"]);
  assert.equal(isTagActive("linge"), true);
  assert.equal(isTagActive("LINGE"), true);
  assert.equal(isTagActive("vaisselle"), false);
  // Idempotent + blank no-ops return current state.
  assert.deepEqual(activateTag("LINGE"), ["Linge"]);
  assert.deepEqual(activateTag("   "), ["Linge"]);
  assert.deepEqual(activateTag(null), ["Linge"]);
  activateTag("Vaisselle");
  assert.deepEqual(getActiveTags(), ["Linge", "Vaisselle"]);
  // Copies.
  getActiveTags().push("MUT");
  assert.equal(getActiveTags().length, 2);
  assert.deepEqual(toggleTag("linge"), ["Vaisselle"]);
  assert.deepEqual(toggleTag("linge"), ["Vaisselle", "linge"]);
  assert.deepEqual(deactivateTag("nope"), ["Vaisselle", "linge"]);
  assert.deepEqual(clearTags(), []);
  assert.deepEqual(clearTags(), []); // no-op on empty
});

test("tags: diacritic-insensitive membership", () => {
  activateTag("Bébé");
  assert.equal(isTagActive("bebe"), true);
  assert.deepEqual(deactivateTag("BÉBÉ"), []);
});

test("tags: setActiveTags dedups (first display wins), order-sensitive", () => {
  assert.deepEqual(setActiveTags(["Linge", "linge", "  ", "Vaisselle"]), ["Linge", "Vaisselle"]);
  assert.deepEqual(setActiveTags(["linge", "vaisselle"]), ["Linge", "Vaisselle"]); // same keys → keep display
  assert.deepEqual(setActiveTags(["Vaisselle", "Linge"]), ["Vaisselle", "Linge"]); // order change applies
  assert.deepEqual(setActiveTags("not-an-array"), []);
});

test("tags: Node runtime has no document listener (safe no-op)", () => {
  const unsub = onTagsChange(() => {
    throw new Error("must not be called");
  });
  assert.equal(typeof unsub, "function");
  assert.doesNotThrow(() => unsub());
});

test("history: closeSession snapshot shape + blank filtering", () => {
  assert.equal(MAX_SESSIONS, 20);
  assert.equal(MAX_ITEMS_PER_SESSION, 200);
  assert.equal(closeSession([]), null);
  assert.equal(closeSession([{ name: "   " }]), null);
  const entry = closeSession(
    [
      { slug: "ail", name: "Ail", qty: "3 gousses" },
      { name: "Truc", qty: "" },
      { name: "   " },
    ],
    { closedAt: 123 },
  );
  assert.equal(entry.closedAt, 123);
  assert.equal(entry.count, 2);
  assert.deepEqual(entry.items, [
    { slug: "ail", name: "Ail", qty: "3 gousses" },
    { slug: null, name: "Truc", qty: "" },
  ]);
  assert.ok(entry.id);
});

test("history: getHistory newest-first, copies, clear", () => {
  closeSession([{ name: "First" }], { closedAt: 1 });
  closeSession([{ name: "Second" }], { closedAt: 2 });
  const history = getHistory();
  assert.equal(history.length, 2);
  assert.equal(history[0].items[0].name, "Second");
  history[0].items[0].name = "MUT";
  assert.equal(getHistory()[0].items[0].name, "Second");
  assert.equal(getHistoryEntry(history[0].id).items[0].name, "Second");
  assert.equal(getHistoryEntry("unknown"), null);
  assert.equal(clearHistory(), 2);
  assert.deepEqual(getHistory(), []);
  assert.equal(clearHistory(), 0);
});

test("history: caps sessions at 20, items at 200", () => {
  for (let i = 0; i < 25; i += 1) closeSession([{ name: `Item ${i}` }], { closedAt: i });
  assert.equal(getHistory().length, 20);
  assert.equal(getHistory()[0].items[0].name, "Item 24");
  const big = closeSession(Array.from({ length: 250 }, (_, i) => ({ name: `x${i}` })));
  assert.equal(big.count, 200);
});

test("history: recentItems dedups newest-first with limit", () => {
  closeSession([{ slug: "ail", name: "Ail" }, { name: "Truc" }], { closedAt: 1 });
  closeSession([{ slug: "ail", name: "Ail" }, { name: "Lait" }], { closedAt: 2 });
  assert.deepEqual(recentItems(20), [
    { slug: "ail", name: "Ail" },
    { slug: null, name: "Lait" },
    { slug: null, name: "Truc" },
  ]);
  assert.equal(recentItems(1).length, 1);
  // Edge: limit 0 (or negative) returns nothing, like topFrequent(0).
  assert.equal(recentItems(0).length, 0);
  // Slugless dedup is name-normalized.
  configureStore({ storage: makeMemoryStorage() });
  closeSession([{ name: "Crème" }]);
  closeSession([{ name: "creme" }]);
  assert.equal(recentItems(10).length, 1);
});
