/* Shopping List v0 — ingredient search (Lane E).
 * Local ranking over the merged catalog (CookiGram culinary snapshot +
 * household shopping dict), re-weighted with favorites, staples, history,
 * active tags and the current list. Pure ES module: no DOM, no network,
 * no store import — the app lane injects ranking context explicitly so
 * this module also works against the contract-proposed Store API
 * (Lane G, parallel implementation).
 *
 * Text core (§3.2 of docs/cookigram-contract.md, ported verbatim then
 * re-weighted): normalizeText / tokenize / matchSearch / scoreSearchMatch
 * / compareSearchResults keep the CookiGram signatures, *Card renamed to
 * *Ingredient. SEARCH_FIELDS = ['name','aliases','category'] with
 * name exact 60 / prefix 45 / substring 25, aliases exact 35,
 * category exact 10, fuzzy 1. Final order is by RANK_TIER first
 * (exact → word/prefix → contains → alias → category → fuzzy → tags),
 * numeric score only breaks ties within a tier.
 *
 * Guarantees:
 * - free-add is ALWAYS allowed: freeAddSuggestion() returns a usable
 *   custom-item row for any non-blank query, even with zero matches.
 * - normalization NEVER blocks: every public function coerces its input
 *   and never throws on weird text (null, digits, emoji, diacritics).
 */

export const normalizeText = (str) =>
  String(str ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenize = (str) => {
  const normalized = normalizeText(str);
  return normalized ? normalized.split(" ") : [];
};

export const SEARCH_FIELDS = Object.freeze(["name", "aliases", "category"]);

/** Additive ranking signals. Kept small so text relevance dominates. */
export const BOOST_FAVORITE = 8;
export const BOOST_STAPLE = 4;
export const BOOST_HISTORY_MAX = 6;
export const DEMOTE_ON_LIST = 12;

/** Max catalog rows in the suggestions listbox (free-add is extra). */
export const MAX_SUGGESTIONS = 8;

/**
 * Max tag rows when item matches exist, so one-char fragments can't
 * crowd items out of the listbox. When no item matches, tags may fill
 * all MAX_SUGGESTIONS rows.
 */
export const MAX_TAG_ROWS = 3;

/**
 * Relevance tiers (issue #3). Lower wins; a tag row (TAG) never outranks
 * any item match unless the query explicitly starts with `#`
 * (TAG_PRIORITY). Within a tier, numeric score then FR name break ties.
 */
export const RANK_TIER = Object.freeze({
  EXACT_NAME: 0,
  WORD_OR_PREFIX: 1,
  NAME_CONTAINS: 2,
  ALIAS: 3,
  CATEGORY: 4,
  FUZZY: 5,
  TAG: 6,
  TAG_PRIORITY: -1,
});

/** Levenshtein distance (tiny strings; full DP is fine). */
export const levenshtein = (a = "", b = "") => {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let prev = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) {
      next[j] = Math.min(
        prev[j] + 1,
        next[j - 1] + 1,
        prev[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    prev = next;
  }
  return prev[right.length];
};

/** Strict fuzzy budget: typo-tolerant, never spammy. */
export const fuzzyThreshold = (token = "") =>
  String(token ?? "").length <= 4 ? 1 : 2;

const fuzzyMatchesTokens = (token, tokens = []) => {
  if (!token || token.length < 3) return false;
  const budget = fuzzyThreshold(token);
  return tokens.some(
    (candidate) =>
      candidate &&
      candidate !== token &&
      Math.abs(candidate.length - token.length) <= budget &&
      levenshtein(token, candidate) <= budget,
  );
};

/* ------------------------------------------------------------------ */
/* Index                                                               */
/* ------------------------------------------------------------------ */

/** Accept allEntries() wrappers {kind, entry} or bare entry objects. */
const splitInput = (input) => {
  if (input && typeof input === "object" && "entry" in input) {
    return {
      kind: input.kind ?? (input.entry?.tags ? "household" : "culinary"),
      entry: input.entry ?? {},
    };
  }
  const entry = input && typeof input === "object" ? input : {};
  return { kind: entry.tags ? "household" : "culinary", entry };
};

const fieldEntry = (text) => {
  const normalized = normalizeText(text);
  return Object.freeze({
    text: normalized,
    tokens: normalized ? normalized.split(" ") : [],
  });
};

/** Precompute frozen per-field {text, tokens} for one entry. */
export const indexSearchIngredient = (input, sourceIndex = 0) => {
  const { kind, entry } = splitInput(input);
  const fields = Object.freeze({
    name: fieldEntry(entry.name ?? ""),
    aliases: fieldEntry(
      [entry.slug ?? "", ...(entry.aliases ?? [])].join(" "),
    ),
    category: fieldEntry(entry.category ?? ""),
    // Structured-only (active tags); never a free-text field.
    tags: fieldEntry((entry.tags ?? []).join(" ")),
    // Structured-only (aisle filter chips, issue #30); never a
    // free-text field. Canonical CookiGram aisle per entry.
    aisle: fieldEntry(entry.aisle ?? ""),
  });
  return Object.freeze({
    kind,
    entry,
    ingredient: entry,
    slug: String(entry.slug ?? ""),
    name: String(entry.name ?? ""),
    sourceIndex,
    fields,
    title: fields.name.text,
  });
};

export const buildIngredientIndex = (entries = []) =>
  (Array.isArray(entries) ? entries : []).map((entry, index) =>
    entry?.fields ? entry : indexSearchIngredient(entry, index),
  );

/** Back-compat alias for the CookiGram name. */
export const buildSearchIndex = buildIngredientIndex;

/** Sorted unique household tags present in an index or entry list. */
export const tagVocabulary = (entriesOrIndex = []) => {
  const list = Array.isArray(entriesOrIndex) ? entriesOrIndex : [];
  const tags = new Set();
  for (const item of list) {
    const entry = item?.fields ? item.entry : splitInput(item).entry;
    for (const tag of entry?.tags ?? []) {
      if (typeof tag === "string" && tag.trim()) tags.add(tag.trim());
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b, "fr"));
};

/* ------------------------------------------------------------------ */
/* Match + score (CookiGram port, re-weighted)                         */
/* ------------------------------------------------------------------ */

const tokenMatchesField = (token, field) => {
  const exact = field.tokens.includes(token);
  const prefix = !exact && field.tokens.some((value) => value.startsWith(token));
  const substring = !exact && !prefix && field.text.includes(token);
  return { exact, prefix, substring, matched: exact || prefix || substring };
};

const phraseMatchesField = (phrase, field) =>
  Boolean(phrase) &&
  (field.text === phrase ||
    field.text.includes(` ${phrase} `) ||
    field.text.startsWith(`${phrase} `) ||
    field.text.endsWith(` ${phrase}`));

/** Plain strings are tag terms; {label, type} follows CookiGram. */
export const normalizeTerms = (terms = []) =>
  (Array.isArray(terms) ? terms : [])
    .map((term) =>
      typeof term === "string"
        ? { label: term, type: "tag" }
        : { label: term?.label ?? "", type: term?.type ?? "tag" },
    )
    .filter((term) => normalizeText(term.label));

const structuredField = (term) =>
  term?.type === "tag"
    ? "tags"
    : term?.type === "aisle"
      ? "aisle"
      : term?.type === "item" ||
          term?.type === "ingredient" ||
          term?.type === "ingrédient"
        ? "name"
        : null;

/**
 * Every free-text token must match some SEARCH_FIELD; every structured
 * term must phrase-match its pinned field. Tag terms pin to `tags`, so
 * an active tag narrows results to household entries carrying it
 * (culinary entries have no tags and are filtered out while a tag
 * is active — clear the tag to search them again). Aisle terms
 * (issue #30) pin to `aisle` and narrow to that canonical aisle;
 * free text and aisle combine (both must match).
 */
export const matchSearch = (indexed, query = "", structuredTerms = []) => {
  const index = indexed?.fields ? indexed : indexSearchIngredient(indexed);
  const queryTokens = tokenize(query);
  const terms = normalizeTerms(structuredTerms);
  const freeTextMatches = queryTokens.map(
    (token) =>
      SEARCH_FIELDS.some(
        (field) => tokenMatchesField(token, index.fields[field]).matched,
      ) || fuzzyMatchesTokens(token, index.fields.name.tokens),
  );
  const structuredMatches = terms.map((term) => {
    const fieldName = structuredField(term);
    return Boolean(
      fieldName &&
        phraseMatchesField(normalizeText(term.label), index.fields[fieldName]),
    );
  });
  return {
    matched: freeTextMatches.every(Boolean) && structuredMatches.every(Boolean),
    queryTokens,
    freeTextMatches,
    structuredMatches,
    terms,
  };
};

const scoreToken = (token, index) => {
  const name = index.fields.name;
  if (name.text === token && name.tokens.length === 1) {
    return { score: 100, field: "name", kind: "phrase" };
  }
  const nameMatch = tokenMatchesField(token, name);
  if (nameMatch.exact) return { score: 60, field: "name", kind: "exact" };
  if (nameMatch.prefix) return { score: 45, field: "name", kind: "prefix" };
  if (nameMatch.substring) {
    return { score: 25, field: "name", kind: "substring" };
  }
  const aliasMatch = tokenMatchesField(token, index.fields.aliases);
  if (aliasMatch.exact) return { score: 35, field: "aliases", kind: "exact" };
  if (aliasMatch.prefix || aliasMatch.substring) {
    return { score: 3, field: "aliases", kind: "substring" };
  }
  const categoryMatch = tokenMatchesField(token, index.fields.category);
  if (categoryMatch.exact) return { score: 10, field: "category", kind: "exact" };
  if (categoryMatch.prefix || categoryMatch.substring) {
    return { score: 3, field: "category", kind: "substring" };
  }
  if (fuzzyMatchesTokens(token, name.tokens)) {
    return { score: 1, field: "name", kind: "fuzzy" };
  }
  return { score: 0, field: null, kind: null };
};

/** Best (lowest) relevance tier for one token evidence + query. */
const evidenceTier = (evidence, queryText, nameText) => {
  if (!evidence || !evidence.field) return null;
  if (queryText && queryText === nameText) return RANK_TIER.EXACT_NAME;
  if (evidence.field === "name") {
    if (evidence.kind === "phrase") return RANK_TIER.EXACT_NAME;
    if (evidence.kind === "exact" || evidence.kind === "prefix") {
      return RANK_TIER.WORD_OR_PREFIX;
    }
    if (evidence.kind === "substring") return RANK_TIER.NAME_CONTAINS;
    if (evidence.kind === "fuzzy") return RANK_TIER.FUZZY;
  }
  if (evidence.field === "aliases") return RANK_TIER.ALIAS;
  if (evidence.field === "category") return RANK_TIER.CATEGORY;
  return null;
};

/* --- ranking context (favorites / staples / history / list) --- */

/**
 * Flatten one ranking-context item to normalized match keys. Accepts
 * plain strings AND the Lane G shapes directly: store items/favorites
 * ({slug, name, key?}), history sessions ({items: [...]}), staple or
 * frequency maps ({slug: {...}}). The `name:` prefix of slugless
 * favorite keys is stripped so it matches entry names.
 */
const itemKeys = (raw) => {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === "string") {
    const key = normalizeText(raw);
    return key ? [key] : [];
  }
  if (typeof raw !== "object") {
    const key = normalizeText(raw);
    return key ? [key] : [];
  }
  if (Array.isArray(raw.items)) return raw.items.flatMap(itemKeys);
  const out = [];
  for (const candidate of [raw.slug, raw.name]) {
    const key = normalizeText(candidate);
    if (key) out.push(key);
  }
  const key = normalizeText(raw.key);
  if (key) {
    out.push(key);
    if (key.startsWith("name:")) out.push(key.slice(5));
  }
  return out;
};

const isItemObject = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof Set) &&
  !(value instanceof Map) &&
  ("slug" in value || "name" in value || "key" in value || "items" in value);

const toKeySet = (value) => {
  if (!value) return new Set();
  const raws =
    value instanceof Map
      ? [...value.keys()]
      : Array.isArray(value) || value instanceof Set
        ? [...value]
        : isItemObject(value)
          ? [value]
          : typeof value === "object"
            ? Object.keys(value)
            : [value];
  return new Set(raws.flatMap(itemKeys));
};

/** Entry identity keys: slug + name + aliases, normalized. */
export const entryKeys = (indexedOrEntry) => {
  const entry = indexedOrEntry?.fields
    ? indexedOrEntry.entry
    : splitInput(indexedOrEntry).entry;
  return [entry.slug, entry.name, ...(entry.aliases ?? [])]
    .map((key) => normalizeText(key))
    .filter(Boolean);
};

const recencyScore = (rank) => {
  if (rank === 0) return BOOST_HISTORY_MAX;
  if (rank < 3) return 4;
  if (rank < 10) return 2;
  return 1;
};

const countScore = (count) =>
  Number.isFinite(count) && count > 0
    ? Math.min(BOOST_HISTORY_MAX, 2 + count)
    : 0;

/**
 * History signal. Accepts, newest-first when ordered: string arrays,
 * recentItems() [{slug, name}], getHistory() sessions ([{items}]),
 * topFrequent() records ([{key, count, ...}]), Maps (key → count),
 * or frequency-map objects ({name: {count}}). Per key, the best of
 * the recency score and the count score wins.
 */
const historyBoost = (keys, history) => {
  if (!history) return 0;
  const pairs = [];
  const push = (raw, count = null) => {
    for (const key of itemKeys(raw)) pairs.push({ key, count });
  };
  if (history instanceof Map) {
    for (const [raw, value] of history) {
      push(raw, typeof value === "number" ? value : value?.count ?? null);
    }
  } else if (Array.isArray(history) || history instanceof Set) {
    for (const raw of history) {
      if (raw && typeof raw === "object" && Array.isArray(raw.items)) {
        for (const item of raw.items) push(item);
      } else {
        push(raw, raw?.count ?? null);
      }
    }
  } else if (isItemObject(history)) {
    push(history);
  } else if (typeof history === "object") {
    for (const [raw, value] of Object.entries(history)) {
      push(raw, value?.count ?? null);
    }
  } else {
    push(history);
  }
  const seen = new Map();
  pairs.forEach(({ key, count }, index) => {
    if (!seen.has(key)) seen.set(key, { rank: index, count });
    else if (count !== null && count !== undefined) {
      const entry = seen.get(key);
      entry.count = Math.max(entry.count ?? 0, count);
    }
  });
  let best = 0;
  for (const key of keys) {
    const entry = seen.get(key);
    if (!entry) continue;
    best = Math.max(best, recencyScore(entry.rank), countScore(entry.count));
  }
  return best;
};

const computeBoosts = (index, context = {}) => {
  const keys = entryKeys(index);
  const favorite = keys.some((key) => toKeySet(context.favorites).has(key))
    ? BOOST_FAVORITE
    : 0;
  // Essentials are user-owned: the catalog `staple` flag is deliberately
  // ignored here. Only caller-provided user essentials (context.staples,
  // e.g. store.getEssentials()) boost ranking.
  const staple = keys.some((key) => toKeySet(context.staples).has(key))
    ? BOOST_STAPLE
    : 0;
  const history = historyBoost(keys, context.history);
  const onList = keys.some((key) => toKeySet(context.onList).has(key));
  return {
    favorite,
    staple,
    history,
    onList: onList ? -DEMOTE_ON_LIST : 0,
  };
};

/**
 * Explainable non-negative score: text base (CookiGram V1 weights) +
 * ranking boosts. Boosts never resurrect a non-match.
 */
export const scoreSearchMatch = (
  indexed,
  query = "",
  structuredTerms = [],
  context = {},
) => {
  const index = indexed?.fields ? indexed : indexSearchIngredient(indexed);
  const match = matchSearch(index, query, structuredTerms);
  const evidence = match.queryTokens.map((token) => scoreToken(token, index));
  const exactNamePhrase =
    match.matched &&
    match.queryTokens.length > 1 &&
    normalizeText(query) === index.fields.name.text;
  const baseScore = match.matched
    ? evidence.reduce((total, item) => total + item.score, 0) +
      (exactNamePhrase ? 100 : 0) +
      (evidence.length > 1 ? (evidence.length - 1) * 5 : 0)
    : 0;
  const boosts = match.matched
    ? computeBoosts(index, context)
    : { favorite: 0, staple: 0, history: 0, onList: 0 };
  const boostTotal = boosts.favorite + boosts.staple + boosts.history + boosts.onList;
  const queryText = normalizeText(query);
  const tiers = match.matched
    ? evidence
        .map((item) => evidenceTier(item, queryText, index.fields.name.text))
        .filter((tier) => tier !== null)
    : [];
  return {
    ...match,
    indexed: index,
    baseScore,
    boosts,
    boostTotal,
    onList: boosts.onList !== 0,
    score: Math.max(0, baseScore + boostTotal),
    tier: tiers.length ? Math.min(...tiers) : null,
    evidence,
  };
};

export const scoreIngredient = scoreSearchMatch;

export const compareSearchResults = (left, right) => {
  const a =
    left?.score === undefined ? scoreSearchMatch(left) : left;
  const b =
    right?.score === undefined ? scoreSearchMatch(right) : right;
  const aTier = a?.tier ?? RANK_TIER.TAG;
  const bTier = b?.tier ?? RANK_TIER.TAG;
  if (aTier !== bTier) return aTier - bTier;
  if (b.score !== a.score) return b.score - a.score;
  const aIndex = a.indexed ?? a.index ?? a;
  const bIndex = b.indexed ?? b.index ?? b;
  const nameOrder = normalizeText(aIndex.name ?? aIndex.title).localeCompare(
    normalizeText(bIndex.name ?? bIndex.title),
    "fr",
  );
  if (nameOrder) return nameOrder;
  return normalizeText(aIndex.slug).localeCompare(normalizeText(bIndex.slug), "fr");
};

export const sortSearchResults = (results = []) => [...results].sort(compareSearchResults);

/**
 * Rank entries for a query. Accepts a prebuilt index or raw entries
 * ({kind, entry} or bare). Options:
 *   structuredTerms | activeTags (strings or {label, type}),
 *   favorites (getFavorites() array, keys, or Set),
 *   staples (user essentials: getEssentials() array, slugs, or Set),
 *   history (recentItems()/getHistory()/topFrequent() output, Map, or array),
 *   onList (getItems() array, slugs/names, or Set),
 *   limit (default Infinity — callers slice).
 */
export const searchIngredients = (entriesOrIndex = [], query = "", options = {}) => {
  const list = Array.isArray(entriesOrIndex) ? entriesOrIndex : [];
  const index = list.length && list[0]?.fields ? list : buildIngredientIndex(list);
  const terms = options.structuredTerms ?? options.activeTags ?? [];
  const context = {
    favorites: options.favorites,
    staples: options.staples,
    history: options.history,
    onList: options.onList,
  };
  const results = index
    .map((indexed) => ({ indexed, ...scoreSearchMatch(indexed, query, terms, context) }))
    .filter((result) => result.matched);
  const sorted = sortSearchResults(results);
  const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : Infinity;
  return limit >= 0 ? sorted.slice(0, limit) : sorted;
};

/** Back-compat alias for the CookiGram name. */
export const searchCards = searchIngredients;

/* ------------------------------------------------------------------ */
/* Suggestions (items + tags + free-add)                               */
/* ------------------------------------------------------------------ */

/**
 * Free-add row for any non-blank query. Uses the RAW trimmed text for
 * display (never the normalized form) and never throws — normalization
 * output is informational only. Returns null only for blank input.
 */
export const freeAddSuggestion = (query) => {
  const label = String(query ?? "").trim().replace(/\s+/g, " ");
  if (!label) return null;
  return {
    kind: "free-add",
    type: "item",
    label,
    query: label,
    slug: null,
    normalized: normalizeText(label),
  };
};

const rankTag = (tag, fragment) => {
  if (!fragment) return -1;
  const value = normalizeText(tag);
  if (!value) return 3;
  if (value === fragment) return 0;
  if (value.startsWith(fragment)) return 1;
  if (value.includes(fragment)) return 2;
  return 3;
};

/** Stable DOM id suffix for a suggestion row. */
export const suggestionKey = (item) => {
  if (!item || typeof item !== "object") return "unknown";
  if (item.kind === "free-add") return "free-add";
  if (item.kind === "tag") return `tag-${normalizeText(item.tag ?? item.label) || "tag"}`;
  return String(item.slug ?? normalizeText(item.label) ?? "item") || "item";
};

/**
 * Mixed item + tag suggestions, max `maxItems` catalog rows (default 8),
 * ordered by relevance tier (RANK_TIER): exact name → word/prefix →
 * name-contains → alias → category → fuzzy → tags. Tag rows keep their
 * internal exact → prefix → substring FR order and stay capped at
 * MAX_TAG_ROWS while items match. A leading `#` flips tags first
 * (TAG_PRIORITY) while still listing item matches after. A free-add row
 * is appended whenever the query is non-blank and `includeFreeAdd` is
 * not false — always allowed, even on exact matches or zero matches.
 * Returns [] for blank queries without active tags.
 */
export const buildSuggestions = (entriesOrIndex = [], query = "", options = {}) => {
  const maxItems = Number.isFinite(Number(options.maxItems))
    ? Math.max(0, Number(options.maxItems))
    : MAX_SUGGESTIONS;
  const terms = normalizeTerms(options.structuredTerms ?? options.activeTags ?? []);
  const raw = String(query ?? "");
  const tagMode = raw.trimStart().startsWith("#");
  const effectiveQuery = tagMode ? raw.replace(/^[\s#]+/, "") : raw;
  const tokens = tokenize(effectiveQuery);
  if (!tokens.length && !terms.length) return [];

  const activeTagKeys = new Set(terms.map((term) => normalizeText(term.label)));
  const fragment = tokens.at(-1) ?? "";

  const vocabulary =
    options.tags ?? tagVocabulary(entriesOrIndex);
  const tagMatches = vocabulary
    .filter((tag) => {
      const key = normalizeText(tag);
      return key.length > 1 && !activeTagKeys.has(key);
    })
    .map((tag) => ({ tag, label: tag, rank: rankTag(tag, fragment) }))
    .filter((candidate) => fragment && candidate.rank < 3)
    .sort(
      (a, b) =>
        a.rank - b.rank || a.label.localeCompare(b.label, "fr"),
    )
    .map((candidate) => ({
      kind: "tag",
      type: "tag",
      label: candidate.label,
      tag: candidate.tag,
      rank: candidate.rank,
      tier: tagMode ? RANK_TIER.TAG_PRIORITY : RANK_TIER.TAG,
    }));

  const itemMatches =
    tokens.length || terms.length
      ? searchIngredients(entriesOrIndex, effectiveQuery, options).map((result) => ({
          kind: "item",
          type: "item",
          label: result.indexed.name,
          slug: result.indexed.slug,
          entryKind: result.indexed.kind,
          entry: result.indexed.entry,
          aisle: result.indexed.entry?.aisle ?? "",
          category: result.indexed.entry?.category ?? "",
          score: result.score,
          baseScore: result.baseScore,
          boosts: result.boosts,
          onList: result.onList,
          tier: result.tier ?? RANK_TIER.TAG,
        }))
      : [];

  const tagCap = itemMatches.length
    ? Math.min(MAX_TAG_ROWS, maxItems)
    : maxItems;
  // Stable tier sort: pre-sliced tag rows (rank order) and item rows
  // (tier/score/name order) keep their internal order within a tier.
  const catalogRows = [
    ...tagMatches.slice(0, tagCap),
    ...itemMatches.slice(0, Math.max(0, maxItems - Math.min(tagMatches.length, tagCap))),
  ].sort((a, b) => (a.tier ?? RANK_TIER.TAG) - (b.tier ?? RANK_TIER.TAG));
  if (options.includeFreeAdd === false) return catalogRows;
  const freeAdd = freeAddSuggestion(tagMode ? effectiveQuery : query);
  return freeAdd ? [...catalogRows, freeAdd] : catalogRows;
};

export const getSuggestions = buildSuggestions;
