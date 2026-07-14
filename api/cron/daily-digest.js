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
const SANS = "Arial,Helvetica,sans-serif";

// QA / automation accounts that must never receive the Times.
const isRoboAccount = (email = '') => /release-smoke|qa-agent|agent\.fixit/i.test(email);

const editionDateLine = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago',
});

const statCell = (label, value, color) => `
  <td width="25%" align="center" style="border:1px solid #e5e7eb;background:#f9fafb;padding:12px 6px">
    <div style="font-family:${SERIF};font-size:26px;font-weight:700;color:${color};line-height:1.1">${value}</div>
    <div style="font-family:${SANS};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;padding-top:4px">${label}</div>
  </td>`;

// Newspaper-style daily brief. Table-based layout on purpose — most of SandPro
// reads this in Outlook, which does not support display:grid/flex.
export const buildTimesEmail = ({ req, profile, stats, companyStats, actionItems }) => {
  const dashboardUrl = appUrl(req, { page: 'dashboard', daily: '1' });
  const stories = actionItems.length
    ? actionItems.map((objective, index) => `
      <tr>
        <td style="padding:0 0 14px">
          <div style="font-family:${SERIF};font-size:12px;color:#9ca3af">No. ${index + 1}</div>
          <a href="${htmlEscape(objectiveUrl(req, objective.id, 'details'))}" style="font-family:${SERIF};font-size:17px;font-weight:700;color:#111827;text-decoration:none">${htmlEscape(objective.title)}</a>
          <div style="font-family:${SANS};font-size:12px;color:#6b7280;padding-top:2px">
            ${htmlEscape(objective.department || 'Company')} · ${htmlEscape(objective.status?.replaceAll('_', ' ') || 'active')}${objective.due_date ? ` · Due ${htmlEscape(new Date(objective.due_date).toLocaleDateString('en-US', { timeZone: 'UTC' }))}` : ''}
          </div>
        </td>
      </tr>`).join('')
    : `<tr><td style="font-family:${SANS};font-size:13px;color:#6b7280;padding:0 0 14px">A quiet edition — nothing on your desk needs urgent attention today.</td></tr>`;

  return `
    <div style="max-width:680px;margin:0 auto;padding:24px;background:#ffffff;color:#111827">
      <div style="display:none;max-height:0;overflow:hidden">The SandPro Times: ${stats.active} active, ${stats.pastDue} past due, ${stats.blockedAtRisk} blocked or at risk on your desk.</div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="border-top:3px double #111827;border-bottom:1px solid #111827;padding:16px 0 12px">
          <div style="font-family:${SERIF};font-size:34px;font-weight:700;letter-spacing:.01em;color:#111827">The SandPro Times</div>
          <div style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#6b7280;padding-top:6px">${editionDateLine()} &nbsp;·&nbsp; SandPro OMP Daily Brief</div>
        </td></tr>
        <tr><td style="border-bottom:3px double #111827;height:3px;font-size:0;line-height:0">&nbsp;</td></tr>
      </table>

      <p style="font-family:${SANS};font-size:13px;color:#6b7280;margin:16px 0 18px">Prepared for <strong style="color:#111827">${htmlEscape(profile.name || 'SandPro team member')}</strong> — here is what is on your desk this morning.</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr>
        ${statCell('Active', stats.active, '#2563eb')}
        ${statCell('On Track', stats.onTrack, '#059669')}
        ${statCell('Past Due', stats.pastDue, '#dc2626')}
        ${statCell('Blocked / At Risk', stats.blockedAtRisk, '#d97706')}
      </tr></table>

      <div style="font-family:${SANS};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#c75400;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:12px">Top stories on your desk</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stories}</table>

      <div style="font-family:${SANS};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#c75400;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin:10px 0 12px">Around the company</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr>
        <td style="font-family:${SANS};font-size:13px;color:#374151;line-height:1.7">
          ${companyStats.dueToday} item${companyStats.dueToday === 1 ? '' : 's'} due across SandPro today · ${companyStats.pastDue} past due company-wide · ${companyStats.blockedAtRisk} blocked or at risk · ${companyStats.completedYesterday} completed in the last day
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
    const [{ data: profiles = [] }, { data: prefs = [] }, { data: allObjectives = [] }, { data: objectiveMembers = [] }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('notification_preferences').select('*'),
      supabase.from('objectives').select('*').not('status', 'eq', 'cancelled'),
      supabase.from('objective_members').select('objective_id,user_id'),
    ]);
    const objectives = allObjectives.filter(o => o.status !== 'completed');
    const prefByUser = new Map(prefs.map(p => [p.user_id, p]));
    const today = new Date().toISOString().slice(0, 10);
    const isMonday = new Date().getDay() === 1;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + 86400000);
    const dayAgo = new Date(Date.now() - 86400000);
    const companyStats = {
      dueToday: objectives.filter(o => o.due_date && new Date(o.due_date) >= startOfToday && new Date(o.due_date) < endOfToday).length,
      pastDue: objectives.filter(o => isPastDue(o, startOfToday)).length,
      blockedAtRisk: objectives.filter(o => o.blocker_flag || o.status === 'blocked' || o.status === 'at_risk').length,
      completedYesterday: allObjectives.filter(o => o.status === 'completed' && o.updated_at && new Date(o.updated_at) >= dayAgo).length,
    };
    const results = [];

    for (const profile of profiles) {
      if (!profile.email || isRoboAccount(profile.email)) continue;
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
      const digestMessage = `Today's edition is out - ${stats.active} active, ${stats.pastDue} past due, ${stats.blockedAtRisk} blocked or at risk on your desk.`;
      const html = buildTimesEmail({ req, profile, stats, companyStats, actionItems });
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
          subject: `The SandPro Times — ${editionDateLine()}`,
          html,
        });
        results.push(emailResult);
      }
      // Either durable channel proves the cron already ran today.
      if (!emailResult?.deduped && !inAppResult?.deduped) {
        results.push(await sendPushNotifications({
          targetUserId: profile.id,
          notificationId: inAppResult?.id || null,
          type: 'daily_digest',
          objective: firstObjective || {},
          prefs: pref,
          message: digestMessage,
          url: appUrl(req, { page: 'dashboard' }),
        }).catch((error) => ({ channel: 'push', error: error.message })));
      }
    }

    return json(res, 200, { processed: results.length, results });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Daily digest failed.' });
  }
}
