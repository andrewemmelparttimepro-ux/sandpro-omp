import { objectiveUrl, sendLoggedEmail } from '../_shared/email.js';
import { sendPushNotifications } from '../_shared/push.js';
import { getRequiredEnv, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

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

const isActiveObjective = (objective) => !['completed', 'cancelled'].includes(objective.status);
const isPastDue = (objective, startOfToday) => objective.due_date && new Date(objective.due_date) < startOfToday;
const priorityRank = (priority = '') => ({ critical: 0, high: 1, medium: 2, low: 3 }[priority] ?? 4);

const getScopedObjectives = ({ profile, profiles, objectives, memberObjectiveIds }) => {
  if (profile.role === 'executive') return objectives;
  const directReportIds = new Set(profiles.filter(p => p.reports_to === profile.id).map(p => p.id));
  return objectives.filter(objective => (
    objective.owner_id === profile.id
    || objective.delegated_by === profile.id
    || memberObjectiveIds.has(objective.id)
    || directReportIds.has(objective.owner_id)
  ));
};

const getActionItems = (objectives, startOfToday) => [...objectives]
  .sort((a, b) => {
    const score = (objective) => {
      let value = priorityRank(objective.priority) * 10;
      if (objective.blocker_flag || objective.status === 'blocked') value -= 100;
      if (objective.status === 'at_risk') value -= 80;
      if (isPastDue(objective, startOfToday)) value -= 70;
      if (['critical', 'high'].includes(objective.priority)) value -= 30;
      return value;
    };
    const scored = score(a) - score(b);
    if (scored !== 0) return scored;
    return new Date(a.due_date || '2999-12-31') - new Date(b.due_date || '2999-12-31');
  })
  .slice(0, 3);

const buildDailyEmail = ({ req, profile, stats, actionItems }) => {
  const dashboardUrl = appUrl(req, { page: 'dashboard', daily: '1' });
  const objectiveRows = actionItems.length
    ? actionItems.map(objective => `
      <li style="margin:0 0 10px">
        <a href="${htmlEscape(objectiveUrl(req, objective.id, 'details'))}" style="color:#c75400;font-weight:700;text-decoration:none">${htmlEscape(objective.title)}</a>
        <div style="color:#6b7280;font-size:13px">
          ${htmlEscape(objective.department || 'Company')} · ${htmlEscape(objective.status?.replaceAll('_', ' ') || 'active')}${objective.due_date ? ` · Due ${htmlEscape(new Date(objective.due_date).toLocaleDateString('en-US'))}` : ''}
        </div>
      </li>
    `).join('')
    : '<li style="margin:0 0 10px;color:#6b7280">No urgent objectives are currently assigned or visible to you.</li>';

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:680px;margin:0 auto;padding:24px;background:#ffffff">
      <div style="font-weight:800;color:#ff7f02;font-size:18px;margin-bottom:6px">SandPro OMP</div>
      <div style="display:none;max-height:0;overflow:hidden">Your SandPro Daily is ready: ${stats.active} active, ${stats.pastDue} past due, ${stats.blockedAtRisk} blocked or at risk.</div>
      <h1 style="font-size:24px;margin:0 0 4px">The SandPro Daily</h1>
      <p style="font-size:14px;color:#6b7280;margin:0 0 20px">Prepared for ${htmlEscape(profile.name || 'SandPro team member')}</p>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 22px">
        ${[
          ['Active', stats.active, '#2563eb'],
          ['On Track', stats.onTrack, '#059669'],
          ['Past Due', stats.pastDue, '#dc2626'],
          ['Blocked / At Risk', stats.blockedAtRisk, '#d97706'],
        ].map(([label, value, color]) => `
          <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#f9fafb">
            <div style="font-size:22px;font-weight:800;color:${color}">${value}</div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280">${label}</div>
          </div>
        `).join('')}
      </div>

      <h2 style="font-size:17px;margin:0 0 10px">Top action items</h2>
      <ol style="padding-left:20px;margin:0 0 22px">${objectiveRows}</ol>

      <a href="${htmlEscape(dashboardUrl)}" style="display:inline-block;background:#ff7f02;color:white;text-decoration:none;border-radius:8px;padding:12px 16px;font-weight:800">Open SandPro Daily</a>
      <p style="font-size:12px;color:#6B7280;margin-top:24px">This weekday brief follows your SandPro OMP email and digest preferences. Manage notification settings in the app.</p>
    </div>
  `;
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    if (!assertCron(req)) return json(res, 401, { error: 'Unauthorized cron request.' });
    const supabase = getSupabaseAdmin();
    const [{ data: profiles = [] }, { data: prefs = [] }, { data: objectives = [] }, { data: objectiveMembers = [] }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('notification_preferences').select('*'),
      supabase.from('objectives').select('*').not('status', 'eq', 'completed').not('status', 'eq', 'cancelled'),
      supabase.from('objective_members').select('objective_id,user_id'),
    ]);
    const prefByUser = new Map(prefs.map(p => [p.user_id, p]));
    const today = new Date().toISOString().slice(0, 10);
    const isMonday = new Date().getDay() === 1;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const results = [];

    for (const profile of profiles) {
      if (!profile.email) continue;
      const pref = prefByUser.get(profile.id);
      const emailAllowed = pref?.email_enabled !== false;
      const frequency = pref?.digest_frequency || 'daily';
      if (frequency === 'off') continue;
      if (frequency === 'weekly' && !isMonday) continue;

      const memberObjectiveIds = new Set(objectiveMembers
        .filter(member => member.user_id === profile.id)
        .map(member => member.objective_id));
      const scoped = getScopedObjectives({ profile, profiles, objectives, memberObjectiveIds }).filter(isActiveObjective);
      const stats = {
        active: scoped.length,
        onTrack: scoped.filter(o => o.status === 'on_track').length,
        pastDue: scoped.filter(o => isPastDue(o, startOfToday)).length,
        blockedAtRisk: scoped.filter(o => o.blocker_flag || o.status === 'blocked' || o.status === 'at_risk').length,
      };
      const actionItems = getActionItems(scoped, startOfToday);
      const firstObjective = actionItems[0] || scoped[0] || null;
      const html = buildDailyEmail({ req, profile, stats, actionItems });
      let emailResult = null;
      if (emailAllowed) {
        emailResult = await sendLoggedEmail({
          userId: profile.id,
          objectiveId: firstObjective?.id || null,
          type: 'daily_digest',
          dedupeKey: `daily_digest:${profile.id}:${today}:${frequency}`,
          to: profile.email,
          subject: 'The SandPro Daily',
          html,
        });
        results.push(emailResult);
      }
      // Skip the push when the email deduped — the cron already ran today.
      if (!emailResult?.deduped) {
        results.push(await sendPushNotifications({
          targetUserId: profile.id,
          type: 'daily_digest',
          objective: firstObjective || {},
          prefs: pref,
          message: `Your daily brief is ready — ${stats.active} active, ${stats.pastDue} past due, ${stats.blockedAtRisk} blocked or at risk.`,
          url: appUrl(req, { page: 'dashboard' }),
        }).catch((error) => ({ channel: 'push', error: error.message })));
      }
    }

    return json(res, 200, { processed: results.length, results });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Daily digest failed.' });
  }
}
