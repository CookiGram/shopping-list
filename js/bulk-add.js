/* #53: opt-in multi-line entry. No mutation until explicit confirmation.
 * Existing matches are filtered BEFORE store.addItem (which would uncheck them).
 */
import { normalizeName } from "./store.js";

export function planBulkItems(text, existing = [], resolve = (name) => ({ name })) {
  const seen = new Set(
    (Array.isArray(existing) ? existing : [])
      .map((item) => normalizeName(item?.name))
      .filter(Boolean),
  );
  const planned = [];
  for (const line of String(text ?? "").split(/\r\n|\n|\r/)) {
    const raw = line.trim();
    if (!raw) continue;
    const item = resolve(raw) ?? {};
    const name = String(item.name ?? raw).trim();
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    planned.push({
      name,
      slug: item.slug ?? null,
      provenance: item.provenance ?? { source: "custom" },
    });
  }
  return planned;
}

export function attachBulkAddUI({
  trigger, panel, input, status, preview, confirm, cancel,
  getItems, addItem, resolve, notify = () => {},
}) {
  if (![trigger, panel, input, status, preview, confirm, cancel].every(Boolean)) return;
  const candidates = () => planBulkItems(input.value, getItems(), resolve);
  const refresh = () => {
    const entries = candidates();
    status.textContent = entries.length
      ? `${entries.length} article${entries.length > 1 ? "s" : ""} à ajouter`
      : "Aucun nouvel article à ajouter";
    preview.textContent = entries.map((item) => `• ${item.name}`).join("\n");
    confirm.disabled = entries.length === 0;
    return entries;
  };
  const close = () => {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    input.value = "";
    refresh();
    trigger.focus();
  };
  trigger.addEventListener("click", () => {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    refresh();
    input.focus();
  });
  input.addEventListener("input", refresh);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  cancel.addEventListener("click", close);
  confirm.addEventListener("click", () => {
    const entries = refresh(); // protect against list changes after preview
    if (!entries.length) {
      notify("Aucun nouvel article à ajouter");
      return;
    }
    let added = 0;
    for (const item of entries) {
      try {
        addItem(item);
        added += 1;
      } catch {
        /* Best-effort, do not lose unsaved text after a partial failure. */
      }
    }
    if (added !== entries.length) {
      refresh();
      notify(`${added} article${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""} ; ${entries.length - added} échec(s)`);
      return;
    }
    close();
    notify(`${added} article${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""}`);
  });
  refresh();
  return { refresh };
}
