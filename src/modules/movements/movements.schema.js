const { z } = require('zod');

const params = z.object({ id: z.string() });
const move = z.object({ to_status: z.unknown().optional() }).passthrough();

module.exports = { params, move };
