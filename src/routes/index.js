// src/routes/routs.js
import express from 'express';
import { captureHandler, searchHandler, getByAiAndId } from '../controllers/webvoc.controller.js';
import { MongoClient } from 'mongodb';

const router = express.Router();

// Mount the web vocabulary routes at /
// IMPORTANT: order matters—search must come before :ai catch-all
router.post('/capture', captureHandler);
router.get('/search',  searchHandler);
router.get('/:ai/:id(*)', getByAiAndId);


// System checks (under /gs1webvoc/healthz, /gs1webvoc/readyz when mounted)
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
