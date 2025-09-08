// src/services/webvoc/common.js
import jsonld from 'jsonld';
import { getDb } from '../db.js';
import { localLoader } from '../../loaders/jsonldLoader.js';
import { validateShacl } from '../../validation/shacl.js';

export const GS1_CONTEXT = 'https://ref.gs1.org/voc/data/gs1Voc.jsonld';

export function ensureGs1Context(input) {
  const ctx = input['@context'];
  if (!ctx) return { ...input, '@context': GS1_CONTEXT };
  const arr = Array.isArray(ctx) ? ctx : [ctx];
  return arr.includes(GS1_CONTEXT) ? input : { ...input, '@context': [...arr, GS1_CONTEXT] };
}

export function coercePlainJsonToJsonLd(input) {
  const out = { ...input };
  if (out.id && !out['@id']) out['@id'] = String(out.id);
  if (out.type && !out['@type']) out['@type'] = out.type;
  return ensureGs1Context(out);
}

export function pickNameEn(name) {
  if (!name) return undefined;
  if (Array.isArray(name)) {
    const find = (tag) => name.find((n) => n['@language']?.toLowerCase() === tag)?.['@value'];
    return find('en-us') ?? find('en') ?? name[0]?.['@value'];
  }
  if (typeof name === 'string') return name;
  return undefined;
}

export function pickCountryCode(data) {
  return data?.address?.countryCode ?? data?.address?.addressCountry ?? data?.countryCode ?? undefined;
}

// Per your requirement: do NOT validate id format; select first non-empty field.
export function deriveCanonicalIdNoValidation(data, fallbacks) {
  for (const key of ['@id', ...fallbacks]) {
    if (data[key] != null) {
      const v = String(data[key]).trim();
      if (v) return v;
    }
  }
  const e = new Error(`Provide @id or one of: ${fallbacks.join(', ')}`);
  e.statusCode = 422;
  throw e;
}

export function isAbsoluteIri(v) {
  return typeof v === 'string' && /^[a-z][a-z0-9+.+-]*:/i.test(v);
}

export async function expandJsonLd(doc, baseIri) {
  return jsonld.expand(doc, {
    documentLoader: localLoader,
    base: isAbsoluteIri(baseIri) ? baseIri : undefined,
  });
}

export async function shaclValidateExpanded(expanded) {
  const report = await validateShacl(expanded);
  if (!report.ok) {
    const err = new Error('SHACL validation failed');
    err.statusCode = 422;
    err.details = report.results;
    throw err;
  }
}

export async function persistEntity({
  id,
  types,
  original,
  expanded,
  framed,
  countryCode,
  name_en,
  identifiers,
}) {
  const db = getDb();
  const collection = db.collection('entities');
  const now = new Date();

  await collection.updateOne(
    { _id: id },
    {
      $set: {
        _id: id,
        type: types.length === 1 ? types[0] : types,
        original,
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

  return {
    id,
    stored: true,
    version: now.toISOString(),
    representation: original, // default to original on POST responses
  };
}

export async function getById(id, { view = 'original' } = {}) {
  const db = getDb();
  const collection = db.collection('entities');
  const projection = { _id: 0 };
  if (['original', 'expanded', 'framed'].includes(view)) projection[view] = 1;
  else projection.original = 1;

  const hit = await collection.findOne({ _id: id }, { projection });
  if (!hit) return null;
  return hit[view] ?? hit.original ?? hit.framed ?? hit.expanded ?? null;
}



// --- pagination token helpers (base64url) ---
function enc(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function dec(tok) { try { return JSON.parse(Buffer.from(tok, 'base64url').toString('utf8')); } catch { return null; } }

// Search by @type with stable cursor on (createdAt, _id)
export async function searchByType({ type, limit = 30, next, view = 'original' }) {
  if (!type) {
    const e = new Error('Missing required query parameter: type');
    e.statusCode = 400;
    throw e;
  }

  // cap limit at 30, enforce >=1
  const cap = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 30);

  const db = getDb();
  const col = db.collection('entities');

  // field "type" may be string or array; $in works for both
  const baseFilter = { type: { $in: [type] } };

  // decode cursor
  let cursorFilter = {};
  if (next) {
    const t = dec(next);
    if (t?.createdAt && t?._id) {
      const ts = new Date(t.createdAt);
      cursorFilter = {
        $or: [
          { createdAt: { $gt: ts } },
          { createdAt: ts, _id: { $gt: t._id } },
        ],
      };
    }
  }

  const finalFilter = Object.keys(cursorFilter).length
    ? { $and: [baseFilter, cursorFilter] }
    : baseFilter;

  const sort = { createdAt: 1, _id: 1 };
  const projection = { _id: 1, type: 1, original: 1, framed: 1, expanded: 1, createdAt: 1 };

  // fetch one extra to know if there is a next page
  const docs = await col.find(finalFilter, { sort, projection, limit: cap + 1 }).toArray();

  const hasMore = docs.length > cap;
  const page = hasMore ? docs.slice(0, cap) : docs;

  const items = page.map((d) => {
    const rep = view === 'framed' ? (d.framed ?? d.original)
             : view === 'expanded' ? (d.expanded ?? d.original)
             : d.original;
    return rep;
  });

  const last = page[page.length - 1];
  const nextToken = hasMore
    ? enc({ createdAt: last.createdAt.toISOString(), _id: last._id })
    : null;

  return { items, next: nextToken };
}


export const AI_MAP = {
  '414': { type: 'gs1:Place',         identField: 'identifiers.gln'  }, // GLN (location)
  '417': { type: 'gs1:Organization',  identField: 'identifiers.gln'  }, // GLN (party)
  '01' : { type: 'gs1:Product',       identField: 'identifiers.gtin' }, // GTIN
  // add more as needed
};


/**
 * Find one entity by AI + id with strict type gating and
 * **verbatim** id matching (no normalization/variants).
 */
export async function findByAiAndIdExact(ai, id, { view = 'original' } = {}) {
  const spec = AI_MAP[ai];
  if (!spec) {
    const e = new Error(`Unsupported AI '${ai}'. Supported: ${Object.keys(AI_MAP).join(', ')}`);
    e.statusCode = 400;
    throw e;
  }

  const db = getDb();
  const col = db.collection('entities');

  // type can be a string or an array in stored docs → gate with $in
  const filter = {
    $and: [
      { type: { $in: [spec.type] } },
      {
        $or: [
          { _id: id },                   // exact match on canonical id
          { [spec.identField]: id },     // exact match on identifier field
        ],
      },
    ],
  };

  const projection = { _id: 0, original: 1, expanded: 1, framed: 1 };
  const hit = await col.findOne(filter, { projection });
  if (!hit) return null;

  return view === 'framed'   ? (hit.framed ?? hit.original)
       : view === 'expanded' ? (hit.expanded ?? hit.original)
       : hit.original;
}


// --- search across ALL types (same cursor scheme) ---
export async function searchAll({ limit = 30, next, view = 'original' }) {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 30);

  const db = getDb();
  const col = db.collection('entities');

  // decode cursor
  let cursorFilter = {};
  if (next) {
    const t = dec(next);
    if (t?.createdAt && t?._id) {
      const ts = new Date(t.createdAt);
      cursorFilter = {
        $or: [
          { createdAt: { $gt: ts } },
          { createdAt: ts, _id: { $gt: t._id } },
        ],
      };
    }
  }

  const finalFilter = cursorFilter && Object.keys(cursorFilter).length ? cursorFilter : {};

  const sort = { createdAt: 1, _id: 1 };
  const projection = { _id: 1, type: 1, original: 1, framed: 1, expanded: 1, createdAt: 1 };

  const docs = await col.find(finalFilter, { sort, projection, limit: cap + 1 }).toArray();

  const hasMore = docs.length > cap;
  const page = hasMore ? docs.slice(0, cap) : docs;

  const items = page.map((d) => {
    const rep = view === 'framed'   ? (d.framed ?? d.original)
             : view === 'expanded' ? (d.expanded ?? d.original)
             : d.original;
    return rep;
  });

  const last = page[page.length - 1];
  const nextToken = hasMore
    ? enc({ createdAt: last.createdAt.toISOString(), _id: last._id })
    : null;

  return { items, next: nextToken };
}

// --- wrapper used by the controller (typed OR untyped) ---
export async function searchByTypeOrAll({ type, limit = 30, next, view = 'original' }) {
  if (type) {
    return searchByType({ type, limit, next, view });
  }
  return searchAll({ limit, next, view });
}
