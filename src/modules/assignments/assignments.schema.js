const { z } = require('zod');

const params = z.object({ id: z.string() });
const offboard = z
  .object({ decisions: z.record(z.string(), z.unknown()).optional() })
  .passthrough();

module.exports = { params, offboard };
