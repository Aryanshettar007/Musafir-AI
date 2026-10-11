import os from "os";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { createStorage } from "./config/storage";
import { createApp } from "./app";
import { firebaseTokenVerifier } from "./clients/firebase";

const getLocalIpAddress = (): string | undefined => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return undefined;
};

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    const app = createApp({
      verifyIdToken: firebaseTokenVerifier(env.FIREBASE_PROJECT_ID),
      storage: createStorage(env),
      corsOrigins: env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
    });

    app.listen(env.PORT, "0.0.0.0", () => {
      const localIp = getLocalIpAddress();
      console.log(`[Server] Server is running on port ${env.PORT}`);
      console.log(`[Server] Local API:   http://localhost:${env.PORT}`);
      if (localIp) {
        console.log(`[Server] Network API: http://${localIp}:${env.PORT}`);
      }
    });
  } catch (error: unknown) {
    console.error(`[Server Error] Server failed to start: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};

startServer();
