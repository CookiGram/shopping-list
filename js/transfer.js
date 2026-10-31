/* CookiGram → CookiList explicit transfer receiver, contract v1. */
import { getItems, addItem, removeItem } from "./store.js";

export const TRANSFER_TYPE = "cookigram.shopping-transfer";
export const TRANSFER_LEDGER_KEY = "shopping-list:cookigram-transfers:v1";
const MAX_BYTES = 24 * 1024;
const MAX_ITEMS = 100;

const decodeBase64Url = (encoded) => {
  if (encoded.length > 32768 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("Lien de transfert invalide");
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (bytes.byteLength > MAX_BYTES) throw new Error("Transfert trop volumineux");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};

export const validateTransfer = (data) => {
  if (!data || data.type !== TRANSFER_TYPE || data.version !== 1
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.transferId)
      || !Number.isFinite(Date.parse(data.createdAt))
      || !Array.isArray(data.items) || data.items.length > MAX_ITEMS) {
    throw new Error("Format de transfert CookiGram non reconnu");
  }
  const items = data.items.map((item) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (item?.qty !== undefined && typeof item.qty !== "string") throw new Error("Quantité invalide");
    const qty = typeof item?.qty === "string" ? item.qty.trim() : "";
    const slug = item?.slug == null ? null : item.slug;
    if (!name || name.length > 120 || qty.length > 80
        || (slug !== null && (typeof slug !== "string" || !/^[a-z0-9-]{1,100}$/i.test(slug)))) {
      throw new Error("Un article du transfert est invalide");
    }
    const source = item?.recipe;
    let recipe;
    if (source !== undefined) {
      if (!source || typeof source.id !== "string" || source.id.length > 120
          || typeof source.name !== "string" || !source.name.trim() || source.name.length > 120) {
        throw new Error("Provenance de recette invalide");
      }
      if (source.url !== undefined) {
        let url;
        try { url = new URL(source.url); } catch { throw new Error("Lien de recette invalide"); }
        if (url.protocol !== "https:" || url.hostname !== "cookigram.github.io"
            || !url.pathname.startsWith("/cookigram/")) {
          throw new Error("Lien de recette non autorisé");
        }
      }
      recipe = { id: source.id, name: source.name.trim(), ...(source.url ? { url: source.url } : {}) };
    }
    return { name, qty, slug, ...(recipe ? { recipe } : {}) };
  });
  return { type: TRANSFER_TYPE, version: 1, transferId: data.transferId, createdAt: data.createdAt, items };
};

export const parseTransferHash = (hash) => {
  const value = String(hash ?? "");
  if (!value.startsWith("#cookigram-transfer=")) return null;
  const encoded = value.slice("#cookigram-transfer=".length);
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("Lien de transfert invalide");
  let parsed;
  try { parsed = JSON.parse(decodeBase64Url(encoded)); }
  catch (error) { throw new Error(error?.message || "Transfert illisible"); }
  return validateTransfer(parsed);
};

const getLedger = (storage) => {
  try {
    const value = JSON.parse(storage.getItem(TRANSFER_LEDGER_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
};

const normalized = (value) => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const applyTransfer = (transfer, {
  storage = globalThis.localStorage,
  getCurrentItems = getItems,
  add = addItem,
} = {}) => {
  const safe = validateTransfer(transfer);
  const ledger = getLedger(storage);
  if (ledger[safe.transferId]) return { alreadyApplied: true, added: [], skipped: safe.items.length };
  const added = [];
  let skipped = 0;
  for (const entry of safe.items) {
    const duplicate = getCurrentItems().some((item) => normalized(item.name) === normalized(entry.name)
      && String(item.qty ?? "").trim().replace(/\s+/g, " ") === entry.qty);
    if (duplicate) { skipped++; continue; }
    const item = add({ name: entry.name, qty: entry.qty, slug: entry.slug,
      provenance: { source: "cookigram", ...(entry.recipe ? { recipes: [entry.recipe] } : {}) } });
    if (item?.id) added.push({ id: item.id, item });
    else skipped++;
  }
  ledger[safe.transferId] = { added, completedAt: Date.now() };
  storage.setItem(TRANSFER_LEDGER_KEY, JSON.stringify(ledger));
  return { alreadyApplied: false, added, skipped };
};

export const undoTransfer = (transferId, {
  storage = globalThis.localStorage,
  getCurrentItems = getItems,
  remove = removeItem,
} = {}) => {
  const ledger = getLedger(storage);
  const record = ledger[transferId];
  if (!record) return 0;
  let removed = 0;
  for (const ref of record.added ?? []) {
    const current = getCurrentItems().find((item) => item.id === ref.id);
    if (current && JSON.stringify(current) === JSON.stringify(ref.item) && remove(ref.id)) removed++;
  }
  delete ledger[transferId];
  storage.setItem(TRANSFER_LEDGER_KEY, JSON.stringify(ledger));
  return removed;
};
