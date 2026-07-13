export const normalizeCsvHeader = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const isImportedNcrClosedValue = (value) => /^(yes|y|true|1|closed|complete|completed)$/i
  .test(String(value ?? '').trim());

const NCR_IMPORT_DB_SOURCE_FIELDS = [
  'report_number',
  'source_sheet',
  'source_link',
  'report_date',
  'observer',
  'follow_up_count',
  'follow_up_details',
  'worksite_area',
  'operator_location',
  'event_at',
  'internal_external',
  'event_type',
  'event_types',
  'non_productive_time',
  'non_productive_time_amount',
  'criticality',
  'severity',
  'author',
  'personnel_involved',
  'event_description',
  'root_cause_codes',
  'root_cause_analysis',
  'immediate_action',
  'permanent_action',
  'affected_departments',
  'affected_department_list',
  'department_group',
  'action_effective',
  'source_system',
  'source_record_id',
  'source_batch_id',
  'source_raw_record',
  'canonical_failure_code',
  'normalized_failure_summary',
  'ai_confidence',
  'ai_classification_reason',
];

export const buildNcrImportDbPayload = (fullPayload = {}, existing = null, currentUserId = null) => {
  const payload = Object.fromEntries(NCR_IMPORT_DB_SOURCE_FIELDS
    .filter(field => Object.hasOwn(fullPayload, field))
    .map(field => [field, fullPayload[field]]));
  const closed = Boolean(fullPayload.closed) || Boolean(existing?.closed);

  payload.main_department = existing?.main_department || fullPayload.main_department || null;
  payload.closed = closed;
  payload.status = closed
    ? 'closed'
    : existing?.status === 'in_progress'
      ? 'in_progress'
      : 'open';
  payload.lifecycle_stage = closed
    ? 'closed'
    : existing?.lifecycle_stage || fullPayload.lifecycle_stage || 'submitted';
  payload.updated_by = currentUserId || fullPayload.updated_by || null;
  if (!existing) payload.created_by = currentUserId || fullPayload.created_by || null;

  return payload;
};

const NCR_IMPORT_HEADER_HINTS = [
  ['Report #', 'Report Number', 'NCR #', 'NCR Number', 'ID', 'Response ID'],
  ['Event Description', 'Description', 'Event', 'Describe Event'],
];

export const parseCsvText = (text = '') => {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
  return rows;
};

export const getImportHeaderMatchCount = (row = []) => {
  if (!Array.isArray(row)) return 0;
  const cells = row.map(cell => normalizeCsvHeader(cell)).filter(Boolean);
  if (!cells.length) return 0;
  return NCR_IMPORT_HEADER_HINTS.reduce((count, candidates) => {
    const matched = candidates.some(candidate => {
      const normalized = normalizeCsvHeader(candidate);
      return cells.some(cell => cell === normalized || cell.includes(normalized));
    });
    return matched ? count + 1 : count;
  }, 0);
};

const isNonEmptyTableRow = (row = []) => (
  Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== '')
);

export const normalizeSpreadsheetRows = (input = []) => {
  if (Array.isArray(input)) {
    if (!input.length) return [];
    if (Array.isArray(input[0])) return input;
    const workbookSheets = input
      .filter(sheet => sheet && Array.isArray(sheet.data))
      .map(sheet => sheet.data);
    if (workbookSheets.length) {
      const scoredSheets = workbookSheets
        .map(rows => ({
          rows,
          headerScore: rows.reduce((best, row) => Math.max(best, getImportHeaderMatchCount(row)), 0),
          populatedRows: rows.filter(isNonEmptyTableRow).length,
        }))
        .sort((a, b) => b.headerScore - a.headerScore || b.populatedRows - a.populatedRows);
      return scoredSheets[0]?.rows || [];
    }
  }
  if (input && Array.isArray(input.data)) return normalizeSpreadsheetRows(input.data);
  if (input && Array.isArray(input.rows)) return normalizeSpreadsheetRows(input.rows);
  return [];
};

export const tableRowsToObjects = (rows = []) => {
  const tableRows = normalizeSpreadsheetRows(rows).filter(Array.isArray);
  const headerIndex = tableRows.findIndex(row => getImportHeaderMatchCount(row) >= NCR_IMPORT_HEADER_HINTS.length);
  const firstContentIndex = tableRows.findIndex(isNonEmptyTableRow);
  const effectiveHeaderIndex = headerIndex >= 0 ? headerIndex : firstContentIndex;
  if (effectiveHeaderIndex < 0) return [];
  const header = tableRows[effectiveHeaderIndex] || [];
  const body = tableRows.slice(effectiveHeaderIndex + 1).filter(isNonEmptyTableRow);
  const headers = header.map((value, index) => String(value || `Column ${index + 1}`).trim());
  return body.map(cells => headers.reduce((acc, headerName, index) => {
    acc[headerName || `Column ${index + 1}`] = cells[index] ?? '';
    return acc;
  }, {}));
};
