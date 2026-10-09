const { z } = require('zod');

const query = z
  .object({
    year: z.unknown().optional(),
    month: z.unknown().optional(),
    ticketStatus: z.unknown().optional(),
    ticketType: z.unknown().optional(),
    assetStatus: z.unknown().optional(),
    assetType: z.unknown().optional()
  })
  .passthrough();

module.exports = { query };
