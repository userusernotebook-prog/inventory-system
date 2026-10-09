class DomainError extends Error {
  constructor(message, status) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

class NotFoundError extends DomainError {
  constructor(message = 'Registro não encontrado.') {
    super(message, 404);
  }
}

class ValidationError extends DomainError {
  constructor(message = 'Dados inválidos.') {
    super(message, 400);
  }
}

class ConflictError extends DomainError {
  constructor(message = 'O registro já existe.') {
    super(message, 409);
  }
}

class ForbiddenError extends DomainError {
  constructor(message = 'Acesso não permitido.') {
    super(message, 403);
  }
}

class UnauthorizedError extends DomainError {
  constructor(message = 'Acesso de administrador necessário.') {
    super(message, 401);
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
