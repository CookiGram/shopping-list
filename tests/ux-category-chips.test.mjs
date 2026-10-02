/* Shopping List — Issue #30 : chips de catégories sous la recherche.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * Ces tests épinglent le contrat visible sans navigateur : rangée de
 * chips compacte en scroll horizontal réutilisant le langage .chip,
 * barre accessible (groupe nommé, aria-pressed), câblage suggestions
 * uniquement (texte préservé, liste et tags/Essentiels/Récents intacts).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "css", "app.css"), "utf8");
const appJs = readFileSync(join(root, "js", "app.js"), "utf8");
const aisleJs = readFileSync(join(root, "js", "aisle-filter.js"), "utf8");
const swJs = readFileSync(join(root, "sw.js"), "utf8");

const rule = (selector) => {
  const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `règle ${selector} présente dans css/app.css`);
  return m[1];
};

test("CT30: rangée compacte sous la barre, scroll horizontal mobile", () => {
  const bar = rule("\\.aisle-chips");
  assert.ok(/margin-top/.test(bar), ".aisle-chips espacée sous la barre de recherche");
  const scroll = rule("\\.chip-row--scroll");
  assert.ok(/flex-wrap\s*:\s*nowrap/.test(scroll), "une seule rangée (pas de wrap)");
  assert.ok(/overflow-x\s*:\s*auto/.test(scroll), "scroll horizontal au lieu de casser le layout");
  assert.ok(
    /\.chip-row--scroll\s*>\s*li\s*\{[^}]*flex\s*:\s*none/.test(css),
    "chips non compressibles dans la rangée scrollable",
  );
});

test("CT30: les chips réutilisent le langage .chip + aria-pressed", () => {
  assert.ok(aisleJs.includes('chip.className = "chip"'), "aisleChip rend un .chip");
  assert.ok(aisleJs.includes('"aria-pressed"'), "état actif via aria-pressed");
  const active = rule('\\.chip\\[aria-pressed="true"\\]');
  assert.ok(/background/.test(active), ".chip actif identifiable");
});

test("CT30: barre accessible, Tous premier et par défaut", () => {
  assert.ok(aisleJs.includes('"role", "group"'), "role=group sur la barre");
  assert.ok(
    aisleJs.includes("Filtrer par catégorie"),
    "groupe nommé pour les lecteurs d'écran",
  );
  assert.ok(
    aisleJs.includes('ALL_AISLES_LABEL = "Tous"'),
    'libellé "Tous"',
  );
  assert.ok(
    /const items = \[null, \.\.\.aisles\]/.test(aisleJs),
    "Tous rendu en premier",
  );
  assert.ok(
    /let active = null/.test(aisleJs),
    "Tous actif par défaut (état initial null)",
  );
  assert.ok(
    aisleJs.includes("aria-label\", `Filtrer par ${display}`") ||
      aisleJs.includes("Filtrer par ${display}"),
    "nom accessible par chip de rayon",
  );
});

test("CT30: clic chip ne ferme pas les suggestions (stopPropagation)", () => {
  const chip = aisleJs.match(/export const aisleChip = \([\s\S]*?\n};/);
  assert.ok(chip, "aisleChip existe dans aisle-filter.js");
  assert.ok(
    chip[0].includes("stopPropagation"),
    "le clic chip stoppe la propagation : le re-render détache la cible, " +
      "sans quoi le closer document y verrait un clic hors .search-section",
  );
});

test("CT30: re-render conserve le scroll (chip actif visible)", () => {
  const render = aisleJs.match(/export const renderAisleBar = \([\s\S]*?\n};/);
  assert.ok(render, "renderAisleBar existe dans aisle-filter.js");
  assert.ok(
    render[0].includes("scrollLeft"),
    "le re-render restaure le scroll horizontal (pas de saut à Tous)",
  );
});

test("CT30: module rayon inclus dans le précache offline", () => {
  assert.ok(
    swJs.includes("./js/aisle-filter.js"),
    "sw.js précache aisle-filter.js (chips fonctionnelles hors ligne)",
  );
});

test("CT30: barre placée après les tags actifs, sinon après la recherche", () => {
  assert.ok(
    /:scope > \[data-active-tags\]/.test(aisleJs),
    "ancrage après la barre de tags quand elle existe",
  );
  assert.ok(
    /:scope > \.search-bar/.test(aisleJs),
    "repli juste après .search-bar",
  );
});

test("CT30: suggestions filtrées par tags ET rayon, texte préservé", () => {
  const render = appJs.match(/function renderSuggestions\(\)[\s\S]*?\n}\n/);
  assert.ok(render, "renderSuggestions existe dans app.js");
  assert.ok(
    render[0].includes("structuredTerms"),
    "suggestions via structuredTerms combinés",
  );
  assert.ok(
    /getActiveTags\(\)\.map\(\(label\) => \(\{\s*label,\s*type:\s*"tag"\s*\}\)\)/.test(render[0]),
    "termes tags conservés à l'identique",
  );
  assert.ok(render[0].includes("aisleTerm()"), "terme rayon ajouté quand actif");
  const wire = appJs.match(/initAisleBar\(\{[\s\S]*?\}\);/);
  assert.ok(wire, "initAisleBar câblé dans boot()");
  assert.ok(!/\.value\s*=/.test(wire[0]), "changement de rayon ne touche pas au texte saisi");
  assert.ok(
    wire[0].includes("renderSuggestions()"),
    "changement de rayon re-filtre les suggestions",
  );
});

test("CT30: le filtre rayon ne touche ni liste ni Essentiels/Récents", () => {
  const wire = appJs.match(/initAisleBar\(\{[\s\S]*?\}\);/);
  assert.ok(wire, "initAisleBar câblé dans boot()");
  assert.ok(!/setFilter/.test(wire[0]), "pas de filtre sur la liste (suggestions uniquement)");
  assert.ok(
    !/getEssentials|getFavorites|topFrequent|recentItems/.test(wire[0]),
    "Essentiels/Favoris/Récents hors du câblage rayon",
  );
  assert.ok(
    appJs.includes("initTagBar({"),
    "câblage tags préservé",
  );
});
