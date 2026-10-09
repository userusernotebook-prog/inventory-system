const { z } = require('zod');

const params = z.object({ id: z.string() });
const list = z.object({ q: z.unknown().optional(), status: z.unknown().optional() }).passthrough();
const body = z.object({}).passthrough();

module.exports = { params, list, body };
