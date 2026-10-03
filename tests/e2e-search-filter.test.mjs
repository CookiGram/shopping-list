/* Shopping List — Issue #30 R2 : filtre rayon, qualification navigateur.
 * REAL browser test (needs Chrome/Chromium + CDP). NOT run by CI:
 * the CI gate stays `node --test tests/*.test.mjs` (stdlib only).
 *
 * Run (repo root, two terminals or background):
 *   python3 -m http.server 8077            # serve this checkout
 *   chromium --headless --no-sandbox --remote-debugging-port=9222 about:blank
 *   SHOPPING_CDP=http://127.0.0.1:9222 SHOPPING_URL=http://127.0.0.1:8077/index.html \
 *     node --test tests/e2e-search-filter.test.mjs
 *
 * Without SHOPPING_CDP the file passes silently (skip) so `node --test
 * tests/*.test.mjs` never fails headless. With SHOPPING_CDP it drives a
 * real page over CDP with trusted mouse clicks and asserts:
 * ouverture du panneau, sélection d'un rayon, texte + rayon, reset
 * via Tous, fermeture Escape, fermeture clic extérieur, focus restitué,
 * absence de rangée permanente, mobile 360px sans overflow, zéro
 * erreur JS. Screenshots desktop + mobile en option via SHOPPING_SHOTS
 * (dossier de sortie, PNG).
 *
 * Method note: Runtime.evaluate `.click()` is untrusted and does not
 * drive the panel toggle the way a user tap does; every interaction
 * below uses Input.dispatchMouseEvent at the element center.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CDP = process.env.SHOPPING_CDP ?? "";
const URL = process.env.SHOPPING_URL ?? "http://127.0.0.1:8077/index.html";
const SHOTS = process.env.SHOPPING_SHOTS ?? "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hasCdp = Boolean(CDP);

const check = async (t, name, cond, extra = "") => {
  await t.test(name, () => assert.ok(cond, extra || name));
};

const openTab = async () => {
  const tab = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl, [], { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.addEventListener("open", res, { once: true }));
  let msgId = 0;
  const pending = new Map();
  const jsErrors = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      jsErrors.push(msg.params?.exceptionDetails?.text ?? "exception");
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
      jsErrors.push(msg.params.args?.map((a) => a.value ?? a.description).join(" "));
    }
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++msgId;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const out = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (out.exceptionDetails) throw new Error(JSON.stringify(out.exceptionDetails));
    return out.result?.value;
  };
  const clickOn = async (selector, text = null) => {
    const center = await evaluate(`(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = ${text === null ? "nodes[0]" : `nodes.find((n) => (n.textContent || "").trim() === ${JSON.stringify(text)})`};
      if (!el) return null;
      el.scrollIntoView({ block: "nearest" });
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    })()`);
    assert.ok(center, `click target visible: ${selector} ${text ?? ""}`);
    const { x, y } = JSON.parse(center);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(350);
  };
  const load = async (w, h, mobile) => {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send("Page.navigate", { url: URL });
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      if ((await evaluate("document.readyState").catch(() => "")) === "complete") break;
    }
    await sleep(1200);
    await evaluate("localStorage.clear()");
    await send("Page.navigate", { url: URL });
    await sleep(1800);
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    const s = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, name), Buffer.from(s.data, "base64"));
  };
  const close = async () => {
    try {
      await fetch(`${CDP}/json/close/${tab.id}`, { method: "PUT" });
    } catch {
      /* tab already gone */
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  return { evaluate, clickOn, load, shot, send, jsErrors, close };
};

test("e2e #30 R2: filtre rayon discret (navigateur réel)", { skip: !hasCdp }, async (t) => {
  const page = await openTab();
  try {
    await page.load(1280, 900, false);

    await check(t, "aucune rangée permanente au repos (desktop)",
      (await page.evaluate(`!document.querySelector('[data-aisle-filter]') && !document.querySelector('.aisle-chips')`)) === true);
    await check(t, "aucune scrollbar de catégories au repos",
      (await page.evaluate(`[...document.querySelectorAll('.search-section *')].every(n => n.scrollWidth <= n.clientWidth + 1)`)) === true);
    await check(t, "déclencheur discret dans la barre, nom accessible",
      (await page.evaluate(`(() => { const t = document.querySelector('#shopping-aisle-filter'); const bar = document.querySelector('.search-bar');
        return !!t && !!bar && bar.contains(t) && (t.getAttribute('aria-label')||'').length > 3 && t.getAttribute('aria-haspopup') === 'true' && t.getAttribute('aria-expanded') === 'false'; })()`)) === true);
    await check(t, "dictée et clear inchangés",
      (await page.evaluate(`!!document.querySelector('#shopping-voice') && !!document.querySelector('#shopping-clear')`)) === true);
    await page.shot("after-desktop-rest.png");

    await page.clickOn("#shopping-aisle-filter");
    const panelState = await page.evaluate(`(() => { const p = document.querySelector('#shopping-aisle-panel');
      const labels = [...p.querySelectorAll('.aisle-option')].map(b => b.textContent.trim());
      return JSON.stringify({ hidden: p.hidden, n: labels.length, first: labels[0], labels }); })()`);
    const parsed = JSON.parse(panelState);
    await check(t, "ouverture: Tous premier + taxonomie canonique", parsed.hidden === false && parsed.first === "Tous" && parsed.n >= 8
      && parsed.labels.includes("Épicerie") && parsed.labels.includes("Fruits & légumes"), panelState);
    await check(t, "ouverture: aria-expanded synchronisé",
      (await page.evaluate(`document.querySelector('#shopping-aisle-filter').getAttribute('aria-expanded')`)) === "true");
    await page.shot("after-desktop-open.png");

    await page.clickOn("#shopping-aisle-panel .aisle-option", "Épicerie");
    await check(t, "sélection: panneau fermé + état actif discret",
      (await page.evaluate(`(() => { const p = document.querySelector('#shopping-aisle-panel'); const tr = document.querySelector('#shopping-aisle-filter');
        return p.hidden === true && tr.getAttribute('data-active') === 'Épicerie' && (tr.getAttribute('aria-label')||'').includes('Épicerie'); })()`)) === true);
    await page.shot("after-desktop-active.png");

    await page.evaluate(`(() => { const s = document.querySelector('#shopping-search'); s.value = 'a'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(500);
    await check(t, "texte + rayon combinés (lignes produit toutes en Épicerie)",
      (await page.evaluate(`(() => { const rows = [...document.querySelectorAll('#shopping-suggestions li')];
        const items = rows.filter(li => { const sm = (li.querySelector('small')?.textContent || '').trim(); return sm && sm !== 'Filtrer par étiquette' && sm !== 'Ajouter à la liste'; });
        const subs = items.map(li => (li.querySelector('small')?.textContent || '').trim());
        return subs.length > 0 && subs.every(s => s === 'Épicerie'); })()`)) === true);

    await page.clickOn("#shopping-aisle-filter");
    await page.clickOn("#shopping-aisle-panel .aisle-option", "Tous");
    await check(t, "reset via Tous: retour à la recherche globale",
      (await page.evaluate(`(() => { const tr = document.querySelector('#shopping-aisle-filter');
        return !tr.hasAttribute('data-active') && document.querySelector('#shopping-aisle-panel').hidden === true; })()`)) === true);

    await page.clickOn("#shopping-aisle-filter");
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(300);
    await check(t, "fermeture Escape sans modifier la recherche",
      (await page.evaluate(`(() => { const tr = document.querySelector('#shopping-aisle-filter');
        return document.querySelector('#shopping-aisle-panel').hidden === true && !tr.hasAttribute('data-active'); })()`)) === true);

    await page.clickOn("#shopping-aisle-filter");
    await page.clickOn(".topbar");
    await check(t, "fermeture au clic extérieur",
      (await page.evaluate(`document.querySelector('#shopping-aisle-panel').hidden`)) === true);

    await page.clickOn("#shopping-aisle-filter");
    await page.clickOn("#shopping-aisle-panel .aisle-option", "Épicerie");
    await check(t, "focus restitué à la barre après sélection",
      (await page.evaluate(`document.activeElement && document.activeElement.id`)) === "shopping-search");
    await page.clickOn("#shopping-aisle-filter");
    await page.clickOn("#shopping-aisle-panel .aisle-option", "Tous");

    await page.evaluate(`document.querySelector('#shopping-aisle-filter').focus()`);
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(400);
    await check(t, "clavier: Enter ouvre le panneau",
      (await page.evaluate(`document.querySelector('#shopping-aisle-panel').hidden`)) === false);
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(300);

    await page.load(360, 740, true);
    await sleep(300);
    await check(t, "mobile 360: aucune rangée, aucun overflow horizontal",
      (await page.evaluate(`(() => { const noRow = !document.querySelector('[data-aisle-filter]') && !document.querySelector('.aisle-chips');
        const over = [...document.querySelectorAll('body *')].filter(n => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX !== 'visible');
        return JSON.stringify({ noRow, over: over.length }); })()`)) === '{"noRow":true,"over":0}');
    await page.shot("after-360-rest.png");
    await page.clickOn("#shopping-aisle-filter");
    await check(t, "mobile 360: panneau contenu dans le viewport",
      (await page.evaluate(`(() => { const p = document.querySelector('#shopping-aisle-panel');
        const r = p.getBoundingClientRect(); return r.left >= -1 && r.right <= 361 && r.width <= 360; })()`)) === true);
    await page.shot("after-360-open.png");

    await check(t, "zéro erreur JS", page.jsErrors.length === 0, page.jsErrors.slice(0, 3).join(" | "));
  } finally {
    await page.close();
  }
});
