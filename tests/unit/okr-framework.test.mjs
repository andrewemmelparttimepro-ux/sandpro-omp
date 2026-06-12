import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAutoClassification,
  buildProjectGateBlockers,
  buildQuarterlyScorecardRows,
  canAdvanceProjectStage,
  computeMetricProgress,
  isKeyResultStale,
} from '../../src/okrFramework.js';

test('OKR auto-classification preserves content and places uncertain work in an assumed category', () => {
  const objectives = [
    { id: 'company', title: 'Company growth OKR', department: 'Leadership', type: 'parent' },
    { id: 'kr', title: 'Increase service margin', parentId: 'company', baselineMetric: 20, currentMetric: 25, targetMetric: 30, metricUnit: '%' },
    { id: 'project', title: 'Deploy shop routing project', department: 'Operations' },
    { id: 'review', title: 'Clarify owner notes', department: 'Sales' },
  ];
  const classified = applyAutoClassification(objectives);

  assert.equal(classified[0].okrLevel, 'company');
  assert.equal(classified[1].okrLevel, 'key_result');
  assert.equal(classified[2].okrLevel, 'project');
  assert.equal(classified[3].okrLevel, 'run_the_business');
  assert.equal(classified[3].classificationStatus, 'needs_review');
  assert.equal(classified[2].title, objectives[2].title);
});

test('metric progress rollups support equal-weight v1 math from baseline to target', () => {
  assert.equal(computeMetricProgress({ baselineMetric: 10, currentMetric: 15, targetMetric: 20 }), 50);
  assert.equal(computeMetricProgress({ baselineMetric: 10, currentMetric: 30, targetMetric: 20 }), 100);
  assert.equal(computeMetricProgress({ baselineMetric: 10, currentMetric: 5, targetMetric: 20 }), 0);
  assert.equal(computeMetricProgress({ baselineMetric: 10, currentMetric: 10, targetMetric: 10 }), null);
});

test('stale KR detection only flags key results without a recent update', () => {
  const oldDate = new Date(Date.now() - 30 * 86400000).toISOString();
  const recentDate = new Date(Date.now() - 2 * 86400000).toISOString();

  assert.equal(isKeyResultStale({ okrLevel: 'key_result', createdAt: oldDate, metricCheckins: [] }), true);
  assert.equal(isKeyResultStale({ okrLevel: 'key_result', createdAt: oldDate, metricCheckins: [{ date: recentDate }] }), false);
  assert.equal(isKeyResultStale({ okrLevel: 'department', createdAt: oldDate }), false);
});

test('project gates require artifacts, KR linkage, and sponsor-quality-finance-senior signoff before approval', () => {
  const project = {
    stage: 'assessment',
    runTheBusiness: false,
    linkedObjectiveIds: [],
    artifacts: [],
    signatures: [],
  };

  const blockers = buildProjectGateBlockers(project);
  assert.ok(blockers.some(item => item.includes('Economic evaluation')));
  assert.ok(blockers.some(item => item.includes('Sponsor signoff')));
  assert.ok(blockers.some(item => item.includes('Linked Key Result')));
  assert.equal(canAdvanceProjectStage(project, 'approved').ok, false);

  const completeProject = {
    ...project,
    linkedObjectiveIds: ['kr-1'],
    artifacts: [
      'economic_evaluation',
      'risk_assessment',
      'quality_review',
      'viability_review',
      'required_approvals',
      'next_steps_ownership',
    ].map(key => ({ artifactKey: key, status: 'complete' })),
    signatures: ['sponsor', 'quality', 'finance', 'senior_management'].map(role => ({ role })),
  };

  assert.deepEqual(buildProjectGateBlockers(completeProject), []);
  assert.equal(canAdvanceProjectStage(completeProject, 'approved').ok, true);
});

test('quarterly scorecard export rows include KR stale state and linked projects', () => {
  const oldDate = new Date(Date.now() - 30 * 86400000).toISOString();
  const rows = buildQuarterlyScorecardRows([
    {
      id: 'kr-1',
      title: 'Increase first-pass quality',
      okrLevel: 'key_result',
      ownerName: 'Jake Feil',
      department: 'Quality',
      okrPeriod: '2026-Q2',
      baselineMetric: 80,
      currentMetric: 88,
      targetMetric: 96,
      status: 'on_track',
      createdAt: oldDate,
    },
  ], [
    { name: 'Shop rework project', linkedObjectiveIds: ['kr-1'] },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].level, 'Key Result');
  assert.equal(rows[0].progress, 50);
  assert.equal(rows[0].stale, 'Yes');
  assert.equal(rows[0].linkedProjects, 'Shop rework project');
});
