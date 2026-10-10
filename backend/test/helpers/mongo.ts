import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let server: MongoMemoryServer | undefined;

// Starts an in-memory MongoDB and connects mongoose to it. Call from beforeAll.
export async function startMongo(): Promise<void> {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
}

export async function stopMongo(): Promise<void> {
  await mongoose.disconnect();
  await server?.stop();
  server = undefined;
}

// Empties every collection but keeps the indexes. Call from beforeEach.
export async function clearCollections(): Promise<void> {
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
}
