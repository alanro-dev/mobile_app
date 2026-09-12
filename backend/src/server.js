require('dotenv').config();
const app = require('./app');

if (!process.env.JWT_SECRET) {
  console.error('✘ Missing JWT_SECRET in .env — copy .env.example to .env and set one.');
  process.exit(1);
}

const hasDbConfig =
  (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) ||
  process.env.DATABASE_URL;

if (!hasDbConfig) {
  console.error(
    '✘ Missing database config in .env — set PGHOST/PGUSER/PGPASSWORD/PGDATABASE (recommended) or DATABASE_URL.'
  );
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
