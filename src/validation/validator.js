// src/validation/validator.js
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// Ajv 2020 supports draft 2020-12: makes 'unevaluatedProperties' work, etc.
const ajv = new Ajv({
  allErrors: true,
  strict: true,          // catch schema mistakes
  allowUnionTypes: true, // nicer anyOf/oneOf unions
  unevaluated: true      // enable unevaluatedProperties keyword
});
addFormats(ajv);

// Compile-cache validators so we don't recompile on every request
const cache = new WeakMap();

/** Validate data against a JSON Schema (2020-12). Throws 422 with details on failure. */
export function validate(schema, data) {
  let validateFn = cache.get(schema);
  if (!validateFn) {
    validateFn = ajv.compile(schema);
    cache.set(schema, validateFn);
  }
  const ok = validateFn(data);
  if (!ok) {
    const error = new Error('Validation failed');
    error.statusCode = 422;
    error.details = validateFn.errors; // Ajv v8 error objects
    throw error;
  }
}
