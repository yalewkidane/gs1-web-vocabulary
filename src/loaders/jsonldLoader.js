// src/loaders/jsonldLoader.js
import jsonld from 'jsonld';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const defaultLoader = jsonld.documentLoaders.node();
export const GS1_CONTEXT_URL = 'https://ref.gs1.org/voc/data/gs1Voc.jsonld';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ NOTE THE 'contexts' (plural)
const LOCAL_PATH = path.resolve(__dirname, '../../contexts/gs1Voc.jsonld');

const cache = new Map();

export async function localLoader(url) {
  // Intercept the official GS1 context URL
  if (url === GS1_CONTEXT_URL || url.endsWith('/gs1Voc.jsonld')) {
    if (!cache.has(GS1_CONTEXT_URL)) {
      try {
        const raw = await readFile(LOCAL_PATH, 'utf8');
        cache.set(GS1_CONTEXT_URL, {
          contextUrl: null,
          documentUrl: GS1_CONTEXT_URL,
          document: JSON.parse(raw),
        });
      } catch (err) {
        console.warn(
          `GS1 context not found at ${LOCAL_PATH}; falling back to network fetch: ${err.message}`
        );
        // fallback to remote fetch so you’re not blocked
        const doc = await defaultLoader(url);
        cache.set(GS1_CONTEXT_URL, doc);
      }
    }
    return cache.get(GS1_CONTEXT_URL);
  }

  // Cache everything else too
  if (cache.has(url)) return cache.get(url);
  const doc = await defaultLoader(url);
  cache.set(url, doc);
  return doc;
}
