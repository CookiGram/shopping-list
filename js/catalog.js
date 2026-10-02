/* Shopping List v0 — Catalog API (Lane C, frozen for Lane E).
 * Read-only access over three static snapshots in ../data/:
 *   cookigram-catalog.json (culinary, synced from CookiGram),
 *   shopping-dict.json     (non-culinary, Lane-C authored),
 *   aisles.json            (default category→aisle mapping).
 * No runtime reads of CookiGram files. See docs/catalog-api.md.
 */

/** CookiGram normalizeText port: NFD strip → lowercase → collapse spaces. */
export const normalizeKey = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const DATA_FILES = {
  snapshot: "cookigram-catalog.json",
  dict: "shopping-dict.json",
  aisleMap: "aisles.json",
};

const defaultBaseUrl = () => new URL("../data/", import.meta.url);

const buildAliasMap = (entries) => {
  const map = new Map();
  entries.forEach((entry, index) => {
    for (const key of [entry.slug, entry.name, ...(entry.aliases ?? [])]) {
      const normalized = normalizeKey(key);
      if (normalized && !map.has(normalized)) map.set(normalized, index);
    }
  });
  return map;
};

const assemble = (snapshot, dict, aisleMap) => {
  const order = [
    ...snapshot.aisles.filter((a) => a !== aisleMap.fallback),
    ...dict.aisles,
    aisleMap.fallback,
  ];
  return {
    snapshot,
    dict,
    aisleMap,
    order,
    aliasCulinary: buildAliasMap(snapshot.ingredients),
    aliasHousehold: buildAliasMap(dict.entries),
  };
};

let cached = null;

/**
 * Load and cache the merged catalog.
 * @param {{fetchImpl?: typeof fetch, baseUrl?: string|URL}} [options]
 */
export const loadCatalog = async (options = {}) => {
  if (cached) return cached;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const base = options.baseUrl ?? defaultBaseUrl();
  const get = async (file) => {
    const res = await fetchImpl(new URL(file, base));
    if (!res.ok) throw new Error(`catalog: ${file} → HTTP ${res.status}`);
    return res.json();
  };
  const [snapshot, dict, aisleMap] = await Promise.all([
    get(DATA_FILES.snapshot),
    get(DATA_FILES.dict),
    get(DATA_FILES.aisleMap),
  ]);
  cached = assemble(snapshot, dict, aisleMap);
  return cached;
};

/** Test-only escape hatch; production code never calls this. */
export const clearCatalogCache = () => {
  cached = null;
};

/** Culinary entry by slug or alias (normalized), or undefined. */
export const getIngredient = (catalog, key) => {
  const index = catalog.aliasCulinary.get(normalizeKey(key));
  return index === undefined ? undefined : catalog.snapshot.ingredients[index];
};

/** Household (non-culinary) entry by slug or alias, or undefined. */
export const getDictEntry = (catalog, key) => {
  const index = catalog.aliasHousehold.get(normalizeKey(key));
  return index === undefined ? undefined : catalog.dict.entries[index];
};

/**
 * Unified lookup: culinary first, then household.
 * @returns {{kind: "culinary"|"household", entry: object}|undefined}
 */
export const findEntry = (catalog, key) => {
  const culinary = getIngredient(catalog, key);
  if (culinary) return { kind: "culinary", entry: culinary };
  const household = getDictEntry(catalog, key);
  if (household) return { kind: "household", entry: household };
  return undefined;
};

/** Flat [{kind, entry}] view for search indexing. */
export const allEntries = (catalog) => [
  ...catalog.snapshot.ingredients.map((entry) => ({ kind: "culinary", entry })),
  ...catalog.dict.entries.map((entry) => ({ kind: "household", entry })),
];

/** Full display aisle order: culinary, then household, fallback last. */
export const catalogAisleOrder = (catalog) => [...catalog.order];

/** Sort rank of an aisle; unknown aisles sort last. */
export const aisleRank = (catalog, aisle) => {
  const rank = catalog.order.indexOf(aisle);
  return rank === -1 ? catalog.order.length : rank;
};

/** Snapshot version for the settings/about row. */
export const catalogVersion = (catalog) => ({
  ref: catalog.snapshot.meta.source.ref,
  fetched_at: catalog.snapshot.meta.source.fetched_at,
  commit_date: catalog.snapshot.meta.source.commit_date ?? null,
});

/** Provenance blocks, opaque passthrough. */
export const catalogSources = (catalog) => ({
  cookigram: catalog.snapshot.meta.source,
  dict: catalog.dict.meta,
});

/** Sorted unique raw categories per source. */
export const catalogCategories = (catalog) => {
  const collect = (entries) =>
    [...new Set(entries.map((e) => e.category).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "fr"),
    );
  return {
    culinary: collect(catalog.snapshot.ingredients),
    household: collect(catalog.dict.entries),
  };
};

/** Sorted unique tags (household entries only in v0). */
export const catalogTags = (catalog) =>
  [...new Set(catalog.dict.entries.flatMap((e) => e.tags ?? []))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

/** Household entries carrying a tag (exact match). */
export const entriesByTag = (catalog, tag) =>
  catalog.dict.entries.filter((e) => (e.tags ?? []).includes(tag));

/**
 * Default display aisle for a raw category string.
 * Culinary map (exact, then casefolded) → household category scan → fallback.
 */
export const defaultAisleForCategory = (catalog, category) => {
  const { aisleMap, dict } = catalog;
  const merged = { ...aisleMap.fromCookiGram, ...aisleMap.extensions };
  const raw = String(category ?? "");
  if (Object.hasOwn(merged, raw)) return merged[raw];
  const folded = raw.toLowerCase();
  if (Object.hasOwn(merged, folded)) return merged[folded];
  const household = dict.entries.find((e) => e.category === raw);
  if (household) return household.aisle;
  const householdFolded = dict.entries.find(
    (e) => e.category.toLowerCase() === folded,
  );
  if (householdFolded) return householdFolded.aisle;
  return aisleMap.fallback;
};
