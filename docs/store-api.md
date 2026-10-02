# Store API — favorites / essentials / history / persistence (Lane G)

Persistence and session layer for the Shopping List PWA. Vanilla ES
modules, no dependencies, no backend. Concepts are decoupled from
catalog internals: these modules never import `catalog.js` — catalog
knowledge crosses the boundary only as plain `{slug, name}` data
(plus an opaque `provenance.source` tag).

## Files

| Path | Owner | Content |
| ---- | ----- | ------- |
| `js/store.js` | Lane G | List, favorites, essentials, prefs, frequency, event bus |
| `js/staples.js` | Lane G | Ephemeral "Essentials to check" ritual (pure, no storage) |
| `js/history.js` | Lane G | Close-the-session snapshots ("Récents") |

## Storage keys

All keys carry a `:v1` namespace (same habit as CookiGram's
suffixed keys). Values are JSON.

| Key | Shape |
| --- | ----- |
| `shopping-list:items:v1` | Array of items (insertion order) |
| `shopping-list:favorites:v1` | Array of `{key, slug\|null, name, addedAt}` |
| `shopping-list:essentials:v1` | Array of `{key, slug\|null, name, addedAt}` (user-marked only, never seeded) |
| `shopping-list:staples:v1` | REMOVED (#15): historical per-slug decisions, may physically remain, never read (no migration) |
| `shopping-list:history:v1` | Array of sessions, oldest first (capped at 20) |
| `shopping-list:prefs:v1` | Prefs object over `DEFAULT_PREFS` |
| `shopping-list:frequency:v1` | Map `{normalizedName: {name, slug, count, lastUsedAt}}` (capped at 300 keys) |

Corrupt JSON under any key resets that key to its default (fail-soft).
When `localStorage` is unavailable or throws (private mode, quota),
the store falls back to an in-memory adapter so the session keeps
working. Tests may inject a backend via
`configureStore({storage})` (mirrors the `fetchImpl` pattern of
`catalog.js`).

## Item shape

```js
{
  id: "7f3c…",            // createId(): randomUUID, Math.random fallback
  slug: "ail",            // catalog slug, or null for free-text items
  name: "Ail",            // display name (required, trimmed)
  qty: "3 gousses",       // quantity string, "" when unspecified
  checked: false,
  addedAt: 1727745600000,
  provenance: {source: "cookigram"} // "cookigram" | "dict" | "custom"
}
```

`provenance.source` records where the ingredient knowledge came from:
`cookigram` (culinary snapshot), `dict` (household dictionary),
`custom` (free text). Default when omitted: `slug ? cookigram :
custom` — so the app lane MUST pass `{source: "dict"}` explicitly
for household entries. Unknown sources throw. Re-adds (history,
favorites, ritual) preserve the original provenance; the re-add
path is never recorded as a source.

## `js/store.js` API

```js
import {
  getItems, getItem, addItem, toggleItem, setChecked, setQty,
  removeItem, clearChecked, clearAll, subscribe,
  getFrequency, topFrequent,
  favoriteKey, getFavorites, isFavorite, toggleFavorite, clearFavorites,
  essentialKey, getEssentials, isEssential, toggleEssential, clearEssentials,
  getPrefs, setPrefs, resetPrefs,
} from "./store.js";
```

Current list:

- `getItems()` → items in insertion order (copies).
- `getItem(id)` → item or null.
- `addItem({name, qty?, slug?, provenance?})` → item. Throws on
  blank `name`. Merges on identical normalized name + qty (no
  duplicate; a checked match is re-activated with `merged: true`
  in the event detail). Records a frequency signal on every call.
- `toggleItem(id)` / `setChecked(id, bool)` → updated item or null.
- `setQty(id, qty)` → updated item or null.
- `removeItem(id)` → bool.
- `clearChecked()` → removed items (hand them to
  `history.closeSession` when closing a shopping session).
- `clearAll()` → number removed.
- `freezeEditable()` → number newly frozen (#9 global ✓). Marks
  every item lacking `frozen`, persists, emits `items:freeze`.
  Absent flag reads as editable (no migration). Frozen items keep
  check/uncheck; their edit controls hide.
- `hasEditable(items)` → bool (pure). True when at least one item
  lacks `frozen`; drives ✓ visibility.

Frequency signal (ranking help for the search/app lanes):

- `getFrequency(name)` → `{name, slug, count, lastUsedAt}` or null.
- `topFrequent(limit = 8, {exclude = []})` → records ordered by
  count desc, recency desc; `exclude` holds slugs already on the
  list. Lookup keys use `normalizeName` (same semantics as
  catalog `normalizeKey`, duplicated so the store stays decoupled).

Favorites (heart toggles):

- `favoriteKey({slug?, name})` → slug, else `name:<normalized>`.
- `getFavorites()` → favorites in add order (copies).
- `isFavorite({slug?, name})` → bool.
- `toggleFavorite({slug?, name})` → `{favorite, key}` (state
  *after* the toggle). Throws when both are blank.
- `clearFavorites()` → number removed.

Essentials (pin toggles; proposed on every new trip):

- `essentialKey({slug?, name})` → slug, else `name:<normalized>`.
- `getEssentials()` → essentials in add order (copies). Fresh
  installs return `[]`: the catalog never seeds this list.
- `isEssential({slug?, name})` → bool.
- `toggleEssential({slug?, name})` → `{essential, key}` (state
  *after* the toggle). Throws when both are blank.
- `clearEssentials()` → number removed.
- Favorites and essentials are independent: marking one never
  touches the other, and no migration converts between them.

Historical keys (`shopping-list:staples:v1`, removed with #15) are
never read; no destructive migration is performed.

Prefs:

- `getPrefs()` → stored values over
  `DEFAULT_PREFS = {essentialsEnabled: true, lastRitualAt: null}`
  (unknown stored keys are preserved).
- `setPrefs(patch)` → merged prefs. `resetPrefs()` → defaults.

### Events

`subscribe(listener)` listens on document CustomEvent
`"shopping-list:change"` and returns an unsubscribe function
(no-op outside the DOM). Detail is `{type, …}`:

| `type` | Extra detail |
| ------ | ------------ |
| `items:add` | `{id, merged?}` |
| `items:toggle` | `{id}` |
| `items:qty` | `{id}` |
| `items:remove` | `{id}` |
| `items:clear-checked` | `{count}` |
| `items:clear` | `{count}` |
| `favorites:toggle` | `{key, favorite}` |
| `favorites:clear` | `{count}` |
| `essentials:toggle` | `{key, essential}` |
| `essentials:clear` | `{count}` |
| `history:close` | `{id, count}` |
| `history:clear` | `{count}` |
| `prefs:change` | — |
| `external` | `{key?}` (another tab wrote one of our keys) |

Cross-tab reactivity follows the CookiGram pattern
(`selection-app.js`): a single window `storage` listener,
installed on first `subscribe`, re-emits matching keys as
`external`.

## `js/history.js` API

```js
import { closeSession, getHistory, getHistoryEntry,
         clearHistory, recentItems } from "./history.js";
```

- `closeSession(items, {closedAt?})` → session entry or null.
  `items` is the current-list shape (or any
  `[{slug?, name, qty?}]`); blank names are dropped. Returns
  null when nothing is worth recording. Sessions are capped
  (`MAX_SESSIONS = 20`, oldest dropped; `MAX_ITEMS_PER_SESSION
  = 200`). Typical call site: after `clearChecked()`, or an
  explicit "finish shopping" action snapshotting `getItems()`.
- `getHistory()` → sessions newest first (copies).
- `getHistoryEntry(id)` → session or null.
- `clearHistory()` → number removed.
- `recentItems(limit = 20)` → deduped `[{slug, name}]`, newest
  first, for the "Récents" quick re-add UI (re-add via
  `store.addItem`, which refreshes the frequency signal).

Session entry: `{id, closedAt, items: [{slug, name, qty}],
count}`.

## `js/staples.js` API (ephemeral ritual)

The ritual is NEVER a second permanent list: state lives in
memory only. The app lane resolves candidates from USER-OWNED
essentials (`userEssentialCandidates(getEssentials(), …)`),
runs the ritual, and turns `validate()` results into
`store.addItem` calls. The ritual is trip-scoped: per-trip
verdicts are kept in memory only (cleared when the trip closes),
so every kept essential is proposed again on the next trip.
Ignoring or rejecting a proposal never removes the essential.
Candidates are matched by stable key (slug, or `name:<normalized>`
for custom products), so custom essentials are proposed exactly
like catalog ones. The legacy `noteStapleDecision()` memory was removed
with #15; historical `shopping-list:staples:v1` payloads are ignored.

```js
import { createRitual, userEssentialCandidates } from "./staples.js";

const ritual = createRitual(userEssentialCandidates(getEssentials(), {
  onListKeys: getItems().map((i) => i.slug ?? essentialKey({ name: i.name })),
  decidedKeys: [...tripDecided], // memory-only trip verdicts
}));
ritual.pending();        // [{key, slug, name}] still undecided
ritual.validate("farine"); // → candidate (caller: addItem it)
ritual.reject("kirsch");   // → true
ritual.ignoreRest();       // → remaining; ends the ritual
ritual.decisions();        // [{key, slug, name, decision}] incl. ignored
ritual.isDone();           // true when nothing is pending
```

- `createRitual(candidates)` dedupes by stable key and drops
  unkeyable entries; `validate`/`reject` on an unknown,
  already-decided, or post-`ignoreRest` key return null/false.
  Pure: no imports, no storage, no DOM.
- `userEssentialCandidates(essentials, {onListKeys?,
  decidedKeys?})` drops key duplicates, entries already on the
  list, and entries decided in the current trip. Trip-scoped:
  no cooldown, no persisted memory.

## Relationship to `cookigram-contract.md` §9.2

The six proposed names (`getItems`, `addItem`, `toggleItem`,
`setQty`, `clearChecked`, `subscribe`), the item core fields,
the `"shopping-list:items:v1"` key, the
`"shopping-list:change"` event with `{type, id?}` detail, and
the cross-tab `storage` listener are kept verbatim — no
contract update needed. Deliberate additive deviations:

1. Items gain a `provenance` field (`{source}` incl.
   `cookigram`; see above) — required by the Lane G brief.
2. `addItem` re-activates a checked merge match (still no
   duplicate; reported via `merged: true`) instead of leaving
   it checked.
3. Favorites detail uses `{key}` rather than `{id}` (favorites
   are keyed by slug/name, not by item id).
4. sibling Lane-G concepts required by the brief (favorites,
   essentials, history, prefs, frequency) are new exported
   functions, not renames.
5. Fail-soft storage (corrupt-JSON reset, in-memory fallback)
   and `configureStore` are robustness additions with no
   contract counterpart.
