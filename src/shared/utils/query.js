const { z } = require('zod');

const PAGE_SIZE_MAX = 100;
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(25),
  sortBy: z.string().trim().min(1).max(64).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

function pageResult({ page, pageSize, total, items }) {
  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

// LIKE treats % and _ as wildcards. Escape them so a search remains literal.
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function likeContains(value) {
  return `%${escapeLike(value)}%`;
}

module.exports = { paginationSchema, pageResult, escapeLike, likeContains, PAGE_SIZE_MAX };
