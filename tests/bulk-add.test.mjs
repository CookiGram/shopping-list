/* #53: multi-line entry — pure logic and fake-DOM interactions. */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { planBulkItems, attachBulkAddUI } from "../js/bulk-add.js";
import { configureStore, addItem, getItems, setChecked } from "../js/store.js";
import { makeMemoryStorage } from "./helpers.mjs";

beforeEach(() => configureStore({ storage: makeMemoryStorage() }));

function control() {
  return {
    hidden: true, disabled: false, value: "", textContent: "",
    focused: false, attributes: {}, handlers: {},
    addEventListener(type, callback) { this.handlers[type] = callback; },
    setAttribute(key, value) { this.attributes[key] = value; },
    focus() { this.focused = true; },
    fire(type, detail = {}) { this.handlers[type]?.({ preventDefault() {}, ...detail }); },
  };
}
function ui(resolve = (name) => ({ name })) {
  const nodes = Object.fromEntries(
    ["trigger", "panel", "input", "status", "preview", "confirm", "cancel"].map((x) => [x, control()]),
  );
  nodes.panel.hidden = true;
  const messages = [];
  attachBulkAddUI({ ...nodes, resolve, getItems, addItem, notify: (message) => messages.push(message) });
  return { ...nodes, messages };
}

test("bulk plan trims lines, ignores blanks, CRLF and case/accent duplicates", () => {
  const planned = planBulkItems("Lait\r\nTomates\n\n riz \nLAIT\rRÍZ");
  assert.deepEqual(planned.map((x) => x.name), ["Lait", "Tomates", "riz"]);
  assert.ok(planned.every((x) => x.provenance.source === "custom"));
});

test("bulk plan deduplicates canonical aliases and names already in list", () => {
  const resolver = (name) => name === "tomate"
    ? { name: "Tomates", slug: "tomates", provenance: { source: "dict" } }
    : { name };
  assert.deepEqual(
    planBulkItems("tomate\nTomates\nLait\n lait ", [{ name: "LAIT" }], resolver),
    [{ name: "Tomates", slug: "tomates", provenance: { source: "dict" } }],
  );
});

test("bulk plan handles empty and whitespace inputs", () => {
  assert.deepEqual(planBulkItems(null), []);
  assert.deepEqual(planBulkItems("   \r\n\n  "), []);
});

test("bulk UI shows a preview but writes only after confirmation", () => {
  const x = ui();
  assert.equal(x.panel.hidden, true);
  assert.equal(x.confirm.disabled, true);
  x.trigger.fire("click");
  assert.equal(x.panel.hidden, false);
  assert.equal(x.trigger.attributes["aria-expanded"], "true");
  assert.equal(x.input.focused, true);
  x.input.value = "Lait\nTomates\n\nRiz\nLAIT";
  x.input.fire("input");
  assert.equal(x.status.textContent, "3 articles à ajouter");
  assert.equal(x.preview.textContent, "• Lait\n• Tomates\n• Riz");
  assert.equal(getItems().length, 0);
  x.confirm.fire("click");
  assert.deepEqual(getItems().map((item) => item.name), ["Lait", "Tomates", "Riz"]);
  assert.equal(x.panel.hidden, true);
  assert.equal(x.input.value, "");
  assert.equal(x.trigger.focused, true);
  assert.equal(x.messages.at(-1), "3 articles ajoutés");
});

test("bulk UI cancel and Escape preserve previous list", () => {
  const first = addItem({ name: "Beurre" });
  const x = ui();
  x.trigger.fire("click");
  x.input.value = "Lait\nRiz";
  x.input.fire("input");
  x.cancel.fire("click");
  assert.deepEqual(getItems().map((item) => item.id), [first.id]);
  x.trigger.fire("click");
  x.input.value = "Tomates";
  x.input.fire("input");
  x.input.fire("keydown", { key: "Escape" });
  assert.equal(x.panel.hidden, true);
  assert.deepEqual(getItems().map((item) => item.id), [first.id]);
});

test("bulk UI does not uncheck existing items or change their quantities", () => {
  const first = addItem({ name: "Lait", qty: "2 L" });
  setChecked(first.id, true);
  const x = ui();
  x.trigger.fire("click");
  x.input.value = "lait\nTomates\nTOMATES";
  x.input.fire("input");
  assert.equal(x.status.textContent, "1 article à ajouter");
  x.confirm.fire("click");
  assert.equal(getItems().length, 2);
  const still = getItems().find((item) => item.id === first.id);
  assert.equal(still.checked, true);
  assert.equal(still.qty, "2 L");
  assert.equal(x.messages.at(-1), "1 article ajouté");
});

test("bulk UI refuses empty or fully duplicate text without writes", () => {
  addItem({ name: "Lait" });
  const x = ui();
  x.trigger.fire("click");
  x.input.value = "  \n\r ";
  x.input.fire("input");
  assert.equal(x.confirm.disabled, true);
  x.input.value = "  LAIT ";
  x.input.fire("input");
  assert.equal(x.confirm.disabled, true);
  x.confirm.fire("click");
  assert.equal(getItems().length, 1);
});

test("bulk UI preserves catalog provenance in store", () => {
  const x = ui((name) => ({ name: name.toUpperCase(), slug: "item-1", provenance: { source: "dict" } }));
  x.trigger.fire("click");
  x.input.value = "Thé glacé";
  x.input.fire("input");
  x.confirm.fire("click");
  assert.equal(getItems()[0].slug, "item-1");
  assert.deepEqual(getItems()[0].provenance, { source: "dict" });
});

test("bulk markup and offline precache are wired", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const html = readFileSync(join(root, "index.html"), "utf8");
  const app = readFileSync(join(root, "js/app.js"), "utf8");
  const css = readFileSync(join(root, "css/app.css"), "utf8");
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  for (const id of ["bulk-add-panel", "bulk-add-text", "bulk-add-status", "bulk-add-preview", "bulk-add-confirm", "bulk-add-cancel"]) {
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /data-bulk-add-open[\s\S]*aria-expanded="false"/);
  assert.match(html, /id="bulk-add-panel"[^>]*hidden/);
  assert.match(app, /attachBulkAddUI\(\{/);
  assert.ok(sw.includes('"./js/bulk-add.js"'));
  assert.ok(css.includes(".bulk-add-panel"));
});
