import { buildProjectGateBlockers, isKeyResultStale } from './okrFramework.js';

export const KPI_DIRECTIONS = {
  INCREASE: 'increase',
  DECREASE: 'decrease',
  TARGET_BAND: 'target_band',
};

export const KPI_STATUS = {
  GREEN: 'green',
  YELLOW: 'yellow',
  RED: 'red',
  GRAY: 'gray',
};

export const KPI_STATUS_META = {
  green: { label: 'On target', tone: 'good', color: '#10B981' },
  yellow: { label: 'Watch', tone: 'warn', color: '#F59E0B' },
  red: { label: 'Action', tone: 'bad', color: '#EF4444' },
  gray: { label: 'No data', tone: 'neutral', color: '#64748B' },
};

const DAY = 86400000;
export const INTERNAL_OBJECTIVE_TITLES = [
  'Objective Draft Disappears / Draft Autosave Needed',
  'Restrict Delete Access to Objective Creator',
  'Enable @mentions while writing objective descriptions',
];

const normalizeText = (value = '') => String(value).trim().replace(/\s+/g, ' ').toLowerCase();
const INTERNAL_OBJECTIVE_TITLE_SET = new Set(INTERNAL_OBJECTIVE_TITLES.map(normalizeText));

const nowDate = () => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date;
};

const asDate = (value) => {
  if (!value) return null;
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isCompletedObjective = (objective = {}) => ['completed', 'cancelled'].includes(objective.status);

const isOverdueObjective = (objective = {}, todayInput = nowDate()) => {
  const due = asDate(objective.dueDate || objective.due_date);
  const today = asDate(todayInput) || nowDate();
  today.setHours(12, 0, 0, 0);
  return Boolean(due && due < today && !isCompletedObjective(objective));
};

const average = (values = []) => {
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
};

const percent = (count, total) => {
  if (!total) return 0;
  return Math.round((count / total) * 100);
};

export const pluralize = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

export const isInternalObjective = (objective = {}) => INTERNAL_OBJECTIVE_TITLE_SET.has(normalizeText(objective.title));

export const getCustomerVisibleObjectives = (objectives = []) => (
  objectives.filter(objective => !isInternalObjective(objective))
);

export const formatKpiValue = (value, unit = '') => {
  if (value === null || value === undefined || value === 'No data') return 'No data';
  const numeric = Number(value);
  const display = Number.isFinite(numeric) ? new Intl.NumberFormat('en-US').format(numeric) : String(value);
  const cleanUnit = String(unit || '').trim();
  if (!cleanUnit) return display;
  if (cleanUnit === '%') return `${display}%`;
  const normalized = cleanUnit.toLowerCase();
  const resolvedUnit = normalized === 'objectives'
    ? (numeric === 1 ? 'objective' : 'objectives')
    : normalized === 'projects'
      ? (numeric === 1 ? 'project' : 'projects')
      : cleanUnit === 'KRs'
        ? (numeric === 1 ? 'KR' : 'KRs')
        : cleanUnit;
  return `${display} ${resolvedUnit}`;
};

export const formatKpiTarget = (kpi = {}) => (
  kpi.targetValue === null || kpi.targetValue === undefined
    ? 'Target n/a'
    : `Target ${formatKpiValue(kpi.targetValue, kpi.unit)}`
);

export const buildKpiPeriodWindow = (period = 'quarter', todayInput = new Date()) => {
  const today = asDate(todayInput) || nowDate();
  const start = new Date(today);
  const end = new Date(today);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (period === 'week') {
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: 'Weekly' };
  }

  if (period === 'month') {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
    return { start, end, label: 'Monthly' };
  }

  const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
  start.setMonth(quarterStartMonth, 1);
  end.setMonth(quarterStartMonth + 3, 0);
  return { start, end, label: 'Quarterly' };
};

const isDateWithinWindow = (value, window) => {
  const date = asDate(value);
  if (!date || !window?.start || !window?.end) return false;
  return date >= window.start && date <= window.end;
};

const objectiveInPeriod = (objective = {}, window) => {
  if (!window) return true;
  const due = asDate(objective.dueDate || objective.due_date);
  if (due && !isCompletedObjective(objective) && due <= window.end) return true;
  return isDateWithinWindow(objective.createdAt || objective.created_at, window)
    || isDateWithinWindow(objective.updatedAt || objective.updated_at, window);
};

const ncrInPeriod = (report = {}, window) => {
  if (!window) return true;
  return isDateWithinWindow(report.reportDate || report.report_date, window)
    || isDateWithinWindow(report.eventAt || report.event_at, window)
    || isDateWithinWindow(report.updatedAt || report.updated_at, window)
    || isDateWithinWindow(report.createdAt || report.created_at, window);
};

const latestDatapointFor = (definition, datapoints = []) => (
  datapoints
    .filter(point => point.kpiId === definition.id || point.kpi_id === definition.id)
    .sort((a, b) => String(b.periodEnd || b.period_end || b.periodStart || b.period_start || b.createdAt || b.created_at)
      .localeCompare(String(a.periodEnd || a.period_end || a.periodStart || a.period_start || a.createdAt || a.created_at)))[0] || null
);

export const calculateKpiStatus = (definition = {}, valueInput = null) => {
  const value = Number(valueInput ?? definition.value);
  if (!Number.isFinite(value)) return KPI_STATUS.GRAY;
  const direction = definition.direction || KPI_DIRECTIONS.INCREASE;
  const target = Number(definition.targetValue ?? definition.target_value);
  const yellowMin = Number(definition.yellowMin ?? definition.yellow_min);
  const yellowMax = Number(definition.yellowMax ?? definition.yellow_max);
  const redMin = Number(definition.redMin ?? definition.red_min);
  const redMax = Number(definition.redMax ?? definition.red_max);

  if (direction === KPI_DIRECTIONS.DECREASE) {
    if (Number.isFinite(redMax) && value >= redMax) return KPI_STATUS.RED;
    if (Number.isFinite(yellowMax) && value >= yellowMax) return KPI_STATUS.YELLOW;
    if (Number.isFinite(target) && value <= target) return KPI_STATUS.GREEN;
    return value > target ? KPI_STATUS.YELLOW : KPI_STATUS.GREEN;
  }

  if (direction === KPI_DIRECTIONS.TARGET_BAND) {
    const low = Number.isFinite(yellowMin) ? yellowMin : target;
    const high = Number.isFinite(yellowMax) ? yellowMax : target;
    if (Number.isFinite(redMin) && value < redMin) return KPI_STATUS.RED;
    if (Number.isFinite(redMax) && value > redMax) return KPI_STATUS.RED;
    if (Number.isFinite(low) && value < low) return KPI_STATUS.YELLOW;
    if (Number.isFinite(high) && value > high) return KPI_STATUS.YELLOW;
    return KPI_STATUS.GREEN;
  }

  if (Number.isFinite(redMin) && value <= redMin) return KPI_STATUS.RED;
  if (Number.isFinite(yellowMin) && value <= yellowMin) return KPI_STATUS.YELLOW;
  if (Number.isFinite(target) && value >= target) return KPI_STATUS.GREEN;
  return value < target ? KPI_STATUS.YELLOW : KPI_STATUS.GREEN;
};

export const buildTrendSeries = (datapoints = [], limit = 8) => (
  [...datapoints]
    .sort((a, b) => String(a.periodEnd || a.period_end || a.periodStart || a.period_start || a.createdAt || a.created_at)
      .localeCompare(String(b.periodEnd || b.period_end || b.periodStart || b.period_start || b.createdAt || b.created_at)))
    .slice(-limit)
    .map(point => ({
      label: point.periodLabel || point.period_label || point.periodEnd || point.period_end || point.periodStart || point.period_start || '',
      value: Number(point.value) || 0,
    }))
);

export const isKpiStale = (definition = {}, datapoints = [], today = new Date()) => {
  const latest = latestDatapointFor(definition, datapoints);
  if (!latest) return true;
  const date = asDate(latest.periodEnd || latest.period_end || latest.periodStart || latest.period_start || latest.createdAt || latest.created_at);
  if (!date) return true;
  const cadenceDays = { daily: 2, weekly: 10, monthly: 40, quarterly: 110 }[definition.cadence] || 40;
  return today.getTime() - date.getTime() > cadenceDays * DAY;
};

export const buildDepartmentScorecard = (objectives = [], { departments: departmentSeed = [] } = {}) => {
  const customerObjectives = getCustomerVisibleObjectives(objectives);
  const discovered = customerObjectives.map(item => item.department || 'Unassigned');
  const seeded = departmentSeed.filter(Boolean);
  const departments = seeded.length
    ? [...new Set([...seeded, ...discovered])]
    : [...new Set(discovered)].sort();
  return departments.map(department => {
    const items = customerObjectives.filter(item => (item.department || 'Unassigned') === department);
    const active = items.filter(item => !isCompletedObjective(item));
    return {
      department,
      objectives: items.length,
      active: active.length,
      companyOkrs: items.filter(item => item.okrLevel === 'company').length,
      departmentOkrs: items.filter(item => item.okrLevel === 'department').length,
      keyResults: items.filter(item => item.okrLevel === 'key_result').length,
      averageProgress: average(items.map(item => item.progress || 0)),
      staleKrs: items.filter(isKeyResultStale).length,
      overdue: active.filter(isOverdueObjective).length,
      blocked: active.filter(item => item.blockerFlag || item.status === 'blocked').length,
      hasObjectives: items.length > 0,
    };
  });
};

export const normalizeNcrCriticality = (report = {}) => {
  const values = [report.criticality, report.severity]
    .map(value => normalizeText(value).replace(/[_-]+/g, ' '))
    .filter(Boolean);
  if (!values.length) return 'unclassified';
  if (values.some(value => ['critical', 'high'].includes(value))) return 'critical';
  if (values.some(value => ['non critical', 'noncritical', 'medium', 'low'].includes(value))) return 'non_critical';
  return 'unclassified';
};

export const buildNcrKpiSummary = (reports = []) => {
  const open = reports.filter(report => !report.closed && !['closed', 'complete', 'completed'].includes(report.status || report.lifecycleStage));
  const classified = open.reduce((acc, report) => {
    const key = normalizeNcrCriticality(report);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const followUpOverdue = open.filter(report => {
    const due = asDate(report.followUpDueDate || report.follow_up_due_date);
    return due && due < nowDate();
  });
  const repeatIssues = open.filter(report => Boolean(report.repeatIssue || report.repeat_issue));
  const npt = open.filter(report => {
    const amount = Number(report.nonProductiveTimeAmount ?? report.non_productive_time_amount);
    return Number.isFinite(amount) && amount > 0;
  });
  return {
    total: reports.length,
    open: open.length,
    critical: classified.critical || 0,
    nonCritical: classified.non_critical || 0,
    unclassified: classified.unclassified || 0,
    followUpOverdue: followUpOverdue.length,
    repeatIssues: repeatIssues.length,
    nonProductiveTime: npt.length,
    closureRate: percent(reports.length - open.length, reports.length),
  };
};

const defaultDefinition = (fields) => ({
  id: fields.id,
  name: fields.name,
  description: fields.description || '',
  category: fields.category || 'Operations',
  department: fields.department || 'Company',
  ownerId: fields.ownerId || fields.owner_id || null,
  unit: fields.unit || '',
  direction: fields.direction || KPI_DIRECTIONS.INCREASE,
  targetValue: fields.targetValue ?? fields.target_value ?? 0,
  yellowMin: fields.yellowMin ?? fields.yellow_min ?? null,
  yellowMax: fields.yellowMax ?? fields.yellow_max ?? null,
  redMin: fields.redMin ?? fields.red_min ?? null,
  redMax: fields.redMax ?? fields.red_max ?? null,
  cadence: fields.cadence || 'weekly',
  sourceType: fields.sourceType || fields.source_type || 'computed',
  sourceLabel: fields.sourceLabel || fields.source_label || 'OMP live data',
  linkedObjectiveIds: fields.linkedObjectiveIds || [],
  value: fields.value,
  previousValue: fields.previousValue ?? null,
  hasData: fields.hasData ?? (fields.value !== null && fields.value !== undefined && Number.isFinite(Number(fields.value))),
  status: fields.status || ((fields.hasData ?? (fields.value !== null && fields.value !== undefined && Number.isFinite(Number(fields.value)))) ? calculateKpiStatus(fields, fields.value) : KPI_STATUS.GRAY),
  trend: fields.trend || [],
  breakdown: fields.breakdown || fields.trend || [],
  freshness: fields.freshness || 'Live',
  narrative: fields.narrative || '',
  noDataReason: fields.noDataReason || '',
});

export const buildOperatingKpis = ({
  objectives = [],
  okrProjects = [],
  ncrReports = [],
  definitions = [],
  datapoints = [],
  alerts = [],
  period = 'quarter',
  today = new Date(),
} = {}) => {
  const todayDate = asDate(today) || nowDate();
  todayDate.setHours(12, 0, 0, 0);
  const periodWindow = buildKpiPeriodWindow(period, todayDate);
  const customerObjectives = getCustomerVisibleObjectives(objectives);
  const periodObjectives = customerObjectives.filter(objective => objectiveInPeriod(objective, periodWindow));
  const periodNcrReports = ncrReports.filter(report => ncrInPeriod(report, periodWindow));
  const active = periodObjectives.filter(item => !isCompletedObjective(item));
  const overdue = active.filter(item => isOverdueObjective(item, todayDate));
  const blocked = active.filter(item => item.blockerFlag || item.status === 'blocked');
  const atRisk = active.filter(item => item.status === 'at_risk');
  const actionRiskIds = new Set([...overdue, ...blocked, ...atRisk].map(item => item.id));
  const keyResults = active.filter(item => item.okrLevel === 'key_result');
  const staleKrs = keyResults.filter(isKeyResultStale);
  const dueSoon = active.filter(item => {
    const due = asDate(item.dueDate || item.due_date);
    if (!due) return false;
    const diff = Math.floor((due - todayDate) / DAY);
    return diff >= 0 && diff <= 7;
  });
  const gateBlocked = okrProjects.filter(project => buildProjectGateBlockers(project).length > 0);
  const ncr = buildNcrKpiSummary(periodNcrReports);

  const computed = [
    defaultDefinition({
      id: 'computed-objective-execution-health',
      name: 'Objective execution health',
      description: 'Percent of active customer-visible objectives that are not overdue, blocked, or at risk in the selected lens.',
      category: 'Objective Execution',
      value: active.length ? percent(Math.max(0, active.length - actionRiskIds.size), active.length) : null,
      targetValue: 85,
      yellowMin: 70,
      redMin: 55,
      unit: '%',
      direction: KPI_DIRECTIONS.INCREASE,
      hasData: active.length > 0,
      trend: [
        { label: 'Blocked', value: blocked.length },
        { label: 'At risk', value: atRisk.length },
        { label: 'Overdue', value: overdue.length },
        { label: 'Healthy', value: Math.max(0, active.length - actionRiskIds.size) },
      ],
      narrative: active.length
        ? `${active.length} active objectives; ${actionRiskIds.size} action-risk (${overdue.length} overdue, ${blocked.length} blocked, ${atRisk.length} at risk).`
        : 'No active customer-visible objectives in this lens yet.',
      noDataReason: 'No active customer-visible objectives in this lens yet.',
      linkedObjectiveIds: [...actionRiskIds],
    }),
    defaultDefinition({
      id: 'computed-due-soon',
      name: '7-day due readiness',
      description: 'Active objectives due in the next seven days.',
      category: 'Operating Rhythm',
      value: dueSoon.length,
      targetValue: 0,
      yellowMax: 3,
      redMax: 6,
      unit: 'objectives',
      direction: KPI_DIRECTIONS.DECREASE,
      hasData: active.length > 0,
      narrative: active.length
        ? `${dueSoon.length} objectives need near-term attention.`
        : 'No active objectives are available for due-readiness yet.',
      noDataReason: 'No active objectives are available for due-readiness yet.',
      linkedObjectiveIds: dueSoon.map(item => item.id),
    }),
    defaultDefinition({
      id: 'computed-stale-krs',
      name: 'Stale key results',
      description: 'Key Results with no recent metric check-in or update.',
      category: 'OKR Trust',
      value: staleKrs.length,
      targetValue: 0,
      yellowMax: 2,
      redMax: 4,
      unit: 'KRs',
      direction: KPI_DIRECTIONS.DECREASE,
      hasData: keyResults.length > 0,
      narrative: keyResults.length
        ? `${staleKrs.length} key results need fresh evidence.`
        : 'No key results are configured in this lens yet.',
      noDataReason: 'No key results are configured in this lens yet.',
      linkedObjectiveIds: staleKrs.map(item => item.id),
    }),
    defaultDefinition({
      id: 'computed-project-gate-blockers',
      name: 'Project gate blockers',
      description: 'Projects blocked by missing KR links, artifacts, or required approvals.',
      category: 'Project Governance',
      value: gateBlocked.length,
      targetValue: 0,
      yellowMax: 1,
      redMax: 3,
      unit: 'projects',
      direction: KPI_DIRECTIONS.DECREASE,
      hasData: okrProjects.length > 0,
      narrative: okrProjects.length
        ? `${gateBlocked.length} projects have stage-gate blockers.`
        : 'No OKR project gate records are configured yet.',
      noDataReason: 'No OKR project gate records are configured yet.',
    }),
    defaultDefinition({
      id: 'computed-ncr-closure-rate',
      name: 'NCR closure rate',
      description: 'Share of NCRs that are closed across the current record set.',
      category: 'Quality / NCR',
      value: ncr.closureRate,
      targetValue: 85,
      yellowMin: 65,
      redMin: 50,
      unit: '%',
      direction: KPI_DIRECTIONS.INCREASE,
      hasData: periodNcrReports.length > 0,
      trend: [
        { label: 'Open', value: ncr.open },
        { label: 'Critical', value: ncr.critical },
        { label: 'Unclassified', value: ncr.unclassified },
        { label: 'Follow-up overdue', value: ncr.followUpOverdue },
        { label: 'Closed %', value: ncr.closureRate },
      ],
      narrative: periodNcrReports.length
        ? `${ncr.open} NCRs open; ${ncr.critical} critical, ${ncr.nonCritical} non-critical, ${ncr.unclassified} unclassified; closure rate ${ncr.closureRate}%.`
        : 'No NCR records are available in this lens.',
      noDataReason: 'No NCR records are available in this lens.',
    }),
  ];

  const manual = definitions.map(definition => {
    const latest = latestDatapointFor(definition, datapoints);
    const points = datapoints.filter(point => point.kpiId === definition.id || point.kpi_id === definition.id);
    const value = latest ? Number(latest.value) : null;
    return defaultDefinition({
      ...definition,
      value,
      trend: buildTrendSeries(points),
      freshness: latest ? `Updated ${latest.periodEnd || latest.period_end || latest.periodStart || latest.period_start}` : 'No datapoints',
      hasData: Boolean(latest),
      status: calculateKpiStatus(definition, value),
      narrative: latest
        ? `${definition.name} is ${value}${definition.unit ? ` ${definition.unit}` : ''} against target ${definition.targetValue ?? definition.target_value ?? 'n/a'}.`
        : `${definition.name} needs its first datapoint.`,
      noDataReason: `${definition.name} needs its first datapoint.`,
    });
  });

  const all = [...computed, ...manual].map(kpi => ({
    ...kpi,
    status: kpi.hasData === false ? KPI_STATUS.GRAY : calculateKpiStatus(kpi, kpi.value),
    alerts: alerts.filter(alert => (alert.kpiId || alert.kpi_id) === kpi.id),
  }));
  return all.sort((a, b) => {
    const rank = { red: 0, yellow: 1, gray: 2, green: 3 };
    return (rank[a.status] ?? 4) - (rank[b.status] ?? 4) || String(a.name).localeCompare(String(b.name));
  });
};

export const buildKpiHealthSummary = (kpis = []) => {
  const counts = kpis.reduce((acc, kpi) => ({ ...acc, [kpi.status]: (acc[kpi.status] || 0) + 1 }), {});
  const measured = kpis.filter(kpi => kpi.status !== KPI_STATUS.GRAY);
  const green = measured.filter(kpi => kpi.status === KPI_STATUS.GREEN).length;
  return {
    score: measured.length ? Math.round((green / measured.length) * 100) : null,
    measured: measured.length,
    total: kpis.length,
    green,
    red: counts.red || 0,
    yellow: counts.yellow || 0,
    gray: counts.gray || 0,
    summary: `${pluralize(counts.red || 0, 'action KPI')} · ${pluralize(counts.yellow || 0, 'watch KPI')} · ${pluralize(counts.gray || 0, 'missing-data KPI')}`,
  };
};

export const buildKpiAlerts = (kpis = []) => (
  kpis
    .filter(kpi => ['red', 'yellow', 'gray'].includes(kpi.status))
    .map(kpi => ({
      id: `alert-${kpi.id}`,
      kpiId: kpi.id,
      severity: kpi.status === 'red' ? 'critical' : kpi.status === 'yellow' ? 'watch' : 'missing_data',
      title: kpi.status === 'gray' ? `Add data for ${kpi.name}` : `${kpi.name} needs attention`,
      message: kpi.narrative || kpi.description,
      status: 'open',
    }))
);

export const buildKpiNarrative = (kpi = {}) => {
  if (!kpi) return '';
  if (kpi.status === 'green') return `${kpi.name} is inside the target band. Keep the current operating rhythm and watch freshness.`;
  if (kpi.status === 'red') return `${kpi.name} is outside the action threshold. Convert this into an objective or assign an owner before the next operating review.`;
  if (kpi.status === 'yellow') return `${kpi.name} is in watch range. Review the linked objectives and confirm whether the current target still reflects reality.`;
  return `${kpi.name} has no current datapoint. Add a manual value or import a CSV before relying on this KPI.`;
};

const splitCsvLine = (line = '') => {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

export const parseKpiCsv = (text = '', { importedBy = null } = {}) => {
  const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ['CSV needs a header row and at least one data row.'] };
  const headers = splitCsvLine(lines[0]).map(header => header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const rows = [];
  const errors = [];
  lines.slice(1).forEach((line, index) => {
    const cells = splitCsvLine(line);
    const raw = headers.reduce((acc, header, cellIndex) => ({ ...acc, [header]: cells[cellIndex] || '' }), {});
    const name = raw.kpi || raw.kpi_name || raw.metric || raw.department;
    const valueRaw = raw.value || raw.average_progress || raw.objectives || raw.open || raw.count;
    const value = Number(String(valueRaw).replace('%', ''));
    if (!name || !Number.isFinite(value)) {
      errors.push(`Row ${index + 2}: missing KPI name or numeric value.`);
      return;
    }
    const isDepartmentScorecard = Boolean(raw.department && raw.objectives !== undefined);
    rows.push({
      name: isDepartmentScorecard ? `${raw.department} department scorecard` : name,
      department: raw.department || raw.dept || 'Company',
      periodStart: raw.period_start || raw.period || null,
      periodEnd: raw.period_end || raw.period || null,
      value,
      targetValue: raw.target ? Number(String(raw.target).replace('%', '')) : null,
      unit: String(valueRaw).includes('%') || raw.average_progress ? '%' : raw.unit || '',
      sourceLabel: isDepartmentScorecard ? 'Department quarterly scorecard CSV' : raw.source || 'KPI CSV import',
      dimensions: raw,
      importedBy,
    });
  });
  return { rows, errors };
};

export const scoreObjectiveKpiLink = (kpi = {}, objective = {}) => {
  if (isInternalObjective(objective)) return 0;
  const haystack = `${objective.title || ''} ${objective.description || ''} ${objective.department || ''}`.toLowerCase();
  const terms = `${kpi.name || ''} ${kpi.category || ''} ${kpi.department || ''}`.toLowerCase().split(/\W+/).filter(term => term.length > 3);
  const matches = terms.filter(term => haystack.includes(term)).length;
  const direct = (kpi.linkedObjectiveIds || []).includes(objective.id) ? 50 : 0;
  return direct + matches * 10 + (objective.department && kpi.department === objective.department ? 8 : 0);
};
