const { z } = require('zod');

const file = z
  .object({
    path: z.string().min(1),
    originalname: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/\.(xlsx|xlsm)$/i),
    size: z
      .number()
      .int()
      .positive()
      .max(15 * 1024 * 1024)
  })
  .passthrough()
  .optional();

module.exports = { file };
