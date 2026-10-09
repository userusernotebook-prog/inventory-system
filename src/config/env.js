const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

const schema = z.object({
  ADMIN_PASSWORD: z
    .string()
    .trim()
    .min(1, 'ADMIN_PASSWORD é obrigatório.')
    .refine((value) => value !== 'admin123', 'ADMIN_PASSWORD não pode ser admin123.'),
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT deve ser um número inteiro entre 1 e 65535.')
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535))
});

const result = schema.safeParse({
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  PORT: process.env.PORT || '3000'
});

if (!result.success) {
  const messages = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Configuração inválida: ${messages.join('; ')}`);
}

module.exports = Object.freeze({
  adminPassword: result.data.ADMIN_PASSWORD,
  port: result.data.PORT
});
