import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseTransferHash } from "../js/transfer.js";
import { showTransferError } from "../js/transfer-ui.js";

class FakeButton {
  hidden = false;
  listeners = new Map();
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }
  click() { for (const callback of this.listeners.get("click") ?? []) callback(); }
}

const encode = (payload) => Buffer.from(JSON.stringify(payload)).toString("base64url");
const transferHash = (item) => `#cookigram-transfer=${encode({
  type: "cookigram.shopping-transfer",
  version: 1,
  transferId: "123e4567-e89b-42d3-a456-426614174000",
  createdAt: "2026-11-01T12:00:00Z",
  items: [item],
})}`;

test("invalid transfer DOM state hides confirm, can dismiss, and does not write storage", async () => {
  const invalidItems = [
    { name: "Test", slug: "🛒".repeat(101) },
    { name: "Test", recipe: { id: "r", name: "Recipe", url: "https://cookigram.github.io:8443/recipe" } },
  ];
  const appJs = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(appJs, /showTransferError\(/, "the app catch path must use the tested error UI");
  assert.match(serviceWorker, /\.\/js\/transfer-ui\.js/, "the helper remains available offline");

  for (const item of invalidItems) {
    const hash = transferHash(item);
    let error;
    assert.throws(() => parseTransferHash(hash), (caught) => { error = caught; return true; });

    const panel = { hidden: true };
    const status = { textContent: "" };
    const confirm = new FakeButton();
    const cancel = new FakeButton();
    const undo = new FakeButton();
    let writes = 0;
    const storage = { setItem() { writes++; } };

    showTransferError({ panel, status, confirm, cancel, undo, message: error.message });
    assert.equal(panel.hidden, false);
    assert.equal(confirm.hidden, true, "inapplicable import action must be hidden");
    assert.equal(undo.hidden, true);
    assert.equal(cancel.hidden, false);
    assert.match(status.textContent, /invalide|non autorisé/i);
    cancel.click();
    assert.equal(panel.hidden, true, "cancel dismisses the error panel");
    assert.equal(writes, 0, "invalid links never write localStorage");
  }
});
