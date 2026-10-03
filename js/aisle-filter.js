/* Shopping List v0 — aisle filter (issue #30, R3: list header controls).
 * Single owner of the active-aisle filter. One aisle at most (v1);
 * null means "Tous" (no category filter). Mirrors js/tags.js: DOM-free
 * state + document CustomEvent "shopping-list:aisle-change" with
 * detail {aisle}. No-ops (re-selecting the active aisle, clearing
 * while on Tous) dispatch nothing.
 *
 * The aisle vocabulary is the canonical catalog order
 * (catalogAisleOrder) restricted to aisles present in the loaded
 * index — no second taxonomy, no dead options. Filtering itself reuses
 * the search.js structured terms ({label, type: "aisle"} pinned to
 * the indexed `aisle` field), so free text and category combine
 * while tags, essentials, recents and favorites keep working.
 *
 * Interaction (R3): the category headers already visible in the shopping
 * list are the filter controls. Clicking an aisle header filters the
 * visible list groups to that aisle, leaving stored items intact.
 * Re-clicking or tapping the reset button clears the filter. Search
 * suggestions narrow by aisleTerm() when an aisle is active.
 * The search bar stays clean: no permanent chip row, no popup panel.
 */

import { normalizeText } from "./search.js";

export const AISLE_CHANGE_EVENT = "shopping-list:aisle-change";
/** @deprecated R1: the permanent chips bar is removed; kept for tests. */
export const AISLE_BAR_SELECTOR = "[data-aisle-filter]";
export const ALL_AISLES_LABEL = "Tous";

/* ------------------------------------------------------------------ */
/* State (DOM-free; safe in Node tests)                                */
/* ------------------------------------------------------------------ */

/** Display form of the active aisle, or null for "Tous". */
let active = null;

const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

const dispatch = () => {
  if (typeof document === "undefined" || typeof document.dispatchEvent !== "function") {
    return;
  }
  document.dispatchEvent(
    new CustomEvent(AISLE_CHANGE_EVENT, { detail: { aisle: getActiveAisle() } }),
  );
};

/** Active aisle display form, or null when "Tous" is selected. */
export const getActiveAisle = () => active;

/** Normalized membership check (case/diacritic-insensitive). */
export const isAisleActive = (aisle) => {
  const key = normalizeText(aisle);
  return Boolean(key) && active !== null && normalizeText(active) === key;
};

/**
 * Select an aisle (display form). Null/blank selects "Tous".
 * Idempotent: re-selecting the active value is a no-op returning the
 * current state without dispatching.
 */
export const setActiveAisle = (aisle) => {
  const display = clean(aisle);
  const next = display ? display : null;
  const before = active === null ? null : normalizeText(active);
  const after = next === null ? null : normalizeText(next);
  if (before === after) return getActiveAisle();
  active = next;
  dispatch();
  return getActiveAisle();
};

/** Back to "Tous". No-op (no event) when already there. */
export const clearAisle = () => setActiveAisle(null);

/**
 * Toggle an aisle: if already active, clears the filter;
 * otherwise activates it.
 */
export const toggleAisle = (aisle) => {
  if (isAisleActive(aisle)) {
    return clearAisle();
  }
  return setActiveAisle(aisle);
};

/**
 * Structured search term for the active aisle, or null on "Tous".
 * Appended to the suggestion query's structuredTerms next to tag
 * terms — both narrow, free text still applies.
 */
export const aisleTerm = () =>
  active === null ? null : { label: active, type: "aisle" };

/** Subscribe to aisle changes; returns an unsubscribe function. */
export const onAisleChange = (listener) => {
  if (typeof document === "undefined") return () => {};
  const handler = (event) => listener(event.detail?.aisle ?? getActiveAisle(), event);
  document.addEventListener(AISLE_CHANGE_EVENT, handler);
  return () => document.removeEventListener(AISLE_CHANGE_EVENT, handler);
};

/* ------------------------------------------------------------------ */
/* Vocabulary (DOM-free; safe in Node tests)                           */
/* ------------------------------------------------------------------ */

/**
 * Vocabulary: canonical catalog order restricted to aisles present
 * in the index (or raw entries). Accepts a catalog object (uses
 * catalogAisleOrder when available, else catalog.order), an explicit
 * order array, or nothing (presence order, unsorted).
 */
export const aisleChips = (catalogOrOrder = null, entriesOrIndex = []) => {
  const list = Array.isArray(entriesOrIndex) ? entriesOrIndex : [];
  const present = new Set();
  for (const item of list) {
    const entry = item?.fields ? item.entry : (item?.entry ?? item);
    const aisle = clean(entry?.aisle);
    if (aisle) present.add(normalizeText(aisle));
  }
  const order =
    catalogOrOrder === null || catalogOrOrder === undefined
      ? []
      : Array.isArray(catalogOrOrder)
        ? catalogOrOrder
        : typeof catalogOrOrder.order !== "undefined"
          ? catalogOrOrder.order
          : [];
  const seen = new Set();
  const chips = [];
  const consider = (raw) => {
    const display = clean(raw);
    const key = normalizeText(display);
    if (display && key && present.has(key) && !seen.has(key)) {
      seen.add(key);
      chips.push(display);
    }
  };
  order.forEach(consider);
  if (!order.length) {
    for (const item of list) {
      const entry = item?.fields ? item.entry : (item?.entry ?? item);
      consider(entry?.aisle);
    }
  }
  return chips;
};

/* ------------------------------------------------------------------ */
/* Legacy bar rendering (R1 chips row — superseded by the R2 panel). */
/* Kept exported for contract tests; the app no longer mounts a bar.  */
/* ------------------------------------------------------------------ */

const hasDom = () =>
  typeof document !== "undefined" && typeof document.createElement === "function";

/**
 * Find or create the aisle bar inside the search section: after the
 * active-tags bar when present, else right after .search-bar.
 * Reuses the styled .chip-row/.chip classes plus the scroll modifier.
 */
export const ensureAisleBar = (root = undefined) => {
  if (!hasDom()) return null;
  const scope = root ?? document;
  const existing = scope.querySelector?.(AISLE_BAR_SELECTOR);
  if (existing) return existing;
  const section =
    scope.querySelector?.(".search-section") ??
    document.querySelector(".search-section");
  if (!section) return null;
  const bar = document.createElement("div");
  bar.className = "aisle-chips chip-row chip-row--scroll";
  bar.setAttribute("data-aisle-filter", "");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Filtrer par catégorie");
  const anchor =
    section.querySelector?.(":scope > [data-active-tags]") ??
    section.querySelector?.(":scope > .search-bar");
  if (anchor?.after) anchor.after(bar);
  else section.prepend(bar);
  return bar;
};

/** One filter chip: null aisle renders "Tous" (pure builder). */
export const aisleChip = (aisle, isActive) => {
  if (!hasDom()) return null;
  const display = aisle === null ? ALL_AISLES_LABEL : clean(aisle);
  const li = document.createElement("li");
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.setAttribute("aria-pressed", isActive ? "true" : "false");
  if (aisle === null) {
    chip.setAttribute("data-aisle", "");
    chip.setAttribute("aria-label", "Toutes catégories");
  } else {
    chip.setAttribute("data-aisle", display);
    chip.setAttribute("aria-label", `Filtrer par ${display}`);
  }
  chip.textContent = display;
  chip.addEventListener("click", (event) => {
    // Stop the bubble: the state re-render below detaches this chip,
    // which would make the document-level suggestions closer misread
    // the click as outside .search-section and hide the fresh results.
    event.stopPropagation();
    setActiveAisle(aisle);
  });
  li.appendChild(chip);
  return li;
};

/**
 * Re-render the bar: "Tous" first, then `aisles` in order.
 * Options: {container, aisles}.
 */
export const renderAisleBar = (options = {}) => {
  if (!hasDom()) return null;
  const bar = options.container ?? ensureAisleBar();
  if (!bar) return null;
  const aisles = Array.isArray(options.aisles) ? options.aisles : [];
  const scrolled = bar.scrollLeft ?? 0;
  bar.replaceChildren();
  bar.scrollLeft = scrolled;
  const current = getActiveAisle();
  const items = [null, ...aisles];
  for (const aisle of items) {
    const pressed =
      aisle === null ? current === null : current !== null && normalizeText(current) === normalizeText(aisle);
    const chip = aisleChip(aisle, pressed);
    if (chip) bar.appendChild(chip);
  }
  return bar;
};

/**
 * Wire the bar: initial render + re-render on every aisle change +
 * optional onChange(aisle) hook (the app re-renders suggestions).
 * Options: {root, catalog, index, onChange}.
 */
export const initAisleBar = (options = {}) => {
  const bar = ensureAisleBar(options.root);
  if (!bar) return null;
  const aisles = aisleChips(options.catalog ?? null, options.index ?? []);
  renderAisleBar({ container: bar, aisles });
  onAisleChange((aisle) => {
    renderAisleBar({ container: bar, aisles });
    options.onChange?.(aisle);
  });
  return bar;
};
