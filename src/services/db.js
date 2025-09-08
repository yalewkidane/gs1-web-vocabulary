// src/services/db.js
import { MongoClient } from 'mongodb';

let client;
let db;

export async function connectToDatabase() {
  client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  db = client.db('masterdata');
  await setupIndexes();
}

export function getDb() {
  return db;
}

export async function closeDatabaseConnection() {
  if (client) await client.close();
}

async function setupIndexes() {
  const collection = db.collection('entities');
  await collection.createIndex({ type: 1, countryCode: 1 });
  await collection.createIndex({ name_en: 'text' });           // <— match stored field
  await collection.createIndex({ 'identifiers.gln': 1 }, { sparse: true });
  await collection.createIndex({ 'identifiers.gtin': 1 }, { sparse: true });
  // src/services/db.js -> setupIndexes()
await collection.createIndex({ createdAt: 1, _id: 1 }, { name: 'created_id' }).catch(() => {});

}
