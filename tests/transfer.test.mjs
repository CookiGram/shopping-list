import test from "node:test";
import assert from "node:assert/strict";
import { applyTransfer, parseTransferHash, undoTransfer, validateTransfer, TRANSFER_LEDGER_KEY } from "../js/transfer.js";
import { readFile } from "node:fs/promises";

const payload = (overrides = {}) => ({
  type: "cookigram.shopping-transfer", version: 1,
  transferId: "123e4567-e89b-42d3-a456-426614174000",
  createdAt: "2026-10-31T12:00:00Z",
  items: [{ name: "Ail", qty: "3 gousses", slug: "ail",
    recipe: { id: "ratatouille", name: "Ratatouille", url: "https://cookigram.github.io/cookigram/recettes/ratatouille/" } }],
  ...overrides,
});
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), values };
};
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

test("transfer fragment decodes v1 payload and validates its provenance origin", () => {
  const result = parseTransferHash(`#cookigram-transfer=${base64url(payload())}`);
  assert.equal(result.items[0].recipe.name, "Ratatouille");
  assert.equal(parseTransferHash("#other=value"), null);
  assert.throws(() => validateTransfer(payload({ version: 2 })), /non reconnu/);
  assert.throws(() => validateTransfer(payload({ items: Array(101).fill({ name: "A" }) })), /non reconnu/);
  assert.throws(() => validateTransfer(payload({ items: [{ name: "A", recipe: { id: "a", name: "A", url: "https://evil.example/" } }] })), /non autorisé/);
  assert.throws(() => validateTransfer(payload({ items: [{ name: "A", recipe: { id: "a", name: "A", url: "https://cookigram.github.io/other/" } }] })), /non autorisé/);
  assert.throws(() => parseTransferHash("#cookigram-transfer=%%%"));
});

test("transfer is additive, deduped, idempotent, and undo removes only its untouched additions", () => {
  const db = storage();
  const items = [{ id: "existing", name: "Lait", qty: "1 l", addedAt: 1 }];
  let id = 0;
  const add = (data) => {
    const item = { ...data, id: `new-${++id}`, addedAt: id };
    items.push(item);
    return item;
  };
  const remove = (itemId) => {
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) return false;
    items.splice(index, 1);
    return true;
  };
  const result = applyTransfer(payload({ items: [
    { name: "Lait", qty: "1 l" }, payload().items[0],
  ] }), { storage: db, getCurrentItems: () => [...items], add });
  assert.equal(result.added.length, 1);
  assert.equal(result.skipped, 1);
  assert.equal(items[0].name, "Lait");
  assert.equal(items[1].provenance.recipes[0].id, "ratatouille");
  assert.equal(applyTransfer(payload({ items: [payload().items[0]] }), {
    storage: db, getCurrentItems: () => items, add,
  }).alreadyApplied, true);
  assert.equal(undoTransfer(payload().transferId, { storage: db,
    getCurrentItems: () => items, remove }), 1);
  assert.equal(items.length, 1);
  assert.equal(db.getItem(TRANSFER_LEDGER_KEY).includes(payload().transferId), false);
});

test("undo preserves a transfer item edited after import", () => {
  const db = storage();
  const items = [];
  const add = (data) => { const item = { ...data, id: "new", addedAt: 5 }; items.push(item); return item; };
  applyTransfer(payload(), { storage: db, getCurrentItems: () => items, add });
  items[0].addedAt = 6;
  assert.equal(undoTransfer(payload().transferId, { storage: db, getCurrentItems: () => items,
    remove: () => { items.length = 0; return true; } }), 0);
  assert.equal(items.length, 1);
});

test("receiver module is precached for the local offline path", async () => {
  const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(serviceWorker, /\.\/js\/transfer\.js/);
});
