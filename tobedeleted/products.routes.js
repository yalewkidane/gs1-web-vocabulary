// src/routes/products.routes.js
import express from 'express';
import { upsertProduct, getProductById } from '../services/masterdata/product.js';

const router = express.Router();

// POST /products
router.post('/products', async (req, res, next) => {
  try {
    const result = await upsertProduct(req.body);
    res
      .status(201)
      .location(`/products/${encodeURIComponent(result.id)}`)
      .type('application/ld+json')
      .send(result.representation);
  } catch (err) {
    next(err);
  }
});

// GET /products/:id?view=original|expanded|framed (default: original)
router.get('/01/:id(*)', async (req, res, next) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const view = (req.query.view || 'original').toString();
    const doc = await getProductById(id, { view });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.type('application/ld+json').send(doc);
  } catch (err) {
    next(err);
  }
});

export default router;
