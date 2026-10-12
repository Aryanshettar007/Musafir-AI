import dns from "dns";
import mongoose from "mongoose";
import { env } from "./env";

// Ensure Node's c-ares DNS resolver can resolve MongoDB Atlas SRV records
// when local router/ISP DNS returns IPv6 link-local or malformed responses (EBADRESP)
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  console.warn("[MongoDB] Could not override DNS servers:", e);
}

export const connectDB = async (): Promise<void> => {
  mongoose.connection.on("connected", () => {
    console.log(
      `[MongoDB] Connected successfully to host: ${mongoose.connection.host}, database: ${mongoose.connection.name}`
    );
  });

  mongoose.connection.on("error", (err) => {
    console.error("[MongoDB] Connection error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[MongoDB] Connection disconnected");
  });

  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds if MongoDB instance is unreachable
    });

    if (mongoose.connection.readyState !== 1) {
      throw new Error("MongoDB is not connected (readyState !== 1)");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[MongoDB] Failed to connect to MongoDB:", message);
    throw new Error(`MongoDB is not connected: ${message}`);
  }
};
