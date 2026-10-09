const { ValidationError, UnauthorizedError } = require('../errors');

function requireTechnician(authService) {
  return (req, res, next) => {
    const technician = authService.findActiveTechnician(Number(req.header('x-technician-id')));
    if (!technician) return next(new ValidationError('Selecione o técnico responsável.'));
    req.tech = technician;
    next();
  };
}

function requireAdmin(authService) {
  return (req, res, next) => {
    const token = (req.header('authorization') || '').replace(/^Bearer\s+/, '');
    if (!authService.hasValidToken(token)) {
      return next(new UnauthorizedError());
    }
    next();
  };
}

module.exports = { requireTechnician, requireAdmin };
