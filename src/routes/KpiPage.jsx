import { useState, useMemo, useEffect } from 'react';
import { RefreshCw, Plus, Target, Check, BarChart3, Shield, AlertTriangle, Activity, CheckCircle2, Upload } from 'lucide-react';
import { DEPARTMENTS } from '../data';
import { EmptyState } from '../sharedWidgets';
import {
  KPI_STATUS_META,
  buildDepartmentScorecard,
  buildKpiHealthSummary,
  buildKpiAlerts,
  buildKpiNarrative,
  buildNcrKpiSummary,
  buildOperatingKpis,
  formatKpiTarget,
  formatKpiValue,
  getCustomerVisibleObjectives,
  parseKpiCsv,
  scoreObjectiveKpiLink,
} from '../kpiSystem';

const KpiSparkline = ({ points = [], status = 'gray' }) => {
  const values = points.map(point => Number(point.value)).filter(Number.isFinite);
  if (values.length < 2) {
    return (
      <div className="kpi-sparkline empty" aria-label="No trend data">
        <span />
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const path = values.map((value, index) => {
    const x = values.length === 1 ? 100 : (index / (values.length - 1)) * 100;
    const y = 42 - ((value - min) / range) * 34;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  return (
    <svg className={`kpi-sparkline kpi-sparkline-${status}`} viewBox="0 0 100 48" role="img" aria-label="KPI trend line">
      <path d="M0 42H100" className="kpi-sparkline-base" />
      <path d={path} className="kpi-sparkline-path" />
    </svg>
  );
};

const KpiStatusPill = ({ status }) => {
  const meta = KPI_STATUS_META[status] || KPI_STATUS_META.gray;
  return (
    <span className={`kpi-status-pill kpi-status-${status}`}>
      <span aria-hidden="true" />
      {meta.label}
    </span>
  );
};

const KpiMetricVisual = ({ kpi }) => {
  if (!kpi) return null;
  const breakdown = (kpi.breakdown || kpi.trend || []).filter(point => point.label);
  if (kpi.hasData === false) {
    return (
      <div className="kpi-no-data-note" role="note">
        {kpi.noDataReason || 'No source data available yet.'}
      </div>
    );
  }
  if (kpi.sourceType === 'computed' && breakdown.length > 0) {
    const max = Math.max(1, ...breakdown.map(point => Number(point.value) || 0));
    return (
      <div className="kpi-breakdown-list" aria-label={`${kpi.name} breakdown`}>
        {breakdown.slice(0, 4).map(point => {
          const value = Number(point.value) || 0;
          return (
            <div key={point.label} className="kpi-breakdown-row">
              <span>{point.label}</span>
              <div aria-hidden="true"><i style={{ width: `${Math.max(6, (value / max) * 100)}%` }} /></div>
              <strong>{formatKpiValue(value, point.unit || '')}</strong>
            </div>
          );
        })}
      </div>
    );
  }
  return <KpiSparkline points={kpi.trend} status={kpi.status} />;
};

const kpiLensTitle = (period) => (
  period === 'quarter' ? 'Quarterly execution lens' : period === 'month' ? 'Monthly execution lens' : 'Weekly execution lens'
);

const ncrMatchesDepartment = (report = {}, department = 'all') => {
  if (department === 'all') return true;
  const haystack = [
    report.departmentGroup,
    report.department_group,
    report.affectedDepartments,
    report.affected_departments,
    ...(Array.isArray(report.affectedDepartmentList) ? report.affectedDepartmentList : []),
    ...(Array.isArray(report.affected_department_list) ? report.affected_department_list : []),
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(String(department).toLowerCase());
};

export const KpiPage = ({
  objectives = [],
  okrProjects = [],
  ncrReports = [],
  currentUser,
  kpiData = {},
  onOpenObjective,
  onCreateObjectiveFromKpi,
  addToast,
}) => {
  const [scope, setScope] = useState('company');
  const [period, setPeriod] = useState('quarter');
  const [department, setDepartment] = useState('all');
  const [selectedKpiId, setSelectedKpiId] = useState(null);
  const [showNewKpi, setShowNewKpi] = useState(false);
  const [newKpiDraft, setNewKpiDraft] = useState({ name: '', department: 'Company', targetValue: 100, unit: '%', direction: 'increase' });
  const [manualValue, setManualValue] = useState('');
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [importText, setImportText] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const definitionsWithLinks = useMemo(() => {
    const linksByKpi = (kpiData.links || []).reduce((acc, link) => {
      (acc[link.kpiId || link.kpi_id] = acc[link.kpiId || link.kpi_id] || []).push(link.objectiveId || link.objective_id);
      return acc;
    }, {});
    return (kpiData.definitions || []).map(definition => ({
      ...definition,
      linkedObjectiveIds: [...new Set([...(definition.linkedObjectiveIds || []), ...(linksByKpi[definition.id] || [])])],
    }));
  }, [kpiData.definitions, kpiData.links]);

  const customerObjectives = useMemo(() => getCustomerVisibleObjectives(objectives), [objectives]);
  const scopedObjectives = useMemo(() => (
    department === 'all'
      ? customerObjectives
      : customerObjectives.filter(objective => (objective.department || 'Unassigned') === department)
  ), [customerObjectives, department]);
  const scopedNcrReports = useMemo(() => (
    ncrReports.filter(report => ncrMatchesDepartment(report, department))
  ), [department, ncrReports]);

  const allKpis = useMemo(() => buildOperatingKpis({
    objectives: scopedObjectives,
    okrProjects,
    ncrReports: scopedNcrReports,
    definitions: definitionsWithLinks,
    datapoints: kpiData.datapoints || [],
    alerts: kpiData.alerts || [],
    period,
  }), [definitionsWithLinks, kpiData.alerts, kpiData.datapoints, okrProjects, period, scopedNcrReports, scopedObjectives]);

  const visibleKpis = useMemo(() => allKpis.filter(kpi => {
    if (department !== 'all' && kpi.department !== department && kpi.department !== 'Company') return false;
    if (scope === 'manual' && kpi.sourceType === 'computed') return false;
    if (scope === 'computed' && kpi.sourceType !== 'computed') return false;
    return true;
  }), [allKpis, department, scope]);

  const selectedKpi = useMemo(() => (
    visibleKpis.find(kpi => kpi.id === selectedKpiId) || visibleKpis[0] || null
  ), [selectedKpiId, visibleKpis]);

  useEffect(() => {
    if (selectedKpi && selectedKpi.id !== selectedKpiId) setSelectedKpiId(selectedKpi.id);
  }, [selectedKpi, selectedKpiId]);

  const activeObjectives = scopedObjectives.filter(objective => !['completed', 'cancelled'].includes(objective.status));
  const departmentRows = useMemo(() => buildDepartmentScorecard(customerObjectives, { departments: DEPARTMENTS }), [customerObjectives]);
  const filteredDepartments = departmentRows.filter(row => department === 'all' || row.department === department);
  const ncrSummary = useMemo(() => buildNcrKpiSummary(scopedNcrReports), [scopedNcrReports]);
  const generatedAlerts = useMemo(() => buildKpiAlerts(visibleKpis), [visibleKpis]);
  const actionAlerts = [
    ...(kpiData.alerts || []).filter(alert => alert.status !== 'acknowledged'),
    ...generatedAlerts.filter(alert => !(kpiData.alerts || []).some(saved => saved.kpiId === alert.kpiId || saved.kpi_id === alert.kpiId)),
  ].slice(0, 8);
  const actionInboxDescription = 'What matters to you here: this is your KPI action queue. It only pulls forward KPIs that need inspection, owner assignment, or a new objective; it is not the full KPI catalog.';
  const kpiDepartmentOptions = ['all', ...new Set([...DEPARTMENTS, ...departmentRows.map(row => row.department)])];
  const healthSummary = useMemo(() => buildKpiHealthSummary(visibleKpis), [visibleKpis]);
  const selectedKpiIsComputed = selectedKpi?.sourceType === 'computed';
  const candidateObjectives = selectedKpi
    ? [...scopedObjectives]
      .map(objective => ({ objective, score: scoreObjectiveKpiLink(selectedKpi, objective) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
    : [];

  const handleCreateDefinition = async () => {
    if (!newKpiDraft.name.trim()) {
      addToast?.({ type: 'error', message: 'KPI name is required.' });
      return;
    }
    setBusyAction('create-definition');
    try {
      const created = await kpiData.createDefinition?.({
        ...newKpiDraft,
        targetValue: Number(newKpiDraft.targetValue),
        createdBy: currentUser?.id,
      });
      setSelectedKpiId(created?.id || null);
      setShowNewKpi(false);
      setNewKpiDraft({ name: '', department: 'Company', targetValue: 100, unit: '%', direction: 'increase' });
      addToast?.({ type: 'success', message: 'KPI created' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not create KPI' });
    } finally {
      setBusyAction('');
    }
  };

  const handleAddManualDatapoint = async () => {
    const value = Number(manualValue);
    if (!selectedKpi || !Number.isFinite(value)) {
      addToast?.({ type: 'error', message: 'Enter a numeric datapoint.' });
      return;
    }
    if (selectedKpi.sourceType === 'computed') {
      addToast?.({ type: 'error', message: 'Computed OMP KPIs are updated from live app data.' });
      return;
    }
    setBusyAction('manual-datapoint');
    try {
      const today = new Date().toISOString().slice(0, 10);
      await kpiData.addDatapoint?.(selectedKpi.id, {
        value,
        periodStart: today,
        periodEnd: today,
        sourceLabel: 'Manual KPI check-in',
        importedBy: currentUser?.id,
      });
      setManualValue('');
      addToast?.({ type: 'success', message: 'KPI datapoint saved' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not save datapoint' });
    } finally {
      setBusyAction('');
    }
  };

  const handleFilePreview = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvFileName(file.name);
    setImportText(text);
    setCsvPreview(parseKpiCsv(text, { importedBy: currentUser?.id }));
    event.target.value = '';
  };

  const handleImportCsv = async () => {
    if (!importText) return;
    setBusyAction('csv-import');
    try {
      const result = await kpiData.importKpiCsv?.(importText, csvFileName || 'kpi-import.csv');
      addToast?.({ type: result?.errors?.length ? 'info' : 'success', message: `KPI import complete: ${result?.importedRows || 0} rows` });
      setCsvPreview(null);
      setImportText('');
      setCsvFileName('');
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not import KPI CSV' });
    } finally {
      setBusyAction('');
    }
  };

  const handleCreateObjective = async (kpi) => {
    setBusyAction(`objective-${kpi.id}`);
    try {
      await onCreateObjectiveFromKpi?.(kpi);
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="kpi-page">
      <div className="kpi-page-header">
        <div>
          <div className="kpi-eyebrow">SandPro execution system</div>
          <h1>KPI Command Center</h1>
          <p>Goal-linked operating KPIs from live objectives and NCRs. OKRs and manual scorecards appear when they have real source data.</p>
        </div>
        <div className="kpi-toolbar" aria-label="KPI controls">
          <select value={period} onChange={event => setPeriod(event.target.value)} aria-label="KPI period">
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
          </select>
          <select value={scope} onChange={event => setScope(event.target.value)} aria-label="KPI source scope">
            <option value="company">All KPIs</option>
            <option value="computed">OMP live only</option>
            <option value="manual">Manual/imported only</option>
          </select>
          <select value={department} onChange={event => setDepartment(event.target.value)} aria-label="KPI department">
            {kpiDepartmentOptions.map(item => <option key={item} value={item}>{item === 'all' ? 'All departments' : item}</option>)}
          </select>
          <button type="button" className="btn btn-secondary" onClick={() => kpiData.refetch?.()} disabled={kpiData.loading}>
            <RefreshCw size={15} className={kpiData.loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="kpi-hero-grid">
        <div className="kpi-hero-card primary">
          <div className="kpi-hero-label">Operating health</div>
          <strong>{healthSummary.score === null ? 'No data' : `${healthSummary.score}%`}</strong>
          <span>{healthSummary.summary} · {healthSummary.measured} measured of {healthSummary.total}</span>
        </div>
        <div className="kpi-hero-card">
          <div className="kpi-hero-label">Active objectives</div>
          <strong>{activeObjectives.length}</strong>
          <span>{activeObjectives.filter(objective => objective.blockerFlag || objective.status === 'blocked').length} blocked or flagged · internal dev rows excluded</span>
        </div>
        <div className="kpi-hero-card">
          <div className="kpi-hero-label">NCR closure</div>
          <strong>{ncrSummary.closureRate}%</strong>
          <span>{ncrSummary.open} open · {ncrSummary.critical} critical · {ncrSummary.unclassified} unclassified</span>
        </div>
        <div className="kpi-hero-card">
          <div className="kpi-hero-label">Manual scorecards</div>
          <strong className={(kpiData.definitions || []).length ? '' : 'kpi-no-data-strong'}>{(kpiData.definitions || []).length || 'No data'}</strong>
          <span>{(kpiData.datapoints || []).length} datapoints stored</span>
        </div>
      </div>

      <div className="kpi-main-grid">
        <section className="kpi-panel kpi-operating-panel">
          <div className="kpi-panel-head">
            <div>
              <span className="kpi-eyebrow">Company operating KPIs</span>
              <h2>{kpiLensTitle(period)}</h2>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setShowNewKpi(true)}>
              <Plus size={15} /> New KPI
            </button>
          </div>
          {showNewKpi && (
            <div className="kpi-create-strip">
              <input value={newKpiDraft.name} onChange={event => setNewKpiDraft(prev => ({ ...prev, name: event.target.value }))} placeholder="KPI name" />
              <input value={newKpiDraft.department} onChange={event => setNewKpiDraft(prev => ({ ...prev, department: event.target.value || 'Company' }))} placeholder="Department" />
              <input value={newKpiDraft.targetValue} onChange={event => setNewKpiDraft(prev => ({ ...prev, targetValue: event.target.value }))} placeholder="Target" inputMode="decimal" />
              <select value={newKpiDraft.direction} onChange={event => setNewKpiDraft(prev => ({ ...prev, direction: event.target.value }))}>
                <option value="increase">Increase is good</option>
                <option value="decrease">Decrease is good</option>
                <option value="target_band">Target band</option>
              </select>
              <button type="button" className="btn btn-primary" onClick={handleCreateDefinition} disabled={busyAction === 'create-definition'}>Save</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowNewKpi(false)}>Cancel</button>
            </div>
          )}
          <div className="kpi-card-grid">
            {visibleKpis.map(kpi => (
              <button
                key={kpi.id}
                type="button"
                className={`kpi-command-card kpi-command-${kpi.status} ${selectedKpi?.id === kpi.id ? 'selected' : ''}`}
                onClick={() => setSelectedKpiId(kpi.id)}
                title={kpi.description || kpi.narrative}
              >
                <div className="kpi-command-top">
                  <span>{kpi.category}</span>
                  <KpiStatusPill status={kpi.status} />
                </div>
                <strong>{kpi.name}</strong>
                <div className="kpi-command-value">
                  <span>{formatKpiValue(kpi.value, kpi.unit)}</span>
                  <small>{formatKpiTarget(kpi)}</small>
                </div>
                <KpiMetricVisual kpi={kpi} />
                <p>{kpi.narrative || kpi.description}</p>
              </button>
            ))}
            {!visibleKpis.length && <EmptyState icon={BarChart3} text="No KPIs match the current filters." />}
          </div>
        </section>

        <aside className="kpi-panel kpi-detail-panel">
          <div className="kpi-panel-head compact">
            <div>
              <span className="kpi-eyebrow">Detail lens</span>
              <h2>{selectedKpi?.name || 'Select a KPI'}</h2>
            </div>
            {selectedKpi && <KpiStatusPill status={selectedKpi.status} />}
          </div>
          {selectedKpi ? (
            <>
              <div className="kpi-detail-value">
                <strong>{formatKpiValue(selectedKpi.value, selectedKpi.unit)}</strong>
                <span>{formatKpiTarget(selectedKpi)} · {selectedKpi.freshness}</span>
              </div>
              <KpiMetricVisual kpi={selectedKpi} />
              <p className="kpi-narrative">{buildKpiNarrative(selectedKpi)}</p>
              <div className="kpi-definition-box">
                <strong>Definition</strong>
                <span>{selectedKpi.description || 'Definition not provided yet.'}</span>
              </div>
              <div className="kpi-detail-actions">
                <button type="button" className="btn btn-primary" onClick={() => handleCreateObjective(selectedKpi)} disabled={busyAction === `objective-${selectedKpi.id}`}>
                  <Target size={15} /> Create objective
                </button>
                <input value={manualValue} onChange={event => setManualValue(event.target.value)} placeholder={selectedKpiIsComputed ? 'Computed KPI' : 'Manual value'} inputMode="decimal" aria-label="Manual KPI value" disabled={selectedKpiIsComputed} />
                <button type="button" className="btn btn-secondary" onClick={handleAddManualDatapoint} disabled={selectedKpiIsComputed || busyAction === 'manual-datapoint'}>
                  <Check size={15} /> Save value
                </button>
              </div>
              <div className="kpi-linked-objectives">
                <h3>Linked objective candidates</h3>
                {candidateObjectives.length ? candidateObjectives.map(({ objective }) => (
                  <button key={objective.id} type="button" onClick={() => onOpenObjective?.(objective, 'kpi')} className="kpi-linked-objective">
                    <span>{objective.title}</span>
                    <small>{objective.department || 'Company'} · {objective.progress || 0}%</small>
                  </button>
                )) : <p>No objective candidates found yet.</p>}
              </div>
            </>
          ) : (
            <EmptyState icon={Activity} text="Select a KPI to inspect its trend, definition, and action options." />
          )}
        </aside>
      </div>

      <div className="kpi-secondary-grid">
        <section className="kpi-panel">
          <div className="kpi-panel-head">
            <div>
              <span className="kpi-eyebrow">Department quarterly scorecard</span>
              <h2>Objective and KR health</h2>
            </div>
            <label className="btn btn-secondary kpi-import-label">
              <Upload size={15} /> Preview CSV
              <input type="file" accept=".csv,text/csv" onChange={handleFilePreview} />
            </label>
          </div>
          {csvPreview && (
            <div className="kpi-import-preview">
              <strong>{csvFileName || 'CSV preview'}</strong>
              <span>{csvPreview.rows.length} importable rows · {csvPreview.errors.length} errors</span>
              {csvPreview.errors.length > 0 && <p>{csvPreview.errors.slice(0, 2).join(' ')}</p>}
              <div className="flex gap-8">
                <button type="button" className="btn btn-primary" onClick={handleImportCsv} disabled={busyAction === 'csv-import'}>Import rows</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setCsvPreview(null); setImportText(''); setCsvFileName(''); }}>Cancel</button>
              </div>
            </div>
          )}
          <div className="kpi-scorecard-table-wrap">
            <table className="kpi-scorecard-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Objectives</th>
                  <th>Company OKRs</th>
                  <th>Dept OKRs</th>
                  <th>KRs</th>
                  <th>Avg progress</th>
                  <th>Stale KRs</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {filteredDepartments.map(row => (
                  <tr key={row.department} className={row.hasObjectives ? '' : 'kpi-scorecard-empty-row'}>
                    <td>{row.department}</td>
                    <td>{row.objectives}</td>
                    <td>{row.companyOkrs}</td>
                    <td>{row.departmentOkrs}</td>
                    <td>{row.keyResults}</td>
                    <td>{row.averageProgress}%</td>
                    <td className={row.staleKrs > 0 ? 'kpi-table-warn' : ''}>{row.staleKrs}</td>
                    <td>{row.hasObjectives ? `${row.active} active` : 'No objectives yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="kpi-panel">
          <div className="kpi-panel-head">
            <div>
              <span className="kpi-eyebrow">NCR quality strip</span>
              <h2>Quality closure health</h2>
            </div>
            <Shield size={18} />
          </div>
          <div className="kpi-ncr-grid">
            {[
              { label: 'Open NCRs', value: ncrSummary.open },
              { label: 'Critical', value: ncrSummary.critical, tone: 'critical' },
              { label: 'Non-critical', value: ncrSummary.nonCritical },
              { label: 'Unclassified', value: ncrSummary.unclassified, tone: ncrSummary.unclassified ? 'watch' : '' },
              { label: 'Follow-up overdue', value: ncrSummary.followUpOverdue, tone: ncrSummary.followUpOverdue ? 'critical' : '' },
              { label: 'NPT-linked', value: ncrSummary.nonProductiveTime },
              { label: 'Closure rate', value: `${ncrSummary.closureRate}%` },
            ].map(({ label, value, tone }) => (
              <div key={label} className={`kpi-ncr-stat ${tone ? `kpi-ncr-stat-${tone}` : ''}`}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="kpi-panel kpi-alert-panel">
          <div className="kpi-panel-head">
            <div>
              <span className="kpi-eyebrow">Action inbox</span>
              <h2>Action, watch, and missing data KPIs</h2>
            </div>
            <span className="kpi-action-help-wrap">
              <button
                type="button"
                className="kpi-action-help"
                aria-label="Explain Action Inbox"
                aria-describedby="kpi-action-inbox-help"
              >
                <AlertTriangle size={18} aria-hidden="true" />
              </button>
              <span id="kpi-action-inbox-help" role="tooltip" className="kpi-action-help-tooltip">
                {actionInboxDescription}
              </span>
            </span>
          </div>
          <div className="kpi-alert-list">
            {actionAlerts.length ? actionAlerts.map(alert => {
              const kpi = visibleKpis.find(item => item.id === (alert.kpiId || alert.kpi_id));
              return (
                <div key={alert.id} className={`kpi-alert-row kpi-alert-${alert.severity || 'watch'}`}>
                  <div>
                    <strong>{alert.title}</strong>
                    <span>{alert.message}</span>
                  </div>
                  {kpi && <button type="button" className="btn btn-xs btn-secondary" onClick={() => setSelectedKpiId(kpi.id)}>Inspect</button>}
                  {alert.id && !String(alert.id).startsWith('alert-') && (
                    <button type="button" className="btn btn-xs btn-secondary" onClick={() => kpiData.acknowledgeAlert?.(alert.id)}>Ack</button>
                  )}
                </div>
              );
            }) : <EmptyState icon={CheckCircle2} text="No red or yellow KPI alerts in this lens." />}
          </div>
        </section>
      </div>
    </div>
  );
};

export default KpiPage;
