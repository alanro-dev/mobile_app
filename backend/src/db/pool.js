const { Pool } = require('pg');

// Two ways to configure the connection:
//
// 1. Discrete PGHOST/PGUSER/PGPASSWORD/etc. vars (recommended for Neon).
//    The password is passed as a plain string to the 'pg' driver directly —
//    no URL parsing involved, so special characters (@ # % / : etc.) in a
//    Neon-generated password just work with zero escaping.
// 2. A single DATABASE_URL connection string, for convenience — but note
//    that if your password contains special characters, it MUST be
//    percent-encoded (e.g. "@" -> "%40") or the URL parser can throw
//    "Invalid URL" or silently misparse the host/password.
//
// Discrete vars win if both are present.
const hasDiscreteConfig = !!(process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE);

if (!hasDiscreteConfig && !process.env.DATABASE_URL) {
  throw new Error(
    'No database config found. Copy .env.example to .env and fill in either ' +
      'PGHOST/PGUSER/PGPASSWORD/PGDATABASE (recommended) or DATABASE_URL.'
  );
}

// Neon requires SSL. rejectUnauthorized: false is fine here — Neon terminates
// TLS with a certificate chain that Node's default trust store doesn't always
// resolve cleanly through pooled endpoints, and the connection is still encrypted.
const sslModeIsRequire =
  process.env.PGSSLMODE === 'require' ||
  (process.env.DATABASE_URL || '').includes('sslmode=require');

let poolConfig;

if (hasDiscreteConfig) {
  poolConfig = {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD, // plain string, no URL-encoding needed
    database: process.env.PGDATABASE,
    ssl: sslModeIsRequire ? { rejectUnauthorized: false } : false,
  };
} else {
  // Fail with a clear message up front instead of letting pg-connection-string
  // throw a cryptic "Invalid URL" deep in its internals.
  try {
    // eslint-disable-next-line no-new
    new URL(process.env.DATABASE_URL);
  } catch (err) {
    throw new Error(
      'DATABASE_URL is not a valid URL. If your database password contains ' +
        'special characters (@ # % / : ? &), they must be percent-encoded ' +
        '(e.g. "@" becomes "%40"), or switch to the discrete PGHOST/PGUSER/' +
        'PGPASSWORD/PGDATABASE vars in .env instead, which avoid this ' +
        `entirely. Original error: ${err.message}`
    );
  }

  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: sslModeIsRequire ? { rejectUnauthorized: false } : false,
  };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  // Catches errors on idle clients so one bad connection doesn't crash the process.
  console.error('Unexpected error on idle PostgreSQL client', err);
});

module.exports = pool;
