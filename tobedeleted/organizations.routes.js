// src/routes/places.routes.js
import express from 'express';
import { upsertPlace, getPlaceById } from '../services/masterdata/organization.js';
import { compactContextForOutput } from '../utils/jsonldPresentation.js';


const router = express.Router();

// POST /organizations
router.post('/organizations', async (req, res, next) => {
  try {
    const result = await upsertPlace(req.body);
    // optional query: ?ctx=full to keep the URL
    const mode = (req.query.ctx || 'inline').toString();
    const body = mode === 'full' ? result.representation : compactContextForOutput(result.representation);

    res
      .status(201)
      .location(`/organizations/${encodeURIComponent(result.id)}`)
      .type('application/ld+json')
      .send(body);
  } catch (err) { next(err); }
});

// GET /places/:id?view=original|expanded|framed (default: original)
router.get('/417/:id(*)', async (req, res, next) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const view = (req.query.view || 'original').toString();
    const ctxMode = (req.query.ctx || 'inline').toString();

    const doc = await getPlaceById(id, { view });
    if (!doc) return res.status(404).json({ error: 'Oliot Web Vocabulary Not found - 417' });

    const body = ctxMode === 'full' ? doc : compactContextForOutput(doc);
    res.type('application/ld+json').send(body);
  } catch (err) { next(err); }
});

export default router;
