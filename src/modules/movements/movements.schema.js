const { z } = require('zod');

const params = z.object({ id: z.string() });
const move = z.object({
  to_status: z.string().trim().min(1, 'Informe o estado de destino.'),
  employee_id: z.union([z.string(), z.number()]).optional(),
  reason: z.string().optional(),
  technical_report: z.string().optional()
});

module.exports = { params, move };
