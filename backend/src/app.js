const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const profileRoutes = require('./routes/profile.routes');

const app = express();

app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:8100').split(','),
  })
);
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/profile', profileRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Not found.' });
});

// Centralized error handler — keeps error response shape consistent as
// { message } so the frontend's err.error?.message always works.
//
// Errors we raise on purpose carry an explicit `status` and a message that is
// safe to show. Anything else (database errors, bugs) is logged server-side
// and answered with a generic message so internals never leak to the client.
app.use((err, req, res, next) => {
  // Postgres unique violation (e.g. two sign-ups racing on one email).
  if (err && err.code === '23505') {
    const constraint = String(err.constraint || '');
    const message = constraint.includes('zzz_uid')
      ? 'This UID is already linked to another account.'
      : constraint.includes('email')
        ? 'An account with this email already exists.'
        : 'That value is already in use.';
    return res.status(409).json({ message });
  }

  const intentional = Number.isInteger(err && err.status);
  if (!intentional || err.status >= 500) {
    console.error(err);
  }

  res.status(intentional ? err.status : 500).json({
    message: intentional ? err.message : 'Internal server error.',
  });
});

module.exports = app;
