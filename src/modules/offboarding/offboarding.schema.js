const { z } = require('zod');
const id = z.object({ id: z.coerce.number().int().positive() });
const start = z.object({ offboarding_date: z.string().date(), reason: z.string().trim().min(3) });
const receive = z.object({
  received_at: z.string().datetime().optional(),
  physical_condition: z.string().trim().min(2),
  accessories: z.string().trim().optional()
});
const destination = z.object({
  destination: z.enum(['BACKUP', 'EM_MANUTENCAO', 'DESATIVADO']),
  justification: z.string().trim().min(3),
  technical_report: z.string().trim().optional()
});
const conclude = z.object({
  ticket_actions: z
    .array(
      z.object({
        ticket_id: z.coerce.number().int().positive(),
        action: z.enum(['FECHAR', 'REATRIBUIR']),
        employee_id: z.coerce.number().int().positive().optional()
      })
    )
    .optional()
});
module.exports = { id, start, receive, destination, conclude };
