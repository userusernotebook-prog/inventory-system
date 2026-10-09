const { z } = require('zod');
const { paginationSchema } = require('../../shared/utils/query');
const { ASSET_STATES } = require('./domain/asset-state-machine');

const text = (max) => z.string().trim().max(max).optional();
const date = z.string().datetime({ offset: true }).optional().or(z.literal(''));
const params = z.object({ id: z.coerce.number().int().positive() });
const list = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(Object.values(ASSET_STATES)).optional(),
  city: z.string().trim().max(120).optional(),
  equipment_type: z.string().trim().max(100).optional(),
  sortBy: z
    .enum(['hostname', 'equipment_type', 'model', 'serial', 'status', 'updated_at'])
    .optional()
});
const fields = {
  hostname: text(120),
  equipment_type: text(100),
  manufacturer: text(100),
  model: text(160),
  serial: text(160),
  description: text(2000),
  imei1: text(32),
  imei2: text(32),
  apple_id: text(254),
  reference: text(120),
  condition_text: text(500),
  city: text(120),
  location: text(160),
  activated_at: date,
  replaced_at: date
};
const body = z.object(fields).strict();
const create = body.refine((value) => Boolean(value.equipment_type), {
  message: 'Tipo de equipamento é obrigatório.',
  path: ['equipment_type']
});
// PUT is a full replacement: accepting a partial object previously erased fields
// and surfaced a SQLite error when equipment_type was omitted.
const update = body.refine((value) => Boolean(value.equipment_type), {
  message: 'Tipo de equipamento é obrigatório.',
  path: ['equipment_type']
});

module.exports = { params, list, body: create, create, update };
