"""Regression coverage for a catalog-sync branch already owned by an open PR.

Executes the actual workflow preflight with mocked GitHub/Git responses.
No network, push, PR modification or checkout is performed by these tests.
"""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
REF = "7dffb4475336ad1f3fc733e608e3a154f681de04"
SHORT = REF[:7]
WORKFLOW = ROOT / ".github/workflows/sync-cookigram-catalog.yml"

MOCK_COMMANDS = r"""
git() {
  case "$1" in
    ls-remote)
      if [ "$REMOTE_ERROR" = "1" ]; then return 128; fi
      if [ "$REMOTE_PRESENT" = "1" ]; then
        printf '89e04ecd\trefs/heads/ci/cookigram-catalog-7dffb44\n'
      fi
      ;;
    fetch) return 0 ;;
    show)
      if [ "$2" = "FETCH_HEAD:data/cookigram-catalog.json" ]; then
        cat "$REMOTE_CATALOG"
      elif [ "$2" = "FETCH_HEAD:sw.js" ]; then
        printf 'const CATALOG_REF7 = "%s";\n' "$REMOTE_SW_TOKEN"
      else
        return 96
      fi
      ;;
    *) echo "Unexpected git operation: $*" >&2; return 97 ;;
  esac
}
gh() {
  if [ "$1" != "pr" ] || [ "$2" != "list" ]; then
    echo "Unexpected gh operation: $*" >&2
    return 98
  fi
  printf '%s\n' "$PR_COUNT"
}
"""


class ExistingCatalogSyncBranchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
        steps = workflow["jobs"]["sync"]["steps"]
        step = next(s for s in steps if s["name"] == "Open or update sync PR")
        cls.full_step = step["run"]
        start = "# Sync PR collision guard: begin"
        end = "# Sync PR collision guard: end"
        if cls.full_step.count(start) != 1 or cls.full_step.count(end) != 1:
            raise AssertionError("Sync PR guard markers must occur exactly once")
        cls.guard_script = cls.full_step.split(end, 1)[0].replace(
            "$" + "{{ steps.ref.outputs.sha }}", REF
        ).replace("$" + "{{ steps.ref.outputs.short }}", SHORT)

    def exercise(self, *, present=True, pr_count="1", remote_ref=REF,
                 worker_token=SHORT, ls_error=False):
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            new = json.loads((ROOT / "data/cookigram-catalog.json").read_text(encoding="utf-8"))
            new["meta"]["source"]["ref"] = REF
            remote = json.loads(json.dumps(new))
            remote["meta"]["source"]["ref"] = remote_ref
            remote["meta"]["source"]["fetched_at"] = "2001-01-01T00:00:00Z"
            new_path = tmpdir / "catalog.new.json"
            remote_path = tmpdir / "catalog.remote.json"
            new_path.write_text(json.dumps(new), encoding="utf-8")
            remote_path.write_text(json.dumps(remote), encoding="utf-8")
            env = os.environ.copy()
            env.update({
                "REMOTE_PRESENT": "1" if present else "0",
                "REMOTE_ERROR": "1" if ls_error else "0",
                "REMOTE_CATALOG": str(remote_path),
                "REMOTE_SW_TOKEN": worker_token,
                "PR_COUNT": pr_count,
            })
            script = self.guard_script.replace("/tmp/catalog.new.json", str(new_path))
            return subprocess.run(
                ["bash", "-c", MOCK_COMMANDS + "\n" + script],
                cwd=ROOT, env=env, capture_output=True, text=True, check=False,
            )

    def test_guard_precedes_any_local_branch_commit_or_push(self):
        guard_pos = self.full_step.index("# Sync PR collision guard: begin")
        self.assertLess(guard_pos, self.full_step.index('git checkout -B "$BRANCH"'))
        self.assertLess(guard_pos, self.full_step.index('git push -u origin "$BRANCH"'))
        self.assertNotIn("git push --force", self.full_step)

    def test_matching_open_pr_is_idempotent(self):
        result = self.exercise()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("no push or PR update", result.stdout)

    def test_missing_remote_branch_allows_normal_new_pr_path(self):
        result = self.exercise(present=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("no push or PR update", result.stdout)

    def test_existing_branch_without_matching_open_pr_stops(self):
        result = self.exercise(pr_count="0")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no unique open PR", result.stdout)

    def test_existing_pr_with_divergent_catalog_stops(self):
        result = self.exercise(remote_ref="0" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("different catalog content", result.stdout)

    def test_existing_pr_with_wrong_cache_token_stops(self):
        result = self.exercise(worker_token="0000000")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("mismatched service-worker cache token", result.stdout)

    def test_remote_branch_query_error_stops_closed(self):
        result = self.exercise(ls_error=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("no push or PR update", result.stdout)


if __name__ == "__main__":
    unittest.main()
