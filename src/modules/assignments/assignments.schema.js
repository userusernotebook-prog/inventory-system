const { z } = require('zod');

const params = z.object({ id: z.coerce.number().int().positive() });
module.exports = { params };
