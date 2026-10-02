/* Shopping List v0 — Staples ritual (Lane G).
 * Ephemeral "Essentials to check" ritual: the app proposes pantry staples
 * (resolved by the app lane from catalog `staple: true` flags) and the user
 * validates / rejects each one, or ignores the rest.
 *
 * Pure module: no imports, no storage, no DOM. This ritual is NEVER a
 * second permanent list — state lives in memory only, and the caller
 * persists just the per-slug decisions via
 * `store.noteStapleDecision()` when it wants a memory across sessions.
 *
 * Candidate shape (plain data, decoupled from catalog internals):
 *   {key: "farine", slug: "farine", name: "Farine"}
 * `key` is the stable identity: the slug for catalog products, or
 * `name:<normalized>` for custom (slugless) products — the same rule
 * as `store.essentialKey()`, which stays the source of truth.
 */

/** Decisions a ritual can record per candidate. */
export const STAPLE_RITUAL_DECISIONS = Object.freeze(["added", "rejected", "ignored"]);

/* Same normalization as store.normalizeName, duplicated on purpose so
 * this pure module keeps zero imports (see store.js header precedent). */
const normalizeCandidateName = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const cleanCandidate = (candidate) => {
  if (!candidate) return null;
  const slug = String(candidate.slug ?? "").trim() || null;
  const name = String(candidate.name ?? slug ?? "").trim() || slug;
  const key = String(candidate.key ?? slug ?? (name ? `name:${normalizeCandidateName(name)}` : "")).trim();
  if (!key || !name) return null;
  return { key, slug, name };
};

/**
 * Start a ritual over `candidates` (deduped by stable key, empties dropped).
 * Returns the ritual handle:
 *
 *   ritual.total        number of candidates
 *   ritual.candidates() all candidates (copies)
 *   ritual.pending()    candidates with no decision yet (copies)
 *   ritual.validate(key) → candidate copy, or null when unknown/decided/done
 *   ritual.reject(key)   → true, or false when unknown/decided/done
 *   ritual.ignoreRest()  → remaining candidates (copies); ends the ritual
 *   ritual.decisions()   → [{key, slug, name, decision}] incl. ignored
 *   ritual.isDone()      → true when nothing is pending anymore
 *
 * Identity is the stable candidate `key` (slug for catalog products,
 * `name:<normalized>` for custom ones), never the slug alone: custom
 * essentials take part in the ritual like catalog ones. The caller
 * turns `validate()` results into list items (via `store.addItem`).
 */
export const createRitual = (candidates = []) => {
  const list = [];
  const seen = new Set();
  for (const raw of candidates) {
    const candidate = cleanCandidate(raw);
    if (!candidate || seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    list.push(candidate);
  }
  const decisions = new Map(); /* key -> "added" | "rejected" */
  let restIgnored = false;

  const find = (key) => list.find((candidate) => candidate.key === String(key));

  const pendingList = () => (restIgnored
    ? []
    : list.filter((candidate) => !decisions.has(candidate.key)));

  return {
    total: list.length,
    candidates: () => list.map((candidate) => ({ ...candidate })),
    pending: () => pendingList().map((candidate) => ({ ...candidate })),
    validate: (key) => {
      if (restIgnored) return null;
      const candidate = find(key);
      if (!candidate || decisions.has(candidate.key)) return null;
      decisions.set(candidate.key, "added");
      return { ...candidate };
    },
    reject: (key) => {
      if (restIgnored) return false;
      const candidate = find(key);
      if (!candidate || decisions.has(candidate.key)) return false;
      decisions.set(candidate.key, "rejected");
      return true;
    },
    ignoreRest: () => {
      const rest = pendingList().map((candidate) => ({ ...candidate }));
      restIgnored = true;
      return rest;
    },
    decisions: () => list
      .map((candidate) => ({
        ...candidate,
        decision: decisions.get(candidate.slug) ?? (restIgnored ? "ignored" : null),
      }))
      .filter((entry) => entry.decision !== null),
    isDone: () => restIgnored || list.every((candidate) => decisions.has(candidate.slug)),
  };
};

/**
 * Build ritual candidates from USER-OWNED essentials (pure). Only
 * essentials the user explicitly marked are proposed; the catalog
 * never seeds this list. Catalog and custom (slugless) essentials are
 * both proposed, matched by stable key. Drops entries already on the
 * current list (`onListKeys`) and entries already decided in the
 * current trip (`decidedKeys`).
 *
 * Deliberately trip-scoped: no cooldown memory is consulted, so every
 * essential the user kept is proposed again on the next trip even when
 * it was ignored or rejected during the previous one. Ignoring a
 * proposal never removes the essential itself.
 *
 * `essentials` accepts the `store.getEssentials()` shape
 * ([{key, slug|null, name}]) or plain [{slug?, name}]. Returns clean
 * [{key, slug|null, name}] copies.
 */
export const userEssentialCandidates = (
  essentials = [],
  { onListKeys = [], decidedKeys = [] } = {},
) => {
  const onList = new Set((onListKeys ?? []).map((key) => String(key)));
  const decided = new Set((decidedKeys ?? []).map((key) => String(key)));
  const seen = new Set();
  const out = [];
  for (const raw of essentials ?? []) {
    const candidate = cleanCandidate(raw);
    if (!candidate || seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    if (onList.has(candidate.key) || decided.has(candidate.key)) continue;
    out.push(candidate);
  }
  return out;
};

/**
 * Pre-filter ritual candidates (pure):
 * - drop slugs already on the current list (`onListSlugs`),
 * - drop slugs rejected within `cooldownMs` (`recentDecisions` has the
 *   `store.getStapleDecisions()` shape `{slug: {decision, at}}`),
 * - drop empties / duplicates.
 *
 * `now` is injectable for tests. Returns clean [{slug, name}] copies.
 */
export const filterCandidates = (
  candidates = [],
  { onListSlugs = [], recentDecisions = {}, cooldownMs = 7 * 24 * 3600 * 1000, now = Date.now() } = {},
) => {
  const onList = new Set(onListSlugs.map((slug) => String(slug)));
  const out = [];
  const seen = new Set();
  for (const raw of candidates) {
    const candidate = cleanCandidate(raw);
    // Legacy path: slug-required (slugless entries are dropped, as before).
    if (!candidate || !candidate.slug) continue;
    if (seen.has(candidate.slug) || onList.has(candidate.slug)) continue;
    const record = recentDecisions[candidate.slug];
    if (
      record
      && record.decision === "rejected"
      && typeof record.at === "number"
      && now - record.at < cooldownMs
    ) {
      continue;
    }
    seen.add(candidate.slug);
    out.push(candidate);
  }
  return out;
};
