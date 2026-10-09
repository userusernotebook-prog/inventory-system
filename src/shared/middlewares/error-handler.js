const { ZodError } = require('zod');
const multer = require('multer');
const { DomainError } = require('../errors');

function sendError(res, status, code, message, details = null) {
  return res.status(status).json({ error: { code, message, details } });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof DomainError) {
    return sendError(res, error.status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Dados inválidos.',
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    );
  }
  if (error instanceof multer.MulterError) {
    return sendError(res, 400, 'INVALID_FILE', 'Arquivo inválido ou maior que o limite permitido.');
  }
  if (error.type === 'entity.parse.failed')
    return sendError(res, 400, 'INVALID_JSON', 'JSON inválido.');
  if (error.type === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Requisição maior que o limite permitido.');
  }
  if (typeof error.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) {
    return sendError(res, 409, 'CONFLICT', 'Não foi possível concluir a operação.');
  }
  console.error('Erro interno na API:', error);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Erro interno. Tente novamente mais tarde.');
}

module.exports = { errorHandler };
