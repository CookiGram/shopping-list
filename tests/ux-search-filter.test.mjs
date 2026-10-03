/* Shopping List — Issue #30 R3 : filtre rayon via les en-têtes de groupe de la liste.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 *
 * Décision Human Owner R3 :
 * - La barre de recherche reste épurée (aucun trigger, dot, panneau ni chips sous la barre).
 * - Les en-têtes de rayons déjà visibles dans la liste deviennent les contrôles de filtrage.
 * - Cliquer/taper sur un en-tête filtre la liste sur ce rayon (un seul à la fois).
 * - Cliquer à nouveau ou utiliser le bouton reset désactive le filtre.
 * - Projection visuelle pure : aucun item altéré ou supprimé en stockage.
 * - Cible tactile >= 44px, focus-visible, aria-pressed.
 * - Câblage unique via js/aisle-filter.js sans état concurrent.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getActiveAisle,
  setActiveAisle,
  toggleAisle,
  clearAisle,
  aisleTerm,
} from "../js/aisle-filter.js";
import { groupItemsByAisle } from "../js/list.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "css", "app.css"), "utf8");
const appJs = readFileSync(join(root, "js", "app.js"), "utf8");
const listJs = readFileSync(join(root, "js", "list.js"), "utf8");
const componentsJs = readFileSync(join(root, "js", "components.js"), "utf8");
const aisleJs = readFileSync(join(root, "js", "aisle-filter.js"), "utf8");
const swJs = readFileSync(join(root, "sw.js"), "utf8");

const rule = (selector) => {
  const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `règle ${selector} présente dans css/app.css`);
  return m[1];
};

test("CT30R3: barre de recherche épurée sans trigger, dot, panneau ni chips sous la barre", () => {
  const bar = html.match(/<div class="search-bar">([\s\S]*?)<\/div>\s*<ul/s);
  assert.ok(bar, ".search-bar présente dans index.html");
  // Aucun contrôle parasite dans la barre
  assert.ok(!bar[1].includes('id="shopping-aisle-filter"'), "aucun trigger de filtre dans la barre");
  assert.ok(!bar[1].includes("aisle-filter-trigger"), "aucune classe aisle-filter-trigger dans la barre");
  assert.ok(!html.includes("shopping-aisle-panel"), "aucun panneau modal dans index.html");
  assert.ok(!bar[1].includes("Tous"), "aucune mention de taxonomie dans la barre");

  // Dictée et clear préservés
  assert.ok(bar[1].includes('id="shopping-voice"'), "dictée conservée dans la barre");
  assert.ok(bar[1].includes('id="shopping-clear"'), "bouton clear conservé");

  // Aucun conteneur chips sous la recherche
  assert.ok(!html.includes("data-aisle-filter"), "aucun conteneur data-aisle-filter dans le DOM statique");
  assert.ok(!appJs.includes("initAisleBar({"), "initAisleBar n'est pas appelé");
  assert.ok(!appJs.includes("initAisleFilter({"), "initAisleFilter R2 n'est plus appelé");

  // Styles R2 nettoyés
  assert.ok(!/\.aisle-filter-trigger\s*\{/.test(css), "styles .aisle-filter-trigger supprimés");
  assert.ok(!/\.aisle-panel\s*\{/.test(css), "styles .aisle-panel supprimés");
  assert.ok(!/\.chip-row--scroll\s*\{/.test(css), ".chip-row--scroll supprimé");
});

test("CT30R3: en-têtes de rayons dans la liste transformés en contrôles interactifs", () => {
  const cardFn = componentsJs.match(/export function aisleCard[\s\S]*?\n\}/);
  assert.ok(cardFn, "aisleCard existe dans components.js");
  assert.ok(cardFn[0].includes("aisle-header-button"), "l'en-tête de rayon est un bouton interactif");
  assert.ok(cardFn[0].includes("data-aisle-header"), "attribut data-aisle-header présent");
  assert.ok(cardFn[0].includes("aria-pressed"), "aria-pressed géré selon isActive");
  assert.ok(cardFn[0].includes("Filtrer par rayon"), "label accessible descriptif au repos");
  assert.ok(cardFn[0].includes("Filtre actif"), "label accessible descriptif quand actif");
  assert.ok(cardFn[0].includes("aisle-header-badge"), "badge d'état actif présent");
  assert.ok(cardFn[0].includes("aisle-reset-button"), "bouton reset présent quand actif");
  assert.ok(cardFn[0].includes("data-aisle-reset"), "attribut data-aisle-reset présent sur le reset");

  // Styles accessibilité et cibles tactiles
  const btnRule = rule("\\.aisle-header-button");
  assert.ok(/min-height\s*:\s*44px/.test(btnRule), "hauteur tactile minimale de 44px");
  assert.ok(/cursor\s*:\s*pointer/.test(btnRule), "curseur pointer");

  const focusRule = rule("\\.aisle-header-button:focus-visible");
  assert.ok(/outline/.test(focusRule), "focus-visible stylisé pour navigation clavier");
});

test("CT30R3: état de rayon géré par js/aisle-filter.js sans état concurrent", () => {
  clearAisle();
  assert.equal(getActiveAisle(), null, "initialement aucun rayon actif");
  assert.equal(aisleTerm(), null, "aisleTerm null au repos");

  setActiveAisle("Épicerie");
  assert.equal(getActiveAisle(), "Épicerie");
  assert.deepEqual(aisleTerm(), { label: "Épicerie", type: "aisle" });

  // toggleAisle bascule vers null si déjà actif
  toggleAisle("Épicerie");
  assert.equal(getActiveAisle(), null, "toggleAisle sur le rayon actif le désactive");

  // toggleAisle active si inactif
  toggleAisle("Maison & entretien");
  assert.equal(getActiveAisle(), "Maison & entretien");

  clearAisle();
  assert.equal(getActiveAisle(), null, "clearAisle réinitialise à null");
});

test("CT30R3: câblage list.js (délégation de clics, subscription onAisleChange, unmount)", () => {
  assert.ok(listJs.includes("data-aisle-header"), "list.js gère la délégation data-aisle-header");
  assert.ok(listJs.includes("data-aisle-reset"), "list.js gère la délégation data-aisle-reset");
  assert.ok(listJs.includes("toggleAisle("), "clic sur header déclenche toggleAisle");
  assert.ok(listJs.includes("clearAisle("), "clic sur reset déclenche clearAisle");
  assert.ok(listJs.includes("onAisleChange("), "list.js écoute onAisleChange");
  assert.ok(listJs.includes("unsubscribeAisle"), "nettoyage sur unmount");
});

test("CT30R3: projection visuelle pure et masquage des autres groupes", () => {
  const items = [
    { id: "1", name: "Banane", aisle: "Fruits & légumes" },
    { id: "2", name: "Riz", aisle: "Épicerie" },
    { id: "3", name: "Savon", aisle: "Maison & entretien" },
  ];

  // Sans filtre actif
  const allGroups = groupItemsByAisle(items, null, null, null);
  assert.equal(allGroups.groups.length, 3, "3 groupes visibles au repos");

  // Avec filtre actif sur Épicerie
  const epicerieGroups = groupItemsByAisle(items, null, null, "Épicerie");
  assert.equal(epicerieGroups.groups.length, 1, "un seul groupe visible quand filtré");
  assert.equal(epicerieGroups.groups[0][0], "Épicerie");
  assert.equal(epicerieGroups.groups[0][1].length, 1);
  assert.equal(epicerieGroups.groups[0][1][0].item.name, "Riz");

  // Tous les items d'origine sont intacts
  assert.equal(items.length, 3, "le tableau d'items d'origine n'est pas modifié");
  assert.equal(items[0].name, "Banane");
  assert.equal(items[1].name, "Riz");
  assert.equal(items[2].name, "Savon");
});

test("CT30R3: suggestions de recherche synchronisées sans toucher au texte saisi", () => {
  assert.ok(appJs.includes("onAisleChange(() => {"), "app.js écoute onAisleChange");
  assert.ok(appJs.includes("renderSuggestions()"), "onAisleChange rafraîchit les suggestions");
  const render = appJs.match(/function renderSuggestions\(\)[\s\S]*?\n}\n/);
  assert.ok(render, "renderSuggestions existe dans app.js");
  assert.ok(render[0].includes("aisleTerm()"), "terme rayon pris en compte dans les suggestions");
  assert.ok(appJs.includes("initTagBar({"), "câblage des tags de recherche préservé");
});

test("CT30R3: module rayon toujours dans le précache offline", () => {
  assert.ok(
    swJs.includes("./js/aisle-filter.js"),
    "sw.js précache aisle-filter.js (filtre fonctionnel hors ligne)",
  );
});
