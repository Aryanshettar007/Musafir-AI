import mongoose, { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { Report } from "../src/models/report.model";
import { authHeader, fakeVerifyIdToken, memoryStorage } from "./helpers/fakes";
import { clearCollections, startMongo, stopMongo } from "./helpers/mongo";

const storage = memoryStorage();
const app = createApp({
  verifyIdToken: fakeVerifyIdToken,
  storage,
});

beforeAll(async () => {
  await startMongo();
  await Report.init();
});

afterAll(async () => {
  await stopMongo();
  await mongoose.disconnect();
});

beforeEach(clearCollections);

describe("Reports API (/reports)", () => {
  describe("POST /reports", () => {
    it("requires authentication", async () => {
      const res = await request(app)
        .post("/reports")
        .send({ reason: "inappropriate" });
      expect(res.status).toBe(401);
    });

    it("rejects an invalid payload missing a reason", async () => {
      const res = await request(app)
        .post("/reports")
        .set(authHeader("user123"))
        .send({
          itemTitle: "Sample AI story",
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects an unknown reason", async () => {
      const res = await request(app)
        .post("/reports")
        .set(authHeader("user123"))
        .send({
          reason: "not_a_valid_reason",
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("successfully creates a report for trip story content", async () => {
      const tripId = new Types.ObjectId();
      const itemId = new Types.ObjectId();

      const res = await request(app)
        .post("/reports")
        .set(authHeader("user123"))
        .send({
          tripId: String(tripId),
          itemId: String(itemId),
          itemTitle: "Ancient Temple Legend",
          contentType: "story",
          reason: "inaccurate",
          details: "The historical dates mentioned in this AI narration are factually incorrect.",
          transcriptSnippet: "Built in 1400 AD by the Cholas...",
          audioUrl: "https://musafir.storage/audio/story123.mp3",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("pending");
      expect(res.body.data.reason).toBe("inaccurate");
      expect(res.body.data.contentType).toBe("story");
      expect(res.body.data.id).toBeDefined();

      // Verify in DB
      const stored = await Report.findById(res.body.data.id);
      expect(stored).not.toBeNull();
      expect(stored?.userId).toBe("user123");
      expect(String(stored?.tripId)).toBe(String(tripId));
      expect(String(stored?.itemId)).toBe(String(itemId));
      expect(stored?.itemTitle).toBe("Ancient Temple Legend");
      expect(stored?.details).toContain("factually incorrect");
      expect(stored?.audioUrl).toBe("https://musafir.storage/audio/story123.mp3");
      expect(stored?.status).toBe("pending");
    });

    it("successfully creates a report for Live Voice Q&A", async () => {
      const res = await request(app)
        .post("/reports")
        .set(authHeader("user456"))
        .send({
          itemTitle: "Q: Tell me about this area",
          contentType: "live_qa",
          reason: "offensive",
          details: "AI generated inappropriate commentary",
          transcriptSnippet: "This place is ...",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.contentType).toBe("live_qa");
      expect(res.body.data.reason).toBe("offensive");
    });
  });

  describe("GET /reports/my", () => {
    it("returns reports submitted by the authenticated user", async () => {
      await Report.create({
        userId: "user123",
        reason: "inappropriate",
        contentType: "story",
        details: "Report 1",
      });
      await Report.create({
        userId: "other_user",
        reason: "harmful",
        contentType: "story",
        details: "Other user report",
      });

      const res = await request(app)
        .get("/reports/my")
        .set(authHeader("user123"));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].details).toBe("Report 1");
    });
  });
});
