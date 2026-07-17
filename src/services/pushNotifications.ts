import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

export const REQUESTS_NOTIFICATION_CHANNEL = 'requests';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId
    ?? Constants.easConfig?.projectId
    ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
}

export async function registerPushSubscription(): Promise<'registered' | 'unsupported' | 'denied' | 'unconfigured'> {
  if (!supabase || Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REQUESTS_NOTIFICATION_CHANNEL, {
      name: 'Pracovníci a materiál',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#2E7D32',
      sound: 'default',
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return 'denied';
  const easProjectId = projectId();
  if (!easProjectId) return 'unconfigured';
  const token = await Notifications.getExpoPushTokenAsync({ projectId: easProjectId });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return 'unconfigured';
  const { error } = await supabase.from('push_subscriptions').upsert({
    auth_user_id: auth.user.id,
    channel: 'expo',
    endpoint: token.data,
    active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'auth_user_id,endpoint' });
  if (error) throw error;
  return 'registered';
}
