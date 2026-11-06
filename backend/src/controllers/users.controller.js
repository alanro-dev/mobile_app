const pool = require('../db/pool');
const enkaService = require('../services/enka.service');
const resolveProfileService = require('../services/resolveProfile.service');

const UID_REGEX = /^\d{6,10}$/;

// GET /api/users/uid
// Returns the currently saved ZZZ UID for the authenticated user, if any.
// The frontend calls this on load to decide whether to show the UID entry
// screen or go straight to /hub (falling back to this if localStorage is empty).
async function getUid(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT zzz_uid FROM users WHERE id = $1', [req.userId]);
    return res.status(200).json({ uid: rows[0]?.zzz_uid ?? null });
  } catch (err) {
    return next(err);
  }
}

// POST /api/users/uid
// Body: { uid: string }
// Validates the UID against enka.network, takes an initial profile snapshot
// so /hub has data immediately, and then saves the UID to the user's row.
async function setUid(req, res, next) {
  try {
    const uid = typeof req.body.uid === 'string' ? req.body.uid.trim() : '';

    if (!UID_REGEX.test(uid)) {
      return res.status(400).json({ message: 'UID must be a 6-10 digit number.' });
    }

    // Fail fast (before any network/DB work) if another account already uses this UID.
    const taken = await pool.query('SELECT 1 FROM users WHERE zzz_uid = $1 AND id <> $2 LIMIT 1', [
      uid,
      req.userId,
    ]);
    if (taken.rows.length > 0) {
      return res.status(409).json({ message: 'This UID is already linked to another account.' });
    }

    const raw = await enkaService.fetchRawProfile(uid);

    // Snapshot FIRST, then save the UID: if the snapshot fails the account is
    // left untouched, instead of holding a UID that has no data behind it.
    // (A rare race with another account claiming the UID is caught by the
    // unique constraint and turned into the same 409 by the error handler.)
    const snapshotId = await resolveProfileService.storeProfileSnapshot(req.userId, raw);
    await pool.query('UPDATE users SET zzz_uid = $1 WHERE id = $2', [uid, req.userId]);

    return res.status(201).json({ uid, snapshotId });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getUid, setUid };
