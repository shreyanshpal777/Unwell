import pg from "pg";
import "dotenv/config";
import { connectionConfig } from "./connection.js";

const { Pool } = pg;

export const pool = new Pool({
  ...connectionConfig,
  max: Number(process.env.PG_POOL_MAX || 10),
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000)
});

export async function testConnection() {
  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT current_database() AS database, NOW() AS time"
    );

    console.log("PostgreSQL connected:", result.rows[0]);
  } finally {
    client.release();
  }
}
