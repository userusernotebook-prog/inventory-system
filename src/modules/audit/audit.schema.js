const { z } = require('zod');

const query = z.object({}).passthrough();

module.exports = { query };
