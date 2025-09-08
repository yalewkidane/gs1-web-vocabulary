// src/services/masterdata.js
import jsonld from 'jsonld';
import { getDb } from './db.js';
import { localLoader } from '../loaders/jsonldLoader.js';
import { validate } from '../validation/validator.js';

import placeFrame from '../frames/place.frame.json' with { type: 'json' };
import placeSchema from '../validation/schemas/place.schema.json' with { type: 'json' };

import { validateShacl } from '../validation/shacl.js';

const GS1_CONTEXT = 'https://ref.gs1.org/voc/data/gs1Voc.jsonld';

/* --------------------------------------------------------------- */
/* Helpers                                                         */
/* --------------------------------------------------------------- */

function ensureGs1Context(input) {
  // Append the official GS1 context URL so our localLoader can serve the local file.
  const ctx = input['@context'];
  if (!ctx) return { ...input, '@context': GS1_CONTEXT };
  const arr = Array.isArray(ctx) ? ctx : [ctx];
  return arr.includes(GS1_CONTEXT) ? input : { ...input, '@context': [...arr, GS1_CONTEXT] };
}

function coercePlainJsonToJsonLd(input) {
  // Accept plain JSON (application/json) and normalize minimal JSON-LD bits.
  // If the payload already has @context / @type / @id, this is a no-op.
  let out = { ...input };
  if (out.id && !out['@id']) out['@id'] = out.id;
  if (out.type && !out['@type']) out['@type'] = out.type;
  // Ensure GS1 context so terms resolve; append last to keep it authoritative.
  out = ensureGs1Context(out);
  return out;
}

function normalizeTypes(t) {
  if (!t) return [];
  return Array.isArray(t) ? t.filter(Boolean) : [t];
}


function luhnCheck(numStr) {
  // Mod-10 (Luhn) check used for GLN/GTIN
  let sum = 0;
  const digits = numStr.split('').map((d) => parseInt(d, 10));
  for (let i = digits.length - 1, alt = false; i >= 0; i--, alt = !alt) {
    let d = digits[i];
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function deriveCanonicalIdNoValidation(data) {
  if (data['@id'] != null && String(data['@id']).trim() !== '') {
    return String(data['@id']).trim();
  }
  if (data.globalLocationNumber != null && String(data.globalLocationNumber).trim() !== '') {
    return String(data.globalLocationNumber).trim();
  }
  if (data.gtin != null && String(data.gtin).trim() !== '') {
    return String(data.gtin).trim();
  }
  const e = new Error('Provide @id or globalLocationNumber or gtin.');
  e.statusCode = 422;
  throw e;
}

// Optional helper: only for the jsonld.expand base (don’t “validate”; just detect)
const isAbsoluteIri = (v) => typeof v === 'string' && /^[a-z][a-z0-9+.-]*:/i.test(v);

function deriveCanonicalId(data, types) {
  // 1) Prefer absolute @id, if present
  const id = data['@id'];
  if (isAbsoluteIri(id)) return id;

  // 2) Derive from class-specific identifiers
  // Place with numeric GLN -> GS1 Digital Link AI 414
  if (types.includes('gs1:Place') && data.globalLocationNumber) {
    const gln = String(data.globalLocationNumber).trim();
    if (/^\d{13}$/.test(gln) && luhnCheck(gln)) {
      return `https://id.gs1.org/414/${gln}`;
    }
    // If GLN is not numeric (e.g., a URN), we cannot mint 414 — require an absolute @id
  }

  // Product with GTIN -> AI 01
  if (types.includes('gs1:Product') && data.gtin) {
    const gtin = String(data.gtin).trim();
    if (/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(gtin) && luhnCheck(gtin)) {
      return `https://id.gs1.org/01/${gtin}`;
    }
  }

  // 3) If @id exists but not absolute, reject (avoid storing opaque local IDs)
  if (id) {
    const e = new Error('@id must be an absolute IRI (http/https) or provide a valid GLN/GTIN');
    e.statusCode = 422;
    throw e;
  }

  // 4) Otherwise fail with a helpful message
  const e = new Error(
    'Missing canonical identifier. Provide @id (absolute IRI) or a valid class-specific key (e.g., 13-digit GLN for Place, GTIN for Product).'
  );
  e.statusCode = 422;
  throw e;
}

function pickCountryCode(data) {
  return (
    data?.address?.countryCode ??
    data?.address?.addressCountry ??
    data?.countryCode ??
    undefined
  );
}

function pickNameEn(name) {
  if (!name) return undefined;
  if (Array.isArray(name)) {
    const find = (tag) => name.find((n) => n['@language']?.toLowerCase() === tag)?.['@value'];
    return find('en-us') ?? find('en') ?? name[0]?.['@value'];
  }
  if (typeof name === 'string') return name;
  return undefined;
}



/* --------------------------------------------------------------- */
/* Main API                                                        */
/* --------------------------------------------------------------- */

export async function processMasterdata(rawInput) {
  // Accept both application/json and application/ld+json:
  // - If it's plain JSON, coerce minimal JSON-LD bits and append GS1 context.
  // - If it's already JSON-LD, just ensure the GS1 context URL is present.
  const inputLooksJsonLd = rawInput && (rawInput['@context'] || rawInput['@id'] || rawInput['@type']);
  const withContext = inputLooksJsonLd
    ? ensureGs1Context(rawInput)
    : coercePlainJsonToJsonLd(rawInput);

  // Normalize @type
  const types = normalizeTypes(withContext['@type']);
  if (types.length === 0) {
    const e = new Error('Missing @type');
    e.statusCode = 400;
    throw e;
  }

  // Lightweight shape validation with Ajv for known classes.
  // Strip @context so Ajv doesn’t choke on object/array contexts.
  const forAjv = { ...withContext };
  delete forAjv['@context'];

  if (types.includes('gs1:Place')) {
    try {
      validate(placeSchema, forAjv); // throws 422 with details on failure (see validator.js)
    } catch (err) {
      err.statusCode = err.statusCode ?? 422;
      throw err;
    }
  }
  // TODO: add validate(productSchema, forAjv), validate(organizationSchema, ...) as you add them.

  // Build canonical identifier (prefers absolute @id; else GLN/GTIN rules)
  //const canonicalId = deriveCanonicalId(withContext, types);
  const canonicalId = deriveCanonicalIdNoValidation(withContext);

  const expanded = await jsonld.expand(withContext, {
       documentLoader: localLoader,
          base: isAbsoluteIri(canonicalId) ? canonicalId : undefined,
           });
    // JSON-LD -> SHACL graph validation
   
    const shacl = await validateShacl(expanded);
    if (!shacl.ok) {
    const err = new Error('SHACL validation failed');
    err.statusCode = 422;
    err.details = shacl.results;  // [{ focusNode, path, message, severity, sourceConstraintComponent }, ...]
    throw err;
    }

  // Frame when we have a frame for that class (Place example)
  let framed = null;
  if (types.includes('gs1:Place')) {
    framed = await jsonld.frame(expanded, placeFrame, { documentLoader: localLoader });
  }

  // Persist
  const db = getDb();
  const collection = db.collection('entities');

  const now = new Date();
  const countryCode = pickCountryCode(withContext);
  const name_en = pickNameEn(withContext?.name);
  const identifiers = {};
  if (withContext.globalLocationNumber) identifiers.gln = String(withContext.globalLocationNumber);
  if (withContext.gtin) identifiers.gtin = String(withContext.gtin);

  await collection.updateOne(
    { _id: canonicalId },
    {
      $set: {
        _id: canonicalId,
        type: types.length === 1 ? types[0] : types,
        original: withContext,
        expanded,
        framed,
        countryCode,
        name_en,
        identifiers,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  // Return an envelope your router can send back (JSON-LD by default)
  return {
    id: canonicalId,
    stored: true,
    version: now.toISOString(),
    representation: framed ?? withContext,
  };
}

export async function getMasterdataById(id, { view = 'original' } = {}) {
  const db = getDb();
  const collection = db.collection('entities');

  // project only what we need; default to original
  const projection = { _id: 0 };
  if (['original', 'framed', 'expanded'].includes(view)) {
    projection[view] = 1;
  } else {
    projection.original = 1;
  }

  const hit = await collection.findOne({ _id: id }, { projection });
  if (!hit) return null;

  // graceful fallback if the requested view isn’t present
  return hit[view] ?? hit.original ?? hit.framed ?? hit.expanded ?? null;
}

