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
 *   {slug: "farine", name: "Farine"}
 */

/** Decisions a ritual can record per candidate. */
export const STAPLE_RITUAL_DECISIONS = Object.freeze(["added", "rejected", "ignored"]);

const cleanCandidate = (candidate) => {
  if (!candidate) return null;
  const slug = String(candidate.slug ?? "").trim();
  if (!slug) return null;
  const name = String(candidate.name ?? slug).trim() || slug;
  return { slug, name };
};

/**
 * Start a ritual over `candidates` (deduped by slug, empties dropped).
 * Returns the ritual handle:
 *
 *   ritual.total        number of candidates
 *   ritual.candidates() all candidates (copies)
 *   ritual.pending()    candidates with no decision yet (copies)
 *   ritual.validate(slug) → candidate copy, or null when unknown/decided/done
 *   ritual.reject(slug)   → true, or false when unknown/decided/done
 *   ritual.ignoreRest()   → remaining candidates (copies); ends the ritual
 *   ritual.decisions()    → [{slug, name, decision}] incl. ignored
 *   ritual.isDone()       → true when nothing is pending anymore
 *
 * The caller turns `validate()` results into list items (via
 * `store.addItem`) and persists `decisions()` via
 * `store.noteStapleDecision()` at the end of the ritual.
 */
export const createRitual = (candidates = []) => {
  const list = [];
  const seen = new Set();
  for (const raw of candidates) {
    const candidate = cleanCandidate(raw);
    if (!candidate || seen.has(candidate.slug)) continue;
    seen.add(candidate.slug);
    list.push(candidate);
  }
  const decisions = new Map(); /* slug -> "added" | "rejected" */
  let restIgnored = false;

  const find = (slug) => list.find((candidate) => candidate.slug === String(slug));

  const pendingList = () => (restIgnored
    ? []
    : list.filter((candidate) => !decisions.has(candidate.slug)));

  return {
    total: list.length,
    candidates: () => list.map((candidate) => ({ ...candidate })),
    pending: () => pendingList().map((candidate) => ({ ...candidate })),
    validate: (slug) => {
      if (restIgnored) return null;
      const candidate = find(slug);
      if (!candidate || decisions.has(candidate.slug)) return null;
      decisions.set(candidate.slug, "added");
      return { ...candidate };
    },
    reject: (slug) => {
      if (restIgnored) return false;
      const candidate = find(slug);
      if (!candidate || decisions.has(candidate.slug)) return false;
      decisions.set(candidate.slug, "rejected");
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
 * never seeds this list. Drops slugless entries (only catalog-backed
 * products can be re-proposed), slugs already on the current list,
 * and slugs already decided in the current trip (`decidedSlugs`).
 *
 * Deliberately trip-scoped: no cooldown memory is consulted, so every
 * essential the user kept is proposed again on the next trip even when
 * it was ignored or rejected during the previous one. Ignoring a
 * proposal never removes the essential itself.
 *
 * `essentials` accepts the `store.getEssentials()` shape
 * ([{key, slug|null, name}]) or plain [{slug, name}]. Returns clean
 * [{slug, name}] copies.
 */
export const userEssentialCandidates = (
  essentials = [],
  { onListSlugs = [], decidedSlugs = [] } = {},
) => {
  const decided = new Set((decidedSlugs ?? []).map((slug) => String(slug)));
  const withSlug = (essentials ?? [])
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const slug = String(raw.slug ?? "").trim();
      if (!slug) return null;
      const name = String(raw.name ?? slug).trim() || slug;
      return { slug, name };
    })
    .filter(Boolean)
    .filter((candidate) => !decided.has(candidate.slug));
  return filterCandidates(withSlug, { onListSlugs, recentDecisions: {} });
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
    if (!candidate || seen.has(candidate.slug) || onList.has(candidate.slug)) continue;
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
