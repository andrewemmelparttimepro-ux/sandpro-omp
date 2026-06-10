import { createClient } from '@supabase/supabase-js';
import '../tests/env-loader.js';
import { sendPushNotifications } from '../api/_shared/push.js';

const baseUrl = process.env.SANDPRO_SMOKE_BASE_URL || 'https://objectivetracker.net';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase URL/service key for live Android push verification.');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const token = `android-push-${Date.now()}`;
let objectiveId = null;
let targetUserId = null;

const androidLike = (subscription = {}) => /android|linux arm|galaxy|sm-s|s25/i.test([
  subscription.user_agent,
  subscription.platform,
  subscription.device_label,
].filter(Boolean).join(' '));

const cleanup = async () => {
  if (objectiveId) await admin.from('push_delivery_log').delete().eq('objective_id', objectiveId);
  if (objectiveId) await admin.from('objectives').delete().eq('id', objectiveId);
};

const fail = async (message, error) => {
  console.error(`x ${message}`);
  if (error) console.error(error.message || error);
  await cleanup();
  process.exit(1);
};

try {
  const { data: subscriptions = [], error: subscriptionError } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('active', true);
  if (subscriptionError) await fail('could not read active push subscriptions', subscriptionError);

  const androidSubscription = subscriptions.find(androidLike);
  if (!androidSubscription) await fail('no active Android/Galaxy-like PWA push subscription found');
  targetUserId = androidSubscription.user_id;

  const [{ data: profile, error: profileError }, { data: prefs, error: prefError }] = await Promise.all([
    admin.from('profiles').select('id,name,email,department').eq('id', targetUserId).single(),
    admin.from('notification_preferences').select('*').eq('user_id', targetUserId).maybeSingle(),
  ]);
  if (profileError || !profile?.id) await fail('could not read Android subscription owner profile', profileError);
  if (prefError) await fail('could not read Android subscription owner preferences', prefError);
  if (prefs?.push_enabled === false) await fail(`${profile.name} has Android push subscription but push preference is disabled`);

  const { data: objective, error: objectiveError } = await admin
    .from('objectives')
    .insert({
      title: `Android PWA Push QA ${token}`,
      description: 'Temporary objective for live Android push verification. This row is deleted after the check.',
      owner_id: targetUserId,
      created_by: targetUserId,
      delegated_by: targetUserId,
      priority: 'high',
      status: 'blocked',
      blocker_flag: true,
      blocker_reason: 'Temporary Android push validation.',
      department: profile.department || 'Admin',
      due_date: new Date(Date.now() - 86400000).toISOString(),
    })
    .select('*')
    .single();
  if (objectiveError || !objective?.id) await fail('could not create temporary Android push objective', objectiveError);
  objectiveId = objective.id;

  const events = [
    ['mention', 'Android push QA: mention'],
    ['comment', 'Android push QA: comment'],
    ['assignment', 'Android push QA: assignment'],
    ['blocker', 'Android push QA: blocker'],
    ['at_risk', 'Android push QA: at-risk'],
    ['overdue', 'Android push QA: overdue'],
    ['due_soon', 'Android push QA: high-priority due-soon'],
    ['fixit_new', 'Android push QA: new Fix-It item'],
    ['fixit_agent', 'Android push QA: Agent update'],
  ];

  for (const [type, message] of events) {
    const url = type.startsWith('fixit')
      ? `${baseUrl}/?page=fixit`
      : `${baseUrl}/?page=objectives&objective=${objectiveId}`;
    const result = await sendPushNotifications({
      targetUserId,
      type,
      objective,
      prefs: prefs || { push_enabled: true },
      message,
      url,
    });
    if (!result.sent) await fail(`live Android push did not send for ${type}`, new Error(JSON.stringify(result)));
    console.log(`ok live Android push sent for ${type}: ${result.sent} subscription(s)`);
  }

  const { data: logs = [], error: logError } = await admin
    .from('push_delivery_log')
    .select('type,status,subscription_id,sent_at')
    .eq('objective_id', objectiveId);
  if (logError) await fail('could not read live Android push delivery logs', logError);
  for (const [type] of events) {
    if (!logs.some(log => log.type === type && log.status === 'sent')) await fail(`missing sent delivery log for ${type}`);
  }
  console.log(`ok live Android push delivery logs confirmed for ${events.length} event types`);

  await cleanup();
  const [{ count: objectiveCount }, { count: logCount }] = await Promise.all([
    admin.from('objectives').select('id', { count: 'exact', head: true }).eq('id', objectiveId),
    admin.from('push_delivery_log').select('id', { count: 'exact', head: true }).eq('objective_id', objectiveId),
  ]);
  if (objectiveCount || logCount) await fail('live Android push cleanup left QA data behind');
  console.log(`ok cleanup verified for live Android push QA. Target profile: ${profile.name}`);
} catch (error) {
  await fail('live Android push verification crashed', error);
}
