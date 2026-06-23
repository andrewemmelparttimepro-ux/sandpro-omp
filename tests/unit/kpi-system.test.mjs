import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDepartmentScorecard,
  buildKpiHealthSummary,
  buildKpiAlerts,
  buildKpiNarrative,
  buildNcrKpiSummary,
  buildOperatingKpis,
  buildTrendSeries,
  calculateKpiStatus,
  formatKpiTarget,
  formatKpiValue,
  getCustomerVisibleObjectives,
  isKpiStale,
  normalizeNcrCriticality,
  parseKpiCsv,
  pluralize,
  scoreObjectiveKpiLink,
} from '../../src/kpiSystem.js';

test('KPI banding supports increase, decrease, and target-band definitions', () => {
  assert.equal(calculateKpiStatus({ direction: 'increase', targetValue: 90, yellowMin: 75, redMin: 50 }, 92), 'green');
  assert.equal(calculateKpiStatus({ direction: 'increase', targetValue: 90, yellowMin: 75, redMin: 50 }, 62), 'yellow');
  assert.equal(calculateKpiStatus({ direction: 'increase', targetValue: 90, yellowMin: 75, redMin: 50 }, 40), 'red');
  assert.equal(calculateKpiStatus({ direction: 'decrease', targetValue: 0, yellowMax: 2, redMax: 5 }, 0), 'green');
  assert.equal(calculateKpiStatus({ direction: 'decrease', targetValue: 0, yellowMax: 2, redMax: 5 }, 3), 'yellow');
  assert.equal(calculateKpiStatus({ direction: 'target_band', yellowMin: 95, yellowMax: 105, redMin: 90, redMax: 110 }, 100), 'green');
});

test('trend and stale helpers use durable datapoints', () => {
  const points = [
    { value: 4, periodEnd: '2026-01-31' },
    { value: 8, periodEnd: '2026-02-28' },
    { value: 6, periodEnd: '2026-03-31' },
  ];
  assert.deepEqual(buildTrendSeries(points, 2), [
    { label: '2026-02-28', value: 8 },
    { label: '2026-03-31', value: 6 },
  ]);
  assert.equal(isKpiStale({ id: 'k1', cadence: 'weekly' }, [{ kpiId: 'k1', periodEnd: '2026-06-15', value: 1 }], new Date('2026-06-16T12:00:00')), false);
  assert.equal(isKpiStale({ id: 'k1', cadence: 'weekly' }, [{ kpiId: 'k1', periodEnd: '2026-05-01', value: 1 }], new Date('2026-06-16T12:00:00')), true);
});

test('department scorecard rollup mirrors Objectives scorecard fields', () => {
  const rows = buildDepartmentScorecard([
    { id: '1', department: 'Shop', okrLevel: 'company', status: 'active', progress: 80 },
    { id: '2', department: 'Shop', okrLevel: 'key_result', status: 'active', progress: 40, metricCheckins: [], createdAt: '2026-01-01' },
    { id: '3', department: 'Admin', okrLevel: 'department', status: 'completed', progress: 100 },
  ]);
  const shop = rows.find(row => row.department === 'Shop');
  assert.equal(shop.objectives, 2);
  assert.equal(shop.companyOkrs, 1);
  assert.equal(shop.keyResults, 1);
  assert.equal(shop.averageProgress, 60);
  assert.equal(shop.staleKrs, 1);
});

test('NCR KPI summary tracks open quality work', () => {
  const summary = buildNcrKpiSummary([
    { id: 'n1', status: 'open', severity: 'Critical', followUpDueDate: '2026-01-01', repeatIssue: true, nonProductiveTimeAmount: 3 },
    { id: 'n2', status: 'closed', closed: true },
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.open, 1);
  assert.equal(summary.critical, 1);
  assert.equal(summary.followUpOverdue, 1);
  assert.equal(summary.closureRate, 50);
});

test('NCR criticality normalization is exact and leaves blanks unclassified', () => {
  assert.equal(normalizeNcrCriticality({ severity: 'Critical' }), 'critical');
  assert.equal(normalizeNcrCriticality({ severity: 'Non-Critical' }), 'non_critical');
  assert.equal(normalizeNcrCriticality({ criticality: 'noncritical' }), 'non_critical');
  assert.equal(normalizeNcrCriticality({ severity: '' }), 'unclassified');

  const summary = buildNcrKpiSummary([
    { id: 'n1', status: 'open', severity: 'Critical' },
    { id: 'n2', status: 'open', severity: 'Non-Critical' },
    { id: 'n3', status: 'open', severity: '' },
  ]);
  assert.equal(summary.critical, 1);
  assert.equal(summary.nonCritical, 1);
  assert.equal(summary.unclassified, 1);
});

test('customer-visible objective helpers exclude exact internal legacy dev rows', () => {
  const internal = { id: 'internal-1', title: 'Objective Draft Disappears / Draft Autosave Needed', department: 'Shop', status: 'active', progress: 5 };
  const customer = { id: 'customer-1', title: 'Improve NCR closure quality', department: 'Shop', status: 'active', progress: 75 };
  assert.deepEqual(getCustomerVisibleObjectives([internal, customer]), [customer]);

  const [shop] = buildDepartmentScorecard([internal, customer], { departments: ['Shop'] });
  assert.equal(shop.objectives, 1);
  assert.equal(shop.averageProgress, 75);
  assert.equal(scoreObjectiveKpiLink({ name: 'Objective Draft', department: 'Shop' }, internal), 0);
});

test('KPI formatting keeps units readable and pluralized', () => {
  assert.equal(pluralize(0, 'objective'), '0 objectives');
  assert.equal(pluralize(1, 'objective'), '1 objective');
  assert.equal(formatKpiValue(0, 'objectives'), '0 objectives');
  assert.equal(formatKpiValue(1, 'objectives'), '1 objective');
  assert.equal(formatKpiValue(0, 'KRs'), '0 KRs');
  assert.equal(formatKpiTarget({ targetValue: 0, unit: 'objectives' }), 'Target 0 objectives');
});

test('empty KPI pillars render no-data status and do not inflate health score', () => {
  const kpis = buildOperatingKpis({
    objectives: [],
    okrProjects: [],
    ncrReports: [],
    definitions: [{ id: 'manual-empty', name: 'Manual safety score', targetValue: 1, unit: 'incidents' }],
    datapoints: [],
    period: 'quarter',
    today: '2026-06-16',
  });

  for (const id of ['computed-objective-execution-health', 'computed-stale-krs', 'computed-project-gate-blockers', 'computed-ncr-closure-rate', 'manual-empty']) {
    const kpi = kpis.find(item => item.id === id);
    assert.equal(kpi.status, 'gray');
    assert.equal(kpi.hasData, false);
  }

  const health = buildKpiHealthSummary(kpis);
  assert.equal(health.score, null);
  assert.equal(health.measured, 0);
  assert.equal(health.gray, kpis.length);
});

test('overdue active objectives count as action risk for execution health', () => {
  const kpis = buildOperatingKpis({
    objectives: [
      { id: 'late-1', title: 'Finish overdue plant action', status: 'active', dueDate: '2026-06-01', progress: 20 },
      { id: 'healthy-1', title: 'Finish current plant action', status: 'active', dueDate: '2026-06-20', progress: 60 },
    ],
    today: '2026-06-16',
    period: 'quarter',
  });
  const health = kpis.find(kpi => kpi.id === 'computed-objective-execution-health');
  assert.equal(health.value, 50);
  assert.equal(health.status, 'red');
  assert.match(health.narrative, /1 action-risk \(1 overdue, 0 blocked, 0 at risk\)/);
});

test('operating health score ignores no-data KPIs', () => {
  const summary = buildKpiHealthSummary([
    { id: 'green', status: 'green' },
    { id: 'red', status: 'red' },
    { id: 'yellow', status: 'yellow' },
    { id: 'gray', status: 'gray' },
  ]);
  assert.equal(summary.score, 33);
  assert.equal(summary.measured, 3);
  assert.equal(summary.gray, 1);
});

test('operating KPIs combine computed OMP metrics and manual KPI definitions', () => {
  const kpis = buildOperatingKpis({
    objectives: [
      { id: 'o1', status: 'active', dueDate: '2026-01-01', progress: 20 },
      { id: 'o2', status: 'blocked', blockerFlag: true, progress: 10 },
    ],
    okrProjects: [],
    ncrReports: [],
    definitions: [{ id: 'manual-1', name: 'Shop throughput', direction: 'increase', targetValue: 10, yellowMin: 6, redMin: 3, unit: ' jobs' }],
    datapoints: [{ kpiId: 'manual-1', periodEnd: '2026-06-01', value: 8 }],
  });
  assert.ok(kpis.some(kpi => kpi.id === 'computed-objective-execution-health'));
  const manual = kpis.find(kpi => kpi.id === 'manual-1');
  assert.equal(manual.value, 8);
  assert.equal(manual.status, 'yellow');
});

test('CSV parser handles department scorecard and rejects invalid rows', () => {
  const parsed = parseKpiCsv([
    'Department,Objectives,Company OKRs,Department OKRs,Key Results,Average Progress,Stale KRs',
    'Admin,10,0,0,0,92%,0',
    'Bad Row,,,,,,',
  ].join('\n'));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].name, 'Admin department scorecard');
  assert.equal(parsed.rows[0].value, 92);
  assert.equal(parsed.errors.length, 1);
});

test('alerts, narratives, and objective link scoring stay action-oriented', () => {
  const kpi = { id: 'k1', name: 'NCR closure rate', category: 'Quality', department: 'Quality', status: 'red', value: 30, targetValue: 85, unit: '%' };
  const alerts = buildKpiAlerts([kpi]);
  assert.equal(alerts[0].severity, 'critical');
  assert.match(buildKpiNarrative(kpi), /outside the action threshold/i);
  assert.ok(scoreObjectiveKpiLink(kpi, { id: 'o1', title: 'Improve NCR closure quality', department: 'Quality' }) > 0);
});
