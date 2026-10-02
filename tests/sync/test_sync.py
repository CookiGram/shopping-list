"""Tests for scripts/sync-catalog.py (Lane D, catalog sync).

Stdlib-only (unittest) so the workflow can run them with
``python3 -m unittest discover -s tests/sync`` after ``pip install pyyaml``.
All fixtures are inline; no network access.
"""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "sync-catalog.py"


def load_sync_module():
    spec = importlib.util.spec_from_file_location("sync_catalog", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sync = load_sync_module()

REF = "a" * 40
FETCHED = "2026-10-02T00:00:00Z"

INGREDIENTS_YAML = """\
ingredients:
  ail:
    name: Ail
    aliases: [ail, "gousse d'ail", "gousses d'ail"]
    category: Légumes et aromates
    nutrition: {calories: 131, carbs: 23.5, fat: 0.5, protein: 6.4}
    piece_weight: 5.0
    conversions: {gousse: 5.0}
  ail-en-poudre:
    name: Ail en poudre
    aliases: [ail en poudre]
    category: Condiments
    pantry_staple: true
  huile-olive:
    name: Huile d'olive
    aliases: [huile d'olive]
    category: Matières grasses
    density: 0.91
  vin-blanc:
    name: Vin blanc
    aliases: [vin blanc]
  mystery:
    name: Mystery
    aliases: [mystery]
    category: Some Future Category
"""

PROVENANCE_YAML = """\
ingredients:
  ail: {source: ANSES-CIQUAL, status: verified}
  ail-en-poudre: {source: generic, status: incomplete}
  huile-olive: {source: generic, status: pending}
  mystery: {source: generic, status: estimated}
"""


def build(ingredients=INGREDIENTS_YAML, provenance=PROVENANCE_YAML,
          icons_dir=None, ref=REF, fetched_at=FETCHED):
    return sync.build_catalog(
        ingredients.encode("utf-8"),
        provenance.encode("utf-8"),
        repo=sync.DEFAULT_REPO,
        ref=ref,
        fetched_at=fetched_at,
        icons_dir=icons_dir,
    )


class TransformTests(unittest.TestCase):
    def test_meta_provenance(self):
        catalog = build()
        source = catalog["meta"]["source"]
        self.assertEqual(catalog["meta"]["schema"], 1)
        self.assertEqual(source["repo"], sync.DEFAULT_REPO)
        self.assertEqual(source["ref"], REF)
        self.assertEqual(source["fetched_at"], FETCHED)
        files = source["files"]
        self.assertEqual(files[sync.INGREDIENTS_PATH]["entries"], 5)
        self.assertEqual(files[sync.PROVENANCE_PATH]["entries"], 4)
        for key, raw in ((sync.INGREDIENTS_PATH, INGREDIENTS_YAML),
                         (sync.PROVENANCE_PATH, PROVENANCE_YAML)):
            self.assertEqual(
                files[key]["sha256"],
                sync.sha256_hex(raw.encode("utf-8")),
            )

    def test_entries_sorted_with_byslug_covering_all(self):
        catalog = build()
        slugs = [e["slug"] for e in catalog["ingredients"]]
        self.assertEqual(slugs, sorted(slugs))
        for index, entry in enumerate(catalog["ingredients"]):
            self.assertEqual(catalog["bySlug"][entry["slug"]], index)
        self.assertEqual(set(catalog["bySlug"]), set(slugs))

    def test_full_entry_shape(self):
        catalog = build()
        ail = catalog["ingredients"][catalog["bySlug"]["ail"]]
        self.assertEqual(ail["name"], "Ail")
        self.assertEqual(ail["aliases"], ["ail", "gousse d'ail", "gousses d'ail"])
        self.assertEqual(ail["category"], "Légumes et aromates")
        self.assertEqual(ail["aisle"], "Fruits & légumes")
        self.assertIs(ail["staple"], False)
        self.assertEqual(
            ail["units"],
            {"piece_weight_g": 5.0, "density": None,
             "conversions": {"gousse": 5.0}},
        )
        self.assertEqual(
            ail["provenance"], {"source": "ANSES-CIQUAL", "status": "verified"}
        )
        self.assertNotIn("nutrition", ail)  # v0 omits nutrition

    def test_staple_and_density(self):
        catalog = build()
        by_slug = catalog["bySlug"]
        staple = catalog["ingredients"][by_slug["ail-en-poudre"]]
        self.assertIs(staple["staple"], True)
        self.assertEqual(staple["aisle"], "Condiments & épices")
        oil = catalog["ingredients"][by_slug["huile-olive"]]
        self.assertEqual(oil["units"]["density"], 0.91)
        self.assertIsNone(oil["units"]["piece_weight_g"])
        self.assertEqual(oil["units"]["conversions"], {})
        self.assertEqual(oil["aisle"], "Épicerie")  # oils -> Épicerie

    def test_aisle_mapping_is_casefolded(self):
        catalog = build(
            "ingredients:\n  x:\n    name: X\n    aliases: [x]\n"
            "    category: épicerie salée\n",
            "ingredients: {}\n",
        )
        self.assertEqual(catalog["ingredients"][0]["aisle"], "Épicerie")

    def test_unknown_category_never_invents_labels(self):
        catalog = build()
        mystery = catalog["ingredients"][catalog["bySlug"]["mystery"]]
        self.assertEqual(mystery["category"], "Some Future Category")
        self.assertEqual(mystery["aisle"], "À vérifier")

    def test_missing_category_degrades_to_a_verifier(self):
        catalog = build()
        vin = catalog["ingredients"][catalog["bySlug"]["vin-blanc"]]
        self.assertEqual(vin["category"], "")
        self.assertEqual(vin["aisle"], "À vérifier")

    def test_missing_provenance_defaults(self):
        catalog = build()
        vin = catalog["ingredients"][catalog["bySlug"]["vin-blanc"]]
        self.assertEqual(vin["provenance"], {"source": "", "status": "unknown"})


class ValidationTests(unittest.TestCase):
    def build_single(self, body):
        return build(
            f"ingredients:\n  x:\n{body}", "ingredients: {}\n"
        )

    def test_missing_name_fails(self):
        with self.assertRaises(sync.SyncError):
            self.build_single("    aliases: [x]\n    category: Fruits\n")

    def test_empty_aliases_fails(self):
        bodies = [
            "    name: X\n    category: Fruits\n",  # missing aliases
            "    name: X\n    aliases: []\n    category: Fruits\n",
            "    name: X\n    aliases: ['']\n    category: Fruits\n",
            "    name: X\n    aliases: ok\n    category: Fruits\n",  # not a list
        ]
        for body in bodies:
            with self.subTest(body=body), self.assertRaises(sync.SyncError):
                self.build_single(body)

    def test_unknown_top_level_key_fails(self):
        with self.assertRaises(sync.SyncError):
            build("ingredients: {}\nextra: {}\n", "ingredients: {}\n")
        with self.assertRaises(sync.SyncError):
            build("ingredients: {}\n", "ingredients: {}\nextra: {}\n")

    def test_provenance_sources_legend_is_accepted(self):
        catalog = build(provenance=PROVENANCE_YAML + "sources: {ciqual: {name: X}}\n")
        self.assertEqual(
            catalog["meta"]["source"]["files"][sync.PROVENANCE_PATH]["entries"], 4)

    def test_provenance_sources_list_resolves_via_legend(self):
        provenance = (
            "ingredients:\n"
            "  ail: {status: verified, sources: [ciqual, open-food-facts], note: n, locked: false}\n"
            "  ail-en-poudre: {source: generic, status: incomplete}\n"
            "  huile-olive: {source: generic, status: pending}\n"
            "  mystery: {source: generic, status: estimated}\n"
            "sources:\n"
            "  ciqual: {name: Table Ciqual}\n"
            "  open-food-facts: {name: Open Food Facts}\n"
        )
        catalog = build(provenance=provenance)
        ail = catalog["ingredients"][catalog["bySlug"]["ail"]]
        self.assertEqual(
            ail["provenance"],
            {"source": "Table Ciqual; Open Food Facts", "status": "verified"},
        )

    def test_provenance_unknown_legend_id_falls_back_to_id(self):
        provenance = (
            "ingredients:\n  ail: {status: verified, sources: [nope]}\n"
            "sources: {}\n"
        )
        catalog = build(provenance=provenance)
        ail = catalog["ingredients"][catalog["bySlug"]["ail"]]
        self.assertEqual(ail["provenance"]["source"], "nope")

    def test_unknown_provenance_entry_key_fails(self):
        with self.assertRaises(sync.SyncError):
            build(provenance="ingredients:\n  ail: {status: verified, future: 1}\n")
        with self.assertRaises(sync.SyncError):
            build(provenance="ingredients:\n  ail: {status: verified, sources: ciqual}\n")

    def test_unknown_entry_key_fails(self):
        with self.assertRaises(sync.SyncError):
            self.build_single(
                "    name: X\n    aliases: [x]\n    category: Fruits\n"
                "    future_key: 1\n"
            )

    def test_bad_types_fail(self):
        cases = [
            "    name: X\n    aliases: [x]\n    category: Fruits\n    pantry_staple: yes-please\n",
            "    name: X\n    aliases: [x]\n    category: Fruits\n    piece_weight: heavy\n",
            "    name: X\n    aliases: [x]\n    category: Fruits\n    conversions: [gousse]\n",
            "    name: X\n    aliases: [x]\n    category: Fruits\n    conversions: {gousse: many}\n",
            "    name: X\n    aliases: [x]\n    category: Fruits\n    nutrition: {calories: lots}\n",
            "    name: X\n    aliases: [x]\n    category: Fruits\n    nutrition: {calories: 1, fiber: 2}\n",
        ]
        for body in cases:
            with self.subTest(body=body), self.assertRaises(sync.SyncError):
                self.build_single(body)

    def test_bad_provenance_types_fail(self):
        with self.assertRaises(sync.SyncError):
            build(INGREDIENTS_YAML, "ingredients:\n  ail: [not, a, map]\n")
        with self.assertRaises(sync.SyncError):
            build(INGREDIENTS_YAML,
                  "ingredients:\n  ail: {source: [x], status: verified}\n")

    def test_non_mapping_ingredients_fails(self):
        with self.assertRaises(sync.SyncError):
            build("ingredients: []\n", "ingredients: {}\n")
        with self.assertRaises(sync.SyncError):
            build("[]\n", "ingredients: {}\n")

    def test_ref_must_be_pinned_sha(self):
        parser = sync.build_parser()
        with self.assertRaises(sync.SyncError):
            sync.cmd_sync(parser.parse_args(
                ["sync", "--ref", "main", "--out", "/tmp/x.json"]))
        with self.assertRaises(sync.SyncError):
            sync.cmd_sync(parser.parse_args(
                ["sync", "--ref", "abc", "--out", "/tmp/x.json"]))


class IconResolutionTests(unittest.TestCase):
    def test_family_direct_and_fallback_with_icons_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            icons = Path(tmp)
            (icons / "ail.svg").write_text("<svg/>")
            (icons / "pates.svg").write_text("<svg/>")
            (icons / "oignon.svg").write_text("<svg/>")
            # direct hit
            self.assertEqual(
                sync.resolve_icon("ail", "Légumes et aromates", icons), "ail.svg")
            # family map: penne -> pates.svg
            self.assertEqual(
                sync.resolve_icon("penne", "Féculents et céréales", icons),
                "pates.svg")
            # category fallback: unknown slug + known category
            self.assertEqual(
                sync.resolve_icon("not-a-slug", "Légumes et aromates", icons),
                "oignon.svg")
            # unresolvable: unknown slug + unknown category
            self.assertEqual(
                sync.resolve_icon("not-a-slug", "Some Future Category", icons),
                "")
            # unresolvable: empty category, no direct file
            self.assertEqual(sync.resolve_icon("not-a-slug", "", icons), "")

    def test_without_icons_dir_emits_logical_filename(self):
        self.assertEqual(
            sync.resolve_icon("penne", "Féculents et céréales", None), "pates.svg")
        self.assertEqual(
            sync.resolve_icon("ail", "Légumes et aromates", None), "ail.svg")


class MaterialDiffTests(unittest.TestCase):
    def test_fetched_at_only_is_unchanged(self):
        old = build(fetched_at="2026-01-01T00:00:00Z")
        new = build(fetched_at="2026-10-02T00:00:00Z")
        self.assertEqual(sync.strip_volatile(old), sync.strip_volatile(new))
        summary = sync.summarize_changes(old, new)
        self.assertEqual(
            (summary["added"], summary["removed"], summary["changed"]),
            ([], [], []),
        )

    def test_added_removed_changed_detected(self):
        old = build()
        changed_yaml = INGREDIENTS_YAML.replace(
            "  mystery:\n    name: Mystery\n    aliases: [mystery]\n"
            "    category: Some Future Category\n",
            "  newcomer:\n    name: Newcomer\n    aliases: [newcomer]\n"
            "    category: Fruits\n",
        ).replace("    category: Condiments\n", "    category: Épicerie\n", 1)
        new = build(ingredients=changed_yaml)
        summary = sync.summarize_changes(old, new)
        self.assertEqual(summary["added"], ["newcomer"])
        self.assertEqual(summary["removed"], ["mystery"])
        self.assertEqual(summary["changed"], ["ail-en-poudre"])
        self.assertNotEqual(
            sync.strip_volatile(old), sync.strip_volatile(new))


class WriteAndCliTests(unittest.TestCase):
    def test_write_is_atomic_and_only_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "sub" / "catalog.json"
            catalog = build()
            sync.write_catalog(catalog, out)
            self.assertEqual(
                json.loads(out.read_text(encoding="utf-8")), catalog)
            leftovers = [p for p in Path(tmp).rglob("*") if p.is_file()]
            self.assertEqual(leftovers, [out])  # no tmp files left behind

    def test_sync_cli_offline_with_local_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            ing = tmp_path / "ingredients.yaml"
            prov = tmp_path / "provenance.yaml"
            ing.write_text(INGREDIENTS_YAML, encoding="utf-8")
            prov.write_text(PROVENANCE_YAML, encoding="utf-8")
            out = tmp_path / "catalog.json"
            proc = subprocess.run(
                [sys.executable, str(SCRIPT), "sync", "--ref", REF,
                 "--ingredients-file", str(ing),
                 "--provenance-file", str(prov),
                 "--fetched-at", FETCHED, "--out", str(out)],
                capture_output=True, text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            catalog = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(len(catalog["ingredients"]), 5)
            self.assertEqual(catalog["meta"]["source"]["ref"], REF)

    def test_material_diff_cli_missing_old_means_changed(self):
        with tempfile.TemporaryDirectory() as tmp:
            new = Path(tmp) / "new.json"
            new.write_text(json.dumps(build()), encoding="utf-8")
            proc = subprocess.run(
                [sys.executable, str(SCRIPT), "material-diff",
                 str(Path(tmp) / "missing.json"), str(new)],
                capture_output=True, text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertEqual(proc.stdout.strip(), "changed")
            proc = subprocess.run(
                [sys.executable, str(SCRIPT), "material-diff",
                 "--summary", str(new), str(new)],
                capture_output=True, text=True,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            summary = json.loads(proc.stdout)
            self.assertEqual(
                (summary["added"], summary["removed"], summary["changed"]),
                ([], [], []),
            )


if __name__ == "__main__":
    unittest.main()
