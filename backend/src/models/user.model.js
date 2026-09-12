const pool = require('../db/pool');

// Only ever select these columns when returning a user to the client —
// password_hash should never leave this file.
const PUBLIC_COLUMNS = 'id, email, name, created_at';

async function findByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  return rows[0] || null;
}

async function create(email, passwordHash) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email.toLowerCase(), passwordHash]
  );
  return rows[0];
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Needed internally (controller) to verify the current password before a
// sensitive change — includes password_hash, unlike findById.
async function findByIdWithPasswordHash(id) {
  const { rows } = await pool.query(
    'SELECT id, email, name, password_hash, created_at FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

// Partial update — only the fields passed in `fields` are changed.
// fields: { name?, email? }
async function updateProfile(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;

  if (fields.name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(fields.name);
  }
  if (fields.email !== undefined) {
    sets.push(`email = $${i++}`);
    values.push(fields.email.toLowerCase());
  }

  if (sets.length === 0) {
    return findById(id);
  }

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${PUBLIC_COLUMNS}`,
    values
  );
  return rows[0] || null;
}

async function updatePasswordHash(id, passwordHash) {
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
}

async function deleteById(id) {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}

module.exports = {
  findByEmail,
  create,
  findById,
  findByIdWithPasswordHash,
  updateProfile,
  updatePasswordHash,
  deleteById,
};
