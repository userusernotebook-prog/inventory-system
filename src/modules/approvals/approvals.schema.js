const { z } = require('zod');
const requestType = z.enum(['TROCA_EQUIPAMENTO', 'USO_EQUIPAMENTO_BACKUP', 'DESATIVACAO_ATIVO']);
const create = z.object({
  type: requestType,
  employee_id: z.coerce.number().int().positive().optional(),
  asset_id: z.coerce.number().int().positive().optional(),
  old_asset_id: z.coerce.number().int().positive().optional(),
  new_asset_id: z.coerce.number().int().positive().optional(),
  justification: z.string().trim().min(3),
  technical_report: z.string().trim().optional(),
  expires_in_hours: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .optional(),
  attachments: z
    .array(z.object({ name: z.string().trim().min(1), url: z.string().url() }))
    .max(10)
    .optional()
});
const params = z.object({ id: z.coerce.number().int().positive() });
const list = z.object({
  status: z.enum(['PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA', 'EXPIRADA']).optional(),
  type: requestType.optional(),
  requester_user_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
const reject = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();
module.exports = { create, params, list, reject };
