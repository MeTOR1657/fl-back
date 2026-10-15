import express from "express";
import type { ErrorRequestHandler } from "express";
import cors from "cors";

import { env } from "./config/env.js";
import { pool } from "./config/db.js";

import authRoutes from "./routes/auth.routes.js";
import masterDataRoutes from "./routes/master-data.routes.js";
import usersRoutes from "./routes/users.routes.js";
import ticketsRoutes from "./routes/tickets.routes.js";
import { cmuOAuthExchange } from "./controllers/auth.controller.js";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin === env.frontendUrl ||
        /^http:\/\/localhost(:\d+)?$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
        origin.includes("cpecmu.com")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

app.use(express.json({ limit: "10mb" }));

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, database: "connected" });
  } catch {
    res.status(503).json({ success: false, database: "unavailable" });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, database: "connected" });
  } catch {
    res.status(503).json({ success: false, database: "unavailable" });
  }
});

app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes);

app.post("/cmu-oauth/callback", cmuOAuthExchange);
app.post("/api/cmu-oauth/callback", cmuOAuthExchange);

app.use("/tickets", ticketsRoutes);
app.use("/api/tickets", ticketsRoutes);

app.use("/", masterDataRoutes);
app.use("/api", masterDataRoutes);

app.use("/", usersRoutes);
app.use("/api", usersRoutes);

app.use(
  "/uploads",
  express.static(env.uploadDir)
);

const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error("Request failed:", error);
  res.status(500).json({ message: "Internal server error" });
};
app.use(jsonErrorHandler);

export default app;
