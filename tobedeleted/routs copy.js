// src/routes/index.js
import express from 'express';
import placesRouter from './places.routes.js';
import productsRouter from './products.routes.js';
import organizationsRouter from  './organizations.routes.js';
import { MongoClient } from 'mongodb';

const router = express.Router();

router.use('/', placesRouter);
router.use('/', productsRouter);
router.use('/', organizationsRouter);

// System checks
router.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

router.get('/readyz', async (_req, res) => {
  try {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    await client.close();
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

export default router;
