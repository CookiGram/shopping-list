# E2E checklist — Shopping List v0 (Lane H)

23-step reference scenario mapped to verified-vs-manual status.
Unit tests run headless with the preinstalled Node runner (no new deps);
every DOM / PWA / persistence-across-reload / viewport step stays manual.

## Run

```bash
node --test tests/*.test.mjs   # Lane H: 71 tests, pure logic (search/store/catalog/staples/tags/history/list-grouping)
python3 -m unittest discover -s tests/sync   # Lane D (sync lane owns it; listed for completeness)
for f in js/*.js sw.js; do node --check "$f"; done   # syntax smoke gate (covers DOM-only modules)
```

Environment verified 2026-10-02: `node v22.23.3`, `python3 3.14.7`, no installs.
`js/*.js` are ES modules imported directly by the tests; `tests/helpers.mjs`
holds shared fixtures (memory storage, minimal catalog, search entries).

## Coverage summary

- Verified headless (H): pure logic — ranking weights/boosts, store merge/frequency/
  favorites/decisions/prefs, catalog lookups/aisle mapping, ritual + tag state,
  history snapshots/dedup, list grouping/meta.
- Partial (P): logic verified headless, DOM wiring manual (render, events, toast,
  focus, listbox keyboard).
- Manual only (M): needs a browser (service worker, real localStorage across
  reloads, layout/viewport, assistive tech).

## The 23 steps

| # | Step (reference flow) | Status | What the unit test pins | What stays manual |
|---|---|---|---|---|
| 1 | Open app (fresh profile): empty state, catalog version row | M | — | `index.html` mount, `boot()` catalog load, empty-state card, version string; needs browser |
| 2 | Essentials visible: staple chips proposed | P | `filterCandidates` on-list/cooldown/dedup (`staples-tags-history.test.mjs`); shipped snapshot holds 23 `staple:true` (`catalog.test.mjs`) | chip render, section hide when empty/prefs-off |
| 3 | Accept essential: tap `+` chip → item added, toast, chip gone | P | `createRitual.validate` + `store.addItem` merge/provenance (`staples-tags-history`, `store.test.mjs`) | click wiring, toast, re-render |
| 4 | Reject essential | P | `ritual.reject` + `noteStapleDecision("rejected")` logic verified; per-chip ✕ wired in `app.js` | click ✕, chip disappears, section re-renders |
| 5 | Ignore rest: end ritual, section hides | P | `ritual.ignoreRest/decisions/isDone` verified; "Ignorer le reste" button wired in `app.js` | click, section hides, re-proposed after session close |
| 6 | Autocomplete: type `ail` → listbox, max 8 rows, keyboard navigable | P | `buildSuggestions` cap/order/tags-first/free-add-always (`search.test.mjs`) | listbox DOM, `aria-expanded/activedescendant`, ArrowUp/Down/Enter/Escape |
| 7 | Add: pick suggestion → row appears grouped by aisle, toast, search cleared | P | `addItem` + `groupItemsByAisle` order/sort (`store`, `list-grouping.test.mjs`) | row render, toast, input clear + focus |
| 8 | Tag click (suggestion): tap `#tag` row → filter activates | P | `activateTagFromSuggestion === activateTag`, tag-narrows-household match (`search`, `staples-tags-history.test.mjs`) | suggestion-row tap wiring |
| 9 | Chip: active-tag chip in tag bar, `×` removes | P | tag state set/dedup/order (`staples-tags-history.test.mjs`) | bar render (`ensureTagBar/renderTagBar`), chip button, `aria-pressed` |
| 10 | Tag click (list row): same activation path as suggestion tap | P | `activateTagFromList === activateTag` asserted | row `button.tag.chip`, cancelable `shopping-list:tag-activate`, local toggle |
| 11 | Context ranking: favorites/staples/history boost, on-list demote | H | `scoreSearchMatch` weights (100/60/45/35/10), boosts +8/+4/history/−12, Lane-G shapes (`search.test.mjs`) | — (spot-check order visually) |
| 12 | Broom: clear checked, clear tags, typed text preserved | P | `clearChecked` returns removed; `clearTags` never touches input (`store`, `staples-tags-history.test.mjs`) | combined click handler, text preservation in the real input |
| 13 | Favorite: heart toggles, pressed state persists | P | `toggleFavorite/isFavorite/favoriteKey`, slugless `name:` keys (`store.test.mjs`) | heart button render, `aria-pressed`, cross-render persistence |
| 14 | Free add: unknown text → free-add row → custom item | P | `freeAddSuggestion` raw-label/blank/null-safety (`search.test.mjs`); `custom` provenance default (`store.test.mjs`) | row tap → `addItem` with `custom` source |
| 15 | Check off: checkbox toggles, count updates, no reorder | P | `toggleItem/setChecked` (`store.test.mjs`); checked-stays-in-place grouping (`list-grouping.test.mjs`) | checkbox DOM, `#count` text, stable order while shopping |
| 16 | Close: finishing snapshots a history session | P | `closeSession` shape/caps/null-on-empty (`staples-tags-history.test.mjs`) | `clearChecked → closeSession` call-site wiring |
| 17 | History: `Récents` shows deduped newest-first rows | P | `getHistory/recentItems` order/dedup/limit (`staples-tags-history.test.mjs`) | section render, hide when empty |
| 18 | Re-add from history: `+ Ajouter` restores item, original provenance | P | `addItem` merge + provenance preservation rules (`store.test.mjs`) | re-add button wiring, `findEntry` kind → source mapping |
| 19 | New list: start over (clear list/history) | P | `clearAll/clearHistory/clearFavorites/clearStapleDecisions` (`store`, `staples-tags-history.test.mjs`) | user flow (no dedicated "new list" button in v0 shell) |
| 20 | Staples again: next ritual skips on-list + 7-day rejected | H | `filterCandidates` cooldown with injected `now`; added/ignored re-proposed (`staples-tags-history.test.mjs`) | — (spot-check chips) |
| 21 | Offline: airplane mode + reload → list + catalog work | M | — | service worker precache (`sw.js`, `CACHE` name), offline fallback; cannot run headless |
| 22 | Reload persistence: items/favorites/decisions/history survive | M | store fail-soft (corrupt JSON, memory fallback) and backend injection logic only | real `localStorage` across page loads + cross-tab `storage` event; cannot run headless |
| 23 | Viewport + a11y: 360px layout, 44px targets, live regions, focus rings | M | — | visual check (mobile frame, touch rows), `aria-live`, `aria-checked mixed`, `:focus-visible`; cannot run headless |

## Honest gaps (not runnable headless)

- Offline/reload/viewport (steps 21–23): no browser automation in this lane;
  `sw.js`, real `localStorage` persistence, layout and screen-reader behavior
  need a device or desktop browser pass.
- All DOM rendering and event wiring (components, `list.js` render, `tags.js`
  bar, `app.js` boot): `node --check` proves syntax only. `app.js` calls
  `boot()` at import (needs `document`), so it is deliberately not imported
  by the unit tests.
- Steps 4–5 are wired (per-chip ✕ + "Ignorer le reste") but, like all
  DOM wiring, still need a browser click-through (see above).
- Fixed post-lane: `recentItems(0)` now returns `[]` (was pinned returning
  1 item); icon pack vendored (`assets/icons/`, 174 SVGs, 172/172
  referenced icons resolve).

## Files

- `tests/helpers.mjs` — fixtures (not a test)
- `tests/search.test.mjs` — ranking (weights, boosts, suggestions, free-add)
- `tests/store.test.mjs` — list/frequency/favorites/decisions/prefs/persistence
- `tests/catalog.test.mjs` — lookups, aisle mapping, shipped-snapshot drift gate
- `tests/staples-tags-history.test.mjs` — ritual, tag state, history sessions
- `tests/list-grouping.test.mjs` — `formatQty/resolveItemMeta/matchQuery/groupItemsByAisle`
- `tests/sync/` — Lane D owned, untouched
