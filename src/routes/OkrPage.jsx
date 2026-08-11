import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Plus } from 'lucide-react';
import { getStatusColor, getStatusLabel, getStatusBg, canManageOkrs, isObjectiveAssignedToUser, getObjectiveAssignmentLabel } from '../data';
import { LockedHint } from '../LockedHint';
import { OKR_LEVEL_LABELS, getAssumedOkrLevel } from '../okrFramework';

// Extracted from src/pages.jsx to make OkrPage a real lazy route module.

const isOkrSheetObjective = (objective = {}) => {
  const level = getAssumedOkrLevel(objective);
  if (objective.status === "cancelled") return false;
  if (level === "company" || level === "department" || level === "key_result") return true;
  return Boolean(
    objective.okrGroup || objective.okr_group
    || objective.auditFormUse || objective.audit_form_use
    || objective.baselineText || objective.baseline_text
    || objective.targetText || objective.target_text
  );
};

const getOkrSheetSection = (objective = {}) => {
  if (getAssumedOkrLevel(objective) === "company") return "Company";
  return objective.okrGroup || objective.okr_group || objective.class || objective.department || "Unassigned";
};

const getOkrSheetSubmeta = (objective = {}) => {
  const level = getAssumedOkrLevel(objective);
  return OKR_LEVEL_LABELS[level] || "OKR";
};

const OKR_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const OKR_REFERENCE_COLUMNS = ["YTD AVG", "Cadence", "Department", "Audit Form", "Baseline", "Target"];

const formatOkrReference = (value) => {
  const text = String(value ?? "").trim();
  return text || "—";
};

const formatOkrCadence = (value) => {
  const cadence = String(value || "monthly").replace(/[_-]/g, " ").trim();
  return cadence ? cadence.replace(/\b\w/g, letter => letter.toUpperCase()) : "Monthly";
};

const formatOkrAverage = (value) => {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

// Status choices the line owner can set on the OKR sheet (7/8 meeting: "the
// owner of the task has to be able to go in and say, is this OKR off track,
// on track" — and it has to show in the presentation view).
const OKR_SHEET_STATUSES = [
  { id: "on_track", label: "On Track" },
  { id: "at_risk", label: "At Risk" },
  { id: "blocked", label: "Off Track" },
  { id: "not_started", label: "Not Started" },
  { id: "completed", label: "Completed" },
];
const okrSheetStatusLabel = (status) => OKR_SHEET_STATUSES.find(s => s.id === status)?.label || getStatusLabel(status);

export const OkrPage = ({ objectives, currentUser, onOpenCard, onAddOkr, onSaveCheckin, onQuickStatus, createNotification = null, addToast = null }) => {
  const [view, setView] = useState("edit");
  const [drafts, setDrafts] = useState({});
  const [collapsedSections, setCollapsedSections] = useState(() => new Set());
  const canManageOkrSheet = canManageOkrs(currentUser);
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const okrs = objectives
    .filter(isOkrSheetObjective)
    .sort((a, b) => {
      const sectionA = getOkrSheetSection(a);
      const sectionB = getOkrSheetSection(b);
      const sectionRank = section => section === "Company" ? 0 : 1;
      const sectionRankDelta = sectionRank(sectionA) - sectionRank(sectionB);
      if (sectionRankDelta) return sectionRankDelta;
      const sectionDelta = sectionA.localeCompare(sectionB);
      if (sectionDelta) return sectionDelta;
      const levelRank = { company: 0, department: 1, key_result: 2 };
      const levelDelta = (levelRank[getAssumedOkrLevel(a)] ?? 9) - (levelRank[getAssumedOkrLevel(b)] ?? 9);
      if (levelDelta) return levelDelta;
      return (a.title || "").localeCompare(b.title || "");
    });

  const monthValue = (o, monthIdx) => {
    const checkins = (o.metricCheckins || []).filter(c => {
      const d = new Date(c.date);
      return d.getFullYear() === year && d.getMonth() === monthIdx;
    });
    if (!checkins.length) return null;
    checkins.sort((a, b) => {
      const createdDelta = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      return createdDelta || String(a.id || "").localeCompare(String(b.id || ""));
    });
    return checkins[checkins.length - 1].value;
  };

  const ytdAverage = (o) => {
    const values = OKR_MONTHS
      .slice(0, currentMonth + 1)
      .map((_, monthIdx) => monthValue(o, monthIdx))
      .map(value => Number(value))
      .filter(value => Number.isFinite(value));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const referenceCells = (o) => [
    { key: "avg", value: formatOkrAverage(ytdAverage(o)), className: "okr-ref-metric" },
    { key: "cadence", value: formatOkrCadence(o.measurementCadence), className: "okr-ref-short" },
    { key: "department", value: formatOkrReference(o.department || getOkrSheetSection(o)), className: "okr-ref-short" },
    { key: "audit", value: formatOkrReference(o.auditFormUse), className: "okr-ref-text" },
    { key: "baseline", value: formatOkrReference(o.baselineText || o.baselineMetric), className: "okr-ref-text" },
    { key: "target", value: formatOkrReference(o.targetText || o.targetMetric), className: "okr-ref-text" },
  ];

  const okrColSpan = 2 + OKR_REFERENCE_COLUMNS.length + OKR_MONTHS.length;

  const statusCell = (o, editable) => {
    if (editable && onQuickStatus) {
      return (
        <select
          className="okr-status-select"
          style={{ color: getStatusColor(o.status) }}
          value={OKR_SHEET_STATUSES.some(s => s.id === o.status) ? o.status : "not_started"}
          onChange={e => onQuickStatus(o, e.target.value)}
          aria-label={`Status for ${o.title}`}
        >
          {OKR_SHEET_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      );
    }
    return (
      <span className="okr-status-chip" style={{ color: getStatusColor(o.status), background: getStatusBg(o.status) }}>
        {okrSheetStatusLabel(o.status)}
      </span>
    );
  };

  const canEdit = (o) => canManageOkrSheet || isObjectiveAssignedToUser(o, currentUser.id) || (o.members || []).some(m => m.userId === currentUser.id);

  const saveCell = async (o, monthIdx) => {
    const key = `${o.id}-${monthIdx}`;
    const raw = (drafts[key] ?? "").toString().trim().replace("%", "");
    setDrafts(d => { const n = { ...d }; delete n[key]; return n; });
    if (raw === "" || Number.isNaN(Number(raw))) return;
    await onSaveCheckin(o.id, {
      date: `${year}-${String(monthIdx + 1).padStart(2, "0")}-15`,
      value: Number(raw),
      note: `OKR monthly update (${OKR_MONTHS[monthIdx]})`,
      createdBy: currentUser.id,
    });
  };

  const bySection = okrs.reduce((acc, o) => {
    const d = getOkrSheetSection(o);
    (acc[d] = acc[d] || []).push(o);
    return acc;
  }, {});

  const toggleSection = sectionName => {
    setCollapsedSections(current => {
      const next = new Set(current);
      if (next.has(sectionName)) next.delete(sectionName);
      else next.add(sectionName);
      return next;
    });
  };

  return (
    <div className="okr-page">
      <div className="okr-page-head">
        <div>
          <h1 className="page-title">OKR</h1>
          {view === "edit" && okrs.length > 0 && (() => {
            // Real month progress — motivates finishing the monthly ritual,
            // never fakes a number.
            const updated = okrs.filter(o => monthValue(o, currentMonth) !== null).length;
            return (
              <div className="okr-month-progress" role="progressbar" aria-valuenow={updated} aria-valuemin={0} aria-valuemax={okrs.length} aria-label={`${OKR_MONTHS[currentMonth]} check-ins`}>
                <div className="okr-month-progress-track"><div className="okr-month-progress-fill" style={{ width: `${Math.round((updated / okrs.length) * 100)}%` }} /></div>
                <span className="text-xs text-muted">{OKR_MONTHS[currentMonth]}: {updated} of {okrs.length} lines updated{updated < okrs.length ? ` — ${okrs.length - updated} still open` : " — month complete"}</span>
              </div>
            );
          })()}
        </div>
        <div className="okr-head-controls">
          <div className="dashboard-scope-tabs">
            <button type="button" className={`dashboard-scope-tab ${view === "edit" ? "active" : ""}`} onClick={() => setView("edit")}>Edit view</button>
            <button type="button" className={`dashboard-scope-tab ${view === "presentation" ? "active" : ""}`} onClick={() => setView("presentation")}>Presentation view</button>
          </div>
          {view === "presentation" && (
            <button type="button" className="btn" onClick={() => window.print()}><Download size={14} /> Print</button>
          )}
          {canManageOkrSheet && (
            <button type="button" className="btn btn-primary" onClick={onAddOkr}><Plus size={14} /> Add main OKR</button>
          )}
          {/* Item 9: the locked sheet explains itself — why, who can, and a
              one-tap request that pings the right people. */}
          {!canManageOkrSheet && (
            <LockedHint capability="manage_okrs" currentUser={currentUser} createNotification={createNotification} addToast={addToast} label="Why can't I edit?" />
          )}
        </div>
      </div>

      {view === "edit" ? (
        <>
        <div className="card okr-grid-card">
          <div className="okr-grid-scroll">
            <table className="okr-grid">
              <thead>
                <tr>
                  <th className="okr-name-col">OKR line · {year}</th>
                  <th className="okr-ref-col okr-sticky-status omp-tip omp-tip-left" data-tip="Set by the line owner: On Track, At Risk, or Off Track. Shows on the presentation view too." tabIndex={0}>Status</th>
                  {OKR_REFERENCE_COLUMNS.map(column => (
                    <th
                      key={column}
                      className={`okr-ref-col ${column === "YTD AVG" ? "okr-sticky-average omp-tip" : ""}`}
                      {...(column === "YTD AVG" ? { "data-tip": "Running (year-to-date) average — auto-calculated from the monthly entries. Same as the spreadsheet's rolling average. Read-only.", tabIndex: 0 } : {})}
                    >
                      {column}
                    </th>
                  ))}
                  {OKR_MONTHS.map((m, i) => <th key={m} className={i === currentMonth ? "current" : ""}>{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(bySection).map(([sectionName, rows]) => {
                  const collapsed = collapsedSections.has(sectionName);
                  return <Fragment key={sectionName}>
                    <tr className="okr-group-row">
                      <td colSpan={okrColSpan}>
                        <button type="button" onClick={() => toggleSection(sectionName)} aria-expanded={!collapsed}>
                          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          <strong>{sectionName}</strong>
                          <span>{rows.length} {rows.length === 1 ? "line" : "lines"}</span>
                        </button>
                      </td>
                    </tr>
                    {!collapsed && rows.map(o => {
                      const editable = canEdit(o);
                      return <tr key={o.id}>
                      <td className="okr-name-col">
                        <button type="button" className="okr-name-btn" onClick={() => onOpenCard?.(o)}>
                          <span className="okr-title">{o.title}</span>
                          <span className="okr-meta">{getOkrSheetSection(o)} · {getOkrSheetSubmeta(o)} · {getObjectiveAssignmentLabel(o)}{editable && !canManageOkrSheet ? " · @you" : ""}{!editable ? " · locked" : ""}</span>
                        </button>
                      </td>
                      <td className="okr-ref-cell okr-ref-short okr-sticky-status">{statusCell(o, editable)}</td>
                      {referenceCells(o).map(cell => (
                        <td key={cell.key} className={`okr-ref-cell ${cell.className} ${cell.key === "avg" ? "okr-sticky-average" : ""}`} title={cell.value}>{cell.value}</td>
                      ))}
                      {OKR_MONTHS.map((m, i) => {
                        const key = `${o.id}-${i}`;
                        const val = monthValue(o, i);
                        if (!editable) {
                          return <td key={m} className={`okr-cell locked ${i === currentMonth ? "current" : ""}`}>{val ?? "—"}</td>;
                        }
                        return (
                          <td key={m} className={`okr-cell editable ${i === currentMonth ? "current" : ""}`}>
                            <input
                              value={drafts[key] ?? (val ?? "")}
                              placeholder="·"
                              onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                              onBlur={() => drafts[key] !== undefined && saveCell(o, i)}
                              onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()}
                            />
                          </td>
                        );
                      })}
                    </tr>;
                    })}
                  </Fragment>;
                })}
                {okrs.length === 0 && (
                  <tr><td colSpan={okrColSpan} className="okr-empty">No OKRs yet. {canManageOkrSheet ? "Add a main OKR to get started." : "Main OKRs are created by authorized OKR editors."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="okr-mobile-sections">
          {Object.entries(bySection).map(([sectionName, rows]) => (
            <section key={sectionName} className="okr-mobile-section">
              <button type="button" className="okr-mobile-section-head" onClick={() => toggleSection(sectionName)} aria-expanded={!collapsedSections.has(sectionName)}>
                <span className="okr-mobile-section-title">
                  {collapsedSections.has(sectionName) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <strong>{sectionName}</strong>
                </span>
                <span>{rows.length}</span>
              </button>
              {!collapsedSections.has(sectionName) && <div className="okr-mobile-list">
                {rows.map(o => {
                  const editable = canEdit(o);
                  const ownerName = getObjectiveAssignmentLabel(o);
                  return (
                    <article key={o.id} className="okr-mobile-card">
                      <div className="okr-mobile-card-head">
                        <button type="button" className="okr-mobile-title" onClick={() => onOpenCard?.(o)}>
                          <strong>{o.title}</strong>
                          <span>{getOkrSheetSubmeta(o)} · {ownerName}{!editable ? " · locked" : ""}</span>
                        </button>
                        {statusCell(o, editable)}
                      </div>
                      <div className="okr-mobile-reference">
                        <span><small>YTD avg</small><strong>{formatOkrAverage(ytdAverage(o))}</strong></span>
                        <span><small>Cadence</small><strong>{formatOkrCadence(o.measurementCadence)}</strong></span>
                        <span><small>Target</small><strong>{formatOkrReference(o.targetText || o.targetMetric)}</strong></span>
                      </div>
                      <div className="okr-mobile-months" aria-label={`Monthly updates for ${o.title}`}>
                        {OKR_MONTHS.map((month, monthIdx) => {
                          const key = `${o.id}-${monthIdx}`;
                          const value = monthValue(o, monthIdx);
                          return (
                            <label key={month} className={`okr-mobile-month ${monthIdx === currentMonth ? "current" : ""} ${editable ? "editable" : "locked"}`}>
                              <span>{month}</span>
                              {editable ? (
                                <input
                                  inputMode="decimal"
                                  value={drafts[key] ?? (value ?? "")}
                                  placeholder="—"
                                  onChange={event => setDrafts(draft => ({ ...draft, [key]: event.target.value }))}
                                  onBlur={() => drafts[key] !== undefined && saveCell(o, monthIdx)}
                                  onKeyDown={event => event.key === "Enter" && event.currentTarget.blur()}
                                  aria-label={`${month} value for ${o.title}`}
                                />
                              ) : <strong>{value ?? "—"}</strong>}
                            </label>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>}
            </section>
          ))}
          {okrs.length === 0 && <div className="card okr-empty">No OKRs yet.</div>}
        </div>
        </>
      ) : (
        <div id="okr-print-sheet" className="okr-print-sheet">
          <div className="okr-print-head">
            <div>
              <h2>SandPro OKR {year}</h2>
            </div>
            <span className="okr-print-date">{new Date().toLocaleDateString()}</span>
          </div>
          <div className="okr-print-summary">{okrs.length} OKR lines · {Object.keys(bySection).length} groups</div>
          {Object.entries(bySection).map(([deptName, rows]) => (
            <div key={deptName} className="okr-print-section">
              <h3>{deptName}</h3>
              <table>
                <thead>
                  <tr>
                    <th className="okr-name-col">OKR line</th>
                    <th className="okr-ref-col">Status</th>
                    {OKR_REFERENCE_COLUMNS.map(column => <th key={column} className="okr-ref-col">{column}</th>)}
                    {OKR_MONTHS.map((m, i) => <th key={m} className={i === currentMonth ? "current" : ""}>{m}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(o => (
                    <tr key={o.id}>
                      <td className="okr-name-col">
                        {o.title} <span className="okr-print-owner">— {getObjectiveAssignmentLabel(o)}</span>
                        <span className="okr-print-submeta">{getOkrSheetSubmeta(o)}</span>
                      </td>
                      <td className="okr-ref-cell okr-ref-short">
                        <span className="okr-status-chip" style={{ color: getStatusColor(o.status), background: getStatusBg(o.status) }}>
                          {okrSheetStatusLabel(o.status)}
                        </span>
                      </td>
                      {referenceCells(o).map(cell => (
                        <td key={cell.key} className={`okr-ref-cell ${cell.className}`}>{cell.value}</td>
                      ))}
                      {OKR_MONTHS.map((m, i) => <td key={m} className={i === currentMonth ? "current" : ""}>{monthValue(o, i) ?? "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {okrs.length === 0 && <p className="text-sm text-muted">No OKRs yet.</p>}
        </div>
      )}
    </div>
  );
};

export default OkrPage;
