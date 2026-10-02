# Catalog sync (Lane D)

Nightly CI sync of the public CookiGram ingredient catalog into the
vendored snapshot `data/cookigram-catalog.json` (schema: `docs/cookigram-contract.md` §8).

- Workflow: `.github/workflows/sync-cookigram-catalog.yml`
- Script: `scripts/sync-catalog.py`
- Tests: `tests/sync/test_sync.py` (`python3 -m unittest discover -s tests/sync`)
- Runtime: no CookiGram dependency — the app reads only the local snapshot.

## How it works

1. **Resolve ref.** Manual dispatch may pass a pinned 40-hex SHA; otherwise
   the workflow resolves `main` HEAD via `git ls-remote` and pins that SHA
   for the rest of the run. Branch names are never used as fetch refs.
2. **Fetch (public, no auth).** The script downloads the two catalog files
   from `raw.githubusercontent.com` at the pinned SHA, then re-hashes the
   bytes (§1.5.4 discipline).
3. **Validate + transform.** Strict schema validation (fail loudly on
   drift, see below), then transform to the §8 snapshot: slug-sorted
   entries, `bySlug` index, normalized aisles, resolved icon filenames,
   opaque provenance.
4. **Material diff.** Old vs new snapshots are compared ignoring only
   `meta.source.fetched_at`. No material change → silent no-op: no commit,
   no PR, no push.
5. **Tests.** `python3 -m unittest discover -s tests/sync` must pass before
   any PR is opened.
6. **PR (never auto-merge).** The new snapshot is pushed to
   `ci/cookigram-catalog-<shortsha>` and a PR is opened (or the existing
   PR for that branch is updated). A human reviews and merges.

## Provenance fields

Every snapshot records its own lineage in `meta.source`:

| Field | Meaning |
| ----- | ------- |
| `repo` | `https://github.com/CookiGram/cookigram` |
| `ref` | Pinned full commit SHA the files were fetched at |
| `fetched_at` | UTC fetch time (`…Z`); volatile, ignored by material diff |
| `files.<path>.sha256` | SHA256 of the exact fetched bytes |
| `files.<path>.entries` | Slug count parsed from that file |

Per ingredient, `provenance: {source, status}` is copied opaquely from
`.gram/ingredient-provenance.yaml` (e.g. `ANSES-CIQUAL` / `verified`).
Upstream uses two record shapes: legacy `{source, status}` (copied
verbatim) and structured `{sources: [legend-ids], status, …}` (ids are
resolved through the file's top-level `sources` legend to display names
and joined with `"; "`; unknown ids fall back to the raw id).
Slugs with no provenance record get `{"source": "", "status": "unknown"}`
plus a stderr warning — metadata gaps degrade, they never block a sync.
`meta.schema` (currently `1`) versions the snapshot shape; additive keys
only, never renames.

## Validation policy: fail vs degrade

Fail loudly (exit 1, no snapshot, workflow goes red):

- `--ref` is not a 40-hex SHA.
- Fetch failure, invalid YAML, non-mapping `ingredients`.
- Unknown top-level keys or unknown per-entry keys (schema drift).
- Missing/empty `name`, missing/empty/malformed `aliases`.
- Wrong types (`pantry_staple` not boolean, quantities not numbers,
  `conversions`/`nutrition` malformed, unknown nutrition keys).
- Malformed provenance entries (non-mapping, non-string source/status).

Degrade with a stderr warning (sync succeeds):

- Missing/empty `category` → `category: ""`, aisle `À vérifier`.
  Documented deviation from contract §8's fail clause: the audited data
  itself ships one categoriless entry (`vin-blanc`), so failing here
  would break every sync including the seed ref. The §5.4
  unknown→`À vérifier` rule takes precedence; nothing is invented.
- Unknown (but well-formed) category → aisle `À vérifier`.
- Missing provenance record → `{"source": "", "status": "unknown"}`.
- Unresolvable icon → `""` (UI renders the empty-span fallback).

## Transform notes

- **Aisles.** The exact §5.4 `normalizeAisle` table, extended with the 48
  raw catalog categories; lookup is `casefold()`ed (`Épicerie salée` and
  `épicerie salée` map together). Judgement calls: `Poissons et fruits
  de mer` → `Poissonnerie`; `Matières grasses` → `Épicerie` (all members
  are oils); `Poissons, viandes, œufs` → `Poissonnerie` (2/3 fish);
  `Légumineuses` → `Épicerie` (dry goods); `Boissons et condiments` →
  `Épicerie` (cooking wine); `Produits végétaux` → `Crèmerie & œufs`
  (tofu, frais). All verified against the audited catalog body.
- **Staple.** From `pantry_staple`, default `false`; the aisle still comes
  from the category (staples remain shoppable items).
- **Icons.** The §6 3-step algorithm with the family + category-fallback
  tables vendored from CookiGram's public `tests/test_icon_coverage.py`.
  The workflow sparse-checks-out the icon pack at the pinned ref so
  existence is verified against the same commit as the catalog. Without
  `--icons-dir` (local runs), filenames are emitted unverified.
- **Units.** `piece_weight` → `units.piece_weight_g`, `density` →
  `units.density`, `conversions` → `units.conversions` (floats; absent →
  `null`/`{}`).
- **Nutrition is validated but not emitted** in v0 (schema stays
  extensible via additive keys).

## No-overwrite guarantees for Shopping-owned data

1. The script writes exactly one file: the `--out` path (default
   `data/cookigram-catalog.json`), atomically (temp file + rename, no
   stray files left behind). It never reads user data.
2. The workflow `git add`s only that path; sync commits/PRs contain only it.
3. User list items, localStorage keys, settings, and every other file are
   untouched by construction — the sync has no code path that writes them.
4. The runtime app has zero CookiGram dependency: no fetch, no submodule,
   no shared code. Deleting the workflow changes nothing at runtime
   except that the snapshot stops refreshing.
5. Conflict safety: sync PRs touch one generated file; if a human PR
   touches it (it shouldn't — the file is CI-owned), git flags the
   conflict for human resolution instead of overwriting.

## Dependencies and local runs

`ubuntu-latest` needs only `pip install pyyaml` on top of the stock
Python 3. Seed or refresh the snapshot by hand (same command CI uses):

```bash
pip install pyyaml
REF=656f2f0dd0a5874cae82b77a60c56385167a4301  # pinned CookiGram SHA
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/CookiGram/cookigram.git /tmp/cg && \
  git -C /tmp/cg sparse-checkout set static/icons/ingredients && \
  git -C /tmp/cg fetch --depth 1 origin "$REF" && git -C /tmp/cg checkout "$REF"
python3 scripts/sync-catalog.py sync --ref "$REF" \
  --icons-dir /tmp/cg/static/icons/ingredients \
  --out data/cookigram-catalog.json
```

Fully offline (local YAML, still validates + records sha256):

```bash
python3 scripts/sync-catalog.py sync --ref "$REF" \
  --ingredients-file /path/to/ingredients.yaml \
  --provenance-file /path/to/ingredient-provenance.yaml \
  --out /tmp/catalog.json
```

## Troubleshooting

- **Red workflow, "schema drift":** upstream added/renamed keys. Inspect
  the error, update the script's known-key sets + this doc, extend the
  tests, and re-run.
- **Red workflow, fetch errors:** transient network or an invalid manual
  `ref` input. Re-run; dispatch without `ref` to re-resolve HEAD.
- **Stale PR for an old SHA:** each ref gets its own
  `ci/cookigram-catalog-<short>` branch; close superseded PRs when
  merging the newest.
- **Icons all `""`:** the sparse checkout step failed or `--icons-dir`
  was omitted; re-run with the icon pack present.
