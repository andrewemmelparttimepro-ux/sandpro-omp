import { useState, useMemo, useRef, useEffect, useCallback, Suspense } from 'react';
import {
  Search, ChevronDown, ChevronLeft, Target, CheckCircle2, AlertTriangle, Clock, AlertCircle,
  Building2, Activity, MessageSquare, Network, X, Filter, Layers, LayoutGrid, Columns3,
  Plus, UserPlus, Shield, Download, Upload, Settings, Users, BarChart3, FileText,
  Globe, Mail, Bell, Star, List, Edit3, Check, Paperclip, Send, Trash2, Loader2, Image, File as FileIcon, Wrench, Camera, RefreshCw,
  PieChart, MapPin, Sparkles, UserCircle, Calendar, DollarSign, GripVertical, Volume2, VolumeX, Radio,
  ClipboardCheck
} from 'lucide-react';
import { getUser, getProfiles, getStatusColor, getStatusLabel, DEPARTMENTS, DEFAULT_DEPARTMENT, getDepartmentOptions, canManageOrgChart, canManagePermissions } from '../data';
import { Avatar, Badge } from '../uiPrimitives';
import { ProgressBar, KPICard, ObjectiveCard, EmptyState, FeatureHelp, FilePreviewModal, TagMentionControl } from '../sharedWidgets';
import { usePushNotifications } from '../hooks/useSupabase';
import { supabase } from '../lib/supabase';
import { FieldKeyProvider, DefinedTerm, FieldKeyHint } from '../glossary';
import {
  OKR_LEVELS,
  OKR_LEVEL_LABELS,
  PROJECT_STAGES,
} from '../okrFramework';
import {
  ALT_COMPUTE_MODES,
  ALT_DASHBOARD_MODE,
  ALT_TIME_KEYS,
  DEFAULT_ALT_DASHBOARD_PREFS,
} from '../altDashboard';
import {
  KPI_STATUS_META,
} from '../kpiSystem';
import {
  OMP_DEPARTMENTS,
  OMP_DEPARTMENT_CLASSES,
  OKR_GROUP_TO_DEPARTMENT,
  OMP_RECURRENCE_REPEATS,
} from '../ompFramework';


let writeXlsxFilePromise;
const loadWriteXlsxFile = async () => {
  if (!writeXlsxFilePromise) {
    writeXlsxFilePromise = import('write-excel-file/browser').then(module => module.default);
  }
  return writeXlsxFilePromise;
};


// Extracted from src/pages.jsx to make OrgPage a real lazy route module.

const NCR_LIFECYCLE_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  containment_required: 'Containment Required',
  root_cause: 'Root Cause',
  corrective_action: 'Corrective Action',
  effectiveness_check: 'Effectiveness Check',
  closed: 'Closed',
  void: 'Void',
};

const getNcrStageLabel = (stage = '') => NCR_LIFECYCLE_LABELS[stage]
  || String(stage || 'Open').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const DEFAULT_PREFS = {
  emailEnabled: true,
  inAppEnabled: true,
  pushEnabled: false,
  dueReminders: true,
  overdueAlerts: true,
  blockerAlerts: true,
  commentNotifications: true,
  delegationAlerts: true,
  digestFrequency: 'daily',
  digestTime: '08:00',
};

const prefsFromRow = (row) => row ? ({
  emailEnabled: row.email_enabled,
  inAppEnabled: row.in_app_enabled,
  pushEnabled: row.push_enabled,
  dueReminders: row.due_reminders,
  overdueAlerts: row.overdue_alerts,
  blockerAlerts: row.blocker_alerts,
  commentNotifications: row.comment_notifications,
  delegationAlerts: row.delegation_alerts,
  digestFrequency: row.digest_frequency,
  digestTime: row.digest_time,
}) : DEFAULT_PREFS;

const rowFromPrefs = (userId, prefs) => ({
  user_id: userId,
  email_enabled: prefs.emailEnabled,
  in_app_enabled: prefs.inAppEnabled,
  push_enabled: prefs.pushEnabled,
  due_reminders: prefs.dueReminders,
  overdue_alerts: prefs.overdueAlerts,
  blocker_alerts: prefs.blockerAlerts,
  comment_notifications: prefs.commentNotifications,
  delegation_alerts: prefs.delegationAlerts,
  digest_frequency: prefs.digestFrequency,
  digest_time: prefs.digestTime,
  updated_at: new Date().toISOString(),
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

const getNcrDepartmentValue = (report = {}) => {
  const source = Array.isArray(report.affectedDepartmentList) && report.affectedDepartmentList.length
    ? report.affectedDepartmentList
    : String(report.affectedDepartments || report.departmentGroup || '').split(/[;,|]/);
  const departments = source
    .map(value => String(value || '').trim())
    .filter(value => value && value.toLowerCase() !== 'operations');
  if (departments.length) return [...new Set(departments)].join(', ');
  const group = String(report.departmentGroup || '').trim();
  return group && group.toLowerCase() !== 'operations' ? group : 'Unassigned';
};

const escapeExportHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const sortOrgProfilesForExport = (profiles = []) => {
  const roleRank = { executive: 0, manager: 1, contributor: 2, placeholder: 3 };
  return [...profiles].sort((a, b) => (
    (roleRank[a.role] ?? 3) - (roleRank[b.role] ?? 3) ||
    (a.department || "").localeCompare(b.department || "") ||
    (a.name || "").localeCompare(b.name || "")
  ));
};

const orgExportInitials = (name = "") => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0]?.toUpperCase())
  .join("") || "SP";

const ORG_BRANCH_PALETTE = [
  "255, 127, 2",
  "37, 99, 235",
  "5, 150, 105",
  "124, 58, 237",
  "220, 38, 38",
  "14, 116, 144",
  "202, 138, 4",
  "71, 85, 105",
];

const WIDE_ORG_CANVAS_MIN_WIDTH = 2000;
const WIDE_ORG_CANVAS_MIN_HEIGHT = 1200;

const getOrgBranchPath = (entry, entries = []) => {
  if (!entry) return [];
  const byId = new Map(entries.map(item => [item.id, item]));
  const path = [];
  const seen = new Set();
  let cursor = entry;
  while (cursor && !seen.has(cursor.id)) {
    path.unshift(cursor);
    seen.add(cursor.id);
    cursor = cursor.reports_to ? byId.get(cursor.reports_to) : null;
  }
  return path;
};

const getOrgBranchLeader = (entry, entries = []) => {
  const path = getOrgBranchPath(entry, entries);
  return path[1] || path[0] || entry || null;
};

const getOrgBranchLeaders = (entries = []) => {
  const leadersById = new Map();
  entries.forEach(entry => {
    const leader = getOrgBranchLeader(entry, entries);
    if (leader?.id) leadersById.set(leader.id, leader);
  });
  return [...leadersById.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
};

const getOrgBranchColor = (entry, entries = []) => {
  const leader = getOrgBranchLeader(entry, entries);
  const leaders = getOrgBranchLeaders(entries);
  const index = Math.max(0, leaders.findIndex(item => item.id === leader?.id));
  return ORG_BRANCH_PALETTE[index % ORG_BRANCH_PALETTE.length];
};

const getOrgBranchName = (entry, entries = []) => getOrgBranchLeader(entry, entries)?.name || "Company root";

const buildOrgExportCard = (user, children, objectiveStats, branchColor, branchName) => {
  const title = user.title || (user.isPlaceholder ? "Group placeholder" : "Team member");
  const department = user.department || "Unassigned";
  const activeText = user.isPlaceholder
    ? "visual group"
    : objectiveStats.active === 1 ? "1 active objective" : `${objectiveStats.active} active objectives`;
  const directReportsText = children.length === 1 ? "1 direct report" : `${children.length} direct reports`;
  return `
    <div class="org-export-card ${user.isPlaceholder ? 'placeholder' : ''}" style="--org-branch-rgb:${escapeExportHtml(branchColor)}">
      <div class="org-export-avatar" style="background:${escapeExportHtml(user.color || "#ff7f02")}">${escapeExportHtml(orgExportInitials(user.name))}</div>
      <div class="org-export-person">
        <div class="org-export-name">${escapeExportHtml(user.name || (user.isPlaceholder ? "Unnamed group" : "Unnamed employee"))}${user.isPlaceholder ? ' <span class="org-export-type">Group</span>' : ''}</div>
        <div class="org-export-title">${escapeExportHtml(title)}</div>
        <div class="org-export-meta">${escapeExportHtml(department)} · ${escapeExportHtml(directReportsText)} · ${escapeExportHtml(activeText)}</div>
        <div class="org-export-branch">Reporting group: ${escapeExportHtml(branchName)}</div>
      </div>
    </div>
  `;
};

const buildOrgExportNode = (user, childrenByManager, objectivesByOwner, allProfiles, seen = new Set()) => {
  if (!user || seen.has(user.id)) return "";
  const nextSeen = new Set(seen);
  nextSeen.add(user.id);
  const children = sortOrgProfilesForExport(childrenByManager.get(user.id) || []);
  const ownerObjectives = objectivesByOwner.get(user.id) || [];
  const objectiveStats = {
    active: ownerObjectives.filter(obj => obj.status !== "completed" && obj.status !== "cancelled").length,
  };
  const branchColor = getOrgBranchColor(user, allProfiles);
  const branchName = getOrgBranchName(user, allProfiles);
  const childMarkup = children.map(child => buildOrgExportNode(child, childrenByManager, objectivesByOwner, allProfiles, nextSeen)).join("");
  return `
    <li class="org-export-node" style="--org-branch-rgb:${escapeExportHtml(branchColor)}">
      ${buildOrgExportCard(user, children, objectiveStats, branchColor, branchName)}
      ${childMarkup ? `<ol class="org-export-children">${childMarkup}</ol>` : ""}
    </li>
  `;
};

const ORG_EXPORT_LAYOUT = {
  cardWidth: 264,
  cardHeight: 92,
  horizontalGap: 36,
  verticalGap: 78,
  margin: 48,
  headerHeight: 104,
};

const truncateOrgExportText = (value = "", max = 34) => {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}...` : text;
};

const buildOrgChildrenByManager = (profiles = []) => {
  const exportProfiles = sortOrgProfilesForExport(profiles);
  const knownIds = new Set(exportProfiles.map(profile => profile.id));
  return exportProfiles.reduce((acc, profile) => {
    if (!profile.reports_to || !knownIds.has(profile.reports_to)) return acc;
    acc.set(profile.reports_to, [...(acc.get(profile.reports_to) || []), profile]);
    return acc;
  }, new Map());
};

const calculateOrgSpanSummary = (profile, childrenByManager, seen = new Set()) => {
  if (!profile || seen.has(profile.id)) return { direct: 0, average: 0 };
  const nextSeen = new Set(seen);
  nextSeen.add(profile.id);
  const spans = [];
  const visit = (entry) => {
    if (!entry || nextSeen.has(`visited:${entry.id}`)) return;
    nextSeen.add(`visited:${entry.id}`);
    const children = childrenByManager.get(entry.id) || [];
    if (children.length > 0) spans.push(children.length);
    children.forEach(child => visit(child));
  };
  const direct = (childrenByManager.get(profile.id) || []).length;
  visit(profile);
  const average = spans.length
    ? Math.round((spans.reduce((sum, count) => sum + count, 0) / spans.length) * 10) / 10
    : 0;
  return { direct, average };
};

const getOrgObjectivesForExport = (profile, objectives = []) => {
  if (!profile || profile.isPlaceholder) return [];
  return objectives.filter(objective => objective.ownerId === profile.id);
};

const buildOrgChartExportRows = ({ profiles = [], objectives = [] }) => {
  const exportProfiles = sortOrgProfilesForExport(profiles);
  const childrenByManager = buildOrgChildrenByManager(exportProfiles);
  return exportProfiles.map(profile => {
    const manager = profile.reports_to ? exportProfiles.find(item => item.id === profile.reports_to) : null;
    const span = calculateOrgSpanSummary(profile, childrenByManager);
    const ownerObjectives = getOrgObjectivesForExport(profile, objectives);
    const activeObjectives = ownerObjectives.filter(obj => obj.status !== "completed" && obj.status !== "cancelled");
    const onTrackObjectives = activeObjectives.filter(obj => obj.status === "on_track");
    return {
      name: profile.name || "",
      title: profile.title || "",
      department: profile.department || "Unassigned",
      type: profile.isPlaceholder ? "Group placeholder" : "Employee",
      email: profile.isPlaceholder ? "" : profile.email || "",
      reportsTo: manager?.name || "Company root",
      directReports: span.direct,
      averageSpanOfControl: span.average,
      reportingGroup: getOrgBranchName(profile, exportProfiles),
      chainOfCommand: getOrgBranchPath(profile, exportProfiles).map(item => item.name).filter(Boolean).join(" > "),
      activeObjectives: activeObjectives.length,
      onTrackObjectives: onTrackObjectives.length,
    };
  });
};

const buildOrgSvgLayout = (profiles = []) => {
  const exportProfiles = sortOrgProfilesForExport(profiles);
  const knownIds = new Set(exportProfiles.map(profile => profile.id));
  const childrenByManager = buildOrgChildrenByManager(exportProfiles);
  const roots = exportProfiles.filter(profile => !profile.reports_to || !knownIds.has(profile.reports_to));
  const nodes = [];
  const links = [];
  let maxDepth = 0;

  const measure = (profile, depth = 0, seen = new Set()) => {
    if (!profile || seen.has(profile.id)) {
      return { profile, depth, width: ORG_EXPORT_LAYOUT.cardWidth, children: [] };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(profile.id);
    const children = (childrenByManager.get(profile.id) || []).map(child => measure(child, depth + 1, nextSeen));
    const childrenWidth = children.reduce((sum, child) => sum + child.width, 0)
      + Math.max(0, children.length - 1) * ORG_EXPORT_LAYOUT.horizontalGap;
    const width = Math.max(ORG_EXPORT_LAYOUT.cardWidth, childrenWidth);
    maxDepth = Math.max(maxDepth, depth);
    return { profile, depth, width, children };
  };

  const measuredRoots = roots.map(root => measure(root));
  const totalWidth = Math.max(
    920,
    ORG_EXPORT_LAYOUT.margin * 2
      + measuredRoots.reduce((sum, root) => sum + root.width, 0)
      + Math.max(0, measuredRoots.length - 1) * ORG_EXPORT_LAYOUT.horizontalGap
  );
  const place = (layout, left, depth = 0, parent = null) => {
    const x = left + layout.width / 2 - ORG_EXPORT_LAYOUT.cardWidth / 2;
    const y = ORG_EXPORT_LAYOUT.headerHeight + ORG_EXPORT_LAYOUT.margin + depth * (ORG_EXPORT_LAYOUT.cardHeight + ORG_EXPORT_LAYOUT.verticalGap);
    const node = { profile: layout.profile, x, y, depth };
    nodes.push(node);
    if (parent) links.push({ parent, child: node });
    let childLeft = left;
    layout.children.forEach(child => {
      place(child, childLeft, depth + 1, node);
      childLeft += child.width + ORG_EXPORT_LAYOUT.horizontalGap;
    });
  };

  let nextLeft = ORG_EXPORT_LAYOUT.margin;
  measuredRoots.forEach(root => {
    place(root, nextLeft);
    nextLeft += root.width + ORG_EXPORT_LAYOUT.horizontalGap;
  });

  const totalHeight = ORG_EXPORT_LAYOUT.headerHeight
    + ORG_EXPORT_LAYOUT.margin * 2
    + (maxDepth + 1) * ORG_EXPORT_LAYOUT.cardHeight
    + maxDepth * ORG_EXPORT_LAYOUT.verticalGap;

  return {
    nodes,
    links,
    childrenByManager,
    width: Math.ceil(totalWidth),
    height: Math.ceil(Math.max(520, totalHeight)),
  };
};

const buildOrgChartExportSvg = ({ profiles = [], objectives = [] }) => {
  const layout = buildOrgSvgLayout(profiles);
  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const cardWidth = ORG_EXPORT_LAYOUT.cardWidth;
  const cardHeight = ORG_EXPORT_LAYOUT.cardHeight;
  const markerColor = (summary) => summary.direct > 5
    ? "#ff7f02"
    : summary.average > 5
      ? "#10b981"
      : "#d1d5db";

  const linkMarkup = layout.links.map(({ parent, child }) => {
    const color = getOrgBranchColor(child.profile, profiles);
    const parentX = parent.x + cardWidth / 2;
    const parentY = parent.y + cardHeight;
    const childX = child.x + cardWidth / 2;
    const childY = child.y;
    const midY = parentY + ORG_EXPORT_LAYOUT.verticalGap / 2;
    return `<path d="M ${parentX} ${parentY} V ${midY} H ${childX} V ${childY}" fill="none" stroke="rgb(${escapeExportHtml(color)})" stroke-opacity="0.38" stroke-width="2.5" />`;
  }).join("");

  const nodeMarkup = layout.nodes.map(({ profile, x, y }) => {
    const branchColor = getOrgBranchColor(profile, profiles);
    const span = calculateOrgSpanSummary(profile, layout.childrenByManager);
    const objectivesForProfile = getOrgObjectivesForExport(profile, objectives);
    const activeObjectiveCount = objectivesForProfile.filter(obj => obj.status !== "completed" && obj.status !== "cancelled").length;
    const initials = orgExportInitials(profile.name);
    const title = profile.title || (profile.isPlaceholder ? "Group placeholder" : "Team member");
    return `
      <g transform="translate(${x} ${y})">
        <rect x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="8" fill="#ffffff" stroke="rgb(${escapeExportHtml(branchColor)})" stroke-opacity="0.42" />
        <rect x="0" y="0" width="5" height="${cardHeight}" rx="3" fill="rgb(${escapeExportHtml(branchColor)})" opacity="0.88" />
        <polygon points="${cardWidth - 32},0 ${cardWidth},0 ${cardWidth},32" fill="${markerColor(span)}" opacity="0.86" />
        <circle cx="24" cy="26" r="13" fill="rgb(${escapeExportHtml(branchColor)})" opacity="0.92" />
        <text x="24" y="30" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="800" fill="#ffffff">${escapeExportHtml(initials)}</text>
        <text x="45" y="23" font-family="Inter, Arial, sans-serif" font-size="12.5" font-weight="900" fill="#0f766e">${escapeExportHtml(truncateOrgExportText(profile.name || "Unnamed", 28))}</text>
        <text x="45" y="40" font-family="Inter, Arial, sans-serif" font-size="9.5" font-weight="700" fill="#475467">${escapeExportHtml(truncateOrgExportText(title, 34))}</text>
        <text x="14" y="64" font-family="Inter, Arial, sans-serif" font-size="9.5" fill="#667085">Span Of Control:</text>
        <text x="${cardWidth - 26}" y="64" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="800" fill="#344054">${span.direct}</text>
        <text x="14" y="80" font-family="Inter, Arial, sans-serif" font-size="9.5" fill="#667085">Avg Span Of Control:</text>
        <text x="${cardWidth - 26}" y="80" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="800" fill="#344054">${span.average}</text>
        ${activeObjectiveCount ? `<text x="${cardWidth - 18}" y="48" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="8" font-weight="800" fill="#ff7f02">${activeObjectiveCount} obj</text>` : ""}
      </g>
    `;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
  <rect width="100%" height="100%" fill="#f8fafc" />
  <rect x="18" y="18" width="${layout.width - 36}" height="${ORG_EXPORT_LAYOUT.headerHeight - 28}" rx="10" fill="#ffffff" stroke="#d1d5db" />
  <text x="40" y="48" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="900" fill="#111827">SandPro OMP Organization Chart</text>
  <text x="40" y="70" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="700" fill="#667085">Generated ${escapeExportHtml(generatedAt)} · ${profiles.length} entries · ${layout.nodes.length} chart cards</text>
  <circle cx="${layout.width - 278}" cy="51" r="5" fill="#10b981" />
  <text x="${layout.width - 264}" y="55" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="800" fill="#475467">Avg span greater than 5</text>
  <polygon points="${layout.width - 144},45 ${layout.width - 132},45 ${layout.width - 132},57" fill="#ff7f02" />
  <text x="${layout.width - 124}" y="55" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="800" fill="#475467">Span greater than 5</text>
  ${linkMarkup}
  ${nodeMarkup}
</svg>`;
};

const downloadTextFile = (fileName, contents, type = "text/plain;charset=utf-8") => {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const downloadSvgAsPng = (fileName, svgText) => new Promise((resolve, reject) => {
  const image = new window.Image();
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const width = Number(svgText.match(/width="(\d+)"/)?.[1]) || 1600;
  const height = Number(svgText.match(/height="(\d+)"/)?.[1]) || 900;
  const scale = Math.max(1, Math.min(2, 12000 / Math.max(width, height)));
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext('2d');
      context.fillStyle = '#f8fafc';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) {
          reject(new Error('Could not render PNG export.'));
          return;
        }
        const pngUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = pngUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(pngUrl);
        resolve();
      }, 'image/png');
    } catch (error) {
      URL.revokeObjectURL(url);
      reject(error);
    }
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Could not load SVG for PNG export.'));
  };
  image.src = url;
});

const buildDepartmentRoster = (profiles = []) => {
  const grouped = sortOrgProfilesForExport(profiles).reduce((acc, person) => {
    const key = person.department || "Unassigned";
    acc.set(key, [...(acc.get(key) || []), person]);
    return acc;
  }, new Map());

  return [...grouped.entries()].map(([department, people]) => `
    <section class="dept-export-block">
      <h2>${escapeExportHtml(department)}</h2>
      <table>
        <thead><tr><th>Name</th><th>Title</th><th>Reports To</th><th>Email</th></tr></thead>
        <tbody>
          ${people.map(person => {
            const manager = profiles.find(profile => profile.id === person.reports_to);
            return `
              <tr>
                <td>${escapeExportHtml(person.name || "")}</td>
                <td>${escapeExportHtml(person.title || "")}</td>
                <td>${escapeExportHtml(manager?.name || "Company root")}</td>
                <td>${escapeExportHtml(person.isPlaceholder ? "Visual group" : person.email || "")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </section>
  `).join("");
};

const buildOrgChartExportHtml = ({ profiles = [], objectives = [] }) => {
  const exportProfiles = sortOrgProfilesForExport(profiles);
  const knownIds = new Set(exportProfiles.map(profile => profile.id));
  const roots = exportProfiles.filter(profile => !profile.reports_to || !knownIds.has(profile.reports_to));
  const childrenByManager = exportProfiles.reduce((acc, profile) => {
    if (!profile.reports_to || !knownIds.has(profile.reports_to)) return acc;
    acc.set(profile.reports_to, [...(acc.get(profile.reports_to) || []), profile]);
    return acc;
  }, new Map());
  const objectivesByOwner = objectives.reduce((acc, obj) => {
    if (!obj.ownerId) return acc;
    acc.set(obj.ownerId, [...(acc.get(obj.ownerId) || []), obj]);
    return acc;
  }, new Map());
  const generatedAt = new Date();
  const exportDate = generatedAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const activeObjectives = objectives.filter(obj => obj.status !== "completed" && obj.status !== "cancelled").length;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SandPro Organization Chart</title>
  <style>
    :root {
      --sandpro-orange: #ff7f02;
      --ink: #111827;
      --muted: #667085;
      --line: #d0d5dd;
      --paper: #ffffff;
      --soft: #f8fafc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f7;
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11px;
      line-height: 1.35;
    }
    .print-shell {
      width: 11in;
      min-height: 8.5in;
      margin: 24px auto;
      padding: 0.35in;
      background: var(--paper);
      box-shadow: 0 18px 60px rgba(15, 23, 42, 0.18);
    }
    .print-actions {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      width: 11in;
      margin: 14px auto -14px;
    }
    .print-actions button {
      border: 1px solid rgba(255, 127, 2, 0.35);
      border-radius: 8px;
      background: rgba(255, 127, 2, 0.14);
      color: #c74800;
      padding: 9px 13px;
      font-weight: 800;
      cursor: pointer;
    }
    .export-header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: start;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--sandpro-orange);
    }
    .brand-line {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      color: var(--sandpro-orange);
      font-size: 15px;
      font-weight: 900;
    }
    .brand-mark {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--sandpro-orange);
      color: #fff;
      font-weight: 950;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 0;
    }
    .export-subtitle {
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
    }
    .export-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(96px, 1fr));
      gap: 8px;
      min-width: 220px;
    }
    .stat {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
      background: var(--soft);
    }
    .stat strong {
      display: block;
      font-size: 18px;
      line-height: 1;
    }
    .stat span {
      display: block;
      margin-top: 3px;
      color: var(--muted);
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 18px 0 10px;
      color: var(--ink);
      font-size: 13px;
      font-weight: 900;
    }
    .section-title::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--sandpro-orange);
    }
    .org-export-tree,
    .org-export-children {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .org-export-tree {
      display: grid;
      gap: 9px;
    }
    .org-export-node {
      position: relative;
    }
    .org-export-children {
      margin: 8px 0 2px 24px;
      padding-left: 16px;
      border-left: 2px solid rgba(var(--org-branch-rgb, 255, 127, 2), 0.34);
      display: grid;
      gap: 7px;
    }
    .org-export-children > .org-export-node::before {
      content: "";
      position: absolute;
      top: 20px;
      left: -16px;
      width: 14px;
      height: 2px;
      background: rgba(var(--org-branch-rgb, 255, 127, 2), 0.34);
    }
    .org-export-card {
      position: relative;
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 8px;
      align-items: center;
      min-height: 42px;
      padding: 7px 9px;
      border: 1px solid rgba(var(--org-branch-rgb, 255, 127, 2), 0.32);
      border-radius: 8px;
      background:
        linear-gradient(90deg, rgba(var(--org-branch-rgb, 255, 127, 2), 0.12), transparent 56%),
        #fff;
      break-inside: avoid;
      page-break-inside: avoid;
      overflow: hidden;
    }
    .org-export-card::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 4px;
      background: rgba(var(--org-branch-rgb, 255, 127, 2), 0.78);
    }
    .org-export-card.placeholder {
      border-style: dashed;
      background:
        linear-gradient(90deg, rgba(var(--org-branch-rgb, 255, 127, 2), 0.15), transparent 58%),
        rgba(255, 127, 2, 0.04);
    }
    .org-export-type {
      display: inline-block;
      margin-left: 5px;
      padding: 1px 5px;
      border-radius: 999px;
      background: rgba(255, 127, 2, 0.12);
      color: #c74800;
      font-size: 7px;
      text-transform: uppercase;
    }
    .org-export-avatar {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      color: #fff;
      font-size: 9px;
      font-weight: 900;
    }
    .org-export-name {
      font-size: 12px;
      font-weight: 900;
    }
    .org-export-title {
      color: #344054;
      font-size: 10px;
      font-weight: 700;
    }
    .org-export-meta {
      color: var(--muted);
      font-size: 9px;
    }
    .org-export-branch {
      display: inline-block;
      width: fit-content;
      margin-top: 3px;
      padding: 1px 6px;
      border-radius: 999px;
      background: rgba(var(--org-branch-rgb, 255, 127, 2), 0.11);
      color: rgb(var(--org-branch-rgb, 255, 127, 2));
      font-size: 7.5px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .dept-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .dept-export-block {
      break-inside: avoid;
      page-break-inside: avoid;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .dept-export-block h2 {
      margin: 0;
      padding: 7px 9px;
      background: rgba(255, 127, 2, 0.1);
      color: #c74800;
      font-size: 11px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 5px 7px;
      border-top: 1px solid #eef2f7;
      text-align: left;
      vertical-align: top;
      font-size: 8.5px;
    }
    th {
      color: var(--muted);
      font-size: 8px;
      text-transform: uppercase;
    }
    .footer-note {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 9px;
    }
    @page {
      size: 11in 8.5in;
      margin: 0.35in;
    }
    @media print {
      body {
        background: #fff;
      }
      .print-shell {
        width: auto;
        min-height: auto;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
      .print-actions {
        display: none;
      }
      .dept-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  </style>
</head>
<body>
  <div class="print-actions">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <main class="print-shell">
    <header class="export-header">
      <div>
        <div class="brand-line"><span class="brand-mark">SP</span> SandPro OMP</div>
        <h1>Organization Chart</h1>
        <div class="export-subtitle">Generated ${escapeExportHtml(exportDate)} from the live SandPro OMP organization data.</div>
      </div>
      <div class="export-stats">
        <div class="stat"><strong>${exportProfiles.length}</strong><span>People</span></div>
        <div class="stat"><strong>${roots.length}</strong><span>Top-level</span></div>
        <div class="stat"><strong>${activeObjectives}</strong><span>Active objectives</span></div>
        <div class="stat"><strong>${new Set(exportProfiles.map(profile => profile.department || "Unassigned")).size}</strong><span>Departments</span></div>
      </div>
    </header>

    <section>
      <div class="section-title">Complete reporting tree</div>
      <ol class="org-export-tree">
        ${roots.map(root => buildOrgExportNode(root, childrenByManager, objectivesByOwner, exportProfiles)).join("") || "<li>No organization records found.</li>"}
      </ol>
    </section>

    <section>
      <div class="section-title">Department roster detail</div>
      <div class="dept-grid">${buildDepartmentRoster(exportProfiles)}</div>
    </section>

    <div class="footer-note">Export includes the complete current org chart, including profiles, visual group placeholders, reporting manager, reporting group color, title, department, and objective load summary.</div>
  </main>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 350);
    });
  </script>
</body>
</html>`;
};

export const OrgPage = ({ objectives, onOpenCard, currentUser, onUpdateUser, onDeleteUser, onUsersChanged, addToast }) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [orgSearch, setOrgSearch] = useState("");
  const [orgPlaceholders, setOrgPlaceholders] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  const [orgSaveStatus, setOrgSaveStatus] = useState("");
  const [deletingUser, setDeletingUser] = useState(false);
  const [draggedUserId, setDraggedUserId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [movingUserId, setMovingUserId] = useState(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: "", title: "", department: DEFAULT_DEPARTMENT, reportsTo: "", role: "contributor" });
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [addEmployeeDraft, setAddEmployeeDraft] = useState({ entryType: "employee", name: "", email: "", title: "", department: DEFAULT_DEPARTMENT, role: "contributor", reportsTo: "", tempPassword: "" });
  const [orgViewMode, setOrgViewMode] = useState("tree");
  const [orgTreeOrientation, setOrgTreeOrientation] = useState("wide");
  const [orgProofMode, setOrgProofMode] = useState(false);
  const [showOrgExportMenu, setShowOrgExportMenu] = useState(false);
  const [collapsedOrgIds, setCollapsedOrgIds] = useState(() => new Set());
  const orgTreeScrollRef = useRef(null);
  const orgTreeCanvasRef = useRef(null);
  const orgPanRef = useRef(null);
  const orgZoomRef = useRef(1);
  const orgManualViewportRef = useRef(false);
  const [orgZoom, setOrgZoom] = useState(1);
  const [orgCanvasSize, setOrgCanvasSize] = useState({ width: WIDE_ORG_CANVAS_MIN_WIDTH, height: WIDE_ORG_CANVAS_MIN_HEIGHT });
  const [isOrgPanning, setIsOrgPanning] = useState(false);
  const profileUsers = getProfiles();
  const canEditOrg = canManageOrgChart(currentUser);
  const canEditRoles = canManagePermissions(currentUser);
  const orgEntries = useMemo(() => ([
    ...profileUsers.map(user => ({ ...user, isPlaceholder: false, orgType: "employee" })),
    ...orgPlaceholders.map(item => ({
      ...item,
      initials: orgExportInitials(item.name),
      email: "",
      role: "placeholder",
      title: item.title || "Group placeholder",
      department: item.department || DEFAULT_DEPARTMENT,
      reports_to: item.reports_to || null,
      isPlaceholder: true,
      orgType: "placeholder",
    })),
  ]), [profileUsers, orgPlaceholders]);
  const orgEntryIds = useMemo(() => new Set(orgEntries.map(entry => entry.id)), [orgEntries]);
  const getOrgReports = useCallback((parentId) => (
    orgEntries
      .filter(entry => (entry.reports_to || "") === parentId)
      .sort((a, b) => (a.isPlaceholder === b.isPlaceholder ? (a.name || "").localeCompare(b.name || "") : a.isPlaceholder ? 1 : -1))
  ), [orgEntries]);
  const getOrgEntry = useCallback((id) => orgEntries.find(entry => entry.id === id), [orgEntries]);
  const getBranchColor = useCallback((entry) => getOrgBranchColor(entry, orgEntries), [orgEntries]);
  const getBranchName = useCallback((entry) => getOrgBranchName(entry, orgEntries), [orgEntries]);
  const orgChildrenByManager = useMemo(() => buildOrgChildrenByManager(orgEntries), [orgEntries]);

  const getUserObjectives = (userId) => objectives.filter(o => o.ownerId === userId);
  const getOrgSpanSummary = useCallback((entry) => calculateOrgSpanSummary(entry, orgChildrenByManager), [orgChildrenByManager]);
  const orgChartStats = useMemo(() => {
    const entriesWithReports = orgEntries
      .map(entry => calculateOrgSpanSummary(entry, orgChildrenByManager))
      .filter(summary => summary.direct > 0);
    const directSpans = entriesWithReports.map(summary => summary.direct);
    const averageDirectSpan = directSpans.length
      ? Math.round((directSpans.reduce((sum, count) => sum + count, 0) / directSpans.length) * 10) / 10
      : 0;
    return {
      averageDirectSpan,
      spanAboveFive: entriesWithReports.filter(summary => summary.direct > 5).length,
      averageAboveFive: entriesWithReports.filter(summary => summary.average > 5).length,
      branchCount: getOrgBranchLeaders(orgEntries).length,
    };
  }, [orgChildrenByManager, orgEntries]);
  const setBoundedOrgZoom = useCallback((nextZoom) => {
    const minZoom = orgTreeOrientation === "vertical" ? 0.7 : 0.35;
    const bounded = Math.min(2.4, Math.max(minZoom, Number(nextZoom) || 1));
    orgZoomRef.current = bounded;
    setOrgZoom(bounded);
    return bounded;
  }, [orgTreeOrientation]);

  const measureOrgCanvas = useCallback(() => {
    const canvas = orgTreeCanvasRef.current;
    const scroller = orgTreeScrollRef.current;
    if (!canvas || !scroller) return;
    const isVerticalTree = orgTreeOrientation === "vertical";
    const width = isVerticalTree
      ? Math.max(canvas.scrollWidth, scroller.clientWidth, 980)
      : Math.max(canvas.scrollWidth, scroller.clientWidth, WIDE_ORG_CANVAS_MIN_WIDTH);
    const height = isVerticalTree
      ? Math.max(canvas.scrollHeight, scroller.clientHeight * 2, 1600)
      : Math.max(canvas.scrollHeight, scroller.clientHeight, WIDE_ORG_CANVAS_MIN_HEIGHT);
    setOrgCanvasSize(current => (
      Math.abs(current.width - width) > 2 || Math.abs(current.height - height) > 2
        ? { width, height }
        : current
    ));
  }, [orgTreeOrientation]);

  const zoomOrgCanvasAt = useCallback((nextZoom, origin = null) => {
    const scroller = orgTreeScrollRef.current;
    if (!scroller) {
      setBoundedOrgZoom(nextZoom);
      return;
    }
    const previousZoom = orgZoomRef.current;
    const minZoom = orgTreeOrientation === "vertical" ? 0.7 : 0.35;
    const next = Math.min(2.4, Math.max(minZoom, Number(nextZoom) || 1));
    const rect = scroller.getBoundingClientRect();
    const cursorX = origin ? origin.x - rect.left : scroller.clientWidth / 2;
    const cursorY = origin ? origin.y - rect.top : scroller.clientHeight / 2;
    const worldX = (scroller.scrollLeft + cursorX) / previousZoom;
    const worldY = (scroller.scrollTop + cursorY) / previousZoom;
    setBoundedOrgZoom(next);
    window.requestAnimationFrame(() => {
      scroller.scrollLeft = worldX * next - cursorX;
      scroller.scrollTop = worldY * next - cursorY;
    });
  }, [orgTreeOrientation, setBoundedOrgZoom]);

  const centerOrgElement = useCallback((selector, fallback = 'center') => {
    const scroller = orgTreeScrollRef.current;
    const canvas = orgTreeCanvasRef.current;
    if (!scroller || !canvas) return;
    const zoom = orgZoomRef.current || 1;
    const target = selector ? canvas.querySelector(selector) : null;
    if (!target) {
      if (fallback === 'root') {
        scroller.scrollLeft = 0;
        scroller.scrollTop = 0;
      } else {
        scroller.scrollLeft = orgTreeOrientation === "vertical" ? 0 : Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
        scroller.scrollTop = orgTreeOrientation === "vertical" ? 0 : Math.max(0, (scroller.scrollHeight - scroller.clientHeight) / 3);
      }
      return;
    }
    scroller.scrollLeft = Math.max(0, (target.offsetLeft + target.offsetWidth / 2) * zoom - scroller.clientWidth / 2);
    scroller.scrollTop = Math.max(0, (target.offsetTop + target.offsetHeight / 2) * zoom - scroller.clientHeight / 2);
  }, [orgTreeOrientation]);

  const centerOrgRoot = useCallback(() => {
    orgManualViewportRef.current = true;
    centerOrgElement('.org-root-drop', 'root');
  }, [centerOrgElement]);

  const centerSelectedOrgEntry = useCallback(() => {
    orgManualViewportRef.current = true;
    if (!selectedUser?.id) {
      centerOrgRoot();
      return;
    }
    const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(selectedUser.id) : selectedUser.id.replace(/"/g, '\\"');
    centerOrgElement(`[data-org-entry-id="${safeId}"]`, 'center');
  }, [centerOrgElement, centerOrgRoot, selectedUser?.id]);

  const fitOrgCanvas = useCallback(() => {
    const scroller = orgTreeScrollRef.current;
    const canvas = orgTreeCanvasRef.current;
    if (!scroller || !canvas) return;
    orgManualViewportRef.current = true;
    const width = Math.max(canvas.scrollWidth, canvas.offsetWidth, orgTreeOrientation === "vertical" ? 860 : 1200);
    const height = Math.max(canvas.scrollHeight, canvas.offsetHeight, 800);
    const minZoom = orgTreeOrientation === "vertical" ? 0.7 : 0.35;
    const nextZoom = Math.min(1.4, Math.max(minZoom, Math.min((scroller.clientWidth - 72) / width, (scroller.clientHeight - 96) / height)));
    setBoundedOrgZoom(nextZoom);
    const alignTreeToViewport = () => {
      const tree = canvas.querySelector('.org-tree');
      if (!tree) {
        centerOrgElement(null, 'root');
        return;
      }
      const scrollerRect = scroller.getBoundingClientRect();
      const treeRect = tree.getBoundingClientRect();
      const padding = 24;
      const topPadding = 72;
      scroller.scrollLeft = Math.max(0, scroller.scrollLeft + treeRect.left - scrollerRect.left - padding);
      scroller.scrollTop = Math.max(0, scroller.scrollTop + treeRect.top - scrollerRect.top - topPadding);

      const visibleNodes = [
        ...canvas.querySelectorAll('.org-root-drop'),
        ...tree.querySelectorAll('.org-person-card'),
      ].map(node => node.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
      if (!visibleNodes.length) return;

      const leftMostNode = visibleNodes.reduce((leftMost, rect) => (rect.left < leftMost.left ? rect : leftMost), visibleNodes[0]);
      const topMostNode = visibleNodes.reduce((topMost, rect) => (rect.top < topMost.top ? rect : topMost), visibleNodes[0]);
      if (leftMostNode.left < scrollerRect.left + padding) {
        scroller.scrollLeft = Math.max(0, scroller.scrollLeft + leftMostNode.left - scrollerRect.left - padding);
      }
      if (topMostNode.top < scrollerRect.top + topPadding) {
        scroller.scrollTop = Math.max(0, scroller.scrollTop + topMostNode.top - scrollerRect.top - topPadding);
      }
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      alignTreeToViewport();
      window.requestAnimationFrame(alignTreeToViewport);
    }));
    window.setTimeout(alignTreeToViewport, 120);
    window.setTimeout(alignTreeToViewport, 360);
  }, [centerOrgElement, orgTreeOrientation, setBoundedOrgZoom]);

  // Wheel zoom removed per Tim Dibben (2026-06-09): wheel now scrolls the page
  // normally; zooming is done with the explicit zoom controls.
  const handleOrgPanStart = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target?.closest?.('.org-person-card, .org-root-drop, input, textarea, select, button, a, [role="button"]')) return;
    const scroller = orgTreeScrollRef.current;
    if (!scroller) return;
    orgPanRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
    };
    setIsOrgPanning(true);
    scroller.setPointerCapture?.(event.pointerId);
  }, []);

  const handleOrgPanMove = useCallback((event) => {
    const pan = orgPanRef.current;
    const scroller = orgTreeScrollRef.current;
    if (!pan || !scroller || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    scroller.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
    scroller.scrollTop = pan.scrollTop - (event.clientY - pan.y);
  }, []);

  const stopOrgPan = useCallback((event) => {
    const scroller = orgTreeScrollRef.current;
    if (event?.pointerId && scroller?.hasPointerCapture?.(event.pointerId)) {
      scroller.releasePointerCapture(event.pointerId);
    }
    orgPanRef.current = null;
    setIsOrgPanning(false);
  }, []);

  const loadPlaceholders = useCallback(async () => {
    const { data, error } = await supabase
      .from('org_chart_placeholders')
      .select('*')
      .order('name');
    if (error) {
      console.warn('[org] could not load placeholders', error.message);
      return;
    }
    setOrgPlaceholders(data || []);
  }, []);

  useEffect(() => { loadPlaceholders(); }, [loadPlaceholders]);

  useEffect(() => {
    const scroller = orgTreeScrollRef.current;
    if (!scroller || orgSearch.trim() || orgManualViewportRef.current) return undefined;
    const timer = setTimeout(() => {
      scroller.scrollLeft = orgTreeOrientation === "vertical" ? 0 : Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
      scroller.scrollTop = orgTreeOrientation === "vertical" ? 0 : Math.max(0, (scroller.scrollHeight - scroller.clientHeight) / 3);
    }, 0);
    return () => clearTimeout(timer);
  }, [orgEntries.length, orgSearch, orgTreeOrientation]);

  useEffect(() => {
    measureOrgCanvas();
    const timer = window.setTimeout(measureOrgCanvas, 0);
    return () => window.clearTimeout(timer);
  }, [measureOrgCanvas, orgEntries.length, orgSearch, selectedUser?.id, orgPlaceholders.length, orgTreeOrientation]);

  useEffect(() => {
    if (orgViewMode !== "tree") return;
    orgManualViewportRef.current = false;
    zoomOrgCanvasAt(orgTreeOrientation === "vertical" ? 1 : Math.min(orgZoomRef.current, 0.75));
    window.requestAnimationFrame(() => centerOrgElement(null, orgTreeOrientation === "vertical" ? "root" : "center"));
  }, [centerOrgElement, orgTreeOrientation, orgViewMode, zoomOrgCanvasAt]);

  const matchesSearch = (user) => {
    if (!orgSearch.trim()) return true;
    const q = orgSearch.toLowerCase();
    return user.name?.toLowerCase().includes(q) || user.title?.toLowerCase().includes(q) || user.department?.toLowerCase().includes(q) || user.email?.toLowerCase().includes(q) || (user.isPlaceholder && "group placeholder team".includes(q));
  };

  const hasMatchInBranch = (user) => {
    if (matchesSearch(user)) return true;
    return getOrgReports(user.id).some(r => hasMatchInBranch(r));
  };

  const compactOrgRows = [];
  const compactSeen = new Set();
  const collectCompactRows = (entry, depth = 0, path = []) => {
    if (!entry || compactSeen.has(entry.id)) return;
    compactSeen.add(entry.id);
    const reports = getOrgReports(entry.id);
    if (!orgSearch.trim() || hasMatchInBranch(entry)) {
      compactOrgRows.push({
        entry,
        depth,
        reports,
        manager: entry.reports_to ? getOrgEntry(entry.reports_to) : null,
        branchColor: getBranchColor(entry),
        branchName: getBranchName(entry),
        path,
      });
    }
    reports.forEach(child => collectCompactRows(child, depth + 1, [...path, entry.name]));
  };
  orgEntries
    .filter(entry => !entry.reports_to || !orgEntryIds.has(entry.reports_to))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .forEach(root => collectCompactRows(root));
  const directoryRows = orgEntries
    .filter(entry => matchesSearch(entry))
    .sort((a, b) => (
      (a.department || "").localeCompare(b.department || "")
      || (a.name || "").localeCompare(b.name || "")
    ))
    .map(entry => ({
      entry,
      reports: getOrgReports(entry.id),
      manager: entry.reports_to ? getOrgEntry(entry.reports_to) : null,
      branchColor: getBranchColor(entry),
      branchName: getBranchName(entry),
      activeObjs: entry.isPlaceholder ? [] : getUserObjectives(entry.id).filter(o => o.status !== "completed" && o.status !== "cancelled"),
    }));

  const isDescendantOf = (possibleDescendantId, parentId) => (
    getOrgReports(parentId).some(report => report.id === possibleDescendantId || isDescendantOf(possibleDescendantId, report.id))
  );

  const canDropUser = (draggedUser, targetUser) => {
    if (!canEditOrg || !draggedUser) return false;
    if (!targetUser) return Boolean(draggedUser.reports_to);
    if (draggedUser.id === targetUser.id) return false;
    if (draggedUser.reports_to === targetUser.id) return false;
    if (!draggedUser.isPlaceholder && targetUser.isPlaceholder) return false;
    return !isDescendantOf(targetUser.id, draggedUser.id);
  };

  const moveUser = async (draggedUser, targetUser = null) => {
    if (!draggedUser || !onUpdateUser || !canDropUser(draggedUser, targetUser)) return;
    setMovingUserId(draggedUser.id);
    try {
      if (draggedUser.isPlaceholder) {
        const { data, error } = await supabase
          .from('org_chart_placeholders')
          .update({ reports_to: targetUser?.id || null })
          .eq('id', draggedUser.id)
          .select()
          .single();
        if (error) throw error;
        await loadPlaceholders();
        if (selectedUser?.id === draggedUser.id && data) setSelectedUser({ ...data, isPlaceholder: true, orgType: "placeholder", role: "placeholder", email: "" });
      } else {
        const updated = await onUpdateUser({
          userId: draggedUser.id,
          name: draggedUser.name,
          title: draggedUser.title || "",
          department: draggedUser.department || DEFAULT_DEPARTMENT,
          reportsTo: targetUser?.id || null,
        });
        if (selectedUser?.id === draggedUser.id && updated?.profile) setSelectedUser(updated.profile);
      }
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not move this person' });
    } finally {
      setMovingUserId(null);
      setDraggedUserId(null);
      setDropTargetId(null);
    }
  };

  const handleDragStart = (event, user) => {
    if (!canEditOrg) return;
    setDraggedUserId(user.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", user.id);
  };

  const handleDropOnUser = async (event, targetUser) => {
    event.preventDefault();
    event.stopPropagation();
    const userId = event.dataTransfer.getData("text/plain") || draggedUserId;
    const draggedUser = getOrgEntry(userId);
    await moveUser(draggedUser, targetUser);
  };

  const handleRootDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const userId = event.dataTransfer.getData("text/plain") || draggedUserId;
    const draggedUser = getOrgEntry(userId);
    await moveUser(draggedUser, null);
  };

  const exportOrgChartPdf = () => {
    setShowOrgExportMenu(false);
    const exportWindow = window.open("", "sandpro-org-chart-export", "width=1200,height=900");
    if (!exportWindow) {
      addToast?.({ type: 'error', message: 'Allow pop-ups to export the full org chart PDF.' });
      return;
    }
    exportWindow.opener = null;
    exportWindow.document.open();
    exportWindow.document.write(buildOrgChartExportHtml({ profiles: orgEntries, objectives }));
    exportWindow.document.close();
  };

  const exportOrgChartSvg = () => {
    setShowOrgExportMenu(false);
    downloadTextFile('sandpro_org_chart.svg', buildOrgChartExportSvg({ profiles: orgEntries, objectives }), 'image/svg+xml;charset=utf-8');
    addToast?.({ type: 'success', message: 'Org chart SVG exported.' });
  };

  const exportOrgChartPng = async () => {
    setShowOrgExportMenu(false);
    try {
      await downloadSvgAsPng('sandpro_org_chart.png', buildOrgChartExportSvg({ profiles: orgEntries, objectives }));
      addToast?.({ type: 'success', message: 'Org chart PNG exported.' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not export the org chart PNG.' });
    }
  };

  const exportOrgChartCsv = () => {
    setShowOrgExportMenu(false);
    const rows = buildOrgChartExportRows({ profiles: orgEntries, objectives });
    const headers = [
      'Name',
      'Title',
      'Department',
      'Type',
      'Email',
      'Reports To',
      'Direct Reports',
      'Average Span Of Control',
      'Reporting Group',
      'Chain Of Command',
      'Active Objectives',
      'On Track Objectives',
    ];
    const csv = [
      headers,
      ...rows.map(row => [
        row.name,
        row.title,
        row.department,
        row.type,
        row.email,
        row.reportsTo,
        row.directReports,
        row.averageSpanOfControl,
        row.reportingGroup,
        row.chainOfCommand,
        row.activeObjectives,
        row.onTrackObjectives,
      ]),
    ].map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadTextFile('sandpro_org_chart_roster.csv', csv, 'text/csv;charset=utf-8');
    addToast?.({ type: 'success', message: 'Org chart CSV exported.' });
  };

  const exportOrgChartExcel = async () => {
    setShowOrgExportMenu(false);
    try {
      const rows = buildOrgChartExportRows({ profiles: orgEntries, objectives });
      const headers = [
        ['Name', 'name'],
        ['Title', 'title'],
        ['Department', 'department'],
        ['Type', 'type'],
        ['Email', 'email'],
        ['Reports To', 'reportsTo'],
        ['Direct Reports', 'directReports'],
        ['Average Span Of Control', 'averageSpanOfControl'],
        ['Reporting Group', 'reportingGroup'],
        ['Chain Of Command', 'chainOfCommand'],
        ['Active Objectives', 'activeObjectives'],
        ['On Track Objectives', 'onTrackObjectives'],
      ];
      const rosterSheet = [
        headers.map(([label]) => ({ value: label, fontWeight: 'bold' })),
        ...rows.map(row => headers.map(([, key]) => ({ value: row[key] ?? '' }))),
      ];
      const summarySheet = [
        ['Metric', 'Value'].map(value => ({ value, fontWeight: 'bold' })),
        [{ value: 'People / entries' }, { value: orgEntries.length }],
        [{ value: 'Visual groups' }, { value: orgEntries.filter(entry => entry.isPlaceholder).length }],
        [{ value: 'Reporting groups' }, { value: orgChartStats.branchCount }],
        [{ value: 'Average direct span' }, { value: orgChartStats.averageDirectSpan }],
        [{ value: 'Managers with span greater than 5' }, { value: orgChartStats.spanAboveFive }],
        [{ value: 'Branches with average span greater than 5' }, { value: orgChartStats.averageAboveFive }],
      ];
      const writeXlsxFile = await loadWriteXlsxFile();
      await writeXlsxFile([
        { data: rosterSheet, sheet: 'Org Chart Roster' },
        { data: summarySheet, sheet: 'Span Summary' },
      ]).toFile('sandpro_org_chart.xlsx');
      addToast?.({ type: 'success', message: 'Org chart Excel workbook exported.' });
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not export the org chart Excel workbook.' });
    }
  };

  const toggleOrgCollapse = (entryId) => {
    setCollapsedOrgIds(current => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const collapseAllOrgBranches = () => {
    setCollapsedOrgIds(new Set(orgEntries.filter(entry => getOrgReports(entry.id).length > 0).map(entry => entry.id)));
  };

  const expandAllOrgBranches = () => {
    setCollapsedOrgIds(new Set());
  };

  const beginEdit = (user) => {
    setSelectedUser(user);
    setEditingUser(user);
    setOrgSaveStatus("");
    setEditDraft({
      name: user.name || "",
      title: user.title || "",
      department: user.department || DEFAULT_DEPARTMENT,
      reportsTo: user.reports_to || "",
      role: user.role || "contributor",
    });
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setOrgSaveStatus("");
    if (selectedUser) {
      setEditDraft({
        name: selectedUser.name || "",
        title: selectedUser.title || "",
        department: selectedUser.department || DEFAULT_DEPARTMENT,
        reportsTo: selectedUser.reports_to || "",
        role: selectedUser.role || "contributor",
      });
    }
  };

  const saveEdit = async () => {
    if (!editingUser || !onUpdateUser) return;
    setSavingUser(true);
    setOrgSaveStatus("Saving org chart...");
    try {
      if (editingUser.isPlaceholder) {
        const { data, error } = await supabase
          .from('org_chart_placeholders')
          .update({
            name: editDraft.name.trim(),
            title: editDraft.title.trim() || "Group placeholder",
            department: editDraft.department,
            reports_to: editDraft.reportsTo || null,
          })
          .eq('id', editingUser.id)
          .select()
          .single();
        if (error) throw error;
        await loadPlaceholders();
        const updatedPlaceholder = { ...data, isPlaceholder: true, orgType: "placeholder", role: "placeholder", email: "" };
        setSelectedUser(updatedPlaceholder);
        setEditingUser(updatedPlaceholder);
        setEditDraft({
          name: updatedPlaceholder.name || "",
          title: updatedPlaceholder.title || "",
          department: updatedPlaceholder.department || DEFAULT_DEPARTMENT,
          reportsTo: updatedPlaceholder.reports_to || "",
          role: "placeholder",
        });
      } else {
        const updated = await onUpdateUser({
          userId: editingUser.id,
          name: editDraft.name,
          title: editDraft.title,
          department: editDraft.department,
          reportsTo: editDraft.reportsTo || null,
          ...(canEditRoles ? { role: editDraft.role } : {}),
        });
        if (updated?.profile) {
          setSelectedUser(updated.profile);
          setEditingUser(updated.profile);
          setEditDraft({
            name: updated.profile.name || "",
            title: updated.profile.title || "",
            department: updated.profile.department || DEFAULT_DEPARTMENT,
            reportsTo: updated.profile.reports_to || "",
            role: updated.profile.role || "contributor",
          });
        }
      }
      setOrgSaveStatus("Saved. The org chart is up to date.");
    } catch (error) {
      setOrgSaveStatus(error.message || "Could not update org chart.");
      addToast?.({ type: 'error', message: error.message || 'Could not update org chart' });
    } finally {
      setSavingUser(false);
    }
  };

  const hasOrgEditChanges = editingUser && (
    editDraft.name !== (editingUser.name || "") ||
    editDraft.title !== (editingUser.title || "") ||
    editDraft.department !== (editingUser.department || DEFAULT_DEPARTMENT) ||
    editDraft.reportsTo !== (editingUser.reports_to || "") ||
    (!editingUser.isPlaceholder && canEditRoles && editDraft.role !== (editingUser.role || "contributor"))
  );

  const addEmployee = async () => {
    const isPlaceholder = addEmployeeDraft.entryType === "placeholder";
    if (!addEmployeeDraft.name.trim() || (!isPlaceholder && (!addEmployeeDraft.email.trim() || !addEmployeeDraft.tempPassword.trim()))) {
      addToast?.({ type: 'error', message: isPlaceholder ? 'Name is required' : 'Name, email, and temporary password are required' });
      return;
    }
    setAddingEmployee(true);
    try {
      if (isPlaceholder) {
        const { error } = await supabase.from('org_chart_placeholders').insert({
          name: addEmployeeDraft.name.trim(),
          title: addEmployeeDraft.title.trim() || "Group placeholder",
          department: addEmployeeDraft.department || DEFAULT_DEPARTMENT,
          reports_to: addEmployeeDraft.reportsTo || null,
          color: "#ff7f02",
          created_by: currentUser.id,
        });
        if (error) throw error;
        await loadPlaceholders();
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/invite-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionData?.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
          },
          body: JSON.stringify(addEmployeeDraft),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Could not add employee');
        onUsersChanged?.();
      }
      addToast?.({ type: 'success', message: `${addEmployeeDraft.name} added to the org chart` });
      setAddEmployeeDraft({ entryType: "employee", name: "", email: "", title: "", department: DEFAULT_DEPARTMENT, role: "contributor", reportsTo: "", tempPassword: "" });
      setShowAddEmployee(false);
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not add employee' });
    } finally {
      setAddingEmployee(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteConfirmUser || (!deleteConfirmUser.isPlaceholder && !onDeleteUser)) return;
    setDeletingUser(true);
    try {
      if (deleteConfirmUser.isPlaceholder) {
        const { error } = await supabase
          .from('org_chart_placeholders')
          .delete()
          .eq('id', deleteConfirmUser.id);
        if (error) throw error;
        await loadPlaceholders();
      } else {
        await onDeleteUser(deleteConfirmUser.id);
      }
      setSelectedUser(null);
      setEditingUser(null);
      setDeleteConfirmUser(null);
    } catch (error) {
      addToast?.({ type: 'error', message: error.message || 'Could not delete employee' });
    } finally {
      setDeletingUser(false);
    }
  };

  const renderPerson = (user) => {
    const reports = getOrgReports(user.id);
    if (orgSearch.trim() && !hasMatchInBranch(user)) return null;
    const userObjs = user.isPlaceholder ? [] : getUserObjectives(user.id);
    const activeObjs = userObjs.filter(o => o.status !== "completed" && o.status !== "cancelled");
    const healthPct = activeObjs.length > 0 ? Math.round((activeObjs.filter(o => o.status === "on_track").length / activeObjs.length) * 100) : null;
    const spanSummary = getOrgSpanSummary(user);
    const hasCollapsedChildren = reports.length > 0 && !orgSearch.trim() && collapsedOrgIds.has(user.id);
    const isSelected = selectedUser?.id === user.id;
    const isMatch = orgSearch.trim() && matchesSearch(user);
    const draggedUser = getOrgEntry(draggedUserId);
    const canDropHere = canDropUser(draggedUser, user);
    const isDropTarget = dropTargetId === user.id && canDropHere;
    const isMoving = movingUserId === user.id;
    const branchColor = getBranchColor(user);
    const branchName = getBranchName(user);
    const hasSpanWarning = spanSummary.direct > 5 || spanSummary.average > 5;
    const showSpanControl = hasSpanWarning || spanSummary.direct > 0 || spanSummary.average > 0;

    return (
      <div
        key={user.id}
        data-org-entry-id={user.id}
        className={`org-tree-node ${reports.length > 0 ? 'has-children' : ''}`}
        style={{ '--org-branch-rgb': branchColor }}
      >
        <div
          draggable={canEditOrg}
          onDragStart={(event) => handleDragStart(event, user)}
          onDragEnd={() => { setDraggedUserId(null); setDropTargetId(null); }}
          onDragOver={(event) => {
            if (!canDropHere) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTargetId(user.id);
          }}
          onDragLeave={() => setDropTargetId(current => current === user.id ? null : current)}
          onDrop={(event) => handleDropOnUser(event, user)}
          onClick={() => setSelectedUser(isSelected ? null : user)}
          className={`org-person-card ${user.isPlaceholder ? 'placeholder' : ''} ${spanSummary.direct > 5 ? 'span-warning' : ''} ${spanSummary.average > 5 ? 'avg-span-warning' : ''} ${isSelected ? 'selected' : ''} ${isMatch ? 'matched' : ''} ${isDropTarget ? 'drop-target' : ''} ${draggedUserId === user.id ? 'dragging' : ''}`}
          title={canEditOrg ? `Drag ${user.name} onto a reporting manager to update the org chart` : user.name}
        >
          {hasSpanWarning && <span className="org-span-marker" aria-hidden="true" />}
          <Avatar user={user} size={32} />
          <div className="org-person-copy">
            <div className="text-md font-semibold">{user.name}</div>
            <div className="text-xs text-muted">{user.title} · {user.department}</div>
            {showSpanControl && (
              <div className="org-span-control">
                <span>Span Of Control: <strong>{spanSummary.direct}</strong></span>
                <span>Avg Span Of Control: <strong>{spanSummary.average}</strong></span>
              </div>
            )}
            <div className="org-branch-label">Group: {branchName}</div>
          </div>
          <div className="flex items-center gap-8">
            {isMoving && <Loader2 size={13} className="animate-spin" color="var(--brand)" />}
            {canEditOrg && (
              <button
                type="button"
                className="icon-btn"
                title={`Edit ${user.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  beginEdit(user);
                }}
                style={{ width: 28, height: 28 }}
              >
                <Edit3 size={13} />
              </button>
            )}
            {user.isPlaceholder && <span className="org-placeholder-badge">Group</span>}
            {activeObjs.length > 0 && <span className="text-xs text-muted">{activeObjs.length} obj</span>}
            {healthPct !== null && (
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: (healthPct >= 70 ? "var(--success)" : healthPct >= 40 ? "var(--warning)" : "var(--error)") + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="text-xs font-bold" style={{ color: healthPct >= 70 ? "var(--success)" : healthPct >= 40 ? "var(--warning)" : "var(--error)" }}>{healthPct}%</span>
              </div>
            )}
            {reports.length > 0 && (
              <button
                type="button"
                className="icon-btn org-collapse-toggle"
                title={hasCollapsedChildren ? `Expand ${user.name}` : `Collapse ${user.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleOrgCollapse(user.id);
                }}
              >
                <ChevronDown size={14} color="var(--accent-7)" style={{ transform: hasCollapsedChildren ? 'rotate(-90deg)' : 'none' }} />
              </button>
            )}
          </div>
        </div>
        {reports.length > 0 && hasCollapsedChildren && (
          <button type="button" className="org-collapsed-count" onClick={() => toggleOrgCollapse(user.id)}>
            {reports.length} hidden {reports.length === 1 ? 'report' : 'reports'}
          </button>
        )}
        {reports.length > 0 && !hasCollapsedChildren && (
          <div className="org-tree-children">
            {reports.map(renderPerson)}
          </div>
        )}
      </div>
    );
  };

  const userObjs = selectedUser && !selectedUser.isPlaceholder ? getUserObjectives(selectedUser.id) : [];
  const reportingOptions = (editingUser?.isPlaceholder ? orgEntries : profileUsers)
    .filter(user => user.id !== (editingUser?.id || selectedUser?.id))
    .filter(user => editingUser?.isPlaceholder || !user.isPlaceholder)
    .sort((a, b) => a.name.localeCompare(b.name));
  const addReportsToOptions = (addEmployeeDraft.entryType === "placeholder" ? orgEntries : profileUsers)
    .filter(user => addEmployeeDraft.entryType === "placeholder" || !user.isPlaceholder)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="org-layout" style={{ height: "100%", display: "flex", gap: 16, overflow: "hidden" }}>
      <div className="card flex flex-col overflow-hidden" style={{ flex: selectedUser ? 1 : 2, transition: "flex 0.3s" }}>
        <div className="card-header" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div className="flex items-center gap-8">
            <Network size={14} color="var(--brand)" />
            <span className="text-md font-bold">Organization</span>
            <span className="text-xs text-muted">({profileUsers.length} {profileUsers.length === 1 ? 'person' : 'people'} · {orgPlaceholders.length} {orgPlaceholders.length === 1 ? 'group' : 'groups'})</span>
            {canEditOrg && <Badge color="var(--brand)">Editable</Badge>}
            <div className="org-view-toggle org-print-hide" role="group" aria-label="Organization view">
              <button type="button" className={orgViewMode === "tree" ? "active" : ""} onClick={() => setOrgViewMode("tree")} title="Tree view">
                <Network size={12} /> Chart
              </button>
              <button type="button" className={orgViewMode === "compact" ? "active" : ""} onClick={() => setOrgViewMode("compact")} title="Compact roster view">
                <List size={12} /> Compact
              </button>
              <button type="button" className={orgViewMode === "directory" ? "active" : ""} onClick={() => setOrgViewMode("directory")} title="Directory view">
                <Users size={12} /> Directory
              </button>
            </div>
            <div style={{ flex: 1 }} />
            {canEditOrg && (
              <button type="button" className="btn btn-xs btn-primary org-print-hide" onClick={() => setShowAddEmployee(true)}>
                <UserPlus size={12} /> Add Entry
              </button>
            )}
            <div className="org-export-menu-wrap org-print-hide">
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => setShowOrgExportMenu(value => !value)}>
                <Download size={12} /> Export
              </button>
              {showOrgExportMenu && (
                <div className="org-export-menu" role="menu" aria-label="Organization export options">
                  <button type="button" onClick={exportOrgChartPdf}>
                    <FileText size={13} />
                    <span><strong>PDF / print packet</strong><small>Full chart plus department roster</small></span>
                  </button>
                  <button type="button" onClick={exportOrgChartPng}>
                    <Image size={13} />
                    <span><strong>PNG image</strong><small>High-quality image for slides or emails</small></span>
                  </button>
                  <button type="button" onClick={exportOrgChartSvg}>
                    <FileIcon size={13} />
                    <span><strong>SVG vector</strong><small>Editable/scalable image export</small></span>
                  </button>
                  <button type="button" onClick={exportOrgChartCsv}>
                    <List size={13} />
                    <span><strong>CSV roster</strong><small>Reporting chain and span fields</small></span>
                  </button>
                  <button type="button" onClick={exportOrgChartExcel}>
                    <FileText size={13} />
                    <span><strong>Excel workbook</strong><small>Roster plus span summary</small></span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="org-navigation-strip org-print-hide">
            <span className="org-navigation-hint">
              Chart view uses compact org-chart cards with span-of-control markers. Use the zoom controls to resize; drag blank canvas to pan.
            </span>
            <div className="org-span-legend" aria-label="Organization span summary">
              <span><strong>{orgChartStats.averageDirectSpan}</strong> avg direct span</span>
              <span><i className="span-dot" /> {orgChartStats.averageAboveFive} avg &gt; 5</span>
              <span><i className="span-corner" /> {orgChartStats.spanAboveFive} span &gt; 5</span>
            </div>
            {orgViewMode === "tree" && (
              <div className="org-navigation-actions" aria-label="Org chart navigation actions">
                <div className="org-tree-orientation-toggle" role="group" aria-label="Org tree orientation">
                  <button type="button" className={orgTreeOrientation === "wide" ? "active" : ""} onClick={() => setOrgTreeOrientation("wide")}>Wide</button>
                  <button type="button" className={orgTreeOrientation === "vertical" ? "active" : ""} onClick={() => setOrgTreeOrientation("vertical")}>Stacked</button>
                </div>
                <button type="button" className="btn btn-xs btn-secondary" onClick={centerSelectedOrgEntry} disabled={!selectedUser}>Selected</button>
                <button type="button" className="btn btn-xs btn-secondary" onClick={expandAllOrgBranches}>Expand all</button>
                <button type="button" className="btn btn-xs btn-secondary" onClick={collapseAllOrgBranches}>Collapse all</button>
                <button type="button" className={`btn btn-xs ${orgProofMode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setOrgProofMode(value => !value)}>
                  <Camera size={12} /> Proof mode
                </button>
              </div>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--accent-7)" }} />
            <input value={orgSearch} onChange={e => setOrgSearch(e.target.value)} placeholder="Search people..." style={{ width: "100%", paddingLeft: 32, fontSize: 12 }} />
            {orgSearch && <button onClick={() => setOrgSearch("")} className="icon-btn" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 22, height: 22 }}><X size={12} /></button>}
          </div>
          {canEditOrg && (
            <FeatureHelp
              id="org-chart-editing"
              title="Editing the org chart"
              defaultOpen={false}
              items={[
                "Drag a person or visual group onto their reporting manager to move them in the tree.",
                "Drop a person or group on Company root to make them top-level.",
                "Click an entry, then Edit, to update its title, department, or reporting manager.",
                "Use Add Entry > Group placeholder for teams such as Field Service Technicians that need no email or login.",
                "Delete removes employees who are no longer tied to objectives, subtasks, messages, or Fix-It posts.",
                "Role changes are kept separate from org cleanup and are limited to platform administrators.",
                "Use the zoom and Fit controls to size the tree, then drag blank canvas space to pan around the chart.",
                "Use Fit, Root, or Selected when the tree gets away from view.",
                "Use Wide for the classic org-chart spread, or Stacked when the team is easier to scan vertically.",
                "Use Expand all and Collapse all when you need to focus on one reporting branch.",
                "Use Export for PDF/print, PNG, SVG, CSV, or Excel outputs depending on where the chart needs to go.",
                "Switch to Compact or Directory when the tree is too wide and you need a dense reporting list.",
              ]}
            />
          )}
        </div>
        <div
          className={`org-tree-scroll ${orgViewMode === "tree" && isOrgPanning ? 'is-panning' : ''} ${orgProofMode && orgViewMode === "tree" ? 'org-proof-mode' : ''}`}
          ref={orgTreeScrollRef}
          onPointerDown={orgViewMode === "tree" ? handleOrgPanStart : undefined}
          onPointerMove={orgViewMode === "tree" ? handleOrgPanMove : undefined}
          onPointerUp={orgViewMode === "tree" ? stopOrgPan : undefined}
          onPointerCancel={orgViewMode === "tree" ? stopOrgPan : undefined}
          onPointerLeave={orgViewMode === "tree" ? stopOrgPan : undefined}
        >
          {orgViewMode === "tree" && <div className="org-canvas-tools org-print-hide" aria-label="Org chart zoom controls">
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => zoomOrgCanvasAt(orgZoomRef.current * 0.85)} title="Zoom out">-</button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => zoomOrgCanvasAt(1)} title="Reset zoom">{Math.round(orgZoom * 100)}%</button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => zoomOrgCanvasAt(orgZoomRef.current * 1.15)} title="Zoom in">+</button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={fitOrgCanvas} title="Fit tree to screen">Fit</button>
            <button type="button" className="btn btn-xs btn-secondary" onClick={centerOrgRoot} title="Center company root">Root</button>
          </div>}
          <div className="org-mobile-list" aria-label="Mobile organization list">
            {(() => {
              const knownIds = new Set(orgEntries.map(entry => entry.id));
              const childrenBy = new Map();
              orgEntries.forEach(entry => {
                const parent = entry.reports_to && knownIds.has(entry.reports_to) ? entry.reports_to : null;
                childrenBy.set(parent, [...(childrenBy.get(parent) || []), entry]);
              });
              const rows = [];
              const seen = new Set();
              const visit = (entry, depth) => {
                if (seen.has(entry.id)) return;
                seen.add(entry.id);
                rows.push({ entry, depth });
                (childrenBy.get(entry.id) || [])
                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .forEach(child => visit(child, depth + 1));
              };
              (childrenBy.get(null) || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(root => visit(root, 0));
              orgEntries.forEach(entry => { if (!seen.has(entry.id)) visit(entry, 0); });
              return rows;
            })()
              .filter(({ entry }) => !orgSearch.trim() || matchesSearch(entry))
              .map(({ entry: user, depth }) => {
                const reports = getOrgReports(user.id);
                const manager = user.reports_to ? getOrgEntry(user.reports_to) : null;
                const userObjs = user.isPlaceholder ? [] : getUserObjectives(user.id);
                const activeObjs = userObjs.filter(o => o.status !== "completed" && o.status !== "cancelled");
                const branchColor = getBranchColor(user);
                const branchName = getBranchName(user);
                return (
                  <button key={user.id} type="button" className={`org-mobile-person ${user.isPlaceholder ? 'placeholder' : ''} ${selectedUser?.id === user.id ? 'selected' : ''} ${depth > 0 && !orgSearch.trim() ? 'org-mobile-nested' : ''}`} style={{ '--org-branch-rgb': branchColor, '--org-mobile-depth': Math.min(depth, 4) }} onClick={() => setSelectedUser(user)}>
                    <Avatar user={user} size={38} />
                    <span className="org-mobile-person-copy">
                      <strong>{user.name}</strong>
                      <small>{user.title} · {user.department}</small>
                      <small>{manager ? `Reports to ${manager.name}` : 'Company root'} · {reports.length} reports{user.isPlaceholder ? ' · Visual group' : ` · ${activeObjs.length} active obj`}</small>
                      <small className="org-mobile-branch">Group: {branchName}</small>
                    </span>
                    {canEditOrg && <Edit3 size={15} color="var(--brand)" onClick={(event) => { event.stopPropagation(); beginEdit(user); }} />}
                  </button>
                );
              })}
          </div>
          {orgViewMode === "directory" ? (
            <div className="org-directory-view" aria-label="Organization directory view">
              <div className="org-directory-summary">
                <strong>{directoryRows.length}</strong>
                <span>{directoryRows.length === 1 ? 'entry' : 'entries'} matching the current search</span>
              </div>
              <div className="org-directory-grid">
                {directoryRows.map(row => (
                  <button
                    key={row.entry.id}
                    type="button"
                    className={`org-directory-card ${row.entry.isPlaceholder ? 'placeholder' : ''} ${selectedUser?.id === row.entry.id ? 'selected' : ''}`}
                    style={{ '--org-branch-rgb': row.branchColor }}
                    onClick={() => setSelectedUser(row.entry)}
                  >
                    <Avatar user={row.entry} size={34} />
                    <span className="org-directory-copy">
                      <strong>{row.entry.name}</strong>
                      <small>{row.entry.title} · {row.entry.department}</small>
                      <small>{row.manager ? `Reports to ${row.manager.name}` : 'Company root'} · {row.reports.length} direct reports</small>
                      <small className="org-branch-label">Group: {row.branchName}</small>
                    </span>
                    <span className="org-directory-meta">
                      {row.entry.isPlaceholder ? 'Group' : `${row.activeObjs.length} active`}
                    </span>
                  </button>
                ))}
              </div>
              {directoryRows.length === 0 && <EmptyState icon={Users} text="No matching directory entries." />}
            </div>
          ) : orgViewMode === "compact" ? (
            <div className="org-compact-view" aria-label="Compact organization view">
              <div className="org-compact-head">
                <span>Person or group</span>
                <span>Reports to</span>
                <span>Team</span>
                <span>Workload</span>
              </div>
              {compactOrgRows.map(row => {
                const userObjs = row.entry.isPlaceholder ? [] : getUserObjectives(row.entry.id);
                const activeObjs = userObjs.filter(o => o.status !== "completed" && o.status !== "cancelled");
                const onTrack = activeObjs.filter(o => o.status === "on_track").length;
                return (
                  <button
                    key={row.entry.id}
                    type="button"
                    className={`org-compact-row ${row.entry.isPlaceholder ? 'placeholder' : ''} ${selectedUser?.id === row.entry.id ? 'selected' : ''}`}
                    style={{ '--org-branch-rgb': row.branchColor, '--org-depth': row.depth }}
                    onClick={() => setSelectedUser(row.entry)}
                  >
                    <span className="org-compact-person">
                      <Avatar user={row.entry} size={30} />
                      <span>
                        <strong>{row.entry.name}</strong>
                        <small>{row.entry.title} · {row.entry.department}</small>
                        <small className="org-branch-label">Group: {row.branchName}</small>
                      </span>
                    </span>
                    <span className="org-compact-manager">{row.manager ? row.manager.name : 'Company root'}</span>
                    <span className="org-compact-meta">
                      <span>{row.reports.length} direct</span>
                      {row.entry.isPlaceholder && <span>Group</span>}
                    </span>
                    <span className="org-compact-meta">
                      <span>{activeObjs.length} active</span>
                      <span>{onTrack} on track</span>
                    </span>
                  </button>
                );
              })}
              {compactOrgRows.length === 0 && <EmptyState icon={Network} text="No matching org entries." />}
            </div>
          ) : <div
            className={`org-tree-canvas-viewport ${orgTreeOrientation === "vertical" ? "vertical-tree" : "wide-tree"}`}
            style={{
              width: `${Math.max(orgCanvasSize.width * orgZoom, orgTreeOrientation === "vertical" ? 980 : WIDE_ORG_CANVAS_MIN_WIDTH)}px`,
              height: `${Math.max(orgCanvasSize.height * orgZoom, orgTreeOrientation === "vertical" ? 1600 : WIDE_ORG_CANVAS_MIN_HEIGHT)}px`,
            }}
          >
            <div
              className={`org-tree-canvas ${orgTreeOrientation === "vertical" ? "vertical-tree" : "wide-tree"}`}
              ref={orgTreeCanvasRef}
              style={{ transform: `scale(${orgZoom})` }}
            >
              {canEditOrg && (
                <div
                  className={`org-root-drop ${dropTargetId === 'root' ? 'drop-target' : ''}`}
                  onDragOver={(event) => {
                    const draggedUser = getOrgEntry(draggedUserId);
                    if (!canDropUser(draggedUser, null)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTargetId('root');
                  }}
                  onDragLeave={() => setDropTargetId(current => current === 'root' ? null : current)}
                  onDrop={handleRootDrop}
                >
                  <Network size={14} />
                  <span>Company root</span>
                </div>
              )}
              <div className="org-tree">
                {orgEntries.filter(u => !u.reports_to || !orgEntryIds.has(u.reports_to)).map(renderPerson)}
              </div>
            </div>
          </div>}
        </div>
      </div>

      {selectedUser && (
        <div className="card flex flex-col overflow-hidden" style={{ flex: 1, animation: "slideUp 0.2s ease" }}>
          <div className="card-header">
            <Avatar user={selectedUser} size={36} />
            <div>
              <div className="text-md font-bold">{selectedUser.name}</div>
              <div className="text-xs text-muted">{selectedUser.title} · {selectedUser.isPlaceholder ? 'Visual group, no login' : selectedUser.email}</div>
            </div>
            <div style={{ flex: 1 }} />
            {canEditOrg && (
              <button className="btn btn-xs btn-secondary" onClick={() => beginEdit(selectedUser)}>
                <Edit3 size={12} /> Edit
              </button>
            )}
            <button className="icon-btn" onClick={() => setSelectedUser(null)}><X size={16} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {editingUser?.id === selectedUser.id && (
              <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: "var(--brand-border)" }}>
                <div className="text-sm font-bold text-primary" style={{ marginBottom: 8 }}>Edit org details</div>
                <div className="org-edit-grid">
                  <label>
                    <span>Name</span>
                    <input value={editDraft.name} onChange={e => { setOrgSaveStatus(""); setEditDraft(d => ({ ...d, name: e.target.value })); }} />
                  </label>
                  <label>
                    <span>Title</span>
                    <input value={editDraft.title} onChange={e => { setOrgSaveStatus(""); setEditDraft(d => ({ ...d, title: e.target.value })); }} />
                  </label>
                  <label>
                    <span>Department</span>
                    <select value={editDraft.department} onChange={e => { setOrgSaveStatus(""); setEditDraft(d => ({ ...d, department: e.target.value })); }}>
                      {getDepartmentOptions(editDraft.department).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Reports to</span>
                    <select value={editDraft.reportsTo} onChange={e => { setOrgSaveStatus(""); setEditDraft(d => ({ ...d, reportsTo: e.target.value })); }}>
                      <option value="">No reporting manager</option>
                      {reportingOptions.map(u => <option key={u.id} value={u.id}>{u.name} - {u.title}</option>)}
                    </select>
                  </label>
                  {canEditRoles && !editingUser.isPlaceholder && (
                    <label>
                      <span>Role</span>
                      <select value={editDraft.role} onChange={e => { setOrgSaveStatus(""); setEditDraft(d => ({ ...d, role: e.target.value })); }}>
                        <option value="contributor">Contributor</option>
                        <option value="manager">Manager</option>
                        <option value="executive">Executive</option>
                      </select>
                    </label>
                  )}
                </div>
                {orgSaveStatus && (
                  <div className={`org-save-status ${orgSaveStatus.startsWith("Saved") ? "success" : orgSaveStatus.startsWith("Saving") ? "pending" : "error"}`} role="status">
                    {orgSaveStatus}
                  </div>
                )}
                <div className="flex gap-8" style={{ marginTop: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={cancelEdit} disabled={savingUser}>Cancel</button>
                  {(selectedUser.isPlaceholder || selectedUser.id !== currentUser?.id) && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteConfirmUser(selectedUser)}
                      disabled={savingUser || deletingUser}
                      style={{ marginLeft: "auto" }}
                    >
                      <Trash2 size={12} /> {selectedUser.isPlaceholder ? "Delete group" : "Delete employee"}
                    </button>
                  )}
                  <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={savingUser || !editDraft.name.trim() || !hasOrgEditChanges}>
                    <Check size={12} /> {savingUser ? "Saving..." : "Save org chart"}
                  </button>
                </div>
              </div>
            )}
            {userObjs.length === 0 ? <EmptyState icon={selectedUser.isPlaceholder ? Network : Target} text={selectedUser.isPlaceholder ? `${selectedUser.name} is a visual org group and does not own objectives.` : `No objectives assigned to ${selectedUser.name.split(" ")[0]}.`} /> :
              <div className="flex flex-col gap-8">
                {userObjs.map(obj => <ObjectiveCard key={obj.id} obj={obj} onClick={() => onOpenCard(obj)} />)}
              </div>
            }
          </div>
        </div>
      )}
      {showAddEmployee && (
        <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={e => { if (e.target === e.currentTarget && !addingEmployee) setShowAddEmployee(false); }}>
          <div className="modal-content" style={{ width: "min(92vw, 520px)" }}>
            <div className="card-header"><UserPlus size={16} color="var(--brand)" /><span className="text-md font-bold">Add org chart entry</span></div>
            <div style={{ padding: 16 }}>
              <div className="segmented-control" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className={addEmployeeDraft.entryType === "employee" ? "active" : ""}
                  onClick={() => setAddEmployeeDraft(d => ({ ...d, entryType: "employee", reportsTo: profileUsers.some(user => user.id === d.reportsTo) ? d.reportsTo : "" }))}
                >
                  Employee login
                </button>
                <button
                  type="button"
                  className={addEmployeeDraft.entryType === "placeholder" ? "active" : ""}
                  onClick={() => setAddEmployeeDraft(d => ({ ...d, entryType: "placeholder" }))}
                >
                  Group placeholder
                </button>
              </div>
              {addEmployeeDraft.entryType === "placeholder" && (
                <div className="org-placeholder-note">
                  Visual only. No email, password, login, mentions, notifications, or objective ownership.
                </div>
              )}
              <div className="org-edit-grid">
                <label><span>Name</span><input value={addEmployeeDraft.name} onChange={e => setAddEmployeeDraft(d => ({ ...d, name: e.target.value }))} /></label>
                {addEmployeeDraft.entryType === "employee" && <label><span>Email</span><input type="email" value={addEmployeeDraft.email} onChange={e => setAddEmployeeDraft(d => ({ ...d, email: e.target.value }))} /></label>}
                <label><span>Title</span><input value={addEmployeeDraft.title} onChange={e => setAddEmployeeDraft(d => ({ ...d, title: e.target.value }))} /></label>
                <label><span>Department</span><select value={addEmployeeDraft.department} onChange={e => setAddEmployeeDraft(d => ({ ...d, department: e.target.value }))}>{getDepartmentOptions(addEmployeeDraft.department).map(d => <option key={d} value={d}>{d}</option>)}</select></label>
                <label><span>Reports to</span><select value={addEmployeeDraft.reportsTo} onChange={e => setAddEmployeeDraft(d => ({ ...d, reportsTo: e.target.value }))}><option value="">No reporting manager</option>{addReportsToOptions.map(u => <option key={u.id} value={u.id}>{u.name} - {u.title}</option>)}</select></label>
                {addEmployeeDraft.entryType === "employee" && canEditRoles && <label><span>Role</span><select value={addEmployeeDraft.role} onChange={e => setAddEmployeeDraft(d => ({ ...d, role: e.target.value }))}><option value="contributor">Contributor</option><option value="manager">Manager</option><option value="executive">Executive</option></select></label>}
                {addEmployeeDraft.entryType === "employee" && <label><span>Temporary password</span><input type="password" value={addEmployeeDraft.tempPassword} onChange={e => setAddEmployeeDraft(d => ({ ...d, tempPassword: e.target.value }))} /></label>}
              </div>
              <div className="flex gap-8 justify-between" style={{ marginTop: 14 }}>
                <button className="btn btn-secondary" onClick={() => setShowAddEmployee(false)} disabled={addingEmployee}>Cancel</button>
                <button className="btn btn-primary" onClick={addEmployee} disabled={addingEmployee}>
                  {addingEmployee ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} {addingEmployee ? "Adding..." : addEmployeeDraft.entryType === "placeholder" ? "Add group" : "Add employee"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {deleteConfirmUser && (
        <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={e => { if (e.target === e.currentTarget && !deletingUser) setDeleteConfirmUser(null); }}>
          <div className="modal-content" style={{ width: "min(92vw, 440px)" }}>
            <div className="card-header"><Trash2 size={16} color="var(--error)" /><span className="text-md font-bold">{deleteConfirmUser.isPlaceholder ? "Delete group" : "Delete employee"}</span></div>
            <div style={{ padding: 16 }}>
              <p className="text-sm text-secondary" style={{ lineHeight: 1.5, marginBottom: 12 }}>
                {deleteConfirmUser.isPlaceholder
                  ? `Remove ${deleteConfirmUser.name} from the visual org chart? This does not affect logins, objectives, notifications, or employee profiles.`
                  : `Delete ${deleteConfirmUser.name} from SandPro OMP? This removes their profile and login. If they still own or created work, the app will stop and ask you to reassign that work first.`}
              </p>
              <div className="flex gap-8 justify-between">
                <button className="btn btn-secondary" onClick={() => setDeleteConfirmUser(null)} disabled={deletingUser}>Cancel</button>
                <button className="btn btn-danger" onClick={confirmDeleteUser} disabled={deletingUser}>
                  <Trash2 size={13} /> {deletingUser ? "Deleting..." : deleteConfirmUser.isPlaceholder ? "Delete group" : "Delete employee"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ============================================================================
// SETTINGS PANEL — CSV Import + Notification Preferences
// ============================================================================
const SettingsPanel = ({ currentUser, objectives, createNotification, onUpdateUser }) => {
  const [csvData, setCsvData] = useState(null);
  const [showSQL, setShowSQL] = useState(false);
  const csvInputRef = useRef(null);
  const [testStatus, setTestStatus] = useState("");
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [prefsStatus, setPrefsStatus] = useState("");
  const pushNotifications = usePushNotifications(currentUser?.id);
  const [permissionUserId, setPermissionUserId] = useState("");
  const [permissionRole, setPermissionRole] = useState("contributor");
  const [permissionStatus, setPermissionStatus] = useState("");
  const permissionUsers = [...getProfiles()].sort((a, b) => a.name.localeCompare(b.name));
  const selectedPermissionUser = permissionUsers.find(user => user.id === permissionUserId) || null;
  const canEditPermissions = canManagePermissions(currentUser);

  useEffect(() => {
    let cancelled = false;
    const loadPrefs = async () => {
      if (!currentUser?.id) return;
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setPrefsStatus("Using defaults until notification preferences are migrated.");
        return;
      }
      setPrefs({ ...DEFAULT_PREFS, ...prefsFromRow(data) });
      setPrefsStatus(data ? "Preferences loaded from SandPro OMP." : "Using default email preferences.");
    };
    loadPrefs();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const updatePref = async (key, val) => {
    const updated = { ...prefs, [key]: val };
    setPrefs(updated);
    setPrefsStatus("Saving...");
    const { error } = await supabase
      .from('notification_preferences')
      .upsert(rowFromPrefs(currentUser.id, updated), { onConflict: 'user_id' });
    setPrefsStatus(error ? "Could not save preference yet. Check release migration." : "Preferences saved.");
  };

  useEffect(() => {
    if (!canEditPermissions || permissionUserId || permissionUsers.length === 0) return;
    const merci = permissionUsers.find(user => /merci|mercileidy/i.test(`${user.name} ${user.email}`));
    const initialUser = merci || permissionUsers[0];
    setPermissionUserId(initialUser.id);
    setPermissionRole(initialUser.role || "contributor");
  }, [canEditPermissions, permissionUserId, permissionUsers]);

  const selectPermissionUser = (userId) => {
    const user = permissionUsers.find(profile => profile.id === userId);
    setPermissionUserId(userId);
    setPermissionRole(user?.role || "contributor");
    setPermissionStatus("");
  };

  const savePermissionRole = async () => {
    if (!selectedPermissionUser || !onUpdateUser) return;
    setPermissionStatus("Saving permissions...");
    try {
      await onUpdateUser({
        userId: selectedPermissionUser.id,
        name: selectedPermissionUser.name,
        title: selectedPermissionUser.title || "",
        department: selectedPermissionUser.department || "",
        reportsTo: selectedPermissionUser.reports_to || null,
        role: permissionRole,
        color: selectedPermissionUser.color,
      });
      setPermissionStatus(`${selectedPermissionUser.name} is now ${permissionRole}.`);
    } catch (error) {
      setPermissionStatus(error.message || "Could not update permissions.");
    }
  };

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\\n').filter(l => l.trim());
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });
      setCsvData({ headers, rows });
    };
    reader.readAsText(file);
  };

  const sendTestNotification = async (type) => {
    if (!currentUser || !createNotification) return;
    const obj = objectives.find(o => o.ownerId === currentUser.id) || objectives[0];
    if (!obj) { setTestStatus("Create an objective before sending test notifications."); return; }
    const labels = {
      assignment: "Test assignment notification",
      due_soon: "Test due-soon reminder",
      overdue: "Test overdue reminder",
      blocker: "Test blocked/at-risk alert",
    };
    setTestStatus("Sending test notification...");
    try {
      await createNotification(currentUser.id, type, obj.id, `${labels[type]}: ${obj.title}`);
      setTestStatus("Test notification sent. Open the bell to confirm the direct objective link.");
    } catch (err) {
      setTestStatus(err.message || "Could not send test notification.");
    }
  };

  const enablePush = async () => {
    setPrefsStatus("Starting push setup...");
    const result = await pushNotifications.enable();
    if (result.ok) {
      setPrefs(prev => ({ ...prev, pushEnabled: true }));
      setPrefsStatus("Push notifications are enabled on this device.");
      return;
    }
    setPrefsStatus(pushNotifications.message || "Push was not enabled. Check this device's notification settings.");
  };

  const disablePush = async () => {
    setPrefsStatus("Disabling push...");
    const result = await pushNotifications.disable();
    if (result.ok) setPrefs(prev => ({ ...prev, pushEnabled: false }));
    setPrefsStatus(result.ok ? "Push notifications are disabled on this device." : "Could not disable push on this device.");
  };

  const Toggle = ({ checked, onChange, label, desc }) => (
    <div className="flex items-center justify-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--accent-4)" }}>
      <div><div className="text-sm font-medium">{label}</div>{desc && <div className="text-xs text-muted">{desc}</div>}</div>
      <div onClick={() => onChange(!checked)} className="cursor-pointer" style={{
        width: 40, height: 22, borderRadius: 11, background: checked ? "var(--brand)" : "var(--accent-5)",
        position: "relative", transition: "background 0.2s", flexShrink: 0
      }}><div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: checked ? 20 : 2, transition: "left 0.2s" }} /></div>
    </div>
  );

  return (
    <div>
      {canEditPermissions && (
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
            <Shield size={14} color="var(--brand)" />
            <span className="text-sm font-bold">User Permissions</span>
          </div>
          <p className="text-xs text-muted" style={{ marginBottom: 10 }}>
            Platform administrators can change access levels here for current and future users.
          </p>
          <div className="flex flex-col gap-8">
            <label>
              <div className="text-xs font-semibold text-muted" style={{ marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>User</div>
              <select value={permissionUserId} onChange={e => selectPermissionUser(e.target.value)} style={{ width: "100%", fontSize: 12 }}>
                {permissionUsers.map(user => (
                  <option key={user.id} value={user.id}>{user.name} - {user.title || user.email}</option>
                ))}
              </select>
            </label>
            <label>
              <div className="text-xs font-semibold text-muted" style={{ marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>Access Level</div>
              <select value={permissionRole} onChange={e => setPermissionRole(e.target.value)} style={{ width: "100%", fontSize: 12 }}>
                <option value="contributor">Contributor - own assigned work</option>
                <option value="manager">Manager - team objectives and delegation</option>
                <option value="executive">Executive - full company access</option>
              </select>
            </label>
            <button
              className="btn btn-primary btn-sm"
              onClick={savePermissionRole}
              disabled={!selectedPermissionUser || permissionRole === selectedPermissionUser.role}
              style={{ justifyContent: "center" }}
            >
              <Shield size={12} /> Save Permissions
            </button>
          </div>
          {permissionStatus && <div className="text-xs text-muted" style={{ marginTop: 8 }}>{permissionStatus}</div>}
        </div>
      )}

      {/* Push Notifications */}
      <div className="card push-settings-card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Bell size={14} color="var(--brand)" />
          <span className="text-sm font-bold">Push Notification Setup</span>
        </div>
        <p className="text-xs text-muted" style={{ marginBottom: 10 }}>
          Adds quiet phone/PWA heads-up alerts for direct mentions, assignments, blockers, at-risk work, overdue items, and high-priority due work. The app bell remains the permanent notification record.
        </p>
        <p className="text-xs text-muted" style={{ marginBottom: 10 }}>
          iPhone: open in Safari, Add to Home Screen, then enable push from the installed app. Android: open in Chrome, Install app, then enable push from the installed app.
        </p>
        <div className="push-status-row">
          <span className={`push-status-pill ${pushNotifications.enabled ? 'enabled' : ''}`}>
            {pushNotifications.enabled ? 'Enabled on this device' : pushNotifications.reason === 'ios_requires_pwa' ? 'Add to Home Screen first' : pushNotifications.permission === 'denied' ? 'Blocked by phone/browser' : pushNotifications.supported ? 'Ready to enable' : 'Unsupported'}
          </span>
          <div className="flex gap-6">
            {!pushNotifications.enabled && pushNotifications.supported && (
              <button type="button" className="btn btn-primary btn-xs" onClick={enablePush} disabled={pushNotifications.loading}>
                {pushNotifications.loading ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />} Enable push
              </button>
            )}
            {pushNotifications.enabled && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={disablePush} disabled={pushNotifications.loading}>
                Disable
              </button>
            )}
          </div>
        </div>
        {pushNotifications.message && <div className="text-xs text-muted" style={{ marginTop: 8 }}>{pushNotifications.message}</div>}
      </div>

      {/* Notification Preferences */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Mail size={14} color="var(--brand)" />
          <span className="text-sm font-bold">Notification Preferences</span>
        </div>
        <FeatureHelp
          id="notification-preferences"
          title="Keeping notifications useful"
          items={[
            "The morning brief is the only email sent during the pilot.",
            "Assignments, mentions, reminders, and work alerts use push and the app bell.",
            "Use the test center below after changing rules so the team knows what to expect.",
          ]}
        />
        <p className="text-xs text-muted" style={{ marginBottom: 8 }}>The pilot sends one morning email to Andrew, Jake, Merci, and Tim. All categories below are push and in-app alerts.</p>
        <Toggle label="Daily Brief Email" desc="One morning email during the pilot" checked={prefs.emailEnabled} onChange={v => updatePref('emailEnabled', v)} />
        <Toggle label="Due Reminders" desc="Push when objectives are due within 24 hours" checked={prefs.dueReminders} onChange={v => updatePref('dueReminders', v)} />
        <Toggle label="Overdue Alerts" desc="Push when objectives pass their due date" checked={prefs.overdueAlerts} onChange={v => updatePref('overdueAlerts', v)} />
        <Toggle label="Blocker Notifications" desc="Push for blocked or at-risk work" checked={prefs.blockerAlerts} onChange={v => updatePref('blockerAlerts', v)} />
        <Toggle label="Comment Notifications" desc="Push for messages on objectives you own or watch" checked={prefs.commentNotifications} onChange={v => updatePref('commentNotifications', v)} />
        <Toggle label="Delegation Alerts" desc="Push when assigned or added to objectives" checked={prefs.delegationAlerts} onChange={v => updatePref('delegationAlerts', v)} />
        <div className="flex items-center justify-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--accent-4)" }}>
          <div><div className="text-sm font-medium">Daily Brief Cadence</div><div className="text-xs text-muted">Morning email schedule</div></div>
          <select value={prefs.digestFrequency} onChange={e => updatePref('digestFrequency', e.target.value)} style={{ fontSize: 12 }}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="off">Off</option>
          </select>
        </div>
        {prefsStatus && <div className="text-xs text-muted" style={{ marginTop: 8 }}>{prefsStatus}</div>}
      </div>

      {/* CSV Import */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Upload size={14} color="var(--brand)" />
        <span className="text-sm font-bold">CSV Import Guide</span>
        </div>
        <p className="text-xs text-muted" style={{ marginBottom: 8 }}>Parse and preview users from CSV. This does not import users directly yet. Required columns: name, email. Optional: title, department, role.</p>
        <input ref={csvInputRef} type="file" accept=".csv" hidden onChange={handleCSV} />
        <button className="btn btn-secondary btn-sm w-full" onClick={() => csvInputRef.current?.click()} style={{ justifyContent: "center", marginBottom: 8 }}>
          <Upload size={12} /> Select CSV File
        </button>
        {csvData && (
          <div>
            <div className="text-xs font-semibold" style={{ color: "var(--success)", marginBottom: 6 }}>{csvData.rows.length} users parsed</div>
            <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--accent-5)", borderRadius: 8, marginBottom: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ background: "var(--accent-4)" }}>
                  {csvData.headers.slice(0, 4).map(h => <th key={h} style={{ padding: "4px 6px", textAlign: "left", textTransform: "capitalize", color: "var(--accent-8)" }}>{h}</th>)}
                </tr></thead>
                <tbody>{csvData.rows.slice(0, 10).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--accent-4)" }}>
                    {csvData.headers.slice(0, 4).map(h => <td key={h} style={{ padding: "3px 6px", color: "var(--accent-9)" }}>{r[h]}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="text-xs text-muted" style={{ marginBottom: 6 }}>To import, use the Supabase admin API or run a seed script with these users.</div>
            <button className="btn btn-xs btn-secondary" onClick={() => { setShowSQL(!showSQL); }}>
              {showSQL ? "Hide" : "Show"} Import Guide
            </button>
            {showSQL && (
              <pre style={{ marginTop: 8, padding: 8, background: "var(--accent-4)", borderRadius: 6, fontSize: 10, color: "var(--accent-8)", overflowX: "auto", whiteSpace: "pre-wrap" }}>
{csvData.rows.map(r => `supabase.auth.admin.createUser({
  email: "${r.email || ''}",
  password: "<set-secure-password>",
  email_confirm: true,
  user_metadata: {
    name: "${r.name || r.full_name || ''}",
    title: "${r.title || r.job_title || ''}",
    department: "${r.department || r.dept || ''}",
    role: "${r.role || 'contributor'}"
  }
});`).join('\n\n')}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Notification Test Center */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Bell size={14} color="var(--brand)" />
          <span className="text-sm font-bold">Notification Test Center</span>
        </div>
        <p className="text-xs text-muted" style={{ marginBottom: 8 }}>Generate test alerts with direct objective links. When Resend environment variables are present, this also writes the email delivery log.</p>
        <div className="flex gap-6 flex-wrap">
          <button className="btn btn-xs btn-secondary" onClick={() => sendTestNotification('assignment')}>Assignment</button>
          <button className="btn btn-xs btn-secondary" onClick={() => sendTestNotification('due_soon')}>Due Soon</button>
          <button className="btn btn-xs btn-secondary" onClick={() => sendTestNotification('overdue')}>Overdue</button>
          <button className="btn btn-xs btn-secondary" onClick={() => sendTestNotification('blocker')}>Blocked</button>
        </div>
        {testStatus && <div className="text-xs text-muted" style={{ marginTop: 8 }}>{testStatus}</div>}
      </div>

      {/* Role Permissions (informational) */}
      <div className="card" style={{ padding: 14 }}>
        <div className="flex items-center gap-6" style={{ marginBottom: 8 }}>
          <Shield size={14} color="var(--brand)" />
          <span className="text-sm font-bold">Role Permissions</span>
        </div>
        {[{ role: "Executive", color: "var(--brand)", perms: "Full access, all objectives, org-wide reports" },
          { role: "Manager", color: "var(--info)", perms: "Team objectives, delegation, department reports" },
          { role: "Contributor", color: "var(--accent-7)", perms: "Own objectives, acknowledge delegations" }
        ].map(r => (
          <div key={r.role} className="flex items-center gap-8" style={{ padding: "6px 0", borderBottom: "1px solid var(--accent-4)" }}>
            <Badge color={r.color}>{r.role}</Badge>
            <span className="text-xs text-muted">{r.perms}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// ADMIN SIDEBAR
// ============================================================================
export const AdminSidebar = ({
  isOpen,
  onToggle,
  requestedSection = null,
  onSectionChange,
  fixItCount = 0,
  fixItContent = null,
  objectives,
  ncrReports = [],
  currentUser,
  createNotification,
  onUsersChanged,
  onUpdateUser,
}) => {
  const [activeSection, setActiveSection] = useState(requestedSection || "users");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");
  const [exportFilters, setExportFilters] = useState({ status: "all", owner: "all", department: "all", priority: "all" });
  const [ncrExportFilters, setNcrExportFilters] = useState({ status: "all", group: "all", type: "all", severity: "all" });
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    title: "",
    department: DEFAULT_DEPARTMENT,
    role: "contributor",
    tempPassword: "",
    reportsTo: "",
  });
  const sections = [
    { id: "fixit", label: "Feed", icon: Wrench, count: fixItCount },
    { id: "users", label: "Users", icon: Users },
    { id: "departments", label: "Depts", icon: Building2 },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "export", label: "Export", icon: Download },
    { id: "settings", label: "Settings", icon: Settings },
  ];
  useEffect(() => {
    if (requestedSection) setActiveSection(requestedSection);
  }, [requestedSection]);
  const selectSection = (sectionId, options = {}) => {
    setActiveSection(sectionId);
    onSectionChange?.(sectionId, options);
  };
  const downloadCsv = (filename, rows) => {
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportDepartments = [...new Set(objectives.map(objective => objective.department).filter(Boolean))].sort();
  const exportOwners = getProfiles().filter(user => user?.id).sort((a, b) => a.name.localeCompare(b.name));
  const filteredExportObjectives = objectives.filter(objective => {
    if (exportFilters.status !== "all" && objective.status !== exportFilters.status) return false;
    if (exportFilters.owner !== "all" && objective.ownerId !== exportFilters.owner) return false;
    if (exportFilters.department !== "all" && objective.department !== exportFilters.department) return false;
    if (exportFilters.priority !== "all" && objective.priority !== exportFilters.priority) return false;
    return true;
  });
  const updateExportFilter = (key, value) => setExportFilters(filters => ({ ...filters, [key]: value }));
  const ncrExportStatus = (report) => {
    if (report.closed || report.status === 'closed') return 'closed';
    if (report.linkedObjectiveId || report.status === 'in_progress') return 'in_progress';
    return 'open';
  };
  const ncrGroups = [...new Set(ncrReports.map(getNcrDepartmentValue).filter(Boolean))].sort();
  const ncrTypes = [...new Set(ncrReports.map(report => report.eventType || 'Unspecified').filter(Boolean))].sort();
  const ncrSeverities = [...new Set(ncrReports.map(report => report.severity || 'Unspecified').filter(Boolean))].sort();
  const filteredExportNcrs = ncrReports.filter(report => {
    if (ncrExportFilters.status !== 'all' && ncrExportStatus(report) !== ncrExportFilters.status) return false;
    if (ncrExportFilters.group !== 'all' && getNcrDepartmentValue(report) !== ncrExportFilters.group) return false;
    if (ncrExportFilters.type !== 'all' && (report.eventType || 'Unspecified') !== ncrExportFilters.type) return false;
    if (ncrExportFilters.severity !== 'all' && (report.severity || 'Unspecified') !== ncrExportFilters.severity) return false;
    return true;
  });
  const updateNcrExportFilter = (key, value) => setNcrExportFilters(filters => ({ ...filters, [key]: value }));
  const exportNcrCsv = () => downloadCsv("sandpro_ncr_custom_report.csv", [
    ["Report #", "Broad Status", "Lifecycle Stage", "Group", "Event Type", "Criticality", "Report Date", "Follow-Up Due", "Observer", "Location", "Owner ID", "Reviewer ID", "Verifier ID", "Affected Product", "Affected Equipment", "Affected Job", "Disposition", "Containment Required", "Description", "Root Cause", "Immediate Action", "Permanent Action", "Action Effective?", "Effectiveness Verification", "Recurrence Prevented?", "Repeat Issue?", "Action Count", "Evidence Count", "Linked Objective ID"],
    ...filteredExportNcrs.map(report => [
      report.reportNumber,
      ncrExportStatus(report).replace('_', ' '),
      getNcrStageLabel(report.lifecycleStage),
      getNcrDepartmentValue(report),
      report.eventType || 'Unspecified',
      report.severity || 'Unspecified',
      report.reportDate ? new Date(report.reportDate).toLocaleDateString() : '',
      report.followUpDueDate ? new Date(report.followUpDueDate).toLocaleDateString() : '',
      report.observer || '',
      report.operatorLocation || report.worksiteArea || '',
      report.ownerId || '',
      report.reviewerId || '',
      report.verifierId || '',
      report.affectedProduct || '',
      report.affectedEquipment || '',
      report.affectedJob || '',
      report.disposition || '',
      report.containmentRequired ? 'Yes' : 'No',
      report.eventDescription || '',
      report.rootCauseAnalysis || report.rootCauseCodes || '',
      report.immediateAction || '',
      report.permanentAction || '',
      normalizeNcrYesNo(report.actionEffective),
      report.effectivenessSummary || '',
      report.recurrencePrevented === true ? 'Yes' : report.recurrencePrevented === false ? 'No' : '',
      report.repeatIssue === true ? 'Yes' : report.repeatIssue === false ? 'No' : '',
      report.actionItems?.length || 0,
      report.attachments?.length || 0,
      report.linkedObjectiveId || '',
    ]),
  ]);
  const inviteUser = async () => {
    if (!inviteForm.email || !inviteForm.name || !inviteForm.tempPassword) {
      setInviteStatus("Name, email, and temporary password are required.");
      return;
    }
    setInviteStatus("Creating user...");
    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/invite-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionData?.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
      },
      body: JSON.stringify(inviteForm),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInviteStatus(payload.error || "Could not create user.");
      return;
    }
    setInviteStatus(`Created ${payload.email}. They will be forced to change the temporary password.`);
    setInviteForm({ email: "", name: "", title: "", department: DEFAULT_DEPARTMENT, role: "contributor", tempPassword: "", reportsTo: "" });
    setShowInvite(false);
    onUsersChanged?.();
  };

  if (!isOpen) {
    return (
      <aside className="admin-sidebar admin-sidebar-collapsed" aria-label="Admin sidebar">
        <button className="icon-btn active" onClick={onToggle} title="Open Admin"><Shield size={16} /></button>
        {sections.map(s => (
          <button key={s.id} className={`icon-btn admin-sidebar-icon ${s.id === 'fixit' ? 'admin-sidebar-fixit-icon' : ''}`} onClick={() => selectSection(s.id, { open: true })} title={s.id === 'fixit' ? 'Open Fix-It Feed' : s.label} aria-label={s.id === 'fixit' ? `Open Fix-It Feed, ${s.count} active` : s.label}>
            <s.icon size={16} />
            {s.id === 'fixit' && s.count > 0 && <span className="admin-sidebar-count">{s.count > 99 ? '99+' : s.count}</span>}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className={`admin-sidebar admin-sidebar-open ${activeSection === 'fixit' ? 'admin-sidebar-fixit' : ''}`} aria-label="Admin sidebar">
      <div className="card-header justify-between admin-sidebar-header">
        <div className="flex items-center gap-8">
          {activeSection === 'fixit' ? <Wrench size={15} color="var(--brand)" /> : <Shield size={14} color="var(--brand)" />}
          <span className="text-md font-bold">{activeSection === 'fixit' ? 'Fix-It Feed' : 'Admin Panel'}</span>
          {activeSection === 'fixit' && <span className="admin-sidebar-admin-badge">Admin</span>}
        </div>
        <button className="icon-btn" onClick={onToggle} title="Close admin sidebar" aria-label="Close admin sidebar"><X size={16} /></button>
      </div>
      <div className="admin-sidebar-sections">
        {sections.map(s => (
          <button key={s.id} onClick={() => selectSection(s.id)} className="flex items-center gap-4" style={{
            padding: "6px 10px", borderRadius: "6px 6px 0 0", background: activeSection === s.id ? "var(--accent-2)" : "transparent",
            color: activeSection === s.id ? "var(--brand)" : "var(--accent-7)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap"
          }}><s.icon size={12} />{s.label}{s.id === 'fixit' && <span className="admin-section-count">{s.count}</span>}</button>
        ))}
      </div>
      <div className={`admin-sidebar-content ${activeSection === 'fixit' ? 'admin-sidebar-content-fixit' : ''}`}>
        {activeSection === "fixit" && fixItContent}
        {activeSection === "users" && (
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span className="text-sm text-muted">{getProfiles().length} users</span>
              {['executive', 'manager'].includes(currentUser.role) && (
                <button className="btn btn-xs btn-secondary" onClick={() => setShowInvite(v => !v)} title="Add a user with a temporary password"><UserPlus size={12} />Add User</button>
              )}
            </div>
            {showInvite && (
              <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                <div className="text-sm font-semibold" style={{ marginBottom: 8 }}>Add SandPro User</div>
                <div className="flex flex-col gap-8">
                  <input value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
                  <input value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="email@sandpro.com" />
                  <input value={inviteForm.title} onChange={e => setInviteForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" />
                  <select value={inviteForm.department} onChange={e => setInviteForm(f => ({ ...f, department: e.target.value }))}>
                    {getDepartmentOptions(inviteForm.department).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="contributor">Contributor</option>
                    <option value="manager">Manager</option>
                    <option value="executive">Executive</option>
                  </select>
                  <select value={inviteForm.reportsTo} onChange={e => setInviteForm(f => ({ ...f, reportsTo: e.target.value }))}>
                    <option value="">No reporting manager</option>
                    {getProfiles().map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <input type="password" value={inviteForm.tempPassword} onChange={e => setInviteForm(f => ({ ...f, tempPassword: e.target.value }))} placeholder="Temporary password" />
                  <div className="flex gap-8">
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowInvite(false)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={inviteUser}><UserPlus size={12} />Create</button>
                  </div>
                </div>
              </div>
            )}
            {inviteStatus && <div className="text-xs text-muted" style={{ marginBottom: 8 }}>{inviteStatus}</div>}
            {getProfiles().map(u => (
              <div key={u.id} className="flex items-center gap-8" style={{ padding: "8px 6px", borderBottom: "1px solid var(--accent-4)" }}>
                <Avatar user={u} size={26} />
                <div style={{ flex: 1 }}>
                  <div className="text-sm font-medium">{u.name}</div>
                  <div className="text-xs text-muted">{u.title}</div>
                </div>
                <Badge color={u.role === "executive" ? "var(--brand)" : u.role === "manager" ? "var(--info)" : "var(--accent-7)"}>{u.role}</Badge>
              </div>
            ))}
          </div>
        )}
        {activeSection === "departments" && [...new Set([
          ...DEPARTMENTS,
          ...getProfiles().map(user => user.department).filter(Boolean),
          ...objectives.map(objective => objective.department).filter(Boolean),
        ])].map(d => {
          const deptUsers = getProfiles().filter(u => u.department === d);
          const deptObjs = objectives.filter(o => o.department === d);
          return (
            <div key={d} className="card" style={{ marginBottom: 8, padding: "10px 12px" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span className="text-md font-semibold">{d}</span>
                <span className="text-xs text-muted">{deptUsers.length} {deptUsers.length === 1 ? 'person' : 'people'} · {deptObjs.length} obj</span>
              </div>
              <div className="flex">
                {deptUsers.slice(0, 5).map((u, i) => <div key={u.id} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: 5 - i }}><Avatar user={u} size={22} /></div>)}
                {deptUsers.length > 5 && <span className="text-xs text-muted" style={{ marginLeft: 4, alignSelf: "center" }}>+{deptUsers.length - 5}</span>}
              </div>
            </div>
          );
        })}
        {activeSection === "reports" && (
          <div>
            <div className="card" style={{ padding: 14, marginBottom: 12 }}>
              <div className="text-sm font-semibold" style={{ marginBottom: 8 }}>Status Distribution</div>
              {["on_track", "at_risk", "blocked", "not_started", "completed"].map(s => {
                const count = objectives.filter(o => o.status === s).length;
                const pct = Math.round((count / Math.max(1, objectives.length)) * 100);
                return (
                  <div key={s} className="flex items-center gap-8" style={{ marginBottom: 6 }}>
                    <span className="text-xs text-muted" style={{ width: 70 }}>{getStatusLabel(s)}</span>
                    <div style={{ flex: 1 }}><ProgressBar value={pct} color={getStatusColor(s)} height={8} /></div>
                    <span className="text-xs text-secondary" style={{ width: 24, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div className="text-sm font-semibold" style={{ marginBottom: 8 }}>Workload by Person</div>
              {getProfiles().filter(u => objectives.some(o => o.ownerId === u.id)).map(u => {
                const count = objectives.filter(o => o.ownerId === u.id && o.status !== "completed").length;
                return (
                  <div key={u.id} className="flex items-center gap-8" style={{ marginBottom: 4 }}>
                    <Avatar user={u} size={18} />
                    <span className="text-xs text-secondary" style={{ flex: 1 }}>{u.name.split(" ")[0]}</span>
                    <div className="flex gap-4">{Array.from({ length: count }, (_, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: "var(--brand)" }} />)}</div>
                    <span className="text-xs text-muted" style={{ width: 16, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {activeSection === "export" && (
          <div>
            <div className="card" style={{ padding: 12, marginBottom: 10 }}>
              <div className="text-sm font-bold" style={{ marginBottom: 8 }}>Objective Export Filters</div>
              <div className="export-filter-grid">
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Status</div>
                  <select value={exportFilters.status} onChange={event => updateExportFilter("status", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All statuses</option>
                    <option value="not_started">Not Started</option>
                    <option value="on_track">On Track</option>
                    <option value="at_risk">At Risk</option>
                    <option value="blocked">Blocked</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Owner</div>
                  <select value={exportFilters.owner} onChange={event => updateExportFilter("owner", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All owners</option>
                    {exportOwners.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Department</div>
                  <select value={exportFilters.department} onChange={event => updateExportFilter("department", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All departments</option>
                    {exportDepartments.map(department => <option key={department} value={department}>{department}</option>)}
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Priority</div>
                  <select value={exportFilters.priority} onChange={event => updateExportFilter("priority", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All priorities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
              </div>
              <div className="text-xs text-muted">{filteredExportObjectives.length} objective{filteredExportObjectives.length === 1 ? '' : 's'} will be included.</div>
            </div>
            <div className="card ncr-export-card" style={{ padding: 12, marginBottom: 10 }}>
              <div className="flex items-center gap-8" style={{ marginBottom: 8 }}>
                <FileText size={14} color="var(--brand)" />
                <div>
                  <div className="text-sm font-bold">NCR Custom Report</div>
                  <div className="text-xs text-muted">Filtered list for Quality/NCR review.</div>
                </div>
              </div>
              <div className="export-filter-grid">
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Status</div>
                  <select value={ncrExportFilters.status} onChange={event => updateNcrExportFilter("status", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Group</div>
                  <select value={ncrExportFilters.group} onChange={event => updateNcrExportFilter("group", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All groups</option>
                    {ncrGroups.map(group => <option key={group} value={group}>{group}</option>)}
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Type</div>
                  <select value={ncrExportFilters.type} onChange={event => updateNcrExportFilter("type", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All types</option>
                    {ncrTypes.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Criticality</div>
                  <select value={ncrExportFilters.severity} onChange={event => updateNcrExportFilter("severity", event.target.value)} style={{ width: "100%", fontSize: 12 }}>
                    <option value="all">All criticality</option>
                    {ncrSeverities.map(severity => <option key={severity} value={severity}>{severity}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-between gap-8">
                <div className="text-xs text-muted">{filteredExportNcrs.length} NCR report{filteredExportNcrs.length === 1 ? '' : 's'} will be included.</div>
                <button type="button" className="btn btn-primary btn-xs" onClick={exportNcrCsv}>
                  <Download size={12} /> Export NCR CSV
                </button>
              </div>
            </div>
            {[{ label: "Export Objectives (CSV)", icon: FileText, desc: "Filtered objectives with status, owner, dates" },
              { label: "Export Users (CSV)", icon: Users, desc: "Full user directory with roles" },
              { label: "Export Activity Log", icon: Activity, desc: "All status changes and updates" },
              { label: "Power BI Connection", icon: Globe, desc: "Direct database connection string" }
            ].map((item, i) => (
              <div key={i} className="card card-hover cursor-pointer flex items-center gap-10" style={{ padding: 12, marginBottom: 8 }}
                onClick={() => {
                  if (i === 0) {
                    downloadCsv("sandpro_objectives.csv", [
                      ["Title", "Status", "Priority", "Owner", "Progress", "Due Date", "Department", "Next Action"],
                      ...filteredExportObjectives.map(o => [o.title, getStatusLabel(o.status), o.priority, getUser(o.ownerId).name, `${o.progress}%`, o.dueDate ? new Date(o.dueDate).toLocaleDateString() : '', o.department, o.nextAction || ''])
                    ]);
                  } else if (i === 1) {
                    downloadCsv("sandpro_users.csv", [
                      ["Name", "Email", "Title", "Department", "Role", "Reports To", "User ID"],
                      ...getProfiles().map(u => [u.name, u.email, u.title, u.department, u.role, u.reports_to ? getUser(u.reports_to).name : '', u.id])
                    ]);
                  } else if (i === 2) {
	                    downloadCsv("sandpro_activity_log.csv", [
	                      ["Date", "User", "Objective", "Action Type", "Old Value", "New Value", "Note", "Reference ID"],
	                      ...objectives.flatMap(o => (o.updates || []).map((u, index) => [
	                        u.ts ? new Date(u.ts).toLocaleString() : '',
	                        getUser(u.userId || o.ownerId).name,
	                        o.title,
	                        u.actionType || (u.status ? "status/progress_update" : "note"),
	                        u.oldValue || (index > 0 ? `${o.updates[index - 1].status || ''} ${o.updates[index - 1].progress ?? ''}%` : ''),
	                        u.newValue || `${u.status || ''} ${u.progress ?? ''}%`,
	                        u.note || '',
	                        u.referenceId || `${o.id}:${index}`
	                      ]))
	                    ]);
                  } else {
                    downloadCsv("sandpro_powerbi_connection_note.csv", [
                      ["Field", "Value"],
                      ["Status", "Use Supabase project reporting/API credentials from the production dashboard."],
                      ["Note", "Do not expose database service credentials in the client app."]
                    ]);
                  }
                }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--brand-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><item.icon size={16} color="var(--brand)" /></div>
                <div><div className="text-sm font-semibold">{item.label}</div><div className="text-xs text-muted">{item.desc}</div></div>
              </div>
            ))}
          </div>
        )}
        {activeSection === "settings" && <SettingsPanel currentUser={currentUser} objectives={objectives} createNotification={createNotification} onUpdateUser={onUpdateUser} />}
      </div>
    </aside>
  );
};

export default OrgPage;
