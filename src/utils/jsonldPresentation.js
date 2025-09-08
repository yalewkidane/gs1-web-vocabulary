// src/util/jsonldPresentation.js
export const GS1_CONTEXT_URL = 'https://ref.gs1.org/voc/data/gs1Voc.jsonld';

/**
 * Remove the GS1 context URL from @context and collapse array → object when possible.
 * If there is no inline object left after removing the URL, we leave the context as-is.
 */
export function compactContextForOutput(doc, { removeGs1Url = true } = {}) {
  if (!doc || typeof doc !== 'object') return doc;

  const ctx = doc['@context'];
  if (!ctx) return doc;

  // If @context is already an object, nothing to do
  if (!Array.isArray(ctx)) return doc;

  // Optionally strip the GS1 URL
  let out = removeGs1Url
    ? ctx.filter((c) => !(typeof c === 'string' && c === GS1_CONTEXT_URL))
    : ctx.slice();

  // If exactly one element remains and it's an object, collapse to that object
  if (out.length === 1 && typeof out[0] === 'object') {
    return { ...doc, '@context': out[0] };
  }

  // Otherwise, keep as array (don’t risk dropping other items)
  return { ...doc, '@context': out };
}
