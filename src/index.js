// src/index.js
import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { connectToDatabase, closeDatabaseConnection } from './services/db.js';
import router from './routes/index.js';


import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import cors from 'cors';
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// A) Allow ANY origin (no credentials)
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'If-None-Match', 'If-Match'],
  exposedHeaders: ['Location', 'ETag', 'Link', 'Next-Page-Token'], // ← add these
}));


app.use(express.json({ type: ['application/json','application/ld+json'], limit: '10mb' }));


app.use('/gs1webvoc', authMiddleware, router);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use(errorHandler);

connectToDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Masterdata API up and running on port ${port}`);
    });
});

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    closeDatabaseConnection().then(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
    });
});
