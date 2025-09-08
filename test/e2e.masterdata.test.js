import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { MongoClient } from 'mongodb';
import app from '../src/index.js'; 
import placeSample from './fixtures/place.sample.json';

const request = supertest(app);

describe('E2E Tests for /masterdata', () => {
    let connection;
    let db;

    beforeAll(async () => {
        connection = await MongoClient.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        db = connection.db(process.env.MONGO_DB_NAME);
        await db.collection('entities').deleteMany({});
    });

    afterAll(async () => {
        await connection.close();
    });

    it('should reject invalid JSON-LD with a 400 error', async () => {
        const invalidPlace = { ...placeSample, globalLocationNumber: undefined };
        const response = await request
            .post('/masterdata')
            .set('Content-Type', 'application/ld+json')
            .send(invalidPlace);
        expect(response.status).toBe(400);
    });

    it('should accept a valid gs1:Place document', async () => {
        const response = await request
            .post('/masterdata')
            .set('Content-Type', 'application/ld+json')
            .send(placeSample);
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
    });

    it('should retrieve a stored gs1:Place document', async () => {
        const id = encodeURIComponent(placeSample['@id']);
        const response = await request
            .get(`/masterdata/${id}`)
            .set('Accept', 'application/ld+json');
        
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('application/ld+json');
        expect(response.body).toHaveProperty('@type', 'gs1:Place');
    });

    it('should return 404 for a non-existent document', async () => {
        const id = encodeURIComponent('urn:epc:id:gln:0000000.00000.0');
        const response = await request.get(`/masterdata/${id}`);
        expect(response.status).toBe(404);
    });
});
