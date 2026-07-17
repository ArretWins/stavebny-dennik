import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('notification delivery contract', () => {
  const mobile = readFileSync('src/services/pushNotifications.ts', 'utf8');
  const dispatcher = readFileSync('supabase/functions/dispatch-notifications/index.ts', 'utf8');
  const migration = readFileSync('supabase/migrations/202607140002_notification_dispatch.sql', 'utf8');
  it('registers Android channels before requesting an Expo token', () => {
    expect(mobile.indexOf('setNotificationChannelAsync')).toBeLessThan(mobile.indexOf('getExpoPushTokenAsync'));
    expect(mobile).toContain("channel: 'expo'"); expect(mobile).toContain("onConflict: 'auth_user_id,endpoint'");
  });
  it('dispatches both Expo and Web Push and retires invalid endpoints', () => {
    expect(dispatcher).toContain('exp.host/--/api/v2/push/send'); expect(dispatcher).toContain('sendNotification'); expect(dispatcher).toContain("active: false");
    expect(migration).toContain('notification_dispatch_after_insert'); expect(migration).toContain('vault.decrypted_secrets');
  });
});
