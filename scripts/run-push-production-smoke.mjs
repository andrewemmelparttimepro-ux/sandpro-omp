import { createECDH, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import '../tests/env-loader.js';

const baseUrl = process.env.SANDPRO_SMOKE_BASE_URL || 'https://objectivetracker.net';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceKey || !anonKey) {
  console.error('Missing Supabase URL/service/anon keys for push production smoke.');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const token = `push-smoke-${Date.now()}`;
const qaEmail = `qa+${token}@objectivetracker.net`;
const qaPassword = `QA-${token}-Cyclops2026!`;
let qaUserId = null;
let objectiveId = null;
let notificationId = null;

const toBase64Url = (buffer) => Buffer.from(buffer)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const makeFakeSubscription = () => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://example.invalid/sandpro-push/${token}`,
    expirationTime: null,
    keys: {
      p256dh: toBase64Url(ecdh.getPublicKey(null, 'uncompressed')),
      auth: toBase64Url(randomBytes(16)),
    },
  };
};

const cleanup = async () => {
  if (notificationId) await admin.from('push_delivery_log').delete().eq('notification_id', notificationId);
  if (qaUserId) {
    await admin.from('push_delivery_log').delete().eq('user_id', qaUserId);
    await admin.from('push_subscriptions').delete().eq('user_id', qaUserId);
    await admin.from('notifications').delete().eq('user_id', qaUserId);
  }
  if (objectiveId) await admin.from('objectives').delete().eq('id', objectiveId);
  if (qaUserId) {
    await admin.from('profiles').delete().eq('id', qaUserId);
    await admin.auth.admin.deleteUser(qaUserId).catch(() => {});
  }
};

const fail = async (message, error) => {
  console.error(`x ${message}`);
  if (error) console.error(error.message || error);
  await cleanup();
  process.exit(1);
};

try {
  const publicKeyResponse = await fetch(`${baseUrl}/api/push/public-key`);
  const publicKey = await publicKeyResponse.json().catch(() => ({}));
  if (!publicKeyResponse.ok || !publicKey.configured || !publicKey.publicKey) await fail('public push key endpoint is not configured');
  console.log('ok public push key endpoint');

  const swResponse = await fetch(`${baseUrl}/sw.js`);
  const sw = await swResponse.text();
  if (!sw.includes("addEventListener('push'") || !sw.includes("addEventListener('notificationclick'")) await fail('production service worker is missing push handlers');
  console.log('ok service worker push handlers');

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: qaEmail,
    password: qaPassword,
    email_confirm: true,
    user_metadata: { name: 'Push Smoke QA', initials: 'PQ', role: 'executive' },
  });
  if (createError || !created?.user?.id) await fail('could not create QA auth user', createError);
  qaUserId = created.user.id;

  const { error: profileError } = await admin.from('profiles').upsert({
    id: qaUserId,
    email: qaEmail,
    name: 'Push Smoke QA',
    initials: 'PQ',
    title: 'Push QA',
    department: 'Admin',
    role: 'executive',
    color: '#ff7f02',
  });
  if (profileError) await fail('could not create QA profile', profileError);

  const { data: sessionData, error: signInError } = await anon.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
  if (signInError || !sessionData?.session?.access_token) await fail('could not sign in QA user', signInError);
  const accessToken = sessionData.session.access_token;

  const subscribeResponse = await fetch(`${baseUrl}/api/push/subscribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subscription: makeFakeSubscription(),
      deviceLabel: 'Production smoke fake endpoint',
      userAgent: 'SandPro Push Smoke',
      platform: 'node',
      isPwa: true,
    }),
  });
  const subscribePayload = await subscribeResponse.json().catch(() => ({}));
  if (!subscribeResponse.ok || !subscribePayload.ok) await fail('push subscribe API failed', new Error(subscribePayload.error || subscribeResponse.statusText));
  console.log('ok authenticated push subscribe API');

  const { data: objective, error: objectiveError } = await admin
    .from('objectives')
    .insert({
      title: `Push smoke ${token}`,
      description: 'Temporary push smoke objective.',
      owner_id: qaUserId,
      created_by: qaUserId,
      priority: 'high',
      status: 'not_started',
      department: 'Admin',
    })
    .select('id')
    .single();
  if (objectiveError || !objective?.id) await fail('could not create QA objective', objectiveError);
  objectiveId = objective.id;

  const { data: notification, error: notificationError } = await admin
    .from('notifications')
    .insert({
      user_id: qaUserId,
      objective_id: objectiveId,
      type: 'mention',
      message: `Push smoke mention for ${token}`,
    })
    .select('id')
    .single();
  if (notificationError || !notification?.id) await fail('could not create QA notification', notificationError);
  notificationId = notification.id;

  const fanoutResponse = await fetch(`${baseUrl}/api/notifications/send-event`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetUserId: qaUserId,
      objectiveId,
      notificationId,
      type: 'mention',
      message: `Push smoke mention for ${token}`,
    }),
  });
  const fanoutPayload = await fanoutResponse.json().catch(() => ({}));
  if (!fanoutResponse.ok) await fail('notification fan-out API failed', new Error(fanoutPayload.error || fanoutResponse.statusText));

  const { data: logs, error: logError } = await admin
    .from('push_delivery_log')
    .select('id,status,error')
    .eq('notification_id', notificationId);
  if (logError) await fail('could not read push delivery log', logError);
  if (!logs?.length) await fail('push delivery log was not written');
  console.log(`ok push fan-out logged ${logs.length} delivery attempt(s): ${logs.map(log => log.status).join(', ')}`);

  await cleanup();

  const [
    { count: objectiveCount },
    { count: profileCount },
    { count: subscriptionCount },
    { count: logCount },
  ] = await Promise.all([
    admin.from('objectives').select('id', { count: 'exact', head: true }).eq('id', objectiveId),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', qaUserId),
    admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', qaUserId),
    admin.from('push_delivery_log').select('id', { count: 'exact', head: true }).eq('user_id', qaUserId),
  ]);
  if (objectiveCount || profileCount || subscriptionCount || logCount) await fail('push smoke cleanup left database rows behind');
  console.log('ok push smoke cleanup verified: 0 leftovers');
} catch (error) {
  await fail('push production smoke crashed', error);
}
