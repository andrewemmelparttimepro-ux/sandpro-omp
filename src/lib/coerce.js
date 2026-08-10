// Boundary coercion for typed Postgres columns. PostgREST rejects '' for
// boolean/uuid/date/numeric columns (22P02), so every payload mapper must
// route optional booleans through here — never `?? null`, which lets '' pass.
export const toNullableBoolean = (value) => {
  if (value === true || value === false) return value;
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  return null;
};

// Required-boolean twin: preserves explicit false values (including the
// string "false") while giving invalid/cleared inputs an intentional default.
// `Boolean("false")` is true, so raw Boolean() is unsafe at write boundaries.
export const toBoolean = (value, fallback = false) => {
  const coerced = toNullableBoolean(value);
  return coerced === null ? fallback === true : coerced;
};

// Numeric twin of toNullableBoolean: '' / junk -> null, numeric strings ->
// numbers (currency symbols and commas stripped). Never lets '' reach a
// numeric column, and never turns a cleared input into a silent 0.
export const toNullableNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const stripped = String(value).replace(/[^0-9.-]/g, '');
  // A junk string strips to nothing — that is null, never a silent 0.
  if (!stripped || stripped === '-' || stripped === '.' || stripped === '-.') return null;
  const numeric = Number(stripped);
  return Number.isFinite(numeric) ? numeric : null;
};
