# CookiGram Contract — Shopping List v0 (Lane A)

Audit of the CookiGram reference for the standalone Shopping List PWA.
All §1–§7 claims were verified by opening the cited file bodies (2026-10-02);
grep output was used only to locate candidates.

## 0. Provenance

- Reference repo (READ-ONLY): `/home/pierrecsn/Project/CookiGram/cookigram`
- Remote: `https://github.com/CookiGram/cookigram.git` (public)
- Audited HEAD: `656f2f0dd0a5874cae82b77a60c56385167a4301`
  (`Merge pull request #515 … feat/issue-507-shopping-ingredient-state`)
- Default branch: `main`. Public tags exist (`v2.0.0`, `core-*` builder tags).
- Architecture boundary: `docs/CATALOGUE-CONTRACT-CORE.md` —
  catalog validity is defined exclusively by `cookigram-contract`;
  Core (private `CookiGram/cookigram-core`) consumes a conforming catalog;
  the published site is built by a pinned public builder
  (`.builder.json` + `.core-version`, SHA256-verified).
- Public validation path: `docs/PUBLIC-CONTRACT.md` —
  `python -m cookigram_contract validate .` covers `recipes/`,
  `.gram/ingredients.yaml`, `.gram/ingredient-provenance.yaml`.
- CookiGram did NOT refactor for this audit; nothing outside
  `/home/pierrecsn/Project/CookiGram/shopping-list` was modified.

## 1. Canonical ingredient catalog

### 1.1 Exact files and format

| File | Lines | Entries | Format |
| ---- | ----- | ------- | ------ |
| `.gram/ingredients.yaml` | 3504 | 380 ingredient slugs | YAML mapping `ingredients: {slug: {...}}` |
| `.gram/ingredient-provenance.yaml` | 1300 | ~380 slugs | YAML mapping `ingredients: {slug: {source,status,...}}` |

Entry schema in `.gram/ingredients.yaml` (all keys observed in the body):

```yaml
ail:
  name: Ail                        # display name (required in practice)
  aliases: [ail, "gousse d'ail"]   # required in practice; FR search synonyms
  category: Légumes et aromates     # required in practice; see §1.2
  pantry_staple: true              # optional; 23 entries carry it
  nutrition:                       # optional; per-100g {calories, carbs, fat, protein}
    calories: 131
    carbs: 23.5
    fat: 0.5
    protein: 6.4
  piece_weight: 5.0                # optional; grams per unit
  density: 0.91                    # optional; g/ml for volume↔mass
  conversions:                     # optional; unit→grams map, e.g. {gousse: 5.0}
    gousse: 5.0
```

### 1.2 Categories (49 distinct raw labels, denormalized)

Top labels by entry count (from the audited body):

`Légumes et aromates` (51), `Condiments` (45),
`Condiments et assaisonnements` (34), `Épicerie salée` (18),
`Herbes et épices` (17), `Poissons et fruits de mer` (16),
`Fruits à coque et graines` (16), `Boucherie et volailles` (15),
`Produits laitiers et matières grasses` (12),
`Féculents et céréales` (12), plus 39 rarer labels.

WARNING — do not treat `category` as an enum: the file mixes cases
(`épicerie salée` ×9 vs `Épicerie salée` ×18) and near-duplicates
(`Boucherie et volaille` ×5 vs `Boucherie et volailles` ×15,
`Condiments` vs `Condiments et assaisonnements`). The catalog sync lane
must normalize with `casefold()` (as CookiGram's own icon resolver does,
`tests/test_icon_coverage.py:244`) and map through the aisle table in §5.4.

### 1.3 Provenance

`.gram/ingredient-provenance.yaml` gives each slug a `source` + `status`.
Statuses observed: `verified` (mostly `ANSES-CIQUAL`), `incomplete`
(generic, CIQUAL value pending), `pending`, `estimated`, `manual`.
Shopping List v0 does NOT need nutrition; sync only `source`/`status`
as opaque metadata for future use.

### 1.4 Aliases

Aliases are the de-facto FR search synonyms (e.g. `ail` → `gousse d'ail`,
`gousses d'ail entières`; `beurre-doux` → `beurre`). The Search lane must
index `name` + `aliases` (see §9.3).

### 1.5 Public fetch path for CI sync (exact)

The catalog files are public in the `CookiGram/cookigram` repo. Sync over
HTTPS with a pinned immutable ref:

```text
https://raw.githubusercontent.com/CookiGram/cookigram/<REF>/.gram/ingredients.yaml
https://raw.githubusercontent.com/CookiGram/cookigram/<REF>/.gram/ingredient-provenance.yaml
```

Pinned-ref strategy (mirrors CookiGram's own pin discipline in
`docs/PUBLIC-CONTRACT.md` and `scripts/check-pins.py`):

1. Pin by full commit SHA (`<REF>` = 40-hex), never by a branch name.
   Branch `main` and tag `v2.0.0` are mutable/resolvable only for refresh.
2. Record in `data/cookigram-catalog.json`: `source.repo`,
   `source.ref` (SHA), `source.fetched_at`, plus `sha256` of each source
   file — the same provenance habit as `_site/provenance.json`
   (`contract_source_sha`, D1 in `docs/CATALOGUE-CONTRACT-CORE.md`).
3. Refresh cadence: scheduled workflow (CookiGram's `sync-core-pin.yml`
   runs every 15 min; weekly is ample here) that resolves `main`,
   re-fetches, rebuilds the snapshot, and fails loudly on schema drift
   (unknown top-level keys, missing `name`/`aliases`/`category`).
4. Verify after fetch: re-hash bytes; abort the sync on mismatch.
5. No auth, no private Core checkout, no `cookigram-contract` install
   needed for read-only sync — plain `curl` suffices. `validate .` is
   optional hardening.

Seed ref (audited HEAD): `656f2f0dd0a5874cae82b77a60c56385167a4301`.

## 2. Design tokens (copyable)

### 2.1 Canonical: built `variables.css` (light theme)

Source: `_site/assets/css/variables.css` (Core-generated build output, but
the effective public values; instance theme choice lives in
`site-config.yaml`: `default: light`, `available: [light, dark,
halloween, christmas]`).

Copyable `:root` (light) tokens for Shopping List v0:

```css
--ink:#27251f; --muted:#706d64; --paper:#fffaf1; --cream:#f3ead9;
--card:#ffffff; --orange:#e96f3a; --accent-text:#af4815; --green:#244f43;
--line:#ded6c7; --banner-bg:#fff1dc; --banner-text:#27251f;
--shadow:0 16px 40px #40352618; --btn-bg:#ffffff; --btn-hover:#eadaaf;
--space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
--space-6:24px; --space-8:32px;
--radius-sm:8px; --radius-md:14px; --radius-lg:20px; --radius-full:9999px;
--font-serif:Georgia,serif;
--font-sans:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;
--font-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;
```

Dark/halloween/christmas variants are full overrides of the same variable
set (`[data-theme="dark"]` etc. in the same file) — v0 ships light only
but MUST keep the same variable names so themes stay a drop-in addition.

Caveat: token *values* live in private Core; these are observed build
outputs. If CookiGram re-themes, re-copy from a fresh `_site` build.

### 2.2 NOT canonical: `prototype/style.css`

The prototype (`prototype/index.html|style.css|app.js`) is a Kitchen-OS
meal-planning sandbox with its own palette (`--bg-app:#f4efe6`,
`--brand-orange:#ea580c`, Google Fonts `Plus Jakarta Sans`/`Playfair
Display`). Do NOT copy its tokens: `site-config.yaml` mandates system
font stacks only (`system-sans`, `system-serif`, `system-mono`; non-listed
webfonts are rejected at build). The prototype IS useful as a mobile-frame
pattern reference (max-width 420px column, bottom action bar).

### 2.3 PWA shell constants

From `static/manifest.webmanifest` (single-line JSON):
`display: standalone`, `background_color` + `theme_color`: `#fffaf1`
(matches `--paper`), icons `icon-192.png` / `icon-512.png` (`any` +
`maskable`) + `icon.svg`.

## 3. Search-bar pattern (copyable)

### 3.1 Markup — `_site/index.html:105-130`

```html
<div class="search-section">
  <div class="search-free-text" data-search-free-text>
    <div class="search-bar">
      <span class="search-icon" aria-hidden="true">🔍</span>
      <input type="search" id="recipe-search" class="search-input"
        placeholder="Une envie ? Rechercher un plat, un ingrédient..."
        aria-label="Rechercher une recette">
      <button type="button" class="search-clear"
        aria-label="Effacer la recherche" hidden>×</button>
    </div>
  </div>
  <div id="recipe-suggestions" class="search-suggestions"
    role="listbox" aria-label="Suggestions de recherche" hidden></div>
  <div class="search-structured-terms" data-search-structured-terms>
    <div class="search-selected-terms" data-search-terms aria-live="polite"></div>
  </div>
  ...duration filter + favorites toggle (recipe-specific; skip in v0)
</div>
```

Copy for v0: `.search-bar` row (icon + `type="search"` + clear `×`
button), `role="listbox"` suggestions box, `aria-live` selected-terms
region. Adapt placeholder/`aria-label` to ingredients.

### 3.2 Algorithm — `_site/assets/js/modules/search.js`

Pure, dependency-free (except favorites import at top, unused by the core
functions) ES module; the scoring core ports verbatim:

- `normalizeText(str)`: NFD strip diacritics → lowercase → collapse
  whitespace. THE canonical FR normalization (duplicated with the same
  semantics in `static/selection/ingredient-availability.js` as
  `normalizeIngredientName` with `fr-FR` locale).
- `tokenize(str)`: split normalized text on spaces.
- `indexSearchCard(card, sourceIndex)` / `buildSearchIndex(cards)`:
  precompute frozen per-field `{text, tokens}` over
  `SEARCH_FIELDS = ['title','tags','ingredients','description']`.
  For v0: `SEARCH_FIELDS = ['name','aliases','category']`.
- `matchSearch(indexed, query, structuredTerms)`: every free-text token
  must match some field (exact token → prefix → substring); every
  structured term must phrase-match its pinned field.
- `scoreSearchMatch(...)`: explainable V1 score with per-token evidence
  (title exact 60 / prefix 45; tags exact 35; ingredients exact 30;
  description 10; multi-token bonus +5). Re-weight for v0:
  name exact 60 / prefix 45, aliases exact 35, category exact 10.
- `searchCards(cards, query, terms)`: index → score → filter → stable
  sort (`compareSearchResults`: score desc, then FR `localeCompare` on
  title, then slug).

## 4. Reusable components (copyable)

All sources below are instance-owned `static/` files (not private Core),
safe to port with attribution.

| Component | Source | Notes for v0 |
| --------- | ------ | ------------ |
| Shopping action bar (copy/share/export SVG buttons + planner link) | `static/selection/index.html:9-54` | Inline 36×36 SVGs, `icon-paper`/`icon-ink`/`icon-accent` classes; copy copy+share+export, drop planner link |
| Action + list CSS | `static/selection/style.css` (single minified line; shopping rules asserted in `tests/test_shopping_ux.py:58-70`) | Flat groups (`.shopping-group{padding:0;background:transparent}`), custom checkboxes incl. `:indeterminate` (orange −), `.quantity-chip` pills, strikethrough `.shopping-item--available`, 48px touch rows, ≤600px media query |
| Tri-state checkbox behavior | `static/selection/selection-app.js:104-113` | Set `cb.indeterminate=true` + `aria-checked="mixed"` for partial parents |
| Shopping eval modal | `_site/assets/js/modules/shopping.js:10-115` (`initShoppingModal`) | Native `<dialog>` (`showModal`/`close`, backdrop click), per-recipe eval map, select-all/uncheck-all; Core-generated but generic markup contract (`.eval-item-cb[data-slug]`, `.to-buy-counter`) |
| Toast | `_site/assets/js/modules/utils.js` (`showToast`) | Copy signature only; trivial to reimplement |
| Recipe selection store + events | `_site/assets/js/modules/recipe-selection.js` | `SELECTION_KEY='cookigram:recipe-selection'`, dispatches `cookigram:selection-change`; v0 mirrors with its own key (see §9.2) |
| Empty-fridge illustration | `static/selection/index.html:6-8` → `assets/illustrations/empty-fridge.webp` | Optional empty-state art; binary asset, copy file if wanted |
| ICS calendar export | `static/meal-planner/calendar-export.js` (58 lines, pure) | `buildCalendarExport({placements,selection,weekDates,baseUrl})` → CRLF `VCALENDAR`; v0-out-of-scope but the escape/stamp helpers are the house pattern for any future export |

## 5. Existing shopping-list logic (authoritative semantics)

### 5.1 Availability model — `static/selection/ingredient-availability.js`

Normative semantics (header comment, CookiGram #504/#507):

- `déjà_disponible` is carried by the *ingredient need* of a recipe:
  key `(recipeSlug, variantId, ingredientKey)`.
- NO global inventory / quantitative pantry stock.
- Recipe card and shopping list are two views of the same state.

Storage contract (localStorage):

- Canonical: `AVAILABILITY_STORAGE_KEY =
  "cookigram:ingredient-availability:v1"` → `{ "<slug>:<variant>": {
  "<normalized-key>": true } }` (presence = available; deletion =
  to-buy; empty scopes pruned).
- Key normalization `normalizeIngredientKey`: trim → lowercase → NFD
  strip → `[^a-z0-9]+` → `-` → trim dashes.
- Recipe-page mirrors (compat): `cookigram:<slug>:<variant>:shopping-checked`
  (array), `cookigram:<slug>:main:checked` (array),
  `cookigram:<slug>:shopping-eval` (map slug→bool, `false` = available).
- Migration `migrateLegacyAvailability(storage, selectedRecipes)` imports
  all three legacy shapes plus `cookigram:selection-shopping:v2`.
- Reactivity: `document.dispatchEvent(new CustomEvent(
  "cookigram:availability-change", {detail:{recipeSlug, variantId,
  ingredientKey?, available?}}))` on every mutation; cross-tab via
  `window` `storage` listener (`selection-app.js:160-164`).
- API: `loadAvailability`, `saveAvailability`, `isIngredientAvailable`,
  `setIngredientAvailable`, `toggleIngredientAvailable`,
  `setRecipeIngredientsAvailable`, `makeRecipeScopeKey`.

### 5.2 Quantity parsing + aggregation (same file)

- `parseQuantity(raw)`: `amount unit` → normalized families:
  `mass` (g; kg/g/mg), `volume` (ml; l/dl/cl/ml), `spoon` (ml;
  `c. à soupe`=15, `c. à café`=5 — compatible with `volume`),
  `piece` (bare numbers default here), `specific:<singular>`
  (gousse/tranche/brin/tige/feuille/pincée + plurals); fractions
  (`1/2`) supported via `parseFraction`; anything else → `null`
  (qualitative, never auto-merged except on identical raw strings).
- `formatQuantity(amount, family, baseUnit)`: g→kg ≥1000, ml→l ≥1000,
  round-10 ml→cl, pluralized `pièce(s)`/`specific` units.
- `areQuantitiesCompatible`: same family, or volume↔spoon.
- `consolidateShopping(selectedRecipes, storage)`:
  1. Collect needs from each recipe's `shopping.aisles` (+ `shopping.staples`
     → aisle `Fond de placard`); exclude needs flagged available.
  2. Group by normalized ingredient key; partition each group into
     compatibility buckets (parsed: compatible family; unparsed: identical
     raw string).
  3. Per bucket compute `displayInitial` (total incl. available) and
     `displayRemaining` (to-buy total), `isComplete/isPartial/isEmpty`.
  4. Emit `{key, slug, name, aisle, icon, isSingleBucket,
     parentStatus: empty|partial|complete, buckets, compactLabel, needs,
     recipes[]}`. Single-bucket label = remaining qty (or initial when
     complete); multi-bucket label joins initials with ` + `.
- DOM contract test: `tests/selection-shopping-dom.test.mjs` (node:test,
  mock storage) drives the full empty→partial→complete→empty cycle.

### 5.3 Aggregation source shape — `recipes.json[].shopping`

Built per recipe by Core (observed in `_site/recipes.json`):

```json
{"to_buy_count": 8, "staples_count": 3,
 "aisles": {"Épicerie & Féculents": [
   {"slug": "ail", "name": "Ail", "quantity": "3 gousses",
    "raw_quantity": "3 gousses", "aisle": "Fruits & Légumes",
    "is_staple": false, "icon": "icons/ingredients/ail.svg"}]}}
```

Note: `pantry_staple: true` in `.gram/ingredients.yaml` (23 entries)
feeds `shopping.staples` / `is_staple` — the `Fond de placard`
(replenish-only) lane. v0 has no recipes; it reuses the *bucket
aggregation + tri-state* half of this pipeline over user-entered items.

### 5.4 Aisle normalization + order — `static/selection/selection-app.js:29-74`

`normalizeAisle` maps 12 Core aisle/category labels to 7 display aisles;
unknown → `À vérifier`. Display order:

```js
["Fruits & légumes", "Boucherie & volailles", "Poissonnerie",
 "Crèmerie & œufs", "Épicerie", "Condiments & épices",
 "Fond de placard", "À vérifier"]
```

Within an aisle, items sort by FR `localeCompare`. Rendered as flat
`<section class="shopping-group" data-aisle>` + `<h3>` + `<ul>`,
single-bucket rows as label+checkbox, multi-bucket rows with a
tri-state parent checkbox + per-bucket `.quantity-chip` toggles.

### 5.5 Exportable mechanisms (copyable)

From `selection-app.js:178-207` (consolidated list):

- `shoppingText()`: one `Name : qty` line per to-buy item
  (`quantité non précisée` fallback); multi-bucket joins remaining with
  ` + `. Exports ONLY items to buy (`parentStatus !== "complete"`).
- Copy: `navigator.clipboard.writeText` + `textarea`+`execCommand`
  fallback. Share: `navigator.share({title, text})`, fallback to copy.
  File: `Blob([text], {type:"text/plain;charset=utf-8"})` →
  `courses-cookigram.txt` download.

From `shopping.js:117-238` (per-recipe modal):

- `standard` format: `🛒 Courses · <title>` + `📍 Rayon <aisle> :` groups
  with `☐` ballot boxes + `🧂 Fond de placard` section + page URL.
- `keep` format: bare `Name : qty` lines for Google Keep
  (paste → `⋮` → "Afficher les cases à cocher"), opens `https://keep.new`.

v0 copies the consolidated-list trio (copy/share/.txt) with the `keep`
one-line-per-item shape as the shared text format.

## 6. Culinary icons (copyable)

- Pack: `static/icons/ingredients/*.svg` — 174 files, filenames are
  kebab-case slugs (`carotte.svg`, `ail-des-ours.svg`,
  `amandes-en-poudre.svg`).
- SVG contract (verified in `carotte.svg` body): `viewBox="0 0 32 32"`,
  flat fills + dark outline `stroke="#382a25"`, no text, no external refs
  — safe to inline or `<img>` (selection rows use `<img … loading="lazy">`
  with an empty-span fallback when no icon).
- Resolution (mirrored without Core in `tests/test_icon_coverage.py`,
  which FAILS ON PURPOSE on drift — re-mirror, never silently diverge):
  1. `ICON_FAMILY_BY_SLUG[slug]` — preparation/cut variants share one
     visual (e.g. `ail-en-poudre`→`ail`, `penne`→`pates`,
     `romarin`→`herbes-de-provence`; ~120 mappings, lines 24–190).
  2. Direct `<slug>.svg`.
  3. `CATEGORY_FALLBACK_ICONS[category.casefold()]` (lines 193+;
     e.g. `légumes et aromates`→`oignon`, `boucherie et volailles`→`boeuf`,
     `boissons et liquides`→`eau`).
- v0 strategy: vendor the 174 SVGs + the two tables (frozen at sync SHA)
  into `assets/icons/`, resolve with the same 3-step algorithm.
- Brand icons: `static/icons/icon.svg`, `icon-192.png`, `icon-512.png`
  (PWA icons). Utensil sprites (`kitchen-utensils-sprite*.png/webp`,
  `static/icons/utensils/`) are cook-mode assets — out of scope for v0.

## 7. Recipe/gram format (context only)

- `recipes/*.gram` (~199 files): YAML front-matter (title, dates,
  portions, times, tags, appliances, `scaling`, image + `image_credit` +
  `image_generation` provenance) + Markdown steps with `@ingredient{qty,
  prep}` / `#utensil{}` / `~{duration}` / `^{temperature}` annotations
  (verified in `recipes/blanquette-de-poulet.gram`).
- v0 needs NO gram parsing — recipes arrive only via the pre-aggregated
  `shopping` shape (§5.3) if a future lane imports CookiGram lists.
- Offline pattern: `sw.js` precaches versioned asset URLs
  (`CACHE='cookigram-<sha>'`, `./assets/app.css?v=<sha>`); v0 mirrors
  with its own cache name + versioned catalog snapshot.

## 8. Proposed `data/cookigram-catalog.json` schema

Written ONLY by the catalog sync lane. Frozen arrays + lookup map:

```json
{
  "meta": {
    "schema": 1,
    "source": {
      "repo": "https://github.com/CookiGram/cookigram",
      "ref": "656f2f0dd0a5874cae82b77a60c56385167a4301",
      "fetched_at": "2026-10-02T00:00:00Z",
      "files": {
        ".gram/ingredients.yaml": {"sha256": "<hex>", "entries": 380},
        ".gram/ingredient-provenance.yaml": {"sha256": "<hex>", "entries": 380}
      }
    }
  },
  "aisles": ["Fruits & légumes", "Boucherie & volailles", "Poissonnerie",
             "Crèmerie & œufs", "Épicerie", "Condiments & épices",
             "Fond de placard", "À vérifier"],
  "ingredients": [
    {"slug": "ail", "name": "Ail",
     "aliases": ["ail", "gousse d'ail", "gousses d'ail"],
     "category": "Légumes et aromates", "aisle": "Fruits & légumes",
     "staple": false, "icon": "ail.svg",
     "units": {"piece_weight_g": 5.0, "density": null,
               "conversions": {"gousse": 5.0}},
     "provenance": {"source": "ANSES-CIQUAL", "status": "verified"}}
  ],
  "bySlug": {"ail": 0}
}
```

Sync-lane rules:

- `aisle`: apply `normalizeAisle` (§5.4) to the raw `category`;
  unknown → `À vérifier` (never invent labels).
- `staple`: from `pantry_staple` (default false).
- `icon`: resolved filename via the §6 3-step algorithm, or `""`
  when unresolvable (UI renders the empty-span fallback).
- `bySlug`: slug → index into `ingredients` (built at sync time).
- Omit `nutrition` in v0 (keep the sync extensible: additive keys only).
- Validate before write: every entry has non-empty `slug`/`name`/
  `aliases[]`/`category`/`aisle`; `bySlug` covers all slugs; fail the
  sync otherwise.

## 9. Proposed internal APIs (lanes B–H)

Vanilla ES modules, no bundler (mirror CookiGram's `static/` style:
`import … from "./catalog.js"`, `data-*` hooks, `CustomEvent` reactivity).
All names below are proposals; lanes may rename only by updating this
contract first.

### 9.1 `Catalog` (catalog lane) — read-only snapshot access

```js
import { loadCatalog, getIngredient, searchIndex } from "./catalog.js";
const catalog = await loadCatalog(); // fetch("data/cookigram-catalog.json"), cached
getIngredient(catalog, "ail");       // → entry or undefined (via bySlug)
getIngredient(catalog, "gousse d'ail"); // → same entry (alias map, normalized)
catalogAisleOrder(catalog);          // → meta-independent AISLES order (§5.4)
catalogVersion(catalog);             // → {ref, fetched_at} for the settings/about row
```

### 9.2 `Store` (store lane) — list state, CookiGram-compatible

```js
import { getItems, addItem, toggleItem, setQty, clearChecked,
         subscribe } from "./store.js";
// Item: {id, slug|null, name, qty:"", checked:false, addedAt}
// Storage key: "shopping-list:items:v1" (JSON array; v1 namespace like
// CookiGram's :v1/:v2 suffixed keys). Custom names → slug:null.
// Events: document CustomEvent "shopping-list:change" {detail:{type, id?}}
//   + window "storage" listener for cross-tab (cf. selection-app.js:160-164).
// Quantity strings reuse CookiGram parseQuantity/formatQuantity semantics
// (§5.2, ported to ./quantity.js) for "+"-joined display; no auto-merge
// of user items in v0 (merge only identical normalized name+qty on add).
```

### 9.3 `Search` (search lane) — §3.2 ported to ingredients

```js
import { buildIngredientIndex, searchIngredients } from "./search.js";
// SEARCH_FIELDS = ['name','aliases','category'] with weights
//   name exact 60 / prefix 45, aliases exact 35, category exact 10.
// Reuse normalizeText/tokenize/matchSearch/scoreSearchMatch/
// compareSearchResults signatures from search.js verbatim, renamed
// *Card→*Ingredient. Suggestions listbox: max 8 rows, keyboard
// navigable, └── FR localeCompare tiebreak.
```

### 9.4 UI lanes (app/pwa/qa) — fixed contracts

- Markup hooks: `.search-bar`, `#shopping-search`, `.search-clear`,
  `#shopping-suggestions[role=listbox]`, `[data-shopping-list]`,
  `[data-shopping-item]`, `.quantity-chip`, `[data-copy-shopping]`,
  `[data-share-shopping]`, `[data-export-shopping]` (§3.1, §4, §5.5).
- Text export format = `keep` shape: one `Name : qty` line per unchecked
  item, grouped by aisle with `📍 Rayon <aisle> :` headers in `standard`
  mode; filename `courses.txt`.
- PWA: `manifest.webmanifest` cloned from §2.3 (rename to Shopping List,
  keep `#fffaf1` + `standalone`); `sw.js` precache with
  `CACHE='shopping-list-<catalog-ref7>'` so catalog refreshes bust the
  cache; offline page fallback.
- A11y floor (from CookiGram patterns): `aria-label` on icon-only
  buttons, `aria-live="polite"` on list + suggestions, `aria-checked`
  incl. `mixed` on tri-state parents, 44px+ touch targets, visible
  `:focus-visible` rings.

## 10. Out of scope / non-goals for v0

- Gram parsing, recipes, meal planner, cook mode, timers, nutrition
  display, utensil sprites, multi-theme (light only, §2.1 names kept),
  accounts/backend, barcode scanning, quantity auto-merge across
  differently-worded items.
