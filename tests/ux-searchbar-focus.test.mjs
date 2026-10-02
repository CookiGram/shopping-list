/* Shopping List — Issue #29 : barre de recherche à contour unique.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * Ces tests épinglent le contrat visuel sans navigateur : une seule
 * enveloppe (loupe + champ), une seule bordure externe, un seul état
 * de focus via :focus-within du wrapper, aucun contour parasite sur
 * l'input interne (la règle globale :focus-visible lui ajoutait un
 * anneau + radius = double contour et ligne verticale après la loupe).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "css", "app.css"), "utf8");

const rule = (selector) => {
  const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `règle ${selector} présente dans css/app.css`);
  return m[1];
};

test("SB29: une seule enveloppe contient loupe + champ + actions", () => {
  const bar = html.match(/<div class="search-bar">([\s\S]*?)<\/div>/);
  assert.ok(bar, ".search-bar présente dans index.html");
  const body = bar[1];
  assert.ok(body.includes('class="search-icon"'), "la loupe est dans l'enveloppe");
  assert.ok(body.includes('class="search-input"'), "le champ est dans l'enveloppe");
  assert.ok(!/<div class="search-bar">/.test(body), "pas d'enveloppe imbriquée");
});

test("SB29: l'input garde sa sémantique (type, combobox, ARIA)", () => {
  const input = html.match(/<input[^>]*class="search-input"[^>]*>/);
  assert.ok(input, "input.search-input présent");
  assert.ok(input[0].includes('type="search"'), "type=search conservé (clavier mobile)");
  assert.ok(input[0].includes('role="combobox"'), "role=combobox conservé");
  assert.ok(input[0].includes('aria-controls="shopping-suggestions"'), "liaison listbox conservée");
});

test("SB29: le wrapper porte l'unique bordure et l'anneau focus-within", () => {
  const bar = rule("\\.search-bar");
  assert.ok(/border\s*:\s*1px solid/.test(bar), ".search-bar a sa bordure externe");
  assert.ok(/border-radius\s*:\s*var\(--radius-full\)/.test(bar), ".search-bar en pilule");
  const within = rule("\\.search-bar:focus-within");
  assert.ok(/border-color\s*:\s*var\(--orange\)/.test(within), "focus-within colore la bordure");
  assert.ok(/box-shadow\s*:\s*0 0 0 3px/.test(within), "focus-within garde l'anneau clavier visible");
});

test("SB29: l'input interne ne dessine aucun contour (base)", () => {
  const input = rule("\\.search-input");
  assert.ok(/border\s*:\s*0/.test(input), ".search-input sans bordure");
  assert.ok(/background\s*:\s*transparent/.test(input), ".search-input sans fond propre");
  assert.ok(/appearance\s*:\s*none/.test(input), ".search-input normalisé (appearance:none)");
  assert.ok(!/box-shadow/.test(input), ".search-input sans ombre portée");
});

test("SB29: l'input neutralise la règle globale :focus-visible", () => {
  const m = css.match(/\.search-input:focus,\s*\.search-input:focus-visible\s*\{([^}]*)\}/);
  assert.ok(m, "règle .search-input:focus + :focus-visible présente");
  assert.ok(/outline\s*:\s*none/.test(m[1]), "outline neutralisé");
  assert.ok(/box-shadow\s*:\s*none/.test(m[1]), "anneau box-shadow neutralisé");
  assert.ok(/border(-radius)?\s*:\s*0/.test(m[1]), "bordure/radius neutralisés");
});

test("SB29: pas de séparateur vertical entre loupe et champ", () => {
  for (const selector of ["\\.search-input", "\\.search-icon", "\\.search-bar"]) {
    assert.ok(
      !/border-left/.test(rule(selector)),
      `${selector} ne doit pas porter de border-left`,
    );
  }
});

test("SB29: décorations natives type=search masquées, clear custom conservé", () => {
  for (const pseudo of [
    "::-webkit-search-cancel-button",
    "::-webkit-search-decoration",
    "::-webkit-search-results-button",
    "::-webkit-search-results-decoration",
  ]) {
    assert.ok(
      css.includes(`.search-input${pseudo}`),
      `.search-input${pseudo} neutralisé (pas de croix native en doublon)`,
    );
  }
  assert.ok(html.includes('class="search-clear"'), "le bouton clear custom est conservé");
});

test("SB29: autofill sans bloc/contour interne", () => {
  const m = css.match(/\.search-input:-webkit-autofill\s*\{([^}]*)\}/);
  assert.ok(m, "règle :-webkit-autofill présente sur .search-input");
  assert.ok(m[1].includes("inset"), "autofill fondu dans le fond de la barre (inset)");
});
