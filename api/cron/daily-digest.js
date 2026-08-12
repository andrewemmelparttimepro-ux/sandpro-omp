import { isPilotEmailRecipient, notificationAllowsEmail, objectiveUrl, sendLoggedEmail } from '../_shared/email.js';
import { sendPushNotifications } from '../_shared/push.js';
import { getRequiredEnv, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

const CHICAGO_TIME_ZONE = 'America/Chicago';
const MAX_BUCKET_ROWS = 12;
const ACTIVE_STATUSES = new Set(['completed', 'cancelled']);

const assertCron = (req) => {
  const expected = getRequiredEnv('CRON_SECRET');
  const actual = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return actual && actual === expected;
};

const htmlEscape = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const appUrl = (req, params = {}) => {
  const host = process.env.APP_BASE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
  const url = new URL(host);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return url.toString();
};

export const chicagoDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
};

// Due dates originate in a date picker, then Postgres stores them as midnight
// timestamps. Their YYYY-MM-DD portion is the user's chosen day; converting
// that midnight to Chicago time would silently move the work back one day.
export const objectiveDateKey = (value) => {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || chicagoDateKey(value);
};

const dayOrdinal = (key) => {
  const [year, month, day] = String(key || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day) / 86400000;
};

export const daysFromBriefDate = (dueDate, todayKey) => {
  if (!dueDate) return null;
  const dueOrdinal = dayOrdinal(objectiveDateKey(dueDate));
  const todayOrdinal = dayOrdinal(todayKey);
  if (dueOrdinal === null || todayOrdinal === null) return null;
  return dueOrdinal - todayOrdinal;
};

const isActiveObjective = (objective) => !ACTIVE_STATUSES.has(objective.status);
const isPastDue = (objective, todayKey) => {
  const offset = daysFromBriefDate(objective.due_date, todayKey);
  return offset !== null && offset < 0;
};
const priorityRank = (priority = '') => ({ critical: 0, high: 1, medium: 2, low: 3 }[priority] ?? 4);

const mapSet = (rows, keyField, valueField, include = () => true) => {
  const map = new Map();
  rows.filter(include).forEach(row => {
    map.set(row[keyField], new Set([...(map.get(row[keyField]) || []), row[valueField]]));
  });
  return map;
};

const managerIdsForProfile = (profile, managersByEmployee) => new Set([
  profile.reports_to,
  ...(managersByEmployee.get(profile.id) || []),
].filter(Boolean));

const assignedToUser = ({ objective, userId, groupMembersByGroup, assigneesByObjective }) => (
  Boolean(userId) && (
    objective.owner_id === userId
    || (objective.assignment_group_id && groupMembersByGroup.get(objective.assignment_group_id)?.has(userId))
    || assigneesByObjective.get(objective.id)?.has(userId)
  )
);

// This mirrors the app's Company / My Team / Individual lenses. It includes
// both primary and secondary managers, rotating assignment groups, and explicit
// assignee/manager objective members; watchers do not become personal work.
export const getScopedObjectives = ({
  scope,
  profile,
  profiles,
  objectives,
  profileManagers = [],
  assignmentGroupMembers = [],
  objectiveMembers = [],
}) => {
  if (scope === 'company') return objectives;
  const managersByEmployee = mapSet(profileManagers, 'employee_id', 'manager_id');
  const directReportIds = new Set(profiles
    .filter(candidate => managerIdsForProfile(candidate, managersByEmployee).has(profile.id))
    .map(candidate => candidate.id));
  const groupMembersByGroup = mapSet(assignmentGroupMembers, 'group_id', 'user_id');
  const assigneesByObjective = mapSet(
    objectiveMembers,
    'objective_id',
    'user_id',
    member => ['assignee', 'manager'].includes(String(member.role || '').toLowerCase()),
  );
  const isAssigned = (objective, userId) => assignedToUser({
    objective,
    userId,
    groupMembersByGroup,
    assigneesByObjective,
  });

  if (scope === 'individual') return objectives.filter(objective => isAssigned(objective, profile.id));
  return objectives.filter(objective => (
    isAssigned(objective, profile.id)
    || [...directReportIds].some(reportId => isAssigned(objective, reportId))
    || objective.delegated_by === profile.id
  ));
};

const ownerNameFor = (objective, profilesById, assignmentGroupsById) => (
  profilesById.get(objective.owner_id)?.name
  || assignmentGroupsById.get(objective.assignment_group_id)?.name
  || 'Unassigned'
);

export const getDueBuckets = (objectives, todayKey) => {
  const sortRows = (rows) => [...rows].sort((a, b) => {
    const due = daysFromBriefDate(a.due_date, todayKey) - daysFromBriefDate(b.due_date, todayKey);
    if (due !== 0) return due;
    const priority = priorityRank(a.priority) - priorityRank(b.priority);
    if (priority !== 0) return priority;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
  return {
    today: sortRows(objectives.filter(objective => daysFromBriefDate(objective.due_date, todayKey) === 0)),
    nextSeven: sortRows(objectives.filter(objective => {
      const offset = daysFromBriefDate(objective.due_date, todayKey);
      return offset !== null && offset >= 1 && offset <= 7;
    })),
  };
};

const statsFor = (objectives, todayKey) => ({
  active: objectives.length,
  onTrack: objectives.filter(objective => objective.status === 'on_track').length,
  pastDue: objectives.filter(objective => isPastDue(objective, todayKey)).length,
  blockedAtRisk: objectives.filter(objective => (
    objective.blocker_flag || objective.status === 'blocked' || objective.status === 'at_risk'
  )).length,
});

const getActionItems = (objectives, todayKey) => [...objectives]
  .sort((a, b) => {
    const score = (objective) => {
      let value = priorityRank(objective.priority) * 10;
      if (objective.blocker_flag || objective.status === 'blocked') value -= 100;
      if (objective.status === 'at_risk') value -= 80;
      if (isPastDue(objective, todayKey)) value -= 70;
      if (['critical', 'high'].includes(objective.priority)) value -= 30;
      return value;
    };
    const scored = score(a) - score(b);
    if (scored !== 0) return scored;
    return (dayOrdinal(objectiveDateKey(a.due_date)) ?? Number.MAX_SAFE_INTEGER)
      - (dayOrdinal(objectiveDateKey(b.due_date)) ?? Number.MAX_SAFE_INTEGER);
  })
  .slice(0, 3);

export const buildRecipientViews = ({
  profile,
  profiles,
  objectives,
  profileManagers = [],
  assignmentGroupMembers = [],
  assignmentGroups = [],
  objectiveMembers = [],
  todayKey = chicagoDateKey(),
}) => {
  const activeWork = objectives.filter(objective => (
    isActiveObjective(objective) && objective.okr_level !== 'company'
  ));
  const profilesById = new Map(profiles.map(candidate => [candidate.id, candidate]));
  const assignmentGroupsById = new Map(assignmentGroups.map(group => [group.id, group]));
  const decorate = rows => rows.map(objective => ({
    ...objective,
    owner_name: ownerNameFor(objective, profilesById, assignmentGroupsById),
  }));
  const makeView = (scope) => {
    const rows = decorate(getScopedObjectives({
      scope,
      profile,
      profiles,
      objectives: activeWork,
      profileManagers,
      assignmentGroupMembers,
      objectiveMembers,
    }));
    return {
      items: rows,
      stats: statsFor(rows, todayKey),
      due: getDueBuckets(rows, todayKey),
      actionItems: getActionItems(rows, todayKey),
    };
  };
  return {
    todayKey,
    company: makeView('company'),
    team: makeView('team'),
    individual: makeView('individual'),
  };
};

const ensureDailyDigestNotification = async ({ supabase, profile, objective, message, today }) => {
  const startOfUtcDay = `${today}T00:00:00.000Z`;
  const { data: existing, error: selectError } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', profile.id)
    .eq('type', 'daily_digest')
    .gte('created_at', startOfUtcDay)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing?.id) return { id: existing.id, deduped: true };

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: profile.id,
      sender_id: null,
      type: 'daily_digest',
      objective_id: objective?.id || null,
      message,
      priority: 'normal',
      detail_label: 'Daily brief',
      detail_text: 'The SandPro Times is ready.',
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, created: true };
};

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = 'Arial,Helvetica,sans-serif';

// QA / automation accounts that must never receive the Times.
const isRoboAccount = (email = '') => /release-smoke|qa-agent|agent\.fixit/i.test(email);

const editionDateLine = (todayKey = chicagoDateKey()) => {
  const [year, month, day] = todayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
};

const formatDueDate = (value) => {
  const key = objectiveDateKey(value);
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return 'No due date';
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
};

const statCell = (label, value, color) => `
  <td width="25%" align="center" style="border:1px solid #e5e7eb;background:#f9fafb;padding:12px 6px">
    <div style="font-family:${SERIF};font-size:26px;font-weight:700;color:${color};line-height:1.1">${value}</div>
    <div style="font-family:${SANS};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;padding-top:4px">${label}</div>
  </td>`;

const scopeCell = (label, view, tone) => `
  <td width="33.33%" style="border:1px solid #e5e7eb;border-top:3px solid ${tone};padding:12px 10px;vertical-align:top">
    <div style="font-family:${SANS};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6b7280">${label}</div>
    <div style="font-family:${SERIF};font-size:16px;font-weight:700;color:#111827;padding-top:5px">${view.due.today.length} today</div>
    <div style="font-family:${SANS};font-size:12px;color:#6b7280;padding-top:2px">${view.due.nextSeven.length} in the next 7 days</div>
  </td>`;

const workRow = (req, objective, todayKey) => {
  const offset = daysFromBriefDate(objective.due_date, todayKey);
  const status = String(objective.status || 'active').replaceAll('_', ' ');
  const dueTone = offset === 0 ? '#b45309' : '#4b5563';
  return `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #eeeeee">
        <a href="${htmlEscape(objectiveUrl(req, objective.id, 'details'))}" style="font-family:${SANS};font-size:14px;font-weight:700;color:#111827;text-decoration:none">${htmlEscape(objective.title)}</a>
        <div style="font-family:${SANS};font-size:12px;color:#6b7280;padding-top:3px">
          ${htmlEscape(objective.owner_name)} · ${htmlEscape(objective.department || 'Company')} · ${htmlEscape(status)} · <span style="color:${dueTone};font-weight:700">Due ${htmlEscape(formatDueDate(objective.due_date))}</span>
        </div>
      </td>
    </tr>`;
};

const dueBucket = ({ req, title, rows, todayKey, emptyLine }) => {
  const shown = rows.slice(0, MAX_BUCKET_ROWS);
  const remaining = rows.length - shown.length;
  return `
    <div style="font-family:${SANS};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin:15px 0 3px">${title} (${rows.length})</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${shown.length ? shown.map(objective => workRow(req, objective, todayKey)).join('') : `<tr><td style="font-family:${SANS};font-size:13px;color:#9ca3af;padding:9px 0;border-bottom:1px solid #eeeeee">${emptyLine}</td></tr>`}
    </table>
    ${remaining > 0 ? `<div style="font-family:${SANS};font-size:12px;color:#6b7280;padding-top:7px">+ ${remaining} more in OMP</div>` : ''}`;
};

const dueScopeSection = ({ req, title, subtitle, view, todayKey }) => `
  <div style="margin-top:24px;border-top:3px solid #111827;padding-top:10px">
    <div style="font-family:${SERIF};font-size:22px;font-weight:700;color:#111827">${title}</div>
    <div style="font-family:${SANS};font-size:12px;color:#6b7280;padding-top:3px">${subtitle} · ${view.stats.active} active · ${view.stats.pastDue} past due</div>
  </div>
  ${dueBucket({ req, title: 'Due today', rows: view.due.today, todayKey, emptyLine: 'Nothing due today.' })}
  ${dueBucket({ req, title: 'Next 7 days', rows: view.due.nextSeven, todayKey, emptyLine: 'Nothing due in the next 7 days.' })}`;

// Newspaper-style daily brief. Table-based layout on purpose — most of SandPro
// reads this in Outlook, which does not support display:grid/flex.
export const buildTimesEmail = ({ req, profile, views, completedYesterday = 0 }) => {
  const dashboardUrl = appUrl(req, { page: 'dashboard', daily: '1' });
  const showTeam = ['executive', 'manager'].includes(profile.role);
  const primaryView = showTeam ? views.team : views.individual;
  const stories = primaryView.actionItems.length
    ? primaryView.actionItems.map((objective, index) => `
      <tr>
        <td style="padding:0 0 14px">
          <div style="font-family:${SERIF};font-size:12px;color:#9ca3af">No. ${index + 1}</div>
          <a href="${htmlEscape(objectiveUrl(req, objective.id, 'details'))}" style="font-family:${SERIF};font-size:17px;font-weight:700;color:#111827;text-decoration:none">${htmlEscape(objective.title)}</a>
          <div style="font-family:${SANS};font-size:12px;color:#6b7280;padding-top:2px">
            ${htmlEscape(objective.owner_name)} · ${htmlEscape(objective.department || 'Company')} · ${htmlEscape(objective.status?.replaceAll('_', ' ') || 'active')}${objective.due_date ? ` · Due ${htmlEscape(formatDueDate(objective.due_date))}` : ''}
          </div>
        </td>
      </tr>`).join('')
    : `<tr><td style="font-family:${SANS};font-size:13px;color:#6b7280;padding:0 0 14px">A quiet edition — nothing on your desk needs urgent attention today.</td></tr>`;

  return `
    <div style="max-width:680px;margin:0 auto;padding:24px;background:#ffffff;color:#111827">
      <div style="display:none;max-height:0;overflow:hidden">The SandPro Times: ${views.individual.due.today.length} due for you today, ${views.team.due.today.length} due for your team, ${views.company.due.today.length} due company-wide.</div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="border-top:3px double #111827;border-bottom:1px solid #111827;padding:16px 0 12px">
          <div style="font-family:${SERIF};font-size:34px;font-weight:700;letter-spacing:.01em;color:#111827">The SandPro Times</div>
          <div style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#6b7280;padding-top:6px">${editionDateLine(views.todayKey)} &nbsp;·&nbsp; SandPro OMP Daily Brief</div>
        </td></tr>
        <tr><td style="border-bottom:3px double #111827;height:3px;font-size:0;line-height:0">&nbsp;</td></tr>
      </table>

      <p style="font-family:${SANS};font-size:13px;color:#6b7280;margin:16px 0 18px">Prepared for <strong style="color:#111827">${htmlEscape(profile.name || 'SandPro team member')}</strong> — company context first, then the specific work due for your team and for you.</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr>
        ${scopeCell('Company', views.company, '#ff7f02')}
        ${scopeCell('My team', views.team, '#2563eb')}
        ${scopeCell('Individual', views.individual, '#059669')}
      </tr></table>

      <div style="font-family:${SERIF};font-size:22px;font-weight:700;color:#111827;border-top:3px solid #111827;padding-top:10px">Company</div>
      <div style="font-family:${SANS};font-size:12px;color:#6b7280;padding:3px 0 12px">The company roll-up already familiar from OMP.</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px"><tr>
        ${statCell('Active', views.company.stats.active, '#2563eb')}
        ${statCell('On Track', views.company.stats.onTrack, '#059669')}
        ${statCell('Past Due', views.company.stats.pastDue, '#dc2626')}
        ${statCell('Blocked / At Risk', views.company.stats.blockedAtRisk, '#d97706')}
      </tr></table>
      <div style="font-family:${SANS};font-size:13px;color:#374151;line-height:1.7;margin-bottom:8px">
        ${views.company.due.today.length} item${views.company.due.today.length === 1 ? '' : 's'} due across SandPro today · ${views.company.due.nextSeven.length} due in the next 7 days · ${completedYesterday} completed in the last day
      </div>

      ${showTeam ? dueScopeSection({
        req,
        title: 'My team',
        subtitle: 'Your work, your direct reports, and work you delegated',
        view: views.team,
        todayKey: views.todayKey,
      }) : ''}
      ${dueScopeSection({
        req,
        title: 'Individual',
        subtitle: 'Work assigned directly to you',
        view: views.individual,
        todayKey: views.todayKey,
      })}

      <div style="font-family:${SANS};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#c75400;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin:26px 0 12px">Top stories on your desk</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stories}</table>

      <div style="font-family:${SANS};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#c75400;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin:10px 0 12px">Around the company</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr>
        <td style="font-family:${SANS};font-size:13px;color:#374151;line-height:1.7">
          ${views.company.stats.pastDue} past due company-wide · ${views.company.stats.blockedAtRisk} blocked or at risk · ${completedYesterday} completed in the last day
        </td>
      </tr></table>

      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background:#ff7f02;border-radius:8px">
          <a href="${htmlEscape(dashboardUrl)}" style="display:inline-block;font-family:${SANS};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;padding:12px 18px">Open SandPro OMP</a>
        </td>
      </tr></table>

      <p style="font-family:${SANS};font-size:11px;color:#9ca3af;margin-top:26px;border-top:1px solid #e5e7eb;padding-top:12px">
        The SandPro Times goes to every active SandPro OMP user each weekday morning. To opt out, open SandPro OMP → Settings → turn the daily brief off.
      </p>
    </div>
  `;
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    if (!assertCron(req)) return json(res, 401, { error: 'Unauthorized cron request.' });
    const supabase = getSupabaseAdmin();
    const queryResults = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('profile_managers').select('employee_id,manager_id'),
      supabase.from('notification_preferences').select('*'),
      supabase.from('objectives').select('*').not('status', 'eq', 'cancelled'),
      supabase.from('objective_members').select('objective_id,user_id,role'),
      supabase.from('assignment_group_members').select('group_id,user_id'),
      supabase.from('assignment_groups').select('id,name'),
    ]);
    const queryError = queryResults.find(result => result.error)?.error;
    if (queryError) throw queryError;
    const [
      { data: profiles = [] },
      { data: profileManagers = [] },
      { data: prefs = [] },
      { data: allObjectives = [] },
      { data: objectiveMembers = [] },
      { data: assignmentGroupMembers = [] },
      { data: assignmentGroups = [] },
    ] = queryResults;
    const prefByUser = new Map(prefs.map(pref => [pref.user_id, pref]));
    const today = chicagoDateKey();
    const chicagoNow = new Date(new Date().toLocaleString('en-US', { timeZone: CHICAGO_TIME_ZONE }));
    const isMonday = chicagoNow.getDay() === 1;
    const dayAgo = new Date(Date.now() - 86400000);
    const completedYesterday = allObjectives.filter(objective => (
      objective.status === 'completed'
      && objective.updated_at
      && new Date(objective.updated_at) >= dayAgo
    )).length;
    const previewAs = String(req.query?.preview_as || '').trim().toLowerCase();
    const results = [];
    let previewMatched = false;

    for (const profile of profiles) {
      const profileEmail = String(profile.email || '').trim().toLowerCase();
      if (previewAs && profileEmail !== previewAs) continue;
      if (!previewAs && (!profile.email || isRoboAccount(profile.email) || !isPilotEmailRecipient(profile.email))) continue;
      if (previewAs) previewMatched = true;
      const pref = prefByUser.get(profile.id);
      const emailAllowed = notificationAllowsEmail(pref, 'daily_digest', profile.email);
      const frequency = pref?.digest_frequency || 'daily';
      if (!previewAs && frequency === 'off') continue;
      if (!previewAs && frequency === 'weekly' && !isMonday) continue;

      const views = buildRecipientViews({
        profile,
        profiles,
        objectives: allObjectives,
        profileManagers,
        assignmentGroupMembers,
        assignmentGroups,
        objectiveMembers,
        todayKey: today,
      });
      const primaryView = ['executive', 'manager'].includes(profile.role) ? views.team : views.individual;
      const firstObjective = primaryView.due.today[0]
        || primaryView.due.nextSeven[0]
        || primaryView.actionItems[0]
        || primaryView.items[0]
        || null;
      const digestMessage = `Today's edition is out - ${primaryView.due.today.length} due today, ${primaryView.due.nextSeven.length} due in the next 7 days, ${primaryView.stats.pastDue} past due on your desk.`;
      const subject = `The SandPro Times — ${editionDateLine(today)}`;
      const html = buildTimesEmail({ req, profile, views, completedYesterday });

      // Authenticated dry preview: render a real person's brief without making
      // a notification, push, email log, or external send.
      if (previewAs) {
        results.push({
          preview: true,
          profile: { id: profile.id, name: profile.name, email: profile.email },
          subject,
          counts: {
            company: { today: views.company.due.today.length, nextSeven: views.company.due.nextSeven.length },
            team: { today: views.team.due.today.length, nextSeven: views.team.due.nextSeven.length },
            individual: { today: views.individual.due.today.length, nextSeven: views.individual.due.nextSeven.length },
          },
          html,
        });
        continue;
      }

      const inAppResult = pref?.in_app_enabled === false
        ? null
        : await ensureDailyDigestNotification({
          supabase,
          profile,
          objective: firstObjective,
          message: digestMessage,
          today,
        });
      if (inAppResult) results.push({ channel: 'in_app', userId: profile.id, ...inAppResult });
      let emailResult = null;
      if (emailAllowed) {
        emailResult = await sendLoggedEmail({
          userId: profile.id,
          objectiveId: firstObjective?.id || null,
          type: 'daily_digest',
          dedupeKey: `daily_digest:${profile.id}:${today}:${frequency}`,
          to: profile.email,
          subject: `The SandPro Times — ${editionDateLine(today)}`,
          html,
        });
        results.push(emailResult);
      }
      // The daily brief is the one email. Push is only its fallback; operational
      // assignment, mention, reminder, and risk alerts remain push-first.
      const emailHandled = emailResult?.sent || emailResult?.deduped;
      if (!emailHandled && !inAppResult?.deduped) {
        results.push(await sendPushNotifications({
          targetUserId: profile.id,
          notificationId: inAppResult?.id || null,
          type: 'daily_digest',
          objective: firstObjective || {},
          prefs: pref,
          message: digestMessage,
          url: appUrl(req, { page: 'dashboard' }),
        }).catch(error => ({ channel: 'push', error: error.message })));
      }
    }

    if (previewAs && !previewMatched) return json(res, 404, { error: 'Preview profile not found.' });
    return json(res, 200, { processed: results.length, preview: Boolean(previewAs), results });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Daily digest failed.' });
  }
}
