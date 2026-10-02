/* Shopping List — #9 global validate (✓ freeze), non-regression.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * Store behavior is unit-tested against memory storage; DOM wiring is
 * locked via source assertions (same convention as the ux-*.test.mjs
 * files); end-to-end visibility/toggle is browser-probed at qual time.
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  configureStore,
  getItems,
  addItem,
  freezeEditable,
  hasEditable,
} from "../js/store.js";
import { makeMemoryStorage } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const appJs = readFileSync(join(root, "js", "app.js"), "utf8");
const listJs = readFileSync(join(root, "js", "list.js"), "utf8");
const componentsJs = readFileSync(join(root, "js", "components.js"), "utf8");

beforeEach(() => {
  configureStore({ storage: makeMemoryStorage() });
});

test("#9: ✓ visibility follows editable presence (appear/disappear)", () => {
  assert.equal(hasEditable([]), false, "empty list: no ✓");
  assert.equal(hasEditable([{ frozen: true }]), false, "all frozen: no ✓");
  assert.equal(hasEditable([{ name: "Ail" }]), true, "absent flag reads editable: ✓");
  assert.equal(hasEditable([{ frozen: true }, {}]), true, "one editable left: ✓");
  assert.equal(hasEditable(null), false, "null-safe");
});

test("#9: freeze is global over the editable state", () => {
  addItem({ name: "Ail" });
  addItem({ name: "Lait" });
  assert.equal(freezeEditable(), 2, "two items frozen");
  assert.ok(getItems().every((i) => i.frozen === true), "all items frozen");
  assert.equal(hasEditable(getItems()), false, "✓ disappears after freeze");
  assert.equal(freezeEditable(), 0, "second freeze with nothing new: no-op");
});

test("#9: frozen rows hide edit controls but keep the checkbox", () => {
  const fn = componentsJs.match(/export function checkboxRow[\s\S]*?\n\}/);
  assert.ok(fn, "checkboxRow exists");
  assert.ok(/frozen\s*=\s*false/.test(fn[0]), "frozen option defaults to false");
  assert.ok(/if\s*\(!frozen\)/.test(fn[0]), "edit controls render only when editable");
  const guarded = fn[0].slice(fn[0].indexOf("if (!frozen)"));
  assert.ok(guarded.includes("qtyStepper"), "stepper hidden when frozen");
  assert.ok(guarded.includes("essentialButton"), "pin hidden when frozen");
  assert.ok(guarded.includes("heartButton"), "heart hidden when frozen");
  const before = fn[0].slice(0, fn[0].indexOf("if (!frozen)"));
  assert.ok(before.includes("row.append(cb"), "checkbox appended unconditionally");
  assert.ok(listJs.includes("frozen: !!item.frozen"), "list threads the stored flag");
});

test("#9: items added after freeze stay editable and revive the ✓", () => {
  addItem({ name: "Ail" });
  freezeEditable();
  const added = addItem({ name: "Beurre" });
  assert.ok(!added.frozen, "new item editable (no flag)");
  assert.equal(hasEditable(getItems()), true, "✓ reappears");
});

test("#9: second freeze only freezes the new slice", () => {
  addItem({ name: "Ail" });
  assert.equal(freezeEditable(), 1);
  addItem({ name: "Beurre" });
  assert.equal(freezeEditable(), 1, "only the newcomer frozen");
  const [ail, beurre] = getItems();
  assert.equal(ail.frozen, true);
  assert.equal(beurre.frozen, true);
  assert.equal(ail.name, "Ail", "already-frozen item untouched");
});

test("#9: frozen state persists across re-read (refresh)", () => {
  addItem({ name: "Ail" });
  freezeEditable();
  const reread = getItems();
  assert.equal(reread.length, 1);
  assert.equal(reread[0].frozen, true, "flag survives storage round-trip");
  assert.equal(hasEditable(reread), false, "✓ stays hidden after refresh");
});

test("#9: ✓ button present, global, SVG, hidden by default", () => {
  const bar = html.match(/<div class="actions-bar"[\s\S]*?<\/div>/);
  assert.ok(bar, "actions bar present");
  const btn = bar[0].match(/<button[^>]*data-validate-list[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(btn, "validate button in the actions bar (global, not per item)");
  assert.ok(btn[0].includes("shopping-action"), "unified action proportions");
  assert.ok(/(^|\s)hidden(\s|>)/.test(btn[0]), "hidden until editable items exist");
  assert.ok(btn[0].includes('aria-label="Valider la liste"'), "accessible name");
  assert.ok(btn[1].includes("<svg"), "SVG check, same icon language");
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(btn[1]), "no system emoji");
  assert.ok(appJs.includes("[data-validate-list]"), "app.js wires the hook");
  assert.ok(appJs.includes("freezeEditable()"), "click freezes via the store");
});
