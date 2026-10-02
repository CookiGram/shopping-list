/* Shopping List v0 — Lane H: search ranking unit tests.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeText,
  tokenize,
  SEARCH_FIELDS,
  BOOST_FAVORITE,
  BOOST_STAPLE,
  BOOST_HISTORY_MAX,
  DEMOTE_ON_LIST,
  MAX_SUGGESTIONS,
  MAX_TAG_ROWS,
  indexSearchIngredient,
  buildIngredientIndex,
  tagVocabulary,
  normalizeTerms,
  matchSearch,
  scoreSearchMatch,
  compareSearchResults,
  sortSearchResults,
  searchIngredients,
  freeAddSuggestion,
  suggestionKey,
  buildSuggestions,
  entryKeys,
} from "../js/search.js";
import { searchEntries } from "./helpers.mjs";

test("normalizeText: FR-safe, never throws", () => {
  assert.equal(normalizeText("Gousse   d'Ail"), "gousse d'ail");
  assert.equal(normalizeText("Crème brûlée"), "creme brulee");
  assert.equal(normalizeText("  Éponge\t"), "eponge");
  assert.equal(normalizeText(null), "");
  assert.equal(normalizeText(undefined), "");
  assert.equal(normalizeText(123), "123");
  assert.equal(normalizeText("🥕 carotte"), "🥕 carotte");
});

test("tokenize splits normalized text", () => {
  assert.deepEqual(tokenize("  Ail en   poudre "), ["ail", "en", "poudre"]);
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize(null), []);
});

test("SEARCH_FIELDS contract", () => {
  assert.deepEqual([...SEARCH_FIELDS], ["name", "aliases", "category"]);
});

test("indexSearchIngredient accepts wrappers and bare entries", () => {
  const wrapped = indexSearchIngredient(searchEntries()[0]);
  assert.equal(wrapped.slug, "ail");
  assert.equal(wrapped.kind, "culinary");
  assert.ok(wrapped.fields.name.text.includes("ail"));
  const bare = indexSearchIngredient({ slug: "x", name: "Xyz", aliases: [], category: "C" });
  assert.equal(bare.slug, "x");
  assert.equal(bare.fields.name.text, "xyz");
  const household = indexSearchIngredient({ slug: "e", name: "E", tags: ["t"] });
  assert.equal(household.kind, "household");
  // Null-safe: never throws on weird input
  const empty = indexSearchIngredient(null);
  assert.equal(empty.slug, "");
});

test("buildIngredientIndex keeps prebuilt entries", () => {
  const built = buildIngredientIndex(searchEntries());
  assert.equal(built.length, 5);
  const again = buildIngredientIndex(built);
  assert.equal(again.length, 5);
  assert.deepEqual(buildIngredientIndex(null), []);
  assert.deepEqual(buildIngredientIndex("nope"), []);
});

test("tagVocabulary: sorted unique household tags", () => {
  const vocab = tagVocabulary(searchEntries());
  assert.deepEqual(vocab, ["cuisine", "linge", "vaisselle"]);
  assert.deepEqual(tagVocabulary([]), []);
  assert.deepEqual(tagVocabulary(null), []);
});

test("normalizeTerms: strings become tag terms, blanks dropped", () => {
  assert.deepEqual(normalizeTerms(["linge", "  ", { label: "vaisselle", type: "tag" }]), [
    { label: "linge", type: "tag" },
    { label: "vaisselle", type: "tag" },
  ]);
  assert.deepEqual(normalizeTerms(null), []);
});

test("entryKeys: slug + name + aliases normalized", () => {
  const idx = indexSearchIngredient(searchEntries()[0]);
  const keys = entryKeys(idx);
  assert.ok(keys.includes("ail"));
  assert.ok(keys.includes("gousse d'ail"));
});

test("matchSearch: every token must match some field", () => {
  const idx = indexSearchIngredient(searchEntries()[0]); // Ail
  assert.equal(matchSearch(idx, "ail").matched, true);
  assert.equal(matchSearch(idx, "gousse").matched, true); // alias
  assert.equal(matchSearch(idx, "legumes").matched, true); // category (folded)
  assert.equal(matchSearch(idx, "ail lessive").matched, false);
  assert.equal(matchSearch(idx, "").matched, true); // no tokens: vacuous match
});

test("matchSearch: active tag narrows to household carriers", () => {
  const culinary = indexSearchIngredient(searchEntries()[0]);
  const household = indexSearchIngredient(searchEntries()[3]); // lessive [linge]
  assert.equal(matchSearch(culinary, "", ["linge"]).matched, false);
  assert.equal(matchSearch(household, "", ["linge"]).matched, true);
  assert.equal(matchSearch(household, "", ["vaisselle"]).matched, false);
  // Free text + tag combine (AND)
  assert.equal(matchSearch(household, "lessive", ["linge"]).matched, true);
  assert.equal(matchSearch(household, "eponge", ["linge"]).matched, false);
});

test("scoreSearchMatch: text weights (single-word exact=100 phrase, token exact=60, prefix=45, alias exact=35, category exact=10)", () => {
  const ail = indexSearchIngredient(searchEntries()[0]);
  // Single-word name exact hits the phrase fast-path (100), not 60.
  assert.equal(scoreSearchMatch(ail, "ail").baseScore, 100);
  // Token-exact inside a multi-word name scores 60.
  const poudre = indexSearchIngredient(searchEntries()[1]); // "Ail en poudre"
  assert.equal(scoreSearchMatch(poudre, "poudre").baseScore, 60);
  // Prefix on name scores 45.
  const r = scoreSearchMatch(poudre, "poud");
  assert.equal(r.baseScore, 45);
  assert.equal(r.evidence[0].field, "name");
  // Alias exact scores 35 (token not in name).
  assert.equal(scoreSearchMatch(ail, "gousse").baseScore, 35);
  // Category exact scores 10.
  const farine = indexSearchIngredient(searchEntries()[2]); // category Épicerie salée
  const cat = scoreSearchMatch(farine, "epicerie");
  assert.ok(cat.matched);
  // "epicerie" is exact on one category token → 10 (name/alias miss).
  assert.equal(cat.baseScore, 10);
});

test("scoreSearchMatch: multi-token bonus + exact-phrase bonus", () => {
  const poudre = indexSearchIngredient(searchEntries()[1]);
  const two = scoreSearchMatch(poudre, "ail poudre");
  // 60 (ail exact in name) + 60 (poudre exact) + 5 bonus = 125
  assert.equal(two.baseScore, 125);
  const phrase = scoreSearchMatch(poudre, "Ail en poudre");
  // 60+60+60 + 2*5 bonus + 100 phrase = 290
  assert.equal(phrase.baseScore, 290);
});

test("scoreSearchMatch: boosts never resurrect a non-match; score never negative", () => {
  const ail = indexSearchIngredient(searchEntries()[0]);
  const miss = scoreSearchMatch(ail, "zzz-no-match", [], {
    favorites: ["ail"],
    staples: ["ail"],
    history: ["ail"],
  });
  assert.equal(miss.matched, false);
  assert.equal(miss.score, 0);
  assert.deepEqual(miss.boosts, { favorite: 0, staple: 0, history: 0, onList: 0 });
  // Heavy demotion clamps at 0, not below.
  const aliased = indexSearchIngredient({ slug: "c", name: "Ccc", aliases: ["ccc"], category: "zzz-cat" });
  const demoted = scoreSearchMatch(aliased, "zzz-cat", [], { onList: ["c"] });
  // category exact 10 - 12 demote → clamped 0
  assert.equal(demoted.score, 0);
  assert.equal(demoted.onList, true);
});

test("ranking context: favorite +8, staple +4 (flag or set), onList -12", () => {
  assert.equal(BOOST_FAVORITE, 8);
  assert.equal(BOOST_STAPLE, 4);
  assert.equal(BOOST_HISTORY_MAX, 6);
  assert.equal(DEMOTE_ON_LIST, 12);
  const ail = indexSearchIngredient(searchEntries()[0]);
  const farine = indexSearchIngredient(searchEntries()[2]); // staple:true
  const fav = scoreSearchMatch(ail, "ail", [], { favorites: ["ail"] });
  assert.equal(fav.boosts.favorite, 8);
  assert.equal(fav.score, fav.baseScore + 8);
  // Lane-G favorite shape {slug,name,key} also matches.
  const favShape = scoreSearchMatch(ail, "ail", [], {
    favorites: [{ slug: "ail", name: "Ail", key: "ail" }],
  });
  assert.equal(favShape.boosts.favorite, 8);
  // Slugless Lane-G favorite {key:"name:..."} matches entry names
  // (the "name:" prefix is stripped only on the .key object shape).
  const favNameKey = scoreSearchMatch(ail, "ail", [], { favorites: [{ key: "name:ail" }] });
  assert.equal(favNameKey.boosts.favorite, 8);
  // Staple flag alone boosts without any context set.
  const stapleFlag = scoreSearchMatch(farine, "farine");
  assert.equal(stapleFlag.boosts.staple, 4);
  // Staple set also boosts non-flag entries.
  const stapleSet = scoreSearchMatch(ail, "ail", [], { staples: ["ail"] });
  assert.equal(stapleSet.boosts.staple, 4);
  // On-list demotes.
  const on = scoreSearchMatch(ail, "ail", [], { onList: [{ slug: "ail", name: "Ail" }] });
  assert.equal(on.boosts.onList, -12);
  assert.equal(on.onList, true);
});

test("ranking context: history recency + count (best wins)", () => {
  const ail = indexSearchIngredient(searchEntries()[0]);
  // Newest-first string array: rank 0 → 6.
  assert.equal(scoreSearchMatch(ail, "ail", [], { history: ["ail", "farine"] }).boosts.history, 6);
  // Rank 1-2 → 4.
  assert.equal(scoreSearchMatch(ail, "ail", [], { history: ["farine", "ail"] }).boosts.history, 4);
  // topFrequent-shaped records use count: min(6, 2+count).
  assert.equal(
    scoreSearchMatch(ail, "ail", [], { history: [{ key: "ail", count: 10 }] }).boosts.history,
    6,
  );
  assert.equal(
    scoreSearchMatch(ail, "ail", [], { history: [{ key: "ail", count: 1 }] }).boosts.history,
    6, // recency rank 0 (6) beats count score (3)
  );
  // getHistory-shaped sessions {items:[...]} flatten.
  assert.equal(
    scoreSearchMatch(ail, "ail", [], { history: [{ items: [{ slug: "ail", name: "Ail" }] }] }).boosts.history,
    6,
  );
  // Map key → count.
  const m = new Map([["ail", 5]]);
  assert.equal(scoreSearchMatch(ail, "ail", [], { history: m }).boosts.history, 6);
  // Frequency-map object {name: {count}}.
  assert.equal(scoreSearchMatch(ail, "ail", [], { history: { ail: { count: 0 } } }).boosts.history, 6);
  // Unknown key → 0.
  assert.equal(scoreSearchMatch(ail, "ail", [], { history: ["zzz"] }).boosts.history, 0);
});

test("compareSearchResults: score desc, FR name tiebreak, slug tiebreak", () => {
  const a = indexSearchIngredient({ slug: "b", name: "Abricot" });
  const b = indexSearchIngredient({ slug: "a", name: "Abricot" });
  const r1 = { score: 10, indexed: a };
  const r2 = { score: 50, indexed: b };
  assert.ok(compareSearchResults(r1, r2) > 0);
  // Same score + same name → slug order.
  const s1 = { score: 10, indexed: a };
  const s2 = { score: 10, indexed: b };
  assert.ok(compareSearchResults(s1, s2) > 0); // b after a
  const sorted = sortSearchResults([r1, r2]);
  assert.equal(sorted[0], r2);
});

test("searchIngredients: limit, activeTags alias, raw entries accepted", () => {
  const res = searchIngredients(searchEntries(), "ail");
  assert.ok(res.length >= 2);
  assert.ok(res[0].score >= res[1].score);
  const limited = searchIngredients(searchEntries(), "ail", { limit: 1 });
  assert.equal(limited.length, 1);
  const tagged = searchIngredients(searchEntries(), "", { activeTags: ["linge"] });
  assert.deepEqual(tagged.map((r) => r.indexed.slug), ["lessive"]);
  const structured = searchIngredients(searchEntries(), "", {
    structuredTerms: [{ label: "linge", type: "tag" }],
  });
  assert.deepEqual(structured.map((r) => r.indexed.slug), ["lessive"]);
});

test("freeAddSuggestion: always allowed, raw label preserved, blank → null", () => {
  const row = freeAddSuggestion("  truc  bizarre ");
  assert.equal(row.kind, "free-add");
  assert.equal(row.label, "truc bizarre");
  assert.equal(row.slug, null);
  assert.equal(freeAddSuggestion("   "), null);
  assert.equal(freeAddSuggestion(null), null);
  // Never throws on weird text.
  assert.ok(freeAddSuggestion("🥕 123 !!!").label.length > 0);
});

test("suggestionKey: stable DOM id suffixes", () => {
  assert.equal(suggestionKey({ kind: "free-add" }), "free-add");
  assert.equal(suggestionKey({ kind: "tag", tag: "Linge" }), "tag-linge");
  assert.equal(suggestionKey({ kind: "item", slug: "ail" }), "ail");
  assert.equal(suggestionKey(null), "unknown");
});

test("buildSuggestions: blank → [], free-add always appended", () => {
  assert.deepEqual(buildSuggestions(searchEntries(), ""), []);
  assert.deepEqual(buildSuggestions(searchEntries(), "   "), []);
  const rows = buildSuggestions(searchEntries(), "xyz-no-match");
  assert.equal(rows.at(-1).kind, "free-add");
  assert.equal(rows.at(-1).label, "xyz-no-match");
  const noFree = buildSuggestions(searchEntries(), "xyz-no-match", { includeFreeAdd: false });
  assert.ok(noFree.every((r) => r.kind !== "free-add"));
});

test("buildSuggestions: maxItems cap, tags-first capped at MAX_TAG_ROWS while items match", () => {
  assert.equal(MAX_SUGGESTIONS, 8);
  assert.equal(MAX_TAG_ROWS, 3);
  // One-char fragment matching several tags + items: tags capped at 3.
  const entries = [
    { kind: "household", entry: { slug: "a", name: "Aaa", aliases: [], category: "C", tags: ["cuisine"] } },
    { kind: "household", entry: { slug: "b", name: "Bbb", aliases: [], category: "C", tags: ["confiture"] } },
    { kind: "household", entry: { slug: "c", name: "Ccc", aliases: [], category: "C", tags: ["conserve"] } },
    { kind: "household", entry: { slug: "d", name: "Ddd", aliases: [], category: "C", tags: ["cumin"] } },
    { kind: "culinary", entry: { slug: "cumin", name: "Cumin", aliases: ["cumin"], category: "Condiments" } },
  ];
  const rows = buildSuggestions(entries, "c", { maxItems: 8 });
  const tags = rows.filter((r) => r.kind === "tag");
  assert.ok(tags.length <= MAX_TAG_ROWS);
  const catalogRows = rows.filter((r) => r.kind !== "free-add");
  assert.ok(catalogRows.length <= 8);
  // No item matches → tags may fill all rows.
  const tagOnly = buildSuggestions(entries.slice(0, 4), "cui", { maxItems: 8 });
  assert.ok(tagOnly.some((r) => r.kind === "tag"));
});

test("buildSuggestions: active tags excluded, single-char tags ignored", () => {
  const rows = buildSuggestions(searchEntries(), "linge", { activeTags: ["linge"] });
  assert.ok(rows.filter((r) => r.kind === "tag").every((r) => r.tag !== "linge"));
  const single = buildSuggestions(
    [{ kind: "household", entry: { slug: "x", name: "X", aliases: [], category: "C", tags: ["a"] } }],
    "a",
  );
  assert.ok(single.filter((r) => r.kind === "tag").length === 0);
});
