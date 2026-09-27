import express from "express";
import type { ErrorRequestHandler } from "express";
import cors from "cors";

import { env } from "./config/env.js";
import { pool } from "./config/db.js";

import authRoutes from "./routes/auth.routes.js";
import masterDataRoutes from "./routes/master-data.routes.js";
import usersRoutes from "./routes/users.routes.js";
import ticketsRoutes from "./routes/tickets.routes.js";

const app = express();

app.use(
  cors({
    origin: env.frontendUrl,
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

app.use(
  "/auth",
  authRoutes
);

app.use("/tickets", ticketsRoutes);

app.use(
  "/",
  masterDataRoutes
);

app.use(
  "/",
  usersRoutes
);

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
