/* Shopping List — #7 R1: integer quantity steppers.
 * Logical default 1 (blank/missing/non-numeric reads as 1, no migration),
 * persisted via the plain store qty string, surviving check/uncheck/undo.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseQtyInt } from "../js/components.js";
import {
  configureStore,
  addItem,
  getItem,
  setQty,
  toggleItem,
  canUndoCheck,
  undoLastCheck,
} from "../js/store.js";
import { makeMemoryStorage } from "./helpers.mjs";

beforeEach(() => {
  configureStore({ storage: makeMemoryStorage() });
});

test("qty: parseQtyInt matrix (default 1, min 1, leading digits)", () => {
  assert.equal(parseQtyInt(""), 1);
  assert.equal(parseQtyInt(null), 1);
  assert.equal(parseQtyInt(undefined), 1);
  assert.equal(parseQtyInt("1"), 1);
  assert.equal(parseQtyInt("3"), 3);
  assert.equal(parseQtyInt("  2 gousses  "), 2);
  assert.equal(parseQtyInt("007"), 7);
  assert.equal(parseQtyInt("gousses"), 1);
  assert.equal(parseQtyInt("0"), 1);
  assert.equal(parseQtyInt("-2"), 1);
});

test("qty: new items read as 1 without migration", () => {
  const item = addItem({ name: "Farine" });
  assert.equal(item.qty, "");
  assert.equal(parseQtyInt(getItem(item.id).qty), 1);
});

test("qty: stepper writes persist as plain strings", () => {
  const item = addItem({ name: "Farine" });
  assert.equal(setQty(item.id, "3").qty, "3");
  assert.equal(parseQtyInt(getItem(item.id).qty), 3);
  assert.equal(setQty("unknown", "2"), null);
});

test("qty: survives check/uncheck and LIFO undo", () => {
  const item = addItem({ name: "Farine" });
  setQty(item.id, "4");
  toggleItem(item.id);
  assert.equal(getItem(item.id).checked, true);
  assert.equal(getItem(item.id).qty, "4");
  toggleItem(item.id);
  assert.equal(getItem(item.id).checked, false);
  assert.equal(getItem(item.id).qty, "4");
  toggleItem(item.id);
  assert.equal(canUndoCheck(), true);
  const restored = undoLastCheck();
  assert.equal(restored.checked, false);
  assert.equal(restored.qty, "4");
  assert.equal(getItem(item.id).qty, "4");
});
