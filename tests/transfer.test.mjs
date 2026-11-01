import test from "node:test";
import assert from "node:assert/strict";
import { applyTransfer, parseTransferHash, undoTransfer, validateTransfer, TRANSFER_LEDGER_KEY } from "../js/transfer.js";
import { STORE_KEYS, configureStore, getFrequency, getItems } from "../js/store.js";
import { readFile } from "node:fs/promises";

const payload = (overrides = {}) => ({
  type: "cookigram.shopping-transfer", version: 1,
  transferId: "123e4567-e89b-42d3-a456-426614174000",
  createdAt: "2026-10-31T12:00:00Z",
  items: [{ name: "Ail", qty: "3 gousses", slug: "ail",
    recipe: { id: "ratatouille", name: "Ratatouille", url: "https://cookigram.github.io/cookigram/recettes/ratatouille/" } }],
  ...overrides,
});
const storage = ({ failSet = () => false } = {}) => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failSet(key, String(value))) throw new Error("QuotaExceededError");
      values.set(key, String(value));
    },
    removeItem: (key) => values.delete(key), values };
};
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

test("transfer fragment decodes v1 payload and validates its provenance origin", () => {
  const result = parseTransferHash(`#cookigram-transfer=${base64url(payload())}`);
  assert.equal(result.items[0].recipe.name, "Ratatouille");
  assert.equal(result.items[0].recipe.url, "https://cookigram.github.io/cookigram/recettes/ratatouille/");
  assert.equal(parseTransferHash("#other=value"), null);
  assert.throws(() => validateTransfer(payload({ version: 2 })), /non reconnu/);
  assert.throws(() => validateTransfer(payload({ items: Array(101).fill({ name: "A" }) })), /non reconnu/);
  assert.throws(() => validateTransfer(payload({ items: [{ name: "A", recipe: { id: "a", name: "A", url: "https://evil.example/" } }] })), /non autorisé/);
  assert.throws(() => validateTransfer(payload({ items: [{ name: "A", recipe: { id: "a", name: "A", url: "http://cookigram.github.io/other/" } }] })), /non autorisé/);
  assert.throws(() => validateTransfer(payload({ items: [{ name: "A", recipe: { id: "a", name: "A", url: "https://cookigram.github.io.evil/other/" } }] })), /non autorisé/);
  assert.throws(() => validateTransfer(payload({ items: [{ name: "A", recipe: { id: "a", name: "A", url: "https://user@cookigram.github.io/other/" } }] })), /non autorisé/);
  const otherPath = validateTransfer(payload({ items: [{ name: "A", recipe: {
    id: "a", name: "A", url: "https://cookigram.github.io/another-app/recipes/thing?q=x#part",
  } }] }));
  assert.equal(otherPath.items[0].recipe.url, "https://cookigram.github.io/another-app/recipes/thing?q=x#part");
  const rootUrl = validateTransfer(payload({ items: [{ name: "A", recipe: {
    id: "a", name: "A", url: "https://cookigram.github.io",
  } }] }));
  assert.equal(rootUrl.items[0].recipe.url, "https://cookigram.github.io/");
  const defaultPort = validateTransfer(payload({ items: [{ name: "A", recipe: {
    id: "a", name: "A", url: "https://cookigram.github.io:443/recipes/thing",
  } }] }));
  assert.equal(defaultPort.items[0].recipe.url, "https://cookigram.github.io/recipes/thing");
  assert.throws(() => validateTransfer(payload({ items: [{ name: "A", recipe: {
    id: "a", name: "A", url: "https://cookigram.github.io:8443/recipes/thing",
  } }] })), /non autorisé/);
  const broadSlug = "réf/avec?ponctuation#ok";
  assert.equal(validateTransfer(payload({ items: [{ name: "A", slug: broadSlug }] })).items[0].slug, broadSlug);
  assert.equal(validateTransfer(payload({ items: [{ name: "A", slug: "x".repeat(100) }] })).items[0].slug.length, 100);
  assert.throws(() => validateTransfer(payload({ items: [{ name: "A", slug: "x".repeat(101) }] })), /article.*invalide/);
  const unicodeSlug = "🛒".repeat(51);
  assert.equal([...validateTransfer(payload({ items: [{ name: "A", slug: unicodeSlug }] })).items[0].slug].length, 51);
  assert.throws(() => validateTransfer(payload({ items: [{ name: "A", slug: "🛒".repeat(101) }] })), /article.*invalide/);
  assert.throws(() => validateTransfer(payload({ items: [{ name: "A", slug: "" }] })), /article.*invalide/);
  assert.throws(() => parseTransferHash("#cookigram-transfer=%%%"));
});

test("transfer is additive, deduped, idempotent, and undo removes only its untouched additions", () => {
  const db = storage();
  configureStore({ storage: db });
  const existing = { id: "existing", slug: null, name: "Lait", qty: "1 l", checked: false,
    addedAt: 1, provenance: { source: "custom" } };
  db.setItem(STORE_KEYS.items, JSON.stringify([existing]));
  const items = getItems();
  const result = applyTransfer(payload({ items: [
    { name: "Lait", qty: "1 l" }, payload().items[0],
  ] }), { storage: db });
  assert.equal(result.added.length, 1);
  assert.equal(result.skipped, 1);
  assert.equal(items[0].name, "Lait");
  assert.equal(getItems()[1].provenance.recipes[0].id, "ratatouille");
  assert.equal(getFrequency("ail").count, 1);
  assert.equal(applyTransfer(payload({ items: [payload().items[0]] }), { storage: db }).alreadyApplied, true);
  assert.equal(getFrequency("ail").count, 1);
  assert.equal(undoTransfer(payload().transferId, { storage: db }), 1);
  assert.equal(getItems().length, 1);
  assert.equal(getFrequency("ail").count, 1);
  assert.equal(db.getItem(TRANSFER_LEDGER_KEY).includes(payload().transferId), false);
  assert.equal(applyTransfer(payload({ items: [payload().items[0]] }), { storage: db }).added.length, 1);
  assert.equal(getFrequency("ail").count, 2);
});

test("undo preserves a transfer item edited after import", () => {
  const db = storage();
  const items = [];
  applyTransfer(payload(), { storage: db, getCurrentItems: () => items });
  items[0].addedAt = 6;
  assert.equal(undoTransfer(payload().transferId, { storage: db, getCurrentItems: () => items,
    remove: () => { items.length = 0; return true; } }), 0);
  assert.equal(items.length, 1);
});

test("quota failure cannot leave a partial list or ledger and the transfer can be retried", () => {
  let rejectFarine = true;
  const db = storage({ failSet: (key, value) => key === "shopping-list:items:v1"
    && rejectFarine && value.includes("Farine") });
  configureStore({ storage: db });
  const items = [];
  const transfer = payload({ items: [{ name: "Ail", qty: "2 gousses" }, { name: "Farine", qty: "500 g" }] });

  assert.throws(() => applyTransfer(transfer, { storage: db, getCurrentItems: () => items }), /QuotaExceededError/);
  assert.deepEqual(items, []);
  assert.equal(db.getItem("shopping-list:items:v1"), null);
  assert.equal(db.getItem(TRANSFER_LEDGER_KEY), null);
  assert.equal(getFrequency("Ail"), null);

  rejectFarine = false;
  const result = applyTransfer(transfer, { storage: db, getCurrentItems: () => items });
  assert.equal(result.added.length, 2);
  assert.equal(items.length, 2);
  assert.ok(db.getItem(TRANSFER_LEDGER_KEY));
  assert.equal(getFrequency("Ail").count, 1);
});

test("ledger quota failure rolls back the list and leaves the transfer retryable", () => {
  let rejectLedger = true;
  const db = storage({ failSet: (key) => key === TRANSFER_LEDGER_KEY && rejectLedger });
  configureStore({ storage: db });
  const items = [];
  const transfer = payload();

  assert.throws(() => applyTransfer(transfer, { storage: db, getCurrentItems: () => items }), /QuotaExceededError/);
  assert.deepEqual(items, []);
  assert.equal(db.getItem("shopping-list:items:v1"), null);
  assert.equal(db.getItem(TRANSFER_LEDGER_KEY), null);
  assert.equal(getFrequency("Ail"), null);

  rejectLedger = false;
  assert.equal(applyTransfer(transfer, { storage: db, getCurrentItems: () => items }).added.length, 1);
  assert.equal(items.length, 1);
  assert.ok(db.getItem(TRANSFER_LEDGER_KEY));
  assert.equal(getFrequency("Ail").count, 1);
});

test("frequency quota failure rolls back list and ledger without frequency side effects", () => {
  let rejectFrequency = true;
  const db = storage({ failSet: (key) => key === STORE_KEYS.frequency && rejectFrequency });
  configureStore({ storage: db });
  const items = [];
  const transfer = payload();

  assert.throws(() => applyTransfer(transfer, { storage: db, getCurrentItems: () => items }), /QuotaExceededError/);
  assert.deepEqual(items, []);
  assert.equal(db.getItem(STORE_KEYS.items), null);
  assert.equal(db.getItem(TRANSFER_LEDGER_KEY), null);
  assert.equal(db.getItem(STORE_KEYS.frequency), null);
  assert.equal(getFrequency("Ail"), null);

  rejectFrequency = false;
  assert.equal(applyTransfer(transfer, { storage: db, getCurrentItems: () => items }).added.length, 1);
  assert.equal(items.length, 1);
  assert.equal(getFrequency("Ail").count, 1);
});

test("receiver module is precached for the local offline path", async () => {
  const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(serviceWorker, /\.\/js\/transfer\.js/);
});
