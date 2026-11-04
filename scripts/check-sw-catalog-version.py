#!/usr/bin/env python3
"""Keep the offline cache version aligned with the pinned CookiGram catalog."""

import argparse
import json
import re
from pathlib import Path

TOKEN = re.compile(r'(?m)^(const CATALOG_REF7 = ")[0-9a-f]{7}(";)')
REF = re.compile(r"^[0-9a-f]{40}$")


def reconcile(catalog: Path, worker: Path, *, write: bool = False) -> bool:
    data = json.loads(catalog.read_text(encoding="utf-8"))
    ref = data["meta"]["source"]["ref"]
    if not isinstance(ref, str) or not REF.fullmatch(ref):
        raise ValueError("catalog meta.source.ref must be a pinned 40-hex SHA")
    content = worker.read_text(encoding="utf-8")
    updated, count = TOKEN.subn(lambda match: match.group(1) + ref[:7] + match.group(2), content)
    if count != 1:
        raise ValueError("expected exactly one CATALOG_REF7 declaration in sw.js")
    if updated == content:
        return False
    if not write:
        raise ValueError(f"sw.js cache version does not match catalog ref {ref[:7]}")
    worker.write_text(updated, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=Path("data/cookigram-catalog.json"))
    parser.add_argument("--worker", type=Path, default=Path("sw.js"))
    parser.add_argument("--write", action="store_true", help="update the worker in the sync branch")
    args = parser.parse_args()
    try:
        changed = reconcile(args.catalog, args.worker, write=args.write)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")
    print("UPDATED: service worker cache version" if changed else "PASS: service worker cache version matches catalog")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
