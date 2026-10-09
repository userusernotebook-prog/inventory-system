class DomainError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class NotFoundError extends DomainError {
  constructor(message = 'Registro não encontrado.', details) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

class ValidationError extends DomainError {
  constructor(message = 'Dados inválidos.', details) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class ConflictError extends DomainError {
  constructor(message = 'O registro já existe.', details) {
    super(message, 409, 'CONFLICT', details);
  }
}

class ForbiddenError extends DomainError {
  constructor(message = 'Acesso não permitido.', details) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

class UnauthorizedError extends DomainError {
  constructor(message = 'Autenticação necessária.', details) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

module.exports = {
  DomainError,
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError
};
