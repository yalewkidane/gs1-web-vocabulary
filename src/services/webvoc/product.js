// src/services/masterdata/product.js
import { validate } from '../../validation/validator.js';
// Provide this when ready (you can start with a very small schema)
import productSchema from '../../validation/schemas/product.schema.json' with { type: 'json' };
// Optional: product frame if you want
// import productFrame from '../../frames/product.frame.json' with { type: 'json' };

import {
  ensureGs1Context,
  coercePlainJsonToJsonLd,
  deriveCanonicalIdNoValidation,
  expandJsonLd,
  shaclValidateExpanded,
  persistEntity,
  pickCountryCode,
  pickNameEn,
  getById,
} from './common.js';

export async function upsertProduct(raw) {
  const withContext = (raw && (raw['@context'] || raw['@id'] || raw['@type']))
    ? ensureGs1Context(raw)
    : coercePlainJsonToJsonLd(raw);

  // Ajv: strip @context/@id before validating
  const forAjv = { ...withContext };
  delete forAjv['@context'];
  delete forAjv['@id'];
  validate(productSchema, forAjv);

  // Canonical id: prefer @id; else GTIN; else GLN (your choice of fallback order)
  const id = deriveCanonicalIdNoValidation(withContext, ['gtin', 'globalLocationNumber']);

  // JSON-LD expand
  const expanded = await expandJsonLd(withContext, id);

  // SHACL (add a Product shape .ttl when ready; until then, SHACL may pass by default)
  await shaclValidateExpanded(expanded);

  // Optional: framing for Product (if you create a frame)
  // let framed = null;
  // try {
  //   framed = await jsonld.frame(expanded, productFrame);
  // } catch {}

  const countryCode = pickCountryCode(withContext);
  const name_en = pickNameEn(withContext?.name);
  const identifiers = {};
  if (withContext.gtin) identifiers.gtin = String(withContext.gtin);
  if (withContext.globalLocationNumber) identifiers.gln = String(withContext.globalLocationNumber);

  return persistEntity({
    id,
    types: Array.isArray(withContext['@type']) ? withContext['@type'] : [withContext['@type']],
    original: withContext,
    expanded,
    framed: null, // set if you add product framing
    countryCode,
    name_en,
    identifiers,
  });
}

export async function getProductById(id, opts) {
  return getById(id, opts);
}
