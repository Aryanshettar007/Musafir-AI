import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/musafir_ai";

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
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds if MongoDB instance is unreachable
    });

    if (mongoose.connection.readyState !== 1) {
      throw new Error("MongoDB is not connected (readyState !== 1)");
    }
  } catch (error: any) {
    console.error("[MongoDB] Failed to connect to MongoDB:", error.message || error);
    throw new Error(`MongoDB is not connected: ${error.message || error}`);
  }
};
