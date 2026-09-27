import app from "./app.js";

import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { seedInitialData } from "./db/seed.js";

const server = await (async () => {
  try {
    await pool.query("SELECT 1");
    await seedInitialData();
    const listener = app.listen(env.port, () => {
      console.log(`Backend running on http://localhost:${env.port}; database connected`);
    });
    return listener;
  } catch (error) {
    console.error("Database connection failed:", error);
    await pool.end();
    process.exit(1);
  }
})();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => void pool.end().finally(() => process.exit(0)));
  });
}
