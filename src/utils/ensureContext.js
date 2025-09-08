// utils/ensureContext.js
import { GS1_CONTEXT_URL } from '../loaders/jsonldLoader.js';

export function ensureGs1Context(input) {
  const ctx = input['@context'];
  if (!ctx) return { ...input, '@context': GS1_CONTEXT_URL };

  // normalize to array
  const arr = Array.isArray(ctx) ? ctx : [ctx];

  // if GS1 URL already present, no-op; otherwise append it last (later contexts win)
  return arr.includes(GS1_CONTEXT_URL)
    ? input
    : { ...input, '@context': [...arr, GS1_CONTEXT_URL] };
}
