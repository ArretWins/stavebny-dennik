import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
type Row = Record<string, any>;

async function sendExpo(subscription: Row, notification: Row): Promise<boolean> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: subscription.endpoint, title: notification.title, body: notification.body, data: notification.data, sound: 'default', channelId: 'requests' }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`EXPO_${response.status}`);
  return result?.data?.details?.error !== 'DeviceNotRegistered';
}

async function sendWeb(subscription: Row, notification: Row): Promise<boolean> {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY'); const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) throw new Error('VAPID_NOT_CONFIGURED');
  webpush.setVapidDetails(Deno.env.get('WEB_PUSH_SUBJECT') ?? 'mailto:admin@example.com', publicKey, privateKey);
  try {
    await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret } }, JSON.stringify({ title: notification.title, body: notification.body, data: notification.data }));
    return true;
  } catch (error: any) {
    if (error?.statusCode === 404 || error?.statusCode === 410) return false;
    throw error;
  }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: jsonHeaders });
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || request.headers.get('Authorization') !== `Bearer ${serviceKey}`) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });
  try {
    const body = await request.json(); const notificationId = typeof body.notificationId === 'string' ? body.notificationId : body.record?.id;
    if (!notificationId) return new Response(JSON.stringify({ error: 'notification_id_required' }), { status: 400, headers: jsonHeaders });
    const client = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
    const notificationResult = await client.from('notifications').select('*').eq('id', notificationId).single();
    if (notificationResult.error || !notificationResult.data) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: jsonHeaders });
    const notification = notificationResult.data;
    const filters = [notification.recipient_user_id ? `auth_user_id.eq.${notification.recipient_user_id}` : '', notification.worker_id ? `worker_id.eq.${notification.worker_id}` : ''].filter(Boolean).join(',');
    const subscriptionsResult = filters ? await client.from('push_subscriptions').select('*').eq('active', true).or(filters) : { data: [], error: null };
    if (subscriptionsResult.error) throw subscriptionsResult.error;
    const errors: string[] = []; let sent = 0;
    for (const subscription of subscriptionsResult.data ?? []) {
      try {
        const remainsActive = subscription.channel === 'expo' ? await sendExpo(subscription, notification) : await sendWeb(subscription, notification);
        if (!remainsActive) await client.from('push_subscriptions').update({ active: false }).eq('id', subscription.id);
        else sent += 1;
      } catch (error) { errors.push(error instanceof Error ? error.message : 'DELIVERY_FAILED'); }
    }
    await client.from('notifications').update({ dispatched_at: new Date().toISOString(), delivery_error: errors.length ? errors.join('; ').slice(0, 1000) : null }).eq('id', notificationId);
    return new Response(JSON.stringify({ sent, failed: errors.length }), { headers: jsonHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'unknown' }), { status: 500, headers: jsonHeaders });
  }
});
