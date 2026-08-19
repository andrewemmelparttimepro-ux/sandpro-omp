import { sendLeadDigestEmail } from '../_shared/email.js';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.js';
import { getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

// Over-The-Top item 4: every lead gets one email, Monday 6:00 AM CT — their
// crew's week. What slipped, what's due, what closed; every line a doorway
// into the app. No login required to READ it: the content is in the email.
// Recipient policy lives in sendLeadDigestEmail (LEAD_DIGEST_ENABLED switch;
// andrew@ndai.pro always receives for preview).

const esc = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const APP = 'https://objectivetracker.net';
const objectiveLink = (id) => `${APP}/?objective=${id}`;

const chicagoNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));

const fmtDue = (value) => {
  if (!value) return 'no due date';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const row = (objective, ownerName, tone) => `
  <tr>
    <td style="padding:7px 0;border-bottom:1px solid #eee;">
      <a href="${objectiveLink(objective.id)}" style="color:#111827;text-decoration:none;font-weight:600;font-size:14px;">${esc(objective.title)}</a>
      <div style="font-size:12px;color:#6b7280;margin-top:2px;">${esc(ownerName)} &middot; <span style="color:${tone};font-weight:600;">${tone === '#b91c1c' ? 'was due' : 'due'} ${fmtDue(objective.due_date)}</span></div>
    </td>
  </tr>`;

const section = (title, rowsHtml, emptyLine) => `
  <h3 style="font-size:11px;letter-spacing:1.5px;color:#9a8f7d;margin:22px 0 4px;">${title}</h3>
  <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml || `<tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">${emptyLine}</td></tr>`}</table>`;

// Item 10: the weekly noise report — "you sent 47, 12 were opened." A lead
// sees their own signal-to-noise; protecting attention is retention. Returns
// null when the lead sent nothing (no line beats a zero-shame line).
export const buildNoiseLine = ({ sent, opened }) => {
  if (!sent) return null;
  const rate = Math.round((opened / sent) * 100);
  return `Signal check: you sent ${sent} notification${sent === 1 ? '' : 's'} last week — ${opened} ${opened === 1 ? 'was' : 'were'} opened (${rate}%). Fewer, sharper pings get read.`;
};

const buildDigestHtml = ({ lead, crew, pastDue, dueThisWeek, completed, noiseLine }) => {
  const dateLine = chicagoNow().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const crewNames = crew.filter(p => p.id !== lead.id).map(p => (p.name || '').split(' ')[0]).filter(Boolean);
  return `
<div style="max-width:600px;margin:0 auto;font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#111827;padding:8px 14px;">
  <div style="border-bottom:3px solid #111827;padding-bottom:12px;">
    <div style="font-size:11px;letter-spacing:2px;color:#ff7f02;font-weight:700;">SANDPRO OMP &middot; MONDAY CREW BRIEF</div>
    <h1 style="font-size:24px;margin:6px 0 2px;">Your crew's week, ${esc((lead.name || '').split(' ')[0])}</h1>
    <div style="font-size:12px;color:#6b7280;">${dateLine} &middot; ${crew.length - 1} on your crew${crewNames.length ? ` — ${esc(crewNames.slice(0, 8).join(', '))}` : ''}</div>
  </div>
  ${section(`SLIPPED — NEEDS A DECISION (${pastDue.length})`, pastDue.map(({ objective, owner }) => row(objective, owner, '#b91c1c')).join(''), 'Nothing slipped. Clean week behind you.')}
  ${section(`DUE THIS WEEK (${dueThisWeek.length})`, dueThisWeek.map(({ objective, owner }) => row(objective, owner, '#b45309')).join(''), 'Nothing due this week yet.')}
  ${section(`CLOSED LAST WEEK (${completed.length})`, completed.map(({ objective, owner }) => row(objective, owner, '#0D7A3E')).join(''), 'Nothing closed last week.')}
  ${noiseLine ? `<div style="margin-top:18px;padding:10px 14px;border-left:3px solid #9a8f7d;font-size:12.5px;color:#4b5563;background:#faf9f6;">${esc(noiseLine)}</div>` : ''}
  <div style="margin-top:26px;padding:14px;background:#f8f7f4;border-radius:10px;font-size:12.5px;color:#4b5563;">
    Tap any line to open it in OMP. This brief sends every Monday at 6:00 AM — reply to Andrew if a name or number looks wrong.
  </div>
</div>`;
};

export default async function handler(req, res) {
  if (!isAuthorizedCronRequest(req)) return json(res, 401, { error: 'unauthorized' });

  const supabase = getSupabaseAdmin();
  const [{ data: profiles, error: pErr }, { data: objectives, error: oErr }] = await Promise.all([
    supabase.from('profiles').select('id,name,email,reports_to,role'),
    supabase.from('objectives').select('id,title,owner_id,status,due_date,updated_at,okr_level'),
  ]);
  if (pErr || oErr) return json(res, 500, { error: (pErr || oErr).message });

  const byId = new Map(profiles.map(p => [p.id, p]));
  const leads = profiles.filter(lead => profiles.some(p => p.reports_to === lead.id) && lead.email);
  const onlyLead = String(req.query?.to || '').toLowerCase();
  // Preview mode: build a real lead's digest but deliver it to Andrew,
  // clearly labeled — the template is reviewable without emailing the lead.
  const previewAs = String(req.query?.preview_as || '').toLowerCase();

  const now = chicagoNow();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAhead = new Date(startOfToday.getTime() + 7 * 86400000);
  const weekBack = new Date(startOfToday.getTime() - 7 * 86400000);

  const results = [];
  for (const lead of leads) {
    if (onlyLead && String(lead.email).toLowerCase() !== onlyLead) continue;
    if (previewAs && String(lead.email).toLowerCase() !== previewAs) continue;
    const crew = [lead, ...profiles.filter(p => p.reports_to === lead.id)];
    const crewIds = new Set(crew.map(p => p.id));
    const crewObjectives = objectives.filter(o => crewIds.has(o.owner_id) && o.okr_level !== 'company');
    const named = (o) => ({ objective: o, owner: (byId.get(o.owner_id)?.name || 'Unassigned').split(' ')[0] });

    const active = crewObjectives.filter(o => !['completed', 'cancelled'].includes(o.status));
    const pastDue = active.filter(o => o.due_date && new Date(o.due_date) < startOfToday).map(named);
    const dueThisWeek = active.filter(o => o.due_date && new Date(o.due_date) >= startOfToday && new Date(o.due_date) < weekAhead).map(named);
    const completed = crewObjectives.filter(o => o.status === 'completed' && o.updated_at && new Date(o.updated_at) >= weekBack).map(named);

    if (pastDue.length + dueThisWeek.length + completed.length === 0) {
      results.push({ lead: lead.email, skipped: 'nothing to report' });
      continue;
    }

    // Item 10: the lead's own notification noise, last 7 days.
    const [{ count: sent }, { count: opened }] = await Promise.all([
      supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('sender_id', lead.id).gte('created_at', weekBack.toISOString()),
      supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('sender_id', lead.id).eq('is_read', true).gte('created_at', weekBack.toISOString()),
    ]);
    const noiseLine = buildNoiseLine({ sent: sent || 0, opened: opened || 0 });

    const html = buildDigestHtml({ lead, crew, pastDue, dueThisWeek, completed, noiseLine });
    const isPreview = previewAs && String(lead.email).toLowerCase() === previewAs;
    const subject = `${isPreview ? `[PREVIEW — ${(lead.name || '').split(' ')[0]}'s digest] ` : ''}Your crew's week — ${pastDue.length} slipped, ${dueThisWeek.length} due (SandPro OMP)`;
    const outcome = await sendLeadDigestEmail({ userId: lead.id, to: isPreview ? 'andrew@ndai.pro' : lead.email, subject, html });
    results.push({ lead: lead.email, preview: isPreview || undefined, ...outcome });
  }

  return json(res, 200, { leads: leads.length, results });
}
