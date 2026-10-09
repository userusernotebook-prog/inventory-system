const { z } = require('zod');
const id = z.object({ id: z.coerce.number().int().positive() });
const start = z
  .object({ offboarding_date: z.string().date(), reason: z.string().trim().min(3).max(1000) })
  .strict();
const receive = z
  .object({
    received_at: z.string().datetime({ offset: true }).optional(),
    physical_condition: z.string().trim().min(2).max(500),
    accessories: z.string().trim().max(1000).optional()
  })
  .strict();
const destination = z
  .object({
    destination: z.enum(['BACKUP', 'EM_MANUTENCAO', 'DESATIVADO']),
    justification: z.string().trim().min(3).max(1000),
    technical_report: z.string().trim().max(5000).optional()
  })
  .strict();
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
