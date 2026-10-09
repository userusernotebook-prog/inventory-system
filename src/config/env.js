const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');
const { z } = require('zod');
function secretFromFile(file) {
  return file ? fs.readFileSync(file, 'utf8').trim() : undefined;
}
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });
const schema = z
  .object({
    PORT: z
      .string()
      .regex(/^\d+$/, 'PORT deve ser um inteiro entre 1 e 65535.')
      .transform(Number)
      .pipe(z.number().int().min(1).max(65535)),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ORIGIN: z.string().url().optional(),
    TOTP_ENCRYPTION_KEY: z.string().min(1, 'TOTP_ENCRYPTION_KEY e obrigatoria.'),
    EMPLOYEE_ANONYMIZATION_DAYS: z.coerce.number().int().min(30).max(36500).default(1825)
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && !value.APP_ORIGIN) {
      context.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'APP_ORIGIN e obrigatoria em producao.'
      });
    }
  });
const result = schema.safeParse({
  PORT: process.env.PORT || '3000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_ORIGIN: process.env.APP_ORIGIN,
  TOTP_ENCRYPTION_KEY:
    process.env.TOTP_ENCRYPTION_KEY || secretFromFile(process.env.TOTP_ENCRYPTION_KEY_FILE) || '',
  EMPLOYEE_ANONYMIZATION_DAYS: process.env.EMPLOYEE_ANONYMIZATION_DAYS
});
if (!result.success)
  throw new Error(`Configuração inválida: ${result.error.issues.map((x) => x.message).join('; ')}`);
module.exports = Object.freeze({
  port: result.data.PORT,
  nodeEnv: result.data.NODE_ENV,
  appOrigin: result.data.APP_ORIGIN,
  totpEncryptionKey: result.data.TOTP_ENCRYPTION_KEY,
  employeeAnonymizationDays: result.data.EMPLOYEE_ANONYMIZATION_DAYS
});
