/* Shopping List v0 — Store (Lane G).
 * localStorage persistence for the current list, favorites, essentials,
 * history, prefs, and a frequency signal for ranking.
 * Vanilla ES module, no dependencies, no catalog imports: catalog concepts
 * only cross this boundary as plain {slug, name} data (see docs/store-api.md).
 *
 * Contract (cookigram-contract.md §9.2): getItems, addItem, toggleItem,
 * setQty, clearChecked and subscribe are kept verbatim; everything else is
 * an additive extension documented in docs/store-api.md.
 */

/** Versioned storage keys (same :v1 namespace habit as CookiGram). */
export const STORE_KEYS = Object.freeze({
  items: "shopping-list:items:v1",
  favorites: "shopping-list:favorites:v1",
  essentials: "shopping-list:essentials:v1",
  history: "shopping-list:history:v1",
  prefs: "shopping-list:prefs:v1",
  frequency: "shopping-list:frequency:v1",
});

/** Document CustomEvent name for all store mutations (contract §9.2). */
export const CHANGE_EVENT = "shopping-list:change";

/** Allowed `item.provenance.source` values. */
export const PROVENANCE_SOURCES = Object.freeze(["cookigram", "dict", "custom"]);

/** Default prefs (see `getPrefs` / `setPrefs`). */
export const DEFAULT_PREFS = Object.freeze({
  essentialsEnabled: true,
  lastRitualAt: null,
});

const MAX_FREQUENCY_KEYS = 300;

/* ------------------------------------------------------------------ */
/* Storage layer                                                       */
/* ------------------------------------------------------------------ */

const memFallback = new Map();
const memoryAdapter = {
  getItem: (key) => (memFallback.has(key) ? memFallback.get(key) : null),
  setItem: (key, value) => {
    memFallback.set(key, String(value));
  },
  removeItem: (key) => {
    memFallback.delete(key);
  },
};

let customStorage = null;

/* ------------------------------------------------------------------ */
/* Undo stack (issue #6): LIFO of ids that transitioned to checked.    */
/* Session-scoped (memory only, cleared on reload and on              */
/* configureStore). Not a general mutation history; no redo.           */
/* ------------------------------------------------------------------ */

const undoStack = [];

/**
 * Test-only injection (mirrors the `fetchImpl` pattern of catalog.js).
 * Pass `{storage: null}` (or nothing) to restore the default backend.
 */
export const configureStore = ({ storage } = {}) => {
  customStorage = storage ?? null;
  undoStack.length = 0;
};

const pruneUndo = (id) => {
  for (let i = undoStack.length - 1; i >= 0; i--) {
    if (undoStack[i] === id) undoStack.splice(i, 1);
  }
};

const recordCheckTransition = (id, wasChecked, isChecked) => {
  if (!id || wasChecked === isChecked) return;
  if (isChecked) {
    pruneUndo(id);
    undoStack.push(id);
  } else {
    pruneUndo(id);
  }
};

/** True when at least one checked item can be restored by undo. */
export const canUndoCheck = () => {
  for (let i = undoStack.length - 1; i >= 0; i--) {
    const item = getItem(undoStack[i]);
    if (item && item.checked) return true;
  }
  return false;
};

/**
 * Restore the most recently checked item (LIFO). Skips ids whose item
 * is gone or already unchecked. Returns the restored item, or null.
 */
export const undoLastCheck = () => {
  while (undoStack.length) {
    const id = undoStack.pop();
    const item = getItem(id);
    if (!item || !item.checked) continue;
    return setChecked(id, false);
  }
  return null;
};

const backend = () => {
  if (customStorage) return customStorage;
  try {
    if (typeof globalThis.localStorage !== "undefined") return globalThis.localStorage;
  } catch {
    /* Private mode / non-DOM runtime: fall through to memory. */
  }
  return null;
};

const storeOf = () => backend() ?? memoryAdapter;

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

/**
 * Shared persistence primitives. `history.js` (same lane) uses these for
 * its own key so all keys stay centralized in `STORE_KEYS`.
 */
export const readStoreKey = (key, fallback) => {
  let raw = null;
  try {
    raw = storeOf().getItem(key);
  } catch {
    return cloneJson(fallback);
  }
  if (raw === null || raw === undefined) return cloneJson(fallback);
  try {
    return JSON.parse(raw);
  } catch {
    return cloneJson(fallback); /* Corrupt payload: reset to default. */
  }
};

export const writeStoreKey = (key, value) => {
  const raw = JSON.stringify(value);
  try {
    storeOf().setItem(key, raw);
  } catch {
    /* Quota / private mode: keep the session working in memory. */
    try {
      memoryAdapter.setItem(key, raw);
    } catch {
      /* Best effort; never break the UI on persistence failures. */
    }
  }
};

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

/** Emit a store change event (document-guarded for non-DOM runtimes). */
export const emitStoreChange = (type, detail = {}) => {
  if (typeof document === "undefined" || typeof CustomEvent === "undefined") return;
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { type, ...detail } }));
};

let crossTabInstalled = false;

/* Cross-tab reactivity, mirroring CookiGram selection-app.js: storage
 * events fire only in *other* tabs, so re-emit them locally. */
const installCrossTab = () => {
  if (crossTabInstalled || typeof window === "undefined") return;
  crossTabInstalled = true;
  const known = new Set(Object.values(STORE_KEYS));
  window.addEventListener("storage", (event) => {
    if (event.key !== null && !known.has(event.key)) return;
    emitStoreChange("external", event.key ? { key: event.key } : {});
  });
};

/**
 * Subscribe to `CHANGE_EVENT`. Listener receives the CustomEvent whose
 * `detail` is `{type, id?}` (contract §9.2). Returns an unsubscribe fn.
 */
export const subscribe = (listener) => {
  if (typeof document === "undefined") return () => {};
  installCrossTab();
  document.addEventListener(CHANGE_EVENT, listener);
  return () => document.removeEventListener(CHANGE_EVENT, listener);
};

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * FR-safe normalization. Same semantics as catalog.js `normalizeKey`,
 * duplicated on purpose so the store stays decoupled from catalog.js.
 */
export const normalizeName = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeQty = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

/** Collision-resistant id without dependencies. */
export const createId = () => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* Fall through to the Math.random fallback. */
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
};

/* ------------------------------------------------------------------ */
/* Current list                                                        */
/*                                                     item = {id, slug|null, name, qty, checked, addedAt, provenance} */
/* ------------------------------------------------------------------ */

const readItems = () => {
  const raw = readStoreKey(STORE_KEYS.items, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item.name === "string");
};

const cloneItem = (item) => ({
  ...item,
  provenance: { ...(item.provenance ?? { source: "custom" }) },
});

const normalizeProvenance = (provenance, slug) => {
  const source = provenance?.source ?? (slug ? "cookigram" : "custom");
  if (!PROVENANCE_SOURCES.includes(source)) {
    throw new Error(`store: unknown provenance source ${JSON.stringify(source)}`);
  }
  return { source };
};

/** All current-list items, in insertion order (copies; mutate via setters). */
export const getItems = () => readItems().map(cloneItem);

/** One item by id, or null. */
export const getItem = (id) => {
  const found = readItems().find((item) => item.id === id);
  return found ? cloneItem(found) : null;
};

/**
 * Add an item. Merges (no duplicate) on identical normalized name + qty
 * (contract §9.2); a checked match is re-activated. Records a frequency
 * signal on every call. Throws when `name` is blank.
 */
export const addItem = ({ name, qty = "", slug = null, provenance } = {}) => {
  const cleanName = String(name ?? "").trim();
  if (!cleanName) throw new Error("store.addItem: name is required");
  const cleanQty = normalizeQty(qty);
  const cleanSlug = slug ? String(slug) : null;
  const items = readItems();
  const existing = items.find(
    (item) => normalizeName(item.name) === normalizeName(cleanName)
      && normalizeQty(item.qty) === cleanQty,
  );
  bumpFrequency(cleanName, existing?.slug ?? cleanSlug);
  if (existing) {
    if (existing.checked) {
      existing.checked = false;
      writeStoreKey(STORE_KEYS.items, items);
      recordCheckTransition(existing.id, true, false);
    }
    emitStoreChange("items:add", { id: existing.id, merged: true });
    return cloneItem(existing);
  }
  const item = {
    id: createId(),
    slug: cleanSlug,
    name: cleanName,
    qty: cleanQty,
    checked: false,
    addedAt: Date.now(),
    provenance: normalizeProvenance(provenance, cleanSlug),
  };
  items.push(item);
  writeStoreKey(STORE_KEYS.items, items);
  emitStoreChange("items:add", { id: item.id });
  return cloneItem(item);
};

/** Flip `checked`. Returns the updated item, or null when unknown. */
export const toggleItem = (id) => {
  const items = readItems();
  const found = items.find((item) => item.id === id);
  if (!found) return null;
  const wasChecked = found.checked;
  found.checked = !found.checked;
  writeStoreKey(STORE_KEYS.items, items);
  recordCheckTransition(id, wasChecked, found.checked);
  emitStoreChange("items:toggle", { id });
  return cloneItem(found);
};

/** Set `checked` explicitly. Returns the updated item, or null. */
export const setChecked = (id, checked) => {
  const items = readItems();
  const found = items.find((item) => item.id === id);
  if (!found) return null;
  const wasChecked = found.checked;
  found.checked = Boolean(checked);
  writeStoreKey(STORE_KEYS.items, items);
  recordCheckTransition(id, wasChecked, found.checked);
  emitStoreChange("items:toggle", { id });
  return cloneItem(found);
};

/** Replace the quantity string. Returns the updated item, or null. */
export const setQty = (id, qty) => {
  const items = readItems();
  const found = items.find((item) => item.id === id);
  if (!found) return null;
  found.qty = normalizeQty(qty);
  writeStoreKey(STORE_KEYS.items, items);
  emitStoreChange("items:qty", { id });
  return cloneItem(found);
};

/** Delete one item. Returns true when something was removed. */
export const removeItem = (id) => {
  const items = readItems();
  const kept = items.filter((item) => item.id !== id);
  if (kept.length === items.length) return false;
  writeStoreKey(STORE_KEYS.items, kept);
  pruneUndo(id);
  emitStoreChange("items:remove", { id });
  return true;
};

/** Delete all checked items. Returns the removed items (for history). */
export const clearChecked = () => {
  const items = readItems();
  const removed = items.filter((item) => item.checked);
  if (removed.length === 0) return [];
  writeStoreKey(STORE_KEYS.items, items.filter((item) => !item.checked));
  for (const item of removed) pruneUndo(item.id);
  emitStoreChange("items:clear-checked", { count: removed.length });
  return removed.map(cloneItem);
};

/** Delete every item. Returns the number removed. */
export const clearAll = () => {
  const count = readItems().length;
  writeStoreKey(STORE_KEYS.items, []);
  emitStoreChange("items:clear", { count });
  return count;
};

/* ------------------------------------------------------------------ */
/* Frequency signal                                                    */
/*                                                     {normName: {name, slug, count, lastUsedAt}} */
/* ------------------------------------------------------------------ */

const readFrequency = () => {
  const raw = readStoreKey(STORE_KEYS.frequency, {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
};

const bumpFrequency = (name, slug) => {
  const key = normalizeName(name);
  if (!key) return;
  const freq = readFrequency();
  const prev = freq[key];
  freq[key] = {
    name: prev?.name ?? String(name).trim(),
    slug: slug ?? prev?.slug ?? null,
    count: (prev?.count ?? 0) + 1,
    lastUsedAt: Date.now(),
  };
  const keys = Object.keys(freq);
  if (keys.length > MAX_FREQUENCY_KEYS) {
    keys
      .sort((a, b) => (freq[a].lastUsedAt ?? 0) - (freq[b].lastUsedAt ?? 0))
      .slice(0, keys.length - MAX_FREQUENCY_KEYS)
      .forEach((oldest) => {
        delete freq[oldest];
      });
  }
  writeStoreKey(STORE_KEYS.frequency, freq);
};

/** Frequency record for a name (normalized lookup), or null. */
export const getFrequency = (name) => {
  const record = readFrequency()[normalizeName(name)];
  return record ? { ...record } : null;
};

/**
 * Top `limit` frequent records, count desc then recency desc.
 * `exclude` holds slugs to skip (e.g. already on the list).
 */
export const topFrequent = (limit = 8, { exclude = [] } = {}) => {
  const excluded = new Set(exclude.map((slug) => String(slug)));
  return Object.entries(readFrequency())
    .filter(([, record]) => !(record.slug && excluded.has(record.slug)))
    .sort(
      (a, b) => b[1].count - a[1].count || (b[1].lastUsedAt ?? 0) - (a[1].lastUsedAt ?? 0),
    )
    .slice(0, Math.max(0, limit))
    .map(([key, record]) => ({ key, ...record }));
};

/* ------------------------------------------------------------------ */
/* Favorites                                                           */
/*                                                     [{key, slug|null, name, addedAt}] */
/* ------------------------------------------------------------------ */

/** Stable favorite key: the slug, else `name:<normalized>`. */
export const favoriteKey = ({ slug = null, name = "" } = {}) =>
  (slug ? String(slug) : `name:${normalizeName(name)}`);

const readFavorites = () => {
  const raw = readStoreKey(STORE_KEYS.favorites, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((fav) => fav && typeof fav.key === "string");
};

/** All favorites, in the order they were added (copies). */
export const getFavorites = () => readFavorites().map((fav) => ({ ...fav }));

/** True when `{slug?, name}` is a favorite. */
export const isFavorite = (ref) => readFavorites().some((fav) => fav.key === favoriteKey(ref));

/**
 * Toggle a favorite. Returns `{favorite, key}` with the state *after*
 * the toggle. Throws when both `slug` and `name` are blank.
 */
export const toggleFavorite = ({ slug = null, name = "" } = {}) => {
  const cleanName = String(name ?? "").trim();
  if (!cleanName && !slug) throw new Error("store.toggleFavorite: name or slug is required");
  const key = favoriteKey({ slug, name: cleanName });
  const favs = readFavorites();
  const index = favs.findIndex((fav) => fav.key === key);
  let favorite;
  if (index === -1) {
    favs.push({
      key,
      slug: slug ? String(slug) : null,
      name: cleanName || String(slug),
      addedAt: Date.now(),
    });
    favorite = true;
  } else {
    favs.splice(index, 1);
    favorite = false;
  }
  writeStoreKey(STORE_KEYS.favorites, favs);
  emitStoreChange("favorites:toggle", { key, favorite });
  return { favorite, key };
};

/** Delete all favorites. Returns the number removed. */
export const clearFavorites = () => {
  const count = readFavorites().length;
  writeStoreKey(STORE_KEYS.favorites, []);
  emitStoreChange("favorites:clear", { count });
  return count;
};

/* ------------------------------------------------------------------ */
/* Essentials (user-owned; proposed on each new trip)                    */
/*                                                     [{key, slug|null, name, addedAt}] */
/* ------------------------------------------------------------------ */

/**
 * User-owned essentials, independent from favorites. A favorite is a
 * product the user buys often and wants to find easily; an essential
 * is a product the user wants proposed on every new trip. The catalog
 * never seeds this list: a fresh install starts with zero essentials.
 * Shape and keying mirror favorites on purpose (see `toKeySet` in
 * search.js, which accepts both shapes for ranking context).
 */

/** Stable essential key: the slug, else `name:<normalized>`. */
export const essentialKey = ({ slug = null, name = "" } = {}) =>
  (slug ? String(slug) : `name:${normalizeName(name)}`);

const readEssentials = () => {
  const raw = readStoreKey(STORE_KEYS.essentials, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((ess) => ess && typeof ess.key === "string");
};

/** All essentials, in the order they were added (copies). */
export const getEssentials = () => readEssentials().map((ess) => ({ ...ess }));

/** True when `{slug?, name}` is an essential. */
export const isEssential = (ref) => readEssentials().some((ess) => ess.key === essentialKey(ref));

/**
 * Toggle an essential. Returns `{essential, key}` with the state *after*
 * the toggle. Throws when both `slug` and `name` are blank.
 */
export const toggleEssential = ({ slug = null, name = "" } = {}) => {
  const cleanName = String(name ?? "").trim();
  if (!cleanName && !slug) throw new Error("store.toggleEssential: name or slug is required");
  const key = essentialKey({ slug, name: cleanName });
  const list = readEssentials();
  const index = list.findIndex((ess) => ess.key === key);
  let essential;
  if (index === -1) {
    list.push({
      key,
      slug: slug ? String(slug) : null,
      name: cleanName || String(slug),
      addedAt: Date.now(),
    });
    essential = true;
  } else {
    list.splice(index, 1);
    essential = false;
  }
  writeStoreKey(STORE_KEYS.essentials, list);
  emitStoreChange("essentials:toggle", { key, essential });
  return { essential, key };
};

/** Delete all essentials. Returns the number removed. */
export const clearEssentials = () => {
  const count = readEssentials().length;
  writeStoreKey(STORE_KEYS.essentials, []);
  emitStoreChange("essentials:clear", { count });
  return count;
};

/* Historical note: `shopping-list:staples:v1` (legacy per-slug ritual
 * decisions) may still exist physically in user storage. It is no
 * longer read or written; no destructive migration is performed. */

/* ------------------------------------------------------------------ */
/* Prefs                                                               */
/* ------------------------------------------------------------------ */

/** Merged prefs: stored values over `DEFAULT_PREFS` (extra keys kept). */
export const getPrefs = () => {
  const raw = readStoreKey(STORE_KEYS.prefs, {});
  const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return { ...cloneJson(DEFAULT_PREFS), ...stored };
};

/** Merge `patch` into prefs. Returns the merged prefs. */
export const setPrefs = (patch = {}) => {
  const merged = { ...getPrefs(), ...patch };
  writeStoreKey(STORE_KEYS.prefs, merged);
  emitStoreChange("prefs:change", {});
  return { ...merged };
};

/** Reset prefs to `DEFAULT_PREFS`. */
export const resetPrefs = () => {
  writeStoreKey(STORE_KEYS.prefs, cloneJson(DEFAULT_PREFS));
  emitStoreChange("prefs:change", {});
  return { ...cloneJson(DEFAULT_PREFS) };
};
