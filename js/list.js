/* Shopping List v0 — list UI (Lane F).
 * Renders store items grouped by aisle: [checkbox] [icon] [name + qty + tags] [heart].
 * Pure DOM + grouping; no search ranking, no storage writes of its own.
 *
 * Consumed contracts (parallel lanes; all optional at runtime):
 * - Catalog (Lane C, frozen): ./catalog.js — findEntry, aisle order/rank,
 *   defaultAisleForCategory, normalizeKey. Static import (file exists).
 * - Components (Lane B): ./components.js — checkboxRow, aisleCard, emptyState.
 * - Store (contract §9.2): getItems/toggleItem/subscribe + document event
 *   "shopping-list:change" and window "storage" (cross-tab). Resolved in
 *   order: options.store → dynamic import("./store.js") → read-only fallback
 *   over localStorage "shopping-list:items:v1". Hearts use the store's
 *   ref-keyed API: isFavorite({slug, name}) for pressed state,
 *   toggleFavorite({slug, name}) on click (both sync in store.js).
 *   When the store exposes neither, `item.favorite` is honored and the
 *   heart updates optimistically, emitting "shopping-list:action"
 *   {type:"favorite", id} for app.js to forward.
 *   This module NEVER dispatches "shopping-list:change" (store-owned).
 * - Tags lane: renders tag buttons as `button.tag.chip[data-tag]` and, after
 *   each render, dynamic-imports ./tags.js calling the first export found in
 *   [activateTags, mountTags, enhanceTags, initTags](container). Clicks
 *   always dispatch cancelable "shopping-list:tag-activate" {tag, id};
 *   when not prevented, aria-pressed toggles locally.
 * - Search lane: string filters use local normalized matching (matchQuery);
 *   pass a predicate built with searchIngredients for ranked filtering.
 *
 * Item shape: {id, slug|null, name, qty:"", checked:false, addedAt}
 *   + optional {favorite, tags[], aisle, icon, unit, category}.
 */

import {
  loadCatalog,
  findEntry,
  catalogAisleOrder,
  aisleRank,
  defaultAisleForCategory,
  normalizeKey,
} from "./catalog.js";
import { checkboxRow, aisleCard, emptyState } from "./components.js";

export const FALLBACK_AISLE = "À vérifier";
export const STORE_KEY = "shopping-list:items:v1";
export const CHANGE_EVENT = "shopping-list:change";
export const ACTION_EVENT = "shopping-list:action";
export const TAG_EVENT = "shopping-list:tag-activate";
export const DEFAULT_ICON_BASE = "./assets/icons/";

const TAG_ACTIVATORS = ["activateTags", "mountTags", "enhanceTags", "initTags"];

/** "2" + "gousses" → "2 gousses"; tolerates missing parts, no duplication. */
export function formatQty(item) {
  const qty = String(item?.qty ?? "").trim();
  const unit = String(item?.unit ?? "").trim();
  if (qty && unit) return qty.toLowerCase().endsWith(unit.toLowerCase()) ? qty : `${qty} ${unit}`;
  return qty || unit;
}

/**
 * Resolve display metadata for an item: aisle, icon file, tags, category.
 * Precedence: explicit item fields → catalog entry → category default → fallback.
 */
export function resolveItemMeta(item, catalog) {
  const found = catalog ? findEntry(catalog, item?.slug || item?.name || "") : undefined;
  const entry = found?.entry;
  const category = item?.category || entry?.category || "";
  const aisle =
    item?.aisle ||
    entry?.aisle ||
    (catalog ? defaultAisleForCategory(catalog, category) : FALLBACK_AISLE) ||
    FALLBACK_AISLE;
  const icon = item?.icon ?? entry?.icon ?? "";
  const tags = item?.tags?.length ? [...item.tags] : [...(entry?.tags ?? [])];
  const aliases = [...(entry?.aliases ?? [])];
  return { aisle, icon, tags, category, kind: found?.kind ?? null, aliases };
}

/** Normalized substring match over name + qty/unit + tags + aisle (unranked). */
export function matchQuery(item, meta, query) {
  const q = normalizeKey(query);
  if (!q) return true;
  const hay = normalizeKey(
    [
      item?.name,
      formatQty(item),
      meta?.aisle,
      meta?.category,
      ...(meta?.tags ?? []),
      ...(meta?.aliases ?? []),
    ].join(" "),
  );
  return q.split(" ").every((token) => token && hay.includes(token));
}

/**
 * Group items by aisle. Pure (no DOM). `filter` is a predicate
 * (item, meta) => bool or a query string (via matchQuery).
 * Groups follow catalogAisleOrder; rows sort by FR name, then addedAt.
 * Checked rows stay in place (no jumpiness while shopping).
 */
export function groupItemsByAisle(items, catalog, filter = null) {
  const order = catalog ? catalogAisleOrder(catalog) : [FALLBACK_AISLE];
  const groups = new Map();
  const test =
    typeof filter === "function"
      ? filter
      : (item, meta) => matchQuery(item, meta, filter ?? "");
  for (const item of items ?? []) {
    const meta = resolveItemMeta(item, catalog);
    if (!test(item, meta)) continue;
    if (!groups.has(meta.aisle)) groups.set(meta.aisle, []);
    groups.get(meta.aisle).push({ item, meta });
  }
  const collator = new Intl.Collator("fr", { sensitivity: "base" });
  const ranked = [...groups.entries()].sort(
    ([a], [b]) =>
      (catalog ? aisleRank(catalog, a) - aisleRank(catalog, b) : 0) || collator.compare(a, b),
  );
  for (const [, rows] of ranked) {
    rows.sort(
      (r1, r2) =>
        collator.compare(r1.item.name ?? "", r2.item.name ?? "") ||
        (r1.item.addedAt ?? 0) - (r2.item.addedAt ?? 0),
    );
  }
  return { groups: ranked, order };
}

// ---- store resolution (injected → dynamic → read-only fallback) ----------

let storeModulePromise = null;
const dynamicStore = () => {
  if (!storeModulePromise) {
    storeModulePromise = import("./store.js").catch(() => null);
  }
  return storeModulePromise;
};

const readItemsFallback = () => {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

async function resolveStore(explicit) {
  if (explicit) return explicit;
  try {
    return (await dynamicStore()) ?? {};
  } catch {
    return {};
  }
}

export async function readItems(explicitStore) {
  if (typeof explicitStore?.getItems === "function") {
    try {
      return (await explicitStore.getItems()) ?? [];
    } catch {
      return [];
    }
  }
  const mod = await resolveStore(null);
  if (typeof mod?.getItems === "function") {
    try {
      return (await mod.getItems()) ?? [];
    } catch {
      return [];
    }
  }
  return readItemsFallback();
}

function emitAction(detail) {
  globalThis.document?.dispatchEvent(
    new CustomEvent(ACTION_EVENT, { detail, bubbles: true }),
  );
}

// ---- tags lane activation (best-effort, never throws) ---------------------

let tagsActivationAttempted = false;
export function activateTags(container) {
  if (!container || typeof window === "undefined") return;
  import("./tags.js")
    .then((mod) => {
      for (const name of TAG_ACTIVATORS) {
        if (typeof mod?.[name] === "function") {
          tagsActivationAttempted = true;
          return mod[name](container);
        }
      }
      return undefined;
    })
    .catch(() => {});
}
export const tagsActivationState = () => tagsActivationAttempted;

// ---- rendering ------------------------------------------------------------

const iconPathFor = (iconFile, iconBase) =>
  iconFile ? `${iconBase}${iconFile}` : "";

function tagButton(tag, itemId) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tag chip";
  btn.setAttribute("data-tag", tag);
  btn.setAttribute("data-tag-item", itemId);
  btn.setAttribute("aria-pressed", "false");
  btn.setAttribute("aria-label", `Filtrer : ${tag}`);
  btn.textContent = tag;
  return btn;
}

/** Build one shopping row; tags render inside the copy block (grid-safe). */
export function itemRow(item, meta, { iconBase = DEFAULT_ICON_BASE, favorite = null } = {}) {
  const li = checkboxRow({
    id: item.id,
    name: item.name ?? "",
    qty: formatQty(item),
    icon: iconPathFor(meta?.icon, iconBase),
    checked: !!item.checked,
    favorite: favorite ?? !!item.favorite,
  });
  if (meta?.tags?.length) {
    const copy = li.querySelector(".shopping-item-copy");
    if (copy) {
      const wrap = document.createElement("div");
      wrap.className = "shopping-item-tags";
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", `Étiquettes de ${item.name}`);
      for (const tag of meta.tags) wrap.appendChild(tagButton(tag, item.id));
      copy.appendChild(wrap);
    }
  }
  return li;
}

function filteredEmptyState(query) {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.setAttribute("data-empty-state", "filter");
  const p = document.createElement("p");
  p.textContent =
    query && String(query).trim()
      ? `Aucun article pour « ${String(query).trim()} ».`
      : "Aucun article dans cette sélection.";
  div.appendChild(p);
  return div;
}

/**
 * Split items into active vs checked, preserving order (pure).
 * Returns {active, checked}.
 */
export const splitByChecked = (items = []) => {
  const active = [];
  const checked = [];
  for (const item of items ?? []) {
    (item?.checked ? checked : active).push(item);
  }
  return { active, checked };
};

const SECTION_TITLES = Object.freeze({
  active: "Encore à prendre",
  checked: "Plus nécessaire",
});

function sectionElement(kind, groups, { iconBase, isFavorite }) {
  const section = document.createElement("section");
  section.className = `list-section list-section--${kind}`;
  section.setAttribute("data-list-section", kind);
  const title = document.createElement("h3");
  title.className = "list-section-title";
  title.textContent = SECTION_TITLES[kind] ?? kind;
  section.appendChild(title);
  for (const [aisle, rows] of groups) {
    section.appendChild(
      aisleCard(
        aisle,
        rows.map(({ item, meta }) => {
          let favorite = null;
          try {
            favorite = !!isFavorite(item);
          } catch {
            favorite = !!item.favorite;
          }
          return itemRow(item, meta, { iconBase, favorite });
        }),
      ),
    );
  }
  return section;
}

/**
 * Render items into container (cleared first). Returns {rendered, total}.
 * Items render in two semantic sections — active ("Encore à prendre")
 * always before checked ("Plus nécessaire"); each section only renders
 * when non-empty and is never collapsible.
 * Options: {filter, query(for the filtered-empty message), iconBase,
 *           isFavorite: (item) => bool (default: item.favorite),
 *           count: true|false|Element|selector (default true → "#count")}.
 */
export function renderList(container, items, catalog, options = {}) {
  const {
    filter = null,
    query = typeof filter === "string" ? filter : "",
    iconBase = DEFAULT_ICON_BASE,
    isFavorite = (item) => !!item?.favorite,
    count = true,
  } = options;
  const list = items ?? [];
  const { active, checked } = splitByChecked(list);
  const activeGroups = groupItemsByAisle(active, catalog, filter).groups;
  const checkedGroups = groupItemsByAisle(checked, catalog, filter).groups;
  container.replaceChildren();
  if (!activeGroups.length && !checkedGroups.length) {
    container.appendChild(list.length ? filteredEmptyState(query) : emptyState());
  } else {
    const rowOptions = { iconBase, isFavorite };
    if (activeGroups.length) {
      container.appendChild(sectionElement("active", activeGroups, rowOptions));
    }
    if (checkedGroups.length) {
      container.appendChild(sectionElement("checked", checkedGroups, rowOptions));
    }
  }
  updateCount(count, list);
  activateTags(container);
  const rendered =
    activeGroups.reduce((n, [, rows]) => n + rows.length, 0) +
    checkedGroups.reduce((n, [, rows]) => n + rows.length, 0);
  return { rendered, total: list.length };
}

export function updateCount(target, items) {
  if (target === false || typeof document === "undefined") return;
  const node =
    target === true || target === undefined
      ? document.querySelector("#count")
      : typeof target === "string"
        ? document.querySelector(target)
        : target;
  if (!node) return;
  const remaining = (items ?? []).filter((i) => !i.checked).length;
  node.textContent = `${remaining} article${remaining > 1 ? "s" : ""}`;
}

// ---- events (delegated) ---------------------------------------------------

async function toggleCheck(id, li, explicitStore, onToggleCheck) {
  if (typeof onToggleCheck === "function") return onToggleCheck(id, li);
  const store = await resolveStore(explicitStore);
  if (typeof store?.toggleItem === "function") {
    try {
      await store.toggleItem(id);
      return;
    } catch {
      /* fall through to optimistic update */
    }
  }
  const cb = li?.querySelector("[data-item-check]");
  if (cb) {
    cb.checked = !cb.checked;
    li.classList.toggle("shopping-item--checked", cb.checked);
  }
  emitAction({ type: "toggle", id });
}

async function toggleFavorite(id, btn, explicitStore, onToggleFavorite, lookupItem) {
  const pressed = btn.getAttribute("aria-pressed") === "true";
  if (typeof onToggleFavorite === "function") return onToggleFavorite(id, !pressed, btn);
  const store = await resolveStore(explicitStore);
  if (typeof store?.toggleFavorite === "function") {
    try {
      const item = lookupItem?.(id) ?? store.getItem?.(id) ?? null;
      await store.toggleFavorite({ slug: item?.slug ?? null, name: item?.name ?? "" });
      return;
    } catch {
      /* fall through to optimistic update */
    }
  }
  const next = !pressed;
  btn.setAttribute("aria-pressed", String(next));
  btn.setAttribute("aria-label", next ? "Retirer des favoris" : "Ajouter aux favoris");
  btn.setAttribute("title", next ? "Retirer des favoris" : "Ajouter aux favoris");
  btn.textContent = next ? "♥" : "♡";
  emitAction({ type: "favorite", id, favorite: next });
}

function activateTag(tag, id, btn, onTag) {
  if (typeof onTag === "function") return onTag(tag, id, btn);
  const event = new CustomEvent(TAG_EVENT, {
    detail: { tag, id },
    bubbles: true,
    cancelable: true,
  });
  const accepted = globalThis.document?.dispatchEvent(event) ?? true;
  if (accepted) {
    btn.setAttribute("aria-pressed", btn.getAttribute("aria-pressed") === "true" ? "false" : "true");
  }
}

/**
 * Mount a live list: initial render + store subscription + delegated events.
 * Options: {catalog, store, getItems, filter|getFilter, iconBase, count,
 *           onToggleCheck, onToggleFavorite, onTag}.
 * Returns {unmount, refresh, setFilter, getCatalog}.
 */
export function mountList(container, options = {}) {
  const {
    catalog: explicitCatalog = null,
    store: explicitStore = null,
    getItems = null,
    iconBase = DEFAULT_ICON_BASE,
    count = true,
    onToggleCheck = null,
    onToggleFavorite = null,
    onTag = null,
  } = options;
  let filter = options.filter ?? options.getFilter?.() ?? null;
  let catalog = explicitCatalog;
  let disposed = false;
  let lastItems = [];
  let cachedStore = explicitStore;

  const readAll = async () => {
    if (typeof getItems === "function") return (await getItems()) ?? [];
    return readItems(cachedStore ?? explicitStore);
  };
  const isFavoriteFor = (item) => {
    const fn = cachedStore?.isFavorite;
    if (typeof fn === "function") {
      try {
        return !!fn.call(cachedStore, { slug: item?.slug ?? null, name: item?.name ?? "" });
      } catch {
        return !!item?.favorite;
      }
    }
    return !!item?.favorite;
  };
  const lookupItem = (id) =>
    lastItems.find((item) => item?.id === id) ?? cachedStore?.getItem?.(id) ?? null;
  const refresh = async () => {
    if (disposed) return { rendered: 0, total: 0 };
    if (!catalog) {
      try {
        catalog = await loadCatalog();
      } catch {
        catalog = null;
      }
    }
    cachedStore = await resolveStore(explicitStore);
    lastItems = await readAll();
    return renderList(container, lastItems, catalog, {
      filter,
      iconBase,
      count,
      isFavorite: isFavoriteFor,
    });
  };

  const onChange = (event) => {
    if (event?.type === CHANGE_EVENT) refresh();
  };
  const onStorage = (event) => {
    if (!event || event.key === null || event.key === STORE_KEY) refresh();
  };
  const onCheckbox = (event) => {
    const cb = event.target?.closest?.("[data-item-check]");
    if (!cb || !container.contains(cb)) return;
    toggleCheck(cb.getAttribute("data-item-check"), cb.closest("[data-shopping-item]"), explicitStore, onToggleCheck);
  };
  const onClick = (event) => {
    const fav = event.target?.closest?.("[data-fav]");
    if (fav && container.contains(fav)) {
      toggleFavorite(fav.getAttribute("data-fav"), fav, cachedStore ?? explicitStore, onToggleFavorite, lookupItem);
      return;
    }
    const tag = event.target?.closest?.("[data-tag]");
    if (tag && container.contains(tag)) {
      activateTag(tag.getAttribute("data-tag"), tag.getAttribute("data-tag-item"), tag, onTag);
    }
  };

  let unsubscribe = null;
  const ready = (async () => {
    const store = await resolveStore(explicitStore);
    if (typeof store?.subscribe === "function") {
      try {
        unsubscribe = await store.subscribe(() => refresh());
      } catch {
        unsubscribe = null;
      }
    }
    if (!unsubscribe) {
      document.addEventListener(CHANGE_EVENT, onChange);
      globalThis.window?.addEventListener?.("storage", onStorage);
    }
    container.addEventListener("change", onCheckbox);
    container.addEventListener("click", onClick);
    await refresh();
  })();

  return {
    ready,
    refresh,
    setFilter(next) {
      filter = typeof next === "function" ? next : next;
      return refresh();
    },
    getCatalog: () => catalog,
    unmount() {
      disposed = true;
      container.removeEventListener("change", onCheckbox);
      container.removeEventListener("click", onClick);
      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch {
          /* noop */
        }
      } else {
        document.removeEventListener(CHANGE_EVENT, onChange);
        globalThis.window?.removeEventListener?.("storage", onStorage);
      }
    },
  };
}
