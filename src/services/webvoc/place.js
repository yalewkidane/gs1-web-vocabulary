// src/services/masterdata/place.js
import { validate } from '../../validation/validator.js';
import placeSchema from '../../validation/schemas/place.schema.json' with { type: 'json' };
import placeFrame from '../../frames/place.frame.json' with { type: 'json' };

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
import jsonld from 'jsonld';

export async function upsertPlace(raw) {
  const withContext = (raw && (raw['@context'] || raw['@id'] || raw['@type']))
    ? ensureGs1Context(raw)
    : coercePlainJsonToJsonLd(raw);

  // Ajv: strip @context/@id from validation surface
  const forAjv = { ...withContext };
  delete forAjv['@context'];
  delete forAjv['@id'];
  validate(placeSchema, forAjv);

  // Canonical id: prefer @id; else GLN; else GTIN (lenient, no format checks)
  const id = deriveCanonicalIdNoValidation(withContext, ['globalLocationNumber', 'gtin']);

  // JSON-LD expand
  const expanded = await expandJsonLd(withContext, id);

  // SHACL (Place shape must already be in your TTL)
  await shaclValidateExpanded(expanded);

  // Optional: frame just for Place
  let framed = null;
  try {
    framed = await jsonld.frame(expanded, placeFrame);
  } catch {
    // framing is optional; ignore if frame missing
  }

  // Persist
  const countryCode = pickCountryCode(withContext);
  const name_en = pickNameEn(withContext?.name);
  const identifiers = {};
  if (withContext.globalLocationNumber) identifiers.gln = String(withContext.globalLocationNumber);
  if (withContext.gtin) identifiers.gtin = String(withContext.gtin);

  return persistEntity({
    id,
    types: Array.isArray(withContext['@type']) ? withContext['@type'] : [withContext['@type']],
    original: withContext,
    expanded,
    framed,
    countryCode,
    name_en,
    identifiers,
  });
}

export async function getPlaceById(id, opts) {
  return getById(id, opts);
}
