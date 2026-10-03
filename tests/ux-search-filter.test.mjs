/* Shopping List — Issue #30 R2 : filtre rayon intégré à la barre.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * Ces tests épinglent le contrat visible sans navigateur : AUCUNE
 * rangée permanente de chips (régression #33 supprimée), contrôle
 * discret dans .search-bar, panneau contextuel canonique, état actif
 * discret, reset Tous, clavier/ARIA, dictée et clear préservés.
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
const aisleJs = readFileSync(join(root, "js", "aisle-filter.js"), "utf8");
const swJs = readFileSync(join(root, "sw.js"), "utf8");

const rule = (selector) => {
  const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `règle ${selector} présente dans css/app.css`);
  return m[1];
};

test("CT30R2: aucune rangée permanente de catégories au repos", () => {
  // Le conteneur historique n'est plus monté par l'app.
  assert.ok(!/initAisleBar\(\{/.test(appJs), "initAisleBar n'est plus câblé dans boot()");
  assert.ok(
    !/ensureAisleBar\(options\.root\)/.test(aisleJs.split("initAisleFilter")[1] ?? ""),
    "le montage R2 ne crée aucune barre [data-aisle-filter]",
  );
  // Le style de la rangée scrollable est retiré (pas seulement masqué).
  assert.ok(!/\.aisle-chips\s*\{[^}]*margin-top/.test(css), ".aisle-chips ne définit plus de rangée");
  assert.ok(!/\.chip-row--scroll\s*\{/.test(css), ".chip-row--scroll supprimé (aucune scrollbar de catégories)");
});

test("CT30R2: contrôle discret intégré à la barre de recherche", () => {
  const bar = html.match(/<div class="search-bar">([\s\S]*?)<\/div>\s*<ul/s);
  assert.ok(bar, ".search-bar présente dans index.html");
  assert.ok(bar[1].includes('id="shopping-aisle-filter"'), "le déclencheur vit dans la barre");
  assert.ok(bar[1].includes("aisle-filter-trigger"), "classe dédiée au déclencheur discret");
  assert.ok(bar[1].includes('aria-haspopup="true"'), "le déclencheur annonce le panneau");
  assert.ok(bar[1].includes('aria-controls="shopping-aisle-panel"'), "le déclencheur contrôle le panneau");
  assert.ok(bar[1].includes('aria-expanded="false"'), "état fermé initial exposé");
  assert.ok(bar[1].includes("<svg"), "icône SVG inline (pas d'emoji système)");
  assert.ok(!bar[1].includes("Tous"), "aucune taxonomie exposée au repos dans la barre");
  // Panneau contextuel monté dans la section, caché au repos.
  assert.ok(html.includes('id="shopping-aisle-panel"'), "panneau #shopping-aisle-panel présent");
  assert.ok(html.includes('data-aisle-panel'), "panneau exposé via [data-aisle-panel]");
  assert.ok(html.includes('role="dialog"'), "panneau en role=dialog");
  assert.ok(/id="shopping-aisle-panel"[^>]*hidden/.test(html), "panneau caché au repos");
});

test("CT30R2: état actif discret, jamais toute la taxonomie", () => {
  assert.ok(
    aisleJs.includes("renderAisleTrigger"),
    "le déclencheur se re-synchronise avec l'état (pastille discrète)",
  );
  assert.ok(
    /node\.removeAttribute\("data-active"\)/.test(aisleJs),
    "aucun marqueur au repos",
  );
  assert.ok(
    aisleJs.includes("Filtre actif : ${activeAisle}"),
    "l'état actif reste lisible sans réafficher les rayons",
  );
  const dot = rule("\\.aisle-filter-dot");
  assert.ok(/background\s*:\s*transparent/.test(dot), "pastille invisible au repos");
  assert.ok(
    /\.aisle-filter-trigger\[data-active\] \.aisle-filter-dot\s*\{[^}]*background\s*:\s*var\(--green\)/.test(css),
    "pastille discrète quand un filtre est actif",
  );
});

test("CT30R2: panneau = vocabulaire canonique, Tous premier (reset)", () => {
  assert.ok(aisleJs.includes("aisleChips(options.catalog"), "le panneau réutilise aisleChips (ordre canonique)");
  const render = aisleJs.match(/export const renderAislePanel = \([\s\S]*?\n};/);
  assert.ok(render, "renderAislePanel existe dans aisle-filter.js");
  assert.ok(/for \(const aisle of \[null/.test(render[0]), "Tous rendu en premier (reset)");
  assert.ok(aisleJs.includes('option.setAttribute("aria-pressed"'), "option active via aria-pressed");
  assert.ok(
    aisleJs.includes("aria-label\", `Filtrer par ${display}`"),
    "nom accessible par option de rayon",
  );
});

test("CT30R2: clavier et fermeture propre", () => {
  const mount = aisleJs.match(/export const initAisleFilter = \([\s\S]*$/);
  assert.ok(mount, "initAisleFilter existe dans aisle-filter.js");
  assert.ok(mount[0].includes('"Escape"'), "fermeture Escape");
  assert.ok(mount[0].includes("refocus"), "focus restitué à la barre après choix");
  assert.ok(mount[0].includes("outside") || mount[0].includes("closest"), "fermeture clic extérieur");
  assert.ok(
    mount[0].includes('"ArrowDown"') && mount[0].includes('".aisle-option"'),
    "ouverture clavier vers la première option",
  );
  assert.ok(
    /\.aisle-option:focus-visible\s*\{[^}]*outline/.test(css),
    "focus clavier visible sur les options",
  );
});

test("CT30R2: cibles tactiles et panneau sans overflow mobile", () => {
  const trigger = rule("\\.aisle-filter-trigger");
  assert.ok(/width\s*:\s*44px/.test(trigger) && /height\s*:\s*44px/.test(trigger), "déclencheur 44px");
  const option = rule("\\.aisle-option");
  assert.ok(/min-height\s*:\s*44px/.test(option), "options 44px minimum");
  const panel = rule("\\.aisle-panel");
  assert.ok(/left\s*:\s*0/.test(panel) && /right\s*:\s*0/.test(panel), "panneau contraint à la carte");
  assert.ok(/overflow\s*:\s*auto/.test(panel), "panneau scrollable en interne, pas la page");
  assert.ok(/max-height\s*:\s*50dvh/.test(panel), "panneau borné en hauteur");
});

test("CT30R2: dictée et clear inchangés", () => {
  const bar = html.match(/<div class="search-bar">([\s\S]*?)<\/div>\s*<ul/s);
  assert.ok(bar[1].includes('id="shopping-voice"'), "dictée conservée dans la barre");
  assert.ok(bar[1].includes('aria-label="Dicter des articles"'), "nom accessible dictée conservé");
  assert.ok(bar[1].includes('id="shopping-clear"'), "bouton clear custom conservé");
  assert.ok(bar[1].includes('aria-label="Effacer la recherche"'), "nom accessible clear conservé");
});

test("CT30R2: moteur préservé (structuredTerms aisle, texte+rayon, liste intacte)", () => {
  const render = appJs.match(/function renderSuggestions\(\)[\s\S]*?\n}\n/);
  assert.ok(render, "renderSuggestions existe dans app.js");
  assert.ok(render[0].includes("aisleTerm()"), "terme rayon combiné au texte");
  const wire = appJs.match(/initAisleFilter\(\{[\s\S]*?\}\);/);
  assert.ok(wire, "initAisleFilter câblé dans boot()");
  assert.ok(!/\.value\s*=/.test(wire[0]), "changement de rayon ne touche pas au texte saisi");
  assert.ok(wire[0].includes("renderSuggestions()"), "changement de rayon re-filtre les suggestions");
  assert.ok(!/setFilter/.test(wire[0]), "pas de filtre sur la liste (suggestions uniquement)");
  assert.ok(
    !/getEssentials|getFavorites|topFrequent|recentItems/.test(wire[0]),
    "Essentiels/Favoris/Récents hors du câblage rayon",
  );
  assert.ok(appJs.includes("initTagBar({"), "câblage tags préservé");
});

test("CT30R2: module rayon toujours dans le précache offline", () => {
  assert.ok(
    swJs.includes("./js/aisle-filter.js"),
    "sw.js précache aisle-filter.js (filtre fonctionnel hors ligne)",
  );
});
