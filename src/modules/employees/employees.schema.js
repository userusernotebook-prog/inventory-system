const { z } = require('zod');
const { paginationSchema } = require('../../shared/utils/query');

const text = (max) => z.string().trim().max(max).optional();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data no formato YYYY-MM-DD.')
  .optional()
  .nullable();

const params = z.object({ id: z.coerce.number().int().positive() });
const list = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['ativo', 'em_desligamento', 'desligado']).optional(),
  city: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  sortBy: z.enum(['name', 'email', 'department', 'city', 'status', 'created_at']).optional()
});
const fields = {
  code: text(64),
  name: text(160),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  city: text(120),
  department: text(120),
  cost_center: text(80),
  location: text(160),
  corporate_phone: text(40),
  personal_phone: text(40),
  hire_date: date,
  offboarded_at: date,
  status: z.enum(['ativo', 'em_desligamento', 'desligado']).optional()
};
const body = z.object(fields).strict();
const create = body.refine((value) => Boolean(value.name), {
  message: 'Nome é obrigatório.',
  path: ['name']
});

module.exports = { params, list, body, create };
