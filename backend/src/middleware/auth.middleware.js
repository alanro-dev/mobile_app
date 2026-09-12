const jwt = require('jsonwebtoken');

// Protects a route by requiring a valid 'Authorization: Bearer <token>'
// header — this is the token the Angular AuthInterceptor attaches automatically.
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Missing or malformed Authorization header.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

module.exports = authMiddleware;
