const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });
const schema = z.object({
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT deve ser um inteiro entre 1 e 65535.')
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});
const result = schema.safeParse({
  PORT: process.env.PORT || '3000',
  NODE_ENV: process.env.NODE_ENV || 'development'
});
if (!result.success)
  throw new Error(`Configuração inválida: ${result.error.issues.map((x) => x.message).join('; ')}`);
module.exports = Object.freeze({ port: result.data.PORT, nodeEnv: result.data.NODE_ENV });
