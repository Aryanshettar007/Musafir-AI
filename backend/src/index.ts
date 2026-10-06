import dotenv from "dotenv";
dotenv.config();

import express, { Application, Request, Response } from "express";
import cors from "cors";
import { connectDB } from "./config/db";

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get("/", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Musafir AI Backend API is running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "UP",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    app.listen(PORT, () => {
      console.log(`[Server] Server is running on port ${PORT}`);
      console.log(`[Server] API available at http://localhost:${PORT}`);
    });
  } catch (error: any) {
    console.error(`[Server Error] Server failed to start: ${error.message || error}`);
    process.exit(1);
  }
};

startServer();
