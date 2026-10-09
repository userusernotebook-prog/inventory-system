const { z } = require('zod');
const { ASSET_STATES } = require('../assets/domain/asset-state-machine');

const params = z.object({ id: z.coerce.number().int().positive() });
const move = z
  .object({
    to_status: z.enum(Object.values(ASSET_STATES)),
    employee_id: z.coerce.number().int().positive().optional(),
    reason: z.string().trim().max(1000).optional(),
    technical_report: z.string().trim().max(5000).optional()
  })
  .strict();

module.exports = { params, move };
