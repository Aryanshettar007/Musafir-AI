import os from "os";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { createStorage } from "./config/storage";
import { createApp } from "./app";
import { firebaseTokenVerifier } from "./clients/firebase";
import { geminiClient } from "./clients/gemini";
import { gnaniClient } from "./clients/gnani";
import { createGnaniQueue } from "./clients/gnaniQueue";
import { mapsClient } from "./clients/maps";
import { wikipediaClient } from "./clients/wikipedia";
import { askRouter } from "./routes/ask.routes";
import { tripRouters } from "./routes/trips.routes";
import { createAskService } from "./services/ask/ask.service";
import { createSponsorAds } from "./services/sponsor/sponsorAds";
import { createSponsorProvider } from "./services/sponsor/sponsorProvider";
import { createTripBuilder } from "./services/trip";

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

    const storage = createStorage(env);
    const maps = mapsClient({ apiKey: env.GOOGLE_MAPS_API_KEY });
    const gemini = geminiClient({
      apiKey: env.GEMINI_API_KEY,
      liteRpm: env.GEMINI_LITE_RPM,
      flashRpm: env.GEMINI_FLASH_RPM,
      concurrency: env.GEMINI_CONCURRENCY,
      flashLanguages: env.GEMINI_FLASH_LANGUAGES,
    });
    // Gnani allows one in-flight request per key: this is the only queue in the process, shared by every feature.
    const gnani = createGnaniQueue(gnaniClient({ apiKey: env.GNANI_API_KEY }));

    const sponsor = createSponsorProvider({ ads: createSponsorAds({ gemini, gnani, storage }) });
    const builder = createTripBuilder({
      maps,
      wikipedia: wikipediaClient({ userAgent: env.WIKIPEDIA_USER_AGENT }),
      gemini,
      gnani,
      storage,
      sponsor,
    });
    const ask = createAskService({ gemini, gnani, maps });

    const app = createApp({
      verifyIdToken: firebaseTokenVerifier(env.FIREBASE_PROJECT_ID),
      storage,
      corsOrigins: env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
      routers: [
        ...tripRouters({
          maps,
          builder,
          storage,
          limits: { tripsPerDay: env.TRIPS_PER_DAY, maxRouteKm: env.MAX_ROUTE_KM },
        }),
        { path: "/ask", router: askRouter({ ask }) },
      ],
    });

    app.listen(env.PORT, "0.0.0.0", () => {
      const localIp = getLocalIpAddress();
      console.log(`[Server] Server is running on port ${env.PORT}`);
      console.log(`[Server] Local API:   http://localhost:${env.PORT}`);
      if (localIp) {
        console.log(`[Server] Network API: http://${localIp}:${env.PORT}`);
      }
    });

    // Trips still marked "building" (server restarted mid-build) carry on in the background.
    builder
      .resumeAll()
      .then((n) => n > 0 && console.log(`[Server] Resuming ${n} trip build(s)`))
      .catch((err: unknown) => console.error(`[Server] Could not resume trip builds: ${err instanceof Error ? err.message : err}`));
  } catch (error: unknown) {
    console.error(`[Server Error] Server failed to start: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};

startServer();
