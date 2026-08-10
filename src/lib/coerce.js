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
