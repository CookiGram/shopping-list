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
  const candidates = userEssentialCandidates(getEssentials(), { onListSlugs: [] });
  assert.deepEqual(
    candidates.map((candidate) => candidate.slug).sort(),
    ["ail", "lessive"],
  );
  // Already-on-list essentials are not proposed again.
  addItem({ name: "Ail", slug: "ail" });
  const again = userEssentialCandidates(getEssentials(), {
    onListSlugs: getItems().map((item) => item.slug).filter(Boolean),
  });
  assert.deepEqual(again.map((candidate) => candidate.slug), ["lessive"]);
});

test("essentials 7/11: accepting an essential adds a normal list item", () => {
  toggleEssential({ slug: "ail", name: "Ail" });
  const ritual = createRitual(userEssentialCandidates(getEssentials(), { onListSlugs: [] }));
  const validated = ritual.validate("ail");
  assert.deepEqual(validated, { slug: "ail", name: "Ail" });
  const item = addItem({ name: validated.name, slug: validated.slug });
  assert.equal(item.name, "Ail");
  assert.equal(item.slug, "ail");
  assert.equal(item.checked, false);
  assert.ok(item.id);
});

test("essentials 8/11: ignoring an essential keeps its permanent status", () => {
  toggleEssential({ slug: "ail", name: "Ail" });
  toggleEssential({ slug: "lait", name: "Lait" });
  const ritual = createRitual(userEssentialCandidates(getEssentials(), { onListSlugs: [] }));
  assert.equal(ritual.reject("lait"), true);
  ritual.ignoreRest();
  assert.equal(isEssential({ slug: "lait", name: "Lait" }), true);
  assert.equal(isEssential({ slug: "ail", name: "Ail" }), true);
  assert.equal(getEssentials().length, 2);
});

test("essentials 9/11: ignore-rest closes the proposals for the current trip", () => {
  toggleEssential({ slug: "ail", name: "Ail" });
  toggleEssential({ slug: "lait", name: "Lait" });
  const ritual = createRitual(userEssentialCandidates(getEssentials(), { onListSlugs: [] }));
  ritual.validate("ail");
  const rest = ritual.ignoreRest();
  assert.deepEqual(rest.map((candidate) => candidate.slug), ["lait"]);
  assert.deepEqual(ritual.pending(), []);
  assert.equal(ritual.isDone(), true);
  // Trip memory (decided slugs) keeps them away until the next trip.
  const decided = ritual.decisions().map((entry) => entry.slug);
  const later = userEssentialCandidates(getEssentials(), {
    onListSlugs: ["ail"],
    decidedSlugs: decided,
  });
  assert.deepEqual(later, []);
});

test("essentials 10/11: essentials return on the next new trip", () => {
  toggleEssential({ slug: "ail", name: "Ail" });
  toggleEssential({ slug: "lait", name: "Lait" });
  // Trip 1: reject one, ignore the rest — nothing persists.
  const trip1 = createRitual(userEssentialCandidates(getEssentials(), { onListSlugs: [] }));
  trip1.reject("lait");
  trip1.ignoreRest();
  // Trip 2: fresh trip memory proposes every kept essential again.
  const trip2 = createRitual(userEssentialCandidates(getEssentials(), { onListSlugs: [] }));
  assert.deepEqual(
    trip2.pending().map((candidate) => candidate.slug).sort(),
    ["ail", "lait"],
  );
});

test("essentials 11/11: no catalog flag or default seed recreates essentials", () => {
  // Fresh store: nothing seeded.
  assert.deepEqual(getEssentials(), []);
  assert.deepEqual(userEssentialCandidates(getEssentials(), { onListSlugs: [] }), []);
  // The catalog staple:true flag alone changes nothing: no ranking boost…
  const farine = indexSearchIngredient(searchEntries()[2]); // staple:true
  assert.equal(scoreSearchMatch(farine, "farine").boosts.staple, 0);
  // …and no proposal.
  assert.equal(
    userEssentialCandidates(getEssentials(), { onListSlugs: [] }).some(
      (candidate) => candidate.slug === "farine",
    ),
    false,
  );
});
