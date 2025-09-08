// src/controllers/webvoc.controller.js
import { compactContextForOutput } from '../utils/jsonldPresentation.js';
import { pickHandlerByTypes, supportedTypes } from '../services/webvoc/registry.js';
import { findByAiAndIdExact, searchByTypeOrAll } from '../services/webvoc/common.js';

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
  const representation = (ctxMode === 'full') ? result.representation
                                              : compactContextForOutput(result.representation);
  return { id: result.id, representation };
}

export async function captureHandler(req, res, next) {
  try {
    const ctxMode = (req.query.ctx || 'inline').toString();
    const payload = req.body;

    if (!Array.isArray(payload)) {
      const out = await handleOneItem(payload, ctxMode);
      return res
        .status(201)
        .location(`/gs1webvoc/${encodeURIComponent(out.id)}`)
        .type('application/ld+json')
        .send(out.representation);
    }

    const settled = await Promise.allSettled(payload.map(i => handleOneItem(i, ctxMode)));
    const results = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? { ok: true, index: i, id: r.value.id, representation: r.value.representation }
        : { ok: false, index: i, error: toHttpError(r.reason) }
    );

    const allOk = results.every(r => r.ok);
    const someOk = results.some(r => r.ok);

    if (allOk) {
      return res.status(201).type('application/ld+json')
        .send(results.map(r => r.representation));
    }
    return res.status(207).json({ ok: someOk, results });
  } catch (err) {
    next(err);
  }
}

export async function getByAiAndId(req, res, next) {
  try {
    const ai   = req.params.ai;
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
}

export async function searchHandler(req, res, next) {
  try {
    const type = req.query.type?.toString();             // optional
    const limit = req.query.limit?.toString();           // hard-capped inside service to 30
    const view = (req.query.view || 'original').toString();
    const ctxMode = (req.query.ctx || 'inline').toString();
    const nextToken = req.query.next?.toString();

    const { items, next } = await searchByTypeOrAll({ type, limit, next: nextToken, view });

    const body = ctxMode === 'full' ? items : items.map(compactContextForOutput);

    if (next) {
      res.set('Next-Page-Token', next);
      const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
      url.searchParams.set('next', next);
      res.set('Link', `<${url.toString()}>; rel="next"`);
    }
    res.status(200).json({ items: body });
  } catch (err) {
    next(err);
  }
}
