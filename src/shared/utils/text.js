const { ValidationError } = require('../errors');

const text = (value) => (value == null ? null : String(value).trim() || null);

function optionalDate(value, field) {
  const date = text(value);
  if (!date) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    throw new ValidationError(`${field} deve ser uma data válida.`);
  }
  return date;
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

module.exports = { text, optionalDate, norm };
