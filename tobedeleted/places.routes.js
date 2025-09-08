// src/routes/places.routes.js
import express from 'express';
import { upsertPlace, getPlaceById } from '../services/masterdata/place.js';
import { compactContextForOutput } from '../utils/jsonldPresentation.js';


const router = express.Router();

// POST /places
router.post('/places', async (req, res, next) => {
  try {
    const result = await upsertPlace(req.body);
    // optional query: ?ctx=full to keep the URL
    const mode = (req.query.ctx || 'inline').toString();
    const body = mode === 'full' ? result.representation : compactContextForOutput(result.representation);

    res
      .status(201)
      .location(`/places/${encodeURIComponent(result.id)}`)
      .type('application/ld+json')
      .send(body);
  } catch (err) { next(err); }
});

// GET /places/:id?view=original|expanded|framed (default: original)
router.get('/414/:id(*)', async (req, res, next) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const view = (req.query.view || 'original').toString();
    const ctxMode = (req.query.ctx || 'inline').toString();

    const doc = await getPlaceById(id, { view });
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const body = ctxMode === 'full' ? doc : compactContextForOutput(doc);
    res.type('application/ld+json').send(body);
  } catch (err) { next(err); }
});

export default router;
