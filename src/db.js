import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function bool(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

// Same connection contract as the main Phantasm backend: either a single
// DATABASE_URL, or the individual PG* vars. Point this at the SAME database
// the main site uses and the two apps will read/write the same tables.
const pgSsl = bool(process.env.PGSSL, false);

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: pgSsl ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "phantasm_pass",
      database: process.env.PGDATABASE || "phantasm",
      ssl: pgSsl ? { rejectUnauthorized: false } : false,
    };

// Vercel serverless functions can run many concurrent instances, each with
// its own connection pool, so keep `max` low per instance. Point
// DATABASE_URL at a pooled connection string (e.g. Neon, Supabase, or
// Vercel Postgres all provide one) rather than a direct Postgres connection.
export const pool = new Pool({
  ...poolConfig,
  max: Number(process.env.PG_POOL_MAX) || 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL client error:", err);
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
