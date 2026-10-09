const { z } = require('zod');
const login = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp_code: z.string().optional()
});
const password = z.object({
  password: z.string().min(12, 'A senha deve ter ao menos 12 caracteres.')
});
const user = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(12),
  profile_base: z.enum(['ADMIN', 'TECNICO', 'RH', 'FINANCEIRO', 'CONSULTA'])
});
const userUpdate = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  profile_base: z.enum(['ADMIN', 'TECNICO', 'RH', 'FINANCEIRO', 'CONSULTA']),
  active: z.boolean()
});
const id = z.object({ id: z.string() });
const totp = z.object({ code: z.string().min(6) });
const overrides = z.object({
  overrides: z.array(
    z.object({
      permission: z.string().regex(/^[a-z*]+:[a-z*]+$/),
      effect: z.enum(['allow', 'deny'])
    })
  )
});
const scopes = z.object({
  scopes: z.array(
    z.object({ type: z.enum(['city', 'department', 'equipment_type']), value: z.string().min(1) })
  )
});
module.exports = { login, password, user, userUpdate, id, totp, overrides, scopes };
