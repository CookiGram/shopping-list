#!/usr/bin/env python3
"""Sync the public CookiGram ingredient catalog into a local JSON snapshot.

Reads (READ-ONLY, no auth):
    https://raw.githubusercontent.com/CookiGram/cookigram/<REF>/.gram/ingredients.yaml
    https://raw.githubusercontent.com/CookiGram/cookigram/<REF>/.gram/ingredient-provenance.yaml
where <REF> is a pinned full commit SHA (never a branch name).

Writes exactly one file (default ``data/cookigram-catalog.json``) conforming
to the schema in ``docs/cookigram-contract.md`` §8. Shopping-owned data
(user items, localStorage keys, any other file) is never read or written.

Dependencies (runnable on ``ubuntu-latest``):
    * Python >= 3.10 standard library only, plus
    * ``pyyaml``  (``pip install pyyaml``)

Usage:
    pip install pyyaml
    python3 scripts/sync-catalog.py sync --ref <40-hex-sha> \\
        --icons-dir .cookigram-ref/static/icons/ingredients \\
        --out data/cookigram-catalog.json
    python3 scripts/sync-catalog.py material-diff data/cookigram-catalog.json /tmp/catalog.new.json
    python3 scripts/sync-catalog.py material-diff --summary OLD NEW

Offline / test usage: pass ``--ingredients-file`` + ``--provenance-file``
to read local YAML instead of fetching over HTTPS (sha256 is still
recorded over the bytes read). ``--fetched-at`` pins the timestamp.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - dependency documented above
    sys.stderr.write(
        "error: sync-catalog.py requires pyyaml (pip install pyyaml)\n"
    )
    raise SystemExit(2)

SCHEMA_VERSION = 1
DEFAULT_REPO = "https://github.com/CookiGram/cookigram"
RAW_BASE = "https://raw.githubusercontent.com/CookiGram/cookigram"
INGREDIENTS_PATH = ".gram/ingredients.yaml"
PROVENANCE_PATH = ".gram/ingredient-provenance.yaml"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")

# Display aisles in render order (contract §5.4).
AISLES = [
    "Fruits & légumes",
    "Boucherie & volailles",
    "Poissonnerie",
    "Crèmerie & œufs",
    "Épicerie",
    "Condiments & épices",
    "Fond de placard",
    "À vérifier",
]
_VERIFY = "À vérifier"

# Aisle resolution: exact selection-app.js normalizeAisle map (§5.4) plus
# extensions for raw catalog categories (§1.2). Keys are casefold()ed per
# the contract §1.2 warning (e.g. "Épicerie salée" vs "épicerie salée").
# Judgement calls (documented in docs/catalog-sync.md):
#   * "Poissons et fruits de mer" -> Poissonnerie (display aisle exists).
#   * "Matières grasses" -> Épicerie (all 4 members are oils).
#   * "Poissons, viandes, œufs" -> Poissonnerie (2/3 members are fish).
#   * "Légumineuses" -> Épicerie (dry goods).
#   * "Boissons et condiments" -> Épicerie (single member: cooking wine).
#   * "Produits végétaux" -> Crèmerie & œufs (single member: tofu, frais).
_CATEGORY_TO_AISLE = {
    # --- exact §5.4 normalizeAisle map (Core aisle labels) ---
    "Fruits & Légumes": "Fruits & légumes",
    "Boucherie & Volailles": "Boucherie & volailles",
    "Frais & Crèmerie": "Crèmerie & œufs",
    "Condiments & Épices": "Condiments & épices",
    "Épicerie & Féculents": "Épicerie",
    "Boissons & Vins": "Épicerie",
    "Fond de placard": "Fond de placard",
    "Fruits à coque et graines": "Épicerie",
    "Produits laitiers et matières grasses": "Crèmerie & œufs",
    "Boucherie et volaille": "Boucherie & volailles",
    "Épicerie sucrée": "Épicerie",
    "Conserves et bocaux": "Épicerie",
    "Pâtes et céréales": "Épicerie",
    # --- raw catalog categories (§1.2) not covered above ---
    "Légumes et aromates": "Fruits & légumes",
    "Condiments": "Condiments & épices",
    "Condiments et assaisonnements": "Condiments & épices",
    "Épicerie salée": "Épicerie",
    "Herbes et épices": "Condiments & épices",
    "Poissons et fruits de mer": "Poissonnerie",
    "Boucherie et volailles": "Boucherie & volailles",
    "Féculents et céréales": "Épicerie",
    "Fromages": "Crèmerie & œufs",
    "Céréales et féculents": "Épicerie",
    "Produits céréaliers": "Épicerie",
    "Fruits, légumes, légumineuses et oléagineux": "Fruits & légumes",
    "Fruits": "Fruits & légumes",
    "Boissons et liquides": "Épicerie",
    "Fruits et légumes": "Fruits & légumes",
    "Crèmerie et oeufs": "Crèmerie & œufs",
    "Viandes": "Boucherie & volailles",
    "Matières grasses": "Épicerie",
    "Produits laitiers": "Crèmerie & œufs",
    "Boissons": "Épicerie",
    "Lait et produits laitiers": "Crèmerie & œufs",
    "Produits sucrés": "Épicerie",
    "Charcuterie": "Boucherie & volailles",
    "Boulangerie": "Épicerie",
    "Pâtes et préparations": "Épicerie",
    "Poissons, viandes, œufs": "Poissonnerie",
    "Boissons et alcools": "Épicerie",
    "Épicerie": "Épicerie",
    "Condiments et aides culinaires": "Condiments & épices",
    "Boucherie et charcuterie": "Boucherie & volailles",
    "Légumineuses": "Épicerie",
    "Épices et condiments": "Condiments & épices",
    "Fruits secs": "Épicerie",
    "Produits laitiers et substituts": "Crèmerie & œufs",
    "Viandes et volailles": "Boucherie & volailles",
    "Boissons et condiments": "Épicerie",
    "Charcuterie et traiteur": "Boucherie & volailles",
    "Produits végétaux": "Crèmerie & œufs",
}
CATEGORY_TO_AISLE = {k.casefold(): v for k, v in _CATEGORY_TO_AISLE.items()}

# Vendored mirror of Core's ICON_FAMILY_BY_SLUG, copied from CookiGram's
# public tests/test_icon_coverage.py at ref 656f2f0d (contract §6).
# If upstream changes it, icons drift visibly (wrong/missing art), never
# silently: re-mirror from the pinned ref and note the new SHA here.
ICON_FAMILY_BY_SLUG = {
    "creme-fraiche-epaisse": "creme-fraiche",
    "creme-fraiche-liquide": "creme-fraiche",
    "saumon-frais": "saumon",
    "saumon-fume": "saumon",
    "filet-de-poulet": "poulet",
    "cuisse-de-poulet": "poulet",
    "paleron-de-boeuf": "boeuf",
    "faux-filet": "boeuf",
    "souris-d-agneau": "plat-de-cote-de-boeuf",
    "porc-hache": "porc",
    "filet-mignon-de-porc": "porc",
    "echine-de-porc": "porc",
    "roti-de-porc": "porc",
    "riz-a-risotto": "riz",
    "riz-basmati": "riz",
    "riz-long-blanc": "riz",
    "farfalle": "pates",
    "penne": "pates",
    "torsades": "pates",
    "nouilles-chinoises": "pates",
    "champignons-de-paris": "champignon",
    "concentre-de-tomate": "concentre-tomate",
    "cube-de-bouillon-de-volaille": "bouillon-volaille",
    "cube-de-bouillon": "cube-de-bouillon",
    "cube-de-bouillon-de-boeuf": "cube-de-bouillon",
    "cube-de-bouillon-de-legumes": "cube-de-bouillon",
    "moutarde-de-dijon": "moutarde",
    "persil-frais": "persil",
    "coriandre-fraiche": "coriandre",
    "piment-rouge": "piment",
    "piment-de-cayenne": "piment",
    "curry-en-poudre": "curry",
    "ail-en-poudre": "ail",
    "tomate-cerise": "tomate",
    "tomates-concassees": "tomate",
    "tomates-sechees": "tomate",
    "laurier": "laurier",
    "thym": "thym",
    "lait": "lait",
    "lait-demi-ecreme": "lait",
    "lait-de-soja": "lait",
    "noix-de-muscade": "noix-de-muscade",
    "oeuf": "oeuf",
    "jaune-d-oeuf": "oeuf",
    "miel": "miel",
    "paprika": "paprika",
    "sauce-soja": "sauce-soja",
    "concombre": "concombre",
    "aubergine": "aubergine",
    "courgette": "courgette",
    "chou-fleur": "chou-fleur",
    "petits-pois": "petits-pois",
    "crevettes": "crevettes",
    "feta": "feta",
    "cannelle": "cannelle",
    "cumin": "cumin",
    "curcuma": "curcuma",
    "maizena": "maizena",
    "lentilles-corail": "lentilles-corail",
    "banane": "banane",
    "pomme": "pomme",
    "potiron": "potiron",
    "courge-butternut": "potiron",
    "asperges": "asperges",
    "panais": "panais",
    "mache": "mache",
    "salade-romaine": "salade-romaine",
    "oignon-nouveau": "oignon-nouveau",
    "celeri": "celeri",
    "anchois": "anchois",
    "filet-de-poisson": "filet-de-poisson",
    "langoustines": "langoustines",
    "viande-hachee": "viande-hachee",
    "lardons": "lardons",
    "lard": "lardons",
    "saucisse-fumee": "lardons",
    "jambon-cru": "jambon-cru",
    "chorizo": "chorizo",
    "chataignes": "chataignes",
    "pois-chiches": "pois-chiches",
    "pois-gourmands": "pois-gourmands",
    "lentilles-vertes": "lentilles-vertes",
    "pistaches": "pistaches",
    "pignons-de-pin": "pignons-de-pin",
    "amandes-effilees": "amandes-effilees",
    "chapelure": "chapelure",
    "feuilles-de-lasagne": "feuilles-de-lasagne",
    "pate-seche-a-lasagne": "feuilles-de-lasagne",
    "pain-de-mie": "pain-de-mie",
    "pain-d-epices": "pain-de-mie",
    "emmental-rape": "fromage-rape",
    "fromage-rape": "fromage-rape",
    "sauce-tomate": "sauce-tomate",
    "bechamel": "bechamel",
    "caramel-liquide": "caramel-liquide",
    "jus-de-citron-vert": "jus-de-citron-vert",
    "vin-rouge": "vin-rouge",
    "vinaigre-blanc": "vinaigre-blanc",
    "vinaigre-de-riz": "vinaigre-de-riz",
    "vinaigre-de-vin": "vinaigre-de-vin",
    "aneth": "aneth",
    "cerfeuil": "cerfeuil-frais",
    "estragon": "estragon-frais",
    "herbes-de-provence": "herbes-de-provence",
    "romarin": "herbes-de-provence",
    "gingembre-moulu": "gingembre-moulu",
    "quatre-epices": "quatre-epices",
    "garam-masala": "garam-masala",
    "graine-de-fenouil": "graines-de-fenouil",
    "graine-de-moutarde": "graines-de-moutarde",
    "graine-de-sesame": "graines-de-sesame-blanc",
    "epices-cajun": "epices-cajun",
    "la-vache-qui-rit": "produit-laitier",
    "clou-de-girofle": "clou-de-girofle",
    "mascarpone": "produit-laitier",
    "mozzarella": "produit-laitier",
    "ricotta": "produit-laitier",
    "coriandre-moulue": "coriandre-moulue",
    "croutons": "croutons",
    "capres": "capres",
    "fond-de-legumes": "fond-de-legumes",
    "fond-de-viande": "fond-de-viande",
    "fruits-secs": "fruits-secs",
    "ghee": "ghee",
    "huile-de-coco": "huile-vegetale",
    "huile-de-pepins-de-raisin": "huile-vegetale",
    "huile-de-sesame": "huile-vegetale",
    "huile-vegetale": "huile-vegetale",
    "jus-de-canneberge": "jus-de-canneberge",
    "jus-de-cuisson-sous-vide": "jus-de-cuisson-sous-vide",
    "mais": "mais",
    "olives-vertes": "olives-vertes",
    "olives-noires": "olives-noires",
    "origan": "origan",
    "piment-vert": "piment-vert",
    "harissa": "piment",
    "pate-miso": "pate-miso",
    "pate-tikka": "pate-tikka",
    "sauce-worcestershire": "sauce-worcestershire",
    "sauge": "sauge",
    "sucre-roux": "sucre-roux",
    "tahini": "tahini",
    "whisky": "whisky",
    "kirsch": "whisky",
    "cognac": "whisky",
    "biere-brune": "whisky",
    "vin-de-shaoxing": "whisky",
    "levure-boulangere": "levure-chimique",
    "gousse-de-vanille": "extrait-de-vanille",
    "cacao-en-poudre": "chocolat-noir",
    "copeaux-de-chocolat": "chocolat-noir",
    "chocolat-noir": "chocolat-noir",
    "cerise": "cerise",
    "poivre-vert": "poivre",
    "cepes": "champignon",
    "jarret-de-veau": "boeuf",
    "orange": "jus-d-orange",
    "bouillon-de-volaille": "bouillon-volaille",
    "bouillon-de-legumes": "bouillon-de-legumes",
    "amande-en-poudre": "amandes-en-poudre",
    "basilic-frais": "basilic-frais",
    "poivron": "poivron",
    "poireau": "poireau",
    "parmesan": "parmesan",
    "poulet": "poulet",
}

# Vendored mirror of Core's CATEGORY_FALLBACK_ICONS, same source as above.
# Keys are already casefold()ed upstream.
CATEGORY_FALLBACK_ICONS = {
    "boissons": "eau",
    "boissons et alcools": "whisky",
    "boissons et condiments": "whisky",
    "boissons et liquides": "eau",
    "boucherie et charcuterie": "boeuf",
    "boucherie et volaille": "boeuf",
    "boucherie et volailles": "boeuf",
    "boulangerie": "pain-de-mie",
    "charcuterie": "lardons",
    "charcuterie et traiteur": "lardons",
    "condiments": "epices-cajun",
    "condiments et aides culinaires": "bouillon-volaille",
    "condiments et assaisonnements": "epices-cajun",
    "conserves et bocaux": "concentre-tomate",
    "crèmerie et oeufs": "produit-laitier",
    "céréales et féculents": "riz",
    "fromages": "fromage-rape",
    "fruits": "pomme",
    "fruits et légumes": "pomme",
    "fruits secs": "fruits-secs",
    "fruits à coque et graines": "fruits-secs",
    "fruits, légumes, légumineuses et oléagineux": "pomme",
    "féculents et céréales": "riz",
    "herbes et épices": "herbes-de-provence",
    "lait et produits laitiers": "produit-laitier",
    "légumes et aromates": "oignon",
    "matières grasses": "huile-vegetale",
    "poissons et fruits de mer": "filet-de-poisson",
    "poissons, viandes, œufs": "filet-de-poisson",
    "produits céréaliers": "pain-de-mie",
    "produits laitiers": "produit-laitier",
    "produits laitiers et matières grasses": "produit-laitier",
    "produits laitiers et substituts": "produit-laitier",
    "produits sucrés": "sucre",
    "pâtes et préparations": "pates",
    "viandes": "boeuf",
    "viandes et volailles": "boeuf",
    "épicerie": "farine",
    "épicerie salée": "farine",
    "épicerie sucrée": "sucre",
}

# Strict schema-drift surface (contract §1.5.3): any key outside these sets
# fails the sync loudly instead of being silently ignored.
KNOWN_TOP_LEVEL_KEYS = {"ingredients"}
# The provenance file additionally carries a "sources" legend (source-id ->
# {name, url, usage}); it is recognized but not synced (per-slug
# source/status strings are the opaque metadata v0 needs).
KNOWN_PROVENANCE_TOP_LEVEL_KEYS = {"ingredients", "sources"}
# Provenance entries come in two upstream shapes: legacy {source, status}
# and structured {sources: [legend-ids], status, note?, locked?}.
KNOWN_PROVENANCE_ENTRY_KEYS = {"source", "sources", "status", "note", "locked"}
KNOWN_ENTRY_KEYS = {
    "name", "aliases", "category", "pantry_staple",
    "nutrition", "piece_weight", "density", "conversions",
}
KNOWN_NUTRITION_KEYS = {"calories", "carbs", "fat", "protein"}


class SyncError(Exception):
    """Fatal sync failure: schema drift, fetch failure, or bad input."""


def warn(message: str) -> None:
    sys.stderr.write(f"warning: {message}\n")


def fetch_bytes(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "shopping-list-catalog-sync/1"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except Exception as exc:
        raise SyncError(f"fetch failed for {url}: {exc}") from exc


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def utc_now_zulu() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def normalize_aisle(category: str) -> str:
    """Map a raw catalog category to a display aisle (contract §5.4).

    Lookup is casefold()ed; anything unmapped (including "") resolves to
    "À vérifier" — labels are never invented.
    """
    return CATEGORY_TO_AISLE.get(category.casefold(), _VERIFY)


def resolve_icon(slug: str, category: str, icons_dir: Path | None) -> str:
    """3-step icon resolution (contract §6).

    1. ``ICON_FAMILY_BY_SLUG[slug]`` (variants share one visual),
    2. direct ``<slug>.svg``,
    3. ``CATEGORY_FALLBACK_ICONS[category.casefold()]``.
    With ``icons_dir`` given, each candidate must exist on disk (the
    workflow sparse-checks-out the icon pack at the pinned ref); without
    it, the family/direct filename is emitted unverified. Unresolvable
    entries yield "" (the UI renders the empty-span fallback).
    """
    direct = f"{ICON_FAMILY_BY_SLUG.get(slug, slug)}.svg"
    if icons_dir is None:
        return direct
    if (icons_dir / direct).is_file():
        return direct
    fallback = CATEGORY_FALLBACK_ICONS.get(category.casefold())
    if fallback and (icons_dir / f"{fallback}.svg").is_file():
        return f"{fallback}.svg"
    return ""


def _load_mapping(raw: bytes, label: str) -> dict:
    try:
        doc = yaml.safe_load(raw.decode("utf-8"))
    except Exception as exc:
        raise SyncError(f"{label}: invalid YAML: {exc}") from exc
    if not isinstance(doc, dict):
        raise SyncError(f"{label}: top-level YAML must be a mapping")
    unknown = set(doc) - KNOWN_TOP_LEVEL_KEYS
    if unknown:
        raise SyncError(
            f"{label}: unknown top-level key(s) {sorted(unknown)} "
            "(schema drift — refusing to sync)"
        )
    ingredients = doc.get("ingredients")
    if not isinstance(ingredients, dict):
        raise SyncError(f"{label}: 'ingredients' must be a mapping")
    return ingredients


def _validate_entry(slug: str, entry: object) -> dict:
    if not isinstance(slug, str) or not slug:
        raise SyncError(f"entry {slug!r}: slug must be a non-empty string")
    if not isinstance(entry, dict):
        raise SyncError(f"entry {slug!r}: must be a mapping")
    unknown = set(entry) - KNOWN_ENTRY_KEYS
    if unknown:
        raise SyncError(
            f"entry {slug!r}: unknown key(s) {sorted(unknown)} "
            "(schema drift — refusing to sync)"
        )
    name = entry.get("name")
    if not isinstance(name, str) or not name.strip():
        raise SyncError(f"entry {slug!r}: 'name' must be a non-empty string")
    aliases = entry.get("aliases")
    if (
        not isinstance(aliases, list)
        or not aliases
        or any(not isinstance(a, str) or not a.strip() for a in aliases)
    ):
        raise SyncError(
            f"entry {slug!r}: 'aliases' must be a non-empty list of "
            "non-empty strings"
        )
    category = entry.get("category")
    if category is None:
        # Documented deviation from contract §8's fail clause: the audited
        # data itself ships one categoriless entry (vin-blanc), so a
        # missing/empty category degrades to aisle "À vérifier" per §5.4
        # instead of failing every sync. Loud warning, never silent.
        warn(f"entry {slug!r}: missing category — aisle {_VERIFY!r}")
        category = ""
    elif not isinstance(category, str):
        raise SyncError(f"entry {slug!r}: 'category' must be a string")
    elif not category.strip():
        warn(f"entry {slug!r}: empty category — aisle {_VERIFY!r}")
        category = ""
    staple = entry.get("pantry_staple", False)
    if not isinstance(staple, bool):
        raise SyncError(f"entry {slug!r}: 'pantry_staple' must be a boolean")
    for key in ("piece_weight", "density"):
        value = entry.get(key)
        if value is not None and not _is_number(value):
            raise SyncError(f"entry {slug!r}: {key!r} must be a number")
    conversions = entry.get("conversions")
    if conversions is not None:
        if not isinstance(conversions, dict) or any(
            not isinstance(k, str) or not _is_number(v)
            for k, v in conversions.items()
        ):
            raise SyncError(
                f"entry {slug!r}: 'conversions' must map unit names to numbers"
            )
    nutrition = entry.get("nutrition")
    if nutrition is not None:
        if not isinstance(nutrition, dict):
            raise SyncError(f"entry {slug!r}: 'nutrition' must be a mapping")
        unknown_nut = set(nutrition) - KNOWN_NUTRITION_KEYS
        if unknown_nut:
            raise SyncError(
                f"entry {slug!r}: unknown nutrition key(s) "
                f"{sorted(unknown_nut)} (schema drift — refusing to sync)"
            )
        if any(not _is_number(v) for v in nutrition.values()):
            raise SyncError(
                f"entry {slug!r}: nutrition values must be numbers"
            )
    return {
        "name": name,
        "aliases": list(aliases),
        "category": category,
        "staple": staple,
        "piece_weight": entry.get("piece_weight"),
        "density": entry.get("density"),
        "conversions": dict(conversions) if conversions else {},
    }


def _load_provenance(raw: bytes) -> tuple[dict, dict]:
    """Parse the provenance file into (per-slug records, sources legend)."""
    try:
        doc = yaml.safe_load(raw.decode("utf-8"))
    except Exception as exc:
        raise SyncError(f"{PROVENANCE_PATH}: invalid YAML: {exc}") from exc
    if not isinstance(doc, dict):
        raise SyncError(f"{PROVENANCE_PATH}: top-level YAML must be a mapping")
    unknown = set(doc) - KNOWN_PROVENANCE_TOP_LEVEL_KEYS
    if unknown:
        raise SyncError(
            f"{PROVENANCE_PATH}: unknown top-level key(s) {sorted(unknown)} "
            "(schema drift — refusing to sync)"
        )
    ingredients = doc.get("ingredients")
    if not isinstance(ingredients, dict):
        raise SyncError(f"{PROVENANCE_PATH}: 'ingredients' must be a mapping")
    legend = doc.get("sources") or {}
    if not isinstance(legend, dict):
        raise SyncError(f"{PROVENANCE_PATH}: 'sources' legend must be a mapping")
    for key, value in legend.items():
        if not isinstance(value, dict):
            raise SyncError(
                f"{PROVENANCE_PATH}: legend entry {key!r} must be a mapping"
            )
    return ingredients, legend


def _legend_name(legend: dict, source_id: str) -> str:
    name = legend.get(source_id, {}).get("name")
    return name if isinstance(name, str) and name else source_id


def _provenance_for(slug: str, provenance: dict, legend: dict) -> dict:
    raw = provenance.get(slug)
    if raw is None:
        warn(f"entry {slug!r}: no provenance record — status 'unknown'")
        return {"source": "", "status": "unknown"}
    if not isinstance(raw, dict):
        raise SyncError(f"provenance {slug!r}: must be a mapping")
    unknown = set(raw) - KNOWN_PROVENANCE_ENTRY_KEYS
    if unknown:
        raise SyncError(
            f"provenance {slug!r}: unknown key(s) {sorted(unknown)} "
            "(schema drift — refusing to sync)"
        )
    status = raw.get("status", "unknown")
    if status is None:
        status = "unknown"
    if not isinstance(status, str):
        raise SyncError(f"provenance {slug!r}: 'status' must be a string")
    if raw.get("source") is not None:
        source = raw["source"]
        if not isinstance(source, str):
            raise SyncError(f"provenance {slug!r}: 'source' must be a string")
    elif raw.get("sources") is not None:
        ids = raw["sources"]
        if not isinstance(ids, list) or any(
            not isinstance(i, str) for i in ids
        ):
            raise SyncError(
                f"provenance {slug!r}: 'sources' must be a list of strings"
            )
        source = "; ".join(_legend_name(legend, i) for i in ids)
    else:
        source = ""
    return {"source": source, "status": status}


def build_catalog(
    ingredients_raw: bytes,
    provenance_raw: bytes,
    *,
    repo: str,
    ref: str,
    fetched_at: str,
    icons_dir: Path | None,
) -> dict:
    """Validate the fetched sources and build the §8 snapshot dict."""
    ingredients = _load_mapping(ingredients_raw, INGREDIENTS_PATH)
    provenance, legend = _load_provenance(provenance_raw)

    entries: list[dict] = []
    for slug in sorted(ingredients):
        clean = _validate_entry(slug, ingredients[slug])
        entries.append(
            {
                "slug": slug,
                "name": clean["name"],
                "aliases": clean["aliases"],
                "category": clean["category"],
                "aisle": normalize_aisle(clean["category"]),
                "staple": clean["staple"],
                "icon": resolve_icon(slug, clean["category"], icons_dir),
                "units": {
                    "piece_weight_g": (
                        float(clean["piece_weight"])
                        if clean["piece_weight"] is not None
                        else None
                    ),
                    "density": (
                        float(clean["density"])
                        if clean["density"] is not None
                        else None
                    ),
                    "conversions": {
                        k: float(v)
                        for k, v in clean["conversions"].items()
                    },
                },
                # Opaque metadata for future use; v0 ships no nutrition UI.
                "provenance": _provenance_for(slug, provenance, legend),
            }
        )
    by_slug = {entry["slug"]: index for index, entry in enumerate(entries)}
    if len(by_slug) != len(entries):  # pragma: no cover - defensive
        raise SyncError("duplicate slugs in catalog (refusing to sync)")

    return {
        "meta": {
            "schema": SCHEMA_VERSION,
            "source": {
                "repo": repo,
                "ref": ref,
                "fetched_at": fetched_at,
                "files": {
                    INGREDIENTS_PATH: {
                        "sha256": sha256_hex(ingredients_raw),
                        "entries": len(ingredients),
                    },
                    PROVENANCE_PATH: {
                        "sha256": sha256_hex(provenance_raw),
                        "entries": len(provenance),
                    },
                },
            },
        },
        "aisles": list(AISLES),
        "ingredients": entries,
        "bySlug": by_slug,
    }


def write_catalog(catalog: dict, out: Path) -> None:
    """Atomically write the snapshot (tmp file + rename in the same dir)."""
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    fd, tmp_name = tempfile.mkstemp(
        dir=str(out.parent), prefix=out.name + ".", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(tmp_name, out)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def strip_volatile(catalog: dict) -> dict:
    """Return a copy with volatile fields removed for material comparison.

    Only ``meta.source.fetched_at`` is volatile: identical snapshots
    fetched at different times must compare equal so the workflow stays
    a silent no-op when nothing material changed.
    """
    clone = json.loads(json.dumps(catalog))
    try:
        del clone["meta"]["source"]["fetched_at"]
    except KeyError:
        pass
    return clone


def summarize_changes(old: dict | None, new: dict) -> dict:
    """Slug-level diff summary for PR bodies. Sorted, deterministic."""
    old_entries = (
        {e["slug"]: e for e in old.get("ingredients", [])}
        if isinstance(old, dict)
        else {}
    )
    new_entries = {e["slug"]: e for e in new.get("ingredients", [])}
    added = sorted(set(new_entries) - set(old_entries))
    removed = sorted(set(old_entries) - set(new_entries))
    changed = sorted(
        slug
        for slug in set(old_entries) & set(new_entries)
        if old_entries[slug] != new_entries[slug]
    )
    old_ref = (old or {}).get("meta", {}).get("source", {}).get("ref")
    return {
        "added": added,
        "removed": removed,
        "changed": changed,
        "old_ref": old_ref,
        "new_ref": new.get("meta", {}).get("source", {}).get("ref"),
        "entries": len(new_entries),
    }


def cmd_sync(args: argparse.Namespace) -> int:
    if not SHA_RE.match(args.ref):
        raise SyncError("--ref must be a full 40-hex commit SHA (pinned ref)")
    if bool(args.ingredients_file) != bool(args.provenance_file):
        raise SyncError(
            "--ingredients-file and --provenance-file must be given together"
        )
    if args.ingredients_file:
        ingredients_raw = Path(args.ingredients_file).read_bytes()
        provenance_raw = Path(args.provenance_file).read_bytes()
    else:
        base = args.raw_base.rstrip("/")
        ingredients_raw = fetch_bytes(f"{base}/{args.ref}/{INGREDIENTS_PATH}")
        provenance_raw = fetch_bytes(f"{base}/{args.ref}/{PROVENCE_PATH}")
    # Verify after fetch: re-hash bytes (contract §1.5.4). The hashes are
    # recorded in meta.source.files; any transport corruption fails here
    # via YAML parsing or is pinned permanently in the snapshot.
    catalog = build_catalog(
        ingredients_raw,
        provenance_raw,
        repo=args.repo,
        ref=args.ref,
        fetched_at=args.fetched_at or utc_now_zulu(),
        icons_dir=Path(args.icons_dir) if args.icons_dir else None,
    )
    if args.icons_dir is None:
        warn("no --icons-dir: icon filenames emitted without existence check")
    write_catalog(catalog, Path(args.out))
    print(
        f"synced {len(catalog['ingredients'])} ingredients "
        f"@ {args.ref[:7]} -> {args.out}"
    )
    return 0


def cmd_material_diff(args: argparse.Namespace) -> int:
    old_path = Path(args.old)
    new = json.loads(Path(args.new).read_text(encoding="utf-8"))
    old = (
        json.loads(old_path.read_text(encoding="utf-8"))
        if old_path.is_file()
        else None
    )
    changed = old is None or strip_volatile(old) != strip_volatile(new)
    if args.summary:
        print(json.dumps(summarize_changes(old, new), ensure_ascii=False))
    else:
        print("changed" if changed else "unchanged")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Sync the public CookiGram catalog into data/cookigram-catalog.json"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sync = sub.add_parser("sync", help="fetch, validate, transform, write")
    sync.add_argument("--ref", required=True, help="pinned 40-hex commit SHA")
    sync.add_argument("--repo", default=DEFAULT_REPO)
    sync.add_argument(
        "--raw-base",
        default=RAW_BASE,
        help="raw file base URL (default: %(default)s)",
    )
    sync.add_argument("--out", default="data/cookigram-catalog.json")
    sync.add_argument(
        "--icons-dir",
        default=None,
        help="icon pack dir for existence-checked resolution "
        "(workflow: sparse checkout at the pinned ref)",
    )
    sync.add_argument("--ingredients-file", default=None)
    sync.add_argument("--provenance-file", default=None)
    sync.add_argument("--fetched-at", default=None)
    sync.set_defaults(func=cmd_sync)

    diff = sub.add_parser(
        "material-diff",
        help="compare snapshots ignoring fetched_at; prints changed|unchanged",
    )
    diff.add_argument("old", help="existing snapshot (missing = changed)")
    diff.add_argument("new", help="freshly synced snapshot")
    diff.add_argument(
        "--summary", action="store_true", help="print JSON slug diff instead"
    )
    diff.set_defaults(func=cmd_material_diff)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except SyncError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
