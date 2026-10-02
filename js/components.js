/* Shopping List v0 — visual components (Lane B).
 * Pure DOM builders + CSS-class visuals only. No search/ranking logic,
 * no store access, no network. Behavior lanes (search/store/app) attach
 * listeners and state on top of these elements.
 *
 * Conventions (contract §9.4): data-* hooks, CustomEvent reactivity,
 * CookiGram class names (.shopping-*, .quantity-chip, .suggestion).
 */

/**
 * Integer quantity for row steppers (#7): leading digits of the stored
 * value, minimum 1. Blank, missing or non-numeric quantities read as 1,
 * so legacy free-text quantities are never destroyed, only stepped over.
 * Pure (unit-tested); storage keeps the plain string via store.setQty.
 */
export const parseQtyInt = (value) => {
  const match = String(value ?? "").trim().match(/^(\d+)/);
  const n = match ? Number.parseInt(match[1], 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
};

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, value);
  }
  return node;
}

/** Ingredient icon <img>, or an empty-span fallback when no icon resolves. */
export function ingredientIcon(iconPath, name) {
  if (iconPath) {
    const img = el("img", "shopping-item-icon", { src: iconPath, alt: "", loading: "lazy" });
    img.addEventListener("error", () => {
      img.replaceWith(ingredientIcon("", name));
    }, { once: true });
    return img;
  }
  const fallback = el("span", "shopping-item-icon shopping-item-icon--fallback", { "aria-hidden": "true" });
  return fallback;
}

/** Single-bucket shopping row: [checkbox] [icon] [name + qty] [heart]. */
/** Quantity stepper (− value +); − is disabled at the 1 minimum. */
export function qtyStepper(id, name, qtyInt) {
  const group = el("div", "qty-stepper", { role: "group", "aria-label": `Quantité de ${name}` });
  const dec = el("button", "qty-btn", {
    type: "button",
    "data-qty-dec": id,
    "aria-label": `Diminuer la quantité de ${name}`,
  });
  dec.textContent = "−";
  if (qtyInt <= 1) dec.disabled = true;
  const val = el("span", "qty-value", { "aria-hidden": "true" });
  val.textContent = String(qtyInt);
  const inc = el("button", "qty-btn", {
    type: "button",
    "data-qty-inc": id,
    "aria-label": `Augmenter la quantité de ${name}`,
  });
  inc.textContent = "+";
  group.append(dec, val, inc);
  return group;
}

export function checkboxRow({ id, name, qty = "", icon = "", checked = false, favorite = false, essential = null }) {
  const li = el("li", "shopping-item" + (checked ? " shopping-item--checked" : ""), {
    "data-shopping-item": id,
  });
  const row = el("div", "shopping-item-row");

  const cb = el("input", null, {
    type: "checkbox",
    "aria-label": `Cocher ${name}`,
    "data-item-check": id,
  });
  if (checked) cb.checked = true;

  const iconEl = ingredientIcon(icon, name);

  const copy = el("div", "shopping-item-copy");
  const strong = el("strong");
  strong.textContent = name;
  copy.appendChild(strong);
  // The stepper shows integer quantities; free-text legacy quantities
  // (no writer today) stay visible so no data is hidden.
  const qtyText = String(qty ?? "").trim();
  if (qtyText && !/^\d+$/.test(qtyText)) {
    const small = el("small");
    small.textContent = qtyText;
    copy.appendChild(small);
  }

  // #7 row order: checkbox, copy, stepper, pin, heart.
  row.append(cb, iconEl, copy, qtyStepper(id, name, parseQtyInt(qtyText)));
  // essential === null hides the pin (only when the caller omits it;
  // custom items are markable via their stable name: key).
  if (essential !== null) row.appendChild(essentialButton(id, essential));
  row.appendChild(heartButton(id, favorite));
  li.appendChild(row);
  return li;
}

/** Tri-state group-parent row (multi-quantity item): indeterminate = partial. */
export function parentRow({ id, name, icon = "", state = "empty" }) {
  const li = checkboxRow({ id, name, qty: "", icon, checked: state === "complete" });
  const cb = li.querySelector("input[type=checkbox]");
  if (state === "partial") {
    cb.indeterminate = true;
    cb.setAttribute("aria-checked", "mixed");
  } else {
    cb.setAttribute("aria-checked", state === "complete" ? "true" : "false");
  }
  const chips = el("div", "shopping-subquantities");
  li.querySelector(".shopping-item-row").appendChild(chips);
  return li;
}

/** Per-quantity toggle pill inside a multi-quantity row. */
export function quantityChip(bucketId, label, done = false) {
  const chip = el("button", "quantity-chip" + (done ? " is-done" : ""), {
    type: "button",
    "data-qty-chip": bucketId,
    "aria-pressed": done ? "true" : "false",
  });
  chip.textContent = label;
  return chip;
}

/** Aisle group card: <section> + <h3> + <ul>. Flat, transparent (CookiGram). */
export function aisleCard(aisle, rows = []) {
  const section = el("section", "shopping-group", { "data-aisle": aisle });
  const h3 = el("h3");
  h3.textContent = aisle;
  const ul = el("ul", "shopping-group-items");
  for (const row of rows) ul.appendChild(row);
  section.append(h3, ul);
  return section;
}

/** Essentials quick-add chip (`key`: stable candidate key, slug or name:…). */
export function essentialChip(key, name, active = false) {
  const li = el("li");
  const chip = el("button", "chip", {
    type: "button",
    "data-essential": key,
    "aria-pressed": active ? "true" : "false",
  });
  const plus = el("span", "chip-add", { "aria-hidden": "true" });
  plus.textContent = active ? "✓ " : "+ ";
  chip.append(plus, document.createTextNode(name));
  li.appendChild(chip);
  return li;
}

/** Pin (essential) toggle — visual only; pressed state set by caller.
 * UX21 (#21): inline SVG pin in the CookiGram stroke language (2px ink
 * strokes, round joins) instead of the system-emoji pushpin, so the essential
 * state reads as one calm product-line indicator. Color follows the
 * button (muted when off, orange when pressed); no legend needed.
 */
const PIN_SVG =
  '<svg class="essential-pin-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M12 2.8c-3.6 0-6.2 2.7-6.2 6.1 0 4.7 6.2 12.3 6.2 12.3s6.2-7.6 6.2-12.3c0-3.4-2.6-6.1-6.2-6.1z"' +
  ' fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
  '<circle cx="12" cy="8.9" r="2.2" fill="currentColor"/>' +
  "</svg>";
export function essentialButton(id, pressed = false) {
  const btn = el("button", "icon-btn", {
    type: "button",
    "data-essential-toggle": id,
    "aria-pressed": pressed ? "true" : "false",
    "aria-label": pressed ? "Retirer des essentiels" : "Marquer comme essentiel",
    title: pressed ? "Retirer des essentiels" : "Marquer comme essentiel",
  });
  btn.innerHTML = PIN_SVG;
  return btn;
}

/** Heart (favorite) toggle — visual only; pressed state set by caller. */
export function heartButton(id, pressed = false) {
  const btn = el("button", "icon-btn", {
    type: "button",
    "data-fav": id,
    "aria-pressed": pressed ? "true" : "false",
    "aria-label": pressed ? "Retirer des favoris" : "Ajouter aux favoris",
    title: pressed ? "Retirer des favoris" : "Ajouter aux favoris",
  });
  btn.textContent = pressed ? "♥" : "♡";
  return btn;
}

/** Broom (clear checked) button — visual only.
 * UX21 (#21): same inline-SVG broom as the actions bar in index.html
 * (36-grid stroke language shared with copy/share/export).
 */
const BROOM_SVG =
  '<svg class="shopping-action-icon" viewBox="0 0 36 36" aria-hidden="true" focusable="false">' +
  '<path d="M23 5L12 21" class="icon-ink"/>' +
  '<path d="M7 20l8-2 4 8-8 2z" class="icon-paper"/>' +
  '<path d="M9.5 22.5l4-1" class="icon-accent"/>' +
  '<path d="M28.5 6.5l2-2M31 9h2" class="icon-accent"/>' +
  "</svg>";
export function broomButton() {
  const btn = el("button", "shopping-action shopping-action--danger", {
    type: "button",
    "data-clear-checked": "",
    "aria-label": "Retirer les articles cochés",
    title: "Retirer les articles cochés",
  });
  btn.innerHTML = BROOM_SVG;
  return btn;
}

/** One search-suggestion row for the listbox. */
export function suggestionRow(slug, name, sub = "", icon = "") {
  const li = el("li", null, { role: "option", id: `suggestion-${slug}`, "aria-selected": "false" });
  const btn = el("button", "suggestion", { type: "button", "data-suggestion": slug });
  const iconEl = ingredientIcon(icon, name);
  iconEl.classList.remove("shopping-item-icon");
  iconEl.classList.add("suggestion-icon");
  if (iconEl.classList.contains("shopping-item-icon--fallback")) {
    iconEl.classList.remove("shopping-item-icon--fallback");
    iconEl.classList.add("suggestion-icon--fallback");
  }
  const copy = el("span", "suggestion-copy");
  const strong = el("strong");
  strong.textContent = name;
  copy.appendChild(strong);
  if (sub) {
    const small = el("small");
    small.textContent = sub;
    copy.appendChild(small);
  }
  btn.append(iconEl, copy);
  li.appendChild(btn);
  return li;
}

/** History row with a re-add button. */
export function historyRow(id, name) {
  const li = el("li", null, { "data-history-item": id });
  const label = el("span");
  label.textContent = name;
  const readd = el("button", "history-readd", {
    type: "button",
    "data-history-readd": id,
  });
  readd.textContent = "+ Ajouter";
  li.append(label, readd);
  return li;
}

/** Empty-list placeholder card. */
export function emptyState() {
  const div = el("div", "empty-state", { "data-empty-state": "" });
  const p1 = el("p");
  const strong = el("strong");
  strong.textContent = "Votre liste est vide.";
  p1.appendChild(strong);
  div.appendChild(p1);
  return div;
}

/** Toast (CookiGram showToast signature). Visual only. */
let toastTimer = 0;
export function showToast(message, durationMs = 2500) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), durationMs);
}
