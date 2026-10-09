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
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ORIGIN: z.string().url().optional(),
  EMPLOYEE_ANONYMIZATION_DAYS: z.coerce.number().int().min(30).max(36500).default(1825)
});
const result = schema.safeParse({
  PORT: process.env.PORT || '3000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_ORIGIN: process.env.APP_ORIGIN,
  EMPLOYEE_ANONYMIZATION_DAYS: process.env.EMPLOYEE_ANONYMIZATION_DAYS
});
if (!result.success)
  throw new Error(`Configuração inválida: ${result.error.issues.map((x) => x.message).join('; ')}`);
module.exports = Object.freeze({
  port: result.data.PORT,
  nodeEnv: result.data.NODE_ENV,
  appOrigin: result.data.APP_ORIGIN,
  employeeAnonymizationDays: result.data.EMPLOYEE_ANONYMIZATION_DAYS
});
