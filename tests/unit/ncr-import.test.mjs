import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNcrImportDbPayload, isImportedNcrClosedValue, parseCsvText, tableRowsToObjects } from '../../src/ncrImport.js';

test('NCR KPA import accepts read-excel-file workbook objects', () => {
  const workbook = [
    {
      sheet: 'Cover',
      data: [
        ['KPA NCR export'],
        ['Generated 6/23/2026'],
      ],
    },
    {
      sheet: 'Close Out',
      data: [
        ['Export note', '', ''],
        ['Report Number', 'Event Description', 'Department'],
        ['82008371', 'Substandard condition', 'Quality'],
      ],
    },
  ];

  assert.deepEqual(tableRowsToObjects(workbook), [
    {
      'Report Number': '82008371',
      'Event Description': 'Substandard condition',
      Department: 'Quality',
    },
  ]);
});

test('NCR KPA import finds the header row after metadata rows', () => {
  const rows = [
    ['NCR Summary 6.23.2026 Close Out'],
    ['Source', 'KPA'],
    ['Report #', 'Date', 'Event Description'],
    ['82007431', '2026-06-23', 'Process loss'],
  ];

  assert.deepEqual(tableRowsToObjects(rows), [
    {
      'Report #': '82007431',
      Date: '2026-06-23',
      'Event Description': 'Process loss',
    },
  ]);
});

test('NCR KPA import handles quoted CSV cells', () => {
  const rows = parseCsvText('Report Number,Event Description\n8201,"Valve failed, repaired"\n');
  assert.deepEqual(tableRowsToObjects(rows), [
    {
      'Report Number': '8201',
      'Event Description': 'Valve failed, repaired',
    },
  ]);
});

test('NCR KPA import safely rejects unknown workbook shapes', () => {
  assert.deepEqual(tableRowsToObjects({ notRows: true }), []);
});

test('NCR KPA import recognizes Tim workbook closeout values', () => {
  for (const value of ['Yes', 'yes', 'YEs', 'Y', 'closed', 'Completed', true, 1]) {
    assert.equal(isImportedNcrClosedValue(value), true, `${value} should close the NCR`);
  }
  for (const value of ['No', 'no', '', null, false, 0, 'in progress']) {
    assert.equal(isImportedNcrClosedValue(value), false, `${value} should keep the NCR open`);
  }
});

test('NCR refresh preserves OMP workflow ownership and never reopens closed work', () => {
  const incoming = {
    report_number: '83849904',
    event_description: 'Newest KPA description',
    main_department: 'Automation',
    status: 'open',
    closed: false,
    lifecycle_stage: 'submitted',
    owner_id: 'wrong-importer-owner',
    reviewer_id: 'wrong-importer-reviewer',
    linked_objective_id: 'wrong-importer-link',
  };
  const existing = {
    report_number: '83849904',
    main_department: 'Wellhead',
    status: 'closed',
    closed: true,
    lifecycle_stage: 'closed',
  };

  const payload = buildNcrImportDbPayload(incoming, existing, 'andrew-id');

  assert.equal(payload.event_description, 'Newest KPA description');
  assert.equal(payload.main_department, 'Wellhead');
  assert.equal(payload.status, 'closed');
  assert.equal(payload.closed, true);
  assert.equal(payload.lifecycle_stage, 'closed');
  assert.equal(payload.updated_by, 'andrew-id');
  assert.equal(Object.hasOwn(payload, 'owner_id'), false);
  assert.equal(Object.hasOwn(payload, 'reviewer_id'), false);
  assert.equal(Object.hasOwn(payload, 'linked_objective_id'), false);
  assert.equal(Object.hasOwn(payload, 'created_by'), false);
});

test('new NCR import records the importer without assigning workflow ownership', () => {
  const payload = buildNcrImportDbPayload({
    report_number: '83849905',
    event_description: 'New KPA NCR',
    main_department: 'Business Team',
    status: 'closed',
    closed: true,
    lifecycle_stage: 'closed',
    owner_id: 'wrong-importer-owner',
  }, null, 'andrew-id');

  assert.equal(payload.created_by, 'andrew-id');
  assert.equal(payload.updated_by, 'andrew-id');
  assert.equal(payload.main_department, 'Business Team');
  assert.equal(payload.closed, true);
  assert.equal(Object.hasOwn(payload, 'owner_id'), false);
});
