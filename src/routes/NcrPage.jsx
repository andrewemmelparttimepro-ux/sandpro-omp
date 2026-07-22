import { Fragment, useState, useMemo, useRef, useEffect, Suspense } from 'react';

import { Search, ChevronDown, ChevronLeft, Target, CheckCircle2, AlertTriangle, Clock, AlertCircle, Building2, Activity, MessageSquare, Network, X, Filter, Layers, LayoutGrid, Columns3, Plus, UserPlus, Shield, Download, Upload, Settings, Users, BarChart3, FileText, Globe, Mail, Bell, Star, List, Edit3, Check, Paperclip, Send, Trash2, Loader2, Image, File as FileIcon, Wrench, Camera, RefreshCw, PieChart, MapPin, Sparkles, UserCircle, Calendar, DollarSign, GripVertical, Volume2, VolumeX, Radio, ClipboardCheck } from 'lucide-react';

import { getProfiles, formatDate, timeAgo, DEPARTMENTS, DEFAULT_DEPARTMENT, getDepartmentOptions } from "../data";

import { Avatar, Badge } from "../uiPrimitives";

import { ProgressBar, KPICard, ObjectiveCard, EmptyState, FeatureHelp, FilePreviewModal, TagMentionControl } from "../sharedWidgets";


import { supabase } from "../lib/supabase";

import { FieldKeyProvider, DefinedTerm, FieldKeyHint } from "../glossary";

import { OKR_LEVELS, OKR_LEVEL_LABELS, PROJECT_STAGES } from "../okrFramework";

import { ALT_COMPUTE_MODES, ALT_DASHBOARD_MODE, ALT_TIME_KEYS, DEFAULT_ALT_DASHBOARD_PREFS } from "../altDashboard";


import { isImportedNcrClosedValue, normalizeCsvHeader, parseCsvText, tableRowsToObjects } from "../ncrImport";

import { KPI_STATUS_META } from "../kpiSystem";

import { OMP_DEPARTMENTS, OMP_DEPARTMENT_CLASSES, OKR_GROUP_TO_DEPARTMENT, OMP_RECURRENCE_REPEATS, getNcrGroupDepartment, suggestNcrDepartment } from "../ompFramework";



const loadReadXlsxFile = async () => {
  const module = await import('read-excel-file/browser');
  return module.default;
};

let writeXlsxFilePromise;

const loadWriteXlsxFile = async () => {
  if (!writeXlsxFilePromise) {
    writeXlsxFilePromise = import('write-excel-file/browser').then(module => module.default);
  }
  return writeXlsxFilePromise;
};

const eventHasDraggedFiles = event => {
  const transfer = event.dataTransfer;
  if (!transfer) return false;
  if (Array.from(transfer.types || []).includes('Files')) return true;
  if (Array.from(transfer.items || []).some(item => item.kind === 'file')) return true;
  return (transfer.files?.length || 0) > 0;
};

const getDroppedFiles = transfer => {
  const fromFileList = Array.from(transfer?.files || []).filter(file => file?.name);
  if (fromFileList.length > 0) return fromFileList;
  return Array.from(transfer?.items || []).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
};

const extensionForMime = (mimeType = '') => {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('plain')) return 'txt';
  return 'bin';
};

const nameClipboardFile = (file, index) => {
  if (file?.name) return file;
  const extension = extensionForMime(file?.type);
  return new File([file], `pasted-fix-it-${Date.now()}-${index + 1}.${extension}`, {
    type: file?.type || 'application/octet-stream',
    lastModified: Date.now()
  });
};

const getClipboardFiles = clipboardData => {
  const fromFileList = Array.from(clipboardData?.files || []).filter(Boolean);
  const fromItems = Array.from(clipboardData?.items || []).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
  const files = fromFileList.length > 0 ? fromFileList : fromItems;
  return files.map(nameClipboardFile);
};

// ============================================================================
// NCR TRACKER — Non-Conformance Reports
// ============================================================================
const NCR_LIFECYCLE_STAGES = [{
  id: 'draft',
  label: 'Draft'
}, {
  id: 'submitted',
  label: 'Submitted'
}, {
  id: 'containment_required',
  label: 'Containment Required'
}, {
  id: 'root_cause',
  label: 'Root Cause'
}, {
  id: 'corrective_action',
  label: 'Corrective Action'
}, {
  id: 'effectiveness_check',
  label: 'Effectiveness Check'
}, {
  id: 'closed',
  label: 'Closed'
}, {
  id: 'void',
  label: 'Void'
}];

const NCR_DISPOSITIONS = ['Use as-is', 'Rework', 'Repair', 'Scrap', 'Return', 'Hold', 'Customer concession'];

const NCR_WORKSITE_AREAS = ['Customer Location', 'Office', 'Shop', 'Vendor Location', 'Internal Audit', 'External Audit'];

const NCR_INTERNAL_EXTERNAL = ['Internal', 'External'];

const NCR_EVENT_TYPES = ['Equipment Failure', 'Process Loss', 'Substandard Condition'];

const NCR_CRITICALITY = ['Critical', 'Non-Critical'];

const NCR_DEPARTMENT_GROUPS = DEPARTMENTS;

const NCR_ACTION_TIMEFRAMES = ['Immediate', '24 hours', '48 hours', '7 days', '14 days', '30 days', 'Next shutdown', 'Customer directed'];

const NCR_YES_NO_OPTIONS = ['Yes', 'No'];

const NCR_ROOT_CAUSE_CODES = ['Not Following SOP', 'Inadequate Commissioning', 'Faulty Equipment', 'Inadequate Training', 'Process Gap', 'Supplier / Vendor Issue', 'Design / Engineering Issue', 'Material Defect', 'Maintenance Issue', 'Human Error', 'Unknown / Pending RCA'];

const NCR_EVIDENCE_PURPOSES = ['pictures', 'rca_report', 'corrective_action_proof', 'customer_document', 'signed_approval', 'evidence'];

const NCR_IMPORT_REQUIRED_FIELDS = ['reportNumber', 'eventDescription'];

const PROVISIONAL_FAILURE_CODES = [{
  code: 'HRU',
  label: 'HRU failure',
  aliases: ['hru', 'hydraulic release unit']
}, {
  code: 'AWC_VALVE',
  label: 'AWC valve failure',
  aliases: ['awc valve', 'awc', 'annular well control']
}, {
  code: '710_VALVE',
  label: '710 valve failure',
  aliases: ['710 valve', '710']
}, {
  code: 'EQUIPMENT_FAILURE',
  label: 'Equipment failure',
  aliases: ['equipment failure', 'failed', 'failure', 'broken']
}, {
  code: 'PROCESS_LOSS',
  label: 'Process loss',
  aliases: ['process loss', 'npt', 'non productive']
}, {
  code: 'SUBSTANDARD_CONDITION',
  label: 'Substandard condition',
  aliases: ['substandard condition', 'condition']
}];

const NCR_QUERY_ALIASES = [{
  label: 'Exxon / XTO',
  aliases: ['exxon', 'exxonmobil', 'exxon mobile', 'xto']
}, {
  label: 'HRU',
  aliases: ['hru', 'hydraulic release unit']
}, {
  label: '710 valve',
  aliases: ['710 valve', '710']
}, {
  label: 'AWC valve',
  aliases: ['awc valve', 'awc', 'annular well control']
}, {
  label: 'Process loss',
  aliases: ['process loss', 'npt', 'non productive time', 'non productive']
}];

const NCR_IGNORED_DEPARTMENT_GROUPS = new Set(['operations']);

const getNcrStageLabel = (stage = '') => NCR_LIFECYCLE_STAGES.find(item => item.id === stage)?.label || ncrStatusLabel({
  status: stage
});

const normalizeNcrYesNo = value => {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (/^(no|n|false|0)$/.test(normalized) || /not effective|ineffective|failed|did not|not worked|not acceptable/.test(normalized)) return 'No';
  if (/^(yes|y|true|1)$/.test(normalized) || /effective|worked|successful|passed|acceptable/.test(normalized)) return 'Yes';
  return '';
};

const ncrYesNoToBoolean = value => {
  const normalized = normalizeNcrYesNo(value);
  if (normalized === 'Yes') return true;
  if (normalized === 'No') return false;
  return null;
};

const NcrYesNoSelect = ({
  value,
  onChange,
  disabled = false,
  blankLabel = 'Select Yes or No',
  ariaLabel
}) => <select value={normalizeNcrYesNo(value)} onChange={event => onChange?.(event.target.value)} disabled={disabled} aria-label={ariaLabel}>
    <option value="">{blankLabel}</option>
    {NCR_YES_NO_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
  </select>;

const getNcrLifecycleColor = (stage = '') => ({
  draft: 'var(--accent-7)',
  submitted: 'var(--info)',
  containment_required: 'var(--warning)',
  root_cause: 'var(--brand)',
  corrective_action: 'var(--brand)',
  effectiveness_check: 'var(--info)',
  closed: 'var(--success)',
  void: 'var(--accent-7)'
})[stage] || 'var(--brand)';

const ncrStatusLabel = report => {
  if (report.closed || report.status === 'closed') return 'Closed';
  if (report.linkedObjectiveId || report.status === 'in_progress') return 'In Progress';
  return 'Open';
};

const buildNcrDetailExportHtml = ({
  report,
  profiles = []
}) => {
  const personName = id => profiles.find(profile => profile.id === id)?.name || '';
  const actionRows = (report.actionItems || []).map(action => `
    <tr>
      <td>${escapeExportHtml(action.title)}</td>
      <td>${escapeExportHtml(personName(action.ownerId) || 'Unassigned')}</td>
      <td>${escapeExportHtml(action.status || 'open')}</td>
      <td>${escapeExportHtml(action.dueDate ? formatDate(action.dueDate) : '')}</td>
      <td>${escapeExportHtml(action.evidenceNotes || '')}</td>
    </tr>
  `).join('');
  const evidenceRows = (report.attachments || []).map(file => `
    <tr>
      <td>${escapeExportHtml(file.name)}</td>
      <td>${escapeExportHtml(file.purpose || 'evidence')}</td>
      <td>${escapeExportHtml(file.size || '')}</td>
      <td>${escapeExportHtml(file.ts ? formatDate(file.ts) : '')}</td>
    </tr>
  `).join('');
  const signatureRows = (report.signatures || []).map(signature => `
    <tr>
      <td>${escapeExportHtml(getNcrSignatureRoleLabel(signature.role))}</td>
      <td>${escapeExportHtml(signature.signedByName || personName(signature.signedBy) || 'Signed')}</td>
      <td>${escapeExportHtml(signature.signedAt ? formatDate(signature.signedAt) : '')}</td>
    </tr>
  `).join('');
  const auditRows = (report.auditEvents || []).slice(0, 20).map(event => `
    <tr>
      <td>${escapeExportHtml(event.createdAt ? formatDate(event.createdAt) : '')}</td>
      <td>${escapeExportHtml(personName(event.actorId) || 'System')}</td>
      <td>${escapeExportHtml(event.eventType || '')}</td>
      <td>${escapeExportHtml(event.fieldName || '')}</td>
      <td>${escapeExportHtml(event.note || '')}</td>
    </tr>
  `).join('');
  const actionEffective = normalizeNcrYesNo(report.actionEffective);
  return `<!doctype html>
<html>
<head>
  <title>SandPro NCR ${escapeExportHtml(report.reportNumber)}</title>
  <style>
    @page { size: letter; margin: 0.45in; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; }
    h1 { margin: 0 0 4px; color: #ff7f02; font-size: 22px; }
    h2 { margin: 18px 0 8px; font-size: 13px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
    .box { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; }
    .label { color: #6b7280; text-transform: uppercase; font-size: 8px; font-weight: 700; letter-spacing: .05em; }
    p { white-space: pre-wrap; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; color: #374151; font-size: 9px; text-transform: uppercase; }
    .stamp { float: right; color: #6b7280; }
  </style>
</head>
<body>
  <div class="stamp">Generated ${escapeExportHtml(new Date().toLocaleString())}</div>
  <h1>SandPro NCR Detail Packet</h1>
  <strong>NCR #${escapeExportHtml(report.reportNumber)}</strong>
  <div class="meta">
    <div class="box"><div class="label">Lifecycle</div>${escapeExportHtml(getNcrStageLabel(report.lifecycleStage))}</div>
    <div class="box"><div class="label">Owner</div>${escapeExportHtml(personName(report.ownerId) || 'Unassigned')}</div>
    <div class="box"><div class="label">Reviewer</div>${escapeExportHtml(personName(report.reviewerId) || 'Unassigned')}</div>
    <div class="box"><div class="label">Verifier</div>${escapeExportHtml(personName(report.verifierId) || 'Unassigned')}</div>
    <div class="box"><div class="label">Report date</div>${escapeExportHtml(report.reportDate ? formatDate(report.reportDate) : '')}</div>
    <div class="box"><div class="label">Criticality</div>${escapeExportHtml(report.criticality || report.severity || '')}</div>
    <div class="box"><div class="label">Group</div>${escapeExportHtml(getNcrDepartmentValue(report))}</div>
    <div class="box"><div class="label">Disposition</div>${escapeExportHtml(report.disposition || '')}</div>
    <div class="box"><div class="label">Worksite / Area</div>${escapeExportHtml(report.worksiteArea || '')}</div>
    <div class="box"><div class="label">Operator / Location</div>${escapeExportHtml(report.operatorLocation || '')}</div>
    <div class="box"><div class="label">Internal / External</div>${escapeExportHtml(report.internalExternal || '')}</div>
    <div class="box"><div class="label">NPT / Cost</div>${escapeExportHtml(`${report.nonProductiveTime || 'No'} ${report.nonProductiveTimeAmount ? `- ${report.nonProductiveTimeAmount}` : ''}`)}</div>
    <div class="box"><div class="label">Failure group</div>${escapeExportHtml(report.normalizedFailureSummary || classifyNcrFailure(report).label)}</div>
    <div class="box"><div class="label">Root cause code</div>${escapeExportHtml(report.rootCauseCodes || '')}</div>
    <div class="box"><div class="label">Action effective?</div>${escapeExportHtml(actionEffective || 'Not verified')}</div>
    <div class="box"><div class="label">Estimated cost</div>${escapeExportHtml(report.estimatedCost ?? '')}</div>
    <div class="box"><div class="label">Source</div>${escapeExportHtml(report.sourceSystem || 'OMP')}</div>
  </div>
  <h2>Event</h2><p>${escapeExportHtml(report.eventDescription || 'No event description entered.')}</p>
  <h2>Containment / Disposition</h2><p>${escapeExportHtml(report.containmentSummary || 'No containment summary.')}<br>${escapeExportHtml(report.dispositionNotes || '')}</p>
  <h2>Root Cause</h2><p>${escapeExportHtml(report.rootCauseAnalysis || report.rootCauseCodes || 'No root cause captured yet.')}</p>
  <h2>Corrective Action</h2><p>${escapeExportHtml(report.immediateAction || '')}<br>${escapeExportHtml(report.permanentAction || '')}</p>
  <h2>Effectiveness Verification</h2><p>${escapeExportHtml(`Action effective: ${actionEffective || 'Not verified'}\n${report.effectivenessSummary || 'No effectiveness verification captured yet.'}`)}</p>
  <h2>Native NCR Action Items</h2>
  <table><thead><tr><th>Action</th><th>Owner</th><th>Status</th><th>Due</th><th>Evidence</th></tr></thead><tbody>${actionRows || '<tr><td colspan="5">No action items.</td></tr>'}</tbody></table>
  <h2>Evidence Attachments</h2>
  <table><thead><tr><th>Name</th><th>Purpose</th><th>Size</th><th>Uploaded</th></tr></thead><tbody>${evidenceRows || '<tr><td colspan="4">No evidence attachments.</td></tr>'}</tbody></table>
  <h2>Signatures / Approvals</h2>
  <table><thead><tr><th>Role</th><th>Signed by</th><th>Signed at</th></tr></thead><tbody>${signatureRows || '<tr><td colspan="3">No signatures captured.</td></tr>'}</tbody></table>
  <h2>Audit Trail</h2>
  <table><thead><tr><th>When</th><th>Who</th><th>Event</th><th>Field</th><th>Note</th></tr></thead><tbody>${auditRows || '<tr><td colspan="5">No audit events yet.</td></tr>'}</tbody></table>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body>
</html>`;
};

const normalizeNcr = (value = '') => String(value || '').toLowerCase();

const findFirstValue = (row = {}, candidates = []) => {
  const normalizeCell = value => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    return String(value).trim();
  };
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const normalized = normalizeCsvHeader(candidate);
    const found = entries.find(([key]) => normalizeCsvHeader(key) === normalized);
    if (found && found[1] !== undefined && found[1] !== null && normalizeCell(found[1]) !== '') return normalizeCell(found[1]);
  }
  for (const candidate of candidates) {
    const normalized = normalizeCsvHeader(candidate);
    const found = entries.find(([key]) => normalizeCsvHeader(key).includes(normalized));
    if (found && found[1] !== undefined && found[1] !== null && normalizeCell(found[1]) !== '') return normalizeCell(found[1]);
  }
  return '';
};

const dateOnly = (value = '') => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const splitMultiValue = (value = '') => String(value || '').split(/[;,|]/).map(item => item.trim()).filter(Boolean);

const sanitizeNcrDepartmentList = (items = []) => items.map(item => String(item || '').trim()).filter(item => item && !NCR_IGNORED_DEPARTMENT_GROUPS.has(normalizeNcr(item)));

const getNcrDepartmentList = (report = {}) => {
  const values = Array.isArray(report.affectedDepartmentList) && report.affectedDepartmentList.length ? report.affectedDepartmentList : splitMultiValue(report.affectedDepartments || report.departmentGroup);
  return sanitizeNcrDepartmentList(values);
};

const getNcrPrimaryGroupValue = (report = {}) => {
  const group = String(report.departmentGroup || '').trim();
  if (group && !NCR_IGNORED_DEPARTMENT_GROUPS.has(normalizeNcr(group))) return group;
  return getNcrDepartmentList(report)[0] || '';
};

const getNcrDepartmentValue = (report = {}) => {
  const departments = getNcrDepartmentList(report);
  if (departments.length) return departments.join(', ');
  const group = String(report.departmentGroup || '').trim();
  return group && !NCR_IGNORED_DEPARTMENT_GROUPS.has(normalizeNcr(group)) ? group : 'Unassigned';
};

const getNcrDepartmentGroupOptions = (currentValue = '') => {
  const value = String(currentValue || '').trim();
  return getDepartmentOptions(value);
};

const mergeNcrPrimaryGroup = (primaryGroup, affectedDepartments = []) => {
  const primary = sanitizeNcrDepartmentList([primaryGroup])[0] || '';
  const rest = sanitizeNcrDepartmentList(affectedDepartments).filter(item => item !== primary);
  return primary ? [primary, ...rest] : rest;
};

const getDefaultNcrDepartment = currentUser => {
  const department = sanitizeNcrDepartmentList([currentUser?.department])[0] || '';
  return NCR_DEPARTMENT_GROUPS.includes(department) ? department : '';
};

const toggleArrayValue = (items = [], value) => items.includes(value) ? items.filter(item => item !== value) : [...items, value];

const hasNcrEventType = (report = {}) => Boolean((report.eventTypes || []).length || String(report.eventType || '').trim());

const hasNcrCriticality = (report = {}) => Boolean(String(report.criticality || report.severity || '').trim());

const NCR_CREATE_REQUIRED_FIELDS = [{
  id: 'reportNumber',
  label: 'Report number',
  isPresent: report => Boolean(String(report.reportNumber || '').trim())
}, {
  id: 'reportDate',
  label: 'Report date',
  isPresent: report => Boolean(String(report.reportDate || '').trim())
}, {
  id: 'observer',
  label: 'Observer',
  isPresent: report => Boolean(String(report.observer || '').trim())
}, {
  id: 'author',
  label: 'Author',
  isPresent: report => Boolean(String(report.author || '').trim())
}, {
  id: 'mainDepartment',
  label: 'Main department',
  isPresent: report => OMP_DEPARTMENTS.includes(report.mainDepartment)
}, {
  id: 'primaryGroupAffected',
  label: 'Primary group affected',
  isPresent: report => Boolean(getNcrPrimaryGroupValue(report))
}, {
  id: 'eventType',
  label: 'Type of event',
  isPresent: hasNcrEventType
}, {
  id: 'criticality',
  label: 'Criticality',
  isPresent: hasNcrCriticality
}, {
  id: 'internalExternal',
  label: 'Internal / external',
  isPresent: report => Boolean(String(report.internalExternal || '').trim())
}, {
  id: 'worksiteArea',
  label: 'Worksite / area',
  isPresent: report => Boolean(String(report.worksiteArea || '').trim())
}, {
  id: 'operatorLocation',
  label: 'Operator and location',
  isPresent: report => Boolean(String(report.operatorLocation || '').trim())
}, {
  id: 'eventAt',
  label: 'Date and time event',
  isPresent: report => Boolean(String(report.eventAt || '').trim())
}, {
  id: 'eventDescription',
  label: 'Event description',
  isPresent: report => Boolean(String(report.eventDescription || '').trim())
}];

const getMissingNcrRequiredFields = (report = {}) => NCR_CREATE_REQUIRED_FIELDS.filter(field => !field.isPresent(report));

const isNcrRequiredFieldMissing = (report, fieldId) => getMissingNcrRequiredFields(report).some(field => field.id === fieldId);

const ncrRequiredFieldClass = (report, fieldId) => `ncr-required-field${isNcrRequiredFieldMissing(report, fieldId) ? ' ncr-required-missing' : ''}`;

const NcrRequiredLabel = ({
  children
}) => <span className="ncr-required-label">{children}<strong>Required</strong></span>;

const normalizeFailureText = (text = '') => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const classifyNcrFailure = (report = {}) => {
  const haystack = normalizeFailureText([report.eventDescription, report.eventType, report.rootCauseCodes, report.rootCauseAnalysis, report.affectedProduct, report.affectedEquipment, report.operatorLocation].join(' '));
  const matched = PROVISIONAL_FAILURE_CODES.find(code => code.aliases.some(alias => haystack.includes(normalizeFailureText(alias))));
  if (matched) {
    return {
      code: matched.code,
      label: matched.label,
      confidence: matched.code.includes('VALVE') || matched.code === 'HRU' ? 0.9 : 0.72,
      reason: 'Matched Tim provisional failure grouping.'
    };
  }
  const fallback = report.rootCauseCodes || report.eventType || 'Unclassified';
  return {
    code: normalizeFailureText(fallback).replace(/\s+/g, '_').toUpperCase().slice(0, 40) || 'UNCLASSIFIED',
    label: fallback,
    confidence: fallback === 'Unclassified' ? 0.25 : 0.55,
    reason: 'Needs Tim failure grouping review.'
  };
};

const buildNcrAnalytics = (reports = []) => {
  const activeReports = reports.filter(report => !report.closed && report.status !== 'closed');
  const closedReports = reports.filter(report => report.closed || report.status === 'closed');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addCount = (acc, key) => {
    const normalizedKey = String(key || '').trim() || 'Unspecified';
    acc[normalizedKey] = (acc[normalizedKey] || 0) + 1;
  };
  const groupCounts = getter => reports.reduce((acc, report) => {
    addCount(acc, getter(report));
    return acc;
  }, {});
  const groupCountsMulti = getter => reports.reduce((acc, report) => {
    const raw = getter(report);
    const values = Array.isArray(raw) ? raw : splitMultiValue(raw);
    if (!values.length) addCount(acc, 'Unspecified');
    values.forEach(value => addCount(acc, value));
    return acc;
  }, {});
  const bucketAmount = value => {
    const amount = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return 'No amount recorded';
    if (amount <= 1000) return '$1 - $1,000';
    if (amount <= 5000) return '$1,001 - $5,000';
    if (amount <= 10000) return '$5,001 - $10,000';
    return '$10,000+';
  };
  const sortCountEntries = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const failureCounts = reports.reduce((acc, report) => {
    const classification = classifyNcrFailure(report);
    acc[classification.label] = (acc[classification.label] || 0) + 1;
    return acc;
  }, {});
  const monthlyCounts = reports.reduce((acc, report) => {
    const key = String(report.reportDate || report.eventAt || report.createdAt || '').slice(0, 7) || 'No date';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    active: activeReports.length,
    closed: closedReports.length,
    pastDue: reports.filter(isNcrPastDue).length,
    critical: activeReports.filter(isNcrCritical).length,
    byDepartment: sortCountEntries(groupCountsMulti(getNcrDepartmentList)),
    byType: sortCountEntries(groupCounts(report => report.eventType)),
    byWorksite: sortCountEntries(groupCounts(report => report.worksiteArea)),
    byRootCause: sortCountEntries(groupCounts(report => report.rootCauseCodes)),
    byObserver: sortCountEntries(groupCounts(report => report.observer || report.author)),
    byEmployee: sortCountEntries(groupCountsMulti(report => report.personnelInvolved || report.author || report.observer)),
    byOperator: sortCountEntries(groupCounts(report => report.operatorLocation)),
    byEventDate: sortCountEntries(groupCounts(report => dateOnly(report.eventAt) || report.reportDate)),
    byInternalExternal: sortCountEntries(groupCounts(report => report.internalExternal)),
    byNpt: sortCountEntries(groupCounts(report => report.nonProductiveTime)),
    byNptAmount: sortCountEntries(groupCounts(report => bucketAmount(report.nonProductiveTimeAmount))),
    byMapLocation: sortCountEntries(groupCounts(report => report.operatorLocation || report.worksiteArea)),
    byFailure: sortCountEntries(failureCounts),
    byMonth: Object.entries(monthlyCounts).sort((a, b) => a[0].localeCompare(b[0])),
    aging: activeReports.map(report => ({
      report,
      days: Math.max(0, Math.floor((today - new Date(report.reportDate || report.createdAt || today)) / 86400000))
    })).sort((a, b) => b.days - a.days)
  };
};

const getNcrIssueSearchText = (report = {}) => normalizeFailureText([report.reportNumber, report.eventDescription, report.eventType, ...(report.eventTypes || []), report.rootCauseCodes, report.rootCauseAnalysis, report.immediateAction, report.permanentAction, report.affectedProduct, report.affectedEquipment, report.operatorLocation, report.worksiteArea, report.normalizedFailureSummary, classifyNcrFailure(report).label, JSON.stringify(report.sourceRawRecord || {})].join(' '));

const buildNcrIssueSearchGroups = (query = '') => {
  const stopWords = new Set(['a', 'an', 'and', 'are', 'by', 'common', 'different', 'for', 'group', 'grouping', 'groupings', 'how', 'issue', 'issues', 'look', 'looks', 'many', 'ncr', 'ncrs', 'of', 'on', 'or', 'report', 'reports', 'run', 'summarize', 'the', 'to', 'trend', 'trends', 'with', 'failure', 'failures']);
  const normalizedQuery = normalizeFailureText(query);
  const matchedAliasGroups = NCR_QUERY_ALIASES.filter(group => group.aliases.some(alias => normalizedQuery.includes(normalizeFailureText(alias)))).map(group => ({
    label: group.label,
    terms: group.aliases.map(normalizeFailureText)
  }));
  const aliasTerms = new Set(matchedAliasGroups.flatMap(group => group.terms.flatMap(term => term.split(' '))));
  const literalGroups = normalizedQuery.split(' ').map(token => token.trim()).filter(token => token.length > 1 && !stopWords.has(token) && !aliasTerms.has(token)).map(token => ({
    label: token,
    terms: [token]
  }));
  return [...matchedAliasGroups, ...literalGroups];
};

const buildNcrIssueExplorer = (reports = [], query = '') => {
  const searchGroups = buildNcrIssueSearchGroups(query);
  const matches = searchGroups.length ? reports.filter(report => {
    const haystack = getNcrIssueSearchText(report);
    return searchGroups.every(group => group.terms.some(term => haystack.includes(term)));
  }) : reports;
  const addCount = (acc, key) => {
    const normalizedKey = String(key || '').trim() || 'Unspecified';
    acc[normalizedKey] = (acc[normalizedKey] || 0) + 1;
  };
  const sortEntries = obj => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const failureCounts = {};
  const operatorCounts = {};
  const equipmentProcessCounts = {};
  const operatorFailureCounts = {};
  for (const report of matches) {
    const failureLabel = report.normalizedFailureSummary || classifyNcrFailure(report).label;
    const operator = report.operatorLocation || 'Unspecified operator';
    const equipmentProcess = report.affectedEquipment || report.affectedProduct || report.eventType || report.rootCauseCodes || 'Unspecified equipment/process';
    addCount(failureCounts, failureLabel);
    addCount(operatorCounts, operator);
    addCount(equipmentProcessCounts, equipmentProcess);
    const key = `${operator} -> ${failureLabel}`;
    addCount(operatorFailureCounts, key);
  }
  return {
    query: searchGroups.map(group => group.label).join(' '),
    searchGroups,
    matches,
    byFailure: sortEntries(failureCounts),
    byOperator: sortEntries(operatorCounts),
    byEquipmentProcess: sortEntries(equipmentProcessCounts),
    byOperatorFailure: sortEntries(operatorFailureCounts)
  };
};

const transformImportedNcrRow = (row = {}, index = 0, currentUser) => {
  const reportNumber = findFirstValue(row, ['Report #', 'Report Number', 'NCR #', 'NCR Number', 'ID', 'Response ID']) || `KPA-${Date.now()}-${index + 1}`;
  const eventDescription = findFirstValue(row, ['Event Description', 'Description', 'Event', 'Describe Event']);
  const eventTypes = splitMultiValue(findFirstValue(row, ['Type of Event', 'Event Type', 'Type']));
  const departments = sanitizeNcrDepartmentList(splitMultiValue(findFirstValue(row, ['What Departments does this affect?', 'Affected Departments', 'Department', 'Group'])));
  const rootCauseCodes = findFirstValue(row, ['Root Cause Codes', 'Root Cause Code', 'Root Cause']);
  const importedActionEffectiveRaw = findFirstValue(row, ['Has the Corrective/Preventative Action worked', 'Has Corrective/Preventative Action worked?', 'Action Effective', 'Effective?', 'Was action effective?']);
  const importedClosed = isImportedNcrClosedValue(findFirstValue(row, ['Closed', 'Status']));
  const followUpCount = Number(findFirstValue(row, ['Follow-Ups', 'Follow Ups', 'Follow-Up Count', 'Follow Up Count']));
  const followUpDetails = findFirstValue(row, ['Follow-Up Details', 'Follow Up Details']);
  const baseReport = {
    ...buildDefaultNcrDraft(currentUser),
    reportNumber,
    sourceSheet: 'KPA historical import',
    sourceLink: findFirstValue(row, ['Link', 'Source Link']),
    sourceSystem: 'KPA',
    sourceRecordId: reportNumber,
    reportDate: dateOnly(findFirstValue(row, ['Report Date', 'Date', 'Created Date', 'Submitted Date'])) || new Date().toISOString().slice(0, 10),
    observer: findFirstValue(row, ['Observer', 'Created By', 'Submitted By']) || currentUser?.name || '',
    followUpCount: Number.isFinite(followUpCount) ? followUpCount : 0,
    followUpDetails,
    worksiteArea: findFirstValue(row, ['Worksite/Area', 'Worksite Area', 'Area']),
    operatorLocation: findFirstValue(row, ['Operator and Location', 'Operator Location', 'Location', 'Customer Location']),
    eventAt: findFirstValue(row, ['Date and Time Event', 'Event Date', 'Event Time']),
    internalExternal: findFirstValue(row, ['Internal or External Report', 'Internal External']) || 'Internal',
    eventType: eventTypes[0] || findFirstValue(row, ['Type of Event', 'Event Type', 'Type']),
    eventTypes,
    nonProductiveTime: findFirstValue(row, ['Non-Productive Time', 'NPT']) || 'No',
    nonProductiveTimeAmount: findFirstValue(row, ['Non-Productive Time amount', 'NPT Amount', 'NPT Cost']),
    author: findFirstValue(row, ['Author of Report', 'Author']) || currentUser?.name || '',
    authorId: '',
    personnelInvolved: findFirstValue(row, ['Personnel Involved', 'Employees Involved']),
    eventDescription,
    severity: findFirstValue(row, ['Critical or Non-Critical', 'Criticality', 'Severity']) || 'Non-Critical',
    criticality: findFirstValue(row, ['Critical or Non-Critical', 'Criticality', 'Severity']) || 'Non-Critical',
    estimatedCost: findFirstValue(row, ['Estimated Cost', 'Cost']),
    rootCauseCodes,
    rootCauseAnalysis: findFirstValue(row, ['Root Cause Analysis', 'RCA']),
    immediateAction: findFirstValue(row, ['Immediate Corrective / Preventative Action', 'Immediate Corrective Action', 'Immediate Action']),
    timeFrameForAction: findFirstValue(row, ['Time Frame for Action', 'Timeframe']),
    permanentAction: findFirstValue(row, ['Permanent Corrective Action', 'Permanent Action']),
    affectedDepartments: departments.join(', '),
    affectedDepartmentList: departments,
    departmentGroup: departments[0] || sanitizeNcrDepartmentList([findFirstValue(row, ['Department', 'Group'])])[0] || 'Quality',
    // Main department (Jake's five divisions). Explicit column wins; otherwise
    // derived from the group when deterministic; otherwise the record lands in
    // the Dept triage queue — never guessed.
    mainDepartment: (() => {
      const explicit = findFirstValue(row, ['Main Department', 'Main Dept', 'Division']);
      if (OMP_DEPARTMENTS.includes(explicit)) return explicit;
      return getNcrGroupDepartment(explicit) || getNcrGroupDepartment(departments[0]) || '';
    })(),
    longTermFollowUp: findFirstValue(row, ['Long-Term Follow-Up', 'Long Term Follow Up']),
    actionEffective: importedActionEffectiveRaw,
    effectivenessSummary: findFirstValue(row, ['Effectiveness Verification', 'Verification of Effectiveness', 'Effectiveness Summary']),
    recurrencePrevented: ncrYesNoToBoolean(importedActionEffectiveRaw),
    dateInitialCorrectiveAction: dateOnly(findFirstValue(row, ['Date of Initial Corrective Action'])),
    datePermanentCorrectiveActionCompleted: dateOnly(findFirstValue(row, ['Date of Permanent Corrective Action Completed'])),
    dateOfReview: dateOnly(findFirstValue(row, ['Date of Review'])),
    dateOfSignOff: dateOnly(findFirstValue(row, ['Date of sign-off', 'Date of Sign Off'])),
    status: importedClosed ? 'closed' : 'open',
    lifecycleStage: importedClosed ? 'closed' : 'submitted',
    ownerId: '',
    sourceRawRecord: row
  };
  const classification = classifyNcrFailure(baseReport);
  return {
    ...baseReport,
    normalizedFailureSummary: classification.label,
    canonicalFailureCode: classification.code,
    aiConfidence: classification.confidence,
    aiClassificationReason: classification.reason
  };
};

// Trend Watch: deterministic auto-surfaced insights. No query, no API cost —
// recomputed from the scoped report set every time data changes.

// Trend Watch: deterministic auto-surfaced insights. No query, no API cost —
// recomputed from the scoped report set every time data changes.
const buildNcrTrendWatch = (reports = []) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ageDays = report => {
    const day = String(report.reportDate || '').slice(0, 10);
    if (!day) return null;
    const date = new Date(`${day}T12:00:00`);
    return Number.isFinite(date.getTime()) ? Math.floor((today - date) / 86400000) : null;
  };
  const failureLabel = report => report.normalizedFailureSummary || classifyNcrFailure(report).label;
  const isOpenReport = report => !report.closed && report.status !== 'closed';
  const insights = [];
  const last30 = {};
  const prior30 = {};
  const seenBefore = {};
  reports.forEach(report => {
    const age = ageDays(report);
    if (age === null) return;
    const label = failureLabel(report);
    if (age < 30) last30[label] = (last30[label] || 0) + 1;else {
      seenBefore[label] = (seenBefore[label] || 0) + 1;
      if (age < 60) prior30[label] = (prior30[label] || 0) + 1;
    }
  });
  Object.entries(last30).forEach(([label, count]) => {
    const before = prior30[label] || 0;
    if (count >= 3 && count >= before * 2) {
      insights.push({
        id: `rise-${label}`,
        severity: before === 0 || count >= before * 3 ? 'high' : 'watch',
        title: `${label} trending up`,
        detail: `${count} in the last 30 days vs ${before} in the prior 30.`,
        action: {
          type: 'explore',
          query: label
        },
        count
      });
    } else if (count >= 2 && before === 0 && !seenBefore[label]) {
      insights.push({
        id: `new-${label}`,
        severity: 'watch',
        title: `New failure group: ${label}`,
        detail: `${count} NCRs in the last 30 days — never recorded before.`,
        action: {
          type: 'explore',
          query: label
        },
        count
      });
    }
  });
  const operatorFailure = {};
  reports.forEach(report => {
    const age = ageDays(report);
    if (age === null || age >= 90) return;
    const operator = report.operatorLocation || '';
    if (!operator) return;
    const label = failureLabel(report);
    const key = `${operator}|${label}`;
    operatorFailure[key] = operatorFailure[key] || {
      operator,
      label,
      count: 0
    };
    operatorFailure[key].count += 1;
  });
  Object.values(operatorFailure).filter(item => item.count >= 3).sort((a, b) => b.count - a.count).slice(0, 3).forEach(item => insights.push({
    id: `combo-${item.operator}-${item.label}`,
    severity: 'high',
    title: `${item.operator}: repeat ${item.label.toLowerCase()}`,
    detail: `${item.count} at the same operator/location in the last 90 days.`,
    action: {
      type: 'explore',
      query: `${item.operator} ${item.label}`
    },
    count: item.count
  }));
  const stalling = reports.filter(report => isOpenReport(report) && (ageDays(report) ?? 0) > 45);
  if (stalling.length >= 3) {
    insights.push({
      id: 'stalling',
      severity: 'watch',
      title: `${stalling.length} open NCRs are older than 45 days`,
      detail: 'These are quietly stalling — review the oldest in the tracker.',
      action: {
        type: 'tracker',
        flag: 'past_due'
      },
      count: stalling.length
    });
  }
  const criticalByGroup = {};
  reports.forEach(report => {
    if (!isNcrCritical(report) || !isOpenReport(report)) return;
    const age = ageDays(report);
    if (age === null || age >= 30) return;
    const group = getNcrDepartmentValue(report) || 'Unspecified';
    criticalByGroup[group] = (criticalByGroup[group] || 0) + 1;
  });
  Object.entries(criticalByGroup).filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).forEach(([group, count]) => insights.push({
    id: `critical-${group}`,
    severity: 'high',
    title: `${count} critical NCRs opened in ${group} this month`,
    detail: 'A cluster of critical events in one group within 30 days.',
    action: {
      type: 'tracker',
      flag: 'critical'
    },
    count
  }));
  const nptByOperator = {};
  reports.forEach(report => {
    if (String(report.nonProductiveTime || '').toLowerCase() !== 'yes') return;
    const age = ageDays(report);
    if (age === null || age >= 90) return;
    const operator = report.operatorLocation || '';
    if (!operator) return;
    nptByOperator[operator] = (nptByOperator[operator] || 0) + 1;
  });
  Object.entries(nptByOperator).filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 2).forEach(([operator, count]) => insights.push({
    id: `npt-${operator}`,
    severity: 'watch',
    title: `Downtime concentrating at ${operator}`,
    detail: `${count} NPT-causing NCRs in the last 90 days.`,
    action: {
      type: 'explore',
      query: operator
    },
    count
  }));
  const severityRank = {
    high: 0,
    watch: 1,
    info: 2
  };
  return insights.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.count - a.count).slice(0, 8);
};

const isNcrCritical = report => normalizeNcr(report.severity).trim() === 'critical' || normalizeNcr(report.criticality).trim() === 'critical';

const isNcrDueSoon = report => {
  if (!report.followUpDueDate || report.closed) return false;
  const due = new Date(`${report.followUpDueDate}T12:00:00`);
  const now = new Date();
  return due >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && due < new Date(now.getTime() + 7 * 86400000);
};

const isNcrPastDue = report => {
  if (!report.followUpDueDate || report.closed) return false;
  return new Date(`${report.followUpDueDate}T23:59:59`) < new Date();
};

const NCR_SEQUENCE_FALLBACK_START = 82000001;

const getNcrReportSequenceParts = value => {
  const match = String(value || '').trim().match(/^(\d+)$/);
  if (!match) return null;
  return {
    number: Number(match[1]),
    width: match[1].length
  };
};

const getNextNcrReportNumber = (reports = []) => {
  const candidates = reports.map(report => getNcrReportSequenceParts(report?.reportNumber)).filter(parts => parts && Number.isSafeInteger(parts.number));
  if (!candidates.length) return String(NCR_SEQUENCE_FALLBACK_START);
  const latest = candidates.reduce((best, candidate) => candidate.number > best.number ? candidate : best, candidates[0]);
  return String(latest.number + 1).padStart(latest.width, '0');
};

const getNcrRootCauseValue = (report = {}) => String(report.rootCauseCodes || report.rootCauseAnalysis || '').trim();

const getNcrRootCauseOptions = (currentValue = '') => {
  const value = String(currentValue || '').trim();
  return value && !NCR_ROOT_CAUSE_CODES.includes(value) ? [value, ...NCR_ROOT_CAUSE_CODES] : NCR_ROOT_CAUSE_CODES;
};

const buildDefaultNcrDraft = (currentUser, reports = []) => {
  const defaultDepartment = getDefaultNcrDepartment(currentUser);
  return {
    reportNumber: getNextNcrReportNumber(reports),
    sourceSheet: '',
    sourceLink: '',
    reportDate: new Date().toISOString().slice(0, 10),
    observer: currentUser?.name || '',
    followUpCount: 0,
    followUpDetails: '',
    followUpDueDate: '',
    worksiteArea: '',
    operatorLocation: '',
    eventAt: '',
    internalExternal: 'Internal',
    eventType: '',
    eventTypes: [],
    nonProductiveTime: 'No',
    nonProductiveTimeAmount: '',
    estimatedCost: '',
    author: currentUser?.name || '',
    authorId: currentUser?.id || '',
    personnelInvolved: '',
    personnelInvolvedIds: [],
    eventDescription: '',
    severity: 'Non-Critical',
    criticality: 'Non-Critical',
    rootCauseCodes: '',
    rootCauseAnalysis: '',
    immediateAction: '',
    timeFrameForAction: '',
    permanentAction: '',
    affectedDepartments: defaultDepartment,
    affectedDepartmentList: defaultDepartment ? [defaultDepartment] : [],
    departmentGroup: defaultDepartment,
    mainDepartment: getNcrGroupDepartment(defaultDepartment) || '',
    longTermFollowUp: '',
    actionEffective: '',
    dateInitialCorrectiveAction: '',
    datePermanentCorrectiveActionCompleted: '',
    dateOfReview: '',
    dateOfSignOff: '',
    signedOffByManagementId: '',
    reviewedById: '',
    finalManagementSignoffId: '',
    sourceSystem: 'OMP',
    sourceRecordId: '',
    sourceBatchId: '',
    sourceRawRecord: {},
    canonicalFailureCode: '',
    normalizedFailureSummary: '',
    aiConfidence: '',
    aiClassificationReason: '',
    lifecycleStage: 'draft',
    ownerId: currentUser?.id || '',
    reviewerId: '',
    verifierId: '',
    containmentRequired: false,
    containmentSummary: '',
    affectedProduct: '',
    affectedEquipment: '',
    affectedJob: '',
    disposition: '',
    dispositionNotes: '',
    effectivenessSummary: '',
    effectivenessCheckedAt: null,
    effectivenessCheckedBy: '',
    recurrencePrevented: '',
    repeatIssue: '',
    customerApprovalRequired: false,
    customerApprovalStatus: '',
    status: 'open'
  };
};

const NcrBreakdownCard = ({
  icon: Icon,
  title,
  rows = []
}) => {
  const max = Math.max(1, ...rows.map(([, count]) => count));
  return <div className="card ncr-breakdown-card">
      <div className="ncr-breakdown-head"><Icon size={15} color="var(--brand)" /><h3>{title}</h3></div>
      <div className="ncr-breakdown-list">
        {rows.slice(0, 8).map(([label, count]) => <div key={label} className="ncr-breakdown-row">
            <div className="ncr-breakdown-row-label">
              <span>{label}</span>
              <small><i style={{
              width: `${Math.max(8, count / max * 100)}%`
            }} /></small>
            </div>
            <strong>{count}</strong>
          </div>)}
        {rows.length === 0 && <p className="text-xs text-muted">No data yet.</p>}
      </div>
    </div>;
};

const isNcrImageAttachment = (file = {}) => String(file.mimeType || file.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(String(file.name || file.url || ''));

const NCR_PHOTO_ACCEPT = 'image/*,.heic,.heif';

const NCR_DOCUMENT_ACCEPT = ['application/pdf', 'text/*', '.txt', '.md', '.csv', '.json', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip'].join(',');

const NCR_EVIDENCE_ACCEPT = `${NCR_PHOTO_ACCEPT},${NCR_DOCUMENT_ACCEPT}`;

const isNcrEvidenceAttachment = (file = {}) => isNcrImageAttachment(file) || /^(application\/pdf|text\/|application\/json)/i.test(String(file.mimeType || file.type || '')) || /(word|document|excel|spreadsheet|powerpoint|presentation|csv|zip)/i.test(String(file.mimeType || file.type || '')) || /\.(pdf|txt|md|csv|json|docx?|xlsx?|pptx?|zip)$/i.test(String(file.name || file.url || ''));

const NCR_DEPARTMENT_MANAGER_SIGNATURE_ROLES = ['department_manager', 'management'];

const NCR_EXECUTIVE_SIGNATURE_ROLES = ['executive', 'final_management'];

const NCR_SIGNATURE_ROLE_LABELS = {
  author: 'Author signoff',
  department_manager: 'Department manager signoff',
  management: 'Department manager signoff',
  reviewer: 'Reviewer signoff',
  executive: 'Senior management agreement',
  final_management: 'Senior management agreement'
};

const getNcrSignatureRoleLabel = (role = '') => NCR_SIGNATURE_ROLE_LABELS[role] || String(role || 'Signature').replaceAll('_', ' ');

const hasNcrSignatureRole = (signatures = [], roles = []) => signatures.some(signature => roles.includes(signature.role));

const getNcrClosureBlockers = report => {
  if (!report) return ['Select an NCR first.'];
  const openActions = (report.actionItems || []).filter(action => action.status !== 'complete');
  const signatures = report.signatures || [];
  const actionEffective = normalizeNcrYesNo(report.actionEffective);
  return [
    ...getMissingNcrRequiredFields(report).map(field => `${field.label} is required.`),
    !report.ownerId && 'NCR owner is required.',
    !report.reviewerId && 'Reviewer / approver is required.',
    !report.verifierId && 'Effectiveness verifier is required.',
    !report.rootCauseAnalysis?.trim() && !report.rootCauseCodes?.trim() && 'Root cause analysis or code is required.',
    !report.permanentAction?.trim() && 'Permanent corrective action is required.',
    openActions.length > 0 && `${openActions.length} corrective action item${openActions.length === 1 ? '' : 's'} still open.`,
    !actionEffective && 'Action effective yes/no decision is required.',
    actionEffective === 'No' && 'Action is marked not effective; revise the corrective action before closure.',
    !report.effectivenessSummary?.trim() && 'Effectiveness verification summary is required.',
    !hasNcrSignatureRole(signatures, NCR_DEPARTMENT_MANAGER_SIGNATURE_ROLES) && 'Department manager signoff is required.',
    !hasNcrSignatureRole(signatures, NCR_EXECUTIVE_SIGNATURE_ROLES) && 'Senior management review and agreement is required.'
  ].filter(Boolean);
};

const isNcrClosedReport = report => Boolean(report?.closed || report?.status === 'closed');

const isNcrReadyForClosure = report => !isNcrClosedReport(report) && getNcrClosureBlockers(report).length === 0;

const getNcrSignatureForRoles = (signatures = [], roles = []) => signatures.find(signature => roles.includes(signature.role)) || null;

const normalizeNcrEvidenceFile = (file, index = 0) => {
  if (file?.name) return file;
  const extension = extensionForMime(file?.type || '');
  return new globalThis.File([file], `ncr-evidence-${Date.now()}-${index + 1}.${extension === 'bin' ? 'jpg' : extension}`, {
    type: file?.type || 'application/octet-stream',
    lastModified: Date.now()
  });
};

const formatNcrPhotoFileSize = (bytes = 0) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getNcrImageFiles = (report = {}) => (report.attachments || []).filter(isNcrImageAttachment);

const getNcrDocumentFiles = (report = {}) => (report.attachments || []).filter(file => !isNcrImageAttachment(file));

const getNcrAttachmentPurpose = (file = {}) => isNcrImageAttachment(file) ? 'pictures' : 'evidence';

const NcrEventPhotoStrip = ({
  report,
  onUpload,
  uploading
}) => {
  const imageFiles = getNcrImageFiles(report);
  const documentFiles = getNcrDocumentFiles(report);
  return <div className={`ncr-event-photos ${imageFiles.length === 0 && documentFiles.length === 0 ? 'empty' : ''}`}>
      <div className="ncr-event-photos-head">
        <div>
          <strong>Event photos + docs</strong>
          <span>
            {imageFiles.length ? `${imageFiles.length} picture${imageFiles.length === 1 ? '' : 's'}` : 'No pictures'}
            {` · `}
            {documentFiles.length ? `${documentFiles.length} doc${documentFiles.length === 1 ? '' : 's'}` : 'No docs'}
          </span>
        </div>
        <div className="ncr-event-photo-actions">
          <label className="btn btn-secondary btn-xs ncr-event-photo-add">
            <Image size={12} /> {uploading ? 'Uploading...' : 'Add photos'}
            <input type="file" accept={NCR_PHOTO_ACCEPT} capture="environment" multiple onChange={event => onUpload?.(event, 'pictures')} disabled={uploading} hidden />
          </label>
          <label className="btn btn-secondary btn-xs ncr-event-photo-add">
            <Paperclip size={12} /> {uploading ? 'Uploading...' : 'Add docs'}
            <input type="file" accept={NCR_DOCUMENT_ACCEPT} multiple onChange={event => onUpload?.(event, 'evidence')} disabled={uploading} hidden />
          </label>
        </div>
      </div>
      {imageFiles.length > 0 ? <div className="ncr-event-photo-grid">
          {imageFiles.slice(0, 4).map(file => <a key={file.id || file.url || file.name} href={file.url} target="_blank" rel="noreferrer" className="ncr-event-photo-thumb" aria-label={`Open ${file.name || 'NCR event photo'}`}>
              <img src={file.url} alt={file.name || 'NCR event photo'} loading="lazy" />
              <span>{file.name || 'NCR photo'}</span>
            </a>)}
          {imageFiles.length > 4 && <span className="ncr-event-photo-more">+{imageFiles.length - 4}</span>}
        </div> : <div className="ncr-event-photo-empty">
          <Camera size={14} />
          <span>No event photos yet.</span>
        </div>}
      {documentFiles.length > 0 && <div className="ncr-event-doc-list">
          {documentFiles.slice(0, 4).map(file => <a key={file.id || file.url || file.name} href={file.url} target="_blank" rel="noreferrer" className="ncr-event-doc-file">
              <Paperclip size={12} /> <span>{file.name || 'Supporting document'}</span>
            </a>)}
          {documentFiles.length > 4 && <span className="ncr-event-doc-more">+{documentFiles.length - 4} more</span>}
        </div>}
    </div>;
};

const NcrEvidencePanel = ({
  report,
  onUpload,
  uploading
}) => {
  const files = report?.attachments || [];
  const imageFiles = getNcrImageFiles(report);
  return <div className="ncr-section ncr-evidence-section">
      <h3>Photos + Documentation</h3>
      {imageFiles.length > 0 && <div className="ncr-image-strip">
          {imageFiles.slice(0, 6).map(file => <a key={file.id || file.url || file.name} href={file.url} target="_blank" rel="noreferrer" className="ncr-image-evidence" aria-label={`Open ${file.name}`}>
              <img src={file.url} alt={file.name || 'NCR evidence'} loading="lazy" />
              <span>{file.name || 'NCR image'}</span>
            </a>)}
        </div>}
      <div className="ncr-evidence-list">
        {files.map(file => <a key={file.id || file.url || file.name} href={file.url} target="_blank" rel="noreferrer" className="ncr-evidence-file">
            <Paperclip size={13} /> {file.name} <small>{file.size || file.purpose || ''}</small>
          </a>)}
        {files.length === 0 && <p>No NCR evidence uploaded yet.</p>}
      </div>
      <div className="ncr-evidence-buttons">
        {NCR_EVIDENCE_PURPOSES.map(purpose => <label key={purpose} className="btn btn-secondary btn-xs ncr-upload-button">
            <Upload size={12} /> {uploading ? 'Uploading...' : purpose.replaceAll('_', ' ')}
            <input type="file" accept={purpose === 'pictures' ? NCR_PHOTO_ACCEPT : NCR_EVIDENCE_ACCEPT} capture={purpose === 'pictures' ? 'environment' : undefined} multiple onChange={event => onUpload?.(event, purpose)} disabled={uploading} hidden />
          </label>)}
      </div>
    </div>;
};

const NcrSignatureLevels = ({
  report,
  people = []
}) => {
  const signatures = report?.signatures || [];
  const levels = [{
    key: 'department_manager',
    label: 'Department manager signoff',
    roles: NCR_DEPARTMENT_MANAGER_SIGNATURE_ROLES,
    fallbackId: report?.signedOffByManagementId
  }, {
    key: 'executive',
    label: 'Senior management agreement',
    roles: NCR_EXECUTIVE_SIGNATURE_ROLES,
    fallbackId: report?.finalManagementSignoffId
  }];
  return <div className="ncr-signature-levels">
      {levels.map(level => {
      const signature = getNcrSignatureForRoles(signatures, level.roles);
      const fallbackPerson = people.find(person => person.id === level.fallbackId);
      const signedBy = signature?.signedByName || people.find(person => person.id === signature?.signedBy)?.name || fallbackPerson?.name || '';
      const signedAt = signature?.signedAt || '';
      return <div key={level.key} className={`ncr-signature-level ${signature || fallbackPerson ? 'complete' : ''}`}>
            <div>
              <strong>{level.label}</strong>
              <span>{signedBy ? `${signedBy}${signedAt ? ` · ${formatDate(signedAt)}` : ''}` : 'Pending'}</span>
            </div>
            <Badge color={signature || fallbackPerson ? 'var(--success)' : 'var(--accent-7)'}>
              {signature || fallbackPerson ? 'Signed' : 'Needed'}
            </Badge>
          </div>;
    })}
    </div>;
};

const NcrParticipationCard = ({
  observerRows = [],
  employeeRows = []
}) => {
  const renderRows = rows => <div className="ncr-participation-list">
      {rows.slice(0, 10).map(([label, count], index) => <div key={`${label}-${index}`} className="ncr-participation-row">
          <span>{index + 1}</span>
          <strong>{label}</strong>
          <em>{count}</em>
        </div>)}
      {rows.length === 0 && <p className="text-xs text-muted">No data yet.</p>}
    </div>;
  return <div className="card ncr-breakdown-card ncr-participation-card">
      <div className="ncr-breakdown-head"><Users size={15} color="var(--brand)" /><h3>Participation Ranking</h3></div>
      <div className="ncr-participation-grid">
        <div>
          <div className="ncr-participation-label"><DefinedTerm id="observer">Observers</DefinedTerm></div>
          {renderRows(observerRows)}
        </div>
        <div>
          <div className="ncr-participation-label"><DefinedTerm id="personnel_involved">Employees named</DefinedTerm></div>
          {renderRows(employeeRows)}
        </div>
      </div>
    </div>;
};

// Reusable guided export chooser: one button → pick a described report → pick a
// format → generate. Each report states exactly what it includes. Shared so the
// export experience is identical across the app.

// Reusable guided export chooser: one button → pick a described report → pick a
// format → generate. Each report states exactly what it includes. Shared so the
// export experience is identical across the app.
const ExportMenu = ({
  reports = [],
  onExport,
  label = 'Export',
  align = 'right'
}) => {
  const [open, setOpen] = useState(false);
  const [reportId, setReportId] = useState(reports[0]?.id);
  const [format, setFormat] = useState(reports[0]?.formats?.[0] || 'pdf');
  if (!reports.length) return null;
  const current = reports.find(r => r.id === reportId) || reports[0];
  const effFmt = current.formats.includes(format) ? format : current.formats[0];
  const fmtLabel = f => f === 'excel' ? 'Excel' : f.toUpperCase();
  return <div style={{
    position: 'relative',
    display: 'inline-block'
  }}>
      <button type="button" className="btn btn-xs btn-secondary" onClick={() => setOpen(o => !o)}><Download size={12} /> {label}</button>
      {open && <>
          <div onClick={() => setOpen(false)} style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60
      }} />
          <div style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        [align]: 0,
        zIndex: 61,
        width: 320,
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 12,
        boxShadow: '0 10px 28px rgba(0,0,0,0.22)'
      }}>
            <div style={{
          fontWeight: 700,
          fontSize: 13,
          color: 'var(--text)'
        }}>Export a report</div>
            <div style={{
          fontSize: 11.5,
          color: 'var(--text-muted)',
          margin: '1px 0 9px'
        }}>Pick what you want, then the format.</div>
            <div style={{
          display: 'grid',
          gap: 6
        }}>
              {reports.map(r => <button key={r.id} type="button" onClick={() => setReportId(r.id)} style={{
            textAlign: 'left',
            padding: '8px 10px',
            borderRadius: 8,
            cursor: 'pointer',
            background: current.id === r.id ? 'var(--brand-bg)' : 'transparent',
            border: `1px solid ${current.id === r.id ? 'var(--brand)' : 'var(--border)'}`
          }}>
                  <div style={{
              fontWeight: 600,
              fontSize: 12.5,
              color: 'var(--text)'
            }}>{r.label}</div>
                  <div style={{
              fontSize: 11,
              color: 'var(--text-muted)'
            }}>{r.desc}</div>
                  {r.count != null && <div style={{
              fontSize: 10.5,
              color: 'var(--brand)',
              marginTop: 2
            }}>{r.count} {r.unit || ''}</div>}
                </button>)}
            </div>
            <div style={{
          display: 'flex',
          gap: 6,
          margin: '10px 0 9px'
        }}>
              {['pdf', 'excel', 'csv'].map(f => {
            const ok = current.formats.includes(f);
            const active = effFmt === f;
            return <button key={f} type="button" disabled={!ok} onClick={() => setFormat(f)} style={{
              flex: 1,
              padding: '6px 0',
              borderRadius: 7,
              fontSize: 11.5,
              fontWeight: 600,
              textTransform: 'uppercase',
              cursor: ok ? 'pointer' : 'not-allowed',
              opacity: ok ? 1 : 0.35,
              color: active ? '#fff' : 'var(--text)',
              background: active ? 'var(--brand)' : 'transparent',
              border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`
            }}>{fmtLabel(f)}</button>;
          })}
            </div>
            <button type="button" className="btn btn-sm btn-primary" style={{
          width: '100%'
        }} onClick={() => {
          onExport?.(current.id, effFmt);
          setOpen(false);
        }}>Generate {fmtLabel(effFmt)}</button>
          </div>
        </>}
    </div>;
};

// Legacy department triage: software suggests, a human approves — never
// auto-assigns (Jake: "channel, don't interpret"). Approving writes
// main_department; the legacy department_group label is left untouched.

// Legacy department triage: software suggests, a human approves — never
// auto-assigns (Jake: "channel, don't interpret"). Approving writes
// main_department; the legacy department_group label is left untouched.
const NcrTriagePanel = ({
  reports,
  currentUser,
  onUpdateReport,
  addToast
}) => {
  const [overrides, setOverrides] = useState({});
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const rows = useMemo(() => {
    const ranked = {
      high: 0,
      medium: 1,
      low: 2,
      none: 3
    };
    return reports.map(report => ({
      report,
      suggestion: suggestNcrDepartment(report)
    })).sort((a, b) => ranked[a.suggestion?.confidence || 'none'] - ranked[b.suggestion?.confidence || 'none'] || String(a.report.reportNumber || '').localeCompare(String(b.report.reportNumber || '')));
  }, [reports]);
  const highRows = rows.filter(({
    report,
    suggestion
  }) => suggestion?.confidence === 'high' && !overrides[report.id]);
  const assign = async (report, department) => {
    if (!department) return;
    setBusyIds(prev => new Set(prev).add(report.id));
    try {
      await onUpdateReport(report.id, {
        mainDepartment: department,
        updatedBy: currentUser?.id
      });
    } catch (err) {
      addToast?.({
        type: 'error',
        message: err?.message || 'Could not save department.'
      });
    } finally {
      setBusyIds(prev => {
        const next = new Set(prev);
        next.delete(report.id);
        return next;
      });
    }
  };
  const approveAllHigh = async () => {
    setBulkBusy(true);
    let done = 0;
    for (const {
      report,
      suggestion
    } of highRows) {
      try {
        await onUpdateReport(report.id, {
          mainDepartment: suggestion.department,
          updatedBy: currentUser?.id
        });
        done += 1;
      } catch {/* keep going; row stays in the queue */}
    }
    setBulkBusy(false);
    addToast?.({
      type: 'success',
      message: `${done} NCR${done === 1 ? '' : 's'} assigned.`
    });
  };
  if (!reports.length) {
    return <div className="card" style={{
      padding: 24,
      textAlign: 'center'
    }}>
        <h3 style={{
        margin: '0 0 6px'
      }}>All caught up</h3>
        <p className="text-sm text-muted" style={{
        margin: 0
      }}>Every NCR has a main department. New NCRs require one at creation.</p>
      </div>;
  }
  return <div className="card ncr-triage-card">
      <div className="ncr-triage-head">
        <div>
          <h3 style={{
          margin: 0
        }}>Legacy department triage</h3>
          <p className="text-sm text-muted" style={{
          margin: '4px 0 0'
        }}>
            {reports.length} older NCR{reports.length === 1 ? '' : 's'} predate the five-department framework. The suggestion is read from the record's own text — confirm it, or pick the right department. Nothing is assigned without a human click.
          </p>
        </div>
        {highRows.length > 0 && <button type="button" className="btn btn-primary" disabled={bulkBusy} onClick={approveAllHigh}>
            {bulkBusy ? 'Assigning…' : `Approve ${highRows.length} high-confidence`}
          </button>}
      </div>
      <div className="ncr-triage-list">
        {rows.map(({
        report,
        suggestion
      }) => {
        const chosen = overrides[report.id] ?? suggestion?.department ?? '';
        const busy = busyIds.has(report.id);
        return <div key={report.id} className="ncr-triage-row">
              <div className="ncr-triage-info">
                <div className="text-md font-medium truncate">
                  {report.reportNumber ? `#${report.reportNumber} — ` : ''}{(report.eventDescription || report.normalizedFailureSummary || 'No description').slice(0, 110)}
                </div>
                <div className="text-xs text-muted">
                  Legacy group: {report.departmentGroup || '—'}
                  {suggestion ? <> · Suggests <strong>{suggestion.department}</strong> ({suggestion.confidence}) — {suggestion.reason}</> : <> · No signal in the record — needs a human read</>}
                </div>
              </div>
              <select value={chosen} onChange={e => setOverrides(prev => ({
            ...prev,
            [report.id]: e.target.value
          }))}>
                <option value="">Pick department…</option>
                {OMP_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!chosen || busy} onClick={() => assign(report, chosen)}>
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>;
      })}
      </div>
    </div>;
};

const toNcrCloseoutDateTime = value => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const buildNcrCloseoutDraft = report => ({
  reportDate: report.reportDate || '',
  observer: report.observer || '',
  author: report.author || '',
  worksiteArea: report.worksiteArea || '',
  operatorLocation: report.operatorLocation || '',
  eventAt: toNcrCloseoutDateTime(report.eventAt),
  internalExternal: report.internalExternal || '',
  criticality: report.criticality || report.severity || '',
  eventType: report.eventType || report.eventTypes?.[0] || '',
  eventDescription: report.eventDescription || '',
  departmentGroup: getNcrPrimaryGroupValue(report),
  followUpDetails: report.followUpDetails || '',
  followUpDueDate: report.followUpDueDate || '',
  rootCauseCodes: report.rootCauseCodes || '',
  rootCauseAnalysis: report.rootCauseAnalysis || '',
  immediateAction: report.immediateAction || '',
  permanentAction: report.permanentAction || '',
  actionEffective: normalizeNcrYesNo(report.actionEffective),
  effectivenessSummary: report.effectivenessSummary || '',
  ownerId: report.ownerId || '',
  reviewerId: report.reviewerId || '',
  verifierId: report.verifierId || '',
  dateOfReview: report.dateOfReview || '',
  dateOfSignOff: report.dateOfSignOff || ''
});

const buildNcrCloseoutPatch = (report, draft, currentUser) => {
  const eventAtDate = draft.eventAt ? new Date(draft.eventAt) : null;
  const actionEffective = normalizeNcrYesNo(draft.actionEffective);
  let lifecycleStage = report.lifecycleStage || 'submitted';
  if (actionEffective) lifecycleStage = 'effectiveness_check';
  else if (draft.permanentAction.trim()) lifecycleStage = 'corrective_action';
  else if (draft.rootCauseAnalysis.trim() || draft.rootCauseCodes.trim()) lifecycleStage = 'root_cause';
  const affectedDepartmentList = mergeNcrPrimaryGroup(draft.departmentGroup, getNcrDepartmentList(report));
  return {
    reportDate: draft.reportDate || null,
    observer: draft.observer.trim(),
    author: draft.author.trim(),
    worksiteArea: draft.worksiteArea,
    operatorLocation: draft.operatorLocation.trim(),
    eventAt: eventAtDate && !Number.isNaN(eventAtDate.getTime()) ? eventAtDate.toISOString() : null,
    internalExternal: draft.internalExternal,
    criticality: draft.criticality,
    severity: draft.criticality,
    eventType: draft.eventType,
    eventTypes: draft.eventType ? [draft.eventType] : [],
    eventDescription: draft.eventDescription.trim(),
    departmentGroup: draft.departmentGroup,
    affectedDepartments: affectedDepartmentList.join(', '),
    affectedDepartmentList,
    followUpDetails: draft.followUpDetails.trim(),
    followUpDueDate: draft.followUpDueDate || null,
    rootCauseCodes: draft.rootCauseCodes.trim(),
    rootCauseAnalysis: draft.rootCauseAnalysis.trim(),
    immediateAction: draft.immediateAction.trim(),
    permanentAction: draft.permanentAction.trim(),
    actionEffective,
    recurrencePrevented: ncrYesNoToBoolean(actionEffective),
    effectivenessSummary: draft.effectivenessSummary.trim(),
    effectivenessCheckedAt: actionEffective ? report.effectivenessCheckedAt || new Date().toISOString() : null,
    effectivenessCheckedBy: actionEffective ? currentUser.id : '',
    ownerId: draft.ownerId,
    reviewerId: draft.reviewerId,
    verifierId: draft.verifierId,
    dateOfReview: draft.dateOfReview || null,
    dateOfSignOff: draft.dateOfSignOff || null,
    lifecycleStage,
    status: report.closed ? 'closed' : 'in_progress',
    auditNote: 'Updated from NCR Closeout Report'
  };
};

const NcrCloseoutReport = ({
  reports = [],
  currentUser,
  people = [],
  onUpdateReport,
  onUpdateActionItem,
  onCaptureSignature,
  onOpenTracker,
  addToast
}) => {
  const [scope, setScope] = useState('open');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState('');
  const summary = useMemo(() => ({
    open: reports.filter(report => !isNcrClosedReport(report)).length,
    ready: reports.filter(isNcrReadyForClosure).length,
    needsData: reports.filter(report => !isNcrClosedReport(report) && !isNcrReadyForClosure(report)).length,
    closed: reports.filter(isNcrClosedReport).length
  }), [reports]);
  const visibleReports = useMemo(() => reports.filter(report => {
    if (scope === 'open' && isNcrClosedReport(report)) return false;
    if (scope === 'ready' && !isNcrReadyForClosure(report)) return false;
    if (scope === 'needs_data' && (isNcrClosedReport(report) || isNcrReadyForClosure(report))) return false;
    if (scope === 'closed' && !isNcrClosedReport(report)) return false;
    if (!search.trim()) return true;
    const haystack = normalizeNcr([
      report.reportNumber,
      report.reportDate,
      report.observer,
      report.author,
      report.eventDescription,
      report.operatorLocation,
      getNcrDepartmentValue(report),
      report.rootCauseCodes,
      report.rootCauseAnalysis,
      report.permanentAction
    ].join(' '));
    return haystack.includes(normalizeNcr(search));
  }).sort((a, b) => String(b.reportDate || '').localeCompare(String(a.reportDate || '')) || String(b.reportNumber || '').localeCompare(String(a.reportNumber || ''), undefined, { numeric: true })), [reports, scope, search]);
  const selectedReport = reports.find(report => report.id === selectedId) || null;
  const previewReport = selectedReport && draft ? {
    ...selectedReport,
    ...draft,
    eventTypes: draft.eventType ? [draft.eventType] : [],
    affectedDepartmentList: mergeNcrPrimaryGroup(draft.departmentGroup, getNcrDepartmentList(selectedReport))
  } : selectedReport;
  const previewBlockers = previewReport ? getNcrClosureBlockers(previewReport) : [];
  const managerSigned = selectedReport ? hasNcrSignatureRole(selectedReport.signatures || [], NCR_DEPARTMENT_MANAGER_SIGNATURE_ROLES) : false;
  const executiveSigned = selectedReport ? hasNcrSignatureRole(selectedReport.signatures || [], NCR_EXECUTIVE_SIGNATURE_ROLES) : false;
  const canManagerSign = ['manager', 'executive'].includes(currentUser?.role);
  const canExecutiveSign = currentUser?.role === 'executive';

  useEffect(() => {
    if (!selectedReport || dirty) return;
    setDraft(buildNcrCloseoutDraft(selectedReport));
  }, [selectedReport, dirty]);

  const beginReview = report => {
    if (dirty && report.id !== selectedId) {
      addToast?.({ type: 'warning', message: 'Save or discard the current closeout row before opening another NCR.' });
      return;
    }
    if (report.id === selectedId) {
      if (dirty) {
        addToast?.({ type: 'warning', message: 'Save or discard your closeout changes before collapsing this row.' });
        return;
      }
      setSelectedId(null);
      setDraft(null);
      return;
    }
    setSelectedId(report.id);
    setDraft(buildNcrCloseoutDraft(report));
    setDirty(false);
  };
  const setField = (field, value) => {
    setDraft(previous => ({ ...previous, [field]: value }));
    setDirty(true);
  };
  const discardChanges = () => {
    if (!selectedReport) return;
    setDraft(buildNcrCloseoutDraft(selectedReport));
    setDirty(false);
  };
  const saveRow = async () => {
    if (!selectedReport || !draft || !onUpdateReport) return;
    setPending('save');
    try {
      await onUpdateReport(selectedReport.id, {
        ...buildNcrCloseoutPatch(selectedReport, draft, currentUser),
        updatedBy: currentUser.id
      });
      setDirty(false);
      addToast?.({ type: 'success', message: `NCR #${selectedReport.reportNumber} closeout row saved` });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not save the NCR closeout row.' });
    } finally {
      setPending('');
    }
  };
  const closeRow = async () => {
    if (!selectedReport || !onUpdateReport) return;
    if (dirty) {
      addToast?.({ type: 'warning', message: 'Save this row before approving closure.' });
      return;
    }
    const blockers = getNcrClosureBlockers(selectedReport);
    if (blockers.length) {
      addToast?.({ type: 'error', message: `Cannot close NCR yet: ${blockers[0]}` });
      return;
    }
    setPending('close');
    try {
      await onUpdateReport(selectedReport.id, {
        closed: true,
        status: 'closed',
        lifecycleStage: 'closed',
        closureApprovedBy: currentUser.id,
        closureApprovedAt: new Date().toISOString(),
        dateOfSignOff: selectedReport.dateOfSignOff || new Date().toISOString().slice(0, 10),
        updatedBy: currentUser.id,
        auditNote: 'Closure approved from NCR Closeout Report after all gates passed'
      });
      addToast?.({ type: 'success', message: `NCR #${selectedReport.reportNumber} closed from the report` });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not close the NCR.' });
    } finally {
      setPending('');
    }
  };
  const captureCloseoutSignoff = async role => {
    if (!selectedReport || !onCaptureSignature) return;
    setPending(`sign-${role}`);
    try {
      await onCaptureSignature(selectedReport.id, {
        role,
        signedBy: currentUser.id,
        signedByName: currentUser.name,
        signedAt: new Date().toISOString()
      }, currentUser.id);
      addToast?.({ type: 'success', message: `${getNcrSignatureRoleLabel(role)} captured for NCR #${selectedReport.reportNumber}` });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not capture the NCR signoff.' });
    } finally {
      setPending('');
    }
  };
  const completeAction = async action => {
    if (!onUpdateActionItem || action.status === 'complete') return;
    setPending(`action-${action.id}`);
    try {
      await onUpdateActionItem(action.id, { status: 'complete' }, currentUser.id);
      addToast?.({ type: 'success', message: `Corrective action completed for NCR #${selectedReport.reportNumber}` });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not complete the corrective action.' });
    } finally {
      setPending('');
    }
  };

  return <div className="ncr-closeout-page">
    <div className="ncr-closeout-intro card">
      <div>
        <span className="ncr-closeout-kicker"><ClipboardCheck size={14} /> Work directly from the report</span>
        <h2>NCR Closeout Report</h2>
        <p>Review the KPA-style list, enter missing closeout data, complete actions and signoffs, then close the NCR from the same row.</p>
      </div>
      <div className="ncr-closeout-summary" aria-label="NCR closeout summary">
        <button type="button" className={scope === 'open' ? 'active' : ''} onClick={() => setScope('open')}><strong>{summary.open}</strong><span>Open</span></button>
        <button type="button" className={scope === 'ready' ? 'active' : ''} onClick={() => setScope('ready')}><strong>{summary.ready}</strong><span>Ready</span></button>
        <button type="button" className={scope === 'needs_data' ? 'active' : ''} onClick={() => setScope('needs_data')}><strong>{summary.needsData}</strong><span>Needs data</span></button>
        <button type="button" className={scope === 'closed' ? 'active' : ''} onClick={() => setScope('closed')}><strong>{summary.closed}</strong><span>Closed</span></button>
      </div>
    </div>
    <div className="ncr-closeout-toolbar card">
      <div className="ncr-closeout-search">
        <Search size={15} />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search report number, event, location, department, or root cause..." aria-label="Search NCR closeout report" />
      </div>
      <span>Showing <strong>{visibleReports.length}</strong> of {reports.length} NCRs</span>
    </div>
    <div className="ncr-closeout-table-wrap card">
      <table className="ncr-closeout-table">
        <thead><tr><th>Report</th><th>Event</th><th>Owner</th><th>Corrective action</th><th>Effective</th><th>Signoffs</th><th>Readiness</th><th>Action</th></tr></thead>
        <tbody>
          {visibleReports.map(report => {
            const closed = isNcrClosedReport(report);
            const blockers = getNcrClosureBlockers(report);
            const rowManagerSigned = hasNcrSignatureRole(report.signatures || [], NCR_DEPARTMENT_MANAGER_SIGNATURE_ROLES);
            const rowExecutiveSigned = hasNcrSignatureRole(report.signatures || [], NCR_EXECUTIVE_SIGNATURE_ROLES);
            const expanded = report.id === selectedId;
            return <Fragment key={report.id}>
              <tr className={`${expanded ? 'ncr-closeout-row-active' : ''} ${closed ? 'ncr-closeout-row-closed' : ''}`}>
                <td><strong>#{report.reportNumber}</strong><span>{formatDate(report.reportDate)} · {getNcrDepartmentValue(report)}</span></td>
                <td><strong>{report.eventType || 'Unspecified event'}</strong><span>{report.eventDescription || report.operatorLocation || 'No description'}</span></td>
                <td>{people.find(person => person.id === report.ownerId)?.name || <span className="ncr-closeout-missing">Unassigned</span>}</td>
                <td>{report.permanentAction ? <span className="ncr-closeout-clamp">{report.permanentAction}</span> : <span className="ncr-closeout-missing">Missing</span>}</td>
                <td>{normalizeNcrYesNo(report.actionEffective) || <span className="ncr-closeout-missing">Not checked</span>}</td>
                <td><span className={`ncr-closeout-signoff-dot ${rowManagerSigned ? 'complete' : ''}`}>Mgr</span><span className={`ncr-closeout-signoff-dot ${rowExecutiveSigned ? 'complete' : ''}`}>Exec</span></td>
                <td>{closed ? <Badge color="var(--success)">Closed</Badge> : blockers.length === 0 ? <Badge color="var(--success)">Ready</Badge> : <Badge color="var(--warning)">{blockers.length} blocker{blockers.length === 1 ? '' : 's'}</Badge>}</td>
                <td><button type="button" className={`btn ${expanded ? 'btn-primary' : 'btn-secondary'} btn-xs`} onClick={() => beginReview(report)}>{expanded ? 'Reviewing' : closed ? 'Review' : 'Review & close'}</button></td>
              </tr>
              {expanded && draft && <tr className="ncr-closeout-editor-row"><td colSpan={8}>
                <div className="ncr-closeout-editor">
                  <div className="ncr-closeout-editor-head">
                    <div><span>Editing report row</span><h3>NCR #{report.reportNumber}</h3></div>
                    <div className="ncr-closeout-editor-state">{dirty ? <Badge color="var(--warning)">Unsaved changes</Badge> : <Badge color="var(--success)">Saved</Badge>}</div>
                  </div>
                  <div className="ncr-closeout-editor-grid">
                    <section>
                      <h4>Report details</h4>
                      <div className="ncr-closeout-form-grid">
                        <label><span>Report date</span><input type="date" value={draft.reportDate} onChange={event => setField('reportDate', event.target.value)} /></label>
                        <label><span>Event date + time</span><input type="datetime-local" value={draft.eventAt} onChange={event => setField('eventAt', event.target.value)} /></label>
                        <label><span>Observer</span><input value={draft.observer} onChange={event => setField('observer', event.target.value)} /></label>
                        <label><span>Author</span><input value={draft.author} onChange={event => setField('author', event.target.value)} /></label>
                        <label><span>Worksite / area</span><select value={draft.worksiteArea} onChange={event => setField('worksiteArea', event.target.value)}><option value="">Select area</option>{NCR_WORKSITE_AREAS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                        <label><span>Operator + location</span><input value={draft.operatorLocation} onChange={event => setField('operatorLocation', event.target.value)} /></label>
                        <label><span>Internal / external</span><select value={draft.internalExternal} onChange={event => setField('internalExternal', event.target.value)}><option value="">Select</option>{NCR_INTERNAL_EXTERNAL.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                        <label><span>Criticality</span><select value={draft.criticality} onChange={event => setField('criticality', event.target.value)}><option value="">Select</option>{NCR_CRITICALITY.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                        <label><span>Event type</span><select value={draft.eventType} onChange={event => setField('eventType', event.target.value)}><option value="">Select</option>{NCR_EVENT_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                        <label><span>Primary group affected</span><select value={draft.departmentGroup} onChange={event => setField('departmentGroup', event.target.value)}><option value="">Select group</option>{getNcrDepartmentGroupOptions(draft.departmentGroup).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                      </div>
                      <label className="ncr-closeout-wide-field"><span>Event description</span><textarea rows={3} value={draft.eventDescription} onChange={event => setField('eventDescription', event.target.value)} /></label>
                      <div className="ncr-closeout-form-grid">
                        <label><span>Follow-up due</span><input type="date" value={draft.followUpDueDate} onChange={event => setField('followUpDueDate', event.target.value)} /></label>
                      </div>
                      <label className="ncr-closeout-wide-field"><span>Follow-up details</span><textarea rows={2} value={draft.followUpDetails} onChange={event => setField('followUpDetails', event.target.value)} /></label>
                    </section>
                    <section>
                      <h4>Closeout data</h4>
                      <label className="ncr-closeout-wide-field"><span>Root cause code</span><input value={draft.rootCauseCodes} onChange={event => setField('rootCauseCodes', event.target.value)} list="ncr-closeout-root-causes" /><datalist id="ncr-closeout-root-causes">{NCR_ROOT_CAUSE_CODES.map(value => <option key={value} value={value} />)}</datalist></label>
                      <label className="ncr-closeout-wide-field"><span>Root cause analysis</span><textarea rows={3} value={draft.rootCauseAnalysis} onChange={event => setField('rootCauseAnalysis', event.target.value)} /></label>
                      <label className="ncr-closeout-wide-field"><span>Immediate corrective / preventative action</span><textarea rows={2} value={draft.immediateAction} onChange={event => setField('immediateAction', event.target.value)} /></label>
                      <label className="ncr-closeout-wide-field"><span>Permanent corrective action</span><textarea rows={3} value={draft.permanentAction} onChange={event => setField('permanentAction', event.target.value)} /></label>
                      <div className="ncr-closeout-form-grid">
                        <label><span>Action worked?</span><select value={draft.actionEffective} onChange={event => setField('actionEffective', event.target.value)}><option value="">Select yes or no</option>{NCR_YES_NO_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                        <label><span>Date reviewed</span><input type="date" value={draft.dateOfReview} onChange={event => setField('dateOfReview', event.target.value)} /></label>
                      </div>
                      <label className="ncr-closeout-wide-field"><span>Effectiveness verification</span><textarea rows={3} value={draft.effectivenessSummary} onChange={event => setField('effectivenessSummary', event.target.value)} placeholder="What was checked, over what period, and what proved the action worked?" /></label>
                    </section>
                    <section>
                      <h4>Ownership + approval</h4>
                      <div className="ncr-closeout-form-grid ncr-closeout-form-grid-single">
                        <label><span>NCR owner</span><select value={draft.ownerId} onChange={event => setField('ownerId', event.target.value)}><option value="">Select owner</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                        <label><span>Reviewer / approver</span><select value={draft.reviewerId} onChange={event => setField('reviewerId', event.target.value)}><option value="">Select reviewer</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                        <label><span>Effectiveness verifier</span><select value={draft.verifierId} onChange={event => setField('verifierId', event.target.value)}><option value="">Select verifier</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                      </div>
                      {(report.actionItems || []).length > 0 && <div className="ncr-closeout-actions-list"><strong>Corrective actions</strong>{report.actionItems.map(action => <button key={action.id} type="button" className={action.status === 'complete' ? 'complete' : ''} onClick={() => completeAction(action)} disabled={action.status === 'complete' || Boolean(pending)}><CheckCircle2 size={14} /><span>{action.title}</span><small>{action.status === 'complete' ? 'Complete' : 'Mark complete'}</small></button>)}</div>}
                      <div className="ncr-closeout-signoffs">
                        <strong>Required signoffs</strong>
                        <div className={managerSigned ? 'complete' : ''}><span><CheckCircle2 size={15} /> Department manager</span>{managerSigned ? <Badge color="var(--success)">Captured</Badge> : canManagerSign ? <button type="button" className="btn btn-secondary btn-xs" onClick={() => captureCloseoutSignoff('department_manager')} disabled={Boolean(pending)}>Add my signoff</button> : <Badge color="var(--warning)">Needed</Badge>}</div>
                        <div className={executiveSigned ? 'complete' : ''}><span><CheckCircle2 size={15} /> Senior management</span>{executiveSigned ? <Badge color="var(--success)">Captured</Badge> : canExecutiveSign ? <button type="button" className="btn btn-secondary btn-xs" onClick={() => captureCloseoutSignoff('executive')} disabled={Boolean(pending)}>Add my agreement</button> : <Badge color="var(--warning)">Executive needed</Badge>}</div>
                      </div>
                      <div className={`ncr-closeout-readiness ${previewBlockers.length ? '' : 'ready'}`}>
                        <strong>{previewBlockers.length ? `${previewBlockers.length} closure blocker${previewBlockers.length === 1 ? '' : 's'}` : 'Ready for closure'}</strong>
                        {previewBlockers.length ? <ul>{previewBlockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul> : <p>All required data, actions, effectiveness checks, and signoffs are complete.</p>}
                      </div>
                    </section>
                  </div>
                  <div className="ncr-closeout-editor-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => onOpenTracker?.(report.id)} disabled={dirty}>Open full NCR</button>
                    <button type="button" className="btn btn-secondary" onClick={discardChanges} disabled={!dirty || Boolean(pending)}>Discard</button>
                    <button type="button" className="btn btn-primary" onClick={saveRow} disabled={!dirty || Boolean(pending)}>{pending === 'save' ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Save row</button>
                    {!closed && <button type="button" className="btn btn-success" onClick={closeRow} disabled={dirty || previewBlockers.length > 0 || Boolean(pending)} title={dirty ? 'Save changes before closure' : previewBlockers[0] || 'Approve and close NCR'}>{pending === 'close' ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Approve & close</button>}
                  </div>
                </div>
              </td></tr>}
            </Fragment>;
          })}
        </tbody>
      </table>
      {visibleReports.length === 0 && <EmptyState icon={ClipboardCheck} text="No NCRs match this closeout view." />}
    </div>
  </div>;
};

const NcrPage = ({
  reports = [],
  objectives = [],
  currentUser,
  onUpdateReport,
  onCreateReport,
  onCreateActionItem,
  onUpdateActionItem,
  onUploadAttachment,
  onCaptureSignature,
  onImportReports,
  onCreateObjective,
  onOpenObjective,
  addToast
}) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('open');
  const [departmentFilters, setDepartmentFilters] = useState([]);
  const [type, setType] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [worksite, setWorksite] = useState('all');
  const [flagFilter, setFlagFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState('');
  const [analyticsDateTo, setAnalyticsDateTo] = useState('');
  const [analyticsDepartment, setAnalyticsDepartment] = useState('all');
  const [analyticsCriticality, setAnalyticsCriticality] = useState('all');
  const [importSearch, setImportSearch] = useState('');
  const [importActionFilter, setImportActionFilter] = useState('all');
  const [ncrMode, setNcrMode] = useState('tracker');
  const [ncrView, setNcrView] = useState('advanced');
  const canTriage = ['executive', 'manager'].includes(currentUser?.role);
  const canCloseOut = ['executive', 'manager'].includes(currentUser?.role);
  const untriagedReports = useMemo(() => reports.filter(r => !OMP_DEPARTMENTS.includes(r.mainDepartment)), [reports]);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState(() => buildDefaultNcrDraft(currentUser, reports));
  const [actionDraft, setActionDraft] = useState({
    title: '',
    ownerId: '',
    dueDate: ''
  });
  const [signatureDraft, setSignatureDraft] = useState({
    role: 'department_manager',
    signedBy: currentUser?.id || '',
    signedByName: currentUser?.name || '',
    signatureDataUrl: ''
  });
  const [importPreview, setImportPreview] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [analyticsQuery, setAnalyticsQuery] = useState('What repeat failures are trending?');
  const [issueTrendQuery, setIssueTrendQuery] = useState('valve failures');
  const [analyticsAiResult, setAnalyticsAiResult] = useState(null);
  const [analyticsAiLoading, setAnalyticsAiLoading] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [createEvidenceFiles, setCreateEvidenceFiles] = useState([]);
  const [createEvidenceDragOver, setCreateEvidenceDragOver] = useState(false);
  const [createModalPhotoFirst, setCreateModalPhotoFirst] = useState(false);
  const createPhotoDropRef = useRef(null);
  useEffect(() => {
    setCreateDraft(prev => {
      if (prev.observer && prev.author || !currentUser) return prev;
      const defaultDepartment = getDefaultNcrDepartment(currentUser);
      return {
        ...prev,
        observer: prev.observer || currentUser.name || '',
        author: prev.author || currentUser.name || '',
        authorId: prev.authorId || currentUser.id || '',
        affectedDepartments: prev.affectedDepartments || defaultDepartment,
        affectedDepartmentList: prev.affectedDepartmentList?.length ? sanitizeNcrDepartmentList(prev.affectedDepartmentList) : defaultDepartment ? [defaultDepartment] : [],
        departmentGroup: prev.departmentGroup || defaultDepartment
      };
    });
  }, [currentUser]);
  useEffect(() => {
    if (!showCreateModal || !createModalPhotoFirst) return undefined;
    const timeout = setTimeout(() => {
      createPhotoDropRef.current?.scrollIntoView({
        block: 'center',
        behavior: 'smooth'
      });
    }, 75);
    return () => clearTimeout(timeout);
  }, [showCreateModal, createModalPhotoFirst]);
  const openReports = reports.filter(report => !report.closed && report.status !== 'closed');
  const closedReports = reports.filter(report => report.closed || report.status === 'closed');
  const pastDue = reports.filter(isNcrPastDue);
  const dueSoon = reports.filter(isNcrDueSoon);
  const critical = openReports.filter(isNcrCritical);
  const analyticsScope = useMemo(() => reports.filter(report => {
    if (analyticsDepartment !== 'all' && getNcrDepartmentValue(report) !== analyticsDepartment && !getNcrDepartmentList(report).includes(analyticsDepartment)) return false;
    if (analyticsCriticality !== 'all' && (report.criticality || report.severity || 'Unspecified') !== analyticsCriticality) return false;
    const reportDay = String(report.reportDate || '').slice(0, 10);
    if (analyticsDateFrom && (!reportDay || reportDay < analyticsDateFrom)) return false;
    if (analyticsDateTo && (!reportDay || reportDay > analyticsDateTo)) return false;
    return true;
  }), [reports, analyticsDepartment, analyticsCriticality, analyticsDateFrom, analyticsDateTo]);
  const analyticsFilterCount = [analyticsDepartment !== 'all', analyticsCriticality !== 'all', Boolean(analyticsDateFrom), Boolean(analyticsDateTo)].filter(Boolean).length;
  const clearAnalyticsFilters = () => {
    setAnalyticsDepartment('all');
    setAnalyticsCriticality('all');
    setAnalyticsDateFrom('');
    setAnalyticsDateTo('');
  };
  const analytics = useMemo(() => buildNcrAnalytics(analyticsScope), [analyticsScope]);
  const issueExplorer = useMemo(() => buildNcrIssueExplorer(analyticsScope, issueTrendQuery), [analyticsScope, issueTrendQuery]);
  const trendWatch = useMemo(() => buildNcrTrendWatch(analyticsScope), [analyticsScope]);
  const analyticsAnswerRows = useMemo(() => {
    const query = normalizeFailureText(analyticsQuery);
    if (!query) return analytics.byFailure.slice(0, 5);
    const ignored = new Set(['how', 'many', 'what', 'are', 'the', 'and', 'for', 'with', 'failure', 'failures', 'trending', 'repeat']);
    const tokens = query.split(' ').filter(token => token.length > 1 && !ignored.has(token));
    const matched = analytics.byFailure.filter(([label]) => {
      const normalized = normalizeFailureText(label);
      return tokens.some(token => normalized.includes(token));
    });
    return (matched.length ? matched : analytics.byFailure).slice(0, 5);
  }, [analytics.byFailure, analyticsQuery]);
  const departments = [...new Set(reports.flatMap(report => {
    const reportDepartments = getNcrDepartmentList(report);
    return reportDepartments.length ? reportDepartments : [getNcrDepartmentValue(report)].filter(Boolean);
  }))].sort();
  const types = [...new Set(reports.map(report => report.eventType || 'Unspecified').filter(Boolean))].sort();
  const severities = [...new Set(reports.map(report => report.severity || 'Unspecified').filter(Boolean))].sort();
  const worksites = [...new Set(reports.map(report => report.worksiteArea).filter(Boolean))].sort();
  const people = getProfiles().filter(user => user?.id).sort((a, b) => a.name.localeCompare(b.name));
  const isAdvancedNcrView = ncrView === 'advanced';
  const departmentFilterLabel = departmentFilters.length === 0 ? 'All Groups' : departmentFilters.length === 1 ? departmentFilters[0] : `${departmentFilters.length} groups selected`;
  const departmentFilterTitle = departmentFilters.length ? departmentFilters.join(', ') : 'All Groups';
  const toggleDepartmentFilter = value => {
    setDepartmentFilters(prev => prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value].sort());
  };
  const filtered = useMemo(() => reports.filter(report => {
    const stage = report.lifecycleStage || (report.closed ? 'closed' : report.status);
    const statusLabel = ncrStatusLabel(report).toLowerCase().replace(/\s+/g, '_');
    if (status !== 'all' && statusLabel !== status && stage !== status) return false;
    if (departmentFilters.length) {
      const reportDepartments = getNcrDepartmentList(report);
      const reportDepartmentValues = reportDepartments.length ? reportDepartments : [getNcrDepartmentValue(report)].filter(Boolean);
      if (!departmentFilters.some(value => reportDepartmentValues.includes(value))) return false;
    }
    if (type !== 'all' && (report.eventType || 'Unspecified') !== type) return false;
    if (severity !== 'all' && (report.severity || 'Unspecified') !== severity) return false;
    if (worksite !== 'all' && (report.worksiteArea || '') !== worksite) return false;
    if (flagFilter === 'past_due' && !isNcrPastDue(report)) return false;
    if (flagFilter === 'due_soon' && !isNcrDueSoon(report)) return false;
    if (flagFilter === 'critical' && (!isNcrCritical(report) || report.closed || report.status === 'closed')) return false;
    const reportDay = String(report.reportDate || '').slice(0, 10);
    if (dateFrom && (!reportDay || reportDay < dateFrom)) return false;
    if (dateTo && (!reportDay || reportDay > dateTo)) return false;
    if (search) {
      const haystack = normalizeNcr([report.reportNumber, report.observer, report.operatorLocation, report.eventDescription, report.rootCauseAnalysis, report.followUpDetails, report.affectedDepartments, report.eventType, ...(report.eventTypes || []), report.worksiteArea, report.personnelInvolved, report.affectedEquipment, report.affectedProduct, report.rootCauseCodes, report.normalizedFailureSummary].join(' '));
      if (!haystack.includes(normalizeNcr(search))) return false;
    }
    return true;
  }), [reports, status, departmentFilters, type, severity, worksite, flagFilter, dateFrom, dateTo, search]);
  const sorted = useMemo(() => {
    const stageRank = report => {
      const stage = report.lifecycleStage || (report.closed ? 'closed' : 'submitted');
      const index = NCR_LIFECYCLE_STAGES.findIndex(item => item.id === stage);
      return index === -1 ? NCR_LIFECYCLE_STAGES.length : index;
    };
    const criticalRank = report => isNcrCritical(report) ? 0 : 1;
    const dueValue = report => report.followUpDueDate || '9999-12-31';
    const compare = (a, b) => {
      switch (sortKey) {
        case 'report':
          return String(a.reportNumber || '').localeCompare(String(b.reportNumber || ''), undefined, {
            numeric: true
          });
        case 'group':
          return getNcrDepartmentValue(a).localeCompare(getNcrDepartmentValue(b));
        case 'type':
          return (a.eventType || 'zzz').localeCompare(b.eventType || 'zzz');
        case 'criticality':
          return criticalRank(a) - criticalRank(b) || String(a.severity || '').localeCompare(String(b.severity || ''));
        case 'due':
          return dueValue(a).localeCompare(dueValue(b));
        case 'status':
          return stageRank(a) - stageRank(b);
        case 'date':
        default:
          return String(a.reportDate || '').localeCompare(String(b.reportDate || ''));
      }
    };
    const direction = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => direction * compare(a, b) || String(b.reportDate || '').localeCompare(String(a.reportDate || '')));
  }, [filtered, sortKey, sortDir]);
  const toggleSort = key => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'date' || key === 'report' ? 'desc' : 'asc');
    }
  };
  const trackerFilterCount = [status !== 'all' && status !== 'open', departmentFilters.length > 0, type !== 'all', severity !== 'all', worksite !== 'all', flagFilter !== 'all', Boolean(dateFrom), Boolean(dateTo), Boolean(search)].filter(Boolean).length;
  const clearTrackerFilters = () => {
    setSearch('');
    setStatus('all');
    setDepartmentFilters([]);
    setType('all');
    setSeverity('all');
    setWorksite('all');
    setFlagFilter('all');
    setDateFrom('');
    setDateTo('');
  };
  const applyQuickFilter = flag => {
    setFlagFilter(prev => prev === flag ? 'all' : flag);
    setStatus('all');
  };
  const applyStatusKpi = target => {
    setFlagFilter('all');
    setStatus(prev => prev === target ? 'all' : target);
  };
  const selectedReport = reports.find(report => report.id === selectedId) || sorted[0] || null;
  const selectedOutsideFilter = Boolean(selectedReport && !filtered.some(report => report.id === selectedReport.id));
  const linkedObjective = selectedReport?.linkedObjectiveId ? objectives.find(objective => objective.id === selectedReport.linkedObjectiveId) : null;
  const updateSelected = async (changes, successMessage) => {
    if (!selectedReport || !onUpdateReport) return;
    setSaving(true);
    try {
      await onUpdateReport(selectedReport.id, {
        ...changes,
        updatedBy: currentUser.id
      });
      addToast?.({
        type: 'success',
        message: successMessage
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not update NCR'
      });
    } finally {
      setSaving(false);
    }
  };
  const updateSelectedField = (changes, label = 'NCR updated') => updateSelected(changes, `NCR #${selectedReport.reportNumber} ${label}`);
  const approveClosure = () => {
    if (!selectedReport) return;
    const blockers = getNcrClosureBlockers(selectedReport);
    if (blockers.length) {
      addToast?.({
        type: 'error',
        message: `Cannot close NCR yet: ${blockers[0]}`
      });
      return;
    }
    updateSelected({
      closed: true,
      lifecycleStage: 'closed',
      closureApprovedBy: currentUser.id,
      closureApprovedAt: new Date().toISOString(),
      auditNote: 'Closure approved after effectiveness verification'
    }, `NCR #${selectedReport.reportNumber} closure approved`);
  };
  const addActionItem = async () => {
    if (!selectedReport || !onCreateActionItem || !actionDraft.title.trim()) return;
    setSaving(true);
    try {
      await onCreateActionItem(selectedReport.id, actionDraft, currentUser.id);
      setActionDraft({
        title: '',
        ownerId: '',
        dueDate: ''
      });
      addToast?.({
        type: 'success',
        message: `Action added to NCR #${selectedReport.reportNumber}`
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not add NCR action'
      });
    } finally {
      setSaving(false);
    }
  };
  const updateAction = async (action, changes) => {
    if (!onUpdateActionItem) return;
    try {
      await onUpdateActionItem(action.id, changes, currentUser.id);
      addToast?.({
        type: 'success',
        message: 'NCR action updated'
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not update NCR action'
      });
    }
  };
  const uploadEvidenceWithPurpose = async (event, purpose = 'evidence') => {
    const files = Array.from(event.target.files || []).filter(Boolean);
    event.target.value = '';
    if (files.length === 0 || !selectedReport || !onUploadAttachment) return;
    setUploadingEvidence(true);
    try {
      for (const file of files) {
        await onUploadAttachment(selectedReport.id, file, currentUser.id, purpose);
      }
      const label = purpose.replaceAll('_', ' ');
      addToast?.({
        type: 'success',
        message: `${files.length} NCR ${label} file${files.length === 1 ? '' : 's'} uploaded`
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not upload NCR evidence'
      });
    } finally {
      setUploadingEvidence(false);
    }
  };
  const addCreateEvidenceFiles = fileList => {
    const incoming = Array.from(fileList || []).filter(Boolean).map(normalizeNcrEvidenceFile).filter(isNcrEvidenceAttachment);
    if (incoming.length === 0) {
      addToast?.({
        type: 'error',
        message: 'Add a photo, PDF, spreadsheet, or supporting document to the NCR.'
      });
      return;
    }
    setCreateEvidenceFiles(prev => {
      const seen = new Set(prev.map(file => `${file.name}-${file.size}-${file.lastModified}`));
      const next = [...prev];
      incoming.forEach(file => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push(file);
        }
      });
      return next;
    });
  };
  const removeCreateEvidenceFile = index => {
    setCreateEvidenceFiles(prev => prev.filter((_, itemIndex) => itemIndex !== index));
  };
  const handleCreateEvidenceDrag = event => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setCreateEvidenceDragOver(true);
  };
  const handleCreateEvidenceDragLeave = event => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setCreateEvidenceDragOver(false);
  };
  const handleCreateEvidenceDrop = event => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setCreateEvidenceDragOver(false);
    addCreateEvidenceFiles(getDroppedFiles(event.dataTransfer));
  };
  const handleCreateEvidencePaste = event => {
    const pastedFiles = getClipboardFiles(event.clipboardData);
    if (pastedFiles.length === 0) return;
    const evidenceFiles = pastedFiles.filter(isNcrEvidenceAttachment);
    if (evidenceFiles.length === 0) return;
    event.preventDefault();
    addCreateEvidenceFiles(evidenceFiles);
  };
  const captureSignature = async () => {
    if (!selectedReport || !onCaptureSignature || !signatureDraft.signedByName.trim()) {
      addToast?.({
        type: 'error',
        message: 'Signature name is required.'
      });
      return;
    }
    setSaving(true);
    try {
      await onCaptureSignature(selectedReport.id, {
        ...signatureDraft,
        signedByName: signatureDraft.signedByName.trim()
      }, currentUser.id);
      setSignatureDraft({
        role: 'department_manager',
        signedBy: currentUser?.id || '',
        signedByName: currentUser?.name || '',
        signatureDataUrl: ''
      });
      addToast?.({
        type: 'success',
        message: 'NCR signature captured'
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not capture signature'
      });
    } finally {
      setSaving(false);
    }
  };
  const parseImportFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportFileName(file.name);
    setImportPreview([]);
    try {
      const rows = /\.csv$/i.test(file.name) ? tableRowsToObjects(parseCsvText(await file.text())) : tableRowsToObjects(await (await loadReadXlsxFile())(file));
      const existingReportNumbers = new Set((reports || []).map(report => String(report.reportNumber || '').trim()).filter(Boolean));
      const transformed = rows.map((row, index) => {
        const draft = transformImportedNcrRow(row, index, currentUser);
        return {
          ...draft,
          importAction: existingReportNumbers.has(String(draft.reportNumber || '').trim()) ? 'Replace existing' : 'Create new'
        };
      });
      const valid = transformed.filter(row => NCR_IMPORT_REQUIRED_FIELDS.every(field => String(row[field] || '').trim()));
      setImportPreview(valid);
      if (valid.length) {
        addToast?.({
          type: 'success',
          message: `Parsed ${valid.length} KPA NCR row${valid.length === 1 ? '' : 's'} from ${file.name}`
        });
      } else {
        addToast?.({
          type: 'warning',
          message: 'No KPA NCR rows found. Check that the file includes report number and event description columns.'
        });
      }
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not parse KPA export.'
      });
    }
  };
  const commitImport = async () => {
    if (!importPreview.length || !onImportReports || importing) return;
    setImporting(true);
    try {
      const result = await onImportReports({
        rows: importPreview,
        fileName: importFileName || 'KPA NCR export',
        userId: currentUser.id
      });
      setImportPreview([]);
      addToast?.({
        type: 'success',
        message: `KPA import complete: ${result.created || 0} new, ${result.refreshed || 0} replaced from newest list, ${result.skipped || 0} errors.`
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not import KPA NCRs.'
      });
    } finally {
      setImporting(false);
    }
  };
  const filteredImportPreview = useMemo(() => importPreview.filter(row => {
    if (importActionFilter !== 'all' && (row.importAction || 'Create new') !== importActionFilter) return false;
    if (importSearch) {
      const haystack = normalizeNcr([row.reportNumber, row.departmentGroup, row.eventType, row.normalizedFailureSummary, row.eventDescription, row.operatorLocation].join(' '));
      if (!haystack.includes(normalizeNcr(importSearch))) return false;
    }
    return true;
  }), [importPreview, importActionFilter, importSearch]);
  const buildNcrExportRow = report => ({
    reportNumber: report.reportNumber,
    sourceSystem: report.sourceSystem || 'OMP',
    sourceRecordId: report.sourceRecordId || '',
    sourceBatchId: report.sourceBatchId || '',
    reportDate: report.reportDate,
    dateAndTimeEvent: report.eventAt,
    lifecycleStage: getNcrStageLabel(report.lifecycleStage),
    openClosed: report.closed ? 'Closed' : 'Open',
    observer: report.observer || report.author || '',
    employeePersonnelInvolved: report.personnelInvolved || '',
    departmentGroup: getNcrDepartmentValue(report),
    worksiteArea: report.worksiteArea,
    operatorLocation: report.operatorLocation,
    internalExternal: report.internalExternal,
    eventType: report.eventType,
    eventTypes: (report.eventTypes || []).join('; '),
    criticality: report.criticality || report.severity,
    nonProductiveTime: report.nonProductiveTime,
    nonProductiveTimeAmount: report.nonProductiveTimeAmount,
    estimatedCost: report.estimatedCost,
    rootCauseCodes: report.rootCauseCodes,
    failureGroup: report.normalizedFailureSummary || classifyNcrFailure(report).label,
    actionEffective: normalizeNcrYesNo(report.actionEffective),
    effectivenessSummary: report.effectivenessSummary || '',
    recurrencePrevented: report.recurrencePrevented === true ? 'Yes' : report.recurrencePrevented === false ? 'No' : '',
    repeatIssue: report.repeatIssue === true ? 'Yes' : report.repeatIssue === false ? 'No' : '',
    followUpDueDate: report.followUpDueDate,
    eventDescription: report.eventDescription,
    correctiveAction: report.permanentAction || report.immediateAction || '',
    sourceUpdatedAt: report.updatedAt || ''
  });
  const toCsv = (rows, fallbackShape = {}) => {
    const headers = Object.keys(rows[0] || fallbackShape);
    return [headers, ...rows.map(row => headers.map(header => row[header] ?? ''))].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  };
  const downloadTextFile = (filename, contents, type = 'text/csv') => {
    const blob = new Blob([contents], {
      type
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const ncrExportRows = () => analyticsScope.map(buildNcrExportRow);
  const trackerExportFallback = {
    reportNumber: '',
    reportDate: '',
    lifecycleStage: '',
    openClosed: '',
    departmentGroup: '',
    eventType: '',
    criticality: '',
    followUpCount: '',
    followUpDueDate: '',
    worksiteArea: '',
    operatorLocation: '',
    observer: '',
    eventDescription: '',
    rootCauseCodes: '',
    failureGroup: '',
    actionEffective: '',
    correctiveAction: '',
    sourceSystem: '',
    sourceBatchId: '',
    sourceUpdatedAt: ''
  };
  const exportTrackerListCsv = () => {
    const rows = sorted.map(buildNcrExportRow);
    const csv = toCsv(rows, trackerExportFallback);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`sandpro_ncr_tracker_list_${dateStamp}.csv`, csv);
    addToast?.({
      type: 'success',
      message: `Exported ${rows.length} visible NCR${rows.length === 1 ? '' : 's'}.`
    });
  };
  const exportIndividualCsv = () => {
    const rows = ncrExportRows();
    const headers = Object.keys(rows[0] || {
      reportNumber: '',
      sourceSystem: '',
      sourceRecordId: '',
      reportDate: '',
      dateAndTimeEvent: '',
      lifecycleStage: '',
      openClosed: '',
      observer: '',
      employeePersonnelInvolved: '',
      departmentGroup: '',
      worksiteArea: '',
      operatorLocation: '',
      internalExternal: '',
      eventType: '',
      eventTypes: '',
      criticality: '',
      nonProductiveTime: '',
      nonProductiveTimeAmount: '',
      estimatedCost: '',
      rootCauseCodes: '',
      failureGroup: '',
      actionEffective: '',
      effectivenessSummary: '',
      recurrencePrevented: '',
      repeatIssue: '',
      followUpDueDate: '',
      eventDescription: ''
    });
    const csv = toCsv(rows, headers.reduce((acc, header) => ({
      ...acc,
      [header]: ''
    }), {}));
    downloadTextFile('sandpro_ncr_individual_results.csv', csv);
  };
  const exportKpaImportTemplate = () => {
    const headers = ['Report #', 'Report Date', 'Observer', 'Type of Event', 'What Departments does this affect?', 'Worksite/Area', 'Operator and Location', 'Date and Time Event', 'Internal or External Report', 'Critical or Non-Critical', 'Personnel Involved', 'Event Description', 'Root Cause Codes', 'Root Cause Analysis', 'Affected Product', 'Affected Equipment', 'Affected Job', 'Immediate Corrective Action', 'Permanent Corrective Action', 'Action Effective?', 'Effectiveness Verification', 'Recurrence Prevented?', 'Repeat Issue?', 'Date of Initial Corrective Action', 'Date of Permanent Corrective Action Completed', 'Date of Review', 'Date of sign-off', 'Status'];
    const example = ['82000000', new Date().toISOString().slice(0, 10), currentUser?.name || 'Observer Name', 'Equipment Failure', 'Shop; Quality', 'Shop', 'Customer / Location', '', 'Internal', 'Non-Critical', '', 'Describe what failed, what process broke down, or what service/product expectation was missed.', 'Unknown / Pending RCA', '', '', '', '', 'Contain and protect customer/process.', 'Complete corrective action tied to root cause.', 'Yes', 'Verified no repeat issue after corrective action review.', 'Yes', 'No', '', '', '', '', 'Open'];
    const csv = [headers, example].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {
      type: 'text/csv'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sandpro_kpa_ncr_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportIssueTrendCsv = () => {
    const rows = [['Section', 'Label', 'Count'], ...issueExplorer.byFailure.map(([label, count]) => ['Failure grouping', label, count]), ...issueExplorer.byOperator.map(([label, count]) => ['Operator subgroup', label, count]), ...issueExplorer.byEquipmentProcess.map(([label, count]) => ['Equipment / process', label, count]), ...issueExplorer.byOperatorFailure.map(([label, count]) => ['Operator by failure grouping', label, count]), ...issueExplorer.matches.map(report => ['Matching NCR', `#${report.reportNumber} | ${report.operatorLocation || 'Unspecified operator'} | ${report.normalizedFailureSummary || classifyNcrFailure(report).label}`, report.eventDescription || ''])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {
      type: 'text/csv'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sandpro_ncr_issue_trend_${normalizeFailureText(issueTrendQuery || 'all').replace(/\s+/g, '_') || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportAnalyticsCsv = () => {
    const rows = [['Section', 'Label', 'Count'], ...analytics.byFailure.map(([label, count]) => ['Failure trend', label, count]), ...analytics.byDepartment.map(([label, count]) => ['Department / group', label, count]), ...analytics.byType.map(([label, count]) => ['Event type', label, count]), ...analytics.byRootCause.map(([label, count]) => ['Root cause', label, count]), ...analytics.byWorksite.map(([label, count]) => ['Worksite / area', label, count]), ...analytics.byMapLocation.map(([label, count]) => ['Map / location', label, count]), ...analytics.byObserver.map(([label, count]) => ['Observer', label, count]), ...analytics.byEmployee.map(([label, count]) => ['Employee', label, count]), ...analytics.byOperator.map(([label, count]) => ['Operator and location', label, count]), ...analytics.byEventDate.map(([label, count]) => ['Date and time event', label, count]), ...analytics.byInternalExternal.map(([label, count]) => ['Internal or external report', label, count]), ...analytics.byNpt.map(([label, count]) => ['Non-Productive Time', label, count]), ...analytics.byNptAmount.map(([label, count]) => ['Non-Productive Time Amount', label, count])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {
      type: 'text/csv'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sandpro_ncr_analytics_summary.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  const askNcrAnalyticsAi = async questionOverride => {
    const question = String(questionOverride ?? analyticsQuery).trim();
    if (!question || analyticsAiLoading) return;
    setAnalyticsAiLoading(true);
    try {
      const {
        data: sessionData
      } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const response = await fetch('/api/ncr/analytics-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {
            Authorization: `Bearer ${token}`
          } : {})
        },
        body: JSON.stringify({
          question,
          accessToken: token
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'NCR analytics could not answer that question.');
      setAnalyticsAiResult(payload);
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'NCR analytics could not answer that question.'
      });
    } finally {
      setAnalyticsAiLoading(false);
    }
  };
  const analyticsExportRows = () => [['Section', 'Label', 'Count'], ...analytics.byFailure.map(([label, count]) => ['Failure trend', label, count]), ...analytics.byDepartment.map(([label, count]) => ['Department / group', label, count]), ...analytics.byType.map(([label, count]) => ['Event type', label, count]), ...analytics.byRootCause.map(([label, count]) => ['Root cause', label, count]), ...analytics.byWorksite.map(([label, count]) => ['Worksite / area', label, count]), ...analytics.byMapLocation.map(([label, count]) => ['Map / location', label, count]), ...analytics.byObserver.map(([label, count]) => ['Observer', label, count]), ...analytics.byEmployee.map(([label, count]) => ['Employee', label, count]), ...analytics.byOperator.map(([label, count]) => ['Operator and location', label, count]), ...analytics.byEventDate.map(([label, count]) => ['Date and time event', label, count]), ...analytics.byInternalExternal.map(([label, count]) => ['Internal or external report', label, count]), ...analytics.byNpt.map(([label, count]) => ['Non-Productive Time', label, count]), ...analytics.byNptAmount.map(([label, count]) => ['Non-Productive Time Amount', label, count]), ...analytics.aging.map(({
    report,
    days
  }) => ['Open aging', `NCR #${report.reportNumber}`, `${days} days`])];
  const exportAnalyticsExcel = async () => {
    const ncrRows = ncrExportRows();
    const ncrHeaders = Object.keys(ncrRows[0] || {
      reportNumber: '',
      sourceSystem: '',
      sourceRecordId: '',
      reportDate: '',
      dateAndTimeEvent: '',
      lifecycleStage: '',
      openClosed: '',
      observer: '',
      employeePersonnelInvolved: '',
      departmentGroup: '',
      worksiteArea: '',
      operatorLocation: '',
      internalExternal: '',
      eventType: '',
      eventTypes: '',
      criticality: '',
      nonProductiveTime: '',
      nonProductiveTimeAmount: '',
      estimatedCost: '',
      rootCauseCodes: '',
      failureGroup: '',
      followUpDueDate: '',
      eventDescription: ''
    });
    const sheet1 = analyticsExportRows().map((row, rowIndex) => row.map(value => ({
      value,
      fontWeight: rowIndex === 0 ? 'bold' : undefined
    })));
    const sheet2 = [ncrHeaders.map(value => ({
      value,
      fontWeight: 'bold'
    })), ...ncrRows.map(row => ncrHeaders.map(header => ({
      value: row[header] ?? ''
    })))];
    const writeXlsxFile = await loadWriteXlsxFile();
    await writeXlsxFile([{
      data: sheet1,
      sheet: 'NCR Analytics'
    }, {
      data: sheet2,
      sheet: 'NCR Rows'
    }]).toFile('sandpro_ncr_analytics.xlsx');
  };
  const exportAnalyticsPdf = () => {
    const win = window.open('', 'sandpro-ncr-analytics-export', 'width=1100,height=800');
    if (!win) {
      addToast?.({
        type: 'error',
        message: 'Allow pop-ups to export NCR analytics.'
      });
      return;
    }
    const rows = analyticsExportRows().slice(1).map(row => `<tr>${row.map(cell => `<td>${escapeExportHtml(cell)}</td>`).join('')}</tr>`).join('');
    win.document.write(`<!doctype html>
<html>
<head>
  <title>SandPro NCR Analytics</title>
  <style>
    @page { size: letter; margin: 0.45in; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; }
    h1 { color: #ff7f02; font-size: 22px; margin: 0 0 8px; }
    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 12px 0; }
    .kpi { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; }
    .label { color: #6b7280; font-size: 8px; text-transform: uppercase; font-weight: 700; }
    .value { font-size: 18px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; color: #374151; font-size: 9px; text-transform: uppercase; }
  </style>
</head>
<body>
  <h1>SandPro NCR Analytics</h1>
  <p>Generated ${escapeExportHtml(new Date().toLocaleString())}. Includes KPA-imported and OMP-created NCRs.${analyticsFilterCount ? escapeExportHtml(` Filtered view: ${analyticsScope.length} of ${reports.length} NCRs.`) : ''}</p>
  <div class="kpis">
    <div class="kpi"><div class="label">Open</div><div class="value">${analytics.active}</div></div>
    <div class="kpi"><div class="label">Closed</div><div class="value">${analytics.closed}</div></div>
    <div class="kpi"><div class="label">Past Due</div><div class="value">${analytics.pastDue}</div></div>
    <div class="kpi"><div class="label">Critical Open</div><div class="value">${analytics.critical}</div></div>
    <div class="kpi"><div class="label">Total NCRs</div><div class="value">${analyticsScope.length}</div></div>
  </div>
  <table><thead><tr><th>Section</th><th>Label</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body>
</html>`);
    win.document.close();
  };
  const exportSelectedPdf = () => {
    if (!selectedReport) return;
    const win = window.open('', 'sandpro-ncr-detail-export', 'width=1100,height=800');
    if (!win) {
      addToast?.({
        type: 'error',
        message: 'Allow pop-ups to export the NCR detail packet.'
      });
      return;
    }
    win.document.write(buildNcrDetailExportHtml({
      report: selectedReport,
      profiles: people
    }));
    win.document.close();
  };
  const createObjective = async () => {
    if (!selectedReport || saving) return;
    setSaving(true);
    try {
      await onCreateObjective?.(selectedReport);
    } finally {
      setSaving(false);
    }
  };
  const refreshCreateReportNumber = () => {
    setCreateDraft(prev => ({
      ...prev,
      reportNumber: getNextNcrReportNumber(reports)
    }));
  };
  const openCreateModal = ({
    photoFirst = false
  } = {}) => {
    setCreateDraft(buildDefaultNcrDraft(currentUser, reports));
    setCreateEvidenceFiles([]);
    setCreateEvidenceDragOver(false);
    setCreateModalPhotoFirst(photoFirst);
    setShowCreateModal(true);
  };
  const openCreateModalForPhotos = () => {
    openCreateModal({
      photoFirst: true
    });
  };
  const closeCreateModal = () => {
    if (creating) return;
    setShowCreateModal(false);
    setCreateEvidenceFiles([]);
    setCreateEvidenceDragOver(false);
    setCreateModalPhotoFirst(false);
  };
  const createMissingRequiredFields = getMissingNcrRequiredFields(createDraft);
  const createReport = async () => {
    if (!onCreateReport || creating) return;
    const missingRequiredFields = getMissingNcrRequiredFields(createDraft);
    if (missingRequiredFields.length) {
      addToast?.({
        type: 'error',
        message: `Complete required NCR fields: ${missingRequiredFields.slice(0, 3).map(field => field.label).join(', ')}${missingRequiredFields.length > 3 ? '...' : ''}`
      });
      return;
    }
    setCreating(true);
    try {
      const classification = classifyNcrFailure(createDraft);
      const primaryGroupAffected = getNcrPrimaryGroupValue(createDraft);
      const affectedDepartmentList = mergeNcrPrimaryGroup(primaryGroupAffected, createDraft.affectedDepartmentList || []);
      const queuedEvidenceFiles = createEvidenceFiles;
      const selectedRootCause = getNcrRootCauseValue(createDraft);
      const actionEffective = normalizeNcrYesNo(createDraft.actionEffective);
      const created = await onCreateReport({
        ...createDraft,
        reportNumber: createDraft.reportNumber.trim(),
        eventType: createDraft.eventTypes?.[0] || createDraft.eventType,
        rootCauseCodes: selectedRootCause,
        rootCauseAnalysis: selectedRootCause,
        actionEffective,
        recurrencePrevented: ncrYesNoToBoolean(actionEffective),
        effectivenessCheckedAt: actionEffective ? new Date().toISOString() : createDraft.effectivenessCheckedAt,
        effectivenessCheckedBy: actionEffective ? currentUser?.id : createDraft.effectivenessCheckedBy,
        affectedDepartmentList,
        affectedDepartments: affectedDepartmentList.join(', ') || sanitizeNcrDepartmentList(splitMultiValue(createDraft.affectedDepartments)).join(', '),
        departmentGroup: primaryGroupAffected,
        severity: createDraft.criticality || createDraft.severity,
        canonicalFailureCode: createDraft.canonicalFailureCode || classification.code,
        normalizedFailureSummary: createDraft.normalizedFailureSummary || classification.label,
        aiConfidence: createDraft.aiConfidence || classification.confidence,
        aiClassificationReason: createDraft.aiClassificationReason || classification.reason,
        createdBy: currentUser?.id,
        updatedBy: currentUser?.id
      });
      let uploadedEvidenceCount = 0;
      let uploadError = null;
      if (queuedEvidenceFiles.length > 0 && onUploadAttachment) {
        try {
          for (const file of queuedEvidenceFiles) {
            await onUploadAttachment(created.id, file, currentUser?.id, getNcrAttachmentPurpose(file));
            uploadedEvidenceCount += 1;
          }
        } catch (error) {
          uploadError = error;
        }
      }
      setSelectedId(created.id);
      setCreateEvidenceFiles([]);
      setShowCreateModal(false);
      if (queuedEvidenceFiles.length > 0 && !onUploadAttachment) {
        addToast?.({
          type: 'error',
          message: `NCR #${created.reportNumber} created, but evidence upload is unavailable.`
        });
      } else if (uploadError) {
        const remaining = Math.max(1, queuedEvidenceFiles.length - uploadedEvidenceCount);
        addToast?.({
          type: 'error',
          message: `NCR #${created.reportNumber} created, but ${remaining} evidence file${remaining === 1 ? '' : 's'} did not upload. Add them from Photos + Documentation.`
        });
      } else {
        const suffix = uploadedEvidenceCount ? ` with ${uploadedEvidenceCount} evidence file${uploadedEvidenceCount === 1 ? '' : 's'}` : '';
        addToast?.({
          type: 'success',
          message: `NCR #${created.reportNumber} created${suffix}`
        });
      }
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not create NCR'
      });
    } finally {
      setCreating(false);
    }
  };
  return <FieldKeyProvider>
    <div className="ncr-page">
      <div className="ncr-header">
        <div>
          <div className="flex items-center gap-8">
            <FileText size={24} color="var(--brand)" />
            <h1 className="fixit-title">NCR Tracker</h1>
          </div>
          <p className="text-sm text-muted">Non-conformance reports, root causes, corrective actions, and assigned follow-up work.</p>
        </div>
        {onCreateReport && <div className="ncr-header-actions">
            <button className="btn btn-primary" onClick={() => openCreateModal()}>
              <Plus size={14} /> New NCR
            </button>
            <button className="btn btn-secondary ncr-mobile-photo-entry" onClick={openCreateModalForPhotos}>
              <Camera size={14} /> Take / add photo or doc to NCR
            </button>
          </div>}
      </div>
      <div className="ncr-controls-row">
        <div className="ncr-mode-tabs" role="tablist" aria-label="NCR workspace modes">
          {[{
            id: 'tracker',
            label: 'Tracker',
            icon: FileText
          }, ...(canCloseOut ? [{
            id: 'closeout',
            label: 'Closeout Report',
            icon: ClipboardCheck
          }] : []), {
            id: 'analytics',
            label: 'Analytics',
            icon: BarChart3
          }, {
            id: 'import',
            label: 'KPA Import',
            icon: Upload
          }, ...(canTriage && untriagedReports.length ? [{
            id: 'triage',
            label: `Dept triage (${untriagedReports.length})`,
            icon: ClipboardCheck
          }] : [])].map(tab => <button key={tab.id} type="button" className={`ncr-mode-tab ${ncrMode === tab.id ? 'active' : ''}`} onClick={() => setNcrMode(tab.id)} aria-selected={ncrMode === tab.id}>
              <tab.icon size={14} /> {tab.label}
            </button>)}
        </div>
        {(ncrMode === 'tracker' || ncrMode === 'analytics') && <div className="ncr-view-bar">
          <span>View</span>
          <div className="segmented-control" role="group" aria-label="NCR detail level">
            <button type="button" className={ncrView === 'basic' ? 'active' : ''} onClick={() => setNcrView('basic')}>Basic</button>
            <button type="button" className={ncrView === 'advanced' ? 'active' : ''} onClick={() => setNcrView('advanced')}>Advanced</button>
          </div>
        </div>}
      </div>
      {ncrMode === 'triage' && canTriage && <NcrTriagePanel reports={untriagedReports} currentUser={currentUser} onUpdateReport={onUpdateReport} addToast={addToast} />}
      {ncrMode === 'closeout' && canCloseOut && <NcrCloseoutReport reports={reports} currentUser={currentUser} people={people} onUpdateReport={onUpdateReport} onUpdateActionItem={onUpdateActionItem} onCaptureSignature={onCaptureSignature} onOpenTracker={reportId => {
        setSelectedId(reportId);
        setNcrMode('tracker');
      }} addToast={addToast} />}
      {ncrMode === 'tracker' && <>
      <FeatureHelp id="ncr-tracker" title="Using the NCR Tracker" items={["Filter by group, status, event type, or criticality to review open non-conformance reports.", "Use Closeout Report to enter review data and close NCRs without round-tripping through Excel.", "Create an objective when an NCR needs assigned action items before closeout."]} />

      <div className="ncr-kpis">
        <KPICard label="Open" value={openReports.length} icon={AlertCircle} color="var(--brand)" onClick={() => applyStatusKpi('open')} active={status === 'open' && flagFilter === 'all'} sub="Click to filter" />
        <KPICard label="Past Due" value={pastDue.length} icon={AlertTriangle} color="var(--error)" onClick={() => applyQuickFilter('past_due')} active={flagFilter === 'past_due'} sub="Click to filter" />
        <KPICard label="Due 7 Days" value={dueSoon.length} icon={Clock} color="var(--warning)" onClick={() => applyQuickFilter('due_soon')} active={flagFilter === 'due_soon'} sub="Click to filter" />
        <KPICard label="Critical Open" value={critical.length} icon={Shield} color="var(--error)" onClick={() => applyQuickFilter('critical')} active={flagFilter === 'critical'} sub="Click to filter" />
        <KPICard label="Closed" value={closedReports.length} icon={CheckCircle2} color="var(--success)" onClick={() => applyStatusKpi('closed')} active={status === 'closed' && flagFilter === 'all'} sub="Click to filter" />
      </div>

      <div className="ncr-workspace">
        <section className="card ncr-list-panel">
          <div className="ncr-toolbar">
            <div style={{
                position: 'relative',
                flex: '1 1 260px'
              }}>
              <Search size={15} style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--accent-7)'
                }} />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search NCRs..." style={{
                  paddingLeft: 32,
                  width: '100%'
                }} />
            </div>
            <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter by status">
              <option value="all">All Statuses</option>
              <option value="open">Open (any stage)</option>
              <option value="in_progress">In Progress (any stage)</option>
              {NCR_LIFECYCLE_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
            </select>
            <details className="ncr-multi-filter">
              <summary aria-label="Filter by groups" title={departmentFilterTitle}>
                <span>{departmentFilterLabel}</span>
                <ChevronDown size={14} />
              </summary>
              <div className="ncr-multi-filter-menu" role="group" aria-label="Filter by groups">
                <button type="button" className="ncr-multi-filter-clear" onClick={() => setDepartmentFilters([])}>
                  All Groups
                </button>
                {departments.map(value => <label key={value} className="ncr-multi-filter-option">
                    <input type="checkbox" checked={departmentFilters.includes(value)} onChange={() => toggleDepartmentFilter(value)} />
                    <span>{value}</span>
                  </label>)}
              </div>
            </details>
            <select value={type} onChange={event => setType(event.target.value)} aria-label="Filter by event type">
              <option value="all">All Event Types</option>
              {types.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={severity} onChange={event => setSeverity(event.target.value)} aria-label="Filter by criticality">
              <option value="all">All Criticality</option>
              {severities.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={worksite} onChange={event => setWorksite(event.target.value)} aria-label="Filter by worksite or area">
              <option value="all">All Worksites</option>
              {worksites.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={flagFilter} onChange={event => {
                setFlagFilter(event.target.value);
                if (event.target.value !== 'all') setStatus('all');
              }} aria-label="Quick attention filter">
              <option value="all">All Attention Levels</option>
              <option value="past_due">Past Due</option>
              <option value="due_soon">Due Within 7 Days</option>
              <option value="critical">Critical Open</option>
            </select>
            <div className="ncr-date-range">
              <label><span>From</span><input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} aria-label="Report date from" /></label>
              <label><span>To</span><input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} aria-label="Report date to" /></label>
            </div>
          </div>
          <div className="ncr-filter-summary">
            <span>Showing <strong>{sorted.length}</strong> of {reports.length} NCR{reports.length === 1 ? '' : 's'}</span>
            <FieldKeyHint label="What do these filters mean?" termId="status_open" />
            <button type="button" className="btn btn-secondary btn-xs" onClick={exportTrackerListCsv}>
              <Download size={12} /> Export visible list
            </button>
            {trackerFilterCount > 0 && <button type="button" className="btn btn-ghost btn-xs" onClick={clearTrackerFilters}>
                <X size={12} /> Clear filters ({trackerFilterCount})
              </button>}
          </div>

          <div className="ncr-table-wrap">
            <div className="ncr-mobile-list">
              {sorted.map(report => <button key={report.id} type="button" className={`ncr-mobile-card ${selectedReport?.id === report.id ? 'active' : ''}`} onClick={() => setSelectedId(report.id)}>
                  <div className="ncr-mobile-card-head">
                    <div>
                      <strong>NCR #{report.reportNumber}</strong>
                      <span>{formatDate(report.reportDate)} · {report.operatorLocation || report.worksiteArea || 'No location'}</span>
                    </div>
                    <Badge color={getNcrLifecycleColor(report.lifecycleStage)}>{getNcrStageLabel(report.lifecycleStage)}</Badge>
                  </div>
                  <p>{report.eventDescription || report.eventType || 'Non-conformance report'}</p>
                  <div className="ncr-mobile-meta">
                    <span>{getNcrDepartmentValue(report)}</span>
                    <span>{report.eventType || 'Unspecified'}</span>
                    <span className={isNcrPastDue(report) ? 'text-warning font-semibold' : ''}>{report.followUpDueDate ? formatDate(report.followUpDueDate) : 'No due date'}</span>
                  </div>
                </button>)}
            </div>
            <table className="objectives-table ncr-table">
              <thead>
                <tr>
                  {[{
                      key: 'report',
                      label: 'Report'
                    }, {
                      key: 'group',
                      label: 'Group'
                    }, {
                      key: 'type',
                      label: 'Type'
                    }, {
                      key: 'criticality',
                      label: 'Criticality'
                    }, {
                      key: 'due',
                      label: 'Follow-Ups'
                    }, {
                      key: 'status',
                      label: 'Status'
                    }].map(column => <th key={column.key} aria-sort={sortKey === column.key ? sortDir === 'asc' ? 'ascending' : 'descending' : undefined}>
                      <button type="button" className="ncr-sort-btn" onClick={() => toggleSort(column.key)}>
                        {column.label}
                        <span className="ncr-sort-indicator">{sortKey === column.key ? sortDir === 'asc' ? '▲' : '▼' : ''}</span>
                      </button>
                    </th>)}
                </tr>
              </thead>
              <tbody>
                {sorted.map(report => <tr key={report.id} className={selectedReport?.id === report.id ? 'ncr-row-active' : ''} onClick={() => setSelectedId(report.id)}>
                    <td>
                      <div className="text-sm font-semibold">#{report.reportNumber}</div>
                      <div className="text-xs text-muted">{formatDate(report.reportDate)} · {report.operatorLocation || report.worksiteArea || 'No location'}</div>
                    </td>
                    <td>{getNcrDepartmentValue(report)}</td>
                    <td>{report.eventType || '-'}</td>
                    <td><Badge color={isNcrCritical(report) ? 'var(--error)' : 'var(--accent-7)'}>{report.severity || 'Unspecified'}</Badge></td>
                    <td className={isNcrPastDue(report) ? 'text-warning font-semibold' : ''}>
                      {report.followUpCount || 0}
                      {report.followUpDueDate && <span className="text-xs text-muted"> · {formatDate(report.followUpDueDate)}</span>}
                    </td>
                    <td><Badge color={getNcrLifecycleColor(report.lifecycleStage)}>{getNcrStageLabel(report.lifecycleStage)}</Badge></td>
                  </tr>)}
              </tbody>
            </table>
            {sorted.length === 0 && <div className="ncr-empty-filtered">
                <EmptyState icon={FileText} text="No NCRs match those filters." />
                {trackerFilterCount > 0 && <button type="button" className="btn btn-secondary btn-xs" onClick={clearTrackerFilters}>
                    <X size={12} /> Clear all filters
                  </button>}
              </div>}
            {selectedOutsideFilter && <p className="text-xs text-muted" style={{
                margin: '10px 2px 0'
              }}>
                Selected NCR is outside the current filters. Use the detail panel to reopen it or clear filters to show it in the list.
              </p>}
          </div>
        </section>

        <aside key={selectedReport?.id || 'empty'} className="card ncr-detail-panel">
          {!selectedReport ? <EmptyState icon={FileText} text="Select an NCR to review details." /> : <>
              <div className="ncr-detail-head">
                <div>
                  <div className="text-xs text-muted">NCR #{selectedReport.reportNumber}</div>
                  <h2>{selectedReport.eventType || 'Non-Conformance Report'}</h2>
                  <div className="text-xs text-muted">{selectedReport.operatorLocation || selectedReport.worksiteArea || 'No location'} · {formatDate(selectedReport.reportDate)}</div>
                </div>
                <Badge color={getNcrLifecycleColor(selectedReport.lifecycleStage)}>{getNcrStageLabel(selectedReport.lifecycleStage)}</Badge>
              </div>

              <div className="ncr-detail-grid">
                <div><span><DefinedTerm id="observer">Observer</DefinedTerm></span><strong>{selectedReport.observer || '-'}</strong></div>
                <div><span><DefinedTerm id="group">Primary group affected</DefinedTerm></span><strong>{getNcrPrimaryGroupValue(selectedReport) || '-'}</strong></div>
                <div><span><DefinedTerm id="internal_external">Internal/External</DefinedTerm></span><strong>{selectedReport.internalExternal || '-'}</strong></div>
                <div><span><DefinedTerm id="npt">NPT</DefinedTerm></span><strong>{selectedReport.nonProductiveTime || '-'}</strong></div>
              </div>

              <div className="ncr-section">
                <h3>Report Details</h3>
                <div className="org-edit-grid">
                  <label className={ncrRequiredFieldClass(selectedReport, 'reportNumber')}><NcrRequiredLabel>Report Number</NcrRequiredLabel><input required defaultValue={selectedReport.reportNumber || ''} onBlur={event => updateSelectedField({
                      reportNumber: event.target.value
                    }, 'report number updated')} /></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'reportDate')}><NcrRequiredLabel>Report Date</NcrRequiredLabel><input required type="date" defaultValue={selectedReport.reportDate || ''} onBlur={event => updateSelectedField({
                      reportDate: event.target.value
                    }, 'report date updated')} /></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'observer')}><NcrRequiredLabel>Observer</NcrRequiredLabel><input required defaultValue={selectedReport.observer || ''} onBlur={event => updateSelectedField({
                      observer: event.target.value
                    }, 'observer updated')} /></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'author')}><NcrRequiredLabel>Author</NcrRequiredLabel><input required defaultValue={selectedReport.author || ''} onBlur={event => updateSelectedField({
                      author: event.target.value
                    }, 'author updated')} /></label>
                  <label><span>Source Sheet</span><input defaultValue={selectedReport.sourceSheet || ''} onBlur={event => updateSelectedField({
                      sourceSheet: event.target.value
                    }, 'source sheet updated')} /></label>
                  <label><span>Source Link</span><input defaultValue={selectedReport.sourceLink || ''} onBlur={event => updateSelectedField({
                      sourceLink: event.target.value
                    }, 'source link updated')} placeholder="https://..." /></label>
                  <label><span>Personnel Involved</span><input defaultValue={selectedReport.personnelInvolved || ''} onBlur={event => updateSelectedField({
                      personnelInvolved: event.target.value
                    }, 'personnel involved updated')} /></label>
                </div>
              </div>

              <NcrEventPhotoStrip report={selectedReport} onUpload={uploadEvidenceWithPurpose} uploading={uploadingEvidence} />

              {isAdvancedNcrView && <div className="ncr-section">
                <h3>Header + Classification</h3>
                <div className="org-edit-grid">
                  <label className={ncrRequiredFieldClass(selectedReport, 'primaryGroupAffected')}><NcrRequiredLabel>Primary Group Affected</NcrRequiredLabel><select required value={getNcrPrimaryGroupValue(selectedReport)} onChange={event => {
                      const nextDepartments = mergeNcrPrimaryGroup(event.target.value, getNcrDepartmentList(selectedReport));
                      updateSelectedField({
                        departmentGroup: event.target.value,
                        affectedDepartmentList: nextDepartments,
                        affectedDepartments: nextDepartments.join(', ')
                      }, 'primary group affected updated');
                    }}><option value="">Unspecified</option>{getNcrDepartmentGroupOptions(getNcrPrimaryGroupValue(selectedReport)).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'worksiteArea')}><NcrRequiredLabel>Worksite / Area</NcrRequiredLabel><select required value={selectedReport.worksiteArea || ''} onChange={event => updateSelectedField({
                      worksiteArea: event.target.value
                    }, 'worksite updated')}><option value="">Unspecified</option>{NCR_WORKSITE_AREAS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'operatorLocation')}><NcrRequiredLabel>Operator and Location</NcrRequiredLabel><input required defaultValue={selectedReport.operatorLocation || ''} onBlur={event => updateSelectedField({
                      operatorLocation: event.target.value
                    }, 'operator/location updated')} /></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'eventAt')}><NcrRequiredLabel>Date and Time Event</NcrRequiredLabel><input required type="datetime-local" defaultValue={selectedReport.eventAt ? String(selectedReport.eventAt).slice(0, 16) : ''} onBlur={event => updateSelectedField({
                      eventAt: event.target.value
                    }, 'event time updated')} /></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'internalExternal')}><NcrRequiredLabel>Internal / External</NcrRequiredLabel><select required value={selectedReport.internalExternal || ''} onChange={event => updateSelectedField({
                      internalExternal: event.target.value
                    }, 'source type updated')}><option value="">Unspecified</option>{NCR_INTERNAL_EXTERNAL.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label className={ncrRequiredFieldClass(selectedReport, 'criticality')}><NcrRequiredLabel>Criticality</NcrRequiredLabel><select required value={selectedReport.criticality || selectedReport.severity || ''} onChange={event => updateSelectedField({
                      criticality: event.target.value
                    }, 'criticality updated')}><option value="">Unspecified</option>{NCR_CRITICALITY.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label><span>NPT</span><select value={selectedReport.nonProductiveTime || ''} onChange={event => updateSelectedField({
                      nonProductiveTime: event.target.value
                    }, 'NPT updated')}><option value="">Unspecified</option><option value="No">No</option><option value="Yes">Yes</option></select></label>
                  <label><span>NPT Amount</span><input type="number" min="0" step="0.1" defaultValue={selectedReport.nonProductiveTimeAmount ?? ''} onBlur={event => updateSelectedField({
                      nonProductiveTimeAmount: event.target.value
                    }, 'NPT amount updated')} /></label>
                  <label><span>Estimated Cost</span><input type="number" min="0" step="0.01" defaultValue={selectedReport.estimatedCost ?? ''} onBlur={event => updateSelectedField({
                      estimatedCost: event.target.value
                    }, 'estimated cost updated')} /></label>
                  <label><span>Time Frame for Action</span><select value={selectedReport.timeFrameForAction || ''} onChange={event => updateSelectedField({
                      timeFrameForAction: event.target.value
                    }, 'time frame for action updated')}><option value="">Unspecified</option>{NCR_ACTION_TIMEFRAMES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label><span>Follow-Up Count</span><input type="number" min="0" step="1" defaultValue={selectedReport.followUpCount ?? ''} onBlur={event => updateSelectedField({
                      followUpCount: event.target.value
                    }, 'follow-up count updated')} /></label>
                  <label><span>Follow-Up Due Date</span><input type="date" defaultValue={selectedReport.followUpDueDate || ''} onBlur={event => updateSelectedField({
                      followUpDueDate: event.target.value
                    }, 'follow-up due date updated')} /></label>
                </div>
                <div className={`ncr-checkbox-cloud ncr-required-field${isNcrRequiredFieldMissing(selectedReport, 'eventType') ? ' ncr-required-missing' : ''}`}>
                  <NcrRequiredLabel>Type of Event</NcrRequiredLabel>
                  {NCR_EVENT_TYPES.map(value => <label key={value}><input type="checkbox" checked={(selectedReport.eventTypes || []).includes(value) || selectedReport.eventType === value} onChange={() => {
                      const next = toggleArrayValue(selectedReport.eventTypes?.length ? selectedReport.eventTypes : selectedReport.eventType ? [selectedReport.eventType] : [], value);
                      updateSelectedField({
                        eventTypes: next,
                        eventType: next[0] || ''
                      }, 'event type updated');
                    }} /> {value}</label>)}
                </div>
                <div className="ncr-checkbox-cloud">
                  <span>Affected Departments</span>
                  {NCR_DEPARTMENT_GROUPS.map(value => <label key={value}><input type="checkbox" checked={getNcrDepartmentList(selectedReport).includes(value)} onChange={() => {
                      const current = getNcrDepartmentList(selectedReport);
                      const next = toggleArrayValue(current, value);
                      const nextPrimary = next.includes(getNcrPrimaryGroupValue(selectedReport)) ? getNcrPrimaryGroupValue(selectedReport) : next[0] || '';
                      const nextDepartments = mergeNcrPrimaryGroup(nextPrimary, next);
                      updateSelectedField({
                        affectedDepartmentList: nextDepartments,
                        affectedDepartments: nextDepartments.join(', '),
                        departmentGroup: nextPrimary
                      }, 'affected departments updated');
                    }} /> {value}</label>)}
                </div>
              </div>}
              <div className={`ncr-section ${ncrRequiredFieldClass(selectedReport, 'eventDescription')}`}>
                <h3><NcrRequiredLabel>Event Description</NcrRequiredLabel></h3>
                <textarea required rows={3} defaultValue={selectedReport.eventDescription || ''} onBlur={event => updateSelectedField({
                  eventDescription: event.target.value
                }, 'event description updated')} placeholder="Describe what happened, what was affected, and how it was discovered." />
              </div>
              <NcrEvidencePanel report={selectedReport} onUpload={uploadEvidenceWithPurpose} uploading={uploadingEvidence} />
              <div className="ncr-section">
                <h3>Containment / Disposition</h3>
                <div className="org-edit-grid">
                  <label><span>Affected product</span><input defaultValue={selectedReport.affectedProduct || ''} onBlur={event => updateSelectedField({
                      affectedProduct: event.target.value
                    }, 'affected product updated')} /></label>
                  <label><span>Affected equipment</span><input defaultValue={selectedReport.affectedEquipment || ''} onBlur={event => updateSelectedField({
                      affectedEquipment: event.target.value
                    }, 'affected equipment updated')} /></label>
                  <label><span>Affected job</span><input defaultValue={selectedReport.affectedJob || ''} onBlur={event => updateSelectedField({
                      affectedJob: event.target.value
                    }, 'affected job updated')} /></label>
                  <label><span>Disposition</span><select value={selectedReport.disposition || ''} onChange={event => updateSelectedField({
                      disposition: event.target.value
                    }, 'disposition updated')}><option value="">Unspecified</option>{NCR_DISPOSITIONS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                </div>
                <label className="ncr-checkbox-line"><input type="checkbox" checked={selectedReport.containmentRequired} onChange={event => updateSelectedField({
                    containmentRequired: event.target.checked,
                    lifecycleStage: event.target.checked ? 'containment_required' : selectedReport.lifecycleStage
                  }, 'containment updated')} /> Immediate quarantine</label>
                <textarea rows={3} defaultValue={selectedReport.containmentSummary || ''} onBlur={event => updateSelectedField({
                  containmentSummary: event.target.value
                }, 'containment summary updated')} placeholder="Immediate quarantine, hold, communication, or customer protection steps..." />
                <textarea rows={2} defaultValue={selectedReport.dispositionNotes || ''} onBlur={event => updateSelectedField({
                  dispositionNotes: event.target.value
                }, 'disposition notes updated')} placeholder="Disposition notes, approvals, customer concession notes..." />
                <textarea rows={3} defaultValue={selectedReport.followUpDetails || ''} onBlur={event => updateSelectedField({
                  followUpDetails: event.target.value
                }, 'follow-up details updated')} placeholder="Follow-up details, open checks, owner notes, or customer updates..." />
              </div>
              <div className="ncr-section">
                <h3>Root Cause</h3>
                <div className="org-edit-grid ncr-root-cause-grid">
                  <label>
                    <span>Root Cause Analysis</span>
                    <select value={getNcrRootCauseValue(selectedReport)} onChange={event => updateSelectedField({
                      rootCauseCodes: event.target.value,
                      rootCauseAnalysis: event.target.value,
                      lifecycleStage: selectedReport.lifecycleStage === 'submitted' ? 'root_cause' : selectedReport.lifecycleStage
                    }, 'root cause updated')}>
                      <option value="">Unspecified</option>
                      {getNcrRootCauseOptions(getNcrRootCauseValue(selectedReport)).map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="ncr-section">
                <h3>Corrective Actions</h3>
                <div className="org-edit-grid">
                  <label><span>Date of Initial Corrective Action</span><input type="date" defaultValue={selectedReport.dateInitialCorrectiveAction || ''} onBlur={event => updateSelectedField({
                      dateInitialCorrectiveAction: event.target.value
                    }, 'initial corrective action date updated')} /></label>
                  <label><span>Permanent Action Completed</span><input type="date" defaultValue={selectedReport.datePermanentCorrectiveActionCompleted || ''} onBlur={event => updateSelectedField({
                      datePermanentCorrectiveActionCompleted: event.target.value
                    }, 'permanent action completion date updated')} /></label>
                </div>
                <textarea rows={3} defaultValue={selectedReport.immediateAction || ''} onBlur={event => updateSelectedField({
                  immediateAction: event.target.value
                }, 'immediate action updated')} placeholder="Immediate correction or containment action..." />
                <textarea rows={3} defaultValue={selectedReport.permanentAction || ''} onBlur={event => updateSelectedField({
                  permanentAction: event.target.value,
                  lifecycleStage: selectedReport.lifecycleStage === 'root_cause' ? 'corrective_action' : selectedReport.lifecycleStage
                }, 'permanent action updated')} placeholder="Permanent corrective action to prevent recurrence..." />
                <textarea rows={3} defaultValue={selectedReport.longTermFollowUp || ''} onBlur={event => updateSelectedField({
                  longTermFollowUp: event.target.value
                }, 'long-term follow-up updated')} placeholder="Long-term follow-up plan, inspection cadence, or verification window..." />
              </div>
              <div className="ncr-section">
                <h3>Native NCR Action Items</h3>
                <div className="ncr-action-list">
                  {(selectedReport.actionItems || []).map(action => <div key={action.id} className="ncr-action-row">
                      <div>
                        <strong>{action.title}</strong>
                        <small>{people.find(person => person.id === action.ownerId)?.name || 'Unassigned'} · {action.dueDate ? formatDate(action.dueDate) : 'No due date'}</small>
                      </div>
                      <select value={action.status || 'open'} onChange={event => updateAction(action, {
                      status: event.target.value
                    })} disabled={saving}>
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="complete">Complete</option>
                      </select>
                    </div>)}
                  {(selectedReport.actionItems || []).length === 0 && <p>No native NCR action items yet.</p>}
                </div>
                <div className="ncr-action-create">
                  <input value={actionDraft.title} onChange={event => setActionDraft(prev => ({
                    ...prev,
                    title: event.target.value
                  }))} placeholder="Corrective action item..." />
                  <select value={actionDraft.ownerId} onChange={event => setActionDraft(prev => ({
                    ...prev,
                    ownerId: event.target.value
                  }))}><option value="">Owner</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
                  <input type="date" value={actionDraft.dueDate} onChange={event => setActionDraft(prev => ({
                    ...prev,
                    dueDate: event.target.value
                  }))} />
                  <button type="button" className="btn btn-secondary btn-xs" onClick={addActionItem} disabled={saving || !actionDraft.title.trim()}><Plus size={12} /> Add action</button>
                </div>
              </div>
              <div className="ncr-section">
                <h3>Effectiveness Verification</h3>
                <div className="ncr-binary-grid">
                  <label><span>Action Effective?</span><NcrYesNoSelect value={selectedReport.actionEffective} onChange={value => updateSelectedField({
                      actionEffective: value,
                      recurrencePrevented: ncrYesNoToBoolean(value),
                      effectivenessCheckedAt: value ? new Date().toISOString() : null,
                      effectivenessCheckedBy: value ? currentUser.id : '',
                      lifecycleStage: selectedReport.lifecycleStage === 'corrective_action' && value ? 'effectiveness_check' : selectedReport.lifecycleStage
                    }, 'effectiveness outcome updated')} disabled={saving} ariaLabel="Action effective yes or no" /></label>
                  <label><span>Prevented recurrence?</span><NcrYesNoSelect value={selectedReport.recurrencePrevented} onChange={value => updateSelectedField({
                      recurrencePrevented: ncrYesNoToBoolean(value)
                    }, 'recurrence check updated')} disabled={saving} blankLabel="Not assessed" ariaLabel="Prevented recurrence yes or no" /></label>
                  <label><span>Repeat issue?</span><NcrYesNoSelect value={selectedReport.repeatIssue} onChange={value => updateSelectedField({
                      repeatIssue: ncrYesNoToBoolean(value)
                    }, 'repeat issue updated')} disabled={saving} blankLabel="Not assessed" ariaLabel="Repeat issue yes or no" /></label>
                  <label><span>Date of review</span><input type="date" value={selectedReport.dateOfReview || ''} onChange={event => updateSelectedField({
                      dateOfReview: event.target.value
                    }, 'review date updated')} /></label>
                  <label><span>Date of sign-off</span><input type="date" value={selectedReport.dateOfSignOff || ''} onChange={event => updateSelectedField({
                      dateOfSignOff: event.target.value
                    }, 'sign-off date updated')} /></label>
                </div>
                <textarea rows={3} defaultValue={selectedReport.effectivenessSummary || ''} onBlur={event => updateSelectedField({
                  effectivenessSummary: event.target.value,
                  effectivenessCheckedAt: new Date().toISOString(),
                  effectivenessCheckedBy: currentUser.id,
                  lifecycleStage: selectedReport.lifecycleStage === 'corrective_action' ? 'effectiveness_check' : selectedReport.lifecycleStage
                }, 'effectiveness evidence updated')} placeholder="Verification evidence, sample checked, date range, reviewed records, or customer confirmation..." />
              </div>
              {isAdvancedNcrView && <div className="ncr-section">
                <h3>Signatures / Approvals</h3>
                <NcrSignatureLevels report={selectedReport} people={people} />
                <div className="ncr-signature-list">
                  {(selectedReport.signatures || []).map(signature => <div key={signature.id} className="ncr-signature-row">
                      <div>
                        <strong>{getNcrSignatureRoleLabel(signature.role)}</strong>
                        <span>{signature.signedByName || people.find(person => person.id === signature.signedBy)?.name || 'Signed'} · {signature.signedAt ? formatDate(signature.signedAt) : ''}</span>
                      </div>
                      {signature.signatureDataUrl ? <img src={signature.signatureDataUrl} alt={`${signature.role} signature`} /> : <Badge color="var(--success)">captured</Badge>}
                    </div>)}
                  {(selectedReport.signatures || []).length === 0 && <p>No NCR signoffs captured yet.</p>}
                </div>
                <div className="ncr-signature-create">
                  <select value={signatureDraft.role} onChange={event => setSignatureDraft(prev => ({
                    ...prev,
                    role: event.target.value
                  }))}>
                    <option value="department_manager">Department manager signoff</option>
                    <option value="executive">Senior management agreement</option>
                    <option value="author">Author signoff</option>
                    <option value="reviewer">Reviewer signoff</option>
                  </select>
                  <select value={signatureDraft.signedBy} onChange={event => {
                    const person = people.find(profile => profile.id === event.target.value);
                    setSignatureDraft(prev => ({
                      ...prev,
                      signedBy: event.target.value,
                      signedByName: person?.name || prev.signedByName
                    }));
                  }}>
                    <option value="">Typed signature only</option>
                    {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                  <input value={signatureDraft.signedByName} onChange={event => setSignatureDraft(prev => ({
                    ...prev,
                    signedByName: event.target.value
                  }))} placeholder="Typed signature name" />
                  <button type="button" className="btn btn-secondary btn-xs" onClick={captureSignature} disabled={saving || !signatureDraft.signedByName.trim()}><Check size={12} /> Capture signoff</button>
                </div>
              </div>}
              {isAdvancedNcrView && <div className="ncr-section">
                <h3>Audit Trail</h3>
                <div className="ncr-audit-list">
                  {(selectedReport.auditEvents || []).slice(0, 10).map(event => <div key={event.id} className="ncr-audit-row">
                      <strong>{event.eventType?.replaceAll('_', ' ')}</strong>
                      <span>{event.fieldName || 'NCR'} · {people.find(person => person.id === event.actorId)?.name || 'System'} · {timeAgo(event.createdAt)}</span>
                    </div>)}
                  {(selectedReport.auditEvents || []).length === 0 && <p>No audit events yet.</p>}
                </div>
              </div>}
              <div className="ncr-section ncr-lifecycle-panel">
                <h3>Lifecycle + Ownership</h3>
                <div className="org-edit-grid">
                  <label><span>Stage</span><select value={selectedReport.lifecycleStage || 'draft'} onChange={event => updateSelectedField({
                      lifecycleStage: event.target.value
                    }, `moved to ${getNcrStageLabel(event.target.value)}`)} disabled={saving}>{NCR_LIFECYCLE_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
                  <label><span><DefinedTerm id="ncr_owner">NCR Owner</DefinedTerm></span><select value={selectedReport.ownerId || ''} onChange={event => updateSelectedField({
                      ownerId: event.target.value
                    }, 'owner updated')} disabled={saving}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                  <label><span><DefinedTerm id="reviewer">Reviewer / Approver</DefinedTerm></span><select value={selectedReport.reviewerId || ''} onChange={event => updateSelectedField({
                      reviewerId: event.target.value
                    }, 'reviewer updated')} disabled={saving}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                  <label><span><DefinedTerm id="verifier">Effectiveness Verifier</DefinedTerm></span><select value={selectedReport.verifierId || ''} onChange={event => updateSelectedField({
                      verifierId: event.target.value
                    }, 'verifier updated')} disabled={saving}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                </div>
                <div className="ncr-closure-readiness">
                  <strong>{getNcrClosureBlockers(selectedReport).length ? 'Closure blockers' : 'Ready for closure'}</strong>
                  {getNcrClosureBlockers(selectedReport).length ? <ul>{getNcrClosureBlockers(selectedReport).map(blocker => <li key={blocker}>{blocker}</li>)}</ul> : <p>All required actions, signoffs, and effectiveness checks are complete.</p>}
                </div>
              </div>

              <div className="ncr-actions">
                <button className="btn btn-secondary" onClick={exportSelectedPdf}>
                  <Download size={14} /> Detail PDF packet
                </button>
                {linkedObjective ? <button className="btn btn-primary" onClick={() => onOpenObjective?.(linkedObjective, 'workflow')}>
                    <Target size={14} /> Open linked objective
                  </button> : <button className="btn btn-primary" onClick={createObjective} disabled={saving}>
                    {saving ? <Loader2 size={14} style={{
                    animation: 'spin 1s linear infinite'
                  }} /> : <Plus size={14} />} Create objective
                  </button>}
                {selectedReport.closed ? <button className="btn btn-secondary" onClick={() => updateSelected({
                  closed: false
                }, `NCR #${selectedReport.reportNumber} reopened`)} disabled={saving}>Reopen</button> : <button className="btn btn-secondary" onClick={approveClosure} disabled={saving}>
                    <Check size={14} /> Approve closure
                  </button>}
              </div>
            </>}
        </aside>
      </div>
        </>}

      {ncrMode === 'analytics' && <div className="ncr-analytics-page">
          <div className="ncr-analytics-hero card">
            <div>
              <div className="flex items-center gap-8"><Sparkles size={18} color="var(--brand)" /><h2>NCR Analytics</h2></div>
              <p>Trend detection, KPA-style breakdowns, open/closed aging, and AI failure grouping. Mirrors the full KPA report set while improving it with normalized failure language.</p>
            </div>
            <div className="ncr-export-group" role="group" aria-label="Analytics exports">
              <ExportMenu label="Export" reports={[{
              id: 'analytics',
              label: 'Analytics summary',
              desc: 'Open / closed, criticality, and aging rollup',
              formats: ['pdf', 'excel', 'csv']
            }, {
              id: 'list',
              label: 'Full NCR list',
              desc: 'Every NCR with all its fields',
              formats: ['csv'],
              count: reports.length,
              unit: reports.length === 1 ? 'NCR' : 'NCRs'
            }, {
              id: 'individual',
              label: 'Individual CSV',
              desc: 'One row per NCR response',
              formats: ['csv']
            }, {
              id: 'trends',
              label: 'Issue trends',
              desc: 'Repeating failure themes',
              formats: ['csv']
            }]} onExport={(id, fmt) => {
              if (id === 'analytics' && fmt === 'pdf') return exportAnalyticsPdf();
              if (id === 'analytics' && fmt === 'excel') return exportAnalyticsExcel();
              if (id === 'analytics' && fmt === 'csv') return exportAnalyticsCsv();
              if (id === 'list') return exportTrackerListCsv();
              if (id === 'individual') return exportIndividualCsv();
              if (id === 'trends') return exportIssueTrendCsv();
              return undefined;
            }} />
            </div>
          </div>
          <div className="ncr-analytics-filters card">
            <div className="ncr-analytics-filters-label"><Filter size={14} color="var(--brand)" /><span>Scope</span></div>
            <div className="ncr-date-range">
              <label><span>From</span><input type="date" value={analyticsDateFrom} onChange={event => setAnalyticsDateFrom(event.target.value)} aria-label="Analytics report date from" /></label>
              <label><span>To</span><input type="date" value={analyticsDateTo} onChange={event => setAnalyticsDateTo(event.target.value)} aria-label="Analytics report date to" /></label>
            </div>
            <select value={analyticsDepartment} onChange={event => setAnalyticsDepartment(event.target.value)} aria-label="Analytics group filter">
              <option value="all">All Groups</option>
              {departments.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={analyticsCriticality} onChange={event => setAnalyticsCriticality(event.target.value)} aria-label="Analytics criticality filter">
              <option value="all">All Criticality</option>
              {severities.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <span className="ncr-analytics-filters-count">
              {analyticsFilterCount ? <>Filtered to <strong>{analyticsScope.length}</strong> of {reports.length} NCRs — charts and exports follow this scope</> : <>All <strong>{reports.length}</strong> NCRs in scope</>}
            </span>
            {analyticsFilterCount > 0 && <button type="button" className="btn btn-ghost btn-xs" onClick={clearAnalyticsFilters}>
                <X size={12} /> Clear ({analyticsFilterCount})
              </button>}
            <FieldKeyHint label="Key" termId="failure_taxonomy" />
          </div>
          {isAdvancedNcrView && <div className="ncr-report-set card">
            <span>KPA baseline reports matched:</span>
            {['Individual', 'Trend', 'Map', 'Observer', 'Employee', 'Worksite/Area', 'Operator and Location', 'Date and Time Event', 'Internal/External', 'Type of Event', 'Non-Productive Time', 'NPT Amount'].map(label => <strong key={label}>{label}</strong>)}
          </div>}
          <div className="ncr-kpis">
            <KPICard label="Open" value={analytics.active} icon={AlertCircle} color="var(--brand)" />
            <KPICard label="Closed" value={analytics.closed} icon={CheckCircle2} color="var(--success)" />
            <KPICard label="Past Due" value={analytics.pastDue} icon={AlertTriangle} color="var(--error)" />
            <KPICard label="Critical Open" value={analytics.critical} icon={Shield} color="var(--error)" />
            <KPICard label="Total NCRs" value={analyticsScope.length} icon={FileText} color="var(--info)" sub={analyticsFilterCount ? `of ${reports.length} total` : undefined} />
          </div>
          <div className="ncr-trendwatch card">
            <div className="ncr-trendwatch-head">
              <div className="flex items-center gap-8">
                <Activity size={16} color="var(--brand)" />
                <h3>Trend Watch</h3>
                <Badge color="var(--brand)">Auto-surfaced</Badge>
              </div>
              <p>OMP scans every NCR in scope for rising failure groups, repeat operator issues, critical clusters, stalling work, and downtime concentration — before anyone asks.</p>
            </div>
            <div className="ncr-trendwatch-list">
              {trendWatch.map(insight => <button key={insight.id} type="button" className={`ncr-trendwatch-row ncr-trendwatch-${insight.severity}`} onClick={() => {
              if (insight.action.type === 'explore') {
                setIssueTrendQuery(insight.action.query);
              } else {
                clearTrackerFilters();
                setFlagFilter(insight.action.flag);
                setNcrMode('tracker');
              }
            }}>
                  <span className="ncr-trendwatch-flag">{insight.severity === 'high' ? 'Action' : 'Watch'}</span>
                  <span className="ncr-trendwatch-text">
                    <strong>{insight.title}</strong>
                    <small>{insight.detail}</small>
                  </span>
                  <span className="ncr-trendwatch-go" aria-hidden="true">&rsaquo;</span>
                </button>)}
              {trendWatch.length === 0 && <p className="text-xs text-muted">No emerging trends right now. Trend Watch re-checks automatically as NCRs change — rising failures, repeat operators, critical clusters, stalling work, and NPT concentration.</p>}
            </div>
          </div>
          <div className="ncr-ai-query card">
            <div className="ncr-ai-ask">
              <div className="ncr-ai-ask-head"><Sparkles size={15} color="var(--brand)" /><h3>Ask AI about these NCRs</h3></div>
              <div className="ncr-ai-input-row">
                <input value={analyticsQuery} onChange={event => setAnalyticsQuery(event.target.value)} onKeyDown={event => {
                if (event.key === 'Enter') askNcrAnalyticsAi();
              }} placeholder="How many AWC valve failures at Exxon?" aria-label="Ask AI about these NCRs" />
                <button type="button" className="btn btn-primary" onClick={() => askNcrAnalyticsAi()} disabled={analyticsAiLoading || !analyticsQuery.trim()}>
                  {analyticsAiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Ask
                </button>
              </div>
              <div className="ncr-ai-suggestions">
                {['What repeat failures are trending?', 'How many AWC valve failures?', 'Which operator has the most NPT?', 'What changed in the last 30 days?'].map(suggestion => <button key={suggestion} type="button" onClick={() => {
                setAnalyticsQuery(suggestion);
                askNcrAnalyticsAi(suggestion);
              }} disabled={analyticsAiLoading}>
                    {suggestion}
                  </button>)}
              </div>
            </div>
            <div className="ncr-ai-answer">
              {analyticsAiLoading ? <div className="ncr-ai-loading">
                  <Loader2 size={15} className="animate-spin" />
                  <span>Reading {analyticsScope.length} NCR{analyticsScope.length === 1 ? '' : 's'}...</span>
                </div> : analyticsAiResult ? <>
                  <p className="ncr-ai-answer-main">{analyticsAiResult.answer}</p>
                  <div className="ncr-ai-groups">
                    {(analyticsAiResult.groups || []).slice(0, 6).map(group => <div key={group.label} className="ncr-ai-group-row">
                        <strong>{group.count}</strong>
                        <span className="ncr-ai-group-label">{group.label}</span>
                        <span className="ncr-ai-group-examples">
                          {(group.examples || []).slice(0, 3).map(example => <button key={example} type="button" onClick={() => {
                      setNcrMode('tracker');
                      clearTrackerFilters();
                      setSearch(String(example));
                    }} title={`Open NCR #${example} in the tracker`}>
                              #{example}
                            </button>)}
                        </span>
                      </div>)}
                  </div>
                  {(analyticsAiResult.caveats || []).length > 0 && <small className="ncr-ai-caveat">{analyticsAiResult.caveats[0]}</small>}
                  <small className="ncr-ai-mode">{analyticsAiResult.mode === 'openai' ? 'Answered by NCR AI from the live report set.' : 'Answered by the built-in failure grouping (AI unavailable).'}</small>
                </> : <>
                  <p className="ncr-ai-answer-main ncr-ai-answer-idle">Top failure groups right now — ask a question for a deeper cut.</p>
                  <div className="ncr-ai-groups">
                    {analyticsAnswerRows.map(([label, count]) => <div key={label} className="ncr-ai-group-row">
                        <strong>{count}</strong>
                        <span className="ncr-ai-group-label">{label}</span>
                      </div>)}
                  </div>
                  {analytics.byFailure.length === 0 && <small className="ncr-ai-caveat">No NCRs available yet. Import KPA records to populate trends.</small>}
                </>}
            </div>
          </div>
          <div className="ncr-issue-explorer card">
            <div className="ncr-issue-explorer-head">
              <div>
                <div className="flex items-center gap-8"><Search size={16} color="var(--brand)" /><h3>Common Issue Trend Explorer</h3></div>
                <p>Search any common issue, equipment family, or process term, then see normalized failure groupings and operator subgrouping.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-xs" onClick={exportIssueTrendCsv}><Download size={13} /> Export issue CSV</button>
            </div>
            <div className="ncr-issue-search">
              <label>
                <span>Issue / equipment / process</span>
                <input value={issueTrendQuery} onChange={event => setIssueTrendQuery(event.target.value)} placeholder="valve failures, HRU, process loss, 710 valve..." />
              </label>
              <div className="ncr-issue-count">
                <strong>{issueExplorer.matches.length}</strong>
                <span>matching NCR{issueExplorer.matches.length === 1 ? '' : 's'}</span>
              </div>
            </div>
            {issueExplorer.searchGroups?.length > 0 && <div className="ncr-query-groups">
                {issueExplorer.searchGroups.map(group => <span key={group.label}>{group.label}</span>)}
              </div>}
            <div className="ncr-issue-grid">
              <NcrBreakdownCard icon={Sparkles} title="Failure Groupings" rows={issueExplorer.byFailure} />
              <NcrBreakdownCard icon={MapPin} title="Subgrouped by Operator" rows={issueExplorer.byOperator} />
              <NcrBreakdownCard icon={Wrench} title="Equipment / Process" rows={issueExplorer.byEquipmentProcess} />
              <NcrBreakdownCard icon={Network} title="Operator x Failure Group" rows={issueExplorer.byOperatorFailure} />
            </div>
            <div className="ncr-issue-examples">
              <span>Matching examples</span>
              {issueExplorer.matches.slice(0, 5).map(report => <button key={report.id} type="button" onClick={() => {
              setNcrMode('tracker');
              setSelectedId(report.id);
              clearTrackerFilters();
              setSearch(report.reportNumber || '');
            }}>
                  <strong>#{report.reportNumber}</strong>
                  <small>{report.operatorLocation || 'Unspecified operator'} · {report.normalizedFailureSummary || classifyNcrFailure(report).label}</small>
                </button>)}
              {issueExplorer.matches.length === 0 && <small>No matching NCRs yet. Import the KPA history or broaden the issue term.</small>}
            </div>
          </div>
          <div className={`ncr-analytics-grid ${isAdvancedNcrView ? '' : 'ncr-analytics-grid-basic'}`}>
            <NcrBreakdownCard icon={Sparkles} title="Normalized Failure Trends" rows={analytics.byFailure} />
            <NcrBreakdownCard icon={Building2} title="Framework departments" rows={analytics.byDepartment} />
            <NcrBreakdownCard icon={PieChart} title="Event Type" rows={analytics.byType} />
            <NcrBreakdownCard icon={AlertTriangle} title="Root Cause Codes" rows={analytics.byRootCause} />
            <NcrParticipationCard observerRows={analytics.byObserver} employeeRows={analytics.byEmployee} />
            {isAdvancedNcrView && <NcrBreakdownCard icon={MapPin} title="Worksite / Area" rows={analytics.byWorksite} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={MapPin} title="Map / Location" rows={analytics.byMapLocation} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={MapPin} title="Operator and Location" rows={analytics.byOperator} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={Calendar} title="Date and Time Event" rows={analytics.byEventDate} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={Shield} title="Internal or External Report" rows={analytics.byInternalExternal} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={Clock} title="Non-Productive Time" rows={analytics.byNpt} />}
            {isAdvancedNcrView && <NcrBreakdownCard icon={DollarSign} title="Non-Productive Time Amount" rows={analytics.byNptAmount} />}
            {isAdvancedNcrView && <div className="card ncr-breakdown-card">
              <div className="ncr-breakdown-head"><Clock size={15} color="var(--brand)" /><h3>Open Aging</h3></div>
              {analytics.aging.slice(0, 8).map(({
              report,
              days
            }) => <div key={report.id} className="ncr-aging-row">
                  <span>#{report.reportNumber}</span>
                  <strong>{days}d</strong>
                </div>)}
              {analytics.aging.length === 0 && <p className="text-xs text-muted">No open NCRs to age.</p>}
            </div>}
          </div>
        </div>}

      {ncrMode === 'import' && <div className="ncr-import-page card">
          <div className="ncr-import-head">
            <div>
              <h2>KPA Historical Import</h2>
              <p>Upload the complete KPA Excel or CSV export whenever possible. OMP keys each row by NCR report number, so the newest KPA list takes priority: matching report numbers replace the imported NCR fields in bulk, new report numbers are created, and the raw KPA source record stays auditable. Evidence, signatures, action items, and audit history stay attached to the NCR.</p>
            </div>
            <div className="ncr-import-head-actions">
              <button type="button" className="btn btn-secondary" onClick={exportKpaImportTemplate}>
                <Download size={14} /> Template CSV
              </button>
              <label className="btn btn-primary">
                <Upload size={14} /> Choose Excel/CSV
                <input type="file" accept=".xlsx,.xls,.csv" onChange={parseImportFile} hidden />
              </label>
            </div>
          </div>
          <div className="ncr-import-status">
            <Badge color="var(--brand)">Source: KPA</Badge>
            <Badge color="var(--warning)">Newest list wins</Badge>
            <Badge color={importPreview.length ? 'var(--success)' : 'var(--accent-7)'}>{importPreview.length} preview row{importPreview.length === 1 ? '' : 's'}</Badge>
            <span>{importFileName || 'No file selected yet'}</span>
          </div>
          {importPreview.length > 0 ? <>
              <div className="ncr-import-toolbar">
                <div style={{
              position: 'relative',
              flex: '1 1 220px'
            }}>
                  <Search size={14} style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--accent-7)'
              }} />
                  <input value={importSearch} onChange={event => setImportSearch(event.target.value)} placeholder="Search preview rows..." style={{
                paddingLeft: 30,
                width: '100%'
              }} aria-label="Search import preview" />
                </div>
                <select value={importActionFilter} onChange={event => setImportActionFilter(event.target.value)} aria-label="Filter by import action">
                  <option value="all">All Import Actions</option>
                  <option value="Create new">Create new</option>
                  <option value="Replace existing">Replace existing</option>
                </select>
                <span className="ncr-import-count">
                  {filteredImportPreview.length === importPreview.length ? `${importPreview.length} parsed row${importPreview.length === 1 ? '' : 's'}` : `${filteredImportPreview.length} of ${importPreview.length} rows match`}
                </span>
                {(importSearch || importActionFilter !== 'all') && <button type="button" className="btn btn-ghost btn-xs" onClick={() => {
              setImportSearch('');
              setImportActionFilter('all');
            }}>
                    <X size={12} /> Clear
                  </button>}
              </div>
              <div className="ncr-import-table-wrap">
                <table className="objectives-table ncr-import-table">
                  <thead><tr><th>Report</th><th>Import Action</th><th>Date</th><th>Main Department</th><th>Group</th><th>Type</th><th>Failure Group</th><th>Description</th></tr></thead>
                  <tbody>
                    {filteredImportPreview.slice(0, 20).map((row, index) => <tr key={`${row.reportNumber}-${index}`}>
                        <td>{row.reportNumber}</td>
                        <td><Badge color={row.importAction === 'Replace existing' ? 'var(--warning)' : 'var(--success)'}>{row.importAction || 'Create new'}</Badge></td>
                        <td>{row.reportDate}</td>
                        <td>{row.mainDepartment || <span className="text-muted">→ triage</span>}</td>
                        <td>{row.departmentGroup}</td>
                        <td>{row.eventType}</td>
                        <td>{row.normalizedFailureSummary}</td>
                        <td>{row.eventDescription.slice(0, 120)}</td>
                      </tr>)}
                  </tbody>
                </table>
                {filteredImportPreview.length === 0 && <EmptyState icon={Search} text="No preview rows match that filter." />}
                {filteredImportPreview.length > 20 && <p className="text-xs text-muted" style={{
              margin: '8px 2px 0'
            }}>
                    Showing first 20 of {filteredImportPreview.length} matching rows. Committing imports every parsed row regardless of preview filters.
                  </p>}
              </div>
              <div className="ncr-import-actions">
                <button type="button" className="btn btn-secondary" onClick={() => {
              setImportPreview([]);
              setImportSearch('');
              setImportActionFilter('all');
            }}>Clear preview</button>
                <button type="button" className="btn btn-primary" onClick={commitImport} disabled={importing}>
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Apply KPA as priority list ({importPreview.length} row{importPreview.length === 1 ? '' : 's'})
                </button>
              </div>
            </> : <EmptyState icon={Upload} text="Choose a KPA Excel or CSV export to preview the historical NCR migration." />}
        </div>}

      {showCreateModal && <div className="modal-overlay" style={{
        zIndex: 1300
      }} onClick={event => {
        if (event.target === event.currentTarget) closeCreateModal();
      }}>
          <div className="modal-content" style={{
          width: 'min(96vw, 900px)',
          maxHeight: '88vh',
          overflowY: 'auto'
        }}>
            <div className="card-header">
              <FileText size={16} color="var(--brand)" />
              <span className="text-md font-bold">Create NCR</span>
            </div>
            <div style={{
            padding: 16
          }}>
              <div className="org-edit-grid">
                <div className="ncr-report-number-field">
                  <label className={ncrRequiredFieldClass(createDraft, 'reportNumber')}>
                    <NcrRequiredLabel>Report Number</NcrRequiredLabel>
                    <input required value={createDraft.reportNumber} onChange={event => setCreateDraft(prev => ({
                    ...prev,
                    reportNumber: event.target.value
                  }))} placeholder={getNextNcrReportNumber(reports)} autoFocus />
                  </label>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={refreshCreateReportNumber} aria-label="Use next NCR report number">
                    <RefreshCw size={12} /> Auto #
                  </button>
                </div>
                <label className={ncrRequiredFieldClass(createDraft, 'reportDate')}><NcrRequiredLabel>Report Date</NcrRequiredLabel><input required type="date" value={createDraft.reportDate} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  reportDate: event.target.value
                }))} /></label>
                <label className={ncrRequiredFieldClass(createDraft, 'observer')}><NcrRequiredLabel>Observer</NcrRequiredLabel><input required value={createDraft.observer} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  observer: event.target.value
                }))} /></label>
                <label className={ncrRequiredFieldClass(createDraft, 'author')}><NcrRequiredLabel>Author</NcrRequiredLabel><input required value={createDraft.author} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  author: event.target.value
                }))} /></label>
                <label className={ncrRequiredFieldClass(createDraft, 'mainDepartment')}><NcrRequiredLabel>Main Department</NcrRequiredLabel><select required value={createDraft.mainDepartment || ''} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  mainDepartment: event.target.value
                }))}><option value="">Select…</option>{OMP_DEPARTMENTS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className={ncrRequiredFieldClass(createDraft, 'primaryGroupAffected')}><NcrRequiredLabel>Primary Group Affected</NcrRequiredLabel><select required value={createDraft.departmentGroup} onChange={event => setCreateDraft(prev => {
                  const nextDepartments = mergeNcrPrimaryGroup(event.target.value, prev.affectedDepartmentList || []);
                  return {
                    ...prev,
                    departmentGroup: event.target.value,
                    affectedDepartmentList: nextDepartments,
                    affectedDepartments: nextDepartments.join(', '),
                    mainDepartment: prev.mainDepartment || getNcrGroupDepartment(event.target.value) || ''
                  };
                })}><option value="">Unspecified</option>{NCR_DEPARTMENT_GROUPS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className={ncrRequiredFieldClass(createDraft, 'eventType')}><NcrRequiredLabel>Type of Event</NcrRequiredLabel><select required value={createDraft.eventType} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  eventType: event.target.value,
                  eventTypes: event.target.value ? [event.target.value] : []
                }))}><option value="">Unspecified</option>{NCR_EVENT_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className={ncrRequiredFieldClass(createDraft, 'criticality')}><NcrRequiredLabel>Criticality</NcrRequiredLabel><select required value={createDraft.criticality} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  criticality: event.target.value,
                  severity: event.target.value
                }))}><option value="">Unspecified</option>{NCR_CRITICALITY.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className={ncrRequiredFieldClass(createDraft, 'internalExternal')}><NcrRequiredLabel>Internal / External</NcrRequiredLabel><select required value={createDraft.internalExternal} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  internalExternal: event.target.value
                }))}><option value="">Unspecified</option>{NCR_INTERNAL_EXTERNAL.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label><span>Lifecycle Stage</span><select value={createDraft.lifecycleStage} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  lifecycleStage: event.target.value,
                  status: event.target.value === 'closed' ? 'closed' : event.target.value === 'draft' || event.target.value === 'submitted' ? 'open' : 'in_progress'
                }))}>{NCR_LIFECYCLE_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
                <label><span>NCR Owner</span><select value={createDraft.ownerId} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  ownerId: event.target.value
                }))}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label><span>Reviewer</span><select value={createDraft.reviewerId} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  reviewerId: event.target.value
                }))}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label><span>Verifier</span><select value={createDraft.verifierId} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  verifierId: event.target.value
                }))}><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label className={ncrRequiredFieldClass(createDraft, 'operatorLocation')}><NcrRequiredLabel>Operator and Location</NcrRequiredLabel><input required value={createDraft.operatorLocation} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  operatorLocation: event.target.value
                }))} /></label>
                <label className={ncrRequiredFieldClass(createDraft, 'worksiteArea')}><NcrRequiredLabel>Worksite / Area</NcrRequiredLabel><select required value={createDraft.worksiteArea} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  worksiteArea: event.target.value
                }))}><option value="">Unspecified</option>{NCR_WORKSITE_AREAS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className={ncrRequiredFieldClass(createDraft, 'eventAt')}><NcrRequiredLabel>Date and Time Event</NcrRequiredLabel><input required type="datetime-local" value={createDraft.eventAt} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  eventAt: event.target.value
                }))} /></label>
                <label><span>NPT</span><select value={createDraft.nonProductiveTime} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  nonProductiveTime: event.target.value
                }))}><option value="">Unspecified</option><option value="No">No</option><option value="Yes">Yes</option></select></label>
                <label><span>NPT Amount</span><input type="number" min="0" step="0.1" value={createDraft.nonProductiveTimeAmount} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  nonProductiveTimeAmount: event.target.value
                }))} /></label>
                <label><span>Estimated Cost</span><input type="number" min="0" step="0.01" value={createDraft.estimatedCost} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  estimatedCost: event.target.value
                }))} /></label>
                <label><span>Time Frame for Action</span><select value={createDraft.timeFrameForAction} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  timeFrameForAction: event.target.value
                }))}><option value="">Unspecified</option>{NCR_ACTION_TIMEFRAMES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label><span>Follow-Up Count</span><input type="number" min="0" step="1" value={createDraft.followUpCount} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  followUpCount: event.target.value
                }))} /></label>
                <label><span>Follow-Up Due Date</span><input type="date" value={createDraft.followUpDueDate} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  followUpDueDate: event.target.value
                }))} /></label>
                <label><span>Source Sheet</span><input value={createDraft.sourceSheet} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  sourceSheet: event.target.value
                }))} /></label>
                <label><span>Source Link</span><input value={createDraft.sourceLink} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  sourceLink: event.target.value
                }))} placeholder="https://..." /></label>
                <label><span>Personnel Involved</span><input value={createDraft.personnelInvolved} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  personnelInvolved: event.target.value
                }))} /></label>
                <label>
                  <span>Root Cause Analysis</span>
                  <select value={getNcrRootCauseValue(createDraft)} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  rootCauseCodes: event.target.value,
                  rootCauseAnalysis: event.target.value,
                  lifecycleStage: prev.lifecycleStage === 'submitted' ? 'root_cause' : prev.lifecycleStage
                }))}>
                    <option value="">Unspecified</option>
                    {getNcrRootCauseOptions(getNcrRootCauseValue(createDraft)).map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label><span>Affected Product</span><input value={createDraft.affectedProduct} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  affectedProduct: event.target.value
                }))} /></label>
                <label><span>Affected Equipment</span><input value={createDraft.affectedEquipment} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  affectedEquipment: event.target.value
                }))} /></label>
                <label><span>Affected Job</span><input value={createDraft.affectedJob} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  affectedJob: event.target.value
                }))} /></label>
                <label><span>Disposition</span><select value={createDraft.disposition} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  disposition: event.target.value
                }))}><option value="">Unspecified</option>{NCR_DISPOSITIONS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label><span>Date of Initial Corrective Action</span><input type="date" value={createDraft.dateInitialCorrectiveAction} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  dateInitialCorrectiveAction: event.target.value
                }))} /></label>
                <label><span>Permanent Action Completed</span><input type="date" value={createDraft.datePermanentCorrectiveActionCompleted} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  datePermanentCorrectiveActionCompleted: event.target.value
                }))} /></label>
                <label><span>Date of Review</span><input type="date" value={createDraft.dateOfReview} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  dateOfReview: event.target.value
                }))} /></label>
                <label><span>Date of Sign-off</span><input type="date" value={createDraft.dateOfSignOff} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  dateOfSignOff: event.target.value
                }))} /></label>
                <label><span>Action Effective?</span><NcrYesNoSelect value={createDraft.actionEffective} onChange={value => setCreateDraft(prev => ({
                  ...prev,
                  actionEffective: value,
                  recurrencePrevented: ncrYesNoToBoolean(value),
                  effectivenessCheckedAt: value ? new Date().toISOString() : prev.effectivenessCheckedAt,
                  effectivenessCheckedBy: value ? currentUser?.id : prev.effectivenessCheckedBy
                }))} ariaLabel="Action effective yes or no" /></label>
              </div>
              <div ref={createPhotoDropRef} className={`ncr-create-photo-drop ${createEvidenceDragOver ? 'drag-over' : ''}`} onDragEnter={handleCreateEvidenceDrag} onDragOver={handleCreateEvidenceDrag} onDragLeave={handleCreateEvidenceDragLeave} onDrop={handleCreateEvidenceDrop} onPaste={handleCreateEvidencePaste}>
                <div className="ncr-create-photo-drop-head">
                  <div className="ncr-create-photo-copy">
                    <span className="ncr-create-photo-icon"><Camera size={16} /></span>
                    <div>
                      <strong>Photos + documentation</strong>
                      <small>Drop photos, PDFs, spreadsheets, or support docs here before creating the NCR.</small>
                    </div>
                  </div>
                  <div className="ncr-create-photo-actions">
                    <label className="btn btn-secondary btn-xs ncr-create-photo-button">
                      <Image size={12} /> Add photos
                      <input type="file" accept={NCR_PHOTO_ACCEPT} capture="environment" multiple hidden disabled={creating} onChange={event => {
                      addCreateEvidenceFiles(event.target.files);
                      event.target.value = '';
                    }} />
                    </label>
                    <label className="btn btn-secondary btn-xs ncr-create-photo-button">
                      <Paperclip size={12} /> Add docs
                      <input type="file" accept={NCR_DOCUMENT_ACCEPT} multiple hidden disabled={creating} onChange={event => {
                      addCreateEvidenceFiles(event.target.files);
                      event.target.value = '';
                    }} />
                    </label>
                  </div>
                </div>
                {createEvidenceFiles.length > 0 && <div className="ncr-create-photo-list">
                    {createEvidenceFiles.map((file, index) => <div key={`${file.name}-${file.size}-${index}`} className="ncr-create-photo-chip">
                        <Image size={13} />
                        <span title={file.name}>
                          <strong>{file.name}</strong>
                          <small>{formatNcrPhotoFileSize(file.size)}</small>
                        </span>
                        <button type="button" className="icon-btn" onClick={() => removeCreateEvidenceFile(index)} aria-label={`Remove ${file.name}`} disabled={creating}>
                          <X size={12} />
                        </button>
                      </div>)}
                  </div>}
              </div>
              <div className={`ncr-checkbox-cloud ncr-required-field${isNcrRequiredFieldMissing(createDraft, 'eventType') ? ' ncr-required-missing' : ''}`}>
                <NcrRequiredLabel>Type of Event</NcrRequiredLabel>
                {NCR_EVENT_TYPES.map(value => <label key={value}><input type="checkbox" checked={(createDraft.eventTypes || []).includes(value)} onChange={() => setCreateDraft(prev => {
                  const next = toggleArrayValue(prev.eventTypes || [], value);
                  return {
                    ...prev,
                    eventTypes: next,
                    eventType: next[0] || ''
                  };
                })} /> {value}</label>)}
              </div>
              <div className="ncr-checkbox-cloud">
                <span>Affected Departments</span>
                {NCR_DEPARTMENT_GROUPS.map(value => <label key={value}><input type="checkbox" checked={(createDraft.affectedDepartmentList || []).includes(value)} onChange={() => setCreateDraft(prev => {
                  const next = toggleArrayValue(sanitizeNcrDepartmentList(prev.affectedDepartmentList || []), value);
                  const nextPrimary = next.includes(prev.departmentGroup) ? prev.departmentGroup : next[0] || '';
                  const nextDepartments = mergeNcrPrimaryGroup(nextPrimary, next);
                  return {
                    ...prev,
                    affectedDepartmentList: nextDepartments,
                    affectedDepartments: nextDepartments.join(', '),
                    departmentGroup: nextPrimary
                  };
                })} /> {value}</label>)}
              </div>
              <div style={{
              display: 'grid',
              gap: 10,
              marginTop: 10
            }}>
                <label className={ncrRequiredFieldClass(createDraft, 'eventDescription')}><NcrRequiredLabel>Event Description</NcrRequiredLabel><textarea required rows={3} value={createDraft.eventDescription} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  eventDescription: event.target.value
                }))} /></label>
                <label className="ncr-checkbox-line"><input type="checkbox" checked={createDraft.containmentRequired} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  containmentRequired: event.target.checked,
                  lifecycleStage: event.target.checked ? 'containment_required' : prev.lifecycleStage
                }))} /> Immediate quarantine</label>
                <label><span className="text-xs text-muted">Containment Summary</span><textarea rows={3} value={createDraft.containmentSummary} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  containmentSummary: event.target.value
                }))} /></label>
                <label><span className="text-xs text-muted">Disposition Notes</span><textarea rows={2} value={createDraft.dispositionNotes} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  dispositionNotes: event.target.value
                }))} /></label>
                <label><span className="text-xs text-muted">Follow-Up Details</span><textarea rows={3} value={createDraft.followUpDetails} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  followUpDetails: event.target.value
                }))} /></label>
                <label><span className="text-xs text-muted">Immediate Action</span><textarea rows={3} value={createDraft.immediateAction} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  immediateAction: event.target.value
                }))} /></label>
                <label><span className="text-xs text-muted">Permanent Action</span><textarea rows={3} value={createDraft.permanentAction} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  permanentAction: event.target.value
                }))} /></label>
                <label><span className="text-xs text-muted">Long-Term Follow-Up</span><textarea rows={3} value={createDraft.longTermFollowUp} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  longTermFollowUp: event.target.value
                }))} /></label>
                <label><span className="text-xs text-muted">Effectiveness Verification</span><textarea rows={3} value={createDraft.effectivenessSummary} onChange={event => setCreateDraft(prev => ({
                  ...prev,
                  effectivenessSummary: event.target.value
                }))} placeholder="Verification evidence, sample checked, date range, reviewed records, or customer confirmation..." /></label>
              </div>
              {createMissingRequiredFields.length > 0 && <div className="ncr-required-summary">
                  <AlertCircle size={14} />
                  <span>Complete required fields before creating: {createMissingRequiredFields.slice(0, 5).map(field => field.label).join(', ')}{createMissingRequiredFields.length > 5 ? `, +${createMissingRequiredFields.length - 5} more` : ''}.</span>
                </div>}
              <div className="flex gap-8 justify-between" style={{
              marginTop: 14
            }}>
                <button className="btn btn-secondary" onClick={closeCreateModal} disabled={creating}>Cancel</button>
                <button className="btn btn-primary" onClick={createReport} disabled={creating || createMissingRequiredFields.length > 0}>
                  {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {creating ? 'Creating...' : 'Create NCR'}
                </button>
              </div>
            </div>
          </div>
        </div>}
    </div>
    </FieldKeyProvider>;
};

// ============================================================================
// ORGANIZATION PAGE
// ============================================================================
const escapeExportHtml = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export default NcrPage;
