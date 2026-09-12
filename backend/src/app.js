const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');

const app = express();

app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:8100').split(','),
  })
);
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Not found.' });
});

// Centralized error handler — keeps error response shape consistent as
// { message } so the frontend's err.error?.message always works.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error.',
  });
});

module.exports = app;
