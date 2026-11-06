"""Regression tests for catalog-driven service worker cache invalidation."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check-sw-catalog-version.py"
SPEC = importlib.util.spec_from_file_location("cache_version", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CacheVersionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.catalog = root / "catalog.json"
        self.worker = root / "sw.js"
        self.worker.write_text('const CATALOG_REF7 = "abcdef0";\nconst CACHE = `shopping-list-${CATALOG_REF7}`;\n', encoding="utf-8")
        self.set_ref("1" * 40)

    def set_ref(self, ref):
        self.catalog.write_text(json.dumps({"meta": {"source": {"ref": ref}}}), encoding="utf-8")

    def test_mismatch_fails_without_mutating_worker(self):
        original = self.worker.read_bytes()
        with self.assertRaisesRegex(ValueError, "does not match"):
            MODULE.reconcile(self.catalog, self.worker)
        self.assertEqual(self.worker.read_bytes(), original)

    def test_update_then_check_and_next_catalog_version(self):
        self.assertTrue(MODULE.reconcile(self.catalog, self.worker, write=True))
        self.assertFalse(MODULE.reconcile(self.catalog, self.worker))
        self.assertIn('CATALOG_REF7 = "1111111"', self.worker.read_text())
        self.set_ref("2" * 40)
        with self.assertRaises(ValueError):
            MODULE.reconcile(self.catalog, self.worker)
        self.assertTrue(MODULE.reconcile(self.catalog, self.worker, write=True))
        self.assertIn('CATALOG_REF7 = "2222222"', self.worker.read_text())

    def test_invalid_ref_and_missing_declaration_fail_closed(self):
        self.set_ref("branch-name")
        with self.assertRaisesRegex(ValueError, "40-hex"):
            MODULE.reconcile(self.catalog, self.worker, write=True)
        self.set_ref("3" * 40)
        self.worker.write_text("const CACHE = 'shopping-list';\n")
        with self.assertRaisesRegex(ValueError, "exactly one"):
            MODULE.reconcile(self.catalog, self.worker, write=True)

    def test_activate_only_cleans_shopping_list_caches(self):
        worker = (Path(__file__).resolve().parents[2] / "sw.js").read_text(encoding="utf-8")
        self.assertIn(
            'keys.filter((k) => k.startsWith("shopping-list-") && k !== CACHE)',
            worker,
            "never evict other PWAs sharing this origin",
        )


if __name__ == "__main__":
    unittest.main()
