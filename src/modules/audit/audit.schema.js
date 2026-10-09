const { z } = require('zod');
const { paginationSchema } = require('../../shared/utils/query');

const query = paginationSchema.extend({
  actor: z.string().trim().max(160).optional(),
  action: z.string().trim().max(80).optional(),
  entity_type: z.string().trim().max(80).optional(),
  sortBy: z.enum(['created_at', 'actor', 'action', 'entity_type']).optional()
});

module.exports = { query };
