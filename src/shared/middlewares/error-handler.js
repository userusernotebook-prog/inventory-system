const { ZodError } = require('zod');
const multer = require('multer');
const { DomainError } = require('../errors');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof DomainError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof ZodError) {
    return res.status(400).json({ error: error.issues[0]?.message || 'Dados inválidos.' });
  }
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: 'Arquivo inválido ou maior que o limite permitido.' });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Requisição maior que o limite permitido.' });
  }
  if (typeof error.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) {
    return res.status(400).json({ error: 'Não foi possível concluir a operação.' });
  }

  console.error('Erro interno na API:', error);
  return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
}

module.exports = { errorHandler };
