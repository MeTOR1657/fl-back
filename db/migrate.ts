import postgres from "postgres";
import { connectionString } from "./utils.js";

const sql = postgres(connectionString);

async function run() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "account" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "username" varchar(255) NOT NULL UNIQUE,
        "password" varchar(255) NOT NULL,
        "email" varchar(255),
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp (3)
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS "todo" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "todo_text" varchar(255) NOT NULL,
        "deadline" timestamp,
        "is_done" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp (3)
      );
    `;
    await sql`
      ALTER TABLE "todo" ADD COLUMN IF NOT EXISTS "deadline" timestamp;
    `;
    console.log("Database schema verified and created successfully!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await sql.end();
  }
}

run();
