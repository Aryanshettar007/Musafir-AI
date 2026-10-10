import { env } from "./config/env";
import { connectDB } from "./config/db";
import { createStorage } from "./config/storage";
import { createApp } from "./app";
import { firebaseTokenVerifier } from "./clients/firebase";

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    const app = createApp({
      verifyIdToken: firebaseTokenVerifier(env.FIREBASE_PROJECT_ID),
      storage: createStorage(env),
      corsOrigins: env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
    });

    app.listen(env.PORT, () => {
      console.log(`[Server] Server is running on port ${env.PORT}`);
      console.log(`[Server] API available at http://localhost:${env.PORT}`);
    });
  } catch (error: unknown) {
    console.error(`[Server Error] Server failed to start: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};

startServer();
