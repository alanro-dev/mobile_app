const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');

const SALT_ROUNDS = 10;

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Shape returned to the frontend must match AuthResponse in auth.service.ts:
// { token: string, user: { id, email, name, ... } }
function toAuthResponse(user) {
  return {
    token: signToken(user),
    user: { id: user.id, email: user.email, name: user.name ?? null },
  };
}

async function register(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email) || !password || password.length < 8) {
      return res.status(400).json({
        message: 'Enter a valid email and a password of at least 8 characters.',
      });
    }

    const existing = await userModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await userModel.create(email, passwordHash);

    return res.status(201).json(toAuthResponse(user));
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email) || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    return res.status(200).json(toAuthResponse(user));
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    // req.userId is set by the authMiddleware after verifying the JWT.
    const user = await userModel.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.status(200).json({ user });
  } catch (err) {
    return next(err);
  }
}

// PUT /api/auth/me
// Body: { name?, email?, currentPassword?, newPassword? }
// - name can be changed freely.
// - changing email or password requires currentPassword, to stop someone
//   with a stolen/left-open session from silently taking over the account.
// Returns a fresh token since the token payload embeds the email.
async function updateMe(req, res, next) {
  try {
    const { name, email, currentPassword, newPassword } = req.body;

    const wantsEmailChange = email !== undefined;
    const wantsPasswordChange = newPassword !== undefined;

    if (wantsEmailChange && !isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    if (wantsPasswordChange && newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    if (wantsEmailChange || wantsPasswordChange) {
      if (!currentPassword) {
        return res.status(400).json({
          message: 'Enter your current password to change your email or password.',
        });
      }

      const user = await userModel.findByIdWithPasswordHash(req.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);
      if (!passwordMatches) {
        return res.status(401).json({ message: 'Current password is incorrect.' });
      }

      if (wantsEmailChange && email.toLowerCase() !== user.email) {
        const existing = await userModel.findByEmail(email);
        if (existing) {
          return res.status(409).json({ message: 'An account with that email already exists.' });
        }
      }

      if (wantsPasswordChange) {
        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await userModel.updatePasswordHash(req.userId, passwordHash);
      }
    }

    const fieldsToUpdate = {};
    if (name !== undefined) fieldsToUpdate.name = name;
    if (wantsEmailChange) fieldsToUpdate.email = email;

    const updatedUser = await userModel.updateProfile(req.userId, fieldsToUpdate);
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json(toAuthResponse(updatedUser));
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/auth/me
// Body: { currentPassword }
// Requires the current password as a confirmation step before permanently
// deleting the account.
async function deleteMe(req, res, next) {
  try {
    const { currentPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ message: 'Enter your current password to delete your account.' });
    }

    const user = await userModel.findByIdWithPasswordHash(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    await userModel.deleteById(req.userId);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, me, updateMe, deleteMe };
