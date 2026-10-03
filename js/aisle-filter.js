/* Shopping List v0 — aisle filter (issue #30, R2: panel UX).
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
 * Unlike tags, the aisle filter only narrows search suggestions: it
 * never filters the shopping list itself and never touches the
 * search input (typed text is preserved by construction — this
 * module holds no input reference).
 *
 * Presentation (R2): no permanent row. A discreet trigger inside the
 * search bar toggles a contextual panel listing the canonical aisles.
 * The panel is a plain DOM builder hosted by this module; the app lane
 * only mounts and re-renders it. Keyboard/ARIA: the trigger keeps
 * aria-expanded in sync, the panel traps nothing but closes on Escape
 * and outside click, focus returns to the search input, and the active
 * aisle is exposed via aria-pressed on its option.
 */

import { normalizeText } from "./search.js";

export const AISLE_CHANGE_EVENT = "shopping-list:aisle-change";
/** @deprecated R2: the permanent chips bar is removed; kept for tests. */
export const AISLE_BAR_SELECTOR = "[data-aisle-filter]";
export const AISLE_PANEL_SELECTOR = "[data-aisle-panel]";
export const AISLE_TRIGGER_SELECTOR = "[data-aisle-trigger]";
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

/* ------------------------------------------------------------------ */
/* Panel (R2: discreet trigger + contextual menu, no permanent row)    */
/* ------------------------------------------------------------------ */

/** One panel option: null renders "Tous" (pure builder). */
export const aisleOption = (aisle, isActive) => {
  if (!hasDom()) return null;
  const display = aisle === null ? ALL_AISLES_LABEL : clean(aisle);
  const li = document.createElement("li");
  const option = document.createElement("button");
  option.type = "button";
  option.className = "aisle-option";
  option.setAttribute("aria-pressed", isActive ? "true" : "false");
  if (aisle === null) {
    option.setAttribute("data-aisle", "");
    option.setAttribute("aria-label", "Toutes catégories");
  } else {
    option.setAttribute("data-aisle", display);
    option.setAttribute("aria-label", `Filtrer par ${display}`);
  }
  option.textContent = display;
  option.addEventListener("click", (event) => {
    // Stop the bubble: the panel re-render below detaches this
    // option, which would make a document-level closer misread the
    // click as outside the search section and shut the fresh state.
    event.stopPropagation();
    setActiveAisle(aisle);
  });
  li.appendChild(option);
  return li;
};

/**
 * Re-render the panel list: "Tous" first (reset), then `aisles` in
 * canonical order. Options: {panel, aisles}.
 */
export const renderAislePanel = (options = {}) => {
  if (!hasDom()) return null;
  const panel = options.panel ?? document.querySelector?.(AISLE_PANEL_SELECTOR) ?? null;
  if (!panel) return null;
  panel.replaceChildren();
  const aisles = Array.isArray(options.aisles) ? options.aisles : [];
  const current = getActiveAisle();
  const list = document.createElement("ul");
  list.className = "aisle-panel-list";
  list.setAttribute("role", "list");
  for (const aisle of [null, ...aisles]) {
    const pressed =
      aisle === null ? current === null : current !== null && normalizeText(current) === normalizeText(aisle);
    const option = aisleOption(aisle, pressed);
    if (option) list.appendChild(option);
  }
  panel.appendChild(list);
  return panel;
};

/**
 * Sync the trigger with state: aria-expanded for the panel, a discreet
 * active marker (data attribute + accessible label) when a rayon
 * filters suggestions. The full taxonomy is never exposed at rest.
 */
export const renderAisleTrigger = (trigger = undefined, open = false) => {
  if (!hasDom()) return null;
  const node =
    trigger ??
    document.querySelector?.(
      "#shopping-aisle-filter, [data-aisle-trigger]",
    ) ??
    null;
  if (!node) return null;
  const activeAisle = getActiveAisle();
  node.setAttribute("aria-expanded", open ? "true" : "false");
  if (activeAisle === null) {
    node.removeAttribute("data-active");
    node.setAttribute("aria-label", "Filtrer par rayon");
    node.title = "Filtrer par rayon";
  } else {
    node.setAttribute("data-active", activeAisle);
    node.setAttribute("aria-label", `Filtre actif : ${activeAisle}. Activer pour modifier ou retirer.`);
    node.title = `Filtre : ${activeAisle}`;
  }
  return node;
};

/**
 * Mount the R2 filter: trigger toggles the panel, Escape/outside
 * closes it without touching the query, choosing an option applies
 * the filter (panel closes, focus returns to the search input) and
 * re-renders suggestions via onChange(aisle).
 * Options: {root, search, trigger, panel, catalog, index, onChange}.
 */
export const initAisleFilter = (options = {}) => {
  if (!hasDom()) return null;
  const scope = options.root ?? document;
  const panel =
    options.panel ??
    scope.querySelector?.(AISLE_PANEL_SELECTOR) ??
    document.querySelector(AISLE_PANEL_SELECTOR);
  const trigger =
    options.trigger ??
    scope.querySelector?.("#shopping-aisle-filter, [data-aisle-trigger]") ??
    document.querySelector("#shopping-aisle-filter, [data-aisle-trigger]");
  if (!panel || !trigger) return null;
  const search =
    options.search ??
    scope.querySelector?.(".search-input") ??
    document.querySelector(".search-input");
  const aisles = aisleChips(options.catalog ?? null, options.index ?? []);

  let open = false;
  const close = ({ refocus = false } = {}) => {
    if (!open) return;
    open = false;
    panel.hidden = true;
    renderAisleTrigger(trigger, false);
    if (refocus) search?.focus?.();
  };
  const show = () => {
    renderAislePanel({ panel, aisles });
    open = true;
    panel.hidden = false;
    renderAisleTrigger(trigger, true);
  };

  renderAislePanel({ panel, aisles });
  panel.hidden = true;
  renderAisleTrigger(trigger, false);

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (open) close();
    else show();
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) close();
      else {
        show();
        panel.querySelector?.(".aisle-option")?.focus?.();
      }
    } else if (event.key === "Escape") {
      close();
    }
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close({ refocus: true });
    }
  });
  document.addEventListener("click", (event) => {
    if (!open) return;
    if (event.target?.closest?.(".search-section")) {
      // Clicks inside the search section (panel options, search
      // input, actions) never force-close: option clicks apply the
      // filter via state change, other clicks are unrelated.
      return;
    }
    close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) close();
  });

  const unsubscribe = onAisleChange((aisle) => {
    renderAislePanel({ panel, aisles });
    renderAisleTrigger(trigger, open);
    close();
    search?.focus?.();
    options.onChange?.(aisle);
  });
  return { panel, trigger, close, unsubscribe };
};
