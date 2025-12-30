const jwt = require('jsonwebtoken');
const { User } = require('./models');

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    const v = rest.join('=');
    if (k) cookies[k] = decodeURIComponent(v || '');
  }
  return cookies;
}

async function authGuard(req, reply) {
  const cookieName = process.env.AUTH_COOKIE_NAME || 'lockchat_token';
  const cookies = parseCookies(req.headers.cookie);
  let token = cookies[cookieName];

  if (!token && req.headers.authorization) {
    const [scheme, value] = req.headers.authorization.split(' ');
    if (scheme && scheme.toLowerCase() === 'bearer') token = value;
  }

  if (!token) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.uid).lean();
    if (!user || user.status === 'disabled') {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    req.user = user;
    req.isAdmin = user.role === 'admin';
  } catch (err) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
}

module.exports = { authGuard };