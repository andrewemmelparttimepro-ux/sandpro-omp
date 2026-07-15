import { getSupabaseAdmin } from './supabaseAdmin.js';

const PILOT_EMAIL_RECIPIENTS = new Set([
  'andrew@ndai.pro',
  'jfeil@sandpro.com',
  'mjimenez@sandpro.com',
  'tdibben@sandpro.com',
]);

const normalizeEmail = (value = '') => String(value).trim().toLowerCase();

const chicagoDayKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
};

export const isPilotEmailRecipient = (email) => PILOT_EMAIL_RECIPIENTS.has(normalizeEmail(email));

export const objectiveUrl = (req, objectiveId, tab = 'messages') => {
  const host = process.env.APP_BASE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
  const url = new URL(host);
  url.searchParams.set('page', 'objectives');
  url.searchParams.set('objective', objectiveId);
  if (tab !== 'messages') url.searchParams.set('tab', tab);
  return url.toString();
};

export const notificationAllowsEmail = (prefs, type, recipient) => (
  prefs?.email_enabled !== false
  && type === 'daily_digest'
  && isPilotEmailRecipient(recipient)
);

export const sendLoggedEmail = async ({ userId, objectiveId, type, to, subject, html }) => {
  const recipient = normalizeEmail(to);
  if (type !== 'daily_digest') return { skipped: true, reason: 'push_only_policy' };
  if (!isPilotEmailRecipient(recipient)) return { skipped: true, reason: 'recipient_not_allowlisted' };

  const supabase = getSupabaseAdmin();
  const dayKey = chicagoDayKey();
  const dedupeKey = `daily_digest:${recipient}:${dayKey}`;
  const { data: existing, error: existingError } = await supabase
    .from('email_delivery_log')
    .select('id')
    .eq('recipient', recipient)
    .eq('notification_type', 'daily_digest')
    .gte('created_at', `${dayKey}T00:00:00.000Z`)
    .in('status', ['queued', 'sent'])
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return { deduped: true, reason: 'one_email_per_day' };

  const { data: logRow, error: insertError } = await supabase
    .from('email_delivery_log')
    .insert({
      user_id: userId || null,
      objective_id: objectiveId || null,
      notification_type: type,
      dedupe_key: dedupeKey,
      recipient,
      subject,
      status: 'queued',
    })
    .select()
    .single();

  if (insertError) {
    if (/duplicate key|unique/i.test(insertError.message || '')) return { deduped: true };
    throw insertError;
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    await supabase.from('email_delivery_log').update({
      status: 'skipped_no_provider',
      error: 'RESEND_API_KEY is not configured.',
    }).eq('id', logRow.id);
    return { skipped: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'SandPro OMP <onboarding@resend.dev>',
      to: recipient,
      subject,
      html,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await supabase.from('email_delivery_log').update({
      status: 'failed',
      error: payload.message || `Resend HTTP ${response.status}`,
    }).eq('id', logRow.id);
    return { failed: true, error: payload.message || `Resend HTTP ${response.status}` };
  }

  await supabase.from('email_delivery_log').update({
    status: 'sent',
    provider_id: payload.id || null,
    sent_at: new Date().toISOString(),
  }).eq('id', logRow.id);
  return { sent: true, id: payload.id };
};
