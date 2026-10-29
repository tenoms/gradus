const named = value => typeof value === "string" ? value.replace(/<[^>]*>/g, " ").trim() : "";
const identifier = value => typeof value === "string" ? value.trim() : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";

function references(value) {
  if (Array.isArray(value)) return value.flatMap(references);
  if (value && typeof value === "object") {
    const id = identifier(value.id ?? value.knowledgeId ?? value.tagId);
    const name = named(value.name ?? value.knowledgeName ?? value.tagName ?? value.label);
    return id || name ? [{ id, name }] : [];
  }
  if (typeof value === "number") return Number.isSafeInteger(value) ? [{ id: String(value), name: "" }] : [];
  if (typeof value !== "string") return [];
  return value.split(/[,，]/).map(item => item.trim()).filter(Boolean).map(item =>
    /^\d+$/.test(item) ? { id: item, name: "" } : { id: "", name: named(item) },
  );
}

/** Keep the original string IDs intact: knowledge tag paths contain 18/19 digit values. */
export function computerKnowledgeReferences(question = {}) {
  const property = question.exerciseProperty || {};
  const result = references(property.knowledgeTags ?? question.knowledgeTags ?? question.knowledgeTagsIndex ?? []);
  const names = references(property.knowledgeTagNames ?? question.knowledgeTagNames ?? property.knowledgeNames ?? question.knowledgeNames ?? []);
  if (names.length === result.length) result.forEach((item, index) => { if (names[index].name) item.name ||= names[index].name; });
  else result.push(...names);
  const unique = new Map();
  for (const item of result) {
    const key = item.id || item.name;
    if (!key) continue;
    const previous = unique.get(key);
    unique.set(key, previous ? { ...previous, name: previous.name || item.name } : item);
  }
  return [...unique.values()];
}

export function computerKnowledgeMajorId(question = {}, fallback = "") {
  return identifier(question.majorId || question.exerciseProperty?.majorId) ||
    computerKnowledgeReferences(question).find(item => item.id)?.id || identifier(fallback);
}

/** Index both current flat chapter responses and any nested chapter/point rows. */
export function computerKnowledgeIndex(rows = [], initial = {}) {
  const index = { ...initial };
  const visit = value => {
    const items = Array.isArray(value) ? value : value?.list || value?.records || value?.data || [];
    for (const item of items) {
      const id = identifier(item.id ?? item.knowledgeId ?? item.tagId);
      const name = named(item.name ?? item.knowledgeName ?? item.tagName ?? item.label);
      if (id && name) index[id] = name;
      if (item.children || item.childList) visit(item.children || item.childList);
    }
  };
  visit(rows);
  return index;
}

export function resolveComputerKnowledgeTags(question, index = {}) {
  const tags = [], names = new Set();
  let missing = 0;
  for (const item of computerKnowledgeReferences(question)) {
    const name = item.name || index[item.id];
    if (!name) { missing++; continue; }
    if (names.has(name)) continue;
    names.add(name);
    tags.push({ id: item.id || name, name });
  }
  return { tags, missing };
}

/** One request per Web identity and subject; failed requests remain retryable. */
export function createComputerKnowledgeLoader(request) {
  const catalog = new Map();
  return (scope, majorId, retry = false) => {
    if (!majorId) return Promise.resolve({});
    const key = JSON.stringify([scope, majorId]);
    if (retry) catalog.delete(key);
    if (!catalog.has(key)) {
      const pending = Promise.resolve().then(() => request("/api/exam/wx/practice/knowledge", { majorId, examType: 2 }))
        .then(rows => computerKnowledgeIndex(rows))
        .catch(error => { catalog.delete(key); throw error; });
      catalog.set(key, pending);
    }
    return catalog.get(key);
  };
}
