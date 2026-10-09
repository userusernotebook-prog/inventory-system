const { z } = require('zod');
const { ASSET_STATES } = require('../assets/domain/asset-state-machine');

const query = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  ticketStatus: z.enum(['open', 'in_progress', 'closed', 'cancelled']).optional(),
  ticketType: z.string().trim().max(100).optional(),
  assetStatus: z.enum(Object.values(ASSET_STATES)).optional(),
  assetType: z.string().trim().max(100).optional()
});

module.exports = { query };
