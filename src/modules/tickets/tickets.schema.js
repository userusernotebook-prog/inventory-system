const { z } = require('zod');

const list = z.object({}).passthrough();
const body = z.object({}).passthrough();

module.exports = { list, body };
