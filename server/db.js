import pg from "pg";

const { Pool } = pg;

// ponytail: Neon's free Postgres (and most free-tier hosted Postgres)
// requires TLS but presents a cert chain `rejectUnauthorized` can't verify
// in a minimal Node runtime — this is the standard, documented way to
// connect to it, not a security downgrade specific to us.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Idempotent — safe to run on every boot. No migration framework needed for four tables. */
export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      target_language TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS host_sessions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      source_language TEXT NOT NULL DEFAULT '',
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at TIMESTAMPTZ
    );
  `);
}
