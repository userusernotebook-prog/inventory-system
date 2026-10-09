const { z } = require('zod');

const login = z.object({ password: z.unknown().optional() }).passthrough();
const technician = z
  .object({ name: z.unknown().optional(), role: z.unknown().optional() })
  .passthrough();

module.exports = { login, technician };
