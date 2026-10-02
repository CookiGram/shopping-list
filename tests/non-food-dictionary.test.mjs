/* Shopping List — Unit tests & validation for non-culinary dictionary.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dictPath = join(here, "..", "data", "dictionary", "non-food.fr.json");

const ALLOWED_UNITS = new Set(["unit", "pack", "box", "bag", "bottle", "roll"]);
const CANONICAL_CATEGORIES = [
  { id: "cleaning", label: "Entretien" },
  { id: "hygiene", label: "Hygiène" },
  { id: "paper", label: "Papier & consommables" },
  { id: "household", label: "Maison" },
  { id: "pets", label: "Animaux" },
  { id: "health", label: "Santé courante" },
  { id: "baby", label: "Bébé" },
];

const KNOWN_BRANDS = [
  "ariel", "dash", "skip", "le chat", "persil", "cif", "paic", "fairy",
  "canard wc", "harpic", "destop", "calgon", "ouator", "ajax", "carolin",
  "colgate", "signal", "oral-b", "sensodyne", "parodontax", "sanogyl",
  "head & shoulders", "pantene", "dop", "garnier", "l'oréal", "nivea",
  "mon savon", "dove", "palmolive", "le petit marseillais", "tahiti",
  "ushuaïa", "gillette", "wilkinson", "bic", "veet", "venus",
  "pampers", "huggies", "mots d'enfants", "pommette", "mustela",
  "tampax", "always", "nania", "brita", "tupperware",
  "duracell", "energizer", "varta", "panasonic", "philips", "osram",
  "whiskas", "felix", "sheba", "purina", "friskies", "royal canin", "pedigree", "frolic", "cesar",
  "doliprane", "dafalgan", "efferalgan", "advil", "nurofen", "aspegic", "smecta", "imodium"
];

test("non-food dictionary: JSON is parseable and valid schema version/locale", async () => {
  const content = await readFile(dictPath, "utf8");
  assert.doesNotThrow(() => JSON.parse(content), "File should be valid JSON");

  const data = JSON.parse(content);
  assert.equal(data.version, 1, "version must be 1");
  assert.equal(data.locale, "fr-FR", "locale must be fr-FR");
  assert.ok(Array.isArray(data.categories), "categories must be an array");
  assert.ok(Array.isArray(data.items), "items must be an array");
});

test("non-food dictionary: canonical categories match specification", async () => {
  const data = JSON.parse(await readFile(dictPath, "utf8"));
  assert.equal(data.categories.length, CANONICAL_CATEGORIES.length);

  for (let i = 0; i < CANONICAL_CATEGORIES.length; i++) {
    const expected = CANONICAL_CATEGORIES[i];
    const actual = data.categories[i];
    assert.equal(actual.id, expected.id, `Category id mismatch at index ${i}`);
    assert.equal(actual.label, expected.label, `Category label mismatch at index ${i}`);
  }
});

test("non-food dictionary: items count is within realistic target (~100 entries)", async () => {
  const data = JSON.parse(await readFile(dictPath, "utf8"));
  assert.ok(
    data.items.length >= 90 && data.items.length <= 110,
    `Items count ${data.items.length} should be between 90 and 110`,
  );
  assert.equal(data.items.length, 100, "Items count is exactly 100");
});

test("non-food dictionary: every item satisfies structural contracts", async () => {
  const data = JSON.parse(await readFile(dictPath, "utf8"));
  const categoryIds = new Set(data.categories.map((c) => c.id));
  const seenIds = new Set();
  const seenLabels = new Set();
  const idRegex = /^[a-z]+(\.[a-z0-9-]+)+$/;
  const iconRegex = /^[a-z0-9-]+$/;

  for (const [index, item] of data.items.entries()) {
    const context = `item at index ${index} (${item.id || "unidentified"})`;

    // ID contract
    assert.ok(item.id, `Missing id for ${context}`);
    assert.match(item.id, idRegex, `Invalid id format for ${context}`);
    assert.ok(!seenIds.has(item.id), `Duplicate id ${item.id}`);
    seenIds.add(item.id);

    // Category contract
    assert.ok(item.category, `Missing category for ${context}`);
    assert.ok(categoryIds.has(item.category), `Unknown category ${item.category} in ${context}`);
    assert.ok(
      item.id.startsWith(`${item.category}.`),
      `Id ${item.id} must be namespaced with category prefix ${item.category}.`,
    );

    // Label contract
    assert.ok(item.label && item.label.trim().length > 0, `Missing or blank label for ${context}`);
    assert.equal(item.label, item.label.trim(), `Label has untrimmed whitespace: "${item.label}"`);
    assert.ok(!seenLabels.has(item.label), `Duplicate label "${item.label}"`);
    seenLabels.add(item.label);

    // Icon contract
    assert.ok(item.icon && item.icon.trim().length > 0, `Missing icon for ${context}`);
    assert.match(item.icon, iconRegex, `Icon key "${item.icon}" must be kebab-case`);

    // Default unit contract
    assert.ok(
      ALLOWED_UNITS.has(item.default_unit),
      `Invalid default_unit "${item.default_unit}" in ${context}. Allowed: ${[...ALLOWED_UNITS].join(", ")}`,
    );

    // Aliases contract
    assert.ok(Array.isArray(item.aliases), `Aliases must be an array for ${context}`);
    assert.ok(item.aliases.length > 0, `Aliases must not be empty for ${context}`);
    const aliasSet = new Set();
    for (const alias of item.aliases) {
      assert.ok(typeof alias === "string" && alias.trim().length > 0, `Empty alias in ${context}`);
      assert.equal(alias, alias.trim(), `Alias has untrimmed whitespace: "${alias}"`);
      assert.ok(!aliasSet.has(alias.toLowerCase()), `Duplicate alias "${alias}" in ${context}`);
      aliasSet.add(alias.toLowerCase());
    }

    // Tags contract
    assert.ok(Array.isArray(item.tags), `Tags must be an array for ${context}`);
    assert.ok(item.tags.length > 0, `Tags must not be empty for ${context}`);
    const tagSet = new Set();
    for (const tag of item.tags) {
      assert.ok(typeof tag === "string" && tag.trim().length > 0, `Empty tag in ${context}`);
      assert.equal(tag, tag.trim(), `Tag has untrimmed whitespace: "${tag}"`);
      assert.ok(!tagSet.has(tag.toLowerCase()), `Duplicate tag "${tag}" in ${context}`);
      tagSet.add(tag.toLowerCase());
    }
  }
});

test("non-food dictionary: deterministic sorting by id", async () => {
  const data = JSON.parse(await readFile(dictPath, "utf8"));
  const sortedIds = [...data.items.map((i) => i.id)].sort();
  const actualIds = data.items.map((i) => i.id);
  assert.deepEqual(actualIds, sortedIds, "Items must be deterministically sorted by id");
});

test("non-food dictionary: no commercial brand names in labels or aliases", async () => {
  const data = JSON.parse(await readFile(dictPath, "utf8"));

  for (const item of data.items) {
    const labelLower = item.label.toLowerCase();
    for (const brand of KNOWN_BRANDS) {
      assert.ok(
        !labelLower.includes(brand),
        `Item label "${item.label}" contains commercial brand "${brand}"`,
      );
    }

    for (const alias of item.aliases) {
      const aliasLower = alias.toLowerCase();
      for (const brand of KNOWN_BRANDS) {
        assert.ok(
          !aliasLower.includes(brand),
          `Item alias "${alias}" (in ${item.id}) contains commercial brand "${brand}"`,
        );
      }
    }
  }
});

test("non-food dictionary: balanced category distribution", async () => {
  const data = JSON.parse(await readFile(dictPath, "utf8"));
  const counts = {};
  for (const item of data.items) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }

  // Realistic bounds per category
  assert.ok(counts.cleaning >= 15 && counts.cleaning <= 25, `Cleaning count ${counts.cleaning}`);
  assert.ok(counts.hygiene >= 15 && counts.hygiene <= 25, `Hygiene count ${counts.hygiene}`);
  assert.ok(counts.paper >= 8 && counts.paper <= 15, `Paper count ${counts.paper}`);
  assert.ok(counts.household >= 12 && counts.household <= 20, `Household count ${counts.household}`);
  assert.ok(counts.pets >= 8 && counts.pets <= 15, `Pets count ${counts.pets}`);
  assert.ok(counts.health >= 8 && counts.health <= 15, `Health count ${counts.health}`);
  assert.ok(counts.baby >= 8 && counts.baby <= 15, `Baby count ${counts.baby}`);
});

test("non-food dictionary: user-facing labels, categories and tags are in French", async () => {
  const data = JSON.parse(await readFile(dictPath, "utf8"));

  // 1. Categories: all labels are explicitly in French
  const rawEnglishCategories = ["cleaning", "hygiene", "paper", "household", "pets", "health", "baby"];
  for (const cat of data.categories) {
    assert.ok(
      !rawEnglishCategories.includes(cat.label.toLowerCase()),
      `Category label "${cat.label}" must not be raw English`,
    );
  }

  // 2. Known raw English product names that must never be canonical labels
  const FORBIDDEN_ENGLISH_PRODUCT_LABELS = new Set([
    "bleach", "laundry detergent", "dishwasher salt", "dishwasher tablets",
    "dishwashing liquid", "fabric softener", "paper towels", "toilet paper",
    "cat litter", "dog food", "cat food", "baby wipes", "diapers", "trash bags",
    "cotton pads", "dental floss", "conditioner", "toothpaste", "toothbrush",
    "soap", "soap bar", "shaving cream", "shaving foam", "sponges", "sponge",
    "matches", "lighter", "candles", "adhesive bandages", "saline solution",
    "light bulbs", "food storage containers", "wet cat food", "dry cat food",
    "wet dog food", "dry dog food", "sunscreen", "shower gel", "hand cream",
    "lip balm", "mouthwash", "disposable razors", "cotton swabs", "floor cleaner",
    "window cleaner", "multi-surface cleaner", "drain cleaner", "descaler",
    "rubber gloves", "microfiber cloths", "vacuum bags", "coffee filters",
    "baking paper", "aluminum foil", "plastic wrap", "freezer bags",
    "dog waste bags", "pet shampoo", "cat treats", "dog treats"
  ]);

  // Obvious non-French technical nouns that should never appear in a French canonical product label
  const FORBIDDEN_ENGLISH_TOKENS_IN_LABELS = new Set([
    "cleaner", "wipes", "pads", "batteries", "tissues", "towels", "sponge",
    "sponges", "gloves", "bleach", "litter", "diapers", "razors"
  ]);

  // English technical category keys must not be used as tags
  const FORBIDDEN_ENGLISH_TAGS = new Set([
    "cleaning", "household", "pets", "health", "baby", "paper"
  ]);

  // Raw English phrases forbidden in aliases
  const FORBIDDEN_ENGLISH_ALIASES = new Set([
    "cat food", "dog food", "toilet paper", "paper towel", "paper towels",
    "dish soap", "laundry detergent", "baby wipes", "wet wipes", "trash bags",
    "cat litter", "body wash", "hand soap", "patchs allaitement"
  ]);

  for (const item of data.items) {
    const labelLower = item.label.toLowerCase();

    // Invariant: label must not equal technical id suffix (e.g. "bleach", "paper-towels")
    const idSuffix = item.id.split(".").pop();
    assert.notEqual(
      labelLower,
      idSuffix,
      `Label "${item.label}" in ${item.id} must not equal raw technical id suffix`,
    );
    assert.notEqual(
      labelLower,
      idSuffix.replace(/-/g, " "),
      `Label "${item.label}" in ${item.id} must not equal space-separated id suffix`,
    );

    // Invariant: label must not be a known raw English product name
    assert.ok(
      !FORBIDDEN_ENGLISH_PRODUCT_LABELS.has(labelLower),
      `Item label "${item.label}" (${item.id}) must not be raw English`,
    );

    // Invariant: label must not contain forbidden English tokens
    const tokens = labelLower.split(/[^a-zà-ÿ0-9]+/);
    for (const token of tokens) {
      assert.ok(
        !FORBIDDEN_ENGLISH_TOKENS_IN_LABELS.has(token),
        `Item label "${item.label}" (${item.id}) contains forbidden English token "${token}"`,
      );
    }

    // Invariant: tags must not contain raw English category keys
    for (const tag of item.tags) {
      assert.ok(
        !FORBIDDEN_ENGLISH_TAGS.has(tag.toLowerCase()),
        `Item ${item.id} contains English category key as tag: "${tag}"`,
      );
    }

    // Invariant: aliases must not contain raw untranslated English product names
    for (const alias of item.aliases) {
      assert.ok(
        !FORBIDDEN_ENGLISH_ALIASES.has(alias.toLowerCase()),
        `Item ${item.id} contains forbidden English alias: "${alias}"`,
      );
    }
  }
});
