/* Shopping List — UX #13 : hiérarchie textuelle allégée.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * Ces tests épinglent le contrat visible de l'issue #13 sans navigateur :
 * pas de titre "Ma liste", pas de "Encore à prendre" sans seconde section
 * d'état (#5 non implémentée), section Essentiels masquée quand vide via
 * l'attribut hidden (garde CSS obligatoire car .essentials{ display:flex }
 * neutralise sinon le style [hidden] de l'UA), titres Essentiels/Récents
 * discrets, section liste toujours nommée pour l'accessibilité.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { showsStateTitles } from "../js/list.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "css", "app.css"), "utf8");
const appJs = readFileSync(join(root, "js", "app.js"), "utf8");
const listJs = readFileSync(join(root, "js", "list.js"), "utf8");

test("UX13: aucun titre visible 'Ma liste'", () => {
  assert.ok(!html.includes(">Ma liste<"), "le libellé 'Ma liste' ne doit plus être rendu");
  assert.ok(!html.includes("list-title"), "aucune référence résiduelle à list-title");
});

test("UX13: la section liste reste nommée pour l'accessibilité", () => {
  const sectionMatch = html.match(/<section[^>]*aria-label="([^"]+)"[^>]*>\s*<div class="shopping-list"/s)
    || html.match(/<section[^>]*aria-labelledby="([^"]+)"[^>]*>\s*<div class="shopping-list"/s);
  assert.ok(sectionMatch, "la section liste doit porter aria-label ou aria-labelledby");
  const [, name] = sectionMatch;
  if (html.includes(`aria-labelledby="${name}"`)) {
    assert.ok(
      html.includes(`id="${name}"`),
      `aria-labelledby pointe vers un id existant (${name})`,
    );
  } else {
    assert.ok(name.trim().length > 0, "aria-label non vide");
  }
});

test("UX13: aucun 'Encore à prendre' hors de la section d'état conditionnelle", () => {
  assert.ok(!html.includes("Encore à prendre"), "index.html ne contient pas 'Encore à prendre'");
  assert.ok(!appJs.includes("Encore à prendre"), "js/app.js n'introduit pas 'Encore à prendre'");
  assert.ok(listJs.includes("Encore à prendre"), "les libellés d'état restent définis dans js/list.js");
  assert.ok(listJs.includes("Plus nécessaire"), "'Plus nécessaire' reste disponible pour la séparation");
});

test("UX13: titres d'état affichés uniquement quand les deux états coexistent", () => {
  assert.equal(showsStateTitles(3, 0), false, "actifs seuls → pas de titre");
  assert.equal(showsStateTitles(0, 2), false, "cochés seuls → pas de titre");
  assert.equal(showsStateTitles(0, 0), false, "liste vide → pas de titre");
  assert.equal(showsStateTitles(2, 1), true, "les deux états → séparation titrée");
  assert.equal(showsStateTitles(1, 3), true, "les deux états → séparation titrée");
});

test("UX13: renderList branche le rendu sur showsStateTitles", () => {
  assert.ok(
    /showsStateTitles\(activeGroups\.length,\s*checkedGroups\.length\)/.test(listJs),
    "renderList doit décider des titres via showsStateTitles",
  );
});

test("UX13: aucun nouveau titre introduit pour compenser", () => {
  const headings = [...html.matchAll(/<h[12][^>]*>([^<]*)<\/h[12]>/g)].map((m) => m[1].trim());
  for (const h of headings) {
    assert.ok(
      h === "Essentiels" || h === "Récents",
      `titre inattendu : « ${h} » (attendus : Essentiels, Récents)`,
    );
  }
});

test("UX13: garde CSS [hidden] (le bloc Essentiels vide ne doit jamais s'afficher)", () => {
  assert.ok(
    /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(css),
    "css/app.css doit forcer [hidden]{display:none!important} " +
      "car .essentials{display:flex} neutralise sinon le masquage UA",
  );
});

test("UX13: la section Essentiels est masquée quand vide ou désactivée", () => {
  assert.ok(
    /section\.hidden\s*=\s*!enabled\s*\|\|\s*pending\.length\s*===\s*0/.test(appJs),
    "renderEssentials doit poser section.hidden quand il n'y a rien à proposer",
  );
});

test("UX13: titres Essentiels et Récents discrets (sous la hiérarchie documentaire)", () => {
  const base = css.match(/\.section-title\s*\{[^}]*font-size\s*:\s*([\d.]+)rem/);
  assert.ok(base, ".section-title doit déclarer un font-size de référence");
  const baseSize = Number.parseFloat(base[1]);
  for (const id of ["essentials-title", "history-title"]) {
    const rule = css.match(new RegExp(`#${id}[^{]*\\{[^}]*font-size\\s*:\\s*([\\d.]+)rem`));
    assert.ok(rule, `#${id} doit avoir une règle de taille discrète dédiée`);
    assert.ok(
      Number.parseFloat(rule[1]) < baseSize,
      `#${id} (${rule[1]}rem) doit rester sous .section-title (${base[1]}rem)`,
    );
  }
});

test("UX13: 'Récents' reste présent comme source secondaire nommée", () => {
  assert.ok(html.includes('id="history-title"'), "le titre Récents existe toujours");
  assert.ok(html.includes("aria-labelledby=\"history-title\""), "la section Récents reste nommée");
});
