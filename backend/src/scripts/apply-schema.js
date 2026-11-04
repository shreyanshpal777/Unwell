import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { buildConnectionConfig } from "../config/connection.js";

const { Client } = pg;

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, "../../sql/schema.sql");
const fresh = process.argv.includes("--fresh");

const { connectionString } = buildConnectionConfig();

let target;
try {
  target = new URL(connectionString);
} catch {
  throw new Error(
    "DATABASE_URL is not a valid PostgreSQL URL. URL-encode any special characters in the password."
  );
}

const databaseName = decodeURIComponent(target.pathname.slice(1)) || "postgres";
const host = target.hostname.toLowerCase();
const isSupabase = host.endsWith(".supabase.co") || host.endsWith(".supabase.com");

if (isSupabase) {
  if (databaseName !== "postgres") {
    throw new Error(
      `Supabase projects use the "postgres" database. DATABASE_URL points to "${databaseName}". Update the path to /postgres.`
    );
  }

  console.log("Supabase detected: skipping database creation.");
} else {
  target.pathname = "/postgres";

  const admin = new Client(buildConnectionConfig(target.toString()));

  try {
    await admin.connect();

    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    if (!exists.rows[0]) {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      console.log(`Created database ${databaseName}`);
    } else {
      console.log(`Database ${databaseName} already exists`);
    }
  } finally {
    await admin.end();
  }
}

const database = new Client(buildConnectionConfig(connectionString));

try {
  await database.connect();

  if (fresh) {
    if (isSupabase) {
      await database.query(`
        DROP TABLE IF EXISTS
          trainer_clients,
          goals,
          wellness_logs,
          nutrition_logs,
          session_exercises,
          workout_sessions,
          food_items,
          exercises,
          users
        CASCADE;
      `);
      console.log("Dropped application tables (Supabase-safe reset)");
    } else {
      await database.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      console.log("Dropped existing schema");
    }
  }

  const schema = fs.readFileSync(schemaPath, "utf8");
  await database.query(schema);

  const { rows } = await database.query(
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
  );
  console.log(`Schema applied. Public tables: ${rows[0].count}`);
} finally {
  await database.end();
}
