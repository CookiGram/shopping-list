/* Shopping List — User-owned essentials acceptance suite.
 * Product decision: the catalog never defines what is essential; the user
 * marks their own essentials (pin), proposed again on every new trip.
 * Favorites (heart) and essentials (pin) are independent concepts.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { beforeEach } from "node:test";
import {
  configureStore,
  getEssentials,
  isEssential,
  toggleEssential,
  essentialKey,
  toggleFavorite,
  isFavorite,
  addItem,
  getItems,
  STORE_KEYS,
} from "../js/store.js";
import { createRitual, userEssentialCandidates } from "../js/staples.js";
import { scoreSearchMatch, indexSearchIngredient } from "../js/search.js";
import { makeMemoryStorage, searchEntries } from "./helpers.mjs";

beforeEach(() => {
  configureStore({ storage: makeMemoryStorage() });
});

test("essentials 1/11: fresh install starts with zero essentials", () => {
  assert.deepEqual(getEssentials(), []);
  assert.equal(isEssential({ slug: "farine", name: "Farine" }), false);
});

test("essentials 2/11: marking a product as essential", () => {
  const first = toggleEssential({ slug: "farine", name: "Farine" });
  assert.deepEqual(first, { essential: true, key: "farine" });
  assert.equal(isEssential({ slug: "farine", name: "Farine" }), true);
  // Household (dict) products can be essentials too.
  toggleEssential({ slug: "lessive", name: "Lessive" });
  assert.deepEqual(
    getEssentials().map((ess) => ess.slug),
    ["farine", "lessive"],
  );
});

test("essentials 3/11: essential status persists across sessions", () => {
  const storage = makeMemoryStorage();
  configureStore({ storage });
  toggleEssential({ slug: "farine", name: "Farine" });
  // Simulate a reload: same backend, fresh module state.
  configureStore({ storage });
  assert.equal(isEssential({ slug: "farine", name: "Farine" }), true);
  assert.deepEqual(JSON.parse(storage.getItem(STORE_KEYS.essentials)).map((ess) => ess.key), ["farine"]);
});

test("essentials 4/11: unmarking removes the essential status", () => {
  toggleEssential({ slug: "farine", name: "Farine" });
  const second = toggleEssential({ slug: "farine", name: "Farine" });
  assert.deepEqual(second, { essential: false, key: "farine" });
  assert.equal(isEssential({ slug: "farine", name: "Farine" }), false);
  assert.deepEqual(getEssentials(), []);
});

test("essentials 5/11: favorites and essentials are independent", () => {
  toggleFavorite({ slug: "ail", name: "Ail" }); // favorite only
  toggleEssential({ slug: "farine", name: "Farine" }); // essential only
  toggleFavorite({ slug: "lait", name: "Lait" });
  toggleEssential({ slug: "lait", name: "Lait" }); // both
  // Neither: "lessive" untouched.
  assert.equal(isFavorite({ slug: "ail" }), true);
  assert.equal(isEssential({ slug: "ail" }), false);
  assert.equal(isFavorite({ slug: "farine" }), false);
  assert.equal(isEssential({ slug: "farine" }), true);
  assert.equal(isFavorite({ slug: "lait" }), true);
  assert.equal(isEssential({ slug: "lait" }), true);
  assert.equal(isFavorite({ slug: "lessive" }), false);
  assert.equal(isEssential({ slug: "lessive" }), false);
  // Unmarking one concept never touches the other.
  toggleEssential({ slug: "lait", name: "Lait" });
  assert.equal(isFavorite({ slug: "lait" }), true);
  assert.equal(isEssential({ slug: "lait" }), false);
});

test("essentials 6/11: a new trip proposes only user-marked essentials", () => {
  // "farine" carries the catalog staple:true flag but is NOT marked.
  toggleEssential({ slug: "ail", name: "Ail" }); // staple:false, marked
  toggleEssential({ slug: "lessive", name: "Lessive" }); // household, marked
  const candidates = userEssentialCandidates(getEssentials(), { onListKeys: [] });
  assert.deepEqual(
    candidates.map((candidate) => candidate.slug).sort(),
    ["ail", "lessive"],
  );
  // Already-on-list essentials are not proposed again.
  addItem({ name: "Ail", slug: "ail" });
  const again = userEssentialCandidates(getEssentials(), {
    onListKeys: getItems().map((item) => item.slug ?? essentialKey({ name: item.name })),
  });
  assert.deepEqual(again.map((candidate) => candidate.slug), ["lessive"]);
});

test("essentials 7/11: accepting an essential adds a normal list item", () => {
  toggleEssential({ slug: "ail", name: "Ail" });
  const ritual = createRitual(userEssentialCandidates(getEssentials(), { onListKeys: [] }));
  const validated = ritual.validate("ail");
  assert.deepEqual(validated, { key: "ail", slug: "ail", name: "Ail" });
  const item = addItem({ name: validated.name, slug: validated.slug });
  assert.equal(item.name, "Ail");
  assert.equal(item.slug, "ail");
  assert.equal(item.checked, false);
  assert.ok(item.id);
});

test("essentials 8/11: ignoring an essential keeps its permanent status", () => {
  toggleEssential({ slug: "ail", name: "Ail" });
  toggleEssential({ slug: "lait", name: "Lait" });
  const ritual = createRitual(userEssentialCandidates(getEssentials(), { onListKeys: [] }));
  assert.equal(ritual.reject("lait"), true);
  ritual.ignoreRest();
  assert.equal(isEssential({ slug: "lait", name: "Lait" }), true);
  assert.equal(isEssential({ slug: "ail", name: "Ail" }), true);
  assert.equal(getEssentials().length, 2);
});

test("essentials 9/11: ignore-rest closes the proposals for the current trip", () => {
  toggleEssential({ slug: "ail", name: "Ail" });
  toggleEssential({ slug: "lait", name: "Lait" });
  const ritual = createRitual(userEssentialCandidates(getEssentials(), { onListKeys: [] }));
  ritual.validate("ail");
  const rest = ritual.ignoreRest();
  assert.deepEqual(rest.map((candidate) => candidate.slug), ["lait"]);
  assert.deepEqual(ritual.pending(), []);
  assert.equal(ritual.isDone(), true);
  // Trip memory (decided slugs) keeps them away until the next trip.
  const decided = ritual.decisions().map((entry) => entry.key);
  const later = userEssentialCandidates(getEssentials(), {
    onListKeys: ["ail"],
    decidedKeys: decided,
  });
  assert.deepEqual(later, []);
});

test("essentials 10/11: essentials return on the next new trip", () => {
  toggleEssential({ slug: "ail", name: "Ail" });
  toggleEssential({ slug: "lait", name: "Lait" });
  // Trip 1: reject one, ignore the rest — nothing persists.
  const trip1 = createRitual(userEssentialCandidates(getEssentials(), { onListKeys: [] }));
  trip1.reject("lait");
  trip1.ignoreRest();
  // Trip 2: fresh trip memory proposes every kept essential again.
  const trip2 = createRitual(userEssentialCandidates(getEssentials(), { onListKeys: [] }));
  assert.deepEqual(
    trip2.pending().map((candidate) => candidate.slug).sort(),
    ["ail", "lait"],
  );
});

test("essentials 11/11: no catalog flag or default seed recreates essentials", () => {
  // Fresh store: nothing seeded.
  assert.deepEqual(getEssentials(), []);
  assert.deepEqual(userEssentialCandidates(getEssentials(), { onListKeys: [] }), []);
  // The catalog staple:true flag alone changes nothing: no ranking boost…
  const farine = indexSearchIngredient(searchEntries()[2]); // staple:true
  assert.equal(scoreSearchMatch(farine, "farine").boosts.staple, 0);
  // …and no proposal.
  assert.equal(
    userEssentialCandidates(getEssentials(), { onListKeys: [] }).some(
      (candidate) => candidate.slug === "farine",
    ),
    false,
  );
});

test("essentials custom 1/5: slugless products are markable via their name: key", () => {
  const marked = toggleEssential({ slug: null, name: "Truc maison" });
  assert.deepEqual(marked, { essential: true, key: "name:truc maison" });
  assert.equal(isEssential({ slug: null, name: "Truc maison" }), true);
  // Lookup is normalized (case/accents/spacing-insensitive).
  assert.equal(isEssential({ name: "  TRUC   MAISON " }), true);
  assert.equal(isEssential({ name: "Crème maison" }), false);
  const unmarked = toggleEssential({ slug: null, name: "truc maison" });
  assert.deepEqual(unmarked, { essential: false, key: "name:truc maison" });
});

test("essentials custom 2/5: custom essential persists across reload", () => {
  const storage = makeMemoryStorage();
  configureStore({ storage });
  toggleEssential({ slug: null, name: "Truc maison" });
  configureStore({ storage }); // simulate a reload on the same backend
  assert.equal(isEssential({ name: "Truc maison" }), true);
  assert.deepEqual(getEssentials(), [
    { key: "name:truc maison", slug: null, name: "Truc maison", addedAt: getEssentials()[0].addedAt },
  ]);
});

test("essentials custom 3/5: custom essential is proposed trip after trip", () => {
  toggleEssential({ slug: null, name: "Truc maison" });
  const trip1 = createRitual(userEssentialCandidates(getEssentials(), { onListKeys: [] }));
  assert.deepEqual(trip1.pending(), [{ key: "name:truc maison", slug: null, name: "Truc maison" }]);
  // Reject by stable key; the status survives and the next trip re-proposes.
  assert.equal(trip1.reject("name:truc maison"), true);
  assert.equal(isEssential({ name: "Truc maison" }), true);
  const trip2 = createRitual(userEssentialCandidates(getEssentials(), { onListKeys: [] }));
  assert.deepEqual(trip2.pending().map((candidate) => candidate.key), ["name:truc maison"]);
});

test("essentials custom 4/5: custom on the list is not re-proposed (normalized key match)", () => {
  toggleEssential({ slug: null, name: "Truc maison" });
  addItem({ name: "truc   MAISON" }); // same product, different casing/spacing
  const onListKeys = getItems().map((item) => item.slug ?? essentialKey({ name: item.name }));
  assert.deepEqual(onListKeys, ["name:truc maison"]);
  assert.deepEqual(userEssentialCandidates(getEssentials(), { onListKeys }), []);
});

test("essentials custom 5/5: accepting a custom essential adds a normal custom item", () => {
  toggleEssential({ slug: null, name: "Truc maison" });
  const ritual = createRitual(userEssentialCandidates(getEssentials(), { onListKeys: [] }));
  const validated = ritual.validate("name:truc maison");
  assert.deepEqual(validated, { key: "name:truc maison", slug: null, name: "Truc maison" });
  // Same call shape as the app lane: no catalog hit → provenance undefined.
  const item = addItem({ name: validated.name, slug: validated.slug ?? null, provenance: undefined });
  assert.equal(item.slug, null);
  assert.deepEqual(item.provenance, { source: "custom" });
  assert.equal(item.checked, false);
  assert.ok(item.id);
});
