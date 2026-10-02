/* CookiList voice-add prototype — pure transcript parsing helpers.
 * Browser speech recognition stays in app.js; this module is DOM-free and
 * deliberately small so the experiment can be removed without touching store.
 */

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[’']/g, "'")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cleanLead = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^(?:s['’]il\s+te\s+pla[iî]t\s+)?(?:ajoute|rajoute|mets|met|note)\s+(?:moi\s+)?/iu, "")
    .replace(/^(?:j['’]ai\s+besoin\s+de|il\s+me\s+faut)\s+/iu, "")
    .trim();

const cleanItem = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^[,;:.!?\s]+|[,;:.!?\s]+$/gu, "")
    .replace(/^(?:du|de\s+la|de\s+l['’]|des|un|une)\s+/iu, "")
    .trim();

const vocabularyTerms = (vocabulary = []) => {
  const out = new Map();
  for (const raw of Array.isArray(vocabulary) ? vocabulary : []) {
    const term = typeof raw === "string" ? raw : raw?.term ?? raw?.name ?? "";
    const key = normalize(term);
    if (key && !out.has(key)) out.set(key, String(term).trim());
  }
  return out;
};

const splitExplicit = (text) => {
  const parts = text
    .split(/\s*(?:[,;\n]+|\b(?:et|puis|ensuite)\b)\s*/iu)
    .map(cleanItem)
    .filter(Boolean);
  return parts.length > 1 ? parts : null;
};

function segmentKnown(text, vocabulary) {
  const words = normalize(text).split(" ").filter(Boolean);
  if (words.length < 2) return null;
  const terms = vocabularyTerms(vocabulary);
  if (!terms.size) return null;

  const result = [];
  let cursor = 0;
  while (cursor < words.length) {
    let hit = null;
    const max = Math.min(6, words.length - cursor);
    for (let size = max; size >= 1; size -= 1) {
      const key = words.slice(cursor, cursor + size).join(" ");
      if (terms.has(key)) {
        hit = { label: terms.get(key), size };
        break;
      }
    }
    if (!hit) return null;
    result.push(hit.label);
    cursor += hit.size;
  }
  return result.length > 1 ? result : null;
}

/**
 * Turn one short French shopping-list utterance into candidate item phrases.
 * Explicit separators win; otherwise a catalogue vocabulary can recover a
 * punctuation-free sequence such as "lait oeufs papier toilette".
 */
export function splitVoiceTranscript(transcript, vocabulary = []) {
  const raw = cleanLead(transcript);
  if (!raw) return [];
  return splitExplicit(raw) ?? segmentKnown(raw, vocabulary) ?? [cleanItem(raw)].filter(Boolean);
}

/** Names + aliases from buildIngredientIndex() output, deduplicated. */
export function buildVoiceVocabulary(searchIndex = []) {
  const terms = [];
  const seen = new Set();
  for (const indexed of Array.isArray(searchIndex) ? searchIndex : []) {
    const entry = indexed?.entry ?? indexed?.ingredient ?? indexed ?? {};
    for (const raw of [entry.name, ...(entry.aliases ?? [])]) {
      const key = normalize(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      terms.push(String(raw).trim());
    }
  }
  return terms;
}
