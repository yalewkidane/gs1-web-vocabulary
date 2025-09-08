// src/services/webvoc/registry.js
import { upsertPlace, getPlaceById } from './place.js';
import { upsertProduct, getProductById } from './product.js';
import { upsertOrganization, getOrganizationById } from './organization.js';
// add more as you implement them:
// add more as you implement them:
// import { upsertOrganization, getOrganizationById } from './organization.js';

export const HANDLERS = {
  'gs1:Place':    { upsert: upsertPlace,    getById: getPlaceById },
  'gs1:Product':  { upsert: upsertProduct,  getById: getProductById },
  'gs1:Organization': { upsert: upsertOrganization, getById: getOrganizationById },
};

export function pickHandlerByTypes(typeValue) {
  const types = Array.isArray(typeValue) ? typeValue : [typeValue].filter(Boolean);
  for (const t of types) if (HANDLERS[t]) return { type: t, handler: HANDLERS[t] };
  return null;
}

export function supportedTypes() {
  return Object.keys(HANDLERS);
}
