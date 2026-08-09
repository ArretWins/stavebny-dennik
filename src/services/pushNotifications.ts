import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {
  buildDayClosureReminderPlan,
  dayClosureReminderIdentifier,
} from '@/domain/dayClosureReminder';
import {
  buildProjectRfiReminderPlan,
  projectRfiReminderIdentifier,
} from '@/domain/rfiReminder';
import type { ProjectRfi } from '@/domain/types';
import { supabase } from './supabase';

export const REQUESTS_NOTIFICATION_CHANNEL = 'requests';
export const DAY_CLOSURE_NOTIFICATION_CHANNEL = 'day-closure';
export const RFI_NOTIFICATION_CHANNEL = 'rfi-deadlines';

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

export async function syncDayClosureReminder(input: {
  projectId: string;
  projectName: string;
  logDate: string;
  isClosed: boolean;
  now?: Date;
}): Promise<'scheduled' | 'cancelled' | 'unsupported' | 'denied'> {
  const identifier = dayClosureReminderIdentifier(
    input.projectId,
    input.logDate,
  );
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  const plan = buildDayClosureReminderPlan({
    ...input,
    now: input.now ?? new Date(),
  });
  if (!plan) {
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(
      () => undefined,
    );
    return 'cancelled';
  }

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return 'denied';
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  if (existing.some((notification) => notification.identifier === identifier))
    return 'scheduled';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(
      DAY_CLOSURE_NOTIFICATION_CHANNEL,
      {
        name: 'Uzavretie pracovného dňa',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 220, 120, 220],
        lightColor: '#2E7D32',
        sound: 'default',
      },
    );
  }
  await Notifications.scheduleNotificationAsync({
    identifier: plan.identifier,
    content: {
      title: plan.title,
      body: plan.body,
      data: plan.data,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: plan.triggerAt,
      channelId:
        Platform.OS === 'android'
          ? DAY_CLOSURE_NOTIFICATION_CHANNEL
          : undefined,
    },
  });
  return 'scheduled';
}

export async function syncProjectRfiReminder(
  rfi: Pick<
    ProjectRfi,
    | 'id'
    | 'projectId'
    | 'rfiNumber'
    | 'subject'
    | 'recipientName'
    | 'dueDate'
    | 'status'
  >,
  now = new Date(),
): Promise<'scheduled' | 'cancelled' | 'unsupported' | 'denied'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  const identifier = projectRfiReminderIdentifier(rfi.id);
  const plan = buildProjectRfiReminderPlan({ ...rfi, now });

  await Notifications.cancelScheduledNotificationAsync(identifier).catch(
    () => undefined,
  );
  if (!plan) return 'cancelled';

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return 'denied';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(RFI_NOTIFICATION_CHANNEL, {
      name: 'Termíny RFI',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 220, 120, 220],
      lightColor: '#2B6F95',
      sound: 'default',
    });
  }
  await Notifications.scheduleNotificationAsync({
    identifier: plan.identifier,
    content: {
      title: plan.title,
      body: plan.body,
      data: plan.data,
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: plan.triggerAt,
      channelId:
        Platform.OS === 'android' ? RFI_NOTIFICATION_CHANNEL : undefined,
    },
  });
  return 'scheduled';
}
