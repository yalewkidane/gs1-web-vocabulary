// src/validation/shacl.js
import jsonld from 'jsonld';
import rdf from 'rdf-ext';
import { Parser as N3Parser } from 'n3';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ShaclValidator from 'rdf-validate-shacl';   // <-- stable default export

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedValidator = null;

async function getValidator() {
  //console.log('[SHACL] shapes quads size:', shapes.size);

  if (cachedValidator) return cachedValidator;

  const shapesPath = path.resolve(__dirname, '../shapes/gs1Voc.ttl');
  const ttl = await readFile(shapesPath, 'utf8');

  const parser = new N3Parser({ format: 'text/turtle' });
  const shapesQuads = parser.parse(ttl);
  const shapes = rdf.dataset(shapesQuads);

  if (shapes.size === 0) {
    throw new Error('SHACL shapes dataset is empty (check src/shapes/gs1Voc.ttl)');
  }

  cachedValidator = new ShaclValidator(shapes);
  return cachedValidator;
}

async function datasetFromExpanded(expanded) {
  const nquads = await jsonld.toRDF(expanded, { format: 'application/n-quads' });
  const parser = new N3Parser({ format: 'application/n-quads' });
  const quads = parser.parse(nquads);
  return rdf.dataset(quads);
}

export async function validateShacl(expanded) {
  const data = await datasetFromExpanded(expanded);
  const validator = await getValidator();
  const report = validator.validate(data);

  if (report.conforms) return { ok: true, results: [] };

  // 0.5.5 exposes .results as an array of result objects
  const results = (report.results || []).map(r => ({
    focusNode: r.focusNode?.value,
    path: r.resultPath?.value,
    message: Array.isArray(r.message) ? r.message.map(m => m.value).join('; ') : r.message?.value,
    severity: r.severity?.value?.split('#').pop(),
    sourceConstraintComponent: r.sourceConstraintComponent?.value?.split('#').pop(),
  }));

  return { ok: false, results: results.length ? results : [{ message: 'SHACL failed (no details)'}] };
}
