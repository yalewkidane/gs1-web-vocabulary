// src/routes/webvoc.routes.js
import express from 'express';
import { findByAiAndIdExact  } from '../services/webvoc/common.js';
import { pickHandlerByTypes, supportedTypes } from '../services/webvoc/registry.js';
import { compactContextForOutput } from '../utils/jsonldPresentation.js';

const router = express.Router();

// Small helper to normalize errors into a JSON-serializable shape
function toHttpError(err) {
  return {
    status: err?.statusCode || err?.status || 422,
    message: err?.message || 'Validation failed',
    details: err?.details
  };
}

async function handleOneItem(item, ctxMode) {
  const hit = pickHandlerByTypes(item?.['@type']);
  if (!hit) {
    const e = new Error(`Unsupported @type. Provide one of: ${supportedTypes().join(', ')}`);
    e.statusCode = 400;
    throw e;
  }
  const result = await hit.handler.upsert(item);
  const representation = (ctxMode === 'full')
    ? result.representation
    : compactContextForOutput(result.representation);

  return { id: result.id, representation };
}

// POST /gs1webvoc/masterdata  (single OR array)
router.post('/capture', async (req, res, next) => {
  try {
    const ctxMode = (req.query.ctx || 'inline').toString(); // inline|full
    const payload = req.body;

    // 1) Single object
    if (!Array.isArray(payload)) {
      const out = await handleOneItem(payload, ctxMode);
      return res
        .status(201)
        .location(`/gs1webvoc/capture/${encodeURIComponent(out.id)}`)
        .type('application/ld+json')
        .send(out.representation);
    }

    // 2) Array (batch)
    // Preserve order; continue processing all items and report per-item outcomes.
    const settled = await Promise.allSettled(
      payload.map((item) => handleOneItem(item, ctxMode))
    );

    const results = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? { ok: true, index: i, id: r.value.id, representation: r.value.representation }
        : { ok: false, index: i, error: toHttpError(r.reason) }
    );

    const allOk = results.every(r => r.ok);
    const someOk = results.some(r => r.ok);

    if (allOk) {
      // Return pure JSON-LD array when everything succeeded
      return res
        .status(201)
        .type('application/ld+json')
        .send(results.map(r => r.representation));
    }

    // Mixed or all failed → 207 Multi-Status with per-item results
    // (keeps successful items and errors in a single payload)
    return res.status(207).json({
      ok: someOk,
      results
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /gs1webvoc/:ai/:id?view=original|expanded|framed&ctx=inline|full
 * Example:
 *   /gs1webvoc/414/urn:gdst:example.org:location:loc:importer.124
 */
router.get('/:ai/:id(*)', async (req, res, next) => {
  try {
    const ai   = req.params.ai;
    // id is used VERBATIM (no transformation). decode only if it was URL-encoded.
    const id   = req.params.id.includes('%') ? decodeURIComponent(req.params.id) : req.params.id;
    const view = (req.query.view || 'original').toString();
    const ctx  = (req.query.ctx  || 'inline').toString();

    const doc = await findByAiAndIdExact(ai, id, { view });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const body = ctx === 'full' ? doc : compactContextForOutput(doc);
    res.type('application/ld+json').send(body);
  } catch (err) {
    next(err);
  }
});


// src/routes/webvoc.routes.js
router.get('/search', async (req, res, next) => {
  try {
    const type = req.query.type?.toString();
    const limit = req.query.limit?.toString();
    const view = (req.query.view || 'original').toString();
    const ctxMode = (req.query.ctx || 'inline').toString();
    const nextToken = req.query.next?.toString();

    const { items, next } = await searchByType({ type, limit, next: nextToken, view });

    const body = ctxMode === 'full'
      ? items
      : items.map((doc) => compactContextForOutput(doc));

    // If there is a next page, emit headers
    if (next) {
      // Simple token header (easy for clients to read)
      res.set('Next-Page-Token', next);

      // Standards-friendly Link header
      const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
      url.searchParams.set('next', next);
      // keep type/view/ctx/limit as-is; we just add/replace next

      res.set('Link', `<${url.toString()}>; rel="next"`);
    }

    // Body now contains only the items (no token)
    res.status(200).json({ items: body });
  } catch (err) {
    next(err);
  }
});

export default router;
