const { ForbiddenError, UnauthorizedError } = require('../errors');

function readCookie(req, name) {
  const entry = (req.header('cookie') || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}
function requireAuthentication(authService) {
  return (req, res, next) => {
    const token =
      readCookie(req, 'session') || (req.header('authorization') || '').replace(/^Bearer\s+/, '');
    const user = authService.authenticate(token);
    if (!user) return next(new UnauthorizedError());
    req.user = user;
    next();
  };
}

function requireCompletedOnboarding(req, res, next) {
  const requiresTotp = req.user.profile_base === 'ADMIN' && !req.user.totp_enabled;
  if (req.user.must_change_password || requiresTotp) {
    return next(
      new ForbiddenError(
        'Conclua a troca de senha e a configuraÃ§Ã£o do 2FA antes de acessar o sistema.'
      )
    );
  }
  return next();
}
function requirePermission(authService, permission) {
  return [
    requireAuthentication(authService),
    (req, res, next) => {
      try {
        authService.authorize(req.user, permission);
        next();
      } catch (error) {
        next(error);
      }
    }
  ];
}
function requireOnboarding(authService) {
  return [
    requireAuthentication(authService),
    (req, res, next) => {
      if (
        !req.user.must_change_password &&
        !(req.user.profile_base === 'ADMIN' && !req.user.totp_enabled)
      )
        return next(new ForbiddenError('Conclua a troca de senha e a configuração do 2FA.'));
      next();
    }
  ];
}
module.exports = {
  requireAuthentication,
  requireCompletedOnboarding,
  requirePermission,
  requireOnboarding
};
