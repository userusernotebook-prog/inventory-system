function createAuthController(service) {
  const cookie = (res, token) =>
    res.cookie('session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000
    });
  return {
    async login(req, res) {
      const result = await service.login(req.validated.body);
      cookie(res, result.token);
      res.json({
        must_change_password: result.mustChangePassword,
        requires_totp_enrollment: result.requiresTotpEnrollment,
        expires_at: result.expiresAt
      });
    },
    logout(req, res) {
      res.clearCookie('session');
      res.json(service.logout(req.user));
    },
    me(req, res) {
      res.json({
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        profile_base: req.user.profile_base,
        must_change_password: Boolean(req.user.must_change_password),
        totp_enabled: Boolean(req.user.totp_enabled),
        permissions: service.effectivePermissions(req.user),
        scopes: service.scopes(req.user)
      });
    },
    async changePassword(req, res) {
      res.json(await service.changePassword(req.user, req.validated.body.password));
    },
    setupTotp(req, res) {
      res.json(service.setupTotp(req.user));
    },
    async confirmTotp(req, res) {
      res.json(await service.confirmTotp(req.user, req.validated.body.code));
    },
    listUsers(req, res) {
      res.json(service.listUsers());
    },
    async createUser(req, res) {
      res.json(await service.createUser(req.validated.body, req.user));
    },
    updateUser(req, res) {
      res.json(service.updateUser(req.validated.params.id, req.validated.body, req.user));
    },
    async resetPassword(req, res) {
      res.json(
        await service.resetPassword(req.validated.params.id, req.validated.body.password, req.user)
      );
    },
    forceLogout(req, res) {
      res.json(service.forceLogout(req.validated.params.id, req.user));
    },
    setOverrides(req, res) {
      res.json(
        service.setOverrides(req.validated.params.id, req.validated.body.overrides, req.user)
      );
    },
    setScopes(req, res) {
      res.json(service.setScopes(req.validated.params.id, req.validated.body.scopes, req.user));
    },
    permissions(req, res) {
      res.json(service.effectivePermissions(service.findUser(req.validated.params.id)));
    }
  };
}
module.exports = { createAuthController };
