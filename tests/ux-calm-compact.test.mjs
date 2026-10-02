/* Shopping List — UX #21 : calmer et compacter l'écran principal.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * Ces tests épinglent le contrat visible de l'issue #21 sans navigateur :
 * indicateur Essentiel intégré à la ligne (SVG, pas d'emoji système),
 * lignes compactes à une seule rangée, barre d'actions homogène (même
 * langage d'icônes, sémantique inchangée), zone Essentials allégée à
 * une seule explication, pas de badge #count réintroduit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "css", "app.css"), "utf8");
const appJs = readFileSync(join(root, "js", "app.js"), "utf8");
const componentsJs = readFileSync(join(root, "js", "components.js"), "utf8");

const rule = (selector) => {
  const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `règle ${selector} présente dans css/app.css`);
  return m[1];
};

const EMOJI_STRUCTURAL = ["📌", "🧹", "↶"];

test("UX21: aucun emoji système comme indicateur structurel", () => {
  for (const emoji of EMOJI_STRUCTURAL) {
    assert.ok(!componentsJs.includes(emoji), `components.js ne doit plus émettre ${emoji}`);
    assert.ok(!appJs.includes(emoji), `js/app.js ne doit plus émettre ${emoji}`);
    assert.ok(!html.includes(emoji), `index.html ne doit plus émettre ${emoji}`);
  }
});

test("UX21: l'indicateur Essentiel est un SVG intégré au bouton pin", () => {
  const fn = componentsJs.match(/export function essentialButton[\s\S]*?\n\}/);
  assert.ok(fn, "essentialButton existe dans components.js");
  const svgConst = componentsJs.match(/const PIN_SVG\s*=[\s\S]*?";/);
  assert.ok(svgConst && svgConst[0].includes("<svg"), "le gabarit PIN_SVG contient un SVG inline");
  assert.ok(fn[0].includes("PIN_SVG"), "essentialButton rend le SVG PIN_SVG");
  assert.ok(fn[0].includes("data-essential-toggle"), "le bouton garde son hook data-essential-toggle");
  assert.ok(fn[0].includes("aria-pressed"), "le bouton garde aria-pressed");
  assert.ok(
    fn[0].includes("Marquer comme essentiel") && fn[0].includes("Retirer des essentiels"),
    "les noms accessibles FR sont conservés",
  );
});

test("UX21: le pin reste un enfant direct de la ligne produit", () => {
  const fn = componentsJs.match(/export function checkboxRow[\s\S]*?\n\}/);
  assert.ok(fn, "checkboxRow existe dans components.js");
  assert.ok(
    /row\.append\(cb,\s*iconEl,\s*copy/.test(fn[0]),
    "ordre de ligne : checkbox, icône, copie",
  );
  assert.ok(fn[0].includes("essentialButton(id, essential)"), "le pin est ajouté à la ligne");
  assert.ok(fn[0].includes("heartButton(id, favorite)"), "le cœur reste en ligne");
});

test("UX21: lignes compactes à 44px, une seule rangée de grille", () => {
  assert.ok(
    /min-height\s*:\s*44px/.test(rule("\\.shopping-item")),
    ".shopping-item doit plafonner à 44px de hauteur min",
  );
  const row = rule("\\.shopping-item-row");
  assert.ok(/min-height\s*:\s*44px/.test(row), ".shopping-item-row à 44px de hauteur min");
  assert.ok(/padding\s*:\s*0/.test(row), ".shopping-item-row sans padding vertical");
  const desktopCols = row.match(/grid-template-columns\s*:\s*([^;]+);/);
  assert.ok(desktopCols, "colonnes de grille desktop définies");
  assert.strictEqual(desktopCols[1].trim().split(/\s+/).length, 6, "6 pistes = 6 contrôles sur une rangée");
  const mobile = css.match(/@media\s*\(max-width\s*:\s*600px\)[\s\S]*?\.shopping-item-row\s*\{([^}]*)\}/);
  assert.ok(mobile, "règle mobile .shopping-item-row présente");
  const mobileCols = mobile[1].match(/grid-template-columns\s*:\s*([^;]+);/);
  assert.ok(mobileCols, "colonnes de grille mobile définies");
  assert.strictEqual(mobileCols[1].trim().split(/\s+/).length, 6, "mobile : 6 pistes = une seule rangée");
});

test("UX21: cibles tactiles accessibles conservées", () => {
  for (const selector of ["\\.qty-btn", "\\.icon-btn"]) {
    const body = rule(selector);
    assert.ok(/width\s*:\s*44px/.test(body), `${selector} largeur 44px`);
    assert.ok(/height\s*:\s*44px/.test(body), `${selector} hauteur 44px`);
  }
  const cb = rule('\\.shopping-item input\\[type="checkbox"\\]');
  const w = cb.match(/width\s*:\s*(\d+)px/);
  const h = cb.match(/height\s*:\s*(\d+)px/);
  assert.ok(w && h, "checkbox : dimensions explicites");
  assert.ok(Number(w[1]) >= 24 && Number(h[1]) >= 24, "checkbox ≥ plancher accessible 24px");
  assert.ok(Number(w[1]) > 22, "checkbox plus présente qu'avant (22px)");
});

test("UX21: barre d'actions homogène, sémantique inchangée", () => {
  const bar = html.match(/<div class="actions-bar"[\s\S]*?<\/div>/);
  assert.ok(bar, "barre d'actions présente dans index.html");
  const buttons = [...bar[0].matchAll(/<button[^>]*>/g)].map((m) => m[0]);
  assert.strictEqual(buttons.length, 5, "5 actions : clear, copy, share, export, undo");
  for (const btn of buttons) {
    assert.ok(btn.includes("shopping-action"), `chaque action porte .shopping-action : ${btn}`);
    assert.ok(/aria-label="[^"]+"/.test(btn), `chaque action garde son nom accessible : ${btn}`);
  }
  for (const hook of ["data-clear-checked", "data-copy-shopping", "data-share-shopping", "data-export-shopping", "data-undo-check"]) {
    assert.ok(bar[0].includes(hook), `hook ${hook} conservé`);
  }
  assert.ok(bar[0].includes("disabled"), "l'état disabled d'undo est conservé");
  const svgs = [...bar[0].matchAll(/<svg[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  assert.strictEqual(svgs.length, 5, "5 icônes SVG inline, même langage");
  for (const svg of svgs) {
    assert.ok(svg.includes('class="shopping-action-icon"'), "classe d'icône homogène");
    assert.ok(svg.includes('viewBox="0 0 36 36"'), "grille 36 commune");
  }
});

test("Essentiel binaire: aucun texte/hint explicatif dans la section", () => {
  assert.ok(!appJs.includes("data-essentials-hint"), "aucun hook data-essentials-hint dans js/app.js");
  assert.ok(!appJs.includes("essentials-hint"), "aucune classe essentials-hint dans js/app.js");
  assert.ok(!css.includes("essentials-hint"), "aucune règle .essentials-hint dans css/app.css");
  assert.ok(
    !appJs.includes("retrouver à chaque nouvelle liste"),
    "la phrase explicative a disparu de js/app.js",
  );
  assert.ok(!html.includes("retrouver à chaque nouvelle liste"), "phrase absente de index.html");
  assert.ok(
    !componentsJs.includes("touchez un essentiel pour commencer"),
    "l'empty-state ne pédagogise plus Essentiel (components.js)",
  );
  assert.ok(
    !html.includes("touchez un essentiel pour commencer"),
    "l'empty-state ne pédagogise plus Essentiel (index.html)",
  );
});

test("Essentiel binaire: même SVG dans les deux états, couleur par aria-pressed", () => {
  const templates = [...componentsJs.matchAll(/class="essential-pin-icon"/g)];
  assert.strictEqual(templates.length, 1, "un seul gabarit SVG de pin");
  const fn = componentsJs.match(/export function essentialButton[\s\S]*?\n\}/);
  assert.ok(fn, "essentialButton existe dans components.js");
  assert.strictEqual(
    [...fn[0].matchAll(/btn\.innerHTML\s*=/g)].length,
    1,
    "l'icône est assignée une seule fois, sans branchement sur pressed",
  );
  assert.ok(!/pressed\s*\?.*svg|svg.*pressed\s*\?/i.test(fn[0]), "aucune icône alternative selon pressed");
  const off = css.match(/\.icon-btn\s*\{([^}]*)\}/);
  assert.ok(off && /color\s*:\s*var\(--muted\)/.test(off[1]), "état off : neutre, comme les autres contrôles");
  const on = css.match(/\.icon-btn\[aria-pressed="true"\]\s*\{([^}]*)\}/);
  assert.ok(on && /color\s*:\s*var\(--orange\)/.test(on[1]), "état on : couleur d'accent via aria-pressed");
});

test("UX21: le badge #count n'est pas réintroduit", () => {
  assert.ok(!html.includes('id="count"'), 'aucun id="count" dans index.html');
  assert.ok(!html.includes("brand-count"), "aucune classe brand-count dans index.html");
  assert.ok(!appJs.includes("updateCount"), "aucun updateCount dans js/app.js");
  assert.ok(!componentsJs.includes("updateCount"), "aucun updateCount dans components.js");
});

test("UX21: navigation clavier et focus visible conservés", () => {
  assert.ok(/:focus-visible\s*\{[^}]*box-shadow/.test(css), "anneau :focus-visible conservé");
  assert.ok(
    /\.shopping-item-row:(hover|focus-within)\s*\{[^}]*background/.test(css) ||
      /\.shopping-item:(hover|focus-within)\s*\{[^}]*background/.test(css),
    "la ligne entière réagit au survol/focus (rattachement visuel des contrôles)",
  );
});
