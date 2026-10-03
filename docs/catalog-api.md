# Catalog API — frozen for Lane E (Lane C)

Read-only catalog access for the Shopping List PWA. Vanilla ES module,
no dependencies, no backend, no runtime reads of CookiGram files.

## Files

| Path | Owner | Content |
| ---- | ----- | ------- |
| `js/catalog.js` | Lane C | This API |
| `data/cookigram-catalog.json` | Lane C (sync output) | 379 culinary ingredients, schema §8 of `cookigram-contract.md` |
| `data/shopping-dict.json` | Lane C (authored) | Shopping-owned additions (household and selected packaged products) |
| `data/product-variants.json` | Shopping List | Local package choices attached to canonical catalog slugs |
| `data/aisles.json` | Lane C | Static default category→aisle mapping |

## Snapshot provenance

`cookigram-catalog.json → meta.source`:

- `repo`: `https://github.com/CookiGram/cookigram`
- `ref`: `656f2f0dd0a5874cae82b77a60c56385167a4301`
  (commit date `2026-09-26 11:43:31 +0200`)
- `origin`: `local-checkout` (same bytes as a pinned-`ref` raw fetch)
- `files`: sha256 + parsed entry counts (379/379) for
  `.gram/ingredients.yaml` and `.gram/ingredient-provenance.yaml`
- `meta.notes`: upstream data-quality exceptions (see § Data quality)

`catalogVersion()` / `catalogSources()` expose this block to the UI.

## Entry shapes

Culinary (exact §8 schema):

```json
{"slug": "ail", "name": "Ail", "aliases": ["ail", "gousse d'ail"],
 "category": "Légumes et aromates", "aisle": "Fruits & légumes",
 "staple": false, "icon": "ail.svg",
 "units": {"piece_weight_g": 5.0, "density": null,
           "conversions": {"gousse": 5.0}},
 "provenance": {"source": "ciqual", "status": "verified"}}
```

Household (`shopping-dict.json`):

```json
{"slug": "lessive", "name": "Lessive",
 "aliases": ["lessive liquide", "capsules lessive"],
 "category": "Linge", "aisle": "Maison & entretien",
 "tags": ["linge"], "icon": ""}
```

Both files carry a `bySlug` index map. `icon` is a filename from
CookiGram `static/icons/ingredients/` at the sync `ref`, or `""`
(UI renders the empty-span fallback). 172 distinct SVGs are referenced;
the UI lane vendors them into `assets/icons/`.

## Product variants

`product-variants.json` keeps package choices separate from the synced
CookiGram snapshot. Each row references one canonical `canonical_slug` and
provides a stable `id`, compact `label`, numeric `quantity`, `unit`, package
`format`, local `icon`, optional display `product_label`, and search
`aliases`. The search view expands a canonical product with variants into
selectable rows that inherit its
category, aisle, tags, and provenance. It does not add catalog products such
as “oeufs x6”.

The list stores the canonical `slug` plus optional `variantId`; its display
name includes the chosen package label. This remains backward-compatible with
existing localStorage rows and keeps package icons resolvable after reload.

## Aisle order

`catalogAisleOrder()` returns culinary aisles, then household aisles,
fallback last:

1. Fruits & légumes (74)
2. Boucherie & volailles (33)
3. Poissonnerie (16)
4. Crèmerie & œufs (42)
5. Épicerie (112)
6. Condiments & épices (101)
7. Fond de placard (0 — reserved for the staple lane, see below)
8. Maison & entretien
9. Hygiène & beauté
10. Bébé & enfants
11. Animalerie
12. À vérifier (1)

`staple: true` (23 entries) is kept as a flag, NOT forced into
`Fond de placard`: CookiGram routes staples there only in its recipe
shopping view (`shopping.staples`), while the snapshot `aisle` always
reflects the ingredient's category. The UI lane decides how to surface
staples.

## Category → aisle mapping (`data/aisles.json`)

Lookup order in `defaultAisleForCategory()`: exact key → casefolded key
→ household category scan → `"À vérifier"`. `slugOverrides` wins over
the category map at sync time.

`via: cookigram` = 1:1 port of `normalizeAisle` in CookiGram
`static/selection/selection-app.js` (keys casefolded; Core aisle labels
kept so a future recipe import still resolves). `via: lane-c` =
extensions for raw `.gram` categories — all values stay inside the 8
fixed culinary labels, none invented.

| raw category (casefolded key) | aisle | via | entries |
| ---- | ---- | ---- | ---- |
| `fruits & légumes` | Fruits & légumes | cookigram | 0 |
| `boucherie & volailles` | Boucherie & volailles | cookigram | 0 |
| `frais & crèmerie` | Crèmerie & œufs | cookigram | 0 |
| `condiments & épices` | Condiments & épices | cookigram | 0 |
| `épicerie & féculents` | Épicerie | cookigram | 0 |
| `boissons & vins` | Épicerie | cookigram | 0 |
| `fond de placard` | Fond de placard | cookigram | 0 |
| `fruits à coque et graines` | Épicerie | cookigram | 16 |
| `produits laitiers et matières grasses` | Crèmerie & œufs | cookigram | 12 |
| `boucherie et volaille` | Boucherie & volailles | cookigram | 5 |
| `épicerie sucrée` | Épicerie | cookigram | 6 |
| `conserves et bocaux` | Épicerie | cookigram | 5 |
| `pâtes et céréales` | Épicerie | cookigram | 0 |
| `légumes et aromates` | Fruits & légumes | lane-c | 52 |
| `fruits` | Fruits & légumes | lane-c | 7 |
| `fruits et légumes` | Fruits & légumes | lane-c | 7 |
| `fruits, légumes, légumineuses et oléagineux` | Fruits & légumes | lane-c | 8 |
| `boucherie et volailles` | Boucherie & volailles | lane-c | 15 |
| `boucherie et charcuterie` | Boucherie & volailles | lane-c | 2 |
| `viandes` | Boucherie & volailles | lane-c | 5 |
| `viandes et volailles` | Boucherie & volailles | lane-c | 1 |
| `charcuterie` | Boucherie & volailles | lane-c | 3 |
| `charcuterie et traiteur` | Boucherie & volailles | lane-c | 1 |
| `poissons et fruits de mer` | Poissonnerie | lane-c | 16 |
| `crèmerie et oeufs` | Crèmerie & œufs | lane-c | 5 |
| `fromages` | Crèmerie & œufs | lane-c | 9 |
| `lait et produits laitiers` | Crèmerie & œufs | lane-c | 4 |
| `matières grasses` | Crèmerie & œufs | lane-c | 4 |
| `produits laitiers` | Crèmerie & œufs | lane-c | 6 |
| `produits laitiers et substituts` | Crèmerie & œufs | lane-c | 1 |
| `produits végétaux` | Crèmerie & œufs | lane-c | 1 |
| `épicerie` | Épicerie | lane-c | 2 |
| `épicerie salée` | Épicerie | lane-c | 27 |
| `produits sucrés` | Épicerie | lane-c | 3 |
| `produits céréaliers` | Épicerie | lane-c | 8 |
| `céréales et féculents` | Épicerie | lane-c | 9 |
| `féculents et céréales` | Épicerie | lane-c | 13 |
| `pâtes et préparations` | Épicerie | lane-c | 3 |
| `boulangerie` | Épicerie | lane-c | 3 |
| `fruits secs` | Épicerie | lane-c | 1 |
| `légumineuses` | Épicerie | lane-c | 2 |
| `boissons` | Épicerie | lane-c | 4 |
| `boissons et alcools` | Épicerie | lane-c | 2 |
| `boissons et liquides` | Épicerie | lane-c | 7 |
| `condiments` | Condiments & épices | lane-c | 44 |
| `condiments et assaisonnements` | Condiments & épices | lane-c | 34 |
| `condiments et aides culinaires` | Condiments & épices | lane-c | 2 |
| `épices et condiments` | Condiments & épices | lane-c | 2 |
| `herbes et épices` | Condiments & épices | lane-c | 17 |
| `boissons et condiments` | Condiments & épices | lane-c | 1 |

Slug overrides (mixed upstream category `Poissons, viandes, œufs`):

| slug | aisle | rationale |
| ---- | ----- | --------- |
| `thon` | Épicerie | thon au naturel = conserve |
| `anchois` | Condiments & épices | filets à l'huile = condiment |
| `jambon-cru` | Boucherie & volailles | charcuterie |

Household categories (17): Bucco-dentaire, Change, Chats, Cheveux,
Chiens, Consommables cuisine, Corps, Entretien maison, Hygiène intime,
Linge, Papier maison, Pharmacie, Rasage, Repas bébé, Soins,
Toilette bébé, Vaisselle.

## JS API (`js/catalog.js`)

```js
import {
  loadCatalog, getIngredient, getDictEntry, findEntry, allEntries,
  catalogAisleOrder, aisleRank, catalogVersion, catalogSources,
  catalogCategories, catalogTags, entriesByTag,
  defaultAisleForCategory, normalizeKey,
} from "./catalog.js";

const catalog = await loadCatalog();          // cached; loads 3 JSON files
getIngredient(catalog, "gousse d'ail");       // → ail entry (alias, normalized)
getIngredient(catalog, "GOUSSE D'AIL");       // → same (diacritic/case-folded)
getDictEntry(catalog, "sopalin");             // → essuie-tout household entry
findEntry(catalog, "ail");                    // → {kind: "culinary", entry}
findEntry(catalog, "sacs poubelle");          // → {kind: "household", entry}
allEntries(catalog);                          // → 427 [{kind, entry}] for indexing
catalogAisleOrder(catalog);                   // → 12 aisles (see above)
aisleRank(catalog, "Épicerie");               // → 4 (unknown → order.length)
catalogVersion(catalog);                      // → {ref, fetched_at, commit_date}
catalogSources(catalog);                      // → {cookigram, dict} provenance
catalogCategories(catalog);                   // → {culinary: [...47], household: [...17]}
                                              // (47 = 48 raw minus vin-blanc's "")
catalogTags(catalog);                         // → sorted unique household tags
entriesByTag(catalog, "bébé");                // → household entries tagged bébé
defaultAisleForCategory(catalog, "Légumes et aromates"); // → "Fruits & légumes"
defaultAisleForCategory(catalog, "nope");     // → "À vérifier"
normalizeKey("Gousse   d'Ail");               // → "gousse d'ail"
```

Notes:

- `loadCatalog({fetchImpl, baseUrl})` — optional injection for tests;
  default base is `../data/` relative to the module.
- `findEntry` resolves ties culinary-first; within one source the
  first alias registration wins (slugs are unique, so ties are rare).
- Names `loadCatalog` / `getIngredient` / `catalogAisleOrder` /
  `catalogVersion` are kept verbatim from `cookigram-contract.md` §9.1.

## Data quality (upstream exceptions)

1. `sirop-d-erable` is duplicated in `.gram/ingredients.yaml`
   (~line 651 `Condiments`, ~line 1416 `Épicerie sucrée`); YAML keeps
   the last → snapshot category `Épicerie sucrée`. 380 raw keys,
   379 unique slugs.
2. `vin-blanc` has `category: null` upstream → `category: ""`,
   aisle `À vérifier` (sole empty-category exception).
3. Upstream provenance uses `source:` (string) or `sources:` (list);
   28 `sources: [ciqual]` entries are flattened to `"ciqual"`.
4. Culinary-adjacent consumables (`papier-aluminium`,
   `papier-sulfurise`) already exist upstream and are intentionally
   NOT duplicated in `shopping-dict.json`.

## Refresh guidance (future sync lane)

Re-run the snapshot from a pinned CookiGram `ref` (full 40-hex SHA,
never a branch), re-hash both source files, rebuild with the same
rules (casefold category map → overrides → `À vérifier`; icon
3-step resolution against `tests/test_icon_coverage.py` tables at that
ref), and fail loudly on schema drift (missing `name`/`aliases`,
unknown top-level keys). Record the new `ref`/`fetched_at`/sha256 in
`meta.source` and bump the service-worker cache name.
