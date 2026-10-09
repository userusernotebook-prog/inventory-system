const { z } = require('zod');

const params = z.object({ id: z.coerce.number().int().positive() });
const offboard = z
  .object({ decisions: z.record(z.string(), z.unknown()).optional() })
  .passthrough();

module.exports = { params, offboard };
