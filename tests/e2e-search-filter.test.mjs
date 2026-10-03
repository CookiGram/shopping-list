/* Shopping List — Issue #30 R3 : filtre rayon via les en-têtes de groupe, qualification navigateur.
 * REAL browser test (needs Chrome/Chromium + CDP). NOT run by default CI:
 * the CI gate stays `node --test tests/*.test.mjs` (stdlib only).
 *
 * Run (repo root, two terminals or background):
 *   python3 -m http.server 8077            # serve this checkout
 *   chromium --headless --no-sandbox --remote-debugging-port=9222 about:blank
 *   SHOPPING_CDP=http://127.0.0.1:9222 SHOPPING_URL=http://127.0.0.1:8077/index.html \
 *     node --test tests/e2e-search-filter.test.mjs
 *
 * Without SHOPPING_CDP the test skips silently. With SHOPPING_CDP it drives a
 * real page over CDP with trusted mouse clicks and asserts R3 requirements:
 * - Barre de recherche épurée (aucun trigger, dot, panneau ni chips sous la barre)
 * - En-têtes de groupes dans la liste transformés en contrôles interactifs
 * - Clic sur un en-tête filtre la liste sur ce seul rayon
 * - Visual projection only : items en localStorage intacts
 * - Reset via bouton "Tout afficher" ou re-clic sur l'en-tête actif (toggle)
 * - Synchronisation avec suggestions de recherche (aisleTerm)
 * - Mobile 360px sans débordement, cible tactile >= 44px
 * - Zéro erreur JS
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
      const el = ${text === null ? "nodes[0]" : `nodes.find((n) => (n.textContent || "").includes(${JSON.stringify(text)}))`};
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
  const load = async (w, h, mobile, seedItems = null) => {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send("Page.navigate", { url: URL });
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      const href = await evaluate("window.location.href").catch(() => "");
      const ready = await evaluate("document.readyState").catch(() => "");
      if (href.startsWith("http") && ready === "complete") break;
    }
    await sleep(1000);
    await evaluate("localStorage.clear()");
    if (seedItems) {
      await evaluate(`localStorage.setItem("shopping-list:items:v1", JSON.stringify(${JSON.stringify(seedItems)}))`);
    }
    await send("Page.navigate", { url: URL });
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      const href = await evaluate("window.location.href").catch(() => "");
      const ready = await evaluate("document.readyState").catch(() => "");
      if (href.startsWith("http") && ready === "complete") break;
    }
    await sleep(1500);
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

test("e2e #30 R3: filtre rayon via en-têtes de liste (navigateur réel)", { skip: !hasCdp }, async (t) => {
  const page = await openTab();
  const seedItems = [
    { id: "e2e-1", name: "Pommes", aisle: "Fruits & légumes", checked: false, addedAt: 1 },
    { id: "e2e-2", name: "Farine", aisle: "Épicerie", checked: false, addedAt: 2 },
    { id: "e2e-3", name: "Lessive", aisle: "Maison & entretien", checked: false, addedAt: 3 },
  ];

  try {
    await page.load(1280, 900, false, seedItems);

    // 1. Barre de recherche épurée au repos
    await check(t, "R3: aucune rangée permanente au repos",
      (await page.evaluate(`!document.querySelector('[data-aisle-filter]') && !document.querySelector('.aisle-chips')`)) === true);
    await check(t, "R3: aucun trigger ni panneau de filtre dans la barre",
      (await page.evaluate(`!document.querySelector('#shopping-aisle-filter') && !document.querySelector('.aisle-filter-trigger') && !document.querySelector('#shopping-aisle-panel')`)) === true);
    await check(t, "R3: dictée et clear inchangés dans la barre",
      (await page.evaluate(`!!document.querySelector('#shopping-voice') && !!document.querySelector('#shopping-clear')`)) === true);

    // 2. En-têtes de la liste comme contrôles de filtrage
    const groupCount = await page.evaluate(`document.querySelectorAll('.shopping-group').length`);
    await check(t, "R3: 3 groupes initiaux visibles dans la liste", groupCount === 3, `groupCount: ${groupCount}`);

    const headerButtons = await page.evaluate(`document.querySelectorAll('.aisle-header-button').length`);
    await check(t, "R3: chaque groupe possède un bouton d'en-tête interactif", headerButtons === 3, `headerButtons: ${headerButtons}`);

    await page.shot("after-desktop-rest.png");

    // 3. Filtrage en cliquant sur l'en-tête "Épicerie"
    await page.clickOn('.aisle-header-button[data-aisle-header="Épicerie"]');
    await sleep(400);

    const filteredGroups = await page.evaluate(`document.querySelectorAll('.shopping-group').length`);
    await check(t, "R3: seul le groupe Épicerie reste visible", filteredGroups === 1, `filteredGroups: ${filteredGroups}`);

    const activeAisleName = await page.evaluate(`document.querySelector('.shopping-group')?.getAttribute('data-aisle')`);
    await check(t, "R3: le groupe affiché est bien Épicerie", activeAisleName === "Épicerie", `active: ${activeAisleName}`);

    const ariaPressed = await page.evaluate(`document.querySelector('.aisle-header-button[data-aisle-header="Épicerie"]')?.getAttribute('aria-pressed')`);
    await check(t, "R3: aria-pressed='true' sur l'en-tête actif", ariaPressed === "true", `ariaPressed: ${ariaPressed}`);

    const hasBadge = await page.evaluate(`!!document.querySelector('.aisle-header-badge')`);
    await check(t, "R3: badge Filtre actif présent", hasBadge === true);

    const hasReset = await page.evaluate(`!!document.querySelector('[data-aisle-reset]')`);
    await check(t, "R3: bouton Tout afficher présent", hasReset === true);

    // 4. Projection visuelle pure : stockage intact
    const storedCount = await page.evaluate(`JSON.parse(localStorage.getItem("shopping-list:items:v1") || '[]').length`);
    await check(t, "R3: les 3 articles sont toujours intacts en stockage (projection visuelle pure)", storedCount === 3, `storedCount: ${storedCount}`);

    await page.shot("after-desktop-filtered.png");

    // 5. Reset via le bouton "Tout afficher"
    await page.clickOn('[data-aisle-reset]');
    await sleep(400);

    const resetGroups = await page.evaluate(`document.querySelectorAll('.shopping-group').length`);
    await check(t, "R3: les 3 groupes réapparaissent après reset", resetGroups === 3, `resetGroups: ${resetGroups}`);

    // 6. Bascule (toggle) : cliquer sur l'en-tête actif désactive le filtre
    await page.clickOn('.aisle-header-button[data-aisle-header="Fruits & légumes"]');
    await sleep(400);
    const fruitGroups = await page.evaluate(`document.querySelectorAll('.shopping-group').length`);
    await check(t, "R3: filtré sur Fruits & légumes", fruitGroups === 1);

    await page.clickOn('.aisle-header-button[data-aisle-header="Fruits & légumes"]');
    await sleep(400);
    const toggledGroups = await page.evaluate(`document.querySelectorAll('.shopping-group').length`);
    await check(t, "R3: re-clic sur l'en-tête désactive le filtre (retour à tous)", toggledGroups === 3);

    // 7. Suggestions de recherche restreintes par le filtre actif
    await page.clickOn('.aisle-header-button[data-aisle-header="Épicerie"]');
    await sleep(400);
    await page.evaluate(`(() => { const s = document.querySelector('#shopping-search'); s.value = 'a'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(500);

    const suggestionsMatch = await page.evaluate(`(() => {
      const rows = [...document.querySelectorAll('#shopping-suggestions li')];
      const items = rows.filter(li => {
        const sm = (li.querySelector('small')?.textContent || '').trim();
        return sm && sm !== 'Filtrer par étiquette' && sm !== 'Ajouter à la liste';
      });
      const subs = items.map(li => (li.querySelector('small')?.textContent || '').trim());
      return subs.length > 0 && subs.every(s => s === 'Épicerie');
    })()`);
    await check(t, "R3: les suggestions respectent le rayon actif de la liste", suggestionsMatch === true);

    await page.evaluate(`(() => { const s = document.querySelector('#shopping-search'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.clickOn('[data-aisle-reset]');
    await sleep(400);

    // 8. Mobile 360px : cible tactile >= 44px, aucun overflow horizontal
    await page.load(360, 740, true, seedItems);
    await sleep(400);

    const overflowCount = await page.evaluate(`[...document.querySelectorAll('body *')].filter(n => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX !== 'visible').length`);
    await check(t, "R3 mobile 360: aucun overflow horizontal", overflowCount === 0, `overflow: ${overflowCount}`);

    const headerHeight = await page.evaluate(`document.querySelector('.aisle-header-button')?.getBoundingClientRect().height || 0`);
    await check(t, "R3 mobile 360: cible tactile en-tête >= 44px", headerHeight >= 44, `headerHeight: ${headerHeight}`);

    await page.clickOn('.aisle-header-button[data-aisle-header="Épicerie"]');
    await sleep(400);
    await page.shot("after-360-filtered.png");

    // 9. Zéro erreur JS
    await check(t, "R3: zéro erreur JS au runtime", page.jsErrors.length === 0, page.jsErrors.slice(0, 3).join(" | "));
  } finally {
    await page.close();
  }
});
