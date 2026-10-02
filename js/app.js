/* Shopping List v0 — app wiring (Lane H).
 * Wiring only: connects catalog/search/store/list/tags/history/ritual/
 * components lanes behind the index.html mount points. No ranking, no
 * storage, no styles of its own — behavior lives in the lane modules.
 *
 * Contracts: docs/cookigram-contract.md §9, docs/catalog-api.md,
 * docs/store-api.md. Provenance mapping: catalog kind "culinary" →
 * store source "cookigram", "household" → "dict", free text → "custom"
 * (store-api.md requires the explicit "dict" source for household).
 */

import {
  loadCatalog,
  allEntries,
  findEntry,
  catalogVersion,
} from "./catalog.js";
import {
  buildIngredientIndex,
  buildSuggestions,
  normalizeText,
} from "./search.js";
import {
  getItems,
  addItem,
  clearChecked,
  subscribe,
  getFavorites,
  topFrequent,
  getPrefs,
  getEssentials,
  isEssential,
  toggleEssential,
  essentialKey,
  canUndoCheck,
  undoLastCheck,
} from "./store.js";
import { mountList, groupItemsByAisle, DEFAULT_ICON_BASE, TAG_EVENT } from "./list.js";
import {
  initTagBar,
  getActiveTags,
  activateTagFromSuggestion,
  activateTagFromList,
} from "./tags.js";
import { closeSession, recentItems } from "./history.js";
import { createRitual, userEssentialCandidates } from "./staples.js";
import {
  essentialChip,
  essentialButton,
  suggestionRow,
  historyRow,
  showToast,
} from "./components.js";

/* Missing pack degrades gracefully: ingredientIcon() swaps broken <img>
 * for the empty-span fallback (components.js). assets/icons/ is vendored
 * by the UI lane; when it lands, icons resolve with no code change. */
const ICON_BASE = DEFAULT_ICON_BASE;
const MAX_SUGGESTION_ROWS = 8;

const $ = (selector) => document.querySelector(selector);

const els = {
  search: null,
  clear: null,
  suggestions: null,
  essentials: null,
  essentialsChips: null,
  list: null,
  history: null,
  historyList: null,
  catalogVersion: null,
};

let catalog = null;
let searchIndex = [];
let listHandle = null;
let ritual = createRitual([]);
let suggestionRows = [];
let highlight = -1;

const provenanceForKind = (kind) =>
  ({ culinary: "cookigram", household: "dict" })[kind] ?? "custom";

/* ------------------------------------------------------------------ */
/* Suggestions                                                         */
/* ------------------------------------------------------------------ */

const rowLabel = (suggestion) => {
  if (suggestion.kind === "tag") return `#${suggestion.tag}`;
  return suggestion.label;
};

const rowSub = (suggestion) => {
  if (suggestion.kind === "tag") return "Filtrer par étiquette";
  if (suggestion.kind === "free-add") return "Ajouter à la liste";
  return suggestion.aisle || suggestion.category || "";
};

const rowIcon = (suggestion) => {
  const file = suggestion.kind === "item" ? suggestion.entry?.icon : "";
  return file ? `${ICON_BASE}${file}` : "";
};

const rowKey = (suggestion, position) => {
  if (suggestion.kind === "free-add") return "free-add";
  if (suggestion.kind === "tag") return `tag-${normalizeText(suggestion.tag)}`;
  return suggestion.slug || `row-${position}`;
};

function renderSuggestions() {
  const box = els.suggestions;
  if (!box) return;
  const query = els.search?.value ?? "";
  let rows = [];
  try {
    rows = buildSuggestions(searchIndex, query, {
      activeTags: getActiveTags(),
      favorites: getFavorites(),
      staples: getEssentials(),
      history: topFrequent(30),
      onList: getItems(),
      maxItems: MAX_SUGGESTION_ROWS,
    });
  } catch {
    rows = [];
  }
  suggestionRows = rows;
  highlight = -1;
  box.replaceChildren();
  rows.forEach((suggestion, position) => {
    const li = suggestionRow(rowKey(suggestion, position), rowLabel(suggestion), rowSub(suggestion), rowIcon(suggestion));
    li.firstElementChild?.addEventListener("click", () => activateSuggestion(suggestion));
    // Pin toggle on catalog rows (stable slug) and free-add rows
    // (stable name: key). Tag rows are filters, not products: no pin.
    const markable = (suggestion.kind === "item" && suggestion.slug) || suggestion.kind === "free-add";
    if (markable) {
      try {
        const ref = {
          slug: suggestion.kind === "item" ? suggestion.slug : null,
          name: rowLabel(suggestion),
        };
        const pin = essentialButton(essentialKey(ref), isEssential(ref));
        pin.addEventListener("click", () => {
          try {
            const { essential } = toggleEssential(ref);
            showToast(essential
              ? `« ${ref.name} » proposé à chaque liste`
              : `« ${ref.name} » retiré des essentiels`);
          } catch {
            showToast("Action impossible");
          }
          renderSuggestions();
        });
        li.appendChild(pin);
      } catch {
        /* Pin is best-effort; the suggestion row still works. */
      }
    }
    box.appendChild(li);
  });
  const open = rows.length > 0;
  box.hidden = !open;
  els.search?.setAttribute("aria-expanded", open ? "true" : "false");
  if (!open) els.search?.removeAttribute("aria-activedescendant");
  updateClearButton();
}

function paintHighlight() {
  const items = els.suggestions?.querySelectorAll(":scope > li") ?? [];
  items.forEach((li, position) => {
    const selected = position === highlight;
    li.setAttribute("aria-selected", selected ? "true" : "false");
    // components.js marks the <li>; the stylesheet highlights
    // .suggestion[aria-selected], so mirror the state on the button.
    li.firstElementChild?.setAttribute("aria-selected", selected ? "true" : "false");
    if (selected) els.search?.setAttribute("aria-activedescendant", li.id);
  });
  if (highlight === -1) els.search?.removeAttribute("aria-activedescendant");
}

function moveHighlight(delta) {
  if (!suggestionRows.length) return;
  highlight = (highlight + delta + suggestionRows.length) % suggestionRows.length;
  paintHighlight();
  els.suggestions?.querySelectorAll(":scope > li")[highlight]
    ?.scrollIntoView({ block: "nearest" });
}

function defaultSuggestion() {
  return (
    suggestionRows.find((row) => row.kind === "item") ??
    suggestionRows.find((row) => row.kind === "free-add") ??
    suggestionRows[0] ??
    null
  );
}

function activateSuggestion(suggestion) {
  if (!suggestion) return;
  if (suggestion.kind === "tag") {
    activateTagFromSuggestion(suggestion.tag);
    renderSuggestions();
    return;
  }
  try {
    if (suggestion.kind === "free-add") {
      addItem({ name: suggestion.label, provenance: { source: "custom" } });
    } else {
      addItem({
        name: suggestion.entry?.name ?? suggestion.label,
        slug: suggestion.slug,
        provenance: { source: provenanceForKind(suggestion.entryKind) },
      });
    }
    showToast(`« ${suggestion.label} » ajouté`);
  } catch {
    showToast("Ajout impossible");
  }
  if (els.search) els.search.value = "";
  renderSuggestions();
  els.search?.focus();
}

function updateClearButton() {
  if (!els.clear) return;
  els.clear.hidden = !(els.search?.value ?? "").trim();
}

/* ------------------------------------------------------------------ */
/* Essentials (ritual proposal chips)                                */
/* ------------------------------------------------------------------ */

function essentialCandidates() {
  let essentials = [];
  try {
    essentials = getEssentials();
  } catch {
    essentials = [];
  }
  return userEssentialCandidates(essentials, {
    onListKeys: getItems().map((item) => item.slug ?? essentialKey({ name: item.name })),
    decidedKeys: [...tripDecided],
  });
}

let essentialsDismissed = false;
/* Stable keys validated/rejected during the current trip (memory only:
 * the ritual is trip-scoped, so every kept essential is proposed again
 * on the next trip). Cleared together with essentialsDismissed. */
const tripDecided = new Set();

function renderEssentials() {
  const section = els.essentials;
  const chips = els.essentialsChips;
  if (!section || !chips) return;
  section.querySelector("[data-ignore-rest]")?.remove();
  let enabled = true;
  let essentialCount = 0;
  try {
    enabled = getPrefs().essentialsEnabled !== false;
    essentialCount = getEssentials().length;
  } catch {
    enabled = true;
  }
  chips.replaceChildren();
  if (essentialCount === 0) {
    // Binary essential state: no explanatory hint — the pin color on
    // each row carries the state. The section stays hidden until a
    // candidate chip is worth proposing (no artificial empty space).
    section.hidden = true;
    return;
  }
  ritual = createRitual(essentialCandidates());
  const pending = essentialsDismissed ? [] : ritual.pending();
  section.hidden = !enabled || pending.length === 0;
  if (!enabled || pending.length === 0) return;
  for (const candidate of pending) {
    const li = essentialChip(candidate.key, candidate.name, false);
    li.firstElementChild?.addEventListener("click", () => {
      const validated = ritual.validate(candidate.key);
      if (!validated) return;
      tripDecided.add(validated.key);
      try {
        const found = validated.slug && catalog ? findEntry(catalog, validated.slug) : undefined;
        addItem({
          name: validated.name,
          slug: validated.slug ?? null,
          provenance: found ? { source: provenanceForKind(found.kind) } : undefined,
        });
        showToast(`« ${validated.name} » ajouté`);
      } catch {
        showToast("Ajout impossible");
      }
      renderEssentials();
    });
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "chip-dismiss";
    dismiss.setAttribute("aria-label", `Pas cette fois : ${candidate.name}`);
    dismiss.title = "Pas cette fois";
    dismiss.textContent = "✕";
    dismiss.addEventListener("click", () => {
      if (!ritual.reject(candidate.key)) return;
      tripDecided.add(candidate.key);
      renderEssentials();
    });
    li.appendChild(dismiss);
    chips.appendChild(li);
  }
  const ignoreRest = document.createElement("button");
  ignoreRest.type = "button";
  ignoreRest.className = "ignore-rest";
  ignoreRest.setAttribute("data-ignore-rest", "");
  ignoreRest.textContent = "Ignorer le reste";
  ignoreRest.addEventListener("click", () => {
    ritual.ignoreRest();
    essentialsDismissed = true;
    renderEssentials();
  });
  section.appendChild(ignoreRest);
}

/* ------------------------------------------------------------------ */
/* History ("Récents" quick re-add)                                    */
/* ------------------------------------------------------------------ */

const historyLookup = new Map();

function renderHistory() {
  const section = els.history;
  const list = els.historyList;
  if (!section || !list) return;
  let recents = [];
  try {
    recents = recentItems(20);
  } catch {
    recents = [];
  }
  historyLookup.clear();
  list.replaceChildren();
  section.hidden = recents.length === 0;
  for (const recent of recents) {
    const id = recent.slug ?? `name:${normalizeText(recent.name)}`;
    historyLookup.set(id, recent);
    const li = historyRow(id, recent.name);
    li.querySelector("[data-history-readd]")?.addEventListener("click", () => {
      const target = historyLookup.get(id);
      if (!target) return;
      try {
        const found = catalog ? findEntry(catalog, target.slug || target.name) : undefined;
        addItem({
          name: target.name,
          slug: target.slug ?? null,
          provenance: found ? { source: provenanceForKind(found.kind) } : undefined,
        });
        showToast(`« ${target.name} » ajouté`);
      } catch {
        showToast("Ajout impossible");
      }
    });
    list.appendChild(li);
  }
}

/* ------------------------------------------------------------------ */
/* Export text (contract §9.4 + §5.5)                                  */
/* ------------------------------------------------------------------ */

const toBuyItems = () => getItems().filter((item) => !item.checked);

const keepLine = (item) => {
  const qty = String(item.qty ?? "").trim();
  return qty ? `${item.name} : ${qty}` : item.name;
};

/** keep shape: one bare line per unchecked item (copy/share). */
function buildKeepText() {
  return toBuyItems().map(keepLine).join("\n");
}

/** standard shape: grouped with 📍 Rayon headers (.txt export). */
function buildStandardText() {
  const { groups } = groupItemsByAisle(toBuyItems(), catalog);
  const lines = ["🛒 Courses"];
  for (const [aisle, rows] of groups) {
    lines.push("", `📍 Rayon ${aisle} :`);
    for (const { item } of rows) lines.push(`☐ ${keepLine(item)}`);
  }
  return lines.join("\n");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Actions bar                                                         */
/* ------------------------------------------------------------------ */

function refreshUndoButton() {
  const btn = document.querySelector("[data-undo-check]");
  if (!btn) return;
  let enabled = false;
  try {
    enabled = canUndoCheck();
  } catch {
    enabled = false;
  }
  if (enabled) btn.removeAttribute("disabled");
  else btn.setAttribute("disabled", "");
}

function wireActions() {
  refreshUndoButton();
  document.querySelector("[data-undo-check]")?.addEventListener("click", () => {
    let restored = null;
    try {
      restored = undoLastCheck();
    } catch {
      restored = null;
    }
    showToast(restored ? `« ${restored.name} » restauré` : "Rien à annuler");
    refreshUndoButton();
  });
  document.querySelector("[data-clear-checked]")?.addEventListener("click", () => {
    let removed = [];
    try {
      removed = clearChecked();
    } catch {
      removed = [];
    }
    if (removed.length) {
      try {
        closeSession(removed);
      } catch {
        /* History is best-effort; the clear already succeeded. */
      }
      // A closed session ends the trip: essentials are proposed again next time.
      essentialsDismissed = false;
      tripDecided.clear();
      renderEssentials();
      showToast(`${removed.length} article${removed.length > 1 ? "s" : ""} retiré${removed.length > 1 ? "s" : ""}`);
    } else {
      showToast("Aucun article coché");
    }
    renderHistory();
  });

  document.querySelector("[data-copy-shopping]")?.addEventListener("click", async () => {
    const text = buildKeepText();
    if (!text) {
      showToast("La liste est vide");
      return;
    }
    showToast((await copyText(text)) ? "Liste copiée" : "Copie impossible");
  });

  document.querySelector("[data-share-shopping]")?.addEventListener("click", async () => {
    const text = buildKeepText();
    if (!text) {
      showToast("La liste est vide");
      return;
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Courses", text });
        return;
      } catch {
        /* Dismissed or failed: fall back to copy. */
      }
    }
    showToast((await copyText(text)) ? "Liste copiée" : "Partage impossible");
  });

  document.querySelector("[data-export-shopping]")?.addEventListener("click", () => {
    const text = buildStandardText();
    if (toBuyItems().length === 0) {
      showToast("La liste est vide");
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "courses.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Liste exportée");
  });
}

/* ------------------------------------------------------------------ */
/* Search box                                                          */
/* ------------------------------------------------------------------ */

function wireSearch() {
  els.search?.addEventListener("input", () => {
    renderSuggestions();
  });
  els.search?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
    } else if (event.key === "Enter") {
      if (!suggestionRows.length) return;
      event.preventDefault();
      activateSuggestion(suggestionRows[highlight] ?? defaultSuggestion());
    } else if (event.key === "Escape") {
      suggestionRows = [];
      highlight = -1;
      if (els.suggestions) els.suggestions.hidden = true;
      els.search?.setAttribute("aria-expanded", "false");
    }
  });
  // Close the listbox on outside tap; row buttons handle their own clicks.
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.(".search-section")) return;
    if (els.suggestions) els.suggestions.hidden = true;
    els.search?.setAttribute("aria-expanded", "false");
  });
  els.clear?.addEventListener("click", () => {
    if (els.search) els.search.value = "";
    renderSuggestions();
    els.search?.focus();
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const tagFilter = () => {
  const active = getActiveTags().map(normalizeText).filter(Boolean);
  if (!active.length) return null;
  return (item, meta) => {
    const tags = (meta?.tags ?? []).map(normalizeText);
    return active.every((tag) => tags.includes(tag));
  };
};

function renderCatalogVersion(counts) {
  const node = els.catalogVersion;
  if (!node) return;
  if (!catalog) {
    node.textContent = "Catalogue indisponible (hors ligne ?)";
    return;
  }
  try {
    const { ref } = catalogVersion(catalog);
    node.textContent = `Catalogue CookiGram ${String(ref).slice(0, 7)} · ${counts} ingrédients`;
  } catch {
    node.textContent = `Catalogue · ${counts} ingrédients`;
  }
}

async function boot() {
  els.search = $("#shopping-search");
  els.clear = $("#shopping-clear");
  els.suggestions = $("#shopping-suggestions");
  els.essentials = $("#essentials");
  els.essentialsChips = $("#essentials-chips");
  els.list = $("#list");
  els.history = $("#history");
  els.historyList = $("#history-list");
  els.catalogVersion = document.querySelector("[data-catalog-version]");

  try {
    catalog = await loadCatalog();
    searchIndex = buildIngredientIndex(allEntries(catalog));
  } catch {
    catalog = null;
    searchIndex = [];
  }
  renderCatalogVersion(searchIndex.length);

  if (els.list) {
    listHandle = mountList(els.list, {
      catalog,
      iconBase: ICON_BASE,
      filter: tagFilter(),
    });
    await listHandle.ready.catch(() => {});
  }

  initTagBar({
    onChange: () => {
      listHandle?.setFilter(tagFilter());
      renderSuggestions();
    },
  });

  // List-row tag taps (list.js dispatches, cancelable) share the single
  // activation path with suggestion taps; the row keeps its local toggle.
  document.addEventListener(TAG_EVENT, (event) => {
    if (event?.detail?.tag) activateTagFromList(event.detail.tag);
  });

  wireSearch();
  wireActions();
  renderEssentials();
  renderHistory();
  renderSuggestions();

  subscribe(() => {
    renderEssentials();
    renderHistory();
    renderSuggestions();
    refreshUndoButton();
  });
}

boot();
