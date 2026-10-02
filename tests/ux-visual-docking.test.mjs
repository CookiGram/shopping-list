/* Shopping List — UX #14 : arrimage visuel CookiGram ↔ CookiList.
 * Runner: node --test tests/*.test.mjs (stdlib only, no deps).
 * Épingle l'échelle perceptuelle alignée sur CookiGram (build audité
 * HEAD 656f2f0) : page liste cousine `static/selection/style.css`
 * (conteneur 900px, rythme 18px), topbar (76px, marque 22px/700).
 * Les valeurs homologues CookiGram sont rappelées dans chaque test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "css", "app.css"), "utf8");

const rule = (selector) => {
  const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `règle ${selector} présente dans css/app.css`);
  return m[1];
};

test("UX14: conteneur desktop 900px (CookiGram selection-page 900px)", () => {
  const shell = rule("\\.shell");
  assert.ok(/max-width\s*:\s*900px/.test(shell), ".shell doit plafonner à 900px sur desktop");
  assert.ok(!/^\s*width\s*:\s*\d+px/m.test(shell), ".shell ne doit pas fixer width (fluide sous le plafond)");
});

test("UX14: gouttières 18px desktop / 12px mobile (CookiGram 18px / 12px)", () => {
  const shell = rule("\\.shell");
  assert.ok(/padding\s*:[^;]*18px/.test(shell), ".shell desktop : padding horizontal 18px");
  assert.ok(
    /@media\s*\(max-width\s*:\s*600px\)[\s\S]*?\.shell\s*\{[^}]*12px/.test(css),
    "mobile ≤600px : gouttière 12px comme CookiGram",
  );
});

test("UX14: topbar 76px (CookiGram .topbar height 76px)", () => {
  assert.ok(
    /min-height\s*:\s*76px/.test(rule("\\.topbar")),
    ".topbar doit garantir 76px de hauteur",
  );
});

test("UX14: marque 22px/700 (CookiGram .brand 22px/700/-0.02em)", () => {
  const brand = rule("\\.brand");
  assert.ok(/font-size\s*:\s*22px/.test(brand), ".brand à 22px");
  assert.ok(/font-weight\s*:\s*700/.test(brand), ".brand en gras 700");
  assert.ok(/letter-spacing\s*:\s*-0\.02em/.test(brand), ".brand letter-spacing -0.02em");
  assert.ok(/width\s*:\s*32px/.test(rule("\\.brand-logo")), "logo 32px comme CookiGram");
});

test("UX14: rythme vertical 18px desktop / 16px mobile (CookiGram 18px / 16px)", () => {
  assert.ok(/gap\s*:\s*18px/.test(rule("\\.shopping-list")), ".shopping-list gap 18px");
  assert.ok(/gap\s*:\s*18px/.test(rule("main")), "main gap 18px");
  assert.ok(
    /@media\s*\(max-width\s*:\s*600px\)[\s\S]*?\.shopping-list\s*\{[^}]*gap\s*:\s*16px/.test(css),
    "mobile ≤600px : gap 16px comme CookiGram",
  );
});

test("UX14: titres de rayons 1.02rem (CookiGram shopping-group h3 1.02rem)", () => {
  assert.ok(
    /font-size\s*:\s*1\.02rem/.test(rule("\\.shopping-group h3")),
    "rayons à 1.02rem, sans empattement comme la page cousine",
  );
});

test("UX14: aucun affichage de titre piloté par le CSS (titres = scope #13)", () => {
  // #14 n'aligne que l'échelle (largeurs, tailles, rythme) : il ne montre
  // ni ne cache aucun titre. L'état textuel (quoi afficher) appartient à
  // #13 et à sa suite ux-text-hierarchy. Base-indépendant : valable avec
  // ou sans #13 mergée (toutes les occurrences de chaque règle scrutées).
  for (const selector of ["h1", "h2", ".section-title", ".list-section-title"]) {
    const bodies = [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]);
    for (const body of bodies) {
      assert.ok(!/(^|;)\s*display\s*:/m.test(body), `${selector} : aucune règle display (scope #13)`);
      assert.ok(!/(^|;)\s*visibility\s*:/m.test(body), `${selector} : aucune règle visibility (scope #13)`);
    }
  }
});

test("UX14: pas de carte recette ni grille CookiGram (non-goal explicite)", () => {
  assert.ok(!/recipe-card|card-grid|\.hero-banner/.test(css), "aucun modèle de cartes importé");
});
