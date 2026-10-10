const { z } = require('zod');
const { paginationSchema } = require('../../shared/utils/query');

const list = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['open', 'in_progress', 'closed', 'cancelled']).optional(),
  priority: z.enum(['Normal', 'Alta', 'Urgente']).optional(),
  employee_id: z.coerce.number().int().positive().optional(),
  sortBy: z.enum(['opened_at', 'priority', 'status', 'ticket_number']).optional()
});
const body = z
  .object({
    ticket_number: z.string().trim().max(64).optional(),
    employee_id: z.coerce.number().int().positive(),
    asset_id: z.coerce.number().int().positive().optional().or(z.literal('')),
    type: z.string().trim().max(100).optional(),
    priority: z.enum(['Normal', 'Alta', 'Urgente']).optional(),
    description: z.string().trim().min(1).max(4000)
  })
  .strict();

const params = z.object({ id: z.coerce.number().int().positive() });
const close = z
  .object({
    technical_opinion: z.string().trim().min(3).max(4000)
  })
  .strict();

module.exports = { list, body, params, close };
