const { z } = require('zod');

const file = z.object({ path: z.string(), originalname: z.string() }).passthrough().optional();

module.exports = { file };
