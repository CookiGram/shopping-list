/* Shopping List v0 — History (Lane G).
 * Close-the-session snapshots of the shopping list ("Récents").
 * Persists through store.js primitives so all storage keys stay
 * centralized in `STORE_KEYS`; emits on the shared `CHANGE_EVENT` bus.
 *
 * Session entry shape:
 *   {id, closedAt, items: [{slug|null, name, qty}], count}
 */

import {
  STORE_KEYS,
  createId,
  emitStoreChange,
  normalizeName,
  readStoreKey,
  writeStoreKey,
} from "./store.js";

/** Max sessions kept (oldest dropped) and max items snapshotted per session. */
export const MAX_SESSIONS = 20;
export const MAX_ITEMS_PER_SESSION = 200;

const readSessions = () => {
  const raw = readStoreKey(STORE_KEYS.history, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry) => entry && Array.isArray(entry.items));
};

const cloneEntry = (entry) => ({
  ...entry,
  items: entry.items.map((item) => ({ ...item })),
});

/** All sessions, newest first (copies). */
export const getHistory = () => readSessions().slice().reverse().map(cloneEntry);

/** One session by id, or null. */
export const getHistoryEntry = (id) => {
  const found = readSessions().find((entry) => entry.id === id);
  return found ? cloneEntry(found) : null;
};

/**
 * Snapshot `items` (current-list shape, or any [{slug?, name, qty?}])
 * as a new closed session. Returns the entry, or null when there is
 * nothing meaningful to record (no names).
 */
export const closeSession = (items = [], { closedAt = Date.now() } = {}) => {
  const snapshot = (Array.isArray(items) ? items : [])
    .filter((item) => item && String(item.name ?? "").trim())
    .slice(0, MAX_ITEMS_PER_SESSION)
    .map((item) => ({
      slug: item.slug ? String(item.slug) : null,
      name: String(item.name).trim(),
      qty: String(item.qty ?? ""),
    }));
  if (snapshot.length === 0) return null;
  const entry = {
    id: createId(),
    closedAt,
    items: snapshot,
    count: snapshot.length,
  };
  const sessions = readSessions();
  sessions.push(entry);
  writeStoreKey(STORE_KEYS.history, sessions.slice(-MAX_SESSIONS));
  emitStoreChange("history:close", { id: entry.id, count: entry.count });
  return cloneEntry(entry);
};

/** Delete all sessions. Returns the number removed. */
export const clearHistory = () => {
  const count = readSessions().length;
  writeStoreKey(STORE_KEYS.history, []);
  emitStoreChange("history:clear", { count });
  return count;
};

/**
 * Deduped recent items across sessions, newest first: [{slug, name}].
 * Feeds the "Récents" quick re-add UI (re-add via `store.addItem`,
 * which also refreshes the frequency signal).
 */
export const recentItems = (limit = 20) => {
  if (!(limit > 0)) return [];
  const seen = new Set();
  const out = [];
  for (const session of getHistory()) {
    for (const item of session.items) {
      const key = item.slug ? `slug:${item.slug}` : `name:${normalizeName(item.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ slug: item.slug, name: item.name });
      if (out.length >= Math.max(0, limit)) return out;
    }
  }
  return out;
};
