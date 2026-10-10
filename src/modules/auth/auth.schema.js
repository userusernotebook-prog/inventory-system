const { z } = require('zod');
const { paginationSchema } = require('../../shared/utils/query');
const login = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp_code: z.string().optional()
});
const password = z.object({
  password: z.string().min(12, 'A senha deve ter ao menos 12 caracteres.'),
  reason: z.string().trim().min(3).max(500).optional()
});
const profileBase = z.enum(['ADMIN', 'TECNICO', 'RH', 'FINANCEIRO', 'CONSULTA']);
const user = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(12),
    profile_base: profileBase
  })
  .strict()
  .transform(({ profile_base: profileBaseValue, ...input }) => ({
    ...input,
    profileBase: profileBaseValue
  }));
const userUpdate = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    profile_base: profileBase,
    active: z.boolean(),
    reason: z.string().trim().min(3).max(500).optional()
  })
  .strict()
  .transform(({ profile_base: profileBaseValue, ...input }) => ({
    ...input,
    profileBase: profileBaseValue
  }));
const id = z.object({ id: z.coerce.number().int().positive() });
const userList = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  profile_base: z.enum(['ADMIN', 'TECNICO', 'RH', 'FINANCEIRO', 'CONSULTA']).optional(),
  active: z.coerce.boolean().optional(),
  sortBy: z.enum(['name', 'email', 'profile_base', 'last_login_at']).optional()
});
const totp = z.object({ code: z.string().min(6) });
const overrides = z.object({
  overrides: z.array(
    z.object({
      permission: z.string().regex(/^[a-z*]+:[a-z*]+$/),
      effect: z.enum(['allow', 'deny'])
    })
  ),
  reason: z.string().trim().min(3).max(500).optional()
});
const scopes = z.object({
  scopes: z.array(
    z.object({ type: z.enum(['city', 'department', 'equipment_type']), value: z.string().min(1) })
  ),
  reason: z.string().trim().min(3).max(500).optional()
});
const reason = z.object({ reason: z.string().trim().min(3).max(500) });
module.exports = { login, password, user, userUpdate, id, userList, totp, overrides, scopes, reason };
