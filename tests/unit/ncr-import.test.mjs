import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCsvText, tableRowsToObjects } from '../../src/ncrImport.js';

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
