// ============================================================================
// MY DAY — Over-The-Top item 6
// ----------------------------------------------------------------------------
// The personal view above all scopes: the five things that need me today, my
// overdue, my waiting-on-others. The company scope answers the manager's
// question; My Day answers the human's. Pure functions here — the view in
// DashboardPage.jsx renders exactly what this module returns, and the unit
// suite locks the ranking so "the five things" never quietly becomes noise.
// ============================================================================
import { isObjectiveAssignedToUser, getObjectiveAssignmentLabel } from './data.js';

export const MY_DAY_CAP = 5;

// Non-executives land on their own day; the executive keeps the company room.
export const defaultScopeForRole = (role) => (role === 'executive' ? 'company' : 'myday');

const DAY_MS = 86400000;
const startOfLocalDay = (value) => {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

export const daysUntilDue = (dueDate, now = new Date()) => {
  if (!dueDate) return null;
  const days = Math.round((startOfLocalDay(dueDate) - startOfLocalDay(now)) / DAY_MS);
  return Number.isNaN(days) ? null : days;
};

const sameLocalDay = (value, now) => (
  Boolean(value) && startOfLocalDay(value).getTime() === startOfLocalDay(now).getTime()
);

const isOpenObjective = (o) => (
  o.status !== 'completed' && o.status !== 'cancelled' && o.okrLevel !== 'company'
);
const isOpenSubtask = (s) => s.status !== 'completed';
const isOpenProject = (p) => p.stage !== 'done';
const isOpenNcr = (r) => !(r.closed || r.status === 'closed' || r.lifecycleStage === 'closed');
// Legacy KPA imports are years old and mostly unclosable — they already live
// behind the dashboard's one-click Legacy view, and they never belong in a
// list called "today".
const isLegacyNcr = (r) => String(r.sourceSystem || '').toUpperCase() === 'KPA';
const ncrDueDate = (r) => (
  r.followUpDueDate || r.actionItems?.find((action) => action.dueDate)?.dueDate || null
);
const ncrTitle = (r) => (
  r.normalizedFailureSummary || r.eventDescription || r.reportNumber || 'NCR report'
);

// Rank inside "needs me today": due today beats blocked beats at-risk beats
// soonest-due. A tie inside a rank sorts by days-to-due, then title, so the
// list is deterministic and never shuffles between renders.
const needsTodayRank = (item) => {
  if (item.days === 0) return 0;
  if (item.status === 'blocked') return 1;
  if (item.status === 'at_risk') return 2;
  if (item.days !== null && item.days <= 7) return 3;
  if (item.days !== null) return 4;
  return 5;
};

const needsTodayReason = (item) => {
  const blockedTail = item.status === 'blocked' ? ' · Blocked' : '';
  if (item.days === 0) return { reason: `Due today${blockedTail}`, tone: 'today' };
  if (item.status === 'blocked') return { reason: 'Blocked', tone: 'past' };
  if (item.status === 'at_risk') return { reason: `At risk${item.days !== null ? ` · due in ${item.days}d` : ''}`, tone: 'today' };
  if (item.days !== null && item.days <= 7) return { reason: `Due in ${item.days}d`, tone: 'soon' };
  if (item.days !== null) return { reason: `Due in ${item.days}d`, tone: 'far' };
  return { reason: 'No due date', tone: 'none' };
};

const byDaysThenTitle = (nullsLast) => (a, b) => {
  if (a.days === null && b.days === null) return a.title.localeCompare(b.title);
  if (a.days === null) return nullsLast ? 1 : -1;
  if (b.days === null) return nullsLast ? -1 : 1;
  return a.days - b.days || a.title.localeCompare(b.title);
};

export const buildMyDay = ({
  objectives = [],
  okrProjects = [],
  ncrReports = [],
  userId,
  now = new Date(),
}) => {
  const mine = [];
  const waitingOnOthers = [];

  for (const o of objectives) {
    if (!isOpenObjective(o)) continue;
    const assignedToMe = isObjectiveAssignedToUser(o, userId);
    if (assignedToMe) {
      mine.push({
        kind: 'task',
        key: `task-${o.id}`,
        title: o.title,
        context: o.department || o.okrGroup || null,
        status: o.status,
        dueDate: o.dueDate || null,
        days: daysUntilDue(o.dueDate, now),
        description: o.description || '',
        objective: o,
      });
    } else if (o.delegatedBy === userId || o.createdBy === userId) {
      waitingOnOthers.push({
        kind: 'task',
        key: `task-${o.id}`,
        title: o.title,
        ownerId: o.ownerId,
        ownerLabel: getObjectiveAssignmentLabel(o),
        status: o.status,
        dueDate: o.dueDate || null,
        days: daysUntilDue(o.dueDate, now),
        description: o.description || '',
        objective: o,
      });
    }
    for (const s of o.subtasks || []) {
      if (!isOpenSubtask(s) || !s.ownerId) continue;
      if (s.ownerId === userId && !assignedToMe) {
        // My subtask on someone else's objective — my work, their card.
        mine.push({
          kind: 'subtask',
          key: `subtask-${s.id}`,
          title: s.title,
          context: o.title,
          status: s.status || 'not_started',
          dueDate: s.dueDate || null,
          days: daysUntilDue(s.dueDate, now),
          description: '',
          objective: o,
        });
      } else if (s.ownerId !== userId && assignedToMe) {
        // Someone else's subtask on MY objective — literally waiting on them.
        waitingOnOthers.push({
          kind: 'subtask',
          key: `subtask-${s.id}`,
          title: s.title,
          context: o.title,
          ownerId: s.ownerId,
          ownerLabel: null,
          status: s.status || 'not_started',
          dueDate: s.dueDate || null,
          days: daysUntilDue(s.dueDate, now),
          description: '',
          objective: o,
        });
      }
    }
  }

  for (const p of okrProjects) {
    if (!isOpenProject(p)) continue;
    if (p.leadId === userId) {
      mine.push({
        kind: 'project',
        key: `project-${p.id}`,
        title: p.name,
        context: 'Project',
        status: p.stage || null,
        dueDate: p.dueDate || null,
        days: daysUntilDue(p.dueDate, now),
        description: '',
        project: p,
      });
    } else if (p.sponsorId === userId) {
      waitingOnOthers.push({
        kind: 'project',
        key: `project-${p.id}`,
        title: p.name,
        ownerId: p.leadId,
        ownerLabel: null,
        status: p.stage || null,
        dueDate: p.dueDate || null,
        days: daysUntilDue(p.dueDate, now),
        description: '',
        project: p,
      });
    }
  }

  for (const r of ncrReports) {
    if (!isOpenNcr(r) || isLegacyNcr(r)) continue;
    if (r.ownerId === userId) {
      mine.push({
        kind: 'ncr',
        key: `ncr-${r.id}`,
        title: ncrTitle(r),
        context: r.reportNumber || 'NCR',
        status: r.status || null,
        dueDate: ncrDueDate(r),
        days: daysUntilDue(ncrDueDate(r), now),
        description: '',
        ncr: r,
      });
    } else if (r.createdBy === userId && r.ownerId) {
      waitingOnOthers.push({
        kind: 'ncr',
        key: `ncr-${r.id}`,
        title: ncrTitle(r),
        ownerId: r.ownerId,
        ownerLabel: null,
        status: r.status || null,
        dueDate: ncrDueDate(r),
        days: daysUntilDue(ncrDueDate(r), now),
        description: '',
        ncr: r,
      });
    }
  }

  // Overdue is its own section — the five never bury a slipped item, and a
  // slipped item never eats one of the five slots.
  const overdue = mine
    .filter((item) => item.days !== null && item.days < 0)
    // Closest to today first: the most recoverable slip leads.
    .sort((a, b) => b.days - a.days || a.title.localeCompare(b.title));

  const candidates = mine
    .filter((item) => item.days === null || item.days >= 0)
    .map((item) => ({ ...item, ...needsTodayReason(item) }))
    .sort((a, b) => needsTodayRank(a) - needsTodayRank(b) || byDaysThenTitle(true)(a, b));

  // Most overdue first — the longest-waiting handoff is the one to chase.
  waitingOnOthers.sort(byDaysThenTitle(true));

  const clearedToday = objectives.filter((o) => (
    o.okrLevel !== 'company'
    && o.status === 'completed'
    && isObjectiveAssignedToUser(o, userId)
    && (o.updates || []).some((u) => u.status === 'completed' && sameLocalDay(u.ts, now))
  )).length;

  return {
    needsToday: candidates.slice(0, MY_DAY_CAP),
    needsTodayTotal: candidates.length,
    overdue,
    waitingOnOthers,
    clearedToday,
  };
};
