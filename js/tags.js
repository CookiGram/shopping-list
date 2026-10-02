/* Shopping List v0 — active tag filters (Lane E).
 * Single owner of the active-tag set. Both activation paths — tapping a
 * tag suggestion and tapping a tag on a list row — call the same
 * activateTag() implementation, so both produce identical state.
 *
 * State reactivity mirrors the Store contract: every real change
 * dispatches document CustomEvent "shopping-list:tags-change" with
 * detail {tags}. No-ops (blank tag, duplicate activation, clearing an
 * empty set) dispatch nothing.
 *
 * clearTags() only resets the tag set and re-renders the bar — it never
 * touches the search input, so the broom (clear-checked) handler can
 * call it without losing the user's typed text.
 */

import { normalizeText } from "./search.js";

export const TAGS_CHANGE_EVENT = "shopping-list:tags-change";
export const TAG_BAR_SELECTOR = "[data-active-tags]";

/* ------------------------------------------------------------------ */
/* State (DOM-free; safe in Node tests)                                */
/* ------------------------------------------------------------------ */

/** Display forms in activation order; lookup is normalized. */
const active = [];

const activeKeys = () => new Set(active.map((tag) => normalizeText(tag)));

const sameKeys = (a, b) =>
  a.length === b.length && a.every((key, index) => key === b[index]);

const dispatch = () => {
  if (typeof document === "undefined" || typeof document.dispatchEvent !== "function") {
    return;
  }
  document.dispatchEvent(
    new CustomEvent(TAGS_CHANGE_EVENT, { detail: { tags: getActiveTags() } }),
  );
};

/** Active tags in activation order (display forms, copy). */
export const getActiveTags = () => [...active];

/** Normalized membership check (case/diacritic-insensitive). */
export const isTagActive = (tag) => {
  const key = normalizeText(tag);
  return Boolean(key) && activeKeys().has(key);
};

/**
 * THE unique activation path. Idempotent: activating an already-active
 * tag (normalized comparison) or a blank tag is a no-op returning the
 * current state without dispatching.
 */
export const activateTag = (tag) => {
  const display = String(tag ?? "").trim().replace(/\s+/g, " ");
  if (!display || isTagActive(display)) return getActiveTags();
  active.push(display);
  dispatch();
  return getActiveTags();
};

/** Suggestion-tap path — literally activateTag (identical state). */
export const activateTagFromSuggestion = activateTag;

/** List-row-tap path — literally activateTag (identical state). */
export const activateTagFromList = activateTag;

export const deactivateTag = (tag) => {
  const key = normalizeText(tag);
  if (!key) return getActiveTags();
  const index = active.findIndex((item) => normalizeText(item) === key);
  if (index === -1) return getActiveTags();
  active.splice(index, 1);
  dispatch();
  return getActiveTags();
};

export const toggleTag = (tag) =>
  isTagActive(tag) ? deactivateTag(tag) : activateTag(tag);

/**
 * Empty the active set. Never touches the search input: typed text is
 * preserved by construction (this module holds no input reference).
 * No-op (no event) when already empty.
 */
export const clearTags = () => {
  if (!active.length) return getActiveTags();
  active.length = 0;
  dispatch();
  return getActiveTags();
};

/** Replace the whole set (dedup by normalized key, first display wins). */
export const setActiveTags = (tags = []) => {
  const before = active.map((tag) => normalizeText(tag));
  const seen = new Set();
  const next = [];
  for (const raw of Array.isArray(tags) ? tags : []) {
    const display = String(raw ?? "").trim().replace(/\s+/g, " ");
    const key = normalizeText(display);
    if (display && key && !seen.has(key)) {
      seen.add(key);
      next.push(display);
    }
  }
  if (sameKeys(before, next.map((tag) => normalizeText(tag)))) {
    return getActiveTags();
  }
  active.length = 0;
  active.push(...next);
  dispatch();
  return getActiveTags();
};

/** Subscribe to tag changes; returns an unsubscribe function. */
export const onTagsChange = (listener) => {
  if (typeof document === "undefined") return () => {};
  const handler = (event) => listener(event.detail?.tags ?? getActiveTags(), event);
  document.addEventListener(TAGS_CHANGE_EVENT, handler);
  return () => document.removeEventListener(TAGS_CHANGE_EVENT, handler);
};

/* ------------------------------------------------------------------ */
/* Bar rendering (Lane-B style builders; needs DOM)                    */
/* ------------------------------------------------------------------ */

const hasDom = () =>
  typeof document !== "undefined" && typeof document.createElement === "function";

/**
 * Find or create the active-tags bar inside the search section, right
 * after .search-bar (CookiGram .search-selected-terms position, reusing
 * the styled .chip-row/.chip classes — no CSS changes needed).
 */
export const ensureTagBar = (root = undefined) => {
  if (!hasDom()) return null;
  const scope = root ?? document;
  const existing = scope.querySelector?.(TAG_BAR_SELECTOR);
  if (existing) return existing;
  const section =
    scope.querySelector?.(".search-section") ??
    document.querySelector(".search-section");
  if (!section) return null;
  const bar = document.createElement("div");
  bar.className = "search-selected-terms chip-row";
  bar.setAttribute("data-active-tags", "");
  bar.setAttribute("aria-live", "polite");
  bar.hidden = true;
  const anchor = section.querySelector(":scope > .search-bar");
  if (anchor?.after) anchor.after(bar);
  else section.prepend(bar);
  return bar;
};

/** One removable active-tag chip (pure builder, Lane-B style). */
export const tagChip = (tag) => {
  if (!hasDom()) return null;
  const label = String(tag ?? "").trim().replace(/\s+/g, " ");
  const li = document.createElement("li");
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.setAttribute("data-remove-tag", label);
  chip.setAttribute("aria-pressed", "true");
  chip.setAttribute("aria-label", `Retirer le filtre ${label}`);
  chip.title = `Retirer le filtre ${label}`;
  const cross = document.createElement("span");
  cross.className = "chip-add";
  cross.setAttribute("aria-hidden", "true");
  cross.textContent = "× ";
  chip.append(cross, document.createTextNode(label));
  chip.addEventListener("click", () => deactivateTag(label));
  li.appendChild(chip);
  return li;
};

/** Re-render the bar from state; hidden when no tag is active. */
export const renderTagBar = (container = undefined) => {
  if (!hasDom()) return null;
  const bar = container ?? ensureTagBar();
  if (!bar) return null;
  bar.replaceChildren();
  const tags = getActiveTags();
  bar.hidden = tags.length === 0;
  for (const tag of tags) {
    const chip = tagChip(tag);
    if (chip) bar.appendChild(chip);
  }
  return bar;
};

/**
 * Wire the bar: initial render + re-render on every tags change +
 * optional broom hook (clearTags on [data-clear-checked] clicks; the
 * broom's item-clearing stays with the store/app lane — both listeners
 * coexist, and clearTags() preserves the typed search text).
 * Options: {root, onChange(tags), clearOnBroom=true}.
 */
export const initTagBar = (options = {}) => {
  const bar = ensureTagBar(options.root);
  if (!bar) return null;
  renderTagBar(bar);
  onTagsChange((tags) => {
    renderTagBar(bar);
    options.onChange?.(tags);
  });
  if (options.clearOnBroom !== false) {
    document.addEventListener("click", (event) => {
      if (event.target?.closest?.("[data-clear-checked]")) clearTags();
    });
  }
  return bar;
};
