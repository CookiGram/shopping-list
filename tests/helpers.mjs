/* Shopping List v0 — Lane H test helpers (Node only, no deps).
 * Shared in-memory storage + minimal catalog fixtures for unit tests.
 * Not a test file itself (no .test. suffix).
 */

export const makeMemoryStorage = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    _map: map,
  };
};

export const fixtureSnapshot = () => ({
  meta: {
    schema: 1,
    source: {
      repo: "https://github.com/CookiGram/cookigram",
      ref: "f".repeat(40),
      fetched_at: "2026-10-02T00:00:00Z",
      commit_date: "2026-09-26 11:43:31 +0200",
      files: {},
    },
  },
  aisles: ["Fruits & légumes", "Épicerie", "À vérifier"],
  ingredients: [
    {
      slug: "ail",
      name: "Ail",
      aliases: ["ail", "gousse d'ail"],
      category: "Légumes et aromates",
      aisle: "Fruits & légumes",
      staple: false,
      icon: "ail.svg",
      units: { piece_weight_g: 5.0, density: null, conversions: { gousse: 5.0 } },
      provenance: { source: "ciqual", status: "verified" },
    },
    {
      slug: "farine",
      name: "Farine",
      aliases: ["farine"],
      category: "Épicerie salée",
      aisle: "Épicerie",
      staple: true,
      icon: "",
      units: { piece_weight_g: null, density: null, conversions: {} },
      provenance: { source: "generic", status: "incomplete" },
    },
    {
      slug: "lait",
      name: "Lait",
      aliases: ["lait"],
      category: "Produits laitiers",
      aisle: "Crèmerie & œufs",
      staple: true,
      icon: "",
      units: { piece_weight_g: null, density: null, conversions: {} },
      provenance: { source: "generic", status: "verified" },
    },
  ],
  bySlug: { ail: 0, farine: 1, lait: 2 },
});

export const fixtureDict = () => ({
  meta: { schema: 1, note: "test fixture" },
  aisles: ["Maison & entretien"],
  entries: [
    {
      slug: "lessive",
      name: "Lessive",
      aliases: ["lessive liquide"],
      category: "Linge",
      aisle: "Maison & entretien",
      tags: ["linge"],
      icon: "",
    },
    {
      slug: "eponge",
      name: "Éponge",
      aliases: ["eponge"],
      category: "Vaisselle",
      aisle: "Maison & entretien",
      tags: ["vaisselle", "cuisine"],
      icon: "",
    },
  ],
  bySlug: { lessive: 0, eponge: 1 },
});

export const fixtureAisleMap = () => ({
  meta: { schema: 1 },
  culinaryOrder: ["Fruits & légumes", "Épicerie", "À vérifier"],
  fallback: "À vérifier",
  fromCookiGram: { "légumes et aromates": "Fruits & légumes" },
  extensions: {
    "épicerie salée": "Épicerie",
    "produits laitiers": "Crèmerie & œufs",
  },
  slugOverrides: {},
});

/** fetchImpl stub for loadCatalog({fetchImpl}) keyed by filename. */
export const fixtureFetch = (overrides = {}) => {
  const files = {
    "cookigram-catalog.json": fixtureSnapshot(),
    "shopping-dict.json": fixtureDict(),
    "aisles.json": fixtureAisleMap(),
    ...overrides,
  };
  return async (url) => {
    const name = String(url).split("/").pop().split("?")[0];
    if (!(name in files) || files[name] instanceof Error) {
      const err = files[name] instanceof Error ? files[name] : new Error(`missing ${name}`);
      throw err;
    }
    const payload = files[name];
    if (payload && payload.__httpError) {
      return { ok: false, status: payload.__httpError, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => payload };
  };
};

/** Minimal search entries (culinary + household) for ranking tests. */
export const searchEntries = () => [
  {
    kind: "culinary",
    entry: {
      slug: "ail",
      name: "Ail",
      aliases: ["ail", "gousse d'ail"],
      category: "Légumes et aromates",
      aisle: "Fruits & légumes",
      staple: false,
    },
  },
  {
    kind: "culinary",
    entry: {
      slug: "ail-en-poudre",
      name: "Ail en poudre",
      aliases: ["ail en poudre"],
      category: "Condiments",
      aisle: "Condiments & épices",
      staple: false,
    },
  },
  {
    kind: "culinary",
    entry: {
      slug: "farine",
      name: "Farine",
      aliases: ["farine"],
      category: "Épicerie salée",
      aisle: "Épicerie",
      staple: true,
    },
  },
  {
    kind: "household",
    entry: {
      slug: "lessive",
      name: "Lessive",
      aliases: ["lessive liquide"],
      category: "Linge",
      aisle: "Maison & entretien",
      tags: ["linge"],
    },
  },
  {
    kind: "household",
    entry: {
      slug: "eponge",
      name: "Éponge",
      aliases: ["eponge"],
      category: "Vaisselle",
      aisle: "Maison & entretien",
      tags: ["vaisselle", "cuisine"],
    },
  },
];
