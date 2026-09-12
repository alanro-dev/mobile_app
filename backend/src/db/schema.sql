-- Run this once against your Neon database to create/update the schema.
-- Either: psql "$DATABASE_URL" -f src/db/schema.sql
-- Or:     npm run db:migrate

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gives us gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safe to re-run: adds the column only if it isn't already there
-- (covers people who ran migrate.js before 'name' existed).
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
