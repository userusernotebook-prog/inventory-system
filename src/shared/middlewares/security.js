const crypto = require('node:crypto');
const { ForbiddenError } = require('../errors');

function allowedOrigins() {
  const configured = (process.env.APP_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== 'production')
    configured.push(
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:4173',
      'http://127.0.0.1:5173'
    );
  return new Set(configured);
}

function requestSecurity(req, res, next) {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  const origin = req.get('origin');
  if (origin && !allowedOrigins().has(origin)) {
    return next(new ForbiddenError('Origem da requisição não permitida.'));
  }
  if (req.get('sec-fetch-site') === 'cross-site') {
    return next(new ForbiddenError('Requisição entre sites não permitida.'));
  }
  return next();
}

module.exports = { requestSecurity };
